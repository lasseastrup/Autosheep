# Autosheep

An isometric pixel-art **sheep-herding automation game**. Aliens invaded Earth, mistook sheep
for the dominant species, and exterminated the humans instead. Galactic law now demands that the
sheep be more advanced than the humans were. General Gafoop has been exiled to Earth to make it so.
Instead of conveyor belts, you build fences, gates, races and machines that herd sheep
through a civilisation, from the Stone Age to the Industrial Age.

> **This branch** (`claude/survivors-pivot`) tries a new direction: Autosheep as a
> survivors-like, where the thing you keep alive is a growing flock. The plan, the research and
> the revised backstory are in [`docs/PIVOT-SURVIVORS.md`](docs/PIVOT-SURVIVORS.md); its game is
> the S0 prototype, **Hold the Flock** (below). The automation valley is still here: `?valley`.

**Status:** M2 under way. A 3-minute intro cutscene (the backstory), then two levels: herd 30
sheep into a pen, then build the first herdway, a loop of races through a shearing shed and a
spindle hut that makes yarn on its own. The flock runs behind a model-independent contract with
behaviour tests.
The game design is in [`docs/DESIGN.md`](docs/DESIGN.md).

## Play it

**https://lasseastrup.github.io/Autosheep/**, rebuilt and redeployed by GitHub Actions
(`.github/workflows/pages.yml`) on every push to the main line of work, once the tests pass.
Experiments from other branches are published beside it, each installable as its own app with
its own saves. This branch, the survivors pivot ([`docs/PIVOT-SURVIVORS.md`](docs/PIVOT-SURVIVORS.md)),
is at **https://lasseastrup.github.io/Autosheep/survivors/**; a push to it redeploys the site
(`.github/workflows/pages-redeploy.yml`).

On an iPhone, open it in Safari and choose Share → **Add to Home Screen**: started from the
Home Screen it runs full screen, without Safari's bars (turn the phone sideways). On Android,
Chrome offers to install it.

## Running

```
npm install
npm run dev          # http://127.0.0.1:5173 — click to play the intro (sound on)
npm test             # flock behaviour tests
```

The start screen offers the intro or the game; during the intro `Esc` (or the corner button)
skips straight to the game and `S` toggles subtitles. Development query flags: `?game` opens the game directly, `?t=95` starts
the intro at 95 s, `?nosubs` hides subtitles, `?scale=3` forces the upscale factor, `?valley`
plays the automation valley instead of the survivors run.

**Playing: Hold the Flock (S0, this branch's game).** Earth goes to whoever holds its sheep when
the Bureau reconvenes, in ten minutes, and every claimant in the sector wants them. Gafoop's
stationery fires itself: a rubber stamp to start with. Fly with `WASD` (or the arrow keys, or by
pointing the mouse). Sheep move off as Gafoop comes at them, the faster the more, so you herd
them from behind, as a sheepdog does. He starts with nothing but the stamp. Some of the items he
finds are **usables**, which go on a button, and he carries one at a time: `Space` or a mouse
button, or on a phone the big button on the right, named for it (BUCKET, WHISTLE, BEAM...). The
feed bucket is held, and calls the flock to him while it is; the others are pressed, and then
take a few seconds to be ready again. On a phone a thumb anywhere is a stick.

- Purple Gloops come over the walls. In the first minute they are after Gafoop; after that,
  after sheep. One pins a sheep, three lift it and carry it off over the nearest wall; deport
  the carriers (or hook them with the crook) and the sheep drops back into the flock. A sheep
  is lost only once it is carried four metres past the wall. Saucers mark a sheep with a red
  ring for a couple of seconds, then beam it up: shoot one down and the sheep falls back.
  No more than one sheep in eight can be taken at once.
- A sheep with half a fleece or more cannot be grabbed: the fleece tears off instead, in tufts
  to pick up (the wool cushion). Fed, calm sheep grow wool. Gafoop cannot shear: four Bureau
  shearing booths (red canopies) stand about the meadow, and a woolly sheep inside the dashed
  ring at a booth's mouth is called up onto the board, shorn and let off at the side, one at a
  time. Its wool flies to Gafoop, and wool and the salvage monsters leave fill the requisition
  bar along the top. So a booth is income, at the price of the flock's cushion. When most of
  the flock is woolly an arrow at the screen edge points to the nearest booth.
- Each level-up is a pick of three from 37 items (`1` `2` `3`, or click or tap a card), in three
  kinds with their own slots, shown top right:
  - **Armaments** (five slots) hurt, by themselves: Gafoop's stationery (stamp, stapler,
    shredder, crook, homing paper planes, red tape that slows, a hole punch for the big ones,
    filing cabinets dropped from orbit) and the flock's gear (bell collars, static wool, ram
    horns, ear tags that zap grabbers, fleece that bursts like flak, a clockwork collie that
    circles the flock and bites).
  - **Usables** (one slot) go on the button: the feed bucket (hold it), a dog whistle that calls
    the flock together, the Woof-Woof 3000 (a bark that blows monsters back), a salt lick the
    flock gathers at, inflatable decoy sheep that burst, a portable hurdle that neither sheep
    nor Gloops get through, and Blorp's tractor beam, which beams a sheep being taken (or the
    worst straggler) back to the flock.
  - **Provisions** (five slots) are passive: speed, damage, cooldowns, one more of everything
    fired, wider hits, more composure, a pickup vacuum, more experience, faster booths, a
    shearing drone, thicker or faster wool, calmer sheep, lambs, sheep that kick free, strays
    that join from further.

  Until Gafoop has a usable, one card in three is one. After that another usable comes now and
  then as a swap: take it and the one he has goes, levels and all. Big Gloops drop crates, a
  free pick.
- Stray groups graze around the meadow (arrows at the screen edge): fly near them and they join.
  Gafoop has three pips of composure; touching monsters costs one, and with none he is knocked
  out for four seconds. Lose the last sheep and the claim is dismissed.

`Esc` pauses. The title, pause and results screens hold the S0 test settings, saved in the
browser: the wool cushion, grazing (a hungry sheep grows no wool), and whether level-ups open at
once or wait as supply drops (`E`). `F` shows the frame rate and counts, with a **+100 SHEEP
+150** button for checking a phone at the S0 load (100 sheep, 150 monsters).

**Playing: The Valley.** One persistent valley that saves itself (in the browser) and carries
on where you left it. The Galactic Bureau sends Forms, one at a time, on the clipboard in the
top-left corner; each arrives with a supply drop and is stamped APPROVED when done:

1. **8-A Pen the flock.** A pen arrives. Gafoop is harmless: the sheep ignore him, but they
   follow the feed bucket (hold a mouse button, or FEED). Lead them in and shut the gate (`G`
   near it).
2. **10-B Ten fleeces.** Shears: hold `X` (SHEAR) beside a woolly sheep that is standing still.
3. **12-C Twenty skeins.** Spin fleece by hand (hold `C`, SPIN), or use the shearing shed and
   spindle hut the Bureau drops: fence a paddock either side of them and the flock grazes one
   down, goes through the shed (shorn) to fresh grass, grazes that, and comes back through the
   spindle hut (spun). Wool only grows back on a fed sheep.
4. **27-B Coercive apparatus.** The Woof-Woof 3000: hold `Space` (WOOF) and Gafoop is a dog;
   sheep move away from him, faster the faster he comes. Woof twenty through a gate. Frightened
   sheep grow less wool for a while.
5. **31-A Industry unsupervised.** Twelve skeins with nobody herding; timed and grass gates help.

Grass is eaten and grows back over minutes; a grazed field is visibly short, then bare earth.
`T` runs time at ×2 or ×4, `Q`/`E` rotate the view, the wheel zooms and `WASD` pans.

**Building** (after Form 8-A): `B` opens build mode, `1`–`6` pick a tool (hurdle, gate, trough,
shearing shed, spindle hut, remove; tools arrive with the Forms), a click places it, `R` turns
it (for a gate: which kind, hand, timed or grass, once unlocked). Hurdles and gates are two
clicks, end to end; their ends snap onto the ends of fences nearby. A trough calls the flock
while it has feed; fill it by holding the bucket over it. `O` shows the flow overlay.

**On a phone** (landscape is best), drag to fly; on-screen buttons appear after the first touch:
FEED (hold, while flying with the other thumb), and WOOF, GATE, SHEAR and SPIN when they can be
used, plus turn and zoom. BUILD and FLOW are under the top-right panel; tap to place, drag to
pan. `F` (or tapping the clipboard) shows the frame rate, main-thread time and draw calls,
and under it a RUN PERF TEST button (or `P`): for half a minute the game turns the expensive
parts of a frame off one at a time (shadow pass, outline pass, bloom, palette, HUD, grass,
full-resolution upscale, then all of them, then drawing nothing) and shows the frame rate of
each with the device and GPU, so one screenshot from a slow device says where its time goes.
Beside it are the cheats: SKIP FORM (or `]`) stamps the current Form (press again for the next
one), SOLVE (or `\`) does what the Form asks or builds its reference setup (the paddocks round
the shed and spindle hut; a test checks that it keeps making yarn), and NEW VALLEY starts again.

**If something stalls.** Every slow piece of start-up is a named loading step. Until the menu is
up, a loading panel lists them, so a frozen screen shows the step that froze it (the yellow
line). Behind the menu, the remaining steps (voices, shader compiles, building the game) are
shown in a status line in the bottom-left corner, and if a button has to wait for one, its
LOADING box names it. `L` (or tapping the status line) opens the loading log: every step with
its time, and every frame over 100 ms with the steps that were running during it. Errors, a
WebGL context the browser takes away, and audio that will not start show as a red line in the
same corner (tap it for the log). The same lines go to the browser console, prefixed
`[autosheep]`.

| Command | What it does |
|---|---|
| `npm run build` | Typecheck and build to `dist/` |
| `?game&fresh` | Open straight onto a new valley, forgetting the saved one (dev) |
| `npm run artifact` | One self-contained HTML file (code, fonts and voice inlined) in `out/artifact/` |
| `npm run frames -- <dir> 12.5 40 …` | Render specific intro frames to PNG (`shots` = one per shot) |
| `npm run movie -- --workers 2` | Render the whole intro to `out/movie/autosheep-intro.mp4` (headless Chromium + ffmpeg, resumable) |
| `npm run voice -- <kokoro.onnx> <voices.bin> [ids…]` | Regenerate voice lines with Kokoro TTS (see below) |
| `node tools/game-shot.mjs <dir> start\|herd` | Headless game screenshots; `herd` has a scripted shepherd play the level to the end |
| `node tools/run-shot.mjs <dir> [seconds]` | Headless screenshots of a survivors run (title, cards, then the bot flying Gafoop) |
| `node tools/booth-shot.mjs <dir>` | Headless screenshots of a shearing booth at work, close up, and the pause screen |
| `node tools/items-shot.mjs <dir> [seconds]` | Headless screenshots of the items at work (`ITEMS='{"planes":3,…}'`; `CLOSE=1` for a close one, with `TOUCH=1` for the phone layout and `PRESS=1` to press the usable) and a card deal |
| `HARNESS=1 npx vitest run tests/run-harness.test.ts` | The run harness: whole runs played by a bot, minute by minute (`SEEDS=1,2`, `OPTIONS='{"grazing":false}'`) |

## How it looks the way it looks

Scenes are ordinary three.js 3D, rendered at 480×270 (the film) or 640×360 (the game) and turned into pixel art in
`src/engine/pixelRenderer.ts`:

1. stepped toon lighting with hue-shifted shadow and highlight bands (`src/engine/toon.ts`);
2. a normal+depth pass for 1 px outlines (darkened colour) and crease highlights;
3. snapping to the **Resurrect 64** palette in OKLab, with world-anchored 4×4 Bayer dithering
   that only applies between neighbouring colours and never on toon surfaces;
4. integer nearest-neighbour upscale with sub-pixel camera offsets, plus a 2D overlay layer for
   pixel-font text and UI drawn with thresholded bitmap fonts.

Background research is in [`docs/research/pixel-art-rendering.md`](docs/research/pixel-art-rendering.md).

All models are built from primitives in code (`src/art/`). All music and sound effects are
synthesised in WebAudio (`src/audio/`); the same engine renders offline for the movie export.
The voices come from [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) TTS with per-character
ffmpeg processing (`tools/voice/generate.py`). The rendered clips live in `assets/voice/`.

## Layout

```
src/engine/      pixel renderer, toon materials, palettes, bitmap fonts, UI helpers, sprites, RNG
src/art/         sheep, Gafoop & Blorp, humans, ships, Earth, props, particles
src/audio/       WebAudio engine, synthesised SFX, tracker-style music + score
src/intro/       the cutscene: lines.json (script), timeline.ts (edit list), player.ts, sets/
src/sim/         the flock contract, behaviour scenarios, and models/ behind it
src/game/        the game: camera, level, flock view, Gafoop, HUD, audio
src/run/         the survivors run (S0): simulation, monsters, items, bot; view, HUD, input, audio
tests/           flock contract tests (vitest), run against every model
tools/           frame grabs, movie render, artifact build, voice generation, dev test pages
docs/            DESIGN.md (game design), research/ (rendering, flock-sim analysis)
assets/voice/    generated voice lines (mp3)
```

## The flock

The game never touches flock internals. `src/sim/contract.ts` is the whole interface: the game
passes stimuli (threats, lures, startles, race flows, handling chutes) and fence segments
(some of them one-way flaps) in and reads position, heading, speed, state, fear and group out.

- `models/sheepherding-v1` is our flock model. It started as the
  [sheepherding](https://github.com/lasseastrup/sheepherding) sim (commit a470408) and is changed
  freely to serve the game: several stimuli at once, lures, startles, fences (ray-cast steering
  and side-preserving collision), one-way flaps, races that draw their sheep along, and chutes
  in which sheep are handled. Groups are fence-aware, so a sheep fenced off from its flock stops
  pining for it, and the flock is retuned to be less magnetic. Changes are marked "Autosheep".
- `models/boids` is a deliberately simple second model that keeps the contract honest.

`tests/flock-contract.test.ts` holds the behaviour guarantees from DESIGN.md §4.1 (flee, follow,
containment, startle, determinism, penning through a gate, habituation, walls blocking sight,
working a fenced-off straggler, and pressure not crushing the flock).
See also [`docs/research/sheepherding-repo-analysis.md`](docs/research/sheepherding-repo-analysis.md).

## Credits

Palette: Resurrect 64 by Kerrie Lake. Fonts (SIL OFL): Pixelify Sans, Jersey 10, Silkscreen,
Tiny5 and Press Start 2P, via @fontsource. Voices: Kokoro-82M (Apache 2.0).
