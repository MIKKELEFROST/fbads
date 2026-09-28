/*
 * "Døgnet rundt" — a 15 s illustrated ad for a company that builds websites for tradespeople.
 * Every frame is a pure function of time: __seek(t) redraws the 1080x1920 canvas for time t.
 * Beat grid: 96 BPM → b(n) is the time of beat n (24 beats = 15 s). All copy comes from config.js.
 *
 *   0.0  17.00  dusk on the street, "Du har fri."                                        (beats 0-4)
 *   2.5  night  time-lapse: the clock spins to 23.47, the lights go out, "Du sover."     (beats 4-7)
 *   4.7  night  "Din hjemmeside gør ikke." — the bookings arrive one by one; each drops   (beats 7-15)
 *               into the sleeping house as a drop of light, and the clock jumps to its time
 *   9.4  dawn   the sun comes up, 07.00: "Godmorgen. 4 nye opgaver."                      (beats 15-18.5)
 *  11.6  card   frosted card: sitecrew, "Hjemmesider, der arbejder døgnet rundt.", CTA    (beats 18.5-24)
 */
(function () {
  'use strict';
  const { clamp, lerp, prog, E, spring, kf, rng } = A;
  const CFG = window.CONFIG;
  const K = CFG.colors;
  const W = 1080, H = 1920;
  const B = 60 / 96;
  const b = (n) => n * B;
  const DUR = b(24);
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const scene = document.createElement('canvas');
  scene.width = W;
  scene.height = H;
  const sc = scene.getContext('2d');
  const small = document.createElement('canvas'); // 1/8 size copy of the scene, blown up again for the frosted card
  small.width = W / 8;
  small.height = H / 8;
  const smc = small.getContext('2d');

  // ---------------------------------------------------------------- timeline (seconds)
  const NB = CFG.bookings.length;
  const T = {
    tick: b(1), off: b(1.5), offOut: b(3.6),
    lapse0: b(4), lapse1: b(6.5), lampOn: b(4.5),
    asleep: b(6.25), bedroom: b(6.5), site: b(7.4),
    book: CFG.bookings.map((_, i) => b(8.5 + (4.5 / Math.max(1, NB - 1)) * i)),
    dawn: b(15), clock7: b(15.25), lampOff: b(16.25),
    morning: b(16), morning2: b(16.5), checks: b(16.75),
    card: b(18.5), logo: b(19), word: b(19.25), tag: b(19.75), cta: b(20.5),
  };

  // ---------------------------------------------------------------- colour helpers
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixc = (a, c, f) => { const x = hex(a), y = hex(c); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], clamp(f)))).join(',')})`; };
  const rgba = (h, a) => { const [r, g, bl] = hex(h); return `rgba(${r},${g},${bl},${clamp(a)})`; };
  // piecewise colour track: [[t, '#hex'], ...], eased between keys
  function track(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) return mixc(keys[i - 1][1], keys[i][1], E.inOutSine((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
    }
    return keys[keys.length - 1][1];
  }
  const DUSK = 0, NIGHT0 = b(4.2), NIGHT = b(6.8), DAWN0 = b(15), MORN = b(18);
  const SKY = [
    [[DUSK, '#232a63'], [NIGHT0, '#141a44'], [NIGHT, '#050816'], [DAWN0, '#060a1c'], [b(16.5), '#253471'], [MORN, '#5b8fd8'], [DUR, '#6aa0e2']],
    [[DUSK, '#a4557f'], [NIGHT0, '#5a3a6e'], [NIGHT, '#0d1535'], [DAWN0, '#0e1738'], [b(16.5), '#8a6594'], [MORN, '#b7d2ef'], [DUR, '#c3dbf3']],
    [[DUSK, '#ffa06c'], [NIGHT0, '#df7760'], [NIGHT, '#1d2b5e'], [DAWN0, '#1e2c60'], [b(16.5), '#f4a07c'], [MORN, '#ffe3bc'], [DUR, '#fff0d4']],
  ];
  // 1 in daylight, low at night: how lit the houses, van and street are
  const daylight = (t) => kf(t, [[0, 0.62], [NIGHT0, 0.35], [NIGHT, 0.08], [DAWN0, 0.08], [b(16.5), 0.45], [MORN, 1]]);
  const stars = (t) => kf(t, [[b(4.6), 0], [NIGHT, 1], [DAWN0, 1], [b(17), 0]]);

  // ---------------------------------------------------------------- the street (in scene pixels)
  const HOUSES = [
    { x0: -40, x1: 340, top: 1380, peak: [150, 1195], day: '#8a4a38', night: '#241822' },
    { x0: 330, x1: 760, top: 1340, peak: [545, 1105], day: '#a8633f', night: '#2b1c23', chimney: [640, 1150, 50, 90] },
    { x0: 750, x1: 1120, top: 1390, ridge: [810, 1060, 1255], day: '#6d3f4c', night: '#1f1726' },
  ];
  const FLOOR = 1745;
  // windows: [x, y, w, h, [on, off], ...lit intervals in beats]
  const WINDOWS = [
    [30, 1440, 90, 100, [0, 5.2], [16.8, 99]], [200, 1440, 90, 100, [0, 4.8]], [30, 1590, 90, 100, [0, 5.6], [17.2, 99]],
    [385, 1390, 100, 110, [0, 5.0], [16.4, 99]], [605, 1390, 100, 110, [0, 6.5], [16.1, 99]], [385, 1575, 180, 110, [0, 5.4], [16.6, 99]],
    [790, 1440, 72, 90, [0, 5.8]], [898, 1440, 72, 90, [0.6, 6.0], [17.4, 99]], [1006, 1440, 72, 90, [0, 4.9], [17, 99]], [790, 1590, 120, 100, [0, 5.9]],
  ];
  const ATTIC = [545, 1255, 34];
  const HOME = [545, 1175]; // where the bookings are delivered: the ridge of the middle house
  const lit = (w, t) => {
    let v = 0;
    for (const [on, off] of w.slice(4)) {
      const up = clamp((t - b(on)) / 0.12), down = clamp((t - b(off)) / 0.12);
      const flick = t > b(on) && t < b(on) + 0.16 && on > 0 ? (Math.sin(t * 90) > 0 ? 1 : 0.4) : 1;
      v = Math.max(v, up * (1 - down) * flick);
    }
    return v;
  };

  const R = rng(2024);
  const STARS = Array.from({ length: 190 }, () => ({ x: R() * W, y: R() * 1180, r: 0.8 + R() * R() * 2.6, p: R() * 6.28, s: 0.6 + R() * 2 }));
  const CLOUDS = [[120, 520, 520, 40], [620, 700, 460, 34], [260, 930, 620, 46], [760, 1030, 380, 30]];

  function sky(c, t) {
    const g = c.createLinearGradient(0, 0, 0, 1420);
    g.addColorStop(0, track(SKY[0], t));
    g.addColorStop(0.55, track(SKY[1], t));
    g.addColorStop(1, track(SKY[2], t));
    c.fillStyle = g;
    c.fillRect(-60, -60, W + 120, H + 120);
    // stars twinkle in over the night
    const s = stars(t);
    if (s > 0) {
      for (const st of STARS) {
        const a = s * (0.55 + 0.45 * Math.sin(t * st.s + st.p));
        c.fillStyle = `rgba(255,248,230,${a.toFixed(3)})`;
        c.beginPath();
        c.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        c.fill();
      }
    }
    // thin clouds lit by the sun at dusk and dawn, barely there at night
    const warm = 1 - clamp(daylight(t) < 0.3 ? 1 : 0);
    CLOUDS.forEach(([x, y, w, h], i) => {
      const dx = (t * 9 * (i % 2 ? 1 : -1)) % 200;
      const col = track([[0, '#ffb89a'], [NIGHT0, '#a0607a'], [NIGHT, '#1a2350'], [DAWN0, '#1a2350'], [b(16.5), '#ffb3a0'], [MORN, '#ffffff']], t);
      c.fillStyle = col;
      c.globalAlpha = 0.28 + 0.22 * warm;
      c.beginPath();
      c.ellipse(x + dx, y, w / 2, h / 2, 0, 0, Math.PI * 2);
      c.ellipse(x + dx + w * 0.2, y - h * 0.35, w * 0.28, h * 0.45, 0, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    });
  }
  function glow(c, x, y, r, col, a) {
    if (a <= 0) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a));
    g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  function sunMoon(c, t) {
    // the sun sets on the left over the first beats and rises on the right at dawn
    const set = E.inCubic(prog(t, 0, b(5)));
    if (set < 1) {
      const x = lerp(230, 250, set), y = lerp(1185, 1420, set);
      glow(c, x, y, 420, '#ff9a5e', 0.55 * (1 - set));
      c.fillStyle = '#ffd08a';
      c.beginPath(); c.arc(x, y, 74, 0, Math.PI * 2); c.fill();
    }
    const rise = E.outCubic(prog(t, b(15.4), b(4.5)));
    if (rise > 0) {
      const x = lerp(900, 930, rise), y = lerp(1440, 1165, rise) - prog(t, b(20), b(4)) * 30;
      glow(c, x, y, 520, '#ffc27a', 0.5 * rise);
      c.fillStyle = '#fff1c9';
      c.beginPath(); c.arc(x, y, 78, 0, Math.PI * 2); c.fill();
    }
    // the moon comes up on the right as night falls, fades at dawn
    const m = E.outCubic(prog(t, b(4.4), b(4)));
    const mf = 1 - prog(t, b(15), b(1.8));
    if (m > 0 && mf > 0) {
      const x = lerp(1010, 952, m), y = lerp(1300, 226, m);
      c.globalAlpha = mf;
      glow(c, x, y, 230, '#bcd0ff', 0.28);
      c.fillStyle = '#fff4d8';
      c.beginPath(); c.arc(x, y, 50, 0, Math.PI * 2); c.fill();
      c.fillStyle = track(SKY[0], t);
      c.beginPath(); c.arc(x + 20, y - 14, 46, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }
  }

  function house(c, hs, t) {
    const dl = daylight(t);
    const face = mixc(hs.night, hs.day, dl);
    const roof = mixc('#0f0b16', '#3a2a3a', dl);
    // facade
    c.fillStyle = face;
    c.fillRect(hs.x0, hs.top, hs.x1 - hs.x0, FLOOR - hs.top);
    // brick courses, faint
    c.fillStyle = rgba('#000000', 0.08);
    for (let y = hs.top + 14; y < FLOOR; y += 22) c.fillRect(hs.x0, y, hs.x1 - hs.x0, 3);
    // roof
    c.fillStyle = roof;
    c.beginPath();
    if (hs.peak) {
      c.moveTo(hs.x0 - 26, hs.top + 6); c.lineTo(hs.peak[0], hs.peak[1]); c.lineTo(hs.x1 + 26, hs.top + 6);
    } else {
      c.moveTo(hs.x0 - 10, hs.top + 6); c.lineTo(hs.ridge[0], hs.ridge[2]); c.lineTo(hs.ridge[1], hs.ridge[2]); c.lineTo(hs.x1 + 20, hs.top + 6);
    }
    c.closePath();
    c.fill();
    // warm rim light on the roof edge at dusk and dawn
    const rim = Math.max(1 - prog(t, 0, b(5)), prog(t, b(15.5), b(2.5)) * (1 - prog(t, b(19), b(3))));
    if (rim > 0 && hs.peak) {
      c.strokeStyle = rgba('#ffb27a', 0.55 * rim);
      c.lineWidth = 5;
      c.beginPath(); c.moveTo(hs.x0 - 26, hs.top + 6); c.lineTo(hs.peak[0], hs.peak[1]); c.lineTo(hs.x1 + 26, hs.top + 6); c.stroke();
    }
    if (hs.chimney) {
      const [x, y, w, hh] = hs.chimney;
      c.fillStyle = mixc('#1a1219', '#5a3530', dl);
      c.fillRect(x, y, w, hh);
      c.fillStyle = mixc('#0c0910', '#2c1f26', dl);
      c.fillRect(x - 6, y - 10, w + 12, 12);
    }
  }
  function windowPane(c, w, t) {
    const [x, y, ww, hh] = w;
    const on = lit(w, t);
    const dl = daylight(t);
    c.fillStyle = mixc('#0b0a12', '#2a1f24', dl);
    c.fillRect(x - 7, y - 7, ww + 14, hh + 14);
    const dark = mixc('#0c1230', '#5a7fb0', dl * 0.8);
    c.fillStyle = dark;
    c.fillRect(x, y, ww, hh);
    if (on > 0) {
      glow(c, x + ww / 2, y + hh / 2, Math.max(ww, hh) * 1.3, '#ffbf6a', 0.3 * on * (1 - dl * 0.7));
      const g = c.createLinearGradient(0, y, 0, y + hh);
      g.addColorStop(0, rgba('#ffe2a0', on));
      g.addColorStop(1, rgba('#ffb35c', on));
      c.fillStyle = g;
      c.fillRect(x, y, ww, hh);
    }
    // glazing bars
    c.fillStyle = mixc('#0b0a12', '#2a1f24', dl);
    c.fillRect(x + ww / 2 - 3, y, 6, hh);
    c.fillRect(x, y + hh * 0.42, ww, 5);
    // a soft sky reflection when the pane is dark
    if (on < 1) {
      c.fillStyle = rgba('#ffffff', 0.06 * (1 - on));
      c.beginPath(); c.moveTo(x, y + hh * 0.8); c.lineTo(x + ww * 0.45, y); c.lineTo(x + ww * 0.6, y); c.lineTo(x, y + hh); c.closePath(); c.fill();
    }
  }
  function doors(c, t) {
    const dl = daylight(t);
    c.fillStyle = mixc('#110c12', '#3b2530', dl);
    [[200, 1590, 80, 155], [622, 1568, 86, 177], [962, 1590, 80, 155]].forEach(([x, y, w, h]) => c.fillRect(x, y, w, h));
  }
  function attic(c, t, pulse) {
    const [x, y, r] = ATTIC;
    const dl = daylight(t);
    c.fillStyle = mixc('#0b0a12', '#2a1f24', dl);
    c.beginPath(); c.arc(x, y, r + 7, 0, Math.PI * 2); c.fill();
    const on = Math.max(pulse, clamp(1 - prog(t, b(4.6), 0.12)));
    c.fillStyle = on > 0 ? mixc('#10183a', '#ffd48a', on) : mixc('#0c1230', '#5a7fb0', dl * 0.8);
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    if (on > 0) glow(c, x, y, 120, '#ffc56e', 0.45 * on);
    c.fillStyle = mixc('#0b0a12', '#2a1f24', dl);
    c.fillRect(x - 3, y - r, 6, 2 * r);
    c.fillRect(x - r, y - 3, 2 * r, 6);
  }
  function street(c, t) {
    const dl = daylight(t);
    c.fillStyle = mixc('#1b1922', '#76707c', dl);
    c.fillRect(-60, FLOOR, W + 120, 34);
    c.fillStyle = mixc('#2b2833', '#a49dab', dl);
    c.fillRect(-60, FLOOR + 30, W + 120, 6);
    c.fillStyle = mixc('#101016', '#3f3e48', dl);
    c.fillRect(-60, FLOOR + 36, W + 120, H);
    c.fillStyle = rgba('#ffffff', 0.12 + 0.2 * dl);
    for (let x = -40; x < W; x += 170) c.fillRect(x + ((t * 0) % 170), 1880, 90, 8);
  }
  function lamp(c, t) {
    const on = clamp((t - T.lampOn) / 0.1) * (1 - clamp((t - T.lampOff) / 0.2));
    const flick = t > T.lampOn && t < T.lampOn + 0.25 ? (Math.sin(t * 70) > -0.3 ? 1 : 0.2) : 1;
    const dl = daylight(t);
    c.fillStyle = mixc('#0d0d14', '#2f3140', dl);
    c.fillRect(112, 1410, 12, FLOOR - 1400);
    c.fillRect(112, 1404, 86, 10);
    c.fillRect(180, 1404, 30, 20);
    const a = on * flick;
    if (a > 0) {
      c.fillStyle = rgba('#ffe7b0', a);
      c.fillRect(184, 1422, 22, 6);
      glow(c, 195, 1430, 300, '#ffcf80', 0.32 * a);
      const g = c.createLinearGradient(0, 1428, 0, FLOOR + 40);
      g.addColorStop(0, rgba('#ffd89a', 0.2 * a));
      g.addColorStop(1, rgba('#ffd89a', 0.0));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(186, 1428); c.lineTo(204, 1428); c.lineTo(330, FLOOR + 40); c.lineTo(60, FLOOR + 40); c.closePath(); c.fill();
    }
  }
  function bolt(c, x, y, s, col) { // lightning bolt, the electrician's mark on the van
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x + 0.55 * s, y); c.lineTo(x + 0.1 * s, y + 0.55 * s); c.lineTo(x + 0.42 * s, y + 0.55 * s);
    c.lineTo(x + 0.25 * s, y + s); c.lineTo(x + 0.9 * s, y + 0.38 * s); c.lineTo(x + 0.56 * s, y + 0.38 * s); c.lineTo(x + 0.78 * s, y);
    c.closePath(); c.fill();
  }
  function van(c, t) {
    const dl = daylight(t);
    const body = mixc('#262c44', '#eef1f6', dl), shade = mixc('#1a1f33', '#c9cfdb', dl), glass = mixc('#070a18', '#23344f', dl);
    const Y = 65;
    // ladder on the roof rack
    c.fillStyle = mixc('#1c2033', '#9aa2b4', dl);
    c.fillRect(600, 1573 + Y, 250, 7); c.fillRect(600, 1561 + Y, 250, 7);
    for (let x = 612; x < 850; x += 28) c.fillRect(x, 1561 + Y, 5, 19);
    c.fillRect(640, 1580 + Y, 10, 8); c.fillRect(800, 1580 + Y, 10, 8);
    // body
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(578, 1585 + Y); c.lineTo(862, 1585 + Y); c.quadraticCurveTo(884, 1585 + Y, 898, 1600 + Y); c.lineTo(942, 1650 + Y);
    c.quadraticCurveTo(950, 1660 + Y, 950, 1674 + Y); c.lineTo(950, 1722 + Y); c.quadraticCurveTo(950, 1740 + Y, 932, 1740 + Y);
    c.lineTo(578, 1740 + Y); c.quadraticCurveTo(560, 1740 + Y, 560, 1722 + Y); c.lineTo(560, 1603 + Y); c.quadraticCurveTo(560, 1585 + Y, 578, 1585 + Y);
    c.closePath(); c.fill();
    c.fillStyle = shade;
    c.fillRect(560, 1712 + Y, 390, 28);
    // windscreen + cab window
    c.fillStyle = glass;
    c.beginPath(); c.moveTo(870, 1598 + Y); c.lineTo(893, 1598 + Y); c.lineTo(934, 1650 + Y); c.lineTo(870, 1650 + Y); c.closePath(); c.fill();
    c.beginPath(); c.roundRect(796, 1598 + Y, 62, 52, 8); c.fill();
    // gold stripe with the bolt
    c.fillStyle = mixc('#8a6d2a', K.gold, 0.3 + 0.7 * dl);
    c.fillRect(560, 1672 + Y, 390, 14);
    c.fillStyle = body;
    c.beginPath(); c.arc(662, 1646 + Y, 34, 0, Math.PI * 2); c.fill();
    bolt(c, 640, 1618 + Y, 46, mixc('#8a6d2a', K.gold, 0.3 + 0.7 * dl));
    // lights and wheels
    c.fillStyle = mixc('#4a4030', '#ffe9a8', dl);
    c.fillRect(940, 1692 + Y, 10, 16);
    for (const wx of [652, 862]) {
      c.fillStyle = '#111219';
      c.beginPath(); c.arc(wx, 1742 + Y, 38, 0, Math.PI * 2); c.fill();
      c.fillStyle = mixc('#2a2d3a', '#a2a8b8', dl);
      c.beginPath(); c.arc(wx, 1742 + Y, 15, 0, Math.PI * 2); c.fill();
    }
  }
  function birds(c, t) {
    const f = prog(t, b(16.4), b(3.6));
    if (f <= 0 || f >= 1) return;
    c.strokeStyle = rgba('#2b2a44', 0.85 * (1 - prog(f, 0.8, 0.2)));
    c.lineWidth = 4;
    c.lineCap = 'round';
    [[0, 0], [60, 34], [118, 10]].forEach(([dx, dy], i) => {
      const x = lerp(1160, 600, f) + dx, y = 1140 + dy * 0.6 + Math.sin(t * 3 + i) * 8;
      const flap = Math.sin(t * 16 + i * 1.7) * 12;
      c.beginPath(); c.moveTo(x - 22, y - flap); c.quadraticCurveTo(x - 10, y - 6, x, y); c.quadraticCurveTo(x + 10, y - 6, x + 22, y - flap); c.stroke();
    });
  }

  // ---------------------------------------------------------------- overlay: clock, lines, bookings
  const HM = (s) => { const [h, m] = s.split('.').map(Number); return h * 60 + m; };
  const later = (m, prev) => { while (m < prev) m += 1440; return m; };
  const CLOCK = (() => {
    const keys = [[0, HM('16.59')], [T.tick - 0.14, HM('16.59')], [T.tick + 0.1, HM('17.00'), E.inOutCubic], [T.lapse0, HM('17.00')],
      [T.lapse1, HM('23.47'), (x) => E.inOutSine(x)]];
    let prev = HM('23.47');
    CFG.bookings.forEach(([tm], i) => {
      const m = later(HM(tm), prev);
      keys.push([T.book[i] - 0.3, prev], [T.book[i] - 0.02, m, E.inOutCubic]);
      prev = m;
    });
    const seven = later(HM('07.00'), prev);
    keys.push([T.clock7, prev], [T.clock7 + b(1), seven, E.inOutCubic]);
    return keys;
  })();
  const digitsOf = (m) => { const v = ((Math.round(m) % 1440) + 1440) % 1440; const s = String(Math.floor(v / 60)).padStart(2, '0') + String(v % 60).padStart(2, '0'); return s.split(''); };

  function setFont(c, weight, size) { c.font = `${weight} ${size}px Inter`; }
  // text turns from warm white to ink as the morning sky gets light, and its soft shadow flips from dark to light
  const dayText = (t) => E.inOutSine(prog(t, b(17.2), b(0.6)));
  function textShadow(c, t, blur) {
    const d = dayText(t);
    c.shadowColor = d < 0.5 ? `rgba(0,0,0,${(0.35 * (1 - 2 * d)).toFixed(3)})` : `rgba(255,255,255,${(0.5 * (2 * d - 1)).toFixed(3)})`;
    c.shadowBlur = blur;
  }

  function clock(c, t, alpha) {
    if (alpha <= 0) return;
    const m = kf(t, CLOCK);
    const m0 = Math.floor(m), f = m - m0;
    const d0 = digitsOf(m0), d1 = digitsOf(m0 + 1);
    setFont(c, 200, 250);
    c.textBaseline = 'alphabetic';
    c.textAlign = 'center';
    const cw = 150, dotw = 62, capH = 182, gap = 60, base = 540;
    const x0 = W / 2 - (4 * cw + dotw) / 2;
    const xs = [x0 + cw / 2, x0 + cw * 1.5, x0 + 2 * cw + dotw + cw / 2, x0 + 3 * cw + dotw + cw / 2];
    c.save();
    c.globalAlpha = alpha;
    textShadow(c, t, 30);
    c.fillStyle = mixc(K.warm, K.ink, dayText(t));
    for (let k = 0; k < 4; k++) {
      c.save();
      c.beginPath(); c.rect(xs[k] - cw / 2, base - capH - 30, cw, capH + 56); c.clip();
      const roll = d0[k] !== d1[k] ? f : 0;
      c.fillText(d0[k], xs[k], base - roll * (capH + gap));
      if (roll > 0) c.fillText(d1[k], xs[k], base + (1 - roll) * (capH + gap));
      c.restore();
    }
    // the dot between hours and minutes pulses with the beat
    const pulse = 0.55 + 0.45 * Math.cos(((t / B) % 1) * Math.PI * 2);
    c.globalAlpha = alpha * pulse;
    c.fillText('.', x0 + 2 * cw + dotw / 2, base);
    c.restore();
  }
  // a line of text that rises out of a mask; fades out at `out`
  function line(c, str, x, y, t, t0, o = {}) {
    const inn = E.outCubic(clamp((t - t0) / (o.dur || 0.45)));
    const out = o.out ? 1 - E.inCubic(clamp((t - o.out) / 0.35)) : 1;
    if (inn <= 0 || out <= 0) return;
    setFont(c, o.weight || 500, o.size || 72);
    c.textAlign = o.align || 'center';
    c.textBaseline = 'alphabetic';
    c.save();
    c.globalAlpha = inn * out;
    const size = o.size || 72;
    c.beginPath(); c.rect(0, y - size * 1.05, W, size * 1.4); c.clip();
    c.fillStyle = o.color ? o.color(t) : mixc(K.warm, K.ink, dayText(t));
    textShadow(c, t, 24);
    c.fillText(str, x, y + (1 - inn) * size * 0.9);
    c.restore();
  }
  const LIST_X = 160, LIST_Y = 840, LIST_DY = 76;
  function bookings(c, t) {
    const out = 1 - E.inCubic(clamp((t - (T.card - 0.25)) / 0.4));
    if (out <= 0) return;
    CFG.bookings.forEach(([tm, what], i) => {
      const t0 = T.book[i];
      if (t < t0) return;
      const y = LIST_Y + i * LIST_DY;
      const f = E.outCubic(clamp((t - t0) / 0.5));
      c.save();
      c.globalAlpha = out;
      // the arrival dot flashes, then turns into a tick in the morning
      const chk = clamp((t - (T.checks + i * b(0.25))) / 0.3);
      if (chk <= 0) {
        glow(c, LIST_X - 44, y - 14, 46, '#ffd166', 0.6 * (1 - clamp((t - t0) / 0.8)) + 0.25);
        c.fillStyle = K.gold;
        c.beginPath(); c.arc(LIST_X - 44, y - 14, 8 * E.outBack(clamp((t - t0) / 0.3)), 0, Math.PI * 2); c.fill();
      } else {
        c.strokeStyle = mixc(K.green, '#1f9d63', dayText(t));
        c.lineWidth = 7;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        const p = E.outCubic(chk);
        c.beginPath();
        const pts = [[LIST_X - 58, y - 16], [LIST_X - 47, y - 5], [LIST_X - 26, y - 30]];
        c.moveTo(pts[0][0], pts[0][1]);
        const l1 = clamp(p * 2), l2 = clamp(p * 2 - 1);
        c.lineTo(lerp(pts[0][0], pts[1][0], l1), lerp(pts[0][1], pts[1][1], l1));
        if (l2 > 0) c.lineTo(lerp(pts[1][0], pts[2][0], l2), lerp(pts[1][1], pts[2][1], l2));
        c.stroke();
      }
      // time + text wipe in from the left
      c.beginPath(); c.rect(LIST_X - 10, y - 50, (W - LIST_X) * f + 10, 70); c.clip();
      setFont(c, 500, 46);
      c.textAlign = 'left';
      c.fillStyle = mixc(K.gold, '#b86e00', dayText(t));
      textShadow(c, t, 18);
      let x = LIST_X + (1 - f) * -20;
      for (const ch of tm) { // fixed-width digits, so the times line up
        const w = ch === '.' ? 13 : 28;
        c.fillText(ch, x + (w - c.measureText(ch).width) / 2, y);
        x += w;
      }
      setFont(c, 400, 46);
      c.fillStyle = mixc(K.warm, K.ink, dayText(t));
      c.fillText(what, x + 30, y);
      c.restore();
    });
  }
  // a drop of light falls from each new booking into the sleeping house; a ring spreads where it lands
  function deliveries(c, t) {
    CFG.bookings.forEach((_, i) => {
      const t0 = T.book[i] + 0.12, t1 = t0 + 0.62;
      const y0 = LIST_Y + i * LIST_DY - 14, x0 = LIST_X - 44;
      const path = (u) => {
        const cx = lerp(x0, HOME[0], 0.2) - 60, cy = lerp(y0, HOME[1], 0.75);
        return [(1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * HOME[0], (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * HOME[1]];
      };
      if (t > t0 && t < t1) {
        const u = E.inQuad((t - t0) / (t1 - t0));
        for (let k = 10; k >= 0; k--) {
          const uu = Math.max(0, u - k * 0.03);
          const [px, py] = path(uu);
          c.fillStyle = rgba('#ffe3a0', (1 - k / 11) * 0.8);
          c.beginPath(); c.arc(px, py, 9 * (1 - k / 12), 0, Math.PI * 2); c.fill();
        }
        const [px, py] = path(u);
        glow(c, px, py, 60, '#ffd98a', 0.6);
      }
      const tau = t - t1;
      if (tau > 0 && tau < 1.1) {
        const r = 40 + 360 * E.outCubic(tau / 1.1);
        c.strokeStyle = rgba('#ffdca0', 0.55 * (1 - tau / 1.1));
        c.lineWidth = 4;
        c.beginPath(); c.ellipse(HOME[0], HOME[1] + 60, r, r * 0.42, 0, 0, Math.PI * 2); c.stroke();
      }
    });
  }
  const atticPulse = (t) => Math.max(0, ...T.book.map((t0) => { const tau = t - (t0 + 0.74); return tau > 0 ? Math.exp(-tau * 2.2) * clamp(tau / 0.08) : 0; }));

  // ---------------------------------------------------------------- end card: frosted glass
  function roofMark(c, x, y, s, col) {
    c.strokeStyle = col;
    c.lineWidth = s * 0.11;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath(); c.moveTo(x - s * 0.62, y + s * 0.42); c.lineTo(x, y - s * 0.12); c.lineTo(x + s * 0.62, y + s * 0.42); c.stroke();
    c.fillStyle = col;
    const q = s * 0.13, g = s * 0.05;
    [[-1, 0], [0, 0], [-1, 1], [0, 1]].forEach(([i, j]) => c.fillRect(x + i * (q + g) + (i < 0 ? -g / 2 : g / 2), y + s * 0.22 + j * (q + g), q, q));
  }
  function card(c, t) {
    if (t < T.card) return;
    const s = spring(t - T.card, 1.6, 0.72);
    const x = 90, w = 900, h = 700, y = lerp(1950, 500, s);
    // frosted backdrop: the scene, shrunk and blown up again, inside the rounded card
    smc.imageSmoothingEnabled = true;
    smc.filter = 'blur(1.5px)';
    smc.drawImage(scene, 0, 0, W, H, 0, 0, W / 8, H / 8);
    smc.filter = 'none';
    c.save();
    c.beginPath(); c.roundRect(x, y, w, h, 56); c.clip();
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(small, 0, 0, W / 8, H / 8, 0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.72)';
    c.fillRect(x, y, w, h);
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 2;
    c.beginPath(); c.roundRect(x + 1, y + 1, w - 2, h - 2, 55); c.stroke();
    const cx = W / 2;
    const at = (t0) => E.outCubic(clamp((t - t0) / 0.5));
    const a1 = at(T.logo), a2 = at(T.word), a3 = at(T.tag), a4 = at(T.cta);
    c.save();
    c.globalAlpha = a1;
    roofMark(c, cx, y + 118 - (1 - a1) * 20, 120, K.ink);
    c.globalAlpha = a2;
    setFont(c, 650, 128);
    c.textAlign = 'center';
    c.fillStyle = K.ink;
    c.letterSpacing = '-4px';
    c.fillText(CFG.brand.name, cx, y + 340 - (1 - a2) * 24);
    c.letterSpacing = '0px';
    c.globalAlpha = a3;
    setFont(c, 450, 46);
    c.fillStyle = rgba(K.ink, 0.78);
    CFG.brand.tagline.forEach((ln, i) => c.fillText(ln, cx, y + 430 + i * 60 - (1 - a3) * 16));
    // CTA pill with a light sweep
    if (a4 > 0) {
      const pw = 560, ph = 108, px = cx - pw / 2, py = y + 540 + (1 - a4) * 20;
      c.globalAlpha = a4;
      c.fillStyle = K.ink;
      c.beginPath(); c.roundRect(px, py, pw, ph, ph / 2); c.fill();
      const sweep = ((t - T.cta - 0.5) % b(4)) / 0.9;
      if (sweep > 0 && sweep < 1 && t > T.cta + 0.5) {
        c.save();
        c.beginPath(); c.roundRect(px, py, pw, ph, ph / 2); c.clip();
        const sx = lerp(px - 200, px + pw + 200, E.inOutSine(sweep));
        const g = c.createLinearGradient(sx - 120, 0, sx + 120, 0);
        g.addColorStop(0, 'rgba(255,209,102,0)'); g.addColorStop(0.5, 'rgba(255,209,102,0.35)'); g.addColorStop(1, 'rgba(255,209,102,0)');
        c.fillStyle = g;
        c.fillRect(px, py, pw, ph);
        c.restore();
      }
      setFont(c, 600, 44);
      c.fillStyle = '#ffffff';
      c.fillText(CFG.brand.cta, cx - 18, py + ph / 2 + 15);
      c.strokeStyle = K.gold;
      c.lineWidth = 6;
      c.lineCap = 'round';
      const ax = cx + c.measureText(CFG.brand.cta).width / 2 + 10, ay = py + ph / 2, nudge = Math.sin(t * Math.PI * 2 / B) * 4;
      c.beginPath(); c.moveTo(ax + nudge, ay); c.lineTo(ax + 30 + nudge, ay); c.moveTo(ax + 18 + nudge, ay - 12); c.lineTo(ax + 30 + nudge, ay); c.lineTo(ax + 18 + nudge, ay + 12); c.stroke();
    }
    c.restore();
  }

  // ---------------------------------------------------------------- one frame
  function drawScene(c, t) {
    c.save();
    // slow push-in towards the house over the whole film
    const s = 1 + 0.06 * E.inOutSine(t / DUR);
    c.translate(W / 2, 1480);
    c.scale(s, s);
    c.translate(-W / 2, -1480);
    sky(c, t);
    sunMoon(c, t);
    birds(c, t);
    HOUSES.forEach((hs) => house(c, hs, t));
    WINDOWS.forEach((w) => windowPane(c, w, t));
    doors(c, t);
    attic(c, t, atticPulse(t));
    street(c, t);
    lamp(c, t);
    van(c, t);
    c.restore();
  }
  function frame(t) {
    drawScene(sc, t);
    ctx.drawImage(scene, 0, 0);
    // a gentle vignette keeps the eye in the middle
    const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.45, H * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${(0.35 * (1 - daylight(t) * 0.6)).toFixed(3)})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);

    const textOut = 1 - E.inCubic(clamp((t - (T.card - 0.25)) / 0.4));
    clock(ctx, t, textOut);
    line(ctx, CFG.off, W / 2, 670, t, T.off, { out: T.offOut });
    line(ctx, CFG.asleep, W / 2, 670, t, T.asleep, { out: T.dawn });
    line(ctx, CFG.site, W / 2, 752, t, T.site, { out: T.dawn });
    const [m1, m2] = CFG.morning.map((s) => s.replace('{n}', NB));
    line(ctx, m1, W / 2, 670, t, T.morning, { out: T.card - 0.25 });
    line(ctx, m2, W / 2, 752, t, T.morning2, { out: T.card - 0.25, color: (tt) => mixc(K.gold, '#b86e00', dayText(tt)) });
    deliveries(ctx, t);
    bookings(ctx, t);
    card(ctx, t);
  }

  // ---------------------------------------------------------------- sound cues for tools/make_audio.py
  function cues() {
    const out = [];
    const add = (t, type, extra = {}) => out.push(Object.assign({ t: +t.toFixed(4), type }, extra));
    add(T.tick, 'tick');
    add(T.lapse0, 'lapse', { until: T.lapse1 });
    add(T.lampOn, 'lamp');
    WINDOWS.forEach((w) => w.slice(4).forEach(([on, off]) => { if (off < 99 && b(off) < T.dawn) add(b(off), 'switch'); if (on > 0) add(b(on), 'switch'); }));
    T.book.forEach((t0, i) => { add(t0 - 0.3, 'roll'); add(t0, 'booking', { i }); add(t0 + 0.74, 'deliver', { i }); });
    add(T.clock7, 'roll');
    add(T.dawn, 'dawn');
    add(b(16.4), 'birds');
    CFG.bookings.forEach((_, i) => add(T.checks + i * b(0.25), 'check', { i }));
    add(T.card, 'card');
    add(T.cta, 'cta');
    return out.sort((x, y) => x.t - y.t);
  }

  // ---------------------------------------------------------------- main
  const stage = document.getElementById('stage');
  const q = new URLSearchParams(location.search);
  const seek = (t) => frame(clamp(t, 0, DUR - 1e-6));
  // the fastest moves get extra motion-blur samples: the clock spinning through the evening, the drops of light
  const BLUR = [[T.lapse0, T.lapse1], ...T.book.map((t0) => [t0 - 0.32, t0 + 0.8]), [T.clock7, T.clock7 + b(1)], [T.card, T.card + 0.5]];
  window.__meta = { W, H, DUR, BPM: 96, format: 'portrait', blur: BLUR, poster: b(22), cues: cues() };
  window.__seek = seek;
  window.__ready = Promise.all([document.fonts.load('200 100px Inter'), document.fonts.load('500 40px Inter'), document.fonts.load('650 40px Inter')])
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
