// ─────────────────────────────────────────────────────────────────────────────────────────────
//  s2 · KINETIC TYPE                                   global 1.875 – 4.6875  ·  lt = t − 1.875
//
//  The drop. Six words on six beats, six typographic techniques, six grounds:
//
//    0.000  DETONATION  the bone dot hollows into a shockwave; signal disc + radial shards
//    0.050  MOTION      Unbounded 900 · per-letter slam, staggered from the centre out   (signal)
//    0.469  is          blade → slice: halves whip apart, serif italic rises in the gap;   (ink)
//                       its tittle is the reel's dot, dropping in on the off-beat 8th
//    0.938  RHYTHM      "is" collapses to a hairline that splits into rules; variable
//                       weight travels through the word one letter per 16th             (ink)
//    1.406  TIMING      diagonal ultra wipe; letters drop, squash & spring on the 32nds (ultra)
//    1.875  &           bone iris; font-editor trace (outline, anchors, guides) → fill
//                       snaps on the off-beat 8th                                       (bone)
//    2.344  FLOW        ink wave; letters rise on a travelling sine; camera dives through
//                       the counter of the O                                             (ink)
//    2.8125 CONTRACT    solid ink
//
//  Everything is a pure function of lt. Static data is precomputed at module scope (seeded) or
//  lazily from the loaded glyph outlines. No Math.random / Date / performance.now.
// ─────────────────────────────────────────────────────────────────────────────────────────────
(function () {
  const { P, BEAT } = R;
  const { clamp, lerp, TAU } = R.math;
  const E = R.ease;
  const seg = R.seg;
  const W = R.W, H = R.H, CX = W / 2, CY = H / 2;
  const DEG = Math.PI / 180;
  const S16 = BEAT / 4; // 16th note
  const S32 = BEAT / 8; // 32nd note

  // ── beat map (local seconds) ─────────────────────────────────────────────────────────────
  const T = {
    DROP: 0,
    SLICE: BEAT * 1, // 0.46875
    RHY: BEAT * 2, // 0.9375
    TIM: BEAT * 3, // 1.40625
    AMP: BEAT * 4, // 1.875
    FLOW: BEAT * 5, // 2.34375
    END: BEAT * 6, // 2.8125
  };
  // Secondary timings. Anticipation lives in the ~60–120 ms before each beat.
  const BLADE0 = T.SLICE - 0.09, BLADE1 = T.SLICE - 0.035; // blade traces the cut line
  const WIND0 = BLADE1; // halves shear against each other (wind-up) until the beat
  const IS_DOT = T.SLICE + BEAT / 2, IS_DOT_FALL = 0.17; // tittle-dot lands on the off-beat 8th
  const IS_ST0 = T.RHY - 0.14, IS_COL0 = T.RHY - 0.058; // "is": stretch → collapse to a hairline
  const WIPE0 = T.TIM - 0.16, WIPE1 = T.TIM - 0.012; // ultra wipe completes just before T lands
  const LAND_STEP = S32, FALL = 0.2, DROP_H = 920; // TIMING drop
  const FILL = T.AMP + BEAT / 2; // ampersand fill snaps on the off-beat 8th
  const WAVE0 = T.FLOW - 0.095, WAVE1 = T.FLOW + 0.05; // ink wave
  const ZOOM0 = T.FLOW + 0.14, ZOOM1 = T.END - 0.0125; // counter dive
  const ZOOM_COVER_U = 0.9; // fraction of the dive at which the counter swallows the frame

  // Full-frame fill. Overdraws generously so the global camera shake never reveals the
  // engine's ink underlay at the frame edges.
  const fillBg = (ctx, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(-300, -300, W + 600, H + 600);
  };

  // ── static data ──────────────────────────────────────────────────────────────────────────
  // Detonation shards: radial speed-lines with staggered launch, reach and tail lag.
  const SHARDS = (() => {
    const r = R.rng(0x5c2d);
    const n = 26;
    return Array.from({ length: n }, (_, k) => ({
      a: ((k + (r() - 0.5) * 0.8) / n) * TAU,
      delay: r() * 0.035,
      r0: 30 + r() * 24,
      dist: 560 + r() * 860,
      dur: 0.22 + r() * 0.14,
      lag: 0.025 + r() * 0.045,
      w: 2.5 + r() * 6,
    }));
  })();

  // ── geometry that depends on loaded fonts (built once, lazily) ───────────────────────────
  let G = null;
  function geo(ctx) {
    if (G) return G;
    G = {};

    // MOTION — glyph outlines so each letter can pivot on its own optical centre.
    {
      const size = 250, cap = 0.75 * size; // Unbounded cap height = 750/1000
      const o = R.glyph.outline('unbounded900', 'MOTION', size, { spacing: -7 });
      const letters = o.letters.map((L) => {
        const b = bounds(L.contours);
        return { path: L.path, cx: (b[0] + b[2]) / 2, cy: -cap / 2 };
      });
      const all = bounds(o.letters.flatMap((L) => L.contours));
      G.motion = { letters, ox: CX - (all[0] + all[2]) / 2, base: CY + cap / 2 };
    }

    // "is" — Instrument Serif italic, centred on its ink box.
    {
      const size = 340;
      R.font(ctx, { family: 'Instrument Serif', style: 'italic', weight: 400, size, align: 'left' });
      const m = ctx.measureText('is');
      G.is = {
        size,
        ox: -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2,
        oy: (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2,
        w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
      };
      // The i's tittle (its topmost, smallest contour) — replaced by the reel's hero dot.
      const o = R.glyph.outline('serifItalic', 'is', size);
      const tit = o.letters[0].contours.slice().sort((a, b) => bounds([a])[1] - bounds([b])[1])[0];
      const c = centroid(tit);
      G.is.tx = G.is.ox + c[0];
      G.is.ty = G.is.oy + c[1];
      G.is.tr = Math.sqrt(Math.abs(area(tit)) / Math.PI);
    }

    // RHYTHM — Inter Tight variable (cap height 1490/2048).
    {
      const size = 250, cap = (1490 / 2048) * size;
      G.rhy = { size, cap, track: -5, base: CY + cap / 2, gap: cap / 2 + 52, ruleW: 1400 };
    }

    // TIMING — Unbounded 800 via the variable webfont; static per-letter layout.
    {
      const size = 230;
      R.font(ctx, { family: 'Unbounded', weight: 800, size, spacing: -5, align: 'left' });
      const lay = R.layoutText(ctx, 'TIMING');
      const m = ctx.measureText('TIMING');
      const ox = CX - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
      G.tim = {
        size,
        glyphs: lay.glyphs,
        ox,
        base: CY + (0.75 * size) / 2,
        x0: ox - m.actualBoundingBoxLeft, // ink extents
        x1: ox + m.actualBoundingBoxRight,
      };
    }

    // & — Instrument Serif italic. Contours for the trim-path trace, Path2D for the fill, and
    // the font's real on-curve anchors / off-curve handles for the "font editor" layer.
    {
      const size = 1000, tol = 1.5;
      const o = R.glyph.outline('serifItalic', '&', size, { tol });
      const L = o.letters[0];
      const b = bounds(L.contours);
      const contours = L.contours.map((c) => {
        const cum = [0];
        for (let i = 1; i <= c.length; i++) {
          const a = c[i - 1], q = c[i % c.length];
          cum.push(cum[i - 1] + Math.hypot(q[0] - a[0], q[1] - a[1]));
        }
        return { pts: c, cum, len: cum[cum.length - 1], anchors: [] };
      });
      // Re-walk the font commands with the engine's flattening rule so every on-curve point maps
      // to an exact vertex index → arc-length fraction on its contour.
      const font = R.glyph.fonts.serifItalic;
      const cmds = font.charToGlyph('&').getPath(0, 0, size).commands;
      let ci = -1, idx = 0, px = 0, py = 0;
      for (const c of cmds) {
        if (c.type === 'M') {
          ci++;
          idx = 0;
          px = c.x;
          py = c.y;
          if (contours[ci]) contours[ci].anchors.push({ x: c.x, y: c.y, u: 0, h: [] });
          continue;
        }
        if (c.type === 'Z' || !contours[ci]) continue;
        const n = c.type === 'L' ? 1 : Math.max(2, Math.ceil(Math.hypot(c.x - px, c.y - py) / tol));
        idx += n;
        const K = contours[ci];
        const u = K.cum[Math.min(idx, K.cum.length - 1)] / K.len;
        const h = [];
        if (c.type === 'Q') h.push([px, py, c.x1, c.y1], [c.x, c.y, c.x1, c.y1]);
        if (c.type === 'C') h.push([px, py, c.x1, c.y1], [c.x, c.y, c.x2, c.y2]);
        // keep the editor layer legible: skip anchors crowding the previous kept one
        const last = K.anchors[K.anchors.length - 1];
        if (u < 0.999 && (!last || Math.hypot(c.x - last.x, c.y - last.y) > 64)) K.anchors.push({ x: c.x, y: c.y, u, h });
        px = c.x;
        py = c.y;
      }
      G.amp = {
        size,
        path: L.path,
        contours,
        cx: (b[0] + b[2]) / 2,
        cy: (b[1] + b[3]) / 2,
        guides: [
          { y: 0, label: 'BASELINE' },
          { y: -0.51 * size, label: 'X-HEIGHT' },
          { y: -0.72 * size, label: 'CAP HEIGHT' },
        ],
      };
    }

    // FLOW — glyph outlines; find the O's counter and the zoom at which it swallows the frame.
    {
      const size = 260, cap = 0.75 * size;
      const o = R.glyph.outline('unbounded900', 'FLOW', size, { tol: 1 });
      const letters = o.letters.map((L) => {
        const b = bounds(L.contours);
        return { path: L.path, cx: (b[0] + b[2]) / 2, cy: -cap / 2 };
      });
      // the counter is the O contour with the smaller |area|
      const Oc = o.letters[2].contours.slice().sort((a, b) => Math.abs(area(a)) - Math.abs(area(b)))[0];
      const c = centroid(Oc);
      // smallest scale at which the padded frame sits inside the counter (dense perimeter probe)
      const pad = 40, probe = [];
      for (let i = 0; i <= 16; i++) {
        const u = i / 16;
        probe.push([lerp(-CX - pad, CX + pad, u), -CY - pad], [lerp(-CX - pad, CX + pad, u), CY + pad]);
        probe.push([-CX - pad, lerp(-CY - pad, CY + pad, u)], [CX + pad, lerp(-CY - pad, CY + pad, u)]);
      }
      let cover = 1;
      while (cover < 1000 && !probe.every(([dx, dy]) => inPoly(c[0] + dx / cover, c[1] + dy / cover, Oc))) cover *= 1.01;
      // log-space dive: ln s = ln S · u³, so cover is reached at u = ZOOM_COVER_U
      const zoomMax = clamp(Math.exp(Math.log(cover) / Math.pow(ZOOM_COVER_U, 3)), 60, 140);
      G.flow = { letters, cx: c[0], cy: c[1], cover, zoomMax };
    }
    return G;
  }

  // ── small geometry helpers ───────────────────────────────────────────────────────────────
  function bounds(contours) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of contours) for (const [x, y] of c) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  }
  function area(poly) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    return a / 2;
  }
  function centroid(poly) {
    let a = 0, x = 0, y = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
      a += f;
      x += (poly[j][0] + poly[i][0]) * f;
      y += (poly[j][1] + poly[i][1]) * f;
    }
    return [x / (3 * a), y / (3 * a)];
  }
  function inPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // Point at arc-length fraction u along a closed contour (pen-nib position on the trim head).
  function pointAt(c, u) {
    const target = clamp(u) * c.len;
    let i = 1;
    while (i < c.cum.length - 1 && c.cum[i] < target) i++;
    const a = c.pts[i - 1], b = c.pts[i % c.pts.length];
    const f = (target - c.cum[i - 1]) / (c.cum[i] - c.cum[i - 1] || 1);
    return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  I · DETONATION + MOTION + SLICE
  // ═════════════════════════════════════════════════════════════════════════════════════════
  const discR = (lt) => 1190 * E.expoOut(seg(lt, 0, 0.28));

  function shardPath(ctx, lt, detail) {
    ctx.beginPath();
    const n = Math.max(10, Math.round(SHARDS.length * Math.min(1, detail)));
    for (let k = 0; k < n; k++) {
      const s = SHARDS[k];
      const tau = lt - s.delay;
      if (tau <= 0) continue;
      const head = s.r0 + s.dist * E.expoOut(clamp(tau / s.dur));
      const tail = s.r0 + s.dist * E.expoOut(clamp(Math.max(0, tau - s.lag) / s.dur));
      const len = head - tail;
      if (len < 1.5) continue;
      const w = s.w * Math.min(1, len / 140);
      const ca = Math.cos(s.a), sa = Math.sin(s.a);
      const mid = tail + len * 0.7; // widest near the head: reads as outward thrust
      ctx.moveTo(CX + ca * tail, CY + sa * tail);
      ctx.lineTo(CX + ca * mid - (sa * w) / 2, CY + sa * mid + (ca * w) / 2);
      ctx.lineTo(CX + ca * head, CY + sa * head);
      ctx.lineTo(CX + ca * mid + (sa * w) / 2, CY + sa * mid - (ca * w) / 2);
      ctx.closePath();
    }
  }

  function drawDetonation(ctx, lt, detail) {
    const rd = discR(lt);
    const covered = rd > 1140;
    if (covered) fillBg(ctx, P.signal);
    else if (rd > 0.5) {
      ctx.fillStyle = P.signal;
      ctx.beginPath();
      ctx.arc(CX, CY, rd, 0, TAU);
      ctx.fill();
    }
    // shards: bone where they fly over ink, ink where they streak across the signal
    if (lt < 0.45) {
      if (!covered) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-300, -300, W + 600, H + 600);
        ctx.arc(CX, CY, rd, 0, TAU);
        ctx.clip('evenodd');
        shardPath(ctx, lt, detail);
        ctx.fillStyle = P.bone;
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      if (!covered) {
        ctx.beginPath();
        ctx.arc(CX, CY, rd, 0, TAU);
        ctx.clip();
      }
      shardPath(ctx, lt, detail);
      ctx.fillStyle = P.ink;
      ctx.fill();
      ctx.restore();
    }
    // shockwave: the dot itself hollows out into a ring that races ahead of the disc and thins.
    // At lt = 0 this is exactly the contract dot (outer 28, inner 0).
    const ro = 28 + 1500 * E.expoOut(seg(lt, 0, 0.3));
    if (ro < 1260) {
      const th = lerp(28, 1.5, E.expoOut(seg(lt, 0, 0.1)));
      ctx.beginPath();
      ctx.arc(CX, CY, ro, 0, TAU);
      if (ro - th > 0.05) ctx.arc(CX, CY, ro - th, 0, TAU, true);
      ctx.fillStyle = P.bone;
      ctx.fill();
    }
  }

  // Per-letter slam: from scale 1.8, accelerating into the surface (quadIn), hard contact, then a
  // short damped squash. Rings stagger outward from the centre pair (T, I) by 25 ms.
  const SLAM_RING = [2, 1, 0, 0, 1, 2];
  const SLAM0 = 0.05, SLAM_STEP = 0.025, SLAM_IN = 0.075;
  function slam(tau, i) {
    let s, rot = 0;
    if (tau < SLAM_IN) {
      const u = E.quadIn(tau / SLAM_IN);
      s = lerp(1.8, 1, u);
      rot = (i % 2 ? 1 : -1) * 5 * DEG * (1 - u);
    } else {
      const k = tau - SLAM_IN;
      s = 1 - 0.07 * Math.exp(-k * 15) * Math.sin(k * 40);
    }
    return { s, rot, a: clamp(tau / 0.012) };
  }

  function drawMotionWord(ctx, lt) {
    const g = G.motion;
    const push = 1 + 0.035 * E.sineInOut(seg(lt, 0.2, 0.75)); // slow push-in during the hold
    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(push, push);
    ctx.translate(-CX, -CY);
    ctx.translate(g.ox, g.base);
    ctx.fillStyle = P.ink;
    for (let i = 0; i < g.letters.length; i++) {
      const tau = lt - (SLAM0 + SLAM_RING[i] * SLAM_STEP);
      if (tau <= 0) continue;
      const L = g.letters[i];
      const { s, rot, a } = slam(tau, i);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(L.cx, L.cy);
      ctx.rotate(rot);
      ctx.scale(s, s);
      ctx.translate(-L.cx, -L.cy);
      ctx.fill(L.path);
      ctx.restore();
    }
    ctx.restore();
  }

  // Anticipation: a bone blade traces the cut line left → right just before the beat.
  function drawBlade(ctx, lt) {
    if (lt < BLADE0) return;
    const head = lerp(-60, W + 60, E.expoOut(seg(lt, BLADE0, BLADE1)));
    ctx.fillStyle = P.bone;
    ctx.fillRect(-60, CY - 1.5, head + 60, 3);
  }

  const whipOut = E.bezier(0.45, 0, 0.12, 1); // whip with a quicker break-away than R.ease.whip
  function actMotion(ctx, lt, api) {
    if (lt < WIND0) {
      drawDetonation(ctx, lt, api.detail);
      drawMotionWord(ctx, lt);
      drawBlade(ctx, lt);
      return;
    }
    // The plate is cut. Before the beat the halves shear a few px against each other (wind-up);
    // on the beat they pop apart vertically and whip off-frame, bottom trailing the top.
    if (lt >= T.SLICE) drawIs(ctx, lt);
    const tau = lt - T.SLICE;
    const wind = 16 * E.sineInOut(seg(lt, WIND0, T.SLICE)) * (1 - E.expoOut(seg(tau, 0, 0.06)));
    const gap = tau > 0 ? 36 * E.expoOut(clamp(tau / 0.12)) : 0;
    for (const side of [-1, 1]) {
      // side −1: top half → left / up, +1: bottom half → right / down
      const X = 2250 * whipOut(seg(tau, side < 0 ? 0 : 0.018, side < 0 ? 0.22 : 0.238)) - wind;
      ctx.save();
      ctx.translate(side * X, side * gap);
      ctx.beginPath();
      if (side < 0) ctx.rect(-300, -300, W + 600, CY + 300);
      else ctx.rect(-300, CY, W + 600, H - CY + 300);
      ctx.clip();
      fillBg(ctx, P.signal);
      drawMotionWord(ctx, lt);
      // the blade's residue: a hot bone edge on each cut face, cooling off after the beat
      ctx.fillStyle = R.col.rgba(P.bone, 1 - E.quadOut(clamp(tau / 0.18)));
      ctx.fillRect(-300, side < 0 ? CY - 3 : CY, W + 600, 3);
      ctx.restore();
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  II · is
  // ═════════════════════════════════════════════════════════════════════════════════════════
  function drawIs(ctx, lt) {
    const g = G.is;
    const rise = E.expoOut(seg(lt, T.SLICE + 0.02, T.SLICE + 0.36));
    const dy = lerp(260, 0, rise);
    const tilt = lerp(-7, 0, E.backOut(seg(lt, T.SLICE + 0.02, T.SLICE + 0.4))) * DEG;
    const drift = 1 + 0.045 * E.sineInOut(seg(lt, T.SLICE + 0.08, T.RHY));
    // anticipation: a soft vertical stretch, then an accelerating collapse into a hairline that
    // lands exactly on the RHYTHM downbeat
    const st = E.soft(seg(lt, IS_ST0, IS_COL0));
    const col = E.quadIn(seg(lt, IS_COL0, T.RHY));
    const sy = lerp(1, 1.14, st) * (1 - col);
    const sx = lerp(1, 0.95, st) + col * 0.7;
    if (sy > 0.003) {
      ctx.save();
      ctx.translate(CX, CY + dy);
      ctx.rotate(tilt);
      ctx.scale(drift * sx, drift * sy);
      // the word rises dotless (the font's tittle is masked out) ...
      ctx.save();
      ctx.beginPath();
      ctx.rect(-2000, -2000, 4000, 4000);
      ctx.arc(g.tx, g.ty, g.tr + 4, 0, TAU);
      ctx.clip('evenodd');
      R.font(ctx, { family: 'Instrument Serif', style: 'italic', weight: 400, size: g.size, align: 'left' });
      ctx.fillStyle = P.bone;
      ctx.fillText('is', g.ox, g.oy);
      ctx.restore();
      // ... and the reel's dot drops in as its tittle, landing on the off-beat 8th
      const tau = lt - IS_DOT;
      if (tau > -IS_DOT_FALL) {
        let y, dsx, dsy;
        if (tau < 0) {
          const u = 1 + tau / IS_DOT_FALL;
          y = -430 * (1 - u * u);
          dsy = 1 + 0.5 * u * u;
          dsx = 1 / Math.sqrt(dsy);
        } else {
          const q = 0.38 * Math.exp(-tau * 14) * Math.cos(tau * 42);
          dsy = 1 - q;
          dsx = 1 + q * 0.8;
          y = -34 * Math.exp(-tau * 10) * Math.abs(Math.sin(tau * 17));
        }
        ctx.fillStyle = P.signal;
        ctx.save();
        ctx.translate(g.tx, g.ty + g.tr + y); // pivot on the dot's contact point
        ctx.scale(dsx, dsy);
        ctx.beginPath();
        ctx.arc(0, -g.tr, g.tr, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    if (col > 0) {
      const w = lerp(g.w * 0.7, g.w * 1.6, col) * drift;
      ctx.fillStyle = R.col.rgba(P.bone, E.quadOut(col));
      ctx.fillRect(CX - w / 2, CY - 1.5, w, 3);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  III · RHYTHM
  // ═════════════════════════════════════════════════════════════════════════════════════════
  const RHY_WORD = 'RHYTHM';
  // Weight wave: a cosine with a 4-letter wavelength whose phase advances one letter per 16th.
  // Each advance snaps (expoOut over the first 40% of the 16th) and then holds, so the weight
  // visibly *steps* with the hats instead of drifting.
  function rhythmWeights(lt) {
    const s = Math.max(0, (lt - T.RHY) / S16);
    const k = Math.floor(s);
    const phi = k + E.expoOut(clamp((s - k) / 0.4));
    const out = [];
    for (let i = 0; i < RHY_WORD.length; i++) out.push(100 + 800 * (0.5 + 0.5 * Math.cos((TAU * (i - phi)) / 4)));
    return out;
  }

  function drawRhythmWord(ctx, lt) {
    const g = G.rhy;
    const wts = rhythmWeights(lt);
    const adv = [];
    let total = g.track * (RHY_WORD.length - 1);
    for (let i = 0; i < RHY_WORD.length; i++) {
      R.font(ctx, { family: 'Inter Tight', weight: wts[i], size: g.size, align: 'left' });
      adv[i] = ctx.measureText(RHY_WORD[i]).width;
      total += adv[i];
    }
    const drift = 1 + 0.03 * E.sineOut(seg(lt, T.RHY, T.TIM));
    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(drift, drift);
    ctx.translate(-CX, -CY);
    ctx.fillStyle = P.bone;
    let x = CX - total / 2; // re-laid out every frame so spacing stays even as widths breathe
    for (let i = 0; i < RHY_WORD.length; i++) {
      R.font(ctx, { family: 'Inter Tight', weight: wts[i], size: g.size, align: 'left' });
      ctx.fillText(RHY_WORD[i], x, g.base);
      x += adv[i] + g.track;
    }
    ctx.restore();
  }

  // 16-step sequencer (one bar = the whole scene's first bar). The playhead is the lime pop;
  // steps it has passed glow and decay like LEDs.
  function drawSequencer(ctx, lt, y) {
    const n = 16, sz = 16, gapX = 12;
    const x0 = CX - (n * sz + (n - 1) * gapX) / 2;
    const step = Math.floor((lt - T.DROP) / S16 + 1e-6) % n;
    for (let i = 0; i < n; i++) {
      const d = R.stagger(i, n, 0.09, { from: 'center' });
      const appear = E.backOut(seg(lt, T.RHY + 0.03 + d, T.RHY + 0.14 + d));
      if (appear <= 0) continue;
      const s = sz * appear;
      const x = x0 + i * (sz + gapX) + sz / 2;
      const since = lt - (T.DROP + i * S16);
      const glow = since >= 0 && lt - since >= T.RHY - 1e-6 ? Math.exp(-since * 9) : 0;
      if (i === step) {
        ctx.fillStyle = P.lime;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      } else if (glow > 0.03) {
        ctx.fillStyle = R.col.mix(P.gray, P.bone, glow);
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      } else {
        ctx.strokeStyle = i % 4 === 0 ? P.bone2 : P.gray;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - s / 2 + 0.75, y - s / 2 + 0.75, s - 1.5, s - 1.5);
      }
    }
  }

  function drawRhythm(ctx, lt) {
    const g = G.rhy;
    const tau = lt - T.RHY;
    // the hairline splits into two rules — instant on the beat (backOut), small overshoot;
    // the aperture between them reveals the word
    const hr = lerp(0, g.gap, E.backOut(seg(tau, 0, 0.2), 1.9));
    const wr = lerp(G.is.w * 1.6, g.ruleW, E.expoOut(seg(tau, 0, 0.32)));
    ctx.save();
    ctx.beginPath();
    ctx.rect(CX - wr / 2, CY - hr, wr, hr * 2);
    ctx.clip();
    drawRhythmWord(ctx, lt);
    ctx.restore();
    ctx.fillStyle = P.bone;
    ctx.fillRect(CX - wr / 2, CY - hr - 1.5, wr, 3);
    ctx.fillRect(CX - wr / 2, CY + hr - 1.5, wr, 3);
    // end ticks: title-card brackets, grown once the rules have opened
    const tk = 18 * E.backOut(seg(tau, 0.12, 0.26), 2);
    if (tk > 0) {
      for (const sx of [-1, 1]) {
        const x = CX + (sx * wr) / 2 - (sx > 0 ? 3 : 0);
        ctx.fillRect(x, CY - hr - 1.5, 3, tk);
        ctx.fillRect(x, CY + hr + 1.5 - tk, 3, tk);
      }
    }
    drawSequencer(ctx, lt, CY + g.gap + 50);
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  IV · TIMING
  // ═════════════════════════════════════════════════════════════════════════════════════════
  const TAN = Math.tan(21 * DEG);
  // Region left of a slanted edge ("/") that crosses the centre line at x = X.
  function slantPath(ctx, X) {
    ctx.beginPath();
    ctx.moveTo(-400, -300);
    ctx.lineTo(X + (CY + 300) * TAN, -300);
    ctx.lineTo(X - (H - CY + 300) * TAN, H + 300);
    ctx.lineTo(-400, H + 300);
    ctx.closePath();
  }
  const WIPE_BAND = 150; // the signal band rides ahead of the ultra edge
  // travel spans only what the slanted edge needs to cross the frame, so the whip's fast middle
  // is spent on-screen (≈4 readable frames) rather than off it
  const WIPE_SPAN = (CY + 40) * TAN + WIPE_BAND + 20;
  const wipeX = (lt) => lerp(-WIPE_SPAN, W + WIPE_SPAN, E.whip(seg(lt, WIPE0, WIPE1)));

  // An animator's timing chart under the word: key to key, in-betweens spaced by an ease-in-out
  // (dense at the keys). It draws on as the letters land.
  function drawTimingChart(ctx, lt, x0, x1, y) {
    const p = E.soft(seg(lt, T.TIM - 0.01, T.TIM + 5 * LAND_STEP + 0.06));
    if (p <= 0) return;
    const xe = lerp(x0, x1, p);
    ctx.fillStyle = R.col.rgba(P.bone, 0.8);
    ctx.fillRect(x0, y - 1, xe - x0, 2);
    const n = 12;
    for (let j = 0; j <= n; j++) {
      const x = lerp(x0, x1, E.sineInOut(j / n));
      if (x > xe + 0.5) break;
      const key = j === 0 || j === n;
      const h = (key ? 34 : 16) * E.backOut(clamp((xe - x) / 70), 2.2);
      ctx.fillRect(x - 1, y - h / 2, 2, h);
    }
  }

  // Letters land on consecutive 32nds (six 16ths would overrun the & downbeat by two 16ths).
  function drawTimingWord(ctx, lt) {
    const g = G.tim;
    R.font(ctx, { family: 'Unbounded', weight: 800, size: g.size, spacing: -5, align: 'center' });
    ctx.fillStyle = P.bone;
    const drift = 1 + 0.025 * E.sineOut(seg(lt, T.TIM, T.AMP + 0.1));
    // stage bump: the whole line dips a hair on each landing (felt more than seen)
    let bump = 0;
    for (let i = 0; i < g.glyphs.length; i++) {
      const tau = lt - (T.TIM + i * LAND_STEP);
      if (tau > 0) bump += 5 * Math.exp(-tau * 22) * Math.sin(Math.min(Math.PI, tau * 45));
    }
    ctx.save();
    ctx.translate(CX, CY + bump);
    ctx.scale(drift, drift);
    ctx.translate(-CX, -CY);
    drawTimingChart(ctx, lt, g.x0, g.x1, g.base + 72);
    ctx.fillStyle = P.bone;
    g.glyphs.forEach((gl, i) => {
      const tau = lt - (T.TIM + i * LAND_STEP);
      if (tau < -FALL) return;
      let y, sx, sy;
      if (tau < 0) {
        // free fall (gravity: quadratic), stretching along the fall
        const u = 1 + tau / FALL;
        y = -DROP_H * (1 - u * u);
        sy = 1 + 0.24 * u * u;
        sx = 1 / Math.sqrt(sy);
      } else {
        // contact: squash, then a damped spring back through stretch to rest, tiny rebound
        const q = 0.24 * Math.exp(-tau * 13) * Math.cos(tau * 36);
        sy = 1 - q;
        sx = 1 + q * 0.45;
        y = -16 * Math.exp(-tau * 14) * Math.sin(tau * 30);
      }
      ctx.save();
      ctx.translate(g.ox + gl.x + gl.w / 2, g.base + y);
      ctx.scale(sx, sy); // pivot on the baseline: the squash stays grounded
      ctx.fillText(gl.ch, 0, 0);
      ctx.restore();
    });
    ctx.restore();
  }

  function actTiming(ctx, lt) {
    if (lt >= WIPE1) {
      fillBg(ctx, P.ultra);
      drawTimingWord(ctx, lt);
      return;
    }
    const X = wipeX(lt);
    ctx.fillStyle = P.signal;
    slantPath(ctx, X + WIPE_BAND);
    ctx.fill();
    ctx.fillStyle = P.ultra;
    slantPath(ctx, X);
    ctx.fill();
    ctx.save();
    slantPath(ctx, X);
    ctx.clip();
    drawTimingWord(ctx, lt);
    ctx.restore();
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  V · &
  // ═════════════════════════════════════════════════════════════════════════════════════════
  const irisR = (lt) => 1190 * E.expoOut(seg(lt, T.AMP, T.AMP + 0.3));
  const traceEase = E.bezier(0.25, 0.7, 0.3, 1);

  // Font-editor layer: metric guides, on-curve anchors and off-curve handles, revealed by the
  // trace and dismissed by the fill.
  function drawConstruction(ctx, g, drawP, sc, k) {
    if (k <= 0) return;
    const lw = 1.5 / sc;
    // metric guides draw outward from the glyph's centre
    const gp = E.expoOut(clamp(drawP * 1.6));
    ctx.fillStyle = R.col.rgba(P.gray, 0.85 * k);
    for (const gd of g.guides) ctx.fillRect(g.cx - 1500 * gp, gd.y - lw / 2, 3000 * gp, lw);
    R.font(ctx, { family: 'JetBrains Mono', weight: 500, size: 15 / sc, spacing: 3 / sc, align: 'left' });
    ctx.globalAlpha = k * clamp(drawP * 3 - 0.4);
    for (const gd of g.guides) ctx.fillText(gd.label, g.cx - 620, gd.y - 10 / sc);
    ctx.globalAlpha = 1;
    // anchors + handles, popping in as the trace head passes them
    for (let ci = 0; ci < g.contours.length; ci++) {
      const K = g.contours[ci];
      const e = clamp(drawP * (1 + ci * 0.08));
      for (const a of K.anchors) {
        const t = (e - a.u) * 9; // pop over ~11% of the trace after the head passes
        if (t <= 0) continue;
        const p = E.backOut(clamp(t), 2.4) * k;
        ctx.strokeStyle = R.col.rgba(P.gray, 0.9 * k);
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (const [x0, y0, x1, y1] of a.h) {
          ctx.moveTo(x0, y0);
          ctx.lineTo(lerp(x0, x1, p), lerp(y0, y1, p));
        }
        ctx.stroke();
        ctx.fillStyle = P.gray;
        for (const [, , x1, y1] of a.h) {
          ctx.beginPath();
          ctx.arc(x1, y1, (4 * p) / sc, 0, TAU);
          ctx.fill();
        }
        const s = (11 * p) / sc;
        ctx.fillStyle = P.bone;
        ctx.fillRect(a.x - s / 2, a.y - s / 2, s, s);
        ctx.strokeStyle = R.col.rgba(P.ink, k);
        ctx.strokeRect(a.x - s / 2, a.y - s / 2, s, s);
      }
    }
  }

  function drawAmp(ctx, lt) {
    const g = G.amp;
    const tau = lt - T.AMP;
    const sp = R.spring(tau, { k: 170, c: 15 });
    // follow-through: the rising ink wave shoulders the glyph up and round before swallowing it
    const shove = E.cubicIn(seg(lt, WAVE0, T.FLOW));
    const rot = (lerp(-15, 0, sp) + 1.2 * E.sineOut(seg(tau, 0.3, 0.5)) + 5 * shove) * DEG;
    const sc = lerp(0.84, 1, sp) * (1 + 0.02 * E.sineOut(seg(tau, 0.25, 0.6)));
    const fillT = lt - FILL;
    const drawP = traceEase(seg(tau, 0.005, FILL - T.AMP - 0.012));
    ctx.save();
    ctx.translate(CX, CY - 70 * shove);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    ctx.translate(-g.cx, -g.cy);
    // construction layer (dismissed within 3 frames of the fill)
    const k = fillT < 0 ? 1 : 1 - E.quadOut(clamp(fillT / 0.05));
    drawConstruction(ctx, g, drawP, sc, k);
    if (fillT < 0) {
      // trim-path outline with the reel's dot as the pen nib
      ctx.strokeStyle = P.signal;
      ctx.fillStyle = P.signal;
      ctx.lineWidth = 7 / sc;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      g.contours.forEach((c, ci) => {
        const e = clamp(drawP * (1 + ci * 0.08));
        if (e <= 0) return;
        R.shape.trim(ctx, c.pts, 0, e, true);
        ctx.stroke();
        if (e < 1) {
          const [px, py] = pointAt(c, e);
          ctx.beginPath();
          ctx.arc(px, py, 11 / sc, 0, TAU);
          ctx.fill();
        }
      });
    } else {
      // the fill snaps in on the off-beat with a short pop
      const pop = 1 + 0.05 * Math.exp(-fillT * 20);
      ctx.translate(g.cx, g.cy);
      ctx.scale(pop, pop);
      ctx.translate(-g.cx, -g.cy);
      ctx.fillStyle = P.signal;
      ctx.fill(g.path);
    }
    ctx.restore();
  }

  function actAmp(ctx, lt) {
    const r = irisR(lt);
    if (r > 1140) fillBg(ctx, P.bone);
    else {
      // thin bone ring racing ahead of the iris — rhymes with the opening shockwave
      const ro = r * 1.16 + 14;
      const th = lerp(10, 1.5, E.expoOut(seg(lt, T.AMP, T.AMP + 0.12)));
      ctx.fillStyle = P.bone;
      ctx.beginPath();
      ctx.arc(CX, CY, ro, 0, TAU);
      ctx.arc(CX, CY, Math.max(0, ro - th), 0, TAU, true);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(CX, CY, r, 0, TAU);
      ctx.fill();
    }
    ctx.save();
    if (r <= 1140) {
      ctx.beginPath();
      ctx.arc(CX, CY, r, 0, TAU);
      ctx.clip();
    }
    drawAmp(ctx, lt);
    ctx.restore();
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  VI · FLOW
  // ═════════════════════════════════════════════════════════════════════════════════════════
  function wavePath(ctx, lt) {
    const u = seg(lt, WAVE0, WAVE1);
    const yb = lerp(H + 190, -230, E.snap(u));
    const amp = 62 * (1 - 0.5 * u);
    ctx.beginPath();
    ctx.moveTo(-300, H + 300);
    for (let x = -300; x <= W + 300; x += 16) {
      ctx.lineTo(x, yb + amp * Math.sin(x * 0.0076 + lt * 15) + amp * 0.35 * Math.sin(x * 0.019 - lt * 23));
    }
    ctx.lineTo(W + 300, H + 300);
    ctx.closePath();
  }

  // Ride-in: each letter surfaces from below (expoOut, staggered 20 ms) while a travelling sine
  // runs through the line and dies out — the word *is* the wave for a moment, then it's still.
  const RISE = 680, RISE_DUR = 0.2, RIDE_STAG = 0.02, RIDE_A = 40, RIDE_DECAY = 0.19; // starts below frame
  function rideY(lt, i) {
    const tau = lt - (T.FLOW + i * RIDE_STAG);
    const rise = tau <= 0 ? RISE : RISE * (1 - E.expoOut(clamp(tau / RISE_DUR)));
    const env = 1 - E.sineOut(seg(lt, T.FLOW, T.FLOW + RIDE_DECAY));
    return rise + RIDE_A * env * Math.sin(TAU * 4.2 * (lt - T.FLOW) - i * 1.2);
  }

  // Dive: ln s = ln S · u³ (constant-acceleration dolly in log space) → ~150 ms of near-still
  // hold, then an exponential plunge that swallows the frame at u = ZOOM_COVER_U.
  function zoomScale(lt) {
    const u = seg(lt, ZOOM0, ZOOM1);
    const push = 1 + 0.03 * E.sineOut(seg(lt, T.FLOW + 0.05, ZOOM1)); // hold drift
    return Math.exp(Math.log(G.flow.zoomMax) * u * u * u) * push;
  }

  function drawFlow(ctx, lt) {
    const g = G.flow;
    const s = zoomScale(lt);
    const calm = 1 - clamp(Math.log(s) / Math.log(2.5)); // no residual ride once magnified
    const n = g.letters.length;
    const ys = g.letters.map((_, i) => rideY(lt, i) * calm);
    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(s, s);
    ctx.translate(-g.cx, -g.cy); // the O's counter centroid sits exactly on the frame centre
    ctx.fillStyle = P.bone;
    for (let i = 0; i < n; i++) {
      if (lt <= T.FLOW + i * RIDE_STAG) continue;
      const L = g.letters[i];
      // tilt with the local slope of the wave traced by the neighbours
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const slope = Math.atan2(ys[b] - ys[a], g.letters[b].cx - g.letters[a].cx);
      const rot = clamp(slope * 0.5, -14 * DEG, 14 * DEG);
      ctx.save();
      ctx.translate(L.cx, L.cy + ys[i]);
      ctx.rotate(rot);
      ctx.translate(-L.cx, -L.cy);
      ctx.fill(L.path);
      ctx.restore();
    }
    ctx.restore();
  }

  function actFlow(ctx, lt) {
    const s = lt >= ZOOM0 ? zoomScale(lt) : 1;
    if (s >= G.flow.cover * 1.02) return; // inside the counter: solid ink — the handoff contract
    const waving = lt < WAVE1;
    if (waving) {
      ctx.fillStyle = P.ink;
      wavePath(ctx, lt);
      ctx.fill();
      ctx.save();
      wavePath(ctx, lt);
      ctx.clip();
    } else fillBg(ctx, P.ink);
    drawFlow(ctx, lt);
    if (waving) ctx.restore();
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  //  Contract pin: cancel the engine's hit-shake at the exact first instant so the handoff dot is
  //  pixel-exact at (960, 540). Fades to zero within half a frame, so every rendered frame keeps
  //  the full drop shake.
  // ═════════════════════════════════════════════════════════════════════════════════════════
  function pinContract(ctx, api, lt) {
    const k = 1 - clamp(lt * 120);
    if (k <= 0 || api.detail !== 1) return;
    R.unshake(ctx, api, k);
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  R.scene({
    id: 's2',
    shake: 1,
    init() {
      geo(document.createElement('canvas').getContext('2d')); // warm glyph caches
    },
    debug: () => G, // read-only handle for offline inspection
    render(ctx, lt, api) {
      geo(ctx);
      pinContract(ctx, api, lt);

      // I   detonation · MOTION · slice (the halves are gone by SLICE + 0.26)
      if (lt < T.SLICE + 0.26) actMotion(ctx, lt, api);
      // II  is — alone on ink
      else if (lt < T.RHY) drawIs(ctx, lt);
      // III RHYTHM — until the ultra wipe has covered it
      if (lt >= T.RHY && lt < WIPE1) drawRhythm(ctx, lt);
      // IV  TIMING — from the wipe until the iris floods the frame
      if (lt >= WIPE0 && irisR(lt) < 1140) actTiming(ctx, lt);
      // V   & — until the ink wave swallows it
      if (lt >= T.AMP && lt < WAVE1) actAmp(ctx, lt);
      // VI  FLOW → counter dive → ink
      if (lt >= WAVE0) actFlow(ctx, lt);

      if (api.detail === 1) {
        // a breath of bloom on the detonation; a 2-frame digital stutter as RHYTHM cuts in
        // (bloom ramps from zero so the handoff dot keeps its exact bone value at lt = 0)
        const bloom = 0.35 * E.quadOut(seg(lt, 0, 0.012)) * (1 - E.quadOut(seg(lt, 0, 0.3)));
        api.post.bloom = Math.max(api.post.bloom || 0, bloom);
        if (lt >= T.RHY + 0.012 && lt < T.RHY + 0.028) api.post.glitch = Math.max(api.post.glitch || 0, 0.3);
      }
    },
  });
})();
