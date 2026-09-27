// Render engine: scene registry, frame compositor, motion blur, offscreen layers,
// fragment-shader helper, global camera shake, and the final post-process pass.
(function () {
  const R = (window.R = window.R || {});
  const { W, H } = R;
  const { clamp } = R.math;

  // ───────────────────────── registry ─────────────────────────
  R.registry = {};
  // R.scene({ id, render(ctx, lt, api), shake?: number (default 1), init?: async () => {} })
  // Timing comes from R.SCENES (start/end), so scene files only provide behaviour.
  R.scene = (def) => {
    const meta = R.SCENES.find((s) => s.id === def.id);
    if (!meta) throw new Error('unknown scene id ' + def.id);
    R.registry[def.id] = Object.assign({ shake: 1 }, meta, def);
  };

  // ───────────────────────── canvases ─────────────────────────
  const mk = (w = W, h = H) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const sceneCanvas = mk(), sceneCtx = sceneCanvas.getContext('2d');
  const accumCanvas = mk(), accumCtx = accumCanvas.getContext('2d');
  const compCanvas = mk(), compCtx = compCanvas.getContext('2d');
  R._canvases = { sceneCanvas, accumCanvas, compCanvas };

  // Offscreen 2D layers, cached by key. Cleared on every request.
  const layers = new Map();
  R.layer = (key, w = W, h = H) => {
    const k = key + '@' + w + 'x' + h;
    let L = layers.get(k);
    if (!L) {
      const canvas = mk(w, h);
      L = { canvas, ctx: canvas.getContext('2d') };
      layers.set(k, L);
    }
    resetCtx(L.ctx);
    L.ctx.clearRect(0, 0, w, h);
    return L;
  };

  function resetCtx(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  R.resetCtx = resetCtx;

  // ───────────────────────── WebGL shader helper ─────────────────────────
  const GLSL_HEADER = `#version 300 es
precision highp float;
in vec2 vUv;            // 0..1, (0,0) bottom-left
out vec4 fragColor;
uniform vec2 uRes;      // output size in px
uniform float uTime;    // seconds (whatever the caller passes as uTime)
#define PI 3.14159265359
#define TAU 6.28318530718
float hash11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x), mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),u.x), u.y); }
vec3 mod289(vec3 x){ return x - floor(x*(1./289.))*289.; }
vec4 mod289(vec4 x){ return x - floor(x*(1./289.))*289.; }
vec4 permute(vec4 x){ return mod289(((x*34.)+1.)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - .85373472095314*r; }
float snoise(vec3 v){ const vec2 C = vec2(1./6., 1./3.); const vec4 D = vec4(0.,.5,1.,2.);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1. - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy; i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0., i1.z, i2.z, 1.)) + i.y + vec4(0., i1.y, i2.y, 1.)) + i.x + vec4(0., i1.x, i2.x, 1.));
  float n_ = .142857142857; vec3 ns = n_ * D.wyz - D.xzx; vec4 j = p - 49. * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7. * x_); vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1. - abs(x) - abs(y); vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.+1.; vec4 s1 = floor(b1)*2.+1.; vec4 sh = -step(h, vec4(0.));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y); vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m = max(.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.); m = m*m;
  return 42. * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3))); }
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*snoise(p); p*=2.02; a*=.5; } return s; }
float smin(float a, float b, float k){ float h = clamp(.5+.5*(b-a)/k, 0., 1.); return mix(b, a, h) - k*h*(1.-h); }
mat2 rot2(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
`;
  const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*.5+.5; gl_Position = vec4(aPos,0.,1.); }`;

  class GLTarget {
    constructor(w, h) {
      this.canvas = mk(w, h);
      const gl = (this.gl = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: true, antialias: false, alpha: true }));
      if (!gl) throw new Error('WebGL2 unavailable');
      this.programs = new Map();
      this.textures = new Map();
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.buf = buf;
    }
    program(src) {
      let p = this.programs.get(src);
      if (p) return p;
      const gl = this.gl;
      const sh = (type, s) => {
        const o = gl.createShader(type);
        gl.shaderSource(o, s);
        gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error('GLSL compile error:\n' + gl.getShaderInfoLog(o));
        return o;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, GLSL_HEADER + src));
      gl.bindAttribLocation(prog, 0, 'aPos');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('GLSL link error:\n' + gl.getProgramInfoLog(prog));
      p = { prog, locs: new Map() };
      this.programs.set(src, p);
      return p;
    }
    run(src, uniforms = {}) {
      const gl = this.gl;
      const p = this.program(src);
      gl.useProgram(p.prog);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const loc = (n) => {
        if (!p.locs.has(n)) p.locs.set(n, gl.getUniformLocation(p.prog, n));
        return p.locs.get(n);
      };
      const all = Object.assign({ uRes: [this.canvas.width, this.canvas.height] }, uniforms);
      let unit = 0;
      for (const [name, v] of Object.entries(all)) {
        const l = loc(name);
        if (l === null) continue;
        if (typeof v === 'number') gl.uniform1f(l, v);
        else if (Array.isArray(v) || v instanceof Float32Array) {
          if (v.length === 2) gl.uniform2fv(l, v);
          else if (v.length === 3) gl.uniform3fv(l, v);
          else if (v.length === 4) gl.uniform4fv(l, v);
          else gl.uniform1fv(l, v); // float arrays: declare `uniform float name[N];`
        } else if (v && (v instanceof HTMLCanvasElement || v.canvas instanceof HTMLCanvasElement)) {
          const src = v instanceof HTMLCanvasElement ? v : v.canvas;
          let tex = this.textures.get(unit);
          if (!tex) {
            tex = gl.createTexture();
            this.textures.set(unit, tex);
          }
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.uniform1i(l, unit);
          unit++;
        }
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return this.canvas;
    }
  }
  const glTargets = new Map();
  // R.shader(fragSrc, uniforms, { w, h }) → canvas with the rendered result (premultiplied alpha).
  // fragSrc is appended to GLSL_HEADER (see above: vUv, fragColor, uRes, uTime, noise helpers are predeclared).
  // Canvas / {canvas} uniforms become sampler2D textures (flipped so vUv samples upright).
  R.shader = (src, uniforms = {}, { w = W, h = H } = {}) => {
    w = Math.max(8, Math.round(w));
    h = Math.max(8, Math.round(h));
    const k = w + 'x' + h;
    let T = glTargets.get(k);
    if (!T) {
      T = new GLTarget(w, h);
      glTargets.set(k, T);
    }
    return T.run(src, uniforms);
  };

  // ───────────────────────── impact / shake ─────────────────────────
  // Sum of decaying hit envelopes at time t (0 … ~1.2).
  R.impact = (t, decay = 9) => {
    let s = 0;
    for (const h of R.HITS) {
      const d = t - h.t;
      if (d >= 0 && d < 1.2) s += h.s * Math.exp(-d * decay);
    }
    return s;
  };
  function shakeOffset(t) {
    const a = R.impact(t, 11);
    const amp = a * 14;
    return [R.noise2(t * 38, 3.1) * amp, R.noise2(7.7, t * 38) * amp, R.noise2(t * 21, 19.3) * a * 0.006];
  }

  // ───────────────────────── scene rendering ─────────────────────────
  function activeScene(t) {
    for (const s of R.SCENES) if (t >= s.start && t < s.end) return R.registry[s.id];
    return R.registry[R.SCENES[R.SCENES.length - 1].id];
  }
  let postState = null;
  function makeApi(scene, t, detail) {
    return {
      t, // global time
      lt: t - scene.start, // local time
      dur: scene.end - scene.start,
      start: scene.start,
      end: scene.end,
      detail, // 1 at full frame; <1 when rendered as a small panel (use to thin particle counts)
      W, H,
      P: R.P,
      layer: (name, w, h) => R.layer(scene.id + ':' + name + ':' + depth, w, h),
      shader: (src, u, o = {}) => R.shader(src, u, { w: (o.w || W) * (o.scale || 1) * Math.min(1, detail * 1.25), h: (o.h || H) * (o.scale || 1) * Math.min(1, detail * 1.25) }),
      post: postState, // scenes may set post.ca / post.glitch / post.flash / post.grain / post.vignette / post.bloom
    };
  }
  let depth = 0;
  // Render scene `id` at global time t into ctx with its 1920×1080 frame mapped to (x, y, w, h).
  // Used by the multiverse scene to show other scenes inside panels.
  R.renderScene = (id, t, ctx, x = 0, y = 0, w = W, h = H) => {
    const scene = R.registry[id];
    if (!scene) return;
    depth++;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x, y);
    ctx.scale(w / W, h / H);
    const detail = (w / W) * (depth > 1 ? 1 : 1);
    try {
      scene.render(ctx, t - scene.start, makeApi(scene, t, detail));
    } finally {
      ctx.restore();
      depth--;
    }
  };

  function renderAt(ctx, t) {
    resetCtx(ctx);
    ctx.fillStyle = R.P.ink;
    ctx.fillRect(0, 0, W, H);
    const scene = activeScene(t);
    if (!scene) return;
    const [sx, sy, sr] = shakeOffset(t);
    const k = scene.shake ?? 1;
    ctx.save();
    ctx.translate(W / 2 + sx * k, H / 2 + sy * k);
    ctx.rotate(sr * k);
    ctx.translate(-W / 2, -H / 2);
    ctx.save();
    try {
      scene.render(ctx, t - scene.start, makeApi(scene, t, 1));
    } catch (e) {
      console.error('scene ' + scene.id + ' @' + t.toFixed(3) + ': ' + (e && e.stack));
      R.errors.push({ scene: scene.id, t, msg: String(e && e.stack) });
    }
    ctx.restore();
    ctx.restore();
    resetCtx(ctx);
  }
  R.errors = [];

  // ───────────────────────── post-process ─────────────────────────
  const POST = `
uniform sampler2D uTex;
uniform float uCA, uGrain, uVig, uGlitch, uFlash, uSeed, uBloom;
vec3 tap(vec2 uv){ return texture(uTex, clamp(uv, vec2(0.), vec2(1.))).rgb; }
void main(){
  vec2 uv = vUv;
  // glitch: horizontal slice displacement + block offsets
  if (uGlitch > 0.001) {
    float row = floor(uv.y * 48.);
    float r = hash21(vec2(row, floor(uSeed * 60.)));
    if (r < uGlitch * .55) uv.x += (hash21(vec2(row * 1.7, uSeed)) - .5) * .18 * uGlitch;
    vec2 blk = floor(uv * vec2(16., 9.));
    if (hash21(blk + floor(uSeed * 60.)) < uGlitch * .12) uv += (hash22(blk + uSeed) - .5) * .05 * uGlitch;
  }
  vec2 d = uv - .5;
  float ca = .0007 + uCA * .006 + uGlitch * .01;
  vec3 col;
  col.r = tap(uv + d * ca * 1.0).r;
  col.g = tap(uv).g;
  col.b = tap(uv - d * ca * 1.0).b;
  if (uBloom > .001) {
    vec3 b = vec3(0.);
    float tot = 0.;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 2.39996;
      float rr = sqrt(float(i) + .5) / sqrt(12.) * .028;
      vec2 o = vec2(cos(a), sin(a)) * rr * vec2(uRes.y / uRes.x, 1.);
      vec3 s = tap(uv + o);
      b += max(s - .55, 0.);
      tot += 1.;
    }
    col += b / tot * uBloom * 2.2;
  }
  float v = smoothstep(1.05, .25, length(d * vec2(1., .85)) * 1.25);
  col *= mix(1., v, uVig);
  float g = hash21(vUv * uRes + fract(uSeed * 13.17) * 1000.) - .5;
  col += g * uGrain * (1. - .5 * dot(col, vec3(.333)));
  col = mix(col, vec3(1.), uFlash);
  fragColor = vec4(col, 1.);
}`;
  let outTarget = null;

  // ───────────────────────── frame ─────────────────────────
  // Render the final frame at global time t. Returns the output canvas.
  // opts.samples: motion-blur subframes (1 = off). opts.shutter: fraction of frame interval (0.5 = 180°).
  R.frame = (t, opts = {}) => {
    const S = Math.max(1, opts.samples | 0 || 1);
    const shutter = opts.shutter ?? 0.5;
    const dt = shutter / R.FPS;
    postState = { ca: 0, glitch: 0, flash: 0, grain: 0.03, vignette: 0.55, bloom: 0, hud: 1 };
    for (let i = 0; i < S; i++) {
      const ts = t + (i / S) * dt;
      renderAt(sceneCtx, ts);
      if (S > 1) {
        accumCtx.globalAlpha = 1 / (i + 1);
        accumCtx.drawImage(sceneCanvas, 0, 0);
      }
    }
    accumCtx.globalAlpha = 1;
    const base = S > 1 ? accumCanvas : sceneCanvas;
    resetCtx(compCtx);
    compCtx.drawImage(base, 0, 0);
    if (R.hud) {
      try {
        compCtx.save();
        R.hud(compCtx, t, { post: postState, P: R.P, W, H });
        compCtx.restore();
      } catch (e) {
        R.errors.push({ scene: 'hud', t, msg: String(e && e.stack) });
      }
      resetCtx(compCtx);
    }
    const imp = R.impact(t, 7);
    if (!outTarget) outTarget = new GLTarget(W, H);
    return outTarget.run(POST, {
      uTex: compCanvas,
      uCA: clamp(postState.ca + imp * 0.9, 0, 3),
      uGrain: postState.grain,
      uVig: postState.vignette,
      uGlitch: clamp(postState.glitch, 0, 1),
      uFlash: clamp(postState.flash, 0, 1),
      uBloom: postState.bloom,
      uSeed: t,
    });
  };

  // ───────────────────────── boot ─────────────────────────
  R.ready = (async () => {
    const fonts = [
      ['Unbounded', 'assets/fonts/unbounded-latin-wght-normal.woff2', { weight: '200 900' }],
      ['Inter Tight', 'assets/fonts/inter-tight-latin-wght-normal.woff2', { weight: '100 900' }],
      ['Inter Tight', 'assets/fonts/inter-tight-latin-wght-italic.woff2', { weight: '100 900', style: 'italic' }],
      ['Instrument Serif', 'assets/fonts/instrument-serif-latin-400-normal.woff2', { weight: '400' }],
      ['Instrument Serif', 'assets/fonts/instrument-serif-latin-400-italic.woff2', { weight: '400', style: 'italic' }],
      ['JetBrains Mono', 'assets/fonts/jetbrains-mono-latin-wght-normal.woff2', { weight: '100 800' }],
    ];
    await Promise.all(
      fonts.map(async ([fam, url, desc]) => {
        const f = new FontFace(fam, `url(${url})`, desc);
        await f.load();
        document.fonts.add(f);
      })
    );
    const glyphFonts = {
      unbounded900: 'unbounded-latin-900-normal.woff',
      unbounded700: 'unbounded-latin-700-normal.woff',
      unbounded300: 'unbounded-latin-300-normal.woff',
      inter900: 'inter-tight-latin-900-normal.woff',
      inter600: 'inter-tight-latin-600-normal.woff',
      serifItalic: 'instrument-serif-latin-400-italic.woff',
      mono500: 'jetbrains-mono-latin-500-normal.woff',
    };
    await Promise.all(
      Object.entries(glyphFonts).map(async ([k, f]) => {
        const buf = await (await fetch('assets/fonts/' + f)).arrayBuffer();
        R.glyph.fonts[k] = opentype.parse(buf);
      })
    );
    for (const s of Object.values(R.registry)) if (s.init) await s.init();
    return true;
  })();
})();
