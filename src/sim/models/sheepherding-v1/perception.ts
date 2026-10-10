import { flowTarget, inChute, type Stimulus } from '../../contract';
import type { GrassField } from '../../grass';
import type { SimConfig } from './config';
import { Flock, FEAR_HIST, MAX_NEIGHBOURS } from './flock';
import type { Obstacles } from './obstacles';
import { SheepState } from './types';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** A threat the flock reacts to, with a lookahead along its own velocity. */
export interface Threat {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  /** Autosheep: pressure multiplier (1 = a pressing driver) */
  strength: number;
  /** Autosheep: flight zone of this threat at full motion, replacing pressure.zoneDog */
  radius: number;
}

/** Autosheep: a one-step shock or an attraction, from the contract's stimuli. */
export interface PointStimulus {
  x: number;
  y: number;
  strength: number;
  radius: number;
}

/**
 * Direct pressure from the threat plus visual contagion between sheep, integrated into the
 * fast `fear` and slow `arousal` variables. See docs/flock-design.md §3.
 */
export class Perception {
  constructor(private cfg: SimConfig) {}

  setConfig(cfg: SimConfig): void {
    this.cfg = cfg;
  }

  /**
   * Autosheep: what a sheep makes of the grass. Every `lookEvery` seconds (staggered) it looks
   * round on a few rings for the longest grass it can walk to without crossing a fence, and
   * remembers it. Returns that grass's pull if it is far enough to walk to, else 0.
   */
  private lookForGrass(flock: Flock, i: number, grass: GrassField, obstacles: Obstacles, step: number): number {
    const G = this.cfg.grazing;
    const x = flock.px[i];
    const y = flock.py[i];
    const h = flock.heading[i];
    const here = grass.at(x + Math.cos(h) * G.muzzle, y + Math.sin(h) * G.muzzle);
    flock.grassHere[i] = here;
    const every = Math.max(1, Math.round(G.lookEvery / this.cfg.dt));
    if ((step + i) % every === 0) {
      let best = here + G.worth;
      let bx = x;
      let by = y;
      for (let r = 0; r < G.look.length; r++) {
        const d = G.look[r];
        for (let k = 0; k < 8; k++) {
          // a different start angle per ring, so the rings do not line up
          const a = ((k + r * 0.5) / 8) * Math.PI * 2 + i * 0.37;
          const px = x + Math.cos(a) * d;
          const py = y + Math.sin(a) * d;
          // a little less keen on grass further off
          const v = grass.at(px, py) - d * 0.01;
          if (v > best && !obstacles.crossesAny(x, y, px, py)) { best = v; bx = px; by = py; }
        }
      }
      flock.grassX[i] = bx;
      flock.grassY[i] = by;
      flock.grassGain[i] = bx === x && by === y ? 0 : best - here;
    }
    const gain = flock.grassGain[i];
    if (gain <= 0) return 0;
    const far = Math.hypot(flock.grassX[i] - x, flock.grassY[i] - y) >= G.walkFrom;
    if (!far) return 0;
    return G.pull * smoothstep(0.2, 0.7, flock.hunger[i]) * smoothstep(0, 0.4, gain) * smoothstep(0.6, 0.2, here);
  }

  update(
    flock: Flock,
    threats: readonly Threat[],
    startles: readonly PointStimulus[],
    lures: readonly PointStimulus[],
    obstacles: Obstacles,
    time: number,
    dt: number,
    flows: readonly Stimulus[] = [],
    chutes: readonly Stimulus[] = [],
    grass: GrassField | null = null,
    step = 0,
  ): void {
    const cfg = this.cfg;
    const P = cfg.pressure;
    const n = flock.count;
    const cosBlind = Math.cos(((360 - cfg.sheep.fovDeg) / 2) * (Math.PI / 180));
    const histSlot = flock.histHead;
    const sight = cfg.obstacle.sightFactor;

    // Autosheep: who is being handled in a chute. A handled sheep cannot see the flock and is
    // not left behind by it (no pining, no isolation stress); steering walks it up the chute.
    for (let i = 0; i < n; i++) {
      flock.handled[i] = 0;
      for (let k = 0; k < chutes.length; k++) {
        const c = chutes[k];
        const at = inChute(c, flock.px[i], flock.py[i]);
        if (!at) continue;
        flock.handled[i] = 1;
        flock.chuteX[i] = at.ux;
        flock.chuteY[i] = at.uy;
        flock.chuteDrive[i] = c.strength;
        flock.chuteRoom[i] = (c.lookahead ?? 0) > 0 ? Infinity : at.len - at.along - 0.45;
        flock.fenced[i] = 1;
        break;
      }
    }

    // running-toward-me test needs the previous slot's values, so read history before writing
    for (let i = 0; i < n; i++) {
      const x = flock.px[i];
      const y = flock.py[i];
      // Autosheep: every threat is assessed and the one pressing hardest is the one I react to
      let pressure = 0;
      let dominant = -1;
      for (let k = 0; k < threats.length; k++) {
        const p = this.threatPressure(flock, i, threats[k], cosBlind);
        if (p <= 0) continue;
        const seen = p * (obstacles.blocksSight(x, y, threats[k].x, threats[k].y) ? sight : 1);
        if (seen > pressure) { pressure = seen; dominant = k; }
      }
      flock.threatIdx[i] = dominant;
      if (dominant >= 0 && pressure > 0.02) {
        flock.seenX[i] = threats[dominant].x;
        flock.seenY[i] = threats[dominant].y;
        flock.seenUntil[i] = time + cfg.group.threatMemory;
      }
      flock.pressure[i] = pressure;

      // Autosheep: a startle is a pressure spike for this step only. It shows up as a jump in
      // fear, which is what sends a sheep straight to running, and it never habituates.
      let shock = 0;
      for (let k = 0; k < startles.length; k++) {
        const s = startles[k];
        const d = Math.hypot(s.x - x, s.y - y);
        let v = s.strength * smoothstep(s.radius, s.radius * 0.4, d) / flock.boldness[i];
        if (v > 0 && obstacles.blocksSight(x, y, s.x, s.y)) v *= sight;
        if (v > shock) shock = v;
      }
      shock = Math.min(1, shock);

      // Autosheep: the strongest lure in reach; like a threat, it is hard to sense through a
      // stone wall (a shut shed is not tugged at by the salt lick outside its back door)
      let lure = 0;
      for (let k = 0; k < lures.length; k++) {
        const l = lures[k];
        const d = Math.hypot(l.x - x, l.y - y);
        let v = l.strength * smoothstep(l.radius, l.radius * 0.5, d);
        if (v > lure && obstacles.blocksSight(x, y, l.x, l.y)) v *= sight;
        if (v > lure) { lure = v; flock.lureX[i] = l.x; flock.lureY[i] = l.y; }
      }
      // Autosheep: a race draws the sheep in it along, as a lure that keeps ahead of them
      for (let k = 0; k < flows.length; k++) {
        const fl = flows[k];
        if (fl.strength <= lure) continue;
        const r = flowTarget(fl.path!, x, y, fl.lookahead ?? 3);
        if (r.d > fl.radius) continue;
        lure = fl.strength;
        flock.lureX[i] = r.tx;
        flock.lureY[i] = r.ty;
      }
      // Autosheep: hunger. Better grass round about is a lure of its own, weak beside a feed
      // bucket; far grass is walked to, near grass grazed toward (Behaviour, the graze step)
      if (grass && !flock.handled[i]) {
        const pull = this.lookForGrass(flock, i, grass, obstacles, step);
        if (pull > lure) {
          lure = pull;
          flock.lureX[i] = flock.grassX[i];
          flock.lureY[i] = flock.grassY[i];
        }
      }
      flock.lure[i] = Math.min(1, lure);

      // visual contagion over the delayed fear of visible neighbours
      let social = 0;
      const base = i * MAX_NEIGHBOURS;
      const nc = flock.nbrCount[i];
      if (nc > 0) {
        const delaySteps = Math.min(FEAR_HIST - 1, Math.max(1, Math.round(flock.reactionDelay[i] / dt)));
        const readSlot = (histSlot - delaySteps + FEAR_HIST) % FEAR_HIST;
        let alarmed = 0;
        let best = 0;
        for (let q = 0; q < nc; q++) {
          const j = flock.nbr[base + q];
          const fj = flock.fearHist[j * FEAR_HIST + readSlot];
          const running = flock.state[j] === SheepState.Run;
          if (fj > P.alarmedThreshold || running) alarmed++;
          if (fj <= 0.01) continue;
          const dist = flock.nbrDist[base + q];
          const w = 1 / Math.log(2 + dist);
          // a neighbour running toward me is always a stimulus, whatever the fraction rule says
          let towardMe = false;
          if (running) {
            const jx = flock.px[j] - flock.px[i];
            const jy = flock.py[j] - flock.py[i];
            const jd = Math.hypot(jx, jy);
            if (jd > 1e-3) {
              const jh = flock.heading[j];
              towardMe = -(Math.cos(jh) * jx + Math.sin(jh) * jy) / jd > 0.5;
            }
          }
          // contagion transmits alarm, it never amplifies it: a sheep can be as frightened as
          // the neighbour it copied, never more, or the flock feeds back into a runaway panic
          // Transmission is lossy: a copied alarm is always weaker than its source. Without this
          // the flock is a perfect memory cell and holds itself at maximum fear indefinitely.
          const v = Math.min(fj * P.transmitCeiling, P.contagionGain * w * fj * (towardMe ? P.towardBoost : 1));
          if (v > best) best = v;
        }
        const fraction = alarmed / nc;
        const threshold = P.contagionThreshold * flock.boldness[i];
        if (fraction >= threshold || flock.fear[i] > P.contagionBypassFear) social = best;
      }

      // lonely sheep are permanently uneasy
      // Autosheep: a sheep fenced off from its flock can still see it, and is merely put out
      const lonely = flock.nearestDist[i] > cfg.run.isolationDist && !flock.fenced[i];
      flock.lonely[i] = lonely ? 1 : 0;
      // Wanting to rejoin the flock is NOT fear: it makes a sheep walk, not freeze. Only real
      // isolation raises alarm. Keeping the two separate is what lets a scattered flock walk
      // back together instead of standing alert forever.
      const floor = lonely ? P.lonelyFear : 0;

      const prev = flock.fear[i];
      let fear = Math.min(1, Math.max(prev, pressure, shock, social, floor));
      const packed = flock.meanVisDist[i] < P.packedDist;
      const tau = (packed ? P.fearTauPacked : P.fearTau) * flock.fearDecay[i];
      fear *= Math.exp(-dt / tau);
      if (fear < floor) fear = floor;
      flock.fearJump[i] = fear - prev;
      flock.fear[i] = fear;

      let arousal = Math.min(1, Math.max(flock.arousal[i], P.arousalGain * fear));
      arousal *= Math.exp(-dt / P.arousalTau);
      flock.arousal[i] = arousal;

      // Habituation: build tolerance while the threat is perceptible but not pressing, lose it
      // quickly the moment it presses, and forget it slowly once it is gone entirely.
      let fam = flock.familiarity[i];
      if (pressure > P.habituationBreak) fam -= dt / P.habituationLossTau;
      else if (pressure > 0.02) fam += dt / P.habituationGainTau;
      else fam -= dt / P.habituationForgetTau;
      flock.familiarity[i] = Math.min(1, Math.max(0, fam));
    }

    // publish this step's fear for the neighbours to read next step
    for (let i = 0; i < n; i++) flock.fearHist[i * FEAR_HIST + histSlot] = flock.fear[i];
    flock.histHead = (histSlot + 1) % FEAR_HIST;
  }

  /** Pressure of one threat on sheep i, before line of sight. */
  private threatPressure(flock: Flock, i: number, threat: Threat, cosBlind: number): number {
    const cfg = this.cfg;
    const P = cfg.pressure;
    const tx = threat.x + threat.vx * P.lookahead;
    const ty = threat.y + threat.vy * P.lookahead;
    const dx = tx - flock.px[i];
    const dy = ty - flock.py[i];
    const d = Math.hypot(dx, dy);
    // a still threat is a standing human; a moving one is a dog. Autosheep: the threat's own
    // radius is its outer reach at full motion, so zoneDog becomes radius / outerScale.
    const zoneMoving = threat.radius / P.outerScale;
    const zoneStill = zoneMoving * (P.zoneIdle / P.zoneDog);
    const motion = Math.min(1, Math.max(0, (threat.speed - P.idleSpeed) / (P.dogSpeed - P.idleSpeed)));
    const baseZone = zoneStill + (zoneMoving - zoneStill) * motion;
    // Arousal widens the flight zone and fear feeds arousal, so without habituation a threat
    // that merely hangs about at the edge escalates into permanent panic. Sheep do the
    // opposite: a dog that keeps its distance becomes part of the scenery.
    const habituated = 1 - P.habituationStrength * flock.familiarity[i];
    const zone = (baseZone * (0.8 + 0.4 * flock.arousal[i]) * habituated) / flock.boldness[i];
    // is the threat closing on me?
    let toward = 0;
    if (threat.speed > 1e-3 && d > 1e-3) {
      toward = -((dx / d) * (threat.vx / threat.speed) + (dy / d) * (threat.vy / threat.speed));
    }
    // Only motion that closes on the sheep counts as pressure. A dog circling at a constant
    // distance is read as a dog (it widens the zone above) but is not pressing, which is
    // exactly why handlers work in arcs and why a wide circle steadies a flock.
    const closing = Math.max(0, toward) * threat.speed;
    const speedFactor = 1 + P.speedGain * Math.min(2, closing / cfg.run.speed);
    const directness = 1 + P.directnessGain * Math.max(0, toward);
    // behind me and out of sight: only proximity registers
    const hx = Math.cos(flock.heading[i]);
    const hy = Math.sin(flock.heading[i]);
    const facing = d > 1e-3 ? (hx * dx + hy * dy) / d : 1;
    const angleFactor = facing < -cosBlind && d > P.blindProximity ? P.blindFactor : 1;
    const raw = smoothstep(zone * P.outerScale, zone * P.innerScale, d) * speedFactor * directness * angleFactor;
    return Math.min(1, raw * threat.strength);
  }
}
