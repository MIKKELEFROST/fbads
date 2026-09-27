/* Tiny deterministic animation toolkit: every value is a pure function of time t (seconds). */
(function () {
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (t, start, dur) => (dur <= 0 ? (t >= start ? 1 : 0) : clamp((t - start) / dur));

  const E = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inQuart: (t) => t * t * t * t,
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inOutQuint: (t) => (t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inOutExpo: (t) =>
      t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
    inBack: (t) => 2.70158 * t * t * t - 1.70158 * t * t,
  };

  // value between `from` and `to` for the window [start, start+dur]
  const tw = (t, start, dur, from, to, ease = E.outCubic) => lerp(from, to, ease(prog(t, start, dur)));

  // Damped spring step response (0 -> 1 with overshoot). tau = seconds since release.
  function spring(tau, freq = 3, damping = 0.5) {
    if (tau <= 0) return 0;
    const w = 2 * Math.PI * freq;
    if (damping < 1) {
      const wd = w * Math.sqrt(1 - damping * damping);
      return 1 - Math.exp(-damping * w * tau) * (Math.cos(wd * tau) + ((damping * w) / wd) * Math.sin(wd * tau));
    }
    return 1 - Math.exp(-w * tau) * (1 + w * tau);
  }

  // Piecewise keyframes: [[t0, v0], [t1, v1, ease], ...] — ease applies to the segment ending at that key.
  function kf(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e = E.inOutCubic] = keys[i];
      const [t0, v0] = keys[i - 1];
      if (t <= t1) return lerp(v0, v1, e((t - t0) / Math.max(1e-6, t1 - t0)));
    }
    return keys[keys.length - 1][1];
  }

  function hexToRgb(h) {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(c1, c2, t) {
    const a = hexToRgb(c1), b = hexToRgb(c2);
    const r = a.map((v, i) => Math.round(lerp(v, b[i], clamp(t))));
    return `rgb(${r[0]},${r[1]},${r[2]})`;
  }
  function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  // Deterministic PRNG so every render of a frame is identical.
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  window.A = { clamp, lerp, prog, E, tw, spring, kf, mix, rgba, rng };
})();
