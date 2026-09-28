/*
 * "Vejrudsigten" — a 15 s TV-weather parody for a company that builds websites for tradespeople: the forecast is
 * for your calendar. Every frame is a pure function of time: __seek(t) redraws the 1080x1920 canvas for time t.
 * The pictures follow the voice-over (vo/da/cues.json); VO[i] below are the lines' start times and lengths.
 *
 *   0.0  "VEJRET for din kalender" over a map of Denmark; suns rise over a parched country
 *   2.2  dry: the ground cracks, heat shimmer, and every city shows 0 jobs on "Ingen opgaver"
 *   5.0  a warm front labelled "NY HJEMMESIDE" drives in from the west; the land turns green behind it
 *   8.1  a cloudburst: clouds over the cities rain bookings from "skybrud" and the counters climb
 *  10.4  the map makes way for the 5-day outlook — booked every day — "Prognose: travlt.", then sitecrew, the
 *        tagline and the CTA
 *
 * The map lives in its own coordinates (screen pixels at zoom 1, see map.js) and has a camera for the slow
 * TV-style drift. Text and the key numbers sit between 17 % and 64 % of the height, clear of the Reels UI.
 */
(function () {
  'use strict';
  const { clamp, lerp, prog, E, spring, kf, rng } = A;
  const CFG = window.CONFIG;
  const K = CFG.colors;
  const DK = window.DK;
  const W = 1080, H = 1920;
  const DUR = 15;
  const BPM = 96;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const TAU = Math.PI * 2;
  const HEAD = "'Archivo'", UI = "'Inter'";

  // ---------------------------------------------------------------- timeline, locked to the voice-over
  // [start, length] of each spoken line in seconds (vo/da/cues.json `at`, and the lengths of vo/da/*.wav), and where
  // the words that the pictures react to begin inside their line (forced alignment with the Danish Røst ASR)
  const VO = [[0.3, 1.57], [2.2, 2.47], [5.0, 2.77], [8.1, 1.48], [10.35, 1.86]];
  const WORD = { ingen: 0.98, ny: 1.14, skybrud: 0.51, resten: 0.69, travlt: 1.42 };
  const T = {
    intro: 0.0,
    suns: [VO[0][0] + 0.5, VO[0][0] + 0.8, VO[0][0] + 1.1],
    dry: VO[1][0], zero: VO[1][0] + WORD.ingen,             // the counters pop on "Ingen opgaver i sigte"
    front0: VO[2][0] + 0.1, front1: VO[3][0] + 0.1,          // the front crosses the map during line 3
    shower: VO[3][0] + WORD.skybrud - 0.05,                  // bookings rain from "skybrud"
    outlook: VO[4][0] + 0.1, days: VO[4][0] + WORD.resten, busy: VO[4][0] + WORD.travlt,
    brand: VO[4][0] + VO[4][1] + 0.1,
  };
  T.showerEnd = T.outlook - 0.05;
  T.tag = T.brand + 0.35;
  T.cta = T.brand + 0.7;

  // ---------------------------------------------------------------- helpers
  const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixc = (a, c, f) => { const x = hexRgb(a), y = hexRgb(c); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], clamp(f)))).join(',')})`; };
  const rgba = (h, a) => { const [r, g, bl] = hexRgb(h); return `rgba(${r},${g},${bl},${clamp(a)})`; };
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, TAU); }
  const setFont = (c, weight, size, fam = UI, stretch = 'normal') => { c.font = `${weight} ${size}px ${fam}`; c.fontStretch = stretch; };
  const shadowOn = (c, blur = 24, dy = 10, a = 0.3) => { c.shadowColor = `rgba(0,8,30,${a})`; c.shadowBlur = blur; c.shadowOffsetX = 0; c.shadowOffsetY = dy; };
  const shadowOff = (c) => { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0; };
  const pop = (t, t0, d = 0.3) => (t < t0 ? 0 : E.outBack(prog(t, t0, d)));
  function tick(c, x, y, s, col, p01 = 1) {
    c.save();
    c.strokeStyle = col;
    c.lineWidth = s * 0.16;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const p = [[x - s * 0.34, y + s * 0.02], [x - s * 0.1, y + s * 0.26], [x + s * 0.36, y - s * 0.24]];
    const l1 = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]), l2 = Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]);
    const d = (l1 + l2) * clamp(p01);
    c.beginPath();
    c.moveTo(...p[0]);
    if (d <= l1) c.lineTo(lerp(p[0][0], p[1][0], d / l1), lerp(p[0][1], p[1][1], d / l1));
    else { c.lineTo(...p[1]); c.lineTo(lerp(p[1][0], p[2][0], (d - l1) / l2), lerp(p[1][1], p[2][1], (d - l1) / l2)); }
    c.stroke();
    c.restore();
  }
  function roofMark(c, x, y, s, col) {
    c.save();
    c.strokeStyle = col;
    c.lineWidth = s * 0.14;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x - s * 0.62, y + s * 0.02);
    c.lineTo(x, y - s * 0.5);
    c.lineTo(x + s * 0.62, y + s * 0.02);
    c.stroke();
    c.fillStyle = col;
    const q = s * 0.17, g = s * 0.05;
    c.fillRect(x - q - g / 2, y - s * 0.02, q, q);
    c.fillRect(x + g / 2, y - s * 0.02, q, q);
    c.fillRect(x - q - g / 2, y + q + g / 2 - s * 0.02, q, q);
    c.fillRect(x + g / 2, y + q + g / 2 - s * 0.02, q, q);
    c.restore();
  }
  // a little booking: a calendar sheet with a tick
  function booking(c, x, y, s, a = 1) {
    c.save();
    c.globalAlpha *= a;
    c.translate(x, y);
    c.scale(s, s);
    rr(c, -14, -13, 28, 27, 5);
    c.fillStyle = '#fff';
    c.fill();
    c.fillStyle = K.orange;
    c.fillRect(-14, -13, 28, 8);
    c.fillRect(-9, -17, 4, 7);
    c.fillRect(5, -17, 4, 7);
    tick(c, 0, 4, 16, '#1f9d5b');
    c.restore();
  }

  // ---------------------------------------------------------------- the map (map space = screen pixels at zoom 1)
  const MAP = { k: 300, cx: 530, cy: 890 };
  const proj = (lon, lat) => [MAP.cx + (lon - DK.lon0) * DK.coslat * MAP.k, MAP.cy - (lat - DK.lat0) * MAP.k];
  function smooth(pts, closed = true) {
    const p = new Path2D();
    const n = pts.length;
    p.moveTo(pts[0][0], pts[0][1]);
    const at = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (closed) p.closePath();
    return p;
  }
  const LAND = new Path2D();
  Object.values(DK.land).forEach((pts) => LAND.addPath(smooth(pts.map((q) => proj(...q)))));
  const FJORD = smooth(DK.limfjord.map((q) => proj(...q)), false);
  // Bornholm in an inset box, top right
  const BOX = { x: 900, y: 452, w: 120, h: 96 };
  const bornPts = DK.bornholm.map((q) => proj(...q));
  const bcx = bornPts.reduce((a, p) => a + p[0], 0) / bornPts.length, bcy = bornPts.reduce((a, p) => a + p[1], 0) / bornPts.length;
  const BORN = smooth(bornPts.map(([x, y]) => [x - bcx + BOX.x + BOX.w / 2, y - bcy + BOX.y + BOX.h / 2]));
  const CITIES = DK.cities.map((c, i) => ({ ...c, p: proj(c.lon, c.lat), n: CFG.counts[i], label: i === 4 ? 'left' : 'right' }));
  const SUNS = [proj(9.45, 57.28), proj(8.85, 56.05), proj(11.55, 55.42)];
  // cracks in the parched land: short jagged lines scattered over the map (clipped to the land when drawn)
  const CRACKS = (() => {
    const r = rng(9);
    return [...Array(70)].map(() => {
      let x = 150 + r() * 800, y = 430 + r() * 960, a = r() * TAU;
      const pts = [[x, y]];
      for (let k = 0; k < 4; k++) {
        a += (r() - 0.5) * 1.6;
        x += Math.cos(a) * (10 + r() * 16);
        y += Math.sin(a) * (10 + r() * 16);
        pts.push([x, y]);
      }
      return pts;
    });
  })();

  // the front: a bent line sweeping west to east, x = where its middle is
  const FRONT_Y = [420, 1400];
  function frontX(t) {
    return lerp(-100, 1350, E.inOutSine(prog(t, T.front0, T.front1 - T.front0)));
  }
  function frontPts(fx) {
    const pts = [];
    for (let k = 0; k <= 24; k++) {
      const v = k / 24;
      pts.push([fx + 90 * Math.sin(Math.PI * v) - 40 * v, lerp(FRONT_Y[0], FRONT_Y[1], v)]);
    }
    return pts;
  }
  const greenAt = (t) => (t < T.front0 ? 0 : 1); // behind the front the land is green

  function camera(t) {
    // the TV-weather drift: starts close on Jutland, eases out to the whole country, then leans in for the showers
    const z = kf(t, [[0, 1.22], [2.6, 1.0, E.inOutCubic], [T.front0, 1.0], [T.front1, 1.06, E.inOutSine], [T.outlook, 1.06], [T.outlook + 0.7, 0.62, E.inOutCubic]]);
    const x = kf(t, [[0, 470], [2.6, 540, E.inOutCubic], [T.front0, 540], [(T.front0 + T.front1) / 2, 520, E.inOutSine], [T.front1, 555, E.inOutSine],
      [T.outlook, 545, E.inOutSine]]);
    const y = kf(t, [[0, 820], [2.6, 900, E.inOutCubic], [T.outlook, 900], [T.outlook + 0.7, 700, E.inOutCubic]]);
    return { z, x, y, sx: 540, sy: 900 + kf(t, [[T.outlook, 0], [T.outlook + 0.7, -130, E.inOutCubic]]) };
  }
  const applyCam = (c, cam) => { c.translate(cam.sx, cam.sy); c.scale(cam.z, cam.z); c.translate(-cam.x, -cam.y); };

  function studio(c) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d2a5c');
    g.addColorStop(0.55, K.navy);
    g.addColorStop(1, '#061431');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const r = c.createRadialGradient(W * 0.55, 860, 60, W * 0.55, 860, 900);
    r.addColorStop(0, 'rgba(70,140,255,0.28)');
    r.addColorStop(1, 'rgba(70,140,255,0)');
    c.fillStyle = r;
    c.fillRect(0, 0, W, H);
  }

  function map(c, t, cam) {
    const fx = frontX(t);
    const fade = 1 - E.inOutCubic(prog(t, T.outlook + 0.1, 0.6)) * 0.87;
    c.save();
    c.globalAlpha = fade;
    applyCam(c, cam);
    // sea with a faint grid
    c.save();
    c.strokeStyle = 'rgba(160,200,255,0.07)';
    c.lineWidth = 2;
    for (let lon = 7; lon <= 16; lon += 0.5) {
      const [x] = proj(lon, 56);
      c.beginPath(); c.moveTo(x, 200); c.lineTo(x, 1700); c.stroke();
    }
    for (let lat = 54; lat <= 58.5; lat += 0.25) {
      const [, y] = proj(10, lat);
      c.beginPath(); c.moveTo(-200, y); c.lineTo(1300, y); c.stroke();
    }
    c.restore();
    // shallow water glow along the coasts
    c.save();
    c.lineJoin = 'round';
    for (const [w, a] of [[46, 0.06], [26, 0.08], [12, 0.1]]) {
      c.strokeStyle = `rgba(120,190,255,${a})`;
      c.lineWidth = w;
      c.stroke(LAND);
    }
    c.restore();
    // the extruded edge, then the land (dry, green behind the front)
    c.save();
    c.translate(0, 12);
    c.fillStyle = '#0b2a52';
    c.fill(LAND);
    c.restore();
    c.save();
    shadowOn(c, 30, 18, 0.35);
    c.fillStyle = K.dry;
    c.fill(LAND);
    shadowOff(c);
    // parched texture: a warm gradient
    const dg = c.createLinearGradient(0, 400, 0, 1400);
    dg.addColorStop(0, 'rgba(255,230,160,0.35)');
    dg.addColorStop(1, 'rgba(170,110,40,0.25)');
    c.fillStyle = dg;
    c.fill(LAND);
    // the cracks spread as it gets drier (the green land covers them behind the front)
    const crack = E.outCubic(prog(t, T.dry + 0.2, 0.9));
    if (crack > 0) {
      c.save();
      c.clip(LAND);
      c.strokeStyle = 'rgba(122,78,28,0.45)';
      c.lineWidth = 2.2;
      c.lineJoin = 'round';
      CRACKS.forEach((pts) => {
        const n = Math.max(1, Math.round(crack * (pts.length - 1)));
        c.beginPath();
        pts.slice(0, n + 1).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.stroke();
      });
      c.restore();
    }
    if (greenAt(t)) {
      c.save();
      const fp = frontPts(fx);
      c.beginPath();
      c.moveTo(-3000, FRONT_Y[0] - 800);
      fp.forEach(([x, y], i) => (i === 0 ? c.lineTo(x, FRONT_Y[0] - 800) : null));
      fp.forEach(([x, y]) => c.lineTo(x, y));
      c.lineTo(fp[fp.length - 1][0], FRONT_Y[1] + 800);
      c.lineTo(-3000, FRONT_Y[1] + 800);
      c.closePath();
      c.clip();
      c.fillStyle = K.green;
      c.fill(LAND);
      const gg = c.createLinearGradient(0, 400, 0, 1400);
      gg.addColorStop(0, 'rgba(190,255,170,0.25)');
      gg.addColorStop(1, 'rgba(20,90,40,0.25)');
      c.fillStyle = gg;
      c.fill(LAND);
      c.restore();
    }
    // the opening shine sweeping over the land
    if (t < 1.2) {
      const u = prog(t, 0.1, 0.9);
      c.save();
      c.clip(LAND);
      const sx = lerp(-200, 1300, E.inOutSine(u));
      const g = c.createLinearGradient(sx - 160, 0, sx + 160, 200);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${0.35 * Math.sin(Math.PI * u)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(-200, 0, 1500, 1920);
      c.restore();
    }
    // coast rim light and the Limfjord
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 2.5;
    c.stroke(LAND);
    c.strokeStyle = K.sea;
    c.lineWidth = 7;
    c.lineCap = 'round';
    c.stroke(FJORD);
    c.restore();
    // heat shimmer over the dry land
    const heat = clamp(prog(t, T.dry - 0.3, 0.6)) * (1 - clamp(prog(t, T.front0, 1.2)));
    if (heat > 0) {
      c.save();
      c.clip(LAND);
      c.strokeStyle = `rgba(255,250,230,${0.22 * heat})`;
      c.lineWidth = 3;
      for (let k = 0; k < 9; k++) {
        const y0 = 470 + k * 105 + 20 * Math.sin(t * 1.3 + k);
        c.beginPath();
        for (let x = 100; x <= 1000; x += 12) c.lineTo(x, y0 + 7 * Math.sin(x / 38 + t * 5 + k * 1.7));
        c.stroke();
      }
      c.restore();
    }
    // isobars drifting across
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.16)';
    c.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      for (let y = 300; y <= 1500; y += 20) {
        const x = 120 + k * 250 + 60 * Math.sin(y / 260 + k) + 18 * t;
        y === 300 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
    c.restore();
    // Bornholm inset
    c.save();
    rr(c, BOX.x, BOX.y, BOX.w, BOX.h, 12);
    c.fillStyle = 'rgba(18,64,125,0.85)';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = t >= T.front0 + 0.95 * (T.front1 - T.front0) ? K.green : K.dry;
    c.fill(BORN);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.stroke(BORN);
    c.restore();
    c.restore();
  }

  // ---------------------------------------------------------------- weather symbols (map space, drawn with the camera)
  function sun(c, x, y, s, t, k) {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    const glow = c.createRadialGradient(0, 0, 20, 0, 0, 120);
    glow.addColorStop(0, 'rgba(255,210,80,0.45)');
    glow.addColorStop(1, 'rgba(255,210,80,0)');
    c.fillStyle = glow;
    circle(c, 0, 0, 120);
    c.fill();
    c.rotate(t * 0.5 + k);
    c.fillStyle = K.sun;
    for (let r = 0; r < 12; r++) {
      c.save();
      c.rotate((r / 12) * TAU);
      rr(c, -7, -86, 14, 26, 7);
      c.fill();
      c.restore();
    }
    const g = c.createRadialGradient(-14, -16, 6, 0, 0, 56);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.5, K.sun);
    g.addColorStop(1, '#f59e0b');
    c.fillStyle = g;
    circle(c, 0, 0, 54);
    c.fill();
    c.restore();
  }
  function cloud(c, x, y, s, dark = 0, a = 1) {
    c.save();
    c.globalAlpha *= a;
    c.translate(x, y);
    c.scale(s, s);
    shadowOn(c, 26, 14, 0.3);
    const top = mixc('#ffffff', '#9fb0c8', dark), bot = mixc('#dfe8f4', '#6f819c', dark);
    const g = c.createLinearGradient(0, -80, 0, 50);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    c.fillStyle = g;
    c.beginPath();
    c.arc(-58, 10, 42, 0, TAU);
    c.arc(-12, -22, 58, 0, TAU);
    c.arc(44, -4, 48, 0, TAU);
    c.arc(84, 18, 32, 0, TAU);
    c.fill();
    rr(c, -100, 8, 214, 44, 22);
    c.fill();
    shadowOff(c);
    c.restore();
  }

  function suns(c, t) {
    SUNS.forEach(([x, y], k) => {
      const inn = pop(t, T.suns[k], 0.45);
      // each sun goes when the front reaches it
      const covered = frontX(t) > x - 60 ? clamp((frontX(t) - x + 60) / 200) : 0;
      const s = inn * (1 - E.inCubic(covered)) * (1 + 0.03 * Math.sin(t * 3 + k));
      if (s > 0.01) sun(c, x, y, s * 0.95, t, k);
    });
  }

  // clouds riding behind the front, with rain streaks
  const FCLOUDS = [[-150, 520, 1.1], [-240, 760, 1.25], [-120, 1000, 1.05], [-230, 1230, 1.15]];
  function frontClouds(c, t) {
    if (t < T.front0 || t > T.shower + 0.6) return;
    const fx = frontX(t);
    const out = clamp(prog(t, T.front1 - 0.3, 0.8));
    FCLOUDS.forEach(([dx, y, s], k) => {
      const x = fx + dx + 90 * Math.sin(Math.PI * clamp((y - FRONT_Y[0]) / (FRONT_Y[1] - FRONT_Y[0])));
      c.save();
      c.strokeStyle = `rgba(200,225,255,${0.4 * (1 - out)})`;
      c.lineWidth = 3;
      for (let r = 0; r < 9; r++) {
        const rx = x - 80 + r * 20, ph = (t * 3.2 + r * 0.37) % 1;
        c.beginPath();
        c.moveTo(rx - ph * 26, y + 40 + ph * 150);
        c.lineTo(rx - ph * 26 - 10, y + 40 + ph * 150 + 30);
        c.stroke();
      }
      c.restore();
      cloud(c, x, y, s, 0.35, 1 - out);
    });
  }

  function front(c, t) {
    if (t < T.front0 || t > T.front1 + 0.2) return;
    const fx = frontX(t);
    const pts = frontPts(fx);
    c.save();
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.strokeStyle = K.orange;
    c.lineWidth = 10;
    shadowOn(c, 16, 6, 0.35);
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
    // warm-front half-discs on the leading (east) side
    c.fillStyle = K.orange;
    for (let i = 1; i < pts.length - 1; i += 2) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i + 1];
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const [x, y] = pts[i];
      c.beginPath();
      c.arc(x, y, 20, ang - Math.PI, ang, true);
      c.fill();
    }
    shadowOff(c);
    // the label rides the middle of the front
    const [lx, ly] = pts[12];
    setFont(c, 800, 34, HEAD);
    const tw = c.measureText(CFG.front).width;
    // it rides with the front, fading in as the front comes ashore and out as it leaves to the east
    const la = clamp((lx + 60) / 220) * clamp((1120 - lx) / 220);
    if (la <= 0) { c.restore(); return; }
    const lxs = clamp(lx - 20, tw / 2 + 70, W - tw / 2 - 70);
    c.save();
    c.globalAlpha = la;
    c.translate(lxs, ly - 70);
    shadowOn(c, 18, 8, 0.4);
    rr(c, -tw / 2 - 26, -30, tw + 52, 60, 30);
    c.fillStyle = K.orange;
    c.fill();
    shadowOff(c);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(CFG.front, 0, 2);
    c.restore();
    c.restore();
  }

  // cities: a dot, a name, and a bubble with the number of new jobs
  function showerStart(i) { return T.shower + i * 0.08; }
  function dropsFor(i) {
    const n = Math.min(CITIES[i].n, 12);
    const r = rng(40 + i);
    return [...Array(n)].map((_, k) => ({ t0: showerStart(i) + 0.1 + (k / n) * 0.85 + r() * 0.06, dx: (r() - 0.5) * 70 }));
  }
  const DROPS = CITIES.map((_, i) => dropsFor(i));
  const FALL = 0.36;
  function countAt(i, t) {
    const drops = DROPS[i];
    const landed = drops.filter((d) => t >= d.t0 + FALL).length;
    return Math.round((landed / drops.length) * CITIES[i].n);
  }
  function cities(c, t) {
    CITIES.forEach((city, i) => {
      const [x, y] = city.p;
      // dot and name
      const dotIn = pop(t, 0.15 + i * 0.08, 0.3);
      c.save();
      c.fillStyle = '#fff';
      shadowOn(c, 8, 3, 0.4);
      circle(c, x, y, 9 * dotIn);
      c.fill();
      shadowOff(c);
      c.fillStyle = K.ink;
      circle(c, x, y, 4 * dotIn);
      c.fill();
      setFont(c, 700, 25);
      c.fillStyle = `rgba(255,255,255,${0.95 * clamp(dotIn)})`;
      c.textAlign = city.label === 'left' ? 'right' : 'left';
      c.textBaseline = 'middle';
      shadowOn(c, 6, 2, 0.6);
      c.fillText(city.name, x + (city.label === 'left' ? -18 : 18), y + 2);
      shadowOff(c);
      c.restore();
      // the city's cloud and its rain of bookings
      const cIn = E.outCubic(prog(t, showerStart(i) - 0.35, 0.4)) * (1 - E.inCubic(prog(t, T.showerEnd, 0.4)));
      if (cIn > 0) {
        DROPS[i].forEach((d) => {
          const u = (t - d.t0) / FALL;
          if (u < 0 || u > 1.15) return;
          const yy = lerp(y - 150, y - 34, E.inQuad(clamp(u)));
          booking(c, x + d.dx * (1 - u * 0.6), yy, 0.9, u > 1 ? 1 - (u - 1) / 0.15 : clamp(u * 4));
        });
        cloud(c, x, y - 196, 0.72, 0.45, cIn);
      }
      // the bubble: 0 while it is dry, then counting up under the shower
      const bIn = pop(t, T.zero + i * 0.1, 0.35);
      if (bIn <= 0) return;
      const n = t < showerStart(i) ? 0 : countAt(i, t);
      const wet = t >= showerStart(i) + 0.15;
      const lastLand = DROPS[i].map((d) => d.t0 + FALL).filter((v) => v <= t).pop();
      const bump = lastLand !== undefined ? 1 + 0.25 * Math.exp(-(t - lastLand) / 0.08) : 1;
      const out = E.inCubic(prog(t, T.outlook, 0.4));
      const s = bIn * bump * (1 - out);
      if (s <= 0.01) return;
      c.save();
      c.translate(x, y - 58);
      c.scale(s, s);
      const label = String(n);
      setFont(c, 800, 38, HEAD);
      const w = 76 + c.measureText(label).width;
      shadowOn(c, 12, 6, 0.35);
      rr(c, -w / 2, -30, w, 60, 30);
      c.fillStyle = wet ? '#ffffff' : '#f3e7c9';
      c.fill();
      shadowOff(c);
      booking(c, -w / 2 + 34, 1, 1.05, wet ? 1 : 0.55);
      c.fillStyle = wet && n > 0 ? K.orange : '#7a6a48';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(label, -w / 2 + 58, 3);
      // the pointer under the bubble
      c.fillStyle = wet ? '#ffffff' : '#f3e7c9';
      c.beginPath();
      c.moveTo(-10, 28);
      c.lineTo(10, 28);
      c.lineTo(0, 42);
      c.closePath();
      c.fill();
      c.restore();
    });
  }

  // ---------------------------------------------------------------- screen-space graphics
  function header(c, t) {
    const inn = E.outCubic(prog(t, 0.0, 0.5));
    c.save();
    c.translate((1 - inn) * -200, 0);
    c.globalAlpha = clamp(inn * 1.5);
    const y = 318;
    setFont(c, 800, 46, HEAD);
    const cw = c.measureText(CFG.title.chip).width + 52;
    shadowOn(c, 18, 8, 0.35);
    const g = c.createLinearGradient(60, y, 60 + cw, y + 70);
    g.addColorStop(0, '#ff8a3d');
    g.addColorStop(1, '#f0441f');
    c.fillStyle = g;
    rr(c, 60, y, cw, 70, 16);
    c.fill();
    shadowOff(c);
    c.fillStyle = '#fff';
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillText(CFG.title.chip, 86, y + 37);
    setFont(c, 600, 40);
    c.fillText(CFG.title.rest, 60 + cw + 22, y + 37);
    c.restore();
    // clock, top right
    const ci = E.outCubic(prog(t, 0.25, 0.5));
    c.save();
    c.globalAlpha = ci;
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    setFont(c, 700, 38);
    c.fillStyle = '#fff';
    c.fillText(CFG.clock.time, 1020, y + 22);
    setFont(c, 500, 26);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillText(CFG.clock.day, 1020, y + 58);
    c.restore();
  }

  // the caption band: one short line per spoken line
  function captions(c, t) {
    const y = 1152, h = 86;
    let idx = -1;
    VO.forEach(([a], i) => { if (t >= a - 0.1 && CFG.captions[i]) idx = i; });
    if (idx < 0) return;
    const hide = E.inCubic(prog(t, T.outlook, 0.3));
    if (hide >= 1) return;
    const first = CFG.captions.findIndex((x) => x);
    const inn = E.outCubic(prog(t, VO[first][0] - 0.2, 0.4));
    c.save();
    c.globalAlpha = inn * (1 - hide);
    shadowOn(c, 20, 8, 0.35);
    rr(c, 60, y, W - 120, h, 18);
    c.fillStyle = 'rgba(6,20,49,0.86)';
    c.fill();
    shadowOff(c);
    c.fillStyle = K.orange;
    rr(c, 60, y, 14, h, 7);
    c.fill();
    c.beginPath();
    c.rect(80, y, W - 160, h);
    c.clip();
    // each new caption slides up in place of the last
    VO.forEach(([a], i) => {
      if (i > idx || i < idx - 1 || !CFG.captions[i]) return;
      const u = E.outCubic(prog(t, a - 0.1, 0.35));
      const dy = i === idx ? (1 - u) * h : -u * h;
      if (i < idx && prog(t, VO[idx][0] - 0.1, 0.35) >= 1) return;
      setFont(c, 600, 40);
      c.fillStyle = '#fff';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(CFG.captions[i], 104, y + h / 2 + 2 + (i === idx ? dy : -E.outCubic(prog(t, VO[idx][0] - 0.1, 0.35)) * h));
    });
    c.restore();
  }

  // ---------------------------------------------------------------- outlook and end card
  function dayIcon(c, x, y, s) {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    cloud(c, 0, -6, 0.42, 0.2);
    booking(c, -18, 24, 0.75);
    booking(c, 16, 30, 0.75);
    c.restore();
  }
  function outlook(c, t) {
    if (t < T.outlook) return;
    // "Prognose:" then "travlt." on the word
    const a1 = E.outCubic(prog(t, T.outlook + 0.1, 0.4));
    c.save();
    c.globalAlpha = a1;
    setFont(c, 700, 64, HEAD);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText(CFG.outlook[0], W / 2, 470 + (1 - a1) * 30);
    c.restore();
    const a2 = pop(t, T.busy, 0.4);
    if (a2 > 0) {
      c.save();
      c.translate(W / 2, 560);
      c.scale(a2, a2);
      setFont(c, 900, 150, HEAD, 'semi-condensed');
      c.fillStyle = K.orange;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      shadowOn(c, 30, 12, 0.35);
      c.fillText(CFG.outlook[1], 0, 0);
      shadowOff(c);
      c.restore();
    }
    // five days, booked full
    const cw = 176, gap = 14, x0 = W / 2 - (5 * cw + 4 * gap) / 2, y0 = 646, ch = 214;
    CFG.days.forEach((d, i) => {
      const s = pop(t, T.days + i * 0.1, 0.35);
      if (s <= 0) return;
      const x = x0 + i * (cw + gap);
      c.save();
      c.translate(x + cw / 2, y0 + ch / 2);
      c.scale(s, s);
      shadowOn(c, 18, 8, 0.35);
      rr(c, -cw / 2, -ch / 2, cw, ch, 20);
      c.fillStyle = 'rgba(255,255,255,0.1)';
      c.fill();
      shadowOff(c);
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.lineWidth = 2;
      c.stroke();
      setFont(c, 800, 30, HEAD);
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.fillText(d, 0, -ch / 2 + 44);
      dayIcon(c, 0, -14, 1);
      setFont(c, 700, 24);
      c.fillStyle = K.sun;
      c.fillText(CFG.full[0], 0, ch / 2 - 40);
      c.fillText(CFG.full[1], 0, ch / 2 - 13);
      c.restore();
    });
  }
  function brand(c, t) {
    if (t < T.brand) return;
    const u = E.outCubic(prog(t, T.brand, 0.45));
    c.save();
    c.globalAlpha = u;
    setFont(c, 800, 104, HEAD);
    const tw = c.measureText(CFG.brand.name).width;
    const x0 = W / 2 - (tw + 130) / 2;
    const y = 960 + (1 - u) * 20;
    roofMark(c, x0 + 46, y - 32, 88 * spring(t - T.brand, 2.6, 0.45), K.orange);
    c.fillStyle = '#fff';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText(CFG.brand.name, x0 + 130, y + 4);
    c.restore();
    const tg = E.outCubic(prog(t, T.tag, 0.45));
    if (tg > 0) {
      c.save();
      c.globalAlpha = tg;
      setFont(c, 600, 42);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.textAlign = 'center';
      c.fillText(CFG.brand.tagline.join(' '), W / 2, 1048 + (1 - tg) * 12);
      c.restore();
    }
    if (t >= T.cta) {
      const v = E.outBack(prog(t, T.cta, 0.35));
      const beat = ((t - T.cta) / (60 / BPM)) % 1;
      const pulse = t > T.cta + 0.5 ? 1 + 0.03 * Math.exp(-beat * 6) : 1;
      const pw = 600 * v * pulse, ph = 112 * clamp(v) * pulse, cy = 1160;
      c.save();
      shadowOn(c, 30, 12, 0.45);
      rr(c, W / 2 - pw / 2, cy - ph / 2, pw, ph, ph / 2);
      c.fillStyle = K.orange;
      c.fill();
      shadowOff(c);
      c.globalAlpha = clamp((v - 0.5) * 2);
      setFont(c, 800, 44, HEAD);
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(CFG.brand.cta, W / 2, cy + 3);
      c.restore();
    }
  }

  // ---------------------------------------------------------------- one frame
  function frame(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    studio(ctx);
    const cam = camera(t);
    map(ctx, t, cam);
    ctx.save();
    ctx.globalAlpha = 1 - E.inOutCubic(prog(t, T.outlook + 0.1, 0.5));
    applyCam(ctx, cam);
    suns(ctx, t);
    frontClouds(ctx, t);
    front(ctx, t);
    cities(ctx, t);
    ctx.restore();
    header(ctx, t);
    captions(ctx, t);
    outlook(ctx, t);
    brand(ctx, t);
  }

  // ---------------------------------------------------------------- sound cues for tools/make_audio.py
  function cues() {
    const out = [];
    const add = (t, type, extra = {}) => out.push(Object.assign({ t: +t.toFixed(4), type }, extra));
    add(0, 'intro');
    VO.forEach(([at, len], i) => add(at, 'line', { i, until: +(at + len).toFixed(4) })); // the music leaves room for the voice
    T.suns.forEach((t0, i) => add(t0, 'sun', { i }));
    add(T.dry, 'dry');
    CITIES.forEach((_, i) => add(T.zero + i * 0.1, 'zero', { i }));
    add(T.front0, 'front', { until: T.front1 });
    CITIES.forEach((_, i) => DROPS[i].forEach((d, k) => add(d.t0 + FALL, 'drop', { i, k })));
    add(T.outlook, 'outlook');
    CFG.days.forEach((_, i) => add(T.days + i * 0.1, 'day', { i }));
    add(T.busy, 'busy');
    add(T.brand, 'brand');
    add(T.cta, 'cta');
    return out.sort((x, y) => x.t - y.t);
  }

  // ---------------------------------------------------------------- main
  const stage = document.getElementById('stage');
  const q = new URLSearchParams(location.search);
  const seek = (t) => frame(clamp(t, 0, DUR - 1e-6));
  const BLUR = [[0, 0.6], [T.front0, T.front1 + 0.2], [T.shower - 0.2, T.showerEnd + 0.3], [T.outlook, T.outlook + 0.8], [T.cta - 0.05, T.cta + 0.4]];
  window.__meta = { W, H, DUR, BPM, format: 'portrait', blur: BLUR, poster: DUR - 0.5, cues: cues() };
  window.__seek = seek;
  window.__debug = { T, VO, frontX };
  window.__ready = Promise.all([document.fonts.load(`800 40px ${HEAD}`), document.fonts.load(`700 40px ${HEAD}`), document.fonts.load(`900 40px ${HEAD}`),
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
    const audio = new Audio('../out/soundtrack-da.wav');
    audio.onerror = () => { audio.onerror = null; audio.src = '../out/soundtrack.wav'; };
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
