/* OMN – Google Ads til håndværkere. 20 sek. motion graphics.
 *
 * Hele filmen er én pauset GSAP-tidslinje. window.seek(t) tegner præcis billedet
 * til tidspunktet t, så render.mjs kan tage et skærmbillede pr. frame.
 * Tidspunkter for speak kommer fra cues.js (tools/build_cues.py).
 * Lydeffekter registreres med sfx() og hentes af render.mjs til lydmixet.
 */
const BUILD = () => {
  const DUR = 20;
  const C = window.CUES;
  const w = (k, i) => C[k].words[i].t;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---------- format: 16:9 (standard) eller 9:16 (index.html?f=916) ----------
  const V = document.documentElement.classList.contains('v');
  const SW = V ? 1080 : 1920, SH = V ? 1920 : 1080;
  const CX = SW / 2, CY = SH / 2;
  const LAY = V ? {
    bar: { x: 90, w: 900 }, acOrigin: '50% -67px',
    serp2: { rotateY: 0, rotateX: 12, transformOrigin: '50% 0%' },
    gadsShrink: { y: -60, scale: 0.6 },
    serp3: { rotateY: 0, rotateX: 10, transformOrigin: '50% 0%' },
    cursor: { from: [1000, 700], to: [783, 53] },
    iris: '50% 58%',
    phone: { rotateY: -10, rotateX: 5, rotateZ: 0, scale: 0.82, transformOrigin: '50% 0%', fromY: -35 },
    logoBarY: 910,
  } : {
    bar: { x: 440, w: 1040 }, acOrigin: '50% -64px',
    serp2: { rotateY: 16, rotateX: 5, transformOrigin: '0% 50%' },
    gadsShrink: { y: -62, scale: 0.42 },
    serp3: { rotateY: -15, rotateX: 4, transformOrigin: '100% 50%' },
    cursor: { from: [900, 560], to: [583, 53] },
    iris: '71% 50%',
    phone: { rotateY: -18, rotateX: 5, rotateZ: 2, scale: 1, transformOrigin: '50% 50%', fromY: -45 },
    logoBarY: 488,
  };
  if (V) {
    // elementer med inline-placering i 16:9-layoutet
    [150, 1600].forEach((y, k) => gsap.set(`#mq${k + 1}`, { top: y }));
    $$('#serp2 .card').forEach((c, k) => gsap.set(c, { top: 136 + 132 * k }));
    $$('#wipe i').forEach((b, k) => gsap.set(b, { top: k * 480, height: 481 }));
    $$('.panel').forEach((p) => $$('.bgw', p).forEach((b, k) => gsap.set(b, { top: [170, 1470][k] })));
    const chart = $('#chart');
    chart.setAttribute('width', 1080); chart.setAttribute('height', 1920); chart.setAttribute('viewBox', '0 0 1080 1920');
    const d = 'M0 1460 C 120 1450, 200 1420, 290 1425 S 450 1380, 540 1360 S 680 1320, 760 1270 S 900 1190, 960 1110 S 1050 960, 1080 900';
    $('#cpath').setAttribute('d', d);
    $('#carea').setAttribute('d', d + ' L1080 1920 L0 1920 Z');
    $('#cgrid').setAttribute('d', 'M0 900H1080M0 1050H1080M0 1200H1080M0 1350H1080M0 1500H1080');
    $('#cclipr').setAttribute('height', 1920);
  }

  // ---------- tekst-split ----------
  const wrap = (txt) => {
    const m = document.createElement('span'); m.className = 'm';
    const i = document.createElement('span'); i.className = 'i'; i.textContent = txt;
    m.appendChild(i); return m;
  };
  $$('[data-c]').forEach((el) => {
    const t = el.textContent; el.textContent = '';
    [...t].forEach((ch) => el.appendChild(ch === ' ' ? document.createTextNode(' ') : wrap(ch)));
  });
  $$('[data-w]').forEach((el) => {
    const t = el.textContent.trim().split(/\s+/); el.textContent = '';
    t.forEach((wd, k) => { if (k) el.appendChild(document.createTextNode(' ')); el.appendChild(wrap(wd)); });
  });
  const I = (sel) => $$(sel + ' .i');

  // ---------- tidslinje-hjælpere ----------
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });
  const hooks = [];   // funktioner af t, kørt efter hver seek (typing, blink, kamera …)
  const SFX = [];
  const sfx = (t, type, o = {}) => SFX.push({ t: +t.toFixed(3), type, ...o });

  const ft = (el, from, to, pos) => tl.fromTo(el, from, { immediateRender: false, ...to }, pos);
  const enter = (el, from, to, pos) => { gsap.set(el, from); return ft(el, from, to, pos); };
  const show = (sel, t) => tl.set(sel, { autoAlpha: 1 }, t);
  const hide = (sel, t) => tl.set(sel, { autoAlpha: 0 }, t);
  const rise = (els, t, o = {}) => ft(els, { yPercent: 115, rotate: o.rot ?? 6 },
    { yPercent: 0, rotate: 0, duration: o.d ?? 0.7, ease: o.ease ?? 'expo.out', stagger: o.st ?? 0.035 }, t);
  const punch = (t, s = 1.04, d = 0.6) => ft('#punch', { scale: s }, { scale: 1, duration: d, ease: 'expo.out' }, t);
  const shake = (t, amp = 12) => { const a = amp * 0.7; return tl.to('#shake', {
    keyframes: [
      { x: a, y: -a * 0.6, duration: 0.035 }, { x: -a * 0.8, y: a * 0.5, duration: 0.035 },
      { x: a * 0.5, y: -a * 0.3, duration: 0.04 }, { x: -a * 0.25, y: a * 0.15, duration: 0.045 },
      { x: 0, y: 0, duration: 0.06 },
    ], ease: 'none',
  }, t); };
  const slam = (el, t, o = {}) => {
    gsap.set(I(el), { yPercent: 0 });
    enter(el, { opacity: 0, scale: o.s ?? 1.55, filter: 'blur(22px)' },
      { opacity: 1, scale: 1, filter: 'blur(0px)', duration: o.d ?? 0.5, ease: 'expo.out' }, t);
  };
  // menneskelig skrivning med deterministisk variation; returnerer anslagstider
  const typeHook = (el, str, t0, per, sound = true) => {
    const ts = []; let acc = t0;
    for (let k = 0; k < str.length; k++) { acc += per * (0.6 + 0.8 * hash(k * 13 + str.length)); ts.push(acc); }
    if (sound) ts.forEach((t, k) => str[k] !== ' ' && sfx(t, 'key', { v: 0.5 + 0.5 * hash(k + 3) }));
    hooks.push((t) => {
      let n = 0; while (n < ts.length && ts[n] <= t) n++;
      if (el._n !== n) { el.textContent = str.slice(0, n); el._n = n; }
    });
    return ts;
  };
  const caretHook = (el, on, off, typedUntil) => hooks.push((t) => {
    let v = 0;
    if (t >= on && t < off) v = t < typedUntil + 0.3 ? 1 : ((t - typedUntil) % 0.9) < 0.5 ? 0 : 1;
    el.style.opacity = v;
  });

  gsap.set('.i', { yPercent: 115 });

  // =========================================================
  // S1 · 0.00–3.60 · "Lige nu søger nogen på Google efter en tømrer i nærheden."
  // =========================================================
  show('#s1', 0);
  ft('#mq1', { x: 0 }, { x: -760, duration: 3.8, ease: 'none' }, 0);
  ft('#mq2', { x: -1000 }, { x: -240, duration: 3.8, ease: 'none' }, 0);
  enter('#mq', { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'power1.out' }, 0.2);

  // fire Google-prikker → søgefeltet
  const dots = $$('#dots i');
  dots.forEach((d, k) => gsap.set(d, { left: CX - 87 + 58 * k - 18, scale: 0 }));
  dots.forEach((d, k) => { ft(d, { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(2.4)' }, 0.06 + k * 0.07); sfx(0.06 + k * 0.07, 'pop', { p: k }); });
  dots.forEach((d, k) => {
    tl.to(d, { y: -36, duration: 0.17, ease: 'power2.out' }, 0.42 + k * 0.07);
    tl.to(d, { y: 0, duration: 0.2, ease: 'power2.in' }, 0.59 + k * 0.07);
  });
  gsap.set('#sbar1', { width: 104, left: CX - 52, opacity: 0, scale: 0.4 });
  gsap.set(['#sbar1 .mag', '#sbar1 .q', '#sd1'], { opacity: 0 });
  tl.to('#sbar1', { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.8)' }, 0.92);
  tl.to('#sbar1', { width: LAY.bar.w, left: LAY.bar.x, duration: 0.62, ease: 'expo.inOut' }, 1.0);
  sfx(0.98, 'whoosh', { d: 0.6, f: 0.8 });
  dots.forEach((d, k) => tl.to(d, { x: LAY.bar.x + LAY.bar.w - CX - 21 - 37 * k, scale: 0.389, duration: 0.6, ease: 'expo.inOut' }, 1.02 + k * 0.03));
  tl.set('#dots', { opacity: 0 }, 1.72);
  tl.set('#sd1', { opacity: 1 }, 1.72);
  tl.to(['#sbar1 .mag', '#sbar1 .q'], { opacity: 1, duration: 0.3, ease: 'power1.out' }, 1.38);

  const t1 = typeHook($('#q1'), 'tømrer i nærheden', 1.45, 0.064);
  caretHook($('#c1'), 1.4, 3.3, t1[t1.length - 1]);

  // overskrift, ord for ord i takt med speaken
  const h1w = I('#h1');
  [0, 1, 2, 3, 4, 5].forEach((k) => rise(h1w[k], w('l1', k) - 0.06, { d: 0.6 }));
  enter('#h1 .ul', { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'expo.inOut' }, w('l1', 5) + 0.12);
  enter('#live', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.5 }, 1.55);
  hooks.push((t) => { $('#live i').style.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(t * 7)); });

  // autoudfyld
  gsap.set('#ac', { transformOrigin: LAY.acOrigin });
  enter('#ac', { clipPath: 'inset(0% 0% 100% 0% round 28px)', y: -14, opacity: 0 },
    { clipPath: 'inset(0% 0% 0% 0% round 28px)', y: 0, opacity: 1, duration: 0.5 }, 2.62);
  enter('#ac .row', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.05 }, 2.66);
  enter('#achl', { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'none' }, 2.88);
  sfx(2.62, 'swish', { f: 1.3 });
  tl.to('#sbar1', { scale: 0.975, duration: 0.08, ease: 'power2.out' }, 3.1);
  tl.to('#sbar1', { scale: 1, duration: 0.25, ease: 'back.out(3)' }, 3.18);
  tl.to('#achl', { backgroundColor: '#D2E3FC', duration: 0.08, ease: 'none' }, 3.1);
  sfx(3.1, 'click');

  // ud: zoom igennem søgefeltet
  tl.to(['#h1', '#live'], { y: -70, opacity: 0, filter: 'blur(12px)', duration: 0.34, ease: 'power2.in' }, 3.26);
  tl.to(['#sbar1', '#ac'], { scale: 1.6, opacity: 0, filter: 'blur(18px)', duration: 0.32, ease: 'power3.in' }, 3.3);
  tl.to('#mq', { opacity: 0, duration: 0.3, ease: 'power1.in' }, 3.28);
  sfx(3.22, 'whoosh', { d: 0.5, f: 1.2 });
  hide('#s1', 3.64);

  // =========================================================
  // S2 · 3.30–5.86 · "Finder de dig – eller din konkurrent?"
  // =========================================================
  show('#s2', 3.3);
  gsap.set('#serp2', { transformPerspective: 1800, ...LAY.serp2 });
  enter('#serp2', { opacity: 0, scale: 0.8, x: -90 }, { opacity: 1, scale: 1, x: 0, duration: 0.85 }, 3.36);
  enter('#serp2 .sbar', { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, 3.4);
  enter('#serp2 .tabs', { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power1.out' }, 3.5);
  enter('#serp2 .card', { y: 90, opacity: 0, rotateX: -28 }, { y: 0, opacity: 1, rotateX: 0, duration: 0.7, stagger: 0.07 }, 3.46);
  [0, 1, 2, 3].forEach((k) => sfx(3.46 + k * 0.07, 'tick', { p: k }));
  hooks.push((t) => gsap.set('#serp2', { y: Math.sin(t * 1.3) * 6 }));

  rise(I('#s2t .a'), w('l2', 0) - 0.05, { st: 0.06 });
  gsap.set('#s2t .b', { transformOrigin: '0% 60%' });
  slam('#s2t .b', w('l2', 2) - 0.07);
  punch(w('l2', 2) - 0.03, 1.045); shake(w('l2', 2), 10); sfx(w('l2', 2) - 0.03, 'hit', { g: 0.8 });
  const you2 = $('#serp2 .you');
  tl.to(you2, { boxShadow: '0 0 0 5px #4285F4, 0 20px 60px rgba(66,133,244,.3)', duration: 0.25, ease: 'power2.out' }, w('l2', 2));
  rise(I('#s2t .c'), w('l2', 3) - 0.05, { st: 0.06 });
  rise(I('#s2t .d'), w('l2', 5) - 0.1, { st: 0.03, d: 0.55, rot: 12 });
  tl.to('#s2t .b', { opacity: 0.22, duration: 0.4, ease: 'power2.out' }, w('l2', 5));
  punch(w('l2', 5) - 0.02, 1.03); shake(w('l2', 5), 8); sfx(w('l2', 5) - 0.03, 'hit', { g: 0.65 });
  tl.to(you2, { y: 260, rotate: 8, opacity: 0.12, duration: 0.7, ease: 'power3.in' }, w('l2', 5) - 0.05);
  sfx(w('l2', 5), 'fall');
  tl.to('#serp2 .card.k', { boxShadow: '0 0 0 4px rgba(234,67,53,.95), 0 20px 60px rgba(234,67,53,.25)', duration: 0.3, stagger: 0.05, ease: 'power2.out' }, w('l2', 5) + 0.05);

  // overgang: fire Google-farvebånd
  const bands = $$('#wipe i');
  gsap.set(bands, { xPercent: -101 });
  tl.to(bands, { xPercent: 0, duration: 0.3, ease: 'power3.in', stagger: 0.045 }, 5.42);
  hide('#s2', 5.86);
  tl.to(bands, { xPercent: 101, duration: 0.4, ease: 'power3.out', stagger: 0.045 }, 5.87);
  sfx(5.4, 'whoosh', { d: 0.9, f: 1.0 });
  sfx(5.4, 'riser', { d: 0.5 });

  // =========================================================
  // S3 · 5.86–10.00 · "Med Google Ads fra O M N står du øverst – præcis når kunden søger."
  // =========================================================
  show('#s3', 5.86);
  rise(I('#gads .t'), w('l3', 1) - 0.08, { st: 0.03, d: 0.65, rot: 10 });
  enter('#gads .bar', { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'expo.inOut' }, w('l3', 2));
  rise(I('#gads .fra'), w('l3', 3) - 0.05);
  const omnL = $$('#gads .omn span');
  [4, 5, 6].forEach((wi, k) => {
    enter(omnL[k], { scale: 0, rotate: -25 }, { scale: 1, rotate: 0, duration: 0.45, ease: 'back.out(2.6)' }, w('l3', wi) - 0.06);
    sfx(w('l3', wi) - 0.05, 'pop', { p: k + 1 });
  });
  gsap.set('#gads', { transformOrigin: '0% 0%' });
  tl.to('#gads', { ...LAY.gadsShrink, duration: 0.45, ease: 'expo.inOut' }, 7.24);

  rise(I('#s3l .star'), w('l3', 7) - 0.07, { st: 0.05 });
  gsap.set('#s3l .ov', { transformOrigin: '0% 55%' });
  slam('#s3l .ov', w('l3', 9) - 0.07, { s: 1.7 });
  punch(w('l3', 9) - 0.03, 1.055); shake(w('l3', 9), 15); sfx(w('l3', 9) - 0.04, 'hit', { g: 1 });
  const capw = I('#s3l .cap');
  [10, 11, 12, 13].forEach((wi, k) => rise(capw[k], w('l3', wi) - 0.05, { d: 0.55 }));
  enter('#s3l .cap .mk', { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: 'expo.inOut' }, w('l3', 13) + 0.04);
  tl.to('#s3l .cap .hi .i', { color: '#fff', duration: 0.25, ease: 'power1.out' }, w('l3', 13) + 0.2);

  gsap.set('#serp3', { transformPerspective: 1800, ...LAY.serp3 });
  enter('#serp3', { opacity: 0, x: 140 }, { opacity: 1, x: 0, duration: 0.9 }, 5.92);
  enter('#serp3 .card', { opacity: 0, y: 70 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.06 }, 5.98);
  hooks.push((t) => gsap.set('#serp3', { y: Math.sin(t * 1.2 + 1) * 7 }));
  gsap.set('#you3 .ring', { opacity: 0 });
  gsap.set('#rank', { scale: 0 });
  const UP = 7.3;
  tl.to('#you3', { y: -408, duration: 0.75, ease: 'expo.inOut' }, UP);
  tl.to('#you3', { scale: 1.07, duration: 0.375, ease: 'power2.out', yoyo: true, repeat: 1 }, UP);
  tl.to(['#k31', '#k32', '#k33'], { y: 136, duration: 0.75, ease: 'expo.inOut', stagger: 0.04 }, UP + 0.05);
  tl.to(['#k31', '#k32', '#k33'], { opacity: 0.5, duration: 0.5, ease: 'power1.out' }, UP + 0.3);
  tl.to('#you3 .ring', { opacity: 1, duration: 0.3, ease: 'power1.out' }, UP + 0.45);
  sfx(UP, 'up');
  tl.to('#rank', { scale: 1, duration: 0.5, ease: 'back.out(2.6)' }, w('l3', 9) - 0.04);
  sfx(w('l3', 9) + 0.05, 'ding');

  // markør klikker "Ring nu"
  gsap.set('#cursor', { x: LAY.cursor.from[0], y: LAY.cursor.from[1], opacity: 0, transformOrigin: '20% 10%' });
  tl.to('#cursor', { opacity: 1, duration: 0.2, ease: 'none' }, 8.5);
  tl.to('#cursor', { x: LAY.cursor.to[0], y: LAY.cursor.to[1], duration: 0.8, ease: 'power3.inOut' }, 8.5);
  const CLICK = 9.36;
  tl.to('#cursor', { scale: 0.8, duration: 0.07, ease: 'power2.out' }, CLICK);
  tl.to('#cursor', { scale: 1, duration: 0.2, ease: 'back.out(3)' }, CLICK + 0.08);
  tl.to('#call', { scale: 0.92, backgroundColor: '#2B8C45', duration: 0.07, ease: 'power2.out' }, CLICK);
  tl.to('#call', { scale: 1, duration: 0.25, ease: 'back.out(3)' }, CLICK + 0.08);
  sfx(CLICK, 'click');
  gsap.set('#ripple', { scale: 0 });
  tl.to('#ripple', { scale: 25, duration: 0.56, ease: 'expo.in' }, CLICK + 0.08);
  sfx(CLICK + 0.1, 'swell', { d: 0.55 });
  hide('#s3', 9.99);

  // =========================================================
  // S4 · 9.99–12.40 · "Tømrer. Maler. Murer. VVS."
  // =========================================================
  show('#s4', 9.99);
  tl.set('#ripple', { opacity: 0 }, 10.0);
  const P = ['#p1', '#p2', '#p3', '#p4'];
  const TT = [C.t1.start, C.t2.start, C.t3.start, C.t4.start];
  const clipFrom = [null, 'inset(0% 0% 0% 100%)', 'inset(100% 0% 0% 0%)', 'inset(0% 100% 0% 0%)'];
  P.forEach((p, k) => {
    const t = TT[k];
    if (k > 0) {
      gsap.set(p, { clipPath: clipFrom[k] });
      tl.to(p, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.3, ease: 'expo.inOut' }, t - 0.3);
      sfx(t - 0.3, 'swish', { f: 0.9 + k * 0.12 });
    }
    rise(I(p + ' .word'), t - 0.13, { st: 0.035, d: 0.5, rot: 14 });
    const paths = $$(p + ' .icon path');
    gsap.set(paths, { strokeDasharray: 1, strokeDashoffset: 1 });
    tl.to(paths, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out', stagger: 0.06 }, t - 0.15);
    enter(p + ' .icon', { scale: 0.6, rotate: -20, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 0.5, ease: 'back.out(2)' }, t - 0.15);
    enter(p + ' .chip', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, t - 0.04);
    const tq = $(p + ' .tq'); typeHook(tq, tq.dataset.text, t + 0.02, 0.02, false);
    const bgw = $$(p + ' .bgw');
    ft(bgw[0], { x: -200 }, { x: -900, duration: 2.8, ease: 'none' }, t - 0.4);
    ft(bgw[1], { x: -1100 }, { x: -400, duration: 2.8, ease: 'none' }, t - 0.4);
    punch(t - 0.03, 1.035, 0.45); shake(t - 0.01, 9);
    sfx(t - 0.03, 'hit', { g: 0.75 });
  });

  // =========================================================
  // S5 · 11.92–15.95 · "Flere opkald. Flere tilbud. Flere opgaver."
  // =========================================================
  show('#s5', 11.92);
  gsap.set('#s5', { clipPath: `circle(0% at ${LAY.iris})` });
  tl.to('#s5', { clipPath: `circle(150% at ${LAY.iris})`, duration: 0.55, ease: 'expo.inOut' }, 11.92);
  sfx(11.9, 'whoosh', { d: 0.6, f: 0.7 });
  hide('#s4', 12.5);
  tl.to('#s5bg', { opacity: 0, duration: 0.5, ease: 'power1.inOut' }, 12.5);

  const cpath = $('#cpath'); const L = cpath.getTotalLength();
  const chead = $('#chead'), chalo = $('#chalo'), crect = $('#cclipr');
  cpath.style.strokeDasharray = L;
  const cease = gsap.parseEase('power2.inOut');
  hooks.push((t) => {
    const p = cease(clamp((t - 12.1) / 3.3, 0, 1));
    cpath.style.strokeDashoffset = L * (1 - p);
    const pt = cpath.getPointAtLength(L * p);
    chead.setAttribute('cx', pt.x); chead.setAttribute('cy', pt.y);
    chalo.setAttribute('cx', pt.x); chalo.setAttribute('cy', pt.y);
    const ph = (t * 1.5) % 1; chalo.setAttribute('r', 14 + ph * 34); chalo.setAttribute('stroke-opacity', (1 - ph) * 0.6);
    crect.setAttribute('width', pt.x);
    chead.style.opacity = p > 0.001 ? 1 : 0; chalo.style.opacity = chead.style.opacity;
  });

  enter('#s5l .lab', { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, 12.15);
  hooks.push((t) => { $('#s5l .lab i').style.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(t * 7)); });
  gsap.set('#flere', { transformOrigin: '0% 70%' });
  rise(I('#flere'), w('f1', 0) - 0.06, { st: 0.04, d: 0.6, rot: 10 });
  gsap.set('#slot .list', { y: 236 });
  tl.to('#slot .list', { y: 0, duration: 0.5, ease: 'expo.out' }, w('f1', 1) - 0.08);
  tl.to('#slot .list', { y: -236, duration: 0.5, ease: 'expo.inOut' }, w('f2', 1) - 0.22);
  tl.to('#slot .list', { y: -472, duration: 0.5, ease: 'expo.inOut' }, w('f3', 1) - 0.22);
  [w('f2', 0), w('f3', 0)].forEach((t) => ft('#flere', { scale: 1.06 }, { scale: 1, duration: 0.5 }, t));
  [w('f1', 1), w('f2', 1), w('f3', 1)].forEach((t) => { punch(t - 0.04, 1.025, 0.5); sfx(t - 0.05, 'hit', { g: 0.5 }); });

  const { fromY, ...phoneT } = LAY.phone;
  gsap.set('#phonewrap', { transformPerspective: 1800, ...phoneT });
  enter('#phonewrap', { y: 180, opacity: 0, rotateY: fromY }, { y: 0, opacity: 1, rotateY: phoneT.rotateY, duration: 0.95 }, 11.98);
  hooks.push((t) => gsap.set('#phone', { y: Math.sin(t * 1.6) * 9 }));
  tl.to('#phone', {
    keyframes: [3, -3, 3, -3, 2.5, -2.5, 2, -2, 0].map((r) => ({ rotate: r, duration: 0.05 })), ease: 'none',
  }, 12.62);
  ['#wv1', '#wv2', '#wv3'].forEach((v, k) => enter(v, { scale: 0.7, opacity: 0.9 }, { scale: 1.9, opacity: 0, duration: 1.0, ease: 'power2.out' }, 12.6 + k * 0.2));
  gsap.set(['#wv1', '#wv2', '#wv3'], { opacity: 0 });
  sfx(12.58, 'ring');

  const N = ['#n1', '#n2', '#n3'], NT = [12.56, 13.56, 14.56];
  N.forEach((n, k) => {
    enter(n, { opacity: 0, y: -50, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.7)' }, NT[k]);
    for (let j = 0; j < k; j++) tl.to(N[j], { y: (k - j) * 124, duration: 0.45, ease: 'expo.out' }, NT[k]);
    if (k) sfx(NT[k], 'notif', { p: k });
  });

  const trades = ['TØMRER', 'MALER', 'MURER', 'VVS', 'ELEKTRIKER', 'TAGDÆKKER', 'SNEDKER', 'GULVLÆGGER', 'KLOAKMESTER', 'ANLÆGSGARTNER', 'GLARMESTER', 'SMED'];
  $('#run').innerHTML = Array(3).fill(trades.map((x) => `<b>${x}</b>&nbsp;&nbsp;•&nbsp;&nbsp;`).join('')).join('');
  gsap.set('#run', { x: 360 });
  enter('#ticker', { y: 90, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, 12.3);
  tl.to(['#hud .bl', '#hud .br'], { opacity: 0, duration: 0.3, ease: 'power1.out' }, 12.1);
  ft('#run', { x: 360 }, { x: -1100, duration: 4, ease: 'none' }, 12.0);

  // ud: alt samles mod midten
  tl.to(['#s5l', '#phonewrap', '#ticker', '#chart'], { scale: (i, el) => gsap.getProperty(el, 'scale') * 0.9, opacity: 0, filter: 'blur(14px)', duration: 0.45, ease: 'power3.in', stagger: 0.03 }, 15.45);
  hide('#s5', 16.0);

  // =========================================================
  // S6 · 15.45–20.00 · "O M N. Online Marketing Nu."
  // =========================================================
  const bars = $$('#bars i');
  const corners = [[-60, -60], [SW + 60, -60], [SW + 60, SH + 60], [-60, SH + 60]];
  bars.forEach((b, k) => gsap.set(b, { left: corners[k][0] - 18, top: corners[k][1] - 18, width: 36, height: 36, borderRadius: 18, visibility: 'hidden' }));
  tl.set(bars, { visibility: 'visible' }, 15.45);
  bars.forEach((b, k) => tl.to(b, { left: CX + (k - 1.5) * 58 - 18, top: CY - 18, duration: 0.5, ease: 'expo.in' }, 15.45 + k * 0.02));
  sfx(15.3, 'riser', { d: 0.65 });
  const IMPACT = 15.98;
  show('#s6', 15.9);
  sfx(IMPACT, 'impact');
  punch(IMPACT, 1.07, 0.9); shake(IMPACT, 16);
  enter('#flash', { opacity: 0 }, { opacity: 0.45, duration: 0.05, ease: 'none' }, IMPACT);
  tl.to('#flash', { opacity: 0, duration: 0.5, ease: 'power2.out' }, IMPACT + 0.05);
  ['#bu1', '#bu2'].forEach((b, k) => enter(b, { scale: 0, opacity: 1 }, { scale: 2.6 + k, opacity: 0, duration: 0.9 + k * 0.2, ease: 'expo.out' }, IMPACT + k * 0.06));

  const BAR_Y = LAY.logoBarY;
  bars.forEach((b, k) => tl.to(b, { left: CX - 221 + 114 * k, top: BAR_Y, width: 100, height: 18, borderRadius: 9, duration: 0.7, ease: 'expo.inOut' }, 16.2 + k * 0.04));
  const logoL = I('#logo');
  [0, 1, 2].forEach((k) => {
    ft(logoL[k], { yPercent: 115, rotate: 8, scale: 1.2 }, { yPercent: 0, rotate: 0, scale: 1, duration: 0.8, ease: 'expo.out' }, w('l6', k) - 0.05);
    if (k) sfx(w('l6', k) - 0.04, 'hit', { g: 0.35 });
  });
  const onw = I('#oname');
  [3, 4, 5].forEach((wi, k) => rise(onw[k], w('l6', wi) - 0.06, { d: 0.7 }));
  const NU = w('l6', 5);
  enter('#tag', { opacity: 0, letterSpacing: '.7em' }, { opacity: 1, letterSpacing: '.3em', duration: 1.1 }, NU + 0.12);
  enter('#sbar6', { opacity: 0, y: 46, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.7 }, NU + 0.28);
  sfx(NU + 0.28, 'swish', { f: 1.1 });
  const t6 = typeHook($('#q6'), 'onlinemarketing.nu', NU + 0.5, 0.033);
  caretHook($('#c6'), NU + 0.35, 20.1, t6[t6.length - 1]);
  gsap.set(logoL, { backgroundPosition: '100% 0%' });
  tl.to(logoL, { backgroundPosition: '0% 0%', duration: 1.0, ease: 'power2.inOut', stagger: 0.07 }, NU + 0.6);
  sfx(NU + 0.6, 'shine');
  bars.forEach((b, k) => {
    tl.to(b, { y: -16, duration: 0.16, ease: 'power2.out' }, 19.45 + k * 0.07);
    tl.to(b, { y: 0, duration: 0.2, ease: 'power2.in' }, 19.61 + k * 0.07);
    sfx(19.45 + k * 0.07, 'pop', { p: k, soft: 1 });
  });

  // =========================================================
  // Globalt: HUD, kamera, baggrund
  // =========================================================
  tl.to('#hud .abs:not(#prog)', { opacity: 0, duration: 0.4, ease: 'power1.in' }, 15.55);
  const scenes = [[0, '01 / SØGNINGEN'], [3.3, '02 / KONKURRENTEN'], [5.86, '03 / GOOGLE ADS'], [9.99, '04 / FAGENE'], [11.92, '05 / RESULTATER'], [15.9, '06 / OMN']];
  const pad = (n) => String(n).padStart(2, '0');
  hooks.push((t) => {
    $('#prog').style.transform = `scaleX(${clamp(t / DUR, 0, 1)})`;
    $('#tc').textContent = `00:${pad(Math.floor(t))}.${pad(Math.floor((t % 1) * 100))}`;
    let s = scenes[0][1]; scenes.forEach(([st, n]) => { if (t >= st) s = n; });
    $('#scn').textContent = s;
    const z = 1 + 0.04 * cease(clamp((t - 16.2) / 3.8, 0, 1));
    gsap.set('#cam', { x: Math.sin(t * 0.7) * 10, y: Math.cos(t * 0.55) * 7, rotate: Math.sin(t * 0.4) * 0.3, scale: z });
    gsap.set('#dotgrid', { x: -((t * 18) % 48), y: -((t * 11) % 48) });
    $$('.blob').forEach((b, k) => gsap.set(b, { x: Math.sin(t * 0.35 + k * 1.7) * 90, y: Math.cos(t * 0.3 + k * 2.1) * 70 }));
  });

  // ripple-centrum: mål "Ring nu"-knappens skærmposition i klik-øjeblikket
  tl.seek(CLICK, true);
  const r = $('#call').getBoundingClientRect();
  gsap.set('#ripple', { left: r.left + r.width / 2, top: r.top + r.height / 2 });
  tl.seek(0, true);

  window.DUR = DUR;
  window.SFX = SFX.sort((a, b) => a.t - b.t);
  window.seek = (t) => { tl.seek(t, true); hooks.forEach((h) => h(t)); };
  window.seek(0);
  window.READY = true;

  // forhåndsvisning i browser: index.html?play eller ?t=7.9
  const q = new URLSearchParams(location.search);
  if (q.has('t')) window.seek(parseFloat(q.get('t')));
  if (q.has('play')) {
    const t0 = performance.now();
    const loop = () => { const t = ((performance.now() - t0) / 1000) % DUR; window.seek(t); requestAnimationFrame(loop); };
    loop();
  }
};

Promise.all([
  document.fonts.load('900 100px "Inter Tight"'),
  document.fonts.load('300 100px "Inter Tight"'),
  document.fonts.load('500 20px "JetBrains Mono"'),
]).then(() => document.fonts.ready).then(BUILD);
