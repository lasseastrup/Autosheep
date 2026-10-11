import { RUN } from './config';
import { Sheep, type Run } from './run';
import { ITEMS } from './items';

/**
 * A scripted Gafoop for the run harness and the tests (plan §10.4): no reflexes to speak of,
 * just the sheepdog's priorities. Rescue a sheep being taken; fetch strays when the flock is
 * not under attack; otherwise circle the flock, turning towards the monster nearest it.
 * Level-ups go to armaments first, the flock's gear included.
 */
export class Bot {
  private orbit = 0;

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
    const f = r.flockCentre();
    let tx = f.x;
    let ty = f.y;
    // a sheep being taken comes first
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < r.n; j++) {
      const s = r.status[j];
      if (s !== Sheep.Grabbed && s !== Sheep.Carried && s !== Sheep.Beamed) continue;
      const d = Math.hypot(o.x[j] - g.x, o.y[j] - g.y);
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0) {
      tx = o.x[best];
      ty = o.y[best];
    } else {
      // the monster nearest the flock
      const e = r.enemies;
      let ne = -1;
      let nd = 14;
      for (let i = 0; i < e.high; i++) {
        if (!e.alive[i]) continue;
        const d = Math.hypot(e.x[i] - f.x, e.y[i] - f.y);
        if (d < nd) { nd = d; ne = i; }
      }
      const strays = r.strays();
      if (ne >= 0) {
        tx = e.x[ne];
        ty = e.y[ne];
      } else if (strays.length && r.time > 20) {
        const s = strays.reduce((a, b) => (Math.hypot(a.x - g.x, a.y - g.y) < Math.hypot(b.x - g.x, b.y - g.y) ? a : b));
        tx = s.x;
        ty = s.y;
      } else {
        this.orbit += r.dt * 0.6;
        tx = f.x + Math.cos(this.orbit) * 5;
        ty = f.y + Math.sin(this.orbit) * 5;
      }
    }
    const dx = tx - g.x;
    const dy = ty - g.y;
    const d = Math.hypot(dx, dy);
    r.input.move.x = d > 0.5 ? dx / d : 0;
    r.input.move.y = d > 0.5 ? dy / d : 0;
    // the bucket when the flock has strayed far from him and nothing is being taken
    r.input.bucket = best < 0 && Math.hypot(f.x - g.x, f.y - g.y) > 10;
  }
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
