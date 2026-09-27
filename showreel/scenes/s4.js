// ─────────────────────────────────────────────────────────────────────────────────────────────
//  s4 · DEPTH                                          global 7.500 – 9.375  ·  lt = t − 7.5
//
//  One bar, four formations, one particle system (N = 1400, one identity per particle the whole
//  way through — nothing is spawned or killed, every particle travels):
//
//    0.000  CONTRACT   ink + bone dot r=6 at centre; the engine's hit-shake is pinned off
//    0.009  BURST      the dot detonates into a Fibonacci sphere (R 330): expoOut radial flight,
//                      28% of particles overshoot on a gamma bump and settle; the spin whips in and
//                      decays to 0.8 rad/s; a bone shock ring + signal echo ring ride the equator.
//                      The formed sphere breathes with a travelling latitude ripple
//    0.469  TORUS      sphere latitude → tube angle, longitude → ring angle: the poles punch
//                      through to form the hole. Snap ease centred on the beat, staggered
//                      top → bottom, mid-flight bulge; then it flows like a smoke ring
//    0.9375 TERRAIN    the torus unrolls (back rows first) onto a 56×25 landscape seen ~30° above
//                      the plane. Rows become Unknown-Pleasures ridge lines that trim on from the
//                      centre as each row lands; back-to-front painter's order with occluders that
//                      silhouette the peaks against an ultra horizon haze. Travelling sine + noise
//                      ridges under a centred envelope; two signal "accent series"
//    1.406  HELIX      each ridge line becomes one base-pair rung of a fast-spinning double helix
//                      (row ends wrap up the two strands), rolled up bottom → top
//    1.45   COLLAPSE   a drain: log-spiral paths in camera space, expoIn per particle, arrivals
//                      staggered so two arms wind into the centre; particles heat to signal, a
//                      hairline ring contracts ahead of them, a signal core glow builds
//    1.70   DOT        the signal dot accretes as the arms land, pops to 17.5, settles to 14
//    1.815+ CONTRACT   ink + signal dot r=14 at (960,540), nothing else (frames 559–562)
//
//  Rhythm: every beat gets a 120 ms inhale (−4%) → spring kick, plus an energy flash (particles
//  brighten and swell, peaking on the beat frame). Each morph's steepest point sits on its beat.
//
//  Rendering: hand-rolled perspective camera (dolly 1330 → 1150, roll, yaw sway); per-particle
//  size / alpha / atmospheric tint by depth; sphere + torus lit as volumes (Lambert key from upper
//  left + fresnel rim); physical-ish depth of field (circle of confusion drawn as soft bokeh
//  sprites, focus racks between formations); a depth context of far dust and near lens motes that
//  parallax with the camera; and self motion-blur — every particle is evaluated at t and
//  t − 1/480 s and drawn as an energy-conserving capsule, so the engine's 4 sub-frames fuse into
//  one continuous streak. api.detail < 1 (multiverse panels) thins particles and line work.
//
//  Pure function of lt. Static data is precomputed at module scope with R.rng — no Math.random,
//  Date or performance.now.
// ─────────────────────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  const { clamp, lerp, smoothstep, TAU } = R.math;
  const E = R.ease;
  const P = R.P;
  const BEAT = R.BEAT;
  const seg = R.seg;
  const W = R.W, H = R.H, CX = W / 2, CY = H / 2;
  const PI = Math.PI;

  // ═════════════════════════════ timing (local seconds) ═════════════════════════════
  const B1 = BEAT, B2 = BEAT * 2, B3 = BEAT * 3, END = BEAT * 4; // .46875 .9375 1.40625 1.875
  const T_BURST = 0.009;    // contract dot holds through frame 450's motion-blur sub-samples (≤ .00625),
                            // then detonates — frame 451 is already mid-burst
  const SUB = 1 / 480;      // one engine motion-blur sub-frame (4 sub-frames over a 180° shutter)
  const D_AB = 0.26, D_BC = 0.24, D_CD = 0.22; // morph durations (per particle, before stagger)
  const BC_SPREAD = 0.12;                      // terrain unroll stagger, back rows → front rows
  const TC0 = 1.45, TC1 = 1.785;               // collapse window: first departures … last arrival
  const T_DOT0 = 1.70, T_DOTPK = 1.792, T_CLEAN = 1.815; // signal dot accretes → pops → settled

  // ═════════════════════════════ geometry ═════════════════════════════
  const N = 1400, COLS = 56, ROWS = 25;   // N = COLS × ROWS: every particle owns one terrain cell
  const F = 1200;                          // focal length (px)
  const R_S = 330;                         // sphere radius
  const RT = 255, RTUBE = 100;             // torus major / tube radius
  const SX = 34, ZF = -760, ZN = 520;      // terrain: column pitch, far/near row depth
  const THETA = 0.52;                      // terrain tilt toward camera (≈30° elevation)
  const T_YOFF = -40;                      // terrain vertical placement
  const HH = 350, RH = 165, TURNS = 1.25;  // helix half-height, radius, turns
  const H_YOFF = -16;                      // helix sits a touch high: its lean brings the base forward
  const S_EDGE = 14;                       // helix: columns per row wrapped onto each strand
  const GAP = (2 * HH) / ROWS;             // helix rung spacing
  const ACCENT_A = 8, ACCENT_B = 17;       // rows drawn in signal (ridge lines → base pairs)

  // ═════════════════════════════ static per-particle data ═════════════════════════════
  const rng = R.rng(0x5d4d3);
  const UX = new Float32Array(N), UY = new Float32Array(N), UZ = new Float32Array(N); // unit sphere
  const TU = new Float32Array(N), TV = new Float32Array(N); // torus angles
  const DEL = new Float32Array(N), DUR = new Float32Array(N), OV = new Float32Array(N); // burst
  const SZ = new Float32Array(N), JIT = new Float32Array(N), LIFT = new Float32Array(N);
  const CLS = new Uint8Array(N); // 0 bone · 1 signal · 2 lime
  const AB0 = new Float32Array(N), BC0 = new Float32Array(N), CD0 = new Float32Array(N), TA = new Float32Array(N);
  const ROW = new Uint8Array(N), COL = new Uint8Array(N);
  const GRID = new Uint16Array(N); // GRID[row * COLS + col] → particle index

  const GOLD = PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    // Fibonacci sphere: uniform area, deterministic, index ↔ latitude.
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), ph = i * GOLD;
    UX[i] = Math.cos(ph) * r; UY[i] = y; UZ[i] = Math.sin(ph) * r;
    // Torus mapping: longitude → ring angle, latitude → tube angle (equator = outer rim,
    // poles = inner rim), so the morph reads as the poles punching a hole through the sphere.
    TU[i] = ph;
    TV[i] = 2 * Math.asin(y);
    DEL[i] = rng() * 0.035;
    DUR[i] = 0.3 + rng() * 0.14;
    OV[i] = rng() < 0.28 ? 0.1 + rng() * 0.28 : 0;
    SZ[i] = 0.72 + rng() * 0.56;
    JIT[i] = rng();
    LIFT[i] = 70 + rng() * 90;
    CLS[i] = rng() < 1 / 12 ? 1 : 0;
    if (CLS[i] === 1) SZ[i] *= 1.15;
  }
  // A few lime sparks — they fly furthest on the burst.
  for (let k = 0; k < 5; k++) {
    const i = Math.floor(((k + 0.5) / 5) * N + (rng() - 0.5) * 120);
    CLS[i] = 2; OV[i] = 0.55 + rng() * 0.2; SZ[i] = 1.35;
  }

  // ═════════════════════════════ small math ═════════════════════════════
  // Gamma bump: 0 at τ=0, peaks at 1 when τ=tp, glides back to 0 with zero slope (overshoot & settle).
  const bump = (tau, tp) => { if (tau <= 0) return 0; const q = tau / tp; return q * q * Math.exp(2 * (1 - q)); };

  // Radial burst factor (0 → 1, some particles overshoot).
  function burstR(i, t) {
    const tau = t - T_BURST - DEL[i];
    if (tau <= 0) return 0;
    const u = tau / DUR[i];
    let r = u >= 1 ? 1 : E.expoOut(u);
    if (OV[i] > 0) r += OV[i] * bump(tau, 0.12);
    return r;
  }

  // ═════════════════════════════ per-frame globals ═════════════════════════════
  // Everything that depends only on time (not on the particle). Computed for t and t − SUB.
  const G0 = {}, G1 = {};
  // Focus plane (camera-space z) and DOF strength: front hemisphere → mid-landscape (tilt-shift)
  // → helix axis → everything sharp for the implosion.
  const FOCUS = [[0, 150], [B2 - 0.05, 150], [B2 + 0.22, 20, 'soft'], [B3 - 0.05, 20], [B3 + 0.16, 20, 'soft']];
  const DOFK = [[0, 6], [0.25, 15, 'soft'], [B2 - 0.05, 15], [B2 + 0.22, 14, 'soft'], [B3 - 0.02, 14], [B3 + 0.18, 10, 'soft'], [TC0 + 0.1, 8], [TC1 - 0.06, 0, 'soft']];

  // Beat pulse: inhale (−4%) over the 120 ms before each beat, kick & settle after it.
  function pulse(t) {
    let s = 1;
    for (let k = 1; k <= 3; k++) {
      const b = k * BEAT;
      if (t < b - 0.12 || t > b + 0.7) continue;
      if (t < b) s -= 0.04 * E.quadIn(seg(t, b - 0.12, b));
      else s -= 0.04 * (1 - R.spring(t - b, { k: 340, c: 12, v0: 18 }));
    }
    return s;
  }

  function globals(t, g) {
    g.t = t;
    // sphere/torus object transform: spin whips in on the burst and decays to 0.8 rad/s
    const spin = 0.8 * t + 1.1 * (1 - Math.exp(-7 * Math.max(0, t - T_BURST)));
    const kAB = E.soft(seg(t, B1 - 0.16, B1 + 0.26));
    const tilt = lerp(0.36, 0.84, kAB), roll = lerp(0.08, -0.36, kAB);
    g.cy1 = Math.cos(spin); g.sy1 = Math.sin(spin);
    g.cx1 = Math.cos(tilt); g.sx1 = Math.sin(tilt);
    g.cz1 = Math.cos(roll); g.sz1 = Math.sin(roll);
    g.flowU = 1.3 * (t - B1); g.flowV = 3.0 * (t - B1);
    // terrain: slow yaw drift = parallax; noise scrolls toward camera = fly-over
    const yawT = lerp(-0.2, 0.12, E.sineInOut(seg(t, B2 - 0.25, B3 + 0.2)));
    g.cyT = Math.cos(yawT); g.syT = Math.sin(yawT);
    g.cT = Math.cos(THETA); g.sT = Math.sin(THETA);
    // helix: spins fast and keeps accelerating into the collapse
    const dt3 = t - B3;
    g.hSpin = 0.6 + 10.5 * dt3 + 14 * Math.max(0, t - TC0) ** 2;
    g.cxH = Math.cos(0.3); g.sxH = Math.sin(0.3);
    g.czH = Math.cos(0.16); g.szH = Math.sin(0.16);
    // beat pulse
    g.pulse = pulse(t);
    // beat flash: energy surge that peaks on each beat frame and decays (~90 ms half-life)
    let fl = 0;
    for (let k = 1; k <= 3; k++) {
      const d = t - k * BEAT;
      if (d >= 0 && d < 0.6) fl += Math.exp(-d * 8);
      else if (d < 0 && d > -0.035) fl += E.quadIn(1 + d / 0.035) * 0.8;
    }
    g.flash = fl;
    // camera: slow dolly-in, roll across the bar, gentle yaw sway
    g.camZ = lerp(1330, 1150, E.sineInOut(seg(t, 0, END)));
    const cyaw = 0.1 * Math.sin(t * 1.4 + 0.5), croll = lerp(0.05, -0.05, E.sineInOut(seg(t, 0, END)));
    g.cyC = Math.cos(cyaw); g.syC = Math.sin(cyaw);
    g.czC = Math.cos(croll); g.szC = Math.sin(croll);
    // depth of field
    g.focusZ = R.keys(t, FOCUS);
    g.dofK = R.keys(t, DOFK);
  }

  // Per-particle morph weights.
  const mixAB = (i, t) => E.snap(seg(t, AB0[i], AB0[i] + D_AB));
  const mixBC = (i, t) => E.snap(seg(t, BC0[i], BC0[i] + D_BC));
  const mixCD = (i, t) => E.snap(seg(t, CD0[i], CD0[i] + D_CD));
  const D_CL = 0.27; // each particle's implosion flight (expoIn), ending at its own arrival TA[i]
  const collapseK = (i, t) => E.expoIn(seg(t, TA[i] - D_CL, TA[i]));

  // Terrain height (up = +). Unknown-Pleasures envelope: ridges concentrate in the centre columns.
  function terrainH(gx, gz, t) {
    const env = Math.exp(-(gx * gx) / (300 * 300)) * 0.9 + 0.1;
    const n1 = R.noise2(gx * 0.0046 + 3.1, gz * 0.0068 - t * 1.7);
    const n2 = R.noise2(gx * 0.011 - 7.3, gz * 0.015 - t * 2.3);
    let ridge = n1 * 0.68 + n2 * 0.32 + 0.32;
    ridge = ridge > 0 ? ridge * ridge * 1.6 : 0;
    const wave = Math.sin(gz * 0.0125 - t * 7.2 + gx * 0.0021);
    return env * (150 * ridge + 26 * (wave * 0.5 + 0.5)) + 5 * R.noise2(gx * 0.02, gz * 0.02 + t);
  }

  // ═════════════════════════════ particle placement ═════════════════════════════
  // Computes camera-space position of particle i at time t (globals g) and projects it.
  // Writes screen x/y, perspective scale and camera distance into out[0..3]; out[4] = collapse k;
  // out[5] = lighting (sphere/torus are shaded as lit volumes, the line formations are not).
  const OUT = new Float64Array(6);
  // Key light from upper-left-front (y is down on screen); unit length.
  const LX = -0.45, LY = -0.62, LZ = 0.64;
  function place(i, t, g, out) {
    let x = 0, y = 0, z = 0, lit = 1;
    const mBC = t < B2 - 0.2 ? 0 : mixBC(i, t);
    const mCD = t < B3 - 0.2 ? 0 : mixCD(i, t);

    // ── A · sphere / B · torus (object space → world through the shared object transform)
    if (mBC < 1) {
      // radius: burst flight × a slow latitude ripple once the sphere has formed (it breathes)
      const rip = 1 + 0.03 * smoothstep(0.12, 0.3, t) * Math.sin(UY[i] * 9 - t * 11);
      const br = burstR(i, t) * R_S * rip;
      let px = UX[i] * br, py = UY[i] * br, pz = UZ[i] * br;
      let nx = UX[i], ny = UY[i], nz = UZ[i]; // surface normal
      const mAB = t < B1 - 0.25 ? 0 : mixAB(i, t);
      if (mAB > 0) {
        const u = TU[i] + g.flowU, v = TV[i] + g.flowV;
        const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
        const rho = RT + RTUBE * cv;
        const tx = rho * cu, ty = RTUBE * sv, tz = rho * su;
        const bulge = 1 + 0.16 * Math.sin(PI * mAB); // bows outward mid-flight
        px = lerp(px, tx, mAB) * bulge; py = lerp(py, ty, mAB) * bulge; pz = lerp(pz, tz, mAB) * bulge;
        nx = lerp(nx, cv * cu, mAB); ny = lerp(ny, sv, mAB); nz = lerp(nz, cv * su, mAB);
        const nl = 1 / Math.max(1e-3, Math.hypot(nx, ny, nz));
        nx *= nl; ny *= nl; nz *= nl;
      }
      // rotY(spin) → rotX(tilt) → rotZ(roll), for the point and its normal
      let x1 = px * g.cy1 + pz * g.sy1, z1 = -px * g.sy1 + pz * g.cy1;
      let y1 = py * g.cx1 - z1 * g.sx1; z1 = py * g.sx1 + z1 * g.cx1;
      x = x1 * g.cz1 - y1 * g.sz1; y = x1 * g.sz1 + y1 * g.cz1; z = z1;
      let m1 = nx * g.cy1 + nz * g.sy1, w1 = -nx * g.sy1 + nz * g.cy1;
      const k1 = ny * g.cx1 - w1 * g.sx1; w1 = ny * g.sx1 + w1 * g.cx1;
      const nX = m1 * g.cz1 - k1 * g.sz1, nY = m1 * g.sz1 + k1 * g.cz1;
      // Lambert key + fresnel rim: the lattice reads as a lit volume, not a flat dot pattern
      const lam = Math.max(0, nX * LX + nY * LY + w1 * LZ);
      const rim = Math.pow(1 - Math.abs(w1), 2.5);
      lit = 0.48 + 0.55 * lam + 0.5 * rim;
    }

    // ── C · terrain (world)
    if (mBC > 0 && mCD < 1) {
      const gx = (COL[i] - (COLS - 1) / 2) * SX;
      const gz = lerp(ZF, ZN, ROW[i] / (ROWS - 1));
      const h = terrainH(gx, gz, t);
      // rotY(yaw) on the flat grid, then tilt toward the camera
      const x1 = gx * g.cyT + gz * g.syT, z1 = -gx * g.syT + gz * g.cyT;
      const tx = x1, ty = -h * g.cT + z1 * g.sT + T_YOFF, tz = h * g.sT + z1 * g.cT;
      if (mBC < 1) {
        const lift = LIFT[i] * Math.sin(PI * mBC); // tossed up and laid down
        x = lerp(x, tx, mBC); y = lerp(y, ty, mBC) - lift; z = lerp(z, tz, mBC);
        lit = lerp(lit, 1, mBC);
      } else { x = tx; y = ty; z = tz; lit = 1; }
    }

    // ── D · double helix (world). Row → rung height; outer columns wrap up the strands.
    if (mCD > 0) {
      const r = ROW[i], c = COL[i];
      const yH = lerp(-HH, HH, (r + 0.5) / ROWS);
      const k2a = (TURNS * TAU) / (2 * HH);
      let hx, hy, hz;
      if (c < S_EDGE) { // strand 0: from the previous rung up to this one
        hy = yH - GAP * (1 - (c + 0.5) / S_EDGE);
        const a = hy * k2a + g.hSpin;
        hx = RH * Math.cos(a); hz = RH * Math.sin(a);
      } else if (c >= COLS - S_EDGE) { // strand 1: from this rung on to the next
        hy = yH + GAP * ((c - (COLS - S_EDGE) + 0.5) / S_EDGE);
        const a = hy * k2a + g.hSpin + PI;
        hx = RH * Math.cos(a); hz = RH * Math.sin(a);
      } else { // rung across the axis
        const k = (c - S_EDGE + 0.5) / (COLS - 2 * S_EDGE);
        const a = yH * k2a + g.hSpin;
        hy = yH; hx = RH * Math.cos(a) * (1 - 2 * k); hz = RH * Math.sin(a) * (1 - 2 * k);
      }
      // lean: rotX (seen from slightly above) → rotZ (diagonal)
      const y1 = hy * g.cxH - hz * g.sxH, z1 = hy * g.sxH + hz * g.cxH;
      const x2 = hx * g.czH - y1 * g.szH, y2 = hx * g.szH + y1 * g.czH + H_YOFF;
      if (mCD < 1) {
        const push = 1 + 0.12 * Math.sin(PI * mCD);
        x = lerp(x, x2, mCD) * push; y = lerp(y, y2, mCD); z = lerp(z, z1, mCD) * push;
      } else { x = x2; y = y2; z = z1; }
    }

    // ── beat pulse about the origin
    x *= g.pulse; y *= g.pulse; z *= g.pulse;

    // ── camera: yaw → roll
    let cx = x * g.cyC + z * g.syC, cz = -x * g.syC + z * g.cyC;
    let cy = y;
    const rx = cx * g.czC - cy * g.szC; cy = cx * g.szC + cy * g.czC; cx = rx;

    // ── collapse (camera space): a drain. Radius shrinks by (1 − k) while the angle advances by
    // −w·ln(1 − k): every particle rides an equiangular (log) spiral, so angular speed climbs as it
    // nears the centre. Staggered arrivals (TA) turn that into two arms winding into the dot.
    const ck = t < TC0 - 0.01 ? 0 : collapseK(i, t);
    if (ck > 0) {
      const k = 1 - ck;
      const a = -1.15 * Math.log(1 - 0.985 * ck);
      const ca = Math.cos(a), sa = Math.sin(a);
      const qx = (cx * ca - cy * sa) * k, qy = (cx * sa + cy * ca) * k;
      cx = qx; cy = qy; cz *= k;
    }

    // ── project
    const d = Math.max(1, g.camZ - cz), s = F / d;
    out[0] = CX + cx * s; out[1] = CY + cy * s; out[2] = s; out[3] = d; out[4] = ck; out[5] = lit;
  }

  // ═════════════════════════════ precompute: morph schedules + terrain cells ═════════════════════
  // Torus → terrain cell assignment: evaluate the torus in world space at the moment it unrolls,
  // bucket by world x into columns, sort each column by depth into rows. A monotone transport map:
  // neighbours stay neighbours, nothing crosses the frame.
  (function assign() {
    for (let i = 0; i < N; i++) {
      const h = (UY[i] + 1) / 2; // 0 = top of the sphere (screen up)
      // Snap's steepest point sits 46% into the move: centre it on the beat.
      AB0[i] = B1 - 0.46 * D_AB + (h - 0.5) * 0.09 + (JIT[i] - 0.5) * 0.02;
    }
    const g = {};
    globals(B2 - 0.02, g);
    const wx = new Float32Array(N), wz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = TU[i] + g.flowU, v = TV[i] + g.flowV;
      const rho = RT + RTUBE * Math.cos(v);
      const px = rho * Math.cos(u), py = RTUBE * Math.sin(v), pz = rho * Math.sin(u);
      let x1 = px * g.cy1 + pz * g.sy1, z1 = -px * g.sy1 + pz * g.cy1;
      let y1 = py * g.cx1 - z1 * g.sx1; z1 = py * g.sx1 + z1 * g.cx1;
      wx[i] = x1 * g.cz1 - y1 * g.sz1;
      wz[i] = z1 - 0.35 * (x1 * g.sz1 + y1 * g.cz1); // bias by height so the top lands at the back
    }
    const byX = Array.from({ length: N }, (_, i) => i).sort((a, b) => wx[a] - wx[b]);
    for (let c = 0; c < COLS; c++) {
      const col = byX.slice(c * ROWS, (c + 1) * ROWS).sort((a, b) => wz[a] - wz[b]);
      col.forEach((i, r) => { ROW[i] = r; COL[i] = c; GRID[r * COLS + c] = i; });
    }
    for (let i = 0; i < N; i++) {
      const rf = ROW[i] / (ROWS - 1); // 0 far … 1 near
      // terrain unrolls far → near; helix rolls up near (bottom) → far (top)
      BC0[i] = B2 - 0.46 * D_BC + (rf - 0.5) * BC_SPREAD + (JIT[i] - 0.5) * 0.02;
      CD0[i] = B3 - 0.46 * D_CD + (0.5 - rf) * 0.07 + (JIT[i] - 0.5) * 0.02;
      // Arrival: the middle of the helix drains first, its two ends last → two arms wind into the
      // dot, which accretes as they land. Rung centres (nearest the axis) lead their row.
      const mid = Math.abs(ROW[i] - (ROWS - 1) / 2) / ((ROWS - 1) / 2);
      const axial = 1 - Math.abs((COL[i] - (COLS - 1) / 2) / ((COLS - 1) / 2));
      TA[i] = TC1 - 0.075 * (1 - mid) - 0.012 * axial - 0.008 * JIT[i];
    }
  })();

  // ═════════════════════════════ colour + sprites ═════════════════════════════
  // Colours are resolved to css strings once. Depth fog tints bone toward a gray→ultra haze
  // (a gradient between palette colours); heat blends bone → signal during the collapse.
  const LUT_N = 16;
  const hex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const HAZE = hex(R.col.rgb(P.gray).map((v, j) => lerp(v, R.col.rgb(P.ultra)[j], 0.3)));
  const lutFog = Array.from({ length: LUT_N }, (_, k) => R.col.mix(P.bone, HAZE, (0.75 * k) / (LUT_N - 1)));
  const lutHeat = Array.from({ length: LUT_N }, (_, k) => R.col.mix(P.bone, P.signal, k / (LUT_N - 1)));

  // Bokeh sprite per colour: soft disc with a brighter lens rim. Built lazily, cached forever.
  const sprites = new Map();
  function sprite(col) {
    let s = sprites.get(col);
    if (s) return s;
    s = document.createElement('canvas');
    s.width = s.height = 64;
    const c = s.getContext('2d');
    const m = col.match(/\d+/g).map(Number);
    const rgba = (a) => `rgba(${m[0]},${m[1]},${m[2]},${a})`;
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 31);
    gr.addColorStop(0, rgba(0.55));
    gr.addColorStop(0.74, rgba(0.66));
    gr.addColorStop(0.89, rgba(0.86));
    gr.addColorStop(0.95, rgba(0.45));
    gr.addColorStop(1, rgba(0));
    c.fillStyle = gr;
    c.fillRect(0, 0, 64, 64);
    sprites.set(col, s);
    return s;
  }
  const SPR_K = 32 / 29; // sprite half-size / visible disc radius

  // ═════════════════════════════ depth context: far dust + near bokeh motes ═════════════════════
  // Not part of the particle system — a static world the camera moves through. Far specks and a
  // handful of huge out-of-focus motes in front of the lens parallax against each other with the
  // camera's yaw / roll / dolly, which is what sells the volume.
  const DUST = Array.from({ length: 170 }, () => ({
    x: (rng() - 0.5) * 4800, y: (rng() - 0.5) * 2800, z: -900 - rng() * 1900,
    r: 0.55 + rng() * 0.6, a: 0.1 + rng() * 0.3,
  }));
  const MOTES = Array.from({ length: 14 }, (_, k) => ({
    x: (rng() - 0.5) * 1900, y: (rng() - 0.5) * 1000, z: 480 + rng() * 330,
    a: 0.02 + rng() * 0.026, sig: k % 7 === 3, vy: -12 - rng() * 22,
  }));
  function drawAtmosphere(ctx, g, alpha, sizeK, near) {
    if (alpha <= 0.003) return;
    const put = (x, y, z) => { // world → camera (yaw, roll) → screen
      const cx = x * g.cyC + z * g.syC, cz = -x * g.syC + z * g.cyC;
      const rx = cx * g.czC - y * g.szC, ry = cx * g.szC + y * g.czC;
      const s = F / Math.max(40, g.camZ - cz);
      return [CX + rx * s, CY + ry * s, s];
    };
    if (!near) {
      ctx.fillStyle = P.bone2;
      for (const d of DUST) {
        const [x, y] = put(d.x, d.y, d.z);
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        ctx.globalAlpha = d.a * alpha;
        ctx.beginPath(); ctx.arc(x, y, d.r * sizeK, 0, TAU); ctx.fill();
      }
      return;
    }
    for (const m of MOTES) {
      const [x, y, s] = put(m.x, m.y + m.vy * g.t, m.z);
      const rr = 14 + s * 16; // huge circle of confusion: they sit well in front of the focus
      if (x < -rr || x > W + rr || y < -rr || y > H + rr) continue;
      ctx.globalAlpha = m.a * alpha;
      const q = rr * SPR_K;
      ctx.drawImage(sprite(R.col.rgba(m.sig ? P.signal : P.bone, 1)), x - q, y - q, q * 2, q * 2);
    }
  }

  // ═════════════════════════════ frame buffers ═════════════════════════════
  // Screen position now (X0/Y0) and one sub-frame ago (X1/Y1), perspective scale, camera distance,
  // collapse progress and lighting — filled once per frame, read by the painters.
  const X0 = new Float32Array(N), Y0 = new Float32Array(N), S0 = new Float32Array(N), D0 = new Float32Array(N);
  const X1 = new Float32Array(N), Y1 = new Float32Array(N), CK = new Float32Array(N), LIT = new Float32Array(N);
  const ORDER = new Uint16Array(N);

  // ═════════════════════════════ drawing helpers ═════════════════════════════
  // Undo the engine hit-shake (R.unshake) so the contract frames are pixel-exact.
  function pinContract(ctx, api, t, w) {
    if (w <= 0 || api.detail !== 1) return;
    R.unshake(ctx, api, w);
  }

  // Background: ink + a breathing ink2 radial glow. The same gradient fills the ridge occluders,
  // so hidden-line removal is invisible against the backdrop.
  function glowGradient(ctx, a) {
    const g = ctx.createRadialGradient(CX, CY - 40, 0, CX, CY - 40, 900);
    g.addColorStop(0, R.col.rgba(P.ink2, a));
    g.addColorStop(0.55, R.col.rgba(P.ink2, a * 0.45));
    g.addColorStop(1, R.col.rgba(P.ink2, 0));
    return g;
  }

  // Projected ring on the sphere/torus equator (object space), for the burst shockwave.
  function drawRing(ctx, g, radius, col, alpha, width) {
    if (alpha <= 0.003 || radius <= 1) return;
    ctx.beginPath();
    for (let k = 0; k <= 120; k++) {
      const a = (k / 120) * TAU;
      const px = Math.cos(a) * radius, pz = Math.sin(a) * radius;
      let x1 = px * g.cy1 + pz * g.sy1, z1 = -px * g.sy1 + pz * g.cy1;
      let y1 = -z1 * g.sx1; z1 = z1 * g.cx1;
      let x = x1 * g.cz1 - y1 * g.sz1, y = x1 * g.sz1 + y1 * g.cz1;
      x *= g.pulse; y *= g.pulse; z1 *= g.pulse;
      let cx = x * g.cyC + z1 * g.syC; const cz = -x * g.syC + z1 * g.cyC;
      const rx = cx * g.czC - y * g.szC; const cy = cx * g.szC + y * g.czC; cx = rx;
      const s = F / (g.camZ - cz);
      if (k) ctx.lineTo(CX + cx * s, CY + cy * s); else ctx.moveTo(CX + cx * s, CY + cy * s);
    }
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = col;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  // One ridge line / rung through the row's current screen positions (quadratic mid-point
  // smoothing). `span` 0..1 trims the line symmetrically from the centre column outward (AE Trim
  // Paths), with fractional end points so the draw-on is continuous. Returns the point count; the
  // trimmed end points stay in RP_X / RP_Y for the occluder.
  const RP_X = new Float32Array(COLS + 2), RP_Y = new Float32Array(COLS + 2);
  function rowPath(ctx, r, span = 1) {
    const base = r * COLS, cm = (COLS - 1) / 2;
    let n = 0;
    const push = (c, f) => { // point at column c + f (0 ≤ f < 1)
      const i = GRID[base + c];
      if (f <= 0) { RP_X[n] = X0[i]; RP_Y[n] = Y0[i]; } else {
        const j = GRID[base + c + 1];
        RP_X[n] = lerp(X0[i], X0[j], f); RP_Y[n] = lerp(Y0[i], Y0[j], f);
      }
      n++;
    };
    if (span >= 1) for (let c = 0; c < COLS; c++) push(c, 0);
    else {
      const cA = cm - span * cm, cB = cm + span * cm;
      const a0 = Math.floor(cA), b0 = Math.floor(cB);
      push(a0, cA - a0);
      for (let c = a0 + 1; c <= b0; c++) push(c, 0);
      if (cB - b0 > 1e-3) push(b0, cB - b0);
    }
    if (n < 2) return 0;
    ctx.moveTo(RP_X[0], RP_Y[0]);
    for (let k = 1; k < n - 1; k++) {
      ctx.quadraticCurveTo(RP_X[k], RP_Y[k], (RP_X[k] + RP_X[k + 1]) * 0.5, (RP_Y[k] + RP_Y[k + 1]) * 0.5);
    }
    ctx.lineTo(RP_X[n - 1], RP_Y[n - 1]);
    return n;
  }

  // Ridge draw-on: each row trims on from the centre as its particles land (back rows first).
  // Starts once the row is ~90% landed (snap reaches .93 at 70% of its move).
  const rowSpan = (r, t) => { const t0 = B2 - 0.46 * D_BC + 0.7 * D_BC + (r / (ROWS - 1) - 0.5) * BC_SPREAD; return E.expoOut(seg(t, t0, t0 + 0.22)); };

  // ═════════════════════════════ scene ═════════════════════════════
  R.scene({
    id: 's4',
    shake: 0.8,
    render(ctx, lt, api) {
      const detail = api.detail ?? 1;
      const t = lt;

      // Contract pin: hold the engine shake off for the whole contract frame (incl. its
      // motion-blur sub-frames) and ease it in over the next two frames; pin again at the end.
      const pinIn = 1 - smoothstep(T_BURST, T_BURST + 0.035, t);
      const pinOut = smoothstep(T_CLEAN - 0.03, T_CLEAN, t);
      pinContract(ctx, api, api.t, Math.max(pinIn, pinOut));

      // ── contract states ────────────────────────────────────────────────────
      if (t < T_BURST) {
        ctx.fillStyle = P.bone;
        ctx.beginPath(); ctx.arc(CX, CY, 6, 0, TAU); ctx.fill();
        return;
      }
      if (t >= T_CLEAN) {
        ctx.fillStyle = P.signal;
        ctx.beginPath(); ctx.arc(CX, CY, 14, 0, TAU); ctx.fill();
        return;
      }

      const g = G0, gp = G1;
      globals(t, g);
      globals(t - SUB, gp);

      // ── background glow ────────────────────────────────────────────────────
      const glowA = smoothstep(T_BURST, 0.32, t) * (1 - smoothstep(1.58, 1.78, t));
      const bgGrad = glowA > 0.002 ? glowGradient(ctx, 0.9 * glowA) : null;
      if (bgGrad) { ctx.fillStyle = bgGrad; ctx.fillRect(-200, -200, W + 400, H + 400); }
      const atmoA = smoothstep(0.04, 0.3, t) * (1 - smoothstep(1.5, 1.68, t));
      drawAtmosphere(ctx, g, atmoA, detail >= 0.99 ? 1 : 1.6, false);

      // ── horizon haze: an ultra glow behind the landscape's far edge. The ridge occluders are
      // ink, so the mountains silhouette against it (it is deliberately not in the occluder fill).
      const hazeA = smoothstep(B2 + 0.02, B2 + 0.2, t) * (1 - smoothstep(B3 - 0.1, B3 + 0.06, t));
      if (hazeA > 0.003) {
        const hy = CY - 250;
        ctx.save();
        ctx.translate(CX, hy);
        ctx.scale(1, 0.24);
        const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 980);
        hg.addColorStop(0, R.col.rgba(P.ultra, 0.2 * hazeA));
        hg.addColorStop(0.45, R.col.rgba(P.ultra, 0.07 * hazeA));
        hg.addColorStop(1, R.col.rgba(P.ultra, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = hg;
        ctx.fillRect(-1000, -1000, 2000, 2000);
        ctx.restore();
      }

      // ── place every particle (now + one sub-frame ago) ─────────────────────
      const s0 = F / g.camZ;
      const alive = t < TC1;
      if (alive) {
        for (let i = 0; i < N; i++) {
          place(i, t, g, OUT);
          X0[i] = OUT[0]; Y0[i] = OUT[1]; S0[i] = OUT[2]; D0[i] = OUT[3]; CK[i] = OUT[4]; LIT[i] = OUT[5];
          place(i, t - SUB, gp, OUT);
          X1[i] = OUT[0]; Y1[i] = OUT[1];
        }
      }

      // ── burst: core flash + equatorial shock rings ─────────────────────────
      const tb = t - T_BURST;
      if (tb < 0.6) {
        const core = 1 - seg(tb, 0, 0.12);
        if (core > 0) {
          const rr = lerp(30, 130, E.expoOut(seg(tb, 0, 0.12)));
          const gr = ctx.createRadialGradient(CX, CY, 0, CX, CY, rr);
          gr.addColorStop(0, R.col.rgba(P.bone, 0.95 * core * core));
          gr.addColorStop(0.35, R.col.rgba(P.bone, 0.25 * core * core));
          gr.addColorStop(1, R.col.rgba(P.bone, 0));
          ctx.globalAlpha = 1;
          ctx.fillStyle = gr;
          ctx.fillRect(CX - rr, CY - rr, rr * 2, rr * 2);
        }
        const u1 = seg(tb, 0, 0.55), u2 = seg(tb, 0.05, 0.55);
        drawRing(ctx, g, R_S * 1.7 * E.expoOut(u1), P.bone, 0.5 * Math.pow(1 - u1, 1.6), 1.6 - u1);
        drawRing(ctx, g, R_S * 1.25 * E.expoOut(u2), P.signal, 0.55 * Math.pow(1 - u2, 1.4), 1.2);
      }

      // ── collapse: heat builds at the drain (a soft signal core glow, gone before the contract)
      const coreA = smoothstep(1.62, 1.77, t) * (1 - smoothstep(1.785, 1.808, t));
      if (coreA > 0.003) {
        const rr = lerp(170, 60, E.quadIn(seg(t, 1.62, 1.8)));
        const cg = ctx.createRadialGradient(CX, CY, 0, CX, CY, rr);
        cg.addColorStop(0, R.col.rgba(P.signal, 0.32 * coreA));
        cg.addColorStop(0.3, R.col.rgba(P.signal, 0.1 * coreA));
        cg.addColorStop(1, R.col.rgba(P.signal, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = cg;
        ctx.fillRect(CX - rr, CY - rr, rr * 2, rr * 2);
      }

      // ── collapse: a hairline signal ring contracts ahead of the arms ────────
      if (t > 1.64 && t < TC1) {
        const u = seg(t, 1.64, TC1);
        const rr = lerp(250, 12, E.expoIn(u));
        ctx.globalAlpha = 0.45 * smoothstep(0, 0.3, u);
        ctx.strokeStyle = P.signal;
        ctx.lineWidth = lerp(0.8, 1.8, u);
        ctx.beginPath(); ctx.arc(CX, CY, rr, 0, TAU); ctx.stroke();
      }

      if (alive) {
        const stride = detail >= 0.99 ? 1 : Math.max(1, Math.round(1 / clamp(detail * 1.6, 0.2, 1)));
        const sizeK = detail >= 0.99 ? 1 : Math.min(2.2, 1 / Math.sqrt(Math.max(0.2, detail)));
        const dF = g.camZ - g.focusZ, dofK = g.dofK;

        // Line work: ridge lines (terrain) → rungs & strands (helix). Revealed per row by rowSpan
        // (trim-on), faded out as the collapse starts.
        const lineA = smoothstep(B2 - 0.04, B2 + 0.04, t) * (1 - smoothstep(TC0 + 0.06, TC0 + 0.2, t));
        // Hidden-line removal only while the landscape is settled.
        const occA = smoothstep(B2 + 0.1, B2 + 0.24, t) * (1 - smoothstep(B3 - 0.1, B3 + 0.0, t));
        const heatT = seg(t, 1.6, 1.75); // everything glows signal by the end

        // ── particle painter (depth-cued size/alpha/tint, DOF bokeh, self motion blur)
        let lastStyle = '';
        ctx.lineCap = 'round';
        const style = (col) => { if (col !== lastStyle) { ctx.strokeStyle = ctx.fillStyle = col; lastStyle = col; } };
        const drawParticle = (i) => {
          const ck = CK[i];
          if (ck > 0.985) return; // swallowed by the dot
          const sRel = S0[i] / s0;
          const fog = clamp((1.14 - sRel) / 0.6);
          const lit = LIT[i];
          let rr = SZ[i] * 1.2 * Math.pow(sRel, 2.3) * sizeK * (1 - 0.45 * ck) * (0.82 + 0.18 * lit);
          rr = rr < 0.5 ? 0.5 : rr > 5 ? 5 : rr;
          const heat = Math.max(smoothstep(0, 0.35, ck), heatT);
          let a = Math.min(1, Math.max(lerp(1, 0.16, Math.pow(fog, 0.85)), heat * 0.95) + 0.5 * g.flash * (1 - fog * 0.5));
          a = Math.min(1, a * lit);
          if (CLS[i] === 0) a *= 1 - 0.55 * occA; // in the landscape the ridge lines lead, dots texture them
          rr *= 1 + 0.35 * g.flash;
          const x = X0[i], y = Y0[i];
          const dx = x - X1[i], dy = y - Y1[i];
          const moving = dx * dx + dy * dy > 0.6;

          // Lime sparks: always crisp, with a tight halo — a pop, never a blur.
          if (CLS[i] === 2 && heat < 0.5) {
            style(P.lime);
            ctx.globalAlpha = 0.18 * a;
            ctx.beginPath(); ctx.arc(x, y, rr * 3.2, 0, TAU); ctx.fill();
            ctx.globalAlpha = a;
            ctx.lineWidth = rr * 2.2;
            ctx.beginPath(); ctx.moveTo(X1[i], Y1[i]); ctx.lineTo(x + 0.01, y); ctx.stroke();
            return;
          }
          let col;
          if (CLS[i] !== 0 || heat > 0.97) col = P.signal;
          else if (heat > 0) col = lutHeat[Math.round(heat * (LUT_N - 1))];
          else col = lutFog[Math.round(fog * (LUT_N - 1))];

          const coc = (dofK * Math.abs(D0[i] - dF)) / D0[i];
          const reff = rr + coc;
          if (reff > 2.6) {
            // out of focus: the particle's energy spreads over its circle of confusion
            const ab = a * clamp(((rr * rr) / (reff * reff)) * 2.6, 0.045, 1);
            if (moving) {
              // a blurred disc smeared along its path: energy spreads over the streak length
              style(col);
              ctx.globalAlpha = (ab * 2 * reff) / (2 * reff + Math.sqrt(dx * dx + dy * dy));
              ctx.lineWidth = reff * 2;
              ctx.beginPath(); ctx.moveTo(X1[i], Y1[i]); ctx.lineTo(x, y); ctx.stroke();
            } else {
              ctx.globalAlpha = ab;
              const q = reff * SPR_K;
              ctx.drawImage(sprite(col.startsWith('#') ? R.col.rgba(col, 1) : col), x - q, y - q, q * 2, q * 2);
            }
            return;
          }
          style(col);
          ctx.globalAlpha = a;
          if (moving) {
            // in focus: keep streaks punchy, but let long ones thin out (sqrt energy falloff)
            ctx.globalAlpha = a * Math.sqrt((2 * rr + 2) / (2 * rr + 2 + Math.sqrt(dx * dx + dy * dy)));
            ctx.lineWidth = rr * 2;
            ctx.beginPath(); ctx.moveTo(X1[i], Y1[i]); ctx.lineTo(x, y); ctx.stroke();
          } else {
            ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
          }
        };

        // Row line style: depth-cued; DOF widens + fades out-of-focus rows. Two rows are signal
        // accents — a highlighted series in the landscape, two coloured base pairs in the helix.
        const strokeRow = (r) => {
          const i = GRID[r * COLS + (COLS >> 1)];
          const sRel = S0[i] / s0;
          const fog = clamp((1.2 - sRel) / 0.55);
          const coc = (dofK * Math.abs(D0[i] - dF)) / D0[i];
          const accent = r === ACCENT_A || r === ACCENT_B;
          ctx.globalAlpha = Math.min(1, (lineA * lerp(0.9, 0.2, fog)) / (1 + coc * 0.25) * (accent ? 1 : 0.85) * (1 + 0.6 * g.flash));
          ctx.lineWidth = (lerp(0.8, 1.35, clamp(sRel - 0.6)) * (accent ? 1.5 : 1) + coc * 0.3) * sizeK;
          ctx.strokeStyle = accent ? P.signal : P.bone;
          lastStyle = '';
          ctx.beginPath(); rowPath(ctx, r, rowSpan(r, t)); ctx.stroke();
        };

        if (occA > 0.01) {
          // Landscape mode: back → front, row by row: occlude, stroke the ridge, draw its dots.
          const bottom = H + 300;
          for (let r = 0; r < ROWS; r++) {
            const span = rowSpan(r, t);
            ctx.beginPath();
            const n = rowPath(ctx, r, span);
            if (n) {
              // full rows extend past their ends so the far plains stay occluded off-frame
              const ext = span >= 1 ? 400 : 0;
              const xL = RP_X[0], yL = RP_Y[0], xR = RP_X[n - 1], yR = RP_Y[n - 1];
              ctx.lineTo(xR + ext, yR); ctx.lineTo(xR + ext, bottom); ctx.lineTo(xL - ext, bottom); ctx.lineTo(xL - ext, yL);
              ctx.closePath();
            }
            ctx.globalAlpha = occA;
            ctx.fillStyle = P.ink; ctx.fill();
            if (bgGrad) { ctx.fillStyle = bgGrad; ctx.fill(); }
            lastStyle = '';
            if (r % stride === 0) strokeRow(r);
            for (let c = 0; c < COLS; c += stride) drawParticle(GRID[r * COLS + c]);
          }
        } else {
          if (lineA > 0.005) for (let r = 0; r < ROWS; r += stride) strokeRow(r);
          lastStyle = '';
          for (let i = 0; i < N; i++) ORDER[i] = i;
          ORDER.sort((a, b) => D0[b] - D0[a]); // far → near
          for (let n = 0; n < N; n++) {
            const i = ORDER[n];
            if (stride > 1 && i % stride) continue;
            drawParticle(i);
          }
        }
      }

      drawAtmosphere(ctx, g, atmoA, 1, true); // near motes: in front of everything

      // ── the signal dot: accretes as the arms land, pops, settles to r=14 ───
      if (t >= T_DOT0) {
        const r = R.keys(t, [[T_DOT0, 0], [1.775, 10, 'quadOut'], [T_DOTPK, 17.5, 'expoOut'], [T_CLEAN, 14, 'sineInOut']]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = P.signal;
        ctx.beginPath(); ctx.arc(CX, CY, r, 0, TAU); ctx.fill();
      }

      // ── post (main render only; panels must not touch the host frame's post state).
      // Bloom surges on the burst and on the dot pop, and is exactly 0 on both contract frames.
      if (detail === 1) {
        const on = smoothstep(T_BURST, T_BURST + 0.01, t) * (1 - smoothstep(1.795, T_CLEAN - 0.004, t));
        const surge = 0.7 * (1 - E.quadOut(seg(tb, 0, 0.16))) + 0.5 * bump(t - 1.74, 0.045);
        api.post.bloom = Math.max(api.post.bloom || 0, (0.4 + surge) * on);
      }
    },
  });
})();
