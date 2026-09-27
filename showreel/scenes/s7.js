// ─────────────────────────────────────────────────────────────────────────────
// s7 · LOCKUP                              global 13.125 – 15.000 (lt = t − 13.125)
//
// The signature end card: calm confidence after the storm. The protagonist dot
// takes its final bow and becomes the full stop of the logotype.
//
//   0.000  CONTRACT   P.ink + bone dot r=28 at (960,540) — the instant of the cut only.
//          FINAL HIT  the pop starts ON the beat, so the first rendered frame (f788, lt
//                     .0083–.0146 across its blur sub-frames) is already the impact: the
//                     dot punches (1.85× pop, bloom) and fires ONE shockwave ring with a
//                     brief pressure flash and an 8-stroke trim-path burst, and the
//                     engine's hit shake + CA read on that same frame. As the ring sweeps
//                     outward it "ignites" each contour of CLAUDE — every outline
//                     trim-path grows both ways from the point the wave touches first,
//                     so the word draws itself from the centre out.
//   0.125  LAUNCH     anticipation crouch → the dot leaps up and over the word (x on
//                     R.ease.snap, y a true ballistic arc) trailing a thin comet line…
//   0.469  LAND       …and drops in as the period: keyed squash on the beat frame,
//                     turns signal, the trail retracts into it, and the impact ripples
//                     right→left through the word as a slanted fill wipe with a damped
//                     follow-through dip per letter. Word complete ≈ .56.
//   0.938  BEAT       the lockup re-centres upward in ONE glide to its final layout;
//                     "Motion Designer" swings up word by word from behind a mask (on
//                     the beat frame the first word breaks the mask edge).
//   1.172  META       (beat + ⅛) as the role lands: a hairline draws out from centre to
//                     the logotype's width and the mono line decodes L→R behind a block
//                     cursor. Every glyph but the last is locked by 1.387.
//   1.406  STING      the last glyph locks and the cursor vanishes ON the beat, the
//                     period winks and sends a glint right→left along the hairline.
//                     The card is complete from f872: 28 frames (467 ms) of rest.
//   → 1.875 HOLD      slow push-in (1.00 → ~1.03) and a barely-there period breath.
//                     No fade: the last frame is the clean end card.
//
// Craft notes
// · The logotype is set at 204px because Unbounded 900's period is then a circle of
//   r = 28 — the dot never changes size: it literally *is* the full stop.
// · Tracking is hand-tuned per pair (optical, not metric) and the whole word,
//   period included, is centred on its visual bounds.
// · Fast movers (ring, burst, dot, wipe edge, glint) box-filter themselves over one
//   motion-blur sub-frame (api.subDt) so the engine's blur integrates instead of
//   strobing; the shockwave draws its exact swept coverage as a radial profile, so it
//   smears into one band rather than stacking into concentric steps.
// · Only the contract instant (lt ≤ 0, never a rendered frame) pins the engine shake;
//   the final hit's shake and CA read in full. The sting's shake is softened.
// · Every value is a pure function of lt; glyph data is built once in init().
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  const { clamp, lerp, smoothstep, TAU } = R.math;
  const E = R.ease;
  const P = R.P;
  const seg = R.seg;
  const BEAT = R.BEAT;

  // ───────────────────────── timing (local seconds) ─────────────────────────
  const B1 = BEAT, B2 = BEAT * 2, B3 = BEAT * 3;   // .46875 · .9375 · 1.40625
  // The hit starts ON the beat. Frame 788 (t = 13.1333, lt .0083–.0146 over its blur
  // sub-frames) is the first s7 frame, so it already carries the pop, ring and burst.
  const T_POP = 0;
  const T_LAUNCH = 0.125;                          // dot leaves the ground
  const T_LAND = B1;                               // contact exactly on beat 1
  const T_META = B2 + BEAT / 2;                    // 1.171875: hairline + mono decode start
  const META_D = B3 - T_META;                      // hairline reaches full width on the sting
  const RING_D = 0.95;                             // shockwave expansion time
  const DRAW_D = 0.3;                              // per-contour trim-path duration
  const FILL_STAGGER = 0.013, FILL_D = 0.085;      // impact ripple through the letters
  // The final render averages point-sampled sub-frames over a 180° shutter. Anything
  // that moves more than a few px per sub-frame strobes, so fast movers box-filter
  // themselves over one sub-frame interval (ring, rays, dot, fill-wipe edge, glint). SUB
  // is set from api.subDt on every render (the 4-sample interval when blur is off).
  const SUB_DEF = 0.5 / 60 / 4;
  let SUB = SUB_DEF;

  // ───────────────────────── layout (px) ─────────────────────────
  const CX = 960, CY = 540;
  const DOT_R = 28;
  const LOGO_SIZE = 204;                           // period radius == DOT_R at this size
  const CAP = 153;                                 // Unbounded 900 cap height at 204px
  const SERIF_DY = 112;                            // logo baseline → serif baseline
  const RULE_DY = 44;                              // serif baseline → hairline
  const MONO_DY = 38;                              // hairline → mono baseline
  const OPTICAL_Y = 534;                           // optical centre sits a touch above 540
  // Vertical states of the lockup (cap-top y): logo alone → full lockup (role + meta).
  const H_A = CAP, H_C = CAP + SERIF_DY + RULE_DY + MONO_DY;
  const TOP_A = OPTICAL_Y - H_A / 2, TOP_C = OPTICAL_Y - H_C / 2;

  // Optical pair tracking (px, added to the font's own kerning). Straight–straight
  // pairs keep the most air, the open L–A pair is left alone (it would collide).
  const PAIR = { CL: -6.5, LA: 0, AU: -2.5, UD: -10.5, DE: -4.5, 'E.': -5 };

  // Fill-wipe edge: leans like an italic stroke (±WIPE_K px over the cap band);
  // WIPE_N is its unit normal, pointing into the filled side.
  const WIPE_K = 34;
  const WIPE_N = (() => { const h = CAP + 28, l = Math.hypot(h, 2 * WIPE_K); return [h / l, (2 * WIPE_K) / l]; })();

  const ROLE = ['Motion', 'Designer'];
  const MONO = 'REEL 2026 — AVAILABLE FOR WORK';
  const MONO_HI = MONO.indexOf('AVAILABLE');       // chars from here on settle in bone2
  const SCRAMBLE = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+/<=>';

  // ───────────────────────── build (once, after fonts load) ─────────────────────────
  let G = null;
  function build() {
    if (G) return G;
    const o = R.glyph.outline('unbounded900', 'CLAUDE.', LOGO_SIZE, { tol: 1.5 });
    // per-letter horizontal offsets from the pair table
    const offs = [];
    let acc = 0;
    o.letters.forEach((l, i) => {
      if (i > 0) acc += PAIR[o.letters[i - 1].ch + l.ch] || 0;
      offs.push(acc);
    });
    const bbox = (l) => {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const c of l.contours) for (const [x, y] of c) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      return [x0, y0, x1, y1];
    };
    const letters = o.letters.map((l, i) => ({ ch: l.ch, path: l.path, contours: l.contours, off: offs[i], bb: bbox(l) }));
    const period = letters.pop();
    const pb = period.bb;
    // visual bounds: C's left edge → period's right edge, centred on CX
    const left = letters[0].bb[0] + letters[0].off, right = pb[2] + period.off;
    const ox = CX - (left + right) / 2;
    const pdx = (pb[0] + pb[2]) / 2 + period.off;     // period centre, logo space
    const pdy = (pb[1] + pb[3]) / 2;
    const pbot = pb[3];                               // period overshoot below baseline

    // Contours with arc-length tables. The trim draw of each contour starts at the
    // point nearest the shockwave origin (the dot at centre, lockup in state A).
    const baseA = TOP_A + CAP;
    letters.forEach((L) => {
      L.cs = L.contours.map((pts) => {
        const n = pts.length, cum = [0];
        for (let i = 0; i < n; i++) {
          const a = pts[i], b = pts[(i + 1) % n];
          cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
        }
        let best = 0, bd = 1e9;
        pts.forEach(([x, y], i) => {
          const d = Math.hypot(ox + L.off + x - CX, baseA + y - CY);
          if (d < bd) { bd = d; best = i; }
        });
        return { pts, cum, n, total: cum[n], s0: cum[best], t0: ringHit(bd) };
      });
    });

    // measure the text lines once
    const m = document.createElement('canvas').getContext('2d');
    R.font(m, { family: 'Instrument Serif', style: 'italic', weight: 400, size: 90, align: 'left' });
    const wWords = ROLE.map((w) => m.measureText(w).width);
    const wSpace = m.measureText(' ').width;
    const roleW = wWords.reduce((a, b) => a + b, 0) + wSpace * (ROLE.length - 1);
    const roleX = [];
    let x = CX - roleW / 2;                          // centred on the advance width
    ROLE.forEach((w, i) => { roleX.push(x); x += wWords[i] + wSpace; });
    R.font(m, { family: 'JetBrains Mono', weight: 500, size: 18, spacing: 0, align: 'left' });
    const monoAdv = m.measureText('M').width + 4;   // 4px letter-spacing, monospaced
    const monoW = MONO.length * monoAdv - 4;

    // Per-character decode timing (deterministic; audio/synth.py s7_decode mirrors it).
    // Every glyph but the last is locked by lt 1.387 (f871); the last one locks ON the
    // sting beat, so the line — and the whole card — completes on the downbeat.
    const rnd = R.rng(707);
    const monoT = [...MONO].map((ch, i) => {
      const appear = T_META + 0.012 + i * 0.0045 + rnd() * 0.006;
      return { ch, appear, settle: appear + 0.04 + rnd() * 0.045, seed: rnd() * 1000 };
    });
    monoT[monoT.length - 1].settle = B3;

    const monoEnd = Math.max(...monoT.map((c) => c.settle));

    G = { letters, ox, pdx, pdy, pbot, left, right, roleX, wWords, monoAdv, monoW, monoT, monoEnd };
    return G;
  }

  // ───────────────────────── shockwave ─────────────────────────
  const RING_R0 = DOT_R, RING_MAX = 1180;
  const ringR = (lt) => RING_R0 + (RING_MAX - RING_R0) * E.expoOut(seg(lt, T_POP, T_POP + RING_D));
  // Inverse of ringR: when does the wave reach distance d?
  function ringHit(d) {
    const v = clamp((d - RING_R0) / (RING_MAX - RING_R0), 0, 0.999);
    return T_POP + (-Math.log2(1 - v) / 10) * RING_D;
  }

  // ───────────────────────── lockup vertical choreography ─────────────────────────
  // Cap-top y of the logotype. One glide on beat 2 re-centres it for the full lockup
  // (role + meta arrive a ⅛ note apart, so two stacked moves would stutter). Settled
  // to < 0.3 px by the sting.
  const glide = E.bezier(0.25, 0.1, 0, 1);
  const lockTop = (lt) => R.keys(lt, [[0, TOP_A], [B2 - 0.02, TOP_A], [B2 + 0.52, TOP_C, glide]]);

  // ───────────────────────── the dot ─────────────────────────
  // Flight: y is a true ballistic arc (apex above the caps) so the dot comes down with
  // real speed and lands ON the beat. x rides the house snap curve, blended 50/50 with a
  // sine so the path is a clean round arc (pure snap put all the x travel at the apex
  // and made the arc boxy — checked on a spacing chart) while keeping snap's whip.
  const APEX_Y = 372;
  const flightX = (lt) =>
    0.5 * E.snap(seg(lt, T_LAUNCH - 0.05, T_LAND - 0.01)) + 0.5 * E.sineInOut(seg(lt, T_LAUNCH - 0.02, T_LAND - 0.01));
  function flight(lt, G) {
    const x1 = G.ox + G.pdx, y1 = TOP_A + CAP + G.pdy;
    const x = lerp(CX, x1, flightX(lt));
    const D = T_LAND - T_LAUNCH, h0 = CY - APEX_Y, h1 = y1 - APEX_Y;
    const ta = (D * Math.sqrt(h0)) / (Math.sqrt(h0) + Math.sqrt(h1));
    const g = (2 * h0) / (ta * ta);
    const tau = clamp(lt - T_LAUNCH, 0, D);
    const y = lt < T_LAUNCH ? CY : APEX_Y + 0.5 * g * (tau - ta) * (tau - ta);
    return [x, y];
  }

  // Dot scale before launch: pop on the hit, then an anticipation squash.
  const popScale = (lt) => R.keys(lt, [[T_POP, 1], [T_POP + 0.04, 1.85, 'expoOut'], [T_LAUNCH - 0.012, 0.9, 'cubicInOut'], [T_LAUNCH + 0.03, 1, 'quadOut']]);
  const antiSquash = (lt) => R.keys(lt, [[0.06, 1], [T_LAUNCH - 0.008, 0.78, 'quadInOut'], [T_LAUNCH + 0.02, 1, 'quadOut']]);

  // Draw a squashed/stretched disc: axis angle a, along-axis scale s, perpendicular p.
  function blob(ctx, x, y, r, a, s, p, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(s, p);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.restore();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawDot(ctx, lt, G, top) {
    if (lt < T_LAND) {
      const [x, y] = flight(lt, G);
      if (lt < T_LAUNCH) {
        const k = popScale(lt), sq = antiSquash(lt);
        blob(ctx, x, y, DOT_R * k, 0, 1 / Math.pow(sq, 0.8), sq, P.bone);
        return;
      }
      // velocity-aligned stretch (finite difference of the pure position function)
      const h = 0.004;
      const [xa, ya] = flight(lt - h, G), [xb, yb] = flight(lt + h, G);
      const vx = (xb - xa) / (2 * h), vy = (yb - ya) / (2 * h);
      const sp = Math.hypot(vx, vy);
      const s = 1 + 0.32 * smoothstep(500, 3600, sp);
      const rr = DOT_R * popScale(lt);
      // swept over one sub-frame: centre at mid-travel, long axis extended by half the travel
      const [xn, yn] = flight(Math.min(lt + SUB, T_LAND), G);
      const d = Math.hypot(xn - x, yn - y);
      blob(ctx, (x + xn) / 2, (y + yn) / 2, rr, Math.atan2(vy, vx), s + d / (2 * rr), Math.pow(s, -0.8), P.bone);
      return;
    }
    // Landed: the period. Bottom anchored on the baseline overshoot; keyed squash on
    // contact, a damped rebound, then a slow breath.
    const tau = lt - T_LAND;
    const sq = 1 - 0.4 * Math.exp(-tau * 13) * Math.cos(tau * TAU * 3.4);
    const breath = smoothstep(0.75, 1.1, lt) * (0.5 - 0.5 * Math.cos(((lt - 0.75) * TAU) / (BEAT * 2)));
    // a small wink on the sting: 2-frame attack, soft exponential release
    const ts = lt - B3;
    const wink = ts > -0.03 ? smoothstep(-0.03, 0.005, ts) * Math.exp(-Math.max(0, ts) * 9) : 0;
    const r = DOT_R * (1 + 0.035 * breath + 0.16 * wink);
    const sx = Math.pow(sq, -0.8), sy = sq;
    const base = top + CAP;
    const x = G.ox + G.pdx, y = base + G.pbot - r * sy;
    blob(ctx, x, y, r, 0, sx, sy, P.signal);
  }

  // ───────────────────────── logotype ─────────────────────────
  // Stroke the arc-length range [a, b] (b − a < total) of a closed contour.
  function traceRange(ctx, C, a, b) {
    const { pts, cum, n, total } = C;
    const off = Math.floor(a / total) * total;
    a -= off; b -= off;
    let started = false;
    const walk = (lo, hi) => {
      for (let i = 0; i < n; i++) {
        const l0 = cum[i], l1 = cum[i + 1];
        if (l1 < lo) continue;
        if (l0 > hi) break;
        const p = pts[i], q = pts[(i + 1) % n], len = l1 - l0 || 1;
        const u0 = clamp((lo - l0) / len), u1 = clamp((hi - l0) / len);
        if (!started) { ctx.moveTo(lerp(p[0], q[0], u0), lerp(p[1], q[1], u0)); started = true; }
        ctx.lineTo(lerp(p[0], q[0], u1), lerp(p[1], q[1], u1));
      }
    };
    if (b <= total) walk(a, b);
    else { walk(a, total); walk(0, b - total); }
  }

  function drawLogo(ctx, lt, G, top) {
    const base = top + CAP;
    const n = G.letters.length;
    G.letters.forEach((L, i) => {
      // impact ripple: right → left from the period
      const tf = T_LAND + (n - 1 - i) * FILL_STAGGER;
      const f = E.expoOut(seg(lt, tf, tf + FILL_D));
      const tau = lt - tf;
      const dip = tau > 0 ? 12 * Math.exp(-tau * 9) * Math.sin(tau * TAU * 2.8) : 0;   // ≈6px peak

      ctx.save();
      ctx.translate(G.ox + L.off, base + dip);

      // 1 · outline trim-paths, fading out as the fill lands
      const lw = 2.4 * (1 - E.quadIn(f));
      if (lw > 0.05) {
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = P.bone;
        ctx.beginPath();
        for (const C of L.cs) {
          const p = E.quartOut(seg(lt, C.t0, C.t0 + DRAW_D));
          if (p <= 0) continue;
          if (p >= 1) {
            C.pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.closePath();
          } else {
            const half = (p * C.total) / 2;
            traceRange(ctx, C, C.s0 - half + C.total, C.s0 + half + C.total);
          }
        }
        ctx.stroke();
      }

      // 2 · fill: a slanted wipe from the right edge to the left edge. The edge is a
      //     linear-gradient ramp as wide as its travel over one sub-frame (min 1px AA),
      //     so the engine's motion blur integrates it into one smooth smear.
      if (f > 0) {
        if (f >= 1) {
          ctx.fillStyle = P.bone;
          ctx.fill(L.path);
        } else {
          const [x0, , x1] = L.bb;
          const xeAt = (ff) => lerp(x1 + WIPE_K + 2, x0 - WIPE_K - 2, ff);
          const xa = xeAt(f), xb = xeAt(E.expoOut(seg(lt + SUB, tf, tf + FILL_D)));
          const band = Math.max(1, (xa - xb) * WIPE_N[0]);
          const ym = (-CAP - 12 + 16) / 2;
          const g = ctx.createLinearGradient(xa - WIPE_N[0] * band, ym - WIPE_N[1] * band, xa, ym);
          g.addColorStop(0, R.col.rgba(P.bone, 0));
          g.addColorStop(1, P.bone);
          ctx.fillStyle = g;
          ctx.fill(L.path);
        }
      }
      ctx.restore();
    });
  }

  // ───────────────────────── role line: "Motion Designer" ─────────────────────────
  function drawRole(ctx, lt, G, top) {
    if (lt < B2) return;
    const y = top + CAP + SERIF_DY;
    R.font(ctx, { family: 'Instrument Serif', style: 'italic', weight: 400, size: 90, align: 'left' });
    ctx.fillStyle = P.bone2;
    ROLE.forEach((w, i) => {
      const t0 = B2 - 0.03 + i * 0.075;
      const u = E.swift(seg(lt, t0, t0 + 0.6));
      if (u <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(G.roleX[i] - 30, y - 92, G.wWords[i] + 60, 92 + 26);   // the mask
      ctx.clip();
      ctx.translate(G.roleX[i], y + (1 - u) * 118);
      ctx.rotate((1 - u) * 0.06);
      ctx.fillText(w, 0, 0);
      ctx.restore();
    });
  }

  // ───────────────────────── sting: hairline + decoded mono line ─────────────────────────
  // The sting's accent on the finished card: as the period winks it sends a short light
  // pulse right → left along the hairline (the same direction the landing rippled through
  // the word). Fast off the mark, fading as it decelerates; gone by ≈ lt 1.60.
  const GLINT_D = 0.3, GLINT_TAIL = 300;
  function drawGlint(ctx, lt, G, yRule) {
    const u = seg(lt, B3, B3 + GLINT_D);
    if (u <= 0 || u >= 1) return;
    const a = smoothstep(B3, B3 + 0.02, lt) * Math.pow(1 - u, 2.2);
    if (a < 0.004) return;
    const L = G.right - G.left, xl = CX - L / 2, xr = CX + L / 2;   // the rule's ends
    const head = (tt) => xr - L * E.quartOut(seg(tt, B3, B3 + GLINT_D));
    const xh = head(lt), xn = head(lt + SUB);          // swept over one sub-frame
    const lead = 18 + (xh - xn);
    const x0 = Math.max(xl, xn - 18), x1 = Math.min(xr, xh + GLINT_TAIL);
    if (x1 <= x0) return;
    const g = ctx.createLinearGradient(xh - lead, 0, xh + GLINT_TAIL, 0);
    g.addColorStop(0, R.col.rgba(P.bone, 0));
    g.addColorStop(lead / (lead + GLINT_TAIL), R.col.rgba(P.bone, 0.7 * a));
    g.addColorStop(1, R.col.rgba(P.bone, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x0, yRule - 0.5, x1 - x0, 1);
    // a faint halo so the pulse reads as light, not just a brighter line
    const h = ctx.createLinearGradient(xh - lead, 0, xh + GLINT_TAIL * 0.5, 0);
    h.addColorStop(0, R.col.rgba(P.bone, 0));
    h.addColorStop(lead / (lead + GLINT_TAIL * 0.5), R.col.rgba(P.bone, 0.1 * a));
    h.addColorStop(1, R.col.rgba(P.bone, 0));
    ctx.fillStyle = h;
    ctx.fillRect(x0, yRule - 2, Math.min(x1, xh + GLINT_TAIL * 0.5) - x0, 4);
  }

  function drawMeta(ctx, lt, G, top) {
    if (lt < T_META) return;
    const yRule = top + CAP + SERIF_DY + RULE_DY;
    // hairline: centre-out, lands at full width exactly on the sting
    const half = ((G.right - G.left) / 2) * E.quartOut(seg(lt, T_META, T_META + META_D));
    ctx.fillStyle = R.col.rgba(P.bone, 0.3);
    ctx.fillRect(CX - half, yRule - 0.5, half * 2, 1);
    drawGlint(ctx, lt, G, yRule);

    const yMono = yRule + MONO_DY;
    const x0 = CX - G.monoW / 2;
    R.font(ctx, { family: 'JetBrains Mono', weight: 500, size: 18, spacing: 0, align: 'left' });
    const frame = Math.floor(lt * 30);                 // scramble glyphs tick every 2 frames
    // block cursor riding the decode front; gone once the last glyph locks
    if (lt < G.monoEnd) {
      let front = G.monoT.findIndex((c) => c.appear > lt);
      if (front < 0) front = MONO.length;
      ctx.fillStyle = P.bone2;
      ctx.fillRect(x0 + front * G.monoAdv, yMono - 15, G.monoAdv - 4, 18);
    }
    G.monoT.forEach((c, i) => {
      if (c.ch === ' ' || lt < c.appear) return;
      const x = x0 + i * G.monoAdv;
      if (lt >= c.settle) {
        ctx.fillStyle = i >= MONO_HI ? P.bone2 : P.gray;
        ctx.fillText(c.ch, x, yMono);
      } else {
        const g = SCRAMBLE[Math.floor(R.hash(c.seed + frame * 7.31) * SCRAMBLE.length)];
        ctx.fillStyle = R.col.rgba(P.gray, 0.75);
        ctx.fillText(g, x, yMono);
      }
    });
  }

  // ───────────────────────── atmosphere ─────────────────────────
  // The final hit: one shockwave ring (with a faint pressure fill for the first
  // frames) plus a crisp burst of radial strokes that shoot out and are eaten
  // from the inside — trim-path style — all gone within ~⅓ s.
  const RAYS = 8;
  // The ring moves up to ~130 px per frame, so each blur sub-sample draws its EXACT swept
  // coverage over the sub-frame [r0, r1] as a radial-gradient profile: the pressure disc
  // gets a linear edge ramp over r0 → r1, the ring band (width lw) becomes the trapezoid
  // box(lw) ⊛ box(dr). Consecutive sub-samples then tile seamlessly into one smooth smear
  // instead of stacking into concentric steps.
  function sweptDisc(ctx, r0, r1, a) {
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, r1);
    g.addColorStop(0, R.col.rgba(P.bone, a));
    g.addColorStop(clamp(r0 / r1, 0, 1), R.col.rgba(P.bone, a));
    g.addColorStop(1, R.col.rgba(P.bone, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(CX, CY, r1, 0, TAU);
    ctx.fill();
  }
  function sweptRing(ctx, r0, r1, lw, a) {
    const dr = Math.max(r1 - r0, 0.01);
    const ri = Math.max(0, r0 - lw / 2), ro = r1 + lw / 2, span = ro - ri;
    const m = Math.min(lw, dr), peak = a * (m / dr);
    const k = clamp(m / span, 0, 0.5);
    const g = ctx.createRadialGradient(CX, CY, ri, CX, CY, ro);
    g.addColorStop(0, R.col.rgba(P.bone, 0));
    g.addColorStop(k, R.col.rgba(P.bone, peak));
    g.addColorStop(1 - k, R.col.rgba(P.bone, peak));
    g.addColorStop(1, R.col.rgba(P.bone, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(CX, CY, ro, 0, TAU);
    ctx.arc(CX, CY, ri, 0, TAU, true);
    ctx.fill();
  }
  function drawHit(ctx, lt) {
    if (lt < T_POP) return;
    const r0 = ringR(lt), r1 = ringR(lt + SUB);
    const u = seg(lt, T_POP, T_POP + 0.5);
    if (u < 1) {
      const fill = 0.1 * (1 - E.cubicOut(seg(lt, T_POP, T_POP + 0.14)));
      if (fill > 0.002) sweptDisc(ctx, r0, Math.max(r1, r0 + 1), fill);
      const lw = lerp(16, 0.8, E.expoOut(seg(lt, T_POP, T_POP + 0.35)));
      sweptRing(ctx, r0, r1, lw, 0.95 * Math.pow(1 - u, 1.6));
    }
    // burst: 8 strokes on the diagonals (none lie along the word's horizontal band).
    // Head on expoOut, tail catches up on a cubic in-out → the stroke is gone in ~7 frames.
    const b0 = seg(lt + SUB, T_POP, T_POP + 0.085), b1 = seg(lt, T_POP + 0.012, T_POP + 0.1);
    if (b1 >= 1) return;
    ctx.strokeStyle = P.bone;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < RAYS; i++) {
      const a = ((i + 0.5) / RAYS) * TAU;
      const len = i % 2 ? 120 : 190;
      const ro = 62 + len * E.expoOut(b0), ri = 62 + len * E.cubicInOut(b1);
      if (ro - ri < 1) continue;
      ctx.moveTo(CX + Math.cos(a) * ri, CY + Math.sin(a) * ri);
      ctx.lineTo(CX + Math.cos(a) * ro, CY + Math.sin(a) * ro);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // A thin comet trail that traces the dot's arc and retracts into the period.
  function drawTrail(ctx, lt, G) {
    if (lt < T_LAUNCH || lt > T_LAND + 0.12) return;
    const t1 = Math.min(lt, T_LAND), t0 = Math.max(T_LAUNCH, lt - 0.11);
    if (t1 - t0 < 0.004) return;
    const N = 18;
    let prev = flight(t0, G);
    ctx.lineCap = 'round';
    for (let k = 1; k <= N; k++) {
      const q = k / N;
      const p = flight(lerp(t0, t1, q), G);
      ctx.strokeStyle = R.col.rgba(P.bone, 0.85 * q * q);
      ctx.lineWidth = 0.6 + 2.2 * q;
      ctx.beginPath();
      ctx.moveTo(prev[0], prev[1]);
      ctx.lineTo(p[0], p[1]);
      ctx.stroke();
      prev = p;
    }
    ctx.lineCap = 'butt';
  }

  function drawSpot(ctx, lt, top) {
    const a = E.cubicOut(seg(lt, T_POP, 0.6));
    if (a <= 0) return;
    const cy = top + H_C / 2;
    const g = ctx.createRadialGradient(CX, cy, 0, CX, cy, 1000);
    g.addColorStop(0, R.col.rgba(P.ink2, a));
    g.addColorStop(1, R.col.rgba(P.ink2, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-60, -60, 2040, 1200);
  }

  // Undo the engine hit-shake (R.unshake) so the contract frames are pixel-exact.
  function pinShake(ctx, api, w) {
    if (w <= 0 || api.detail !== 1) return;
    R.unshake(ctx, api, w);
  }

  // ═════════════════════════════ scene ═════════════════════════════
  R.scene({
    id: 's7',
    shake: 1,
    init: async () => { build(); },
    render(ctx, lt, api) {
      const G = build();
      SUB = api.subDt > 0 ? api.subDt : SUB_DEF;

      if (lt <= T_POP) {
        // The contract instant itself (only reachable by scrubbing to exactly 13.125; no
        // output frame or blur sub-frame lands here): the bare dot, shake pinned.
        pinShake(ctx, api, 1);
        ctx.fillStyle = P.bone;
        ctx.beginPath();
        ctx.arc(CX, CY, DOT_R, 0, TAU);
        ctx.fill();
        return;
      }
      // The final hit's shake and CA read in full from f788 on. On the sting the shake is
      // softened: the finished end card stays composed.
      pinShake(ctx, api, lt > B3 - 0.05 ? 0.6 : 0);

      // slow push-in, anchored at frame centre
      const push = 1 + 0.032 * E.quadOut(seg(lt, T_POP, 2.3));
      ctx.translate(CX, CY);
      ctx.scale(push, push);
      ctx.translate(-CX, -CY);

      const top = lockTop(lt);
      drawSpot(ctx, lt, top);
      drawLogo(ctx, lt, G, top);
      drawRole(ctx, lt, G, top);
      drawMeta(ctx, lt, G, top);
      drawHit(ctx, lt);
      drawTrail(ctx, lt, G);
      drawDot(ctx, lt, G, top);

      // Pop bloom for the smooth quarter-res glow: a hot kick on the impact frame that is
      // gone before the word fills (no floor: the end card is crisp).
      if (api.detail === 1 && api.post) {
        const b = 0.5 * Math.exp(-(lt - T_POP) * 11);
        if (b > 0.003) api.post.bloom = Math.max(api.post.bloom || 0, b);
      }
    },
  });
})();
