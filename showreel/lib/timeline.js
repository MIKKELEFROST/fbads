// Master timeline: tempo, scene windows, hit points, palette.
// Everything in the reel is a pure function of time. 128 BPM → 8 bars = exactly 15.000s.
(function () {
  const R = (window.R = window.R || {});

  R.W = 1920;
  R.H = 1080;
  R.FPS = 60;
  R.DURATION = 15;
  R.BPM = 128;
  R.BEAT = 60 / R.BPM; // 0.46875s
  R.BAR = R.BEAT * 4; // 1.875s

  // Palette. Two neutrals, one hero accent, two support accents. Use sparingly.
  R.P = {
    ink: '#0B0B0E', // near-black background
    ink2: '#16161C', // raised surface on ink
    bone: '#F2EDE4', // warm off-white
    bone2: '#D9D2C5', // muted bone
    signal: '#FF4F1A', // hero accent (orange-red)
    ultra: '#3326FF', // ultramarine
    lime: '#D4FF3A', // acid lime — rare pop only
    gray: '#8A857C', // warm gray for secondary text
  };

  // Scene windows [start, end). Boundaries sit on the beat grid.
  R.SCENES = [
    { id: 's1', name: 'IGNITION', start: 0, end: R.BAR }, // 0.000–1.875
    { id: 's2', name: 'KINETIC TYPE', start: R.BAR, end: R.BAR * 2.5 }, // 1.875–4.6875
    { id: 's3', name: 'SHAPE LANGUAGE', start: R.BAR * 2.5, end: R.BAR * 4 }, // 4.6875–7.5
    { id: 's4', name: 'DEPTH', start: R.BAR * 4, end: R.BAR * 5 }, // 7.5–9.375
    { id: 's5', name: 'LIQUID', start: R.BAR * 5, end: R.BAR * 6 }, // 9.375–11.25
    { id: 's6', name: 'MULTIVERSE', start: R.BAR * 6, end: R.BAR * 7 }, // 11.25–13.125
    { id: 's7', name: 'LOCKUP', start: R.BAR * 7, end: R.BAR * 8 }, // 13.125–15.0
  ];

  // Hit points: drive global camera shake + chromatic aberration, and the soundtrack's accents.
  // kind is a hint for the sound designer.
  const b = (n) => +(n * R.BEAT).toFixed(6);
  R.HITS = [
    { t: b(1), s: 0.12, kind: 'bounce' },
    { t: b(2), s: 0.1, kind: 'bounce' },
    { t: b(3), s: 0.08, kind: 'bounce' },
    { t: b(4), s: 1.0, kind: 'drop' }, // 1.875 DROP
    { t: b(5), s: 0.45, kind: 'slam' },
    { t: b(6), s: 0.45, kind: 'slam' },
    { t: b(7), s: 0.45, kind: 'slam' },
    { t: b(8), s: 0.55, kind: 'slam' },
    { t: b(9), s: 0.45, kind: 'slam' },
    { t: b(10), s: 0.6, kind: 'portal' }, // 4.6875 zoom-through arrival
    { t: b(11), s: 0.25, kind: 'morph' },
    { t: b(12), s: 0.25, kind: 'morph' },
    { t: b(13), s: 0.25, kind: 'morph' },
    { t: b(14), s: 0.25, kind: 'morph' },
    { t: b(15), s: 0.3, kind: 'morph' },
    { t: b(16), s: 0.8, kind: 'burst' }, // 7.5 depth
    { t: b(17), s: 0.25, kind: 'morph' },
    { t: b(18), s: 0.25, kind: 'morph' },
    { t: b(19), s: 0.25, kind: 'morph' },
    { t: b(20), s: 0.7, kind: 'splash' }, // 9.375 liquid
    { t: b(22), s: 0.3, kind: 'wobble' },
    { t: b(24), s: 0.6, kind: 'split' }, // 11.25 multiverse
    { t: b(25), s: 0.5, kind: 'split' },
    { t: b(26), s: 0.5, kind: 'split' },
    { t: b(27), s: 0.5, kind: 'split' },
    { t: b(28), s: 1.0, kind: 'final' }, // 13.125
    { t: b(31), s: 0.4, kind: 'sting' }, // 14.53125
  ];
})();
