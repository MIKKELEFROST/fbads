/*
 * "Ét klik" — a 15 s chain-reaction ad for a company that builds websites for tradespeople.
 * Every frame is a pure function of time: __seek(t) redraws the 1080x1920 canvas for time t.
 * Beat grid: 120 BPM → b(n) is the time of beat n (30 beats = 15 s). All copy comes from config.js.
 *
 *   0.0  a phone shows a carpenter's website: "Ét klik på din hjemmeside …"             (beats 0-2)
 *   1.0  a finger taps "Book tid"; the button pops out of the screen as an orange ball   (beats 2-3)
 *   1.6  the ball rolls down a folding rule, drops onto a plank and runs into a copper   (beats 3-8.5)
 *        pipe: "… og det hele går i gang."
 *   4.3  it knocks over four dominoes, one step each (booking, confirmation, reminder,   (beats 8.5-10.5)
 *        calendar), ticked off at the top
 *   5.3  the last domino tips a hammer that rings the counter bell: "Ny opgave booket"   (beats 10.5-16)
 *        and five stars fly up
 *   8.0  "Du skal bare møde op." — the camera pulls back over the whole machine          (beats 16-21)
 *  10.5  end card: sitecrew, the tagline, and the ball rolls in and becomes the CTA       (beats 21-30)
 *
 * The machine lives in world coordinates (x 0-1080, y downwards); a camera follows the ball and pulls
 * back at the end. Text sits in screen space in the top two thirds, clear of the Reels UI.
 */
(function () {
  'use strict';
  const { clamp, lerp, prog, E, spring, kf } = A;
  const CFG = window.CONFIG;
  const K = CFG.colors;
  const W = 1080, H = 1920;
  const BPM = 120;
  const B = 60 / BPM;
  const b = (n) => n * B;
  const DUR = b(30);
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const MONO = "'JetBrains Mono'";
  const DEG = Math.PI / 180;

  // ---------------------------------------------------------------- colour helpers
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixc = (a, c, f) => { const x = hex(a), y = hex(c); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], clamp(f)))).join(',')})`; };
  const rgba = (h, a) => { const [r, g, bl] = hex(h); return `rgba(${r},${g},${bl},${clamp(a)})`; };

  // ---------------------------------------------------------------- timeline (seconds)
  const T = {
    hook: b(0.25), finger: b(0.75), tap: b(2), pop: b(2.5),
    landRuler: b(3.5), offRuler: b(5.5), landPlank: b(5.875), offPlank: b(7.5), inPipe: b(7.75), outPipe: b(8.125), hit: b(8.5),
    chain: b(4.25),
    dom: [b(8.5), b(9), b(9.5), b(10)], hammer: b(10.5), ding: b(12),
    stars: [b(12.5), b(12.75), b(13), b(13.25), b(13.5)],
    payoff: b(15.5), zoom0: b(18), zoom1: b(21),
    card: b(21), logo: b(21.5), word: b(22), tag: b(23), roll0: b(23.75), cta: b(24.75),
  };

  // ---------------------------------------------------------------- the machine (world coordinates)
  const R = 34; // ball radius
  const PHONE = { x: 540, y: 950, w: 420, h: 840, r: 64 };
  const BTN = { x: 540, y: 1262, w: 300, h: 84 };
  const RULER = { a: [812, 1452], b: [330, 1600], th: 28 };
  const PLANK = { a: [150, 1722], b: [940, 1872], th: 40 };
  const PIPE = { x: 1000, top: 1906, bendY: 2104, rb: 80, outY: 2184, outX: 900, r: 44 };
  const FLOOR = 2232;
  const DOM = { xs: [804, 700, 596, 492], w: 56, h: 240 };
  const HAM = { x: 364, y: FLOOR - 6, len: 232, head: 50 };
  const BELL = { x: 142, y: FLOOR };

  function rampFrame(rp) {
    const dx = rp.b[0] - rp.a[0], dy = rp.b[1] - rp.a[1], L = Math.hypot(dx, dy);
    const d = [dx / L, dy / L];
    let n = [d[1], -d[0]];
    if (n[1] > 0) n = [-n[0], -n[1]];
    return { L, d, n };
  }
  const RF = rampFrame(RULER), PF = rampFrame(PLANK);
  const onRamp = (rp, f, s) => [rp.a[0] + f.d[0] * s + f.n[0] * R, rp.a[1] + f.d[1] * s + f.n[1] * R];
  // a hop from p0 to p1 over u in [0,1]: straight line plus an upward bump of height h
  const hop = (p0, p1, u, h) => [lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u) - h * 4 * u * (1 - u)];
  // a fall from p0 with velocity v, landing exactly on p1 after dur seconds (gravity picked to match)
  function fall(p0, v, p1, dur, tau) {
    const gx = (2 * (p1[0] - p0[0] - v[0] * dur)) / (dur * dur), gy = (2 * (p1[1] - p0[1] - v[1] * dur)) / (dur * dur);
    return [p0[0] + v[0] * tau + 0.5 * gx * tau * tau, p0[1] + v[1] * tau + 0.5 * gy * tau * tau];
  }

  // ball on the folding rule: lands at s0, accelerates to the low end
  const RS0 = RF.L * 0.1, PS0 = PF.L * 0.07;
  const rulerS = (u) => RS0 + (RF.L - RS0) * (0.3 * u + 0.7 * u * u);
  const plankS = (u) => PS0 + (PF.L - PS0) * (0.5 * u + 0.5 * u * u);
  const RULER_V = (RF.L - RS0) * 1.7 / (T.offRuler - T.landRuler); // speed at the low end (ds/du = 1.7 at u = 1)
  const PLANK_V = (PF.L - PS0) * 1.5 / (T.offPlank - T.landPlank);
  const PIPE_IN = [PIPE.x, PIPE.top + 30];
  const HIT_X = DOM.xs[0] + DOM.w / 2 + R;

  // where the ball is: { x, y, s (scale), vis (0 hidden inside the pipe), squash }
  function ballAt(t) {
    if (t < T.pop) return null;
    if (t < T.landRuler) {
      const u = prog(t, T.pop, T.landRuler - T.pop);
      const grow = u < 0.25 ? E.outBack(u / 0.25) : 1;
      const p1 = onRamp(RULER, RF, RS0);
      const x = lerp(BTN.x, p1[0], E.outQuad(u));
      const y = lerp(BTN.y, p1[1], u * u) - 150 * 4 * u * (1 - u) * (1 - 0.5 * u);
      return { x, y, s: lerp(0.8, 1, grow) * (1 + 0.18 * Math.sin(Math.PI * clamp(u / 0.5))), vis: 1 };
    }
    if (t < T.offRuler) {
      const [x, y] = onRamp(RULER, RF, rulerS(prog(t, T.landRuler, T.offRuler - T.landRuler)));
      const land = t - T.landRuler;
      return { x, y, s: 1, vis: 1, squash: 0.12 * Math.exp(-land / 0.05) };
    }
    if (t < T.landPlank) {
      const p0 = onRamp(RULER, RF, RF.L), p1 = onRamp(PLANK, PF, PS0);
      const v = [RF.d[0] * RULER_V, RF.d[1] * RULER_V];
      const [x, y] = fall(p0, v, p1, T.landPlank - T.offRuler, t - T.offRuler);
      return { x, y, s: 1, vis: 1 };
    }
    if (t < T.offPlank) {
      const land = t - T.landPlank;
      const [x, y] = onRamp(PLANK, PF, plankS(prog(t, T.landPlank, T.offPlank - T.landPlank)));
      return { x, y: y - 16 * Math.max(0, Math.sin(Math.PI * clamp(land / 0.16))), s: 1, vis: 1, squash: 0.14 * Math.exp(-land / 0.05) };
    }
    if (t < T.inPipe) {
      // flies off the end, hits the far side of the funnel and drops in
      const p0 = onRamp(PLANK, PF, PF.L);
      const wall = [PIPE.x + PIPE.r + 22 - R, p0[1] + 18], tw = 0.06;
      if (t < T.offPlank + tw) {
        const v = [PF.d[0] * PLANK_V, PF.d[1] * PLANK_V];
        const [x, y] = fall(p0, v, wall, tw, t - T.offPlank);
        return { x, y, s: 1, vis: 1 };
      }
      const [x, y] = fall(wall, [-120, 200], PIPE_IN, T.inPipe - T.offPlank - tw, t - T.offPlank - tw);
      return { x, y, s: 1, vis: 1 };
    }
    if (t < T.outPipe) return { x: PIPE.x, y: PIPE.top + 60, s: 1, vis: 0 };
    if (t < T.hit) {
      const u = prog(t, T.outPipe, T.hit - T.outPipe);
      const x = lerp(PIPE.outX + 10, HIT_X, u);
      const y = lerp(PIPE.outY, FLOOR - R, E.inQuad(clamp(u * 1.8)));
      return { x, y, s: 1, vis: 1 };
    }
    // bounces back off the first domino and settles
    const tau = t - T.hit;
    const x = HIT_X + 10 * (1 - Math.exp(-tau / 0.1)) * (1 + 0.2 * Math.exp(-tau / 0.3) * Math.sin(tau * 20));
    return { x, y: FLOOR - R, s: 1, vis: 1, squash: 0.1 * Math.exp(-tau / 0.05) };
  }

  // ---------------------------------------------------------------- dominoes + hammer (angles in radians, negative = to the left)
  const HAM_HIT = -56.6 * DEG;
  function hammerAngle(t) {
    if (t < T.hammer) return 0;
    if (t < T.ding) return HAM_HIT * Math.pow(prog(t, T.hammer, T.ding - T.hammer), 2);
    const tau = t - T.ding; // bounces off the bell plunger and rests on it
    return HAM_HIT + 7 * DEG * Math.exp(-tau / 0.09) * Math.abs(Math.sin(tau * 26));
  }
  const domPivot = (i) => [DOM.xs[i] - DOM.w / 2, FLOOR];
  // angle at which domino i (pivoting on its bottom-left corner) leans on domino i+1 standing at angle phi
  function leanOn(i, phi) {
    const P = domPivot(i), Pn = domPivot(i + 1);
    const q0 = [Pn[0] + DOM.w * Math.cos(phi), Pn[1] + DOM.w * Math.sin(phi)];
    const D = (P[0] - q0[0]) * Math.cos(phi) + (P[1] - q0[1]) * Math.sin(phi);
    return phi + Math.asin(clamp(-D / DOM.h, -1, 1));
  }
  // angle at which the last domino rests against the end of the hammer head
  function leanOnHammer(psi) {
    const P = domPivot(3);
    const hx = HAM.x + HAM.head * Math.cos(psi) + HAM.len * Math.sin(psi) - P[0];
    const hy = HAM.y + HAM.head * Math.sin(psi) - HAM.len * Math.cos(psi) - P[1];
    if (Math.hypot(hx, hy) > DOM.h + 6 || hy >= 0) return -72 * DEG;
    return Math.max(-72 * DEG, Math.atan(-hx / hy));
  }
  const firstContact = [0, 1, 2].map((i) => leanOn(i, 0)).concat([leanOnHammer(0)]);
  function dominoAngles(t) {
    const free = DOM.xs.map((_, i) => {
      if (t < T.dom[i]) return 0;
      return Math.max(-88 * DEG, firstContact[i] * Math.pow((t - T.dom[i]) / B / 0.5, 2));
    });
    const out = new Array(4);
    out[3] = Math.max(free[3], leanOnHammer(hammerAngle(t)));
    for (let i = 2; i >= 0; i--) out[i] = Math.max(free[i], leanOn(i, out[i + 1]));
    return out;
  }

  // ---------------------------------------------------------------- camera
  function camera(t) {
    const y = kf(t, [[b(3), 0], [b(8.25), 800, E.inOutSine]]);
    const z = kf(t, [[T.zoom0, 1], [T.zoom1, 0.64, E.inOutCubic]]);
    const cy = kf(t, [[T.zoom0, y + H / 2], [T.zoom1, 1420, E.inOutCubic]]);
    const cyy = t < T.zoom0 ? y + H / 2 : cy;
    const sy = kf(t, [[T.zoom0, H / 2], [T.zoom1, 1210, E.inOutCubic]]);
    // a small kick when the bell rings
    const kick = t > T.ding ? 5 * Math.exp(-(t - T.ding) / 0.07) * Math.sin((t - T.ding) * 70) : 0;
    return { cx: W / 2, cy: cyy, z, sx: W / 2, sy: sy + kick };
  }
  const applyCam = (c, cam) => {
    c.translate(cam.sx, cam.sy);
    c.scale(cam.z, cam.z);
    c.translate(-cam.cx, -cam.cy);
  };

  // ---------------------------------------------------------------- drawing helpers
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
  const setFont = (c, weight, size, fam = MONO) => { c.font = `${weight} ${size}px ${fam}`; };
  function starPath(c, x, y, r, rot = 0) {
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = rot - Math.PI / 2 + (k * Math.PI) / 5, rad = k % 2 ? r * 0.46 : r;
      c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c.closePath();
  }
  function tick(c, x, y, s, col, prog01 = 1) {
    // a check mark drawn stroke by stroke (prog01 0..1)
    c.save();
    c.strokeStyle = col;
    c.lineWidth = s * 0.16;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const p = [[x - s * 0.34, y + s * 0.02], [x - s * 0.1, y + s * 0.26], [x + s * 0.36, y - s * 0.24]];
    const l1 = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]), l2 = Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]);
    const d = (l1 + l2) * clamp(prog01);
    c.beginPath();
    c.moveTo(...p[0]);
    if (d <= l1) c.lineTo(lerp(p[0][0], p[1][0], d / l1), lerp(p[0][1], p[1][1], d / l1));
    else { c.lineTo(...p[1]); c.lineTo(lerp(p[1][0], p[2][0], (d - l1) / l2), lerp(p[1][1], p[2][1], (d - l1) / l2)); }
    c.stroke();
    c.restore();
  }
  // soft drop shadow for "clay" objects
  const shadowOn = (c, blur = 24, dy = 10, a = 0.18) => { c.shadowColor = `rgba(60,40,20,${a})`; c.shadowBlur = blur; c.shadowOffsetX = 0; c.shadowOffsetY = dy; };
  const shadowOff = (c) => { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0; };

  // ---------------------------------------------------------------- the pegboard wall
  function wall(c, cam) {
    // world rectangle in view
    const x0 = cam.cx - cam.sx / cam.z, x1 = cam.cx + (W - cam.sx) / cam.z;
    const y0 = cam.cy - cam.sy / cam.z, y1 = cam.cy + (H - cam.sy) / cam.z;
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#f3e9d8');
    g.addColorStop(1, '#eadbc3');
    c.fillStyle = g;
    c.fillRect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20);
    const S = 60;
    c.fillStyle = 'rgba(120,90,55,0.20)';
    for (let y = Math.floor(y0 / S) * S + S / 2; y < y1 + S; y += S) {
      for (let x = Math.floor(x0 / S) * S + S / 2; x < x1 + S; x += S) {
        c.beginPath();
        c.arc(x, y, 7, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (let y = Math.floor(y0 / S) * S + S / 2; y < y1 + S; y += S) {
      for (let x = Math.floor(x0 / S) * S + S / 2; x < x1 + S; x += S) {
        c.beginPath();
        c.arc(x, y + 5, 7, 0.15 * Math.PI, 0.85 * Math.PI);
        c.lineWidth = 2;
        c.strokeStyle = 'rgba(255,255,255,0.45)';
        c.stroke();
      }
    }
  }
  // pegboard hook holding something at (x, y)
  function hook(c, x, y) {
    c.save();
    c.strokeStyle = '#8a8f98';
    c.lineWidth = 7;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x, y - 46);
    c.lineTo(x, y + 6);
    c.arc(x + 12, y + 6, 12, Math.PI, 0, true);
    c.stroke();
    c.fillStyle = '#6d727b';
    c.beginPath();
    c.arc(x, y - 48, 6, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // ---------------------------------------------------------------- phone with the client's website
  function phone(c, t) {
    const { x, y, w, h, r } = PHONE;
    const X = x - w / 2, Y = y - h / 2;
    c.save();
    shadowOn(c, 50, 24, 0.25);
    rr(c, X, Y, w, h, r);
    c.fillStyle = '#1f1d2b';
    c.fill();
    shadowOff(c);
    // rim highlight
    rr(c, X + 3, Y + 3, w - 6, h - 6, r - 3);
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 3;
    c.stroke();
    // screen
    const m = 16, sx = X + m, sy = Y + m, sw = w - 2 * m, sh = h - 2 * m;
    rr(c, sx, sy, sw, sh, r - m);
    c.save();
    c.clip();
    c.fillStyle = '#fbf8f3';
    c.fillRect(sx, sy, sw, sh);
    // status bar + notch
    setFont(c, 600, 20, 'Inter');
    c.fillStyle = '#1d1a2b';
    c.textAlign = 'left';
    c.fillText('9.41', sx + 34, sy + 34);
    c.fillRect(sx + sw - 64, sy + 22, 30, 13);
    rr(c, x - 52, sy + 12, 104, 28, 14);
    c.fillStyle = '#1f1d2b';
    c.fill();
    // header
    const hy = sy + 64;
    roofMark(c, sx + 44, hy + 22, 34, K.ink);
    setFont(c, 700, 24, 'Inter');
    c.fillStyle = K.ink;
    c.fillText(CFG.site.trade, sx + 76, hy + 30);
    c.fillStyle = 'rgba(29,26,43,0.35)';
    for (let k = 0; k < 3; k++) c.fillRect(sx + sw - 60, hy + 12 + k * 9, 30, 4);
    // hero picture: a house with a carport under a warm sky
    const px = sx + 20, py = hy + 54, pw = sw - 40, ph = 300;
    rr(c, px, py, pw, ph, 22);
    c.save();
    c.clip();
    const sky = c.createLinearGradient(0, py, 0, py + ph);
    sky.addColorStop(0, '#9fd0f2');
    sky.addColorStop(1, '#fbe3c4');
    c.fillStyle = sky;
    c.fillRect(px, py, pw, ph);
    c.fillStyle = '#ffd98a';
    c.beginPath();
    c.arc(px + pw - 70, py + 70, 34, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#8cc28a';
    c.fillRect(px, py + ph - 56, pw, 56);
    // house
    c.fillStyle = '#f6efe6';
    c.fillRect(px + 40, py + 150, 150, 96);
    c.fillStyle = '#c4553a';
    c.beginPath();
    c.moveTo(px + 26, py + 154);
    c.lineTo(px + 115, py + 92);
    c.lineTo(px + 204, py + 154);
    c.closePath();
    c.fill();
    c.fillStyle = '#7fa7c9';
    c.fillRect(px + 62, py + 172, 34, 30);
    c.fillRect(px + 134, py + 172, 34, 30);
    c.fillStyle = '#8a5a3c';
    c.fillRect(px + 102, py + 196, 26, 50);
    // carport: wooden posts + a flat roof
    c.fillStyle = '#b98352';
    c.fillRect(px + 200, py + 160, 150, 12);
    c.fillRect(px + 206, py + 170, 9, 76);
    c.fillRect(px + 336, py + 170, 9, 76);
    c.fillStyle = '#3d6f9e';
    rr(c, px + 228, py + 214, 96, 34, 10);
    c.fill();
    c.restore();
    // headline + stars
    setFont(c, 800, 44, 'Inter');
    c.fillStyle = K.ink;
    c.fillText(CFG.site.headline, sx + 24, py + ph + 62);
    setFont(c, 500, 22, 'Inter');
    c.fillStyle = 'rgba(29,26,43,0.7)';
    c.fillText(CFG.site.sub, sx + 24, py + ph + 96);
    c.fillStyle = K.gold;
    for (let k = 0; k < 5; k++) { starPath(c, sx + 38 + k * 30, py + ph + 128, 12); c.fill(); }
    c.restore(); // screen clip
    c.restore();
    button(c, t);
  }
  function roofMark(c, x, y, s, col) {
    // the brand mark: a roof over a four-pane window
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
  // "Book tid": pressed at T.tap, turns into the ball at T.pop, an empty dashed slot after
  function button(c, t) {
    const press = t >= T.tap && t < T.pop ? E.outCubic(prog(t, T.tap, 0.08)) : 0;
    const morph = E.inOutCubic(prog(t, T.pop - 0.12, 0.12));
    if (t >= T.pop) {
      // the slot it left behind, and after the bell a green "booked" in its place
      c.save();
      const ok = E.outBack(prog(t, T.ding + 0.1, 0.3));
      if (t < T.ding + 0.1) {
        rr(c, BTN.x - BTN.w / 2, BTN.y - BTN.h / 2, BTN.w, BTN.h, BTN.h / 2);
        c.setLineDash([12, 10]);
        c.strokeStyle = rgba(K.orange, 0.5);
        c.lineWidth = 4;
        c.stroke();
      } else {
        const w = BTN.w * (0.6 + 0.4 * ok), hh = BTN.h * (0.6 + 0.4 * ok);
        rr(c, BTN.x - w / 2, BTN.y - hh / 2, w, hh, hh / 2);
        c.fillStyle = K.green;
        c.fill();
        c.globalAlpha = clamp(ok);
        tick(c, BTN.x - 70, BTN.y, 34, '#fff', prog(t, T.ding + 0.2, 0.25));
        setFont(c, 700, 32, 'Inter');
        c.fillStyle = '#fff';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(CFG.site.booked, BTN.x - 42, BTN.y + 2);
      }
      c.restore();
      return;
    }
    const w = lerp(BTN.w, R * 2, morph) * (1 - 0.05 * press), hh = lerp(BTN.h, R * 2, morph) * (1 - 0.08 * press);
    c.save();
    shadowOn(c, 18 - 12 * press, 8 - 6 * press, 0.25);
    rr(c, BTN.x - w / 2, BTN.y - hh / 2 + 3 * press, w, hh, hh / 2);
    const g = c.createLinearGradient(0, BTN.y - hh / 2, 0, BTN.y + hh / 2);
    g.addColorStop(0, '#ff8a55');
    g.addColorStop(1, K.orange);
    c.fillStyle = g;
    c.fill();
    shadowOff(c);
    c.globalAlpha = 1 - morph;
    setFont(c, 700, 34, 'Inter');
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(CFG.site.button, BTN.x, BTN.y + 2 + 3 * press);
    c.restore();
  }
  // the index finger that taps the button
  function finger(c, t) {
    if (t < T.finger || t > b(4)) return;
    const inn = E.outCubic(prog(t, T.finger, T.tap - T.finger));
    const out = E.inCubic(prog(t, T.tap + 0.18, 0.5));
    const tipX = BTN.x + 40, tipY = BTN.y + 18;
    const x = lerp(tipX + 330, tipX, inn) + 340 * out, y = lerp(tipY + 520, tipY, inn) + 520 * out + (t > T.tap && t < T.tap + 0.18 ? 6 : 0);
    c.save();
    c.translate(x, y);
    c.rotate(-0.55);
    shadowOn(c, 30, 16, 0.22);
    rr(c, -46, -8, 92, 520, 46);
    const g = c.createLinearGradient(-46, 0, 46, 0);
    g.addColorStop(0, '#f6cdb0');
    g.addColorStop(1, '#e2a987');
    c.fillStyle = g;
    c.fill();
    shadowOff(c);
    rr(c, -28, 6, 56, 70, 26);
    c.fillStyle = 'rgba(255,240,235,0.75)';
    c.fill();
    c.restore();
    // tap ripple
    if (t >= T.tap && t < T.tap + 0.5) {
      const u = prog(t, T.tap, 0.5);
      c.save();
      c.strokeStyle = rgba(K.orange, 1 - u);
      c.lineWidth = 6 * (1 - u) + 1;
      c.beginPath();
      c.arc(tipX - 10, tipY - 14, 30 + 120 * E.outCubic(u), 0, Math.PI * 2);
      c.stroke();
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k - 2.5) * 0.5;
        const r0 = 80 + 60 * u, r1 = r0 + 34 * (1 - u);
        c.beginPath();
        c.moveTo(tipX - 10 + Math.cos(a) * r0, tipY - 14 + Math.sin(a) * r0);
        c.lineTo(tipX - 10 + Math.cos(a) * r1, tipY - 14 + Math.sin(a) * r1);
        c.stroke();
      }
      c.restore();
    }
  }

  // ---------------------------------------------------------------- ramps, pipe, shelf
  // y of a ramp's running surface at x
  const surfY = (rp, x) => lerp(rp.a[1], rp.b[1], (x - rp.a[0]) / (rp.b[0] - rp.a[0]));
  function ruler(c) {
    const { th } = RULER;
    const a = RULER.b; // draw from the low (left) end, so the body hangs below the surface the ball runs on
    const ang = Math.atan2(RULER.a[1] - RULER.b[1], RULER.a[0] - RULER.b[0]);
    c.save();
    c.translate(a[0], a[1]);
    c.rotate(ang);
    shadowOn(c, 16, 10, 0.2);
    c.fillStyle = '#f2c230';
    c.fillRect(0, 0, RF.L, th);
    shadowOff(c);
    c.fillStyle = '#d8a51c';
    c.fillRect(0, th - 7, RF.L, 7);
    // segments with hinges and cm marks
    const seg = RF.L / 4;
    c.fillStyle = '#2a2520';
    for (let k = 0; k <= RF.L; k += 9) {
      const long = Math.round(k / 9) % 5 === 0;
      c.fillRect(k, 0, 2, long ? 11 : 6);
    }
    for (let s = 1; s < 4; s++) {
      c.fillStyle = '#a5a9b0';
      c.beginPath();
      c.arc(s * seg, th / 2, 7, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(s * seg - 1, 0, 2, th);
    }
    c.restore();
    [RULER.b[0] + 70, RULER.a[0] - 70].forEach((x) => hook(c, x, surfY(RULER, x) + th + 2));
  }
  function plank(c) {
    const { a, th } = PLANK;
    const ang = Math.atan2(PF.d[1], PF.d[0]);
    c.save();
    c.translate(a[0], a[1]);
    c.rotate(ang);
    shadowOn(c, 18, 12, 0.22);
    const g = c.createLinearGradient(0, 0, 0, th);
    g.addColorStop(0, '#e9bd83');
    g.addColorStop(1, '#c98f55');
    c.fillStyle = g;
    c.fillRect(0, 0, PF.L, th);
    shadowOff(c);
    // grain
    c.strokeStyle = 'rgba(120,70,30,0.28)';
    c.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      c.beginPath();
      for (let x = 0; x <= PF.L; x += 20) {
        const yy = 7 + k * 7 + 2.2 * Math.sin(x * 0.013 + k * 1.7) + 1.4 * Math.sin(x * 0.041 + k);
        if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
      }
      c.stroke();
    }
    // back stop at the high end, nails
    c.fillStyle = '#b97d45';
    rr(c, -4, -40, 26, 44, 5);
    c.fill();
    c.fillStyle = '#6d727b';
    [60, PF.L - 60].forEach((x) => { c.beginPath(); c.arc(x, th / 2, 5, 0, Math.PI * 2); c.fill(); });
    c.restore();
    [PLANK.a[0] + 110, PLANK.b[0] - 120].forEach((x) => hook(c, x, surfY(PLANK, x) + th + 2));
  }
  // copper pipe: vertical from the funnel, a 90° elbow, outlet to the left above the shelf
  function pipePath(c) {
    c.beginPath();
    c.moveTo(PIPE.x, PIPE.top);
    c.lineTo(PIPE.x, PIPE.bendY);
    c.arc(PIPE.x - PIPE.rb, PIPE.bendY, PIPE.rb, 0, Math.PI / 2);
    c.lineTo(PIPE.outX, PIPE.outY);
  }
  function pipe(c, t) {
    // the ball rumbling through makes the pipe shiver
    const inside = t > T.inPipe && t < T.outPipe ? Math.sin(t * 90) * 1.6 * Math.sin(Math.PI * prog(t, T.inPipe, T.outPipe - T.inPipe)) : 0;
    c.save();
    c.translate(inside, 0);
    c.lineCap = 'butt';
    c.lineJoin = 'round';
    shadowOn(c, 18, 10, 0.2);
    pipePath(c);
    c.strokeStyle = '#a85a2c';
    c.lineWidth = PIPE.r * 2;
    c.stroke();
    shadowOff(c);
    pipePath(c);
    c.strokeStyle = '#d17a42';
    c.lineWidth = PIPE.r * 2 - 14;
    c.stroke();
    pipePath(c);
    c.strokeStyle = 'rgba(255,214,170,0.55)';
    c.lineWidth = 10;
    c.save();
    c.translate(-12, -4);
    c.stroke();
    c.restore();
    // fittings
    const ring = (x, y, vert) => {
      c.fillStyle = '#b8652f';
      if (vert) rr(c, x - PIPE.r - 5, y - 10, PIPE.r * 2 + 10, 20, 6);
      else rr(c, x - 10, y - PIPE.r - 5, 20, PIPE.r * 2 + 10, 6);
      c.fill();
    };
    ring(PIPE.x, PIPE.bendY, true);
    ring(PIPE.x - PIPE.rb, PIPE.outY, false);
    // funnel at the top and the outlet mouth
    c.fillStyle = '#c46d38';
    c.beginPath();
    c.moveTo(PIPE.x - PIPE.r - 26, PIPE.top - 26);
    c.lineTo(PIPE.x + PIPE.r + 26, PIPE.top - 26);
    c.lineTo(PIPE.x + PIPE.r, PIPE.top + 14);
    c.lineTo(PIPE.x - PIPE.r, PIPE.top + 14);
    c.closePath();
    c.fill();
    c.fillStyle = '#5a2c14';
    c.beginPath();
    c.ellipse(PIPE.x, PIPE.top - 26, PIPE.r + 24, 9, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#b8652f';
    rr(c, PIPE.outX - 14, PIPE.outY - PIPE.r - 8, 22, PIPE.r * 2 + 16, 7);
    c.fill();
    c.fillStyle = '#4a240f';
    c.beginPath();
    c.ellipse(PIPE.outX - 6, PIPE.outY, 7, PIPE.r - 6, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // bracket to the wall
    hook(c, PIPE.x - 70, PIPE.top + 110);
  }
  function shelf(c) {
    c.save();
    shadowOn(c, 20, 12, 0.22);
    const g = c.createLinearGradient(0, FLOOR, 0, FLOOR + 34);
    g.addColorStop(0, '#dcae78');
    g.addColorStop(1, '#b98352');
    c.fillStyle = g;
    rr(c, 40, FLOOR, 1000, 34, 6);
    c.fill();
    shadowOff(c);
    c.fillStyle = '#8a8f98';
    [150, 930].forEach((x) => {
      c.beginPath();
      c.moveTo(x - 10, FLOOR + 34);
      c.lineTo(x + 10, FLOOR + 34);
      c.lineTo(x + 10, FLOOR + 110);
      c.lineTo(x - 50, FLOOR + 34);
      c.closePath();
      c.fill();
    });
    c.restore();
  }

  // ---------------------------------------------------------------- ball
  function ball(c, t, front) {
    const s = ballAt(t);
    if (!s || !s.vis) return;
    const { x, y } = s;
    const sc = s.s || 1, sq = s.squash || 0;
    // contact shadow when on something
    c.save();
    c.translate(x, y);
    c.scale(sc * (1 + sq), sc * (1 - sq));
    c.translate(0, (sq * R));
    shadowOn(c, 14, 8, 0.28);
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    const g = c.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    g.addColorStop(0, '#ffc2a0');
    g.addColorStop(0.35, '#ff7a3d');
    g.addColorStop(1, '#d4471a');
    c.fillStyle = g;
    c.fill();
    shadowOff(c);
    // a stripe that rolls with the ball
    c.rotate(x / R);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(0, 0, R * 0.62, -0.5, 0.5);
    c.stroke();
    c.restore();
  }

  // ---------------------------------------------------------------- dominoes, hammer, bell
  const ICONS = ['calendar', 'envelope', 'clock', 'check'];
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
      c.beginPath();
      c.moveTo(x, y - 0.02 * s);
      c.lineTo(x, y + 0.3 * s);
      c.moveTo(x - 0.16 * s, y + 0.14 * s);
      c.lineTo(x + 0.16 * s, y + 0.14 * s);
      c.stroke();
    } else if (kind === 'envelope') {
      rr(c, x - s / 2, y - s * 0.34, s, s * 0.68, s * 0.08);
      c.stroke();
      c.beginPath();
      c.moveTo(x - s / 2, y - s * 0.3);
      c.lineTo(x, y + s * 0.06);
      c.lineTo(x + s / 2, y - s * 0.3);
      c.stroke();
    } else if (kind === 'clock') {
      c.beginPath();
      c.arc(x, y + s * 0.04, s * 0.42, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(x, y + s * 0.04);
      c.lineTo(x, y - s * 0.2);
      c.moveTo(x, y + s * 0.04);
      c.lineTo(x + s * 0.18, y + s * 0.14);
      c.stroke();
      c.beginPath();
      c.arc(x - s * 0.36, y - s * 0.36, s * 0.14, Math.PI, Math.PI * 1.9);
      c.arc(x + s * 0.36, y - s * 0.36, s * 0.14, Math.PI * 1.1, 0);
      c.stroke();
    } else {
      c.beginPath();
      c.arc(x, y, s * 0.46, 0, Math.PI * 2);
      c.stroke();
      tick(c, x + s * 0.02, y, s * 0.62, col);
    }
    c.restore();
  }
  const DOM_COLS = ['#4f8ef7', '#9b6cf0', '#f08a3c', K.green];
  function dominoes(c, t) {
    const ang = dominoAngles(t);
    // draw from the last to the first so the leaning ones sit on top
    for (let i = 3; i >= 0; i--) {
      const [px, py] = domPivot(i);
      c.save();
      c.translate(px, py);
      c.rotate(ang[i]);
      shadowOn(c, 16, 8, 0.2);
      rr(c, 0, -DOM.h, DOM.w, DOM.h, 10);
      c.fillStyle = '#fbf6ee';
      c.fill();
      shadowOff(c);
      rr(c, 0, -DOM.h, DOM.w, DOM.h, 10);
      c.strokeStyle = 'rgba(80,60,40,0.18)';
      c.lineWidth = 3;
      c.stroke();
      c.fillStyle = DOM_COLS[i];
      rr(c, 6, -DOM.h + 8, DOM.w - 12, 70, 7);
      c.fill();
      icon(c, ICONS[i], DOM.w / 2, -DOM.h + 43, 30, '#fff');
      c.fillStyle = 'rgba(80,60,40,0.16)';
      c.fillRect(8, -DOM.h / 2 + 30, DOM.w - 16, 4);
      c.beginPath();
      c.arc(DOM.w / 2, -DOM.h / 2 + 70, 7, 0, Math.PI * 2);
      c.arc(DOM.w / 2, -DOM.h / 2 + 100, 7, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }
  function hammer(c, t) {
    const psi = hammerAngle(t);
    c.save();
    c.translate(HAM.x, HAM.y);
    c.rotate(psi);
    shadowOn(c, 16, 10, 0.22);
    // handle
    const g = c.createLinearGradient(-11, 0, 11, 0);
    g.addColorStop(0, '#e0a868');
    g.addColorStop(1, '#b67a45');
    c.fillStyle = g;
    rr(c, -11, -HAM.len, 22, HAM.len, 9);
    c.fill();
    // head
    const hg = c.createLinearGradient(0, -HAM.len - 28, 0, -HAM.len + 28);
    hg.addColorStop(0, '#c9d0d8');
    hg.addColorStop(1, '#7f8792');
    c.fillStyle = hg;
    rr(c, -HAM.head, -HAM.len - 26, HAM.head * 2, 52, 8);
    c.fill();
    shadowOff(c);
    c.fillStyle = '#6a717c';
    rr(c, -HAM.head - 6, -HAM.len - 20, 12, 40, 4); // striking face
    c.fill();
    c.restore();
    // pivot bolt
    c.fillStyle = '#5d626b';
    c.beginPath();
    c.arc(HAM.x, HAM.y, 11, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#9aa0a8';
    c.beginPath();
    c.arc(HAM.x, HAM.y, 5, 0, Math.PI * 2);
    c.fill();
  }
  function bell(c, t) {
    const hit = t >= T.ding ? t - T.ding : -1;
    const push = hit >= 0 ? 10 * Math.exp(-hit / 0.06) : 0;
    const wob = hit >= 0 ? 0.03 * Math.exp(-hit / 0.4) * Math.sin(hit * 60) : 0;
    const { x, y } = BELL;
    c.save();
    c.translate(x, y);
    // base
    shadowOn(c, 14, 8, 0.22);
    c.fillStyle = '#3b3548';
    rr(c, -72, -16, 144, 16, 5);
    c.fill();
    shadowOff(c);
    // dome
    c.save();
    c.scale(1 + wob, 1 - wob);
    const g = c.createRadialGradient(-22, -58, 6, 0, -30, 80);
    g.addColorStop(0, '#fff3c4');
    g.addColorStop(0.4, K.gold);
    g.addColorStop(1, '#b07814');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-62, -16);
    c.quadraticCurveTo(-62, -74, 0, -76);
    c.quadraticCurveTo(62, -74, 62, -16);
    c.closePath();
    c.fill();
    c.restore();
    // plunger
    c.fillStyle = '#6a717c';
    c.fillRect(-5, -92 + push, 10, 18);
    c.beginPath();
    c.ellipse(0, -92 + push, 14, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // sound rings
    if (hit >= 0 && hit < 1.2) {
      for (let k = 0; k < 3; k++) {
        const u = clamp((hit - k * 0.12) / 0.9);
        if (u <= 0 || u >= 1) continue;
        c.save();
        c.strokeStyle = rgba(K.gold, (1 - u) * 0.9);
        c.lineWidth = 8 * (1 - u) + 2;
        c.beginPath();
        c.arc(x, y - 60, 70 + 220 * E.outCubic(u), -Math.PI * 0.95, -Math.PI * 0.05);
        c.stroke();
        c.restore();
      }
    }
  }

  // ---------------------------------------------------------------- the stars (screen space)
  const STAR_ROW_Y = 575;
  function stars(c, t, cam) {
    const bx = (BELL.x - cam.cx) * cam.z + cam.sx, by = (BELL.y - 90 - cam.cy) * cam.z + cam.sy;
    const out = 1 - E.inCubic(prog(t, T.payoff - 0.25, 0.35));
    if (out <= 0) return;
    T.stars.forEach((t0, k) => {
      if (t < t0) return;
      const u = E.inOutCubic(prog(t, t0, 0.5));
      const tx = W / 2 + (k - 2) * 96, ty = STAR_ROW_Y;
      const x = lerp(bx, tx, u), y = lerp(by, ty, u) - 420 * Math.sin(Math.PI * u) * (1 - u * 0.3);
      const land = t - (t0 + 0.5);
      const pop = land > 0 ? 1 + 0.3 * Math.exp(-land / 0.08) * Math.cos(land * 30) : 0.6 + 0.4 * u;
      c.save();
      c.globalAlpha = out;
      c.translate(x, y);
      c.rotate((1 - u) * 5);
      shadowOn(c, 16, 6, 0.25);
      starPath(c, 0, 0, 40 * pop);
      c.fillStyle = K.gold;
      c.fill();
      shadowOff(c);
      starPath(c, -4, -5, 16 * pop);
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fill();
      c.restore();
    });
  }

  // ---------------------------------------------------------------- screen-space text
  // big two-line headline; *word* is set in orange; lines rise in from a mask
  function headline(c, lines, t, t0, t1, y0 = 380, size = 84) {
    if (t < t0 || t > t1 + 0.4) return;
    lines.forEach((ln, i) => {
      const inn = E.outCubic(prog(t, t0 + i * 0.08, 0.35));
      const out = E.inCubic(prog(t, t1 + i * 0.05, 0.3));
      if (inn <= 0 || out >= 1) return;
      const y = y0 + i * size * 1.12;
      c.save();
      c.beginPath();
      c.rect(0, y - size * 1.0, W, size * 1.3);
      c.clip();
      setFont(c, 800, size);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      const parts = ln.split('*');
      const plain = parts.join('');
      let x = W / 2 - c.measureText(plain).width / 2;
      const dy = (1 - inn) * size * 1.05 - out * size * 1.05;
      parts.forEach((p, k) => {
        c.fillStyle = k % 2 ? K.orange : K.ink;
        c.fillText(p, x, y + dy);
        x += c.measureText(p).width;
      });
      c.restore();
    });
  }
  function checklist(c, t) {
    const out = E.inCubic(prog(t, T.ding - 0.3, 0.3));
    if (t < T.dom[0] || out >= 1) return;
    const x0 = 170, y0 = 350, dy = 78;
    CFG.steps.forEach((s, i) => {
      const t0 = T.dom[i];
      if (t < t0) return;
      const inn = E.outBack(prog(t, t0, 0.22));
      c.save();
      c.globalAlpha = clamp(inn) * (1 - out);
      c.translate((1 - inn) * -40, 0);
      const y = y0 + i * dy;
      c.fillStyle = DOM_COLS[i];
      c.beginPath();
      c.arc(x0, y - 14, 26, 0, Math.PI * 2);
      c.fill();
      tick(c, x0, y - 14, 30, '#fff', prog(t, t0 + 0.05, 0.18));
      setFont(c, 700, 44);
      c.fillStyle = K.ink;
      c.textAlign = 'left';
      c.fillText(s, x0 + 50, y);
      c.restore();
    });
  }
  function notice(c, t) {
    if (t < T.ding) return;
    const inn = E.outBack(prog(t, T.ding, 0.3));
    const out = E.inCubic(prog(t, T.payoff - 0.3, 0.3));
    if (out >= 1) return;
    const w = 880, h = 170, x = W / 2 - w / 2, y = 330;
    c.save();
    c.globalAlpha = clamp(inn * 1.5) * (1 - out);
    c.translate(W / 2, y + h / 2);
    c.scale(0.8 + 0.2 * inn, 0.8 + 0.2 * inn);
    c.translate(-W / 2, -(y + h / 2));
    shadowOn(c, 40, 16, 0.18);
    rr(c, x, y, w, h, 34);
    c.fillStyle = '#fff';
    c.fill();
    shadowOff(c);
    c.fillStyle = K.orange;
    rr(c, x + 30, y + 35, 100, 100, 26);
    c.fill();
    icon(c, 'calendar', x + 80, y + 88, 52, '#fff');
    setFont(c, 800, 46);
    c.fillStyle = K.ink;
    c.textAlign = 'left';
    c.fillText(CFG.notice.title, x + 160, y + 78);
    setFont(c, 500, 34, 'Inter');
    c.fillStyle = 'rgba(29,26,43,0.72)';
    c.fillText(CFG.notice.detail, x + 160, y + 128);
    c.restore();
  }
  // a pale scrim behind the text once the camera has moved down
  function scrim(c, t) {
    const a = clamp(prog(t, b(3.5), 0.4)) * (1 - prog(t, T.zoom0, 0.6));
    if (a <= 0) return;
    const g = c.createLinearGradient(0, 180, 0, 900);
    g.addColorStop(0, `rgba(243,233,216,${0.92 * a})`);
    g.addColorStop(0.55, `rgba(243,233,216,${0.8 * a})`);
    g.addColorStop(1, 'rgba(243,233,216,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, 900);
  }

  // ---------------------------------------------------------------- end card
  function endCard(c, t) {
    if (t < T.card) return;
    const up = E.inOutCubic(prog(t, T.card, 0.55));
    const top = lerp(H + 40, 0, up);
    c.save();
    // the panel slides up with a soft leading edge
    shadowOn(c, 60, -20, 0.35);
    c.fillStyle = K.ink;
    c.fillRect(0, top, W, H - top + 10);
    shadowOff(c);
    c.beginPath();
    c.rect(0, top, W, H);
    c.clip();
    const cx = W / 2;
    // logo mark drops in
    const lg = spring(t - T.logo, 2.6, 0.45);
    if (t >= T.logo) roofMark(c, cx, 560 - (1 - lg) * 80, 170, K.orange);
    // wordmark typed letter by letter, with a blinking cursor
    const name = CFG.brand.name;
    const n = Math.floor(clamp((t - T.word) / 0.09, 0, name.length));
    setFont(c, 800, 128);
    c.textAlign = 'left';
    const nw = c.measureText(name).width;
    const x0 = cx - nw / 2;
    c.fillStyle = '#fff';
    if (t >= T.word) c.fillText(name.slice(0, n), x0, 820);
    const cw = c.measureText('m').width;
    const blink = t < T.word + name.length * 0.09 + 0.1 || Math.floor((t - T.word) / B) % 2 === 0;
    if (t >= T.word - 0.3 && blink) {
      c.fillStyle = K.orange;
      c.fillRect(x0 + n * cw + 6, 720, 14, 110);
    }
    // tagline
    const tg = E.outCubic(prog(t, T.tag, 0.45));
    c.globalAlpha = tg;
    setFont(c, 500, 44);
    c.textAlign = 'center';
    c.fillStyle = '#d9d2ea';
    CFG.brand.tagline.forEach((ln, i) => c.fillText(ln, cx, 930 + i * 62 + (1 - tg) * 14));
    c.globalAlpha = 1;
    // the ball rolls in along the bottom and pops into the CTA
    const cy = 1140;
    if (t >= T.roll0 && t < T.cta) {
      const u = prog(t, T.roll0, T.cta - T.roll0);
      const x = lerp(-60, cx, E.outCubic(u));
      c.save();
      c.translate(x, cy);
      const g = c.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
      g.addColorStop(0, '#ffc2a0');
      g.addColorStop(0.35, '#ff7a3d');
      g.addColorStop(1, '#d4471a');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, R, 0, Math.PI * 2);
      c.fill();
      c.rotate(x / R);
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(0, 0, R * 0.62, -0.5, 0.5);
      c.stroke();
      c.restore();
    }
    if (t >= T.cta) {
      const u = E.outBack(prog(t, T.cta, 0.35));
      const beat = ((t - T.cta) / B) % 1;
      const pulse = t > T.cta + 0.5 ? 1 + 0.03 * Math.exp(-beat * 6) : 1;
      const pw = lerp(R * 2, 600, u) * pulse, ph = lerp(R * 2, 116, clamp(u)) * pulse;
      c.save();
      shadowOn(c, 30, 10, 0.4);
      rr(c, cx - pw / 2, cy - ph / 2, pw, ph, ph / 2);
      const g = c.createLinearGradient(0, cy - ph / 2, 0, cy + ph / 2);
      g.addColorStop(0, '#ff8a55');
      g.addColorStop(1, K.orange);
      c.fillStyle = g;
      c.fill();
      shadowOff(c);
      c.globalAlpha = clamp((u - 0.5) * 2);
      setFont(c, 800, 42);
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(CFG.brand.cta, cx, cy + 3);
      c.restore();
    }
    c.restore();
  }

  // ---------------------------------------------------------------- one frame
  function frame(t) {
    const cam = camera(t);
    ctx.save();
    applyCam(ctx, cam);
    wall(ctx, cam);
    shelf(ctx);
    ruler(ctx);
    plank(ctx);
    phone(ctx, t);
    ball(ctx, t);
    pipe(ctx, t);
    hammer(ctx, t);
    bell(ctx, t);
    dominoes(ctx, t);
    finger(ctx, t);
    ctx.restore();

    scrim(ctx, t);
    headline(ctx, CFG.hook, t, T.hook, T.chain - 0.35);
    headline(ctx, CFG.chain, t, T.chain, T.dom[0] - 0.45);
    checklist(ctx, t);
    notice(ctx, t);
    stars(ctx, t, cam);
    headline(ctx, CFG.payoff, t, T.payoff, b(18.5), 400);
    endCard(ctx, t);
  }

  // ---------------------------------------------------------------- sound cues for tools/make_audio.py
  function cues() {
    const out = [];
    const add = (t, type, extra = {}) => out.push(Object.assign({ t: +t.toFixed(4), type }, extra));
    add(T.finger, 'swish');
    add(T.tap, 'tap');
    add(T.pop, 'pop');
    add(T.landRuler, 'land', { surface: 'ruler' });
    add(T.landRuler, 'roll', { until: T.offRuler, surface: 'ruler', v0: 0.3, v1: 1.0 });
    add(T.landPlank, 'land', { surface: 'plank' });
    add(T.landPlank, 'roll', { until: T.offPlank, surface: 'plank', v0: 0.3, v1: 1.0 });
    add(T.inPipe, 'pipe', { until: T.outPipe });
    add(T.outPipe, 'land', { surface: 'shelf' });
    add(T.outPipe, 'roll', { until: T.hit, surface: 'shelf', v0: 0.8, v1: 0.8 });
    T.dom.forEach((t0, i) => add(t0, 'domino', { i }));
    add(T.hammer, 'knock');
    add(T.ding, 'ding');
    T.stars.forEach((t0, i) => add(t0 + 0.5, 'star', { i }));
    add(T.ding + 0.05, 'notice');
    add(T.payoff, 'payoff');
    add(T.zoom0, 'zoom', { until: T.zoom1 });
    add(T.card, 'card');
    add(T.logo, 'logo');
    for (let k = 0; k < CFG.brand.name.length; k++) add(T.word + k * 0.09, 'key', { i: k });
    add(T.roll0, 'roll', { until: T.cta, surface: 'card', v0: 1.0, v1: 0.2 });
    add(T.cta, 'cta');
    return out.sort((x, y) => x.t - y.t);
  }

  // ---------------------------------------------------------------- main
  const stage = document.getElementById('stage');
  const q = new URLSearchParams(location.search);
  const seek = (t) => frame(clamp(t, 0, DUR - 1e-6));
  // fast moves get extra motion-blur samples
  const BLUR = [[T.finger, T.pop + 0.3], [T.pop, T.hit + 0.35], [T.dom[0], T.ding + 0.3], [T.stars[0], T.stars[4] + 0.6],
    [T.zoom0, T.zoom1], [T.card, T.card + 0.6], [T.roll0, T.cta + 0.4]];
  window.__meta = { W, H, DUR, BPM, format: 'portrait', blur: BLUR, poster: b(27), cues: cues() };
  window.__seek = seek;
  window.__debug = { ballAt, dominoAngles, hammerAngle, camera, T }; // for checking the ball path and the dominoes
  window.__ready = Promise.all([document.fonts.load(`800 40px ${MONO}`), document.fonts.load(`500 40px ${MONO}`), document.fonts.load(`700 40px ${MONO}`),
    document.fonts.load('500 30px Inter'), document.fonts.load('800 40px Inter')])
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
