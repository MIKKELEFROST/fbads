// ─────────────────────────────────────────────────────────────────────────────────────────────
//  HUD · global viewer overlay                           global 0.000 – 15.000 · screen space
//
//  Frames the reel like an edit viewer / camera monitor: crop marks, title slug, REC + tempo,
//  SMPTE timecode, section label with a slot-machine roll, and two progress rails. Quiet and
//  precise — it must never compete with the hero content.
//
//  ADAPTIVE INK (per pixel, palette-locked)
//    The four corner clusters are drawn as pure alpha masks into one small CPU atlas. A single
//    fragment pass then tints every HUD pixel from the composited frame underneath it: a
//    blurred 3×3 luma probe → narrow smoothstep → bone on dark grounds, ink on light ones.
//    Ink, bone, signal and ultra all read cleanly, a wipe crossing a corner inverts the HUD
//    exactly under its edge, and the colours never leave the palette. (A plain 'difference'
//    blend was tested first: bone text turns teal on signal, olive on ultra, and muddy under
//    the vignette.) Mask pixels flagged red (REC dot, type cursors) keep the signal accent unless
//    the ground under them is itself signal, where they fall back to the ink colour. Where the
//    ground is busy (panel edges, glyphs, particles) a 1.5 px knockout halo in the opposite ink
//    separates the HUD from the picture; on flat grounds it is gated off entirely.
//    Everything stays on the GPU — no getImageData — so the HUD never stalls the pipeline.
//
//  TIMELINE
//    0.00 – 0.50   intro: crop marks trim-draw out of their vertices (clockwise stagger); text
//                  blocks decode-type on behind a block cursor; rails draw on
//    every beat    REC dot lit for the first half of the beat; the bar-position square steps
//    each cut      section label rolls slot by slot (R.ease.snap), centred on the cut; the
//                  scene rail's old fill retracts while the new one starts
//    big hits      crop marks recoil outward a few px and settle with a small overshoot
//    13.125        outro: blocks type off, rails retract, crop marks settle at 30 % over the
//                  end card
//
//  Pure function of t (the decode scramble hashes the frame index). api.post.hud (engine
//  default 1) scales the whole HUD, so any scene can duck it for a moment.
// ─────────────────────────────────────────────────────────────────────────────────────────────
(function () {
  const { P, BEAT, W, H } = R;
  const { clamp } = R.math;
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
  const ALPHA = 0.8; // master opacity
  const DIM = 0.6; // secondary glyphs (units, separators, leading zeros)

  // ── text runs ────────────────────────────────────────────────────────────────────────────
  // A run is a flat list of {ch, a} slots on the mono grid (a = relative opacity).
  const run = (...parts) => {
    const out = [];
    for (const [s, dim] of parts) for (const ch of s) out.push({ ch, a: dim ? DIM : 1 });
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
  // Intro type-on windows [start, dur] per block, clockwise from the title.
  const IN_TYPE = { tl: [0.1, 0.3], tr: [0.15, 0.26], br: [0.2, 0.24], bl: [0.25, 0.22] };
  const IN_MARK = 0.02, IN_MARK_STAG = 0.05, IN_MARK_DUR = 0.42;
  const IN_RAIL = [0.3, 0.26];
  const OUT = SC[SC.length - 1].start; // 13.125 — the lockup cut
  const OUT_TYPE = { tl: [OUT, 0.2], tr: [OUT + 0.03, 0.2], br: [OUT + 0.06, 0.2], bl: [OUT + 0.09, 0.2] };
  const OUT_MARK = [OUT, 0.33];
  const MARK_REST = 0.3; // crop-mark opacity over the end card
  // Label roll around each cut.
  const ROLL_PRE = 0.08, ROLL_DUR = 0.16, ROLL_STAG = 0.005, ROLL_DY = 17;
  const SHUTTER = 4; // sub-samples for the HUD's own motion blur

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
  // uZone[i*4 ..] = atlas y, height, screen x, screen y — lets the shader map atlas → screen.
  const U_ZONE = Object.entries(ZONES).flatMap(([k, z]) => [ATLAS_Y[k], z[3], z[0], z[1]]);

  // CPU-backed on purpose: under the headless renderer's SwiftShader, small GPU canvases stall
  // on every hand-off (measured ~50 ms for four corner layers vs ~2 ms on the CPU).
  const atlas = (() => {
    const c = document.createElement('canvas');
    c.width = AW;
    c.height = AH;
    return { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }) };
  })();

  const MASK = '#fff'; // ordinary HUD pixels
  const ACCENT = '#f00'; // flagged pixels: signal accent (REC dot, type cursors)

  // Draw one corner cluster into its atlas slot, in screen coordinates.
  function zone(key, draw) {
    const [zx, zy, zw, zh] = ZONES[key];
    const c = atlas.ctx;
    c.save();
    c.beginPath();
    c.rect(0, ATLAS_Y[key], zw, zh);
    c.clip();
    c.translate(-zx, ATLAS_Y[key] - zy);
    c.fillStyle = MASK;
    c.strokeStyle = MASK;
    c.font = FONT;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    draw(c);
    c.restore();
  }

  // ── tint pass ────────────────────────────────────────────────────────────────────────────
  const TINT = `
uniform sampler2D uBg;     // composited frame
uniform sampler2D uMask;   // HUD atlas (white = HUD, red = accent)
uniform float uZone[16];   // per zone: atlas y, height, screen x, screen y
uniform vec2 uFrame;
uniform vec3 uBone, uInk, uSig;
uniform vec2 uRamp;        // luma smoothstep: below → bone ink, above → ink ink
uniform float uAlpha;      // master opacity (accent pixels are always opaque)
uniform float uHalo;       // knockout-halo strength on busy grounds

// 3×3 tap box probe (~15 px) of the frame at screen px p (y down): mean colour, and the spread
// of luma across the taps (0 on a flat ground, high on edges / busy detail).
vec3 ground(vec2 p, out float spread) {
  vec3 s = vec3(0.);
  float l1 = 0., l2 = 0.;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 q = p + vec2(float(i), float(j)) * 5.;
      vec3 c = texture(uBg, vec2(q.x / uFrame.x, 1. - q.y / uFrame.y)).rgb;
      float l = dot(c, vec3(.2126, .7152, .0722));
      s += c;
      l1 += l;
      l2 += l * l;
    }
  l1 /= 9.;
  spread = sqrt(max(0., l2 / 9. - l1 * l1));
  return s / 9.;
}

void main() {
  vec4 m = texture(uMask, vUv);
  // Mask dilated by ~1.5 px — the footprint of the knockout halo.
  vec2 px = 1.5 / uRes;
  float d = 0.;
  for (int k = 0; k < 8; k++) {
    float ang = float(k) * .785398;
    d = max(d, texture(uMask, vUv + vec2(cos(ang), sin(ang)) * px).a);
  }
  if (max(m.a, d) < .002) { fragColor = vec4(0.); return; }
  vec2 a = vec2(vUv.x * uRes.x, (1. - vUv.y) * uRes.y);   // atlas px, y down
  vec2 p = vec2(0.);
  for (int z = 0; z < 4; z++) {
    float y0 = uZone[z * 4], h = uZone[z * 4 + 1];
    if (a.y >= y0 && a.y < y0 + h) p = vec2(uZone[z * 4 + 2] + a.x, uZone[z * 4 + 3] + a.y - y0);
  }
  float spread;
  vec3 bg = ground(p, spread);
  float inkness = smoothstep(uRamp.x, uRamp.y, dot(bg, vec3(.2126, .7152, .0722)));
  vec3 col = mix(uBone, uInk, inkness);
  vec3 opp = mix(uInk, uBone, inkness);
  // Accent pixels stay signal unless the ground is signal-ish (then they'd vanish).
  float accent = clamp(m.r - m.b, 0., 1.);
  float onSig = 1. - smoothstep(.27, .55, distance(bg, uSig));
  col = mix(col, mix(uSig, col, onSig), accent);
  float alpha = m.a * mix(uAlpha, 1., accent);
  // Knockout halo in the opposite ink, only where the ground is busy (panel edges, glyphs,
  // particles) — on flat grounds it would be invisible or read as a glow, so it's gated off.
  float halo = uHalo * smoothstep(.06, .2, spread) * d * (1. - m.a);
  fragColor = vec4(col * alpha + opp * halo * (1. - alpha), alpha + halo * (1. - alpha));
}`;
  // Luma ramp: ultra (0.22) and darker → bone; signal (0.44) and lighter → ink.
  const RAMP = [0.27, 0.39];
  const U_STATIC = {
    uZone: U_ZONE,
    uFrame: [W, H],
    uBone: R.col.vec(P.bone),
    uInk: R.col.vec(P.ink),
    uSig: R.col.vec(P.signal),
    uRamp: RAMP,
    uHalo: 0.6,
  };

  // ── primitives ───────────────────────────────────────────────────────────────────────────
  const SCRAMBLE = 'ABCDEFGHJKLMNPRSTUVXYZ0123456789#/+<>';
  const scramble = (i, t, seed) =>
    SCRAMBLE[Math.floor(R.hash(i * 17.31 + seed * 5.7 + Math.floor(t * 30) * 1.618) * SCRAMBLE.length)];

  // Draw a run on the mono grid with k settled glyphs (float). The slot at the write head shows
  // a decode scramble and a block cursor leads it; with k ≥ n the run is simply static.
  function typeRun(c, glyphs, x, y, k, t, seed) {
    const n = glyphs.length;
    if (k <= 0.001) return;
    const head = Math.floor(k);
    for (let i = 0; i < Math.min(n, head + 1); i++) {
      const g = glyphs[i];
      if (g.ch === ' ') continue;
      if (i < head) {
        c.globalAlpha = g.a;
        c.fillText(g.ch, x + i * ADV, y);
      } else {
        c.globalAlpha = 0.5 * g.a;
        c.fillText(scramble(i, t, seed), x + i * ADV, y);
      }
    }
    if (head < n) {
      // Block cursor in the accent — the same signal cursor s1 types its line with.
      c.fillStyle = ACCENT;
      c.globalAlpha = 1;
      c.fillRect(x + Math.min(n, head + 1) * ADV, y - CAP - 2, GW, CAP + 4);
      c.fillStyle = MASK;
    }
    c.globalAlpha = 1;
  }

  // Crop mark: L-shape whose outer vertex is (vx, vy); sx/sy (±1) point into the frame.
  function cropMark(c, vx, vy, sx, sy, len) {
    if (len <= 0.01) return;
    c.fillRect(sx > 0 ? vx : vx - len, sy > 0 ? vy : vy - LW, len, LW);
    c.fillRect(sx > 0 ? vx : vx - LW, sy > 0 ? vy : vy - len, LW, len);
  }

  // Slot-machine roll between two runs. lt = seconds since the roll began.
  function rollRun(c, from, to, x, y, lt) {
    c.save();
    c.beginPath();
    c.rect(x - 2, y - CAP - 4, LABEL_SLOTS * ADV + 4, CAP + 8);
    c.clip();
    for (let i = 0; i < LABEL_SLOTS; i++) {
      const a = from[i] || { ch: ' ', a: 1 }, b = to[i] || { ch: ' ', a: 1 };
      const gx = x + i * ADV;
      if (a.ch === b.ch && a.a === b.a) {
        if (b.ch !== ' ') {
          c.globalAlpha = b.a;
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
          c.globalAlpha = (a.a * (1 - u * 0.6)) / SHUTTER;
          c.fillText(a.ch, gx, y - u * ROLL_DY);
        }
        if (b.ch !== ' ' && u > 0) {
          c.globalAlpha = (b.a * (0.4 + u * 0.6)) / SHUTTER;
          c.fillText(b.ch, gx, y + (1 - u) * ROLL_DY);
        }
      }
    }
    c.restore();
    c.globalAlpha = 1;
  }

  // ── the overlay ──────────────────────────────────────────────────────────────────────────
  R.hud = function (ctx, t, api) {
    const vis = clamp(api.post && api.post.hud !== undefined ? api.post.hud : 1);
    if (vis <= 0.001 || t <= 0) return;
    R.resetCtx(atlas.ctx);
    atlas.ctx.clearRect(0, 0, AW, AH);

    // Crop marks: trim-draw on, recoil on hits, settle to MARK_REST for the end card.
    const kick = 5 * recoil(t);
    const markA = 1 - (1 - MARK_REST) * E.soft(seg(t, OUT_MARK[0], OUT_MARK[0] + OUT_MARK[1]));
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
    const railOff = E.snap(seg(t, OUT + 0.02, OUT + 0.3));
    const railW = BLOCK * railOn * (1 - railOff);

    // ── TL: title slug ──
    zone('tl', (c) => {
      mark(c, 0, 1, 1);
      typeRun(c, TITLE, XL, Y_TOP, typed(t, 'tl', TITLE.length), t, 1);
    });

    // ── TR: REC · tempo · bar position ──
    const kTR = typed(t, 'tr', TEMPO.length);
    zone('tr', (c) => {
      mark(c, 1, -1, 1);
      typeRun(c, TEMPO, TR_X, Y_TOP, kTR, t, 2);
      // REC dot (accent-flagged): lit for the first half of each beat; a hairline ring holds
      // its place while it's dark.
      if (kTR > 0.5) {
        const lit = bf < 0.5 ? 1 : 1 - E.quadOut(seg((bf - 0.5) * BEAT, 0, 0.06));
        const cx = TR_X + GW / 2, cy = Y_TOP - CAP / 2;
        c.fillStyle = c.strokeStyle = ACCENT;
        c.globalAlpha = 0.5;
        c.lineWidth = 1;
        c.beginPath();
        c.arc(cx, cy, 4, 0, Math.PI * 2);
        c.stroke();
        if (lit > 0) {
          c.globalAlpha = lit;
          c.beginPath();
          c.arc(cx, cy, 4.5, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = c.strokeStyle = MASK;
      }
      // Four bar-position squares: current beat filled, the previous one's fill decays.
      const x0 = XR - SQ_BLOCK, y0 = Math.round(Y_TOP - CAP / 2 - SQ / 2);
      const cur = bi % 4, prev = (bi + 3) % 4;
      const trDone = IN_TYPE.tr[0] + IN_TYPE.tr[1] * 0.7;
      for (let i = 0; i < 4; i++) {
        const pop = E.quadOut(seg(t, trDone + i * 0.03, trDone + i * 0.03 + 0.1));
        const gone = seg(t, OUT_TYPE.tr[0] + (3 - i) * 0.015, OUT_TYPE.tr[0] + (3 - i) * 0.015 + 0.05);
        const a = pop * (1 - gone);
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
      typeRun(c, tc, XL, Y_BOT, typed(t, 'bl', tc.length), t, 3);
      // Global rail: one segment per scene (2 px gaps), filled to the playhead.
      if (railW > 0.5) {
        const xEnd = XL + railW, xHead = XL + BLOCK * (t / R.DURATION);
        SC.forEach((s, i) => {
          const a = Math.round(XL + (BLOCK * s.start) / R.DURATION) + (i ? 1 : 0);
          const b = Math.min(xEnd, Math.round(XL + (BLOCK * s.end) / R.DURATION) - (i < SC.length - 1 ? 1 : 0));
          if (b <= a) return;
          c.globalAlpha = 0.28;
          c.fillRect(a, Y_RAIL, b - a, 1);
          const f = Math.min(b, xHead);
          if (f > a) {
            c.globalAlpha = 1;
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
      for (let j = 1; j < SC.length - 1; j++) {
        const lt = t - (SC[j].start - ROLL_PRE);
        if (lt >= 0 && lt < ROLL_DUR + LABEL_SLOTS * ROLL_STAG) {
          rollRun(c, LABELS[j - 1], LABELS[j], BR_X, Y_BOT, lt);
          rolled = true;
          break;
        }
      }
      if (!rolled) {
        // Static label: the latest scene whose roll has started.
        let li = 0;
        for (let j = 1; j < SC.length - 1; j++) if (t >= SC[j].start - ROLL_PRE) li = j;
        typeRun(c, LABELS[li], BR_X, Y_BOT, typed(t, 'br', LABELS[li].length), t, 4);
      }
      // Scene rail: fills across the current scene; at a cut the old fill retracts to the right.
      if (railW > 0.5) {
        const sc = SC[k];
        const xEnd = BR_X + railW;
        c.globalAlpha = 0.28;
        c.fillRect(BR_X, Y_RAIL, railW, 1);
        c.globalAlpha = 1;
        if (k < SC.length - 1) {
          c.fillRect(BR_X, Y_RAIL - 1, Math.min(BLOCK * seg(t, sc.start, sc.end), railW), 2);
          if (k > 0) {
            const a = BR_X + BLOCK * E.snap(seg(t, sc.start - 0.03, sc.start + 0.24));
            if (a < xEnd) c.fillRect(a, Y_RAIL - 1, xEnd - a, 2);
          }
        } else c.fillRect(BR_X, Y_RAIL - 1, railW, 2); // the full rail retracts in the outro
      }
    });

    // ── tint + composite ──
    const tinted = R.shader(TINT, Object.assign({ uBg: ctx.canvas, uMask: atlas.canvas, uAlpha: ALPHA }, U_STATIC), { w: AW, h: AH });
    ctx.globalAlpha = vis;
    for (const [k, [zx, zy, zw, zh]] of Object.entries(ZONES)) ctx.drawImage(tinted, 0, ATLAS_Y[k], zw, zh, zx, zy, zw, zh);
    ctx.globalAlpha = 1;
  };
})();
