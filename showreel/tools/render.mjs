#!/usr/bin/env node
// Offline renderer for the reel. Drives headless Chromium frame-by-frame (every frame is a pure function of t).
//
//   node tools/render.mjs contact --from 1.875 --to 4.6875 --step 0.1 --out /tmp/sheet.png [--cols 6] [--cell 480]
//   node tools/render.mjs contact --times 1.9,2.0,2.35 --out sheet.png
//   node tools/render.mjs stills  --times 2.0,3.1 --outdir /tmp/stills [--samples 4]
//   node tools/render.mjs video   --from 0 --to 15 --out reel.mp4 [--fps 60] [--samples 4] [--workers 3] [--audio a.wav] [--crf 16]
//   node tools/render.mjs check   [--from 0 --to 15 --step 0.05]     # renders frames, reports JS errors + timing only
//
// Every command prints scene/HUD errors caught during rendering. Exit code 2 if any occurred.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FFMPEG = (() => {
  try {
    return execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
  } catch {
    return 'ffmpeg';
  }
})();

// ── args ──
const [cmd = 'contact', ...rest] = process.argv.slice(2);
const A = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const k = rest[i].slice(2);
    const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
    A[k] = v;
  }
}
const num = (k, d) => (A[k] !== undefined ? parseFloat(A[k]) : d);
const FPS = num('fps', 60);

// ── static server ──
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.json': 'application/json', '.jpg': 'image/jpeg' };
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, resp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        resp.writeHead(404);
        return resp.end();
      }
      resp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(p).pipe(resp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function openPage(port) {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-driver-bug-workarounds', '--js-flags=--max-old-space-size=4096'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?headless=1`);
  await page.evaluate(() => R.ready);
  return { browser, page, consoleErrors };
}

function timesFromArgs() {
  if (A.times) return String(A.times).split(',').map(Number);
  const from = num('from', 0), to = num('to', 15), step = num('step', 0.25);
  const out = [];
  for (let t = from; t < to - 1e-9; t += step) out.push(+t.toFixed(6));
  return out;
}

async function reportErrors(page, consoleErrors) {
  const errs = await page.evaluate(() => R.errors.slice(0, 200));
  const seen = new Set();
  let n = 0;
  for (const e of errs) {
    const k = e.scene + e.msg.split('\n')[0];
    if (seen.has(k)) continue;
    seen.add(k);
    n++;
    console.error(`[scene ${e.scene} @ ${e.t.toFixed(3)}s] ${e.msg.split('\n').slice(0, 4).join('\n    ')}`);
  }
  for (const c of [...new Set(consoleErrors)].slice(0, 20)) {
    if (/scene .* @/.test(c)) continue;
    console.error('[console] ' + c);
    n++;
  }
  return n;
}

const dataUrlToBuf = (d) => Buffer.from(d.slice(d.indexOf(',') + 1), 'base64');

async function main() {
  const srv = await serve();
  const port = srv.address().port;
  let errCount = 0;
  const t0 = Date.now();

  if (cmd === 'contact') {
    const times = timesFromArgs();
    const cols = num('cols', Math.min(6, times.length)), cell = num('cell', 480);
    const { browser, page, consoleErrors } = await openPage(port);
    const png = await page.evaluate(
      async ({ times, cols, cell, samples }) => {
        const rows = Math.ceil(times.length / cols);
        const ch = Math.round((cell * 9) / 16);
        const pad = 6, lab = 22;
        const sheet = document.createElement('canvas');
        sheet.width = cols * (cell + pad) + pad;
        sheet.height = rows * (ch + pad + lab) + pad;
        const c = sheet.getContext('2d');
        c.fillStyle = '#202024';
        c.fillRect(0, 0, sheet.width, sheet.height);
        times.forEach((t, i) => {
          const x = pad + (i % cols) * (cell + pad), y = pad + Math.floor(i / cols) * (ch + pad + lab);
          const f = R.frame(t, { samples });
          c.drawImage(f, x, y + lab, cell, ch);
          c.fillStyle = '#ddd';
          c.font = '500 15px "JetBrains Mono"';
          const beat = t / R.BEAT;
          const sc = R.SCENES.find((s) => t >= s.start && t < s.end);
          c.fillText(`${t.toFixed(3)}s  f${Math.round(t * 60)}  b${beat.toFixed(2)}  ${sc ? sc.id + ' +' + (t - sc.start).toFixed(3) : ''}`, x + 2, y + 16);
        });
        return sheet.toDataURL('image/png');
      },
      { times, cols, cell, samples: num('samples', 1) }
    );
    const out = A.out || 'contact.png';
    fs.writeFileSync(out, dataUrlToBuf(png));
    errCount = await reportErrors(page, consoleErrors);
    await browser.close();
    console.log(`contact sheet → ${out} (${times.length} frames, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } else if (cmd === 'stills') {
    const times = timesFromArgs();
    const outdir = A.outdir || 'stills';
    fs.mkdirSync(outdir, { recursive: true });
    const { browser, page, consoleErrors } = await openPage(port);
    for (const t of times) {
      const d = await page.evaluate(({ t, samples }) => R.frame(t, { samples }).toDataURL('image/png'), { t, samples: num('samples', 1) });
      const f = path.join(outdir, `f_${t.toFixed(3)}.png`);
      fs.writeFileSync(f, dataUrlToBuf(d));
      console.log('still → ' + f);
    }
    errCount = await reportErrors(page, consoleErrors);
    await browser.close();
  } else if (cmd === 'check') {
    const times = timesFromArgs();
    const { browser, page, consoleErrors } = await openPage(port);
    const stats = await page.evaluate((times) => {
      const per = [];
      for (const t of times) {
        const a = performance.now();
        R.frame(t, { samples: 1 });
        per.push([t, performance.now() - a]);
      }
      return per;
    }, times);
    errCount = await reportErrors(page, consoleErrors);
    await browser.close();
    const worst = [...stats].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const avg = stats.reduce((s, x) => s + x[1], 0) / stats.length;
    console.log(`checked ${times.length} frames, avg ${avg.toFixed(1)}ms/frame; slowest: ${worst.map(([t, ms]) => `${t.toFixed(2)}s=${ms.toFixed(0)}ms`).join(', ')}`);
  } else if (cmd === 'video') {
    const from = num('from', 0), to = num('to', 15);
    const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS);
    const frames = [];
    for (let f = f0; f < f1; f++) frames.push(f);
    const workers = Math.max(1, Math.min(num('workers', Math.max(1, os.cpus().length - 1)), frames.length));
    const samples = num('samples', 1);
    const fmt = A.format === 'jpeg' ? 'jpeg' : 'png';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));
    const chunk = Math.ceil(frames.length / workers);
    let done = 0;
    const jobs = Array.from({ length: workers }, async (_, w) => {
      const mine = frames.slice(w * chunk, (w + 1) * chunk);
      if (!mine.length) return null;
      const file = path.join(tmp, `chunk_${String(w).padStart(2, '0')}.mkv`);
      const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', fmt === 'png' ? 'png' : 'mjpeg', '-i', '-', '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'yuv444p', file], { stdio: ['pipe', 'inherit', 'inherit'] });
      const { browser, page, consoleErrors } = await openPage(port);
      for (const f of mine) {
        const d = await page.evaluate(({ t, samples, fmt }) => R.frame(t, { samples }).toDataURL('image/' + fmt, 0.95), { t: f / FPS, samples, fmt });
        const buf = dataUrlToBuf(d);
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        done++;
        if (done % 30 === 0) process.stdout.write(`\r${done}/${frames.length} frames  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
      ff.stdin.end();
      await new Promise((r) => ff.on('close', r));
      errCount += await reportErrors(page, consoleErrors);
      await browser.close();
      return file;
    });
    const files = (await Promise.all(jobs)).filter(Boolean);
    process.stdout.write('\n');
    const list = path.join(tmp, 'list.txt');
    fs.writeFileSync(list, files.map((f) => `file '${f}'`).join('\n'));
    const out = A.out || 'reel.mp4';
    const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
    if (A.audio) args.push('-i', A.audio);
    args.push('-map', '0:v');
    if (A.audio) args.push('-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-shortest');
    args.push('-c:v', 'libx264', '-preset', A.preset || 'slow', '-crf', String(num('crf', 16)), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-tune', 'animation', '-r', String(FPS), '-movflags', '+faststart', out);
    execFileSync(FFMPEG, args, { stdio: 'inherit' });
    if (!A.keep) fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`video → ${out} (${frames.length} frames, ${workers} workers, ${samples}x blur, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } else {
    console.error('unknown command ' + cmd);
    process.exit(1);
  }
  srv.close();
  if (errCount) {
    console.error(`${errCount} error(s) reported`);
    process.exit(2);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
