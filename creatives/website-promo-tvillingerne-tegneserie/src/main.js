/*
 * "Tvillingerne · tegneserie" — the split-screen ad from creatives/website-promo-tvillingerne, told as a comic page.
 * Same story and the same beat grid (120 BPM, 30 beats = 15 s); every frame is a pure function of time: __seek(t)
 * redraws the 1080x1920 canvas for time t. All copy comes from config.js.
 *
 *   0.0  one panel, one carpenter; on beat 0.5 the panel tears down the middle (RRRIP!) into two, one twin in each
 *   0.5  "TO TØMRERE. LIGE DYGTIGE." — both toss a hammer (SVUP!) and catch it (KLAP!), five stars each
 *   2.8  "SAMME VÆRKTØJ. SAMME PRIS." — saw, level and drill swap in on the beat, then a price sticker (KA-CHING!)
 *   5.5  "MEN KUN DEN ENE … FÅR OPGAVERNE." — the right phone rings (RIIING!), job balloons pop out of it (PLING!)
 *        and his counter climbs. The left panel goes grey: KRIK … KRIK …, a sweat drop, a cobweb on his phone, a
 *        tumbleweed, a shrug
 *   9.3  "ÉN FORSKEL: HJEMMESIDEN." — close-up panels with focus lines: no website on the left, his website on the
 *        right, ringed in red marker
 *  11.3  the right panel slams the left one off the page (BAM!); the page turns into a comic cover with sitecrew,
 *        the tagline and the CTA
 *
 * Comic rendering: every group of shapes (an arm, the head, the torso …) is drawn twice, first as a fat black
 * silhouette and then in colour, so it gets a clean outer contour; inner lines are thinner. Shadows are cel-shaded
 * with Ben-Day dots that stay in screen space, like print. Text sits between 17 % and 60 % of the height, clear of
 * the Reels UI.
 */
(function () {
  'use strict';
  const { clamp, lerp, prog, E, spring, kf, rng } = A;
  const CFG = window.CONFIG;
  const K = CFG.colors;
  const W = 1080, H = 1920;
  const BPM = 120;
  const B = 60 / BPM;
  const b = (n) => n * B;
  const DUR = b(30);
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const TAU = Math.PI * 2;
  const HEAD = "'Archivo'", UI = "'Inter'";
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---------------------------------------------------------------- colour: every fill goes through C()
  // SAT/DIM drain the left panel of colour while nothing happens there
  let SAT = 1, DIM = 1;
  const rgbCache = new Map();
  function rgbOf(h) {
    let v = rgbCache.get(h);
    if (!v) { const n = parseInt(h.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; rgbCache.set(h, v); }
    return v;
  }
  function C(h, a = 1) {
    const [r, g, bl] = rgbOf(h);
    if (SAT === 1 && DIM === 1) return `rgba(${r},${g},${bl},${a})`;
    const l = 0.299 * r + 0.587 * g + 0.114 * bl;
    const f = (v) => Math.round(clamp((l + (v - l) * SAT) * DIM, 0, 255));
    return `rgba(${f(r)},${f(g)},${f(bl)},${a})`;
  }
  const P = { // the twins' palette
    skin: '#f3b58c', skinSh: '#d4845d', hair: '#271a15', hairHi: '#6c86ad', mouth: '#5c1d18', tongue: '#e0706a',
    shirt: '#d8322e', shirtSh: '#9c1c1f', check: '#4a0a10', checkHi: '#ffd6a0', tee: '#f6efe3', cuff: '#f08a7c',
    jeans: '#3d66b8', jeansSh: '#26488e', belt: '#8a4f25', buckle: '#f1c143', pouch: '#6a3a1b', pencil: '#e8342a',
    rule: '#ffd23f', steel: '#cfd6de', steelSh: '#8d96a1', wood: '#e2a561', woodSh: '#ad7539', phone: '#1b1d27',
    sweat: '#9fdcf5',
  };

  // ---------------------------------------------------------------- timeline (seconds), as in the flat version
  const T = {
    split: b(0.5),
    h1: [b(1), b(3)], h1out: b(5.5),
    lift: b(1.25), toss: b(2), catch: b(3), stars: [b(4), b(4.25), b(4.5), b(4.75), b(5)], starsOut: b(5.5),
    h2: [b(6), b(8.5)], h2out: b(10.5),
    tools: [b(6.5), b(7), b(7.5)], toolsOut: b(10.25), sticker: b(9),
    h3: [b(11), b(12.25)], h3out: b(18),
    phones: b(11.5), counters: b(11.75), ring: b(12), answer: b(13), hangup: b(18.25),
    cards: [b(13.5), b(14.5), b(15.5), b(16.5)], thumb: b(17.25),
    grey0: b(12.5), grey1: b(17), tapL: b(13), shakeL: b(14), sweat: b(14.75), web: b(15), tumble0: b(15.25), bump: b(17.25), shrug: b(17.5),
    crickets: [b(12.75), b(14.5), b(16.25)],
    h4: [b(18.5), b(19.75)], h4out: b(22.25),
    reveal: b(18.5), circle: b(20.25),
    expand: b(22.5), logo: b(23.5), word: b(24), tag: b(25), cta: b(25.75),
  };
  const BLINKS = [0.95, 2.62, 4.18, 5.9, 7.42, 9.05, 10.3, 12.9, 14.2];

  // ---------------------------------------------------------------- small helpers
  function kf2(t, keys) { // keyframes of [x, y] points
    return [kf(t, keys.map(([tt, v, e]) => [tt, v[0], e])), kf(t, keys.map(([tt, v, e]) => [tt, v[1], e]))];
  }
  const pop = (t, t0, d = 0.22) => (t < t0 ? 0 : E.outBack(prog(t, t0, d)));
  const blinkAt = (t, off = 0) => BLINKS.some((x) => Math.abs(t - x - off) < 0.06) ? 1 : 0;
  function groove(t, from, to) { // a small dip right on each beat
    if (t < from || t >= to) return 0;
    const ph = ((t - from) / B) % 1;
    return 7 * Math.exp(-ph / 0.14) - 1.5;
  }
  function pRR(x, y, w, h, r) {
    const p = new Path2D();
    r = Math.min(r, w / 2, h / 2);
    p.moveTo(x + r, y);
    p.arcTo(x + w, y, x + w, y + h, r);
    p.arcTo(x + w, y + h, x, y + h, r);
    p.arcTo(x, y + h, x, y, r);
    p.arcTo(x, y, x + w, y, r);
    p.closePath();
    return p;
  }
  function pCircle(x, y, r) { const p = new Path2D(); p.arc(x, y, Math.max(0.01, r), 0, TAU); return p; }
  function pEllipse(x, y, rx, ry, rot = 0) { const p = new Path2D(); p.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); return p; }
  function pPoly(pts) { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; }
  // a tapered capsule from (x0,y0) to (x1,y1): a limb, a finger, a handle
  function pLimb(x0, y0, x1, y1, w0, w1) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    const p = new Path2D();
    p.arc(x0, y0, w0 / 2, a + Math.PI / 2, a - Math.PI / 2);
    p.arc(x1, y1, w1 / 2, a - Math.PI / 2, a + Math.PI / 2);
    p.closePath();
    return p;
  }
  function pStar(x, y, r, rot = 0, inner = 0.46, n = 5) {
    const p = new Path2D();
    for (let k = 0; k < 2 * n; k++) {
      const a = rot - Math.PI / 2 + (k * Math.PI) / n, rad = k % 2 ? r * inner : r;
      k ? p.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad) : p.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    p.closePath();
    return p;
  }
  // a jagged starburst (price stickers, the ring, the cover)
  function pBurst(x, y, r0, r1, n, seed = 1, rot = 0) {
    const p = new Path2D();
    for (let k = 0; k < 2 * n; k++) {
      const a = rot + (k * Math.PI) / n;
      const rad = k % 2 ? r0 * (0.92 + 0.16 * hash(seed + k)) : r1 * (0.9 + 0.2 * hash(seed + k + 99));
      k ? p.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad) : p.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    p.closePath();
    return p;
  }

  // ---------------------------------------------------------------- ink: outlines, cel shading, Ben-Day dots
  let INK = false;         // true during the silhouette pass
  const INK_PX = 4;        // the outer contour, in screen pixels
  const LINE_PX = 2.6;     // inner lines, in screen pixels
  const lw = (c, px) => { const m = c.getTransform(); return px / Math.hypot(m.a, m.b); };
  // fill a shape; in the silhouette pass it becomes a fat black shape instead
  function paint(c, path, col, line = true) {
    if (INK) {
      c.fillStyle = K.ink;
      c.fill(path);
      c.lineJoin = 'round';
      c.strokeStyle = K.ink;
      c.lineWidth = lw(c, 2 * INK_PX);
      c.stroke(path);
      return;
    }
    c.fillStyle = col;
    c.fill(path);
    if (line) {
      c.lineJoin = 'round';
      c.strokeStyle = K.ink;
      c.lineWidth = lw(c, LINE_PX);
      c.stroke(path);
    }
  }
  function inked(c, fn) { INK = true; fn(); INK = false; fn(); }
  // an ink line (only in the colour pass)
  function inkLine(c, pts, px = LINE_PX, col = K.ink) {
    if (INK) return;
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = col;
    c.lineWidth = lw(c, px);
    c.stroke();
  }
  // Ben-Day dots on a 45° grid, anchored to the screen whatever the current transform
  const patCache = new Map();
  function dots(c, col, step = 9, r = 2.2) {
    const key = `${col}|${step}|${r}`;
    let pat = patCache.get(key);
    if (!pat) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = step;
      const g = cv.getContext('2d');
      g.fillStyle = col;
      for (const [x, y] of [[0, 0], [step, 0], [0, step], [step, step], [step / 2, step / 2]]) {
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      }
      pat = ctx.createPattern(cv, 'repeat');
      patCache.set(key, pat);
    }
    pat.setTransform(c.getTransform().inverse());
    return pat;
  }
  // cel shadow inside `path`: the part left of x0 (local units: the inner side) gets a darker tone and dots
  function shade(c, path, col, x0, dotsOn = true) {
    if (INK) return;
    c.save();
    c.clip(path);
    c.fillStyle = col;
    c.fillRect(-4000, -4000, 4000 + x0, 8000);
    if (dotsOn) {
      c.fillStyle = dots(c, 'rgba(20,16,19,0.3)', 8, 1.9);
      c.fillRect(-4000, -4000, 4000 + x0, 8000);
    }
    c.restore();
  }
  // a glossy highlight streak (only in the colour pass)
  function gloss(c, path, pts, px) {
    if (INK) return;
    c.save();
    c.clip(path);
    inkLine(c, pts, px, 'rgba(255,255,255,0.55)');
    c.restore();
  }

  // ---------------------------------------------------------------- lettering
  // hand-lettered text: each letter a little rotated and scaled, skewed like comic lettering. opt: size, weight,
  // stretch, fill (colour or [top, bottom] gradient), stroke, strokeW, extrude, extrudeCol, jitter, skew, track,
  // seed, and for popping in letter by letter: t, t0, stagger
  function letters(c, text, x, y, opt) {
    const size = opt.size;
    c.save();
    c.translate(x, y);
    if (opt.rot) c.rotate(opt.rot);
    c.font = `${opt.weight || 900} ${size}px ${HEAD}`;
    c.fontStretch = opt.stretch || 'condensed';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    const chars = [...text];
    const widths = chars.map((ch) => c.measureText(ch).width);
    const track = opt.track || 0;
    const total = widths.reduce((a, v) => a + v, 0) + track * (chars.length - 1);
    let xx = opt.align === 'left' ? 0 : -total / 2;
    const seed = opt.seed || 1;
    chars.forEach((ch, i) => {
      const pl = opt.t === undefined ? 1 : pop(opt.t, opt.t0 + i * (opt.stagger || 0), opt.popDur || 0.2);
      if (pl > 0.001 && ch !== ' ') {
        c.save();
        c.translate(xx + widths[i] / 2, -size * 0.36);
        c.rotate((hash(seed + i) - 0.5) * (opt.jitter ?? 0.1));
        const s = pl * (1 + (hash(seed + i + 50) - 0.5) * (opt.jitter ?? 0.1));
        c.scale(s, s);
        c.transform(1, 0, opt.skew ?? -0.14, 1, 0, 0);
        const ox = -widths[i] / 2, oy = size * 0.36;
        c.lineJoin = 'round';
        if (opt.extrude) {
          c.fillStyle = opt.extrudeCol || K.ink;
          c.strokeStyle = opt.extrudeCol || K.ink;
          c.lineWidth = opt.strokeW || size * 0.12;
          for (let e = opt.extrude; e > 0; e -= 3) {
            c.strokeText(ch, ox + e, oy + e);
            c.fillText(ch, ox + e, oy + e);
          }
        }
        if (opt.stroke) {
          c.strokeStyle = opt.stroke;
          c.lineWidth = opt.strokeW || size * 0.12;
          c.strokeText(ch, ox, oy);
        }
        if (Array.isArray(opt.fill)) {
          const g = c.createLinearGradient(0, oy - size * 0.72, 0, oy);
          g.addColorStop(0, opt.fill[0]);
          g.addColorStop(1, opt.fill[1]);
          c.fillStyle = g;
        } else c.fillStyle = opt.fill || K.ink;
        c.fillText(ch, ox, oy);
        c.restore();
      }
      xx += widths[i] + track;
    });
    c.restore();
    return total;
  }
  // a sound effect: big, outlined, extruded, popping in letter by letter, then popping out
  function sfx(c, text, x, y, t, t0, t1, opt = {}) {
    if (t < t0 || t > t1 + 0.2) return;
    const out = 1 - E.inBack(prog(t, t1, 0.18));
    const shake = opt.shake ? opt.shake * Math.sin((t - t0) * 60) * Math.exp(-(t - t0) * 2.5) : 0;
    c.save();
    c.translate(x + shake, y);
    c.scale(out, out);
    letters(c, text, 0, 0, {
      size: opt.size || 110, rot: opt.rot || 0, fill: opt.fill || [K.yellow, '#ff9a2e'], stroke: K.ink, strokeW: (opt.size || 110) * 0.13,
      extrude: opt.extrude ?? 10, jitter: 0.18, skew: -0.16, seed: opt.seed || text.length, t, t0, stagger: opt.stagger ?? 0.035, popDur: 0.2,
      stretch: opt.stretch, weight: opt.weight, extrudeCol: opt.extrudeCol,
    });
    c.restore();
  }
  // a caption box: yellow, inked, the text in comic capitals
  function caption(c, text, x, y, t, t0, t1, opt = {}) {
    if (t < t0 || t > t1 + 0.2) return;
    const inn = E.outBack(prog(t, t0, 0.22));
    const out = 1 - E.inBack(prog(t, t1, 0.16));
    const size = opt.size || 60;
    c.save();
    c.font = `800 ${size}px ${HEAD}`;
    c.fontStretch = 'semi-condensed';
    const tw = c.measureText(text.toUpperCase()).width;
    const w = tw + size * 0.8, h = size * 1.42;
    c.translate(x, y);
    c.rotate((opt.rot || 0) + (1 - clamp(inn)) * 0.12);
    c.scale(inn * out, inn * out);
    // hard offset shadow, like a printed panel
    c.fillStyle = K.ink;
    c.fillRect(-w / 2 + 9, -h / 2 + 9, w, h);
    c.fillStyle = opt.fill || K.yellow;
    c.fillRect(-w / 2, -h / 2, w, h);
    c.lineWidth = 6;
    c.strokeStyle = K.ink;
    c.strokeRect(-w / 2, -h / 2, w, h);
    letters(c, text.toUpperCase(), 0, size * 0.36, { size, weight: 800, stretch: 'semi-condensed', fill: K.ink, jitter: 0.05, skew: -0.08, seed: text.length * 7 });
    c.restore();
  }

  // ---------------------------------------------------------------- the twin: a comic rig, feet at (0, 0), facing us
  const RIG = { shX: 120, shY: -772, L1: 152, L2: 140, headY: -890, headR: 86 };
  const HIP_O = [104, -500], HIP_I = [-104, -500];   // hands on hips (outer = screen-right when not mirrored)
  const READY = [138, -792];                          // outer hand holding a tool up by the shoulder
  const CHEST = [60, -646];                           // outer hand holding the phone in front of the chest
  const EAR = [100, -872];                            // phone at the ear
  const SHOW = [30, -830];                            // phone held up to the camera, in front of the face
  const TOOL_S = 1.2;
  const POLE_O = [1, 0.35], POLE_I = [-1, 0.35], POLE_UP = [0.5, 1], POLE_DOWN_O = [0.25, 1], POLE_DOWN_I = [-0.3, 1];
  function ik(sx, sy, tx, ty, L1, L2, pole) {
    let dx = tx - sx, dy = ty - sy;
    let d = Math.hypot(dx, dy);
    const dmax = L1 + L2 - 0.5;
    if (d > dmax) { dx *= dmax / d; dy *= dmax / d; d = dmax; }
    const a = Math.atan2(dy, dx);
    const A1 = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const side = dx * pole[1] - dy * pole[0] >= 0 ? 1 : -1;
    const ang = a + side * A1;
    return { ex: sx + L1 * Math.cos(ang), ey: sy + L1 * Math.sin(ang), hx: sx + dx, hy: sy + dy };
  }

  // red flannel: dark bands both ways, where they cross it gets darker, thin light lines between
  function flannel(c, path) {
    if (INK) return;
    c.save();
    c.clip(path);
    c.fillStyle = C(P.check, 0.42);
    for (let x = -312; x < 320; x += 58) c.fillRect(x, -1400, 24, 1600);
    for (let y = -1400; y < 100; y += 58) c.fillRect(-400, y, 800, 24);
    c.fillStyle = C(P.checkHi, 0.3);
    for (let x = -312; x < 320; x += 58) c.fillRect(x + 38, -1400, 4, 1600);
    for (let y = -1400; y < 100; y += 58) c.fillRect(-400, y + 38, 800, 4);
    c.restore();
  }

  function legs(c) {
    for (const s of [-1, 1]) {
      const p = pLimb(s * 46, -472, s * 52, -60, 90, 78);
      paint(c, p, C(P.jeans));
      shade(c, p, C(P.jeansSh), s * 52 - 14);
      if (!INK) {
        paint(c, pRR(s * 52 - 33, -300, 66, 74, 18), C(P.jeansSh)); // knee patch
        inkLine(c, [[s * 30, -440], [s * 36, -120]], 2, C('#9fb8e8', 0.8)); // seam
      }
    }
    // folding rule in the outer thigh pocket
    const rule = pRR(78, -452, 20, 80, 3);
    paint(c, rule, C(P.rule));
    if (!INK) for (let k = 0; k < 5; k++) inkLine(c, [[80, -442 + k * 14], [88, -442 + k * 14]], 2);
  }

  function torso(c, shY) {
    const p = new Path2D();
    p.moveTo(-104, -468);
    p.lineTo(-118, -700);
    p.quadraticCurveTo(-124, shY - 20, -62, shY - 28);
    p.lineTo(62, shY - 28);
    p.quadraticCurveTo(124, shY - 20, 118, -700);
    p.lineTo(104, -468);
    p.closePath();
    paint(c, p, C(P.shirt), false);
    flannel(c, p);
    shade(c, p, C(P.shirtSh, 0.6), -34);
    if (!INK) {
      // placket and buttons
      inkLine(c, [[0, shY + 26], [0, -505]], 2.4);
      for (const y of [-716, -652, -588]) paint(c, pCircle(7, y, 5), C(P.tee));
      // chest pocket with its flap
      paint(c, pRR(30, -684, 60, 64, 5), C(P.shirt));
      flannel(c, pRR(30, -684, 60, 64, 5));
      paint(c, pPoly([[27, -690], [93, -690], [93, -668], [60, -660], [27, -668]]), C(P.shirtSh));
      // a pencil in the pocket
      paint(c, pRR(38, -724, 11, 44, 3), C(P.rule));
    }
    // tee in the open collar, then the collar flaps
    paint(c, pPoly([[-32, shY - 27], [32, shY - 27], [0, shY + 24]]), C(P.tee));
    paint(c, pPoly([[-64, shY - 31], [-26, shY - 31], [-2, shY + 26], [-40, shY + 12]]), C(P.shirt));
    paint(c, pPoly([[64, shY - 31], [26, shY - 31], [2, shY + 26], [40, shY + 12]]), C(P.shirt));
    // belt, buckle, tool pouch with pencils
    paint(c, pRR(-108, -514, 216, 34, 5), C(P.belt));
    paint(c, pRR(-20, -518, 40, 42, 7), C(P.buckle));
    if (!INK) paint(c, pRR(-9, -507, 18, 20, 3), C(P.belt));
    paint(c, pRR(-116, -552, 9, 50, 3), C(P.pencil));
    paint(c, pRR(-102, -546, 9, 44, 3), C(P.rule));
    const pouch = pRR(-140, -500, 62, 110, 12);
    paint(c, pouch, C(P.pouch));
    shade(c, pouch, C('#4a260f'), -120, false);
    paint(c, pRR(-144, -506, 70, 32, 9), C(P.belt));
  }

  function head(c, hy, S) {
    const r = RIG.headR;
    // ears
    for (const s of [-1, 1]) {
      paint(c, pEllipse(s * (r * 0.93), hy + 6, 17, 22), C(P.skin));
      if (!INK) inkLine(c, [[s * (r * 0.93) - s * 2, hy - 4], [s * (r * 0.93) + s * 5, hy + 8], [s * (r * 0.93) - s * 1, hy + 16]], 2.2);
    }
    // the face: a comic hero's square jaw
    const f = new Path2D();
    f.moveTo(-r * 0.95, hy - 10);
    f.bezierCurveTo(-r * 0.95, hy - r * 1.25, r * 0.95, hy - r * 1.25, r * 0.95, hy - 10);
    f.lineTo(r * 0.9, hy + r * 0.42);
    f.quadraticCurveTo(r * 0.86, hy + r * 0.92, r * 0.34, hy + r * 1.04);
    f.quadraticCurveTo(0, hy + r * 1.14, -r * 0.34, hy + r * 1.04);
    f.quadraticCurveTo(-r * 0.86, hy + r * 0.92, -r * 0.9, hy + r * 0.42);
    f.closePath();
    paint(c, f, C(P.skin), false);
    shade(c, f, C(P.skinSh, 0.55), -r * 0.52);
    if (!INK) {
      // five o'clock shadow: blue-grey dots along the jaw
      const jaw = new Path2D();
      jaw.moveTo(-r * 0.92, hy + r * 0.28);
      jaw.quadraticCurveTo(-r * 0.5, hy + r * 0.62, 0, hy + r * 0.66);
      jaw.quadraticCurveTo(r * 0.5, hy + r * 0.62, r * 0.92, hy + r * 0.28);
      jaw.lineTo(r, hy + r * 1.3);
      jaw.lineTo(-r, hy + r * 1.3);
      jaw.closePath();
      c.save();
      c.clip(f);
      c.fillStyle = dots(c, 'rgba(58,72,104,0.42)', 6, 1.5);
      c.fill(jaw);
      c.restore();
      // chin cleft
      inkLine(c, [[0, hy + r * 0.98], [0, hy + r * 1.08]], 2.2);
    }
    // eyes: whites, pupils that look around, lids for blinking
    const bl = S.blink || 0;
    const lx = (S.lookX || 0) * 5, ly = (S.lookY || 0) * 4;
    if (!INK) {
      for (const s of [-1, 1]) {
        const ex = s * 31, ey = hy - 12;
        const eye = pEllipse(ex, ey, 16, 12 * (1 - 0.9 * bl));
        paint(c, eye, '#ffffff');
        c.save();
        c.clip(eye);
        c.fillStyle = K.ink;
        c.beginPath();
        c.arc(ex + lx, ey + ly + 1, 7.5, 0, TAU);
        c.fill();
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(ex + lx + 2.5, ey + ly - 2, 2.4, 0, TAU);
        c.fill();
        c.restore();
        inkLine(c, [[ex - 18, ey - 3], [ex - 6, ey - 13 + 12 * bl], [ex + 10, ey - 12 + 12 * bl], [ex + 18, ey - 4]], 3.4);
      }
      // brows: -1 worried (inner ends up), +1 raised
      const br = S.brow || 0;
      for (const s of [-1, 1]) {
        const yIn = hy - 36 - 9 * Math.max(0, -br) - 6 * Math.max(0, br), yOut = hy - 36 + 6 * Math.max(0, -br) - 7 * Math.max(0, br);
        const brow = pPoly([[s * 12, yIn + 6], [s * 12, yIn - 4], [s * 50, yOut - 7], [s * 52, yOut + 2]]);
        c.fillStyle = C(P.hair);
        c.fill(brow);
      }
      // nose: a shadow wedge on the inner side and one line
      c.fillStyle = C(P.skinSh, 0.9);
      c.fill(pPoly([[-4, hy - 4], [-12, hy + 22], [2, hy + 24]]));
      inkLine(c, [[4, hy - 2], [12, hy + 20], [-2, hy + 26]], 2.6);
      // mouth
      const smile = S.smile ?? 0.6, talk = S.talk || 0;
      const my = hy + 48;
      if (talk > 0.05) {
        const m = pEllipse(0, my + 2, 20, 4 + 13 * talk);
        paint(c, m, C(P.mouth));
        c.save();
        c.clip(m);
        c.fillStyle = '#fff';
        c.fillRect(-22, my - 14, 44, 7 + 4 * talk);
        c.fillStyle = C(P.tongue);
        c.beginPath();
        c.ellipse(0, my + 6 + 9 * talk, 11, 5 + 4 * talk, 0, 0, TAU);
        c.fill();
        c.restore();
      } else if (smile > 0.3) {
        const m = new Path2D();
        m.moveTo(-26, my - 6 * smile);
        m.quadraticCurveTo(0, my - 2 * smile, 26, my - 6 * smile);
        m.quadraticCurveTo(0, my + 20 * smile, -26, my - 6 * smile);
        m.closePath();
        paint(c, m, C(P.mouth));
        c.save();
        c.clip(m);
        c.fillStyle = '#fff';
        c.fillRect(-26, my - 12, 52, 9 * smile);
        c.restore();
      } else {
        inkLine(c, [[-22, my + 2 - 8 * smile], [0, my + 6 * smile], [22, my + 2 - 8 * smile]], 3.4);
      }
      // cheek lines when grinning
      if (smile > 0.8 || talk > 0.2) for (const s of [-1, 1]) inkLine(c, [[s * 34, my - 12], [s * 38, my - 2]], 2.2);
    }
    // hair: a quiff over the brow, sideburns, a blue shine
    const hp = new Path2D();
    hp.moveTo(-r * 0.98, hy - 4);
    hp.lineTo(-r * 0.98, hy - r * 0.62);
    hp.bezierCurveTo(-r * 0.96, hy - r * 1.28, r * 0.2, hy - r * 1.42, r * 0.86, hy - r * 1.05);
    hp.quadraticCurveTo(r * 1.12, hy - r * 0.86, r * 0.98, hy - r * 0.52);
    hp.lineTo(r * 0.98, hy - 4);
    hp.lineTo(r * 0.84, hy - 4);
    hp.lineTo(r * 0.8, hy - r * 0.5);
    hp.quadraticCurveTo(r * 0.3, hy - r * 0.62, -r * 0.12, hy - r * 0.8);
    hp.quadraticCurveTo(-r * 0.48, hy - r * 0.56, -r * 0.8, hy - r * 0.52);
    hp.lineTo(-r * 0.84, hy - 4);
    hp.closePath();
    paint(c, hp, C(P.hair));
    gloss(c, hp, [[-r * 0.6, hy - r * 0.92], [-r * 0.1, hy - r * 1.14], [r * 0.5, hy - r * 1.08]], 7);
    if (!INK) {
      c.save();
      c.clip(hp);
      c.strokeStyle = C(P.hairHi, 0.9);
      c.lineWidth = lw(c, 3);
      for (const k of [0, 1, 2]) {
        c.beginPath();
        c.moveTo(-r * 0.7 + k * 30, hy - r * 0.62);
        c.quadraticCurveTo(-r * 0.3 + k * 36, hy - r * 1.12, r * 0.5 + k * 16, hy - r * 1.0);
        c.stroke();
      }
      c.restore();
    }
    // carpenter's pencil behind the outer ear
    c.save();
    c.translate(r * 0.98, hy - 26);
    c.rotate(-0.5);
    paint(c, pRR(-8, -40, 16, 60, 3), C(P.pencil));
    paint(c, pPoly([[-8, 20], [8, 20], [0, 36]]), C('#f0c99a'));
    c.restore();
    // sweat drop (sad twin)
    if (S.sweat > 0 && !INK) {
      const d = S.sweat;
      const sx = -r * 0.9, sy = hy - r * 0.5 + 30 * (1 - d);
      const drop = new Path2D();
      drop.moveTo(sx, sy - 26 * d);
      drop.quadraticCurveTo(sx + 16 * d, sy + 2 * d, sx, sy + 12 * d);
      drop.quadraticCurveTo(sx - 16 * d, sy + 2 * d, sx, sy - 26 * d);
      paint(c, drop, C(P.sweat));
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fill(pEllipse(sx - 4 * d, sy - 2 * d, 3 * d, 5 * d));
    }
  }

  function arm(c, sh, a, grip, S, outer) {
    // flannel sleeve rolled up past the elbow, bare forearm
    const dx = a.ex - sh[0], dy = a.ey - sh[1], L = Math.hypot(dx, dy) || 1;
    const sleeve = pLimb(sh[0], sh[1], a.ex + (dx / L) * 14, a.ey + (dy / L) * 14, 66, 58);
    const fore = pLimb(a.ex, a.ey, a.hx, a.hy, 52, 42);
    paint(c, fore, C(P.skin));
    shade(c, fore, C(P.skinSh, 0.55), -1e4 + 0 * a.hx, false);
    paint(c, sleeve, C(P.shirt));
    flannel(c, sleeve);
    // the rolled-up cuff: a band across the arm, the lighter inside of the flannel showing
    c.save();
    c.translate(a.ex + (dx / L) * 12, a.ey + (dy / L) * 12);
    c.rotate(Math.atan2(dy, dx) - Math.PI / 2);
    const cuff = pRR(-37, -13, 74, 26, 10);
    paint(c, cuff, C(P.cuff));
    flannel(c, cuff);
    if (!INK) inkLine(c, [[-30, 1], [30, 1]], 2);
    c.restore();
    if (outer && S.phoneHeld) return; // the outer hand is drawn around the phone
    hand(c, a.hx, a.hy, grip, Math.atan2(a.hy - a.ey, a.hx - a.ex));
  }
  function hand(c, x, y, grip, ang) {
    if (grip === 'open') {
      // palm with spread fingers (the shrug, talking)
      for (let k = 0; k < 4; k++) {
        const fa = ang - 0.55 + k * 0.36;
        paint(c, pLimb(x, y, x + Math.cos(fa) * 40, y + Math.sin(fa) * 40, 15, 13), C(P.skin));
      }
      paint(c, pLimb(x, y, x + Math.cos(ang - 1.5) * 30, y + Math.sin(ang - 1.5) * 30, 16, 14), C(P.skin));
      paint(c, pEllipse(x, y, 25, 21, ang), C(P.skin));
      return;
    }
    if (grip === 'thumb') {
      paint(c, pLimb(x + 4, y - 14, x + 6, y - 52, 19, 16), C(P.skin));
      paint(c, pRR(x - 26, y - 22, 50, 48, 16), C(P.skin));
      if (!INK) for (let k = 0; k < 3; k++) inkLine(c, [[x - 24, y - 8 + k * 11], [x + 2, y - 8 + k * 11]], 2.2);
      return;
    }
    if (grip === 'poke') {
      paint(c, pLimb(x, y, x + Math.cos(ang) * 50, y + Math.sin(ang) * 50, 16, 14), C(P.skin));
      paint(c, pCircle(x, y, 24), C(P.skin));
      return;
    }
    paint(c, pCircle(x, y, 26), C(P.skin));
    if (!INK) {
      // knuckles: short curved lines across the fist, square to the forearm
      const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
      for (let k = -1; k <= 1; k++) {
        const bx = x + ux * 6 + vx * k * 10, by = y + uy * 6 + vy * k * 10;
        inkLine(c, [[bx - ux * 9, by - uy * 9], [bx + ux * 3 + vx * 1.5, by + uy * 3 + vy * 1.5]], 2.2);
      }
    }
  }

  // tools, drawn with the grip at (0, 0) pointing up
  function tool(c, kind) {
    if (kind === 'hammer') {
      const hdl = pRR(-10, -120, 20, 164, 8);
      paint(c, hdl, C(P.wood));
      shade(c, hdl, C(P.woodSh), -2, false);
      const hd = pPoly([[-42, -144], [30, -144], [30, -110], [-42, -110]]);
      paint(c, hd, C(P.steel));
      shade(c, hd, C(P.steelSh), -1e4, true);
      paint(c, pPoly([[30, -140], [62, -130], [68, -104], [54, -104], [44, -118], [30, -116]]), C(P.steel));
      gloss(c, hd, [[-34, -136], [22, -136]], 4);
    } else if (kind === 'saw') {
      const blade = new Path2D();
      blade.moveTo(-18, -40);
      blade.lineTo(-8, -252);
      blade.lineTo(22, -252);
      for (let k = 0; k < 13; k++) {
        const y = -252 + k * 16;
        blade.lineTo(32 + (k * 8) / 13, y + 8);
        blade.lineTo(22 + ((k + 1) * 8) / 13, y + 16);
      }
      blade.lineTo(30, -40);
      blade.closePath();
      paint(c, blade, C(P.steel));
      gloss(c, blade, [[-2, -236], [4, -60]], 5);
      const hdl = pRR(-32, -60, 72, 100, 26);
      paint(c, hdl, C(K.orange));
      paint(c, pRR(-12, -40, 32, 58, 13), C(P.phone));
    } else if (kind === 'level') {
      const body = pRR(-17, -240, 34, 296, 6);
      paint(c, body, C(P.rule));
      shade(c, body, C('#e0a51a'), -6, true);
      for (const y of [-162, -70]) {
        paint(c, pRR(-11, y - 21, 22, 42, 8), C('#b9f07a'));
        if (!INK) {
          c.fillStyle = 'rgba(255,255,255,0.9)';
          c.fill(pEllipse(0, y - 4, 4, 6));
        }
      }
    } else if (kind === 'drill') {
      paint(c, pRR(-54, -19, 102, 38, 14), C('#34343c'));
      paint(c, pRR(-86, -31, 40, 62, 8), C('#26262e'));
      const body = pRR(4, -170, 62, 174, 24);
      paint(c, body, C(K.orange));
      shade(c, body, C('#d44c14'), 20, true);
      paint(c, pRR(16, -206, 38, 40, 6), C('#26262e'));
      paint(c, pRR(29, -280, 12, 78, 3), C(P.steel));
      gloss(c, body, [[14, -150], [14, -30]], 6);
    }
  }

  // the phone prop, drawn in device pixels so its screen never mirrors
  const PH = { w: 66, h: 132 };
  function phone(c, x, y, rot, s, screen, t, side) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.scale(s, s);
    inked(c, () => paint(c, pRR(-PH.w / 2, -PH.h / 2, PH.w, PH.h, 11), C(P.phone), false));
    c.save();
    const scr = pRR(-PH.w / 2 + 4, -PH.h / 2 + 4, PH.w - 8, PH.h - 8, 8);
    c.clip(scr);
    c.translate(-PH.w / 2 + 4, -PH.h / 2 + 4);
    screen(c, PH.w - 8, PH.h - 8, t, side);
    // a comic glare across the glass
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.fill(pPoly([[PH.w * 0.35, 0], [PH.w * 0.6, 0], [0, PH.h * 0.55], [0, PH.h * 0.3]]));
    c.restore();
    c.fillStyle = C(P.phone);
    c.fill(pRR(-9, -PH.h / 2 + 6, 18, 4.5, 2.2));
    c.restore();
  }
  function wallpaper(c, w, h) {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, C('#3a6fe0'));
    g.addColorStop(1, C('#8f5fe8'));
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  const uiFont = (c, weight, size, fam = UI) => { c.font = `${weight} ${size}px ${fam}`; c.fontStretch = 'normal'; };
  function screenLock(c, w, h) {
    wallpaper(c, w, h);
    c.fillStyle = 'rgba(255,255,255,0.92)';
    uiFont(c, 700, 15);
    c.textAlign = 'center';
    c.fillText('07:42', w / 2, 34);
    uiFont(c, 500, 4.6);
    c.fillText('mandag 6. oktober', w / 2, 42);
  }
  function screenCall(c, w, h, t) {
    wallpaper(c, w, h);
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.fill(pCircle(w / 2, 32, 12));
    c.fillStyle = C('#8f5fe8');
    c.fill(pCircle(w / 2, 29, 4.2));
    c.fill(pEllipse(w / 2, 39, 7, 4.5));
    c.fillStyle = '#fff';
    uiFont(c, 700, 6);
    c.textAlign = 'center';
    c.fillText('Ny kunde', w / 2, 56);
    uiFont(c, 500, 3.8);
    c.fillText('ringer …', w / 2, 62);
    const pulse = 1 + 0.12 * Math.max(0, Math.sin(t * 14));
    c.fillStyle = C('#e5352b');
    c.fill(pCircle(w * 0.27, h - 18, 7));
    c.fillStyle = C('#22c55e');
    c.fill(pCircle(w * 0.73, h - 18, 7 * pulse));
  }
  function screenInCall(c, w, h, t) {
    wallpaper(c, w, h);
    c.fillStyle = '#fff';
    uiFont(c, 700, 6);
    c.textAlign = 'center';
    c.fillText('Ny kunde', w / 2, 30);
    uiFont(c, 500, 4.4);
    const sec = Math.max(0, Math.floor((t - T.answer) * 2.4));
    c.fillText(`00:${String(sec).padStart(2, '0')}`, w / 2, 37);
    c.fillStyle = C('#e5352b');
    c.fill(pCircle(w / 2, h - 18, 7));
  }
  function roofMark(c, x, y, s, col, lineCol = null) {
    c.save();
    c.strokeStyle = col;
    c.lineWidth = s * 0.14;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x - s * 0.62, y + s * 0.02);
    c.lineTo(x, y - s * 0.5);
    c.lineTo(x + s * 0.62, y + s * 0.02);
    if (lineCol) {
      c.strokeStyle = lineCol;
      c.lineWidth = s * 0.14 + s * 0.08;
      c.stroke();
      c.strokeStyle = col;
      c.lineWidth = s * 0.14;
    }
    c.stroke();
    const q = s * 0.17, g = s * 0.05;
    const sq = [[x - q - g / 2, y - s * 0.02], [x + g / 2, y - s * 0.02], [x - q - g / 2, y + q + g / 2 - s * 0.02], [x + g / 2, y + q + g / 2 - s * 0.02]];
    if (lineCol) {
      c.fillStyle = lineCol;
      for (const [sx, sy] of sq) c.fillRect(sx - s * 0.04, sy - s * 0.04, q + s * 0.08, q + s * 0.08);
    }
    c.fillStyle = col;
    for (const [sx, sy] of sq) c.fillRect(sx, sy, q, q);
    c.restore();
  }
  function screenSite(c, w, h) {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, w, h);
    c.fillStyle = C('#1d1a2b');
    c.fillRect(0, 0, w, 15);
    roofMark(c, 7.5, 8.6, 7, C(K.orange));
    c.fillStyle = '#fff';
    c.font = `800 4.8px ${HEAD}`;
    c.fontStretch = 'semi-condensed';
    c.textAlign = 'left';
    c.fillText(CFG.site.name, 14, 10);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    for (let k = 0; k < 3; k++) c.fillRect(w - 9, 5 + k * 2.2, 5, 1);
    const g = c.createLinearGradient(0, 15, 0, 56);
    g.addColorStop(0, C('#9fd4ff'));
    g.addColorStop(1, C('#e6f4ff'));
    c.fillStyle = g;
    c.fillRect(0, 15, w, 41);
    c.fillStyle = C('#8fd18a');
    c.fillRect(0, 50, w, 6);
    c.fillStyle = C('#c98d53');
    c.fillRect(13, 33, 32, 18);
    c.fillStyle = C('#a86c38');
    for (let k = 0; k < 6; k++) c.fillRect(13 + k * 5.4, 33, 0.8, 18);
    c.fillStyle = C('#3b3f55');
    c.fill(pPoly([[10, 34], [29, 21], [48, 34]]));
    c.fillStyle = C('#ffe9a8');
    c.fillRect(18, 38, 7, 7);
    c.fillRect(33, 38, 7, 13);
    c.fillStyle = C('#d9a066');
    c.fillRect(6, 50, 46, 2.2);
    c.fillStyle = C('#1d1a2b');
    c.font = `800 6.6px ${HEAD}`;
    c.fillText(CFG.site.headline, 5, 66);
    uiFont(c, 500, 3.9);
    c.fillStyle = 'rgba(29,26,43,0.7)';
    c.fillText(CFG.site.sub, 5, 72.5);
    c.fillStyle = C('#f7b52c');
    for (let k = 0; k < 5; k++) c.fill(pStar(7.5 + k * 6.2, 80, 2.7));
    c.fillStyle = 'rgba(29,26,43,0.6)';
    uiFont(c, 600, 3.4);
    c.fillText('4,9 (128)', 38, 81.2);
    c.fillStyle = C(K.orange);
    c.fill(pRR(5, 88, w - 10, 13, 6.5));
    c.fillStyle = '#fff';
    c.font = `800 5.2px ${HEAD}`;
    c.textAlign = 'center';
    c.fillText(CFG.site.button, w / 2, 96.4);
    c.fillStyle = C('#f1ece4');
    c.fill(pRR(5, 106, (w - 13) / 2, 16, 3));
    c.fill(pRR(8 + (w - 13) / 2, 106, (w - 13) / 2, 16, 3));
  }
  function screenNone(c, w, h) {
    c.fillStyle = C('#f2f2f4');
    c.fillRect(0, 0, w, h);
    c.fillStyle = C('#dcdce2');
    c.fill(pRR(4, 5, w - 8, 9, 4.5));
    c.fillStyle = C('#a3a3ad');
    c.fill(pCircle(9.5, 9.5, 1.8));
    c.save();
    c.translate(w / 2, 46);
    c.strokeStyle = C('#a3a3ad');
    c.lineWidth = 2.2;
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(-12, -16);
    c.lineTo(6, -16);
    c.lineTo(12, -10);
    c.lineTo(12, 16);
    c.lineTo(-12, 16);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(-12, 1);
    c.lineTo(-5, -3);
    c.lineTo(1, 3);
    c.lineTo(7, -2);
    c.lineTo(12, 2);
    c.stroke();
    c.restore();
    c.fillStyle = C('#4a4a55');
    c.font = `800 6.4px ${HEAD}`;
    c.fontStretch = 'semi-condensed';
    c.textAlign = 'center';
    c.fillText(CFG.nosite.title, w / 2, 76);
    uiFont(c, 500, 3.9);
    c.fillStyle = C('#7a7a86');
    c.fillText(CFG.nosite.sub, w / 2, 83);
  }

  // one twin; returns where the outer hand, the chest and the head are in device pixels
  function drawTwin(c, S) {
    const out = {};
    c.save();
    c.translate(S.x, S.y);
    c.scale(S.s * S.mir, S.s);
    const sq = S.sq || 1;
    c.scale(1 / Math.sqrt(sq), sq);
    inked(c, () => legs(c));
    // upper body: bob, lean and shoulders
    c.save();
    c.translate(0, -470 + (S.bob || 0));
    c.rotate(S.lean || 0);
    c.translate(0, 470);
    const shY = RIG.shY - 18 * (S.shrug || 0);
    inked(c, () => torso(c, shY));
    inked(c, () => {
      const nk = pRR(-30, shY - 70, 60, 64, 20);
      paint(c, nk, C(P.skin), false);
      shade(c, nk, C(P.skinSh, 0.8), 30, false);
    });
    c.save();
    c.translate(0, shY - 30);
    c.rotate(S.tilt || 0);
    c.translate(0, -(shY - 30));
    const hy = RIG.headY + (shY - RIG.shY);
    inked(c, () => head(c, hy, S));
    c.restore();
    const shO = [RIG.shX - 6, shY + 6], shI = [-RIG.shX + 6, shY + 6];
    const aI = ik(shI[0], shI[1], S.hI[0], S.hI[1], RIG.L1, RIG.L2, S.poleI || POLE_I);
    const aO = ik(shO[0], shO[1], S.hO[0], S.hO[1], RIG.L1, RIG.L2, S.poleO || POLE_O);
    inked(c, () => arm(c, shI, aI, S.gripI || 'fist', S, false));
    const tl = S.tool;
    if (tl && tl.kind && tl.scale > 0) {
      c.save();
      if (tl.free) c.translate(tl.x, tl.y);
      else c.translate(aO.hx, aO.hy);
      c.rotate(tl.rot || 0);
      c.scale(tl.scale * TOOL_S, tl.scale * TOOL_S);
      inked(c, () => tool(c, tl.kind));
      c.restore();
    }
    inked(c, () => arm(c, shO, aO, S.gripO || 'fist', S, true));
    const m = c.getTransform();
    const dev = (x, y) => { const p = m.transformPoint(new DOMPoint(x, y)); return [p.x, p.y]; };
    const hand = dev(aO.hx, aO.hy);
    const up = dev(aO.hx + Math.sin(S.phoneRot || 0), aO.hy - Math.cos(S.phoneRot || 0));
    out.hand = hand;
    out.handScale = Math.hypot(up[0] - hand[0], up[1] - hand[1]);
    out.phoneAng = Math.atan2(up[0] - hand[0], -(up[1] - hand[1]));
    out.sticker = dev(-50, -616);
    out.head = dev(0, hy);
    out.tool = tl && tl.kind ? dev(tl.free ? tl.x : aO.hx, (tl.free ? tl.y : aO.hy) - 140) : null;
    c.restore();
    c.restore();
    return out;
  }

  // ---------------------------------------------------------------- choreography (as in the flat version)
  function toolAt(t) {
    const release = [170, -872];
    if (t < T.toss) {
      const flip = E.inOutCubic(prog(t, T.lift, 0.3));
      return { kind: 'hammer', rot: lerp(Math.PI, 0, flip), scale: 1 };
    }
    if (t < T.catch) {
      const u = prog(t, T.toss, T.catch - T.toss);
      return { kind: 'hammer', free: true, x: lerp(release[0], READY[0], u), y: lerp(release[1], READY[1], u) - 400 * 4 * u * (1 - u), rot: -TAU * 2 * E.inOutSine(u), scale: 1 };
    }
    if (t < T.tools[0]) return { kind: 'hammer', rot: 0, scale: 1 };
    const kinds = ['saw', 'level', 'drill'];
    let k = 0;
    while (k < 2 && t >= T.tools[k + 1]) k++;
    const sc = t >= T.toolsOut ? 1 - E.inCubic(prog(t, T.toolsOut, 0.14)) : pop(t, T.tools[k], 0.24);
    return { kind: kinds[k], rot: 0.06 * Math.sin((t - T.tools[k]) * 9) * Math.exp(-(t - T.tools[k]) * 4), scale: sc };
  }
  function basePose(t) {
    const hO = kf2(t, [[0, HIP_O], [T.lift, HIP_O], [T.lift + 0.3, READY, E.outBack], [T.toss - 0.14, [READY[0], READY[1] + 40], E.inOutSine],
      [T.toss, [170, -872], E.outCubic], [T.toss + 0.2, READY, E.inOutSine], [T.catch, READY], [T.catch + 0.06, [READY[0], READY[1] + 38], E.outQuad],
      [T.catch + 0.3, READY, E.outBack], [T.toolsOut, READY], [T.toolsOut + 0.3, HIP_O, E.inOutCubic], [T.phones, HIP_O],
      [T.phones + 0.3, CHEST, E.outBack]]);
    const up = t > T.toss - 0.1 && t < T.catch + 0.05;
    const inflight = up ? Math.sin(Math.PI * prog(t, T.toss - 0.1, T.catch - T.toss + 0.15)) : 0;
    const splitSq = t >= T.split ? 1 + 0.1 * Math.exp(-(t - T.split) / 0.12) * Math.cos((t - T.split) * 28) : 1;
    const catchBob = t >= T.catch ? 14 * Math.exp(-(t - T.catch) / 0.1) : 0;
    const stickerBob = t >= T.sticker ? 10 * Math.exp(-(t - T.sticker) / 0.08) : 0;
    const smile = t < T.stars[0] ? 0.6 : lerp(0.6, 1, prog(t, T.stars[0], 0.3));
    const upW = kf(t, [[T.lift, 0], [T.lift + 0.25, 1], [T.toolsOut, 1], [T.toolsOut + 0.3, 0]]);
    const poleO = [lerp(POLE_O[0], POLE_UP[0], upW), lerp(POLE_O[1], POLE_UP[1], upW)];
    return {
      hO, hI: HIP_I, poleO, sq: splitSq, bob: groove(t, b(1), b(11)) + catchBob + stickerBob,
      lookY: -1.1 * inflight + (t > T.phones + 0.2 ? 1 : 0), lookX: 0.3 * inflight, blink: blinkAt(t), smile, brow: 0.4 * inflight,
      tilt: -0.05 * inflight, tool: toolAt(t), sticker: t >= T.sticker && t < T.reveal + 0.3,
      phone: t >= T.phones ? pop(t, T.phones + 0.12, 0.25) : 0, phoneRot: 0, phoneScale: 1, phoneHeld: t >= T.phones + 0.1,
    };
  }
  function poseRight(t) {
    const p = basePose(t);
    if (t < T.phones) return p;
    p.bob = groove(t, b(11), b(18.5)) + groove(t, T.logo, DUR) + (t >= T.thumb ? 10 * Math.exp(-(t - T.thumb) / 0.1) : 0);
    p.hO = kf2(t, [[T.phones, HIP_O], [T.phones + 0.3, CHEST, E.outBack], [T.answer, CHEST], [T.answer + 0.26, EAR, E.outBack], [T.hangup, EAR],
      [T.reveal, CHEST, E.inOutCubic], [T.reveal + 0.35, SHOW, E.outBack], [T.expand + 0.1, SHOW], [T.expand + 0.5, HIP_O, E.inOutCubic]]);
    p.phoneRot = kf(t, [[T.answer, 0], [T.answer + 0.26, 0.3], [T.hangup, 0.3], [T.reveal, 0]]);
    const dw = kf(t, [[T.reveal, 0], [T.reveal + 0.2, 1], [T.expand + 0.2, 1], [T.expand + 0.5, 0]]);
    p.poleO = [lerp(POLE_O[0], POLE_DOWN_O[0], dw), lerp(POLE_O[1], POLE_DOWN_O[1], dw)];
    if (t >= T.ring && t < T.answer) p.phoneRot += 0.09 * Math.sin((t - T.ring) * 95);
    p.phoneScale = kf(t, [[T.reveal, 1], [T.reveal + 0.38, 1.9, E.outBack], [T.expand + 0.15, 1.9], [T.expand + 0.45, 0.9, E.inCubic]]);
    p.phone = t < T.expand + 0.45 ? p.phone : 0;
    p.phoneHeld = t < T.expand + 0.45;
    p.hI = kf2(t, [[T.answer + 0.3, HIP_I], [T.answer + 0.6, [-170, -654], E.outBack], [b(15.5), [-170, -654]], [b(16), HIP_I, E.inOutCubic],
      [T.thumb - 0.2, HIP_I], [T.thumb, [-172, -728], E.outBack], [T.reveal, [-172, -728]], [T.reveal + 0.3, HIP_I, E.inOutCubic],
      [T.word - 0.1, HIP_I], [T.word + 0.2, [-180, -740], E.outBack]]);
    p.gripI = (t > T.answer + 0.4 && t < b(15.85)) ? 'open' : (t > T.thumb - 0.05 && t < T.reveal + 0.15) || t > T.word ? 'thumb' : 'fist';
    const thumbW = kf(t, [[T.thumb - 0.25, 0], [T.thumb - 0.1, 1], [T.reveal + 0.1, 1], [T.reveal + 0.3, 0], [T.word - 0.15, 0], [T.word, 1]]);
    p.poleI = [lerp(POLE_I[0], POLE_DOWN_I[0], thumbW), lerp(POLE_I[1], POLE_DOWN_I[1], thumbW)];
    const talking = t > T.answer + 0.25 && t < T.hangup - 0.1;
    p.talk = talking ? Math.max(0, Math.sin(t * 23) * 0.8 + Math.sin(t * 9.7) * 0.4) * (Math.sin(t * 3.1) > -0.6 ? 1 : 0) : 0;
    p.smile = kf(t, [[T.phones, 1], [T.ring, 1.1]]);
    p.brow = t > T.ring && t < T.answer + 0.2 ? 0.9 : 0.2;
    p.lookX = talking ? 0.45 : 0;
    p.lookY = t < T.answer ? 1 : t > T.reveal ? 0 : -0.1;
    p.tilt = kf(t, [[T.answer, 0], [T.answer + 0.26, 0.09], [T.hangup, 0.09], [T.reveal, 0]]);
    p.blink = blinkAt(t, 0.04);
    return p;
  }
  function poseLeft(t) {
    const p = basePose(t);
    if (t < T.phones) return p;
    p.bob = 0; // his music stopped
    const shake = t >= T.shakeL && t < T.shakeL + 0.7 ? 26 * Math.sin((t - T.shakeL) * TAU * 7) * (1 - prog(t, T.shakeL, 0.7)) : 0;
    p.hO = kf2(t, [[T.phones, HIP_O], [T.phones + 0.3, CHEST, E.outBack], [T.shakeL, CHEST], [T.shakeL + 0.12, [CHEST[0] + 30, CHEST[1] - 60], E.outCubic],
      [T.shakeL + 0.7, [CHEST[0] + 30, CHEST[1] - 60]], [T.shakeL + 1.0, CHEST, E.inOutCubic], [T.shrug, CHEST], [T.shrug + 0.25, [200, -654], E.outBack],
      [T.reveal, [200, -654]], [T.reveal + 0.35, SHOW, E.outBack]]);
    p.hO = [p.hO[0], p.hO[1] + shake];
    p.phoneRot = t >= T.shakeL && t < T.shakeL + 0.7 ? 0.12 * Math.sin((t - T.shakeL) * TAU * 7) : 0;
    p.phoneScale = kf(t, [[T.reveal, 1], [T.reveal + 0.38, 1.9, E.outBack]]);
    const dw = kf(t, [[T.shrug - 0.05, 0], [T.shrug + 0.1, 0.9], [T.reveal, 0.9], [T.reveal + 0.2, 1]]);
    p.poleO = [lerp(POLE_O[0], POLE_DOWN_O[0], dw), lerp(POLE_O[1], POLE_DOWN_O[1], dw)];
    const pokeT = t - T.tapL;
    const poke = pokeT > 0.25 && pokeT < 0.75 ? 12 * Math.abs(Math.sin(pokeT * TAU * 2)) : 0;
    p.hI = kf2(t, [[T.tapL - 0.05, HIP_I], [T.tapL + 0.25, [-4, -640], E.outBack], [T.tapL + 0.8, [-4, -640]], [T.tapL + 1.1, HIP_I, E.inOutCubic],
      [T.shrug, HIP_I], [T.shrug + 0.25, [-200, -654], E.outBack], [T.reveal, [-200, -654]], [T.reveal + 0.3, HIP_I, E.inOutCubic]]);
    p.hI = [p.hI[0] + poke, p.hI[1]];
    p.gripI = pokeT > 0.1 && pokeT < 1.0 ? 'poke' : t > T.shrug && t < T.reveal + 0.2 ? 'open' : 'fist';
    const sw = kf(t, [[T.shrug - 0.05, 0], [T.shrug + 0.1, 1], [T.reveal, 1], [T.reveal + 0.25, 0]]);
    p.poleI = [lerp(POLE_I[0], -0.3, sw), lerp(POLE_I[1], 1, sw)];
    const tw = prog(t, T.tumble0, T.bump - T.tumble0);
    p.lookX = t < T.tumble0 ? 0 : t < T.shrug ? lerp(-1, 0.9, tw) : 0;
    p.lookY = t < T.tumble0 ? 1 : t < T.shrug ? 0.8 : 0;
    p.smile = kf(t, [[T.phones, 0.6], [b(13.5), 0.15], [b(15.5), -0.1], [T.shrug, -0.45]]);
    p.brow = kf(t, [[T.ring, 0], [b(13.5), -0.5], [T.shrug, -1]]);
    p.shrug = t >= T.shrug ? E.outBack(prog(t, T.shrug, 0.25)) * (1 - E.inOutCubic(prog(t, T.reveal, 0.3))) : 0;
    p.tilt = kf(t, [[T.shakeL, 0], [T.shakeL + 0.2, -0.1], [T.shakeL + 0.8, 0], [T.shrug, 0], [T.shrug + 0.25, -0.09], [T.reveal, 0]]);
    p.blink = blinkAt(t, -0.07);
    p.sweat = t >= T.sweat && t < T.reveal ? E.outBack(prog(t, T.sweat, 0.3)) : 0;
    return p;
  }

  // ---------------------------------------------------------------- the page: panels, gutter, cameras
  const PAGE = { x0: 26, x1: 1054, y0: 118, y1: 1802, gut: 26, cy: 1000 };
  const Z0 = 1.28, CY0 = -760;        // the normal framing: knees up
  const ZR = 2.3;                      // the close-up on the phones
  const GRIP = PH.h / 2 - 20;          // the hand holds the phone this far below its centre (phone units)
  const PHONE_Y = SHOW[1] - GRIP * 1.9; // rig y of the phone's centre when it is held up
  function layout(t) {
    const g = t < T.split ? 0 : PAGE.gut * E.outBack(prog(t, T.split + 0.05, 0.3));
    const s = t < T.split ? 0 : E.outBack(prog(t, T.split, 0.42));
    const push = E.inOutCubic(prog(t, T.expand, 0.5));
    const D = lerp(W / 2, PAGE.x0 - g / 2 - 4, push); // the gutter's centre
    const pz = E.inOutCubic(prog(t, T.reveal + 0.05, 0.5));
    const base = { z: lerp(Z0, ZR, pz), cx: lerp(0, SHOW[0], pz), cy: lerp(CY0, PHONE_Y - 12, pz) };
    const end = E.inOutCubic(prog(t, T.expand, 0.75));
    const R = { side: 'R', x0: t < T.split ? PAGE.x0 : D + g / 2, x1: PAGE.x1, z: base.z, cx: base.cx, cy: base.cy };
    R.hc = t < T.split ? W / 2 : t < T.expand ? W / 2 + 269 * s : lerp(W / 2 + 269, W / 2, end);
    if (t >= T.expand) {
      R.z = lerp(ZR, 0.95, end);
      R.cx = lerp(SHOW[0], 0, end);
      R.cy = lerp(PHONE_Y - 12, -984, end);
    }
    const panels = [R];
    if (t >= T.split && D - g / 2 > PAGE.x0) {
      panels.unshift({ side: 'L', x0: PAGE.x0, x1: D - g / 2, z: base.z, cx: -base.cx, cy: base.cy, hc: t < T.expand ? W / 2 - 269 * s : lerp(W / 2 - 269, PAGE.x0 - 300, push) });
    }
    return { panels, D, g };
  }

  // paper grain, made once
  const GRAIN = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    const img = g.createImageData(256, 256);
    const r = rng(42);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (r() - 0.5) * 60;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 18;
    }
    g.putImageData(img, 0, 0);
    return ctx.createPattern(cv, 'repeat');
  })();
  // big Ben-Day dots that grow toward the edges of a panel, made once (centre at 540, 960)
  const VIGNETTE = (() => {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(20,16,19,0.16)';
    const step = 18;
    for (let y = -step; y < H + step; y += step / 2) {
      const odd = Math.round(y / (step / 2)) % 2;
      for (let x = odd ? step / 2 : 0; x < W + step; x += step) {
        const d = Math.hypot((x - W / 2) / 560, (y - H / 2) / 860);
        const r = 7.2 * clamp((d - 0.35) / 0.75) ** 1.3;
        if (r > 0.4) {
          g.beginPath();
          g.arc(x, y, r, 0, TAU);
          g.fill();
        }
      }
    }
    return cv;
  })();

  function paper(c) {
    c.fillStyle = K.paper;
    c.fillRect(0, 0, W, H);
    c.fillStyle = GRAIN;
    c.fillRect(0, 0, W, H);
  }
  // pop-art sunburst behind a panel's hero, turning slowly
  function rays(c, x, y, t, colA, colB, n = 22) {
    c.fillStyle = C(colA);
    c.fillRect(-10, -10, W + 20, H + 20);
    c.fillStyle = C(colB);
    c.beginPath();
    const rot = t * 0.06;
    for (let k = 0; k < n; k++) {
      const a0 = rot + (k * TAU) / n, a1 = a0 + TAU / (2 * n);
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a0) * 3000, y + Math.sin(a0) * 3000);
      c.lineTo(x + Math.cos(a1) * 3000, y + Math.sin(a1) * 3000);
      c.closePath();
    }
    c.fill();
  }
  // comic focus lines converging on a point, re-inked 12 times a second
  function focusLines(c, x, y, t, seed, a) {
    const r = rng(seed * 1000 + Math.floor(t * 12));
    c.fillStyle = `rgba(20,16,19,${a})`;
    c.beginPath();
    for (let k = 0; k < 110; k++) {
      const ang = r() * TAU, w = 0.004 + r() * 0.012, r0 = 250 + r() * 170;
      c.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
      c.lineTo(x + Math.cos(ang - w) * 2200, y + Math.sin(ang - w) * 2200);
      c.lineTo(x + Math.cos(ang + w) * 2200, y + Math.sin(ang + w) * 2200);
      c.closePath();
    }
    c.fill();
  }
  function panelBackground(c, t, pn, grey) {
    const headY = PAGE.cy + (RIG.headY - pn.cy) * pn.z;
    const fx = pn.hc, fy = PAGE.cy + (PHONE_Y - pn.cy) * pn.z;
    const focus = E.inOutCubic(prog(t, T.reveal, 0.35)) * (1 - E.inOutCubic(prog(t, T.expand + 0.2, 0.4)));
    // the flat, dull panel the left twin fades into
    c.fillStyle = C('#e9e3d6');
    c.fillRect(pn.x0, PAGE.y0, pn.x1 - pn.x0, PAGE.y1 - PAGE.y0);
    const energy = 1 - 0.9 * grey;
    if (focus < 1) {
      c.save();
      c.globalAlpha = energy * (1 - focus);
      rays(c, pn.hc, headY, t, '#ffe27a', '#ffc53a');
      c.fillStyle = dots(c, C('#ff7a2b', 0.55), 12, 2.4);
      c.fillRect(pn.x0, PAGE.y0, pn.x1 - pn.x0, PAGE.y1 - PAGE.y0);
      c.restore();
    }
    if (focus > 0) {
      c.save();
      c.globalAlpha = focus;
      c.fillStyle = C(K.paper);
      c.fillRect(pn.x0, PAGE.y0, pn.x1 - pn.x0, PAGE.y1 - PAGE.y0);
      focusLines(c, fx, fy, t, pn.side === 'L' ? 1 : 2, pn.side === 'L' ? 0.5 : 0.85);
      c.restore();
    }
    c.drawImage(VIGNETTE, pn.hc - W / 2, headY + 280 - H / 2);
  }

  // ---------------------------------------------------------------- props in device pixels
  function heldPhone(c, t, pn, pose, out) {
    if (pose.phoneHeld) {
      c.save();
      c.translate(out.hand[0], out.hand[1]);
      c.scale(out.handScale, out.handScale);
      inked(c, () => paint(c, pCircle(0, 0, 26), C(P.skin)));
      c.restore();
    }
    if (pose.phone <= 0) return;
    const side = pn.side;
    const scr = side === 'R'
      ? (t >= T.reveal ? screenSite : t >= T.ring && t < T.answer + 0.1 ? screenCall : t >= T.answer && t < T.hangup ? screenInCall : screenLock)
      : t >= T.reveal ? screenNone : screenLock;
    const s = out.handScale * pose.phone * pose.phoneScale;
    const a = out.phoneAng, ux = Math.sin(a), uy = -Math.cos(a), rx = Math.cos(a), ry = Math.sin(a);
    const off = GRIP * s;
    const px = out.hand[0] + ux * off, py = out.hand[1] + uy * off;
    phone(c, px, py, a, s, scr, t, side);
    out.phonePos = [px, py, s, a];
    if (side === 'L') cobweb(c, t, px, py, s, a);
    if (pose.phoneHeld) {
      const inner = side === 'R' ? -1 : 1, hs = out.handScale;
      const edge = (PH.w / 2) * s;
      inked(c, () => {
        c.save();
        c.translate(out.hand[0] + rx * inner * edge - ux * 4 * hs, out.hand[1] + ry * inner * edge - uy * 4 * hs);
        c.rotate(a + inner * 0.35);
        paint(c, pEllipse(0, -6 * hs, 10 * hs, 20 * hs), C(P.skin));
        c.restore();
        for (let k = 0; k < 3; k++) {
          const d = (-14 + k * 15) * hs;
          paint(c, pCircle(out.hand[0] - rx * inner * edge - ux * d, out.hand[1] - ry * inner * edge - uy * d, 9 * hs), C(P.skin));
        }
      });
    }
  }
  // a spider web spinning itself over the idle phone
  function cobweb(c, t, x, y, s, a) {
    const u = E.outCubic(prog(t, T.web, 1.6)) * (1 - E.inCubic(prog(t, T.reveal, 0.25)));
    if (u <= 0) return;
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.scale(s, s);
    const ox = -PH.w / 2 + 2, oy = -PH.h / 2 + 2; // top-left corner
    const R = 58 * u;
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 1.1;
    c.beginPath();
    const spokes = 6;
    for (let k = 0; k <= spokes; k++) {
      const ang = (k / spokes) * (Math.PI / 2);
      c.moveTo(ox, oy);
      c.lineTo(ox + Math.cos(ang) * R, oy + Math.sin(ang) * R);
    }
    for (let ring = 1; ring <= 4; ring++) {
      const rr0 = (R * ring) / 4.3;
      for (let k = 0; k <= spokes; k++) {
        const ang = (k / spokes) * (Math.PI / 2);
        const sag = k > 0 && k < spokes + 1 ? 0.9 : 1;
        const px = ox + Math.cos(ang) * rr0 * (k % 2 ? sag : 1), py = oy + Math.sin(ang) * rr0 * (k % 2 ? sag : 1);
        k ? c.lineTo(px, py) : c.moveTo(px, py);
      }
    }
    c.stroke();
    // the spider, dangling
    if (u > 0.6) {
      const sy = oy + R * 0.75 + 6 * Math.sin(t * 3);
      c.beginPath();
      c.moveTo(ox + R * 0.5, oy + R * 0.3);
      c.lineTo(ox + R * 0.5, sy);
      c.stroke();
      c.fillStyle = K.ink;
      c.beginPath();
      c.arc(ox + R * 0.5, sy + 3, 3.4, 0, TAU);
      c.fill();
      c.strokeStyle = K.ink;
      c.lineWidth = 0.9;
      for (const sgn of [-1, 1]) for (let l = 0; l < 3; l++) {
        c.beginPath();
        c.moveTo(ox + R * 0.5, sy + 2 + l * 1.5);
        c.lineTo(ox + R * 0.5 + sgn * 6, sy - 1 + l * 3);
        c.stroke();
      }
    }
    c.restore();
  }
  function priceSticker(c, t, out) {
    const u = prog(t, T.sticker, 0.16);
    const off = E.inCubic(prog(t, T.reveal, 0.25));
    const s = out.handScale * lerp(1.8, 1, E.outCubic(u)) * (1 - off);
    if (s <= 0.01 || t < T.sticker) return;
    const [x, y] = out.sticker;
    c.save();
    c.translate(x, y);
    c.rotate(lerp(-0.7, -0.16, E.outBack(u)));
    c.scale(s, s);
    inked(c, () => paint(c, pBurst(0, 0, 50, 68, 14, 7), C(K.yellow), false));
    letters(c, CFG.price[0], 0, 6, { size: 30, weight: 900, stretch: 'semi-condensed', fill: K.ink, jitter: 0.04, skew: -0.1, seed: 3 });
    letters(c, CFG.price[1], 0, 30, { size: 18, weight: 700, stretch: 'semi-condensed', fill: K.ink, jitter: 0.03, skew: -0.1, seed: 5 });
    c.restore();
  }
  // five rating stars popping in above the head
  function stars(c, t, pn) {
    const out = 1 - E.inCubic(prog(t, T.starsOut, 0.25));
    if (t < T.stars[0] || out <= 0) return;
    T.stars.forEach((t0, k) => {
      const s = pop(t, t0, 0.25) * out;
      if (s <= 0) return;
      const x = pn.hc + (k - 2) * 78, y = 584 - 14 * Math.cos(((k - 2) / 2) * 0.9);
      c.save();
      c.translate(x, y);
      c.rotate((1 - clamp(prog(t, t0, 0.25))) * 1.4 + (k - 2) * 0.12);
      c.scale(s, s);
      inked(c, () => paint(c, pStar(0, 0, 34), C('#ffcf1f')));
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.fill(pStar(-5, -6, 10));
      c.restore();
    });
  }
  // a round badge with the number of new jobs, near the gutter
  function counter(c, t, pn) {
    if (t < T.counters || t > T.h3out + 0.3) return;
    const inn = pop(t, T.counters, 0.3) * (1 - E.inBack(prog(t, T.h3out, 0.25)));
    let n = 0, last = -1;
    if (pn.side === 'R') T.cards.forEach((t0) => { if (t >= t0 + 0.28) { n++; last = t0 + 0.28; } });
    const bump = last > 0 ? 1 + 0.4 * Math.exp(-(t - last) / 0.09) : 1;
    const x = pn.side === 'R' ? pn.x0 + 74 : pn.x1 - 74, y = 772;
    c.save();
    c.translate(x, y);
    c.scale(inn * bump, inn * bump);
    inked(c, () => paint(c, pCircle(0, 0, 52), C(pn.side === 'R' ? K.orange : '#cfc7b8')));
    letters(c, String(n), 0, 22, { size: 62, weight: 900, stretch: 'normal', fill: '#fff', stroke: K.ink, strokeW: 7, jitter: 0, skew: -0.1, seed: 9 });
    c.restore();
    c.save();
    c.translate(x, y + 68);
    c.scale(inn, inn);
    letters(c, 'OPGAVER', 0, 0, { size: 22, weight: 900, stretch: 'semi-condensed', fill: K.ink, jitter: 0.04, skew: -0.1, seed: 4 });
    c.restore();
  }
  // job balloons popping out of the right phone
  function jobBalloons(c, t, pn, out) {
    if (t < T.cards[0] || t > T.h3out + 0.3) return;
    const fade = 1 - E.inCubic(prog(t, T.h3out - 0.1, 0.3));
    const shown = T.cards.map((t0, i) => ({ t0, i })).filter((o) => t >= o.t0);
    const w = 316, h = 104;
    const bx = pn.x0 + (pn.x1 - pn.x0) / 2 + 8, by = 590;
    shown.forEach(({ t0, i }) => {
      const newer = shown.filter((o) => o.t0 > t0).length;
      if (newer > 1) return;
      const inn = pop(t, t0, 0.26);
      // the old balloon flies up and away as the next one pops out of the phone
      const lift = newer ? E.inCubic(prog(t, shown.find((o) => o.t0 > t0).t0, 0.22)) : 0;
      if (lift >= 1) return;
      const x = bx - 40 * lift, y = by - 120 * lift;
      const s = inn * (1 - 0.5 * lift) * fade;
      if (s <= 0.01) return;
      const tail = out.phonePos ? [out.phonePos[0] - x, out.phonePos[1] - 40 - y] : [120, 200];
      c.save();
      c.translate(x, y);
      c.scale(s, s);
      inked(c, () => {
        const bl = new Path2D();
        bl.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
        if (newer === 0) {
          const tl = new Path2D();
          const tx = clamp(tail[0], -60, 160), ty = Math.max(h / 2 + 40, Math.min(tail[1], 170));
          tl.moveTo(40, h / 2 - 12);
          tl.lineTo(tx, ty);
          tl.lineTo(84, h / 2 - 22);
          tl.closePath();
          paint(c, tl, '#ffffff', false);
        }
        paint(c, bl, '#ffffff', false);
      });
      const job = CFG.jobs[i];
      letters(c, job.title.toUpperCase(), 0, -2, { size: 38, weight: 900, stretch: 'semi-condensed', fill: job.title.includes('★') ? '#f2a100' : K.red, jitter: 0.06, skew: -0.12, seed: 11 + i });
      letters(c, job.detail, 0, 32, { size: 26, weight: 700, stretch: 'semi-condensed', fill: K.ink, jitter: 0.03, skew: -0.08, seed: 21 + i });
      c.restore();
    });
  }
  // the left twin's thought: nothing
  function thought(c, t, pn, out) {
    const t0 = T.sweat + 0.2;
    if (t < t0 || t > T.reveal) return;
    const u = pop(t, t0, 0.3) * (1 - E.inBack(prog(t, T.reveal - 0.2, 0.2)));
    const [hx, hy] = out.head;
    const x = pn.x0 + 132, y = 560;
    c.save();
    for (const [f, r] of [[0.25, 9], [0.5, 14]]) {
      c.save();
      inked(c, () => paint(c, pCircle(lerp(hx - 40, x, 1 - f), lerp(hy - 110, y + 40, 1 - f), r * u), '#fff', false));
      c.restore();
    }
    c.translate(x, y);
    c.scale(u, u);
    inked(c, () => {
      const cl = new Path2D();
      const bumps = 9;
      for (let k = 0; k < bumps; k++) {
        const a = (k / bumps) * TAU;
        cl.moveTo(Math.cos(a) * 88 + 28, Math.sin(a) * 44);
        cl.arc(Math.cos(a) * 88, Math.sin(a) * 44, 28, 0, TAU);
      }
      cl.ellipse(0, 0, 90, 46, 0, 0, TAU);
      paint(c, cl, '#ffffff', false);
    });
    const dotsN = Math.min(3, Math.floor((t - t0) * 3) + 1);
    letters(c, '.'.repeat(dotsN).padEnd(3, ' '), 0, 18, { size: 70, weight: 900, stretch: 'normal', fill: K.ink, jitter: 0, skew: 0, seed: 2, track: 6 });
    c.restore();
  }
  function tumbleweed(c, t, pn) {
    if (t < T.tumble0 || t > T.reveal) return;
    const R = 92;
    const floor = 1690;
    const xEnd = pn.hc - 60;
    let x, y, rot;
    if (t < T.bump) {
      const u = prog(t, T.tumble0, T.bump - T.tumble0);
      x = lerp(pn.x0 - 160, xEnd, u);
      y = floor - R - 170 * Math.abs(Math.sin(u * Math.PI * 3)) * (1 - 0.45 * u);
      rot = x / R;
    } else {
      const tau = t - T.bump;
      x = xEnd - 40 * (1 - Math.exp(-tau / 0.09)) * Math.exp(-tau / 0.6) - 10 * (1 - Math.exp(-tau / 0.2));
      y = floor - R - 22 * Math.max(0, Math.sin(Math.min(tau, 0.3) / 0.3 * Math.PI)) * (tau < 0.3 ? 1 : 0);
      rot = xEnd / R - 0.6 * (1 - Math.exp(-tau / 0.3));
    }
    // speed lines behind it
    if (t < T.bump) {
      c.strokeStyle = K.ink;
      c.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(x - R - 30, y - 40 + k * 26);
        c.lineTo(x - R - 110 - k * 20, y - 40 + k * 26);
        c.stroke();
      }
    }
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    const r = rng(77);
    c.lineCap = 'round';
    for (let k = 0; k < 30; k++) {
      c.strokeStyle = k % 3 ? C('#8a6a40') : K.ink;
      c.lineWidth = k % 3 ? 4 + r() * 3 : 3;
      c.beginPath();
      const a0 = r() * TAU, rad = R * (0.35 + r() * 0.65);
      c.ellipse((r() - 0.5) * 22, (r() - 0.5) * 22, rad, rad * (0.4 + r() * 0.6), r() * TAU, a0, a0 + 2 + r() * 3);
      c.stroke();
    }
    c.restore();
  }
  function ringWaves(c, x, y, s, tau) {
    c.save();
    c.strokeStyle = K.ink;
    c.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const u = (tau * 1.8 + k / 3) % 1;
      c.lineWidth = 5 * (1 - u) + 2;
      for (const d of [-1, 1]) {
        c.beginPath();
        c.arc(x, y, (PH.h * 0.5 + 50 * u) * s, d > 0 ? -0.45 : Math.PI - 0.45, d > 0 ? 0.45 : Math.PI + 0.45);
        c.stroke();
      }
    }
    c.restore();
  }

  // one panel: background, the twin through its camera, the props
  function drawPanel(c, t, pn) {
    const grey = pn.side === 'L' ? E.inOutSine(prog(t, T.grey0, T.grey1 - T.grey0)) : 0;
    SAT = 1 - 0.95 * grey;
    DIM = 1 - 0.06 * grey;
    c.save();
    c.beginPath();
    c.rect(pn.x0, PAGE.y0, pn.x1 - pn.x0, PAGE.y1 - PAGE.y0);
    c.clip();
    panelBackground(c, t, pn, grey);
    const pose = pn.side === 'L' ? poseLeft(t) : poseRight(t);
    c.save();
    c.translate(pn.hc, PAGE.cy);
    c.scale(pn.z, pn.z);
    c.translate(-pn.cx, -pn.cy);
    const out = drawTwin(c, { x: 0, y: 0, s: 1, mir: pn.side === 'L' ? -1 : 1, ...pose });
    c.restore();
    heldPhone(c, t, pn, pose, out);
    if (pose.sticker) priceSticker(c, t, out);
    if (pn.side === 'R' && out.phonePos && t >= T.ring && t < T.answer + 0.3) ringWaves(c, out.phonePos[0], out.phonePos[1], out.phonePos[2], t - T.ring);
    stars(c, t, pn);
    if (pn.side === 'L') {
      tumbleweed(c, t, pn);
      thought(c, t, pn, out);
    } else jobBalloons(c, t, pn, out);
    counter(c, t, pn);
    c.restore();
    SAT = 1;
    DIM = 1;
    pn.out = out;
  }
  function borders(c, t, L) {
    c.lineWidth = 8;
    c.strokeStyle = K.ink;
    c.lineJoin = 'miter';
    for (const pn of L.panels) c.strokeRect(pn.x0, PAGE.y0, pn.x1 - pn.x0, PAGE.y1 - PAGE.y0);
    // the tear, while the panel rips in two
    if (t >= T.split - 0.06 && t < T.split + 0.4) {
      const u = prog(t, T.split - 0.06, 0.12);
      const open = 1 - prog(t, T.split + 0.1, 0.3);
      const yEnd = lerp(PAGE.y0, PAGE.y1, E.outCubic(u));
      const r = rng(5);
      const pts = [];
      for (let y = PAGE.y0; y <= yEnd; y += 36) pts.push([W / 2 + (r() - 0.5) * 34 * open, y]);
      pts.push([W / 2, yEnd]);
      c.save();
      c.strokeStyle = K.paper;
      c.lineWidth = 10 + L.g;
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();
      c.strokeStyle = K.ink;
      c.lineWidth = 3;
      for (const s of [-1, 1]) {
        c.beginPath();
        pts.forEach(([x, y], i) => (i ? c.lineTo(x + s * (5 + L.g / 2), y) : c.moveTo(x + s * (5 + L.g / 2), y)));
        c.stroke();
      }
      c.restore();
    }
  }

  // ---------------------------------------------------------------- page-level lettering
  function pageText(c, t, L) {
    const CP = CFG.captions;
    const pair = (lines, times, tOut) => {
      caption(c, lines[0], W / 2 - 58, 338, t, times[0], tOut, { rot: -0.035 });
      caption(c, lines[1], W / 2 + 58, 446, t, times[1], tOut + 0.05, { rot: 0.025 });
    };
    pair(CP.twins, T.h1, T.h1out);
    pair(CP.same, T.h2, T.h2out);
    pair(CP.only, T.h3, T.h3out);
    caption(c, CP.diff[0], W / 2, 330, t, T.h4[0], T.h4out, { rot: -0.03 });
    sfx(c, CP.diff[1].toUpperCase(), W / 2, 506, t, T.h4[1], T.h4out, { size: 132, fill: ['#ff6d4a', '#d8231c'], extrude: 12, stagger: 0.03, seed: 77 });
    const R = L.panels[L.panels.length - 1], Lp = L.panels.length > 1 ? L.panels[0] : null;
    const S = CFG.sfx;
    sfx(c, S.split, W / 2, 900, t, T.split - 0.02, T.split + 0.55, { size: 118, rot: -0.14, seed: 3 });
    if (t < T.expand) {
      for (const pn of L.panels) {
        const sgn = pn.side === 'L' ? -1 : 1;
        sfx(c, S.toss, pn.hc + sgn * 120, 560, t, T.toss, T.toss + 0.55, { size: 72, rot: sgn * 0.18, seed: 13, extrude: 6 });
        sfx(c, S.catch, pn.hc + sgn * 150, 1080, t, T.catch, T.catch + 0.45, { size: 66, rot: sgn * -0.2, seed: 17, extrude: 6 });
      }
    }
    sfx(c, S.sticker, W / 2, 1150, t, T.sticker, T.sticker + 0.7, { size: 104, rot: -0.1, seed: 23, shake: 6 });
    if (R && t < T.reveal) {
      sfx(c, S.ring, R.hc + 36, 578, t, T.ring, T.answer + 0.1, { size: 100, rot: 0.1, seed: 29, shake: 9, fill: ['#fff27a', '#ffb321'] });
      T.cards.forEach((t0, i) => sfx(c, S.ping, R.x1 - 86, 712 + (i % 2) * 22, t, t0, t0 + 0.45, { size: 54, rot: 0.24 - (i % 2) * 0.12, seed: 31 + i, extrude: 5 }));
    }
    if (Lp && t < T.reveal) {
      T.crickets.forEach((t0, i) => {
        const tone = C('#9a958a');
        sfx(c, S.crickets, Lp.hc - 20, 1240 + i * 70, t, t0, t0 + 1.1, { size: 44, rot: -0.05 + i * 0.05, seed: 41 + i, extrude: 0, fill: ['#f4f1ea', '#d8d3c8'], stagger: 0.05 });
        void tone;
      });
    }
    sfx(c, S.push, 190, 980, t, T.expand + 0.28, T.expand + 0.95, { size: 150, rot: -0.2, seed: 53, shake: 12 });
  }
  // the red marker ring around the right phone in the close-up
  function marker(c, t, R) {
    if (t < T.circle || !R || !R.out || !R.out.phonePos || t > T.expand + 0.2) return;
    const u = E.outCubic(prog(t, T.circle, 0.45));
    const fade = 1 - prog(t, T.expand, 0.2);
    const [x, y, s] = R.out.phonePos;
    const rx = PH.w * s * 0.8, ry = PH.h * s * 0.58;
    c.save();
    c.globalAlpha = fade;
    c.strokeStyle = K.red;
    c.lineWidth = 15;
    c.lineCap = 'round';
    c.beginPath();
    const n = 90, turns = 1.12 * u;
    for (let k = 0; k <= n; k++) {
      const a = -2.2 + turns * TAU * (k / n);
      const wob = 1 + 0.05 * Math.sin(a * 3 + 1) + 0.03 * (k / n);
      c.lineTo(x + Math.cos(a) * rx * wob, y + Math.sin(a) * ry * wob);
    }
    c.stroke();
    c.restore();
  }

  // ---------------------------------------------------------------- the cover (end card)
  function cover(c, t) {
    if (t < T.logo - 0.1) return;
    const cx = W / 2;
    // issue box, top left
    const ib = pop(t, T.logo, 0.3);
    if (ib > 0) {
      c.save();
      c.translate(118, 332);
      c.rotate(-0.06);
      c.scale(ib, ib);
      c.fillStyle = K.ink;
      c.fillRect(-60 + 7, -38 + 7, 120, 76);
      c.fillStyle = '#fff';
      c.fillRect(-60, -38, 120, 76);
      c.lineWidth = 6;
      c.strokeStyle = K.ink;
      c.strokeRect(-60, -38, 120, 76);
      letters(c, CFG.brand.issue, 0, 16, { size: 40, weight: 900, stretch: 'semi-condensed', fill: K.ink, jitter: 0.04, skew: -0.1, seed: 61 });
      c.restore();
    }
    // the masthead: the roof mark and the wordmark, lettered like a comic title
    const lg = spring(t - T.logo, 2.4, 0.45);
    if (t >= T.logo) {
      c.save();
      c.translate(cx, 430 - (1 - lg) * 60);
      c.scale(clamp(lg * 1.2), clamp(lg * 1.2));
      roofMark(c, 0, 0, 130, K.orange, K.ink);
      c.restore();
    }
    if (t >= T.word) {
      const name = CFG.brand.name;
      letters(c, name, cx, 612, {
        size: 170, weight: 900, stretch: 'semi-condensed', fill: ['#ffffff', '#ffe7c9'], stroke: K.ink, strokeW: 18, extrude: 14, extrudeCol: K.orange,
        jitter: 0.07, skew: -0.12, seed: 71, t, t0: T.word, stagger: 0.045, popDur: 0.26,
      });
    }
    caption(c, CFG.brand.tagline.join(' '), cx, 720, t, T.tag, DUR + 1, { size: 46, rot: -0.02 });
    if (t >= T.cta) {
      const u = E.outBack(prog(t, T.cta, 0.35));
      const beat = ((t - T.cta) / B) % 1;
      const pulse = t > T.cta + 0.5 ? 1 + 0.03 * Math.exp(-beat * 6) : 1;
      const pw = 610, ph = 116;
      c.save();
      c.translate(cx, 858);
      c.scale(u * pulse, u * pulse);
      c.fillStyle = K.ink;
      c.fill(pRR(-pw / 2 + 10, -ph / 2 + 10, pw, ph, 24));
      c.fillStyle = K.orange;
      c.fill(pRR(-pw / 2, -ph / 2, pw, ph, 24));
      c.lineWidth = 7;
      c.strokeStyle = K.ink;
      c.stroke(pRR(-pw / 2, -ph / 2, pw, ph, 24));
      letters(c, CFG.brand.cta.toUpperCase(), 0, 17, { size: 50, weight: 900, stretch: 'semi-condensed', fill: '#fff', stroke: K.ink, strokeW: 7, jitter: 0.05, skew: -0.1, seed: 81 });
      c.restore();
    }
  }

  // ---------------------------------------------------------------- one frame
  function frame(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    paper(ctx);
    const L = layout(t);
    for (const pn of L.panels) drawPanel(ctx, t, pn);
    borders(ctx, t, L);
    const R = L.panels[L.panels.length - 1];
    marker(ctx, t, R);
    pageText(ctx, t, L);
    cover(ctx, t);
    return L;
  }

  // ---------------------------------------------------------------- sound cues for tools/make_audio.py
  // side: 'L' plays in the left channel, 'R' in the right, 'C' in both
  function cues() {
    const out = [];
    const add = (t, type, side = 'C', extra = {}) => out.push(Object.assign({ t: +t.toFixed(4), type, side }, extra));
    add(T.split, 'split');
    [...T.h1, ...T.h2, ...T.h3, T.h4[0]].forEach((t0, i) => add(t0, 'caption', 'C', { i }));
    add(T.h4[1], 'punch');
    add(T.lift, 'lift');
    add(T.toss, 'toss');
    add(T.catch, 'catch');
    T.stars.forEach((t0, i) => add(t0, 'star', 'C', { i }));
    T.tools.forEach((t0, i) => add(t0, 'tool', 'C', { kind: ['saw', 'level', 'drill'][i] }));
    add(T.sticker, 'sticker');
    add(T.toolsOut, 'poof');
    add(T.phones, 'phone');
    add(T.ring, 'ring', 'R', { until: T.answer });
    add(T.answer, 'answer', 'R');
    T.cards.forEach((t0, i) => add(t0, 'card', 'R', { i }));
    add(T.thumb, 'thumb', 'R');
    T.crickets.forEach((t0, i) => add(t0, 'cricket', 'L', { i }));
    add(T.tapL, 'tap', 'L');
    add(T.shakeL, 'shake', 'L');
    add(T.sweat, 'sweat', 'L');
    add(T.web, 'web', 'L');
    add(T.tumble0, 'tumble', 'L', { until: T.bump });
    add(T.bump, 'bump', 'L');
    add(T.shrug, 'shrug', 'L');
    add(T.reveal, 'reveal');
    add(T.circle, 'circle', 'R');
    add(T.expand, 'expand');
    add(T.expand + 0.28, 'bam');
    add(T.logo, 'logo');
    add(T.word, 'wordmark');
    add(T.tag, 'tag');
    add(T.cta, 'cta');
    return out.sort((x, y) => x.t - y.t);
  }

  // ---------------------------------------------------------------- main
  const stage = document.getElementById('stage');
  const q = new URLSearchParams(location.search);
  const seek = (t) => frame(clamp(t, 0, DUR - 1e-6));
  // fast moves get extra motion-blur samples
  const BLUR = [[T.split - 0.05, T.split + 0.45], [T.toss - 0.2, T.catch + 0.2], [T.tools[0] - 0.05, T.tools[2] + 0.3], [T.sticker - 0.05, T.sticker + 0.2],
    [T.ring, T.answer + 0.35], [T.shakeL, T.shakeL + 0.75], [T.tumble0, T.bump + 0.4], [T.reveal - 0.05, T.reveal + 0.6], [T.expand - 0.05, T.expand + 0.8],
    [T.cta - 0.05, T.cta + 0.4]];
  window.__meta = { W, H, DUR, BPM, format: 'portrait', blur: BLUR, poster: b(28), cues: cues() };
  window.__seek = seek;
  window.__debug = { T, layout, poseLeft, poseRight };
  window.__ready = Promise.all([document.fonts.load(`900 40px ${HEAD}`), document.fonts.load(`800 40px ${HEAD}`), document.fonts.load(`700 40px ${HEAD}`),
    document.fonts.load(`500 30px ${UI}`), document.fonts.load(`600 30px ${UI}`), document.fonts.load(`700 30px ${UI}`)])
    .then(() => document.fonts.ready)
    .then(() => {
      seek(q.has('t') ? parseFloat(q.get('t')) : 0);
      if (q.has('preview')) startPreview();
      return true;
    });

  function startPreview() {
    const fit = () => {
      const k = Math.min(innerWidth / W, (innerHeight - 50) / H);
      stage.style.transform = `scale(${k})`;
      document.body.style.height = innerHeight + 'px';
    };
    fit();
    addEventListener('resize', fit);
    const bar = document.createElement('div');
    bar.className = 'player';
    bar.innerHTML = `<button>❚❚</button><input type="range" min="0" max="${DUR}" step="0.001" value="0"><span>0.00</span>`;
    document.body.appendChild(bar);
    const [btn, range, label] = bar.children;
    const audio = new Audio('../out/soundtrack.wav');
    let playing = true, t0 = performance.now(), tPaused = 0;
    const now = () => (playing ? ((performance.now() - t0) / 1000) % DUR : tPaused);
    btn.onclick = () => {
      if (playing) { tPaused = now(); playing = false; audio.pause(); btn.textContent = '▶'; }
      else { t0 = performance.now() - tPaused * 1000; playing = true; audio.currentTime = tPaused; audio.play().catch(() => {}); btn.textContent = '❚❚'; }
    };
    range.oninput = () => { tPaused = +range.value; t0 = performance.now() - tPaused * 1000; audio.currentTime = tPaused; };
    addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); btn.onclick(); } });
    audio.play().catch(() => {});
    let last = 0;
    (function loop() {
      const t = now();
      if (playing && t < last) { audio.currentTime = 0; audio.play().catch(() => {}); }
      last = t;
      seek(t);
      range.value = t;
      label.textContent = t.toFixed(2);
      requestAnimationFrame(loop);
    })();
  }
})();
