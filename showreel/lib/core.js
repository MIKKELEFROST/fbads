// Core toolkit: math, easing, springs, keyframes, noise, color, text, shapes, glyph outlines.
// All helpers are pure functions of their inputs — no hidden state, no Math.random().
(function () {
  const R = (window.R = window.R || {});

  // ───────────────────────── math ─────────────────────────
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const invlerp = (a, b, x) => (x - a) / (b - a);
  const remap = (x, a, b, c, d, clampIt = true) => {
    const t = invlerp(a, b, x);
    return lerp(c, d, clampIt ? clamp(t) : t);
  };
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const fract = (x) => x - Math.floor(x);
  const TAU = Math.PI * 2;
  R.math = { clamp, lerp, invlerp, remap, smoothstep, fract, TAU, PI: Math.PI };

  // Normalized progress of t through [a, b], clamped to 0..1.
  R.seg = (t, a, b) => clamp((t - a) / (b - a));
  // Beat helpers (beat index n → seconds, and seconds → beat float).
  R.beat = (n) => n * R.BEAT;
  R.beats = (t) => t / R.BEAT;

  // ───────────────────────── easing ─────────────────────────
  // Every ease maps 0..1 → 0..1 (overshooting ones may exceed).
  const E = {};
  E.linear = (t) => t;
  const pow = (p) => ({
    in: (t) => Math.pow(t, p),
    out: (t) => 1 - Math.pow(1 - t, p),
    inOut: (t) => (t < 0.5 ? Math.pow(2 * t, p) / 2 : 1 - Math.pow(2 - 2 * t, p) / 2),
  });
  [['quad', 2], ['cubic', 3], ['quart', 4], ['quint', 5]].forEach(([n, p]) => {
    const f = pow(p);
    E[n + 'In'] = f.in;
    E[n + 'Out'] = f.out;
    E[n + 'InOut'] = f.inOut;
  });
  E.sineIn = (t) => 1 - Math.cos((t * Math.PI) / 2);
  E.sineOut = (t) => Math.sin((t * Math.PI) / 2);
  E.sineInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
  E.expoIn = (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
  E.expoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  E.expoInOut = (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
  E.circIn = (t) => 1 - Math.sqrt(1 - t * t);
  E.circOut = (t) => Math.sqrt(1 - (t - 1) * (t - 1));
  E.circInOut = (t) =>
    t < 0.5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
  E.backIn = (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t;
  E.backOut = (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
  E.backInOut = (t, s = 1.70158 * 1.525) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((s + 1) * 2 * t - s)) / 2
      : (Math.pow(2 * t - 2, 2) * ((s + 1) * (t * 2 - 2) + s) + 2) / 2;
  E.elasticOut = (t, amp = 1, period = 0.3) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const s = (period / TAU) * Math.asin(1 / Math.max(1, amp));
    return Math.max(1, amp) * Math.pow(2, -10 * t) * Math.sin(((t - s) * TAU) / period) + 1;
  };
  E.bounceOut = (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  };
  // CSS-style cubic-bezier(x1,y1,x2,y2). Returns an ease function.
  E.bezier = (x1, y1, x2, y2) => {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (u) => ((ax * u + bx) * u + cx) * u;
    const sy = (u) => ((ay * u + by) * u + cy) * u;
    const dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(u) - x;
        if (Math.abs(e) < 1e-6) break;
        const d = dx(u);
        if (Math.abs(d) < 1e-6) break;
        u -= e / d;
      }
      u = clamp(u);
      return sy(u);
    };
  };
  // Motion-design house curves.
  E.snap = E.bezier(0.7, 0, 0.2, 1); // hard anticipation → fast settle (the "house" curve)
  E.swift = E.bezier(0.2, 0.9, 0.1, 1); // very fast out, long tail
  E.whip = E.bezier(0.9, 0, 0.1, 1); // whip-pan style inOut
  E.soft = E.bezier(0.4, 0, 0.2, 1); // material standard
  R.ease = E;

  // ───────────────────────── springs ─────────────────────────
  // Closed-form damped spring from 0 → 1. t in seconds since release.
  // stiffness k, damping c, mass m, initial velocity v0 (in units/s, normalized).
  R.spring = (t, { k = 180, c = 12, m = 1, v0 = 0 } = {}) => {
    if (t <= 0) return 0;
    const w0 = Math.sqrt(k / m);
    const zeta = c / (2 * Math.sqrt(k * m));
    const x0 = -1; // displacement from target (start at 0, target 1)
    let x;
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      x = Math.exp(-zeta * w0 * t) * (x0 * Math.cos(wd * t) + ((v0 + zeta * w0 * x0) / wd) * Math.sin(wd * t));
    } else if (zeta === 1) {
      x = Math.exp(-w0 * t) * (x0 + (v0 + w0 * x0) * t);
    } else {
      const r1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
      const r2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
      const B = (v0 - r1 * x0) / (r2 - r1);
      const A = x0 - B;
      x = A * Math.exp(r1 * t) + B * Math.exp(r2 * t);
    }
    return 1 + x;
  };
  // Presets
  R.spring.bouncy = (t) => R.spring(t, { k: 260, c: 11 });
  R.spring.snappy = (t) => R.spring(t, { k: 420, c: 30 });
  R.spring.gentle = (t) => R.spring(t, { k: 120, c: 16 });
  R.spring.wobbly = (t) => R.spring(t, { k: 180, c: 7 });

  // ───────────────────────── keyframes ─────────────────────────
  // After-Effects-style keyframes. keys: [[time, value, easeIntoThisKey?], ...] sorted by time.
  // value may be a number or an array of numbers. The ease on key i shapes the segment (i-1 → i).
  // Ease may be a function or a name in R.ease. Holds before first / after last key.
  R.keys = (t, keys) => {
    if (t <= keys[0][0]) return keys[0][1];
    const last = keys[keys.length - 1];
    if (t >= last[0]) return last[1];
    let i = 1;
    while (i < keys.length && keys[i][0] < t) i++;
    const [t0, v0] = keys[i - 1];
    const [t1, v1, e] = keys[i];
    let u = (t - t0) / (t1 - t0);
    const f = typeof e === 'function' ? e : e ? E[e] : E.soft;
    u = f(u);
    if (Array.isArray(v0)) return v0.map((a, j) => lerp(a, v1[j], u));
    return lerp(v0, v1, u);
  };

  // Stagger: delay for item i of n spread across `spread` seconds, optional from-center.
  R.stagger = (i, n, spread, { from = 'start' } = {}) => {
    if (n <= 1) return 0;
    let k = i / (n - 1);
    if (from === 'center') k = Math.abs(k - 0.5) * 2;
    else if (from === 'end') k = 1 - k;
    return k * spread;
  };

  // ───────────────────────── random + noise ─────────────────────────
  // Seeded PRNG (mulberry32). R.rng(seed)() → [0,1).
  R.rng = (seed = 1) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // Stateless hash → [0,1)
  R.hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return s - Math.floor(s);
  };

  // Simplex noise 2D/3D (Gustavson), seeded. Output ≈ -1..1.
  const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
  const perm = new Uint8Array(512);
  (() => {
    const r = R.rng(1337);
    const p = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  R.noise2 = (xin, yin) => {
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = grad3[perm[ii + perm[jj]] % 12]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = grad3[perm[ii + i1 + perm[jj + j1]] % 12]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = grad3[perm[ii + 1 + perm[jj + 1]] % 12]; t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * (n0 + n1 + n2);
  };
  const F3 = 1 / 3, G3 = 1 / 6;
  R.noise3 = (x, y, z) => {
    let n0, n1, n2, n3;
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const c = (tt, gi, xx, yy, zz) => {
      if (tt < 0) return 0;
      const g = grad3[gi];
      tt *= tt;
      return tt * tt * (g[0] * xx + g[1] * yy + g[2] * zz);
    };
    n0 = c(0.6 - x0 * x0 - y0 * y0 - z0 * z0, perm[ii + perm[jj + perm[kk]]] % 12, x0, y0, z0);
    n1 = c(0.6 - x1 * x1 - y1 * y1 - z1 * z1, perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12, x1, y1, z1);
    n2 = c(0.6 - x2 * x2 - y2 * y2 - z2 * z2, perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12, x2, y2, z2);
    n3 = c(0.6 - x3 * x3 - y3 * y3 - z3 * z3, perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12, x3, y3, z3);
    return 32 * (n0 + n1 + n2 + n3);
  };
  R.fbm2 = (x, y, oct = 4) => {
    let a = 0.5, f = 1, s = 0;
    for (let i = 0; i < oct; i++) { s += a * R.noise2(x * f, y * f); f *= 2; a *= 0.5; }
    return s;
  };

  // ───────────────────────── color ─────────────────────────
  const hexToRgb = (h) => {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const toCss = (r, g, b, a = 1) =>
    a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${Math.max(0, a).toFixed(4)})`;
  R.col = {
    rgb: hexToRgb,
    rgba: (hex, a) => { const [r, g, b] = hexToRgb(hex); return toCss(r, g, b, a); },
    mix: (h1, h2, t, a = 1) => {
      const c1 = hexToRgb(h1), c2 = hexToRgb(h2);
      return toCss(lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), a);
    },
    // normalized [r,g,b] 0..1 for shader uniforms
    vec: (hex) => hexToRgb(hex).map((v) => v / 255),
  };

  // ───────────────────────── text ─────────────────────────
  // Families loaded in index.html:
  //   'Unbounded' (variable wght 200–900)     — display
  //   'Inter Tight' (variable wght 100–900)   — grotesk, supports italic
  //   'Instrument Serif' (400, normal+italic) — elegant contrast
  //   'JetBrains Mono' (variable wght 100–800) — UI / labels / timecode
  R.font = (ctx, { family = 'Inter Tight', weight = 700, size = 100, style = 'normal', spacing = 0, align = 'center', baseline = 'alphabetic' } = {}) => {
    ctx.font = `${style} ${Math.round(weight)} ${size}px "${family}"`;
    ctx.letterSpacing = `${spacing}px`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
  };
  // Per-glyph layout: returns [{ch, x, w}] where x is the glyph's left edge relative to a left-aligned origin,
  // plus total width. Uses the current ctx.font + letterSpacing.
  R.layoutText = (ctx, str) => {
    const saved = ctx.textAlign;
    ctx.textAlign = 'left';
    const out = [];
    let x = 0;
    for (let i = 0; i < str.length; i++) {
      const pre = ctx.measureText(str.slice(0, i)).width;
      const w = ctx.measureText(str[i]).width;
      out.push({ ch: str[i], x: pre, w });
      x = ctx.measureText(str.slice(0, i + 1)).width;
    }
    ctx.textAlign = saved;
    return { glyphs: out, width: x };
  };
  // Draw text glyph-by-glyph with a per-glyph transform callback.
  // fn(i, glyph, n) → {dx, dy, sx, sy, rot, alpha, fill, skip} (all optional). Anchor = glyph center at baseline.
  // align: 'left' | 'center' | 'right' relative to (x, y). Uses current ctx.font.
  R.drawGlyphs = (ctx, str, x, y, fn, { align = 'center' } = {}) => {
    const { glyphs, width } = R.layoutText(ctx, str);
    const ox = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    const savedAlign = ctx.textAlign;
    ctx.textAlign = 'center';
    glyphs.forEach((g, i) => {
      const o = (fn && fn(i, g, glyphs.length)) || {};
      if (o.skip) return;
      ctx.save();
      ctx.translate(ox + g.x + g.w / 2 + (o.dx || 0), y + (o.dy || 0));
      if (o.rot) ctx.rotate(o.rot);
      if (o.sx !== undefined || o.sy !== undefined) ctx.scale(o.sx ?? 1, o.sy ?? 1);
      if (o.alpha !== undefined) ctx.globalAlpha *= clamp(o.alpha);
      if (o.fill) ctx.fillStyle = o.fill;
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.strokeText(g.ch, 0, 0); } else ctx.fillText(g.ch, 0, 0);
      ctx.restore();
    });
    ctx.textAlign = savedAlign;
    return { width, left: ox };
  };

  // ───────────────────────── shapes ─────────────────────────
  // Point lists are arrays of [x, y]. Morph between any two shapes by resampling to the same count.
  const S = {};
  S.circle = (r, n = 128, rot = -Math.PI / 2) =>
    Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * TAU; return [Math.cos(a) * r, Math.sin(a) * r]; });
  S.poly = (sides, r, rot = -Math.PI / 2) =>
    Array.from({ length: sides }, (_, i) => { const a = rot + (i / sides) * TAU; return [Math.cos(a) * r, Math.sin(a) * r]; });
  S.star = (points, r1, r2, rot = -Math.PI / 2) =>
    Array.from({ length: points * 2 }, (_, i) => {
      const a = rot + (i / (points * 2)) * TAU;
      const r = i % 2 ? r2 : r1;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
  S.rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  // Resample a closed polygon to n evenly spaced points (by arc length), starting at pts[0].
  S.resample = (pts, n = 128) => {
    const L = [];
    let total = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      L.push(d);
      total += d;
    }
    const out = [];
    let seg = 0, acc = 0;
    for (let k = 0; k < n; k++) {
      const target = (k / n) * total;
      while (acc + L[seg] < target && seg < pts.length - 1) { acc += L[seg]; seg++; }
      const a = pts[seg], b = pts[(seg + 1) % pts.length];
      const u = L[seg] ? (target - acc) / L[seg] : 0;
      out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u)]);
    }
    return out;
  };
  S.lerp = (A, B, t) => A.map((p, i) => [lerp(p[0], B[i][0], t), lerp(p[1], B[i][1], t)]);
  S.path = (ctx, pts, close = true) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    if (close) ctx.closePath();
  };
  // Polyline length + partial draw (trim paths, like AE "Trim Paths"). start/end in 0..1.
  S.trim = (ctx, pts, start, end, close = false) => {
    const P = close ? [...pts, pts[0]] : pts;
    const L = [0];
    for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = L[L.length - 1];
    const s = clamp(start) * total, e = clamp(end) * total;
    if (e <= s) return;
    ctx.beginPath();
    let started = false;
    for (let i = 1; i < P.length; i++) {
      const l0 = L[i - 1], l1 = L[i];
      if (l1 < s || l0 > e) continue;
      const u0 = clamp((s - l0) / (l1 - l0 || 1)), u1 = clamp((e - l0) / (l1 - l0 || 1));
      const a = [lerp(P[i - 1][0], P[i][0], u0), lerp(P[i - 1][1], P[i][1], u0)];
      const b = [lerp(P[i - 1][0], P[i][0], u1), lerp(P[i - 1][1], P[i][1], u1)];
      if (!started) { ctx.moveTo(a[0], a[1]); started = true; }
      ctx.lineTo(b[0], b[1]);
    }
  };
  R.shape = S;

  // ───────────────────────── 3D ─────────────────────────
  // Minimal 3D: rotate + perspective project. Camera looks down -z; focal length f in px.
  R.v3 = {
    rotX: ([x, y, z], a) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)],
    rotY: ([x, y, z], a) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)],
    rotZ: ([x, y, z], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z],
    // returns [sx, sy, scale, depth] with screen center (cx, cy); camera at z = camZ looking toward -z.
    project: ([x, y, z], { f = 1200, camZ = 1200, cx = 960, cy = 540 } = {}) => {
      const d = camZ - z;
      const s = f / Math.max(1e-3, d);
      return [cx + x * s, cy + y * s, s, d];
    },
  };

  // ───────────────────────── glyph outlines ─────────────────────────
  // Vector outlines of real text via opentype.js (static WOFF files).
  // Keys: 'unbounded900', 'unbounded700', 'unbounded300', 'inter900', 'inter600', 'serifItalic', 'mono500'.
  R.glyph = {
    fonts: {},
    cache: new Map(),
    // Returns { letters: [{ch, x, advance, contours: [[ [x,y], ... ], ...], path: Path2D }], width, ascender, path: Path2D }
    // Coordinates: origin at left baseline, y down (canvas convention). `tol` = flattening step in px.
    outline(key, text, size, { spacing = 0, tol = 2 } = {}) {
      const ck = [key, text, size, spacing, tol].join('|');
      if (this.cache.has(ck)) return this.cache.get(ck);
      const font = this.fonts[key];
      if (!font) throw new Error('glyph font not loaded: ' + key);
      const scale = size / font.unitsPerEm;
      let x = 0;
      const letters = [];
      const all = new Path2D();
      const glyphs = font.stringToGlyphs(text);
      glyphs.forEach((g, i) => {
        const p = g.getPath(x, 0, size);
        const contours = flattenCommands(p.commands, tol);
        const path2d = new Path2D(p.toPathData(3));
        all.addPath(path2d);
        const adv = g.advanceWidth * scale;
        letters.push({ ch: text[i], x, advance: adv, contours, path: path2d });
        let kern = 0;
        if (i < glyphs.length - 1) kern = font.getKerningValue(g, glyphs[i + 1]) * scale;
        x += adv + kern + spacing;
      });
      const res = { letters, width: x - spacing, ascender: font.ascender * scale, descender: font.descender * scale, path: all };
      this.cache.set(ck, res);
      return res;
    },
  };
  function flattenCommands(cmds, tol) {
    const contours = [];
    let cur = null, px = 0, py = 0;
    const push = (x, y) => cur.push([x, y]);
    for (const c of cmds) {
      if (c.type === 'M') { cur = [[c.x, c.y]]; contours.push(cur); px = c.x; py = c.y; }
      else if (c.type === 'L') { push(c.x, c.y); px = c.x; py = c.y; }
      else if (c.type === 'Q') {
        const n = Math.max(2, Math.ceil(Math.hypot(c.x - px, c.y - py) / tol));
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          push(u * u * px + 2 * u * t * c.x1 + t * t * c.x, u * u * py + 2 * u * t * c.y1 + t * t * c.y);
        }
        px = c.x; py = c.y;
      } else if (c.type === 'C') {
        const n = Math.max(2, Math.ceil(Math.hypot(c.x - px, c.y - py) / tol));
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          push(
            u * u * u * px + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
            u * u * u * py + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y
          );
        }
        px = c.x; py = c.y;
      }
    }
    return contours.filter((c) => c.length > 2);
  }
})();
