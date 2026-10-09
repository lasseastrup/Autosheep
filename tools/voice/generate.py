"""Generate the intro's voice cast with Kokoro TTS + ffmpeg character FX.

Usage: python tools/voice/generate.py <kokoro.onnx> <voices.bin> [line ids...]
Writes assets/voice/<ID>.mp3 and src/intro/voice-manifest.json (duration + 60 Hz loudness
envelope per line, used for subtitles timing and lip flaps).
"""
import json, os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LINES = json.load(open(os.path.join(ROOT, "src/intro/lines.json")))
OUT = os.path.join(ROOT, "assets/voice")
MANIFEST = os.path.join(ROOT, "src/intro/voice-manifest.json")

# voice, speed, lang, ffmpeg filter chain applied to the 24 kHz mono render
CAST = {
    # Dry British narrator, a touch slower, warm low-end.
    "narrator": ("bm_george", 0.94, "en-gb",
                 "highpass=f=70,equalizer=f=180:t=q:w=1:g=2,acompressor=threshold=-20dB:ratio=3:attack=5:release=80"),
    # Pompous general heard through a universal translator: a hair lower, doubled.
    "gafoop": ("am_michael", 1.0, "en-us",
               "rubberband=pitch=0.93:formant=preserved,chorus=0.6:0.8:40|55:0.35|0.3:0.25|0.4:2|1.5,acompressor=threshold=-18dB:ratio=3"),
    "gafoop_radio": ("am_michael", 1.03, "en-us",
                     "rubberband=pitch=0.93:formant=preserved,highpass=f=350,lowpass=f=3200,acrusher=bits=10:mix=0.4,volume=1.6,acompressor=threshold=-20dB:ratio=6"),
    # Long-suffering lieutenant: higher and quicker.
    "blorp": ("am_puck", 1.06, "en-us", "rubberband=pitch=1.22:formant=shifted,acompressor=threshold=-18dB:ratio=3"),
    # Ship computer: posh, ring-modulated a little.
    "computer": ("bf_emma", 1.0, "en-gb", None),
    # The Grand Auditor: enormous and echoing.
    "auditor": ("af_heart", 0.92, "en-us",
                "rubberband=pitch=0.72:formant=shifted,equalizer=f=120:t=q:w=1:g=5,aecho=0.8:0.6:60|130|210:0.35|0.22|0.12,acompressor=threshold=-16dB:ratio=4"),
}

PRONOUNCE = {"ɡˈafuːp": "ɡəfˈuːp", "ɡˈæfuːp": "ɡəfˈuːp"}


def phonemes(k, text, lang):
    ph = k.tokenizer.phonemize(text, lang)
    for a, b in PRONOUNCE.items():
        ph = ph.replace(a, b)
    return ph


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def main():
    k = Kokoro(sys.argv[1], sys.argv[2])
    ids = sys.argv[3:] or list(LINES)
    os.makedirs(OUT, exist_ok=True)
    manifest = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    with tempfile.TemporaryDirectory() as tmp:
        for lid in ids:
            line = LINES[lid]
            voice, speed, lang, fx = CAST[line["who"]]
            samples, sr = k.create(phonemes(k, line["text"], lang), voice=voice, speed=speed, lang=lang, is_phonemes=True)
            raw = os.path.join(tmp, f"{lid}_raw.wav")
            sf.write(raw, samples, sr)
            proc = os.path.join(tmp, f"{lid}.wav")
            if line["who"] == "computer":
                # dry + ring-modulated copy at 55 Hz, then gentle crush
                run(["ffmpeg", "-y", "-i", raw, "-f", "lavfi", "-i", f"sine=f=55:r={sr}",
                     "-filter_complex",
                     "[0:a]asplit[a][b];[1:a]volume=1[s];[b][s]amultiply[rm];[a][rm]amix=inputs=2:weights=0.75 0.5:duration=first,"
                     "highpass=f=120,acrusher=bits=12:mix=0.3,aecho=0.6:0.4:18:0.25,acompressor=threshold=-18dB:ratio=3",
                     "-ar", "48000", "-ac", "1", proc])
            else:
                run(["ffmpeg", "-y", "-i", raw, "-af", fx, "-ar", "48000", "-ac", "1", proc])
            # loudness-normalise every line to the same level, add 40 ms of air at the end
            final_wav = os.path.join(tmp, f"{lid}_n.wav")
            run(["ffmpeg", "-y", "-i", proc, "-af", "loudnorm=I=-17:TP=-1.5:LRA=11,apad=pad_dur=0.04", "-ar", "48000", final_wav])
            run(["ffmpeg", "-y", "-i", final_wav, "-codec:a", "libmp3lame", "-b:a", "96k", os.path.join(OUT, f"{lid}.mp3")])
            data, rate = sf.read(final_wav)
            hop = rate // 60
            env = [float(np.sqrt(np.mean(data[i:i + hop] ** 2))) for i in range(0, len(data), hop)]
            peak = max(env) or 1.0
            manifest[lid] = {
                "duration": round(len(data) / rate, 3),
                "env": "".join(chr(48 + min(74, int(74 * (e / peak) ** 0.7))) for e in env),
            }
            print(lid, line["who"], f"{len(data) / rate:.2f}s")
    json.dump(dict(sorted(manifest.items())), open(MANIFEST, "w"), indent=1)


if __name__ == "__main__":
    main()
