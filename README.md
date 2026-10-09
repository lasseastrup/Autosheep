# Autosheep

An isometric pixel-art **sheep-herding automation game**. Aliens invaded Earth, mistook sheep
for the dominant species, and exterminated the humans instead. Galactic law now demands that the
sheep be more advanced than the humans were. General Gafoop has been exiled to Earth to make it so.
Instead of conveyor belts, you build fences, gates, races, dogs and machines that herd sheep
through a civilisation, from the Stone Age to the Industrial Age.

**Status:** M0. The pixel-art render pipeline, audio engine, voice pipeline and a 3½-minute intro
cutscene are done. The game design is in [`docs/DESIGN.md`](docs/DESIGN.md).

## Running

```
npm install
npm run dev          # http://127.0.0.1:5173 — click to play the intro (sound on)
```

In the intro: `Esc` skips to the title, `S` toggles subtitles. Development query flags:
`?t=95` starts at 95 s, `?nosubs` hides subtitles, `?scale=3` forces the upscale factor.

| Command | What it does |
|---|---|
| `npm run build` | Typecheck and build to `dist/` |
| `npm run artifact` | One self-contained HTML file (code, fonts and voice inlined) in `out/artifact/` |
| `npm run frames -- <dir> 12.5 40 …` | Render specific intro frames to PNG (`shots` = one per shot) |
| `npm run movie -- --workers 2` | Render the whole intro to `out/movie/autosheep-intro.mp4` (headless Chromium + ffmpeg, resumable) |
| `npm run voice -- <kokoro.onnx> <voices.bin> [ids…]` | Regenerate voice lines with Kokoro TTS (see below) |

## How it looks the way it looks

Scenes are ordinary three.js 3D, rendered at 480×270 and turned into pixel art in
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
tools/           frame grabs, movie render, artifact build, voice generation, dev test pages
docs/            DESIGN.md (game design), research/ (rendering, flock-sim analysis)
assets/voice/    generated voice lines (mp3)
```

The flock simulation the game will build on lives in the `sheepherding` repo; see
[`docs/research/sheepherding-repo-analysis.md`](docs/research/sheepherding-repo-analysis.md).

## Credits

Palette: Resurrect 64 by Kerrie Lake. Fonts (SIL OFL): Pixelify Sans, Jersey 10, Silkscreen,
Tiny5 and Press Start 2P, via @fontsource. Voices: Kokoro-82M (Apache 2.0).
