// ─────────────────────────────────────────────────────────────────────────────
// s1 · IGNITION                                   global 0.000 – 1.875 (lt = t)
//
// Cold open. A single bone dot proves the fundamentals in under two seconds:
//   timing & spacing  → three bounces locked to the beat grid, decaying apexes,
//                       a faint "spacing chart" of frame dots left along the arcs
//   squash & stretch  → velocity-aligned stretch, keyed contact squash (sy .6)
//   arcs              → true parabolas with decaying horizontal drift to centre
//   anticipation      → the world is inhaled into the dot before the drop
//
// Beats (lt): 0 · .46875 · .9375 · 1.40625 — contacts land ON those frames.
//
// Handoff contract @1.875: P.ink + bone dot r=28 at (960,540), perfectly round,
// nothing else on screen. Clean from CLEAN_T = 1.812 → frames 109–112 (and every
// motion-blur sub-sample up to 1.8729) are pixel-identical.
//
// Craft notes: contact squash is keyed (not simulated) so it lands on the beat frame;
// the floor is a trampoline spring; ticks hop like tiny dots; the dot box-filters its
// own motion blur so the engine's 4 sub-frames don't strobe (see drawDot).
//
// Every value is a pure function of t; static data is precomputed below.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  const { clamp, lerp, smoothstep, TAU } = R.math;
  const E = R.ease;
  const P = R.P;
  const BEAT = R.BEAT;
  const seg = R.seg;
  const bone = (a) => R.col.rgba(P.bone, a);

  // ───────────────────────── layout ─────────────────────────
  const CX = 960, CY = 540;
  const FLOOR_Y = 700;       // the hairline floor
  const RAD = 28;            // the dot — same radius the s2 author receives
  const RULER_HALF = 864;    // floor spans CX ± 864 → exactly the 96px safe margins
  const TICK_STEP = 48;
  const NT = 16;             // ticks at k = −16 … 16 (every 4th major; the ruler ends on majors,
                             // the hairline runs on another 96px and fades)
  const TEXT_Y = 770;        // baseline of the typed line
  const CLEAN_T = 1.812;     // from here on, the dot is the only thing on screen

  // ───────────────────────── helpers ─────────────────────────
  // Cubic Hermite: position from p0 (vel v0) to p1 (vel v1) over duration D, u ∈ 0..1.
  const hermite = (p0, v0, p1, v1, D, u) => {
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * D * v0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * D * v1;
  };
  // Underdamped spring 0 → 1 with initial (normalised) velocity. Returns [value, d/dt].
  const springV = (t, w0, z, v0) => {
    if (t <= 0) return [0, v0];
    const a = z * w0, wd = w0 * Math.sqrt(1 - z * z), B = (v0 - a) / wd;
    const e = Math.exp(-a * t), c = Math.cos(wd * t), s = Math.sin(wd * t);
    const x = e * (-c + B * s);
    return [1 + x, -a * x + e * (wd * s + B * wd * c)];
  };
  // Speed (px/s) → stretch factor along the velocity. Round when slow, 1.25 at full tilt.
  const stretchFromSpeed = (v) => 1 + 0.25 * smoothstep(450, 3400, v);
  // Perpendicular scale for a stretch/squash factor s (≈ volume preserving: s=.6 → 1.47).
  const perpOf = (s) => Math.pow(s, -0.75);
  // Vertical half-extent of the deformed dot (axis angle a, along-axis factor s).
  const halfExtY = (s, a) => RAD * Math.hypot(s * Math.sin(a), perpOf(s) * Math.cos(a));
  // Fold an angle into [0, π) — an ellipse axis has no direction.
  const axisAngle = (vx, vy) => { let a = Math.atan2(vy, vx) % Math.PI; return a < 0 ? a + Math.PI : a; };
  const VERT = Math.PI / 2;

  // ───────────────────────── choreography: contacts ─────────────────────────
  // Each contact is a keyed window [tc − pre, tc + post] around the beat. The squash
  // peaks a few ms either side of tc, so the frame nearest each beat shows it.
  // At 60fps this gives: stretched & ~20px above the floor on the frame before the
  // beat, full squash on the beat frame and the next, a launch stretch on the third.
  const CT = [
    { tc: BEAT * 1, pre: 0.013, post: 0.036, sMin: 0.60, dip: 15, hop: 12, ring: 1.0 },
    { tc: BEAT * 2, pre: 0.013, post: 0.036, sMin: 0.61, dip: 11, hop: 9, ring: 0.8 },
    { tc: BEAT * 3, pre: 0.013, post: 0.040, sMin: 0.58, dip: 9, hop: 7, ring: 0.65 },
  ];
  CT.forEach((c) => { c.tT = c.tc - c.pre; c.tR = c.tc + c.post; c.D = c.tR - c.tT; });

  // Two full bounces between the contacts, apex heights decaying (ball bottom above floor).
  const ARCS = [
    { t0: CT[0].tR, t1: CT[1].tT, H: 272 },
    { t0: CT[1].tR, t1: CT[2].tT, H: 168 },
  ];
  ARCS.forEach((a) => { a.T = a.t1 - a.t0; a.g = (8 * a.H) / (a.T * a.T); });

  // Entry: free fall (quadIn) from an apex just above the frame, same gravity as bounce 1.
  const G0 = ARCS[0].g;
  const ENTRY_H = 745; // apex height of the ball bottom above the floor (bottom ≈ 45px above frame)
  const T_APEX = CT[0].tT - Math.sqrt((2 * ENTRY_H) / G0);

  // Horizontal drift: velocity decays at every contact (friction), grip slows the slide.
  const VX = [560, 300, 150];
  const GRIP = 0.55;
  const X_T = [], X_R = [];
  X_T[0] = 730;
  X_R[0] = X_T[0] + CT[0].D * 0.5 * (VX[0] + VX[1]) * GRIP;
  X_T[1] = X_R[0] + VX[1] * ARCS[0].T;
  X_R[1] = X_T[1] + CT[1].D * 0.5 * (VX[1] + VX[2]) * GRIP;
  X_T[2] = X_R[1] + VX[2] * ARCS[1].T;

  // Final rise: after contact 3 the dot levitates to frame centre on a damped spring
  // (expoOut-like launch, ~5px overshoot, settle). Constants tuned numerically.
  const RISE = { w0: 22, z: 0.75, v0: 13 };

  // ───────────────────────── floor response ─────────────────────────
  // Trampoline dip under a contact: pressed during contact, then a decaying spring.
  function dipEnv(c, t) {
    const tau = t - c.tc;
    const PEAK = 0.012;
    if (tau < -c.pre) return 0;
    if (tau <= PEAK) return E.quadOut(seg(tau, -c.pre, PEAK));
    const q = tau - PEAK;
    if (q > 0.9) return 0;
    return Math.cos(TAU * 6 * q) * Math.exp(-7.5 * q);
  }
  // Floor surface offset (px, +down) at x, summed over all contacts.
  function floorDip(x, t) {
    let d = 0;
    for (const c of CT) {
      const env = dipEnv(c, t);
      if (env === 0) continue;
      const sig = 64 + 260 * Math.max(0, t - c.tc); // the dip widens as it springs back
      const dx = (x - c.x) / sig;
      d += c.dip * env * Math.exp(-dx * dx);
    }
    return d;
  }

  // ───────────────────────── the dot's path ─────────────────────────
  // Horizontal position (C¹ continuous: linear in flight, Hermite through contacts).
  function ballX(t) {
    if (t <= CT[0].tT) return X_T[0] - VX[0] * (CT[0].tT - t);
    for (let i = 0; i < 3; i++) {
      const c = CT[i];
      if (t <= c.tR && t >= c.tT) {
        const vOut = i < 2 ? VX[i + 1] : RISE_VX;
        return hermite(X_T[i], VX[i], X_R[i], vOut, c.D, (t - c.tT) / c.D);
      }
      if (i < 2 && t < CT[i + 1].tT) return X_R[i] + VX[i + 1] * (t - c.tR);
    }
    return X_R[2]; // rise handled separately
  }

  // Flight state for t outside contacts (before the rise): bottom y and velocity.
  function flight(t) {
    const x = ballX(t);
    if (t < CT[0].tT) {
      const dt = Math.max(0, t - T_APEX); // hold at the (off-screen) apex before it
      const h = ENTRY_H - 0.5 * G0 * dt * dt;
      return { x, bottom: FLOOR_Y - h, vx: VX[0], vy: G0 * dt };
    }
    const k = t < CT[1].tT ? 0 : 1;
    const a = ARCS[k];
    const u = (t - a.t0) / a.T;
    const h = 4 * a.H * u * (1 - u);
    // Blend the floor's own motion into the ball at take-off / touch-down (no pops).
    const carry = Math.max(0, 1 - (t - a.t0) / 0.03, 1 - (a.t1 - t) / 0.03);
    return { x, bottom: FLOOR_Y - h + floorDip(x, t) * carry, vx: VX[k + 1], vy: (-4 * a.H * (1 - 2 * u)) / a.T };
  }
  // Shape from velocity (flight).
  const flightShape = (f) => ({ s: stretchFromSpeed(Math.hypot(f.vx, f.vy)), a: axisAngle(f.vx, f.vy) });

  // Contact state: bottom pinned to the (dipping) floor, keyed squash & stretch.
  function contactState(i, t) {
    const c = CT[i];
    const x = ballX(t);
    const tau = t - c.tc;
    const s = R.keys(tau, c.sKeys);
    // Axis: velocity direction at touch → vertical while squashed → release direction.
    let a;
    if (tau < 0) a = lerp(c.aTouch, VERT, E.quadOut(seg(tau, -c.pre, -c.pre + 0.006)));
    else a = lerp(VERT, c.aRel, E.quadIn(seg(tau, c.post - 0.018, c.post)));
    const bottom = FLOOR_Y + floorDip(x, t);
    return { x, y: bottom - halfExtY(s, a), s, a, bottom };
  }

  // Rise state (after the last contact): spring to exact frame centre.
  function riseState(t) {
    const tau = t - CT[2].tR;
    const [f, df] = springV(tau, RISE.w0, RISE.z, RISE.v0);
    let x = RISE_X0 + (CX - RISE_X0) * f;
    let y = RISE_Y0 + (CY - RISE_Y0) * f;
    const vx = (CX - RISE_X0) * df, vy = (CY - RISE_Y0) * df;
    let s = stretchFromSpeed(Math.hypot(vx, vy));
    const a = axisAngle(vx, vy);
    // Lock to the contract: exact centre and perfectly round well before the cut.
    const lock = smoothstep(1.66, 1.79, t);
    x = lerp(x, CX, lock);
    y = lerp(y, CY, lock);
    s = 1 + (s - 1) * (1 - smoothstep(1.68, 1.78, t));
    return { x, y, s, a, bottom: y + halfExtY(s, a) };
  }

  // Master: the dot at time t → { x, y (centre), s (along-axis scale), a (axis), bottom }.
  function ball(t) {
    for (let i = 0; i < 3; i++) if (t >= CT[i].tT && t <= CT[i].tR) return contactState(i, t);
    if (t > CT[2].tR) return riseState(t);
    const f = flight(t);
    const { s, a } = flightShape(f);
    return { x: f.x, y: f.bottom - halfExtY(s, a), s, a, bottom: f.bottom };
  }

  // ── precompute contact geometry & squash keys (needs the functions above) ──
  let RISE_VX = 0, RISE_X0 = 0, RISE_Y0 = 0;
  // Contact x = dot x at the beat (the dip, ripple and tick wave all centre here).
  const refineContacts = () => CT.forEach((c) => { c.x = ballX(c.tc); });
  // Solve the last contact's release against the rise (a couple of fixed-point passes).
  for (let pass = 0; pass < 4; pass++) {
    X_R[2] = X_T[2] + CT[2].D * 0.5 * (VX[2] + RISE_VX) * GRIP;
    refineContacts();
    RISE_X0 = X_R[2];
    const sRel = CT[2].sRel || 1.08;
    RISE_Y0 = FLOOR_Y + floorDip(RISE_X0, CT[2].tR) - halfExtY(sRel, CT[2].aRel || VERT);
    RISE_VX = (CX - RISE_X0) * RISE.v0;
    const riseV = [RISE_VX, (CY - RISE_Y0) * RISE.v0];
    // Touch / release shape from the adjacent flight states.
    CT.forEach((c, i) => {
      const fin = flight(c.tT - 1e-6);
      const shIn = flightShape(fin);
      let shOut;
      if (i < 2) shOut = flightShape(flight(c.tR + 1e-6));
      else shOut = { s: stretchFromSpeed(Math.hypot(riseV[0], riseV[1])), a: axisAngle(riseV[0], riseV[1]) };
      c.sTouch = shIn.s; c.aTouch = shIn.a;
      c.sRel = shOut.s; c.aRel = shOut.a;
      // Keyed squash (vertical axis): stretch → hard squash → hold → recover → launch stretch.
      c.sKeys = [
        [-c.pre, c.sTouch],
        [-c.pre + 0.005, c.sMin + 0.05, 'quadOut'],
        [0.007, c.sMin, 'sineOut'],
        [c.post * 0.62, lerp(c.sMin, 1, 0.66), 'sineInOut'],
        [c.post, c.sRel, 'quadIn'],
      ];
    });
  }

  // ───────────────────────── static data ─────────────────────────
  // Ruler ticks: pop-in order from the centre, major every 4th, centre mark tallest.
  const TICKS = [];
  for (let k = -NT; k <= NT; k++) {
    const ak = Math.abs(k);
    TICKS.push({
      k,
      x: CX + k * TICK_STEP,
      len: k === 0 ? 22 : ak % 4 === 0 ? 15 : 7,
      alpha: k === 0 ? 0.62 : ak % 4 === 0 ? 0.5 : 0.3,
      tPop: 0.075 + 0.23 * Math.pow(ak / NT, 0.92),
    });
  }

  // Typing schedule — human rhythm (seeded jitter, a beat of hesitation after spaces).
  const LINE = 'EVERYTHING STARTS WITH A DOT.';
  const TYPE_T0 = 0.5, TYPE_T1 = 1.3;
  const TYPE_AT = (() => {
    const rnd = R.rng(0x5eed1);
    const gaps = [];
    for (let i = 1; i < LINE.length; i++) {
      let g = 0.65 + 0.7 * rnd();
      if (LINE[i - 1] === ' ') g += 0.55; // the pause after a word
      if (LINE[i] === '.') g += 0.8; // a considered full stop
      gaps.push(g);
    }
    const sum = gaps.reduce((a, b) => a + b, 0);
    const out = [TYPE_T0];
    for (const g of gaps) out.push(out[out.length - 1] + (g / sum) * (TYPE_T1 - TYPE_T0));
    return out;
  })();
  // Backspace: one tap, the key-repeat delay, then auto-repeat (much faster than typing).
  const DEL_T0 = 1.5, DEL_REPEAT = 1.555, DEL_T1 = 1.722;
  const DEL_AT = LINE.split('').map((_, j) => (j === 0 ? DEL_T0 : DEL_REPEAT + ((j - 1) / (LINE.length - 2)) * (DEL_T1 - DEL_REPEAT)));
  const CURSOR_IN = BEAT; // the cursor is born on contact 1
  const CURSOR_OFF = [[1.352, 1.434]]; // one blink during the idle beat
  const CURSOR_OUT = [1.732, 1.758];

  // Converging speed lines (reverse speed lines into the dot).
  // A coherent ring of 14 streaks (not a random spray): same launch radius band,
  // interleaved stagger so the implosion shimmers around the dial.
  const STREAKS = (() => {
    const rnd = R.rng(0x1f2e3d);
    const n = 14, out = [];
    for (let j = 0; j < n; j++) {
      const i = (j * 5) % n; // interleaved order: consecutive streaks never neighbour
      const ang = (i / n) * TAU + 0.11 + (rnd() - 0.5) * 0.12;
      const start = 1.592 + (j / (n - 1)) * 0.046 + rnd() * 0.006; // all absorbed by ≈1.808
      const dur = 0.118 + rnd() * 0.008;
      out.push({ ang, start, dur, r0: 520 + rnd() * 70, w: 1.2 + rnd() * 0.3, a: 0.42 + rnd() * 0.16 });
    }
    return out;
  })();
  const STREAK_LAG = 0.3;

  // ───────────────────────── scene timing envelopes ─────────────────────────
  const floorHalf = (t) => {
    const grow = RULER_HALF * E.expoOut(seg(t, 0.07, 0.47));
    return grow * rulerScale(t);
  };
  // Ruler collapse into centre (tape-measure retract, with a hair of anticipation).
  const rulerScale = (t) => 1 - E.backIn(seg(t, 1.56, 1.755), 0.9);
  // Everything that isn't the dot fades out ahead of the contract.
  const auxFade = (t) => 1 - smoothstep(1.7, CLEAN_T - 0.004, t);
  // Camera: a slow dolly-in on the contract point that leans into the inhale and lands
  // on exactly 1.0 (so the handoff dot is exactly r=28 at 960,540) before the held frames.
  const CAM_EASE = E.bezier(0.5, 0, 0.3, 1);
  const camScale = (t) => lerp(0.962, 1, CAM_EASE(seg(t, 0, 1.795)));

  // ───────────────────────── drawing ─────────────────────────
  // The final render averages 4 sub-frames across a 180° shutter (1/480 s apart). At
  // 4000+ px/s that strobes into 4 hard-edged ghosts. So each sub-frame box-filters its own
  // slice of the shutter: 5 stamps over the preceding 1/480 s, summed additively at 1/5
  // (255/5 = 51 → exactly opaque where all overlap). The 4 slices tile the shutter and the
  // smear becomes a continuous ramp. Stationary → one plain, perfectly round circle.
  const SUB_DT = 0.5 / 60 / 4;
  const SUB_STAMPS = 5;
  const DOT_BOX = 224;
  // Each stamp starts its own sub-path exactly at its arc start (no connecting segments).
  function addDotPath(ctx, x, y, s, a) {
    if (Math.abs(s - 1) < 1e-4) { ctx.moveTo(x + RAD, y); ctx.arc(x, y, RAD, 0, TAU); }
    else {
      const rx = RAD * s, ry = RAD * perpOf(s);
      ctx.moveTo(x + Math.cos(a) * rx, y + Math.sin(a) * rx);
      ctx.ellipse(x, y, rx, ry, a, 0, TAU);
    }
  }
  function drawDot(ctx, api, t, jx, jy) {
    const b = ball(t);
    const p0 = ball(Math.max(0, t - SUB_DT));
    const change = Math.hypot(b.x - p0.x, b.y - p0.y) + RAD * Math.abs(b.s - p0.s);
    if (change < 0.4) {
      ctx.fillStyle = P.bone;
      ctx.beginPath();
      addDotPath(ctx, b.x + jx, b.y + jy, b.s, b.a);
      ctx.fill();
      return;
    }
    const L = api.layer('dot', DOT_BOX, DOT_BOX);
    const ox = Math.round(b.x + jx) - DOT_BOX / 2, oy = Math.round(b.y + jy) - DOT_BOX / 2;
    const lc = L.ctx;
    lc.globalCompositeOperation = 'lighter';
    lc.globalAlpha = 1 / SUB_STAMPS;
    lc.fillStyle = P.bone;
    for (let i = SUB_STAMPS - 1; i >= 0; i--) {
      const p = i ? ball(t - (SUB_DT * i) / SUB_STAMPS) : b;
      lc.beginPath();
      addDotPath(lc, p.x + jx - ox, p.y + jy - oy, p.s, p.a);
      lc.fill();
    }
    ctx.drawImage(L.canvas, ox, oy);
  }

  // Floor: trim-path hairline with the trampoline dip, a proximity glow that
  // senses the falling dot, and a flash at each contact.
  function drawFloor(ctx, t, b, detail) {
    const half = floorHalf(t);
    // The seed: the floor itself starts as a dot.
    const seedA = seg(t, 0.0, 0.05) * (1 - seg(t, 0.09, 0.2));
    if (seedA > 0) {
      ctx.fillStyle = bone(0.85 * seedA);
      ctx.beginPath();
      ctx.arc(CX, FLOOR_Y, 3.2 * E.backOut(seg(t, 0.0, 0.06)), 0, TAU);
      ctx.fill();
    }
    if (half < 0.75) return;
    const x0 = CX - half, x1 = CX + half;
    const fadeLen = Math.min(46, half * 0.5);
    const hb = FLOOR_Y - b.bottom; // dot height above floor
    const near = Math.pow(1 - clamp(hb / 280), 2);
    const alphaAt = (x) => {
      const end = smoothstep(0, fadeLen, Math.min(x - x0, x1 - x));
      let a = 0.35 * end;
      const dx = (x - b.x) / (70 + Math.max(0, hb) * 0.35);
      a += 0.32 * near * Math.exp(-dx * dx) * end;
      for (const c of CT) {
        const tau = t - c.tT;
        if (tau < 0 || tau > 0.5) continue;
        const d = (x - c.x) / (40 + 520 * tau);
        a += 0.55 * c.ring * Math.exp(-11 * tau) * Math.exp(-d * d);
      }
      return Math.min(1, a) * auxFade(t);
    };
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    const ns = clamp(Math.ceil((x1 - x0) / 14), 2, 140);
    for (let j = 0; j <= ns; j++) g.addColorStop(j / ns, bone(alphaAt(lerp(x0, x1, j / ns))));
    ctx.beginPath();
    const n = clamp(Math.ceil((x1 - x0) / (5 / Math.max(0.35, detail))), 2, 400);
    for (let j = 0; j <= n; j++) {
      const x = lerp(x0, x1, j / n);
      const y = FLOOR_Y + floorDip(x, t);
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = g;
    ctx.lineWidth = 2;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Elliptical ripples on the floor plane after each contact (two rings, staggered).
  // Front arc brighter than the back arc — reads as a ring lying on a ground plane.
  function drawRipples(ctx, t) {
    const fade = auxFade(t);
    ctx.lineCap = 'butt';
    for (const c of CT) {
      for (let j = 0; j < 2; j++) {
        const t0 = c.tc + 0.004 + j * 0.07, dur = 0.42 - j * 0.08;
        const u = seg(t, t0, t0 + dur);
        if (u <= 0 || u >= 1) continue;
        const e = E.expoOut(u);
        const rx = lerp(30, 360 - j * 110, e) * (0.7 + 0.3 * c.ring);
        const ry = rx * 0.105;
        const a = (j ? 0.2 : 0.34) * c.ring * Math.pow(1 - u, 1.8) * fade;
        if (a < 0.004) continue;
        ctx.lineWidth = lerp(1.5, 0.75, u);
        ctx.strokeStyle = bone(a * 0.45); // back half
        ctx.beginPath();
        ctx.ellipse(c.x, FLOOR_Y, rx, ry, 0, Math.PI, TAU);
        ctx.stroke();
        ctx.strokeStyle = bone(a); // front half
        ctx.beginPath();
        ctx.ellipse(c.x, FLOOR_Y, rx, ry, 0, 0, Math.PI);
        ctx.stroke();
      }
    }
  }

  // Hop of one tick from one contact: a tiny bounce of its own (0 … 1).
  function tickHop(c, x, t) {
    const dist = Math.abs(x - c.x);
    if (dist > 520) return 0;
    const tau = t - c.tc - 0.028 - dist / 1500; // waits for the dot to leave, then ripples out
    if (tau <= 0) return 0;
    const fall = Math.exp(-Math.pow(dist / 230, 2));
    const d1 = 0.15, d2 = 0.075;
    if (tau < d1) { const u = tau / d1; return fall * 4 * u * (1 - u); }
    if (tau < d1 + d2) { const u = (tau - d1) / d2; return fall * 0.22 * 4 * u * (1 - u); }
    return 0;
  }

  // Ruler ticks: stagger pop from the centre, ride the dip, hop on contacts, retract.
  function drawTicks(ctx, t) {
    const sc = rulerScale(t);
    const fade = auxFade(t);
    if (fade <= 0) return;
    ctx.lineCap = 'butt';
    for (const tk of TICKS) {
      const tp = t - tk.tPop;
      if (tp <= 0) continue;
      const pop = R.spring(tp, { k: 700, c: 22 });
      const x = CX + (tk.x - CX) * sc;
      let hop = 0, lift = 0;
      for (const c of CT) {
        const h = tickHop(c, tk.x, t);
        hop += h;
        lift += h * c.hop;
      }
      // Retracting ticks shrink as they bunch into the centre.
      const squeeze = Math.pow(clamp(sc), 0.6);
      const len = tk.len * pop * squeeze * (1 + 0.28 * hop); // a little stretch in the air
      if (len < 0.3) continue;
      const base = FLOOR_Y + floorDip(x, t) - 1 - lift; // sit on top of the 2px line
      const a = Math.min(0.8, (tk.alpha + 0.3 * hop) * clamp(tp / 0.04)) * fade * (0.3 + 0.7 * squeeze);
      ctx.strokeStyle = bone(a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x, base - len);
      ctx.stroke();
    }
  }

  // Spacing chart: faint frame-dots left along the path every other frame —
  // wide where the dot is fast, tight at the apexes. Timing made visible.
  function drawSpacing(ctx, t, detail) {
    const LIFE = 0.42, STEP = 1 / 30;
    const fade = 1 - smoothstep(1.6, 1.74, t);
    if (fade <= 0 || detail < 0.3) return;
    const kMax = Math.floor(Math.min(t - 1 / 60, 1.62) / STEP);
    const kMin = Math.ceil(Math.max(0.19, t - LIFE) / STEP);
    ctx.fillStyle = P.bone;
    for (let k = kMin; k <= kMax; k++) {
      const ts = k * STEP;
      const age = t - ts;
      const p = ball(ts);
      if (p.bottom < 0) continue;
      const a = 0.36 * Math.pow(1 - age / LIFE, 1.7) * fade;
      if (a < 0.005) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.1, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // The typed seed line + signal-orange block cursor.
  let MONO_ADV = 0;
  function drawType(ctx, t) {
    if (t < CURSOR_IN - 0.001 || t > CURSOR_OUT[1]) return;
    R.font(ctx, { family: 'JetBrains Mono', weight: 500, size: 20, spacing: 0, align: 'left' });
    if (!MONO_ADV) MONO_ADV = ctx.measureText('M').width;
    const pitch = MONO_ADV + 3; // letter-spacing 3px
    const width = LINE.length * pitch - 3;
    const left = Math.round(CX - width / 2);
    let typed = 0;
    while (typed < LINE.length && TYPE_AT[typed] <= t) typed++;
    let deleted = 0;
    while (deleted < LINE.length && DEL_AT[deleted] <= t) deleted++;
    const n = Math.max(0, typed - deleted);
    for (let i = 0; i < n; i++) {
      if (LINE[i] === ' ') continue;
      const fresh = 1 - seg(t - TYPE_AT[i], 0, 0.09); // new glyphs land a touch brighter
      ctx.fillStyle = bone(0.8 + 0.2 * fresh);
      ctx.fillText(LINE[i], left + i * pitch, TEXT_Y);
    }
    // Cursor: born with a pop on the beat, solid while typing, one idle blink, collapses.
    let vis = 1;
    for (const [a, b] of CURSOR_OFF) if (t >= a && t < b) vis = 0;
    if (!vis) return;
    const pop = E.backOut(seg(t, CURSOR_IN, CURSOR_IN + 0.06), 2.2);
    const out = 1 - E.quadIn(seg(t, CURSOR_OUT[0], CURSOR_OUT[1]));
    const cw = MONO_ADV * out, ch = 21 * pop;
    if (cw < 0.2 || ch < 0.2) return;
    const cx = left + n * pitch;
    ctx.fillStyle = P.signal;
    ctx.fillRect(cx, TEXT_Y + 4 - ch, cw, ch);
  }

  // Anticipation: halo tightening, speed lines streaming in, the floor's last point zipping up.
  function drawInhale(ctx, t, b, detail) {
    if (t < 1.56 || t >= CLEAN_T) return;
    // Halo — a faint glow and a hairline ring that tighten onto the dot.
    const hu = seg(t, 1.6, 1.805);
    if (hu > 0 && hu < 1) {
      const env = Math.pow(Math.sin(Math.PI * hu), 0.8);
      const r = lerp(180, RAD + 3, E.cubicIn(hu));
      const glowR = lerp(96, RAD + 8, E.quadIn(hu));
      const g = ctx.createRadialGradient(b.x, b.y, RAD, b.x, b.y, glowR);
      g.addColorStop(0, bone(0.07 * env));
      g.addColorStop(0.5, bone(0.02 * env));
      g.addColorStop(1, bone(0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, glowR, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = bone(0.32 * env);
      ctx.lineWidth = lerp(0.9, 1.5, hu);
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, TAU);
      ctx.stroke();
    }
    // Reverse speed lines.
    ctx.lineCap = 'round';
    const n = Math.max(6, Math.round(STREAKS.length * Math.min(1, detail)));
    for (let i = 0; i < n; i++) {
      const s = STREAKS[i];
      const u = (t - s.start) / s.dur;
      if (u <= 0 || u >= 1 + STREAK_LAG) continue;
      const rAt = (v) => lerp(s.r0, RAD + 2, E.quadIn(clamp(v)));
      const rh = rAt(u), rt = rAt(u - STREAK_LAG);
      if (rt - rh < 0.5) continue;
      const cs = Math.cos(s.ang), sn = Math.sin(s.ang);
      const hx = b.x + cs * rh, hy = b.y + sn * rh, tx = b.x + cs * rt, ty = b.y + sn * rt;
      const a = s.a * clamp(u / 0.2);
      const g = ctx.createLinearGradient(tx, ty, hx, hy);
      g.addColorStop(0, bone(0));
      g.addColorStop(1, bone(a));
      ctx.strokeStyle = g;
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    }
    // The collapsed floor's last point: flashes, then zips up and is absorbed by the dot.
    const ZIP_LAG = 0.4;
    const zu = (t - 1.75) / 0.036;
    if (t >= 1.745 && zu < 1 + ZIP_LAG) {
      const yAt = (v) => lerp(FLOOR_Y, b.bottom - 1, E.quadIn(clamp(v)));
      const hy = yAt(zu), ty = yAt(zu - ZIP_LAG);
      const flash = 1 - seg(t, 1.752, 1.775);
      if (flash > 0) {
        ctx.fillStyle = bone(0.9 * flash);
        ctx.beginPath();
        ctx.arc(CX, FLOOR_Y, 2.4, 0, TAU);
        ctx.fill();
      }
      if (ty - hy > 0.5) {
        const g = ctx.createLinearGradient(CX, ty, CX, hy);
        g.addColorStop(0, bone(0));
        g.addColorStop(1, bone(0.8));
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(CX, ty);
        ctx.lineTo(CX, hy);
        ctx.stroke();
      }
    }
  }

  // ───────────────────────── scene ─────────────────────────
  R.scene({
    id: 's1',
    shake: 1,
    render(ctx, lt, api) {
      const t = lt;
      const detail = api.detail ?? 1;
      const b = ball(t);

      const cam = camScale(t);
      if (cam !== 1) {
        ctx.translate(CX, CY);
        ctx.scale(cam, cam);
        ctx.translate(-CX, -CY);
      }

      if (t < CLEAN_T) {
        drawRipples(ctx, t);
        drawFloor(ctx, t, b, detail);
        drawTicks(ctx, t);
        drawSpacing(ctx, t, detail);
        drawType(ctx, t);
      }

      // Tension tremble (≤2px), cut to zero before the contract frames.
      const trem = 1.9 * smoothstep(1.62, 1.72, t) * (1 - smoothstep(1.782, 1.806, t));
      let jx = R.noise2(t * 52, 4.1), jy = R.noise2(9.3, t * 52);
      const jl = Math.max(1, Math.hypot(jx, jy)); // clamp the vector, not the axes: ≤1.9px
      jx *= trem / jl;
      jy *= trem / jl;
      const bt = { x: b.x + jx, y: b.y + jy, bottom: b.bottom + jy };

      drawInhale(ctx, t, bt, detail);

      if (b.bottom > -2) drawDot(ctx, api, t, jx, jy);
    },
  });

  // Debug hook for tooling (pure, no side effects).
  R._s1 = { ball, CT, ARCS, TYPE_AT, DEL_AT, STREAKS };
})();
