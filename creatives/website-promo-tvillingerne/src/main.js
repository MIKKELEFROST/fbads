/*
 * "Tvillingerne" — a 15 s split-screen ad for a company that builds websites for tradespeople.
 * Every frame is a pure function of time: __seek(t) redraws the 1080x1920 canvas for time t.
 * Beat grid: 120 BPM → b(n) is the time of beat n (30 beats = 15 s). All copy comes from config.js.
 *
 *   0.0  one carpenter, hands on hips; on beat 0.5 he splits down the middle into two identical twins
 *   0.5  "To tømrere. Lige dygtige." — both toss a hammer and catch it, five stars each    (beats 1-5.5)
 *   2.8  "Samme værktøj. Samme pris." — saw, level and drill swap in on the beat, and a     (beats 5.5-10.5)
 *        price sticker slaps onto both chests
 *   5.3  "Men kun den ene får opgaverne." — both take out their phones. The right one      (beats 10.5-18)
 *        rings: he answers, jobs stack up and his counter climbs. The left one stays quiet: he taps and
 *        shakes his phone, a tumbleweed rolls past, and his half drains to grey
 *   9.3  "Én forskel: hjemmesiden." — both hold their phones up to the camera: no website    (beats 18.5-22.5)
 *        on the left, his website on the right, circled in red like a spot-the-difference puzzle
 *  11.3  the right half pushes the left one out; end card with sitecrew, the tagline, the CTA (beats 22.5-30)
 *
 * Each half has its own camera (for the push-in on the phones). Every colour goes through C(), which
 * drains the left half of colour while nothing happens there. Text sits between 20 % and 65 % of the
 * height, clear of the Reels UI.
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

  // ---------------------------------------------------------------- colour: every fill goes through C()
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
  const mixHex = (h1, h2, u) => {
    const a = rgbOf(h1), c = rgbOf(h2);
    return '#' + a.map((v, i) => Math.round(lerp(v, c[i], clamp(u))).toString(16).padStart(2, '0')).join('');
  };
  const P = { // the twins' palette
    skin: '#f1b28a', skinDk: '#d98f69', blush: '#ef9a86', beard: '#6b4428', hair: '#5c3920',
    cap: K.orange, capDk: '#dd5418', jacket: K.blue, jacketDk: '#2455b0', cuff: '#1f4a9a', tee: '#f6efe4',
    stripe: K.yellow, pants: '#3a4159', pantsDk: '#2b3146', belt: '#a4622d', beltDk: '#7a461f', buckle: '#f2c24b',
    boot: '#5b3a22', sole: '#2d1e13', eye: '#241a17', mouth: '#4a2014', tongue: '#e0706a',
    steel: '#c7ced6', steelDk: '#8a929c', wood: '#d9a066', woodDk: '#b07a44', phone: '#1f2230',
  };

  // ---------------------------------------------------------------- timeline (seconds)
  const T = {
    split: b(0.5),
    h1: [b(1), b(1.5), b(3), b(3.5)], h1out: b(5.5),
    lift: b(1.25), toss: b(2), catch: b(3), stars: [b(4), b(4.25), b(4.5), b(4.75), b(5)], starsOut: b(5.5),
    h2: [b(6), b(6.5), b(8.5), b(9)], h2out: b(10.5),
    tools: [b(6.5), b(7), b(7.5)], toolsOut: b(10.25), sticker: b(9),
    h3: [b(11), b(11.25), b(11.5), b(11.75), b(12.25), b(12.5)], h3out: b(18),
    phones: b(11.5), counters: b(11.75), ring: b(12), answer: b(13), hangup: b(18.25),
    cards: [b(13.5), b(14.5), b(15.5), b(16.5)], thumb: b(17.25),
    grey0: b(12.5), grey1: b(17), tapL: b(13), shakeL: b(14), tumble0: b(15.25), bump: b(17.25), shrug: b(17.5),
    crickets: [b(12.75), b(14.5), b(16.25)],
    h4: [b(18.5), b(19), b(19.75)], h4out: b(22.25),
    reveal: b(18.5), circle: b(20.25),
    expand: b(22.5), logo: b(23.5), word: b(24), tag: b(25), cta: b(25.75),
  };
  const BLINKS = [0.95, 2.62, 4.18, 5.9, 7.42, 9.05, 10.3, 12.9, 14.2];

  // ---------------------------------------------------------------- small helpers
  function kf2(t, keys) { // keyframes of [x, y] points
    return [kf(t, keys.map(([tt, v, e]) => [tt, v[0], e])), kf(t, keys.map(([tt, v, e]) => [tt, v[1], e]))];
  }
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
  function ellipse(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU); }
  // a tapered capsule from (x0,y0) to (x1,y1)
  function limb(c, x0, y0, x1, y1, w0, w1, col) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x0 + (nx * w0) / 2, y0 + (ny * w0) / 2);
    c.lineTo(x1 + (nx * w1) / 2, y1 + (ny * w1) / 2);
    c.lineTo(x1 - (nx * w1) / 2, y1 - (ny * w1) / 2);
    c.lineTo(x0 - (nx * w0) / 2, y0 - (ny * w0) / 2);
    c.closePath();
    c.fill();
    circle(c, x0, y0, w0 / 2);
    c.fill();
    circle(c, x1, y1, w1 / 2);
    c.fill();
  }
  function starPath(c, x, y, r, rot = 0) {
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = rot - Math.PI / 2 + (k * Math.PI) / 5, rad = k % 2 ? r * 0.46 : r;
      c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c.closePath();
  }
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
  function icon(c, kind, x, y, s, col) {
    c.save();
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = s * 0.1;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (kind === 'calendar') {
      rr(c, x - s / 2, y - s * 0.4, s, s * 0.85, s * 0.12);
      c.stroke();
      c.fillRect(x - s / 2, y - s * 0.4, s, s * 0.22);
      c.fillRect(x - s * 0.28, y - s * 0.55, s * 0.08, s * 0.24);
      c.fillRect(x + s * 0.2, y - s * 0.55, s * 0.08, s * 0.24);
      tick(c, x, y + s * 0.14, s * 0.5, col);
    } else if (kind === 'star') {
      starPath(c, x, y, s * 0.52);
      c.fill();
    } else {
      circle(c, x, y, s * 0.46);
      c.stroke();
      tick(c, x + s * 0.02, y, s * 0.62, col);
    }
    c.restore();
  }
  const shadowOn = (c, blur = 24, dy = 10, a = 0.18) => { c.shadowColor = `rgba(40,25,10,${a})`; c.shadowBlur = blur; c.shadowOffsetX = 0; c.shadowOffsetY = dy; };
  const shadowOff = (c) => { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0; };
  const setFont = (c, weight, size, fam = HEAD, stretch = 'semi-condensed') => { c.font = `${weight} ${size}px ${fam}`; c.fontStretch = stretch; };
  // a quick squash-and-settle for pops: 0 before t0, overshoots, settles to 1
  const pop = (t, t0, d = 0.22) => (t < t0 ? 0 : E.outBack(prog(t, t0, d)));
  const blinkAt = (t, off = 0) => BLINKS.some((x) => Math.abs(t - x - off) < 0.06) ? 1 : 0;
  // the beat bounce: a small dip right on each beat
  function groove(t, from, to) {
    if (t < from || t >= to) return 0;
    const ph = ((t - from) / B) % 1;
    return 7 * Math.exp(-ph / 0.14) - 1.5;
  }

  // ---------------------------------------------------------------- the twin: a flat rig, feet at (0, 0), facing us
  const RIG = { shX: 120, shY: -772, L1: 152, L2: 140, headY: -890, headR: 86 };
  const HIP_O = [108, -500], HIP_I = [-108, -500];   // hands on hips (outer = screen-right when not mirrored)
  const READY = [160, -760];                          // outer hand holding a tool up by the shoulder
  const CHEST = [62, -640];                           // outer hand holding the phone in front of the chest
  const EAR = [104, -868];                            // phone at the ear
  const SHOW = [30, -830];                            // phone held up to the camera, in front of the face
  const TOOL_S = 1.25;                                // tools are drawn a little larger than life
  // elbow poles: which way each elbow points (local, not mirrored)
  const POLE_O = [1, 0.35], POLE_I = [-1, 0.35], POLE_UP = [0.5, 1], POLE_DOWN_O = [0.25, 1], POLE_DOWN_I = [-0.3, 1];

  // two-bone arm: the elbow bends toward the pole direction
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

  // tools, drawn with the grip at (0, 0) pointing up
  function tool(c, kind) {
    if (kind === 'hammer') {
      c.fillStyle = C(P.wood);
      rr(c, -9, -118, 18, 160, 8);
      c.fill();
      c.fillStyle = C(P.woodDk);
      c.fillRect(-9, -40, 18, 6);
      c.fillStyle = C(P.steel);
      rr(c, -40, -140, 70, 34, 7);
      c.fill();
      c.fillStyle = C(P.steelDk);
      c.fillRect(-40, -114, 70, 8);
      // claw
      c.strokeStyle = C(P.steel);
      c.lineWidth = 12;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(28, -128);
      c.quadraticCurveTo(52, -128, 58, -106);
      c.stroke();
    } else if (kind === 'saw') {
      c.fillStyle = C(P.steel);
      c.beginPath();
      c.moveTo(-18, -40);
      c.lineTo(-8, -250);
      c.lineTo(22, -250);
      c.lineTo(30, -40);
      c.closePath();
      c.fill();
      // teeth on the outer edge
      c.beginPath();
      for (let k = 0; k < 13; k++) {
        const y = -250 + k * 16;
        c.moveTo(22 + (k * 8) / 13, y);
        c.lineTo(32 + (k * 8) / 13, y + 8);
        c.lineTo(22 + ((k + 1) * 8) / 13, y + 16);
      }
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.fillRect(-4, -236, 5, 180);
      // D handle
      c.fillStyle = C(K.orange);
      rr(c, -32, -58, 70, 96, 26);
      c.fill();
      c.fillStyle = C(P.capDk);
      rr(c, -12, -38, 30, 56, 13);
      c.fill();
    } else if (kind === 'level') {
      c.fillStyle = C(K.yellow);
      rr(c, -16, -236, 32, 290, 6);
      c.fill();
      c.fillStyle = C('#2b2b33');
      c.fillRect(-16, -236, 32, 16);
      c.fillRect(-16, 38, 32, 16);
      for (const y of [-160, -70]) {
        c.fillStyle = C('#2b2b33');
        rr(c, -11, y - 20, 22, 40, 8);
        c.fill();
        c.fillStyle = C('#b9f07a');
        rr(c, -7, y - 16, 14, 32, 6);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.85)';
        ellipse(c, 0, y - 4, 4, 6);
        c.fill();
      }
    } else if (kind === 'drill') {
      // held up like a torch: the handle across the fist, the body and bit pointing up
      c.fillStyle = C('#34343c');
      rr(c, -52, -18, 100, 36, 14); // handle
      c.fill();
      c.fillStyle = C('#2b2b33');
      rr(c, -84, -30, 40, 60, 8); // battery
      c.fill();
      c.fillStyle = C(K.orange);
      rr(c, 4, -168, 60, 170, 24); // motor body
      c.fill();
      c.fillStyle = C(P.capDk);
      c.fillRect(20, -140, 8, 64);
      c.fillRect(36, -140, 8, 64);
      c.fillStyle = C('#2b2b33');
      rr(c, 16, -204, 36, 40, 6); // chuck
      c.fill();
      c.fillStyle = C(P.steel);
      c.fillRect(29, -276, 10, 76); // bit
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(12, -160, 8, 140);
    }
  }

  // the phone prop, drawn in device pixels so its screen never mirrors
  const PH = { w: 66, h: 132 };
  function phone(c, x, y, rot, s, screen, t, side) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.scale(s, s);
    shadowOn(c, 10 / s, 5 / s, 0.25);
    c.fillStyle = C(P.phone);
    rr(c, -PH.w / 2, -PH.h / 2, PH.w, PH.h, 11);
    c.fill();
    shadowOff(c);
    c.save();
    rr(c, -PH.w / 2 + 3.5, -PH.h / 2 + 3.5, PH.w - 7, PH.h - 7, 8);
    c.clip();
    c.translate(-PH.w / 2 + 3.5, -PH.h / 2 + 3.5);
    screen(c, PH.w - 7, PH.h - 7, t, side);
    c.restore();
    c.fillStyle = C(P.phone);
    rr(c, -9, -PH.h / 2 + 5, 18, 4.5, 2.2); // notch
    c.fill();
    c.restore();
  }
  function wallpaper(c, w, h) {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, C('#3a6fe0'));
    g.addColorStop(1, C('#8f5fe8'));
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  function screenLock(c, w, h) {
    wallpaper(c, w, h);
    c.fillStyle = 'rgba(255,255,255,0.92)';
    setFont(c, 700, 15, UI, 'normal');
    c.textAlign = 'center';
    c.fillText('07:42', w / 2, 34);
    setFont(c, 500, 4.6, UI, 'normal');
    c.fillText('mandag 6. oktober', w / 2, 42);
  }
  function screenCall(c, w, h, t) {
    wallpaper(c, w, h);
    c.fillStyle = 'rgba(255,255,255,0.95)';
    circle(c, w / 2, 32, 12);
    c.fill();
    c.fillStyle = C('#8f5fe8');
    circle(c, w / 2, 29, 4.2);
    c.fill();
    ellipse(c, w / 2, 39, 7, 4.5);
    c.fill();
    c.fillStyle = '#fff';
    setFont(c, 700, 6, UI, 'normal');
    c.textAlign = 'center';
    c.fillText('Ny kunde', w / 2, 56);
    setFont(c, 500, 3.8, UI, 'normal');
    c.fillText('ringer …', w / 2, 62);
    const pulse = 1 + 0.12 * Math.max(0, Math.sin(t * 14));
    c.fillStyle = C('#e5352b');
    circle(c, w * 0.27, h - 18, 7);
    c.fill();
    c.fillStyle = C('#22c55e');
    circle(c, w * 0.73, h - 18, 7 * pulse);
    c.fill();
  }
  function screenInCall(c, w, h, t) {
    wallpaper(c, w, h);
    c.fillStyle = '#fff';
    setFont(c, 700, 6, UI, 'normal');
    c.textAlign = 'center';
    c.fillText('Ny kunde', w / 2, 30);
    setFont(c, 500, 4.4, UI, 'normal');
    const sec = Math.max(0, Math.floor((t - T.answer) * 2.4));
    c.fillText(`00:${String(sec).padStart(2, '0')}`, w / 2, 37);
    c.fillStyle = C('#e5352b');
    circle(c, w / 2, h - 18, 7);
    c.fill();
  }
  function screenSite(c, w, h) {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, w, h);
    // top bar
    c.fillStyle = C(K.ink);
    c.fillRect(0, 0, w, 15);
    roofMark(c, 7.5, 8.6, 7, C(K.orange));
    c.fillStyle = '#fff';
    setFont(c, 800, 4.8, HEAD);
    c.textAlign = 'left';
    c.fillText(CFG.site.name, 14, 10);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    for (let k = 0; k < 3; k++) c.fillRect(w - 9, 5 + k * 2.2, 5, 1);
    // hero: a new timber house against the sky
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
    c.beginPath();
    c.moveTo(10, 34);
    c.lineTo(29, 21);
    c.lineTo(48, 34);
    c.closePath();
    c.fill();
    c.fillStyle = C('#ffe9a8');
    c.fillRect(18, 38, 7, 7);
    c.fillRect(33, 38, 7, 13);
    c.fillStyle = C('#d9a066');
    c.fillRect(6, 50, 46, 2.2);
    // copy
    c.fillStyle = C(K.ink);
    setFont(c, 800, 6.6, HEAD);
    c.textAlign = 'left';
    c.fillText(CFG.site.headline, 5, 66);
    setFont(c, 500, 3.9, UI, 'normal');
    c.fillStyle = 'rgba(29,26,43,0.7)';
    c.fillText(CFG.site.sub, 5, 72.5);
    c.fillStyle = C('#f7b52c');
    for (let k = 0; k < 5; k++) { starPath(c, 7.5 + k * 6.2, 80, 2.7); c.fill(); }
    c.fillStyle = 'rgba(29,26,43,0.6)';
    setFont(c, 600, 3.4, UI, 'normal');
    c.fillText('4,9 (128)', 38, 81.2);
    // button
    c.fillStyle = C(K.orange);
    rr(c, 5, 88, w - 10, 13, 6.5);
    c.fill();
    c.fillStyle = '#fff';
    setFont(c, 800, 5.2, HEAD);
    c.textAlign = 'center';
    c.fillText(CFG.site.button, w / 2, 96.4);
    // a peek of the next section
    c.fillStyle = C('#f1ece4');
    rr(c, 5, 106, (w - 13) / 2, 16, 3);
    c.fill();
    rr(c, 8 + (w - 13) / 2, 106, (w - 13) / 2, 16, 3);
    c.fill();
  }
  function screenNone(c, w, h) {
    c.fillStyle = C('#f2f2f4');
    c.fillRect(0, 0, w, h);
    // an empty address bar
    c.fillStyle = C('#dcdce2');
    rr(c, 4, 5, w - 8, 9, 4.5);
    c.fill();
    c.fillStyle = C('#a3a3ad');
    circle(c, 9.5, 9.5, 1.8);
    c.fill();
    // a broken page
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
    setFont(c, 800, 6.4, HEAD);
    c.textAlign = 'center';
    c.fillText(CFG.nosite.title, w / 2, 76);
    setFont(c, 500, 3.9, UI, 'normal');
    c.fillStyle = C('#7a7a86');
    c.fillText(CFG.nosite.sub, w / 2, 83);
  }

  // one twin; returns where the outer hand and the phone are in device pixels
  function drawTwin(c, S) {
    const out = {};
    c.save();
    c.translate(S.x, S.y);
    c.scale(S.s * S.mir, S.s);
    const sq = S.sq || 1;
    c.scale(1 / Math.sqrt(sq), sq);
    // floor shadow
    c.fillStyle = C('#000000', 0.12);
    ellipse(c, 0, 0, 160, 22);
    c.fill();
    // legs and boots
    for (const s of [-1, 1]) {
      limb(c, s * 46, -472, s * 54, -60, 88, 76, C(P.pants));
      c.fillStyle = C(P.pantsDk);
      rr(c, s * 54 - 32, -262, 64, 70, 16); // knee pads
      c.fill();
      c.fillStyle = C(P.boot);
      rr(c, s * 54 - 46 + s * 8, -64, 92, 60, 22);
      c.fill();
      c.fillStyle = C(P.sole);
      rr(c, s * 54 - 50 + s * 8, -14, 100, 16, 7);
      c.fill();
    }
    // folding rule in the outer pocket
    c.fillStyle = C(K.yellow);
    rr(c, 80, -448, 18, 74, 3);
    c.fill();
    c.fillStyle = C('#2b2b33');
    for (let k = 0; k < 5; k++) c.fillRect(80, -440 + k * 13, 8, 2.5);

    // upper body: bob, lean and shoulders
    const bob = S.bob || 0;
    c.save();
    c.translate(0, -470 + bob);
    c.rotate(S.lean || 0);
    c.translate(0, 470);
    const shY = RIG.shY - 18 * (S.shrug || 0);
    // torso
    c.fillStyle = C(P.jacket);
    c.beginPath();
    c.moveTo(-104, -468);
    c.lineTo(-118, -700);
    c.quadraticCurveTo(-124, shY - 20, -62, shY - 28);
    c.lineTo(62, shY - 28);
    c.quadraticCurveTo(124, shY - 20, 118, -700);
    c.lineTo(104, -468);
    c.closePath();
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = C(P.jacketDk);
    c.fillRect(46, -900, 90, 460);
    c.fillStyle = C(P.stripe);
    c.fillRect(-140, -676, 280, 22);
    c.fillStyle = C(P.jacketDk);
    c.fillRect(-3, -800, 6, 340);
    // chest pocket
    c.fillStyle = C(P.jacketDk);
    rr(c, -92, -640, 58, 62, 8);
    c.fill();
    c.fillStyle = C(P.cuff);
    rr(c, -96, -644, 66, 18, 6);
    c.fill();
    c.restore();
    // collar with the tee showing
    c.fillStyle = C(P.tee);
    c.beginPath();
    c.moveTo(-34, shY - 26);
    c.lineTo(34, shY - 26);
    c.lineTo(0, shY + 22);
    c.closePath();
    c.fill();
    c.fillStyle = C(P.cuff);
    c.beginPath();
    c.moveTo(-60, shY - 30);
    c.lineTo(-30, shY - 30);
    c.lineTo(0, shY + 24);
    c.lineTo(-10, shY + 30);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(60, shY - 30);
    c.lineTo(30, shY - 30);
    c.lineTo(0, shY + 24);
    c.lineTo(10, shY + 30);
    c.closePath();
    c.fill();
    // tool belt
    c.fillStyle = C(P.belt);
    rr(c, -108, -512, 216, 34, 8);
    c.fill();
    c.fillStyle = C(P.buckle);
    rr(c, -18, -514, 36, 38, 7);
    c.fill();
    c.fillStyle = C(P.belt);
    rr(c, -9, -505, 18, 20, 4);
    c.fill();
    c.fillStyle = C(P.beltDk);
    rr(c, -134, -500, 58, 104, 14); // pouch
    c.fill();
    c.fillStyle = C(P.belt);
    rr(c, -136, -504, 62, 30, 10);
    c.fill();
    c.fillStyle = C('#e5352b'); // pencil in the pouch
    c.fillRect(-122, -540, 9, 40);
    // neck and head (tilted)
    c.fillStyle = C(P.skinDk);
    rr(c, -30, shY - 70, 60, 60, 20);
    c.fill();
    c.save();
    c.translate(0, shY - 30);
    c.rotate(S.tilt || 0);
    c.translate(0, -(shY - 30));
    const hy = RIG.headY + (shY - RIG.shY);
    head(c, hy, S);
    c.restore();

    // arms: inner first, then outer
    const shO = [RIG.shX - 6, shY + 6], shI = [-RIG.shX + 6, shY + 6];
    const aI = ik(shI[0], shI[1], S.hI[0], S.hI[1], RIG.L1, RIG.L2, S.poleI || POLE_I);
    const aO = ik(shO[0], shO[1], S.hO[0], S.hO[1], RIG.L1, RIG.L2, S.poleO || POLE_O);
    arm(c, shI, aI, S.gripI || 'fist', S);
    // tool in the outer hand (mirrors with the twin; tools carry no text)
    const toolAt = S.tool;
    if (toolAt && toolAt.kind && toolAt.scale > 0) {
      c.save();
      if (toolAt.free) c.translate(toolAt.x, toolAt.y);
      else c.translate(aO.hx, aO.hy);
      c.rotate(toolAt.rot || 0);
      c.scale(toolAt.scale * TOOL_S, toolAt.scale * TOOL_S);
      tool(c, toolAt.kind);
      c.restore();
    }
    arm(c, shO, aO, S.gripO || 'fist', S, true);
    // where the outer hand and the chest sticker sit, in device pixels
    const m = c.getTransform();
    const dev = (x, y) => { const p = m.transformPoint(new DOMPoint(x, y)); return [p.x, p.y]; };
    const hand = dev(aO.hx, aO.hy);
    const up = dev(aO.hx + Math.sin(S.phoneRot || 0), aO.hy - Math.cos(S.phoneRot || 0));
    out.hand = hand;
    out.handScale = Math.hypot(up[0] - hand[0], up[1] - hand[1]);
    out.phoneAng = Math.atan2(up[0] - hand[0], -(up[1] - hand[1]));
    out.sticker = dev(-46, -612);
    out.head = dev(0, hy);
    c.restore();
    c.restore();
    return out;
  }

  function head(c, hy, S) {
    const r = RIG.headR;
    // ears
    for (const s of [-1, 1]) {
      c.fillStyle = C(P.skin);
      circle(c, s * (r - 2), hy + 4, 18);
      c.fill();
      c.fillStyle = C(P.skinDk);
      circle(c, s * (r - 2), hy + 4, 8);
      c.fill();
    }
    // face
    c.fillStyle = C(P.skin);
    circle(c, 0, hy, r);
    c.fill();
    // sideburns and beard
    c.fillStyle = C(P.beard);
    c.beginPath();
    c.moveTo(-r + 4, hy - 30);
    c.lineTo(-r + 20, hy - 30);
    c.lineTo(-r + 26, hy + 12);
    c.quadraticCurveTo(-40, hy + 8, 0, hy + 14);
    c.quadraticCurveTo(40, hy + 8, r - 26, hy + 12);
    c.lineTo(r - 20, hy - 30);
    c.lineTo(r - 4, hy - 30);
    c.quadraticCurveTo(r + 4, hy + 40, r * 0.55, hy + 72);
    c.quadraticCurveTo(0, hy + 108, -r * 0.55, hy + 72);
    c.quadraticCurveTo(-r - 4, hy + 40, -r + 4, hy - 30);
    c.closePath();
    c.fill();
    // mouth (inside the beard)
    const smile = S.smile ?? 0.6, talk = S.talk || 0;
    const my = hy + 44;
    if (talk > 0.05) {
      c.fillStyle = C(P.mouth);
      ellipse(c, 0, my + 2, 17, 4 + 12 * talk);
      c.fill();
      c.fillStyle = C(P.tongue);
      ellipse(c, 0, my + 3 + 8 * talk, 9, 3 + 4 * talk);
      c.fill();
    } else {
      c.strokeStyle = C(P.mouth);
      c.lineWidth = 7;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-22, my - 4 * smile);
      c.quadraticCurveTo(0, my + 20 * smile, 22, my - 4 * smile);
      c.stroke();
    }
    // mustache
    c.fillStyle = C(P.hair);
    for (const s of [-1, 1]) {
      ellipse(c, s * 17, hy + 28, 21, 11, s * 0.25);
      c.fill();
    }
    // nose and cheeks
    c.fillStyle = C(P.blush, 0.55);
    for (const s of [-1, 1]) { circle(c, s * 50, hy + 10, 14); c.fill(); }
    c.fillStyle = C(P.skinDk);
    ellipse(c, 0, hy + 12, 14, 12);
    c.fill();
    // eyes
    const bl = S.blink || 0;
    const lx = (S.lookX || 0) * 5, ly = (S.lookY || 0) * 5;
    for (const s of [-1, 1]) {
      c.fillStyle = C(P.eye);
      ellipse(c, s * 31 + lx, hy - 18 + ly, 8.5, Math.max(1.2, 11.5 * (1 - bl)));
      c.fill();
      if (bl < 0.5) {
        c.fillStyle = 'rgba(255,255,255,0.9)';
        circle(c, s * 31 + lx + 2.5, hy - 22 + ly, 2.6);
        c.fill();
      }
    }
    // brows: -1 worried (inner ends up), +1 raised
    const br = S.brow || 0;
    c.strokeStyle = C(P.hair);
    c.lineWidth = 8;
    c.lineCap = 'round';
    for (const s of [-1, 1]) {
      const yIn = hy - 44 - 8 * Math.max(0, -br) - 6 * Math.max(0, br), yOut = hy - 42 + 5 * Math.max(0, -br) - 6 * Math.max(0, br);
      c.beginPath();
      c.moveTo(s * 18, yIn);
      c.lineTo(s * 46, yOut);
      c.stroke();
    }
    // cap
    c.fillStyle = C(P.cap);
    c.beginPath();
    c.moveTo(-r - 4, hy - 38);
    c.bezierCurveTo(-r - 2, hy - 132, r + 2, hy - 132, r + 4, hy - 38);
    c.closePath();
    c.fill();
    c.fillStyle = C(P.capDk);
    c.fillRect(-r, hy - 52, 2 * r, 10);
    ellipse(c, 0, hy - 38, r + 22, 17);
    c.fill();
    c.fillStyle = C(P.cap);
    circle(c, 0, hy - 116, 8);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)';
    roofMark(c, 0, hy - 78, 34, 'rgba(255,255,255,0.9)');
    // carpenter's pencil behind the outer ear
    c.save();
    c.translate(r + 8, hy - 24);
    c.rotate(-0.55);
    c.fillStyle = C('#e5352b');
    rr(c, -8, -34, 16, 58, 3);
    c.fill();
    c.fillStyle = C('#f0c99a');
    c.beginPath();
    c.moveTo(-8, 24);
    c.lineTo(8, 24);
    c.lineTo(0, 38);
    c.closePath();
    c.fill();
    c.restore();
  }

  function arm(c, sh, a, grip, S, outer) {
    limb(c, sh[0], sh[1], a.ex, a.ey, 60, 52, C(P.jacket));
    limb(c, a.ex, a.ey, a.hx, a.hy, 52, 44, C(P.jacket));
    // cuff
    const dx = a.hx - a.ex, dy = a.hy - a.ey, L = Math.hypot(dx, dy) || 1;
    const cx = a.hx - (dx / L) * 24, cy = a.hy - (dy / L) * 24;
    limb(c, cx, cy, a.hx - (dx / L) * 12, a.hy - (dy / L) * 12, 46, 46, C(P.cuff));
    if (outer && S.phoneHeld) return; // the outer hand is drawn after the phone
    hand(c, a.hx, a.hy, grip, Math.atan2(dy, dx));
  }
  function hand(c, x, y, grip, ang) {
    c.fillStyle = C(P.skin);
    if (grip === 'thumb') {
      circle(c, x, y, 27);
      c.fill();
      limb(c, x + 4, y - 16, x + 6, y - 50, 18, 16, C(P.skin)); // thumb up
      c.fillStyle = C(P.skinDk);
      for (let k = 0; k < 3; k++) c.fillRect(x - 20, y - 8 + k * 10, 26, 2.5);
    } else if (grip === 'poke') {
      circle(c, x, y, 25);
      c.fill();
      limb(c, x, y, x + Math.cos(ang) * 46, y + Math.sin(ang) * 46, 16, 14, C(P.skin));
    } else if (grip === 'open') {
      ellipse(c, x, y, 30, 22, ang);
      c.fill();
      c.fillStyle = C(P.skinDk);
      ellipse(c, x, y + 4, 16, 8, ang);
      c.fill();
    } else {
      circle(c, x, y, 27);
      c.fill();
    }
  }

  // ---------------------------------------------------------------- choreography
  function toolAt(t) {
    // the hammer: held, tossed with two spins, caught; then saw, level, drill swap in; then gone
    const release = [176, -862];
    if (t < T.toss) {
      const flip = E.inOutCubic(prog(t, T.lift, 0.3));
      return { kind: 'hammer', rot: lerp(Math.PI, 0, flip), scale: 1 };
    }
    if (t < T.catch) {
      const u = prog(t, T.toss, T.catch - T.toss);
      return { kind: 'hammer', free: true, x: lerp(release[0], READY[0], u), y: lerp(release[1], READY[1], u) - 430 * 4 * u * (1 - u), rot: -TAU * 2 * E.inOutSine(u), scale: 1 };
    }
    if (t < T.tools[0]) return { kind: 'hammer', rot: 0, scale: 1 };
    const kinds = ['saw', 'level', 'drill'];
    let k = 0;
    while (k < 2 && t >= T.tools[k + 1]) k++;
    const sc = t >= T.toolsOut ? 1 - E.inCubic(prog(t, T.toolsOut, 0.14)) : pop(t, T.tools[k], 0.24);
    return { kind: kinds[k], rot: 0.06 * Math.sin((t - T.tools[k]) * 9) * Math.exp(-(t - T.tools[k]) * 4), scale: sc };
  }
  // shared by both twins until they take out their phones
  function basePose(t) {
    let hO = kf2(t, [[0, HIP_O], [T.lift, HIP_O], [T.lift + 0.3, READY, E.outBack], [T.toss - 0.14, [READY[0], READY[1] + 40], E.inOutSine],
      [T.toss, [176, -862], E.outCubic], [T.toss + 0.2, READY, E.inOutSine], [T.catch, READY], [T.catch + 0.06, [READY[0], READY[1] + 38], E.outQuad],
      [T.catch + 0.3, READY, E.outBack], [T.toolsOut, READY], [T.toolsOut + 0.3, HIP_O, E.inOutCubic], [T.phones, HIP_O],
      [T.phones + 0.3, CHEST, E.outBack]]);
    const up = t > T.toss - 0.1 && t < T.catch + 0.05;
    const inflight = up ? Math.sin(Math.PI * prog(t, T.toss - 0.1, T.catch - T.toss + 0.15)) : 0;
    const splitSq = t >= T.split ? 1 + 0.1 * Math.exp(-(t - T.split) / 0.12) * Math.cos((t - T.split) * 28) : 1;
    const catchBob = t >= T.catch ? 14 * Math.exp(-(t - T.catch) / 0.1) : 0;
    const stickerBob = t >= T.sticker ? 10 * Math.exp(-(t - T.sticker) / 0.08) : 0;
    const smile = t < T.stars[0] ? 0.6 : lerp(0.6, 1, prog(t, T.stars[0], 0.3));
    // elbows point down while a tool is held up by the shoulder
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
    // inner hand: talks with it, then a thumbs up
    p.hI = kf2(t, [[T.answer + 0.3, HIP_I], [T.answer + 0.6, [-176, -650], E.outBack], [b(15.5), [-176, -650]], [b(16), HIP_I, E.inOutCubic],
      [T.thumb - 0.2, HIP_I], [T.thumb, [-178, -724], E.outBack], [T.reveal, [-178, -724]], [T.reveal + 0.3, HIP_I, E.inOutCubic],
      [T.word - 0.1, HIP_I], [T.word + 0.2, [-186, -736], E.outBack]]);
    p.gripI = (t > T.answer + 0.4 && t < b(15.85)) ? 'open' : (t > T.thumb - 0.05 && t < T.reveal + 0.15) || t > T.word ? 'thumb' : 'fist';
    const thumbW = kf(t, [[T.thumb - 0.25, 0], [T.thumb - 0.1, 1], [T.reveal + 0.1, 1], [T.reveal + 0.3, 0], [T.word - 0.15, 0], [T.word, 1]]);
    p.poleI = [lerp(POLE_I[0], POLE_DOWN_I[0], thumbW), lerp(POLE_I[1], POLE_DOWN_I[1], thumbW)];
    const talking = t > T.answer + 0.25 && t < T.hangup - 0.1;
    p.talk = talking ? Math.max(0, Math.sin(t * 23) * 0.8 + Math.sin(t * 9.7) * 0.4) * (Math.sin(t * 3.1) > -0.6 ? 1 : 0) : 0;
    p.smile = kf(t, [[T.phones, 1], [T.ring, 1.1]]);
    p.brow = t > T.ring && t < T.answer + 0.2 ? 0.8 : 0.2;
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
      [T.shakeL + 0.7, [CHEST[0] + 30, CHEST[1] - 60]], [T.shakeL + 1.0, CHEST, E.inOutCubic], [T.shrug, CHEST], [T.shrug + 0.25, [212, -650], E.outBack],
      [T.reveal, [212, -650]], [T.reveal + 0.35, SHOW, E.outBack]]);
    p.hO = [p.hO[0], p.hO[1] + shake];
    p.phoneRot = t >= T.shakeL && t < T.shakeL + 0.7 ? 0.12 * Math.sin((t - T.shakeL) * TAU * 7) : 0;
    p.phoneScale = kf(t, [[T.reveal, 1], [T.reveal + 0.38, 1.9, E.outBack]]);
    const dw = kf(t, [[T.shrug - 0.05, 0], [T.shrug + 0.1, 0.9], [T.reveal, 0.9], [T.reveal + 0.2, 1]]);
    p.poleO = [lerp(POLE_O[0], POLE_DOWN_O[0], dw), lerp(POLE_O[1], POLE_DOWN_O[1], dw)];
    // inner hand: two pokes at the screen, then the shrug
    const pokeT = t - T.tapL;
    const poke = pokeT > 0.25 && pokeT < 0.75 ? 12 * Math.abs(Math.sin(pokeT * TAU * 2)) : 0;
    p.hI = kf2(t, [[T.tapL - 0.05, HIP_I], [T.tapL + 0.25, [-4, -636], E.outBack], [T.tapL + 0.8, [-4, -636]], [T.tapL + 1.1, HIP_I, E.inOutCubic],
      [T.shrug, HIP_I], [T.shrug + 0.25, [-212, -650], E.outBack], [T.reveal, [-212, -650]], [T.reveal + 0.3, HIP_I, E.inOutCubic]]);
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
    return p;
  }

  // ---------------------------------------------------------------- the halves
  const FEET = 1925, SC = 1.06;
  const GRIP = PH.h / 2 - 20; // the hand holds the phone this far below its centre (phone units)
  function divider(t) { // x of the split line
    if (t < T.expand) return W / 2;
    return lerp(W / 2, -14, E.inOutCubic(prog(t, T.expand, 0.55)));
  }
  function cams(t) {
    const split = t < T.split ? 0 : E.outBack(prog(t, T.split, 0.42));
    const D = divider(t);
    const ue = E.inOutCubic(prog(t, T.expand, 0.55));
    const hcL = t < T.expand ? W / 2 - 270 * split : D - 270;
    const hcR = t < T.expand ? W / 2 + 270 * split : lerp(810, W / 2, ue);
    // push-in on the phones for the reveal, pull back for the end card
    const pz = E.inOutCubic(prog(t, T.reveal + 0.05, 0.5));
    const phoneY = FEET + (SHOW[1] - GRIP * 1.9) * SC; // centre of the raised phone
    const zIn = lerp(1, 2.1, pz);
    const base = { z: zIn, cx: lerp(0, SHOW[0] * SC, pz), cy: lerp(960, phoneY - 40 / 2.1, pz) };
    const R = { ...base, cx: base.cx };
    const L = { ...base, cx: -base.cx };
    if (t >= T.expand) {
      const u = E.inOutCubic(prog(t, T.expand, 0.75));
      R.z = lerp(2.1, 1, u);
      R.cx = lerp(SHOW[0] * SC, 0, u);
      R.cy = lerp(phoneY - 40 / 2.1, 640, u);
    }
    return { L: { ...L, hc: hcL, x0: 0, x1: t < T.split ? 0 : D }, R: { ...R, hc: hcR, x0: t < T.split ? 0 : D, x1: W } };
  }

  function background(c) {
    c.fillStyle = C(K.cream);
    c.fillRect(-3000, -3000, 6000, 8000);
    // faint pegboard dots
    c.fillStyle = C('#f1d9b8', 0.9);
    c.beginPath();
    for (let y = 24; y < 1690; y += 52) for (let x = -1040; x <= 1040; x += 52) { c.moveTo(x + 5, y); c.arc(x, y, 5, 0, TAU); }
    c.fill();
    c.fillStyle = C(K.peach);
    circle(c, 0, 1000, 330);
    c.fill();
    c.fillStyle = C(K.floor);
    c.fillRect(-3000, 1700, 6000, 3000);
    c.fillStyle = C('#e8b77c');
    c.fillRect(-3000, 1700, 6000, 8);
  }

  function tumbleweed(c, t) {
    if (t < T.tumble0 || t > T.reveal) return;
    const R = 78;
    const xEnd = 270 - R - 6;
    let x, y, rot;
    if (t < T.bump) {
      const u = prog(t, T.tumble0, T.bump - T.tumble0);
      x = lerp(-420, xEnd, u);
      y = FEET - R - 300 * Math.abs(Math.sin(u * Math.PI * 3)) * (1 - 0.45 * u);
      rot = x / R;
    } else {
      const tau = t - T.bump;
      x = xEnd - 40 * (1 - Math.exp(-tau / 0.09)) * Math.exp(-tau / 0.6) - 10 * (1 - Math.exp(-tau / 0.2));
      y = FEET - R - 22 * Math.max(0, Math.sin(Math.min(tau, 0.3) / 0.3 * Math.PI)) * (tau < 0.3 ? 1 : 0);
      rot = xEnd / R - 0.6 * (1 - Math.exp(-tau / 0.3));
    }
    c.save();
    c.translate(x, y);
    c.fillStyle = C('#000000', 0.1);
    ellipse(c, 0, FEET - y, R * 0.9, 10);
    c.fill();
    c.rotate(rot);
    const r = rng(77);
    c.lineCap = 'round';
    for (let k = 0; k < 26; k++) {
      c.strokeStyle = C(k % 3 ? '#9a7a4e' : '#7a5c36');
      c.lineWidth = 3 + r() * 3;
      c.beginPath();
      const a0 = r() * TAU, rad = R * (0.35 + r() * 0.65);
      c.ellipse((r() - 0.5) * 20, (r() - 0.5) * 20, rad, rad * (0.4 + r() * 0.6), r() * TAU, a0, a0 + 2 + r() * 3);
      c.stroke();
    }
    c.restore();
  }

  // draws one half: world through its camera, then that half's screen-space bits
  function half(c, t, side, cam, pose) {
    const mir = side === 'L' ? -1 : 1;
    c.save();
    c.beginPath();
    c.rect(cam.x0, 0, Math.max(0, cam.x1 - cam.x0), H);
    c.clip();
    c.save();
    c.translate(cam.hc, 960);
    c.scale(cam.z, cam.z);
    c.translate(-cam.cx, -cam.cy);
    background(c);
    if (side === 'L') tumbleweed(c, t);
    const out = drawTwin(c, { x: 0, y: FEET, s: SC, mir, ...pose });
    c.restore();
    // the phone in device pixels: the palm behind it, thumb and fingertips over its edges
    if (pose.phoneHeld) {
      c.save();
      c.translate(out.hand[0], out.hand[1]);
      c.scale(out.handScale, out.handScale);
      hand(c, 0, 0, 'fist', 0);
      c.restore();
    }
    if (pose.phone > 0) {
      const scr = side === 'R'
        ? (t >= T.reveal ? screenSite : t >= T.ring && t < T.answer + 0.1 ? screenCall : t >= T.answer && t < T.hangup ? screenInCall : screenLock)
        : t >= T.reveal ? screenNone : screenLock;
      const s = out.handScale * pose.phone * pose.phoneScale;
      const a = out.phoneAng, ux = Math.sin(a), uy = -Math.cos(a), rx = Math.cos(a), ry = Math.sin(a);
      const off = GRIP * s;
      const px = out.hand[0] + ux * off, py = out.hand[1] + uy * off;
      phone(c, px, py, a, s, scr, t, side);
      out.phonePos = [px, py, s];
      if (side === 'R' && t >= T.ring && t < T.answer + 0.3) ringWaves(c, px, py, s, t - T.ring);
      if (pose.phoneHeld) {
        const inner = side === 'R' ? -1 : 1, hs = out.handScale;
        const edge = (PH.w / 2) * s;
        c.fillStyle = C(P.skin);
        // thumb on the inner edge, fingertips on the outer edge
        c.save();
        c.translate(out.hand[0] + rx * inner * edge - ux * 4 * hs, out.hand[1] + ry * inner * edge - uy * 4 * hs);
        c.rotate(a + inner * 0.35);
        ellipse(c, 0, -6 * hs, 10 * hs, 20 * hs);
        c.fill();
        c.restore();
        for (let k = 0; k < 3; k++) {
          const d = (-14 + k * 15) * hs;
          circle(c, out.hand[0] - rx * inner * edge + ux * -d, out.hand[1] - ry * inner * edge + uy * -d, 9 * hs);
          c.fill();
        }
      }
    }
    if (pose.sticker) sticker(c, t, out);
    c.restore();
    return out;
  }

  function ringWaves(c, x, y, s, tau) {
    for (let k = 0; k < 3; k++) {
      const u = ((tau * 1.6 + k / 3) % 1);
      c.save();
      c.strokeStyle = C(K.orange, (1 - u) * 0.9);
      c.lineWidth = 6 * (1 - u) + 2;
      for (const d of [-1, 1]) {
        c.beginPath();
        c.arc(x, y, (PH.h * 0.45 + 60 * u) * s, d > 0 ? -0.5 : Math.PI - 0.5, d > 0 ? 0.5 : Math.PI + 0.5);
        c.stroke();
      }
      c.restore();
    }
  }

  function sticker(c, t, out) {
    const u = prog(t, T.sticker, 0.16);
    const off = E.inCubic(prog(t, T.reveal, 0.25));
    const s = out.handScale * lerp(1.7, 1, E.outCubic(u)) * (1 - off);
    if (s <= 0.01) return;
    const [x, y] = out.sticker;
    c.save();
    c.translate(x, y);
    c.rotate(lerp(-0.6, -0.14, E.outBack(u)));
    c.scale(s, s);
    shadowOn(c, 8, 4, 0.2);
    c.fillStyle = C(K.yellow);
    c.beginPath();
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * TAU, rad = k % 2 ? 58 : 64;
      c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    c.closePath();
    c.fill();
    shadowOff(c);
    c.fillStyle = C(K.ink);
    c.textAlign = 'center';
    setFont(c, 800, 30, HEAD);
    c.fillText(CFG.price[0], 0, 4);
    setFont(c, 600, 17, UI, 'normal');
    c.fillText(CFG.price[1], 0, 28);
    c.restore();
  }

  // ---------------------------------------------------------------- screen-space pieces of each half
  function stars(c, t, hc) {
    const out = 1 - E.inCubic(prog(t, T.starsOut, 0.25));
    if (t < T.stars[0] || out <= 0) return;
    T.stars.forEach((t0, k) => {
      const s = pop(t, t0, 0.25) * out;
      if (s <= 0) return;
      const x = hc + (k - 2) * 80, y = 650;
      c.save();
      c.translate(x, y);
      c.rotate((1 - clamp(prog(t, t0, 0.25))) * 1.2);
      shadowOn(c, 10, 5, 0.2);
      starPath(c, 0, 0, 34 * s);
      c.fillStyle = C('#f7b52c');
      c.fill();
      shadowOff(c);
      starPath(c, -4, -5, 13 * s);
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fill();
      c.restore();
    });
  }
  function counter(c, t, hc, side) {
    if (t < T.counters) return;
    const inn = pop(t, T.counters, 0.3);
    const out = E.inCubic(prog(t, T.h3out, 0.25));
    if (out >= 1) return;
    let n = 0, last = -1;
    if (side === 'R') T.cards.forEach((t0) => { if (t >= t0 + 0.28) { n++; last = t0 + 0.28; } });
    const bump = last > 0 ? 1 + 0.35 * Math.exp(-(t - last) / 0.09) : 1;
    const w = 330, h = 68, y = 596;
    c.save();
    c.globalAlpha = 1 - out;
    c.translate(hc, y);
    c.scale(inn, inn);
    shadowOn(c, 14, 6, 0.16);
    c.fillStyle = C('#ffffff');
    rr(c, -w / 2, -h / 2, w, h, h / 2);
    c.fill();
    shadowOff(c);
    setFont(c, 600, 28, UI, 'normal');
    c.fillStyle = C(K.ink, 0.72);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(CFG.counter, -w / 2 + 28, 2);
    c.save();
    c.translate(w / 2 - 48, 0);
    c.scale(bump, bump);
    c.fillStyle = C(side === 'R' ? K.orange : '#c9c2b8');
    circle(c, 0, 0, 25);
    c.fill();
    setFont(c, 800, 32, HEAD);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.fillText(String(n), 0, 2);
    c.restore();
    c.restore();
  }
  function cards(c, t, hc, phonePos) {
    if (t < T.cards[0]) return;
    const out = E.inCubic(prog(t, T.h3out - 0.1, 0.3));
    if (out >= 1) return;
    const shown = T.cards.map((t0, i) => ({ t0, i })).filter((o) => t >= o.t0);
    const w = 470, h = 108, y0 = 704;
    shown.forEach(({ t0, i }) => {
      const newer = shown.filter((o) => o.t0 > t0).length;
      if (newer > 2) return;
      const fly = E.outCubic(prog(t, t0, 0.3));
      const shift = shown.filter((o) => o.t0 > t0).reduce((a, o) => a + E.outCubic(prog(t, o.t0, 0.3)), 0);
      const fx = phonePos ? phonePos[0] : hc, fy = phonePos ? phonePos[1] : 900;
      const x = lerp(fx, hc, fly), y = lerp(fy, y0, fly) + 18 * shift - out * 60;
      const s = lerp(0.25, 1, fly) * (1 - 0.055 * shift);
      c.save();
      c.globalAlpha = clamp(fly * 3) * (1 - 0.22 * shift) * (1 - out);
      c.translate(x, y);
      c.scale(s, s);
      shadowOn(c, 18, 8, 0.18);
      c.fillStyle = '#fff';
      rr(c, -w / 2, -h / 2, w, h, 26);
      c.fill();
      shadowOff(c);
      const job = CFG.jobs[i];
      c.fillStyle = job.icon === 'check' ? K.green : job.icon === 'star' ? '#f7b52c' : K.orange;
      rr(c, -w / 2 + 20, -32, 64, 64, 16);
      c.fill();
      icon(c, job.icon, -w / 2 + 52, 2, 36, '#fff');
      c.fillStyle = K.ink;
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      setFont(c, 700, 32, UI, 'normal');
      c.fillText(job.title, -w / 2 + 104, -4);
      setFont(c, 500, 27, UI, 'normal');
      c.fillStyle = job.icon === 'star' ? '#e89a0c' : 'rgba(29,26,43,0.65)';
      c.fillText(job.detail, -w / 2 + 104, 32);
      c.restore();
    });
  }

  // ---------------------------------------------------------------- headlines (screen space, over both halves)
  // words pop in on their beats; *word* is orange
  function headline(c, lines, times, t, tOut, y0 = 400, size = 106) {
    if (t < times[0] || t > tOut + 0.3) return;
    const out = E.inCubic(prog(t, tOut, 0.22));
    setFont(c, 800, size, HEAD);
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    let wi = 0;
    lines.forEach((ln, li) => {
      const words = ln.split(' ');
      const plain = words.map((w) => w.replace(/\*/g, ''));
      const sp = c.measureText(' ').width;
      const widths = plain.map((w) => c.measureText(w).width);
      let x = W / 2 - (widths.reduce((a, v) => a + v, 0) + sp * (words.length - 1)) / 2;
      const y = y0 + li * size * 1.04;
      words.forEach((w, k) => {
        const t0 = times[wi++];
        const u = pop(t, t0, 0.24);
        if (u > 0) {
          c.save();
          c.globalAlpha = clamp(prog(t, t0, 0.06)) * (1 - out);
          c.translate(x + widths[k] / 2, y - size * 0.35 - out * 30);
          c.scale(lerp(0.3, 1, u) * (1 - 0.15 * out), lerp(0.3, 1, u) * (1 - 0.15 * out));
          c.fillStyle = w.startsWith('*') ? K.orange : K.ink;
          c.fillText(plain[k], -widths[k] / 2, size * 0.35);
          c.restore();
        }
        x += widths[k] + sp;
      });
    });
  }
  function scrim(c, t) {
    const a = E.inOutCubic(prog(t, T.reveal, 0.3)) * (1 - E.inOutCubic(prog(t, T.expand, 0.3)));
    if (a <= 0) return;
    const g = c.createLinearGradient(0, 250, 0, 640);
    g.addColorStop(0, `rgba(255,241,220,${0.94 * a})`);
    g.addColorStop(0.6, `rgba(255,241,220,${0.8 * a})`);
    g.addColorStop(1, 'rgba(255,241,220,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, 640);
  }

  // the red spot-the-difference ring around the right phone
  function redCircle(c, t, pos) {
    if (t < T.circle || !pos || t > T.expand + 0.2) return;
    const u = E.outCubic(prog(t, T.circle, 0.45));
    const fade = 1 - prog(t, T.expand, 0.2);
    const [x, y, s] = pos;
    const rx = PH.w * s * 0.8, ry = PH.h * s * 0.57;
    c.save();
    c.globalAlpha = fade;
    c.strokeStyle = K.red;
    c.lineWidth = 13;
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

  function dividerLine(c, t, D) {
    if (t < T.split || D < -10) return;
    const g = E.outCubic(prog(t, T.split, 0.3));
    const half = (H / 2) * g;
    c.save();
    c.fillStyle = 'rgba(40,25,10,0.18)';
    c.fillRect(D - 9, H / 2 - half, 18, half * 2);
    c.fillStyle = '#fff';
    c.fillRect(D - 4, H / 2 - half, 8, half * 2);
    c.restore();
  }

  // ---------------------------------------------------------------- end card (over the right half)
  function endCard(c, t) {
    if (t < T.logo) return;
    const cx = W / 2;
    const lg = spring(t - T.logo, 2.6, 0.45);
    roofMark(c, cx, 470 - (1 - lg) * 60, 150 * clamp(lg * 1.2), K.orange);
    // wordmark: two halves slide together, like the split in reverse
    if (t >= T.word) {
      const u = E.outCubic(prog(t, T.word, 0.4));
      setFont(c, 800, 158, HEAD, 'normal');
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      const y = 690;
      for (const s of [-1, 1]) {
        c.save();
        c.beginPath();
        c.rect(s < 0 ? 0 : cx, 0, cx, H);
        c.clip();
        c.globalAlpha = clamp(u * 2);
        c.fillStyle = K.ink;
        c.fillText(CFG.brand.name, cx + s * 260 * (1 - u), y);
        c.restore();
      }
    }
    const tg = E.outCubic(prog(t, T.tag, 0.45));
    if (tg > 0) {
      c.globalAlpha = tg;
      setFont(c, 600, 56, HEAD);
      c.textAlign = 'center';
      c.fillStyle = 'rgba(29,26,43,0.78)';
      CFG.brand.tagline.forEach((ln, i) => c.fillText(ln, cx, 786 + i * 66 + (1 - tg) * 16));
      c.globalAlpha = 1;
    }
    if (t >= T.cta) {
      const u = E.outBack(prog(t, T.cta, 0.35));
      const beat = ((t - T.cta) / B) % 1;
      const pulse = t > T.cta + 0.5 ? 1 + 0.03 * Math.exp(-beat * 6) : 1;
      const pw = 620 * u * pulse, ph = 124 * clamp(u) * pulse, cy = 1000;
      c.save();
      shadowOn(c, 30, 12, 0.3);
      rr(c, cx - pw / 2, cy - ph / 2, pw, ph, ph / 2);
      c.fillStyle = K.orange;
      c.fill();
      shadowOff(c);
      c.globalAlpha = clamp((u - 0.5) * 2);
      setFont(c, 800, 48, HEAD);
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(CFG.brand.cta, cx, cy + 3);
      c.restore();
    }
  }

  // ---------------------------------------------------------------- one frame
  function frame(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const cm = cams(t);
    const D = divider(t);
    // right half (full width before the split)
    SAT = 1; DIM = 1;
    const outR = half(ctx, t, 'R', cm.R, poseRight(t));
    // left half, drained of colour as nothing happens
    let outL = null;
    if (t >= T.split && D > 0) {
      const g = E.inOutSine(prog(t, T.grey0, T.grey1 - T.grey0));
      SAT = 1 - 0.9 * g;
      DIM = 1 - 0.1 * g;
      outL = half(ctx, t, 'L', cm.L, poseLeft(t));
      // screen-space bits of the left half
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, Math.max(0, D), H);
      ctx.clip();
      stars(ctx, t, cm.L.hc);
      counter(ctx, t, cm.L.hc, 'L');
      ctx.restore();
      SAT = 1; DIM = 1;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(t < T.split ? 0 : D, 0, W, H);
    ctx.clip();
    stars(ctx, t, cm.R.hc);
    counter(ctx, t, cm.R.hc, 'R');
    cards(ctx, t, cm.R.hc, outR.phonePos);
    ctx.restore();
    dividerLine(ctx, t, D);
    redCircle(ctx, t, outR.phonePos);
    scrim(ctx, t);
    headline(ctx, CFG.twins, T.h1, t, T.h1out);
    headline(ctx, CFG.same, T.h2, t, T.h2out);
    headline(ctx, CFG.only, T.h3, t, T.h3out);
    headline(ctx, CFG.diff, T.h4, t, T.h4out);
    endCard(ctx, t);
    return { outR, outL };
  }

  // ---------------------------------------------------------------- sound cues for tools/make_audio.py
  // side: 'L' plays in the left channel, 'R' in the right, 'C' in both
  function cues() {
    const out = [];
    const add = (t, type, side = 'C', extra = {}) => out.push(Object.assign({ t: +t.toFixed(4), type, side }, extra));
    add(T.split, 'split');
    [...T.h1, ...T.h2, ...T.h3, ...T.h4].forEach((t0, i) => add(t0, 'word', 'C', { i }));
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
    add(T.tumble0, 'tumble', 'L', { until: T.bump });
    add(T.bump, 'bump', 'L');
    add(T.shrug, 'shrug', 'L');
    add(T.reveal, 'reveal');
    add(T.circle, 'circle', 'R');
    add(T.expand, 'expand');
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
  window.__debug = { T, cams, poseLeft, poseRight };
  window.__ready = Promise.all([document.fonts.load(`800 40px ${HEAD}`), document.fonts.load(`600 40px ${HEAD}`),
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
