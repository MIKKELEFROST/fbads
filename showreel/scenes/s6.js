// ─────────────────────────────────────────────────────────────────────────────────────────────
//  s6 · MULTIVERSE                                    global 11.250 – 13.125  ·  lt = t − 11.25
//
//  The reel reflects itself. The bone flood s5 leaves behind cracks down the middle and folds
//  into two cards; on every beat each universe divides again — 2 → 2×2 → 3×3 → 4×4 — and every
//  panel is a LIVE render of an earlier scene (R.renderScene), with three solid graphic tiles
//  keeping the rhythm. In the soundtrack's tension gap the wall implodes back into the dot.
//
//    0.000  CRACK      the first frame IS the impact: the flood is torn open down the middle —
//                      a jagged ~120 px tear with a signal-hot core — bursting wider for a frame,
//                      then straightening and snapping shut to a 16 px gutter as the halves fold
//                      into two cards. Their bone doors are blown open right behind the crack
//                      (s2's drop / s3 readable from lt ≈ 0.05), matted by the flood's bone
//                      to the HUD safe frame until the cards have folded inside it
//    0.469  2×2        mitosis: each card slides away and an identical copy of its universe
//                      peels out from underneath (A ↑ C ↓ · D ↑ B ↓ — counter-motion); once
//                      landed, the copy pushes over to a universe of its own
//    0.9375 3×3        corners shrink into the corners; four edge panels peel out clockwise
//                      (a pinwheel) and the centre tile punches out of the gutter cross, its
//                      counter rolling 04 → 09
//    1.406  4×4        the pinwheel turns once more (a harder, shorter whip); the newborns switch
//                      to their own universes while still under their parents; 09 → 16 on the
//                      beat frame. The full wall is at rest from ≈ 1.53 to 1.68 (≥ 150 ms)
//    1.68   IMPLOSION  = the soundtrack's tension gap (b28 − 0.2 s): the outer ring rounds off
//                      into dots (each in its panel's colour) that spiral clockwise into the
//                      centre; the dot blooms back at the gutter cross, floods the inner four,
//                      and they fold into its four quadrants — the gutter closing to zero
//    1.848+ CONTRACT   P.ink + bone dot r=28 at (960,540), nothing else (f786–787); shake pinned
//
//  Craft notes
//   · The wall lives inside the HUD safe frame (x 199–1721, y 112–968: the frame itself scaled
//     to 0.85, so every stage's panels stay ~16:9) — no HUD corner ever prints over a panel.
//   · Every universe is BEAT-LOCKED (src = [scene, beat offset]): its own slams, wipes and
//     contacts land on s6's beats, together with the splits and the soundtrack's stutter hits.
//   · Children are born beneath their parent's rect, wearing the parent's universe, so every
//     split reads as one image dividing — never a fade or a cut. The channel change that
//     follows is a push in the direction the child travelled (follow-through).
//   · Position rides R.ease.snap with its velocity peak (45.6 % of the move) placed exactly on
//     the beat frame; size rides a snap-attack curve that lands ~6 % past target and settles
//     (the quick scale overshoot). Stagger is by clockwise angle; children trail parents 12 ms.
//   · Panels render into per-universe offscreen canvases at exact ladder sizes (480/640/960/
//     1280 wide), so a nested scene's api.detail only takes 4 values; init() pre-renders every
//     (scene, size) pair so shader compiles land in R.ready. A newborn copy shares its parent's
//     canvas. Motion blur: samplesAt() raises the shutter to 16 samples on the doors, the pushes
//     and the implosion (8 on the split whips), while panel CONTENT is still rendered at only
//     4 sub-frame times (cached) — the extra samples cost compositing, not nested renders.
//   · Source labels print within 4 frames (a short scramble on first appearance only).
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
  const DOOR = E.bezier(0.2, 0.75, 0.25, 1);  // doors blown open by the crack: fast out, soft stop

  // ═════════════════════════════ grid ═════════════════════════════
  // The HUD safe frame (96 px margins + the corner clusters): a 16:9 wall, y 112–968.
  const GH = 856, GW = Math.round((GH * 16) / 9);
  const MX = (W - GW) / 2, MY = (H - GH) / 2;
  const SAFE = [96, 112, W - 96, H - 112];    // HUD safe frame [x0, y0, x1, y1]
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
  const TR = [null, null, { b: B1, d: 0.3 }, { b: B2, d: 0.28 }, { b: B3, d: 0.18 }];
  const trStart = (k) => TR[k].b - PEAK * TR[k].d;
  const SPREAD = [0, 0, 0.03, 0.045, 0.015];  // clockwise stagger across a transition
  const CHILD = 0.012;                        // a child trails its parent
  const POP_D = 0.26;                         // the centre tile punches out as the corners clear
  // Channel change (push to the child's own universe): starts at this fraction of the split
  // move and lasts SWAP_D. Stage 4 swaps almost at once — the newborns are still under their
  // parents, so the small, fast 4×4 split never shows a pile of duplicates.
  const SWAP_AT = [0, 0, 0.62, 0.6, 0.05];
  const SWAP_D = [0, 0.22, 0.2, 0.18, 0.12];  // [1] = the stage-1 bone doors

  // Opening (the crack)
  const DOOR0 = 0.02, DOOR_LAG = 0.015;       // doors open right behind the crack, B a hair later
  const JAG_END = 0.14;                       // the torn edges have straightened by here
  const GAP = [[0, 120], [0.025, 136, 'expoOut'], [0.27, 16, E.snap]]; // gutter burst → settle

  // Implosion — inside the soundtrack's tension gap (b28 − 0.2 s = lt 1.675)
  const OUT0 = 1.68, OUT_SPREAD = 0.016, OUT_D = 0.152; // outer ring → dots → spiral in (home by 1.848)
  const BLOOM0 = 1.683, BLOOM_D = 0.09;                 // the dot blooms back at the gutter cross
  const IN0 = 1.692, IN1 = 1.815;                       // inner four → quadrants of the disc
  const INFOLD = E.bezier(0.5, 0, 0.1, 1);              // the fold: short wind-up, hard landing
  const DOT_R = 28;
  const T_CLEAN = 1.848;                                // from here: ink + dot only (f786–787)
  const SWIRL = 1.25;                                   // radians of clockwise spiral on the way in

  // Source labels
  const CHIP_IN = 0.05, CHIP_DEC = 4 / 60;              // pill wipe · scramble → resolved in 4 frames

  // ═════════════════════════════ cast ═════════════════════════════
  // at: grid slot per stage. from: parent id (born beneath its rect) or 'pop' (out of the gutter
  // cross). src: [scene, beat offset] — the universe runs in real time, BEAT-LOCKED: on s6 beat n
  // it shows its source's beat n + offset (wrapping inside that scene's window), so every slam,
  // wipe and contact in every panel lands on the same beats as the splits and the stutter hits.
  // Offsets are chosen for the hero moment at each channel change and for the wall at rest
  // (in brackets); panels on the same source use distinct offsets, so no two ever match.
  // zoom/focus: extra crop into the source (s1's dot is tiny at panel size).
  // tone: the colour the panel becomes as a dot in the implosion.
  const DEF = [
    { id: 'A', born: 1, at: { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] }, src: ['s2', -20], tone: P.ultra },   // drop → MOTION · is on b25 · [TIMING]
    { id: 'B', born: 1, at: { 1: [1, 0], 2: [1, 1], 3: [2, 2], 4: [3, 3] }, src: ['s3', -13], tone: P.bone },    // squircle + spring graph · [bone disc]
    { id: 'C', born: 2, from: 'A', at: { 2: [0, 1], 3: [0, 2], 4: [0, 3] }, src: ['s5', -4], tone: P.signal },   // fluid splash · [the flood blob]
    { id: 'D', born: 2, from: 'B', at: { 2: [1, 0], 3: [2, 0], 4: [3, 0] }, src: ['s2', -18], tone: P.bone },    // TIMING drop · & · [FLOW]
    { id: 'E', born: 3, from: 'A', at: { 3: [1, 0], 4: [1, 0] }, src: ['s4', -10], tone: P.bone, zoom: 1.25 },   // the s4 burst · [torus]
    { id: 'F', born: 3, from: 'D', at: { 3: [2, 1], 4: [3, 1] }, src: ['s1', -25], tone: P.bone, zoom: 1.9, focus: [960, 610] }, // bounce, contact on b27 · [thesis line]
    { id: 'G', born: 3, from: 'B', at: { 3: [1, 2], 4: [2, 3] }, src: ['s2', -23], tone: P.signal },  // FLOW rising · [MOTION]
    { id: 'H', born: 3, from: 'C', at: { 3: [0, 1], 4: [0, 2] }, src: ['s3', -14], tone: P.ultra },   // triangle · [star]
    { id: 'I', born: 3, from: 'pop', at: { 3: [1, 1], 4: [1, 1] }, tile: 'count', tone: P.signal },
    { id: 'J', born: 4, from: 'E', at: { 4: [2, 0] }, src: ['s2', -19], tone: P.signal },   // & iris on b27 · [&]
    { id: 'K', born: 4, from: 'F', at: { 4: [3, 2] }, tile: 'bpm', tone: P.ultra },
    { id: 'L', born: 4, from: 'G', at: { 4: [1, 3] }, tile: 'origin', tone: P.bone },
    { id: 'M', born: 4, from: 'H', at: { 4: [0, 1] }, src: ['s4', -8], tone: P.bone },     // terrain rolls up on b27 · [tunnel]
    { id: 'N', born: 4, from: 'I', at: { 4: [2, 1] }, src: ['s3', -15], tone: P.bone },    // squircle → triangle
    { id: 'O', born: 4, from: 'I', at: { 4: [2, 2] }, src: ['s2', -22], tone: P.signal },  // the blade slice on b27 · [is]
    { id: 'P', born: 4, from: 'I', at: { 4: [1, 2] }, src: ['s5', -5], tone: P.ultra },    // fluid
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
      c.lag1 = c.id === 'A' ? 0 : DOOR_LAG;
      c.sw0 = DOOR0 + c.lag1;
      c.dir = c.id === 'A' ? 'l' : 'r';
    } else {
      c.sw0 = c.t0[c.born] + SWAP_AT[c.born] * c.dur[c.born];
      const dx = c.R[c.born][0] - c.start[0], dy = c.R[c.born][1] - c.start[1];
      c.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'd' : 'u';
    }
    c.swD = SWAP_D[c.born];
    c.chip0 = c.sw0 + c.swD * 0.75; // the label prints as the channel change lands
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

  // The tear: one jagged profile shared by both halves (so the two edges are complementary),
  // as [v down the card 0..1, dx −1..1]. Short, irregular segments read as a crack, not a wave.
  const CRACK = (() => {
    const rnd = R.rng(2411);
    const pts = [[0, 0]];
    for (let v = 0; v < 1; ) {
      v = Math.min(1, v + 0.028 + rnd() * 0.05);
      pts.push([v, rnd() * 2 - 1]);
    }
    return pts;
  })();
  const jagAmp = (lt) => 28 * (1 - E.cubicOut(seg(lt, 0, JAG_END)));
  const bulge = (lt) => 1 - E.cubicOut(seg(lt, 0, JAG_END)); // the burst is widest at the centre
  // x of a half's torn inner edge at v (sx = −1: left card A, +1: right card B)
  const crackX = (lt, gap, v, dx, sx) => CX + sx * (gap / 2) * (1 + 0.4 * bulge(lt) * (Math.sin(Math.PI * v) - 0.5)) + dx * jagAmp(lt);

  // Stage 0 → 1: the flood tears open on the downbeat and folds into two cards.
  // Returns [cx, cy, w, h, gap]; while the tear is jagged the rect's inner edge reaches the
  // furthest point of the torn edge (the clip path carves the rest).
  function openRect(c, lt) {
    const s = c.R[1];
    const left = c.id === 'A';
    const t = lt - c.lag1;
    const gap = R.keys(lt, GAP);
    const reach = gap / 2 - (gap / 2) * 0.2 * bulge(lt) - jagAmp(lt); // innermost point of the tear
    const inner = left ? CX - reach : CX + reach;
    const uo = POS(seg(t, 0.01, 0.27));
    const outer = left ? lerp(-PAD, s[0] - s[2] / 2, uo) : lerp(W + PAD, s[0] + s[2] / 2, uo);
    const hh = lerp(H / 2 + PAD, s[3] / 2, FOLD(seg(t, 0.015, 0.29)));
    const x0 = left ? outer : inner, x1 = left ? inner : outer;
    return [(x0 + x1) / 2, CY, Math.max(0, x1 - x0), 2 * hh, gap];
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
  const bloomR = (lt) => (lt >= BLOOM0 ? 480 * E.cubicOut(seg(lt, BLOOM0, BLOOM0 + BLOOM_D)) : 0);

  // Full state of a cell at lt: { rect, radii, swap, tone, chipA, crack } or null.
  function cellState(c, lt) {
    let rect = gridRect(c, lt);
    if (!rect) return null;
    const crack = c.born === 1 && lt < JAG_END ? rect[4] : 0;
    const rr = radiusAt(c, lt);
    let radii = [rr, rr, rr, rr];
    let tone = 0;
    const swap = (c.born === 1 ? DOOR : POS)(seg(lt, c.sw0, c.sw0 + c.swD));
    let chipA = c.live ? E.quadOut(seg(lt, c.chip0, c.chip0 + CHIP_IN)) : 0;

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
      if (b > 0) chipA *= 1 - seg(lt, BLOOM0, BLOOM0 + 0.03);
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
    return { rect, radii, swap, tone, chipA, crack };
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

  // A cell's outline: its rounded rect, or — for the two first cards while the tear is still
  // jagged — the torn polygon (straight outer edges, the shared crack profile inside).
  function cellPath(ctx, c, st, lt) {
    const [cx, cy, w, h] = st.rect;
    const x = cx - w / 2, y = cy - h / 2;
    if (!st.crack) return rrPath(ctx, x, y, w, h, st.radii);
    const sx = c.id === 'A' ? -1 : 1;
    const outer = sx < 0 ? x : x + w;
    ctx.moveTo(outer, y);
    for (const [v, dx] of CRACK) ctx.lineTo(crackX(lt, st.crack, v, dx, sx), y + v * h);
    ctx.lineTo(outer, y + h);
    ctx.closePath();
  }

  const SCN = {};
  for (const s of R.SCENES) SCN[s.id] = s;
  const T6 = SCN.s6.start;
  // Beat-locked source time: s6 beat n ↔ source beat n + offset, wrapped inside the source window.
  function srcTime(c, lt) {
    const s = SCN[c.src[0]], d = s.end - s.start;
    const x = T6 + lt + c.src[1] * BEAT - s.start;
    return s.start + (((x % d) + d) % d);
  }

  // Offscreen ladder: the smallest layer at least as wide as the panel's cover-fit width.
  const LADDER = [[480, 270], [640, 360], [960, 540], [1280, 720]];
  const pickLayer = (needW) => LADDER.find((s) => s[0] >= needW * 0.97) || LADDER[LADDER.length - 1];

  // Per-universe panel canvases, stamped with the source time they hold. A universe is only
  // re-rendered when that time changes, so a newborn copy wearing its parent's universe shares
  // the parent's render, and extra motion-blur samples reuse the content (see contentLt).
  const PANELS = new Map();
  function panelCanvas(id, LW, LH) {
    const k = id + '@' + LW;
    let e = PANELS.get(k);
    if (!e) {
      const canvas = document.createElement('canvas');
      canvas.width = LW;
      canvas.height = LH;
      e = { canvas, ctx: canvas.getContext('2d'), stamp: '' };
      PANELS.set(k, e);
    }
    return e;
  }
  // Local time at which panel CONTENT is sampled for this sub-frame. Above 4 blur samples the
  // content keeps the reel's standard 4 sub-frame times (each reused by S/4 neighbours) while
  // the panel geometry — the fast part — is drawn at every sample.
  function contentLt(lt, api) {
    const S = api.samples || 1;
    if (S <= 4 || !api.subDt || api.frameT === undefined) return lt;
    const i = Math.round((api.t - api.frameT) / api.subDt);
    const g = Math.floor((i * 4) / S);
    return lt + (api.frameT + (g * api.subDt * S) / 4 - api.t);
  }

  // Render cell c's universe, cover-fitted with a slow push-in, into (x, y, w, h).
  function drawUniverse(ctx, c, lt, api, x, y, w, h) {
    if (w < 20 || h < 12) {
      ctx.fillStyle = c.tone;
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      return;
    }
    const zoom = (c.zoom || 1) * (1.02 + 0.03 * clamp(lt - c.sw0, 0, 2)); // constant drift — never static
    const [LW, LH] = pickLayer(Math.max(w, (h * 16) / 9) * zoom);
    const L = panelCanvas(c.id, LW, LH);
    const t = srcTime(c, contentLt(lt, api));
    const stamp = t.toFixed(6) + '|' + (api.samples || 1); // nested scenes may box-filter by subDt
    if (L.stamp !== stamp) {
      const lc = L.ctx;
      R.resetCtx(lc);
      lc.fillStyle = P.ink;
      lc.fillRect(0, 0, LW, LH);
      try {
        // exact ladder size → the nested scene's api.detail only ever takes 4 values
        R.renderScene(c.src[0], t, lc, 0, 0, LW, LH);
      } catch (e) {
        R.errors.push({ scene: 's6-panel', t: api.t, msg: `${c.id}:${c.src[0]}@${t.toFixed(3)} ` + String(e && e.stack) });
        for (let i = 0; i < 64; i++) lc.restore(); // unwind whatever the failed scene left saved
      }
      L.stamp = stamp;
    }
    // cover-fit crop to the panel's aspect, tightened by the push-in, around the focus point
    const a = w / h;
    let sw = LW, sh = LW / a;
    if (sh > LH) { sh = LH; sw = LH * a; }
    sw /= zoom; sh /= zoom;
    const [fx, fy] = c.focus || [CX, CY];
    const sx = clamp((fx / W) * LW - sw / 2, 0, LW - sw), sy = clamp((fy / H) * LH - sh / 2, 0, LH - sh);
    ctx.drawImage(L.canvas, sx, sy, sw, sh, x, y, w, h);
  }

  // A cell's look: its live universe or its graphic tile.
  function drawLook(ctx, c, lt, api, x, y, w, h) {
    if (c.live) drawUniverse(ctx, c, lt, api, x, y, w, h);
    else drawTile(ctx, c, lt, x, y, w, h);
  }
  // A newborn wears its parent's look: a live universe stays live; a tile is a snapshot
  // frozen at the split (so its counter doesn't tick in four places at once).
  function drawParentLook(ctx, c, lt, api, x, y, w, h) {
    const p = c.parent;
    drawLook(ctx, p, p.live ? lt : Math.min(lt, c.t0[c.born]), api, x, y, w, h);
  }

  // Stage-1 bone doors: fraction v of the panel, anchored at the outer edge.
  function drawDoor(ctx, v, dir, x, y, w, h) {
    if (v <= 0) return;
    ctx.fillStyle = P.bone;
    if (dir === 'l') ctx.fillRect(x - 1, y - 1, w * v + 1, h + 2);
    else ctx.fillRect(x + w * (1 - v), y - 1, w * v + 1, h + 2);
  }

  // Source chip: "S2  02:07" — scene id + the source's live timecode (seconds:frames). On its
  // first appearance the pill wipes open and the string decodes from a scramble in 4 frames.
  const SCRAMBLE = '0123456789#/:+';
  function drawChip(ctx, c, lt, a, x, y, api) {
    if (a <= 0.01) return;
    const cs = lt - c.chip0;
    const t = srcTime(c, lt);
    const ss = String(Math.floor(t)).padStart(2, '0'), ff = String(Math.floor((t % 1) * 60)).padStart(2, '0');
    const txt = `${c.src[0].toUpperCase()}  ${ss}:${ff}`;
    R.font(ctx, { family: 'JetBrains Mono', weight: 500, size: 13, spacing: 1.5, align: 'left', baseline: 'middle' });
    const adv = ctx.measureText(txt).width / txt.length;
    const pw = (adv * txt.length + 16) * E.expoOut(seg(cs, 0, CHIP_IN));
    if (pw < 2) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = R.col.rgba(P.ink, 0.72);
    ctx.beginPath();
    rrPath(ctx, x, y, pw, 22, [4, 4, 4, 4]);
    ctx.fill();
    const k = Math.floor(txt.length * clamp(cs / CHIP_DEC));
    let s = txt.slice(0, k);
    if (k < txt.length) {
      const fr = Math.round((api.frameT !== undefined ? api.frameT : api.t) * 60);
      for (let i = k; i < txt.length && 8 + (i + 1) * adv <= pw; i++) {
        s += txt[i] === ' ' ? ' ' : SCRAMBLE[Math.floor(R.hash(fr * 13.1 + i * 7.7 + c.id.charCodeAt(0)) * SCRAMBLE.length)];
      }
    }
    ctx.fillStyle = P.bone;
    ctx.fillText(s, x + 8, y + 11.5);
    ctx.globalAlpha = 1;
  }

  // ── graphic tiles ──
  // Mono numeral with per-digit slot-machine rolls. rolls: [[t, from, to, ease?, dur?, stagger?],
  // ...] in time order. Digits roll through a slot window from just above cap height down to the
  // baseline: the old digit exits through the top edge as the new one rises out of the baseline.
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
        const t0 = active[0] + (active[5] ?? 0.03) * i;
        const u = (active[3] || POS)(seg(lt, t0, t0 + (active[4] || 0.14)));
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

  // the centre counter: 04 → 09 as it punches out; 09 → 16 slams in on the b27 beat frame, both
  // digits together (a stagger would flash a wrong '19' for two frames)
  const COUNT_ROLLS = [[B2 + 0.04, '04', '09'], [B3 - 0.005, '09', '16', E.expoOut, 0.11, 0]];

  function drawTile(ctx, c, lt, x, y, w, h) {
    const pad = Math.max(10, h * 0.065);
    const size = h * 0.62;
    if (c.tile === 'count') {
      ctx.fillStyle = P.signal;
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      tileLabel(ctx, 'UNIVERSES', x + pad, y + pad, P.ink);
      rollNumber(ctx, lt, COUNT_ROLLS, x + pad - size * 0.04, y + h - pad * 0.9, size, P.ink);
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
      rollNumber(ctx, lt, [[c.sw0, '   ', '128', POS, 0.12, 0.02]], x + pad - size * 0.04, y + h - pad * 0.9, size, P.bone);
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
    cellPath(ctx, c, st, lt);
    if (st.tone >= 0.999) {
      ctx.fillStyle = c.inner ? P.bone : c.tone;
      ctx.fill();
      return;
    }
    ctx.save();
    ctx.clip();
    if (c.born === 1) {
      // the two first cards: live underneath, bone doors blown apart. While the cards are still
      // folding in from the flood, the universes only show inside the HUD safe frame — the
      // flood's bone stays around them as a matte, so no HUD corner ever sits on content.
      if (st.swap > 0) {
        const matte = x < SAFE[0] || y < SAFE[1] || x + w > SAFE[2] || y + h > SAFE[3];
        if (matte) {
          ctx.fillStyle = P.bone;
          ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
          ctx.save();
          ctx.beginPath();
          ctx.rect(SAFE[0], SAFE[1], SAFE[2] - SAFE[0], SAFE[3] - SAFE[1]);
          ctx.clip();
        }
        drawLook(ctx, c, lt, api, x, y, w, h);
        if (matte) ctx.restore();
      }
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
      // the seam: a hairline of bone riding the join, brightest mid-push. Box-filtered across
      // this sub-frame's slice of the shutter, so the fast seam streaks instead of strobing.
      const hd = (api.subDt || 0) / 2;
      const va = POS(seg(lt - hd, c.sw0, c.sw0 + c.swD)), vb = POS(seg(lt + hd, c.sw0, c.sw0 + c.swD));
      const p0 = (s > 0 ? Math.min(va, vb) : 1 - Math.max(va, vb)) * L - 1;
      const bw = Math.abs(vb - va) * L + 2;
      ctx.globalAlpha = Math.sin(Math.PI * v) * Math.min(1, 2 / bw + 0.15);
      ctx.fillStyle = P.bone;
      if (hz) ctx.fillRect(x + p0, y - 1, bw, h + 2);
      else ctx.fillRect(x - 1, y + p0, w + 2, bw);
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
      cellPath(ctx, c, st, lt);
      ctx.stroke();
    }
    if (c.live && st.chipA > 0) drawChip(ctx, c, lt, st.chipA, x + 10, y + 10, api);
    // the bloom paints last: the dot swallows everything in the inner four, UI included
    if (c.inner) drawBloom(ctx, lt, api);
    ctx.restore();
  }

  // The bloom disc, box-filtered across this sub-frame's slice of the shutter (a soft rim from
  // r(t − ½subDt) to r(t + ½subDt)), so its fast growth fuses instead of stepping into rings.
  function drawBloom(ctx, lt, api) {
    const hd = (api.subDt || 0) / 2;
    const ra = bloomR(lt - hd), rb = bloomR(lt + hd);
    if (rb <= 0) return;
    ctx.beginPath();
    if (rb - ra < 1) {
      ctx.fillStyle = P.bone;
      ctx.arc(CX, CY, bloomR(lt), 0, TAU);
    } else {
      const g = ctx.createRadialGradient(CX, CY, ra, CX, CY, rb);
      g.addColorStop(0, P.bone);
      g.addColorStop(1, R.col.rgba(P.bone, 0));
      ctx.fillStyle = g;
      ctx.arc(CX, CY, rb, 0, TAU);
    }
    ctx.fill();
  }

  // The crack's hot core: a signal filament down the middle of the tear on the impact frames.
  function drawCrackCore(ctx, lt, rectA) {
    const a = 1 - E.quadOut(seg(lt, 0, 0.06));
    if (a <= 0.01 || !rectA) return;
    const y = rectA[1] - rectA[3] / 2, h = rectA[3];
    ctx.strokeStyle = R.col.rgba(P.signal, a);
    ctx.lineWidth = 2 + 3 * a;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    CRACK.forEach(([v, dx], i) => {
      const px = CX + dx * jagAmp(lt), py = y + v * h;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.stroke();
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

  // Motion-blur samples (only when the render uses blur): 16 wherever hard edges move more
  // than ~15 px per sub-frame at the standard 4 — the doors blown open, the implosion, the fast
  // middle of every push — and 8 around each split whip (~6 px steps at 4). Panel content
  // stays at 4 renders per frame (contentLt), so the extra samples only cost compositing.
  function samplesAt(lt) {
    if (lt < 0.15) return 16;
    if (lt >= OUT0 && lt < T_CLEAN) return 16;
    for (const c of CELLS) if (c.born > 1 && lt > c.sw0 + 0.15 * c.swD && lt < c.sw0 + 0.8 * c.swD) return 16;
    for (let k = 2; k <= 4; k++) if (lt > TR[k].b - 0.08 && lt < TR[k].b + 0.08) return 8;
    return 0;
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
          const zoom = (o.zoom || 1) * (1.02 + 0.03 * clamp(lt - o.sw0, 0, 2));
          const rung = pickLayer(Math.max(w, (h * 16) / 9) * zoom);
          pairs.set(o.src[0] + '@' + rung[0], [o, rung]);
        }
      }
    }
    for (const [o, [LW, LH]] of pairs.values()) {
      const L = R.layer('s6:warm', LW, LH);
      try {
        R.renderScene(o.src[0], srcTime(o, o.sw0), L.ctx, 0, 0, LW, LH);
      } catch (e) {
        for (let i = 0; i < 64; i++) L.ctx.restore();
      }
    }
  }

  R.scene({
    id: 's6',
    shake: 0.8,
    samplesAt,
    init() {
      try { warmUp(); } catch (e) { /* never let a neighbour's scene block boot */ }
    },
    debug: () => ({ CELLS, OUTER, slot, cellState, samplesAt }),
    render(ctx, lt, api) {
      pinShake(ctx, api, smoothstep(T_CLEAN - 0.035, T_CLEAN, lt));
      // the frame opens as a flat bone field (keep it flat, as s5 leaves it); the default
      // vignette returns as the ink takes over
      if (api.detail === 1 && api.post) api.post.vignette = lerp(0.05, 0.22, smoothstep(0.08, 0.3, lt));

      // ── contract out: ink + the dot, nothing else ──
      if (lt >= T_CLEAN) {
        ctx.fillStyle = P.bone;
        ctx.beginPath();
        ctx.arc(CX, CY, DOT_R, 0, TAU);
        ctx.fill();
        return;
      }

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

      if (lt < 0.07) drawCrackCore(ctx, lt, states.find(([c]) => c.id === 'A')?.[1].rect);
      drawCrosses(ctx, lt);
    },
  });
})();
