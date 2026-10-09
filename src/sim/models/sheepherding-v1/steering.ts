import type { SimConfig } from './config';
import { Flock, MAX_CONTACTS, MAX_NEIGHBOURS } from './flock';
import type { Groups } from './groups';
import type { Obstacles } from './obstacles';
import type { Threat } from './perception';
import type { Rng } from './rng';
import { SheepState } from './types';

const DEG = Math.PI / 180;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function wrapAngle(a: number): number {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function rotateToward(from: number, to: number, maxDelta: number): number {
  const d = wrapAngle(to - from);
  if (d > maxDelta) return from + maxDelta;
  if (d < -maxDelta) return from - maxDelta;
  return to;
}

/**
 * Context steering (Fray): behaviours write interest / danger lobes into per-direction slots,
 * combined per slot with max; danger masks interest; winner is interpolated and turn-rate limited.
 */
export class Steering {
  private readonly slotCos: Float32Array;
  private readonly slotSin: Float32Array;
  private readonly slots: number;

  constructor(private readonly cfg: SimConfig, private readonly rng: Rng) {
    this.slots = cfg.steering.slots;
    this.slotCos = new Float32Array(this.slots);
    this.slotSin = new Float32Array(this.slots);
    for (let s = 0; s < this.slots; s++) {
      const a = (s / this.slots) * Math.PI * 2;
      this.slotCos[s] = Math.cos(a);
      this.slotSin[s] = Math.sin(a);
    }
  }

  private lobe(map: Float32Array, base: number, dx: number, dy: number, w: number): void {
    if (w <= 0) return;
    for (let s = 0; s < this.slots; s++) {
      const v = w * (this.slotCos[s] * dx + this.slotSin[s] * dy);
      if (v > map[base + s]) map[base + s] = v;
    }
  }

  /** Returns the chosen direction angle, or NaN when there is no intent. Writes dangerAhead. */
  private resolve(flock: Flock, i: number, base: number): number {
    const N = this.slots;
    const interest = flock.interest;
    const danger = flock.danger;
    let minD = Infinity;
    for (let s = 0; s < N; s++) if (danger[base + s] < minD) minD = danger[base + s];
    const limit = minD + this.cfg.steering.maskMargin;
    let best = -1;
    let bestV = 1e-4;
    for (let s = 0; s < N; s++) {
      if (danger[base + s] > limit) continue;
      const v = interest[base + s];
      if (v > bestV) { bestV = v; best = s; }
    }
    if (best < 0) {
      // no intent: report danger in the current heading
      const cur = Math.round(wrapAngle(flock.heading[i]) / (Math.PI * 2 / N));
      flock.dangerAhead[i] = danger[base + ((cur % N) + N) % N];
      return NaN;
    }
    const l = best === 0 ? N - 1 : best - 1;
    const r = best === N - 1 ? 0 : best + 1;
    const vl = danger[base + l] > limit ? 0 : interest[base + l];
    const vr = danger[base + r] > limit ? 0 : interest[base + r];
    const denom = vl - 2 * bestV + vr;
    let offset = 0;
    if (Math.abs(denom) > 1e-6) offset = Math.max(-0.5, Math.min(0.5, (0.5 * (vl - vr)) / denom));
    flock.dangerAhead[i] = danger[base + best];
    return ((best + offset) / N) * Math.PI * 2;
  }

  update(
    flock: Flock,
    threats: readonly Threat[],
    dt: number,
    groups: Groups,
    obstacles: Obstacles,
    time: number,
  ): void {
    const cfg = this.cfg;
    const n = flock.count;
    const N = this.slots;
    const interest = flock.interest;
    const danger = flock.danger;
    const W = cfg.world;
    const F = cfg.fences;
    const K = cfg.kinematics;
    const FL = cfg.flee;
    const G = cfg.group;
    const balanceCos = Math.cos(FL.balanceAngleDeg * DEG);
    const blockedCos = Math.cos(FL.blockedAngleDeg * DEG);
    const LU = cfg.lure;

    for (let i = 0; i < n; i++) {
      const base = i * N;
      interest.fill(0, base, base + N);
      danger.fill(0, base, base + N);
      const st = flock.state[i] as SheepState;
      flock.intent[i] = 0;
      const x = flock.px[i];
      const y = flock.py[i];
      // Autosheep: of all the threats about, I flee the one pressing hardest on me
      const k = flock.threatIdx[i];
      const threat: Threat | null = k >= 0 ? threats[k] : null;
      const tx = threat ? threat.x + threat.vx * cfg.pressure.lookahead : 0;
      const ty = threat ? threat.y + threat.vy * cfg.pressure.lookahead : 0;
      const remembered = flock.seenUntil[i] > time;

      // Is the threat standing between me and the rest of the flock? A sheep will not cross a dog
      // to rejoin, and suppressing the pull toward the others in exactly that case is what lets a
      // deliberate cut stay cut. Everywhere else the flock coheres as before, so a plain charge
      // still packs it tight. Awareness, not proximity: a sheep at the back of its half knows
      // perfectly well where the dog is.
      let blocked = false;
      if (threat && flock.fear[i] > 0.02) {
        const fx0 = groups.restX[i] - x;
        const fy0 = groups.restY[i] - y;
        const fd = Math.hypot(fx0, fy0);
        const tx0 = tx - x;
        const ty0 = ty - y;
        const td = Math.hypot(tx0, ty0);
        if (fd > 1e-3 && td > 1e-3 && td < fd * FL.blockedReach) {
          blocked = (fx0 * tx0 + fy0 * ty0) / (fd * td) > blockedCos;
        }
      }
      flock.blocked[i] = blocked ? 1 : 0;
      let desiredSpeed = 0;
      let turnRate = K.turnRateDeg.graze * DEG;

      switch (st) {
        case SheepState.Graze: {
          if (flock.stepRemaining[i] > 0) {
            desiredSpeed = cfg.graze.stepSpeed * flock.speedMult[i];
            this.lobe(interest, base, Math.cos(flock.wanderHeading[i]), Math.sin(flock.wanderHeading[i]), 0.6);
            if (flock.nearestDist[i] > cfg.graze.rejoinDist) {
              const dx = flock.lcmX[i] - x;
              const dy = flock.lcmY[i] - y;
              const d = Math.hypot(dx, dy);
              if (d > 1e-3) this.lobe(interest, base, dx / d, dy / d, cfg.graze.rejoinWeight * flock.gregarious[i]);
            }
            this.rejoinLobe(flock, groups, i, base, x, y, blocked ? -1 : G.rejoinWeight);
            // spread out: crowding is danger
            const cb = i * MAX_CONTACTS;
            for (let q = 0; q < flock.contactCount[i]; q++) {
              const d = flock.contactDist[cb + q];
              if (d < cfg.graze.repelDist) {
                const j = flock.contacts[cb + q];
                const dx = flock.px[j] - x;
                const dy = flock.py[j] - y;
                const inv = d > 1e-3 ? 1 / d : 0;
                this.lobe(danger, base, dx * inv, dy * inv, cfg.graze.repelWeight * (1 - d / cfg.graze.repelDist));
              }
            }
          }
          break;
        }
        case SheepState.Alert: {
          // stand and stare: rotate to bring the threat into the binocular cone
          turnRate = K.turnRateDeg.alert * DEG;
          let fx = 0;
          let fy = 0;
          if (threat && flock.pressure[i] > 0.02) { fx = tx - x; fy = ty - y; }
          else if (remembered) { fx = flock.seenX[i] - x; fy = flock.seenY[i] - y; }
          else if (groups.seekRest[i] > 0.2) { fx = groups.restX[i] - x; fy = groups.restY[i] - y; }
          const fl = Math.hypot(fx, fy);
          if (fl > 1e-3) {
            flock.intent[i] = 1; // deliberate turn, not jitter
            flock.heading[i] = wrapAngle(rotateToward(flock.heading[i], Math.atan2(fy, fx), turnRate * dt));
          }
          flock.desiredSpeed[i] = 0;
          continue;
        }
        case SheepState.Walk: {
          turnRate = K.turnRateDeg.walk * DEG;
          const L = flock.leader[i];
          const walkSpeed = cfg.walk.speed * flock.speedMult[i];
          if (L >= 0) {
            const lhx = Math.cos(flock.heading[L]);
            const lhy = Math.sin(flock.heading[L]);
            const gap = cfg.walk.followGap;
            let tx: number;
            let ty: number;
            if (flock.leaderSide[i] === 0) {
              tx = flock.px[L] - lhx * gap;
              ty = flock.py[L] - lhy * gap;
            } else {
              const side = flock.leaderSide[i];
              tx = flock.px[L] - lhx * gap * 0.3 - lhy * gap * 0.8 * side;
              ty = flock.py[L] - lhy * gap * 0.3 + lhx * gap * 0.8 * side;
            }
            const dx = tx - x;
            const dy = ty - y;
            const d = Math.hypot(dx, dy);
            const gapNow = Math.hypot(flock.px[L] - x, flock.py[L] - y);
            if (d > 0.15) this.lobe(interest, base, dx / d, dy / d, 1.0);
            // speed regulates the gap to the leader
            desiredSpeed = Math.max(0, Math.min(walkSpeed * 1.3, walkSpeed * (gapNow / gap)));
            if (d < 0.15) desiredSpeed = 0;
          } else {
            // initiator: persistent random walk with slow heading drift
            flock.wanderHeading[i] += this.rng.normal() * (cfg.walk.headingNoiseDeg * DEG) * Math.sqrt(dt);
            this.lobe(interest, base, Math.cos(flock.wanderHeading[i]), Math.sin(flock.wanderHeading[i]), 0.8);
            const dx = flock.lcmX[i] - x;
            const dy = flock.lcmY[i] - y;
            const d = Math.hypot(dx, dy);
            if (d > 2) this.lobe(interest, base, dx / d, dy / d, cfg.walk.cohesionWeight * flock.gregarious[i]);
            this.rejoinLobe(flock, groups, i, base, x, y, blocked ? -1 : G.rejoinWeight);
            desiredSpeed = walkSpeed;
          }
          // Autosheep: a lure in reach pulls walkers toward it, leaders and followers alike, and
          // they slow as they arrive so the flock gathers round instead of trampling it
          const lu = flock.lure[i];
          if (lu > 0.02) {
            const dx = flock.lureX[i] - x;
            const dy = flock.lureY[i] - y;
            const d = Math.hypot(dx, dy);
            if (d > LU.arriveDist * 0.5) {
              this.lobe(interest, base, dx / d, dy / d, LU.weight * lu);
              if (L < 0) flock.wanderHeading[i] = Math.atan2(dy, dx);
            }
            desiredSpeed *= Math.min(1, Math.max(0.25, (d - LU.arriveDist * 0.5) / LU.arriveDist));
          }
          this.neighbourDanger(flock, i, base, cfg.steering.neighbourDangerDist, cfg.steering.neighbourDangerWeight);
          break;
        }
        case SheepState.Run: {
          turnRate = K.turnRateDeg.run * DEG;
          const R = cfg.run;
          // Cohesion: local centre of mass mixed with the centre of my own group — not of the
          // whole flock. A running sheep steering half-way toward the middle of everything walks
          // straight through a cut, which is how a shed healed itself the moment the dog left.
          // Pressed from inside the flock, a sheep abandons the far side of the group and
          // sticks to its closest few neighbours: this is what splits the flock.
          let mix = R.cohesionCentroidMix;
          if (flock.splitUntil[i] > 0 || blocked) mix = 0;
          let cxm = flock.lcmX[i] * (1 - mix) + groups.groupX[i] * mix;
          let cym = flock.lcmY[i] * (1 - mix) + groups.groupY[i] * mix;
          if (flock.splitUntil[i] > 0) {
            let sx = 0;
            let sy = 0;
            let c = 0;
            const nbb = i * MAX_NEIGHBOURS;
            for (let q = 0; q < flock.nbrCount[i] && c < FL.splitNeighbours; q++) {
              const j = flock.nbr[nbb + q];
              sx += flock.px[j]; sy += flock.py[j]; c++;
            }
            if (c > 0) { cxm = sx / c; cym = sy / c; }
          }
          let vx = 0;
          let vy = 0;
          let dx = cxm - x;
          let dy = cym - y;
          let d = Math.hypot(dx, dy);
          let coh = R.cohesion * (1 + flock.fear[i]) * flock.gregarious[i] * Math.min(1, d / FL.centroidBendPacked);
          if (flock.lonely[i]) coh *= FL.lonelyCohesion;
          if (d > 0.5) { vx += (dx / d) * coh; vy += (dy / d) * coh; }
          // short-range repulsion
          let rx = 0;
          let ry = 0;
          const cb = i * MAX_CONTACTS;
          for (let q = 0; q < flock.contactCount[i]; q++) {
            const dd = flock.contactDist[cb + q];
            if (dd < R.repelDist) {
              const j = flock.contacts[cb + q];
              const inv = dd > 1e-3 ? 1 / dd : 0;
              rx += (x - flock.px[j]) * inv;
              ry += (y - flock.py[j]) * inv;
            }
          }
          const rl = Math.hypot(rx, ry);
          if (rl > 1e-6) { vx += (rx / rl) * R.repel * Math.min(1, rl); vy += (ry / rl) * R.repel * Math.min(1, rl); }
          // weak alignment with running neighbours
          let ax = 0;
          let ay = 0;
          const nb = i * MAX_NEIGHBOURS;
          for (let q = 0; q < flock.nbrCount[i]; q++) {
            const j = flock.nbr[nb + q];
            if (flock.state[j] === SheepState.Run) { ax += Math.cos(flock.heading[j]); ay += Math.sin(flock.heading[j]); }
          }
          const al = Math.hypot(ax, ay);
          if (al > 1e-6) { vx += (ax / al) * R.align; vy += (ay / al) * R.align; }
          // a stray, or a group too small to stand alone, heads back to the rest
          const un = blocked ? 0 : groups.seekRest[i];
          if (un > 0.05) {
            const rx2 = groups.restX[i] - x;
            const ry2 = groups.restY[i] - y;
            const rl2 = Math.hypot(rx2, ry2);
            if (rl2 > 1e-3) {
              const w = G.rejoinRunWeight * un;
              vx += (rx2 / rl2) * w;
              vy += (ry2 / rl2) * w;
            }
          }
          // direct repulsion from the threat (small next to cohesion: the flock flees through
          // its own centre, King 2012, and only drifts away as a pack)
          if (threat && flock.pressure[i] > 0.01) {
            const ax2 = x - tx;
            const ay2 = y - ty;
            const al2 = Math.hypot(ax2, ay2);
            if (al2 > 1e-3) {
              const w = R.threatRepel * flock.pressure[i];
              vx += (ax2 / al2) * w;
              vy += (ay2 / al2) * w;
            }
          }
          // low-frequency noise (Ornstein–Uhlenbeck angle around the heading)
          flock.noiseAngle[i] += (-flock.noiseAngle[i] / R.noiseTau) * dt + this.rng.normal() * 0.8 * Math.sqrt(dt);
          const na = flock.heading[i] + flock.noiseAngle[i];
          vx += Math.cos(na) * R.noise; vy += Math.sin(na) * R.noise;
          const vl = Math.hypot(vx, vy);
          if (vl > 1e-6) this.lobe(interest, base, vx / vl, vy / vl, 1.0);
          desiredSpeed = (flock.stamina[i] > 0.2 ? R.speed : R.speed * 0.7) * flock.speedMult[i];
          this.neighbourDanger(flock, i, base, 1.0, 0.6);
          break;
        }
        case SheepState.Rest:
          break;
      }

      // Two separate things. Fear makes a sheep want to be elsewhere, and fades as it calms.
      // Being an obstacle does not: a sheep walks around the dog whatever it is feeling, and
      // without that the danger lobe evaporates as fear decays and the flock strolls straight
      // through where the dog is standing. Autosheep: every threat is an obstacle.
      if (desiredSpeed > 0) {
        for (let q = 0; q < threats.length; q++) {
          const o = threats[q];
          const dx = o.x + o.vx * cfg.pressure.lookahead - x;
          const dy = o.y + o.vy * cfg.pressure.lookahead - y;
          const d = Math.hypot(dx, dy);
          if (d > 1e-3 && d < FL.obstacleRadius) {
            this.lobe(danger, base, dx / d, dy / d, FL.obstacleWeight * smoothstep(FL.obstacleRadius, FL.obstacleRadius * 0.3, d));
          }
        }
      }

      // the threat itself: danger toward it, interest away from it bent toward the flock
      if (threat && desiredSpeed > 0) {
        const dx = tx - x;
        const dy = ty - y;
        const d = Math.hypot(dx, dy);
        if (d > 1e-3) {
          const ux = dx / d;
          const uy = dy / d;
          const p = flock.pressure[i];
          const dangerScale = flock.lonely[i] ? FL.lonelyDangerScale : 1;
          this.lobe(danger, base, ux, uy, FL.dangerWeight * p * dangerScale);
          if (p > 0.01) {
            // flee direction: away, bent toward the local centre of mass
            let ax = -ux;
            let ay = -uy;
            const cx2 = flock.lcmX[i] - x;
            const cy2 = flock.lcmY[i] - y;
            const cl = Math.hypot(cx2, cy2);
            if (cl > 1e-3) {
              // Selfish herd: run to the middle first. Once there is no middle left to run to,
              // the bend has to fade or the packed flock mills on the spot instead of leaving.
              const packed = Math.min(1, cl / FL.centroidBendPacked);
              const lam = FL.centroidBend * (1 + flock.fear[i]) * packed;
              ax += (cx2 / cl) * lam;
              ay += (cy2 / cl) * lam;
            }
            // Only states without their own force sum get a flee lobe. In RUN the escape is already
            // in the intent vector; adding a second interest lobe there makes the two fight and the
            // flock mills on the spot instead of leaving.
            if (st !== SheepState.Run) {
              const al = Math.hypot(ax, ay);
              if (al > 1e-3) this.lobe(interest, base, ax / al, ay / al, FL.interestWeight * p);
            }
            // point of balance at the shoulder: pressure behind it drives me forward,
            // pressure ahead of it stops or turns me back
            const hx2 = Math.cos(flock.heading[i]);
            const hy2 = Math.sin(flock.heading[i]);
            const facing = hx2 * ux + hy2 * uy;
            if (facing < -balanceCos) this.lobe(interest, base, hx2, hy2, FL.balanceInterest * p);
            else if (facing > balanceCos) this.lobe(danger, base, hx2, hy2, FL.balanceDanger * p);
            // deep pressure fractures the flock
            if (p > FL.splitPressure) flock.splitUntil[i] = FL.splitDuration;
          }
        }
      }
      if (flock.splitUntil[i] > 0) flock.splitUntil[i] = Math.max(0, flock.splitUntil[i] - dt);

      // fences: edges become danger as they approach
      if (desiredSpeed > 0) {
        const s0 = F.dangerStart;
        const s1 = F.dangerFull;
        const fw = (d: number) => (d >= s0 ? 0 : d <= s1 ? 1 : (s0 - d) / (s0 - s1));
        this.lobe(danger, base, -1, 0, fw(x));
        this.lobe(danger, base, 1, 0, fw(W.width - x));
        this.lobe(danger, base, 0, -1, fw(y));
        this.lobe(danger, base, 0, 1, fw(W.height - y));
        // Autosheep: fences. Each steering direction is a ray; the nearer it meets a fence, the
        // more dangerous that direction. Rays through a gateway stay clear, which a lobe toward
        // each gatepost would not: two cosine lobes cover the whole gap.
        if (obstacles.count > 0) this.fenceDanger(flock, i, base, obstacles);
      }

      let chosen = NaN;
      if (desiredSpeed > 0) chosen = this.resolve(flock, i, base);
      if (Number.isNaN(chosen)) {
        if (desiredSpeed > 0) desiredSpeed = 0; // wanted to move but every direction is blocked
        flock.desiredSpeed[i] = 0;
        continue;
      }
      flock.intent[i] = 1;
      flock.heading[i] = wrapAngle(rotateToward(flock.heading[i], chosen, turnRate * dt));
      flock.desiredSpeed[i] = desiredSpeed * (1 - Math.min(1, flock.dangerAhead[i]));
    }
  }

  /**
   * Two pulls that look alike and are not. Cohesion holds a sheep near the group it is actually
   * in, and used to arrive by accident from a grouping bug, so it has to be paid for explicitly
   * now that groups are measured properly. Homesickness draws a sheep toward the ones it is *not*
   * with, and only bites when its own group is too small to be a flock. While the flock is whole
   * the two point the same way. Once it is cut they do not, and aiming cohesion at the midpoint of
   * both halves — exactly where the dog is standing — is what used to heal every cut in a second.
   */
  private rejoinLobe(
    flock: Flock,
    groups: Groups,
    i: number,
    base: number,
    x: number,
    y: number,
    weight: number,
  ): void {
    const G = this.cfg.group;
    const dx = groups.restX[i] - x;
    const dy = groups.restY[i] - y;
    const dRest = Math.hypot(dx, dy);
    // With a whole flock there is no "rest": restX falls back to my own group's centre.
    const divided = groups.groupSize[i] < flock.count;
    const gx = groups.groupX[i] - x;
    const gy = groups.groupY[i] - y;
    const gd = Math.hypot(gx, gy);
    // A spring with slack, scaled by fear the way the running cohesion is. Sheep spread out to
    // graze and bunch when they are worried, and a flat pull strong enough to drive a flock with
    // holds a calm one in a huddle. The slack radius grows with the square root of the group, so
    // twenty sheep and five hundred both get room to stand in.
    const spread = G.flockSpread * Math.sqrt(Math.max(1, groups.groupSize[i]));
    const pull = G.flockPull * (1 + flock.fear[i]) * Math.min(1, gd / spread);
    if (gd > 1e-3 && pull > 0.02) this.lobe(flock.interest, base, gx / gd, gy / gd, pull);
    // Homesickness, which is a different thing: toward the sheep I am *not* with. It has two
    // parts. A group too small to be a flock goes looking for the others in earnest. On top of
    // that, any divided flock drifts slowly back together, because sheep can see other sheep
    // across a paddock and would rather be with them. The drift is deliberately feeble: it wins
    // only in the middle of a group, where the spring above has gone slack, so a whole clump
    // eases over instead of shedding its own edge. A shed therefore survives being left alone for
    // as long as it takes to work with, and heals if the flock is left in peace for minutes.
    // A negative weight means the way there is blocked.
    if (weight < 0 || dRest < 1e-3) return;
    const w = weight * groups.seekRest[i] * flock.gregarious[i] + (divided ? G.driftTogether : 0);
    if (w <= 0.02) return;
    this.lobe(flock.interest, base, dx / dRest, dy / dRest, w);
  }

  private fenceDanger(flock: Flock, i: number, base: number, obstacles: Obstacles): void {
    const near = obstacles.near(flock.px[i], flock.py[i]);
    if (near.length === 0) return;
    const O = this.cfg.obstacle;
    const x = flock.px[i];
    const y = flock.py[i];
    const r = flock.radius[i];
    const span = O.dangerStart - O.dangerFull;
    for (let s = 0; s < this.slots; s++) {
      const ux = this.slotCos[s];
      const uy = this.slotSin[s];
      let hit = Infinity;
      for (let q = 0; q < near.length; q++) {
        const k = near[q];
        const t = rayCapsule(x, y, ux, uy, obstacles.ax[k], obstacles.ay[k], obstacles.bx[k], obstacles.by[k], obstacles.radius[k] + r);
        if (t < hit) hit = t;
      }
      if (hit >= O.dangerStart) continue;
      const w = hit <= O.dangerFull ? 1 : (O.dangerStart - hit) / span;
      if (w > flock.danger[base + s]) flock.danger[base + s] = w;
    }
  }

  private neighbourDanger(flock: Flock, i: number, base: number, dist: number, weight: number): void {
    const cb = i * MAX_CONTACTS;
    const x = flock.px[i];
    const y = flock.py[i];
    for (let q = 0; q < flock.contactCount[i]; q++) {
      const d = flock.contactDist[cb + q];
      if (d < dist) {
        const j = flock.contacts[cb + q];
        const inv = d > 1e-3 ? 1 / d : 0;
        this.lobe(flock.danger, base, (flock.px[j] - x) * inv, (flock.py[j] - y) * inv, weight * (1 - d / dist));
      }
    }
  }
}

/**
 * Distance along the unit ray (px, py) + t (ux, uy) to the capsule around segment ab, or
 * Infinity when it misses. 0 when the origin is already inside.
 */
export function rayCapsule(
  px: number, py: number, ux: number, uy: number,
  ax: number, ay: number, bx: number, by: number, R: number,
): number {
  let ex = bx - ax;
  let ey = by - ay;
  const L = Math.hypot(ex, ey);
  let best = Infinity;
  if (L > 1e-6) {
    ex /= L; ey /= L;
    const nx = -ey;
    const ny = ex;
    const ps = (px - ax) * ex + (py - ay) * ey;
    const ph = (px - ax) * nx + (py - ay) * ny;
    if (ps >= 0 && ps <= L && Math.abs(ph) <= R) return 0;
    const uh = ux * nx + uy * ny;
    if (Math.abs(uh) > 1e-9) {
      // the face on my side of the segment
      const side = ph > 0 ? R : -R;
      const t = (side - ph) / uh;
      if (t >= 0) {
        const sAt = ps + (ux * ex + uy * ey) * t;
        if (sAt >= 0 && sAt <= L) best = t;
      }
    }
  }
  // the rounded ends
  for (let e = 0; e < 2; e++) {
    const cx = e === 0 ? ax : bx;
    const cy = e === 0 ? ay : by;
    const fx = px - cx;
    const fy = py - cy;
    const c = fx * fx + fy * fy - R * R;
    if (c <= 0) return 0;
    const b = fx * ux + fy * uy;
    const disc = b * b - c;
    if (disc < 0 || b > 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t >= 0 && t < best) best = t;
  }
  return best;
}
