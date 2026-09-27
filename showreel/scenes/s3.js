// ─────────────────────────────────────────────────────────────────────────────────────────────
//  s3 · SHAPE LANGUAGE                                global 4.6875 – 7.500  ·  lt = t − 4.6875
//
//  One hero shape, a field of followers, and a graph-editor inset that shows the curve behind
//  every move — the motion designer's secret made visible.
//
//    0.000  ARRIVAL   punch-through: the circle is fired in on a velocity impulse (already half
//                     size on the first frame), a shock ring + light flash, the field blooms
//    0.469  M1        circle   → squircle   cubic-bezier(.70,0,.20,1)     bone   → signal
//                     (hero glides left, camera eases in, the graph editor docks right)
//    0.703  SWAP      on the off-beat the editor folds + reels in, the hero glides right, and the
//                     editor re-docks left in time for M2
//    0.938  M2        squircle → triangle   damped spring                 signal → bone
//    1.406  M3        triangle → star       cubic-bezier(.90,0,.10,1)     bone   → ultra
//                     the loudest accent: the whip curve drives a camera punch-in + a shock ring
//    1.875  M4        star     → circle     cubic-bezier(.34,1.56,.64,1)  ultra  → bone
//                     the back curve drives shape, the glide home to centre and the camera out
//    2.344  RECALL    a ring leaves the hero's edge on the hit and lights each dot; dots inhale,
//                     then fly home on curved paths (expoIn, nearest first); hero kicks, squashes
//                     and implodes (log-space, accelerating) onto the contract dot
//    2.785  CONTRACT  P.ink + bone dot r=6 at (960,540), nothing else (f449 exact, f448 ≈ r 8)
//
//  Off-beat 8ths (the open hats at B10.5 … B14.5) sparkle a scattered subset of the field.
//  While an editor is docked the hero is "selected": a live bounding box, handles and a W × H
//  pill, wired to the editor by a node-editor S-curve that flexes with the bounds.
//
//  Craft notes
//  · Shapes are polar radius functions r(θ). A morph lerps radii along shared rays, so point
//    correspondence is by angle: morphs never twist or self-intersect, whatever the vertex count.
//    Each shape is stored pre-rotated by the hero's accumulated +90° turns, so shape + spin land
//    in the designed orientation. In-betweens are inflated toward a circle so they read as soft
//    blobs, and corners are filleted by a Gaussian over the radius table.
//  · The camera is a zoom about the hero (the selected layer), so the hero keeps its screen x
//    and the field breathes around it. The UI (selection chrome, wire, editor) is screen-space:
//    like a design tool, handles and panels don't scale with the zoom.
//  · Each beat: a 2-frame colour iris inside the hero (composited source-atop on a layer, so the
//    edge has no fringe), then a hairline ring that leaves the hero's edge on the beat frame.
//  · The graph editor plots the exact function that drives the hero; the playhead is evaluated
//    from the same (u → v) as the morph, so dot and shape are in lock-step by construction.
//  · Collapse dots draw their own shutter-length smear so the engine's motion-blur samples
//    read as continuous streaks instead of strobing; samplesAt() raises samples on the impulse,
//    the whip and the implosion.
//
//  Everything is a pure function of lt. Static data is precomputed at module scope (seeded).
// ─────────────────────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  const { P, BEAT } = R;
  const { clamp, lerp, TAU } = R.math;
  const E = R.ease;
  const seg = R.seg;
  const W = R.W, H = R.H, CX = W / 2, CY = H / 2;
  const DEG = Math.PI / 180;
  const rgba = R.col.rgba;

  // ── beat map (local seconds) ────────────────────────────────────────────────────────────
  const T = { IN: 0, M1: BEAT, M2: BEAT * 2, M3: BEAT * 3, M4: BEAT * 4, COL: BEAT * 5, END: BEAT * 6 };
  // The window opens between frames (4.6875 s = frame 281.25): the first s3 frame is f282 at
  // lt .0125. The hero is released at lt 0 on a velocity impulse, so that frame shows the hit.
  const OFF = [0.5, 1.5, 2.5, 3.5, 4.5].map((b) => b * BEAT); // off-beat 8ths (open hats)
  const START = R.SCENES.find((sc) => sc.id === 's3').start; // 4.6875
  const HOLD_T = 2.785; // contract state is exact from here: f449 (lt 2.7958); f448 is the landing

  // ── hero ────────────────────────────────────────────────────────────────────────────────
  const HERO_R = 170; // unit radius in px
  const X_L = 800, X_R = W - X_L; // hero x beside an editor docked right / left
  const DOT_R = 6; // contract dot
  const IRIS = 2.1; // colour iris reach (× HERO_R) — covers star tips at full pop
  const ENTRY = { k: 1200, c: 45, v0: 35 }; // impulse: .49 on f282, peak 1.15 at 76 ms, settled by 150 ms
  const SWAP = [0.69, 0.935]; // hero glides X_L → X_R, landing just before M2

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  Polar shape library
  // ═════════════════════════════════════════════════════════════════════════════════════════
  const posmod = (a, m) => ((a % m) + m) % m;
  // Radius at which the ray at angle th meets the segment (r1∠a1 → r2∠a2).
  const rayEdge = (r1, a1, r2, a2, th) => {
    const ax = r1 * Math.cos(a1), ay = r1 * Math.sin(a1);
    const ex = r2 * Math.cos(a2) - ax, ey = r2 * Math.sin(a2) - ay;
    const dx = Math.cos(th), dy = Math.sin(th);
    return (ax * ey - ay * ex) / (dx * ey - dy * ex);
  };
  const ngonR = (n, rc, phase) => (th) => {
    const step = TAU / n;
    const k = Math.min(n - 1, Math.floor(posmod(th - phase, TAU) / step));
    const a1 = phase + k * step;
    return rayEdge(rc, a1, rc, a1 + step, th);
  };
  const starR = (n, r1, r2, phase) => (th) => {
    const step = Math.PI / n;
    const k = Math.min(2 * n - 1, Math.floor(posmod(th - phase, TAU) / step));
    const a1 = phase + k * step, tip = k % 2 === 0;
    return rayEdge(tip ? r1 : r2, a1, tip ? r2 : r1, a1 + step, th);
  };
  const superR = (a, n) => (th) =>
    a / Math.pow(Math.pow(Math.abs(Math.cos(th)), n) + Math.pow(Math.abs(Math.sin(th)), n), 1 / n);

  // Display orientation (as the viewer sees each shape at rest). Areas are roughly matched so
  // the hero keeps its visual weight through every morph.
  const SHAPES = [
    { name: 'CIRCLE', r: () => 1 },
    { name: 'SQUIRCLE', r: superR(0.9, 4.6) },
    { name: 'TRIANGLE', r: ngonR(3, 1.3, -90 * DEG) },
    { name: 'STAR', r: starR(6, 1.26, 0.84, -90 * DEG) },
    { name: 'CIRCLE', r: () => 1 },
  ];
  const ROT = [0, 90, 180, 270, 360]; // accumulated hero turns (deg) at rest in each shape
  const FILL = [P.bone, P.signal, P.bone, P.ultra, P.bone];

  // Pre-rotated radius tables: local(θ) = display(θ + ROT_k).
  // `soft` (degrees) rounds corners with a circular Gaussian over the radius table — a cheap
  // stand-in for a fillet that keeps the polar representation (and so the twist-free morphs).
  const table = (N, soft = 0) => {
    const cos = new Float32Array(N), sin = new Float32Array(N);
    for (let i = 0; i < N; i++) { cos[i] = Math.cos((i / N) * TAU); sin[i] = Math.sin((i / N) * TAU); }
    const rad = SHAPES.map((s, k) => {
      const raw = Float32Array.from({ length: N }, (_, i) => s.r((i / N) * TAU + ROT[k] * DEG));
      const sig = (soft / 360) * N;
      if (sig < 0.5) return raw;
      const K = Math.ceil(sig * 3), w = [];
      for (let j = -K; j <= K; j++) w.push(Math.exp(-(j * j) / (2 * sig * sig)));
      const ws = w.reduce((a, b) => a + b, 0);
      return Float32Array.from({ length: N }, (_, i) => {
        let acc = 0;
        for (let j = -K; j <= K; j++) acc += raw[(i + j + N) % N] * w[j + K];
        return acc / ws;
      });
    });
    return { N, cos, sin, rad };
  };
  const HERO_TAB = table(720, 1.6); // ½° rays; corners softened by ~1.6°
  const ITEM_TAB = table(24); // 15° rays: every vertex angle (multiples of 15°) is sampled exactly

  // Unit radius of the a → b morph at progress q (q may overshoot) on ray i. In-betweens are
  // inflated toward the unit circle (peak at q = .5) so a radial lerp between very different
  // silhouettes reads as a soft blob rather than a shape with bites taken out.
  const INFLATE = 0.3;
  const morphR = (tab, a, b, q, i) => {
    const r0 = tab.rad[a][i] + (tab.rad[b][i] - tab.rad[a][i]) * q;
    const blob = a === b ? 0 : INFLATE * Math.sin(Math.PI * clamp(q));
    return Math.max(0, r0 + (1 - r0) * blob);
  };

  // Build the morph path between shapes a → b at progress q, scaled by size, rotated, placed.
  function morphPath(ctx, tab, a, b, q, size, rot = 0, ox = 0, oy = 0, sx = 1, sy = 1) {
    const c = Math.cos(rot), s = Math.sin(rot);
    ctx.beginPath();
    for (let i = 0; i < tab.N; i++) {
      const r = morphR(tab, a, b, q, i) * size;
      const lx = r * tab.cos[i] * sx, ly = r * tab.sin[i] * sy;
      const x = ox + lx * c - ly * s, y = oy + lx * s + ly * c;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  // Hero silhouette radius (world px) along world angle th — same maths as morphPath, one ray.
  function heroRadiusAt(hs, th) {
    const { m } = hs, tab = HERO_TAB;
    const i = Math.round((posmod(th - hs.rot, TAU) / TAU) * tab.N) % tab.N;
    return morphR(tab, m.a, m.b, m.q, i) * hs.size;
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  Curves — the functions the graph editor plots are the functions that drive the hero
  // ═════════════════════════════════════════════════════════════════════════════════════════
  const MORPHS = [
    { t0: T.M1 - 0.135, dur: 0.3 }, // snap: steepest ≈45% in → the snap lands on the beat
    { t0: T.M2, dur: 0.28 }, // spring: released on the beat
    { t0: T.M3 - 0.12, dur: 0.24 }, // whip: symmetric, centred on the beat
    { t0: T.M4 - 0.02, dur: 0.36 }, // back: fast out of the beat, overshoot, settle
  ];
  const SPRING = { k: 700, c: 20 };
  const springCurve = (D) => {
    const s = (u) => R.spring(u * D, SPRING);
    const tail = 1 - s(1); // land exactly on 1 at u = 1 (tiny correction, invisible early on)
    return (u) => (u <= 0 ? 0 : u >= 1 ? 1 : s(u) + tail * u * u * u * u);
  };
  const CURVES = [
    { tag: 'EASE', code: 'cubic-bezier(.70,0,.20,1)', bez: [0.7, 0, 0.2, 1], vmax: 1.14 },
    { tag: 'SPRING', code: 'stiffness 700 · damping 20', vmax: 1.36 },
    { tag: 'EASE', code: 'cubic-bezier(.90,0,.10,1)', bez: [0.9, 0, 0.1, 1], vmax: 1.14 },
    { tag: 'EASE', code: 'cubic-bezier(.34,1.56,.64,1)', bez: [0.34, 1.56, 0.64, 1], vmax: 1.7 },
  ];
  CURVES.forEach((c, i) => {
    c.f = c.bez ? E.bezier(...c.bez) : springCurve(MORPHS[i].dur);
    MORPHS[i].curve = c;
    MORPHS[i].t1 = MORPHS[i].t0 + MORPHS[i].dur;
  });
  const VMIN = -0.14;
  const curveAt = (k, lt) => MORPHS[k].curve.f(seg(lt, MORPHS[k].t0, MORPHS[k].t1));

  // Morph state at lt → shapes a→b, eased progress v, raw progress u, accumulated rotation.
  function morphAt(lt) {
    let k = -1;
    for (let i = 0; i < MORPHS.length; i++) if (lt >= MORPHS[i].t0) k = i;
    if (k < 0) return { k, a: 0, b: 0, u: 0, v: 0, q: 0, rot: 0 };
    const m = MORPHS[k];
    const u = seg(lt, m.t0, m.t1), v = m.curve.f(u);
    // rotation follows the curve exactly; the shape only takes 15% of any overshoot (a fully
    // extrapolated polygon goes concave and reads as a different shape)
    const q = v <= 1 ? v : 1 + (v - 1) * 0.15;
    return { k, a: k, b: k + 1, u, v, q, rot: (ROT[k] + 90 * v) * DEG };
  }

  // Damped-spring impulse response, normalised so the first peak is 1 (a "pop").
  const kick = (t, f = 4.2, z = 0.32) => {
    if (t <= 0) return 0;
    const w = TAU * f, wd = w * Math.sqrt(1 - z * z);
    const tp = Math.atan2(wd, z * w) / wd;
    return (Math.exp(-z * w * t) * Math.sin(wd * t)) / (Math.exp(-z * w * tp) * Math.sin(wd * tp));
  };

  // ── staging: hero x and camera zoom, both partly driven by the plotted curves ─────────────
  // Glide left as the first editor docks, swap sides before M2, and ride the M4 back curve
  // (overshoot included) home to centre.
  const heroX = (lt) =>
    R.keys(lt, [[0.1, CX], [0.52, X_L, E.snap], [SWAP[0], X_L], [SWAP[1], X_R, E.snap]]) + (CX - X_R) * curveAt(3, lt);
  // Zoom about the hero: ease in with M1, drift, punch in on the M3 whip (+ a kick on the beat),
  // pulled back out to exactly 1 by the M4 back curve (so it dips a hair below 1 and settles).
  function camAt(lt) {
    let s = R.keys(lt, [[0.1, 1], [0.55, 1.05, E.snap], [1.28, 1.065, E.sineInOut]]);
    s += 0.085 * curveAt(2, lt) + 0.03 * kick(lt - T.M3, 3.4, 0.38);
    return lerp(s, 1, curveAt(3, lt));
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  Wavefronts (world space)
  // ═════════════════════════════════════════════════════════════════════════════════════════
  const FRONT_MAX = 1320;
  const front = (dt, w) => (dt <= 0 ? 0 : w.r0 + (FRONT_MAX - w.r0) * E.quadOut(clamp(dt / w.dur)));
  const frontInv = (d, w) => w.dur * (1 - Math.sqrt(1 - clamp((d - w.r0) / (FRONT_MAX - w.r0), 0, 0.999)));
  // wave 0 = bloom from the centre; waves 1–4 = morph beats, from wherever the hero is then;
  // wave 5 = the recall: as it passes a dot, that dot starts its flight back into the hero.
  // Beat waves start at the hero's edge (r0), so the ring and the nearest dots fire on the beat frame.
  const WAVES = [
    { t: T.IN, x: CX, y: CY, dur: 0.62, r0: 100 },
    ...[T.M1, T.M2, T.M3, T.M4].map((t) => ({ t, x: heroX(t), y: CY, dur: 0.5, r0: HERO_R * 0.9 })),
    { t: T.COL, x: CX, y: CY, dur: 0.4, r0: HERO_R },
  ];
  const RECALL = 5;
  // Heavier accents: a thick shock ring on the arrival and on the star (the loudest morph).
  const SHOCKS = [
    { t: T.IN, x: CX, r0: 0.5, r1: 2.5, w: 14, dur: 0.32, a: 0.95 },
    { t: T.M3, x: heroX(T.M3), r0: 1.1, r1: 2.3, w: 8, dur: 0.28, a: 0.5 },
  ];

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  The field — 15 × 9 at 120 px; HUD corner zones kept clear (in screen space)
  // ═════════════════════════════════════════════════════════════════════════════════════════
  // Mirrors ZONES in hud.js ([x, y, w, h]), padded by 24 px: dots fade out as they approach.
  const HUD_KEEP = [[24, 24, 376, 72], [1592, 24, 304, 72], [24, 976, 312, 80], [1576, 976, 320, 80]]
    .map(([x, y, w, h]) => [x - 24, y - 24, x + w + 24, y + h + 24]);
  const hudMask = (x, y) => {
    let m = 1;
    for (const [l, t, r, b] of HUD_KEEP) {
      const d = Math.hypot(Math.max(l - x, 0, x - r), Math.max(t - y, 0, y - b));
      m = Math.min(m, clamp(d / 30));
    }
    return m;
  };
  const PITCH = 120;
  // collapse: dots inhale for 100 ms on the recall beat; the hero kicks, squashes (anticipation)
  // and implodes onto the contract dot, landing on the last frame or two.
  const COL = { start: T.COL, inhale: 0.1, squash0: 2.52, shrink0: 2.62, shrink1: HOLD_T };
  const ITEMS = (() => {
    const rnd = R.rng(0x5e3a);
    const out = [];
    for (let j = 0; j < 9; j++)
      for (let i = 0; i < 15; i++) {
        const x = CX + (i - 7) * PITCH, y = CY + (j - 4) * PITCH;
        const jit = rnd(), size = 10 + rnd() * 6, ph = rnd() * 100;
        out.push({ x, y, size, jit, ph, signal: false });
      }
    // a handful of signal accents: off the editor rows, away from every hero spot and the HUD
    const pool = out.filter((it) => Math.abs(it.y - CY) > 180 && [X_L, X_R, CX].every((hx) => Math.hypot(it.x - hx, it.y - CY) > 300) && hudMask(it.x, it.y) >= 1);
    for (let n = 0; n < 7; n++) pool.splice(Math.floor(rnd() * pool.length), 1)[0].signal = true;
    // per-wave pop times and push directions; collapse schedule; off-beat sparkle membership
    const dmax = Math.max(...out.map((it) => Math.hypot(it.x - CX, it.y - CY)));
    out.forEach((it, n) => {
      it.tp = WAVES.map((w) => w.t + frontInv(Math.hypot(it.x - w.x, it.y - w.y), w) + (it.jit - 0.5) * 0.012);
      it.dir = WAVES.map((w) => {
        const dx = it.x - w.x, dy = it.y - w.y, d = Math.hypot(dx, dy) || 1;
        return [dx / d, dy / d];
      });
      const u = Math.hypot(it.x - CX, it.y - CY) / dmax;
      it.c0 = it.tp[RECALL]; // the recall ring releases it (near dots first)…
      it.cd = 0.18 + 0.07 * u; // …and it is inside the hero by ≈ lt 2.78 at the latest
      it.swirl = 0.3 + it.jit * 0.12; // curved path: control point off the chord, all one way
      it.tw = OFF.map((_, o) => R.hash(n * 7.13 + o * 91.7 + 3.1) < 0.4);
    });
    return out;
  })();

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  Hero state
  // ═════════════════════════════════════════════════════════════════════════════════════════
  // Anticipation dip in the 110 ms before a beat, spring release (with a kick) after it.
  const beatPop = (dt, A = 0.09, B = 0.06) =>
    dt < 0 ? 1 - A * E.cubicIn(clamp(1 + dt / 0.11)) : 1 - A * (1 - R.spring(dt, { k: 380, c: 16 })) + B * kick(dt, 3.4, 0.4);

  function heroState(lt) {
    const m = morphAt(lt);
    let s = R.spring(lt - T.IN, ENTRY) * (1 + 0.012 * lt); // impulse entrance + slow hold drift
    for (const b of [T.M1, T.M2, T.M3, T.M4]) s *= beatPop(lt - b);
    // collapse: recall kick on the beat → anticipation squash → implode to the contract dot
    s *= beatPop(lt - T.COL, 0.1, 0.22);
    let sx = 1, sy = 1;
    const sq = E.sineInOut(seg(lt, COL.squash0, COL.shrink0)) * (1 - E.quadIn(seg(lt, COL.shrink0, COL.shrink0 + 0.08)));
    sx *= 1 + 0.07 * sq;
    sy *= 1 - 0.09 * sq;
    // log-space, accelerating: the size drops by a steady-looking ratio that speeds into the cut
    const shrink = seg(lt, COL.shrink0, COL.shrink1);
    const r0 = HERO_R * s;
    const size = r0 * Math.pow(DOT_R / r0, shrink * shrink * shrink);
    const hs = {
      x: heroX(lt), y: CY, size, sx, sy, m,
      rot: m.rot + 2 * DEG * lt * (1 - shrink),
      shrink,
      cam: camAt(lt),
    };
    hs.box = heroBounds(hs); // world (design units: what the W × H pill reports)
    const S = (x, y) => [hs.x + (x - hs.x) * hs.cam, CY + (y - CY) * hs.cam];
    const [l, t] = S(hs.box.l, hs.box.t), [r, b] = S(hs.box.r, hs.box.b);
    hs.sbox = { l, t, r, b }; // screen
    return hs;
  }

  // Live axis-aligned bounds of the hero silhouette — what a design tool's selection box shows.
  function heroBounds(hs) {
    const { m } = hs, tab = HERO_TAB;
    const c = Math.cos(hs.rot), s = Math.sin(hs.rot);
    let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
    for (let i = 0; i < tab.N; i += 2) {
      const rr = morphR(tab, m.a, m.b, m.q, i) * hs.size;
      const lx = rr * tab.cos[i] * hs.sx, ly = rr * tab.sin[i] * hs.sy;
      const x = lx * c - ly * s, y = lx * s + ly * c;
      if (x < l) l = x;
      if (x > r) r = x;
      if (y < t) t = y;
      if (y > b) b = y;
    }
    return { l: hs.x + l, r: hs.x + r, t: hs.y + t, b: hs.y + b };
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  Drawing (world → screen through the hero-centred zoom)
  // ═════════════════════════════════════════════════════════════════════════════════════════
  function drawGlow(ctx, lt, hs) {
    const a = E.quadOut(seg(lt, 0.03, 0.45)) * (1 - E.quadIn(seg(lt, 2.35, 2.7)));
    if (a <= 0) return;
    const g = ctx.createRadialGradient(hs.x, hs.y, 0, hs.x, hs.y, 760 * hs.cam);
    g.addColorStop(0, rgba(P.ink2, a));
    g.addColorStop(1, rgba(P.ink2, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-200, -200, W + 400, H + 400);
  }

  // A ring swept over the frame's shutter: radius rA → rB. Fast rings would strobe into one
  // hairline per motion-blur sub-sample, so every sub-sample draws the whole swept band at the
  // alpha that conserves the ring's ink (the collapse streaks use the same trick).
  function ringBand(ctx, x, y, rA, rB, lw, a) {
    const r0 = Math.max(0, Math.min(rA, rB) - lw / 2), r1 = Math.max(rA, rB) + lw / 2;
    if (r1 - r0 <= lw * 1.5) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = rgba(P.bone, a);
      ctx.beginPath();
      ctx.arc(x, y, (rA + rB) / 2, 0, TAU);
      ctx.stroke();
      return;
    }
    ctx.fillStyle = rgba(P.bone, (a * lw) / (r1 - r0));
    ctx.beginPath();
    ctx.arc(x, y, r1, 0, TAU);
    ctx.arc(x, y, r0, TAU, 0, true);
    ctx.fill();
  }

  function drawRings(ctx, sh, hs) {
    const [l0, l1] = sh;
    WAVES.forEach((w, k) => {
      if (l1 <= w.t) return;
      const tA = Math.max(l0, w.t + 1e-4), dt = (tA + l1) / 2 - w.t;
      if (dt >= w.dur) return;
      const rA = front(tA - w.t, w), rB = front(l1 - w.t, w), r = front(dt, w);
      const edge = k === 0 ? 0 : HERO_R * 1.02;
      if (rB < edge) return;
      const loud = k === RECALL;
      const a = (loud ? 0.75 : 0.42) * Math.pow(1 - dt / w.dur, 2) * E.quadOut(seg(r, edge, edge + 36));
      const c = hs.cam;
      ringBand(ctx, hs.x + (w.x - hs.x) * c, CY + (w.y - CY) * c, Math.max(rA, edge) * c, rB * c, loud ? 2.5 : 1.5, a);
    });
  }

  function drawShocks(ctx, sh, hs) {
    const [l0, l1] = sh;
    for (const k of SHOCKS) {
      if (l1 <= k.t) continue;
      const tA = Math.max(l0, k.t + 1e-4), u = ((tA + l1) / 2 - k.t) / k.dur;
      if (u >= 1) continue;
      const rad = (t) => HERO_R * lerp(k.r0, k.r1, E.expoOut(clamp((t - k.t) / k.dur))) * hs.cam;
      const e = E.expoOut(u);
      ringBand(ctx, hs.x + (k.x - hs.x) * hs.cam, CY, rad(tA), rad(l1), Math.max(1, k.w * Math.pow(1 - e, 1.5)), k.a * (1 - u) * (1 - u));
    }
  }

  function drawField(ctx, lt, hs, detail, span) {
    const quick = detail < 0.5;
    const cam = hs.cam, fx = hs.x;
    const inhale = E.expoOut(seg(lt, COL.start, COL.start + COL.inhale)) * 22;
    const links = DOCKS.map((d) => linkState(lt, hs, d)).filter(Boolean);
    for (const it of ITEMS) {
      const t0 = it.tp[0];
      if (lt < t0) continue;
      // bloom
      let sc = R.spring.bouncy(lt - t0);
      let flash = Math.exp(-(lt - t0) * 6);
      // latest morph wave to have reached this item
      let k = 0;
      for (let w = 1; w <= 4; w++) if (lt >= it.tp[w]) k = w;
      let a = 0, b = 0, q = 1, rot = 0, px = it.x, py = it.y;
      if (k > 0) {
        const dt = lt - it.tp[k];
        a = k - 1;
        b = k;
        q = E.expoOut(clamp(dt / 0.22));
        rot = (ROT[a] + 90 * R.spring(dt, { k: 380, c: 15 })) * DEG;
        const kk = kick(dt) * (k === 3 ? 1.35 : 1); // the star beat pushes harder
        sc *= 1 + 0.85 * kk;
        px += it.dir[k][0] * 14 * kk;
        py += it.dir[k][1] * 14 * kk;
        flash = Math.max(flash, Math.exp(-dt * 7));
      }
      // off-beat sparkle: a scattered subset ticks up and flares on each 8th (hard attack)
      for (let o = 0; o < OFF.length; o++) {
        const d = lt - OFF[o];
        if (d < 0 || d > 0.25 || !it.tw[o]) continue;
        const tw = Math.exp(-d * 24);
        sc *= 1 + 0.45 * tw;
        flash = Math.max(flash, 0.9 * tw);
      }
      // the recall ring lights each dot up as it calls it home
      if (lt >= it.tp[RECALL]) flash = Math.max(flash, Math.exp(-(lt - it.tp[RECALL]) * 5));
      // dots resting under the hero stay hidden (rather than being shoved out to its rim). The
      // ones under it at the recall are home before it shrinks, so this holds through the collapse.
      const bx = it.x - hs.x, by = it.y - hs.y;
      const inFlight = span[1] >= it.c0;
      if (Math.hypot(bx, by) + it.size < heroRadiusAt(hs, Math.atan2(by, bx))) continue;
      // idle drift (a few px) + lens push away from the hero
      px += R.noise2(it.ph, lt * 0.5) * 3;
      py += R.noise2(it.ph + 31, lt * 0.5) * 3;
      const hx = px - hs.x, hy = py - hs.y, hd = Math.hypot(hx, hy) || 1;
      const push = 44 * Math.exp(-Math.pow(Math.max(0, hd - 150) / 120, 2)) * clamp(hs.size / HERO_R);
      px += (hx / hd) * push;
      py += (hy / hd) * push;
      // the wire clears a lane: dots on its row duck out as its tip passes, and pop back when it
      // is reeled in (screen space, like the wire)
      if (Math.abs(it.y - CY) < 1) {
        const sx0 = fx + (px - fx) * cam;
        for (const L of links) {
          if (L.side * (sx0 - L.x0) < -40) continue;
          sc *= 1 - E.backIn(clamp((L.side * (L.tip - sx0) + 30) / 70), 2.2);
        }
        if (sc <= 0) continue;
      }
      // collapse: inhale outward, then fly into the hero on a curved path (expoIn)
      let smear = null;
      if (lt >= COL.start) {
        const cx = px - CX, cy = py - CY, cd = Math.hypot(cx, cy) || 1;
        px += (cx / cd) * inhale;
        py += (cy / cd) * inhale;
        if (inFlight) {
          if (span[0] >= it.c0 + it.cd) continue; // home before this frame's shutter opened
          const at = (e) => {
            const mx = (px + CX) / 2 + (-(py - CY)) * it.swirl, my = (py + CY) / 2 + (px - CX) * it.swirl;
            const i = 1 - e;
            return [i * i * px + 2 * i * e * mx + e * e * CX, i * i * py + 2 * i * e * my + e * e * CY];
          };
          // self motion-blur: every sub-sample draws the same streak — the flight across this
          // output frame's whole shutter — so the streak has even coverage (no beading from
          // stacked round caps) and never strobes, whatever the sample count
          const e = (t) => E.expoIn(seg(t, it.c0, it.c0 + it.cd));
          const ea = e(span[0]), e0 = e((span[0] + span[1]) / 2), e1 = e(span[1]);
          const p0 = at(e0), pa = at(ea), p1 = at(e1);
          sc *= 1 - 0.65 * e0;
          smear = [pa, p0, p1];
          px = p0[0];
          py = p0[1];
        }
      }
      // → screen
      const sx = fx + (px - fx) * cam, sy = CY + (py - CY) * cam;
      const keep = hudMask(sx, sy);
      if (keep <= 0) continue;
      const baseA = it.signal ? 0.95 : 0.35;
      const edge = clamp(Math.min(sx, W - sx) / 140) * clamp(Math.min(sy, H - sy) / 90);
      const alpha = (baseA + (1 - baseA) * flash) * (0.55 + 0.45 * edge) * keep;
      const size = (it.size / 2) * sc * cam;
      if (size <= 0.05) continue;
      ctx.globalAlpha = clamp(alpha);
      ctx.fillStyle = it.signal ? P.signal : P.bone;
      const round = (a === 0 || a === 4) && (b === 0 || b === 4);
      if (smear) {
        const S = (p) => [fx + (p[0] - fx) * cam, CY + (p[1] - CY) * cam];
        const [s0, s1, s2] = smear.map(S);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineCap = 'round';
        ctx.lineWidth = size * 2;
        ctx.beginPath();
        ctx.moveTo(s0[0], s0[1]);
        ctx.lineTo(s1[0], s1[1]);
        ctx.lineTo(s2[0] + 0.01, s2[1]);
        ctx.stroke();
      } else if (round || quick) {
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, TAU);
        ctx.fill();
      } else {
        morphPath(ctx, ITEM_TAB, a, b, q, size, rot, sx, sy);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Colour iris of the latest beat, sampled across the output frame's shutter [lt0, lt1]: the
  // new colour covers radius r for the fraction of the shutter in which the iris is past r. Every
  // motion-blur sub-sample draws that same averaged field, so the fast edge blurs smoothly instead
  // of stacking into concentric rings (the shape's own blur still comes from the sub-samples).
  const BEATS = [T.M1, T.M2, T.M3, T.M4];
  const irisAt = (dt) => IRIS * HERO_R * E.expoOut(clamp(dt / 0.12));
  function irisState(lt0, lt1) {
    let bi = -1;
    BEATS.forEach((b, i) => { if (lt1 >= b) bi = i; });
    if (bi < 0) return { fill: FILL[0], rs: [Infinity], rmin: Infinity, rmax: Infinity };
    const b = BEATS[bi], K = lt1 > lt0 ? 16 : 1, rs = [];
    for (let k = 0; k < K; k++) {
      const t = K > 1 ? lt0 + ((lt1 - lt0) * k) / (K - 1) : lt1;
      rs.push(t < b ? -1 : irisAt(t - b));
    }
    return { prev: FILL[bi], fill: FILL[bi + 1], rs, rmin: Math.min(...rs), rmax: Math.max(...rs) };
  }

  function drawHero(ctx, api, sh, hs) {
    if (hs.size <= 0.01) return;
    // the contract dot: a true arc, pixel-exact
    if (hs.shrink >= 1) {
      ctx.fillStyle = P.bone;
      ctx.beginPath();
      ctx.arc(CX, CY, DOT_R, 0, TAU);
      ctx.fill();
      return;
    }
    const { m } = hs, size = hs.size * hs.cam;
    const I = irisState(sh[0], sh[1]);
    if (I.rmin < hs.size * 1.5) {
      // two-colour frame: old fill, new colour irised in source-atop → one clean AA edge
      const S = 720, L = api.layer('hero', S, S), c = L.ctx;
      const ox = Math.round(hs.x) - S / 2, oy = Math.round(hs.y) - S / 2, cx = hs.x - ox, cy = hs.y - oy;
      morphPath(c, HERO_TAB, m.a, m.b, m.q, size, hs.rot, cx, cy, hs.sx, hs.sy);
      c.fillStyle = I.prev;
      c.fill();
      c.globalCompositeOperation = 'source-atop';
      if (I.rs.length === 1) {
        c.fillStyle = I.fill;
        c.beginPath();
        c.arc(cx, cy, Math.max(0, I.rmax) * hs.cam, 0, TAU);
        c.fill();
      } else if (I.rmax > 0) {
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, I.rmax * hs.cam), N = 16;
        for (let n = 0; n <= N; n++) {
          const r = (I.rmax * n) / N;
          let cov = 0;
          for (const rk of I.rs) if (rk > r || (n === 0 && rk >= 0)) cov++;
          g.addColorStop(n / N, R.col.mix(I.prev, I.fill, cov / I.rs.length));
        }
        c.fillStyle = g;
        c.fillRect(0, 0, S, S);
      }
      ctx.drawImage(L.canvas, ox, oy);
      return;
    }
    morphPath(ctx, HERO_TAB, m.a, m.b, m.q, size, hs.rot, hs.x, hs.y, hs.sx, hs.sy);
    ctx.fillStyle = I.fill;
    ctx.fill();
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  Graph editor — docked right for M1, re-docked left for M2–M4 (screen space)
  // ═════════════════════════════════════════════════════════════════════════════════════════
  const PW = 540, PH = 336, PY = CY - PH / 2;
  // line: wire draws on · open: panel unfolds from the wire's hairline · fold: back to a hairline ·
  // ret: the wire is reeled back into the hero (tip first)
  const DOCKS = [
    // the right editor folds on the off-beat hat (B11.5); the wire whips over to the left side
    { side: 1, x: W - 96 - PW, line: [0.1, 0.3], open: [0.17, 0.38], fold: [OFF[1], OFF[1] + 0.09], ret: [0.72, 0.82] },
    { side: -1, x: 96, line: [0.81, 0.96], open: [0.845, 1.02], fold: [2.13, 2.26], ret: [2.2, 2.335] },
  ];
  const HDR = { base: PY + 33, rule: PY + 51.5, ruler: PY + 68, foot: PY + PH - 47.5, fbase: PY + PH - 18 };
  const plotRect = (X) => ({ l: X + 60, r: X + PW - 34, t: PY + 98, b: PY + PH - 66 });
  // replot times: the first curve as the right editor opens, the spring as the left one opens,
  // the rest just after the previous morph finishes
  const PLOT_T = [0.25, 0.87, MORPHS[1].t1, MORPHS[2].t1 + 0.04];
  const LABEL = R.col.mix(P.gray, P.bone2, 0.35); // secondary labels: warm gray, lifted for ink2

  const SCRAMBLE = '<>/\\[]{}=+*#%01';
  // Mono text swap: characters decode left→right through a short scramble.
  // Only characters that actually change scramble. The glyph seed is the global frame number, so
  // all motion-blur sub-samples of a frame agree (the window opens mid-frame, lt·60 would not).
  function swapText(prev, next, lt, t0, per = 0.0035, hold = 0.04) {
    const n = Math.max(prev.length, next.length);
    const fr = Math.floor((lt + START) * 60 + 0.01);
    let s = '';
    for (let i = 0; i < n; i++) {
      const ti = t0 + i * per;
      if (prev[i] === next[i]) s += next[i];
      else if (lt < ti) s += prev[i] || ' ';
      else if (lt < ti + hold) {
        const blank = (next[i] || ' ') === ' ' && (prev[i] || ' ') === ' ';
        s += blank ? ' ' : SCRAMBLE[Math.floor(R.hash(i * 13.7 + fr * 1.37) * SCRAMBLE.length)];
      } else s += next[i] || ' ';
    }
    return s.replace(/\s+$/, '');
  }

  const mono = (ctx, size, spacing, align = 'left', weight = 500) =>
    R.font(ctx, { family: 'JetBrains Mono', weight, size, spacing, align });

  function plotIndex(lt) {
    let c = -1;
    for (let i = 0; i < PLOT_T.length; i++) if (lt >= PLOT_T[i]) c = i;
    return c;
  }

  // The wire is a node-editor S-curve from the selection box's middle handle on the editor's side
  // into the panel, continuing as the hairline the panel unfolds from.
  function linkPath(hs, d) {
    const x0 = d.side > 0 ? hs.sbox.r : hs.sbox.l, y0 = (hs.sbox.t + hs.sbox.b) / 2;
    const x1 = d.side > 0 ? d.x : d.x + PW, x2 = d.side > 0 ? d.x + PW : d.x;
    const k = (x1 - x0) * 0.5, pts = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24, v = 1 - u;
      const x = v * v * v * x0 + 3 * v * v * u * (x0 + k) + 3 * v * u * u * (x1 - k) + u * u * u * x1;
      const y = v * v * v * y0 + 3 * v * v * u * y0 + 3 * v * u * u * CY + u * u * u * CY;
      pts.push([x, y]);
    }
    pts.push([x2, CY]);
    return pts;
  }
  function linkState(lt, hs, d) {
    const inP = E.expoOut(seg(lt, d.line[0], d.line[1]));
    const outP = E.expoIn(seg(lt, d.ret[0], d.ret[1]));
    const end = inP * (1 - outP);
    if (end <= 0.001) return null;
    const x0 = d.side > 0 ? hs.sbox.r : hs.sbox.l, x2 = d.side > 0 ? d.x + PW : d.x;
    return { side: d.side, end, outP, x0, tip: lerp(x0, x2, end) }; // tip x is near-linear in trim fraction
  }

  function drawLink(ctx, lt, hs, d) {
    const L = linkState(lt, hs, d);
    if (!L) return;
    const pts = linkPath(hs, d);
    ctx.strokeStyle = rgba(P.bone, 0.5);
    ctx.lineWidth = 1.2;
    R.shape.trim(ctx, pts, 0, L.end);
    ctx.stroke();
    // node at the hero end (sits under the box's middle handle once the box is up)
    ctx.fillStyle = P.bone;
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], 3.6 * E.backOut(seg(lt, d.line[0], d.line[0] + 0.12)) * (1 - L.outP), 0, TAU);
    ctx.fill();
  }

  // Selection chrome: box, eight handles and a live W × H pill, like the layer is selected.
  const CH = { in0: 0.2, in1: 0.4, out0: 2.04, out1: 2.2 };
  function drawChrome(ctx, lt, hs) {
    const inU = seg(lt, CH.in0, CH.in1), outU = seg(lt, CH.out0, CH.out1);
    if (inU <= 0 || outU >= 1) return;
    const { l, r, t, b } = hs.sbox;
    const X = [l, (l + r) / 2, r], Y = [t, (t + b) / 2, b];
    const corners = [[l, t], [r, t], [r, b], [l, b]];
    // edges draw out from each corner (clockwise); retract back into the corners on exit
    const g = E.expoOut(seg(inU, 0.15, 1)) * (1 - E.expoIn(outU));
    ctx.strokeStyle = rgba(P.bone, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4];
      ctx.moveTo(ax, ay);
      ctx.lineTo(lerp(ax, bx, g), lerp(ay, by, g));
    }
    ctx.stroke();
    // handles pop in with a clockwise stagger, shrink out together
    const H8 = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
    H8.forEach(([i, j], n) => {
      const pop = E.backOut(seg(inU, n * 0.08, n * 0.08 + 0.4), 2.4) * (1 - E.backIn(outU, 1.8)); // 16 ms stagger
      const z = 8 * pop;
      if (z <= 0.2) return;
      ctx.fillStyle = P.ink;
      ctx.fillRect(X[i] - z / 2, Y[j] - z / 2, z, z);
      ctx.strokeStyle = P.bone;
      ctx.strokeRect(X[i] - z / 2 + 0.5, Y[j] - z / 2 + 0.5, z - 1, z - 1);
    });
    // live dimensions pill (design units: the zoom doesn't change them)
    const pa = E.expoOut(seg(inU, 0.35, 1)) * (1 - E.quadIn(seg(outU, 0, 0.6)));
    if (pa <= 0.01) return;
    mono(ctx, 14, 1, 'center', 600);
    const label = `${Math.round(hs.box.r - hs.box.l)} × ${Math.round(hs.box.b - hs.box.t)}`;
    const w = ctx.measureText(label).width + 18, h = 24, cx = (l + r) / 2, cy = b + 20 + h / 2 + (1 - pa) * 8;
    ctx.globalAlpha = pa;
    ctx.fillStyle = P.signal;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 4);
    ctx.fill();
    ctx.fillStyle = P.ink;
    ctx.fillText(label, cx, cy + 5);
    ctx.globalAlpha = 1;
  }

  function drawPanel(ctx, lt, d) {
    const open = E.expoOut(seg(lt, d.open[0], d.open[1])) * (1 - E.snap(seg(lt, d.fold[0], d.fold[1])));
    if (open <= 0.001) return;
    const h = PH * open, top = CY - h / 2;
    // body
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 44;
    ctx.shadowOffsetY = 20;
    ctx.fillStyle = P.ink2;
    ctx.fillRect(d.x, top, PW, h);
    ctx.restore();
    ctx.strokeStyle = rgba(P.bone, 0.3);
    ctx.lineWidth = 1;
    ctx.strokeRect(d.x + 0.5, top + 0.5, PW - 1, h - 1);
    // contents are laid out for the open panel and revealed by the unfolding mask
    ctx.save();
    ctx.beginPath();
    ctx.rect(d.x + 1, top + 1, PW - 2, h - 2);
    ctx.clip();
    ctx.globalAlpha = E.quadOut(seg(open, 0.3, 1));
    drawPanelContents(ctx, lt, d.x);
    ctx.restore();
  }

  function drawPanelContents(ctx, lt, X) {
    const ci = plotIndex(lt);
    // ── header: tag · code · index
    const cur = CURVES[Math.max(0, ci)], prv = ci > 0 ? CURVES[ci - 1] : null;
    const t0 = PLOT_T[Math.max(0, ci)];
    const tag = swapText(prv ? prv.tag : '', cur.tag, lt, t0 - 0.04);
    const code = swapText(prv ? prv.code : '', cur.code, lt, t0 - 0.02);
    mono(ctx, 16, 2);
    ctx.fillStyle = LABEL;
    ctx.fillText(tag, X + 20, HDR.base);
    mono(ctx, 16, 0.3, 'left', 600);
    ctx.fillStyle = P.bone;
    ctx.fillText(code, X + 112, HDR.base);
    mono(ctx, 16, 2, 'right');
    ctx.fillStyle = LABEL;
    ctx.fillText(swapText(ci > 0 ? `0${ci}/04` : '', `0${ci + 1}/04`, lt, t0 + 0.02), X + PW - 18, HDR.base);
    ctx.strokeStyle = rgba(P.bone, 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X, HDR.rule);
    ctx.lineTo(X + PW, HDR.rule);
    ctx.stroke();

    // ── time ruler
    const { l, r, t, b } = plotRect(X);
    ctx.strokeStyle = rgba(P.bone, 0.4);
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const x = Math.round(lerp(l, r, i / 20)) + 0.5, len = i % 5 === 0 ? 8 : 4;
      ctx.moveTo(x, HDR.ruler);
      ctx.lineTo(x, HDR.ruler + len);
    }
    ctx.stroke();

    // ── value range (auto-fits on each replot, like "fit to view")
    const zoomU = E.expoOut(seg(lt, t0, t0 + 0.18));
    const vmax = lerp(prv ? prv.vmax : cur.vmax, cur.vmax, zoomU);
    const px = (u) => lerp(l, r, u);
    const py = (v) => lerp(b, t, (v - VMIN) / (vmax - VMIN));

    // grid
    ctx.strokeStyle = rgba(P.bone, 0.1);
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const x = Math.round(px(i / 4)) + 0.5;
      ctx.moveTo(x, t - 4);
      ctx.lineTo(x, b + 4);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(P.bone, 0.3);
    ctx.beginPath();
    for (const v of [0, 1]) {
      const y = Math.round(py(v)) + 0.5;
      ctx.moveTo(l - 6, y);
      ctx.lineTo(r + 6, y);
    }
    ctx.stroke();
    mono(ctx, 15, 1, 'right');
    ctx.fillStyle = LABEL;
    ctx.fillText('1', l - 16, py(1) + 5);
    ctx.fillText('0', l - 16, py(0) + 5);

    if (ci < 0) return drawFooter(ctx, lt, X, null, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(X + 1, HDR.ruler + 13, PW - 2, HDR.foot - HDR.ruler - 15);
    ctx.clip();

    // ── curves
    const sample = (f, u0, u1, n = 90) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = lerp(u0, u1, i / n);
        pts.push([px(u), py(f(u))]);
      }
      return pts;
    };
    const stroke = (pts, col, w) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      R.shape.path(ctx, pts, false);
      ctx.stroke();
    };
    // outgoing curve fades while the new one is plotted
    if (prv) {
      const fa = 1 - E.quadOut(seg(lt, t0, t0 + 0.1));
      if (fa > 0) stroke(sample(prv.f, 0, 1), rgba(P.bone, 0.85 * fa), 2.6);
    }
    const reveal = E.expoOut(seg(lt, t0, t0 + 0.16));
    const mi = MORPHS[ci];
    const u = seg(lt, mi.t0, mi.t1), v = cur.f(u);

    // spring: dashed decay envelope 1 ± e^(−ζω t)
    if (!cur.bez) {
      const w0 = Math.sqrt(SPRING.k), zeta = SPRING.c / (2 * w0);
      ctx.setLineDash([3, 4]);
      for (const sgn of [1, -1]) {
        const env = (uu) => 1 + sgn * Math.exp(-zeta * w0 * uu * mi.dur);
        stroke(sample(env, 0, reveal, 60), rgba(P.bone, 0.32), 1.2);
      }
      ctx.setLineDash([]);
    }
    // ghost of the whole curve, then the inked part up to the playhead
    stroke(sample(cur.f, 0, reveal), rgba(P.bone, 0.38), 2);
    if (u > 0) stroke(sample(cur.f, 0, u, Math.max(2, Math.ceil(90 * u))), P.bone, 3);

    // bezier handles: anchor diamonds (keyframes) + lime handle dots
    const hp = E.backOut(seg(lt, t0 + 0.05, t0 + 0.2));
    const key = (x, y, s, fill) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = fill;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    };
    if (cur.bez && hp > 0) {
      const [x1, y1, x2, y2] = cur.bez;
      const h1 = [lerp(px(0), px(x1), hp), lerp(py(0), py(y1), hp)];
      const h2 = [lerp(px(1), px(x2), hp), lerp(py(1), py(y2), hp)];
      ctx.strokeStyle = rgba(P.bone, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px(0), py(0));
      ctx.lineTo(h1[0], h1[1]);
      ctx.moveTo(px(1), py(1));
      ctx.lineTo(h2[0], h2[1]);
      ctx.stroke();
      ctx.fillStyle = P.lime;
      for (const hpt of [h1, h2]) {
        ctx.beginPath();
        ctx.arc(hpt[0], hpt[1], 4 * clamp(hp * 1.5), 0, TAU);
        ctx.fill();
      }
    }
    const ka = E.backOut(seg(lt, t0, t0 + 0.12));
    key(px(0), py(0), 9 * ka, P.bone);
    key(px(1), py(1), 9 * ka * reveal, u >= 1 ? P.bone : LABEL);

    ctx.restore(); // end plot clip — the CTI head lives on the ruler

    // playhead: CTI line + head on the ruler, value guide, dot on the curve
    const pa = E.quadOut(seg(lt, t0 + 0.04, t0 + 0.14));
    const ga = ctx.globalAlpha;
    if (pa > 0) {
      const x = px(u), y = py(v);
      ctx.globalAlpha = ga * pa;
      ctx.strokeStyle = rgba(P.signal, 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, HDR.ruler - 4);
      ctx.lineTo(Math.round(x) + 0.5, b + 6);
      ctx.stroke();
      ctx.fillStyle = P.signal;
      ctx.beginPath();
      ctx.moveTo(x - 6, HDR.ruler - 10);
      ctx.lineTo(x + 6, HDR.ruler - 10);
      ctx.lineTo(x + 6, HDR.ruler - 3);
      ctx.lineTo(x, HDR.ruler + 3);
      ctx.lineTo(x - 6, HDR.ruler - 3);
      ctx.closePath();
      ctx.fill();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = rgba(P.bone, 0.45);
      ctx.beginPath();
      ctx.moveTo(l - 6, Math.round(y) + 0.5);
      ctx.lineTo(x, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.signal;
      ctx.fillRect(l - 9, Math.round(y) - 1, 5, 3);
      ctx.beginPath();
      ctx.arc(x, y, 6.5, 0, TAU);
      ctx.fillStyle = P.signal;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = P.ink2;
      ctx.stroke();
      ctx.globalAlpha = ga; // the footer must not inherit the playhead's fade-in
    }
    drawFooter(ctx, lt, X, mi, u, v);
  }

  function drawFooter(ctx, lt, X, mi, u, v) {
    ctx.strokeStyle = rgba(P.bone, 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X, HDR.foot);
    ctx.lineTo(X + PW, HDR.foot);
    ctx.stroke();
    mono(ctx, 16, 2);
    ctx.fillStyle = LABEL;
    ctx.fillText(swapText('', 'VALUE / TIME', lt, 0.27), X + 20, HDR.fbase);
    if (!mi) return;
    mono(ctx, 16, 1, 'right', 600);
    ctx.fillStyle = P.bone;
    const ms = String(Math.round(u * mi.dur * 1000)).padStart(3, '0');
    ctx.fillText(swapText('', `T ${ms}MS   V ${v.toFixed(2)}`, lt, 0.3), X + PW - 18, HDR.fbase);
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  Contract pin: in the final frames, cancel the (already sub-pixel) residual hit shake so the
  //  handoff dot is pixel-exact at (960, 540).
  // ═════════════════════════════════════════════════════════════════════════════════════════
  // A top-level render: this sub-sample belongs to the output frame being rendered (a render nested
  // in another scene's panel carries the host's frame time and has no shutter or post of its own).
  const topLevel = (api) => api.detail === 1 && Math.abs(api.t - api.frameT) < 0.02;
  function pinContract(ctx, api, lt) {
    if (lt < HOLD_T - 0.02 || !topLevel(api)) return;
    R.unshake(ctx, api, 1);
  }

  // Post accents, keyed to the output frame (post is per frame, not per motion-blur sub-sample).
  function post(api) {
    const ft = api.frameT - START;
    if (!topLevel(api) || ft < 0) return;
    // arrival: a light flash on the hit frame, and a short glow that dies with the shock ring
    const fl = 1 - seg(ft, 0, 0.07);
    const bl = 1 - seg(ft, 0, 0.16);
    // recall: a short glow as the ring lights the field
    const rb = ft >= T.COL ? 1 - seg(ft, T.COL, T.COL + 0.12) : 0;
    api.post.flash = Math.max(api.post.flash, 0.14 * fl * fl);
    api.post.bloom = Math.max(api.post.bloom, 0.35 * bl * bl, 0.2 * rb * rb);
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  R.scene({
    id: 's3',
    shake: 0.9,
    // Raise motion-blur samples where 4 point samples would strobe: the impulse growth, the
    // star whip, the swap glide and the implosion. (Rings, the iris and the collapse streaks
    // blur themselves across the shutter.)
    samplesAt(lt) {
      if (lt < 0.04) return 16; // f282–f283: the impulse grows the hero ~30 px per shutter
      if (lt < 0.06) return 8;
      if (Math.abs(lt - T.M3) < 0.07) return 12;
      if (lt > SWAP[0] + 0.08 && lt < SWAP[1] - 0.07) return 16; // glide peak: ~40 px per shutter
      if (lt > SWAP[0] + 0.04 && lt < SWAP[1] - 0.03) return 8;
      if (lt > 2.7) return 8;
      return 4;
    },
    render(ctx, lt, api) {
      // f281's shutter straddles the cut: its late sub-samples land in s3, but the frame is s2's
      // last, whose contract is solid ink — the hit starts on f282
      if (topLevel(api) && api.frameT < START) return;
      pinContract(ctx, api, lt);
      post(api);
      // this output frame's shutter in local time (a nested panel render has none of its own)
      const blur = topLevel(api) && api.subDt > 0;
      const sh0 = blur ? api.frameT - START : lt;
      const sh = [sh0, blur ? sh0 + api.subDt * (api.samples - 1) : lt];
      // the full exposure of this frame (a still without blur gets a nominal 180° shutter)
      const span = blur ? [sh0, sh0 + api.subDt * api.samples] : [lt, lt + 0.5 / R.FPS];
      const hs = heroState(lt);
      if (lt < HOLD_T) {
        drawGlow(ctx, lt, hs);
        drawRings(ctx, sh, hs);
        drawField(ctx, lt, hs, api.detail, span);
        drawShocks(ctx, sh, hs);
      }
      drawHero(ctx, api, sh, hs);
      // The UI layer (chrome, wire, editor) is screen UI: evaluated once per output frame at
      // mid-shutter, so every sub-sample draws it identically — crisp 60 fps UI (no smeared
      // digits or doubled hairlines) over the motion-blurred world.
      const tu = (sh[0] + sh[1]) / 2;
      if (tu < HOLD_T) {
        const hu = tu === lt ? hs : heroState(tu);
        for (const d of DOCKS) drawLink(ctx, tu, hu, d);
        drawChrome(ctx, tu, hu);
        for (const d of DOCKS) drawPanel(ctx, tu, d);
      }
    },
  });
})();
