/**
 * The run harness (plan §10.4): whole runs played by the bot, minute by minute. Off by default
 * (it takes a while); HARNESS=1 npx vitest run tests/run-harness.test.ts prints the tables.
 */
import { test } from 'vitest';
import { meadowField } from '../src/run/field';
import { Run } from '../src/run/run';
import { playOut } from '../src/run/bot';
import type { RunOptions } from '../src/run/config';

const seeds = (process.env.SEEDS ?? '1,2,3').split(',').map(Number);
const opts: Partial<RunOptions> = JSON.parse(process.env.OPTIONS ?? '{}');

test.runIf(!!process.env.HARNESS)('run harness', () => {
  const field = meadowField();
  for (const seed of seeds) {
    const run = new Run(field, { seed, options: opts });
    const t0 = performance.now();
    const rows = playOut(run);
    const ms = performance.now() - t0;
    console.log(`seed ${seed}: ${run.over ?? 'unfinished'} at ${run.time.toFixed(0)} s, flock ${run.flockCount} (peak ${run.stats.peak}), level ${run.level}, kills ${run.stats.kills}, found ${run.stats.found}, rescued ${run.stats.rescued}, lost ${run.stats.lost}, sheared ${run.stats.sheared}, torn ${run.stats.torn}, xp wool ${run.stats.xpWool.toFixed(0)} kills ${run.stats.xpKills.toFixed(0)}; ${(ms / 1000).toFixed(1)} s to simulate`);
    console.log('  min | flock | monsters | level | kills | lost | found');
    for (const r of rows) console.log(`  ${String(r.minute).padStart(3)} | ${String(r.flock).padStart(5)} | ${String(r.enemies).padStart(8)} | ${String(r.level).padStart(5)} | ${String(r.kills).padStart(5)} | ${String(r.lost).padStart(4)} | ${String(r.found).padStart(5)}`);
    console.log('  items:', [...run.items].map(([k, v]) => `${k} ${v}`).join(', '));
  }
}, 600_000);
