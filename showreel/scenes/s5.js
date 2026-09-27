// ─────────────────────────────────────────────────────────────────────────────────────────────
//  s5 · LIQUID                                         global 9.375 – 11.250  ·  lt = t − 9.375
//
//  The shader showpiece. One GLSL pass renders a glossy metaball body that refracts the type
//  behind it. The canvas paints only the crisp word (from cached glyph sprites); the same word is
//  drawn into a layer that the shader samples as a texture.
//
//    0.000  SPLASH    the signal dot r=14 (contract) is hit on the downbeat: the core pops on a
//                     spring, spray flicks off and six satellites bud out onto Lissajous orbits
//                     (smin-merged, gooey necks). f563 (lt .0083) is already mid-splash.
//    0.17   WORD      "fluid" rises letter by letter out of a mask line, behind the liquid
//    0.469  SPLIT     crouch → fling: the satellites tear away, necks snap (smin k drops) and
//                     five children pinch off their parents
//    0.66   PULL      everything is sucked back (expoIn, stretching toward the centre) and
//                     slams together on the beat
//    0.9375 WOBBLE    collision: mass arrives in the core, jelly modes n = 2, 3, 4 ring out and
//                     three ripple rings travel across the frame, bending the word outside too
//    1.406  INFLATE   squeeze (anticipation) → the body inflates on a spring
//    1.455  FLOOD     a raised bone puddle wells up from the heart of the body and races out,
//                     shoving the coloured liquid ahead as a ribbon; it swallows the word and
//                     calms from glossy to flat. The last corner is swept on f673.
//    1.852+ CONTRACT  solid P.bone (flat fill, vignette 0.05) — f674 only; s6 cracks on f675
//
//  Shading — colour language is signal, bone and ink (every colour is a mix of those; ultra
//  only as a ≤ 12 % glint in the film band):
//    SDF (smin of velocity-stretched circles — squash & stretch — in a space radially wobbled by
//    angular modes; value + analytic gradient in one pass) → meniscus height profile (a dome of
//    thickness T at the rim, flat pool inside) → normal from the SDF gradient + slow surface swell
//    + ripple rings. Signal body deepening toward ink with depth; a warm film band (signal ↔
//    peach) in the rim zone; studio reflections (key softbox + strip light) weighted by Fresnel,
//    warm floor bounce, Blinn spec, and a crisp 1.5 px ink contour. The word is refracted along
//    the normal as warm peach, with a deep/lit edge pair instead of spectral fringes.
//    Outside: caustic glow, contact shadow, ripple rings that displace the backdrop.
//
//  Full-frame shader at 1:1 (crisp against the canvas type); panels in s6 keep the old 0.625.
//  Cost: SwiftShader runs every branch masked, so a pixel pays for the whole program — hence two
//  program variants (with / without the flood) and loops that break at the last live blob/ring.
//  Fast movers: local sample boosts (samplesAt), edges pre-blurred by their own travel per blur
//  sub-frame, the ink contour fading on fast edges, and a box-filtered letter rise.
//
//  Pure function of lt. Static data precomputed at module scope with R.rng.
// ─────────────────────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  const { clamp, lerp, smoothstep, TAU } = R.math;
  const E = R.ease;
  const P = R.P;
  const seg = R.seg;
  const W = R.W, H = R.H, CX = W / 2, CY = H / 2;
  const BEAT = R.BEAT;
  const B1 = BEAT, B2 = BEAT * 2, B3 = BEAT * 3, END = BEAT * 4; // .46875 .9375 1.40625 1.875

  // ═════════════════════════════ timing (local seconds) ═════════════════════════════
  const T_SEED = 0;      // the splash starts on the downbeat itself
  const T_WORD = 0.17;   // first letter leaves the mask line
  const T_PULL = 0.66;   // split droplets start being pulled home (expoIn: they slam in on B2)
  const T_F0 = 1.455;    // bone wells up in the heart of the body
  const T_BONE = 1.852;  // flat P.bone from here: f674 (lt 1.8583). f673's last blur sub-frame
                         // (lt ≤ 1.8494) still has the front sweeping the last corner.
  const DOT_R = 14;
  const SCALE = 1;           // full frame: shader at 1:1
  const SCALE_PANEL = 0.625; // inside s6's panels (keeps s6's target sizes and cost unchanged)
  const GR = 200;            // glow reach, px: the bounding-box margin

  // ═════════════════════════════ type ═════════════════════════════
  const WORD = 'fluid', WORD_SIZE = 420, WORD_TRACK = -6;
  const WORD_FONT = { family: 'Instrument Serif', weight: 400, size: WORD_SIZE, style: 'italic', spacing: WORD_TRACK, align: 'left' };
  const WORD_EASE = E.bezier(0.16, 1, 0.3, 1);
  const OVERSAMPLE = 1.04; // sprites are drawn at ≤ 1:1 even at the end of the drift

  // ═════════════════════════════ blob rig ═════════════════════════════
  // Slots: 0 core · 1–6 satellites · 7–11 spray (splash) → children (split). 12 × (x, y, r, k).
  const rng = R.rng(0x51d5);
  const T_REF = 0.3; // satellites are phased so that at T_REF they fan evenly around the core
  const SAT = Array.from({ length: 6 }, (_, i) => {
    const th = -Math.PI / 2 + ((i + 0.5) / 6) * TAU + (rng() - 0.5) * 0.4;
    const Ax = 205 + rng() * 45, Ay = 132 + rng() * 30;
    const wx = 1.1 + rng() * 0.8, wy = 1.25 + rng() * 0.8;
    const cx = 0.9 * Math.cos(th), cy = 0.9 * Math.sin(th);
    const px = (rng() < 0.5 ? Math.asin(cx) : Math.PI - Math.asin(cx)) - wx * T_REF;
    const py = (rng() < 0.5 ? Math.asin(cy) : Math.PI - Math.asin(cy)) - wy * T_REF;
    return { Ax, Ay, wx, wy, px, py, r: 58 + rng() * 34, dl: rng() * 0.045, fling: 2.05 + rng() * 0.45 };
  });
  const SPRAY = Array.from({ length: 5 }, (_, j) => {
    const a = -Math.PI / 2 + (j / 5) * TAU + (rng() - 0.5) * 0.7;
    return { c: Math.cos(a), s: Math.sin(a), D: 165 + rng() * 120, r: 8 + rng() * 7 };
  });
  const CHILD = Array.from({ length: 5 }, (_, j) => ({ parent: j, D: 95 + rng() * 70, r: 26 + rng() * 16, tw: (rng() - 0.5) * 0.9 }));

  // Satellite spread from the core: 0 = inside the core, 1 = orbit, > 1 = split apart.
  const EMERGE = { k: 170, c: 13 };
  function spread(t, s) {
    if (t < T_SEED) return 0;
    const crouch = 1 - 0.3 * E.sineInOut(seg(t, 0.35, B1 - 0.008)); // anticipation into the split
    if (t < B1) return R.spring(t - T_SEED - s.dl, EMERGE) * crouch;
    if (t < B2) {
      const g = R.spring(B1 - T_SEED - s.dl, EMERGE) * 0.7;
      const fling = lerp(g, s.fling, E.expoOut(seg(t, B1, B1 + 0.34 + s.dl)));
      return fling * (1 - E.expoIn(seg(t, T_PULL + s.dl, B2))); // slams home exactly on B2
    }
    // after the collision the satellites resurface as lumps; the inflate pushes them out
    return 0.8 * R.spring(t - B2 - 0.02, { k: 140, c: 11 }) + 0.25 * E.expoOut(seg(t, B3, B3 + 0.3));
  }
  function satR(t, s) {
    if (t < T_SEED) return 0;
    const grow = R.spring(t - T_SEED - s.dl - 0.012, { k: 200, c: 16 });
    return s.r * clamp(grow, 0, 2) * lerp(1, 0.9, E.expoOut(seg(t, B2, B2 + 0.2)));
  }
  function coreR(t) {
    if (t <= T_SEED) return DOT_R;
    // the hit pops the dot: launched with velocity, so the first frame already reads as impact
    let r = DOT_R + (150 - DOT_R) * R.spring(t - T_SEED, { k: 230, c: 15, v0: 10 });
    r -= 26 * E.expoOut(seg(t, B1, B1 + 0.25)); // material leaves with the split …
    r += 72 * E.expoIn(seg(t, T_PULL, B2));         // … swells in lock-step with the pull (the
                                                    //   silhouette never collapses) …
    r += 28 * R.spring(t - B2, { k: 300, c: 12 });  // … and splats with the collision
    return r;
  }
  // smin radius for the satellites: gooey → crisp for the split (necks snap) → gooey again.
  const SAT_K = [[0, 58], [B1 + 0.04, 58], [B1 + 0.2, 18, 'quadOut'], [T_PULL, 18], [B2 - 0.03, 60, 'quadIn'], [B2 + 0.2, 80, 'soft']];

  function blobUniforms(t) {
    const B = new Array(48).fill(0);
    const rot = 0.32 * t + 0.4 * E.expoOut(seg(t, B1, B1 + 0.6)) - 0.3 * E.expoOut(seg(t, B2, B2 + 0.5));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const put = (i, x, y, r, k) => {
      B[i * 4] = x * cr - y * sr;
      B[i * 4 + 1] = x * sr + y * cr;
      B[i * 4 + 2] = r;
      B[i * 4 + 3] = k;
    };
    const drift = t <= T_SEED ? 0 : 1;
    put(0, drift * 16 * Math.sin(1.3 * t), drift * 11 * Math.sin(1.7 * t + 1), coreR(t), 1);
    const kS = R.keys(t, SAT_K);
    const pos = SAT.map((s, i) => {
      const S = spread(t, s);
      const x = S * s.Ax * Math.sin(s.wx * t + s.px), y = S * s.Ay * Math.sin(s.wy * t + s.py);
      put(1 + i, x, y, satR(t, s), kS);
      return [x, y];
    });
    for (let j = 0; j < 5; j++) {
      if (t < B1) {
        // splash spray: flicked off the dot's rim on the hit (a fast kick + a long glide),
        // evaporating as it decelerates
        const sp = SPRAY[j];
        const u = seg(t, T_SEED, T_SEED + 0.08), v = seg(t, T_SEED, T_SEED + 0.55);
        const dist = DOT_R * 0.8 + sp.D * (0.35 * E.expoOut(u) + 0.65 * E.expoOut(v));
        const r = t <= T_SEED ? 0 : sp.r * (0.6 + 0.4 * E.expoOut(seg(t, T_SEED, T_SEED + 0.04))) * (1 - E.quadIn(seg(t, 0.1, 0.4)));
        put(7 + j, sp.c * dist, sp.s * dist, r, 10);
      } else {
        // split children: pinch off their parent, drift, and get pulled home with it
        const c = CHILD[j], [px, py] = pos[c.parent];
        const a = Math.atan2(py, px) + c.tw;
        const home = 1 - E.expoIn(seg(t, T_PULL, B2));
        const sep = c.D * E.expoOut(seg(t, B1 + 0.01, B1 + 0.42)) * home;
        const r = t >= B2 ? 0 : c.r * E.expoOut(seg(t, B1, B1 + 0.06)) * (0.25 + 0.75 * home);
        put(7 + j, px + Math.cos(a) * sep, py + Math.sin(a) * sep, r, 16);
      }
    }
    return B;
  }

  // Squash & stretch: every blob elongates along its velocity (and thins across it), so flung and
  // slammed droplets read as liquid rather than marbles. (dir.x, dir.y, stretch) per blob.
  // Also returns each blob's edge speed (centre speed + radius growth, px/s): the ink contour
  // fades where the edge moves more than ~3 px per blur sub-frame, so it never strobes.
  const VEL_DT = 1 / 240;
  function kinematics(t, B, scl) {
    const Bp = blobUniforms(t - VEL_DT), S = new Array(36).fill(0), V = new Array(12).fill(0);
    for (let i = 0; i < 12; i++) {
      const vx = (B[i * 4] - Bp[i * 4]) / VEL_DT, vy = (B[i * 4 + 1] - Bp[i * 4 + 1]) / VEL_DT;
      const v = Math.hypot(vx, vy);
      S[i * 3] = v > 1e-3 ? vx / v : 1;
      S[i * 3 + 1] = v > 1e-3 ? vy / v : 0;
      S[i * 3 + 2] = clamp((v - 250) / 3600, 0, 0.5);
      V[i] = (v + Math.abs(B[i * 4 + 2] - Bp[i * 4 + 2]) / VEL_DT) * scl;
    }
    return { S, V };
  }
  // Edge speed the whole body gets from its scale spring and jelly modes (px/s, upper bound).
  function bodyEdgeV(t, B, scl) {
    let Rx = 0;
    for (let i = 0; i < 12; i++) if (B[i * 4 + 2] > 0.5) Rx = Math.max(Rx, Math.hypot(B[i * 4], B[i * 4 + 1]) + B[i * 4 + 2]);
    const w1 = wobble(t), w0 = wobble(t - VEL_DT);
    let dw = 0;
    for (let k = 0; k < 6; k += 2) dw += Math.hypot(w1[k] - w0[k], w1[k + 1] - w0[k + 1]);
    return (Math.abs(scl - bodyScale(t - VEL_DT)) + dw * scl) / VEL_DT * Rx;
  }

  // Jelly wobble: damped angular modes n = 2, 3, 4, packed as (A·cosφ, A·sinφ).
  function wobble(t) {
    const m = [0, 0, 0, 0, 0, 0];
    const add = (n, A, ph) => { m[(n - 2) * 2] += A * Math.cos(ph); m[(n - 2) * 2 + 1] += A * Math.sin(ph); };
    const ring = (tau, amp, f, decay) => (tau <= 0 ? 0 : amp * Math.exp(-decay * tau) * Math.sin(TAU * f * tau));
    add(2, ring(t - T_SEED, 0.12, 4.4, 6.5), 0.4);
    add(3, ring(t - B1, 0.05, 5.2, 6), 0.9);
    add(2, ring(t - B2, 0.34, 3.8, 4.2), 0.15);
    add(3, ring(t - B2 - 0.02, 0.14, 4.6, 4.6), 1.3);
    add(4, ring(t - B2 - 0.03, 0.07, 6.2, 5.5), 2.2);
    add(2, ring(t - B3, 0.08, 3.6, 5), 1.7);
    add(3, ring(t - B3, 0.04, 4.8, 6), 0.3);
    return m;
  }

  // Uniform body scale: collision breathing, squeeze (anticipation) → inflate on the beat.
  function bodyScale(t) {
    let s = 1;
    if (t > B2) s += 0.12 * Math.exp(-5 * (t - B2)) * Math.sin(TAU * 2.6 * (t - B2)); // splat → breathe
    s -= 0.075 * E.sineInOut(seg(t, 1.3, B3 - 0.004));
    s += 0.575 * R.spring(t - B3 + 0.004, { k: 230, c: 17, v0: 9 });
    return s;
  }

  // Ripple rings from the collision: radius ×4, amplitude (surface slope) ×4.
  function ripples(t) {
    const Rp = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const tau = t - B2 - k * 0.085;
      if (tau <= 0) continue;
      Rp[k] = 130 + 1250 * tau - 180 * tau * tau;
      Rp[4 + k] = [0.55, 0.36, 0.22][k] * Math.exp(-1.6 * tau) * smoothstep(0, 0.05, tau);
    }
    return Rp;
  }

  // Flood: radius of the bone puddle welling up from the heart of the body, and of the coloured
  // liquid it shoves ahead of itself as a ribbon. RB_END is where the bone front sits when the
  // frame goes flat: just past the frame corners (1101 px) plus the deepest lobe, so the front is
  // still sweeping the last corner on f673.
  const RB_END = 1110;
  function flood(t) {
    if (t < T_F0) return { rb: -1, rF: 0 };
    const s = seg(t, T_F0, T_BONE);
    const rb = RB_END * (0.06 * E.backOut(seg(s, 0, 0.12)) + 0.94 * Math.pow(s, 2.3));
    return { rb, rF: rb + lerp(120, 64, s) };
  }

  const IRI = [[0, 0], [B1, 0.14, 'soft'], [B2, 0.36, 'soft'], [B3, 0.58, 'soft'], [T_BONE, 0.74, 'soft']];

  // Screen-space bounding box of the body (+ glow reach): outside it the SDF loop runs one masked
  // pass instead of twelve.
  function bodyBox(B, S, Wm, scl) {
    let x0 = 0, y0 = 0, x1 = 0, y1 = 0; // always contains the centre (the wobble scales about it)
    for (let i = 0; i < 12; i++) {
      const r = B[i * 4 + 2];
      if (r <= 0.5) continue;
      const e = r * (1 + S[i * 3 + 2]) + B[i * 4 + 3] * 0.25 + 2;
      x0 = Math.min(x0, B[i * 4] - e);
      x1 = Math.max(x1, B[i * 4] + e);
      y0 = Math.min(y0, B[i * 4 + 1] - e);
      y1 = Math.max(y1, B[i * 4 + 1] + e);
    }
    const wmax = Math.hypot(Wm[0], Wm[1]) + Math.hypot(Wm[2], Wm[3]) + Math.hypot(Wm[4], Wm[5]);
    const s = scl * (1 + wmax), m = GR + 4;
    return [CX + s * x0 - m, CY + s * y0 - m, CX + s * x1 + m, CY + s * y1 + m];
  }

  function uniforms(t, wordCanvas, px, subDt = 0) {
    const gloss = E.sineOut(seg(t, T_SEED, 0.13));
    const scl = bodyScale(t);
    const { rb, rF } = flood(t);
    const B = blobUniforms(t);
    const { S, V } = kinematics(t, B, scl);
    const Wm = wobble(t);
    // the flood front's speed, and how far it travels during one engine blur sub-frame (subDt):
    // its edge is softened by that much so the sub-frames fuse into a smear, not stepped copies
    const fV = rb > 0 ? Math.max(0, rb - flood(t - 1 / 480).rb) * 480 : 0;
    const fSoft = 0.8 * fV * subDt;
    const Rp = ripples(t);
    let nb = 0;
    for (let i = 0; i < 12; i++) if (B[i * 4 + 2] > 0.5) nb = i + 1;
    let nr = 0;
    while (nr < 4 && Rp[4 + nr] >= 1e-3) nr++;
    return {
      uTex: wordCanvas,
      uB: B,
      uNB: nb,
      uNR: nr,
      uS: S,
      uV: V,
      uEdgeV: bodyEdgeV(t, B, scl),
      uFSoft: fSoft,
      uFV: fV,
      uSub: subDt,
      uW: Wm,
      uRp: Rp,
      uC: [CX, CY],
      uBox: bodyBox(B, S, Wm, scl),
      uScl: scl,
      uGloss: gloss,
      uIri: R.keys(t, IRI),
      uPx: px,
      uRefr: 48 + 18 * E.soft(seg(t, B3, B3 + 0.3)),               // a lens, not a scramble: the
      uThick: clamp(coreR(t) * 0.8, 10, 64) * scl,                  // word stays legible in the pool
      uGlow: 0.085 * gloss,
      uFR: rF,
      uWave: rb,
      uFNoise: 4 + Math.max(0, rb) * 0.07,
      uSettle: 1 - E.sineInOut(seg(t, 1.66, T_BONE)), // the bone pool calms to flat P.bone
      uT: t,
    };
  }

  // ═════════════════════════════ GLSL ═════════════════════════════
  // Two program variants: SwiftShader executes every branch masked (a skipped if-block still
  // costs its full length; only loops shorten), so per-pixel cost is the length of the program.
  // Pre-flood frames (78 % of the scene) run a variant without the flood code; the blob and
  // ripple loops break at the last live entry (uniform break → the loop really ends).
  const fragSrc = (flood) => `
#define NB 12
#define FLOOD ${flood ? 1 : 0}
#define GR ${GR.toFixed(1)}
uniform sampler2D uTex;   // the word, bone on transparent (alpha = coverage), framed like the output
uniform float uB[48];     // 12 blobs × (x, y, r, k): px, relative to uC, before uScl
uniform float uS[36];     // 12 blobs × squash & stretch (dir.x, dir.y, stretch)
uniform float uV[12];     // 12 blobs × edge speed, px/s (ink contour fade)
uniform float uEdgeV;     // edge speed from the body's scale spring + jelly modes, px/s
uniform float uW[6];      // jelly wobble: modes n = 2,3,4 as (A·cosφ, A·sinφ)
uniform float uRp[8];     // ripple rings: radius ×4, slope amplitude ×4
uniform float uNB, uNR;   // live blobs (a prefix of uB) and live ripple rings (a prefix of uRp)
uniform vec2  uC;         // body centre, frame px
uniform vec4  uBox;       // body bounding box (+ glow reach), frame px: no SDF outside it
uniform float uScl, uGloss, uIri, uPx, uRefr, uThick, uGlow, uT;
uniform float uFR;        // flood: radius of the coloured liquid's front (0 = off)
uniform float uWave;      // flood: radius of the bone puddle (< 0 = off)
uniform float uFNoise;    // flood: lobing of both fronts, px
uniform float uSettle;    // flood: 1 while the bone pool moves → 0 flat, exactly P.bone
uniform float uFSoft;     // flood: front travel per blur sub-frame, px (edge pre-softening)
uniform float uFV;        // flood: front speed, px/s
uniform float uSub;       // seconds between the engine's blur sub-frames (0 = no blur)

const vec3 INK   = vec3(11., 11., 14.) / 255.;
const vec3 BONE  = vec3(242., 237., 228.) / 255.;
const vec3 BONE2 = vec3(217., 210., 197.) / 255.;
const vec3 GRAY  = vec3(138., 133., 124.) / 255.;
const vec3 SIG   = vec3(255., 79., 26.) / 255.;
const vec3 ULT   = vec3(51., 38., 255.) / 255.;
const vec3 PEACH = mix(SIG, BONE, .5);          // warm light inside the liquid
const vec3 DEEP  = mix(SIG, INK, .5);           // signal in depth / shadow
const vec2 FR    = vec2(1920., 1080.);
const vec3 KEY   = vec3(-.46, -.62, .64);   // key light, upper-left (frame space, y down)

vec4 over(vec4 top, vec4 bot) { return top + bot * (1. - top.a); }

// Thin-film band, cyclic and warm: signal → peach → signal → deep → signal, with ultra only as a
// narrow ≤ 12 % glint.
vec3 film(float ph) {
  ph = fract(ph);
  vec3 c = mix(SIG, PEACH, smoothstep(0., .28, ph) * (1. - smoothstep(.34, .6, ph)));
  c = mix(c, DEEP, smoothstep(.62, .76, ph) * (1. - smoothstep(.8, .96, ph)) * .6);
  return mix(c, ULT, smoothstep(.54, .6, ph) * (1. - smoothstep(.6, .66, ph)) * .12);
}

// Liquid body: smin of (squash & stretched) circles in a space radially wobbled by angular modes.
// Returns the distance AND its analytic gradient in one pass (x = d, yz = ∇d, frame px; w = the
// local edge speed, blended like the gradient):
//  · a stretched blob measures |M·e| with M = a·ddᵀ + b·(I − ddᵀ) (symmetric) → ∇ = M(M·e)/|M·e|;
//  · through smin the gradient is exactly mix(∇b, ∇a, h) — the dh terms cancel;
//  · the wobble warp q = v / s(θ), s = uScl·(1 + w(θ)), D = s·d(q) gives ∇D = ∇d + ∇s·(d − q·∇d).
// (SwiftShader runs every branch masked, so one pass instead of three finite-difference taps is
// the single biggest saving in this shader.)
vec4 bodyDG(vec2 p) {
  vec2 v = p - uC;
  float l = length(v) + 1e-3;
  vec2 z = v / l;
  vec2 z2 = vec2(z.x * z.x - z.y * z.y, 2. * z.x * z.y);
  vec2 z3 = vec2(z2.x * z.x - z2.y * z.y, z2.x * z.y + z2.y * z.x);
  vec2 z4 = vec2(z2.x * z2.x - z2.y * z2.y, 2. * z2.x * z2.y);
  vec2 W2 = vec2(uW[0], uW[1]), W3 = vec2(uW[2], uW[3]), W4 = vec2(uW[4], uW[5]);
  float w = dot(z2, W2) + dot(z3, W3) + dot(z4, W4);
  float dw = 2. * dot(vec2(-z2.y, z2.x), W2) + 3. * dot(vec2(-z3.y, z3.x), W3) + 4. * dot(vec2(-z4.y, z4.x), W4);
  float sc = uScl * (1. + w);
  vec2 q = v / sc;
  float d = 1e4, ev = 0.;
  vec2 g = vec2(0.);
  for (int i = 0; i < NB; i++) {
    if (float(i) >= uNB) break;
    float r = uB[i * 4 + 2];
    if (r > .5) {
      vec2 e = q - vec2(uB[i * 4], uB[i * 4 + 1]);
      vec2 dir = vec2(uS[i * 3], uS[i * 3 + 1]);
      float st = uS[i * 3 + 2], a = 1. / (1. + st), b = 1. + .6 * st;   // long along, thin across
      vec2 me = e * b + dir * dot(e, dir) * (a - b);
      float le = length(me) + 1e-4;
      float di = le - r, k = uB[i * 4 + 3];
      float h = clamp(.5 + .5 * (di - d) / k, 0., 1.);
      d = mix(di, d, h) - k * h * (1. - h);
      g = mix((me * b + dir * dot(me, dir) * (a - b)) / le, g, h);
      ev = mix(uV[i], ev, h);
    }
  }
  vec2 gs = uScl * dw * vec2(-z.y, z.x) / l;
  return vec4(d * sc, g + gs * (d - dot(q, g)), ev);
}

// Lobed radius from the body centre, shared by the bone puddle and the coloured front so the
// ribbon between them stays even. Polar noise (on the unit circle, no atan seam) makes lobes
// that drift outward with the flow; a Cartesian octave breaks the symmetry.
float floodR(vec2 p) {
  vec2 v = p - uC;
  float l = length(v);
  vec2 dir = v / (l + 1e-3);
  float n = (vnoise(dir * 1.35 + vec2(l * .0016 - uT * 1.1, uT * .6)) - .5) * 2.
          + (vnoise(p * .0042 + vec2(uT * .8, -uT * .5)) - .5) * 1.6;
  return l + uFNoise * n;
}

float word(vec2 q) { return texture(uTex, vec2(q.x / FR.x, 1. - q.y / FR.y)).a; }

// Collision ripples: (surface slope along r̂, envelope).
vec2 ripple(float r) {
  float s = 0., e = 0.;
  for (int k = 0; k < 4; k++) {
    if (float(k) >= uNR) break;
    float A = uRp[4 + k];
    float x = (r - uRp[k]) / 44.;
    float g = exp(-x * x);
    s += A * g * cos(x * 4.2);
    e = max(e, exp(-x * x * .25) * smoothstep(0., .08, A)); // wider than the displacement: no ghosts
  }
  return vec2(s, e);
}

float box(vec2 v, vec2 hs, float soft) {
  vec2 q = abs(v) - hs;
  return smoothstep(soft, -soft, length(max(q, 0.)) + min(max(q.x, q.y), 0.) - soft * .5);
}
// Studio environment, looked up with the reflection vector in stereographic coordinates (monotonic
// over the hemisphere, so a light never folds into two highlights on a dome): a key softbox high
// on the upper-left and a strip light on the right. Behind the object (R.z → −1) it is dark.
float studio(vec3 N) {
  vec3 Rf = vec3(2. * N.z * N.xy, 2. * N.z * N.z - 1.);
  vec2 s = Rf.xy / (1. + Rf.z + 1e-3);
  return box(s - vec2(-.44, -.56), vec2(.26, .15), .045) + .85 * box(s - vec2(.98, .06), vec2(.05, .5), .04);
}
float fresnel(float rim) { return pow(rim, 5.); }
vec3 halfv() { return normalize(normalize(KEY) + vec3(0., 0., 1.)); }

// dn = signed distance normalised by |∇d| (≈ Euclidean px), used for the ink contour.
vec3 liquid(vec2 p, float d, float dn, vec2 g, vec2 rn, float ripS, float aa, float lineK) {
  vec2 n = g / max(length(g), 1e-5);
  float u = clamp(-d / uThick, 0., 1.);                              // 0 at the rim → 1 in the pool
  float slope = min((1. - u) / sqrt(max(u * (2. - u), 1e-3)), 4.5);  // dome meniscus profile
  vec2 nxy = n * slope;
  vec2 w1 = vec2(.83, .55), w2 = vec2(-.42, .91), w3 = vec2(-.97, -.26);
  vec2 wg = w1 * cos(dot(p, w1) * .011 + uT * 1.7) + w2 * cos(dot(p, w2) * .015 - uT * 2.3) + w3 * cos(dot(p, w3) * .008 + uT * 1.1 + 2.);
  nxy += wg * .075 * smoothstep(0., .5, u);                          // slow surface swell
  nxy += rn * ripS * .9 * smoothstep(0., .35, u);                    // ripple rings cross the body
  vec3 N = normalize(vec3(nxy, 1.));
  float rim = 1. - N.z;
  float fr = fresnel(rim);

  // signal, deeper where thick; a warm film band lives in the rim zone
  vec2 off = -N.xy * uRefr;                                          // refraction along the normal
  float tc = word(p + off), ta = word(p + off * .965), tb = word(p + off * 1.04);
  vec3 c = mix(SIG, DEEP, smoothstep(.25, 1., u) * .4);
  vec3 fc = film(uIri + .8 * pow(rim, .75) + .08 * u);
  c = mix(c, fc, smoothstep(.03, .45, rim) * .35);                   // broad film sheen
  c = mix(c, fc, smoothstep(.55, .8, rim) * .5);                     // brighter toward the silhouette
  c = mix(c, mix(BONE, SIG, .25), tc * (.9 - .25 * (1. - u)));       // the word: warm peach, legible
  c = mix(c, DEEP, clamp(tb - tc, 0., 1.) * .45);                    // warm "dispersion": a deep edge …
  c = mix(c, BONE, clamp(ta - tc, 0., 1.) * .3);                     // … and a lit edge

  // reflections
  c = mix(c, BONE, clamp(studio(N) * (.55 + 2. * fr), 0., 1.));      // studio lights
  float Ry = 2. * N.z * N.y;
  c = mix(c, mix(SIG, BONE, .4), smoothstep(.35, .85, Ry) * .3 * (1. - u)); // warm floor bounce
  float nh = max(dot(N, halfv()), 0.);
  c = mix(c, BONE, clamp(pow(nh, 260.) * 1.8 + pow(nh, 40.) * .12, 0., 1.));
  c = mix(SIG, c, uGloss);
  return mix(c, INK, smoothstep(-1.5 - aa, -1.5 + aa, dn) * uGloss * lineK); // crisp 1.5 px ink contour
}

// The bone puddle: an opaque, raised liquid. While it moves its pool sits a touch below P.bone
// so the studio lights can read as gloss; it calms (uSettle → 0) to flat, exact P.bone.
vec3 bone(vec2 p, float dB, vec2 g) {
  vec2 n = g / max(length(g), 1e-5);
  float fast = smoothstep(1800., 5400., uFV);       // a racing front: broad, soft shading only
  float u = clamp(-dB / (90. + uFV * .0104), 0., 1.);
  float slope = min((1. - u) / sqrt(max(u * (2. - u), 1e-3)), 4.5);
  vec2 w1 = vec2(.6, .8), w2 = vec2(-.9, .44);
  vec2 swell = w1 * cos(dot(p, w1) * .0075 - uT * 2.6) + w2 * cos(dot(p, w2) * .0105 + uT * 1.9);
  vec3 N = normalize(vec3(n * slope + swell * .15 * uSettle * smoothstep(0., .6, u), 1.));
  float rim = 1. - N.z;
  float lit = dot(N.xy, normalize(KEY.xy));
  vec3 c = mix(BONE, BONE2, .38 * uSettle);
  c = mix(c, BONE2, clamp(-lit * 2., 0., 1.) * .85);
  c = mix(c, GRAY, clamp(-lit - .3, 0., 1.) * .55);
  c = mix(c, BONE, clamp(lit * 2.5, 0., 1.) * .7);
  c = mix(c, film(uIri + .35 + .9 * rim), smoothstep(.3, .9, rim) * .55); // warm meniscus
  c = mix(c, INK, smoothstep(.72, 1., rim) * .35 * (1. - fast));         // dark Fresnel edge
  c = mix(c, BONE, clamp(studio(N) * (.8 + 2. * fresnel(rim)), 0., 1.));
  vec3 Rf = vec3(2. * N.z * N.xy, 2. * N.z * N.z - 1.);
  c = mix(c, BONE, box(Rf.xy / (1. + Rf.z) - vec2(-.09, -.12), vec2(.07, .045), .03) * .9); // overhead light
  float nh = max(dot(N, halfv()), 0.);
  return mix(c, BONE, clamp(pow(nh, 260.) * 1.8, 0., 1.));
}

void main() {
  vec2 p = vec2(vUv.x, 1. - vUv.y) * FR;
  float aa = uPx * .75;
  vec2 rv = p - uC;
  float rl = length(rv) + 1e-3;
  vec2 rn = rv / rl;
  bool inBox = p.x > uBox.x && p.y > uBox.y && p.x < uBox.z && p.y < uBox.w;
  vec2 rip = ripple(rl);
  vec4 acc = vec4(0.);
#if FLOOD
  // flood: one lobed radius shared by the bone puddle and the coloured front. Its gradient comes
  // from screen derivatives (uniform control flow here; at 1:1 they equal a 1 px difference).
  float rN0 = floodR(p);
  vec2 gN0 = vec2(dFdx(rN0), dFdy(rN0)) / uPx;
  gN0.y = -gN0.y;                                                  // vUv.y is flipped vs frame y
#endif
  if (inBox || uWave > 0. || rip.y > .003) {
    float rN = 1e4, dB = 1e4;
    vec2 gN = rn;
    float aaF = max(aa, uFSoft);                                   // fast fronts: pre-blurred
    bool covered = false;                                          // under the opaque bone pool
    vec3 boneC = BONE;
#if FLOOD
    if (uWave > 0.) {
      rN = rN0;
      gN = gN0;
      dB = rN - uWave;
      if (uSettle <= 0. && dB < -90.) covered = true;              // flat pool: exact P.bone
      else {
        boneC = bone(p, dB, gN);
        if (dB < -aaF) { acc = vec4(boneC, 1.); covered = true; }  // nothing shows through
      }
      if (covered && acc.a == 0.) acc = vec4(BONE, 1.);
    }
#endif
    if (!covered) {
      // the liquid body (only inside its bounding box), merged with the coloured front the
      // flood shoves ahead of itself
      vec4 bd = vec4(1e4, rn, 0.);
      if (inBox) bd = bodyDG(p);
      float d = bd.x;
      vec2 g = bd.yz;
      float ev = max(bd.w, uEdgeV);
      float aaD = max(aa, .8 * ev * uSub);                         // fast edges: pre-blurred by their
                                                                   // travel per sub-frame (no steps)
#if FLOOD
      if (uFR > .5) {
        float dF = rN - uFR, h = clamp(.5 + .5 * (dF - d) / 90., 0., 1.);
        d = mix(dF, d, h) - 90. * h * (1. - h);
        g = mix(gN, g, h);
        aaD = mix(aaF, aaD, h);
        ev = mix(uFV, ev, h);                                      // the front's own speed
      }
      float shB = uWave > 0. ? .32 * uSettle * (1. - smoothstep(1800., 5400., uFV)) * exp(-max(dB, 0.) / 22.) : 0.;
#else
      float shB = 0.;
#endif
      float glowA = uGlow * exp(-max(d, 0.) / 60.) * smoothstep(GR, GR * .45, d);
      float shA = .3 * uGloss * exp(-max(d, 0.) / 26.);
      if (d < aaD || rip.y > .003 || glowA > .003 || shA > .003 || shB > .003) {
        if (rip.y > .003 && d > -aaD) {                            // 1 · the rings bend the backdrop
          vec3 c = mix(INK, BONE, word(p - rn * rip.x * 26.));
          c = mix(c, BONE, clamp(rip.x, 0., 1.) * .1);
          acc = vec4(c, 1.) * rip.y;
        }
        acc = over(vec4(INK, 1.) * shA, acc);                      // 2 · contact shadow
        acc = over(vec4(SIG, 1.) * glowA, acc);                    // 3 · caustic glow
        float dn = d / max(length(g), .25);
        float cov = smoothstep(aaD, -aaD, dn);                     // 4 · the liquid (AA on d/|∇d|)
        float lineK = 1. - smoothstep(1200., 2600., ev);           //   no ink line on fast edges
        if (cov > 0.) acc = over(vec4(liquid(p, d, dn, g, rn, rip.x, aaD, lineK), 1.) * cov, acc);
#if FLOOD
        if (uWave > 0.) {                                          // 5 · the bone puddle's edge + shadow
          acc = over(vec4(INK, 1.) * shB, acc);
          acc = over(vec4(boneC, 1.) * smoothstep(aaF, -aaF, dB), acc);
        }
#endif
      }
    }
  }
  fragColor = acc;
}
`;
  const FRAG_BODY = fragSrc(false), FRAG_FLOOD = fragSrc(true);

  // ═════════════════════════════ canvas: the word ═════════════════════════════
  // Layout and per-letter sprites are built once (fonts are loaded before the first render).
  // Blitting sprites is ~4× cheaper than rasterising 420 px outlines every frame.
  let WORD_L = null;
  function wordLayout() {
    if (WORD_L) return WORD_L;
    const c = document.createElement('canvas').getContext('2d');
    R.font(c, WORD_FONT);
    const m = c.measureText(WORD);
    const lay = R.layoutText(c, WORD);
    const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
    const x = CX - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2; // centre the ink, not the advance
    const base = CY + (asc - desc) / 2;
    const glyphs = lay.glyphs.map((g) => {
      R.font(c, { ...WORD_FONT, spacing: 0, align: 'center' });
      const gm = c.measureText(g.ch);
      const pad = 6, S = OVERSAMPLE;
      const l = gm.actualBoundingBoxLeft, r = gm.actualBoundingBoxRight, a = gm.actualBoundingBoxAscent, d = gm.actualBoundingBoxDescent;
      const cv = document.createElement('canvas');
      cv.width = Math.ceil((l + r) * S + pad * 2);
      cv.height = Math.ceil((a + d) * S + pad * 2);
      const x2 = cv.getContext('2d');
      x2.scale(S, S);
      R.font(x2, { ...WORD_FONT, spacing: 0, align: 'center' });
      x2.fillStyle = P.bone;
      const ox = pad / S + l, oy = pad / S + a; // glyph anchor (advance centre, baseline) inside the sprite
      x2.fillText(g.ch, ox, oy);
      return { canvas: cv, ox, oy, cx: g.x + gm.width / 2 };
    });
    WORD_L = { x, base, asc, desc, rise: asc + desc + 40, glyphs };
    return WORD_L;
  }

  // "fluid": per-letter rise out of an invisible mask line under the baseline, then a slow drift.
  // A letter launches at ~5000 px/s, so its rise is box-filtered across the engine's blur
  // sub-frame (subDt): n copies at alpha 1/n, summed with 'lighter' (exact coverage average),
  // instead of strobing into 4 hard copies.
  const letterP = (i, t) => WORD_EASE(seg(t, T_WORD + i * 0.042, T_WORD + i * 0.042 + 0.5));
  function drawWord(c, t, subDt = 0) {
    const L = wordLayout();
    const s = 1 + 0.035 * E.sineInOut(seg(t, 0, END));
    const oy = L.base - L.asc * 0.45;
    c.save();
    c.imageSmoothingQuality = 'medium';
    c.translate(CX, oy);
    c.scale(s, s);
    c.translate(-CX, -oy);
    c.beginPath();
    c.rect(-100, -100, W + 200, L.base + L.desc + 14 + 100);
    c.clip();
    L.glyphs.forEach((g, i) => {
      const p0 = letterP(i, t);
      if (p0 <= 0 && letterP(i, t + subDt) <= 0) return;
      const travel = (letterP(i, t + subDt) - p0) * (L.rise + 0.16 * 260);
      const n = subDt > 0 ? clamp(Math.ceil(travel / 2), 1, 12) : 1;
      c.save();
      if (n > 1) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 1 / n;
      }
      for (let k = 0; k < n; k++) {
        const p = n > 1 ? letterP(i, t + (subDt * (k + 0.5)) / n) : p0;
        if (p <= 0) continue;
        c.save();
        c.translate(L.x + g.cx, L.base + (1 - p) * L.rise);
        if (p < 1) c.rotate((1 - p) * -0.16);
        c.scale(1 / OVERSAMPLE, 1 / OVERSAMPLE);
        c.drawImage(g.canvas, -g.ox * OVERSAMPLE, -g.oy * OVERSAMPLE);
        c.restore();
      }
      c.restore();
    });
    c.restore();
  }

  R.scene({
    id: 's5',
    shake: 0.8,
    // Local motion-blur boost where movers outrun 4 sub-frames: the splash spray (~6000 px/s,
    // f563–564), the split fling (~4000–6800, f591–596), the slam home (up to ~12600 px/s,
    // f615–619), the collision wobble (~2000–2700, f620–630), the inflate (~1800, f647–652) and
    // the racing flood front (~2000 → 5800 px/s, f660–673; its shading bands would step).
    samplesAt(lt) {
      if (lt < 0.03) return 16;
      if (lt > B1 - 0.005 && lt < B1 + 0.095) return 12;
      if (lt > B2 - 0.07 && lt < B2 + 0.005) return 16;
      if (lt >= B2 + 0.005 && lt < B2 + 0.2) return 8;
      if (lt > B3 - 0.005 && lt < B3 + 0.09) return 12;
      if (lt >= 1.74 && lt < T_BONE) return 12;
      if (lt >= 1.62 && lt < T_BONE) return 8;
      return 4;
    },
    render(ctx, lt, api) {
      const t = clamp(lt, 0, END);
      if (t >= T_BONE) {
        // flat contract field: overdrawn past the frame so the hit-shake never shows an edge
        ctx.fillStyle = P.bone;
        ctx.fillRect(-200, -200, W + 400, H + 400);
        if (api.detail === 1) api.post.vignette = 0.05;
        return;
      }
      if (t <= T_SEED) {
        // the contract instant itself (never a rendered full frame: 9.375 = f562.5)
        ctx.fillStyle = P.signal;
        ctx.beginPath();
        ctx.arc(CX, CY, DOT_R, 0, TAU);
        ctx.fill();
        return;
      }
      const { rb } = flood(t);
      // the bone floods the frame: ease the vignette off so the field arrives flat
      if (api.detail === 1 && rb > 0) api.post.vignette = lerp(0.22, 0.05, smoothstep(500, RB_END, rb));
      // The word is drawn once, into a transparent layer (additive blur copies need one): it is
      // the crisp canvas type AND the texture the shader refracts.
      const sc = api.detail === 1 ? SCALE : SCALE_PANEL;
      const ls = sc * Math.min(1, api.detail * 1.25);
      const lw = Math.max(8, Math.round(W * ls)), lh = Math.max(8, Math.round(H * ls));
      const WL = api.layer('wordFull');
      drawWord(WL.ctx, t, api.subDt || 0);
      ctx.drawImage(WL.canvas, 0, 0);
      let tex = WL.canvas;
      if (lw !== W || lh !== H) {
        const L = api.layer('word', lw, lh);
        L.ctx.drawImage(WL.canvas, 0, 0, lw, lh);
        tex = L.canvas;
      }
      const img = api.shader(t >= T_F0 ? FRAG_FLOOD : FRAG_BODY, uniforms(t, tex, W / lw, api.subDt || 0), { scale: sc });
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(img, 0, 0, W, H);
    },
  });
})();
