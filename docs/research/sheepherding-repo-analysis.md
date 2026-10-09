# Sheepherding repo analysis: what Autosheep can take from it

> **Snapshot.** This describes `lasseastrup/sheepherding` at commit `a470408` (2026-09-12). The flock
> model is a work in progress and is expected to change a lot; Autosheep depends on it only through
> the flock contract in `docs/DESIGN.md` §4.1.

Source analysed: `lasseastrup/sheepherding` at commit `a470408` ("Make the flock shed..."), read 2026-10-09.
All `file:line` citations are relative to that repo. Units in the sim are **body lengths (BL ≈ 1.2 m)
and seconds**. The original game is a desktop overlay where the mouse pointer is the dog; flocks of
20–500 sheep in a single ~40×22 BL paddock.

**In short:** the sim is a deterministic, data-oriented, research-grounded flock model (Ginelli 2015,
Gómez-Nava 2022, King 2012, Strömbom 2014, Azaïs 2018) with a strong behaviour model: intermittent
graze/walk/run states, follow-the-leader lines, selfish-herd flight, visual fear contagion, shedding.
It has **one threat, no obstacles except the paddock rectangle, flock-global group logic, and no
sleep/LOD**. Every sheep costs the same ~5 µs per 30 Hz step whether it is grazing or fleeing. The
behaviour layer ports almost as-is. The world model (threats, obstacles, groups, scheduling) needs
redesigning for a large automation map.

---

## 1. Architecture

### 1.1 File map

| File | LOC | Role |
|---|---|---|
| `src/sim/sim.ts` | 160 | `Sim` façade: owns subsystems, fixed-step `tick()`, pointer→threat filter, snapshot writer |
| `src/sim/flock.ts` | 170 | Structure-of-arrays storage (~50 typed arrays), spawn and personality draw |
| `src/sim/grid.ts` | 43 | Uniform grid, counting sort, rebuilt every step, zero allocation |
| `src/sim/neighbours.ts` | 158 | Contact lists, k-nearest *visible* neighbours (FOV + occlusion), local centre of mass |
| `src/sim/groups.ts` | 142 | Union-find sub-groups; own-group centre, "rest of flock" centre, `seekRest` |
| `src/sim/perception.ts` | 152 | Threat pressure, delayed visual contagion, fear / arousal / habituation |
| `src/sim/behaviour.ts` | 307 | 5-state machine with Poisson hazards and delayed (scheduled) transitions |
| `src/sim/steering.ts` | 456 | Context steering (16 direction slots, interest/danger maps) per state |
| `src/sim/motion.ts` | 136 | Velocity relaxation, PBD disc non-overlap, velocity recovery, XSPH, stamina |
| `src/sim/config.ts` | 352 | `SimConfig` with every knob and its default, plus deep-merge |
| `src/sim/schema.ts` | 185 | Derives tuning-panel ranges from the defaults; flags params that need a respawn |
| `src/sim/metrics.ts` | 163 | Cohesion, NND, polarisation, split count, jitter, overlap (all O(n) with the grid) |
| `src/sim/rng.ts` | 57 | mulberry32 PRNG with `normal()` and `expo()` |
| `src/sim.worker.ts` | 91 | Worker loop and transferable snapshot pool |
| `test/*.ts`, `tools/behaviour.mjs` | | 27 vitest tests: determinism, PBD, 11 behaviour scenarios; one-pass behaviour harness |

`src/sim/` imports nothing from the DOM or three.js. The same module runs in the worker, in Node
tests and on the main thread of the web page (`web/app.ts:40,189-198`).

### 1.2 Tick pipeline (`sim.ts:62-76`), one fixed step at dt = 1/30 s (`config.ts:179`)

1. `prevHeading` copy (for the jitter metric) → 2. `grid.build` → 3. `computeNeighbours` →
4. `updateThreat` (pointer low-pass, τ = 60 ms, `sim.ts:90-116`) → 5. `groups.update` →
6. `perception.update` → 7. `behaviour.update` → 8. `steering.update` → 9. `motion.update` (integrate + PBD).

Each stage is a full pass over all sheep (phase-major, not sheep-major). That is cache-friendly and the
natural shape for later parallelisation. The constructor runs 20 PBD-only relaxations to remove spawn
overlaps (`sim.ts:50-57`).

### 1.3 Data layout (`flock.ts`)

- SoA `Float32Array`/`Uint8Array`/`Int16Array`, fixed **capacity 512** (`sim.ts:14`). Neighbour indices
  are `Int16`, so the hard ceiling is 32,767 without a type change.
- Groups of fields: kinematics (`px,py,prevX,prevY,vx,vy,heading,speed`); behaviour (`state,stateTime,
  pendingState,pendingAt,fear,fearHist,fearJump,pressure,arousal,familiarity,stamina,leader,
  leaderSide,...`); personality (`scale,radius,boldness,gregarious,reactionDelay,fearDecay,speedMult,
  grazeBias`); per-step neighbourhood (`nbr[N×8]`, `contacts[N×16]`, `nearestDist`, `meanVisDist`,
  `lcmX/Y`); steering scratch (`interest[N×16]`, `danger[N×16]`).
- Constants: `MAX_NEIGHBOURS = 8`, `FEAR_HIST = 40` (1.3 s ring for delayed contagion), `MAX_CONTACTS = 16`
  (`flock.ts:5-7`).
- Pending transitions are stored per sheep (`pendingState/pendingAt`), not in an event queue. That
  makes save/load a plain memcpy.
- Snapshot: 8-float header plus 8 floats per sheep `[x, y, heading, speed, state, fear, scale, leader]`
  (`types.ts:13-14`, `sim.ts:134-159`).

### 1.4 Determinism

- One seeded mulberry32 stream (`rng.ts:2-17`), no `Math.random`, fixed dt, typed arrays, no
  hash-map iteration. `test/determinism.test.ts` asserts bit-identical snapshots after 120 s for the
  same seed.
- **Caveats for Autosheep.** (a) The single RNG stream is consumed in sheep-index order by behaviour
  and steering (`behaviour.ts:181,200,209,279`, `steering.ts:214,307`). Any change in iteration order,
  such as threads, chunks or a sleeping sheep that skips its draw, changes every later random number.
  (b) Stages read neighbours' `state`/`heading` *in place*, so sheep j < i have already been updated
  this step (Gauss-Seidel style). Fear alone is double-buffered through `fearHist`
  (`perception.ts:149-150`). (c) PBD is Gauss-Seidel and order-dependent (`motion.ts:95-135`).
  (d) `time` accumulates as a float (`sim.ts:74`). (e) The design doc's input log and 60 s replay ring
  (`docs/flock-design.md:340-341`) were never implemented.
- JS `Math.exp/pow/sin/atan2` are not guaranteed bit-identical across JS engines. Determinism holds
  within one engine and build, which is enough for tests and save/load (save state, don't replay
  inputs). It is not enough for cross-platform lockstep.

### 1.5 Worker and rendering

`sim.worker.ts`: `setInterval(loop, 1000/60)`. The loop accumulates real time (clamped to 0.25 s),
runs up to 400 catch-up steps and posts one snapshot per batch through a pool of transferable
`ArrayBuffer`s (pool ≤ 4). Metrics ride along on every fifth snapshot (`sim.worker.ts:29-57`). Messages:
`init/pointer/config/speed/pause/buffer`. The renderer interpolates position, heading (shortest arc)
and speed between the previous and current snapshot (`render3d/sheepRenderer.ts:557-610`).
`applyConfig` hot-patches every knob except seed, count, world and slots (`sim.ts:119-127`).

### 1.6 Spatial grid and neighbour search

- `UniformGrid` with cell = `sheep.gatherCell` = 2 BL (`config.ts:187`). It is rebuilt every step with a
  counting sort into `cellStart/cellItems` (`grid.ts:31-42`).
- Neighbour search expands **ring by ring** from the 3×3 block. It stops only when the k-th nearest
  candidate lies within `ring × cellSize` (`neighbours.ts:65-92`). This is correct (stopping at k
  candidates silently changed who follows whom; see `docs/flock-design.md:583-586`), but **unbounded**:
  `maxRing = max(cols, rows)`, so on a huge map an isolated sheep scans the whole world. Candidates
  are kept in a bounded insertion-sorted buffer, `MAX_CAND = 28` (`neighbours.ts:11`).
- Groups link pairs within `linkDist` = 6 BL by scanning ⌈6/2⌉ = 3 rings, i.e. 7×7 cells, per sheep
  (`groups.ts:86-105`). That is the second-largest cost (below).

### 1.7 Performance

From the docs (`docs/flock-design.md:571-605`, browser, per step): 20 sheep 91 µs, 150 → 430 µs,
300 → 830 µs, 500 → 1287 µs. Rendering at 500 sheep went from 411 ms to 40 ms per frame (one material,
blob shadows, skipping bone uploads for unchanged poses, round-robin animation). The frame is CPU-bound
in three.js skinning, not in the sim. The docs name baked vertex-animation textures and instancing as
the next step.

**Measured here** (Node 22, a scratch copy with `CAPACITY` raised, world scaled with √N to keep
density, 300 steps after 5 s warm-up):

| Sheep | 20 | 150 | 500 | 1,000 | 2,000 | 5,000 |
|---|---|---|---|---|---|---|
| µs/step, calm | 152 | 871 | 2,465 | 4,654 | 9,585 | 26,229 |
| µs/step, pointer sweeping | 381 | 1,162 | 3,296 | 5,262 | 11,065 | 29,007 |

Cost is linear at ~5 µs per sheep per step. 5,000 sheep at 30 Hz is ~80 % of a core and 10,000 would
be ~160 %. Phase split at 2,000 sheep: neighbours 35 %, groups 25 %, steering 16 %, behaviour 8 %,
perception 8 %, motion 7 %, grid 2 %. **83 % of those sheep were grazing**, and an idle sheep costs as
much as a running one, so sleep/LOD is the biggest lever.

---

## 2. Behaviour model

### 2.1 Perception of neighbours (`neighbours.ts:44-158`)
- **Contacts**: every candidate within `rᵢ + rⱼ + 1.0` BL (`neighbours.ts:49,97-108`), up to 16. Used for
  PBD, grazing repulsion and run repulsion. `contactRadius` = 0.45 (`config.ts:183`); radius scales
  with per-sheep `scale` [0.9, 1.1].
- **Visible neighbours (topological)**: the k = `kVisible` = 6 nearest (`config.ts:184`) within a
  `fovDeg` = 300° field of view (60° rear blind cone, `neighbours.ts:120`). A candidate is skipped when
  a nearer selected one lies within `occlusionDeg` = 12° of the same bearing (`neighbours.ts:121-125`).
  If nobody is visible, it falls back to the nearest k "by hearing" (`neighbours.ts:134-145`).
  Outputs: `nearestDist`, `meanVisDist`, local centre of mass `lcmX/Y`, and flock-wide `meanNnd`.

### 2.2 Threat → pressure (`perception.ts:44-75`)
Only one threat exists: the pointer, low-passed into a velocity. Per sheep, with
`threatPos = pointer + v·lookahead`:
- `motion = clamp((speed − idleSpeed)/(dogSpeed − idleSpeed))`: a still pointer reads as a human and
  a moving one as a dog. `zone = lerp(zoneIdle, zoneDog, motion) · (0.8 + 0.4·arousal) ·
  (1 − habituationStrength·familiarity) / boldness` (`perception.ts:51-57`).
- **Only closing motion presses**: `closing = max(0, toward)·speed`, `speedFactor = 1 + speedGain·
  min(2, closing/run.speed)`, `directness = 1 + directnessGain·max(0, toward)` (`perception.ts:66-68`).
  A dog circling at constant distance widens the zone but does not press.
- Blind cone: ×`blindFactor` unless within `blindProximity` (`perception.ts:73`).
- `pressure = min(1, smoothstep(zone·outerScale, zone·innerScale, d)·speedFactor·directness·angle)` (`:74`).
- Defaults (`config.ts:263-273`): lookahead 0.2 s, idleSpeed 0.3, dogSpeed 2.0 BL/s, **zoneIdle 3 BL,
  zoneDog 8 BL** (compressed from real 5–10 BL and ~58 BL; at real scale the flock reacts across the
  whole screen, `docs/flock-design.md:404-405`), outerScale 1.5, innerScale 0.35, speedGain 0.6,
  directnessGain 0.5, blindFactor 0.3, blindProximity 2.

### 2.3 Fear, contagion, arousal, habituation, isolation (`perception.ts:78-150`)
- **Contagion** reads each visible neighbour's fear **one reaction delay ago** from the `fearHist`
  ring (`:83-84`). Weight `1/log(2 + dist)` (`:94`); ×`towardBoost` 1.6 if a running neighbour is
  heading at me. Transmission is **lossy**: capped at `transmitCeiling` 0.85 × source (`:110`).
  It applies only if the **fraction** of visible neighbours that are alarmed (fear > 0.4 or running)
  is ≥ `contagionThreshold` 0.35 × boldness, or own fear > 0.5 (`:113-115`). This complex-contagion
  rule keeps cascades subcritical far from the threat and supercritical near it.
- `fear = max(prev, pressure, social, lonelyFloor)`, decayed with τ = `fearTau` 12 s (6 s when packed,
  `packedDist` 2 BL) × per-sheep `fearDecay` (`:127-131`). `arousal = max(arousal, 0.6·fear)`, τ = 120 s
  (`:135-137`). Arousal widens the zone and shortens reaction delays (`behaviour.ts:146`).
- **Habituation** (`:141-145`): familiarity rises over 40 s while pressure is in (0.02, 0.8], drops in
  5 s when pressure > 0.8, and is forgotten over 300 s. It shrinks the zone by up to 45 %. Without it,
  fear → arousal → zone → fear spirals into permanent panic (`docs/flock-design.md:434-437`).
- **Lonely** when `nearestDist > isolationDist` 8 BL. Lonely sheep get a fear floor of 0.3, cannot
  graze, ×2 cohesion and ×0.5 threat danger, so they run past the dog to rejoin (`:119-125`).

### 2.4 State machine (`behaviour.ts`, states in `types.ts:2-8`)
All transitions go through `schedule()` with a delay of `reactionDelay/(1+arousal)`. Reaction delay is
drawn from [0.3, 1.2] s and divided by (0.5 + 0.5·boldness) (`flock.ts:144`). This makes cascades
ripple. Per-step probability is `1 − e^(−rate·dt)` (`behaviour.ts:8`). n_W, n_R, n_S are counts over the
visible neighbours.

| From → to | Rule (code) | Defaults |
|---|---|---|
| any → RUN (startle) | fear ≥ startleEnter **and** fear jumped ≥ startleJump this step (`:152-156`) | 0.6 / 0.3 |
| G/A/W → RUN | isolation `0.02·max(0, nnd − 8)` + dispersal `0.004·max(0, meanVis − max(3.5, 2·meanNnd))²` + mimetic `((1 + 1.0·n_R)^2 − 1)/4 / (1+n_S)^g`, with g reduced for dispersed sheep; refractory 1.5 s after a run (`:158-185`) | `run.*`, `config.ts:228-233` |
| GRAZE → ALERT | fear ≥ alertEnter or lonely; or alert neighbours at rate 1.0 × fraction (`:189-204`) | 0.15 |
| GRAZE → WALK | `mustRejoin`; spontaneous `0.05/groupSize·boldness` (Azaïs: the group initiates at a size-independent rate); mimetic `0.32·n_M^0.61 / n_S^0.71` (`:193-211`) | `walk.*`, `config.ts:209-223` |
| GRAZE (idle) | every 5–20 s × grazeBias, take a 0.5–2 BL step at 0.3 BL/s, heading noise ±30° (`:213-218`) | `graze.*` |
| ALERT → RUN / WALK / GRAZE | fear ≥ runEnter 0.45 (unless stuck); fear ≥ walkEnter 0.25 after 1 s at rate 1.5; mimetic walk; back to GRAZE after ~1.5–5.5 s (half `alert.duration` + half `calmTime`, timid sheep longer) (`:221-247`) | `fear.*`, `alert.*` |
| WALK → GRAZE | stop `0.42·n_S^0.48 / n_M^0.54` + 0.05/(k+1); arrival rate 2 when the leader stopped within 1.5 BL; initiator persistence ×0.1 for 10 s, gives up after 15 s with no followers (Toulet), walks 6–15 s (`:251-281`) | `walk.stop` etc. |
| RUN → ALERT | `(1 + 2.5·n_close)^2.5/3`, n_close = non-runners < 1.5 BL; forced when fear < 0.2 and all neighbours within 2 BL; **cornered**: speed < 0.6 for 1.5 s → stop and face the threat (`:284-300`) | `run.stop`, `config.ts:234` |

REST exists in the enum but nothing ever enters it.

### 2.5 Steering per state (`steering.ts`, context steering after Fray)
Behaviours write lobes `w·max(0, dot(slot, dir))` into 16-slot interest and danger maps, combined
per slot with **max**, never summed (`:49-55`). Resolve (`:58-87`): mask every slot whose danger
exceeds min danger + `maskMargin` 0.1, pick the best interest, refine with a parabola over the
neighbouring slots, then turn at the state's rate (graze/alert 90°/s, walk 180°/s, run 360°/s,
`config.ts:251`). Speed is multiplied by `(1 − danger in the chosen slot)` (`:392`).
- **GRAZE** (only while a step is pending): wander lobe 0.6; LCM lobe 0.6·gregarious if
  `nearestDist > rejoinDist` 4; group spring and homesickness (`rejoinLobe`); crowding within
  `repelDist` 2.5 BL as **danger**, which slowly spreads the flock (`:144-169`).
- **ALERT**: speed 0. Rotates to face the threat, else its remembered position (`threatMemory` 12 s),
  else the rest of the flock (`:170-185`).
- **WALK, follower**: steer to a slot 1.4 BL (`followGap`) behind the leader; 20 % of followers take a
  side slot (`behindProb` 0.8, `behaviour.ts:101`). Speed regulates the gap, capped at 1.3 × walk speed
  1.15 BL/s (`:190-211`). Leader = nearest visible walker or runner in the front hemisphere, never a
  direct 2-cycle (`behaviour.ts:77-112`). Lines and funnelling through gaps emerge from this.
  **Initiator**: persistent random walk (15°/√s) plus a weak LCM lobe of 0.4 (`:212-222`). Walkers add
  neighbour danger within 1.2 BL (`:223`).
- **RUN** (Strömbom-style force sum folded into one interest lobe, `:226-315`): cohesion
  `1.05·(1+fear)·gregarious·min(1, d/1.6)` toward a target that mixes LCM with the own-group centre
  50/50. The mix drops to 0 when the sheep is split or blocked; while split it uses only the 3 nearest
  neighbours (`:234-256`). Plus repulsion 1.0 within 1.2 BL, alignment 0.3 with *running* neighbours
  only, rejoin pull 0.9·seekRest, **direct threat repulsion only 1.4·pressure**, and OU heading noise
  0.3 (τ 1.5 s). Speed 3.5 BL/s × speedMult, ×0.7 when stamina < 0.2 (`:312`).
- **Threat lobes** for any moving state (`:320-369`): danger toward the threat =
  `max(1.4·pressure, obstacle)`, where the obstacle term (weight 1.2 within 3 BL) holds regardless of
  fear. Non-RUN states get a flee interest away from the threat **bent toward the LCM** by
  `0.8·(1+fear)` (selfish herd), fading once packed. **Point of balance**: threat > 70° behind the
  nose → interest 0.4·p straight ahead; in front → danger 0.5·p ahead (`:358-364`). **Split**: pressure
  > 0.85 → 3 s of local-only cohesion (`:365-366`).
- **Fences** = world edges only: danger rises from 0 at 3 BL to 1 at 0.5 BL (`:372-381`).
- **Blocked corridor**: if the threat lies within 50° of the bearing to the rest of the flock and no
  further than 1.4× that distance, homesickness and centroid mixing are switched off (`:122-139`). This
  is what keeps a cut flock cut.

### 2.6 Sub-groups and cohesion (`groups.ts`, `steering.ts:404-441`)
Union-find over pairs < `linkDist` 6 BL. Three distinct pulls (`docs/flock-design.md:503-509`):
`flockPull` 0.8 toward the **own** group's centre, as a spring with slack radius `flockSpread·√size`
(`:426-428`), scaled by (1 + fear) so the flock spreads when calm and bunches when scared;
`rejoinWeight` 1.1 toward the **rest** of the flock, only when the group is smaller than
`shedTolerance` = max(6, N/4) (`groups.ts:118,135`); and a feeble `driftTogether` 0.35 that slowly
re-merges any divided flock (`:438`). `mustRejoin` = seek > 0.5 and > `strayDist` 8 BL from the rest
(`groups.ts:138`).

### 2.7 Motion (`motion.ts`)
Velocity relaxes toward heading × desiredSpeed (accel τ 0.3–0.4 s, decel τ 0.6–0.8 s, `:21-40`). PBD
runs 3 Gauss-Seidel iterations over contact pairs with min distance (rᵢ+rⱼ)·0.97, stiffness 0.6 and
tangential friction 0.3, then clamps to the world bounds (`:95-135`). Velocity is recovered from
positions, then XSPH smoothing 0.3 is applied to GRAZE/ALERT sheep only (`:45-77`), so a packed
resting flock sits perfectly still (`test/pbd.test.ts`). Stamina drains at 0.35/s above 1.1 × run speed
and refills at 0.1/s (`:86-90`).

### 2.8 Personality (`config.ts:189-197`, `flock.ts:130-169`)
Drawn once per sheep: scale [0.9, 1.1], boldness [0.6, 1.4], gregarious [0.7, 1.3], reactionDelay
[0.3, 1.2] s, fearDecay [0.7, 1.3], speedMult [0.88, 1.12]·scale^−0.3, grazeBias [0.7, 1.3].

### 2.9 Where the code differs from the design doc
`run.sprintSpeed` 6.0 is defined but never read; nothing sprints. REST, lambs and breed presets do not
exist. The doc's Karamouzas time-to-collision anticipation is implemented as plain distance-based
neighbour danger (`steering.ts:443-455`). The gather cell is 2 BL, not the doc's 4. Flight zones are
3/8 BL, not 7/22 (documented, `docs/flock-design.md:399-437`). Neighbours are recomputed every step,
not every 0.2 s as the spec planned (`docs/flock-design.md:78`).

---

## 3. Reuse for Autosheep, and what must change

### 3.1 Reuse almost verbatim
- The **SoA layout, phase-major tick, counting-sort grid and bounded k-nearest search** (add a radius cap).
- The **state machine and its hazard rates** (Azaïs/Pillot/Ginelli constants), **scheduled
  transitions with reaction delays**, and the startle path.
- **Context steering**. It is the right primitive for many stimuli: devices, walls and lures each add
  lobes, and max-combination means no cancellation or weight-tuning hell.
- **Pressure model**: zone × closing speed × directness × blind cone, plus habituation and lossy
  fraction-threshold contagion. Generalise it from one threat to many.
- **PBD + XSPH** (resting flocks with zero jitter), **personality draws**, the **config/schema/tuning
  panel** pattern, and the **metrics + scenario harness**. Port the tests as regression gates.

### 3.2 Must change (each is a concrete blocker at map scale)
1. **Single threat** (`perception.ts:11-18`, `Sim.threat`): needs N threats, lures and fields per sheep.
2. **No obstacles**: walls are only the world rectangle (`steering.ts:372-381`, `motion.ts:129-133`).
   Fences, walls, gates and chutes need SDF-based steering danger, PBD projection and line-of-sight.
3. **Flock-global group logic breaks with many herds.** `restX/Y` is "everyone not in my group" across
   the entire map. `shedTolerance = max(6, N/4)` means that at 5,000 sheep any group smaller than 1,250
   seeks the rest. `driftTogether` pulls every pen toward every other pen. `meanNnd` is global
   (`behaviour.ts:165`). Every penned flock would press against its walls toward the map centroid.
   Groups must be per herd and per region (reachable, line of sight), and homesickness must aim at the
   nearest same-herd group by path, not straight line.
4. **Unbounded ring search** (`neighbours.ts:64`): cap at a perception radius (~16 BL) and treat
   "found nobody" as lonely.
5. **Uniform cost**: no sleep or LOD, and groups run at 30 Hz (25 % of cost).
6. **Order-dependent determinism** (§1.4): it breaks under threading or sleeping.
7. **Capacity and indexing**: `CAPACITY` 512 and `Int16` indices. Sheep are born, sold and slaughtered,
   so they need stable IDs plus dense slots (swap-remove).
8. **No goal concept**: nothing drives sheep *to* anywhere. Automation needs lures, flow fields and
   device-driven destinations.

### 3.3 Proposed sheep-sim architecture for Autosheep

**World and units.** Keep BL and seconds. Suggested tile = 2 BL (one iso tile holds about 4 grazing
sheep), chunk = 16×16 tiles = 32 BL. Per-chunk static layers: passability edges (wall / fence /
hurdle / gate bits per tile edge), an 8-bit **signed distance field** at 0.5 BL resolution
(recomputed on edit by two-pass chamfer), terrain cost, grass biomass, light/slope preference
(scalars the steering can sample, as `docs/flock-design.md:34-35` anticipated), and a region id
(connected component of passable space, for groups and line of sight).

**Per-sheep SoA additions.** `id:u32` (stable), `herd:u16`, `homePen:u16` (hefting), `breed:u8`,
`sex/age:u8`, `wool:f32` (grows with grazing × (1 − arousal)), `satiety:f32`, `health:f32`,
`tags:u32` bitmask (shorn, dipped, counted, raddle colour, sorted-for-X, processed-by-station-K),
`routeId:u16` (which goal field the sheep is being driven along), `aversiveX/Y/until` (memory of a
station that hurt), `lod:u8`, `chunk:u32`. Reuse `arousal` as the economy's **stress** stat: it
already has a 120 s τ and the right causes.

**Herding devices emit stimuli, not code paths.** Devices are game entities; each tick they write
into flat SoA stimulus buffers that the sim reads per chunk:

```ts
type StimKind = 'threat' | 'lure' | 'flow' | 'startle' | 'leader';
interface Stimulus {            // stored SoA; one device may emit several
  kind: StimKind;
  x: number; y: number;          // point source (segments/polys go into static layers instead)
  vx: number; vy: number;        // device velocity: drives lookahead + "closing" pressure
  radius: number;                // flight zone (threat), reach (lure), field extent (flow)
  strength: number;              // scales pressure / attraction (tech tier, fuel, upgrades)
  dirX: number; dirY: number;    // flow direction (chute, conveyor-race), or facing for cones
  halfAngle: number;             // emission cone (lantern, repeller facing a gate)
  novelty: number;               // > 0 resets habituation (horn, bell, new device)
  tagMask: number; tagMatch: number; // only sheep with (tags & mask) === match react
  blockedBySight: boolean;       // visual stimuli need LOS; sound/smell do not
}
interface HerdingDevice {
  readonly id: number;
  readonly dynamic: boolean;                     // robodog, drone, moving lure
  bounds(): { x0: number; y0: number; x1: number; y1: number }; // chunk registration
  emit(out: StimulusWriter, tick: number): void; // static devices: only when dirty
  edits?(out: StaticLayerWriter): void;          // fences/gates/chutes: SDF + edge bits
  onSheepEnter?(slot: number, tick: number): void; // shear, dip, count, mark, sort (processors)
  think?(view: FlockView, dt: number): void;     // robodog brain (Strömbom collect/drive)
}
```

How each stimulus maps onto the existing model:

| Stimulus | Perception | Steering |
|---|---|---|
| threat (dog, robodog, scarecrow, fire, repeller) | pressure per threat with the existing formula; `pressure = 1 − Π(1 − pₖ)`; fear and contagion unchanged; per-device familiarity in a small per-sheep slot cache (the 4 most familiar device ids) | danger, obstacle, flee-bent-to-LCM, point-of-balance and blocked-corridor lobes for the top 3 threats by pressure |
| lure (feed, salt lick, ewe-call, bellwether) | none (not fear) | interest lobe `strength·hunger·(1 − fear)` within radius; raises the GRAZE→WALK **spontaneous rate** for sheep inside reach, so lures recruit *initiators* and the mimetic rules pull the rest (Pillot's trained-initiator experiment) |
| flow (chute, race, one-way gate) | none | interest along `dir` plus danger against it (anti-backup ratchet); the walk leader uses it as the initiator heading |
| startle (whip-crack, horn, steam whistle) | one-shot fear jump at radius; bypasses LOS if sound | goes through the existing startle → RUN path |
| leader (bellwether item, Judas sheep) | none | a sheep that is always WALK-eligible and always picked as leader by `pickLeader` |

**Obstacles.** (1) Steering: per sheep, sample the SDF at 4 probes (0.5–3 BL) along the heading and
the gradient at the current position. Write danger lobes toward `−∇sdf` with the existing fence
falloff (3 BL → 0.5 BL), generalising `steering.ts:372-381`. A blocked slot is masked exactly like a
threat. (2) PBD: after the contact iterations, project discs out of solids (`x += ∇sdf·(r − sdf)`),
replacing the rectangle clamp. (3) Perception: threats and neighbours across a **solid** wall are not
visible (cheap region-id test plus an edge DDA only for threats within the zone); fences and hurdles
are see-through. Alarm then spreads between pens divided by hurdles but not by stone walls, which is a
nice tech distinction. (4) Groups and homesickness use region plus herd, and the "rest" target is
replaced by a **flow-field step toward the nearest same-herd group**.

**Flow fields toward goals.** Each goal or route (pen, station inlet, sorter outlet) owns a
tile-resolution integration field (Dijkstra over passability × terrain cost, ~1 ms per 256×256 tiles)
cached per chunk and rebuilt on edits. Following the research ("following beats pathfinding",
`docs/research/sheep-ethology.md:252`), **only initiators and lone or rejoining sheep sample the
field**. Followers keep following positions. Robodogs use the field for Strömbom's
drive point `GCM − flowDir·r_a·√N` and collect point (`docs/research/collective-motion-science.md:
176-183`), so dogs drive around corners correctly.

**Scaling to 2,000–10,000 sheep.**
- **Chunk activity tiers** (like physics island sleeping): ACTIVE = full pipeline at 30 Hz. CALM =
  every sheep in GRAZE with fear < 0.05 and no stimulus touching the chunk (plus a 1-chunk margin):
  tick at 5 Hz with dt×6 hazards, neighbours and groups at 1 Hz, steering only for sheep that have a
  graze step pending. ASLEEP = CALM for > 10 s and no neighbour chunk active: no tick, positions frozen,
  wool/grass/stress advanced in closed form on wake. Wake on device emit, chunk-edge crossing, gate
  toggle, or contagion arriving from a neighbouring chunk.
- **Rate-split phases**: groups at 2 Hz (incremental union-find per chunk, merged across chunk borders);
  visible neighbours for GRAZE sheep at 5 Hz. Together that removes ~40 % of the active cost.
- **Workers**: N workers own chunk stripes over a `SharedArrayBuffer` (needs COOP/COEP; trivial in
  Electron/Tauri). Barrier phases: grid+neighbours → perception/behaviour/steering (read previous-step
  `state/heading/fear` from double buffers, write own sheep only) → integrate → PBD in a **4-colour
  chunk checkerboard** (no two adjacent chunks solve at once, Gauss-Seidel inside a chunk) → migrate
  sheep across chunk borders in sorted order.
- **Determinism under threads and sleep**: replace the shared stream with a counter-based hash RNG
  `rand(seed, sheepId, tick, purpose)` (e.g. a SplitMix/Squirrel hash). Every draw is independent of
  iteration order, sleeping and thread count. Use an integer `tick` instead of float `time`. Use fixed
  order for all reductions (per chunk, then chunks by index). Save = all SoA buffers + device state +
  tick + seed. There is no RNG state left to save.
- **Budget estimate** at ~5 µs per active sheep: 10,000 sheep with 15 % ACTIVE (1,500 × 5 µs = 7.5 ms),
  35 % CALM (3,500 × ~2 µs ÷ 6 ≈ 1.2 ms) and 50 % ASLEEP (~0) gives ~9 ms per 33 ms step on one thread,
  ~3 ms wall-clock on 4 workers. Even 2,000 all-active sheep (11 ms) fits single-threaded.
- **Snapshots**: renderer reads the SAB directly for visible chunks only; heading quantised to 8 iso
  directions plus state for sprite selection; positions interpolated as today.

**Suggested tick order** (per active chunk set): ingest device emits and static-layer edits → grid →
neighbours (radius-capped, region-aware) → groups (rate-limited) → perception (multi-threat, LOS) →
behaviour (counter RNG) → steering (devices, SDF, flow) → integrate → PBD + SDF projection → processor
triggers (`onSheepEnter`) → activity-tier bookkeeping → snapshot.

**Porting order**: copy `src/sim` → add the radius cap and counter RNG → multi-threat → SDF obstacles
→ per-herd groups → lures/flow → chunk tiers → workers. Keep the 11 scenarios green at every step and
add new ones: "drive through a gate", "lure-led line through a chute", "two pens don't attract each
other", "sleeping chunk wakes on dog".

---

## 4. Ethology facts → game mechanics

Sources: `docs/research/sheep-ethology.md` (E), `docs/research/collective-motion-science.md` (C),
`docs/flock-design.md` (D).

| Fact | Ref | Mechanic idea |
|---|---|---|
| Flight zone is contextual: 5.7–11.4 m from a human, ~70 m from a working dog; larger for fast, head-on, unfamiliar approaches | E §2.1 | Every threat device has a zone radius; tech tiers trade zone size against panic risk |
| Flight distance scales with the space available (5.7 m in a 2 m lane vs 11.4 m in a 4 m lane) | E §2.1 | Narrow races let a weak pusher move sheep; races are a cheap "belt" |
| Point of balance at the shoulder: behind it moves the sheep forward, in front stops it | E §2.2 | Pushers must sit 45–60° behind the shoulder; a "stop paddle" in front acts as a brake or valve |
| Walking against the flow past the point of balance pulls a line forward | E §2.2 | Return-loop "walker" drone along a race boosts throughput |
| Pressure must be released; unrelieved pressure causes panic, splits and breakbacks | E §2.3 | Repellers run on duty cycles; always-on devices raise stress and cause backflow jams |
| Only closing motion presses; circling steadies (implemented) | D §11.8 | An orbiting robodog "holds" a flock in place without driving it (a buffer/storage device) |
| Habituation to a harmless presence (~40 s, zone −45 %) but not to novel sounds | E §4, D §11.9 | Static scarecrows decay; rotating or noisy upgrades reset novelty; horns never habituate |
| Selfish herd: under threat sheep run to the centre, then away as a pack | C §3 | Light pressure before a gate compacts the flock and raises gate throughput |
| Bunching tightness scales with fear (~5 m grazing, ~1 BL packed) | E §3.4 | Throughput = density × speed; too much fear turns to stampede and jams |
| Following: positional line behind a temporary leader, p≈0.8 directly behind | C §2 | Single-file races work naturally; a bellwether item makes any flock leadable |
| First sheep hesitates at a gap, then the rest pour through | E §5.3 | Gates have a priming delay; a leader sheep or lure at the exit removes it |
| Super-linear allelomimesis; all-or-none departures; group start rate independent of size | C §2, §5 | "Starter" lures only need to recruit 2–3 initiators; big flocks are not faster on their own |
| Initiator gives up after ~15 s with no followers (Toulet) | C §5 | A lure too far from the flock leads one sheep astray and it comes back; placement matters |
| Isolation is aversive; a lone sheep crosses past the dog to rejoin; groups < 4 uneasy | E §3.1 | Free straggler recovery; single-sheep stations stress sheep, so batch ≥ 4 or add a "mirror" companion |
| Half a flock is a flock; small shed groups run back (shedTolerance) | D §13 | Splitter gates must cut batches above a minimum size, or leftovers flow back |
| Too much pressure splits the flock; tail-enders break back past the dog | E §5.3, §7.2 | Overdriven chutes produce breakback (sheep flowing upstream) as a failure state |
| ~60–70° rear blind cone; approach from behind → startle | E §1.1 | Hidden pushers get closer but trigger stampedes: fast, lossy transport |
| Alarm wave travels faster than any sheep (Trafalgar effect), via line of sight | C §6 | Panic spreads between pens through hurdles but not stone walls; walls are a fire-break tech |
| Prefer uphill, toward light, gentle curves; balk at shadows, puddles, floor changes, dead ends | E §5.3 | Lanterns and paved floors as passive routing; curved races beat right angles; dark sheds stall flow |
| Sheep circle a handler; round forcing pens and tubs work | E §2.4 | Round "tub" device redirects flow 90–180° without a pusher |
| Recovery takes 20–30 min; heart rate stays elevated for hours after dog-driving | E §2.3 | Stress lowers wool growth and quality; calm pastures and gentle tech are an efficiency layer |
| Grazing spreads then avalanche-repacks (~15 min per 100 ewes) | C §1 | Idle flocks self-distribute over pasture; stocking density sets grass use |
| Daily rhythm: synchronised grazing bouts, midday and night rest | E §6 | Night means flocks sleep (fits LOD); movement logistics are cheaper at dusk |
| Breeds: Merino strongly flocking; hill breeds disperse and keep home ranges ("hefts") | E §3.3 | Breed choice trades bulk herdability against self-distribution; hefted sheep return home on their own |
| Ewes with lambs stamp and butt rather than flee; lambs stay with the dam | E §3.2 | Lambing season: ewes resist robodogs; lambs are moved by moving their mothers |
| Dog only needs to be 1.25–1.5× faster; collect/drive heuristic, f(N) = r_a·N^(2/3) | C §4 | Robodog AI and speed tiers; collect/drive modes shown as UI hints |
| Sheep remember aversive handling and recognise faces | E §1.1 | Per-sheep memory makes them avoid shearing or dipping stations for a while; "gentle" upgrades reduce it |
| Loud, high-pitched noise → move away; hearing up to 42 kHz | E §1.2 | Industrial-era steam whistles and ultrasonic repellers as no-line-of-sight threats |
| Walk 1.1–1.3 m/s, run 1–3 m/s, bursts to ~10 m/s with stamina | C §7, E §5.1 | Belt-speed analogue: walking speed caps throughput; stampede transport lasts seconds |
