# CLAUDE — Motion Reel 2026 · Creative Direction & Engine Guide

A 15.000-second, 1920×1080, 60 fps motion-design showreel. It is a résumé piece: every second must
show craft — impeccable easing, overlapping action, typographic taste, rhythm, and seamless transitions.
Think Buck, ManvsMachine, Ordinary Folk, Tendril. Not a "tech demo": a *designed* piece.

**Concept — "Everything starts with a dot."** A single bone-white dot is the protagonist. It bounces
in, detonates into type, becomes a shape, a galaxy, a droplet, a universe of panels, and finally lands
as the period in the logotype `CLAUDE.` Every scene hands off to the next through the dot or a
full-frame colour (the *contracts* below), so the reel plays as one continuous camera move.

---

## 1. Tempo & structure

128 BPM → 1 beat = **0.46875 s**, 1 bar = **1.875 s**, 8 bars = 15.000 s. Every scene boundary sits on
a beat. The soundtrack is synthesized to the same grid, so **land major visual events exactly on the
beat times** (use `R.beat(n)` / the `R.HITS` list in `lib/timeline.js`). Put **anticipation** in the
60–120 ms before a hit and **follow-through** after it.

| id | name | global window | local beats (lt) |
|----|------|---------------|------------------|
| s1 | IGNITION | 0.000 – 1.875 | 0, .469, .9375, 1.406 |
| s2 | KINETIC TYPE | 1.875 – 4.6875 | 0, .469, .9375, 1.406, 1.875, 2.344 |
| s3 | SHAPE LANGUAGE | 4.6875 – 7.500 | 0, .469, .9375, 1.406, 1.875, 2.344 |
| s4 | DEPTH | 7.500 – 9.375 | 0, .469, .9375, 1.406 |
| s5 | LIQUID | 9.375 – 11.250 | 0, .469, .9375, 1.406 |
| s6 | MULTIVERSE | 11.250 – 13.125 | 0, .469, .9375, 1.406 |
| s7 | LOCKUP | 13.125 – 15.000 | 0, .469, .9375, 1.406 (sting) |

## 2. Handoff contracts (non-negotiable)

The last frame of scene N and the contract state must match exactly, so the cut is invisible.
Scene N should arrive at its contract state **no more than 1–2 frames early** (long frozen holds kill
the momentum). **Every boundary sits on a hit, so scene N+1's first rendered frame must already show
the impact** (burst, pop, crack, splash starting). The contract describes the instant of the cut, not
a frame to hold. Several boundaries fall between frames (4.6875 = f281.25, 9.375 = f562.5): the first
rendered frame is then f282 / f563.

| boundary | state at the cut |
|---|---|
| start 0.000 | solid `P.ink` |
| s1→s2 @ 1.875 | `P.ink` bg + **bone dot r=28 at (960,540)**, perfectly round |
| s2→s3 @ 4.6875 | **solid `P.ink`** (s2 has zoomed through the counter of the "O" in FLOW) |
| s3→s4 @ 7.500 | `P.ink` bg + **bone dot r=6 at (960,540)** |
| s4→s5 @ 9.375 | `P.ink` bg + **signal dot r=14 at (960,540)** |
| s5→s6 @ 11.25 | **solid `P.bone`** (the liquid has flooded the frame) |
| s6→s7 @ 13.125 | `P.ink` bg + **bone dot r=28 at (960,540)** (bookends the intro) |
| end 15.000 | final lockup fully legible — no fade to black |

## 3. Style rules

- **Palette** (`R.P`): ink `#0B0B0E`, ink2 `#16161C`, bone `#F2EDE4`, bone2 `#D9D2C5`, signal `#FF4F1A`
  (hero accent), ultra `#3326FF`, lime `#D4FF3A` (rare pop only — a few pixels, never a background),
  gray `#8A857C`. No other hues. Gradients only between palette colours.
- **Type**: `Unbounded` (display, variable 200–900) · `Inter Tight` (grotesk, variable 100–900, has italic)
  · `Instrument Serif` (italic for elegant contrast words) · `JetBrains Mono` (small UI labels:
  UPPERCASE, 14–20 px, letter-spacing 2–4 px). Big type should be BIG and confident, tight tracking.
- **Motion**: no linear movement, ever (except constant rotation/drift). Primary moves use
  `R.ease.snap`, `expoOut`, `R.ease.whip` or springs. Stagger multi-element moves 15–60 ms. Overshoot and
  settle. Nothing is ever perfectly static — holds get a slow drift (scale 1→1.03, a few px).
- **Readability**: after a word/element lands, give it ≥150 ms of readable rest before it leaves.
- **Composition**: 96 px margins. The HUD lives in the four corners (small mono text ~40–70 px from the
  edges) — keep hero content out of those corner zones.
- **Motion blur** is applied globally in the final render (4 sub-frames, 180° shutter). Four point
  samples strobe into hard copies on very fast movers, so a scene should either raise the sample count
  locally with `samplesAt(lt) → n` in its `R.scene({...})` definition (e.g. 16 during a whip), or
  box-filter the mover itself across `api.subDt`, as s1 and s7 do. Always review fast moves on
  `--samples 4` stills.
- **Post**: grain 0.03, vignette 0.22 (set `api.post.vignette = 0.05` on flat colour fields so they stay
  flat), optional `api.post.bloom` (a smooth blurred glow). The HUD is drawn after the post pass.
- **Camera shake + chromatic aberration** fire automatically on `R.HITS`. Set `shake: 0.5` (etc.) in
  your `R.scene({...})` to scale it for your scene.

## 4. Engine API (read `lib/core.js` and `lib/engine.js` for details)

Scene file = `scenes/sN.js`:

```js
R.scene({
  id: 's3',
  shake: 1,                      // optional multiplier for global hit shake
  render(ctx, lt, api) { ... },  // lt = local seconds since scene start; api.t = global seconds
});
```

The engine fills the frame with `P.ink` before calling you, wraps you in save/restore, and resets
state afterwards. Draw in 1920×1080 pixel space.

`api`: `t, lt, dur, start, end, W, H, P, detail` (1 normally; <1 when drawn small inside a multiverse
panel — thin out particle counts with it), `layer(name, w?, h?)` → cleared offscreen `{canvas, ctx}`,
`shader(fragSrc, uniforms, {scale})` → canvas you `drawImage`, `post` → set `api.post.glitch / .ca /
.flash / .bloom / .grain / .vignette` for this frame.

Toolkit highlights (`window.R`):
- Timing: `R.seg(t,a,b)` (clamped progress), `R.keys(t, [[t0,v0],[t1,v1,'expoOut'],...])` (AE-style
  keyframes, numbers or arrays), `R.stagger(i,n,spread,{from:'center'})`, `R.beat(n)`, `R.BEAT`.
- Easing: `R.ease.*` (quad…quint, sine, expo, circ, back, elastic, bounce In/Out/InOut; `bezier(x1,y1,x2,y2)`;
  house curves `snap`, `swift`, `whip`, `soft`), springs `R.spring(t,{k,c})`, `R.spring.bouncy/snappy/gentle/wobbly(t)`
  (t = seconds since release, returns 0→1 with overshoot).
- Math/noise: `R.math.{clamp,lerp,remap,smoothstep}`, `R.noise2/noise3/fbm2`, `R.rng(seed)` (seeded PRNG —
  create it at module scope to precompute static data, or re-create inside render with a fixed seed),
  `R.hash(n)`. **Never use Math.random() or Date** — frames must be deterministic and renderable out of order.
- Colour: `R.col.rgba(hex,a)`, `R.col.mix(h1,h2,t,a)`, `R.col.vec(hex)` (for shader uniforms).
- Type: `R.font(ctx,{family,weight,size,style,spacing,align})`, `R.layoutText(ctx,str)`,
  `R.drawGlyphs(ctx,str,x,y,(i,g,n)=>({dx,dy,sx,sy,rot,alpha,fill}),{align})` for per-letter animation.
  Variable weight is animatable: `R.font(ctx,{family:'Inter Tight', weight: 137})`.
- Vector glyph outlines: `R.glyph.outline(key, text, size, {spacing, tol})` with keys `unbounded900,
  unbounded700, unbounded300, inter900, inter600, serifItalic, mono500` → `{letters:[{ch,x,advance,contours,path}], width, ascender, path}`
  (origin = left baseline). Use for trim-path stroke draws, particles-from-type, morphs, O-counter centres.
- Shapes: `R.shape.circle/poly/star/rect`, `resample(pts,n)`, `lerp(A,B,t)` (morphing), `path(ctx,pts)`,
  `trim(ctx,pts,start,end,close)` (AE Trim Paths).
- 3D: `R.v3.rotX/rotY/rotZ`, `R.v3.project(p,{f,camZ,cx,cy})` → `[sx,sy,scale,depth]`.
- Shaders: `api.shader(src, uniforms, {scale:0.5})`. `src` is appended to a header that already declares
  `vUv, fragColor, uRes, uTime`, `hash11/hash21/hash22, vnoise, snoise(vec3), fbm(vec3), smin, rot2`.
  Canvas uniforms become `sampler2D` (e.g. render text into `api.layer()` and refract it). Output
  premultiplied alpha (or opaque).
- `R.renderScene(id, globalT, ctx, x, y, w, h)` renders any scene into a viewport (used by s6). The
  viewport is pre-filled with ink, errors are caught and logged, and the nested scene gets a private
  `api.post` copy, so it can't change the host frame's post-processing.
- Camera shake is sampled once per output frame. `R.unshake(ctx, api, w)` at the top of `render()`
  cancels it (weight `w`), which is how handoff-contract frames stay pixel-exact on a hit.
- `api.frameT` (output-frame time), `api.samples` and `api.subDt` (seconds between motion-blur
  sub-samples; 0 when samples = 1) let a scene box-filter very fast movers itself.
- `tools/render.mjs check` forces a GPU sync per frame, so its ms/frame is the real raster cost.

## 5. Tools & review loop

```
node tools/render.mjs contact --from 4.6875 --to 7.5 --step 0.1 --out <scratch>/sheet.png [--cols 6 --cell 480]
node tools/render.mjs contact --times 4.70,4.75,4.80 --cell 960 --cols 3 --out <scratch>/detail.png
node tools/render.mjs stills  --times 5.2,6.1 --outdir <scratch>/stills        # full-res PNGs
node tools/render.mjs check   --from 4.6875 --to 7.5 --step 0.05               # JS errors + ms/frame
```

Contact-sheet labels show global time, frame number, beat number and local scene time. **Look at your
frames** (Read the PNG) — judge them like an art director. Write scratch files to your scratchpad or
`/tmp`, never inside the repo. Do not render full videos during development (CPU is shared by the
whole team); contact sheets and stills only.

Performance budget: `check` should average **< 120 ms/frame** for your window (the final render uses
4 motion-blur sub-frames). Shaders: render at `scale: 0.5`–`0.75` unless crispness demands more.
