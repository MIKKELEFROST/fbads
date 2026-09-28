/*
 * Website promo — 16.9 s motion graphic (all copy comes from config.js / config.en.js).
 * Every visual is a pure function of time: __seek(t) lays out the frame at t seconds.
 * Beat grid: 128 BPM → b(n) is the time of beat n (36 beats = 16.875 s).
 *
 *  0.00  S1  trade call-out, one word per beat                        (beats 0-4)
 *  1.88  S2  "five stars" … "your website? not so many"               (beats 4-12)
 *  5.63  S3  hazard wipe + tape, then the site is built on a blueprint  (beats 12-20)
 *  9.38  S4  browser morphs into a phone; "you get the calls"         (beats 20-28)
 * 13.13  S5  logo, tagline, CTA                                        (beats 28-36)
 */
(function () {
  'use strict';
  const { clamp, lerp, prog, E, spring, kf, mix, rgba } = A;
  const CFG = window.CONFIG;
  const COL = CFG.colors;
  const D = CFG.demo;
  const INK = COL.ink, PAPER = COL.paper, ORANGE = COL.orange, YELLOW = COL.yellow;

  const q = new URLSearchParams(location.search);
  const P = q.get('format') === 'portrait';
  const W = P ? 1080 : 1920;
  const H = P ? 1920 : 1080;
  const B = 60 / 128;
  const b = (n) => n * B;
  const DUR = b(36);

  document.body.classList.add(P ? 'portrait' : 'landscape');
  const rs = document.documentElement.style;
  rs.setProperty('--ink', INK);
  rs.setProperty('--paper', PAPER);
  rs.setProperty('--orange', ORANGE);
  rs.setProperty('--yellow', YELLOW);
  const stage = document.getElementById('stage');
  stage.style.width = W + 'px';
  stage.style.height = H + 'px';

  // ---------------------------------------------------------------- helpers
  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    (parent || stage).appendChild(e);
    return e;
  }
  function layer(z, cls) {
    const l = el('div', 'layer' + (cls ? ' ' + cls : ''));
    l.style.zIndex = z;
    return l;
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ico = (name, attrs = '') =>
    `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${attrs}>${ICONS[name]}</svg>`;
  const starSvg = (fill, stroke = fill, sw = 1.5) =>
    `<svg class="ic" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">${ICONS.star}</svg>`;
  const show = (e, on) => e.classList.toggle('hide', !on);
  const px = (v) => v.toFixed(2) + 'px';

  // "\n" always breaks, "|" breaks in portrait only, *…* marks the accent.
  function tokens(text) {
    const lines = text.replace(/\|/g, P ? '\n' : ' ').split('\n');
    let acc = false;
    return lines.map((line) =>
      line.split(' ').filter(Boolean).map((tok) => {
        let w = tok, a = acc;
        if (w.startsWith('*')) { w = w.slice(1); a = acc = true; }
        if (w.endsWith('*')) { w = w.slice(0, -1); a = true; acc = false; }
        return { w, a };
      })
    );
  }
  // masked words that can rise from their baseline; returns the moving spans
  function words(parent, text, accCls = 'acc-orange') {
    const out = [];
    tokens(text).forEach((line, li) => {
      if (li) el('br', null, parent);
      line.forEach((tk, i) => {
        const m = el('span', 'mask', parent);
        out.push(el('span', 'mask-in' + (tk.a ? ' ' + accCls : ''), m, esc(tk.w)));
        if (i < line.length - 1) parent.appendChild(document.createTextNode(' '));
      });
    });
    return out;
  }
  // same markup rules, plain HTML (for the mock website)
  function rich(text, accCls) {
    return tokens(text.replace(/\|/g, '\n'))
      .map((line) => line.map((tk) => (tk.a ? `<span class="${accCls}">${esc(tk.w)}</span>` : esc(tk.w))).join(' '))
      .join('<br>');
  }
  // rise in at tIn (staggered), rise out at tOut. 140% clears descenders (j, g) and accents (å) past the mask
  function rise(t, list, tIn, tOut = Infinity, o = {}) {
    const st = o.stagger != null ? o.stagger : 0.065;
    const d = o.dur || 0.55;
    const so = o.outStagger != null ? o.outStagger : 0.03;
    const dOut = o.outDur || 0.3;
    list.forEach((w, i) => {
      const y = t < tOut
        ? (1 - E.outExpo(prog(t, tIn + i * st, d))) * 140
        : -E.inQuart(prog(t, tOut + i * so, dOut)) * 140;
      w.style.transform = `translateY(${y.toFixed(3)}%)`;
    });
  }
  // stage-space rect of any element (works through 3D transforms and preview scaling)
  function rectOf(node) {
    const sr = stage.getBoundingClientRect();
    const k = W / sr.width;
    const r = node.getBoundingClientRect();
    return {
      x: (r.left - sr.left) * k, y: (r.top - sr.top) * k, w: r.width * k, h: r.height * k,
      r: (r.right - sr.left) * k, b: (r.bottom - sr.top) * k,
      cx: ((r.left + r.right) / 2 - sr.left) * k, cy: ((r.top + r.bottom) / 2 - sr.top) * k,
    };
  }
  // shrink font-size until the element fits a width
  function fitWidth(node, maxW, size) {
    node.style.fontSize = size + 'px';
    const w = node.scrollWidth;
    if (w > maxW) node.style.fontSize = (size * maxW) / w + 'px';
  }
  // shrink a container's font-size until its inline-block content (one or more lines) fits maxW
  function fitInline(container, inner, maxW, size) {
    container.style.fontSize = size + 'px';
    const w = inner.offsetWidth;
    if (w > maxW) container.style.fontSize = (size * maxW) / w + 'px';
    return parseFloat(container.style.fontSize);
  }
  // decaying pulse on every beat from `from` onwards (0..1)
  function beatPulse(t, from, decay = 7) {
    if (t < from) return 0;
    const n = Math.floor((t - from) / B + 1e-6);
    return Math.exp(-(t - (from + n * B)) * decay);
  }

  // ======================================================= S1 · trades (0 → b4)
  const S1 = (() => {
    const palette = [
      { bg: ORANGE, fg: INK, icon: INK },
      { bg: INK, fg: PAPER, icon: YELLOW },
      { bg: PAPER, fg: INK, icon: ORANGE },
      { bg: YELLOW, fg: INK, icon: INK },
    ];
    const origins = [[0.5, 0.5], [0.88, 0.16], [0.12, 0.86], [0.86, 0.84]];
    const root = layer(10, 's1');
    const L = CFG.trades.map((tr, i) => {
      const c = palette[i % palette.length];
      const lay = el('div', 's1-layer', root);
      const [ox, oy] = origins[i % origins.length];
      const R = Math.hypot(Math.max(ox, 1 - ox) * W, Math.max(oy, 1 - oy) * H) + 24;
      const circle = el('div', 's1-circle', lay);
      Object.assign(circle.style, {
        left: px(ox * W - R), top: px(oy * H - R), width: px(2 * R), height: px(2 * R), background: c.bg,
      });
      const group = el('div', 's1-group', lay);
      const icon = el('div', 's1-icon', group, ico(tr.icon));
      icon.style.color = c.icon;
      const word = el('div', 's1-word', group);
      word.style.color = c.fg;
      const text = tr.word.toUpperCase();
      const endsDot = text.endsWith('.');
      const measure = el('span', 'measure', word, esc(text));
      const kicker = el('div', 's1-label', lay, `<i></i><span>${esc(CFG.kicker)}</span>`);
      const count = el('div', 's1-label', lay, `${String(i + 1).padStart(2, '0')}<span style="opacity:.45">/${String(CFG.trades.length).padStart(2, '0')}</span>`);
      kicker.style.color = count.style.color = c.fg;
      const m = P ? 80 : 96;
      Object.assign(kicker.style, { left: m + 'px', top: (P ? 150 : 76) + 'px' });
      Object.assign(count.style, { right: m + 'px', top: (P ? 150 : 76) + 'px' });
      return { lay, circle, group, icon, word, measure, text, endsDot, kicker, count, letters: [], dot: null };
    });

    function build() {
      const base = P ? 178 : 226;
      const target = P ? 860 : 1330;
      L.forEach((l) => {
        const wAt = (wd) => { l.word.style.fontStretch = wd + '%'; return l.measure.offsetWidth; };
        l.word.style.fontSize = base + 'px';
        let wd;
        if (wAt(125) <= target) wd = 125;
        else if (wAt(62) >= target) wd = 62;
        else {
          let lo = 62, hi = 125;
          for (let k = 0; k < 20; k++) { const mid = (lo + hi) / 2; if (wAt(mid) > target) hi = mid; else lo = mid; }
          wd = lo;
        }
        wAt(wd);
        let size = base;
        if (l.measure.offsetWidth > target) { size = (base * target) / l.measure.offsetWidth; l.word.style.fontSize = size + 'px'; }
        l.size = size;
        // exact glyph positions (keeps kerning) → one absolutely placed span per letter
        const tn = l.measure.firstChild;
        const mr = l.measure.getBoundingClientRect();
        const k = l.measure.offsetWidth / mr.width;
        const padL = 0.06 * size;
        const n = l.endsDot ? l.text.length - 1 : l.text.length;
        for (let i = 0; i < n; i++) {
          const rg = document.createRange();
          rg.setStart(tn, i); rg.setEnd(tn, i + 1);
          const r = rg.getBoundingClientRect();
          const s = el('span', 's1-letter', l.word, esc(l.text[i]));
          s.style.left = px(padL + (r.left - mr.left) * k);
          l.letters.push(s);
        }
        if (l.endsDot) {
          const rg = document.createRange();
          rg.setStart(tn, n); rg.setEnd(tn, n + 1);
          const r = rg.getBoundingClientRect();
          const bl = el('span', null, l.word);
          bl.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
          const baseline = bl.offsetTop;
          const side = 0.205 * size;
          const dot = el('div', 's1-dot', l.word);
          const cx = padL + (r.left - mr.left) * k + (r.width * k) / 2 - 0.01 * size;
          Object.assign(dot.style, {
            width: px(side), height: px(side), left: px(cx - side / 2), top: px(baseline - side), background: l.word.style.color,
          });
          l.dot = dot;
          l.dotSide = side;
        }
        l.measure.style.visibility = 'hidden';
        // centre the group
        l.gw = l.group.offsetWidth;
        l.gh = l.group.offsetHeight;
        l.gx = (W - l.gw) / 2;
        l.gy = (H - l.gh) / 2 + (P ? 20 : 10);
        if (l.dot) {
          l.dcx = l.word.offsetLeft + l.dot.offsetLeft + l.dotSide / 2;
          l.dcy = l.word.offsetTop + l.dot.offsetTop + l.dotSide / 2;
          const sx = l.gx + l.dcx, sy = l.gy + l.dcy;
          const need = 2 * Math.max(sx, W - sx, sy, H - sy) + 40;
          l.zoomMax = need / l.dotSide;
        }
      });
    }

    const tZoom0 = b(4) - 0.22, tZoom1 = b(4) + 0.02;
    function render(t) {
      const on = t < tZoom1;
      show(root, on);
      if (!on) return;
      L.forEach((l, i) => {
        const t0 = b(i);
        const covered = i < L.length - 1 && t > b(i + 1) + 0.4;
        const vis = t >= t0 - 1e-4 && !covered;
        show(l.lay, vis);
        if (!vis) return;
        l.circle.style.transform = `scale(${i === 0 ? 1 : E.outQuart(prog(t, t0, 0.36))})`;
        const st = 0.011;
        l.letters.forEach((s, k) => {
          const p = E.outExpo(prog(t, t0 + 0.03 + k * st, 0.4));
          s.style.transform = `translateY(${((1 - p) * 112).toFixed(2)}%)`;
        });
        if (l.dot) {
          const p = E.outExpo(prog(t, t0 + 0.03 + l.letters.length * st, 0.4));
          l.dot.style.transform = `translateY(${px((1 - p) * l.size * 1.1)})`;
        }
        const sp = spring(t - t0 - 0.02, 2.4, 0.42);
        const wig = Math.sin((t - t0) * 9) * 4 * Math.exp(-(t - t0) * 3) * prog(t, t0 + 0.2, 0.1);
        l.icon.style.transform = `scale(${Math.max(0, sp).toFixed(4)}) rotate(${((1 - sp) * -40 + wig).toFixed(2)}deg)`;
        l.icon.style.opacity = prog(t, t0 + 0.02, 0.06);
        // labels
        if (i === 0) {
          const kp = E.outExpo(prog(t, 0.05, 0.5));
          l.kicker.style.transform = `translateX(${px((1 - kp) * -30)})`;
          l.kicker.style.opacity = kp;
          l.count.style.opacity = kp;
        }
        // slow push-in, or the zoom through the full stop on the last word
        let s = 1 + 0.055 * E.outCubic(prog(t, t0, B * 1.4));
        let pxv = l.gw / 2, pyv = l.gh / 2;
        const zp = l.dot && i === L.length - 1 ? prog(t, tZoom0, tZoom1 - tZoom0) : 0;
        if (zp > 0) {
          const z = Math.exp(Math.log(l.zoomMax) * E.inCubic(zp));
          // blend pivot from group centre to the dot as the zoom starts
          const pv = E.outCubic(clamp(zp * 4));
          pxv = lerp(pxv, l.dcx, pv);
          pyv = lerp(pyv, l.dcy, pv);
          s *= z;
          const big = s > 7;
          l.letters.forEach((x) => (x.style.visibility = big ? 'hidden' : ''));
          l.icon.style.visibility = big ? 'hidden' : '';
        }
        l.group.style.transform = `translate(${px(l.gx + pxv)},${px(l.gy + pyv)}) scale(${s.toFixed(5)}) translate(${px(-pxv)},${px(-pyv)})`;
      });
    }
    return { build, render };
  })();

  // ============================== S2 · the problem (b4 → b12): five stars, then not so many
  const S2 = (() => {
    const root = layer(20, 's2');
    const wrap = el('div', 'layer', root); // everything in the scene, for a slow push-in
    const box = el('div', 's2-stars', wrap);
    const n = 5, size = P ? 104 : 96, gap = 26;
    const rowW = n * size + (n - 1) * gap;
    const rowY = P ? 660 : 300;
    // each star = a static outline "slot" + the filled star that pops in (and later falls off)
    const stars = [...Array(n)].map((_, i) => {
      const slot = el('div', 's2-star', box, starSvg('none', rgba(PAPER, 0.34), 1.3));
      const fly = el('div', 's2-star', box, starSvg(YELLOW, YELLOW, 1.2));
      slot.style.width = slot.style.height = fly.style.width = fly.style.height = size + 'px';
      return { slot, fly, x: (W - rowW) / 2 + i * (size + gap), y: rowY - size / 2 };
    });
    const lineA = el('div', 's2-line', wrap);
    const inA = el('span', 'fit', lineA);
    const aW = words(inA, CFG.fiveStar, 'acc-yellow');
    const lineB = el('div', 's2-line', wrap);
    const inB = el('span', 'fit', lineB);
    const b1 = words(inB, CFG.website);
    el('br', null, inB);
    const b2 = words(inB, CFG.notSoMuch, 'acc-orange');

    function build() {
      // one font size for both lines so the swap doesn't jump, centred on the same point
      const maxW = W - (P ? 110 : 240), base = P ? 128 : 132;
      const fs = Math.min(fitInline(lineA, inA, maxW, base), fitInline(lineB, inB, maxW, base));
      const cy = P ? 980 : 562;
      [lineA, lineB].forEach((l) => {
        l.style.fontSize = fs + 'px';
        l.style.top = px(cy - l.offsetHeight / 2);
      });
    }
    const tOn = b(4) + 0.02, tSwap = b(8), tFall = b(9);
    function render(t) {
      const on = t >= tOn && t < b(12) + 0.02;
      show(root, on);
      if (!on) return;
      wrap.style.transform = `scale(${(1 + 0.035 * E.inOutSine(prog(t, b(4), b(12) - b(4)))).toFixed(5)})`;
      stars.forEach((s, i) => {
        const ts = b(4) + 0.04 + i * (B / 4);
        const sp = spring(t - ts, 3.0, 0.42);
        let x = s.x, y = s.y, r = (1 - sp) * -60, sc = Math.max(0, sp), o = 1;
        if (i > 0) {
          const tf = tFall + (i - 1) * 0.06;
          const tau = t - tf;
          if (tau > 0) {
            y += -380 * tau + 0.5 * 7400 * tau * tau;
            x += (i - 2.5) * 130 * tau;
            r += (i % 2 ? 1 : -1) * (300 + i * 70) * tau;
            o = 1 - prog(tau, 0.3, 0.2);
          }
          const op = spring(t - tf - 0.06, 3.2, 0.5);
          s.slot.style.opacity = t > tf + 0.06 ? 1 : 0;
          s.slot.style.transform = `translate(${px(s.x)},${px(s.y)}) scale(${(0.4 + 0.6 * Math.max(0, op)).toFixed(4)})`;
        } else {
          s.slot.style.opacity = 0;
          const tau = t - tFall;
          if (tau > 0) r += Math.sin(tau * 22) * 9 * Math.exp(-tau * 5);
        }
        s.fly.style.transform = `translate(${px(x)},${px(y)}) rotate(${r.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
        s.fly.style.opacity = o;
      });
      // line A clears out just before line B rises into the same spot, so the two never overlap
      rise(t, aW, b(4) + 0.03, tSwap - 0.1, { stagger: 0.07, outStagger: 0.02, outDur: 0.16 });
      rise(t, b1, tSwap + 0.05, Infinity, { stagger: 0.07 });
      rise(t, b2, tFall + 0.02, Infinity, { stagger: 0.08 });
      // a small "womp" shake on the punchline
      const tau = t - tFall - 0.25;
      const sh = tau > 0 ? Math.sin(tau * 30) * 7 * Math.exp(-tau * 6) : 0;
      b2.forEach((w) => (w.parentNode.style.transform = `translateX(${px(sh)})`));
    }
    return { build, render };
  })();

  // ====================================================== the example website
  function logoHTML() {
    return `<div class="logo"><div class="logo-mark">${ico('droplet')}</div><div class="logo-text"><b>${esc(D.name)}</b><small>${esc(D.trade.toUpperCase())}</small></div></div>`;
  }
  const stars5 = (fill = '#F5A300') => `<span class="stars5">${[...Array(5)].map(() => starSvg(fill, fill, 1)).join('')}</span>`;
  function heroSVG(id) {
    const pipe = 'M -40 276 H 150 Q 196 276 196 230 V 156 Q 196 112 240 112 H 372 Q 416 112 416 156 V 430';
    return `<svg viewBox="0 0 548 380" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hg-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B82F6"/><stop offset=".55" stop-color="#1E40AF"/><stop offset="1" stop-color="#0B1B33"/></linearGradient>
        <radialGradient id="hl-${id}" cx=".78" cy=".12" r=".7"><stop offset="0" stop-color="#93C5FD" stop-opacity=".5"/><stop offset="1" stop-color="#93C5FD" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="548" height="380" fill="url(#hg-${id})"/>
      <rect width="548" height="380" fill="url(#hl-${id})"/>
      <circle cx="476" cy="40" r="150" fill="#fff" opacity=".07"/>
      <circle cx="40" cy="372" r="140" fill="#fff" opacity=".05"/>
      <g class="sparks" fill="#fff">
        <path d="M92 92 l5 13 13 5 -13 5 -5 13 -5 -13 -13 -5 13 -5z" opacity=".55"/>
        <path d="M486 300 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" opacity=".45"/>
      </g>
      <path class="pipe" d="${pipe}" fill="none" stroke="#BFDBFE" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="pipe-hl" d="${pipe}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" transform="translate(-7 -7)"/>
      <g fill="#FF5A1F">
        <rect class="cpl" data-f=".16" x="99" y="254" width="22" height="44" rx="6"/>
        <rect class="cpl" data-f=".34" x="174" y="189" width="44" height="22" rx="6"/>
        <rect class="cpl" data-f=".62" x="341" y="90" width="22" height="44" rx="6"/>
        <rect class="cpl" data-f=".82" x="394" y="239" width="44" height="22" rx="6"/>
      </g>
      <g class="valve" data-f=".52" transform="translate(292 62)">
        <rect x="-6" y="4" width="12" height="34" rx="3" fill="#FDBA74"/>
        <g class="wheel"><circle r="29" fill="none" stroke="#FF5A1F" stroke-width="9"/><path d="M-29 0H29M0-29V29" stroke="#FF5A1F" stroke-width="7" stroke-linecap="round"/><circle r="9" fill="#FF5A1F"/></g>
      </g>
      <g class="drop" transform="translate(306 262)">
        <g class="drop-in">
          <path d="M0 -62 C 24 -32 44 -8 44 18 A 44 44 0 0 1 -44 18 C -44 -8 -24 -32 0 -62 Z" fill="#fff"/>
          <path d="M-18 16 l12 12 l24 -26" fill="none" stroke="#2563EB" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </g>
    </svg>`;
  }
  const cardHTML = (s, i) =>
    `<div class="card" data-b="card${i}"><span class="ci" style="background:${s.tint};color:${s.ink}">${ico(s.icon)}</span><div><b>${esc(s.title)}</b><p>${esc(s.text)}</p></div><span class="go">${ico('arrow-right')}</span></div>`;
  function desktopHTML() {
    return `
      <nav class="d-nav" data-b="nav">${logoHTML()}
        <div class="d-links">${D.nav.map((x) => `<span>${esc(x)}</span>`).join('')}</div>
        <div class="d-nav-r"><span class="d-hotline">${ico('phone')}${esc(D.hotline)}</span><span class="btn btn-o">${esc(D.navCta)}</span></div>
      </nav>
      <section class="d-hero">
        <div class="d-hero-l">
          <div class="eyebrow" data-b="eyebrow"><i class="dot"></i>${esc(D.eyebrow)}</div>
          <h1 class="h1" data-t="h1"></h1>
          <p class="d-lead" data-b="lead">${esc(D.lead)}</p>
          <div class="d-ctas" data-b="cta"><span class="btn btn-o" data-t="book">${ico('calendar-check')}${esc(D.book)}</span><span class="btn btn-line">${ico('phone')}${esc(D.call)}</span></div>
          <div class="d-trust" data-b="trust">${stars5()}<b>${esc(D.rating)}</b>${esc(D.reviews)}<i class="sep"></i><span class="shield">${ico('shield-check')}</span>${esc(D.insured)}</div>
        </div>
        <div class="hero-img" data-b="img">${heroSVG('d')}
          <div class="rating-chip">${starSvg('currentColor', 'currentColor', 1)}<span>${esc(D.ratingChip)}</span></div>
          <div class="badge"><span class="ck">${ico('check')}</span>${esc(D.badge)}</div>
        </div>
      </section>
      <section class="d-services">
        <div class="d-sec-h" data-b="sech"><b>${esc(D.servicesTitle)}</b><span>${esc(D.servicesAll)}</span></div>
        <div class="d-cards">${D.services.map(cardHTML).join('')}</div>
      </section>`;
  }
  function mobileHTML() {
    return `
      <div class="m-status"><b>9:41</b><span class="m-status-r">${ico('signal')}${ico('wifi')}${ico('battery-full')}</span></div>
      <div class="m-nav">${logoHTML()}<span class="m-menu">${ico('menu')}</span></div>
      <div class="m-hero">
        <div class="eyebrow"><i class="dot"></i>${esc(D.eyebrowShort)}</div>
        <h1 class="h1">${rich(D.h1.replace(/[|\n]/g, ' '), 'acc-site')}</h1>
        <p class="m-lead">${esc(D.lead)}</p>
        <div class="m-trust">${stars5()}<b>${esc(D.rating)}</b>${esc(D.reviews)}</div>
      </div>
      <div class="hero-img m-hero-img">${heroSVG('m')}
        <div class="rating-chip">${starSvg('currentColor', 'currentColor', 1)}<span>${esc(D.rating)}</span></div>
      </div>
      <div class="m-cards">${D.services.slice(0, 2).map(cardHTML).join('')}</div>
      <div class="m-sticky"><span class="btn btn-line">${ico('phone')}${esc(D.callShort)}</span><span class="btn btn-o">${ico('calendar-check')}${esc(D.book)}</span></div>
      <div class="m-call">
        <span class="av">${ico('user')}</span>
        <span class="who"><b>${esc(CFG.caller.name)}</b><span>${esc(CFG.caller.note)}</span></span>
        <span class="cb no">${ico('phone-off')}</span><span class="cb yes">${ico('phone')}</span>
      </div>`;
  }

  // ============================================ device: browser ⇄ phone (S3/S4)
  const DEV = (() => {
    const cam = layer(50, 'cam');
    const dev = el('div', 'device', cam);
    const screen = el('div', 'screen', dev);
    const topbar = el('div', 'topbar', screen, `<i></i><i></i><i></i><div class="url">${ico('lock')}<span>${esc(D.domain)}</span></div>`);
    const url = topbar.querySelector('.url');
    const viewport = el('div', 'viewport', screen);
    const siteD = el('div', 'site site-d', viewport, desktopHTML());
    const siteM = el('div', 'site site-m', viewport, mobileHTML());
    const island = el('div', 'island', screen);
    const home = el('div', 'home-ind', screen);
    const dims = el('div', 'dims', dev);
    const h1 = siteD.querySelector('[data-t=h1]');
    const h1Words = words(h1, D.h1, 'acc-site');
    const book = siteD.querySelector('[data-t=book]');
    const call = siteM.querySelector('.m-call');
    const pipes = [...siteD.querySelectorAll('.pipe, .pipe-hl')];
    const cpls = [...siteD.querySelectorAll('.cpl')];
    const valve = siteD.querySelector('.valve');
    const wheels = [...dev.querySelectorAll('.wheel')];
    const drop = siteD.querySelector('.drop-in');
    const heroBadge = siteD.querySelector('.hero-img .badge');
    const heroChip = siteD.querySelector('.hero-img .rating-chip');
    const trustStars = [...siteD.querySelectorAll('.d-trust .stars5 svg')];

    // build order (seconds) for each block of the desktop page
    const T = {
      nav: b(14), eyebrow: b(14.5) - 0.05, h1: b(14.5), lead: b(14.5) + 0.3, img: b(15), cta: b(15.5),
      trust: b(16), sech: b(16.5) - 0.12, card0: b(16.5), card1: b(16.75), card2: b(17),
    };
    const blocks = {};
    siteD.querySelectorAll('[data-b]').forEach((n) => (blocks[n.dataset.b] = n));
    const wires = [];
    let pipeLen = 0;

    function build() {
      // wireframe boxes over each block, in page coordinates
      const sr = siteD.getBoundingClientRect();
      const k = 1280 / sr.width;
      const box = (nodes, label) => {
        const rs = nodes.map((n) => n.getBoundingClientRect());
        const x0 = Math.min(...rs.map((r) => r.left)), y0 = Math.min(...rs.map((r) => r.top));
        const x1 = Math.max(...rs.map((r) => r.right)), y1 = Math.max(...rs.map((r) => r.bottom));
        const w = el('div', 'wire', siteD, `<span>${esc(label)}</span>`);
        const pad = 6;
        Object.assign(w.style, {
          left: px((x0 - sr.left) * k - pad), top: px((y0 - sr.top) * k - pad),
          width: px((x1 - x0) * k + 2 * pad), height: px((y1 - y0) * k + 2 * pad),
        });
        return w;
      };
      const plan = [
        ['nav', [blocks.nav], D.wires.nav],
        ['h1', [blocks.eyebrow, h1, blocks.lead], D.wires.h1],
        ['img', [blocks.img], D.wires.img],
        ['cta', [blocks.cta], D.wires.cta],
        ['trust', [blocks.trust], D.wires.trust],
        ['card0', [blocks.card0], D.wires.card],
        ['card1', [blocks.card1], D.wires.card],
        ['card2', [blocks.card2], D.wires.card],
      ];
      plan.forEach(([key, nodes, label], i) => wires.push({ key, w: box(nodes, label), i }));
      pipeLen = pipes[0].getTotalLength();
      pipes.forEach((p) => (p.style.strokeDasharray = pipeLen));
      // blueprint dimension marks (children of the device so they share its 3D transform)
      dims.innerHTML = `
        <div class="dim dim-top"><i class="line"></i><i class="tick t1"></i><i class="tick t2"></i><span class="lbl">1280 PX</span></div>
        <div class="dim dim-left"><i class="line"></i><i class="tick t1"></i><i class="tick t2"></i><span class="lbl">800 PX</span></div>`;
    }

    function layoutDims(w, h) {
      const top = dims.querySelector('.dim-top'), left = dims.querySelector('.dim-left');
      Object.assign(top.style, { left: '0px', top: '-34px', width: px(w), height: '20px' });
      Object.assign(top.querySelector('.line').style, { left: '0px', top: '10px', width: px(w), height: '1.5px' });
      Object.assign(top.querySelector('.t1').style, { left: '0px', top: '2px', width: '1.5px', height: '17px' });
      Object.assign(top.querySelector('.t2').style, { left: px(w - 1.5), top: '2px', width: '1.5px', height: '17px' });
      Object.assign(top.querySelector('.lbl').style, { left: px(w / 2), top: '0px', transform: 'translateX(-50%)' });
      Object.assign(left.style, { left: '-34px', top: '0px', width: '20px', height: px(h) });
      Object.assign(left.querySelector('.line').style, { left: '10px', top: '0px', width: '1.5px', height: px(h) });
      Object.assign(left.querySelector('.t1').style, { left: '2px', top: '0px', width: '17px', height: '1.5px' });
      Object.assign(left.querySelector('.t2').style, { left: '2px', top: px(h - 1.5), width: '17px', height: '1.5px' });
      Object.assign(left.querySelector('.lbl').style, { left: '10px', top: px(h / 2), transform: 'translate(-50%,-50%) rotate(-90deg)' });
    }

    // geometry: browser (S3) → phone (S4)
    const G = P
      ? { bx: 540, by: 940, bw: 960, bh: 660, bar: 40, px: 540, py: 1292, pw: 470, ph: 964, pr: 74, pbz: 15 }
      : { bx: 1062, by: 612, bw: 1200, bh: 750, bar: 46, px: 1480, py: 548, pw: 400, ph: 820, pr: 64, pbz: 13 };
    const tAppear = b(13), tMorph0 = b(18.3), tMorph1 = b(20) - 0.02;

    function render(t) {
      const on = t >= tAppear && t < b(28) + 0.05;
      show(cam, on);
      if (!on) return;
      // --- geometry
      const m = prog(t, tMorph0, tMorph1 - tMorph0);
      const em = E.inOutCubic(m);
      const mv = E.inOutQuart(prog(t, tMorph0 + 0.05, tMorph1 - tMorph0 + 0.1));
      const ap = E.outExpo(prog(t, tAppear, 0.7));
      let cx = lerp(G.bx, G.px, mv);
      let cy = lerp(G.by, G.py, mv) + (1 - ap) * 90;
      const w = lerp(G.bw, G.pw, em);
      const h = lerp(G.bh, G.ph, em);
      const r = lerp(18, G.pr, E.outCubic(m));
      const bz = G.pbz * E.inOutCubic(clamp((m - 0.3) / 0.5));
      const bar = G.bar * (1 - E.inOutCubic(clamp(m / 0.5)));
      let ry = kf(t, [[tAppear, P ? -11 : -13], [tMorph0, P ? -4 : -5, E.outCubic], [tMorph1, 0, E.inOutCubic]]);
      let rx = kf(t, [[tAppear, 7], [tMorph0, 2.5, E.outCubic], [tMorph1, 0, E.inOutCubic]]);
      let rz = 0;
      const s = lerp(0.9, 1, ap);
      // S4: gentle float + ringing shake
      if (t > tMorph1) {
        cy += Math.sin((t - tMorph1) * 2.1) * 5;
        rz = RING.shake(t);
      }
      dev.style.width = px(w);
      dev.style.height = px(h);
      dev.style.borderRadius = px(r);
      dev.style.background = mix('#FFFFFF', '#111215', clamp((m - 0.25) / 0.45));
      dev.style.opacity = clamp((t - tAppear) / 0.12);
      dev.style.transform = `translate(${px(cx - w / 2)},${px(cy - h / 2)}) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) rotateZ(${rz.toFixed(3)}deg) scale(${s.toFixed(4)})`;
      cam.style.perspectiveOrigin = `${px(cx)} ${px(cy)}`;
      Object.assign(screen.style, { left: px(bz), top: px(bz), right: px(bz), bottom: px(bz), borderRadius: px(Math.max(0, r - bz)) });
      topbar.style.height = px(bar);
      topbar.style.opacity = clamp(bar / G.bar * 1.6);
      viewport.style.top = px(bar);
      // each layout keeps its native scale and stays centred, so the narrowing frame reads like a
      // browser window being resized until the page reflows into its mobile layout
      const iw = w - 2 * bz;
      const dS = G.bw / 1280, mS = (G.pw - 2 * G.pbz) / 390;
      siteD.style.transform = `translateX(${px((iw - 1280 * dS) / 2)}) scale(${dS.toFixed(5)})`;
      siteM.style.transform = `translateX(${px((iw - 390 * mS) / 2)}) scale(${mS.toFixed(5)})`;
      // cross-fade: the phone layout fades in on top while the desktop layout fades out underneath
      const dO = 1 - E.inOutSine(clamp((m - 0.26) / 0.18)), mO = E.inOutSine(clamp((m - 0.26) / 0.2));
      const blur = 9 * Math.sin(Math.PI * clamp((m - 0.24) / 0.24));
      siteD.style.opacity = dO;
      siteM.style.opacity = mO;
      siteD.style.filter = siteM.style.filter = blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : 'none';
      show(siteD, dO > 0);
      show(siteM, mO > 0);
      const io = clamp((m - 0.6) / 0.3);
      Object.assign(island.style, { width: px(122 * mS), height: px(36 * mS), top: px(11 * mS), marginLeft: px(-61 * mS), opacity: io });
      Object.assign(home.style, { width: px(134 * mS), height: px(5 * mS), bottom: px(8 * mS), marginLeft: px(-67 * mS), opacity: io });
      url.style.minWidth = px(Math.min(360, w * 0.36));
      // --- dimension marks
      const dimO = E.outCubic(prog(t, b(13.3), 0.4)) * (1 - prog(t, b(18.1), 0.25));
      dims.style.opacity = dimO;
      show(dims, dimO > 0);
      if (dimO > 0) layoutDims(w, h);
      // --- build the desktop page
      if (dO > 0) {
        wires.forEach((x) => {
          const tin = b(13.25) + x.i * 0.05;
          const p = E.outExpo(prog(t, tin, 0.45));
          const out = prog(t, T[x.key], 0.18);
          x.w.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`;
          x.w.style.opacity = 1 - out;
          show(x.w, p > 0 && out < 1);
        });
        const reveal = (node, t0, dy = 18) => {
          const p = E.outCubic(prog(t, t0, 0.35));
          node.style.opacity = clamp((t - t0) / 0.14);
          node.style.transform = `translateY(${px((1 - p) * dy)})`;
        };
        reveal(blocks.nav, T.nav, -20);
        reveal(blocks.eyebrow, T.eyebrow);
        rise(t, h1Words, T.h1, Infinity, { stagger: 0.06 });
        reveal(blocks.lead, T.lead);
        reveal(blocks.sech, T.sech);
        ['card0', 'card1', 'card2'].forEach((c) => {
          const sp = spring(t - T[c], 2.6, 0.55);
          blocks[c].style.opacity = clamp((t - T[c]) / 0.1);
          blocks[c].style.transform = `translateY(${px((1 - sp) * 40)}) scale(${(0.94 + 0.06 * sp).toFixed(4)})`;
        });
        // CTA buttons pop, then the booking button gets clicked
        [...blocks.cta.children].forEach((btn, i) => {
          const sp = spring(t - T.cta - i * 0.08, 2.8, 0.5);
          let sc = 0.6 + 0.4 * sp;
          if (btn === book) sc *= kf(t, [[CLICK - 0.02, 1], [CLICK + 0.05, 0.9, E.outQuad], [CLICK + 0.35, 1, E.outBack]]);
          btn.style.opacity = clamp((t - T.cta - i * 0.08) / 0.1);
          btn.style.transform = `scale(${sc.toFixed(4)})`;
        });
        // trust row: stars tick in on 16ths
        blocks.trust.style.opacity = clamp((t - T.trust) / 0.12);
        trustStars.forEach((sv, i) => {
          const sp = spring(t - T.trust - i * (B / 4) * 0.5, 3.2, 0.45);
          sv.style.transform = `scale(${Math.max(0, sp).toFixed(4)})`;
        });
        // hero image: card wipes up, pipes draw on, fittings pop, valve spins
        const ip = E.outExpo(prog(t, T.img, 0.55));
        blocks.img.style.clipPath = `inset(${((1 - ip) * 100).toFixed(2)}% 0 0 0 round 26px)`;
        blocks.img.firstElementChild.style.transform = `scale(${(1.18 - 0.18 * ip).toFixed(4)})`;
        const pd0 = T.img + 0.12, pdd = 0.7;
        const pp = E.outCubic(prog(t, pd0, pdd));
        pipes.forEach((p) => (p.style.strokeDashoffset = (pipeLen * (1 - pp)).toFixed(2)));
        const tAt = (f) => pd0 + pdd * (1 - Math.cbrt(1 - f)); // when the pipe front reaches fraction f
        cpls.forEach((c) => {
          const sp = spring(t - tAt(+c.dataset.f), 3.4, 0.45);
          c.style.transformBox = 'fill-box';
          c.style.transformOrigin = 'center';
          c.style.transform = `scale(${Math.max(0, sp).toFixed(4)})`;
        });
        const vs = spring(t - tAt(+valve.dataset.f), 2.6, 0.45);
        valve.setAttribute('transform', `translate(292 62) scale(${Math.max(0, vs).toFixed(4)})`);
        const dsp = spring(t - T.img - 0.55, 2.4, 0.4);
        drop.setAttribute('transform', `translate(0 ${((1 - dsp) * 40).toFixed(2)}) scale(${Math.max(0, dsp).toFixed(4)})`);
        [heroChip, heroBadge].forEach((n, i) => {
          const sp = spring(t - T.img - 0.62 - i * 0.12, 2.8, 0.5);
          n.style.opacity = clamp((t - T.img - 0.62 - i * 0.12) / 0.08);
          n.style.transform = `translateY(${px((1 - sp) * 26)}) scale(${(0.8 + 0.2 * sp).toFixed(4)})`;
        });
      }
      wheels.forEach((wh) => wh.setAttribute('transform', `rotate(${((t - T.img) * 140).toFixed(2)})`));
      // --- phone: incoming call banner
      const cIn = spring(t - RING.t0 + 0.04, 2.4, 0.62);
      const cOut = E.inBack(prog(t, b(22.25) - 0.05, 0.26));
      call.style.transform = `translateY(${px(-150 * (1 - cIn) - 160 * cOut)})`;
      show(call, t > RING.t0 - 0.08 && cOut < 1);
    }
    return {
      build, render, dev, url, h1, book, siteM,
      get geom() { return G; },
    };
  })();
  const CLICK = b(18);

  // ============================================ S3 · the build (b12 → b20)
  const S3 = (() => {
    const bg = layer(30, 's3');
    const grid = el('div', 's3-grid', bg);
    const bandL = layer(35);
    const band = el('div', 'hazard', bandL);
    const fg = layer(55);
    const head = el('div', 'headline', fg);
    const headW = words(head, CFG.build);
    head.style.color = INK;
    const svgNS = 'http://www.w3.org/2000/svg';
    const leaders = document.createElementNS(svgNS, 'svg');
    leaders.setAttribute('class', 'leaders');
    leaders.setAttribute('width', W);
    leaders.setAttribute('height', H);
    fg.appendChild(leaders);
    const chips = CFG.chips.map((c, i) => {
      const n = el('div', 'chip', fg, `<span class="ci">${ico(c.icon)}</span><span>${esc(c.text)}</span>`);
      const line = document.createElementNS(svgNS, 'line');
      const dot = document.createElementNS(svgNS, 'circle');
      line.setAttribute('stroke', rgba(INK, 0.55));
      line.setAttribute('stroke-width', 2.5);
      line.setAttribute('stroke-dasharray', '7 7');
      dot.setAttribute('r', 9);
      dot.setAttribute('fill', ORANGE);
      dot.setAttribute('stroke', '#fff');
      dot.setAttribute('stroke-width', 4);
      leaders.appendChild(line);
      leaders.appendChild(dot);
      return { ...c, n, line, dot, i, t0: b(14.25 + i) };
    });
    const cursor = el('div', 'cursor', fg, `<svg class="ic" viewBox="0 0 24 24" fill="${INK}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round">${ICONS['mouse-pointer-2']}</svg>`);
    const ripples = [el('div', 'ripple', fg), el('div', 'ripple', fg)];

    // tapes
    const tapeL = layer(60);
    const tapeText = () => {
      let s = '';
      for (let i = 0; i < 14; i++) s += `<span>${esc(CFG.tape)}</span><i class="sep"></i>`;
      return `<div class="tape-strip">${s}</div>`;
    };
    const tapes = [
      { n: el('div', 'tape tape-a', tapeL, tapeText()), ang: P ? -11 : -7.5, y: P ? 0.43 : 0.43, dir: 1, t0: b(12) - 0.02 },
      { n: el('div', 'tape tape-b', tapeL, tapeText()), ang: P ? 9 : 6, y: P ? 0.56 : 0.6, dir: -1, t0: b(12) + 0.07 },
    ];
    const tapeH = P ? 124 : 120;
    tapes.forEach((tp) => {
      tp.n.style.height = tapeH + 'px';
      tp.strip = tp.n.firstElementChild;
      tp.strip.style.fontSize = (P ? 58 : 58) + 'px';
    });

    function build() {
      if (P) {
        fitWidth(head, W - 120, 138);
        Object.assign(head.style, { left: px((W - head.offsetWidth) / 2), top: '300px' });
      } else {
        fitWidth(head, 1150, 112);
        Object.assign(head.style, { left: '112px', top: '98px' });
      }
      chips.forEach((c) => { c.w = c.n.offsetWidth; c.h = c.n.offsetHeight; });
    }

    // where each chip sits (stage px) and the point its leader line aims at
    function chipPlace(c, dr) {
      if (P) {
        const col = c.i % 2, row = Math.floor(c.i / 2);
        const x = W / 2 + (col ? 18 : -18) - (col ? 0 : c.w);
        const y = dr.b + 70 + row * (c.h + 26);
        return { x, y, tx: null };
      }
      const box = (n) => rectOf(n);
      if (c.target === 'url') {
        const r = box(DEV.url);
        return { x: r.r + 150, y: dr.y - c.h - 26, tx: r.r - 6, ty: r.cy, ax: r.r + 150, ay: dr.y - 26 - c.h / 2 };
      }
      if (c.target === 'h1') {
        const r = box(DEV.h1);
        const ty = r.y + r.h * 0.27;
        return { x: 96, y: ty - c.h / 2, tx: r.x - 16, ty };
      }
      if (c.target === 'book') {
        const r = box(DEV.book);
        return { x: 96, y: r.cy - c.h / 2 + 60, tx: r.x - 14, ty: r.cy };
      }
      return { x: dr.r - c.w + 70, y: dr.b - c.h / 2 + 10, tx: null };
    }

    function render(t) {
      // background + wipe from S2
      const onBg = t >= b(11.4) && t < b(20) + 0.05;
      show(bg, onBg);
      const k = (H / 2) * Math.tan((16 * Math.PI) / 180);
      const bw = P ? 200 : 250;
      const wp = E.inOutCubic(prog(t, b(11.55), b(12) - b(11.55)));
      const xe = lerp(-k - bw - 40, W + k + 40, wp);
      if (onBg) {
        bg.style.clipPath = wp < 1 ? `polygon(-10px -10px, ${px(xe + k)} -10px, ${px(xe - k)} ${H + 10}px, -10px ${H + 10}px)` : 'none';
        grid.style.transform = `translate(${px(-(t - b(12)) * 16)},${px(-(t - b(12)) * 9)})`;
      }
      const onBand = wp > 0 && wp < 1;
      show(bandL, onBand);
      if (onBand) band.style.clipPath = `polygon(${px(xe + k)} 0, ${px(xe + k + bw)} 0, ${px(xe - k + bw)} ${H}px, ${px(xe - k)} ${H}px)`;

      // tapes slam in on the drop, then tear away as the build starts
      const onTape = t >= tapes[0].t0 && t < b(13.6);
      show(tapeL, onTape);
      if (onTape) {
        tapes.forEach((tp, i) => {
          const len = 3400;
          const inP = E.outExpo(prog(t, tp.t0, 0.42));
          const outP = E.inQuart(prog(t, b(13) + i * 0.05, 0.34));
          const along = tp.dir * (-(1 - inP) * 3600 + outP * 3600);
          const a = (tp.ang * Math.PI) / 180;
          const cx = W / 2 + Math.cos(a) * along, cy = H * tp.y + Math.sin(a) * along;
          tp.n.style.transform = `translate(${px(cx)},${px(cy)}) rotate(${tp.ang}deg) translate(${-len / 2}px,${-tapeH / 2}px)`;
          tp.strip.style.transform = `translateX(${px(-((t - tp.t0) * 170 * tp.dir) - 400)})`;
        });
      }

      // headline, chips, cursor
      const onFg = t >= b(13) && t < b(19);
      show(fg, onFg);
      if (!onFg) return;
      rise(t, headW, b(13) + 0.02, b(18.2), { stagger: 0.08 });
      const dr = rectOf(DEV.dev);
      chips.forEach((c) => {
        const inT = t - c.t0;
        const outP = E.inBack(prog(t, b(18.05) + c.i * 0.04, 0.3));
        const vis = inT > 0 && outP < 1;
        show(c.n, vis);
        const pl = vis ? chipPlace(c, dr) : null;
        const hasLine = vis && pl.tx != null;
        c.line.style.display = c.dot.style.display = hasLine ? '' : 'none';
        if (!vis) return;
        const sp = spring(inT, 2.6, 0.5);
        const sc = (0.5 + 0.5 * sp) * (1 - 0.3 * outP);
        c.n.style.opacity = clamp(inT / 0.1) * (1 - outP);
        c.n.style.transform = `translate(${px(pl.x)},${px(pl.y)}) scale(${sc.toFixed(4)})`;
        if (hasLine) {
          const ax = pl.ax != null ? pl.ax : pl.x > pl.tx ? pl.x : pl.x + c.w;
          const ay = pl.ay != null ? pl.ay : pl.y + c.h / 2;
          const lp = E.outCubic(prog(inT, 0.08, 0.3));
          c.line.setAttribute('x1', ax);
          c.line.setAttribute('y1', ay);
          c.line.setAttribute('x2', lerp(ax, pl.tx, lp));
          c.line.setAttribute('y2', lerp(ay, pl.ty, lp));
          c.line.style.opacity = 1 - outP;
          const dp = spring(inT - 0.3, 3, 0.45);
          c.dot.setAttribute('cx', pl.tx);
          c.dot.setAttribute('cy', pl.ty);
          c.dot.setAttribute('r', (9 * Math.max(0, dp)).toFixed(3));
          c.dot.style.opacity = 1 - outP;
        }
      });
      // cursor glides in and clicks "Book online"
      const cOn = t > b(17.3) && t < b(18.7);
      show(cursor, cOn);
      if (cOn) {
        const r = rectOf(DEV.book);
        const tx = r.cx + 8, ty = r.cy + 6;
        const mp = prog(t, b(17.3), b(17.95) - b(17.3));
        const x = lerp(W + 40, tx, E.outCubic(mp));
        const y = lerp(H + 60, ty, E.inOutSine(mp) * 0.4 + E.outQuart(mp) * 0.6);
        const cs = kf(t, [[CLICK - 0.03, 1], [CLICK + 0.04, 0.82, E.outQuad], [CLICK + 0.25, 1, E.outBack]]);
        const tipX = (4.04 / 24) * 58, tipY = (4.69 / 24) * 58;
        cursor.style.transform = `translate(${px(x - tipX)},${px(y - tipY)}) scale(${cs.toFixed(4)})`;
        cursor.style.opacity = 1 - prog(t, b(18.35), 0.2);
      }
      ripples.forEach((rp, i) => {
        const p = prog(t, CLICK + i * 0.09, 0.5);
        const vis = p > 0 && p < 1;
        show(rp, vis);
        if (!vis) return;
        const r = rectOf(DEV.book);
        const R = 20 + E.outCubic(p) * (110 + i * 30);
        rp.style.width = rp.style.height = px(2 * R);
        rp.style.transform = `translate(${px(r.cx + 8 - R)},${px(r.cy + 6 - R)})`;
        rp.style.opacity = (1 - p) * 0.85;
      });
    }
    return { build, render };
  })();

  // ============================================ S4 · the calls (b20 → b28)
  // the phone rings in two vibration bursts (the soundtrack uses the same times)
  const RING = (() => {
    const t0 = b(20.25);
    const bursts = [[b(20.25), b(21)], [b(21.25), b(22)]];
    const env = (t) => {
      let e = 0;
      bursts.forEach(([a, z]) => (e = Math.max(e, clamp((t - a) / 0.04) * (1 - clamp((t - z) / 0.06)))));
      return e;
    };
    return { t0, env, bursts, shake: (t) => Math.sin(t * 2 * Math.PI * 17) * 3.2 * env(t) };
  })();

  const S4 = (() => {
    const bgL = layer(40);
    const circle = el('div', 's4-circle', bgL);
    const head = el('div', 'headline', bgL);
    const headW = words(head, CFG.calls, 'acc-paper');
    head.style.color = INK;
    const fg = layer(58);
    const svgNS = 'http://www.w3.org/2000/svg';
    const rings = document.createElementNS(svgNS, 'svg');
    rings.setAttribute('class', 'rings');
    rings.setAttribute('width', W);
    rings.setAttribute('height', H);
    fg.appendChild(rings);
    const arcs = [];
    [-1, 1].forEach((side) => {
      [0, 1, 2].forEach((i) => {
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', INK);
        p.setAttribute('stroke-width', P ? 11 : 9);
        p.setAttribute('stroke-linecap', 'round');
        rings.appendChild(p);
        arcs.push({ p, side, i });
      });
    });
    const cards = CFG.notifications.map((nf, i) => {
      const n = el('div', 'notif', fg, `<span class="ni" style="background:${nf.color}">${nf.icon === 'star' ? starSvg('#fff', '#fff', 1.5) : ico(nf.icon)}</span><div class="nb"><div class="nt"><b>${esc(nf.title)}</b><span class="now">${esc(CFG.now)}</span></div><p>${esc(nf.body)}</p></div>`);
      return { n, t0: b(22.5 + i) };
    });
    let cardW = 0, cardH = 0;
    const G = DEV.geom;
    const R = Math.hypot(Math.max(G.px, W - G.px), Math.max(G.py, H - G.py)) + 30;
    Object.assign(circle.style, { width: px(2 * R), height: px(2 * R), left: px(G.px - R), top: px(G.py - R) });

    function build() {
      if (P) {
        fitWidth(head, W - 160, 150);
        Object.assign(head.style, { left: '80px', top: '290px' });
      } else {
        fitWidth(head, 700, 128);
        head.style.left = '112px';
        head.style.top = px(H / 2 - head.offsetHeight / 2 - 10);
      }
      cardW = cards[0].n.offsetWidth;
      cardH = cards[0].n.offsetHeight;
    }
    function render(t) {
      const on = t >= b(19.2) && t < b(28) + 0.05;
      show(bgL, on);
      show(fg, on && t > b(20.2));
      if (!on) return;
      circle.style.transform = `scale(${E.inOutCubic(prog(t, b(19.25), b(20) - b(19.25))).toFixed(5)})`;
      rise(t, headW, b(20) + 0.02, Infinity, { stagger: 0.08 });
      // ring arcs beside the phone
      const e = RING.env(t);
      const pr = rectOf(DEV.dev);
      arcs.forEach((a) => {
        const phase = ((t * 5.5 - a.i * 0.33) % 1 + 1) % 1;
        const o = e * clamp(Math.sin(phase * Math.PI) * 1.4);
        const cx = a.side < 0 ? pr.x - 6 : pr.r + 6;
        const cy = pr.y + (P ? 150 : 120);
        const rad = (P ? 34 : 28) + a.i * (P ? 30 : 25);
        const a0 = (-60 * Math.PI) / 180, a1 = (60 * Math.PI) / 180;
        const sx = cx + a.side * Math.cos(a0) * rad, sy = cy + Math.sin(a0) * rad;
        const ex = cx + a.side * Math.cos(a1) * rad, ey = cy + Math.sin(a1) * rad;
        a.p.setAttribute('d', `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${rad} ${rad} 0 0 ${a.side > 0 ? 1 : 0} ${ex.toFixed(2)} ${ey.toFixed(2)}`);
        a.p.style.opacity = o.toFixed(3);
      });
      // notification stack: newest on top, older ones slide down
      const pitch = cardH + (P ? 22 : 18);
      const x0 = P ? (W - cardW) / 2 : G.px - G.pw / 2 - cardW + 170;
      const y0 = P ? 850 : G.py - (4 * cardH + 3 * 18) / 2;
      cards.forEach((c, i) => {
        const tau = t - c.t0;
        show(c.n, tau > 0);
        if (tau <= 0) return;
        const sp = spring(tau, 2.3, 0.6);
        let shift = 0;
        cards.forEach((o, j) => { if (j > i) shift += spring(t - o.t0, 2.2, 0.72); });
        const x = x0 + (1 - sp) * (P ? 0 : 90);
        const y = y0 + shift * pitch - (1 - sp) * 46;
        const fl = Math.sin(t * 2 + i) * 3;
        c.n.style.opacity = clamp(tau / 0.1);
        c.n.style.transform = `translate(${px(x)},${px(y + fl)}) scale(${(0.86 + 0.14 * sp).toFixed(4)})`;
      });
    }
    return { build, render };
  })();

  // ============================================ S5 · end card (b28 → b36)
  const S5 = (() => {
    const root = layer(70, 's5');
    const nBars = P ? 6 : 8;
    const bars = [...Array(nBars)].map((_, i) => {
      const bar = el('div', 's5-bar', root);
      Object.assign(bar.style, { left: px((i * W) / nBars - 1), width: px(W / nBars + 2), transformOrigin: i % 2 ? '50% 100%' : '50% 0%' });
      return bar;
    });
    const content = el('div', 'layer', root);
    const glow = el('div', 's5-glow', content);
    const markSize = P ? 150 : 132;
    const logo = el('div', 'logo', content, `
      <svg class="logo-mark-big" width="${markSize}" height="${markSize}" viewBox="0 0 120 120">
        <rect width="120" height="120" rx="30" fill="${ORANGE}"/>
        <circle class="ld" cx="28" cy="29" r="5.5" fill="${INK}"/><circle class="ld" cx="44" cy="29" r="5.5" fill="${INK}"/><circle class="ld" cx="60" cy="29" r="5.5" fill="${INK}"/>
        <path class="roof" d="M30 87 L60 57 L90 87" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="wordmark">${esc(CFG.brand.name)}</div>`);
    const mark = logo.querySelector('svg');
    const roof = logo.querySelector('.roof');
    const lds = [...logo.querySelectorAll('.ld')];
    const wm = logo.querySelector('.wordmark');
    const tag = el('div', 'tagline', content);
    const tagIn = el('span', 'fit', tag);
    const tagW = words(tagIn, CFG.brand.tagline);
    const cta = el('div', 'cta', content, `<span>${esc(CFG.brand.cta)}</span><span class="arrow">${ico('arrow-right')}</span><i class="shine"></i>`);
    const arrow = cta.querySelector('.arrow');
    const shine = cta.querySelector('.shine');
    const url = CFG.brand.url ? el('div', 'cta-url', content, esc(CFG.brand.url)) : null;
    let mq = '';
    for (let r = 0; r < 3; r++) CFG.marquee.forEach((m) => (mq += `<span>${esc(m)}</span><i class="sep"></i>`));
    const marquee = el('div', 'marquee', content, mq);
    const L = {};

    function build() {
      const wfs = P ? 168 : 150;
      wm.style.fontSize = wfs + 'px';
      const gap = P ? 34 : 30;
      logo.style.gap = gap + 'px';
      L.logoW = logo.offsetWidth;
      L.logoH = logo.offsetHeight;
      L.wmW = wm.offsetWidth;
      L.cy = P ? 720 : 400;
      L.x = (W - L.logoW) / 2;
      roof.style.strokeDasharray = 90;
      fitInline(tag, tagIn, W - (P ? 120 : 200), P ? 96 : 70);
      tag.style.top = px(L.cy + (P ? 150 : 128));
      cta.style.fontSize = (P ? 46 : 36) + 'px';
      cta.style.padding = P ? '34px 54px' : '26px 44px';
      arrow.style.width = arrow.style.height = P ? '50px' : '40px';
      L.ctaW = cta.offsetWidth;
      L.ctaH = cta.offsetHeight;
      L.ctaY = P ? 1210 : 700;
      if (url) {
        url.style.fontSize = (P ? 32 : 26) + 'px';
        url.style.top = px(L.ctaY + L.ctaH + (P ? 40 : 30));
      }
      marquee.style.fontSize = (P ? 40 : 32) + 'px';
      L.mqW = marquee.scrollWidth / 3;
      L.mqY = P ? H - 190 : H - 92;
      const gs = P ? 1300 : 1250;
      Object.assign(glow.style, { width: px(gs), height: px(gs), left: px(W / 2 - gs / 2), top: px(L.cy - gs / 2 + 40) });
    }
    function render(t) {
      const on = t >= b(27) - 0.05;
      show(root, on);
      if (!on) return;
      const tb0 = b(27) - 0.02;
      bars.forEach((bar, i) => {
        const p = E.inOutCubic(prog(t, tb0 + i * 0.03, 0.26));
        bar.style.transform = `scaleY(${p.toFixed(5)})`;
      });
      const full = t >= b(28) - 0.01;
      root.style.background = full ? INK : 'transparent';
      bars.forEach((bar) => show(bar, !full));
      show(content, t >= b(28) - 0.05);
      if (t < b(28) - 0.05) return;

      const t0 = b(28);
      // logo mark springs in at centre, then slides left as the wordmark wipes on
      const sp = spring(t - t0, 2.2, 0.5);
      const slide = E.inOutQuart(prog(t, t0 + 0.42, 0.55));
      const bump = t > b(34) ? Math.sin(Math.min(1, (t - b(34)) / 0.3) * Math.PI) * 0.05 : 0;
      const centreX = (W - markSize) / 2;
      const mx = lerp(centreX - L.x, 0, slide);
      mark.style.transform = `translateX(${px(mx)}) scale(${(Math.max(0, sp) * (1 + bump)).toFixed(4)}) rotate(${((1 - sp) * -120).toFixed(2)}deg)`;
      roof.style.strokeDashoffset = (90 * (1 - E.outCubic(prog(t, t0 + 0.12, 0.4)))).toFixed(2);
      lds.forEach((d, i) => {
        const s = spring(t - t0 - 0.2 - i * 0.05, 3.2, 0.45);
        d.style.transformBox = 'fill-box';
        d.style.transformOrigin = 'center';
        d.style.transform = `scale(${Math.max(0, s).toFixed(4)})`;
      });
      const wp = E.outExpo(prog(t, t0 + 0.8, 0.7)); // starts once the mark has almost cleared the way
      wm.style.clipPath = `inset(-20% ${((1 - wp) * 100).toFixed(2)}% -20% 0)`;
      wm.style.transform = `translateX(${px((1 - wp) * -60)}) scale(${1 + bump * 0.6})`;
      logo.style.transform = `translate(${px(L.x)},${px(L.cy - L.logoH / 2)})`;
      // glow pulses with the beat
      const gp = E.outCubic(prog(t, t0, 0.8));
      glow.style.opacity = (gp * (0.32 + 0.14 * beatPulse(t, t0, 6) + (t > b(34) ? 0.25 * Math.exp(-(t - b(34)) * 3) : 0))).toFixed(4);
      glow.style.transform = `scale(${(0.6 + 0.4 * gp).toFixed(4)})`;
      // tagline + CTA
      rise(t, tagW, b(30), Infinity, { stagger: 0.06 });
      const cp = spring(t - b(31), 2.4, 0.5);
      const nudge = t > b(32) ? (1 - E.outCubic(clamp(((t - b(32)) % B) / 0.32))) * 9 : 0;
      arrow.style.transform = `translateX(${px(nudge)})`;
      cta.style.opacity = clamp((t - b(31)) / 0.1);
      cta.style.transform = `translate(${px((W - L.ctaW) / 2)},${px(L.ctaY)}) scale(${(0.5 + 0.5 * Math.max(0, cp)).toFixed(4)})`;
      const sh = Math.max(prog(t, b(32.2), 0.55), 0) * (t < b(34.2) ? 1 : 0) + (t >= b(34.2) ? prog(t, b(34.2), 0.55) : 0);
      shine.style.left = `${(-40 + 180 * sh).toFixed(2)}%`;
      shine.style.opacity = sh > 0 && sh < 1 ? 1 : 0;
      if (url) {
        url.style.opacity = E.outCubic(prog(t, b(31.8), 0.4));
        url.style.transform = `translateY(${px((1 - E.outCubic(prog(t, b(31.8), 0.4))) * 16)})`;
      }
      // ticker of trades
      const mo = E.outCubic(prog(t, b(30), 0.8));
      marquee.style.opacity = mo;
      marquee.style.transform = `translate(${px(-((t - t0) * 75) % L.mqW - 40)},${px(L.mqY - marquee.offsetHeight / 2)})`;
    }
    return { build, render };
  })();

  // ============================================================== main
  // DEV renders before S3/S4: they read the device's on-screen position to place chips, cursor and rings
  const scenes = [S1, S2, DEV, S3, S4, S5];
  let built = false;
  function seek(t) {
    t = clamp(t, 0, DUR - 1e-6);
    scenes.forEach((s) => s.render(t));
  }
  // the fastest moves; the renderer spends extra motion-blur sub-frames on these time ranges
  const BLUR = [
    [b(1) - 0.02, b(1) + 0.24], [b(2) - 0.02, b(2) + 0.24], [b(3) - 0.02, b(3) + 0.24], // colour wipes
    [b(4) - 0.24, b(4) + 0.06], // zoom through the full stop
    [b(11.5), b(12) + 0.34], // hazard wipe + tape slams
    [b(13) - 0.02, b(13) + 0.45], // tape torn away, browser drops in
    [b(19.2), b(20) + 0.05], // circle wipe to orange
    [b(27) - 0.05, b(28) + 0.05], // bars
    [b(28), b(28) + 0.35], // logo spin
  ];
  // poster: the settled end card between beats, after the CTA shine and before the final hit
  window.__meta = { W, H, DUR, BPM: 128, lang: CFG.lang, format: P ? 'portrait' : 'landscape', blur: BLUR, poster: b(33) + 0.4 };
  window.__seek = (t) => { if (built) seek(t); };
  window.__ready = Promise.all([
    document.fonts.load('900 100px Archivo'),
    document.fonts.load('600 20px Inter'),
    document.fonts.load('700 20px "JetBrains Mono"'),
  ]).then(() => document.fonts.ready).then(() => {
    scenes.forEach((s) => s.build && s.build());
    built = true;
    seek(q.has('t') ? parseFloat(q.get('t')) : 0);
    if (q.has('preview')) startPreview();
    return true;
  });

  // ----------------------------------------------------- preview player
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
