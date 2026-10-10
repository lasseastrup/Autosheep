# Autosheep

An isometric pixel-art **sheep-herding automation game**. Aliens invaded Earth, mistook sheep
for the dominant species, and exterminated the humans instead. Galactic law now demands that the
sheep be more advanced than the humans were. General Gafoop has been exiled to Earth to make it so.
Instead of conveyor belts, you build fences, gates, races and machines that herd sheep
through a civilisation, from the Stone Age to the Industrial Age.

**Status:** M2 under way. A 3-minute intro cutscene (the backstory), then two levels: herd 30
sheep into a pen, then build the first herdway, a loop of races through a shearing shed and a
spindle hut that makes yarn on its own. The flock runs behind a model-independent contract with
behaviour tests.
The game design is in [`docs/DESIGN.md`](docs/DESIGN.md).

## Play it

**https://lasseastrup.github.io/Autosheep/**, rebuilt and redeployed by GitHub Actions
(`.github/workflows/pages.yml`) on every push to the main line of work, once the tests pass.

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
the intro at 95 s, `?nosubs` hides subtitles, `?scale=3` forces the upscale factor.

**Playing.** Gafoop hovers after the mouse, and sheep keep away from him by proximity alone:
come in slowly to walk them, fast to make them run. Hold a mouse button to rattle a feed bucket
(sheep follow it and forgive him being close), `Space` honks the megaphone (everything nearby
bolts), `G` opens and shuts the pen gate, `Q`/`E` rotate the view, the wheel zooms and `WASD`
pans. Pen all 30 sheep and shut the gate to pass the audit. Sheep moved too hard jam in the
gateway; ease off, or bring the bucket.

**Building** (level 2, "Form 12-C"): `B` opens build mode, `1`–`9` pick a tool (race, flap, rack,
salt lick, chimes, shearing shed, spindle hut, hurdle, remove), a click places it, `R` turns
it. Races are drawn point by point and join up when they end on a station door, a pasture gap
or another race (`Enter` or right-click also finishes one, `Esc` cancels). Sheep walk a race the
way it was drawn; a flap lets them through one way only. `O` shows the flow overlay (which way
sheep have been moving, and what each station is doing), `T` runs time at ×2 or ×4. On a
phone, BUILD and FLOW are under the top-right panel; tap to place, drag to pan.

**On a phone** (landscape is best), drag to fly; on-screen buttons appear after the first touch:
FEED (hold, while flying with the other thumb), HONK, GATE, and turn and zoom. The gate and honk
rows of the top-right panel and the buttons on the verdict card can also be clicked with a mouse.
`F` (or clicking the objective panel) shows the frame rate, main-thread time and draw calls,
and under it a RUN PERF TEST button (or `P`): for half a minute the game turns the expensive
parts of a frame off one at a time (shadow pass, outline pass, bloom, palette, HUD, grass,
full-resolution upscale, then all of them, then drawing nothing) and shows the frame rate of
each with the device and GPU, so one screenshot from a slow device says where its time goes.

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
| `?game&level=2` | Open straight onto level 2 (dev) |
| `npm run artifact` | One self-contained HTML file (code, fonts and voice inlined) in `out/artifact/` |
| `npm run frames -- <dir> 12.5 40 …` | Render specific intro frames to PNG (`shots` = one per shot) |
| `npm run movie -- --workers 2` | Render the whole intro to `out/movie/autosheep-intro.mp4` (headless Chromium + ffmpeg, resumable) |
| `npm run voice -- <kokoro.onnx> <voices.bin> [ids…]` | Regenerate voice lines with Kokoro TTS (see below) |
| `node tools/game-shot.mjs <dir> start\|herd` | Headless game screenshots; `herd` has a scripted shepherd play the level to the end |

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
