// ─────────────────────────────────────────────────────────────────────────────────────────────
//  HUD · global viewer overlay                           global 0.000 – 15.000 · screen space
//
//  Frames the reel like an edit viewer / camera monitor: crop marks, title slug, REC + tempo,
//  SMPTE timecode, section label with a slot-machine roll, and two progress rails. Quiet and
//  precise — it must never compete with the hero content, and it never uses the signal accent
//  (signal belongs to the dot).
//
//  PIPELINE
//    The engine calls R.hud AFTER the post pass, on the final 2D canvas: the HUD is a monitor
//    overlay, so it gets no grain, vignette or hit fringing, and ctx.canvas is exactly what the
//    viewer sees underneath it.
//    1. The four corner clusters are drawn as alpha masks into one small CPU atlas. Mask colour
//       carries the glyph class: white = primary, cyan = secondary (units, separators, zeros).
//    2. A CPU tint pass reads back only the four corner zones (+7 px probe margin, ~0.3 ms) and
//       writes the tinted HUD straight into them. (The previous WebGL tint cost ~80 ms per
//       frame under SwiftShader: a 1080p texture upload plus a GL→2D hand-off.)
//
//  ADAPTIVE INK (per pixel, palette-locked)
//    Ground = 15×15 px box mean of the frame under each HUD pixel (summed-area tables).
//    · Colour: bone or ink, whichever has the higher WCAG contrast against the ground, blended
//      over a narrow band in log-contrast space — ultra and ink take bone; signal, gray and
//      bone take ink; a wipe crossing a corner inverts the HUD exactly under its edge.
//    · Opacity: primary 0.92 / secondary 0.66 by default, raised per pixel until the stroke
//      reaches a contrast floor (primary 7:1, secondary 4.5:1) or full opacity. On signal and
//      ultra, where the best available is ~6:1, primary goes fully opaque and secondary rises
//      to ~0.8 — the hierarchy survives (secondary is capped at 85 % of primary).
//      Levels are a pure function of the quantized ground, so they're cached across frames.
//    · Busy grounds (panel edges, glyphs, particles) get a 1–2 px knockout halo in the opposite
//      ink; on flat grounds (grain included) it is gated off.
//
//  TIMELINE
//    0.469         the dot's first contact switches the monitor on: crop marks trim-draw out of
//                  their vertices (clockwise), blocks decode-type on behind a bone block cursor,
//                  rails draw on; settled before the second contact (0.9375)
//    every beat    REC dot flashes on the beat and decays; the bar-position square steps
//    each cut      section label rolls slot by slot (R.ease.snap), centred on the cut; the
//                  scene rail's old fill retracts while the new one starts
//    big hits      crop marks recoil outward a few px and settle with a small overshoot
//    12.84–13.10   power-down with s6's implosion: blocks de-type (no cursor), rails retract,
//                  crop marks settle at 30 % — nothing but the marks is left at the lockup cut
//
//  DUCK   api.post.hud (engine default 1) is read as a level, not a switch: text blocks fade on
//         staggered response curves (BL first, TL last) so a ramp reads as a designed hand-off;
//         crop marks rest at 35 % when fully ducked so the frame stays. Drive it with an eased
//         envelope (≥ 150 ms) — the HUD is a pure function of t and cannot smooth a step.
//
//  Pure function of t (the decode scramble hashes t on a 30 Hz grid). No Math.random / Date.
// ─────────────────────────────────────────────────────────────────────────────────────────────
(function () {
  const { P, BEAT, W, H } = R;
  const { clamp, smoothstep } = R.math;
  const E = R.ease;
  const seg = R.seg;
  const SC = R.SCENES;

  // ── grid ─────────────────────────────────────────────────────────────────────────────────
  const FONT = '500 15px "JetBrains Mono"';
  const ADV = 12; // 9 px mono advance + 3 px tracking → every glyph origin on a whole pixel
  const GW = 9; // glyph cell width
  const CAP = 11; // cap height at 15 px
  const CM = 40; // crop-mark vertex inset
  const ARM = 24; // crop-mark arm length
  const LW = 1.5; // crop-mark stroke
  const IN = CM + ARM; // 64 — text blocks align to the inner ends of the arms
  const XL = IN, XR = W - IN;
  const Y_TOP = IN + CAP; // 75: cap-top of the top row sits on the arm ends
  const Y_RAIL = H - IN - 1; // 1015: rail hairline, its bottom edge on the arm ends
  const Y_BOT = Y_RAIL - 12; // 1003: bottom-row baseline

  // ── ink levels ───────────────────────────────────────────────────────────────────────────
  const LEVEL_P = 0.92; // primary opacity on grounds with headroom
  const LEVEL_S = 0.92 * 0.72; // secondary (units, separators, leading zeros)
  const FLOOR_P = 7; // contrast floors (WCAG, fully covered stroke vs its local ground)
  const FLOOR_S = 4.5;
  const HIER = 0.85; // secondary ≤ 85 % of primary, so the hierarchy survives on mid grounds
  const HALO = 0.6; // knockout-halo strength on busy grounds
  const CURSOR_A = 0.85; // block cursor opacity

  // ── text runs ────────────────────────────────────────────────────────────────────────────
  // A run is a flat list of {ch, s} slots on the mono grid (s = 1 → secondary glyph).
  const run = (...parts) => {
    const out = [];
    for (const [str, s] of parts) for (const ch of str) out.push({ ch, s });
    return out;
  };
  const pad = (n, k) => String(n).padStart(k, '0');
  const width = (n) => n * ADV - (ADV - GW); // ink width of n slots
  const TITLE = run(['CLAUDE', 0], [' \u2044 MOTION REEL 2026', 1]);
  const TEMPO = run(['  REC   ', 0], ['128', 0], [' BPM', 1]); // slot 0 hosts the REC dot
  const LABELS = SC.map((s, i) => run([pad(i + 1, 2), 0], ['/' + pad(SC.length, 2) + '  ', 1], [s.name, 0]));
  const LABEL_SLOTS = Math.max(...LABELS.map((l) => l.length));
  const BLOCK = width(21); // 249 px: shared width of both bottom blocks and their rails
  const timecode = (t) => {
    const f = Math.floor(t * R.FPS + 1e-4);
    const s = Math.floor(f / R.FPS), ff = f % R.FPS;
    return run(['00:00:', 1], [pad(s, 2) + ':' + pad(ff, 2), 0], ['    F ', 1], [pad(f, 4), 0]);
  };

  // TR layout, right-aligned on XR: [● REC   128 BPM] 18 px [■ ■ ■ ■]
  const SQ = 7, SQ_GAP = 5, SQ_BLOCK = 4 * SQ + 3 * SQ_GAP;
  const TR_X = XR - SQ_BLOCK - 18 - width(TEMPO.length);
  const BR_X = XR - BLOCK;

  // ── timing ───────────────────────────────────────────────────────────────────────────────
  // Intro: the dot's first contact switches the monitor on. Everything settles before the
  // second contact, so the opening second belongs to the dot.
  const ON = R.HITS[0].t; // 0.46875
  const IN_MARK = ON + 0.02, IN_MARK_STAG = 0.05, IN_MARK_DUR = 0.42;
  // Type-on windows [start, dur] per block: a clockwise relay from the title, never more than
  // two cursors live at once (0.52 → 0.93).
  const IN_TYPE = { tl: [ON + 0.05, 0.22], tr: [ON + 0.13, 0.19], br: [ON + 0.21, 0.18], bl: [ON + 0.29, 0.17] };
  const IN_RAIL = [ON + 0.3, 0.26]; // starts with the last block, settles on the second contact
  // Outro: power down with s6's implosion; the text is gone before the lockup cut (13.125).
  const OUT = 12.84;
  const OUT_TYPE = { tl: [OUT, 0.2], tr: [OUT + 0.03, 0.2], br: [OUT + 0.06, 0.18], bl: [OUT + 0.09, 0.16] }; // done by 13.09
  const OUT_RAIL = [OUT + 0.02, 0.22];
  const OUT_MARK = [OUT - 0.04, 0.3];
  const MARK_REST = 0.3; // crop-mark opacity over the end card
  // Label roll around each cut.
  const ROLL_PRE = 0.08, ROLL_DUR = 0.16, ROLL_STAG = 0.005, ROLL_DY = 17;
  const SHUTTER = 4; // sub-samples for the HUD's own motion blur
  const LAST_ROLL = SC.length - 2; // no roll at the lockup cut: the HUD has powered down

  // Settled glyph count for a block: type on, hold, type off.
  function typed(t, key, n) {
    const [a, d] = IN_TYPE[key], [b, e] = OUT_TYPE[key];
    const on = E.quadOut(seg(t, a, a + d));
    const off = E.quadIn(seg(t, b, b + e));
    return n * on * (1 - off);
  }

  // Crop-mark recoil: big hits push the marks outward, fast attack, damped overshoot back.
  function recoil(t) {
    let k = 0;
    for (const h of R.HITS) {
      const d = t - h.t;
      if (d < 0 || d > 0.7 || h.s < 0.4) continue;
      k += ((h.s - 0.3) / 0.7) * (1 - Math.exp(-d * 90)) * Math.exp(-d * 9) * Math.cos(d * 26);
    }
    return k;
  }

  const sceneIndex = (t) => {
    let k = 0;
    for (let i = 0; i < SC.length; i++) if (t >= SC[i].start) k = i;
    return k;
  };

  // ── mask atlas ───────────────────────────────────────────────────────────────────────────
  // Corner zones in screen px [x, y, w, h], stacked vertically into one atlas.
  const ZONES = {
    tl: [24, 24, 376, 72],
    tr: [1592, 24, 304, 72],
    bl: [24, 976, 312, 80],
    br: [1576, 976, 320, 80],
  };
  const AW = Math.max(...Object.values(ZONES).map((z) => z[2]));
  let AH = 0;
  const ATLAS_Y = {};
  for (const [k, z] of Object.entries(ZONES)) {
    ATLAS_Y[k] = AH;
    AH += z[3];
  }
  const atlas = (() => {
    const c = document.createElement('canvas');
    c.width = AW;
    c.height = AH;
    return { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }) };
  })();

  const PRI = '#fff'; // primary glyphs, marks, rails, REC, cursors
  const SEC = '#0ff'; // secondary glyphs (red channel 0 flags them)

  // Draw one corner cluster into its atlas slot, in screen coordinates.
  function zone(key, draw) {
    const [zx, zy, zw, zh] = ZONES[key];
    const c = atlas.ctx;
    c.save();
    c.beginPath();
    c.rect(0, ATLAS_Y[key], zw, zh);
    c.clip();
    c.translate(-zx, ATLAS_Y[key] - zy);
    c.fillStyle = PRI;
    c.strokeStyle = PRI;
    c.font = FONT;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    draw(c);
    c.restore();
  }

  // ── primitives ───────────────────────────────────────────────────────────────────────────
  const SCRAMBLE = 'ABCDEFGHJKLMNPRSTUVXYZ0123456789#/+<>';
  const scramble = (i, t, seed) =>
    SCRAMBLE[Math.floor(R.hash(i * 17.31 + seed * 5.7 + Math.floor(t * 30) * 1.618) * SCRAMBLE.length)];

  // Draw a run on the mono grid with k settled glyphs (float), at block opacity A. The slot at
  // the write head shows a decode scramble; on the way in a block cursor leads it (the same
  // cursor s1 and s7 type with), on the way out the glyphs simply de-type.
  function typeRun(c, glyphs, x, y, k, t, seed, A, cursor) {
    const n = glyphs.length;
    if (k <= 0.001 || A <= 0.001) return;
    const head = Math.floor(k);
    for (let i = 0; i < Math.min(n, head + 1); i++) {
      const g = glyphs[i];
      if (g.ch === ' ') continue;
      c.fillStyle = g.s ? SEC : PRI;
      if (i < head) {
        c.globalAlpha = A;
        c.fillText(g.ch, x + i * ADV, y);
      } else {
        c.globalAlpha = 0.5 * A;
        c.fillText(scramble(i, t, seed), x + i * ADV, y);
      }
    }
    if (cursor && head < n) {
      c.fillStyle = PRI;
      c.globalAlpha = CURSOR_A * A;
      c.fillRect(x + Math.min(n, head + 1) * ADV, y - CAP - 2, GW, CAP + 4);
    }
    c.fillStyle = PRI;
    c.globalAlpha = 1;
  }

  // Crop mark: L-shape whose outer vertex is (vx, vy); sx/sy (±1) point into the frame.
  function cropMark(c, vx, vy, sx, sy, len) {
    if (len <= 0.01) return;
    c.fillRect(sx > 0 ? vx : vx - len, sy > 0 ? vy : vy - LW, len, LW);
    c.fillRect(sx > 0 ? vx : vx - LW, sy > 0 ? vy : vy - len, LW, len);
  }

  // Slot-machine roll between two runs. lt = seconds since the roll began.
  function rollRun(c, from, to, x, y, lt, A) {
    c.save();
    c.beginPath();
    c.rect(x - 2, y - CAP - 4, LABEL_SLOTS * ADV + 4, CAP + 8);
    c.clip();
    for (let i = 0; i < LABEL_SLOTS; i++) {
      const a = from[i] || { ch: ' ', s: 0 }, b = to[i] || { ch: ' ', s: 0 };
      const gx = x + i * ADV;
      if (a.ch === b.ch && a.s === b.s) {
        if (b.ch !== ' ') {
          c.fillStyle = b.s ? SEC : PRI;
          c.globalAlpha = A;
          c.fillText(b.ch, gx, y);
        }
        continue;
      }
      // The HUD skips the engine's motion blur, so rolling glyphs integrate their own: SHUTTER
      // sub-samples across a 180° shutter, each at 1/SHUTTER opacity.
      for (let s = 0; s < SHUTTER; s++) {
        const ts = lt - (s / SHUTTER) * (0.5 / R.FPS);
        const u = E.snap(seg(ts, i * ROLL_STAG, i * ROLL_STAG + ROLL_DUR));
        if (a.ch !== ' ' && u < 1) {
          c.fillStyle = a.s ? SEC : PRI;
          c.globalAlpha = (A * (1 - u * 0.6)) / SHUTTER;
          c.fillText(a.ch, gx, y - u * ROLL_DY);
        }
        if (b.ch !== ' ' && u > 0) {
          c.fillStyle = b.s ? SEC : PRI;
          c.globalAlpha = (A * (0.4 + u * 0.6)) / SHUTTER;
          c.fillText(b.ch, gx, y + (1 - u) * ROLL_DY);
        }
      }
    }
    c.restore();
    c.fillStyle = PRI;
    c.globalAlpha = 1;
  }

  // ── adaptive ink (CPU) ───────────────────────────────────────────────────────────────────
  const PR = 7; // ground probe radius → 15×15 px box
  const LIN = new Float32Array(257);
  for (let i = 0; i <= 256; i++) {
    const c = Math.min(i, 255) / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const lin = (v) => {
    const i = v | 0;
    return LIN[i] + (LIN[i + 1] - LIN[i]) * (v - i);
  };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const rgb = (hex) => R.col.vec(hex).map((v) => v * 255);
  const BONE = rgb(P.bone), INK = rgb(P.ink);
  const L_BONE = lum(...BONE), L_INK = lum(...INK);
  // ln(C_ink / C_bone) = 2·ln(L + .05) − LN_K: > 0 → ink wins.
  const LN_K = Math.log((L_BONE + 0.05) * (L_INK + 0.05));
  const INK_BAND = 0.2; // half-width of the bone ↔ ink blend in log-contrast space

  // Lowest opacity at which colour c over ground g reaches contrast `target` (1 if unreachable).
  function need(gr, gg, gb, c, target) {
    const Lg = lum(gr, gg, gb), Lc = lum(c[0], c[1], c[2]);
    const up = Lc > Lg;
    const cmax = up ? (Lc + 0.05) / (Lg + 0.05) : (Lg + 0.05) / (Lc + 0.05);
    if (cmax <= target) return 1;
    const Lt = up ? target * (Lg + 0.05) - 0.05 : (Lg + 0.05) / target - 0.05;
    let lo = 0, hi = 1;
    for (let k = 0; k < 9; k++) {
      const m = (lo + hi) / 2;
      const L = lum(gr + (c[0] - gr) * m, gg + (c[1] - gg) * m, gb + (c[2] - gb) * m);
      if (up ? L >= Lt : L <= Lt) hi = m;
      else lo = m;
    }
    return hi;
  }
  // Opacity levels per quantized ground (5 bits / channel): [primary, secondary] × [bone, ink].
  // A pure function of the key, so the cache is valid across frames and render order.
  const LV = new Float32Array(32768 * 4).fill(-1);
  function levels(r, g, b) {
    const key = (((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)) * 4;
    if (LV[key] < 0) {
      const qr = (r & ~7) + 4, qg = (g & ~7) + 4, qb = (b & ~7) + 4;
      for (let j = 0; j < 2; j++) {
        const c = j ? INK : BONE;
        const p = Math.max(LEVEL_P, need(qr, qg, qb, c, FLOOR_P));
        const s = Math.min(Math.max(LEVEL_S, need(qr, qg, qb, c, FLOOR_S)), HIER * p);
        LV[key + j * 2] = p;
        LV[key + j * 2 + 1] = s;
      }
    }
    return key;
  }

  // Scratch buffers, sized once for the largest zone (+ probe margin) and reused every frame.
  const ZMAX = Math.max(...Object.values(ZONES).map((z) => (z[2] + 2 * PR + 1) * (z[3] + 2 * PR + 1)));
  const S_R = new Float64Array(ZMAX), S_G = new Float64Array(ZMAX), S_B = new Float64Array(ZMAX);
  const S_L = new Float64Array(ZMAX), S_L2 = new Float64Array(ZMAX);
  const MA = new Float32Array(ZMAX), H1 = new Float32Array(ZMAX), H2 = new Float32Array(ZMAX), DD = new Float32Array(ZMAX);

  // Tint one zone of the mask atlas onto the frame in place. All passes run only over the
  // mask's bounding box (+2 px halo reach, +PR ground probe), so a zone holding just a crop
  // mark costs next to nothing.
  function tintZone(ctx, key, mask) {
    const [zx, zy, zw, zh] = ZONES[key];
    const ay = ATLAS_Y[key];
    // Bounding box of the mask in zone px.
    let bx0 = zw, bx1 = -1, by0 = zh, by1 = -1;
    for (let y = 0; y < zh; y++) {
      const mo = (ay + y) * AW * 4 + 3;
      let lo = -1, hi = -1;
      for (let x = 0; x < zw; x++)
        if (mask[mo + x * 4]) {
          if (lo < 0) lo = x;
          hi = x;
        }
      if (lo < 0) continue;
      if (lo < bx0) bx0 = lo;
      if (hi > bx1) bx1 = hi;
      if (y < by0) by0 = y;
      by1 = y;
    }
    if (bx1 < 0) return;
    // Work rect (zone px) and ground rect (screen px, clamped to the frame).
    const wx0 = Math.max(0, bx0 - 2), wy0 = Math.max(0, by0 - 2);
    const ww = Math.min(zw - 1, bx1 + 2) - wx0 + 1, wh = Math.min(zh - 1, by1 + 2) - wy0 + 1;
    const gx0 = Math.max(0, zx + wx0 - PR), gy0 = Math.max(0, zy + wy0 - PR);
    const gw = Math.min(W, zx + wx0 + ww + PR) - gx0, gh = Math.min(H, zy + wy0 + wh + PR) - gy0;
    const ox = zx + wx0 - gx0, oy = zy + wy0 - gy0; // work rect origin inside the ground rect

    // Mask alpha over the work rect, then its dilation for the halo footprint:
    // 1 px at full strength, 2 px at half (one separable pass computes both radii).
    for (let y = 0; y < wh; y++) {
      const mo = (ay + wy0 + y) * AW * 4 + wx0 * 4 + 3, o = y * ww;
      for (let x = 0; x < ww; x++) MA[o + x] = mask[mo + x * 4] / 255;
    }
    for (let y = 0; y < wh; y++) {
      const o = y * ww;
      for (let x = 0; x < ww; x++) {
        const a = MA[o + x];
        const l1 = x > 0 ? MA[o + x - 1] : 0, r1 = x < ww - 1 ? MA[o + x + 1] : 0;
        const l2 = x > 1 ? MA[o + x - 2] : 0, r2 = x < ww - 2 ? MA[o + x + 2] : 0;
        const m1 = Math.max(a, l1, r1);
        H1[o + x] = m1;
        H2[o + x] = Math.max(m1, l2, r2);
      }
    }
    for (let y = 0; y < wh; y++) {
      const o = y * ww;
      for (let x = 0; x < ww; x++) {
        const i = o + x;
        const u1 = y > 0 ? i - ww : i, d1 = y < wh - 1 ? i + ww : i;
        const u2 = y > 1 ? i - 2 * ww : u1, d2 = y < wh - 2 ? i + 2 * ww : d1;
        const m1 = Math.max(H1[i], H1[u1], H1[d1]);
        const m2 = Math.max(H2[i], H2[u1], H2[d1], H2[u2], H2[d2]);
        DD[i] = Math.max(m1, 0.5 * m2);
      }
    }

    const img = ctx.getImageData(gx0, gy0, gw, gh);
    const px = img.data;
    // Summed-area tables of r, g, b, luma, luma² over the ground (before it is overwritten).
    const sw = gw + 1;
    for (let x = 0; x < sw; x++) S_R[x] = S_G[x] = S_B[x] = S_L[x] = S_L2[x] = 0;
    for (let y = 0; y < gh; y++) {
      let ar = 0, ag = 0, ab = 0, al = 0, al2 = 0;
      const row = (y + 1) * sw, prev = y * sw;
      S_R[row] = S_G[row] = S_B[row] = S_L[row] = S_L2[row] = 0;
      for (let x = 0; x < gw; x++) {
        const i = (y * gw + x) * 4;
        const r = px[i], g = px[i + 1], b = px[i + 2];
        const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        ar += r; ag += g; ab += b; al += l; al2 += l * l;
        S_R[row + x + 1] = S_R[prev + x + 1] + ar;
        S_G[row + x + 1] = S_G[prev + x + 1] + ag;
        S_B[row + x + 1] = S_B[prev + x + 1] + ab;
        S_L[row + x + 1] = S_L[prev + x + 1] + al;
        S_L2[row + x + 1] = S_L2[prev + x + 1] + al2;
      }
    }
    for (let y = 0; y < wh; y++) {
      const gy = y + oy;
      const y0 = Math.max(0, gy - PR), y1 = Math.min(gh, gy + PR + 1);
      for (let x = 0; x < ww; x++) {
        const wi = y * ww + x;
        const dd = DD[wi];
        if (dd <= 0) continue;
        const ma = MA[wi];
        const gx = x + ox;
        const x0 = Math.max(0, gx - PR), x1 = Math.min(gw, gx + PR + 1);
        const a00 = y0 * sw + x0, a01 = y0 * sw + x1, a10 = y1 * sw + x0, a11 = y1 * sw + x1;
        const inv = 1 / ((x1 - x0) * (y1 - y0));
        const mr = (S_R[a11] - S_R[a01] - S_R[a10] + S_R[a00]) * inv;
        const mg = (S_G[a11] - S_G[a01] - S_G[a10] + S_G[a00]) * inv;
        const mb = (S_B[a11] - S_B[a01] - S_B[a10] + S_B[a00]) * inv;
        // Ink choice: log-contrast of ink vs bone against the ground mean.
        const ink = smoothstep(-INK_BAND, INK_BAND, 2 * Math.log(lum(mr, mg, mb) + 0.05) - LN_K);
        const cr = BONE[0] + (INK[0] - BONE[0]) * ink, cg = BONE[1] + (INK[1] - BONE[1]) * ink, cb = BONE[2] + (INK[2] - BONE[2]) * ink;
        const i = (gy * gw + gx) * 4;
        let r = px[i], g = px[i + 1], b = px[i + 2];
        // Knockout halo in the opposite ink, only on busy grounds.
        if (ma < 1) {
          const ml = (S_L[a11] - S_L[a01] - S_L[a10] + S_L[a00]) * inv;
          const ml2 = (S_L2[a11] - S_L2[a01] - S_L2[a10] + S_L2[a00]) * inv;
          const h = HALO * smoothstep(0.06, 0.2, Math.sqrt(Math.max(0, ml2 - ml * ml))) * dd * (1 - ma);
          if (h > 0) {
            r += (BONE[0] + INK[0] - cr - r) * h;
            g += (BONE[1] + INK[1] - cg - g) * h;
            b += (BONE[2] + INK[2] - cb - b) * h;
          }
        }
        if (ma > 0) {
          const k = levels(mr | 0, mg | 0, mb | 0);
          const lp = LV[k] + (LV[k + 2] - LV[k]) * ink;
          const ls = LV[k + 1] + (LV[k + 3] - LV[k + 1]) * ink;
          const sec = 1 - mask[((ay + wy0 + y) * AW + wx0 + x) * 4] / 255;
          const a = ma * (lp + (ls - lp) * sec);
          r += (cr - r) * a;
          g += (cg - g) * a;
          b += (cb - b) * a;
        }
        px[i] = r;
        px[i + 1] = g;
        px[i + 2] = b;
      }
    }
    ctx.putImageData(img, gx0, gy0, ox, oy, ww, wh);
  }

  // ── the overlay ──────────────────────────────────────────────────────────────────────────
  R.hud = function (ctx, t, api) {
    const vis = clamp(api.post && api.post.hud !== undefined ? api.post.hud : 1);
    if (t < IN_MARK) return;
    // Duck response: blocks fade on staggered curves (BL first, TL last); marks keep a floor.
    const bv = (i) => smoothstep(0.08 * i, 0.76 + 0.08 * i, vis);
    const vTL = bv(0), vTR = bv(1), vBR = bv(2), vBL = bv(3);
    const vMark = 0.35 + 0.65 * smoothstep(0, 1, vis);
    R.resetCtx(atlas.ctx);
    atlas.ctx.clearRect(0, 0, AW, AH);

    // Crop marks: trim-draw on, recoil on hits, settle to MARK_REST for the end card.
    const kick = 5 * recoil(t);
    const markA = vMark * (1 - (1 - MARK_REST) * E.soft(seg(t, OUT_MARK[0], OUT_MARK[0] + OUT_MARK[1])));
    const mark = (c, i, sx, sy) => {
      const t0 = IN_MARK + i * IN_MARK_STAG;
      const len = ARM * E.expoOut(seg(t, t0, t0 + IN_MARK_DUR));
      c.globalAlpha = markA;
      cropMark(c, sx > 0 ? CM - kick : W - CM + kick, sy > 0 ? CM - kick : H - CM + kick, sx, sy, len);
      c.globalAlpha = 1;
    };

    // Beat clock.
    const bt = t / BEAT;
    const bi = Math.floor(bt + 1e-6);
    const bf = bt - bi;

    // Rails: draw on in the intro, retract right→left in the outro.
    const railOn = E.expoOut(seg(t, IN_RAIL[0], IN_RAIL[0] + IN_RAIL[1]));
    const railOff = E.snap(seg(t, OUT_RAIL[0], OUT_RAIL[0] + OUT_RAIL[1]));
    const railW = BLOCK * railOn * (1 - railOff);
    const outro = (key) => t >= OUT_TYPE[key][0];

    // ── TL: title slug ──
    zone('tl', (c) => {
      mark(c, 0, 1, 1);
      typeRun(c, TITLE, XL, Y_TOP, typed(t, 'tl', TITLE.length), t, 1, vTL, !outro('tl'));
    });

    // ── TR: REC · tempo · bar position ──
    const kTR = typed(t, 'tr', TEMPO.length);
    zone('tr', (c) => {
      mark(c, 1, -1, 1);
      typeRun(c, TEMPO, TR_X, Y_TOP, kTR, t, 2, vTR, !outro('tr'));
      // REC dot: flashes on each beat and decays to a low glow — tempo you can feel, not a
      // blinker. Lights with the first slot of the type-on; at power-down recording stops
      // first (the dot goes dark on the outro's first frames), then the text de-types.
      const recA = vTR * clamp(kTR - 0.5) * (1 - E.quadOut(seg(t, OUT - 0.02, OUT + 0.05)));
      if (recA > 0) {
        const lit = 0.3 + 0.7 * Math.exp(-bf * BEAT * 7);
        c.globalAlpha = recA * lit;
        c.beginPath();
        c.arc(TR_X + GW / 2, Y_TOP - CAP / 2, 4.5, 0, Math.PI * 2);
        c.fill();
      }
      // Four bar-position squares: current beat filled, the previous one's fill decays.
      const x0 = XR - SQ_BLOCK, y0 = Math.round(Y_TOP - CAP / 2 - SQ / 2);
      const cur = bi % 4, prev = (bi + 3) % 4;
      const trDone = IN_TYPE.tr[0] + IN_TYPE.tr[1] * 0.7;
      for (let i = 0; i < 4; i++) {
        const pop = E.quadOut(seg(t, trDone + i * 0.03, trDone + i * 0.03 + 0.1));
        const gone = seg(t, OUT_TYPE.tr[0] + (3 - i) * 0.015, OUT_TYPE.tr[0] + (3 - i) * 0.015 + 0.05);
        const a = vTR * pop * (1 - gone);
        if (a <= 0) continue;
        const x = x0 + i * (SQ + SQ_GAP);
        c.globalAlpha = a * 0.55;
        c.lineWidth = 1;
        c.strokeRect(x + 0.5, y0 + 0.5, SQ - 1, SQ - 1);
        const fill = i === cur ? 1 : i === prev && bi > 0 ? 1 - E.quadOut(seg(bf * BEAT, 0, 0.14)) : 0;
        if (fill > 0) {
          c.globalAlpha = a * fill;
          c.fillRect(x, y0, SQ, SQ);
        }
      }
      c.globalAlpha = 1;
    });

    // ── BL: timecode + frame counter, global rail ──
    zone('bl', (c) => {
      mark(c, 3, 1, -1);
      const tc = timecode(t);
      typeRun(c, tc, XL, Y_BOT, typed(t, 'bl', tc.length), t, 3, vBL, !outro('bl'));
      // Global rail: one segment per scene (2 px gaps), filled to the playhead.
      if (railW > 0.5 && vBL > 0) {
        const xEnd = XL + railW, xHead = XL + BLOCK * (t / R.DURATION);
        SC.forEach((s, i) => {
          const a = Math.round(XL + (BLOCK * s.start) / R.DURATION) + (i ? 1 : 0);
          const b = Math.min(xEnd, Math.round(XL + (BLOCK * s.end) / R.DURATION) - (i < SC.length - 1 ? 1 : 0));
          if (b <= a) return;
          c.globalAlpha = 0.28 * vBL;
          c.fillRect(a, Y_RAIL, b - a, 1);
          const f = Math.min(b, xHead);
          if (f > a) {
            c.globalAlpha = vBL;
            c.fillRect(a, Y_RAIL - 1, f - a, 2);
          }
        });
        c.globalAlpha = 1;
      }
    });

    // ── BR: section label (slot roll on cuts) + scene rail ──
    zone('br', (c) => {
      mark(c, 2, -1, -1);
      const k = sceneIndex(t);
      // Is a roll in flight? (cut j, from j−1 → j). The lockup cut has none: the HUD powers down.
      let rolled = false;
      for (let j = 1; j <= LAST_ROLL; j++) {
        const lt = t - (SC[j].start - ROLL_PRE);
        if (lt >= 0 && lt < ROLL_DUR + LABEL_SLOTS * ROLL_STAG) {
          rollRun(c, LABELS[j - 1], LABELS[j], BR_X, Y_BOT, lt, vBR);
          rolled = true;
          break;
        }
      }
      if (!rolled) {
        // Static label: the latest scene whose roll has started.
        let li = 0;
        for (let j = 1; j <= LAST_ROLL; j++) if (t >= SC[j].start - ROLL_PRE) li = j;
        typeRun(c, LABELS[li], BR_X, Y_BOT, typed(t, 'br', LABELS[li].length), t, 4, vBR, !outro('br'));
      }
      // Scene rail: fills across the current scene; at a cut the old fill retracts to the right.
      if (railW > 0.5 && vBR > 0) {
        const sc = SC[k];
        const xEnd = BR_X + railW;
        c.globalAlpha = 0.28 * vBR;
        c.fillRect(BR_X, Y_RAIL, railW, 1);
        c.globalAlpha = vBR;
        if (k < SC.length - 1) {
          c.fillRect(BR_X, Y_RAIL - 1, Math.min(BLOCK * seg(t, sc.start, sc.end), railW), 2);
          if (k > 0) {
            const a = BR_X + BLOCK * E.snap(seg(t, sc.start - 0.03, sc.start + 0.24));
            if (a < xEnd) c.fillRect(a, Y_RAIL - 1, xEnd - a, 2);
          }
        } else c.fillRect(BR_X, Y_RAIL - 1, railW, 2); // the full rail retracts in the outro
        c.globalAlpha = 1;
      }
    });

    // ── tint + composite (in place, four small read-backs) ──
    const mask = atlas.ctx.getImageData(0, 0, AW, AH).data;
    for (const key of Object.keys(ZONES)) tintZone(ctx, key, mask);
  };
})();
