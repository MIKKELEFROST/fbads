// ─────────────────────────────────────────────────────────────────────────────────────────────
//  s4 · DEPTH                                          global 7.500 – 9.375  ·  lt = t − 7.5
//
//  One bar, one particle system (N = 1400, one identity per particle the whole way through —
//  nothing is spawned or killed, every particle travels), three formations and a drain:
//
//    0.000  BURST      the r=6 contract dot has already detonated on the first frame (f450): a bone
//                      flash disc, a screen-space shock ring (r 300 → 700 over f450–452) and a
//                      bloom surge; particles fly out on an expoOut radial flight into a Fibonacci
//                      sphere (R 330), 28% overshoot and settle; the spin whips in and decays
//    0.12   "R 330"    radius dimension + callout (mono, hairline leader — the s3 panel language)
//    0.469  TORUS      sphere latitude → tube angle: the poles punch through to form the hole.
//                      Snap ease centred on the beat, staggered top → bottom, mid-flight bulge
//    0.56   "N 1400"   callout on the torus rim
//    0.9375 TERRAIN    the torus unrolls (back rows first) onto a 56×25 landscape ~30° above the
//                      plane. Rows are Unknown-Pleasures ridge lines that trim on from the centre;
//                      back-to-front painter's order, each row's "mountain band" (ridge → its own
//                      ground line) occludes the rows behind it
//    1.00   "Z −760"   callout on the far ridge
//    1.406  TUNNEL     the landscape rolls up: every row bends (true constant-curvature bend, far
//                      rows first, sweeping toward the camera) into a ring around the view axis.
//                      Ridges now point at the vanishing point; the same band occlusion holds
//    1.44   DOT        a small signal dot is born at the vanishing point, in a tight glow
//    1.47+  DRAIN      rings contract into it (far rings first), whirling in on spiral paths as
//                      they near the centre and heating bone → signal; the last lands at 1.815
//    1.826  POP        the dot pops to 18 on the last (nearest) ring, settles to r=14
//    1.845+ CONTRACT   ink + signal dot r=14 at (960,540), nothing else (frames 561–562)
//
//  Brightness is tiered by depth (near: bone, α 1, r 3.5–5 · mid: bone2, α .7, r 2.5 · far: gray,
//  α .35, r 1.2), ~8% signal accents at full saturation, 5 lime sparks. Ridge lines ≈1.75 px bone,
//  α .9 at the front → .25 at the back. No depth-of-field blur: depth reads through the tiers.
//
//  Rhythm: every beat gets a 120 ms inhale (−4%) → spring kick, plus an energy flash. Each
//  morph's steepest point sits on its beat.
//
//  Rendering: hand-rolled perspective camera (dolly, roll, yaw sway). Particles are evaluated at
//  t and one motion-blur sub-sample earlier (api.subDt) and drawn as discs stretched along that
//  path, so the engine's sub-samples fuse into streaks. Dots are drawImage calls from one sprite
//  atlas (they batch on the GPU canvas; round-capped strokes and multi-arc paths did not). The
//  burst flash and shock rings are timed by the output frame (crisp graphics, no smear); the
//  line work gets more sub-samples where it moves fastest (samplesAt).
//  api.detail < 1 (multiverse panels) thins particles and line work and drops the callouts.
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
  const rgba = R.col.rgba;

  // ═════════════════════════════ timing (local seconds) ═════════════════════════════
  const B1 = BEAT, B2 = BEAT * 2, B3 = BEAT * 3, END = BEAT * 4; // .46875 .9375 1.40625 1.875
  const T_BURST = -0.002;   // detonation precedes the cut: f450's first sub-sample is already in flight
  const SUB_FALLBACK = 1 / 480; // streak length when the render has no motion blur (stills)
  const D_AB = 0.26, D_BC = 0.24, D_CD = 0.22; // morph durations (per particle / row, before stagger)
  const BC_SPREAD = 0.12;   // terrain unroll stagger, back rows → front rows
  const CD_SPREAD = 0.08;   // tunnel curl stagger, far rows → near rows
  const D_CL = 0.22;        // each particle's drain flight (expoIn), ending at its arrival TA[i]
  const CL_SPREAD = 0.11;   // drain arrivals: far ring … near ring
  const TC1 = 1.815;        // last arrival (nearest ring) — the dot pops on it
  const TC0 = TC1 - CL_SPREAD - 0.02 - D_CL; // first departure
  const T_DOT0 = 1.44, T_DOTPK = 1.826, T_CLEAN = 1.845; // signal dot: born at the vanishing point → pops → settled

  // ═════════════════════════════ geometry ═════════════════════════════
  const N = 1400, COLS = 56, ROWS = 25;   // N = COLS × ROWS: every particle owns one terrain cell
  const F = 1200;                          // focal length (px)
  const R_S = 330;                         // sphere radius
  const RT = 255, RTUBE = 100;             // torus major / tube radius
  const SX = 34, ZF = -760, ZN = 520;      // terrain: column pitch, far/near row depth
  const THETA = 0.52;                      // terrain tilt toward camera (≈30° elevation)
  const T_YOFF = -40;                      // terrain vertical placement
  const RHO = (COLS * SX) / TAU;           // tunnel radius: a row's length wraps exactly once (303)
  const ZT0 = -1000, ZT1 = 560;            // tunnel ring depth: far row … near row
  const ACCENT_A = 8, ACCENT_B = 17;       // rows drawn in signal (a highlighted series)

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
    SZ[i] = 0.82 + rng() * 0.36;
    JIT[i] = rng();
    LIFT[i] = 70 + rng() * 90;
    CLS[i] = rng() < 1 / 12 ? 1 : 0;
  }
  // A few lime sparks — they fly furthest on the burst.
  for (let k = 0; k < 5; k++) {
    const i = Math.floor(((k + 0.5) / 5) * N + (rng() - 0.5) * 120);
    CLS[i] = 2; OV[i] = 0.55 + rng() * 0.2; SZ[i] = 1.1;
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
  // Everything that depends only on time (not on the particle). Computed for t and t − sub.
  const G0 = {}, G1 = {};

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
    // terrain: slow yaw drift = parallax (unwinds as the rows roll up into the tunnel)
    g.yawT = lerp(-0.2, 0.12, E.sineInOut(seg(t, B2 - 0.25, B3 + 0.2)));
    g.cyT = Math.cos(g.yawT); g.syT = Math.sin(g.yawT);
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
    // camera: slow dolly-in across the bar, plus a push into the tunnel
    g.camZ = lerp(1330, 1150, E.sineInOut(seg(t, 0, END))) - 70 * E.sineInOut(seg(t, B3 - 0.1, END));
    const cyaw = 0.1 * Math.sin(t * 1.4 + 0.5) * (1 - 0.75 * smoothstep(B3 - 0.1, B3 + 0.15, t)), croll = lerp(0.05, -0.05, E.sineInOut(seg(t, 0, END)));
    g.cyC = Math.cos(cyaw); g.syC = Math.sin(cyaw);
    g.czC = Math.cos(croll); g.szC = Math.sin(croll);
  }

  // Per-particle morph weights.
  const mixAB = (i, t) => E.snap(seg(t, AB0[i], AB0[i] + D_AB));
  const mixBC = (i, t) => E.snap(seg(t, BC0[i], BC0[i] + D_BC));
  const mixCD = (i, t) => E.snap(seg(t, CD0[i], CD0[i] + D_CD)); // per row: rows bend as one curve
  const collapseK = (i, t) => E.expoIn(seg(t, TA[i] - D_CL, TA[i]));

  // Terrain height (up = +). Unknown-Pleasures envelope: ridges concentrate in the centre columns;
  // as the row rolls up into a ring (m → 1) the envelope evens out around the circumference.
  function terrainH(gx, gz, t, m) {
    let env = Math.exp(-(gx * gx) / (300 * 300)) * 0.9 + 0.1;
    if (m > 0) env = lerp(env, env * 0.55 + 0.1, m);
    const n1 = R.noise2(gx * 0.0046 + 3.1, gz * 0.0068 - t * 1.7);
    const n2 = R.noise2(gx * 0.011 - 7.3, gz * 0.015 - t * 2.3);
    let ridge = n1 * 0.68 + n2 * 0.32 + 0.32;
    ridge = ridge > 0 ? ridge * ridge * 1.6 : 0;
    const wave = Math.sin(gz * 0.0125 - t * 7.2 + gx * 0.0021);
    return env * (150 * ridge + 26 * (wave * 0.5 + 0.5)) + 5 * R.noise2(gx * 0.02, gz * 0.02 + t);
  }

  // ═════════════════════════════ particle placement ═════════════════════════════
  // Computes the camera-space position of particle i at time t (globals g) and projects it.
  // out: [0,1] screen x/y · [2] perspective scale · [3] camera distance · [4] drain progress ·
  // [5] lighting · [6,7] screen x/y of the particle's ground point (height 0) in the landscape /
  // tunnel — the lower edge of its row's occluding "mountain band".
  const OUT = new Float64Array(8);
  const LX = -0.45, LY = -0.62, LZ = 0.64; // key light, upper-left-front (y down), unit length
  const TW = new Float64Array(6);          // terrain/tunnel scratch: ridge xyz, ground xyz

  // Landscape → tunnel surface. Row-local frame: u along the row, v up, w depth. The row bends
  // with curvature m / RHO (a true bend: arc length is preserved, so at m = 1 it closes into a
  // ring exactly), then un-yaws, un-tilts and centres itself on the view axis.
  function terrainWorld(i, t, g, m) {
    const gx = (COL[i] - (COLS - 1) / 2) * SX;
    const rf = ROW[i] / (ROWS - 1);
    const gz = lerp(ZF, ZN, rf);
    const h = terrainH(gx, gz, t, m) * (1 - 0.35 * m);
    const w = m > 0 ? lerp(gz, lerp(ZT0, ZT1, rf), m) : gz;
    let u, v, u0, v0;
    if (m < 1e-4) { u = gx; v = h; u0 = gx; v0 = 0; } else {
      const k = m / RHO, a = k * gx, sa = Math.sin(a), ca = Math.cos(a);
      u0 = sa / k; v0 = (1 - ca) / k;
      u = u0 - h * sa; v = v0 + h * ca;
    }
    let cyw = g.cyT, syw = g.syT, cth = Math.cos(THETA), sth = Math.sin(THETA), yoff = T_YOFF;
    if (m > 0) {
      const yaw = g.yawT * (1 - m), th = THETA * (1 - m);
      cyw = Math.cos(yaw); syw = Math.sin(yaw); cth = Math.cos(th); sth = Math.sin(th);
      yoff = lerp(T_YOFF, RHO, m);
    }
    let x1 = u * cyw + w * syw, z1 = -u * syw + w * cyw;
    TW[0] = x1; TW[1] = -v * cth + z1 * sth + yoff; TW[2] = v * sth + z1 * cth;
    x1 = u0 * cyw + w * syw; z1 = -u0 * syw + w * cyw;
    TW[3] = x1; TW[4] = -v0 * cth + z1 * sth + yoff; TW[5] = v0 * sth + z1 * cth;
  }

  function place(i, t, g, out, wantBase) {
    let x = 0, y = 0, z = 0, lit = 1;
    const mBC = t < B2 - 0.2 ? 0 : mixBC(i, t);
    const mCD = t < B3 - 0.25 ? 0 : mixCD(i, t);

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

    // ── C · terrain → D · tunnel (world)
    let bx = 0, by = 0, bz = 0, base = false;
    if (mBC > 0) {
      terrainWorld(i, t, g, mCD);
      if (mBC < 1) {
        const lift = LIFT[i] * Math.sin(PI * mBC); // tossed up and laid down
        x = lerp(x, TW[0], mBC); y = lerp(y, TW[1], mBC) - lift; z = lerp(z, TW[2], mBC);
        lit = lerp(lit, 1, mBC);
      } else {
        x = TW[0]; y = TW[1]; z = TW[2]; lit = 1;
        if (wantBase) { bx = TW[3]; by = TW[4]; bz = TW[5]; base = true; }
      }
    }
    if (!base) { bx = x; by = y; bz = z; }

    // ── beat pulse about the origin
    const pu = g.pulse;
    x *= pu; y *= pu; z *= pu; bx *= pu; by *= pu; bz *= pu;

    // ── camera: yaw → roll
    let cx = x * g.cyC + z * g.syC, cz = -x * g.syC + z * g.cyC, cy = y;
    let rx = cx * g.czC - cy * g.szC; cy = cx * g.szC + cy * g.czC; cx = rx;
    let qx = bx * g.cyC + bz * g.syC, qz = -bx * g.syC + bz * g.cyC, qy = by;
    rx = qx * g.czC - qy * g.szC; qy = qx * g.szC + qy * g.czC; qx = rx;

    // ── drain (camera space). Radius shrinks by (1 − k) while the angle advances by
    // w·(−ln(1 − k) − k): a log spiral with its linear term removed, so a big ring first contracts
    // cleanly (a ring spinning about its own centre only smears) and the whirl builds as it nears
    // the centre. Staggered arrivals (far rings first) wind the tunnel into a vortex.
    const ck = t < TC0 - 0.01 ? 0 : collapseK(i, t);
    if (ck > 0) {
      const k = 1 - ck;
      const a = 1.6 * (-Math.log(1 - 0.985 * ck) - 0.985 * ck);
      const ca = Math.cos(a) * k, sa = Math.sin(a) * k;
      let tx = cx * ca - cy * sa; cy = cx * sa + cy * ca; cx = tx; cz *= k;
      tx = qx * ca - qy * sa; qy = qx * sa + qy * ca; qx = tx; qz *= k;
    }

    // ── project
    const d = Math.max(1, g.camZ - cz), s = F / d;
    out[0] = CX + cx * s; out[1] = CY + cy * s; out[2] = s; out[3] = d; out[4] = ck; out[5] = lit;
    const sb = F / Math.max(1, g.camZ - qz);
    out[6] = CX + qx * sb; out[7] = CY + qy * sb;
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
      // terrain unrolls far → near; the tunnel curl sweeps far → near (no per-particle jitter:
      // a row bends as one smooth curve)
      BC0[i] = B2 - 0.46 * D_BC + (rf - 0.5) * BC_SPREAD + (JIT[i] - 0.5) * 0.02;
      CD0[i] = B3 - 0.46 * D_CD + (rf - 0.5) * CD_SPREAD;
      // Drain arrivals: far rings first, the nearest ring last (the dot pops on it). The bottom
      // of each ring (centre columns) leads a touch, so rings wind in as spirals, not circles.
      const axial = 1 - Math.abs((COL[i] - (COLS - 1) / 2) / ((COLS - 1) / 2));
      TA[i] = TC1 - CL_SPREAD * (1 - rf) - 0.014 * axial - 0.006 * JIT[i];
    }
  })();

  // ═════════════════════════════ colour tables + dot atlas ═════════════════════════════
  // Every dot is a drawImage from one sprite atlas (a disc per colour, at two sizes). On the GPU
  // canvas that is the cheap path: the draws batch into one textured-quad op, and a streak is the
  // same disc stretched along its motion. (One path with many arcs, or a round-capped stroke per
  // particle, both cost ~10× more here.)
  const hex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const mixHex = (a, b, k) => hex(R.col.rgb(a).map((v, j) => lerp(v, R.col.rgb(b)[j], k)));
  const TIERS = 8; // depth tiers: gray (far) → bone2 (mid) → bone (near)
  const COLTAB = [];
  for (let k = 0; k < TIERS; k++) {
    const q = k / (TIERS - 1);
    COLTAB.push(q < 0.5 ? mixHex(P.gray, P.bone2, q / 0.5) : mixHex(P.bone2, P.bone, (q - 0.5) / 0.5));
  }
  const C_SIG = COLTAB.length; COLTAB.push(P.signal);
  const C_LIME = COLTAB.length; COLTAB.push(P.lime);
  const C_DUST = COLTAB.length; COLTAB.push(P.bone2);
  const HEATS = 10, C_HEAT = COLTAB.length; // bone → signal as the drain heats up
  for (let k = 0; k < HEATS; k++) COLTAB.push(mixHex(P.bone, P.signal, (k + 1) / HEATS));
  const NCOL = COLTAB.length;
  const SKIP = 0xff;
  const lutHeat = Array.from({ length: 16 }, (_, k) => mixHex(P.bone, P.signal, k / 15));
  // Atlas: row 0 = large discs (cell 16, radius 6.5) for r ≥ 1.8; row 1 = small (cell 8, r 3).
  const CL = 16, RL = 6.5, CS = 8, RS = 3;
  let ATLAS = null;
  function atlas() {
    if (ATLAS) return ATLAS;
    ATLAS = document.createElement('canvas');
    ATLAS.width = CL * NCOL; ATLAS.height = CL + CS;
    const c = ATLAS.getContext('2d');
    COLTAB.forEach((col, k) => {
      c.fillStyle = col;
      c.beginPath(); c.arc(k * CL + CL / 2, CL / 2, RL, 0, TAU); c.fill();
      c.beginPath(); c.arc(k * CL + CS / 2, CL + CS / 2, RS, 0, TAU); c.fill();
    });
    return ATLAS;
  }

  // ═════════════════════════════ depth context: far dust ═════════════════════════════
  // A static field of far specks the camera moves through: parallax against the formations.
  // (The old near "bokeh motes" are gone — they read as sensor dust.)
  const DUST = Array.from({ length: 170 }, () => ({
    x: (rng() - 0.5) * 4800, y: (rng() - 0.5) * 2800, z: -900 - rng() * 1900,
    r: 0.55 + rng() * 0.6, a: 0.1 + rng() * 0.3,
  }));
  function drawDust(ctx, g, alpha, sizeK) {
    if (alpha <= 0.003) return;
    const A = atlas(), sx = C_DUST * CL;
    for (const d of DUST) {
      const cx = d.x * g.cyC + d.z * g.syC, cz = -d.x * g.syC + d.z * g.cyC;
      const rx = cx * g.czC - d.y * g.szC, ry = cx * g.szC + d.y * g.czC;
      const s = F / Math.max(40, g.camZ - cz);
      const x = CX + rx * s, y = CY + ry * s;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const q = (d.r * sizeK * (CS / 2)) / RS;
      ctx.globalAlpha = (d.a * 0.8 + 0.05) * alpha;
      ctx.drawImage(A, sx, CL, CS, CS, x - q, y - q, 2 * q, 2 * q);
    }
  }

  // ═════════════════════════════ frame buffers ═════════════════════════════
  const X0 = new Float32Array(N), Y0 = new Float32Array(N), S0 = new Float32Array(N), D0 = new Float32Array(N);
  const X1 = new Float32Array(N), Y1 = new Float32Array(N), CK = new Float32Array(N), LIT = new Float32Array(N);
  const BX = new Float32Array(N), BY = new Float32Array(N);
  const CIDX = new Uint8Array(N), RAD = new Float32Array(N), ALPHA = new Float32Array(N);
  const ORDER = new Uint16Array(N), ROWIDX = new Uint16Array(COLS);

  // ═════════════════════════════ drawing helpers ═════════════════════════════
  // Background: ink with a breathing ink2 glow at the centre, as an OPAQUE gradient (the stops
  // are pre-mixed), so the ridge occluders fill with the very same paint in a single pass.
  // (Not a 'lighter' overlay: on this GPU path that composite reads back a stale destination.)
  function glowGradient(ctx, a) {
    const g = ctx.createRadialGradient(CX, CY - 40, 0, CX, CY - 40, 900);
    g.addColorStop(0, R.col.mix(P.ink, P.ink2, a));
    g.addColorStop(0.55, R.col.mix(P.ink, P.ink2, a * 0.45));
    g.addColorStop(1, P.ink);
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
      const y1 = -z1 * g.sx1; z1 = z1 * g.cx1;
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

  // Row points (screen space) for row r from arrays XA/YA into OX/OY. `span` 0..1 trims the row
  // symmetrically from the centre column outward (AE Trim Paths) with fractional end points.
  const RP_X = new Float32Array(COLS + 2), RP_Y = new Float32Array(COLS + 2);
  const RB_X = new Float32Array(COLS + 2), RB_Y = new Float32Array(COLS + 2);
  function rowPts(r, span, XA, YA, OX, OY) {
    const base = r * COLS, cm = (COLS - 1) / 2;
    let n = 0;
    const push = (c, f) => {
      const i = GRID[base + c];
      if (f <= 0) { OX[n] = XA[i]; OY[n] = YA[i]; } else {
        const j = GRID[base + c + 1];
        OX[n] = lerp(XA[i], XA[j], f); OY[n] = lerp(YA[i], YA[j], f);
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
    return n;
  }
  // Catmull-Rom through the points (as cubic Béziers), so every dot sits exactly on its line:
  // open, or closed into a loop.
  function smoothOpen(ctx, X, Y, n) {
    ctx.moveTo(X[0], Y[0]);
    for (let k = 0; k < n - 1; k++) {
      const a = k > 0 ? k - 1 : 0, d = k + 2 < n ? k + 2 : n - 1;
      ctx.bezierCurveTo(X[k] + (X[k + 1] - X[a]) / 6, Y[k] + (Y[k + 1] - Y[a]) / 6,
        X[k + 1] - (X[d] - X[k]) / 6, Y[k + 1] - (Y[d] - Y[k]) / 6, X[k + 1], Y[k + 1]);
    }
  }
  function smoothClosed(ctx, X, Y, n) {
    ctx.moveTo(X[0], Y[0]);
    for (let k = 0; k < n; k++) {
      const a = (k + n - 1) % n, b = (k + 1) % n, d = (k + 2) % n;
      ctx.bezierCurveTo(X[k] + (X[b] - X[a]) / 6, Y[k] + (Y[b] - Y[a]) / 6,
        X[b] - (X[d] - X[k]) / 6, Y[b] - (Y[d] - Y[k]) / 6, X[b], Y[b]);
    }
    ctx.closePath();
  }

  // Ridge draw-on: each row trims on from the centre as its particles land (back rows first).
  const rowSpan = (r, t) => { const t0 = B2 - 0.46 * D_BC + 0.7 * D_BC + (r / (ROWS - 1) - 0.5) * BC_SPREAD; return E.expoOut(seg(t, t0, t0 + 0.22)); };

  // ═════════════════════════════ callouts (the reel's mono annotation language) ═════════════════
  const SCRAMBLE = '<>/\\[]{}=+*#%01';
  const mono = (ctx, size, spacing, weight = 500) => R.font(ctx, { family: 'JetBrains Mono', weight, size, spacing, align: 'left' });
  // Characters decode left → right through a short scramble (seeded by the output frame, so all
  // motion-blur sub-samples of a frame agree); on the way out they scramble away right → left.
  function decode(str, lt, tIn, tOut, fr, per = 0.008, hold = 0.03) {
    let s = '';
    const n = str.length;
    for (let i = 0; i < n; i++) {
      const ch = str[i];
      const a = tIn + i * per, b = tOut + (n - 1 - i) * per * 0.7;
      if (lt < a || lt >= b + hold) s += ' ';
      else if (ch !== ' ' && (lt < a + hold || lt >= b)) s += SCRAMBLE[Math.floor(R.hash(i * 13.7 + fr * 1.37) * SCRAMBLE.length)];
      else s += ch;
    }
    return s;
  }
  // A callout is a polyline (anchor … elbow … end) drawn on with a trim from the anchor, a node on
  // the anchor, an end tick, and a mono label (gray tag + bone value) sitting on the horizontal run.
  const CO = [
    { t0: 0.12, t1: 0.42, tag: 'R', val: '330' },   // sphere radius (a dimension line from the centre)
    { t0: 0.56, t1: 0.82, tag: 'N', val: '1400' },  // particle count, on the torus rim
    { t0: 1.00, t1: 1.28, tag: 'Z', val: '−760' }, // far plane, on the back ridge
  ];
  function drawCallout(ctx, lt, fr, c, pts, nodeK, dir) {
    const tin = seg(lt, c.t0, c.t0 + 0.16), tout = seg(lt, c.t1, c.t1 + 0.1);
    if (tin <= 0 || tout >= 1) return;
    let L = 0;
    const acc = [0];
    for (let k = 1; k < pts.length; k++) { L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); acc.push(L); }
    const head = E.expoOut(tin) * L, tail = E.expoIn(tout) * L;
    const at = (s) => {
      let k = 1;
      while (k < pts.length - 1 && acc[k] < s) k++;
      const u = clamp((s - acc[k - 1]) / Math.max(1e-6, acc[k] - acc[k - 1]));
      return [lerp(pts[k - 1][0], pts[k][0], u), lerp(pts[k - 1][1], pts[k][1], u)];
    };
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rgba(P.bone, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const p0 = at(tail);
    ctx.moveTo(p0[0], p0[1]);
    for (let k = 1; k < pts.length - 1; k++) if (acc[k] > tail && acc[k] < head) ctx.lineTo(pts[k][0], pts[k][1]);
    const p1 = at(head);
    ctx.lineTo(p1[0], p1[1]);
    ctx.stroke();
    // node on the anchor: bone dot inside a hairline ring
    const pop = E.backOut(seg(lt, c.t0, c.t0 + 0.12), 2.4) * (1 - E.quadIn(seg(lt, c.t1, c.t1 + 0.07)));
    if (pop > 0.02) {
      const [nx, ny] = pts[nodeK];
      ctx.fillStyle = P.bone;
      ctx.beginPath(); ctx.arc(nx, ny, 2.6 * pop, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(P.bone, 0.55);
      ctx.beginPath(); ctx.arc(nx, ny, 7 * pop, 0, TAU); ctx.stroke();
    }
    // end tick
    const [ex, ey] = pts[pts.length - 1];
    const tick = E.expoOut(seg(lt, c.t0 + 0.08, c.t0 + 0.18)) * (1 - E.expoIn(tout));
    if (tick > 0.02) {
      ctx.strokeStyle = rgba(P.bone, 0.55);
      ctx.beginPath(); ctx.moveTo(ex, ey - 4 * tick); ctx.lineTo(ex, ey + 4 * tick); ctx.stroke();
    }
    // label: sits on the run, flush with its outer end
    mono(ctx, 15, 2);
    const tagW = ctx.measureText(c.tag + ' ').width;
    mono(ctx, 15, 1);
    const valW = ctx.measureText(c.val).width;
    const tw = tagW + valW;
    const x0 = dir > 0 ? ex - tw - 2 : ex + 3;
    const yb = ey - 9;
    const tIn = c.t0 + 0.06, tOut = c.t1 - 0.02;
    mono(ctx, 15, 2);
    ctx.fillStyle = P.gray;
    ctx.fillText(decode(c.tag, lt, tIn, tOut + 0.02, fr), x0, yb);
    mono(ctx, 15, 1);
    ctx.fillStyle = P.bone;
    ctx.fillText(decode(c.val, lt, tIn + 0.02, tOut, fr), x0 + tagW, yb);
  }

  // Screen projection of an object-space point through the sphere/torus transform + camera.
  function projObj(g, px, py, pz) {
    let x1 = px * g.cy1 + pz * g.sy1, z1 = -px * g.sy1 + pz * g.cy1;
    const y1 = py * g.cx1 - z1 * g.sx1; z1 = py * g.sx1 + z1 * g.cx1;
    let x = (x1 * g.cz1 - y1 * g.sz1) * g.pulse, y = (x1 * g.sz1 + y1 * g.cz1) * g.pulse; z1 *= g.pulse;
    let cx = x * g.cyC + z1 * g.syC; const cz = -x * g.syC + z1 * g.cyC;
    const rx = cx * g.czC - y * g.szC; const cy = cx * g.szC + y * g.czC; cx = rx;
    const s = F / (g.camZ - cz);
    return [CX + cx * s, CY + cy * s];
  }

  function drawCallouts(ctx, lt, api, g) {
    const fr = Math.round((api.frameT ?? api.t) * 60);
    // 1 · sphere radius: dimension line from the centre to the silhouette, then the leader
    if (lt > CO[0].t0 && lt < CO[0].t1 + 0.12) {
      const rb = R_S * g.pulse * E.expoOut(clamp((lt - T_BURST) / 0.37));
      const rs = (F * rb) / Math.sqrt(g.camZ * g.camZ - rb * rb);
      const a = -0.62;
      const rx = CX + Math.cos(a) * rs, ry = CY + Math.sin(a) * rs;
      const ex = rx + 30, ey = ry - 30;
      drawCallout(ctx, lt, fr, CO[0], [[CX, CY], [rx, ry], [ex, ey], [ex + 118, ey]], 1, 1);
      // centre cross
      const k = E.expoOut(seg(lt, CO[0].t0, CO[0].t0 + 0.12)) * (1 - E.expoIn(seg(lt, CO[0].t1, CO[0].t1 + 0.1)));
      if (k > 0.02) {
        ctx.strokeStyle = rgba(P.bone, 0.55);
        ctx.beginPath();
        ctx.moveTo(CX - 7 * k, CY); ctx.lineTo(CX + 7 * k, CY);
        ctx.moveTo(CX, CY - 7 * k); ctx.lineTo(CX, CY + 7 * k);
        ctx.stroke();
      }
    }
    // 2 · particle count, on the torus's leftmost outer rim point (stable: the torus is symmetric
    // about its axis, so spin and flow never move its silhouette)
    if (lt > CO[1].t0 && lt < CO[1].t1 + 0.12) {
      let best = null;
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * TAU;
        const p = projObj(g, Math.cos(a) * (RT + RTUBE), 0, Math.sin(a) * (RT + RTUBE));
        if (!best || p[0] < best[0]) best = p;
      }
      const [ax, ay] = best;
      const ex = ax - 34, ey = ay - 34;
      drawCallout(ctx, lt, fr, CO[1], [[ax, ay], [ex, ey], [ex - 128, ey]], 0, -1);
    }
    // 3 · far plane: the node tracks a point on the back ridge, left of centre; the label hangs
    // off that point's ground line, so the type never bobs with the ridge
    if (lt > CO[2].t0 && lt < CO[2].t1 + 0.12) {
      const i = GRID[0 * COLS + 13];
      const ax = X0[i], ay = Y0[i];
      const ex = BX[i] - 44, ey = BY[i] - 60;
      drawCallout(ctx, lt, fr, CO[2], [[ax, ay], [ex, ey], [ex - 128, ey]], 0, -1);
    }
  }

  // ═════════════════════════════ scene ═════════════════════════════
  R.scene({
    id: 's4',
    shake: 0.8,
    // Line work and rings can't self-blur like the particles do (they size their streaks by
    // api.subDt), so the fastest stretches get more sub-samples: the burst frames (f450–452), the
    // tunnel curl (row ends sweep ~30 px per sub-sample at 4) and the late drain.
    samplesAt: (lt) => (lt < 0.045 ? 16 : lt > 1.31 && lt < 1.52 ? 16 : lt > 1.69 && lt < 1.82 ? 12 : 4),
    render(ctx, lt, api) {
      const detail = api.detail ?? 1;
      const t = lt;
      const SUB = api.subDt > 0 ? api.subDt : SUB_FALLBACK;

      // Contract pin at the out-edge: cancel the (tiny) residual hit shake so the dot is exact.
      // The in-edge is an impact frame, so it keeps the engine's hit shake.
      const pinOut = smoothstep(T_CLEAN - 0.03, T_CLEAN, t);
      if (pinOut > 0 && detail === 1) R.unshake(ctx, api, pinOut);

      // ── contract states (a panel can still ask for lt < T_BURST) ─────────────
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
      const tb = t - T_BURST;

      // ── background glow + far dust ─────────────────────────────────────────
      const glowA = smoothstep(0, 0.32, t) * (1 - smoothstep(1.62, 1.8, t));
      const bgPaint = glowA > 0.002 ? glowGradient(ctx, 0.9 * glowA) : P.ink;
      if (glowA > 0.002) { ctx.globalAlpha = 1; ctx.fillStyle = bgPaint; ctx.fillRect(-200, -200, W + 400, H + 400); }
      const atmoA = smoothstep(0.04, 0.3, t) * (1 - smoothstep(1.5, 1.68, t));
      drawDust(ctx, g, atmoA, detail >= 0.99 ? 1 : 1.6);

      // ── vanishing point: a tight signal glow around the dot that waits at the tunnel's end ──
      const coreA = smoothstep(1.46, 1.7, t) * (1 - smoothstep(1.8, 1.835, t));
      if (coreA > 0.003) {
        const rr = lerp(60, 90, E.quadIn(seg(t, 1.46, 1.8)));
        const cg = ctx.createRadialGradient(CX, CY, 0, CX, CY, rr);
        cg.addColorStop(0, rgba(P.signal, 0.5 * coreA));
        cg.addColorStop(0.18, rgba(P.signal, 0.28 * coreA));
        cg.addColorStop(0.5, rgba(P.signal, 0.06 * coreA));
        cg.addColorStop(1, rgba(P.signal, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = cg;
        ctx.fillRect(CX - rr, CY - rr, rr * 2, rr * 2);
      }

      // ── place every particle (now + one sub-sample ago) ────────────────────
      const s0 = F / g.camZ;
      const alive = t < TC1;
      // Occlusion (mountain bands) from the settled landscape through the tunnel and the drain.
      const occA = smoothstep(B2 + 0.1, B2 + 0.24, t) * (1 - smoothstep(1.785, 1.81, t));
      if (alive) {
        const wantBase = occA > 0.01;
        for (let i = 0; i < N; i++) {
          place(i, t, g, OUT, wantBase);
          X0[i] = OUT[0]; Y0[i] = OUT[1]; S0[i] = OUT[2]; D0[i] = OUT[3]; CK[i] = OUT[4]; LIT[i] = OUT[5];
          BX[i] = OUT[6]; BY[i] = OUT[7];
          place(i, t - SUB, gp, OUT, false);
          X1[i] = OUT[0]; Y1[i] = OUT[1];
        }
      }

      // ── burst: flash disc, screen-space shock rings, equatorial rings ──────
      // The flash and the screen-space rings are flat graphics: they are timed by the OUTPUT frame
      // (api.frameT), so each frame shows one crisp ring instead of a grey motion-blur smear.
      const fb = detail === 1 && api.frameT != null ? api.frameT - api.start - T_BURST : tb;
      if (tb < 0.6) {
        // flash disc: the dot's energy, released on the cut frame. Solid on f450, then it opens
        // from the centre into a thinning ring (f451–452) that the particles fly out of.
        const fu = seg(fb, 0, 0.034);
        if (fu < 1) {
          const ro = 120 + 60 * E.expoOut(seg(fb, 0, 0.05));
          const ri = ro * E.expoOut(seg(fb, 0.009, 0.034));
          ctx.globalAlpha = 1;
          ctx.fillStyle = P.bone;
          ctx.beginPath();
          ctx.arc(CX, CY, ro, 0, TAU);
          if (ri > 0.5) { ctx.moveTo(CX + ri, CY); ctx.arc(CX, CY, ri, 0, TAU, true); }
          ctx.fill();
        }
        // shock ring: bone, r 300 → 700 (half-way by f452), thinning and fading as it goes
        const su = seg(fb, 0, 0.1);
        if (su < 1) {
          ctx.globalAlpha = Math.pow(1 - su, 1.2);
          ctx.strokeStyle = P.bone;
          ctx.lineWidth = lerp(7, 1.2, E.quadOut(su));
          ctx.beginPath(); ctx.arc(CX, CY, 300 + 400 * E.quadOut(su), 0, TAU); ctx.stroke();
        }
        // signal echo, a beat behind
        const eu = seg(fb, 0.004, 0.12);
        if (eu > 0 && eu < 1) {
          ctx.globalAlpha = 0.85 * Math.pow(1 - eu, 1.5);
          ctx.strokeStyle = P.signal;
          ctx.lineWidth = lerp(4, 1, eu);
          ctx.beginPath(); ctx.arc(CX, CY, 210 + 300 * E.quadOut(eu), 0, TAU); ctx.stroke();
        }
        const u1 = seg(tb, 0, 0.55), u2 = seg(tb, 0.05, 0.55);
        drawRing(ctx, g, R_S * 1.7 * E.expoOut(u1), P.bone, 0.6 * Math.pow(1 - u1, 1.6), 1.8 - u1);
        drawRing(ctx, g, R_S * 1.25 * E.expoOut(u2), P.signal, 0.75 * Math.pow(1 - u2, 1.4), 1.4);
      }

      if (alive) {
        const stride = detail >= 0.99 ? 1 : Math.max(1, Math.round(1 / clamp(detail * 1.6, 0.2, 1)));
        const sizeK = detail >= 0.99 ? 1 : Math.min(2.2, 1 / Math.sqrt(Math.max(0.2, detail)));
        // Line work: ridge lines, revealed per row by rowSpan (trim-on); each ring fades as it lands.
        const lineA = smoothstep(B2 - 0.04, B2 + 0.04, t);
        const heatT = seg(t, 1.765, 1.81); // rings heat as they drain; the last ones go signal on landing
        const flash = g.flash;

        // ── per-particle draw params: colour (atlas cell), radius, alpha
        const prep = (i) => {
          const ck = CK[i];
          if (ck > 0.985) { CIDX[i] = SKIP; return; }
          const sRel = S0[i] / s0;
          const q = clamp((sRel - 0.82) / 0.46); // depth tier: 0 far … 1 near
          let a, r;
          if (q < 0.5) { const u = q / 0.5; a = lerp(0.35, 0.7, u); r = lerp(1.2, 2.5, u); }
          else { const u = (q - 0.5) / 0.5; a = lerp(0.7, 1, u); r = lerp(2.5, 4.6, u); }
          r *= SZ[i];
          a *= clamp(0.62 + 0.4 * LIT[i], 0.78, 1);
          a = Math.min(1, a + 0.45 * flash * (1 - q));
          r *= (1 + 0.25 * flash) * (1 - 0.45 * ck) * sizeK * (1 - 0.3 * occA);
          const heat = Math.max(smoothstep(0.12, 0.55, ck), heatT);
          let c;
          if (CLS[i] === 2 && heat < 0.5) { c = C_LIME; r = Math.max(r, 2.2); a = 1; }
          else if (CLS[i] === 1 || heat > 0.97) { c = C_SIG; a = Math.max(a, lerp(0.6, 1, q)); r = Math.max(r, 1.8); }
          else if (heat > 0.05) { c = C_HEAT + Math.min(HEATS - 1, Math.floor(heat * HEATS)); a = Math.max(a, heat * 0.95); }
          else c = Math.round(q * (TIERS - 1));
          if (CLS[i] === 0 && heat < 0.05) a *= 1 - 0.3 * occA; // in the landscape the lines lead
          r = r < 0.6 ? 0.6 : r;
          const dx = X0[i] - X1[i], dy = Y0[i] - Y1[i], d2 = dx * dx + dy * dy;
          // streaks: keep them punchy, but let long ones thin out (sqrt energy falloff)
          if (d2 > 0.36) a *= Math.sqrt((2 * r + 2) / (2 * r + 2 + Math.sqrt(d2)));
          if (a < 0.01) { CIDX[i] = SKIP; return; }
          CIDX[i] = c; RAD[i] = r; ALPHA[i] = a;
        };
        // Draw a list of particles from the atlas. A moving dot is the disc stretched from its
        // sub-sample-earlier position to now (the engine's samples fuse these into streaks).
        const A = atlas();
        const BT = ctx.getTransform();
        const drawList = (list, n) => {
          let rot = false;
          for (let k = 0; k < n; k++) {
            const i = list[k], c = CIDX[i];
            if (c === SKIP) continue;
            ctx.globalAlpha = ALPHA[i];
            const x = X0[i], y = Y0[i], r = RAD[i];
            const big = r >= 1.8, cell = big ? CL : CS, sy = big ? 0 : CL, kk = big ? CL / 2 / RL : CS / 2 / RS;
            const dx = x - X1[i], dy = y - Y1[i], d2 = dx * dx + dy * dy;
            if (d2 > 0.36) {
              const l = Math.sqrt(d2), ca = dx / l, sa = dy / l, mx = (x + X1[i]) * 0.5, my = (y + Y1[i]) * 0.5;
              ctx.setTransform(BT.a * ca + BT.c * sa, BT.b * ca + BT.d * sa, -BT.a * sa + BT.c * ca, -BT.b * sa + BT.d * ca,
                BT.a * mx + BT.c * my + BT.e, BT.b * mx + BT.d * my + BT.f);
              rot = true;
              const hw = (l * 0.5 + r) * kk, hh = r * kk;
              ctx.drawImage(A, c * CL, sy, cell, cell, -hw, -hh, 2 * hw, 2 * hh);
            } else {
              if (rot) { ctx.setTransform(BT); rot = false; }
              const q = r * kk;
              ctx.drawImage(A, c * CL, sy, cell, cell, x - q, y - q, 2 * q, 2 * q);
            }
          }
          if (rot) ctx.setTransform(BT);
        };

        // ── row styling
        const rowState = (r) => {
          const i = GRID[r * COLS + (COLS >> 1)];
          const m = t < B3 - 0.25 ? 0 : mixCD(i, t);
          return { i, m, closed: m > 0.999 && rowSpan(r, t) >= 1 };
        };
        const strokeRow = (r, st) => {
          const i = st.i;
          const sRel = S0[i] / s0;
          const q = clamp((sRel - 0.62) / 0.9);
          const ck = CK[i];
          const accent = r === ACCENT_A || r === ACCENT_B;
          const land = 1 - smoothstep(0.82, 0.97, ck);
          const a = lineA * land * Math.min(1, lerp(0.25, 0.9, q) * (accent ? 1.1 : 1) * (1 + 0.5 * flash));
          if (a <= 0.004) return;
          const heat = Math.max(smoothstep(0.12, 0.55, ck), heatT);
          ctx.globalAlpha = a;
          ctx.lineWidth = lerp(1.3, 1.9, q) * (accent ? 1.3 : 1) * (1 - 0.35 * ck) * sizeK;
          ctx.strokeStyle = accent ? P.signal : heat > 0.02 ? lutHeat[Math.round(heat * 15)] : P.bone;
          ctx.beginPath();
          const n = rowPts(r, rowSpan(r, t), X0, Y0, RP_X, RP_Y);
          if (n < 2) return;
          if (st.closed) smoothClosed(ctx, RP_X, RP_Y, n); else smoothOpen(ctx, RP_X, RP_Y, n);
          ctx.stroke();
        };
        // Mountain band: from the ridge line down to the row's own ground line. Filled with the
        // backdrop, it hides whatever of the rows behind sits under the ridge — in the landscape
        // (ground below) and in the tunnel (ground = the wall, ridges pointing at the axis).
        const occludeRow = (r, st) => {
          const span = rowSpan(r, t);
          const n = rowPts(r, span, X0, Y0, RP_X, RP_Y);
          const nb = rowPts(r, span, BX, BY, RB_X, RB_Y);
          if (n < 2 || nb < 2) return;
          ctx.beginPath();
          if (st.closed) {
            smoothClosed(ctx, RP_X, RP_Y, n);
            ctx.moveTo(RB_X[0], RB_Y[0]);
            for (let k = 1; k < nb; k++) ctx.lineTo(RB_X[k], RB_Y[k]);
            ctx.closePath();
          } else {
            smoothOpen(ctx, RP_X, RP_Y, n);
            for (let k = nb - 1; k >= 0; k--) ctx.lineTo(RB_X[k], RB_Y[k]);
            ctx.closePath();
          }
          ctx.globalAlpha = occA;
          ctx.fillStyle = bgPaint; ctx.fill('evenodd');
        };

        for (let i = 0; i < N; i++) prep(i);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (occA > 0.01) {
          // Landscape / tunnel: back → front, row by row: occlude, stroke the ridge, its dots.
          for (let r = 0; r < ROWS; r++) {
            const st = rowState(r);
            occludeRow(r, st);
            if (r % stride === 0) strokeRow(r, st);
            let n = 0;
            for (let c = 0; c < COLS; c += stride) ROWIDX[n++] = GRID[r * COLS + c];
            drawList(ROWIDX, n);
          }
        } else {
          if (lineA > 0.005) for (let r = 0; r < ROWS; r += stride) strokeRow(r, rowState(r));
          let n = 0;
          for (let i = 0; i < N; i += stride) ORDER[n++] = i;
          ORDER.subarray(0, n).sort((a, b) => D0[b] - D0[a]); // painter's order: far → near
          drawList(ORDER, n);
        }

        if (detail >= 0.6) drawCallouts(ctx, t, api, g);
      }

      // ── the signal dot: accretes as the rings land, pops on the last one, settles to r=14 ──
      if (t >= T_DOT0) {
        const r = R.keys(t, [[T_DOT0, 0], [1.52, 4, 'backOut'], [1.72, 5.5], [1.805, 10, 'quadOut'], [T_DOTPK, 18, 'expoOut'], [T_CLEAN, 14, 'sineInOut']]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = P.signal;
        ctx.beginPath(); ctx.arc(CX, CY, r, 0, TAU); ctx.fill();
      }

      // ── post (main render only; panels must not touch the host frame's post state).
      // Bloom: a 150 ms surge on the burst, a steady low glow on the bone particles, a kick on the
      // dot pop; exactly 0 by the contract frames.
      if (detail === 1) {
        const off = 1 - smoothstep(1.83, T_CLEAN - 0.003, t);
        const surge = 0.6 * (1 - E.quadOut(seg(tb, 0, 0.15))) + 0.35 * bump(t - T_DOTPK + 0.02, 0.03);
        api.post.bloom = Math.max(api.post.bloom || 0, (0.16 + surge) * off);
      }
    },
  });
})();
