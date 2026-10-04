/* Renderer: åbner index.html i headless Chromium, kalder window.seek(t) for hver
 * frame og gemmer skærmbilleder som PNG.
 *
 *   node tools/render.cjs --out /tmp/frames --fps 60 --workers 4
 *   node tools/render.cjs --out /tmp/stills --stills 1.2,3.9,8.0
 *   node tools/render.cjs --sfx audio/sfx.json      (gem kun lydeffekt-tidspunkter)
 *
 * Kræver playwright (NODE_PATH=$(npm root -g) hvis den er installeret globalt).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const FPS = +(args.fps || 60);
const WORKERS = +(args.workers || 4);
const OUT = args.out ? path.resolve(args.out) : null;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 30000 });
  return page;
}

async function shoot(page, t, file) {
  await page.evaluate((tt) => window.seek(tt), t);
  await page.screenshot({ path: file, type: 'png', animations: 'allow' });
}

(async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const launch = () => chromium.launch({ args: ['--disable-gpu-vsync', '--font-render-hinting=none'] });

  if (args.sfx) {
    const b = await launch(); const p = await openPage(b, url);
    const sfx = await p.evaluate(() => window.SFX);
    fs.writeFileSync(path.resolve(args.sfx), JSON.stringify(sfx, null, 1));
    console.log(`wrote ${sfx.length} sfx events`);
    await b.close();
  }

  if (OUT) fs.mkdirSync(OUT, { recursive: true });

  if (args.stills && OUT) {
    const b = await launch(); const p = await openPage(b, url);
    for (const t of String(args.stills).split(',').map(Number)) {
      await shoot(p, t, path.join(OUT, `still_${t.toFixed(2)}.png`));
      console.log('still', t);
    }
    await b.close();
  } else if (OUT) {
    const dur = await (async () => { const b = await launch(); const p = await openPage(b, url); const d = await p.evaluate(() => window.DUR); await b.close(); return d; })();
    const total = Math.round(dur * FPS);
    const from = +(args.from || 0), to = Math.min(total, +(args.to || total));
    const per = Math.ceil((to - from) / WORKERS);
    const t0 = Date.now();
    let done = 0;
    await Promise.all(Array.from({ length: WORKERS }, async (_, k) => {
      const a = from + k * per, z = Math.min(to, a + per);
      if (a >= z) return;
      const b = await launch(); const p = await openPage(b, url);
      for (let f = a; f < z; f++) {
        await shoot(p, f / FPS, path.join(OUT, `f${String(f).padStart(5, '0')}.png`));
        if (++done % 60 === 0) console.log(`${done}/${to - from} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
      await b.close();
    }));
    console.log(`done: ${to - from} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  srv.close();
})();
