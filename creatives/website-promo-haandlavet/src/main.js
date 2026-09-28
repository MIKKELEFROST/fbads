/*
 * "Håndlavet" — a 15 s paper cut-out ad in stop motion for a company that builds websites for tradespeople.
 * Every frame is a pure function of time: __seek(t) redraws the 1080x1920 canvas for time t. All motion is stepped
 * at 12 drawings a second (the video runs at 24 fps, each drawing held for two frames), and every paper piece
 * "boils" a little from drawing to drawing, like pieces nudged by hand under the camera.
 *
 *   0.0  kraft paper; cut-out tools land around a collage headline: "DU ER DYGTIG MED DINE HÆNDER."
 *   2.5  a paper phone slides in with a search that finds nothing: "MEN ONLINE ER DU SVÆR AT FINDE."
 *   4.9  scissors cut the old screen away, tape holds a new one, the website is glued on piece by piece:
 *        "KLIP. LIM. BYG."
 *   8.4  "RING RING!", then the phone rings and notes pile up
 *  10.9  a blue sheet slides over: the logo, sitecrew, the tagline and a paper CTA tag
 *
 * The collage words are stuck on as the voice says them (times in config.js, from the voice-over alignment).
 */
(function () {
  'use strict';
  const { clamp, lerp, prog, E } = A;
  const CFG = window.CONFIG;
  const K = CFG.colors;
  const W = 1080, H = 1920;
  const BPM = 104;
  const B = 60 / BPM;
  const DUR = 15;
  const FPA = 12; // drawings per second
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');

  // ---------------------------------------------------------------- timeline (seconds)
  const T = {
    tools: [-1, -1, 0.12, 0.3, 0.45], toolsOut: 2.2, handsOut: 2.2, // the hammer and the saw are on the table from the first frame
    phoneIn: 2.45, results: 3.0, glass: 3.35, question: 4.2, searchOut: 4.6,
    scissors: 4.8, snips: [5.3, 5.5], screenFall: 5.58, newScreen: 5.62, tape: [5.72, 5.92],
    pieces: [6.2, 6.4, 6.6, 6.8, 7.0], buildOut: 8.1,
    buzz: [9.75, 10.6], notes: [10.0, 10.3, 10.6], // the phone rings right after the line that says so
    sheet: 10.85, logo: 11.15, word: 11.3, tag: 11.95, cta: 12.9,
  };

  // ---------------------------------------------------------------- stop-motion helpers
  function hash(...args) {
    let h = 2166136261 >>> 0;
    for (const a of args) {
      const v = typeof a === 'string' ? [...a].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) | 0, 7) : Math.round(a * 1000);
      h ^= v;
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  const frameNo = (t) => Math.floor(t * FPA + 1e-6);
  const step = (t) => frameNo(t) / FPA; // time quantised to the drawings
  // the little shove every piece gets from one drawing to the next
  function boil(id, t, amp = 1.3) {
    const f = frameNo(t);
    return { dx: (hash(id, f, 1) - 0.5) * 2 * amp, dy: (hash(id, f, 2) - 0.5) * 2 * amp, dr: (hash(id, f, 3) - 0.5) * 0.009 };
  }
  // stepped move: value along [from,to] for the window [t0, t0+dur], evaluated only on drawing times
  const smove = (t, t0, dur, ease = E.outCubic) => ease(prog(step(t), t0, dur));

  // ---------------------------------------------------------------- paper
  const polys = new Map();
  // a hand-cut outline for a w x h rectangle centred on 0,0 (cached per piece): straight-ish edges with a wobble
  function cutRect(id, w, h, amp = 0.9, r = 0) {
    const key = `${id}|${w}|${h}|${amp}|${r}`;
    if (polys.has(key)) return polys.get(key);
    const pts = [];
    const seg = 14;
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    for (let e = 0; e < 4; e++) {
      const [x0, y0] = corners[e], [x1, y1] = corners[(e + 1) % 4];
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / seg));
      const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
      for (let k = 0; k < n; k++) {
        const u = k / n;
        const j = (hash(id, e, k) - 0.5) * 2 * amp + Math.sin(u * Math.PI) * (hash(id, e, 99) - 0.5) * amp * 2.5;
        pts.push([lerp(x0, x1, u) + nx * j, lerp(y0, y1, u) + ny * j]);
      }
    }
    polys.set(key, pts);
    return pts;
  }
  // a hand-cut circle / ellipse
  function cutEllipse(id, rx, ry, amp = 0.8) {
    const key = `e|${id}|${rx}|${ry}|${amp}`;
    if (polys.has(key)) return polys.get(key);
    const n = Math.max(18, Math.round((rx + ry) / 6));
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, j = 1 + ((hash(id, k) - 0.5) * 2 * amp) / Math.max(rx, ry);
      pts.push([Math.cos(a) * rx * j, Math.sin(a) * ry * j]);
    }
    polys.set(key, pts);
    return pts;
  }
  // an arbitrary outline, subdivided and wobbled once
  function cutPoly(id, raw, amp = 0.8) {
    const key = `p|${id}|${amp}`;
    if (polys.has(key)) return polys.get(key);
    const pts = [];
    for (let e = 0; e < raw.length; e++) {
      const [x0, y0] = raw[e], [x1, y1] = raw[(e + 1) % raw.length];
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / 14));
      const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
      for (let k = 0; k < n; k++) {
        const u = k / n, j = (hash(id, e, k) - 0.5) * 2 * amp;
        pts.push([lerp(x0, x1, u) + nx * j, lerp(y0, y1, u) + ny * j]);
      }
    }
    polys.set(key, pts);
    return pts;
  }
  function pathOf(c, pts) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  }
  // fill a paper piece with a soft shadow; lift = how far it is off the table (0 lying, 1 held up)
  function paper(c, pts, fill, lift = 0, holes = null) {
    c.save();
    c.shadowColor = `rgba(45,28,10,${0.32 + 0.1 * lift})`;
    c.shadowBlur = 8 + 18 * lift;
    c.shadowOffsetX = 4 + 10 * lift;
    c.shadowOffsetY = 6 + 16 * lift;
    pathOf(c, pts);
    if (holes) holes.forEach((h) => { const q = h.slice().reverse(); q.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); });
    c.fillStyle = fill;
    c.fill('evenodd');
    c.restore();
    // a faint lighter bevel along the cut edge
    c.save();
    pathOf(c, pts);
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  }
  // place a piece: translate/rotate with its boil
  function at(c, id, x, y, rot, t, amp = 1.3) {
    const bl = boil(id, t, amp);
    c.translate(x + bl.dx, y + bl.dy);
    c.rotate(rot + bl.dr);
  }

  // ---------------------------------------------------------------- the table: kraft paper, pre-drawn once
  const kraft = document.createElement('canvas');
  kraft.width = W;
  kraft.height = H;
  (function paintKraft() {
    const c = kraft.getContext('2d');
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#d6b78d');
    g.addColorStop(1, '#c6a278');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const r = A.rng(7);
    for (let k = 0; k < 9000; k++) { // fibres
      const x = r() * W, y = r() * H, a = r() * Math.PI, l = 6 + r() * 26;
      c.strokeStyle = r() < 0.5 ? `rgba(120,85,45,${0.05 + r() * 0.12})` : `rgba(255,240,215,${0.05 + r() * 0.12})`;
      c.lineWidth = 0.6 + r() * 1.2;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.stroke();
    }
    for (let k = 0; k < 2500; k++) { // specks
      c.fillStyle = `rgba(80,50,25,${0.1 + r() * 0.25})`;
      c.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
    }
    const v = c.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.45, H * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(40,20,5,0.28)');
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
  })();
  // film/paper grain laid over everything, shifted every drawing
  const grain = document.createElement('canvas');
  grain.width = 540;
  grain.height = 960;
  (function paintGrain() {
    const c = grain.getContext('2d');
    const img = c.createImageData(grain.width, grain.height);
    const r = A.rng(11);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (r() - 0.5) * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  })();

  // ---------------------------------------------------------------- collage lettering
  const STYLES = [
    { w: 900, fam: 'Archivo', st: 'extra-condensed', k: 1.12 },
    { w: 800, fam: 'Archivo', st: 'expanded', k: 0.9 },
    { w: 800, fam: 'Inter', st: 'normal', k: 0.95 },
    { w: 800, fam: "'JetBrains Mono'", st: 'normal', k: 0.92 },
    { w: 400, fam: 'Archivo', st: 'normal', k: 1.0 },
    { w: 900, fam: 'Archivo', st: 'normal', k: 1.0 },
    { w: 600, fam: 'Archivo', st: 'condensed', k: 1.08 },
  ];
  const TILES = [['#fbf7ef', K.ink], [K.red, '#fff'], [K.ink, '#fbf7ef'], [K.yellow, K.ink], ['#2f5fa7', '#fff'], ['#f3e6c8', K.ink], [K.green, '#fff'], ['#f2a7a0', K.ink], ['#ffffff', K.red]];
  const layouts = new Map();
  function setFont(c, st, size) {
    c.font = `${st.w} ${Math.round(size * st.k)}px ${st.fam}`;
    c.fontStretch = st.st;
  }
  // lay a line of words out once: every letter gets its own style, tile colour, size, tilt and nudge
  function layoutLine(c, id, words, size) {
    if (layouts.has(id)) return layouts.get(id);
    const tiles = [];
    let x = 0, prevS = -1, prevT = -1, n = 0;
    words.forEach(([word], wi) => {
      if (wi) x += size * 0.34;
      [...word].forEach((ch, li) => {
        let s = Math.floor(hash(id, wi, li, 1) * STYLES.length), tc = Math.floor(hash(id, wi, li, 2) * TILES.length);
        if (s === prevS) s = (s + 1) % STYLES.length;
        if (tc === prevT) tc = (tc + 3) % TILES.length;
        prevS = s;
        prevT = tc;
        const sz = size * (0.9 + hash(id, wi, li, 3) * 0.24);
        setFont(c, STYLES[s], sz);
        const m = c.measureText(ch);
        const punct = /[.,!?]/.test(ch);
        const tw = Math.max(m.width + sz * 0.26, punct ? sz * 0.42 : sz * 0.55), th = sz * 1.12;
        tiles.push({ ch, word: wi, n: n++, x: x + tw / 2, y: (hash(id, wi, li, 4) - 0.5) * size * 0.16, w: tw, h: th, sz, s, tc, rot: (hash(id, wi, li, 5) - 0.5) * 0.16 });
        x += tw + size * 0.05;
      });
    });
    const out = { tiles, width: x };
    layouts.set(id, out);
    return out;
  }
  // a collage line: words appear on their times (a lifted drawing, then flat), leave when `out` comes
  function collageLine(c, id, words, cx, y, t, size, out) {
    const L = layoutLine(c, id, words, size);
    const x0 = cx - L.width / 2;
    L.tiles.forEach((tl) => {
      const tIn = words[tl.word][1];
      const f = frameNo(t) - frameNo(tIn);
      if (f < 0) return;
      let ox = 0, oy = 0, extra = 0, sc = 1, lift = 0;
      if (f === 0) { sc = 1.16; extra = (hash(id, tl.n, 7) - 0.5) * 0.3; lift = 1; oy = -10; }
      else if (f === 1) { sc = 1.04; lift = 0.4; }
      if (out !== undefined && t >= out) { // swept off to the left, one drawing after another
        const e = frameNo(t) - frameNo(out) - Math.floor(tl.n * 0.15);
        if (e > 0) { ox = -e * e * 70; oy = -e * 8; lift = 0.6; extra = -e * 0.06; }
        if (x0 + tl.x + ox < -200) return;
      }
      c.save();
      at(c, `${id}${tl.n}`, x0 + tl.x + ox, y + tl.y + oy, tl.rot + extra, t, 1.1);
      c.scale(sc, sc);
      const [bg, fg] = TILES[tl.tc];
      paper(c, cutRect(`${id}${tl.n}`, tl.w, tl.h, 1.1), bg, lift);
      setFont(c, STYLES[tl.s], tl.sz);
      c.fillStyle = fg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(tl.ch, 0, tl.sz * 0.05);
      c.restore();
    });
  }
  function collage(c, id, lines, t, out, y0 = 360, size = 104) {
    lines.forEach((words, i) => collageLine(c, `${id}${i}`, words, W / 2, y0 + i * size * 1.22, t, size, out));
  }

  // ---------------------------------------------------------------- cut-out tools (scene 1)
  const TOOL_POS = [
    { id: 'hammer', x: 250, y: 930, rot: -0.35, from: [-300, 900] },
    { id: 'saw', x: 800, y: 900, rot: 0.3, from: [1400, 800] },
    { id: 'roller', x: 560, y: 1120, rot: -0.12, from: [560, 2200] },
    { id: 'wrench', x: 260, y: 1250, rot: 0.5, from: [-400, 1500] },
    { id: 'pencil', x: 820, y: 1240, rot: -0.55, from: [1500, 1500] },
  ];
  function hammer(c, t) {
    paper(c, cutRect('hm-handle', 40, 330, 1), '#c8904f');
    c.fillStyle = 'rgba(120,70,30,0.25)';
    c.fillRect(-20, 60, 40, 8);
    c.fillRect(-20, 90, 40, 8);
    c.save();
    c.translate(0, -170);
    paper(c, cutPoly('hm-head', [[-110, -34], [70, -34], [96, -14], [120, -44], [132, -30], [104, 6], [70, 34], [-110, 34]], 1), '#80858d', 0.2);
    c.restore();
  }
  function saw(c, t) {
    const teeth = [[-200, -60], [170, -60], [170, 50]];
    for (let x = 170; x > -200; x -= 22) { teeth.push([x - 11, 64]); teeth.push([x - 22, 50]); }
    teeth.push([-200, 30]);
    paper(c, cutPoly('saw-blade', teeth, 0.6), '#b9bec6');
    c.save();
    c.translate(-250, -10);
    const hole = cutEllipse('saw-hole', 26, 42, 1).map(([x, y]) => [x, y]);
    paper(c, cutPoly('saw-handle', [[-70, -80], [60, -70], [70, 80], [-70, 90]], 1.2), K.red, 0.2, [hole]);
    c.restore();
  }
  function roller(c, t) {
    c.save();
    c.translate(0, -60);
    paper(c, cutRect('rl-roll', 300, 96, 1.1), '#f3e6c8');
    c.fillStyle = '#2f5fa7';
    pathOf(c, cutRect('rl-paint', 300, 44, 1.4).map(([x, y]) => [x, y + 26]));
    c.fill();
    c.restore();
    paper(c, cutPoly('rl-frame', [[150, -60], [176, -60], [176, 40], [10, 40], [10, 190], [-14, 190], [-14, 16], [150, 16]], 0.8), '#80858d');
    c.save();
    c.translate(-2, 260);
    paper(c, cutRect('rl-grip', 56, 170, 1), K.ink);
    c.restore();
  }
  function wrench(c, t) {
    const jaw = [[-40, -170], [-60, -230], [-20, -262], [0, -220], [30, -220], [50, -262], [90, -230], [70, -170], [30, -140], [30, 150], [-20, 150], [-20, -140]];
    paper(c, cutPoly('wr-body', jaw, 0.8), '#9aa0a8');
    c.save();
    c.translate(5, 180);
    const hole = cutEllipse('wr-hole', 22, 22, 0.8);
    paper(c, cutEllipse('wr-ring', 52, 52, 1), '#9aa0a8', 0, [hole]);
    c.restore();
  }
  function pencil(c, t) {
    paper(c, cutRect('pc-body', 64, 300, 0.8), K.yellow);
    c.fillStyle = 'rgba(160,110,20,0.35)';
    c.fillRect(8, -150, 6, 300);
    c.save();
    c.translate(0, -180);
    paper(c, cutRect('pc-eraser', 64, 60, 0.8), '#f2a7a0');
    c.restore();
    c.save();
    c.translate(0, 150);
    paper(c, cutPoly('pc-tip', [[-32, 0], [32, 0], [0, 90]], 0.6), '#f0dcb4');
    pathOf(c, [[-9, 62], [9, 62], [0, 90]]);
    c.fillStyle = K.ink;
    c.fill();
    c.restore();
  }
  const TOOL_DRAW = { hammer, saw, roller, wrench, pencil };
  function tools(c, t) {
    TOOL_POS.forEach((p, i) => {
      const t0 = T.tools[i];
      if (t < t0) return;
      const u = smove(t, t0, 0.25);
      const e = frameNo(t) - frameNo(T.toolsOut) - (i % 3);
      let x = lerp(p.from[0], p.x, u), y = lerp(p.from[1], p.y, u);
      if (t >= T.toolsOut && e > 0) y += e * e * 60;
      if (y > H + 400) return;
      c.save();
      at(c, p.id, x, y, p.rot + (1 - u) * 0.4, t);
      c.scale(0.9, 0.9);
      TOOL_DRAW[p.id](c, t);
      c.restore();
    });
  }

  // ---------------------------------------------------------------- the paper phone (scenes 2-4)
  const PH = { x: 540, y: 1040, w: 400, h: 740 };
  const SCR = { w: 350, h: 640 };
  function phonePos(t) {
    // slides up from below, stepped; shakes when it rings
    const u = smove(t, T.phoneIn, 0.34);
    let x = PH.x, y = lerp(PH.y + 1100, PH.y, u), r = (1 - u) * 0.12;
    if (t >= T.buzz[0] && t < T.buzz[1]) {
      const f = frameNo(t);
      x += (hash('buzz', f, 1) - 0.5) * 22;
      y += (hash('buzz', f, 2) - 0.5) * 10;
      r += (hash('buzz', f, 3) - 0.5) * 0.06;
    }
    return { x, y, r };
  }
  function phone(c, t) {
    if (t < T.phoneIn || t >= T.sheet + 0.6) return;
    const p = phonePos(t);
    c.save();
    at(c, 'phone', p.x, p.y, p.r, t, 1.0);
    paper(c, cutRect('ph-body', PH.w, PH.h, 1.2), '#2b2a2e', t < T.phoneIn + 0.34 ? 0.6 : 0);
    c.fillStyle = '#48464d';
    pathOf(c, cutEllipse('ph-cam', 9, 9, 0.5).map(([x, y]) => [x, y - PH.h / 2 + 26]));
    c.fill();
    if (t < T.screenFall) searchScreen(c, t);
    else {
      oldScreenFalling(c, t);
      if (t >= T.newScreen) siteScreen(c, t);
    }
    scissors(c, t);
    c.restore();
    notes(c, t, p);
    buzzMarks(c, t, p);
  }
  function searchScreen(c, t) {
    paper(c, cutRect('scr-old', SCR.w, SCR.h, 0.8), '#fbf7ef');
    // search field
    c.save();
    c.translate(0, -SCR.h / 2 + 64);
    paper(c, cutRect('sf', SCR.w - 40, 64, 0.8), '#fff');
    c.strokeStyle = K.ink;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(-SCR.w / 2 + 50, -4, 12, 0, Math.PI * 2);
    c.moveTo(-SCR.w / 2 + 59, 5);
    c.lineTo(-SCR.w / 2 + 68, 14);
    c.stroke();
    c.font = '600 24px Inter';
    c.fontStretch = 'normal';
    c.fillStyle = K.ink;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(CFG.search, -SCR.w / 2 + 80, 0);
    c.restore();
    // results: grey strips, none of them you
    for (let k = 0; k < 4; k++) {
      const t0 = T.results + k * 0.1;
      if (t < t0) continue;
      c.save();
      c.translate(0, -SCR.h / 2 + 170 + k * 118);
      paper(c, cutRect(`res${k}`, SCR.w - 40, 96, 0.9), '#e4ded3');
      c.fillStyle = '#c8c1b4';
      c.fillRect(-SCR.w / 2 + 40, -24, 180 - k * 20, 14);
      c.fillRect(-SCR.w / 2 + 40, 4, 240, 10);
      c.fillRect(-SCR.w / 2 + 40, 22, 200, 10);
      c.restore();
    }
    // the magnifying glass hops from result to result, then the question mark
    if (t >= T.glass) {
      const hopI = Math.min(3, Math.floor((step(t) - T.glass) / 0.2));
      const gx = 60 - (hopI % 2) * 110, gy = -SCR.h / 2 + 170 + hopI * 118;
      c.save();
      at(c, 'glass', gx, gy, -0.5, t, 1.5);
      c.save();
      c.translate(70, 110);
      c.rotate(0.0);
      paper(c, cutRect('gl-handle', 34, 150, 1), '#8a5a3c', 0.5);
      c.restore();
      const lens = cutEllipse('gl-lens', 58, 58, 0.6);
      paper(c, cutEllipse('gl-ring', 76, 76, 1), '#3c4150', 0.5, [lens]);
      pathOf(c, lens);
      c.fillStyle = 'rgba(190,225,245,0.35)';
      c.fill();
      c.restore();
    }
    if (t >= T.question) {
      const f = frameNo(t) - frameNo(T.question);
      c.save();
      at(c, 'q', 110, 150, 0.12, t, 1.5);
      c.scale(f === 0 ? 1.25 : 1, f === 0 ? 1.25 : 1);
      paper(c, cutRect('q-tile', 150, 190, 1.3), K.red, f === 0 ? 1 : 0.3);
      c.font = '900 170px Archivo';
      c.fontStretch = 'normal';
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('?', 0, 10);
      c.restore();
    }
  }
  // the old screen, cut in two, drops off the phone
  function oldScreenFalling(c, t) {
    const e = frameNo(t) - frameNo(T.screenFall);
    if (e > 6) return;
    [[-1, -SCR.h / 4], [1, SCR.h / 4]].forEach(([s, oy], k) => {
      c.save();
      c.translate(s * e * e * 9, oy + e * e * 22);
      c.rotate(s * e * 0.08);
      paper(c, cutRect(`old${k}`, SCR.w, SCR.h / 2, 0.9), '#fbf7ef', 0.8);
      c.fillStyle = '#e4ded3'; // what is left of the old search results
      for (let r = 0; r < 2; r++) c.fillRect(-SCR.w / 2 + 20, -SCR.h / 4 + 40 + r * 118 - k * 20, SCR.w - 40, 90);
      c.restore();
    });
  }
  // scissors cut across the screen: enter, two snips, leave
  function scissors(c, t) {
    if (t < T.scissors || t > T.newScreen + 0.4) return;
    const u = smove(t, T.scissors, 0.42);
    const cutU = smove(t, T.snips[0] - 0.08, T.snips[1] - T.snips[0] + 0.1, E.linear);
    const leave = smove(t, T.screenFall, 0.4, E.inCubic);
    const x = lerp(-700, -SCR.w / 2 - 40, u) + cutU * (SCR.w + 80) + leave * 700;
    const y = -10;
    const f = frameNo(t);
    const open = T.snips.some((s) => frameNo(s) === f) ? 0 : 0.32;
    c.save();
    at(c, 'sc', x, y, 0, t, 1.2);
    [1, -1].forEach((sgn) => {
      c.save();
      c.rotate(sgn * open / 2);
      paper(c, cutPoly(`sc-blade${sgn}`, [[-20, -16 * sgn], [300, -4 * sgn], [318, 0], [-20, 20 * sgn]], 0.5), '#b3b9c1', 0.7);
      c.save();
      c.translate(-104, 40 * sgn);
      const hole = cutEllipse(`sc-hole${sgn}`, 34, 22, 0.6);
      paper(c, cutEllipse(`sc-ring${sgn}`, 62, 46, 1), K.red, 0.7, [hole]);
      c.restore();
      c.restore();
    });
    c.fillStyle = '#5d626b';
    c.beginPath();
    c.arc(0, 0, 9, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // the cut line left behind
    if (cutU > 0 && t < T.screenFall) {
      c.save();
      c.strokeStyle = 'rgba(30,28,26,0.55)';
      c.setLineDash([10, 6]);
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-SCR.w / 2, y);
      c.lineTo(-SCR.w / 2 + cutU * SCR.w, y);
      c.stroke();
      c.restore();
    }
  }
  // the new screen: taped on, then the website glued on piece by piece
  function tape(c, id, x, y, rot, w = 130) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    const pts = [];
    for (let k = 0; k <= 6; k++) pts.push([-w / 2 + (k % 2 ? 6 : 0), -22 + k * 7.3]);
    for (let k = 6; k >= 0; k--) pts.push([w / 2 - (k % 2 ? 6 : 0), -22 + k * 7.3]);
    c.save();
    c.shadowColor = 'rgba(45,28,10,0.18)';
    c.shadowBlur = 4;
    c.shadowOffsetY = 2;
    pathOf(c, cutPoly(id, pts, 0.4));
    c.fillStyle = 'rgba(236,226,200,0.82)';
    c.fill();
    c.restore();
    c.restore();
  }
  function siteScreen(c, t) {
    const drop = frameNo(t) - frameNo(T.newScreen);
    c.save();
    if (drop === 0) c.scale(1.06, 1.06);
    paper(c, cutRect('scr-new', SCR.w, SCR.h, 0.8), '#ffffff', drop === 0 ? 1 : 0);
    const [t1, t2] = T.tape;
    const pieces = T.pieces;
    const on = (t0) => t >= t0;
    const land = (t0) => { const f = frameNo(t) - frameNo(t0); return f === 0 ? 1 : f === 1 ? 0.4 : 0; };
    // header strip with the logo
    if (on(pieces[0])) {
      c.save();
      const l = land(pieces[0]);
      c.translate(0, -SCR.h / 2 + 46 - l * 20);
      paper(c, cutRect('site-head', SCR.w - 20, 70, 1), K.blue, l);
      roofMark(c, -SCR.w / 2 + 52, 4, 30, '#fff');
      c.font = '700 22px Inter';
      c.fontStretch = 'normal';
      c.fillStyle = '#fff';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(CFG.site.trade, -SCR.w / 2 + 80, 2);
      c.restore();
    }
    // photo: a paper kitchen
    if (on(pieces[1])) {
      c.save();
      const l = land(pieces[1]);
      c.translate(0, -SCR.h / 2 + 200 - l * 20);
      c.rotate(-0.03);
      paper(c, cutRect('site-photo', SCR.w - 40, 210, 1), '#f3d9b0', l);
      c.save();
      c.translate(0, 40);
      paper(c, cutRect('kit-counter', 250, 60, 1), '#8a5a3c');
      c.restore();
      c.save();
      c.translate(-60, -40);
      paper(c, cutRect('kit-cab1', 90, 70, 1), '#5f8f7a');
      c.restore();
      c.save();
      c.translate(60, -40);
      paper(c, cutRect('kit-cab2', 90, 70, 1), '#5f8f7a');
      c.restore();
      c.save();
      c.translate(110, 0);
      paper(c, cutEllipse('kit-lamp', 18, 18, 0.5), K.yellow);
      c.restore();
      c.restore();
    }
    // headline
    if (on(pieces[2])) {
      c.save();
      const l = land(pieces[2]);
      c.translate(-20, -SCR.h / 2 + 360 - l * 20);
      c.rotate(0.02);
      paper(c, cutRect('site-hl', 250, 60, 1), '#fbf7ef', l);
      c.font = '800 34px Inter';
      c.fontStretch = 'normal';
      c.fillStyle = K.ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(CFG.site.headline, 0, 2);
      c.restore();
    }
    // the button
    if (on(pieces[3])) {
      c.save();
      const l = land(pieces[3]);
      c.translate(0, -SCR.h / 2 + 460 - l * 20);
      paper(c, cutRect('site-btn', 230, 74, 1.2), K.red, l);
      c.font = '800 30px Inter';
      c.fontStretch = 'normal';
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(CFG.site.button, 0, 2);
      c.restore();
    }
    // stars
    if (on(pieces[4])) {
      for (let k = 0; k < 5; k++) {
        const l = land(pieces[4] + k / FPA);
        if (t < pieces[4] + k / FPA) continue;
        c.save();
        c.translate(-96 + k * 48, -SCR.h / 2 + 560 - l * 16);
        c.rotate((hash('st', k) - 0.5) * 0.3);
        paper(c, starPts(`st${k}`, 22), K.yellow, l);
        c.restore();
      }
    }
    // tape on two corners
    if (on(t1)) tape(c, 'tp1', -SCR.w / 2 + 14, -SCR.h / 2 + 10, -0.7, 120);
    if (on(t2)) tape(c, 'tp2', SCR.w / 2 - 14, SCR.h / 2 - 10, -0.7, 120);
    c.restore();
  }
  function starPts(id, r) {
    const raw = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rad = k % 2 ? r * 0.47 : r;
      raw.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    return cutPoly(id, raw, 0.5);
  }
  function roofMark(c, x, y, s, col) {
    c.save();
    c.fillStyle = col;
    c.translate(x, y);
    const th = s * 0.16;
    [-1, 1].forEach((sg) => {
      c.save();
      c.rotate(sg * 0.7);
      c.fillRect(sg > 0 ? -th / 2 : -s * 0.78 + th / 2, -s * 0.5 - th / 2 + (sg > 0 ? 0 : 0), s * 0.78, th);
      c.restore();
    });
    const q = s * 0.17, g = s * 0.05;
    c.fillRect(-q - g / 2, -s * 0.02, q, q);
    c.fillRect(g / 2, -s * 0.02, q, q);
    c.fillRect(-q - g / 2, q + g / 2 - s * 0.02, q, q);
    c.fillRect(g / 2, q + g / 2 - s * 0.02, q, q);
    c.restore();
  }
  // vibration marks either side of the ringing phone
  function buzzMarks(c, t, p) {
    if (t < T.buzz[0] || t >= T.buzz[1]) return;
    const f = frameNo(t);
    if (f % 2) return;
    [-1, 1].forEach((sg) => {
      for (let k = 0; k < 3; k++) {
        c.save();
        c.translate(p.x + sg * (PH.w / 2 + 40 + k * 26), p.y - 120 + k * 10);
        c.strokeStyle = K.ink;
        c.lineWidth = 7;
        c.lineCap = 'round';
        c.beginPath();
        c.arc(sg * -30, 0, 40 + k * 8, sg > 0 ? -0.6 : Math.PI - 0.6, sg > 0 ? 0.6 : Math.PI + 0.6);
        c.stroke();
        c.restore();
      }
    });
  }
  // notes stack on top of the phone after it rings
  const NOTE_COLS = [K.green, K.orange, K.yellow];
  function notes(c, t, p) {
    CFG.notes.forEach((txt, i) => {
      const t0 = T.notes[i];
      if (t < t0 || t >= T.sheet + 0.6) return;
      const u = smove(t, t0, 0.25);
      const x = lerp(1400, p.x - 10 + i * 12, u), y = p.y - 200 + i * 118;
      c.save();
      at(c, `note${i}`, x, y, (hash('nr', i) - 0.5) * 0.12, t, 1.2);
      paper(c, cutRect(`note${i}`, 460, 100, 1), '#fffdf7', 1 - u * 0.8);
      c.save();
      c.translate(-180, 0);
      paper(c, cutRect(`notei${i}`, 64, 64, 0.8), NOTE_COLS[i]);
      if (i === 2) { paper(c, starPts('ns', 22), '#fff'); }
      else {
        c.fillStyle = '#fff';
        c.fillRect(-18, -16, 36, 32);
        c.fillStyle = NOTE_COLS[i];
        c.fillRect(-18, -16, 36, 9);
      }
      c.restore();
      c.font = '700 30px Inter';
      c.fontStretch = 'normal';
      c.fillStyle = K.ink;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(txt, -130, 2);
      if (i === 2) {
        for (let k = 0; k < 5; k++) { c.save(); c.translate(-130 + 250 + k * 0, 0); c.restore(); }
      }
      c.restore();
    });
  }

  // ---------------------------------------------------------------- end card (scene 5)
  function sheet(c, t) {
    if (t < T.sheet) return;
    const u = smove(t, T.sheet, 0.34);
    const x = lerp(W + 60, -30, u);
    c.save();
    at(c, 'sheet', x, 0, 0, t, 0.8);
    // torn left edge
    const pts = [];
    for (let y = -40; y <= H + 40; y += 12) pts.push([(hash('tear', y) - 0.5) * 16 + Math.sin(y * 0.01) * 6, y]);
    pts.push([W + 200, H + 40], [W + 200, -40]);
    paper(c, cutPoly('sheet', pts, 0.5), K.blue, u < 1 ? 0.8 : 0.3);
    // fibre highlight of the tear
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 3;
    c.beginPath();
    pts.slice(0, -2).forEach(([px, py], i) => (i ? c.lineTo(px + 2, py) : c.moveTo(px + 2, py)));
    c.stroke();
    c.restore();
    if (u < 1) return;
    const cx = W / 2;
    // logo: two roof blades and four window panes, stuck on one drawing after another
    const pieces = [
      { t: T.logo, id: 'lr-l', draw: () => { c.rotate(-0.72); paper(c, cutRect('lr-l', 190, 36, 1), K.orange); } , x: cx - 62, y: 520 },
      { t: T.logo + 1 / FPA, id: 'lr-r', draw: () => { c.rotate(0.72); paper(c, cutRect('lr-r', 190, 36, 1), K.orange); }, x: cx + 62, y: 520 },
      { t: T.logo + 2 / FPA, id: 'lw1', draw: () => paper(c, cutRect('lw1', 38, 38, 0.6), '#fff'), x: cx - 22, y: 590 },
      { t: T.logo + 2 / FPA, id: 'lw2', draw: () => paper(c, cutRect('lw2', 38, 38, 0.6), '#fff'), x: cx + 22, y: 590 },
      { t: T.logo + 3 / FPA, id: 'lw3', draw: () => paper(c, cutRect('lw3', 38, 38, 0.6), '#fff'), x: cx - 22, y: 634 },
      { t: T.logo + 3 / FPA, id: 'lw4', draw: () => paper(c, cutRect('lw4', 38, 38, 0.6), '#fff'), x: cx + 22, y: 634 },
    ];
    pieces.forEach((pc) => {
      if (t < pc.t) return;
      c.save();
      const f = frameNo(t) - frameNo(pc.t);
      at(c, pc.id, pc.x, pc.y - (f === 0 ? 14 : 0), 0, t, 0.9);
      if (f === 0) c.scale(1.1, 1.1);
      pc.draw();
      c.restore();
    });
    // wordmark: white letters cut from one sheet, stuck on one per drawing
    const name = CFG.brand.name;
    c.font = '900 150px Archivo';
    c.fontStretch = 'normal';
    const wAll = c.measureText(name).width + (name.length - 1) * 6;
    let wx = cx - wAll / 2;
    [...name].forEach((ch, i) => {
      const t0 = T.word + i / FPA;
      const w = c.measureText(ch).width;
      if (t >= t0) {
        const f = frameNo(t) - frameNo(t0);
        c.save();
        at(c, `wm${i}`, wx + w / 2, 820 - (f === 0 ? 16 : 0), (hash('wm', i) - 0.5) * 0.08, t, 0.8);
        if (f === 0) c.scale(1.12, 1.12);
        c.save();
        c.shadowColor = 'rgba(10,15,40,0.45)';
        c.shadowBlur = f === 0 ? 20 : 8;
        c.shadowOffsetX = 5;
        c.shadowOffsetY = f === 0 ? 16 : 7;
        c.font = '900 150px Archivo';
        c.fontStretch = 'normal';
        c.fillStyle = '#fbf7ef';
        c.textAlign = 'center';
        c.textBaseline = 'alphabetic';
        c.fillText(ch, 0, 0);
        c.restore();
        c.restore();
      }
      wx += w + 6;
    });
    // tagline on a torn cream strip
    if (t >= T.tag) {
      const f = frameNo(t) - frameNo(T.tag);
      c.save();
      at(c, 'tagstrip', cx, 960 - (f === 0 ? 14 : 0), -0.02, t, 0.8);
      if (f === 0) c.scale(1.06, 1.06);
      paper(c, cutRect('tagstrip', 780, 150, 1.6), K.cream, f === 0 ? 1 : 0.2);
      c.font = '700 46px Inter';
      c.fontStretch = 'normal';
      c.fillStyle = K.ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      CFG.brand.tagline.forEach((ln, i) => c.fillText(ln, 0, -28 + i * 58));
      c.restore();
    }
    // the CTA: a paper tag on a string, dropped in and swinging
    if (t >= T.cta) {
      const f = frameNo(t) - frameNo(T.cta);
      const tt = step(t) - T.cta;
      const drop = f < 3 ? [-260, -60, 18][f] : 0;
      const swing = 0.12 * Math.exp(-tt / 0.9) * Math.sin(tt * 7);
      c.save();
      c.translate(cx, 1060);
      // string from the tagline strip
      c.strokeStyle = '#efe6d2';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(0, -20);
      c.lineTo(Math.sin(swing) * 60, 50 + drop * 0.3);
      c.stroke();
      c.translate(Math.sin(swing) * 60, 50 + drop);
      c.rotate(swing);
      const tag = [[-300, 20], [300, 20], [300, 150], [-300, 150]];
      const hole = cutEllipse('ctah', 12, 12, 0.5).map(([px, py]) => [px, py + 44]);
      paper(c, cutPoly('cta', [[-40, 0], [40, 0], [300, 20], [300, 150], [-300, 150], [-300, 20]], 1), K.orange, f < 3 ? 1 : 0.4, [hole]);
      c.font = '800 50px Inter';
      c.fontStretch = 'normal';
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(CFG.brand.cta + ' →', 0, 92);
      c.restore();
    }
  }

  // ---------------------------------------------------------------- one frame
  function frame(t) {
    ctx.drawImage(kraft, 0, 0);
    const S = CFG.scenes;
    if (t < T.toolsOut + 0.6) tools(ctx, t);
    phone(ctx, t);
    if (t < T.handsOut + 0.7) collage(ctx, 'hands', S.hands, t, T.handsOut, 360, 92);
    if (t >= S.search[0][0][1] - 0.1 && t < T.searchOut + 0.8) collage(ctx, 'search', S.search, t, T.searchOut);
    if (t >= S.build[0][0][1] - 0.1 && t < T.buildOut + 0.8) collage(ctx, 'build', S.build, t, T.buildOut, 350, 108);
    if (t >= S.ring[0][0][1] - 0.1 && t < T.sheet + 0.5) collage(ctx, 'ring', S.ring, t, undefined, 390, 128);
    sheet(ctx, t);
    // paper grain over everything, shifted every drawing
    const f = frameNo(t);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.11;
    ctx.drawImage(grain, -Math.floor(hash('g', f, 1) * 40), -Math.floor(hash('g', f, 2) * 40), W + 40, H + 40);
    ctx.restore();
  }

  // ---------------------------------------------------------------- sound cues for tools/make_audio.py
  function cues() {
    const out = [];
    const add = (t, type, extra = {}) => out.push(Object.assign({ t: +t.toFixed(4), type }, extra));
    T.tools.forEach((t0, i) => { if (t0 >= 0) add(t0, 'slide', { i }); });
    const S = CFG.scenes;
    Object.entries(S).forEach(([name, lines]) => lines.forEach((ws) => ws.forEach(([w, t0]) => add(t0, 'word', { scene: name, n: w.length }))));
    add(T.toolsOut, 'sweep');
    add(T.phoneIn, 'slide', { i: 9 });
    for (let k = 0; k < 4; k++) add(T.results + k * 0.1, 'flap', { i: k });
    for (let k = 0; k < 4; k++) add(T.glass + k * 0.2, 'hop', { i: k });
    add(T.question, 'question');
    add(T.searchOut, 'sweep');
    add(T.scissors, 'slide', { i: 10 });
    T.snips.forEach((t0, i) => add(t0, 'snip', { i }));
    add(T.screenFall, 'fall');
    add(T.newScreen, 'flap', { i: 5 });
    T.tape.forEach((t0, i) => add(t0, 'tape', { i }));
    T.pieces.forEach((t0, i) => add(t0, 'stick', { i }));
    add(T.buildOut, 'sweep');
    add(T.buzz[0], 'ring', { until: T.buzz[1] });
    T.notes.forEach((t0, i) => add(t0, 'note', { i }));
    add(T.sheet, 'sheet');
    add(T.logo, 'stick', { i: 10 });
    for (let i = 0; i < CFG.brand.name.length; i++) add(T.word + i / FPA, 'letter', { i });
    add(T.tag, 'stick', { i: 11 });
    add(T.cta, 'cta');
    return out.sort((x, y) => x.t - y.t);
  }

  // ---------------------------------------------------------------- main
  const stage = document.getElementById('stage');
  const q = new URLSearchParams(location.search);
  const seek = (t) => frame(clamp(t, 0, DUR - 1e-6));
  window.__meta = { W, H, DUR, BPM, format: 'portrait', fps: 24, blur: [], poster: 14.2, cues: cues() };
  window.__seek = seek;
  window.__debug = { T, layoutLine };
  const fontsToLoad = ['900 100px Archivo', '800 100px Archivo', '400 100px Archivo', '600 100px Archivo', '800 100px Inter', '700 30px Inter', '600 24px Inter', "800 100px 'JetBrains Mono'"];
  window.__ready = Promise.all(fontsToLoad.map((f) => document.fonts.load(f)))
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
    // the mix with the voice-over if it has been made, else the music on its own
    const audio = new Audio('../out/soundtrack-da.wav');
    audio.addEventListener('error', () => {
      audio.src = '../out/soundtrack.wav';
      if (playing) { audio.currentTime = now(); audio.play().catch(() => {}); }
    }, { once: true });
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
