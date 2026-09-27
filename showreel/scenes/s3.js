// ─────────────────────────────────────────────────────────────────────────────────────────────
//  s3 · SHAPE LANGUAGE                                global 4.6875 – 7.500  ·  lt = t − 4.6875
//
//  One hero shape, a field of followers, and a graph-editor inset that shows the curve behind
//  every move — the motion designer's secret made visible.
//
//    0.000  BLOOM     solid ink → bone circle springs up; the field blooms on a radial ripple
//    0.469  M1        circle   → squircle   cubic-bezier(.70,0,.20,1)     bone   → signal
//    0.938  M2        squircle → triangle   damped spring                 signal → bone
//    1.406  M3        triangle → star       cubic-bezier(.90,0,.10,1)     bone   → ultra
//    1.875  M4        star     → circle     cubic-bezier(.34,1.56,.64,1)  ultra  → bone
//    2.344  RECALL    a ring leaves the hero and lights each dot; dots inhale, then fly home on
//                     curved paths (expoIn, nearest first); hero squashes, snaps to the dot
//    2.8125 CONTRACT  P.ink + bone dot r=6 at (960,540), nothing else (held from HOLD_T)
//
//  While the inset is open (≈ .2 – 2.2) the hero is "selected": a live bounding box, handles and
//  a W × H pill, wired to the graph editor by a node-editor S-curve that flexes with the bounds.
//
//  Craft notes
//  · Shapes are polar radius functions r(θ). A morph lerps radii along shared rays, so point
//    correspondence is by angle: morphs never twist or self-intersect, whatever the vertex count.
//    Each shape is stored pre-rotated by the hero's accumulated +90° turns, so shape + spin land
//    in the designed orientation. In-betweens are inflated toward a circle so they read as soft
//    blobs, and corners are filleted by a Gaussian over the radius table.
//  · Each beat: a 2-frame colour iris inside the hero (composited source-atop on a layer, so the
//    edge has no fringe), then a hairline ring that pops, spins and re-shapes the field.
//  · The graph editor plots the exact function that drives the hero; the playhead is evaluated
//    from the same (u → v) as the morph, so dot and shape are in lock-step by construction.
//  · Collapse dots draw their own shutter-length smear so the engine's 4 motion-blur samples
//    read as continuous streaks instead of strobing.
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
  const T = { IN: 0.02, M1: BEAT, M2: BEAT * 2, M3: BEAT * 3, M4: BEAT * 4, COL: BEAT * 5, END: BEAT * 6 };
  // The window opens between frames (4.6875 s = frame 281.25), so the first s3 frame is f282 at
  // lt .0125 (sub-samples to .0188): the hero is released at T.IN = .02 so that frame is pure ink.
  const START = R.SCENES.find((sc) => sc.id === 's3').start; // 4.6875
  const HOLD_T = 2.75; // contract state is final from here (last frame is lt 2.7958)

  // ── hero ────────────────────────────────────────────────────────────────────────────────
  const HERO_R = 170; // unit radius in px
  const HERO_PX = 800; // hero x while the graph editor is open (balances the inset)
  const DOT_R = 6; // contract dot
  const IRIS = 2.1; // colour iris reach (× HERO_R) — covers star tips at full pop
  const heroX = (lt) =>
    R.keys(lt, [[0.1, CX], [0.52, HERO_PX, E.snap], [2.1, HERO_PX], [2.36, CX, E.snap]]);

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

  // Hero silhouette radius (px) along world angle th — same maths as morphPath, one ray.
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

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  Wavefronts
  // ═════════════════════════════════════════════════════════════════════════════════════════
  const FRONT_MAX = 1320;
  const front = (dt, dur) => (dt <= 0 ? 0 : FRONT_MAX * E.quadOut(clamp(dt / dur)));
  const frontInv = (d, dur) => dur * (1 - Math.sqrt(1 - clamp(d / FRONT_MAX, 0, 0.999)));
  // wave 0 = bloom from the centre; waves 1–4 = morph beats, from wherever the hero is then;
  // wave 5 = the recall: as it passes a dot, that dot starts its flight back into the hero.
  const WAVES = [
    { t: T.IN + 0.02, x: CX, y: CY, dur: 0.62 },
    ...[T.M1, T.M2, T.M3, T.M4].map((t) => ({ t, x: heroX(t), y: CY, dur: 0.5 })),
    { t: T.COL, x: CX, y: CY, dur: 0.34 },
  ];
  const RECALL = 5;

  // Damped-spring impulse response, normalised so the first peak is 1 (a "pop").
  const kick = (t, f = 4.2, z = 0.32) => {
    if (t <= 0) return 0;
    const w = TAU * f, wd = w * Math.sqrt(1 - z * z);
    const tp = Math.atan2(wd, z * w) / wd;
    return (Math.exp(-z * w * t) * Math.sin(wd * t)) / (Math.exp(-z * w * tp) * Math.sin(wd * tp));
  };

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  The field — 15 × 9 at 120 px, HUD corners kept clear
  // ═════════════════════════════════════════════════════════════════════════════════════════
  const PITCH = 120;
  // collapse: dots inhale for 100 ms on the recall beat; the hero squashes (anticipation) and
  // then snaps down to the contract dot, landing ≈ 3 frames before the cut.
  const COL = { start: T.COL, inhale: 0.1, squash0: 2.5, shrink0: 2.6, shrink1: 2.745 };
  const ITEMS = (() => {
    const rnd = R.rng(0x5e3a);
    const out = [];
    for (let j = 0; j < 9; j++)
      for (let i = 0; i < 15; i++) {
        const x = CX + (i - 7) * PITCH, y = CY + (j - 4) * PITCH;
        const jit = rnd(), size = 10 + rnd() * 6, ph = rnd() * 100;
        if ((x < 300 || x > W - 300) && (y < 150 || y > H - 150)) continue; // HUD corner zones
        out.push({ x, y, size, jit, ph, signal: false });
      }
    // a handful of signal accents, away from the hero and the inset
    const pool = out.filter((it) => Math.hypot(it.x - CX, it.y - CY) > 330 && !(it.x > 1260 && it.y > 360 && it.y < 720));
    for (let n = 0; n < 7; n++) pool.splice(Math.floor(rnd() * pool.length), 1)[0].signal = true;
    // per-wave pop times and push directions; collapse schedule
    const dmax = Math.max(...out.map((it) => Math.hypot(it.x - CX, it.y - CY)));
    out.forEach((it) => {
      it.tp = WAVES.map((w) => w.t + frontInv(Math.hypot(it.x - w.x, it.y - w.y), w.dur) + (it.jit - 0.5) * 0.012);
      it.dir = WAVES.map((w) => {
        const dx = it.x - w.x, dy = it.y - w.y, d = Math.hypot(dx, dy) || 1;
        return [dx / d, dy / d];
      });
      const u = Math.hypot(it.x - CX, it.y - CY) / dmax;
      it.c0 = it.tp[RECALL]; // the recall ring releases it (near dots first)…
      it.cd = 0.17 + 0.06 * u; // …and it is inside the hero by ≈ lt 2.72 at the latest
      it.swirl = 0.3 + it.jit * 0.12; // curved path: control point off the chord, all one way
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
    let s = R.spring.bouncy(lt - T.IN) * (1 + 0.012 * lt); // entrance + slow hold drift
    for (const b of [T.M1, T.M2, T.M3, T.M4]) s *= beatPop(lt - b);
    // collapse: recall pulse on the beat → anticipation squash → shrink to the contract dot
    s *= beatPop(lt - T.COL, 0.06, 0.08);
    let sx = 1, sy = 1;
    const sq = E.sineInOut(seg(lt, COL.squash0, COL.shrink0)) * (1 - E.quadIn(seg(lt, COL.shrink0, COL.shrink0 + 0.08)));
    sx *= 1 + 0.07 * sq;
    sy *= 1 - 0.09 * sq;
    const shrink = E.snap(seg(lt, COL.shrink0, COL.shrink1));
    const size = lerp(HERO_R * s, DOT_R, shrink);
    // colour: the iris of the latest beat
    let fi = 0, iris = Infinity, prev = FILL[0];
    [T.M1, T.M2, T.M3, T.M4].forEach((b, i) => {
      if (lt >= b) { fi = i + 1; prev = FILL[i]; iris = IRIS * HERO_R * E.expoOut(clamp((lt - b) / 0.12)); }
    });
    const hs = {
      x: heroX(lt), y: CY, size, sx, sy, m,
      rot: m.rot + 2 * DEG * lt * (1 - shrink),
      fill: FILL[fi], prev, iris, shrink,
    };
    hs.box = heroBounds(hs);
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
  //  Drawing
  // ═════════════════════════════════════════════════════════════════════════════════════════
  function drawGlow(ctx, lt, hs) {
    const a = E.quadOut(seg(lt, 0.05, 0.5)) * (1 - E.quadIn(seg(lt, 2.35, 2.7)));
    if (a <= 0) return;
    const g = ctx.createRadialGradient(hs.x, hs.y, 0, hs.x, hs.y, 760);
    g.addColorStop(0, rgba(P.ink2, a));
    g.addColorStop(1, rgba(P.ink2, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-200, -200, W + 400, H + 400);
  }

  function drawRings(ctx, lt, hs) {
    ctx.lineWidth = 1.5;
    WAVES.forEach((w, k) => {
      const dt = lt - w.t;
      if (dt <= 0 || dt >= w.dur) return;
      const r = front(dt, w.dur);
      const edge = k === 0 ? 0 : HERO_R * 1.05;
      if (r < edge) return;
      const a = 0.42 * Math.pow(1 - dt / w.dur, 2) * E.quadOut(seg(r, edge, edge + 60));
      ctx.strokeStyle = rgba(P.bone, a);
      ctx.beginPath();
      ctx.arc(w.x, w.y, r, 0, TAU);
      ctx.stroke();
    });
  }

  function drawField(ctx, lt, hs, detail) {
    const quick = detail < 0.5;
    const inhale = E.expoOut(seg(lt, COL.start, COL.start + COL.inhale)) * 22;
    const link = linkState(lt, hs);
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
        const kk = kick(dt);
        sc *= 1 + 0.85 * kk;
        px += it.dir[k][0] * 14 * kk;
        py += it.dir[k][1] * 14 * kk;
        flash = Math.max(flash, Math.exp(-dt * 7));
      }
      // the recall ring lights each dot up as it calls it home
      if (lt >= it.tp[RECALL]) flash = Math.max(flash, Math.exp(-(lt - it.tp[RECALL]) * 5));
      // dots resting under the hero stay hidden (rather than being shoved out to its rim). The
      // ones under it at the recall are home before it shrinks, so this holds through the collapse.
      const bx = it.x - hs.x, by = it.y - hs.y;
      const inFlight = lt >= it.c0;
      if (Math.hypot(bx, by) + it.size < heroRadiusAt(hs, Math.atan2(by, bx))) continue;
      // idle drift (a few px) + lens push away from the hero
      px += R.noise2(it.ph, lt * 0.5) * 3;
      py += R.noise2(it.ph + 31, lt * 0.5) * 3;
      const hx = px - hs.x, hy = py - hs.y, hd = Math.hypot(hx, hy) || 1;
      const push = 44 * Math.exp(-Math.pow(Math.max(0, hd - 150) / 120, 2)) * clamp(hs.size / HERO_R);
      px += (hx / hd) * push;
      py += (hy / hd) * push;
      // the connector clears a lane: dots on its row duck out as its tip passes, and pop back
      // when it is reeled in
      if (link && Math.abs(it.y - CY) < 1 && it.x > link.x0 - 40) {
        const behind = clamp((link.tip - it.x + 30) / 70);
        sc *= 1 - E.backIn(behind, 2.2);
        if (sc <= 0) continue;
      }
      // collapse: inhale outward, then fly into the hero on a curved path (expoIn)
      let smear = null;
      if (lt >= COL.start) {
        const cx = px - CX, cy = py - CY, cd = Math.hypot(cx, cy) || 1;
        px += (cx / cd) * inhale;
        py += (cy / cd) * inhale;
        if (inFlight) {
          const u = seg(lt, it.c0, it.c0 + it.cd);
          if (u >= 1) continue;
          const at = (e) => {
            const mx = (px + CX) / 2 + (-(py - CY)) * it.swirl, my = (py + CY) / 2 + (px - CX) * it.swirl;
            const i = 1 - e;
            return [i * i * px + 2 * i * e * mx + e * e * CX, i * i * py + 2 * i * e * my + e * e * CY];
          };
          // self motion-blur: each of the engine's 4 sub-samples (1/480 s apart) draws the whole
          // 180° shutter span, so every point of the streak gets equal coverage (no beading)
          const ea = E.expoIn(seg(lt - 1.5 / 480, it.c0, it.c0 + it.cd));
          const e0 = E.expoIn(u), e1 = E.expoIn(seg(lt + 2.5 / 480, it.c0, it.c0 + it.cd));
          const p0 = at(e0), pa = at(ea), p1 = at(e1);
          sc *= 1 - 0.65 * e0;
          smear = [pa, p0, p1];
          px = p0[0];
          py = p0[1];
        }
      }
      const baseA = it.signal ? 0.95 : 0.35;
      const edge = clamp(Math.min(it.x, W - it.x) / 140) * clamp(Math.min(it.y, H - it.y) / 90);
      const alpha = (baseA + (1 - baseA) * flash) * (0.55 + 0.45 * edge);
      const size = (it.size / 2) * sc;
      if (size <= 0.05) continue;
      ctx.globalAlpha = clamp(alpha);
      ctx.fillStyle = it.signal ? P.signal : P.bone;
      const round = (a === 0 || a === 4) && (b === 0 || b === 4);
      if (smear) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineCap = 'round';
        ctx.lineWidth = size * 2;
        ctx.beginPath();
        ctx.moveTo(smear[0][0], smear[0][1]);
        ctx.lineTo(smear[1][0], smear[1][1]);
        ctx.lineTo(smear[2][0] + 0.01, smear[2][1]);
        ctx.stroke();
      } else if (round || quick) {
        ctx.beginPath();
        ctx.arc(px, py, size, 0, TAU);
        ctx.fill();
      } else {
        morphPath(ctx, ITEM_TAB, a, b, q, size, rot, px, py);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawHero(ctx, api, lt, hs) {
    if (hs.size <= 0.01) return;
    // the contract dot: a true arc, pixel-exact
    if (hs.shrink >= 1) {
      ctx.fillStyle = P.bone;
      ctx.beginPath();
      ctx.arc(CX, CY, DOT_R, 0, TAU);
      ctx.fill();
      return;
    }
    const { m } = hs;
    const extent = hs.size * 1.5;
    if (hs.iris < extent) {
      // two-colour frame: old fill, new colour irised in source-atop → one clean AA edge
      const S = 720, L = api.layer('hero', S, S), c = L.ctx;
      const ox = Math.round(hs.x) - S / 2, oy = Math.round(hs.y) - S / 2;
      morphPath(c, HERO_TAB, m.a, m.b, m.q, hs.size, hs.rot, hs.x - ox, hs.y - oy, hs.sx, hs.sy);
      c.fillStyle = hs.prev;
      c.fill();
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = hs.fill;
      c.beginPath();
      c.arc(hs.x - ox, hs.y - oy, hs.iris, 0, TAU);
      c.fill();
      ctx.drawImage(L.canvas, ox, oy);
      return;
    }
    morphPath(ctx, HERO_TAB, m.a, m.b, m.q, hs.size, hs.rot, hs.x, hs.y, hs.sx, hs.sy);
    ctx.fillStyle = hs.fill;
    ctx.fill();
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  Graph editor inset
  // ═════════════════════════════════════════════════════════════════════════════════════════
  const PNL = { x: 1296, w: 460, h: 288 };
  PNL.y = CY - PNL.h / 2;
  const PLOT = { l: PNL.x + 50, r: PNL.x + PNL.w - 30, t: PNL.y + 86, b: PNL.y + PNL.h - 56 };
  const HDR = { base: PNL.y + 29, rule: PNL.y + 45.5, ruler: PNL.y + 60, foot: PNL.y + PNL.h - 40.5, fbase: PNL.y + PNL.h - 15 };
  const PT = {
    line0: 0.1, line1: 0.3, // connector + panel hairline draw on
    open0: 0.17, open1: 0.38, // panel unfolds from the hairline
    fold0: 2.13, fold1: 2.26, // panel folds back to a hairline
    ret0: 2.2, ret1: 2.335, // hairline is reeled back into the hero, gone before the recall beat
  };
  // replot times: each curve is plotted just after the previous morph finishes
  const PLOT_T = [0.25, MORPHS[0].t1 + 0.04, MORPHS[1].t1, MORPHS[2].t1 + 0.04];

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

  // The connector is a node-editor wire: an S-curve from the selection box's right-middle handle
  // into the panel, continuing as the hairline the panel unfolds from. It draws on out of the
  // hero, and is reeled back in (tip first) after the panel folds.
  function linkPath(hs) {
    const x0 = hs.box.r, y0 = (hs.box.t + hs.box.b) / 2, x1 = PNL.x, x2 = PNL.x + PNL.w;
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
  function linkState(lt, hs) {
    const inP = E.expoOut(seg(lt, PT.line0, PT.line1));
    const outP = E.expoIn(seg(lt, PT.ret0, PT.ret1));
    const end = inP * (1 - outP);
    if (end <= 0.001) return null;
    const x0 = hs.box.r, x2 = PNL.x + PNL.w;
    return { end, outP, x0, tip: lerp(x0, x2, end) }; // tip x is near-linear in trim fraction
  }

  function drawLink(ctx, lt, hs) {
    const L = linkState(lt, hs);
    if (!L) return;
    const pts = linkPath(hs);
    ctx.strokeStyle = rgba(P.bone, 0.38);
    ctx.lineWidth = 1;
    R.shape.trim(ctx, pts, 0, L.end);
    ctx.stroke();
    // node at the hero end (sits under the box's right-middle handle once the box is up)
    ctx.fillStyle = P.bone;
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], 3.2 * E.backOut(seg(lt, PT.line0, PT.line0 + 0.12)) * (1 - L.outP), 0, TAU);
    ctx.fill();
  }

  // Selection chrome: box, eight handles and a live W × H pill, like the layer is selected.
  const CH = { in0: 0.2, in1: 0.4, out0: 2.04, out1: 2.2 };
  function drawChrome(ctx, lt, hs) {
    const inU = seg(lt, CH.in0, CH.in1), outU = seg(lt, CH.out0, CH.out1);
    if (inU <= 0 || outU >= 1) return;
    const { l, r, t, b } = hs.box;
    const X = [l, (l + r) / 2, r], Y = [t, (t + b) / 2, b];
    const corners = [[l, t], [r, t], [r, b], [l, b]];
    // edges draw out from each corner (clockwise); retract back into the corners on exit
    const g = E.expoOut(seg(inU, 0.15, 1)) * (1 - E.expoIn(outU));
    ctx.strokeStyle = rgba(P.bone, 0.42);
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
    // live dimensions pill
    const pa = E.expoOut(seg(inU, 0.35, 1)) * (1 - E.quadIn(seg(outU, 0, 0.6)));
    if (pa <= 0.01) return;
    mono(ctx, 14, 1, 'center', 600);
    const label = `${Math.round(r - l)} × ${Math.round(b - t)}`;
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

  function drawPanel(ctx, lt, hs) {
    const open = E.expoOut(seg(lt, PT.open0, PT.open1)) * (1 - E.snap(seg(lt, PT.fold0, PT.fold1)));
    if (open <= 0.001) return;
    const h = PNL.h * open, top = CY - h / 2;
    // body
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = P.ink2;
    ctx.fillRect(PNL.x, top, PNL.w, h);
    ctx.restore();
    ctx.strokeStyle = rgba(P.bone, 0.22);
    ctx.lineWidth = 1;
    ctx.strokeRect(PNL.x + 0.5, top + 0.5, PNL.w - 1, h - 1);
    // contents are laid out for the open panel and revealed by the unfolding mask
    ctx.save();
    ctx.beginPath();
    ctx.rect(PNL.x + 1, top + 1, PNL.w - 2, h - 2);
    ctx.clip();
    ctx.globalAlpha = E.quadOut(seg(open, 0.3, 1));
    drawPanelContents(ctx, lt, hs);
    ctx.restore();
  }

  function drawPanelContents(ctx, lt, hs) {
    const ci = plotIndex(lt);
    const X = PNL.x;
    // ── header: tag · code · index
    const cur = CURVES[Math.max(0, ci)], prv = ci > 0 ? CURVES[ci - 1] : null;
    const t0 = PLOT_T[Math.max(0, ci)];
    const tag = swapText(prv ? prv.tag : '', cur.tag, lt, t0 - 0.04);
    const code = swapText(prv ? prv.code : '', cur.code, lt, t0 - 0.02);
    mono(ctx, 15, 2);
    ctx.fillStyle = P.gray;
    ctx.fillText(tag, X + 18, HDR.base);
    mono(ctx, 15, 0.4);
    ctx.fillStyle = P.bone;
    ctx.fillText(code, X + 102, HDR.base);
    mono(ctx, 15, 2, 'right');
    ctx.fillStyle = P.gray;
    ctx.fillText(swapText(ci > 0 ? `0${ci}/04` : '', `0${ci + 1}/04`, lt, t0 + 0.02), X + PNL.w - 16, HDR.base);
    ctx.strokeStyle = rgba(P.bone, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X, HDR.rule);
    ctx.lineTo(X + PNL.w, HDR.rule);
    ctx.stroke();

    // ── time ruler
    const { l, r, t, b } = PLOT;
    ctx.strokeStyle = rgba(P.bone, 0.28);
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const x = Math.round(lerp(l, r, i / 20)) + 0.5, len = i % 5 === 0 ? 7 : 3;
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
    ctx.strokeStyle = rgba(P.bone, 0.07);
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const x = Math.round(px(i / 4)) + 0.5;
      ctx.moveTo(x, t - 4);
      ctx.lineTo(x, b + 4);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(P.bone, 0.2);
    ctx.beginPath();
    for (const v of [0, 1]) {
      const y = Math.round(py(v)) + 0.5;
      ctx.moveTo(l - 6, y);
      ctx.lineTo(r + 6, y);
    }
    ctx.stroke();
    mono(ctx, 14, 1, 'right');
    ctx.fillStyle = P.gray;
    ctx.fillText('1', l - 14, py(1) + 4.5);
    ctx.fillText('0', l - 14, py(0) + 4.5);

    if (ci < 0) return drawFooter(ctx, lt, null, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(PNL.x + 1, HDR.ruler + 12, PNL.w - 2, HDR.foot - HDR.ruler - 14);
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
      if (fa > 0) stroke(sample(prv.f, 0, 1), rgba(P.bone, 0.85 * fa), 2);
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
        stroke(sample(env, 0, reveal, 60), rgba(P.bone, 0.22), 1);
      }
      ctx.setLineDash([]);
    }
    // ghost of the whole curve, then the inked part up to the playhead
    stroke(sample(cur.f, 0, reveal), rgba(P.bone, 0.26), 1.5);
    if (u > 0) stroke(sample(cur.f, 0, u, Math.max(2, Math.ceil(90 * u))), P.bone, 2.2);

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
      ctx.strokeStyle = rgba(P.bone, 0.5);
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
        ctx.arc(hpt[0], hpt[1], 3.5 * clamp(hp * 1.5), 0, TAU);
        ctx.fill();
      }
    }
    const ka = E.backOut(seg(lt, t0, t0 + 0.12));
    key(px(0), py(0), 8 * ka, P.bone);
    key(px(1), py(1), 8 * ka * reveal, u >= 1 ? P.bone : P.gray);

    ctx.restore(); // end plot clip — the CTI head lives on the ruler

    // playhead: CTI line + head on the ruler, value guide, dot on the curve
    const pa = E.quadOut(seg(lt, t0 + 0.04, t0 + 0.14));
    if (pa > 0) {
      const x = px(u), y = py(v);
      ctx.globalAlpha *= pa;
      ctx.strokeStyle = rgba(P.signal, 0.75);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, HDR.ruler - 4);
      ctx.lineTo(Math.round(x) + 0.5, b + 6);
      ctx.stroke();
      ctx.fillStyle = P.signal;
      ctx.beginPath();
      ctx.moveTo(x - 5, HDR.ruler - 9);
      ctx.lineTo(x + 5, HDR.ruler - 9);
      ctx.lineTo(x + 5, HDR.ruler - 3);
      ctx.lineTo(x, HDR.ruler + 2);
      ctx.lineTo(x - 5, HDR.ruler - 3);
      ctx.closePath();
      ctx.fill();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = rgba(P.bone, 0.35);
      ctx.beginPath();
      ctx.moveTo(l - 6, Math.round(y) + 0.5);
      ctx.lineTo(x, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.signal;
      ctx.fillRect(l - 9, Math.round(y) - 1, 5, 3);
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, TAU);
      ctx.fillStyle = P.signal;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = P.ink2;
      ctx.stroke();
    }
    drawFooter(ctx, lt, mi, u, v);
  }

  function drawFooter(ctx, lt, mi, u, v) {
    const X = PNL.x;
    ctx.strokeStyle = rgba(P.bone, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X, HDR.foot);
    ctx.lineTo(X + PNL.w, HDR.foot);
    ctx.stroke();
    mono(ctx, 15, 2);
    ctx.fillStyle = P.gray;
    ctx.fillText(swapText('', 'VALUE / TIME', lt, 0.27), X + 18, HDR.fbase);
    if (!mi) return;
    mono(ctx, 15, 1, 'right');
    ctx.fillStyle = P.bone;
    const ms = String(Math.round(u * mi.dur * 1000)).padStart(3, '0');
    ctx.fillText(swapText('', `T ${ms}MS   V ${v.toFixed(2)}`, lt, 0.3), X + PNL.w - 16, HDR.fbase);
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  Contract pin: in the final hold, cancel the (already sub-pixel) residual hit shake so the
  //  handoff dot is pixel-exact at (960, 540).
  // ═════════════════════════════════════════════════════════════════════════════════════════
  function pinContract(ctx, api, lt) {
    if (lt < HOLD_T - 0.02 || api.detail !== 1) return;
    const t = api.t, a = R.impact(t, 11);
    const sk = R.registry.s3.shake ?? 1;
    const sx = R.noise2(t * 38, 3.1) * a * 14, sy = R.noise2(7.7, t * 38) * a * 14, sr = R.noise2(t * 21, 19.3) * a * 0.006;
    ctx.translate(CX, CY);
    ctx.rotate(-sr * sk);
    ctx.translate(-CX - sx * sk, -CY - sy * sk);
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  R.scene({
    id: 's3',
    shake: 0.9,
    render(ctx, lt, api) {
      pinContract(ctx, api, lt);
      const hs = heroState(lt);
      if (lt < HOLD_T) {
        drawGlow(ctx, lt, hs);
        drawRings(ctx, lt, hs);
        drawField(ctx, lt, hs, api.detail);
      }
      drawHero(ctx, api, lt, hs);
      if (lt < HOLD_T) {
        drawLink(ctx, lt, hs);
        drawChrome(ctx, lt, hs);
        drawPanel(ctx, lt, hs);
      }
    },
  });
})();
