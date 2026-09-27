// ─────────────────────────────────────────────────────────────────────────────────────────────
//  s5 · LIQUID                                         global 9.375 – 11.250  ·  lt = t − 9.375
//
//  The shader showpiece. One GLSL pass renders a glossy, iridescent metaball body that refracts
//  the type behind it. The canvas paints only the crisp word (from cached glyph sprites); the
//  same word is drawn into a layer that the shader samples as a texture.
//
//    0.000  CONTRACT  ink + signal dot r=14 at centre, held through the first real frame (f563
//                     = lt .0083 plus its blur sub-frames); engine hit-shake pinned
//    0.016  SEED      the dot splashes: spray flicks off, the core swells on a spring and six
//                     satellites bud out of it onto Lissajous orbits (smin-merged, gooey necks)
//    0.17   WORD      "fluid" rises letter by letter out of a mask line, behind the liquid
//    0.469  SPLIT     crouch → fling: the satellites tear away, necks snap (smin k drops) and
//                     five children pinch off their parents
//    0.66   PULL      everything is sucked back (expoIn, stretching toward the centre) and
//                     slams together on the beat
//    0.9375 WOBBLE    collision: mass arrives in the core, jelly modes n = 2, 3, 4 ring out and
//                     three ripple rings travel across the frame, bending the word outside too
//    1.406  INFLATE   squeeze (anticipation) → the body inflates on a spring
//    1.455  FLOOD     a raised bone puddle wells up from the heart of the body and races out,
//                     shoving the coloured liquid ahead as a ribbon; it swallows the word, then
//                     calms from glossy (a touch below bone, lit) to flat
//    1.80+  CONTRACT  solid P.bone (flat fill: no shader, no highlights) — frames 672–674
//
//  Shading (every colour is a mix of palette colours):
//    SDF (smin of velocity-stretched circles — squash & stretch — in a space radially wobbled by
//    angular modes; value + analytic gradient in one pass) → meniscus height
//    profile (a dome of thickness T at the rim, flat pool inside) → normal from the SDF gradient
//    + slow surface swell + ripple rings. Signal body darkening with depth; thin-film bands in
//    the rim zone cycling signal → ultra → signal → lime (a hint). Studio reflections (key
//    softbox + strip light) weighted by Fresnel, dark Fresnel rim, floor bounce, Blinn spec.
//    The word texture is refracted along the normal with thin "palette dispersion" fringes.
//    Outside: caustic glow, contact shadow, ripple rings that displace the backdrop.
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
  const T_SEED = 0.016;  // contract dot holds past f563's last blur sub-frame (lt .0146)
  const T_WORD = 0.17;   // first letter leaves the mask line
  const T_PULL = 0.66;   // split droplets start being pulled home (expoIn: they slam in on B2)
  const T_F0 = 1.455;    // bone wells up in the heart of the body
  const T_F1 = 1.79;     // flood front far past the corners
  const T_BONE = 1.80;   // flat P.bone from here (frames 672–674; f671 is already flat)
  const DOT_R = 14;
  const SCALE = 0.625;   // shader resolution: 1200 × 675

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
    if (t < T_SEED) return DOT_R;
    let r = DOT_R + (150 - DOT_R) * R.spring(t - T_SEED, { k: 230, c: 15 });
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
    const drift = t < T_SEED ? 0 : 1;
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
        // splash spray: flicked out of the seed, evaporates as it decelerates
        const sp = SPRAY[j];
        const dist = sp.D * E.expoOut(seg(t, T_SEED, T_SEED + 0.55));
        const r = t < T_SEED ? 0 : sp.r * E.expoOut(seg(t, T_SEED, T_SEED + 0.05)) * (1 - E.quadIn(seg(t, 0.1, 0.4)));
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
  const VEL_DT = 1 / 240;
  function squash(t, B) {
    const Bp = blobUniforms(t - VEL_DT), S = new Array(36).fill(0);
    for (let i = 0; i < 12; i++) {
      const vx = (B[i * 4] - Bp[i * 4]) / VEL_DT, vy = (B[i * 4 + 1] - Bp[i * 4 + 1]) / VEL_DT;
      const v = Math.hypot(vx, vy);
      S[i * 3] = v > 1e-3 ? vx / v : 1;
      S[i * 3 + 1] = v > 1e-3 ? vy / v : 0;
      S[i * 3 + 2] = clamp((v - 250) / 3600, 0, 0.5);
    }
    return S;
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
  // liquid it shoves ahead of itself as a ribbon.
  function flood(t) {
    if (t < T_F0) return { rb: -1, rF: 0 };
    const s = seg(t, T_F0, T_F1);
    const rb = 1450 * (0.06 * E.backOut(seg(s, 0, 0.12)) + 0.94 * Math.pow(s, 2.3));
    return { rb, rF: rb + lerp(120, 64, s) };
  }

  const IRI = [[0, 0], [B1, 0.14, 'soft'], [B2, 0.36, 'soft'], [B3, 0.58, 'soft'], [T_F1, 0.74, 'soft']];

  function uniforms(t, wordCanvas, px) {
    const gloss = E.sineOut(seg(t, T_SEED, 0.13));
    const scl = bodyScale(t);
    const { rb, rF } = flood(t);
    const B = blobUniforms(t);
    // how far the flood front travels during one engine blur sub-frame (1/480 s): its edge is
    // softened by that much so the 4 sub-frames fuse into a smear instead of stepped copies
    const fSoft = rb > 0 ? Math.max(0, rb - flood(t - 1 / 480).rb) * 0.8 : 0;
    return {
      uTex: wordCanvas,
      uB: B,
      uS: squash(t, B),
      uFSoft: fSoft,
      uW: wobble(t),
      uRp: ripples(t),
      uC: [CX, CY],
      uScl: scl,
      uGloss: gloss,
      uIri: R.keys(t, IRI),
      uPx: px,
      uRefr: 70 + 40 * E.soft(seg(t, B3, B3 + 0.3)),
      uThick: clamp(coreR(t) * 0.8, 10, 120) * scl,
      uGlow: 0.13 * gloss,
      uFR: rF,
      uWave: rb,
      uFNoise: 4 + Math.max(0, rb) * 0.07,
      uSettle: 1 - E.sineInOut(seg(t, 1.68, T_F1)), // the bone pool calms to flat P.bone
      uT: t,
    };
  }

  // ═════════════════════════════ GLSL ═════════════════════════════
  const FRAG = `
#define NB 12
uniform sampler2D uTex;   // the word, bone on transparent (alpha = coverage), framed like the output
uniform float uB[48];     // 12 blobs × (x, y, r, k): px, relative to uC, before uScl
uniform float uS[36];     // 12 blobs × squash & stretch (dir.x, dir.y, stretch)
uniform float uW[6];      // jelly wobble: modes n = 2,3,4 as (A·cosφ, A·sinφ)
uniform float uRp[8];     // ripple rings: radius ×4, slope amplitude ×4
uniform vec2  uC;         // body centre, frame px
uniform float uScl, uGloss, uIri, uPx, uRefr, uThick, uGlow, uT;
uniform float uFR;        // flood: radius of the coloured liquid's front (0 = off)
uniform float uWave;      // flood: radius of the bone puddle (< 0 = off)
uniform float uFNoise;    // flood: lobing of both fronts, px
uniform float uSettle;    // flood: 1 while the bone pool moves → 0 flat, exactly P.bone
uniform float uFSoft;     // flood: front travel per blur sub-frame, px (edge pre-softening)

const vec3 INK   = vec3(11., 11., 14.) / 255.;
const vec3 BONE  = vec3(242., 237., 228.) / 255.;
const vec3 BONE2 = vec3(217., 210., 197.) / 255.;
const vec3 GRAY  = vec3(138., 133., 124.) / 255.;
const vec3 SIG   = vec3(255., 79., 26.) / 255.;
const vec3 ULT   = vec3(51., 38., 255.) / 255.;
const vec3 LIME  = vec3(212., 255., 58.) / 255.;
const vec2 FR    = vec2(1920., 1080.);
const vec3 KEY   = vec3(-.46, -.62, .64);   // key light, upper-left (frame space, y down)

vec4 over(vec4 top, vec4 bot) { return top + bot * (1. - top.a); }

// Thin-film palette, cyclic: signal → ultra → signal → lime (a hint) → signal.
vec3 film(float ph) {
  ph = fract(ph);
  vec3 c = mix(SIG, ULT, smoothstep(0., .34, ph));
  c = mix(c, SIG, smoothstep(.34, .68, ph));
  return mix(c, LIME, smoothstep(.77, .84, ph) * (1. - smoothstep(.84, .91, ph)) * .45);
}

// Liquid body: smin of (squash & stretched) circles in a space radially wobbled by angular modes.
// Returns the distance AND its analytic gradient in one pass (x = d, yz = ∇d, frame px):
//  · a stretched blob measures |M·e| with M = a·ddᵀ + b·(I − ddᵀ) (symmetric) → ∇ = M(M·e)/|M·e|;
//  · through smin the gradient is exactly mix(∇b, ∇a, h) — the dh terms cancel;
//  · the wobble warp q = v / s(θ), s = uScl·(1 + w(θ)), D = s·d(q) gives ∇D = ∇d + ∇s·(d − q·∇d).
// (SwiftShader runs every branch masked, so one pass instead of three finite-difference taps is
// the single biggest saving in this shader.)
vec3 bodyDG(vec2 p) {
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
  float d = 1e4;
  vec2 g = vec2(0.);
  for (int i = 0; i < NB; i++) {
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
    }
  }
  vec2 gs = uScl * dw * vec2(-z.y, z.x) / l;
  return vec3(d * sc, g + gs * (d - dot(q, g)));
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
    float A = uRp[4 + k];
    if (A < 1e-3) continue;
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

vec3 liquid(vec2 p, float d, vec2 g, vec2 rn, float ripS) {
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

  // signal, deeper where thick; thin-film bands live in the rim zone
  vec2 off = -N.xy * uRefr;                                          // refraction along the normal
  float tc = word(p + off), ta = word(p + off * .965), tb = word(p + off * 1.04);
  vec3 c = mix(SIG, mix(SIG, INK, .5), smoothstep(.25, 1., u) * .4);
  vec3 fc = film(uIri + .8 * pow(rim, .75) + .08 * u);
  c = mix(c, fc, smoothstep(.03, .45, rim) * .35);                   // broad thin-film sheen
  c = mix(c, fc, smoothstep(.55, .8, rim) * .8);                     // crisp band at the silhouette
  c = mix(c, mix(BONE, fc, .3), tc * (.9 - .25 * (1. - u)));         // the word, tinted by the liquid
  c = mix(c, ULT, clamp(tb - tc, 0., 1.) * .4);                      // palette dispersion fringes
  c = mix(c, LIME, clamp(ta - tc, 0., 1.) * .3);

  // reflections
  c = mix(c, INK, smoothstep(.5, 1., rim) * .4);                     // dark Fresnel rim
  c = mix(c, BONE, clamp(studio(N) * (.55 + 2. * fr), 0., 1.));      // studio lights
  float Ry = 2. * N.z * N.y;
  c = mix(c, ULT, smoothstep(.35, .85, Ry) * .3 * (1. - u));          // floor bounce
  float nh = max(dot(N, halfv()), 0.);
  c = mix(c, BONE, clamp(pow(nh, 260.) * 1.8 + pow(nh, 40.) * .12, 0., 1.));
  return mix(SIG, c, uGloss);
}

// The bone puddle: an opaque, raised liquid. While it moves its pool sits a touch below P.bone
// so the studio lights can read as gloss; it calms (uSettle → 0) to flat, exact P.bone.
vec3 bone(vec2 p, float dB, vec2 g) {
  vec2 n = g / max(length(g), 1e-5);
  float u = clamp(-dB / 90., 0., 1.);
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
  c = mix(c, film(uIri + .35 + .9 * rim), smoothstep(.3, .9, rim) * .55); // iridescent meniscus
  c = mix(c, INK, smoothstep(.72, 1., rim) * .35);                        // dark Fresnel edge
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

  // flood: one lobed radius (+ its gradient) shared by the bone puddle and the coloured front
  float rN = 1e4;
  vec2 gN = rn;
  if (uWave > 0.) {
    rN = floodR(p);
    gN = vec2(floodR(p + vec2(1., 0.)), floodR(p + vec2(0., 1.))) - rN;
  }
  float dB = rN - uWave;
  float aaF = max(aa, uFSoft);                                                // fast fronts: pre-blurred
  vec3 boneC = BONE;
  if (uWave > 0.) {
    if (uSettle <= 0. && dB < -90.) { fragColor = vec4(BONE, 1.); return; } // flat pool
    boneC = bone(p, dB, gN);
    if (dB < -aaF) { fragColor = vec4(boneC, 1.); return; }                 // nothing shows through
  }

  // the liquid body, merged with the coloured front the flood shoves ahead of itself
  vec3 bd = bodyDG(p);
  float d = bd.x;
  vec2 g = bd.yz;
  float aaD = aa;
  if (uFR > .5) {
    float dF = rN - uFR, h = clamp(.5 + .5 * (dF - d) / 90., 0., 1.);
    d = mix(dF, d, h) - 90. * h * (1. - h);
    g = mix(gN, g, h);
    aaD = mix(aaF, aa, h);
  }

  vec2 rip = ripple(rl);
  float glowA = uGlow * exp(-max(d, 0.) / 90.);
  float shA = .3 * uGloss * exp(-max(d, 0.) / 26.);
  float shB = uWave > 0. ? .32 * uSettle * exp(-max(dB, 0.) / 22.) : 0.;
  if (d > aaD && rip.y < .003 && glowA < .003 && shA < .003 && shB < .003) { fragColor = vec4(0.); return; }

  vec4 acc = vec4(0.);
  if (rip.y > .003 && d > -aaD) {                    // 1 · the rings bend the backdrop too
    vec3 c = mix(INK, BONE, word(p - rn * rip.x * 26.));
    c = mix(c, BONE, clamp(rip.x, 0., 1.) * .1);
    acc = vec4(c, 1.) * rip.y;
  }
  acc = over(vec4(INK, 1.) * shA, acc);              // 2 · contact shadow
  acc = over(vec4(SIG, 1.) * glowA, acc);            // 3 · caustic glow
  float cov = smoothstep(aaD, -aaD, d / max(length(g), .25)); // 4 · the liquid (AA on d/|∇d|)
  if (cov > 0.) acc = over(vec4(liquid(p, d, g, rn, rip.x), 1.) * cov, acc);
  if (uWave > 0.) {                                  // 5 · the bone puddle's edge + its shadow
    acc = over(vec4(INK, 1.) * shB, acc);
    acc = over(vec4(boneC, 1.) * smoothstep(aaF, -aaF, dB), acc);
  }
  fragColor = acc;
}
`;

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
  function drawWord(c, t) {
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
      const t0 = T_WORD + i * 0.042;
      const p = WORD_EASE(seg(t, t0, t0 + 0.5));
      if (p <= 0) return;
      c.save();
      c.translate(L.x + g.cx, L.base + (1 - p) * L.rise);
      if (p < 1) c.rotate((1 - p) * -0.16);
      c.scale(1 / OVERSAMPLE, 1 / OVERSAMPLE);
      c.drawImage(g.canvas, -g.ox * OVERSAMPLE, -g.oy * OVERSAMPLE);
      c.restore();
    });
    c.restore();
  }

  // Undo the engine hit-shake (R.unshake) so the contract frames are pixel-exact.
  function pinContract(ctx, api, w) {
    if (w <= 0 || api.detail !== 1) return;
    R.unshake(ctx, api, w);
  }

  R.scene({
    id: 's5',
    shake: 0.8,
    render(ctx, lt, api) {
      const t = clamp(lt, 0, END);
      if (t >= T_BONE) {
        ctx.fillStyle = P.bone;
        ctx.fillRect(-200, -200, W + 400, H + 400);
        return;
      }
      pinContract(ctx, api, 1 - smoothstep(T_SEED, T_SEED + 0.06, t));
      if (t < T_SEED) {
        ctx.fillStyle = P.signal;
        ctx.beginPath();
        ctx.arc(CX, CY, DOT_R, 0, TAU);
        ctx.fill();
        return;
      }
      drawWord(ctx, t);
      const ls = SCALE * Math.min(1, api.detail * 1.25);
      const lw = Math.max(8, Math.round(W * ls)), lh = Math.max(8, Math.round(H * ls));
      const L = api.layer('word', lw, lh);
      L.ctx.scale(lw / W, lh / H);
      drawWord(L.ctx, t);
      const img = api.shader(FRAG, uniforms(t, L.canvas, W / lw), { scale: SCALE });
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(img, 0, 0, W, H);
    },
  });
})();
