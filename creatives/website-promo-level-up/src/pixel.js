/*
 * Tiny pixel-art renderer. Everything is drawn into a 135x240 frame buffer with whole-pixel rectangles and
 * shown at 8x (1080x1920) with nearest-neighbour scaling, so every pixel stays a crisp square.
 * The bitmap font below (A-Z, ÆØÅ, a-z, æøå, digits, signs) is drawn for this ad.
 */
(function () {
  const VW = 135, VH = 240;
  const canvas = document.getElementById('screen');
  canvas.width = VW;
  canvas.height = VH;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(VW, VH);
  const buf = new Uint32Array(img.data.buffer);

  // '#rrggbb' -> packed ABGR (the byte order of ImageData on little-endian machines)
  const cache = new Map();
  function C(hex) {
    if (typeof hex === 'number') return hex;
    let v = cache.get(hex);
    if (v === undefined) {
      const n = parseInt(hex.slice(1), 16);
      v = (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
      cache.set(hex, v);
    }
    return v;
  }
  const rgb = (r, g, b) => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  const hexRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  // ordered dithering (4x4 Bayer): the classic way to fake in-between colours and fades on old hardware
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  // camera shake: an offset applied to everything drawn until it is reset
  let ox = 0, oy = 0;
  const offset = (x = 0, y = 0) => { ox = Math.round(x); oy = Math.round(y); };

  function clear(hex) { buf.fill(C(hex)); }
  function pset(x, y, hex) {
    x = Math.round(x) + ox; y = Math.round(y) + oy;
    if (x >= 0 && y >= 0 && x < VW && y < VH) buf[y * VW + x] = C(hex);
  }
  function rect(x, y, w, h, hex) {
    const c = C(hex);
    x = Math.round(x) + ox; y = Math.round(y) + oy;
    const x0 = Math.max(0, x), x1 = Math.min(VW, x + w);
    if (x1 <= x0) return;
    for (let j = Math.max(0, y), j1 = Math.min(VH, y + h); j < j1; j++) buf.fill(c, j * VW + x0, j * VW + x1);
  }
  // rectangle drawn only where the dither pattern is below `level` (0 = nothing, 1 = solid)
  function drect(x, y, w, h, hex, level) {
    if (level <= 0) return;
    if (level >= 1) return rect(x, y, w, h, hex);
    const c = C(hex);
    x = Math.round(x) + ox; y = Math.round(y) + oy;
    for (let j = Math.max(0, y), j1 = Math.min(VH, y + h); j < j1; j++)
      for (let i = Math.max(0, x), i1 = Math.min(VW, x + w); i < i1; i++) if (bayer(i, j) < level) buf[j * VW + i] = c;
  }
  // rows y0..y1 filled with fn(y) -> [r,g,b], quantised to 16 levels per channel with ordered dithering
  function gradient(y0, y1, fn) {
    for (let y = Math.max(0, y0), ye = Math.min(VH, y1); y < ye; y++) {
      const [r, g, b] = fn(y);
      for (let x = 0; x < VW; x++) {
        const t = bayer(x, y);
        const q = (v) => Math.max(0, Math.min(255, Math.floor(v / 17 + t) * 17));
        buf[y * VW + x] = rgb(q(r), q(g), q(b));
      }
    }
  }
  // filled circle / ring, whole pixels
  function disc(cx, cy, r, hex) {
    const c = C(hex);
    cx = Math.round(cx) + ox; cy = Math.round(cy) + oy;
    for (let j = Math.max(0, Math.floor(cy - r)); j <= Math.min(VH - 1, Math.ceil(cy + r)); j++)
      for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(VW - 1, Math.ceil(cx + r)); i++)
        if ((i - cx) * (i - cx) + (j - cy) * (j - cy) <= r * r) buf[j * VW + i] = c;
  }
  // everything outside a circle becomes `hex` (iris transitions)
  function iris(cx, cy, r, hex) {
    const c = C(hex);
    for (let j = 0; j < VH; j++)
      for (let i = 0; i < VW; i++) if ((i - cx) * (i - cx) + (j - cy) * (j - cy) > r * r) buf[j * VW + i] = c;
  }

  // ---------------------------------------------------------------- bitmap font
  // [first row, rows]: a glyph cell is 11 rows high — rows 0-1 hold the ring of Å/å, capitals sit on rows 2-8,
  // descenders use rows 9-10. Widths vary per glyph; one pixel of space follows each glyph.
  const G = {
    A: [2, '.###.|#...#|#...#|#####|#...#|#...#|#...#'],
    B: [2, '####.|#...#|#...#|####.|#...#|#...#|####.'],
    C: [2, '.###.|#...#|#....|#....|#....|#...#|.###.'],
    D: [2, '####.|#...#|#...#|#...#|#...#|#...#|####.'],
    E: [2, '#####|#....|#....|####.|#....|#....|#####'],
    F: [2, '#####|#....|#....|####.|#....|#....|#....'],
    G: [2, '.###.|#...#|#....|#.###|#...#|#...#|.####'],
    H: [2, '#...#|#...#|#...#|#####|#...#|#...#|#...#'],
    I: [2, '###|.#.|.#.|.#.|.#.|.#.|###'],
    J: [2, '..###|...#.|...#.|...#.|#..#.|#..#.|.##..'],
    K: [2, '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#'],
    L: [2, '#....|#....|#....|#....|#....|#....|#####'],
    M: [2, '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#'],
    N: [2, '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#'],
    O: [2, '.###.|#...#|#...#|#...#|#...#|#...#|.###.'],
    P: [2, '####.|#...#|#...#|####.|#....|#....|#....'],
    Q: [2, '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#'],
    R: [2, '####.|#...#|#...#|####.|#.#..|#..#.|#...#'],
    S: [2, '.####|#....|#....|.###.|....#|....#|####.'],
    T: [2, '#####|..#..|..#..|..#..|..#..|..#..|..#..'],
    U: [2, '#...#|#...#|#...#|#...#|#...#|#...#|.###.'],
    V: [2, '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..'],
    W: [2, '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.'],
    X: [2, '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#'],
    Y: [2, '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..'],
    Z: [2, '#####|....#|...#.|..#..|.#...|#....|#####'],
    'Æ': [2, '.#####|#..#..|#..#..|######|#..#..|#..#..|#..###'],
    'Ø': [2, '.###.|#..##|#.#.#|#.#.#|#.#.#|##..#|.###.'],
    'Å': [0, '..#..|.#.#.|.###.|#...#|#...#|#####|#...#|#...#|#...#'],
    a: [4, '.###.|....#|.####|#...#|.####'],
    b: [2, '#....|#....|####.|#...#|#...#|#...#|####.'],
    c: [4, '.####|#....|#....|#....|.####'],
    d: [2, '....#|....#|.####|#...#|#...#|#...#|.####'],
    e: [4, '.###.|#...#|#####|#....|.####'],
    f: [2, '..##|.#..|####|.#..|.#..|.#..|.#..'],
    g: [4, '.####|#...#|#...#|#...#|.####|....#|####.'],
    h: [2, '#....|#....|####.|#...#|#...#|#...#|#...#'],
    i: [2, '.#.|...|##.|.#.|.#.|.#.|###'],
    j: [2, '...#|....|..##|...#|...#|...#|...#|#..#|.##.'],
    k: [2, '#...|#...|#..#|#.#.|##..|#.#.|#..#'],
    l: [2, '##.|.#.|.#.|.#.|.#.|.#.|###'],
    m: [4, '##.#.|#.#.#|#.#.#|#.#.#|#...#'],
    n: [4, '####.|#...#|#...#|#...#|#...#'],
    o: [4, '.###.|#...#|#...#|#...#|.###.'],
    p: [4, '####.|#...#|#...#|#...#|####.|#....|#....'],
    q: [4, '.####|#...#|#...#|#...#|.####|....#|....#'],
    r: [4, '#.##|##..|#...|#...|#...'],
    s: [4, '.####|#....|.###.|....#|####.'],
    t: [2, '.#..|.#..|####|.#..|.#..|.#..|..##'],
    u: [4, '#...#|#...#|#...#|#...#|.####'],
    v: [4, '#...#|#...#|#...#|.#.#.|..#..'],
    w: [4, '#...#|#...#|#.#.#|#.#.#|.#.#.'],
    x: [4, '#...#|.#.#.|..#..|.#.#.|#...#'],
    y: [4, '#...#|#...#|#...#|#...#|.####|....#|.###.'],
    z: [4, '#####|...#.|..#..|.#...|#####'],
    'æ': [4, '.##.##.|...#..#|.######|#..#...|.##.###'],
    'ø': [4, '.###.|#..##|#.#.#|##..#|.###.'],
    'å': [1, '..#..|.#.#.|..#..|.###.|....#|.####|#...#|.####'],
    0: [2, '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.'],
    1: [2, '..#..|.##..|..#..|..#..|..#..|..#..|.###.'],
    2: [2, '.###.|#...#|....#|...#.|..#..|.#...|#####'],
    3: [2, '####.|....#|....#|.###.|....#|....#|####.'],
    4: [2, '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.'],
    5: [2, '#####|#....|####.|....#|....#|#...#|.###.'],
    6: [2, '.###.|#....|#....|####.|#...#|#...#|.###.'],
    7: [2, '#####|....#|...#.|..#..|.#...|.#...|.#...'],
    8: [2, '.###.|#...#|#...#|.###.|#...#|#...#|.###.'],
    9: [2, '.###.|#...#|#...#|.####|....#|....#|.###.'],
    '.': [8, '#'],
    ',': [7, '.#|.#|#.'],
    ':': [4, '#|.|.|#'],
    '!': [2, '#|#|#|#|#|.|#'],
    '?': [2, '.###.|#...#|....#|..##.|..#..|.....|..#..'],
    '-': [5, '####'],
    '+': [3, '..#..|..#..|#####|..#..|..#..'],
    '/': [2, '....#|...#.|...#.|..#..|.#...|.#...|#....'],
    "'": [2, '#|#'],
    '’': [2, '#|#'],
    '(': [2, '.#|#.|#.|#.|#.|#.|.#'],
    ')': [2, '#.|.#|.#|.#|.#|.#|#.'],
    '·': [5, '#'],
    '★': [2, '...#...|..###..|#######|.#####.|..###..|.##.##.|.#...#.'],
    '▶': [2, '#...|##..|###.|####|###.|##..|#...'],
    '✓': [4, '.....##|....##.|##.##..|.###...|..#....'],
  };
  const FONT = {};
  for (const [ch, [top, s]] of Object.entries(G)) {
    const rows = s.split('|');
    FONT[ch] = { top, rows, w: rows[0].length };
  }
  const SPACE = 3;

  function glyph(ch) {
    return FONT[ch] || FONT[ch.toUpperCase()] || null;
  }
  // width in virtual pixels of a string at scale s (markup '*' toggles the highlight colour and takes no space)
  function measure(str, s = 1) {
    let w = 0, n = 0;
    for (const ch of str) {
      if (ch === '*') continue;
      const g = ch === ' ' ? null : glyph(ch);
      w += (g ? g.w : SPACE) + 1;
      n++;
    }
    return n ? (w - 1) * s : 0;
  }
  /*
   * Draws `str` with its capital line at y (so capitals cover y..y+6*s). Options:
   *   s: scale, color: fill (or fn(row, x) for gradients), hi: colour inside *...*, outline, shadow: outline/shadow colour,
   *   align: 'left' | 'center' | 'right' (x is the anchor), count: only the first n visible characters (typewriter)
   */
  function text(str, x, y, o = {}) {
    const s = o.s || 1;
    const w = measure(str, s);
    let cx = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
    const top = Math.round(y) - 2 * s;
    let hi = false, shown = 0;
    const cells = [];
    for (const ch of str) {
      if (ch === '*') { hi = !hi; continue; }
      if (o.count !== undefined && shown >= o.count) break;
      shown++;
      const g = ch === ' ' ? null : glyph(ch);
      if (g) cells.push({ g, x: cx, hi });
      cx += ((g ? g.w : SPACE) + 1) * s;
    }
    const paint = (dx, dy, pad, colorOf) => {
      for (const { g, x: gx, hi: h } of cells)
        g.rows.forEach((row, r) => {
          for (let c = 0; c < row.length; c++)
            if (row[c] === '#') {
              const col = colorOf(h, g.top + r, gx + c * s);
              if (col) rect(gx + c * s + dx - pad, top + (g.top + r) * s + dy - pad, s + 2 * pad, s + 2 * pad, col);
            }
        });
    };
    if (o.shadow) paint(o.shadowOff ?? s, o.shadowOff ?? s, o.outline ? 1 : 0, () => o.shadow);
    if (o.outline) paint(0, 0, 1, () => o.outline);
    paint(0, 0, 0, (h, row, px) => (h && o.hi ? o.hi : typeof o.color === 'function' ? o.color(row, px) : o.color || '#ffffff'));
    return w;
  }

  // ASCII sprite: rows of palette keys, '.' = transparent; optional 1-pixel outline around the opaque shape
  function sprite(rows, pal, x, y, o = {}) {
    const h = rows.length, w = rows[0].length;
    x = Math.round(x); y = Math.round(y);
    const at = (c, r) => (o.flip ? rows[r][w - 1 - c] : rows[r][c]);
    if (o.outline)
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (at(c, r) !== '.') rect(x + c - 1, y + r - 1, 3, 3, o.outline);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const k = at(c, r);
        if (k !== '.') pset(x + c, y + r, o.tint || pal[k]);
      }
  }

  const flush = () => ctx.putImageData(img, 0, 0);

  window.PX = { VW, VH, C, rgb, hexRgb, bayer, offset, clear, pset, rect, drect, gradient, disc, iris, text, measure, sprite, flush };
})();
