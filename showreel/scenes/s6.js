// ─────────────────────────────────────────────────────────────────────────────────────────────
//  s6 · MULTIVERSE                                    global 11.250 – 13.125  ·  lt = t − 11.25
//
//  The reel reflects itself. The bone flood s5 leaves behind cracks down the middle and folds
//  into two cards; on every beat each universe divides again — 2 → 2×2 → 3×3 → 4×4 — and every
//  panel is a LIVE render of an earlier scene (R.renderScene), with three solid graphic tiles
//  keeping the rhythm. On the last half-bar the wall implodes back into the dot it came from.
//
//    0.000  CONTRACT   solid P.bone through f675 and its blur sub-frames (overdrawn past the
//                      frame, so the downbeat's hit-shake never shows an edge)
//    0.0075 CRACK      an ink gutter bursts open on the downbeat (overshoots to 60 px, settles
//                      to 16); the halves fold into two 16:9 cards and their bone doors slide
//                      apart on s2 and s3, running live
//    0.469  2×2        mitosis: each card slides away and an identical copy of its universe
//                      peels out from underneath (A ↑ C ↓ · D ↑ B ↓ — counter-motion); once
//                      landed, the copy pushes over to a universe of its own
//    0.9375 3×3        corners shrink into the corners; four edge panels peel out clockwise
//                      (a pinwheel) and the centre tile punches out of the gutter cross, its
//                      counter rolling 04 → 09
//    1.406  4×4        the pinwheel turns once more, the centre tile splits in four, 09 → 16
//    1.60   IMPLOSION  the outer ring rounds off into dots (each in its panel's colour) that
//                      spiral clockwise into the centre; the dot blooms back at the gutter cross,
//                      floods the inner four panels, and they fold into its four quadrants —
//                      the gutter closing to zero
//    1.812+ CONTRACT   P.ink + bone dot r=28 at (960,540), nothing else; engine shake pinned
//
//  Craft notes
//   · Children are born beneath their parent's rect, wearing the parent's universe, so every
//     split reads as one image dividing — never a fade or a cut. The channel change that
//     follows is a push in the direction the child travelled (follow-through).
//   · Position rides R.ease.snap with its velocity peak (45.6 % of the move) placed exactly on
//     the beat frame; size rides a snap-attack curve that lands ~6 % past target and settles
//     (the quick scale overshoot). Stagger is by clockwise angle; children trail parents 12 ms.
//   · Panels render into per-cell offscreen layers at exact ladder sizes (480/640/960/1280 wide),
//     so a nested scene's api.detail — and any shader target it sizes from it — only takes 4
//     values; init() pre-renders every (scene, size) pair so shader compiles land in R.ready.
//     Universes are cover-fitted and drift with a slow push-in done in the crop. A neighbour
//     scene that throws mid-save can only corrupt its scratch layer, which is then unwound.
//   · A 1 px bone bezel keeps dark universes from melting into the ink gutters; registration
//     crosses pop in the gutter intersections after each stage lands.
//
//  Pure function of lt — no Math.random, Date or performance.now.
// ─────────────────────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  const { clamp, lerp, smoothstep, TAU } = R.math;
  const E = R.ease;
  const P = R.P;
  const seg = R.seg;
  const W = R.W, H = R.H, CX = W / 2, CY = H / 2;
  const BEAT = R.BEAT;
  const B1 = BEAT, B2 = 2 * BEAT, B3 = 3 * BEAT;

  // ═════════════════════════════ easing ═════════════════════════════
  const POS = E.snap;                         // house curve for every positional move
  const PEAK = 0.456;                         // where snap's velocity peaks → placed on the beat
  const SIZE = E.bezier(0.7, 0, 0.2, 1.35);   // snap attack, lands ~6 % past target, settles
  const POP = E.bezier(0.55, 0, 0.25, 1.4);   // the centre tile's punch: ~7 % overshoot
  const FOLD = E.bezier(0.45, 0, 0.15, 1.25); // the first fold follows the crack — less wind-up

  // ═════════════════════════════ grid ═════════════════════════════
  // Grid area inset 64/36 px → exactly 16:9, so every stage's panels are ~16:9 too.
  const MX = 64, MY = 36;
  const GW = W - 2 * MX, GH = H - 2 * MY;
  const GUT = [0, 16, 16, 14, 12];            // gutter per stage (index = stage 1..4)
  const RAD = [0, 12, 12, 9, 7];              // corner radius per stage
  const NCOL = [0, 2, 2, 3, 4];
  // Stage-k slot (col c, row r) → [cx, cy, w, h]. Stage 1 = the 2×2 cell size on one centred row.
  function slot(k, c, r) {
    const n = NCOL[k], g = GUT[k];
    const w = (GW - (n - 1) * g) / n, h = (GH - (n - 1) * g) / n;
    return [MX + c * (w + g) + w / 2, k === 1 ? CY : MY + r * (h + g) + h / 2, w, h];
  }

  // Transitions into stage k: snap's velocity peak sits on beat b.
  const TR = [null, null, { b: B1, d: 0.3 }, { b: B2, d: 0.28 }, { b: B3, d: 0.24 }];
  const trStart = (k) => TR[k].b - PEAK * TR[k].d;
  const SPREAD = [0, 0, 0.03, 0.045, 0.035];  // clockwise stagger across a transition
  const CHILD = 0.012;                        // a child trails its parent
  const POP_D = 0.26;                         // the centre tile punches out as the corners clear
  // Channel change (push to the child's own universe): starts at this fraction of the split
  // move and lasts SWAP_D. Stage 1 uses SWAP_D[1] for its bone doors.
  const SWAP_AT = [0, 0, 0.62, 0.6, 0.35];
  const SWAP_D = [0, 0.2, 0.2, 0.18, 0.15];

  // Implosion
  const OUT0 = 1.595, OUT_SPREAD = 0.03, OUT_D = 0.16; // outer ring → dots → spiral in (all home by 1.785)
  const BLOOM0 = 1.6, BLOOM_D = 0.14;                 // the dot blooms back at the gutter cross
  const IN0 = 1.622, IN1 = 1.805;                     // inner four → quadrants of the disc
  const INFOLD = E.bezier(0.5, 0, 0.1, 1);            // the fold: short wind-up, hard landing
  const DOT_R = 28;
  const T_OPEN = 0.0075;  // the flood holds solid through f675 and all its blur sub-frames (lt ≤ .00625)
  const T_CLEAN = 1.812;                              // from here: ink + dot only (contract)
  const SWIRL = 1.25;                                 // radians of clockwise spiral on the way in

  // ═════════════════════════════ cast ═════════════════════════════
  // at: grid slot per stage. from: parent id (born beneath its rect) or 'pop' (out of the gutter
  // cross). src: [scene, hero time] — the panel shows exactly the hero moment as its channel
  // change begins, then runs in real time (wrapping inside that scene's window).
  // tone: the colour the panel becomes as a dot in the implosion.
  const DEF = [
    { id: 'A', born: 1, at: { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] }, src: ['s2', 2.02], tone: P.ultra },
    { id: 'B', born: 1, at: { 1: [1, 0], 2: [1, 1], 3: [2, 2], 4: [3, 3] }, src: ['s3', 5.3], tone: P.bone },
    { id: 'C', born: 2, from: 'A', at: { 2: [0, 1], 3: [0, 2], 4: [0, 3] }, src: ['s5', 9.95], tone: P.signal },
    { id: 'D', born: 2, from: 'B', at: { 2: [1, 0], 3: [2, 0], 4: [3, 0] }, src: ['s2', 3.45], tone: P.bone },
    { id: 'E', born: 3, from: 'A', at: { 3: [1, 0], 4: [1, 0] }, src: ['s4', 7.75], tone: P.bone },
    { id: 'F', born: 3, from: 'D', at: { 3: [2, 1], 4: [3, 1] }, src: ['s1', 0.4], tone: P.bone },
    { id: 'G', born: 3, from: 'B', at: { 3: [1, 2], 4: [2, 3] }, src: ['s2', 3.2], tone: P.ultra },
    { id: 'H', born: 3, from: 'C', at: { 3: [0, 1], 4: [0, 2] }, src: ['s3', 5.75], tone: P.ultra },
    { id: 'I', born: 3, from: 'pop', at: { 3: [1, 1], 4: [1, 1] }, tile: 'count', tone: P.signal },
    { id: 'J', born: 4, from: 'E', at: { 4: [2, 0] }, src: ['s2', 3.92], tone: P.signal },
    { id: 'K', born: 4, from: 'F', at: { 4: [3, 2] }, tile: 'bpm', tone: P.ultra },
    { id: 'L', born: 4, from: 'G', at: { 4: [1, 3] }, tile: 'origin', tone: P.bone },
    { id: 'M', born: 4, from: 'H', at: { 4: [0, 1] }, src: ['s4', 8.6], tone: P.bone },
    { id: 'N', born: 4, from: 'I', at: { 4: [2, 1] }, src: ['s3', 5.4], tone: P.bone },
    { id: 'O', born: 4, from: 'I', at: { 4: [2, 2] }, src: ['s2', 2.1], tone: P.signal },
    { id: 'P', born: 4, from: 'I', at: { 4: [1, 2] }, src: ['s5', 10.5], tone: P.ultra },
  ];

  // ── precompute: rects per stage, start rects, staggered start times, swap timing ──
  const byId = {};
  // 0 just counter-clockwise of the top-left corner cell (so it goes first), increasing
  // clockwise (canvas y is down)
  const CW0 = (-165 * Math.PI) / 180;
  const clockwise = (x, y) => {
    const a = Math.atan2(y - CY, x - CX) - CW0;
    return (((a % TAU) + TAU) % TAU) / TAU;
  };
  const CELLS = DEF.map((d) => {
    const c = Object.assign({}, d, { R: {}, t0: {}, dur: {}, live: !d.tile });
    for (const k in d.at) c.R[k] = slot(+k, d.at[k][0], d.at[k][1]);
    byId[d.id] = c;
    return c;
  });
  for (const c of CELLS) {
    c.parent = c.from && c.from !== 'pop' ? byId[c.from] : null;
    // start rect: the parent's rect at the previous stage, or a point at the gutter cross
    if (c.born > 1) c.start = c.parent ? c.parent.R[c.born - 1] : [CX, CY, 0, 0];
    for (let k = Math.max(2, c.born); k <= 4; k++) {
      let lag = SPREAD[k] * clockwise(c.R[k][0], c.R[k][1]);
      if (k === 4 && c.id === 'I') lag = 0; // the centre splits first, on the beat
      if (k === c.born && c.parent) lag = Math.max(lag, c.parent.t0[k] - trStart(k) + CHILD);
      if (k === c.born && c.from === 'pop') lag = B2 - 0.06 - trStart(k);
      c.t0[k] = trStart(k) + lag;
      c.dur[k] = k === c.born && c.from === 'pop' ? POP_D : TR[k].d;
    }
    // swap window (stage 1: the bone doors; children: the push to their own universe) and the
    // direction it travels — the direction the panel itself travelled when it was born
    if (c.born === 1) {
      c.lag1 = c.id === 'A' ? 0 : 0.018;
      c.sw0 = 0.15 + c.lag1;
      c.dir = c.id === 'A' ? 'l' : 'r';
    } else {
      c.sw0 = c.t0[c.born] + SWAP_AT[c.born] * c.dur[c.born];
      const dx = c.R[c.born][0] - c.start[0], dy = c.R[c.born][1] - c.start[1];
      c.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'd' : 'u';
    }
    c.swD = SWAP_D[c.born];
    // z-order: parents above children (children peel out from underneath); the punching
    // centre tile rides above its own generation
    c.z = (5 - c.born) * 10 + (c.from === 'pop' ? 5 : 0);
    // implosion role
    const [col, row] = c.at[4];
    c.inner = col >= 1 && col <= 2 && row >= 1 && row <= 2;
    if (c.inner) c.quad = [col === 1 ? -1 : 1, row === 1 ? -1 : 1];
  }
  // outer ring implodes in clockwise order from the top-left corner
  const OUTER = CELLS.filter((c) => !c.inner).sort((a, b) => clockwise(a.R[4][0], a.R[4][1]) - clockwise(b.R[4][0], b.R[4][1]));
  OUTER.forEach((c, i) => (c.c0 = OUT0 + (OUT_SPREAD * i) / (OUTER.length - 1)));
  const INNER = CELLS.filter((c) => c.inner);
  const DRAW = [...CELLS].sort((a, b) => a.z - b.z);

  // Gutter crosses (registration marks) per stage: the grid's interior intersections.
  const CROSSES = { 2: [], 3: [], 4: [] };
  for (const k of [2, 3, 4]) {
    const n = NCOL[k], g = GUT[k];
    const w = (GW - (n - 1) * g) / n, h = (GH - (n - 1) * g) / n;
    for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) CROSSES[k].push([MX + i * (w + g) - g / 2, MY + j * (h + g) - g / 2]);
  }

  // ═════════════════════════════ geometry ═════════════════════════════
  const PAD = 48; // overdraw of the opening bone flood beyond the frame (> max hit-shake)

  // Stage 0 → 1: the flood cracks open on the downbeat and folds into two cards.
  function openRect(c, lt) {
    const s = c.R[1];
    const left = c.id === 'A';
    const t = lt - c.lag1;
    const gap = R.keys(lt, [[T_OPEN, 0], [0.085, 60, 'expoOut'], [0.36, GUT[1], E.snap]]);
    const inner = left ? CX - gap / 2 : CX + gap / 2;
    const uo = POS(seg(t, 0.02, 0.3));
    const outer = left ? lerp(-PAD, s[0] - s[2] / 2, uo) : lerp(W + PAD, s[0] + s[2] / 2, uo);
    const hh = lerp(H / 2 + PAD, s[3] / 2, FOLD(seg(t, 0.03, 0.35)));
    const x0 = left ? outer : inner, x1 = left ? inner : outer;
    return [(x0 + x1) / 2, CY, Math.max(0, x1 - x0), 2 * hh];
  }

  const tween = (a, b, up, us) => [lerp(a[0], b[0], up), lerp(a[1], b[1], up), Math.max(0, lerp(a[2], b[2], us)), Math.max(0, lerp(a[3], b[3], us))];

  // Grid rect of cell c at lt (before the implosion), or null before it is born.
  function gridRect(c, lt) {
    let r, k0;
    if (c.born === 1) {
      r = openRect(c, lt);
      k0 = 2;
    } else {
      if (lt < c.t0[c.born]) return null;
      r = c.start;
      k0 = c.born;
    }
    for (let k = k0; k <= 4; k++) {
      const u = seg(lt, c.t0[k], c.t0[k] + c.dur[k]);
      if (u <= 0) break;
      r = tween(r, c.R[k], POS(u), (k === c.born && c.from === 'pop' ? POP : SIZE)(u));
    }
    return r;
  }

  // Corner radius, eased between the stage radii as the grid subdivides.
  function radiusAt(c, lt) {
    if (c.born === 1 && lt < 0.4) return RAD[1] * smoothstep(0.0, 0.2, lt);
    let r = RAD[c.born];
    for (let k = Math.max(2, c.born + 1); k <= 4; k++) r = lerp(r, RAD[k], POS(seg(lt, c.t0[k], c.t0[k] + c.dur[k])));
    return r;
  }

  // Bloom: the bone dot re-emerging at the gutter cross and flooding the inner block.
  const bloomR = (lt) => (lt >= BLOOM0 ? 560 * E.cubicOut(seg(lt, BLOOM0, BLOOM0 + BLOOM_D)) : 0);

  // Full state of a cell at lt: { rect, radii, swap, tone, chipA } or null.
  function cellState(c, lt) {
    let rect = gridRect(c, lt);
    if (!rect) return null;
    const rr = radiusAt(c, lt);
    let radii = [rr, rr, rr, rr];
    let tone = 0;
    const swap = POS(seg(lt, c.sw0, c.sw0 + c.swD));
    let chipA = c.live ? E.quadOut(seg(lt, c.sw0 + c.swD * 0.8, c.sw0 + c.swD + 0.1)) : 0;

    if (!c.inner) {
      // outer ring: round off into a dot, then spiral into the centre, accelerating
      const k = seg(lt, c.c0, c.c0 + OUT_D);
      if (k >= 1) return null;
      if (k > 0) {
        const us = E.snap(seg(k, 0, 0.55));   // card → dot
        const up = E.quadIn(seg(k, 0.06, 1)); // drawn in while it forms, accelerating home
        const d = lerp(30, 12, up);
        const [x0, y0, w0, h0] = rect;
        const rho = Math.hypot(x0 - CX, y0 - CY) * (1 - up);
        const th = Math.atan2(y0 - CY, x0 - CX) + SWIRL * up;
        const w = lerp(w0, d, us), h = lerp(h0, d, us);
        rect = [CX + rho * Math.cos(th), CY + rho * Math.sin(th), w, h];
        const r = lerp(rr, Math.min(w, h) / 2, us);
        radii = [r, r, r, r];
        tone = smoothstep(0.33, 0.38, k); // content holds while it shrinks, then snaps to its colour
        chipA *= 1 - seg(k, 0, 0.12);
      }
    } else {
      // inner four: flooded by the bloom, then folded into the four quadrants of the disc.
      // The far corners round off early, so the block reads as a pill closing into a dot.
      const b = bloomR(lt);
      if (b > 0) chipA *= 1 - seg(lt, BLOOM0, BLOOM0 + 0.04);
      const k = seg(lt, IN0, IN1);
      if (k > 0) {
        const u = INFOLD(k);
        const [sx, sy] = c.quad;
        const [x0, y0, w0, h0] = rect;
        // current edges → the quadrant square of side DOT_R touching the centre
        const L0 = x0 - w0 / 2, R0 = x0 + w0 / 2, T0 = y0 - h0 / 2, B0 = y0 + h0 / 2;
        const L1 = sx < 0 ? CX - DOT_R : CX, R1 = sx < 0 ? CX : CX + DOT_R;
        const T1 = sy < 0 ? CY - DOT_R : CY, Bt = sy < 0 ? CY : CY + DOT_R;
        const l = lerp(L0, L1, u), r = lerp(R0, R1, u), t = lerp(T0, T1, u), bt = lerp(B0, Bt, u);
        rect = [(l + r) / 2, (t + bt) / 2, r - l, bt - t];
        const far = lerp(rr, Math.min(r - l, bt - t), E.quadOut(seg(k, 0, 0.45))), near = lerp(rr, 0, u);
        // corner order tl, tr, br, bl — the far corner points away from the centre
        radii = [
          sx < 0 && sy < 0 ? far : near,
          sx > 0 && sy < 0 ? far : near,
          sx > 0 && sy > 0 ? far : near,
          sx < 0 && sy > 0 ? far : near,
        ];
      }
      // flooded once the bloom reaches the quadrant's outermost corner
      const [qx, qy, qw, qh] = rect;
      if (b > 0 && b >= Math.hypot(Math.abs(qx - CX) + qw / 2, Math.abs(qy - CY) + qh / 2)) tone = 1;
    }
    return { rect, radii, swap, tone, chipA };
  }

  // ═════════════════════════════ drawing helpers ═════════════════════════════
  // Rounded rect with per-corner radii [tl, tr, br, bl], CSS-style clamping.
  function rrPath(ctx, x, y, w, h, rad) {
    let [a, b, c, d] = rad;
    const f = Math.min(1, w / Math.max(1e-6, a + b), w / Math.max(1e-6, d + c), h / Math.max(1e-6, a + d), h / Math.max(1e-6, b + c));
    a *= f; b *= f; c *= f; d *= f;
    ctx.moveTo(x + a, y);
    ctx.lineTo(x + w - b, y);
    if (b > 0) ctx.arc(x + w - b, y + b, b, -Math.PI / 2, 0);
    ctx.lineTo(x + w, y + h - c);
    if (c > 0) ctx.arc(x + w - c, y + h - c, c, 0, Math.PI / 2);
    ctx.lineTo(x + d, y + h);
    if (d > 0) ctx.arc(x + d, y + h - d, d, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + a);
    if (a > 0) ctx.arc(x + a, y + a, a, Math.PI, Math.PI * 1.5);
    ctx.closePath();
  }

  const SCN = {};
  for (const s of R.SCENES) SCN[s.id] = s;
  // Hero time + elapsed since the swap began, wrapped inside the source scene's window.
  function srcTime(c, lt) {
    const s = SCN[c.src[0]], d = s.end - s.start;
    const x = c.src[1] + (lt - c.sw0) - s.start;
    return s.start + (((x % d) + d) % d);
  }

  // Offscreen ladder: the smallest layer at least as wide as the panel's cover-fit width.
  const LADDER = [[480, 270], [640, 360], [960, 540], [1280, 720]];
  const pickLayer = (needW) => LADDER.find((s) => s[0] >= needW * 0.97) || LADDER[LADDER.length - 1];

  // Render cell c's universe, cover-fitted with a slow push-in, into (x, y, w, h).
  // key names the layer: the cell doing the drawing (a child copy never shares its parent's).
  function drawUniverse(ctx, c, lt, api, x, y, w, h, key) {
    if (w < 20 || h < 12) {
      ctx.fillStyle = c.tone;
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      return;
    }
    const zoom = 1.02 + 0.03 * clamp(lt - c.sw0, 0, 2); // constant drift — never static
    const [LW, LH] = pickLayer(Math.max(w, (h * 16) / 9) * zoom);
    // one layer per cell (and rung): re-using a single scratch canvas for every panel forces
    // the GPU to snapshot it before each clear — a flush stall per panel
    const L = api.layer('panel-' + key, LW, LH);
    const lc = L.ctx;
    lc.fillStyle = P.ink;
    lc.fillRect(0, 0, LW, LH);
    const t = srcTime(c, lt);
    try {
      // exact ladder size → the nested scene's api.detail only ever takes 4 values
      R.renderScene(c.src[0], t, lc, 0, 0, LW, LH);
    } catch (e) {
      R.errors.push({ scene: 's6-panel', t: api.t, msg: `${c.id}:${c.src[0]}@${t.toFixed(3)} ` + String(e && e.stack) });
      for (let i = 0; i < 64; i++) lc.restore(); // unwind whatever the failed scene left saved
    }
    // cover-fit crop to the panel's aspect, tightened by the push-in
    const a = w / h;
    let sw = LW, sh = LW / a;
    if (sh > LH) { sh = LH; sw = LH * a; }
    sw /= zoom; sh /= zoom;
    ctx.drawImage(L.canvas, (LW - sw) / 2, (LH - sh) / 2, sw, sh, x, y, w, h);
  }

  // A cell's look: its live universe or its graphic tile.
  function drawLook(ctx, c, lt, api, x, y, w, h, key = c.id) {
    if (c.live) drawUniverse(ctx, c, lt, api, x, y, w, h, key);
    else drawTile(ctx, c, lt, x, y, w, h);
  }
  // A newborn wears its parent's look: a live universe stays live; a tile is a snapshot
  // frozen at the split (so its counter doesn't tick in four places at once).
  function drawParentLook(ctx, c, lt, api, x, y, w, h) {
    const p = c.parent;
    drawLook(ctx, p, p.live ? lt : Math.min(lt, c.t0[c.born]), api, x, y, w, h, c.id + '<' + p.id);
  }

  // Stage-1 bone doors: fraction v of the panel, anchored at the outer edge.
  function drawDoor(ctx, v, dir, x, y, w, h) {
    if (v <= 0) return;
    ctx.fillStyle = P.bone;
    if (dir === 'l') ctx.fillRect(x - 1, y - 1, w * v + 1, h + 2);
    else ctx.fillRect(x + w * (1 - v), y - 1, w * v + 1, h + 2);
  }

  // Source chip: "S2  02:07" — scene id + the source's live timecode (seconds:frames).
  function drawChip(ctx, c, lt, a, x, y) {
    if (a <= 0.01) return;
    const t = srcTime(c, lt);
    const ss = String(Math.floor(t)).padStart(2, '0'), ff = String(Math.floor((t % 1) * 60)).padStart(2, '0');
    const txt = `${c.src[0].toUpperCase()}  ${ss}:${ff}`;
    R.font(ctx, { family: 'JetBrains Mono', weight: 500, size: 13, spacing: 1.5, align: 'left', baseline: 'middle' });
    const shown = txt.slice(0, Math.ceil(txt.length * clamp(a * 1.4)));
    const tw = ctx.measureText(shown).width;
    ctx.globalAlpha = a;
    ctx.fillStyle = R.col.rgba(P.ink, 0.72);
    ctx.beginPath();
    rrPath(ctx, x, y, tw + 16, 22, [4, 4, 4, 4]);
    ctx.fill();
    ctx.fillStyle = P.bone;
    ctx.fillText(shown, x + 8, y + 11.5);
    ctx.globalAlpha = 1;
  }

  // ── graphic tiles ──
  // Mono numeral with per-digit slot-machine rolls. rolls: [[t, from, to], ...] in time order.
  // Digits roll through a slot window from just above cap height down to the baseline: the
  // old digit exits through the top edge as the new one rises out of the baseline.
  function rollNumber(ctx, lt, rolls, x, base, size, fill) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - size, base - size * 0.8, size * 8, size * 0.84);
    ctx.clip();
    R.font(ctx, { family: 'JetBrains Mono', weight: 800, size, spacing: -size * 0.05, align: 'left' });
    const adv = ctx.measureText('0').width - size * 0.05;
    let cur = rolls[0][1], active = null;
    for (const r of rolls) if (lt >= r[0]) { cur = r[2]; active = r; }
    ctx.fillStyle = fill;
    const lineH = size * 0.84;
    for (let i = 0; i < cur.length; i++) {
      const dx = x + i * adv;
      if (active) {
        const from = active[1][i] || ' ', to = active[2][i] || ' ';
        const u = POS(seg(lt, active[0] + 0.03 * i, active[0] + 0.03 * i + 0.14));
        if (from !== to && u < 1) {
          if (from !== ' ') ctx.fillText(from, dx, base - u * lineH);
          if (to !== ' ') ctx.fillText(to, dx, base + (1 - u) * lineH);
          continue;
        }
      }
      if (cur[i] !== ' ') ctx.fillText(cur[i], dx, base);
    }
    ctx.restore();
  }

  function tileLabel(ctx, txt, x, y, fill) {
    R.font(ctx, { family: 'JetBrains Mono', weight: 500, size: 14, spacing: 3, align: 'left', baseline: 'top' });
    ctx.fillStyle = fill;
    ctx.fillText(txt, x, y);
  }

  function drawTile(ctx, c, lt, x, y, w, h) {
    const pad = Math.max(10, h * 0.065);
    const size = h * 0.62;
    if (c.tile === 'count') {
      ctx.fillStyle = P.signal;
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      tileLabel(ctx, 'UNIVERSES', x + pad, y + pad, P.ink);
      rollNumber(ctx, lt, [[c.t0[3] + 0.1, '04', '09'], [B3 - 0.02, '09', '16']], x + pad - size * 0.04, y + h - pad * 0.9, size, P.ink);
    } else if (c.tile === 'bpm') {
      ctx.fillStyle = P.ultra;
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      tileLabel(ctx, 'BPM', x + pad, y + pad, P.bone);
      // metronome pip — the scene's only lime, a few pixels, kicking on the beat
      const ph = (((lt - B3) % BEAT) + BEAT) % BEAT;
      ctx.fillStyle = P.lime;
      ctx.beginPath();
      ctx.arc(x + w - pad - 5, y + pad + 7, 4.5 + 2.5 * Math.exp(-ph * 14), 0, TAU);
      ctx.fill();
      rollNumber(ctx, lt, [[c.sw0, '   ', '128']], x + pad - size * 0.04, y + h - pad * 0.9, size, P.bone);
    } else if (c.tile === 'origin') {
      ctx.fillStyle = P.bone;
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      tileLabel(ctx, 'ORIGIN', x + pad, y + pad, P.ink);
      // the protagonist, inverted — springs in
      const s = R.spring.bouncy(lt - c.sw0 - 0.03);
      const r = Math.min(w, h) * 0.16 * s;
      if (r > 0.3) {
        ctx.fillStyle = P.ink;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2 + h * 0.04, r, 0, TAU);
        ctx.fill();
      }
    }
  }

  // One cell, fully composed: clip → look(s) → door / push seam → tone → chip.
  function drawCell(ctx, c, st, lt, api) {
    const [cx, cy, w, h] = st.rect;
    if (w < 0.5 || h < 0.5) return;
    const x = cx - w / 2, y = cy - h / 2;
    ctx.beginPath();
    rrPath(ctx, x, y, w, h, st.radii);
    if (st.tone >= 0.999) {
      ctx.fillStyle = c.inner ? P.bone : c.tone;
      ctx.fill();
      return;
    }
    ctx.save();
    ctx.clip();
    if (c.born === 1) {
      // the two first cards: live underneath, bone doors sliding apart
      if (st.swap > 0) drawLook(ctx, c, lt, api, x, y, w, h);
      drawDoor(ctx, 1 - st.swap, c.dir, x, y, w, h);
    } else if (!c.parent || st.swap >= 1) {
      drawLook(ctx, c, lt, api, x, y, w, h);
    } else if (st.swap <= 0) {
      drawParentLook(ctx, c, lt, api, x, y, w, h); // born wearing the parent's universe
    } else {
      // push: the incoming universe enters from the parent side, shoving the copy out ahead
      const v = st.swap;
      const hz = c.dir === 'l' || c.dir === 'r';
      const s = c.dir === 'r' || c.dir === 'd' ? 1 : -1;
      const L = hz ? w : h, off = v * L * s;
      const ox = hz ? off : 0, oy = hz ? 0 : off;
      drawParentLook(ctx, c, lt, api, x + ox, y + oy, w, h);
      drawLook(ctx, c, lt, api, x + ox - (hz ? L * s : 0), y + oy - (hz ? 0 : L * s), w, h);
      // the seam: a hairline of bone riding the join, brightest mid-push
      ctx.globalAlpha = Math.sin(Math.PI * v);
      ctx.fillStyle = P.bone;
      if (hz) ctx.fillRect(x + (s > 0 ? v * w : (1 - v) * w) - 1, y - 1, 2, h + 2);
      else ctx.fillRect(x - 1, y + (s > 0 ? v * h : (1 - v) * h) - 1, w + 2, 2);
      ctx.globalAlpha = 1;
    }
    if (st.tone > 0) {
      ctx.fillStyle = R.col.rgba(c.inner ? P.bone : c.tone, st.tone);
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    }
    // bezel: a 1 px bone hairline just inside the edge, so dark universes never melt into
    // the ink gutters and the grid always reads
    const bz = 0.16 * (1 - st.tone) * (c.born === 1 ? st.swap : 1);
    if (bz > 0.005) {
      ctx.strokeStyle = R.col.rgba(P.bone, bz);
      ctx.lineWidth = 2;
      ctx.beginPath();
      rrPath(ctx, x, y, w, h, st.radii);
      ctx.stroke();
    }
    if (c.live && st.chipA > 0) drawChip(ctx, c, lt, st.chipA, x + 10, y + 10);
    // the bloom paints last: the dot swallows everything in the inner four, UI included
    if (c.inner) {
      const b = bloomR(lt);
      if (b > 0) {
        ctx.fillStyle = P.bone;
        ctx.beginPath();
        ctx.arc(CX, CY, b, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Registration crosses in the gutter intersections: pop after each stage lands.
  function drawCrosses(ctx, lt) {
    for (const k of [2, 3, 4]) {
      const a0 = trStart(k) + TR[k].d * 0.7;
      const a1 = k < 4 ? trStart(k + 1) + 0.02 : OUT0 + 0.02;
      if (lt < a0 || lt > a1) continue;
      const out = 1 - E.quadIn(seg(lt, a1 - 0.06, a1));
      ctx.strokeStyle = R.col.rgba(P.bone, 0.9 * out);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [px, py] of CROSSES[k]) {
        const d = Math.hypot(px - CX, py - CY) / 700;
        const s = E.backOut(seg(lt, a0 + d * 0.06, a0 + d * 0.06 + 0.14)) * 8;
        if (s <= 0.01) continue;
        ctx.moveTo(px - s, py); ctx.lineTo(px + s, py);
        ctx.moveTo(px, py - s); ctx.lineTo(px, py + s);
      }
      ctx.stroke();
    }
  }

  // Undo the engine hit-shake (R.unshake) so the contract frames are pixel-exact.
  function pinShake(ctx, api, w) {
    if (w <= 0 || api.detail !== 1) return;
    R.unshake(ctx, api, w);
  }

  // ═════════════════════════════ scene ═════════════════════════════
  // Boot-time warm-up: render every (scene, ladder rung) pair the panels will ever use once,
  // so one-off costs — above all a WebGL context + shader compile per new target size in
  // shader scenes — land in R.ready instead of in the middle of the build.
  function warmUp() {
    const pairs = new Map();
    for (let f = 0; f < 113; f++) {
      const lt = f / 60 + 0.004;
      for (const c of CELLS) {
        const st = cellState(c, lt);
        if (!st) continue;
        const [, , w, h] = st.rect;
        if (w < 20 || h < 12) continue;
        for (const o of [c, c.parent]) {
          if (!o || !o.live) continue;
          const zoom = 1.02 + 0.03 * clamp(lt - o.sw0, 0, 2);
          const rung = pickLayer(Math.max(w, (h * 16) / 9) * zoom);
          pairs.set(o.src[0] + '@' + rung[0], [o, rung]);
        }
      }
    }
    for (const [o, [LW, LH]] of pairs.values()) {
      const L = R.layer('s6:warm', LW, LH);
      try {
        R.renderScene(o.src[0], o.src[1], L.ctx, 0, 0, LW, LH);
      } catch (e) {
        for (let i = 0; i < 64; i++) L.ctx.restore();
      }
    }
  }

  R.scene({
    id: 's6',
    shake: 0.8,
    init() {
      try { warmUp(); } catch (e) { /* never let a neighbour's scene block boot */ }
    },
    debug: () => ({ CELLS, OUTER, slot, cellState }),
    render(ctx, lt, api) {
      pinShake(ctx, api, smoothstep(T_CLEAN - 0.035, T_CLEAN, lt));

      // ── contract out: ink + the dot, nothing else ──
      if (lt >= T_CLEAN) {
        ctx.fillStyle = P.bone;
        ctx.beginPath();
        ctx.arc(CX, CY, DOT_R, 0, TAU);
        ctx.fill();
        return;
      }
      // ── contract in: the flood, before the crack has opened a pixel ──
      if (lt <= T_OPEN) {
        ctx.fillStyle = P.bone;
        ctx.fillRect(-PAD, -PAD, W + 2 * PAD, H + 2 * PAD);
        return;
      }

      // Nested scenes must never touch this frame's post (they guard on detail — be sure anyway).
      const postSaved = api.post ? Object.assign({}, api.post) : null;

      const states = [];
      for (const c of DRAW) {
        const st = cellState(c, lt);
        if (st) states.push([c, st]);
      }
      if (lt >= OUT0) {
        // implosion: dots ride above the cards; the inner block (where they vanish) on top
        const key = ([c, st]) => (c.inner ? 1000 : st.tone > 0 || st.rect[2] < 200 ? 100 + clamp(1 - st.rect[2] / 500) : c.z);
        states.sort((a, b) => key(a) - key(b));
      }
      // Once the bloom has flooded the inner four, draw them as ONE path so the quadrant
      // seams can never show (adjacent edges in one fill rasterize without a hairline).
      const merged = states.filter(([c, st]) => c.inner && st.tone >= 1).length === INNER.length;
      for (const [c, st] of states) if (!(merged && c.inner)) drawCell(ctx, c, st, lt, api);
      if (merged) {
        ctx.beginPath();
        for (const [c, st] of states) {
          if (!c.inner) continue;
          const [cx, cy, w, h] = st.rect;
          rrPath(ctx, cx - w / 2, cy - h / 2, w, h, st.radii);
        }
        ctx.fillStyle = P.bone;
        ctx.fill();
      }

      drawCrosses(ctx, lt);

      if (postSaved) {
        for (const k of Object.keys(api.post)) if (!(k in postSaved)) delete api.post[k];
        Object.assign(api.post, postSaved);
      }
    },
  });
})();
