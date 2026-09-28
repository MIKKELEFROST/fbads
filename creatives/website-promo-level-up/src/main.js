/*
 * "Næste level" — a 15 s pixel-art game ad for a company that builds websites for tradespeople.
 * Every frame is a pure function of time: __seek(t) redraws the 135x240 frame buffer for time t.
 * Beat grid: 144 BPM → b(n) is the time of beat n (36 beats = 15 s). All copy comes from config.js.
 *
 *   0.0  title      NÆSTE LEVEL — er dit firma klar? ▶ TRYK START                (beats 0-4)
 *   1.7  stuck      the hero keeps bumping his hard hat on the slab INGEN HJEMMESIDE (beats 4-12)
 *   5.0  power-up   a new website flies in → LEVEL UP → he smashes through the slab  (beats 12-20)
 *   8.3  the climb  four platforms (fast, mobile, booking, 5 stars), customers collected (beats 20-28)
 *  11.7  cleared    fireworks on the top, then the end card with the CTA              (beats 28-36)
 */
(function () {
  'use strict';
  const { clamp, lerp, prog, E, spring, kf, rng } = A;
  const { VW, VH, hexRgb, rect, drect, pset, text, measure, sprite, gradient, disc, iris, offset, flush } = PX;
  const CFG = window.CONFIG;
  const K = CFG.colors;
  const W = 1080, H = 1920;
  const B = 60 / 144;
  const b = (n) => n * B;
  const DUR = b(36);
  const beatOf = (t) => t / B;

  const P = {
    ink: K.ink, white: '#ffffff', paper: '#e8eef7', label: '#9fb4ff',
    navy: '#1b2150', navyHi: '#3a4488', panel: '#161b44',
    brand: K.brand, brandDark: '#c24a0c', gold: K.gold, goldDark: '#e09a16', goldHi: '#fff3b0', glow: K.glow,
    skin: '#f2b48c', skinDark: '#cf8a62', hair: '#4a2f22', pants: '#2d4fa8', pantsDark: '#1d346f', boots: '#5a3b2a',
    brick: ['#a8443a', '#b24c40', '#973c33'], brickHi: '#cc6150', mortar: '#4f201c',
    wall: '#2b2442', wall2: '#221c36', floor: '#6b5a4a', floorHi: '#8f7a62', soil: '#3a2a2c', soil2: '#2a1e21', stone: '#5c4b4e',
    steel: '#d24b2c', steelDark: '#8f2d18', steelHi: '#ff8a5c', rivet: '#ffd6bd',
    pole: '#2f3758', green: '#3ec46d', red: '#e8413c', grey: '#8a90a8', greyDark: '#3a4060',
  };
  const HERO_PAL = {
    normal: { outline: P.ink, hat: P.gold, hatDark: P.goldDark, hatHi: P.goldHi, skin: P.skin, skinDark: P.skinDark, hair: P.hair, vest: P.brand, vestDark: P.brandDark, stripe: P.paper, pants: P.pants, boots: P.boots, eye: P.ink },
    flash: { outline: P.white, hat: P.white, hatDark: P.glow, hatHi: P.white, skin: P.goldHi, skinDark: P.gold, hair: P.gold, vest: P.glow, vestDark: '#2fb5aa', stripe: P.white, pants: P.white, boots: P.glow, eye: P.ink },
  };

  // ---------------------------------------------------------------- timeline (seconds)
  const T = {
    start: b(3.5), game: b(4),
    goal: b(4.25), jump1: b(5.5), bonk1: b(6), land1: b(6.5), stuck: b(6.6), jump2: b(7.5), bonk2: b(8), land2: b(8.5),
    item: b(12), powerTxt: b(12.25), itemStop: b(13), rise: b(13), crouch: b(13.75), hop: b(14), grab: b(14.5), grabLand: b(15),
    levelUp: b(16), walkEnd: b(17), launch: b(18), smash: b(18.15), apex: b(19.3),
    summit: b(28), irisOut: b(29.5), card: b(30.25), logo: b(30.4), word: b(30.6), tag: b(31.25), cta: b(32),
  };
  const CPS = 40; // typewriter speed, characters per second

  // ---------------------------------------------------------------- the level (altitudes in pixels above the ground floor)
  const GY = 160;            // screen row of the floor while the camera is at the bottom
  const CEIL = [48, 64];     // the slab "INGEN HJEMMESIDE": underside and top
  const HOME = 40;           // where the hero starts
  const PLAT = CFG.features.map((label, i) => ({ label, i, x: i % 2 ? 95 : 40, alt: 100 + 50 * i, land: b(20 + 2 * i) }));
  const SUMMIT = { x: 67, alt: 305, land: T.summit, w: 76 };
  const ITEM = { x: 66, alt: 42 };
  const CAM = [[b(18.12), 0], [T.apex, 98, E.outCubic], [PLAT[0].land, 88, E.inOutSine], [PLAT[1].land, 138, E.inOutSine],
    [PLAT[2].land, 188, E.inOutSine], [PLAT[3].land, 238, E.inOutSine], [SUMMIT.land, 293, E.inOutSine]];
  const camAlt = (t) => kf(t, CAM);
  const sy = (alt, cam) => GY - (alt - cam);

  // parabolic hop from (x0,a0) at t0 to (x1,a1) at t1, peaking hh above the higher end
  function arc(t, t0, t1, x0, a0, x1, a1, hh) {
    const u = clamp((t - t0) / (t1 - t0));
    const k = 4 * (Math.max(a0, a1) + hh - (a0 + a1) / 2);
    return { x: lerp(x0, x1, u), alt: lerp(a0, a1, u) + k * u * (1 - u), u };
  }
  // hard hat against the slab: up, bonk, down
  function bump(t, t0, tc, t1) {
    const peak = CEIL[0] - 20;
    if (t < tc) return { alt: peak * E.outQuad(prog(t, t0, tc - t0)), legs: 'tuck', arms: 'up' };
    const f = prog(t, tc, t1 - tc);
    return { alt: peak * (1 - E.inQuad(f)), legs: 'tuck', arms: f < 0.3 ? 'out' : 'up', eye: 'shut' };
  }
  const idleBob = (t) => (Math.floor(beatOf(t)) % 2 ? 1 : 0);

  // where the hero is and how he stands at time t
  function heroAt(t) {
    const base = { x: HOME, alt: 0, legs: 'stand', arms: 'down', dir: 1, eye: 'open', bob: 0 };
    const at = (o) => Object.assign({}, base, o);
    if (t < T.jump1) return at({ bob: idleBob(t) });
    if (t < T.land1) return at(bump(t, T.jump1, T.bonk1, T.land1));
    if (t < T.jump2) return at({ eye: t < T.land1 + 0.5 ? 'shut' : 'open', legs: t < T.land1 + 0.07 ? 'crouch' : 'stand' });
    if (t < T.land2) return at(bump(t, T.jump2, T.bonk2, T.land2));
    if (t < T.rise) return at({ legs: 'sit', eye: t < b(11.5) ? 'shut' : 'open', arms: 'down' });
    if (t < T.crouch) return at({ bob: idleBob(t) });
    if (t < T.hop) return at({ legs: 'crouch' });
    if (t < T.grabLand) {
      const a = arc(t, T.hop, T.grabLand, HOME, 0, 92, 0, 22);
      return at({ x: a.x, alt: a.alt, legs: 'tuck', arms: 'up', powered: t >= T.grab });
    }
    if (t < T.levelUp) return at({ x: 92, arms: 'up', legs: t < T.grabLand + 0.07 ? 'crouch' : 'stand', powered: true, eye: 'happy' });
    if (t < T.walkEnd) {
      const f = prog(t, T.levelUp, T.walkEnd - T.levelUp - 0.08);
      return at({ x: lerp(92, 67, E.inOutSine(f)), dir: -1, legs: f < 1 ? (Math.floor(t / 0.09) % 2 ? 'walkA' : 'walkB') : 'stand', powered: true });
    }
    if (t < T.launch) return at({ x: 67, legs: 'crouch', powered: true, charge: prog(t, T.walkEnd, B) });
    if (t < PLAT[0].land) {
      const alt = kf(t, [[T.launch, 0], [T.smash, CEIL[0] - 20, E.linear], [T.apex, 125, E.outCubic], [PLAT[0].land, PLAT[0].alt, E.inQuad]]);
      const x = kf(t, [[T.launch, 67], [T.apex, 50, E.inOutSine], [PLAT[0].land, PLAT[0].x, E.outSine]]);
      return at({ x, alt, legs: 'tuck', arms: t < T.apex ? 'up' : 'down', powered: true, dir: -1 });
    }
    for (let i = 0; i < PLAT.length; i++) {
      const p = PLAT[i], next = PLAT[i + 1] || SUMMIT;
      if (t < p.land + B) return at({ x: p.x, alt: p.alt, legs: t < p.land + 0.07 ? 'crouch' : 'stand', powered: true, dir: next.x > p.x ? 1 : -1, eye: 'happy' });
      if (t < next.land) {
        const a = arc(t, p.land + B, next.land, p.x, p.alt, next.x, next.alt, 18);
        return at({ x: a.x, alt: a.alt, legs: 'tuck', arms: 'up', powered: true, dir: next.x > p.x ? 1 : -1 });
      }
    }
    // on top: little victory hops on every beat
    const f = beatOf(t) % 1;
    const hop = t > SUMMIT.land + 0.1 ? 5 * Math.sin(Math.PI * f) : 0;
    return at({ x: SUMMIT.x, alt: SUMMIT.alt + hop, arms: 'up', legs: hop > 1 ? 'tuck' : 'stand', powered: true, eye: 'happy' });
  }

  // customers to collect: a trail along the super jump and every hop, so the hero passes right through them
  const TOKENS = [];
  const tokenOn = (tt) => { const h = heroAt(tt); return { t: tt, x: Math.round(h.x), alt: Math.round(h.alt) + 11 }; };
  [18.45, 18.7, 18.95].forEach((bt) => TOKENS.push(tokenOn(b(bt))));
  PLAT.forEach((p, i) => {
    const t0 = p.land + B, t1 = (PLAT[i + 1] || SUMMIT).land;
    [0.15, 0.32, 0.5, 0.68, 0.85].forEach((f) => TOKENS.push(tokenOn(lerp(t0, t1, f))));
  });
  const collected = (t) => TOKENS.filter((k) => t >= k.t).length;

  // ---------------------------------------------------------------- sprites (drawn for this ad)
  const ICONS = [
    ['....yyy..', '...yyy...', '..yyy....', '.yyyyyy..', '...yyy...', '..yyy....', '.yyy.....', '.yy......', '.y.......'],
    ['.ggggg.', 'gbbbbbg', 'gbwwwbg', 'gbbbbbg', 'gbwwbbg', 'gbbbbbg', 'gbbbbbg', 'gggwggg', '.ggggg.'],
    ['.k.....k.', 'rrrrrrrrr', 'rrrrrrrrr', 'wwwwwwwww', 'wkwkwkwkw', 'wwwwwwwww', 'wkwkwGGGw', 'wwwwwGGGw', 'wwwwwwwww'],
    ['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.', '.y...y.'],
  ];
  const ICON_PAL = { y: P.gold, g: '#c8cde0', b: '#4a8cff', w: P.white, k: P.ink, r: P.red, G: P.green };
  const HOUSE = ['...r...', '..rrr..', '.rrrrr.', 'rrrrrrr', '.wwwww.', '.ww#ww.', '.ww#ww.'];
  const HOUSE_PAL = { r: P.brand, w: P.white, '#': P.boots };
  const SITE = ['ooooooooooooo', 'owwwwwwwwwwwo', 'owbbbbwwwwwwo', 'owwwwwwwwwwwo', 'owggggggwwwwo', 'owggggwwwwwwo', 'owwwwwwGGGGwo', 'owwwwwwwwwwwo', 'ooooooooooooo'];
  const SITE_PAL = { o: P.brand, w: P.white, b: P.pants, g: '#b8bfd6', G: P.green };
  const CLOUDS = [
    ['.......wwww.............', '.....wwwwwwww...........', '..wwwwwwwwwwwwww..www...', '.wwwwwwwwwwwwwwwwwwwwww.', 'wwwwwwwwwwwwwwwwwwwwwwww', 'ssssssssssssssssssssssss', '.ssssssssssssssssssssss.'],
    ['....wwww........', '..wwwwwwww.www..', '.wwwwwwwwwwwwww.', 'wwwwwwwwwwwwwwww', 'ssssssssssssssss', '.ssssssssssssss.'],
  ];

  // ---------------------------------------------------------------- the hero, built from outlined rectangles
  function heroParts(h) {
    const parts = [];
    const add = (x, y, w, hh, c) => parts.push([x, y, w, hh, c]);
    const sit = h.legs === 'sit', crouch = h.legs === 'crouch';
    const u = (sit ? 4 : crouch ? 2 : 0) + (h.bob || 0);
    if (sit) { add(-3, -4, 6, 3, 'pants'); add(3, -5, 3, 4, 'boots'); }
    else if (h.legs === 'tuck') { add(-4, -7, 3, 3, 'pants'); add(1, -8, 3, 3, 'pants'); add(-5, -5, 4, 2, 'boots'); add(1, -6, 4, 2, 'boots'); }
    else if (crouch) { add(-4, -4, 3, 2, 'pants'); add(1, -4, 3, 2, 'pants'); add(-5, -2, 4, 2, 'boots'); add(1, -2, 4, 2, 'boots'); }
    else {
      const s = h.legs === 'walkA' ? 1 : h.legs === 'walkB' ? -1 : 0;
      add(-4 - s, -6, 3, 4, 'pants'); add(1 + s, -6, 3, 4, 'pants'); add(-5 - s, -2, 4, 2, 'boots'); add(1 + s, -2, 4, 2, 'boots');
    }
    add(-4, -12 + u, 8, 6, 'vest'); add(-4, -9 + u, 8, 1, 'stripe');
    if (h.arms === 'up') { add(-6, -18 + u, 2, 6, 'vestDark'); add(-6, -20 + u, 2, 2, 'skinDark'); add(4, -18 + u, 2, 6, 'vest'); add(4, -20 + u, 2, 2, 'skin'); }
    else if (h.arms === 'out') { add(-7, -12 + u, 3, 2, 'vestDark'); add(-8, -12 + u, 1, 2, 'skinDark'); add(4, -12 + u, 3, 2, 'vest'); add(7, -12 + u, 1, 2, 'skin'); }
    else { add(-6, -12 + u, 2, 5, 'vestDark'); add(-6, -7 + u, 2, 2, 'skinDark'); add(4, -12 + u, 2, 5, 'vest'); add(4, -7 + u, 2, 2, 'skin'); }
    add(-3, -17 + u, 7, 5, 'skin'); add(-3, -16 + u, 2, 3, 'hair');
    if (h.eye === 'shut') add(1, -15 + u, 2, 1, 'eye');
    else if (h.eye === 'happy') { add(1, -15 + u, 1, 1, 'eye'); add(2, -16 + u, 1, 1, 'eye'); add(3, -15 + u, 1, 1, 'eye'); }
    else { add(2, -15 + u, 1, 2, 'eye'); add(2, -13 + u, 2, 1, 'skinDark'); }
    add(-4, -20 + u, 8, 3, 'hat'); add(-5, -17 + u, 10, 1, 'hatDark'); add(-2, -20 + u, 2, 1, 'hatHi');
    return parts;
  }
  function drawHero(h, x, y, t) {
    const pal = h.flash ? HERO_PAL.flash : HERO_PAL.normal;
    const parts = heroParts(h).map(([px, py, w, hh, c]) => [h.dir < 0 ? -px - w : px, py, w, hh, c]);
    x = Math.round(x); y = Math.round(y);
    if (h.powered) { // soft two-pixel glow that breathes with the beat
      const g = 0.35 + 0.25 * Math.sin(t * Math.PI * 2 / B) + (h.charge || 0) * 0.4;
      for (const [px, py, w, hh] of parts) drect(x + px - 2, y + py - 2, w + 4, hh + 4, P.glow, g);
    }
    const outline = h.powered && !h.flash ? (Math.floor(t * 8) % 2 ? P.glow : P.white) : pal.outline;
    for (const [px, py, w, hh] of parts) rect(x + px - 1, y + py - 1, w + 2, hh + 2, outline);
    for (const [px, py, w, hh, c] of parts) rect(x + px, y + py, w, hh, pal[c]);
  }

  // ---------------------------------------------------------------- world pieces
  const R = rng(1234);
  const STARS = Array.from({ length: 90 }, () => ({ x: Math.floor(R() * VW), y: Math.floor(R() * VH), k: R(), tw: R() }));
  const skyTop = (t) => mixRgb(['#070a24', '#070a24', '#2a2366', '#3f8ee8', '#3f8ee8'], [0, T.launch, b(23), b(27.5), DUR], t);
  const skyBot = (t) => mixRgb(['#1d2466', '#1d2466', '#ff8a5c', '#bfe6ff', '#bfe6ff'], [0, T.launch, b(23), b(27.5), DUR], t);
  const nightness = (t) => 1 - prog(t, b(20), b(6));
  function mixRgb(cols, times, t) {
    let i = 0;
    while (i < times.length - 2 && t > times[i + 1]) i++;
    const f = E.inOutSine(clamp((t - times[i]) / Math.max(1e-6, times[i + 1] - times[i])));
    const a = hexRgb(cols[i]), c = hexRgb(cols[i + 1]);
    return a.map((v, k) => lerp(v, c[k], f));
  }
  function sky(t, cam) {
    const top = skyTop(t), bot = skyBot(t);
    gradient(0, VH, (y) => top.map((v, k) => lerp(v, bot[k], Math.pow(y / VH, 1.2))));
    const n = nightness(t);
    for (const s of STARS) {
      if (s.k > n) continue;
      const y = Math.round(s.y + cam * 0.12) % VH;
      const on = s.tw < 0.3 ? Math.sin(t * 5 + s.tw * 40) > -0.2 : true;
      if (!on) continue;
      if (s.k < 0.12 && n > 0.6) { pset(s.x, y, '#8fa3ff'); pset(s.x - 1, y, '#3a4488'); pset(s.x + 1, y, '#3a4488'); pset(s.x, y - 1, '#3a4488'); pset(s.x, y + 1, '#3a4488'); }
      else pset(s.x, y, s.k < 0.5 ? '#ffffff' : '#8fa3ff');
    }
    // moon at night, the sun comes up while he climbs
    const my = 26 + cam * 0.05;
    if (n > 0.05) { disc(110, my, 7, '#fff3c4'); disc(113, my - 2, 6, skyTopHex(t)); }
    const sun = prog(t, b(22), b(6));
    if (sun > 0) {
      const sy0 = lerp(90, 34, E.outCubic(sun));
      disc(104, sy0, 13, '#ffd27a'); drect(90, sy0 - 14, 29, 29, '#ffe6a8', 0.35);
      disc(104, sy0, 10, '#fff1c1');
    }
  }
  const skyTopHex = (t) => '#' + skyTop(t).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  function clouds(t, cam) {
    const n = nightness(t);
    const light = n > 0.5 ? '#3a4274' : '#ffffff', shade = n > 0.5 ? '#2a3160' : '#cfe3ff';
    [[8, 110, 0], [80, 170, 1], [20, 235, 0], [92, 290, 1], [4, 340, 1], [70, 380, 0]].forEach(([x, alt, k]) => {
      const y = GY - (alt - cam * 0.7);
      const drift = Math.round((t * 3 + x) % 150) - 12;
      if (y > -10 && y < VH) sprite(CLOUDS[k], { w: light, s: shade }, drift, y);
    });
  }

  function scaffold(cam) {
    const y0 = Math.round(sy(SUMMIT.alt + 4, cam)), y1 = Math.round(sy(CEIL[1], cam));
    for (const x of [6, 127]) rect(x, y0, 2, y1 - y0, P.pole);
    for (let a = CEIL[1]; a < SUMMIT.alt; a += 50) {
      const ya = Math.round(sy(a, cam)), yb = Math.round(sy(a + 50, cam));
      for (let k = 0; k <= 40; k++) { // two thin braces crossing between the poles
        const f = k / 40;
        pset(Math.round(lerp(8, 126, f)), Math.round(lerp(ya, yb, f)), P.pole);
        pset(Math.round(lerp(126, 8, f)), Math.round(lerp(ya, yb, f)), P.pole);
      }
    }
  }

  function groundFloor(t, cam) {
    const floor = Math.round(sy(0, cam)), ceil = Math.round(sy(CEIL[0], cam));
    if (ceil > VH) return;
    // back wall of the workshop
    rect(0, ceil, VW, floor - ceil, P.wall);
    for (let y = ceil, r = 0; y < floor; y += 5, r++) {
      rect(0, y, VW, 1, P.wall2);
      for (let x = (r % 2) * 6; x < VW; x += 12) rect(x, y, 1, 5, P.wall2);
    }
    // window with the night outside
    rect(102, ceil + 10, 22, 20, P.ink); rect(103, ceil + 11, 20, 18, '#101640');
    pset(107, ceil + 14, '#ffffff'); pset(118, ceil + 20, '#8fa3ff'); pset(111, ceil + 25, '#8fa3ff');
    rect(112, ceil + 11, 2, 18, P.greyDark); rect(103, ceil + 19, 20, 2, P.greyDark);
    // workbench + toolbox
    rect(8, floor - 12, 24, 3, P.floorHi); rect(9, floor - 9, 2, 9, P.floor); rect(29, floor - 9, 2, 9, P.floor);
    rect(12, floor - 18, 12, 6, P.red); rect(15, floor - 20, 6, 2, P.ink); rect(12, floor - 16, 12, 1, '#b02f2b');
    // floor, then the ground underneath (pipes and a cable run through it)
    rect(0, floor, VW, 2, P.floorHi); rect(0, floor + 2, VW, 2, P.floor);
    rect(0, floor + 4, VW, VH, P.soil);
    const Rs = rng(99);
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(Rs() * VW), y = floor + 10 + Math.floor(Rs() * 90), w = 3 + Math.floor(Rs() * 5);
      rect(x, y, w, 2, i % 3 ? P.soil2 : P.stone);
    }
    rect(0, floor + 24, VW, 3, '#6d7489'); rect(0, floor + 24, VW, 1, '#9aa1b5');
    rect(0, floor + 40, VW, 1, P.gold);
  }

  function slab(t, cam) {
    if (t >= T.smash) return;
    const top = Math.round(sy(CEIL[1], cam));
    let shake = 0;
    for (const tb of [T.bonk1, T.bonk2]) if (t > tb && t < tb + 0.2) shake = Math.round(Math.sin((t - tb) * 60) * (tb === T.bonk2 ? 2 : 1));
    const y0 = top + shake;
    rect(0, y0 - 1, VW, 18, P.ink);
    for (let r = 0; r < 4; r++)
      for (let c = -1; c < 18; c++) {
        const x = c * 8 + (r % 2 ? 4 : 0), y = y0 + r * 4;
        rect(x, y, 7, 3, P.brick[(c * 7 + r * 3 + 30) % 3]);
        rect(x, y, 7, 1, P.brickHi);
        rect(x + 7, y, 1, 4, P.mortar); rect(x, y + 3, 8, 1, P.mortar);
      }
    text(CFG.wall, VW / 2, y0 + 5, { align: 'center', color: P.white, outline: P.ink });
  }

  function debris(t, cam) {
    if (t < T.smash || t > T.smash + 2) return;
    const tau = t - T.smash;
    const Rd = rng(7);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 18; c++) {
        const bx = c * 8 + (r % 2 ? 4 : 0) - 4, balt = CEIL[1] - r * 4;
        const vx = (bx - 67) * 1.4 + (Rd() - 0.5) * 40, va = 40 + Rd() * 110, spin = Rd();
        const x = bx + vx * tau, alt = balt + va * tau - 0.5 * 320 * tau * tau;
        const y = sy(alt, cam);
        if (y > VH + 4) continue;
        const w = spin < 0.5 ? 5 : 3, hh = spin < 0.5 ? 3 : 4;
        rect(x - 1, y - 1, w + 2, hh + 2, P.ink); rect(x, y, w, hh, P.brick[(r + c) % 3]); rect(x, y, w, 1, P.brickHi);
      }
  }

  function girder(x, alt, w, cam, lit) {
    const y = Math.round(sy(alt, cam)), x0 = Math.round(x - w / 2);
    if (y < -30 || y > VH + 30) return y;
    rect(x0 - 1, y - 1, w + 2, 7, P.ink);
    rect(x0, y, w, 5, P.steel); rect(x0, y, w, 1, P.steelHi); rect(x0, y + 4, w, 1, P.steelDark);
    for (let i = 3; i < w - 2; i += 6) pset(x0 + i, y + 2, P.rivet);
    return y;
  }
  function platform(p, t, cam) {
    const y = girder(p.x, p.alt, 34, cam);
    if (y < -30 || y > VH + 30) return;
    const lit = t >= p.land;
    // a sign hangs under the beam and lights up when he lands
    rect(p.x - 5, y + 6, 1, 3, P.grey); rect(p.x + 4, y + 6, 1, 3, P.grey);
    const bx = p.x - 8, by = y + 9;
    rect(bx - 1, by - 1, 18, 17, lit ? P.gold : P.ink); rect(bx, by, 16, 15, lit ? P.navy : '#262c50');
    const ic = ICONS[p.i];
    sprite(ic, ICON_PAL, bx + 8 - Math.ceil(ic[0].length / 2), by + 7 - Math.ceil(ic.length / 2), lit ? {} : { tint: P.greyDark });
    if (lit && t < p.land + 0.35) sparkles(bx + 8, by + 7, t - p.land, 12, 7);
  }
  function summit(t, cam) {
    const y = girder(SUMMIT.x, SUMMIT.alt, SUMMIT.w, cam);
    if (y < -60 || y > VH + 30) return;
    // the flag on top waves in two frames
    const px = SUMMIT.x + 26;
    rect(px - 1, y - 30, 3, 31, P.ink); rect(px, y - 29, 1, 29, P.paper);
    const wave = Math.floor(t * 6) % 2;
    for (let c = 0; c < 16; c++) {
      const dy = wave ? Math.round(Math.sin(c * 0.6) * 1) : Math.round(Math.sin(c * 0.6 + 1.5) * 1);
      rect(px + 1 + c, y - 29 + dy - (c === 0 ? 0 : 0), 1, 10, P.brand);
      if (c > 3 && c < 12 && (c === 4 || c === 11)) rect(px + 1 + c, y - 25 + dy, 1, 3, P.white);
    }
    rect(px + 5, y - 27, 1, 1, P.white); rect(px + 6, y - 28, 4, 1, P.white); rect(px + 10, y - 27, 1, 1, P.white);
  }

  function tokens(t, cam) {
    for (const k of TOKENS) {
      const y = sy(k.alt, cam);
      if (t < k.t) {
        if (y < -8 || y > VH) continue;
        const bob = Math.round(Math.sin(t * 6 + k.x) * 1);
        sprite(HOUSE, HOUSE_PAL, k.x - 3, y - 3 + bob, { outline: P.ink });
      } else if (t < k.t + 0.45) {
        const f = (t - k.t) / 0.45;
        sparkles(k.x, y, t - k.t, 6, 4);
        if (f < 0.8 || Math.floor(t * 30) % 2) text('+1', k.x, y - 8 - f * 10, { align: 'center', color: P.gold, outline: P.ink });
      }
    }
  }

  // four-point twinkles bursting out from (x,y)
  function sparkles(x, y, tau, n, r) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i;
      const d = r * E.outCubic(clamp(tau / 0.35)) + (i % 3);
      const px = Math.round(x + Math.cos(a) * d), py = Math.round(y + Math.sin(a) * d);
      if (tau > 0.4 && (i + Math.floor(tau * 20)) % 2) continue;
      pset(px, py, i % 2 ? P.white : P.gold);
      if (i % 3 === 0) { pset(px - 1, py, P.gold); pset(px + 1, py, P.gold); pset(px, py - 1, P.gold); pset(px, py + 1, P.gold); }
    }
  }
  function dizzy(x, y, t) {
    for (let i = 0; i < 3; i++) {
      const a = t * 7 + (i * Math.PI * 2) / 3;
      const px = Math.round(x + Math.cos(a) * 7), py = Math.round(y + Math.sin(a) * 2);
      pset(px, py, P.gold); pset(px - 1, py, P.goldDark); pset(px + 1, py, P.goldDark); pset(px, py - 1, P.goldDark); pset(px, py + 1, P.goldDark);
    }
  }
  function dust(x, y, tau) {
    if (tau < 0 || tau > 0.3) return;
    for (let i = 0; i < 6; i++) {
      const s = i % 2 ? 1 : -1, d = 2 + (i >> 1) * 3;
      pset(Math.round(x + s * d * (0.4 + tau * 3)), Math.round(y - tau * 10 - (i >> 1)), i < 2 ? P.white : '#b8bfd6');
    }
  }
  function fireworks(t, cam) {
    const bursts = [[30, 60, 0], [104, 72, 0.5], [60, 88, 1], [112, 50, 1.5], [22, 84, 2]];
    const cols = [P.gold, P.brand, P.glow, P.white, '#ff5ec4'];
    bursts.forEach(([bx, ba, bt], j) => {
      const tau = t - (SUMMIT.land + b(bt));
      if (tau < 0 || tau > 1.1) return;
      const cx = bx, cy = sy(SUMMIT.alt + ba, camAlt(t));
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        for (let tr = 0; tr < 3; tr++) {
          const tt = Math.max(0, tau - tr * 0.04);
          const d = 26 * E.outCubic(clamp(tt / 0.7));
          const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d + 10 * tt * tt;
          if (tau > 0.8 && (i + Math.floor(tau * 25)) % 2) continue;
          pset(x, y, tr ? cols[(j + 2) % 5] : cols[j % 5]);
        }
      }
    });
  }

  // ---------------------------------------------------------------- HUD + dialog box (fixed on screen)
  function hud(t) {
    const n = String(collected(t)).padStart(3, '0');
    const flash = TOKENS.some((k) => t >= k.t && t < k.t + 0.12);
    const w = text(CFG.hud.customers + ' ', 4, 36, { color: P.label, outline: P.ink });
    text(n, 4 + w + 3, 36, { color: flash ? P.gold : P.white, outline: P.ink });
    const lvl = t >= SUMMIT.land ? 'MAX' : String(1 + PLAT.filter((p) => t >= p.land).length);
    const lw = text(lvl, 131, 36, { color: P.white, outline: P.ink, align: 'right' });
    text(CFG.hud.level + ' ', 131 - lw - 3, 36, { color: P.label, outline: P.ink, align: 'right' });
  }
  function box(x, y, w, h) {
    rect(x, y + 1, w, h - 2, P.ink); rect(x + 1, y, w - 2, h, P.ink);
    rect(x + 1, y + 1, w - 2, h - 2, P.paper); rect(x + 2, y + 2, w - 4, h - 4, P.ink);
    rect(x + 3, y + 3, w - 6, h - 6, P.panel);
  }
  const typed = (t, t0) => Math.max(0, Math.floor((t - t0) * CPS));
  function dialogAt(t) {
    const D = CFG.dialog;
    if (t < T.stuck) return { lines: D.goal, t0: T.goal };
    if (t < T.powerTxt) return { lines: D.stuck, t0: T.stuck };
    if (t < T.levelUp) return { lines: D.powerup, t0: T.powerTxt };
    if (t < PLAT[0].land) return { big: D.levelUp, t0: T.levelUp };
    if (t < SUMMIT.land) {
      const i = PLAT.filter((p) => t >= p.land).length - 1;
      return { check: CFG.features[i], t0: PLAT[i].land };
    }
    return { lines: [D.cleared[0]], big: D.cleared[1], t0: SUMMIT.land };
  }
  function dialog(t) {
    const d = dialogAt(t);
    const open = E.outCubic(prog(t, T.game, 0.12));
    const h = Math.max(4, Math.round(39 * open));
    box(3, 46 + Math.round((39 - h) / 2), 129, h);
    if (open < 1) return;
    let left = typed(t, d.t0);
    if (d.check) { // new feature on landing: tick + word, stamped in at once
      const w = measure('✓ ' + d.check);
      const pop = t - d.t0 < 0.06 ? -2 : 0;
      text('✓', VW / 2 - w / 2, 61 + pop, { color: P.green });
      text(d.check, VW / 2 - w / 2 + measure('✓ '), 61 + pop, { color: P.white });
      return;
    }
    if (d.big && !d.lines) { // LEVEL UP!, colour cycling
      const cyc = [P.gold, P.white, P.glow][Math.floor(t * 12) % 3];
      const drop = Math.round(-6 * (1 - E.outBack(clamp((t - d.t0) / 0.18))));
      text(d.big, VW / 2, 59 + drop, { s: 2, color: cyc, shadow: P.brandDark, shadowOff: 1, align: 'center' });
      return;
    }
    const lines = d.lines;
    const y0 = d.big ? 52 : lines.length === 3 ? 52 : 57;
    lines.forEach((ln, i) => {
      const len = ln.replace(/\*/g, '').length;
      text(ln, 8, y0 + i * 10, { color: P.white, hi: P.gold, count: left });
      left -= len;
    });
    if (d.big) {
      const f = clamp((t - d.t0 - 0.2) / 0.15);
      if (f > 0) text(d.big, VW / 2, 65 - Math.round(4 * (1 - E.outBack(f))), { s: 2, color: [P.gold, P.white][Math.floor(t * 10) % 2], shadow: P.brandDark, shadowOff: 1, align: 'center' });
    }
  }

  // ---------------------------------------------------------------- title and end card
  const TITLE_COLS = { 2: P.goldHi, 3: P.goldHi, 4: P.gold, 5: P.gold, 6: '#ffa21f', 7: '#ff8a1a', 8: P.brand };
  function skyline(y0, lit) {
    const Rk = rng(5);
    let x = -2;
    while (x < VW) {
      const w = 10 + Math.floor(Rk() * 14), hh = 14 + Math.floor(Rk() * 30);
      rect(x, y0 - hh, w, VH, '#0e1236');
      for (let wy = y0 - hh + 4; wy < VH - 4; wy += 5)
        for (let wx = x + 2; wx < x + w - 2; wx += 4) if (Rk() < lit) rect(wx, wy, 2, 2, Rk() < 0.8 ? '#ffd27a' : '#8fa3ff');
      x += w + 1;
    }
  }
  function title(t) {
    sky(0.2, 0);
    skyline(214, 0.35);
    const out = prog(t, T.start, B * 0.5);
    CFG.title.forEach((word, row) => {
      const w = measure(word, 3);
      let x = Math.round(VW / 2 - w / 2);
      [...word].forEach((ch, i) => {
        const k = row * 5 + i;
        const s = spring(t - 0.02 - k * 0.045, 3.2, 0.45);
        const fly = E.inCubic(out) * (80 + ((k * 37) % 40));
        const y = Math.round(58 + row * 27 - (1 - s) * 70 - fly);
        text(ch, x, y, { s: 3, color: (r) => TITLE_COLS[r] || P.brand, outline: P.ink, shadow: P.navy, shadowOff: 3 });
        x += (measure(ch, 3) + 3);
      });
    });
    if (out < 1) {
      text(CFG.hook, VW / 2, 122, { align: 'center', color: P.white, outline: P.ink, count: typed(t, b(1.25)) });
      const blink = t > b(2.25) && (t > T.start ? Math.floor(t * 20) % 2 === 0 : (t - b(2.25)) % 0.4 < 0.26);
      if (blink) text(CFG.pressStart, VW / 2, 142, { align: 'center', color: t > T.start ? P.gold : P.white, outline: P.ink });
    }
  }
  function logoMark(cx, y) { // roof over a four-pane window, the brand mark in pixels
    for (let r = 0; r < 10; r++) {
      rect(cx - r - 2, y + r, 3, 1, P.brand); rect(cx + r, y + r, 3, 1, P.brand);
    }
    rect(cx - 4, y + 7, 4, 3, P.white); rect(cx + 1, y + 7, 4, 3, P.white); rect(cx - 4, y + 11, 4, 3, P.white); rect(cx + 1, y + 11, 4, 3, P.white);
  }
  function endCard(t) {
    sky(0.2, 0);
    skyline(236, 0.45);
    // logo mark drops in, wordmark letters follow
    const ls = spring(t - T.logo, 3, 0.5);
    const ly = Math.round(52 - (1 - ls) * 50);
    if (t >= T.logo) { logoMarkInk(VW / 2, ly); logoMark(VW / 2, ly); }
    const name = CFG.brand.name;
    const w = measure(name, 2);
    let x = Math.round(VW / 2 - w / 2);
    [...name].forEach((ch, i) => {
      const s = spring(t - T.word - i * 0.04, 3.4, 0.5);
      if (t < T.word + i * 0.04) { x += measure(ch, 2) + 2; return; }
      text(ch, x, Math.round(80 - (1 - s) * 16), { s: 2, color: P.white, outline: P.ink, shadow: P.brand, shadowOff: 2 });
      x += measure(ch, 2) + 2;
    });
    let left = typed(t, T.tag);
    CFG.brand.tagline.forEach((ln, i) => {
      text(ln, VW / 2, 110 + i * 10, { align: 'center', color: P.label, outline: P.ink, count: left });
      left -= ln.length;
    });
    // CTA: a chunky button that pops in, then presses on every beat like PRESS START
    if (t >= T.cta) {
      const pop = E.outBack(clamp((t - T.cta) / 0.2));
      const press = t > T.cta + 0.3 && beatOf(t) % 1 < 0.18 ? 1 : 0;
      const bw = Math.round(126 * (0.6 + 0.4 * pop)), bh = 17;
      const bx = Math.round(VW / 2 - bw / 2), byy = 138 + press;
      rect(bx, byy + 2, bw, bh, P.ink);
      rect(bx, byy, bw, bh, P.ink); rect(bx + 1, byy + 1, bw - 2, bh - 2, P.brand); rect(bx + 1, byy + 1, bw - 2, 1, '#ff9a5a');
      rect(bx + 1, byy + bh - 2, bw - 2, 1, P.brandDark);
      if (pop > 0.9) {
        // the ▶ blinks on its own, so the words never shift
        const label = CFG.brand.cta, arrow = label.startsWith('▶ ');
        const words = arrow ? label.slice(2) : label;
        const lw = measure(label);
        const tx = Math.round(VW / 2 - lw / 2);
        if (arrow && Math.floor(beatOf(t) * 2) % 2 === 0) text('▶', tx, byy + 5, { color: P.white, outline: P.brandDark });
        text(words, tx + (arrow ? measure('▶ ') + 1 : 0), byy + 5, { color: P.white, outline: P.brandDark });
      }
      // the hero drops onto the button and cheers on every beat
      const tl = T.cta + B * 0.5;
      if (t > tl - 0.25) {
        const fall = E.inQuad(clamp((t - (tl - 0.25)) / 0.25));
        const hop = t > tl + 0.1 ? 4 * Math.sin(Math.PI * (beatOf(t) % 1)) : 0;
        const hy = Math.round(lerp(-10, byy - 1, fall) - hop);
        drawHero({ legs: hop > 1 ? 'tuck' : 'stand', arms: t > tl ? 'up' : 'down', dir: -1, eye: 'happy' }, 123, hy, t);
      }
    }
  }
  function logoMarkInk(cx, y) {
    for (let r = 0; r < 10; r++) { rect(cx - r - 3, y + r - 1, 5, 3, P.ink); rect(cx + r - 1, y + r - 1, 5, 3, P.ink); }
    rect(cx - 5, y + 6, 11, 9, P.ink);
  }

  // ---------------------------------------------------------------- one frame
  function flashAt(t) {
    for (const [t0, n] of [[T.start, 2], [T.grab, 3], [T.smash, 2]]) if (t >= t0 && t < t0 + n / 60) return true;
    return false;
  }
  function shakeAt(t) {
    if (t > T.smash && t < T.smash + 0.45) {
      const a = 3 * (1 - (t - T.smash) / 0.45);
      return [Math.round(Math.sin(t * 90) * a), Math.round(Math.cos(t * 70) * a)];
    }
    return [0, 0];
  }

  function frame(t) {
    offset(0, 0);
    if (t < T.game) {
      title(t);
      if (flashAt(t)) rect(0, 0, VW, VH, P.white);
      return;
    }
    if (t >= T.card) {
      endCard(t);
      const r = E.outCubic(prog(t, T.card, 0.4)) * 170;
      if (r < 170) iris(VW / 2, 100, r, '#000000');
      return;
    }
    const cam = camAlt(t);
    const h = heroAt(t);
    sky(t, cam);
    clouds(t, cam);
    const [sx, syy] = shakeAt(t);
    offset(sx, syy);
    scaffold(cam);
    groundFloor(t, cam);
    slab(t, cam);
    PLAT.forEach((p) => platform(p, t, cam));
    summit(t, cam);
    tokens(t, cam);

    // the power-up flies in on a wave and waits for him
    if (t >= T.item && t < T.grab) {
      const f = E.outCubic(prog(t, T.item, T.itemStop - T.item));
      const ix = lerp(150, ITEM.x, f), ia = ITEM.alt + Math.sin(t * 7) * 2 + (1 - f) * Math.sin(t * 14) * 6;
      const iy = sy(ia, cam);
      drect(ix - 9, iy - 8, 19, 17, P.glow, 0.3 + 0.2 * Math.sin(t * 12));
      sprite(SITE, SITE_PAL, ix - 6, iy - 4, { outline: Math.floor(t * 10) % 2 ? P.glow : P.white });
      for (let i = 0; i < 5; i++) { // sparkle trail
        const tt = t - i * 0.05;
        const fx = E.outCubic(prog(tt, T.item, T.itemStop - T.item));
        if (fx < 1) pset(lerp(150, ITEM.x, fx) + 8 + i, sy(ITEM.alt + Math.sin(tt * 7) * 2, cam) + (i % 2 ? 2 : -2), i % 2 ? P.gold : P.white);
      }
    }
    // hero (+ flashing while the power-up soaks in)
    const hsY = sy(h.alt, cam);
    if (t >= T.grab && t < T.levelUp) h.flash = Math.floor((t - T.grab) * 15) % 2 === 0;
    if (h.charge) { // energy pulled into him before the big jump
      for (let i = 0; i < 10; i++) {
        const a = i * 2.4 + t * 3, d = 16 * (1 - ((t * 2 + i / 10) % 1));
        pset(h.x + Math.cos(a) * d, hsY - 10 + Math.sin(a) * d, i % 2 ? P.glow : P.white);
      }
    }
    drawHero(h, h.x, hsY, t);
    if ((t > T.land1 && t < T.jump2) || (t > T.land2 && t < b(11.5))) dizzy(h.x, hsY - (h.legs === 'sit' ? 18 : 22), t);
    dust(h.x, sy(CEIL[0], cam), t - T.bonk1);
    dust(h.x, sy(CEIL[0], cam), t - T.bonk2);
    [T.land1, T.land2, T.grabLand, ...PLAT.map((p) => p.land), SUMMIT.land].forEach((tl) => dust(heroAt(tl).x, sy(heroAt(tl).alt, cam), t - tl));
    if (t >= T.grab && t < T.levelUp) sparkles(h.x, hsY - 10, (t - T.grab) % 0.5, 10, 12);
    debris(t, cam);
    if (t > T.smash && t < T.apex) { // speed lines while he shoots up
      const Rl = rng(Math.floor(t * 30));
      for (let i = 0; i < 9; i++) rect(Math.floor(Rl() * VW), Math.floor(Rl() * VH), 1, 6 + Math.floor(Rl() * 8), i % 2 ? P.white : P.glow);
    }
    if (t >= SUMMIT.land) fireworks(t, cam);
    offset(0, 0);

    hud(t);
    dialog(t);

    // iris in from the title, iris out on the hero before the end card
    if (t < T.game + 0.45) iris(h.x, hsY - 10, E.inQuad(prog(t, T.game, 0.45)) * 200, '#000000');
    if (t >= T.irisOut) iris(h.x, hsY - 10, (1 - E.inCubic(prog(t, T.irisOut, T.card - T.irisOut - 0.05))) * 200, '#000000');
    if (flashAt(t)) rect(0, 0, VW, VH, P.white);
  }

  // ---------------------------------------------------------------- sound cues for tools/make_audio.py
  function cues() {
    const out = [];
    const add = (t, type, extra = {}) => out.push(Object.assign({ t: +t.toFixed(4), type }, extra));
    const typeCues = (t0, lines) => {
      let i = 0;
      for (const ln of lines) for (const ch of ln.replace(/\*/g, '')) { if (ch !== ' ' && i % 2 === 0) add(t0 + i / CPS, 'blip'); i++; }
    };
    for (let k = 0; k < 10; k++) add(0.02 + k * 0.045, 'letter', { i: k });
    typeCues(b(1.25), [CFG.hook]);
    add(T.start, 'start');
    add(T.game, 'iris');
    typeCues(T.goal, CFG.dialog.goal);
    add(T.jump1, 'jump'); add(T.bonk1, 'bonk'); add(T.land1, 'land');
    typeCues(T.stuck, CFG.dialog.stuck);
    add(T.jump2, 'jump'); add(T.bonk2, 'bonk', { big: 1 }); add(T.land2, 'land'); add(T.land2 + 0.05, 'dizzy');
    add(T.item, 'item');
    typeCues(T.powerTxt, CFG.dialog.powerup);
    add(T.hop, 'jump'); add(T.grab, 'powerup'); add(T.grabLand, 'land');
    add(T.levelUp, 'levelup');
    add(T.walkEnd, 'charge'); add(T.launch, 'superjump'); add(T.smash, 'smash');
    PLAT.forEach((p, i) => { add(p.land, 'land'); add(p.land, 'feature', { i }); add(p.land + B, 'jump'); });
    TOKENS.forEach((k) => add(k.t, 'token'));
    add(SUMMIT.land, 'land'); add(SUMMIT.land, 'clear');
    [0, 0.5, 1, 1.5, 2].forEach((bt) => add(SUMMIT.land + b(bt), 'firework'));
    add(T.irisOut, 'irisout');
    add(T.logo, 'logo');
    for (let i = 0; i < CFG.brand.name.length; i++) add(T.word + i * 0.04, 'letter', { i });
    typeCues(T.tag, CFG.brand.tagline);
    add(T.cta, 'cta');
    return out.sort((x, y) => x.t - y.t);
  }

  // ---------------------------------------------------------------- main
  const stage = document.getElementById('stage');
  const q = new URLSearchParams(location.search);
  function seek(t) {
    t = clamp(t, 0, DUR - 1e-6);
    frame(t);
    flush();
  }
  window.__meta = { W, H, DUR, BPM: 144, format: 'portrait', blur: [], poster: b(33.5), cues: cues() };
  window.__seek = seek;
  window.__ready = Promise.resolve(true).then(() => {
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
