import { RUN } from './config';
import { Sheep, type Booth, type Run } from './run';
import { ITEMS } from './items';

interface Group { n: number; x: number; y: number }

/**
 * A scripted Gafoop for the run harness and the tests (plan §10.4): no reflexes to speak of,
 * just the sheepdog's priorities, flown the way a careful player would, since sheep move off
 * as he comes. Rescue a sheep being taken; see off monsters at the flock, coming at them from
 * outside it; drive a straggling group back to the flock; when the flock is woolly, drive it
 * into the nearest shearing booth's mouth and keep it there while it is shorn; fetch strays when
 * it is quiet; otherwise circle the flock. Level-ups go to armaments first, the flock's gear
 * included.
 */
export class Bot {
  /** the booth the flock is being driven to, and when the trip is given up */
  private trip: Booth | null = null;
  private tripUntil = 0;
  private orbit = 0;
  private readonly groups = new Map<number, Group>();
  /** what it is doing (for traces) */
  mode = '';

  constructor(private readonly run: Run) {}

  /** Set the run's input for the next step, and take any level-up on offer. */
  drive(): void {
    const r = this.run;
    if (r.choices) {
      const k = r.choices.findIndex((c) => 'item' in c && ITEMS[c.item].kind === 'armament');
      r.choose(k >= 0 ? k : 0);
    }
    if (r.options.levelups === 'bank' && r.pending > 0) r.openSupplies();
    const g = r.gafoop;
    const o = r.model.out;
    // a sheep being taken comes first
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < r.n; j++) {
      const s = r.status[j];
      if (s !== Sheep.Grabbed && s !== Sheep.Carried && s !== Sheep.Beamed) continue;
      const d = Math.hypot(o.x[j] - g.x, o.y[j] - g.y);
      if (d < bd) { bd = d; best = j; }
    }
    this.mode = 'rescue';
    if (best >= 0) return this.go(o.x[best], o.y[best], 1, false);
    // the flock's groups: the biggest is the flock, any other is straggling
    const groups = this.findGroups();
    let main: Group = { n: 0, x: g.x, y: g.y };
    for (const grp of groups.values()) if (grp.n > main.n) main = grp;
    // a monster at the flock: come at it from outside, so as not to scatter the sheep
    const e = r.enemies;
    let ne = -1;
    // (on the way to a booth he keeps driving: the stamp sees to what comes close)
    let nd = this.trip ? 0 : spread(main) + 7;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      const d = Math.hypot(e.x[i] - main.x, e.y[i] - main.y);
      if (d < nd) { nd = d; ne = i; }
    }
    this.mode = 'fight';
    if (ne >= 0) {
      const ux = (e.x[ne] - main.x) / (nd || 1);
      const uy = (e.y[ne] - main.y) / (nd || 1);
      return this.go(e.x[ne] + ux, e.y[ne] + uy, 1, false);
    }
    // a group strayed from the flock: drive it back
    this.mode = 'gather';
    for (const grp of groups.values()) {
      if (grp !== main && grp.n >= 2 && Math.hypot(grp.x - main.x, grp.y - main.y) > 12) return this.herd(grp, main.x, main.y);
    }
    // a woolly flock goes to the nearest booth
    if (!this.trip && r.time > 30 && this.woolly(main.x, main.y, spread(main) + 3) >= Math.max(4, main.n * 0.5)) {
      this.trip = r.booths.reduce((a, b) => (Math.hypot(b.site.mx - main.x, b.site.my - main.y) < Math.hypot(a.site.mx - main.x, a.site.my - main.y) ? b : a));
      this.tripUntil = r.time + 100;
    }
    if (this.trip) {
      const b = this.trip;
      const s = b.site;
      // done when the woolly ones have all been in, or it is taking too long
      if (r.time > this.tripUntil || (b.cur < 0 && this.woolly(main.x, main.y, spread(main) + 3) < 2)) this.trip = null;
      else if (Math.hypot(main.x - s.mx, main.y - s.my) > 2) {
        this.mode = 'drive';
        return this.herd(main, s.mx, s.my);
      }
      // in the mouth: stand off behind the flock, still, while the booth calls them in
      else {
        this.mode = 'hold';
        return this.hold(main, s.x, s.y);
      }
    }
    const strays = r.strays();
    this.mode = 'strays';
    if (strays.length && r.time > 20) {
      const s = strays.reduce((a, b) => (Math.hypot(a.x - g.x, a.y - g.y) < Math.hypot(b.x - g.x, b.y - g.y) ? a : b));
      return this.go(s.x, s.y, 1, false);
    }
    // circle the flock, outside its flight zone
    this.mode = 'circle';
    this.orbit += r.dt * 0.25;
    const ring = spread(main) + RUN.presence.radius + 2;
    this.go(main.x + Math.cos(this.orbit) * ring, main.y + Math.sin(this.orbit) * ring, 0.6, false);
  }

  /**
   * Drive group `grp` toward (tx, ty) as a sheepdog does: get round behind it without cutting
   * through it, then walk it on from just inside its flight zone.
   */
  private herd(grp: Group, tx: number, ty: number): void {
    const g = this.run.gafoop;
    const d = Math.hypot(tx - grp.x, ty - grp.y) || 1;
    const ux = (tx - grp.x) / d;
    const uy = (ty - grp.y) / d;
    // keep walking in on its back edge: a dog that stops is soon scenery
    const back = spread(grp) * 0.5;
    // where he is round the group, against where he should be (straight behind it)
    const gx = g.x - grp.x;
    const gy = g.y - grp.y;
    const want = Math.atan2(-uy, -ux);
    let off = Math.atan2(gy, gx) - want;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    if (Math.abs(off) > 0.6) {
      // round the outside, a little at a time
      const a = want + off - Math.sign(off) * 0.7;
      const ring = spread(grp) + RUN.presence.radius + 1;
      return this.go(grp.x + Math.cos(a) * ring, grp.y + Math.sin(a) * ring, 1, false);
    }
    this.go(grp.x - ux * back, grp.y - uy * back, 0.35, false);
  }

  /** Keep group `grp` where it is, leaning toward (tx, ty): stand off behind it, still. */
  private hold(grp: Group, tx: number, ty: number): void {
    const d = Math.hypot(tx - grp.x, ty - grp.y) || 1;
    const back = spread(grp) + RUN.presence.radius;
    this.go(grp.x - ((tx - grp.x) / d) * back, grp.y - ((ty - grp.y) / d) * back, 0.3, false);
  }

  /** The flock's connected groups: how many sheep and where (the model's group ids). */
  private findGroups(): Map<number, Group> {
    const r = this.run;
    const o = r.model.out;
    const groups = this.groups;
    groups.clear();
    for (let j = 0; j < r.n; j++) {
      if (r.status[j] !== Sheep.Flock) continue;
      let grp = groups.get(o.group[j]);
      if (!grp) groups.set(o.group[j], (grp = { n: 0, x: 0, y: 0 }));
      grp.n++;
      grp.x += o.x[j];
      grp.y += o.y[j];
    }
    for (const grp of groups.values()) {
      grp.x /= grp.n;
      grp.y /= grp.n;
    }
    return groups;
  }

  /** Flock sheep within `r` of (x, y) with a fleece worth shearing. */
  private woolly(x: number, y: number, r: number): number {
    const run = this.run;
    const o = run.model.out;
    let n = 0;
    for (let j = 0; j < run.n; j++) {
      if (run.status[j] === Sheep.Flock && run.wool[j] >= 0.7 && Math.hypot(o.x[j] - x, o.y[j] - y) <= r) n++;
    }
    return n;
  }

  /** Fly toward (tx, ty) at up to `pace` of full speed, the bucket held or not. */
  private go(tx: number, ty: number, pace: number, bucket: boolean): void {
    const r = this.run;
    const g = r.gafoop;
    const dx = tx - g.x;
    const dy = ty - g.y;
    const d = Math.hypot(dx, dy);
    const k = d > 0.5 ? Math.min(pace, d / 3) / d : 0;
    r.input.move.x = dx * k;
    r.input.move.y = dy * k;
    r.input.bucket = bucket;
  }
}

/** Roughly how far a group of sheep reaches from its middle. */
function spread(g: Group): number {
  return Math.sqrt(g.n) * 0.9 + 1;
}

/** Play a run to the end (or `seconds`) with the bot; per-minute numbers for the harness. */
export function playOut(run: Run, seconds = RUN.length): { minute: number; flock: number; enemies: number; level: number; kills: number; lost: number; found: number }[] {
  const bot = new Bot(run);
  const rows: { minute: number; flock: number; enemies: number; level: number; kills: number; lost: number; found: number }[] = [];
  let next = 60;
  while (!run.over && run.time < seconds) {
    bot.drive();
    run.step();
    if (run.time >= next) {
      next += 60;
      rows.push({ minute: Math.round(run.time / 60), flock: run.flockCount, enemies: run.enemies.countOf(), level: run.level, kills: run.stats.kills, lost: run.stats.lost, found: run.stats.found });
    }
  }
  return rows;
}
