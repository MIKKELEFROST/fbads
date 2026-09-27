# CLAUDE — Motion Reel 2026

A 15-second, 1920×1080, 60 fps motion-design showreel, built entirely in code: every frame is a
pure function of time, rendered offline by a small custom engine (Canvas2D + WebGL) and scored with
a fully synthesized soundtrack locked to the same 128 BPM grid.

- `DIRECTION.md`: creative direction, scene contracts, and the engine API
- `lib/`: timeline (tempo, scenes, hit points, palette), core toolkit (easing, springs, keyframes,
  noise, glyph outlines, shape morphing, 3D), and the engine (compositor, motion blur, shaders, post)
- `scenes/`: one file per scene (`s1`–`s7`) plus the HUD overlay
- `audio/synth.py`: procedural soundtrack → `audio/reel.wav`
- `tools/render.mjs`: headless renderer (contact sheets, stills, perf check, final video)

## Render

```bash
pip install imageio-ffmpeg numpy          # ffmpeg binary + audio deps
python3 audio/synth.py                    # → audio/reel.wav
node tools/render.mjs video --samples 4 --workers 3 --audio audio/reel.wav --out out/reel.mp4
```

Open `index.html` through any static server for an interactive preview (space: play/pause,
arrow keys: step a frame, shift+arrow: step a beat).
