#!/usr/bin/env node
/*
 * Renders src/index.html to a 1080x1920 video, frame by frame, in headless Chromium.
 *
 *   node tools/render.mjs                         # out/tvillingerne-1080x1920.mp4, 60 fps, motion blur, with soundtrack
 *   node tools/render.mjs --stills=0.3,2.5,9      # just save PNG stills at those times → out/stills/
 *   node tools/render.mjs --poster                # end-card thumbnail → out/poster-1080x1920.png
 *   node tools/render.mjs --cues                  # sound cues from the page → out/cues.json (make_audio.py reads it)
 *   node tools/render.mjs --remux                 # only swap the audio of the already rendered video
 *
 * Audio: out/soundtrack.wav (made by tools/make_audio.py).
 * Motion blur: every frame is the average of several sub-frames spread over a 180° shutter —
 * --samples (default 4) normally, --samples-fast (default 16) inside the time ranges the page lists
 * in __meta.blur (its fastest moves). --samples=1 turns motion blur off for quick drafts.
 *
 * Other options: --fps=60 --shutter=0.5 --workers=4 --crf=15 --audio=out/soundtrack.wav (--audio=none)
 *                --out=file.mp4 --frames=dir (keep/resume sub-frames there)
 * ffmpeg is taken from $FFMPEG or PATH.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  })
);
const NAME = 'tvillingerne';
const [W, H] = [1080, 1920];
const fps = Number(args.fps || 60);
const samples = Math.max(1, Number(args.samples || 4));
const samplesFast = samples === 1 ? 1 : Math.max(samples, Number(args['samples-fast'] || 16));
const shutter = Number(args.shutter || 0.5);
const workers = Math.max(1, Number(args.workers || Math.min(4, os.cpus().length)));
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const audio = args.audio === 'none' ? null : path.resolve(root, args.audio || 'out/soundtrack.wav');
const outFile = path.resolve(root, args.out || `out/${NAME}-${W}x${H}.mp4`);
if (samplesFast % samples) throw new Error('--samples-fast must be a multiple of --samples');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.goto(`http://127.0.0.1:${port}/src/index.html`);
  await page.evaluate(() => window.__ready);
  const cdp = await page.context().newCDPSession(page);
  // lossless PNG with fast compression (the sub-frames are temporary)
  page.shot = async () => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
    return Buffer.from(data, 'base64');
  };
  page.seek = (t) => page.evaluate((x) => window.__seek(x), t);
  return page;
}

function run(cmd, argv) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', rej);
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited with ${c}`))));
  });
}

const srv = await serve();
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });

try {
  if (args.cues) {
    const meta = await (await openPage(browser, port)).evaluate(() => window.__meta);
    const f = path.join(root, 'out', 'cues.json');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ DUR: meta.DUR, BPM: meta.BPM, cues: meta.cues }, null, 1));
    console.log(`${f} (${meta.cues.length} cues)`);
  } else if (args.poster) {
    const page = await openPage(browser, port);
    await page.seek(args.poster === true ? await page.evaluate(() => window.__meta.poster) : Number(args.poster));
    const f = path.join(root, 'out', `poster-${W}x${H}.png`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, await page.shot());
    console.log(f);
  } else if (args.remux) {
    // new soundtrack, same pictures: copy the video stream, encode only the audio
    const { DUR } = await (await openPage(browser, port)).evaluate(() => window.__meta);
    if (!fs.existsSync(outFile)) throw new Error(`${outFile} does not exist yet, render it first`);
    if (!audio || !fs.existsSync(audio)) throw new Error('no soundtrack to mux (run npm run audio)');
    const tmp = outFile.replace(/\.mp4$/, '.remux.mp4');
    await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'warning', '-i', outFile, '-i', audio, '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', String(DUR), '-movflags', '+faststart', tmp]);
    fs.renameSync(tmp, outFile);
    console.log(`wrote ${outFile} (audio: ${path.relative(root, audio)})`);
  } else if (args.stills) {
    const dir = path.resolve(root, args.dir || 'out/stills');
    fs.mkdirSync(dir, { recursive: true });
    const page = await openPage(browser, port);
    for (const t of String(args.stills).split(',').map(Number)) {
      await page.seek(t);
      const f = path.join(dir, `${t.toFixed(3)}.png`);
      fs.writeFileSync(f, await page.shot());
      console.log(f);
    }
  } else {
    const meta = await (await openPage(browser, port)).evaluate(() => window.__meta);
    const frames = Math.round(meta.DUR * fps);
    const S = samplesFast; // sub-frame slots per frame; slow frames fill them with repeated samples
    const fast = (t) => (meta.blur || []).some(([a, z]) => t >= a && t <= z);
    const jobs = [];
    for (let j = 0; j < frames; j++) {
      const n = samples > 1 && fast(j / fps) ? samplesFast : samples;
      for (let u = 0; u < n; u++) {
        const off = n > 1 ? ((u + 0.5) / n - 0.5) * (shutter / fps) : 0;
        jobs.push({ slot: j * S + u * (S / n), copies: S / n, t: Math.min(meta.DUR - 1e-4, Math.max(0, j / fps + off)) });
      }
    }
    const dir = args.frames ? path.resolve(root, args.frames) : fs.mkdtempSync(path.join(os.tmpdir(), `${NAME}-frames-`));
    fs.mkdirSync(dir, { recursive: true });
    const name = (i) => path.join(dir, `${String(i).padStart(7, '0')}.png`);
    console.log(`${W}x${H} · ${frames} frames @ ${fps} fps · ${samples}/${samplesFast} sub-frames · ${jobs.length} captures · ${workers} workers → ${dir}`);
    let done = 0;
    const t0 = Date.now();
    await Promise.all(
      [...Array(workers)].map(async (_, w) => {
        const page = await openPage(browser, port);
        for (let i = w; i < jobs.length; i += workers) {
          const { slot, copies, t } = jobs[i];
          if (!fs.existsSync(name(slot + copies - 1))) {
            await page.seek(t);
            fs.writeFileSync(name(slot), await page.shot());
            for (let c = 1; c < copies; c++) {
              if (fs.existsSync(name(slot + c))) fs.rmSync(name(slot + c));
              try { fs.linkSync(name(slot), name(slot + c)); } catch { fs.copyFileSync(name(slot), name(slot + c)); }
            }
          }
          if (++done % 250 === 0) {
            const el = (Date.now() - t0) / 1000;
            console.log(`  ${done}/${jobs.length}  ${(done / el).toFixed(1)} img/s  eta ${((jobs.length - done) / (done / el)).toFixed(0)}s`);
          }
        }
        await page.close();
      })
    );
    // average each frame's S sub-frame slots (tmix), keep one output per frame, encode H.264 + AAC
    const vf = [];
    if (S > 1) vf.push(`tmix=frames=${S}:weights=${Array(S).fill(1).join(' ')}`, `select=not(mod(n+1\\,${S}))`, `setpts=N/(${fps}*TB)`);
    vf.push('scale=out_color_matrix=bt709:out_range=tv', 'format=yuv420p');
    const argv = ['-y', '-hide_banner', '-loglevel', 'warning', '-framerate', String(fps * S), '-i', path.join(dir, '%07d.png')];
    const withAudio = audio && fs.existsSync(audio);
    if (withAudio) argv.push('-i', audio);
    argv.push('-vf', vf.join(','), '-r', String(fps), '-t', String(meta.DUR),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf || 15), '-profile:v', 'high', '-tune', 'animation',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv');
    if (withAudio) argv.push('-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
    argv.push('-movflags', '+faststart', outFile);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    console.log('  encoding…');
    await run(ffmpeg, argv);
    console.log(`wrote ${outFile}${withAudio ? '' : ' (no audio)'} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    if (!args.frames) fs.rmSync(dir, { recursive: true, force: true });
  }
} finally {
  await browser.close();
  srv.close();
}
