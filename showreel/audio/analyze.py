#!/usr/bin/env python3
# ═════════════════════════════════════════════════════════════════════════════════════════════
#  CLAUDE — Motion Reel 2026 · soundtrack QC                                      audio/analyze.py
#
#    python3 audio/analyze.py [reel.wav] [--png DIR]      (default DIR: /tmp/audio-work)
#
#  Nobody can listen inside a render farm, so the soundtrack is *measured*:
#    · format        48 kHz · 2 ch · 16-bit · exactly 720 000 frames
#    · sync          sample-accurate onset detection around every R.HITS time, parsed straight
#                    from lib/timeline.js (error must be < 2 ms)
#    · loudness      BS.1770-4 integrated LUFS, per-scene loudness, 4× oversampled true peak
#                    (and ffmpeg's ebur128 as an independent cross-check when available)
#    · hygiene       click detector (isolated HF spikes), DC, L/R correlation (full band and
#                    < 120 Hz — the low end must be mono), octave-band balance per scene
#    · pictures      waveform + log-frequency spectrogram with hit markers, and a zoom strip of
#                    ±40 ms around each hit (expected sample drawn in red)
# ═════════════════════════════════════════════════════════════════════════════════════════════
import os
import re
import subprocess
import sys
import wave

import numpy as np
from scipy import signal as sps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True               # keep the repo free of __pycache__
from synth import BEAT, N, SR, lufs, kweight, true_peak  # noqa: E402

SCENES = [('s1 IGNITION', 0, 4), ('s2 KINETIC', 4, 10), ('s3 SHAPE', 10, 16), ('s4 DEPTH', 16, 20),
          ('s5 LIQUID', 20, 24), ('s6 MULTIVERSE', 24, 28), ('s7 LOCKUP', 28, 32)]


def load(path):
    with wave.open(path, 'rb') as w:
        fmt = (w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes())
        raw = np.frombuffer(w.readframes(w.getnframes()), '<i2')
    x = raw.reshape(-1, fmt[1]).T.astype(float) / 32768.0
    return x, fmt


def timeline_hits():
    src = open(os.path.join(ROOT, 'lib', 'timeline.js')).read()
    hits = [(int(n), float(s), k) for n, s, k in
            re.findall(r"\{\s*t:\s*b\((\d+)\),\s*s:\s*([\d.]+),\s*kind:\s*'(\w+)'", src)]
    bpm = float(re.search(r'R\.BPM\s*=\s*([\d.]+)', src).group(1))
    assert abs(60 / bpm - BEAT) < 1e-12, 'timeline BPM changed — re-grid the score'
    return hits


def onset(x, t, search=0.02, pre=0.012, post=0.003, guard=0.0003):
    """Sample-accurate onset near t: maximise the ratio of first-difference energy in the 3 ms
    after a candidate to that in the 12 ms before it (the transient's leading edge)."""
    d = np.diff(x.sum(axis=0), prepend=0.0)
    p = d * d
    cs = np.concatenate([[0.0], np.cumsum(p)])
    c = int(round(t * SR))
    S, A, B, G = (int(round(v * SR)) for v in (search, post, pre, guard))
    cand = np.arange(max(B + G, c - S), min(len(p) - A, c + S + 1))
    after = (cs[cand + A] - cs[cand]) / A
    before = (cs[cand - G] - cs[cand - G - B]) / B
    r = after / (before + 1e-14)
    k = int(np.argmax(r))
    return cand[k], 10 * np.log10(r[k] + 1e-12)


def spikes(x, thr=10.0):
    """Isolated high-frequency spikes (clicks): |HP(>12 kHz)| > thr × its local RMS (±4 ms)."""
    hp = sps.sosfilt(sps.butter(8, 12000, 'highpass', fs=SR, output='sos'), x.sum(axis=0))
    a = np.abs(hp)
    w = int(0.004 * SR)
    loc = np.sqrt(np.convolve(hp * hp, np.ones(2 * w + 1) / (2 * w + 1), mode='same'))
    m = (a > thr * loc) & (a > 10 ** (-60 / 20))
    idx = np.flatnonzero(m)
    out = []
    for i in idx:
        if not out or i - out[-1][0] > int(0.01 * SR):
            out.append((i, a[i] / (loc[i] + 1e-12)))
    return out


def band_levels(x, a, b_):
    seg = x[:, a:b_].mean(axis=0)
    f, P = sps.welch(seg, SR, nperseg=8192)
    edges = [31.5 * 2 ** (i - 0.5) for i in range(11)]
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (f >= lo) & (f < hi)
        out.append(10 * np.log10(P[m].sum() + 1e-20))
    return np.array(out)


def ffmpeg_ebur128(path):
    try:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        ff = 'ffmpeg'
    try:
        r = subprocess.run([ff, '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true',
                            '-f', 'null', '-'], capture_output=True, text=True, timeout=120)
    except Exception:
        return None
    s = r.stderr[r.stderr.rfind('Summary:'):]
    I = re.search(r'I:\s+(-?[\d.]+) LUFS', s)
    P = re.search(r'Peak:\s+(-?[\d.]+) dBFS', s)
    LRA = re.search(r'LRA:\s+(-?[\d.]+) LU', s)
    return (float(I.group(1)) if I else None, float(P.group(1)) if P else None,
            float(LRA.group(1)) if LRA else None)


# ─────────────────────────────────────────── pictures ────────────────────────────────────────
def _cmap(v):
    """v ∈ 0..1 → RGB (ink → ultra → signal → bone, the reel's palette)."""
    stops = np.array([[11, 11, 14], [51, 38, 255], [255, 79, 26], [242, 237, 228]], float)
    pos = np.array([0.0, 0.45, 0.78, 1.0])
    v = np.clip(v, 0, 1)
    return np.stack([np.interp(v, pos, stops[:, c]) for c in range(3)], axis=-1).astype(np.uint8)


def render_png(x, hits, onsets, out):
    from PIL import Image, ImageDraw
    W, HW, HS, M = 1800, 260, 420, 40
    img = Image.new('RGB', (W + 2 * M, HW + HS + 3 * M + 20), (22, 22, 28))
    d = ImageDraw.Draw(img)
    mono = x.mean(axis=0)
    cols = np.array_split(mono, W)
    mx = np.array([c.max() for c in cols])
    mn = np.array([c.min() for c in cols])
    rms = np.array([np.sqrt(np.mean(c * c)) for c in cols])
    y0 = M + HW // 2
    for i in range(W):
        d.line([(M + i, y0 - mx[i] * HW / 2), (M + i, y0 - mn[i] * HW / 2)], fill=(120, 116, 140))
        d.line([(M + i, y0 - rms[i] * HW / 2), (M + i, y0 + rms[i] * HW / 2)], fill=(242, 237, 228))
    for db in (-1, -6):
        a = 10 ** (db / 20) * HW / 2
        d.line([(M, y0 - a), (M + W, y0 - a)], fill=(80, 60, 60))
        d.line([(M, y0 + a), (M + W, y0 + a)], fill=(80, 60, 60))
    # spectrogram, log-frequency 30 Hz → 20 kHz
    f, tt, Z = sps.stft(mono, SR, nperseg=2048, noverlap=2048 - 240)
    P = 10 * np.log10(np.abs(Z) ** 2 + 1e-14)
    P = np.clip((P - (P.max() - 90)) / 90, 0, 1)
    fy = np.geomspace(30, 20000, HS)
    rows = np.array([np.interp(fy, f, P[:, j]) for j in range(P.shape[1])]).T[::-1]
    xs = np.linspace(0, P.shape[1] - 1, W)
    spec = np.array([np.interp(xs, np.arange(P.shape[1]), r) for r in rows])
    sy = M * 2 + HW
    img.paste(Image.fromarray(_cmap(spec)), (M, sy))
    for fr in (100, 1000, 10000):
        yy = sy + HS - 1 - np.interp(np.log(fr), np.log(fy), np.arange(HS))
        d.line([(M - 8, yy), (M, yy)], fill=(200, 200, 200))
        d.text((2, yy - 6), f'{fr // 1000}k' if fr >= 1000 else str(fr), fill=(200, 200, 200))
    X = lambda t: M + t / (N / SR) * W  # noqa: E731
    for name, a, b_ in SCENES:
        d.line([(X(a * BEAT), M - 6), (X(a * BEAT), sy + HS)], fill=(90, 90, 110))
        d.text((X(a * BEAT) + 3, M - 16), name, fill=(200, 200, 210))
    for (n, s, k), (o, _) in zip(hits, onsets):
        c = (255, 79, 26) if s >= 0.5 else (212, 255, 58)
        d.line([(X(n * BEAT), M + HW - 8), (X(n * BEAT), M + HW + 4)], fill=c, width=2)
    d.text((M, sy + HS + 8), 'waveform (grey = peak, bone = RMS, rules at −1/−6 dBFS) · spectrogram 30 Hz–20 kHz, '
           '90 dB range · ticks = R.HITS (orange s ≥ .5)', fill=(170, 170, 180))
    img.save(os.path.join(out, 'overview.png'))

    # zoom strip: ±40 ms around each hit
    cw, ch, cols_ = 300, 120, 6
    rows_ = int(np.ceil(len(hits) / cols_))
    z = Image.new('RGB', (cols_ * (cw + 8) + 8, rows_ * (ch + 26) + 8), (22, 22, 28))
    dz = ImageDraw.Draw(z)
    for i, ((n, s, k), (o, db)) in enumerate(zip(hits, onsets)):
        cx, cy = 8 + (i % cols_) * (cw + 8), 8 + (i // cols_) * (ch + 26)
        c = int(round(n * BEAT * SR))
        a0, a1 = c - int(0.04 * SR), c + int(0.04 * SR)
        seg = mono[a0:a1]
        sc = 0.48 * ch / (np.max(np.abs(seg)) + 1e-9)
        pts = [(cx + j * cw / len(seg), cy + 20 + ch / 2 - seg[j] * sc) for j in range(0, len(seg), 4)]
        dz.rectangle([cx, cy + 20, cx + cw, cy + 20 + ch], fill=(11, 11, 14))
        dz.line(pts, fill=(242, 237, 228))
        dz.line([(cx + cw / 2, cy + 20), (cx + cw / 2, cy + 20 + ch)], fill=(255, 79, 26))
        ox = cx + (o - a0) / (a1 - a0) * cw
        dz.line([(ox, cy + 20), (ox, cy + 26)], fill=(212, 255, 58), width=2)
        dz.text((cx, cy + 4), f'b{n} {k} {n * BEAT:.4f}s  err {(o - c) / SR * 1e3:+.2f}ms', fill=(210, 210, 220))
    z.save(os.path.join(out, 'hits_zoom.png'))

    # per-scene detail: waveform + spectrogram at ~2 ms/px, beat & 16th grid, hits marked
    for name, a, b_ in SCENES:
        t0, t1 = a * BEAT, b_ * BEAT
        s0, s1 = int(t0 * SR), int(t1 * SR)
        seg = mono[s0:s1]
        Wd, Hw, Hs = 1400, 150, 380
        im = Image.new('RGB', (Wd + 70, Hw + Hs + 60), (22, 22, 28))
        dd = ImageDraw.Draw(im)
        cols = np.array_split(seg, Wd)
        for i, c in enumerate(cols):
            dd.line([(60 + i, 20 + Hw / 2 - c.max() * Hw / 2), (60 + i, 20 + Hw / 2 - c.min() * Hw / 2)], fill=(200, 196, 210))
        f, tt, Z = sps.stft(seg, SR, nperseg=1024, noverlap=1024 - 96)
        P = 10 * np.log10(np.abs(Z) ** 2 + 1e-14)
        P = np.clip((P - (P.max() - 80)) / 80, 0, 1)
        fy = np.geomspace(40, 20000, Hs)
        rows = np.array([np.interp(fy, f, P[:, j]) for j in range(P.shape[1])]).T[::-1]
        xs = np.linspace(0, P.shape[1] - 1, Wd)
        spec = np.array([np.interp(xs, np.arange(P.shape[1]), r) for r in rows])
        im.paste(Image.fromarray(_cmap(spec)), (60, 30 + Hw))
        for fr in (100, 1000, 10000):
            yy = 30 + Hw + Hs - 1 - np.interp(np.log(fr), np.log(fy), np.arange(Hs))
            dd.text((20, yy - 6), f'{fr // 1000}k' if fr >= 1000 else str(fr), fill=(200, 200, 200))
        k0 = int(np.ceil(t0 / (BEAT / 4) - 1e-9))
        for k in range(k0, int(t1 / (BEAT / 4)) + 1):
            xx = 60 + (k * BEAT / 4 - t0) / (t1 - t0) * Wd
            big = k % 4 == 0
            dd.line([(xx, 14 if big else 18), (xx, 22)], fill=(255, 79, 26) if big else (120, 120, 130))
            if big:
                dd.text((xx + 2, 2), f'b{k // 4}', fill=(220, 220, 230))
        for n, s, kd in hits:
            if t0 <= n * BEAT < t1:
                xx = 60 + (n * BEAT - t0) / (t1 - t0) * Wd
                dd.line([(xx, 20 + Hw), (xx, 30 + Hw)], fill=(212, 255, 58), width=2)
        dd.text((60, 36 + Hw + Hs), f'{name}  {t0:.3f}–{t1:.3f}s  (grid: 16ths, orange = beats)', fill=(190, 190, 200))
        im.save(os.path.join(out, f'scene_{name.split()[0]}.png'))


def main():
    argv = sys.argv[1:]
    args = [a for i, a in enumerate(argv) if not a.startswith('--') and (i == 0 or argv[i - 1] != '--png')]
    path = args[0] if args else os.path.join(HERE, 'reel.wav')
    out = sys.argv[sys.argv.index('--png') + 1] if '--png' in sys.argv else '/tmp/audio-work'
    os.makedirs(out, exist_ok=True)
    x, (sr, ch, sw, nf) = load(path)
    ok = (sr, ch, sw, nf) == (48000, 2, 2, 720000)
    print(f'format: {sr} Hz · {ch} ch · {8 * sw}-bit · {nf} frames ({nf / sr:.6f} s)  {"OK" if ok else "WRONG"}')

    hits = timeline_hits()
    print(f'\nonsets vs lib/timeline.js R.HITS ({len(hits)} hits):')
    print('   beat  kind     time(s)     detected    err(ms)  contrast(dB)')
    onsets, worst = [], 0.0
    for n, s, k in hits:
        t = n * BEAT
        o, db = onset(x, t)
        err = (o - round(t * SR)) / SR * 1e3
        worst = max(worst, abs(err))
        onsets.append((o, db))
        print(f'   {n:4d}  {k:7s} {t:9.5f}  {o / SR:10.5f}  {err:+7.3f}   {db:6.1f}{"   <-- " if abs(err) >= 2 else ""}')
    print(f'   worst |error| = {worst:.3f} ms  → {"PASS" if worst < 2 else "FAIL"} (< 2 ms)')

    L = lufs(x)
    tp = 20 * np.log10(true_peak(x))
    sp = 20 * np.log10(np.max(np.abs(x)))
    rms = 20 * np.log10(np.sqrt(np.mean(x ** 2)))
    print(f'\nloudness: {L:.2f} LUFS integrated · true peak {tp:.2f} dBTP · sample peak {sp:.2f} dBFS · RMS {rms:.2f} dBFS')
    ff = ffmpeg_ebur128(path)
    if ff:
        print(f'  ffmpeg ebur128 cross-check: I = {ff[0]} LUFS · true peak {ff[1]} dBFS · LRA {ff[2]} LU')
    print(f'  DC: L {np.mean(x[0]) * 1e3:+.3f}e-3  R {np.mean(x[1]) * 1e3:+.3f}e-3')

    y = kweight(x) ** 2
    print('\nper scene:   loudness  M.max  peak   corr  <120Hz  >150Hz   octave bands 31..16k (dB rel. 1k)')
    cs = np.concatenate([[0.0], np.cumsum(y.sum(axis=0))])
    W4 = int(0.4 * SR)
    mom = -0.691 + 10 * np.log10((cs[W4:] - cs[:-W4]) / W4 + 1e-20)      # momentary loudness, 400 ms
    lo = sps.sosfilt(sps.butter(4, 120, 'lowpass', fs=SR, output='sos'), x)
    hi = sps.sosfilt(sps.butter(4, 150, 'highpass', fs=SR, output='sos'), x)
    for name, a, b_ in SCENES:
        s0, s1 = int(a * BEAT * SR), int(b_ * BEAT * SR)
        ls = -0.691 + 10 * np.log10(y[:, s0:s1].mean(axis=1).sum() + 1e-20)
        pk = 20 * np.log10(np.max(np.abs(x[:, s0:s1])) + 1e-12)
        cc = np.corrcoef(x[0, s0:s1], x[1, s0:s1])[0, 1]
        cl = np.corrcoef(lo[0, s0:s1], lo[1, s0:s1])[0, 1]
        ch_ = np.corrcoef(hi[0, s0:s1], hi[1, s0:s1])[0, 1]
        bl = band_levels(x, s0, s1)
        bl -= bl[5]
        mm = mom[s0:max(s0 + 1, s1 - W4)].max()
        print(f'  {name:14s} {ls:6.1f}  {mm:6.1f}  {pk:5.1f}  {cc:5.2f}  {cl:5.2f}   {ch_:5.2f}    ' + ' '.join(f'{v:+4.0f}' for v in bl))
    rms_all = 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
    # the tension gap holds only the implosion's reverse-suck (spec: ≤ −24 dB under the mix), and
    # the clean-dot frames right before the final hit must be silent (dither floor ≈ −96 dBFS)
    for tag, a, b_ in (('gap suck 12.94–13.098', 12.94, 13.098), ('clean dot 13.10–13.12', 13.10, 13.12),
                       ('last 0.05 s', 14.95, 15.0), ('first 0.05 s', 0, 0.05)):
        s0, s1 = int(a * SR), int(b_ * SR)
        r = 20 * np.log10(np.sqrt(np.mean(x[:, s0:s1] ** 2)) + 1e-12)
        print(f'  {tag:22s} RMS {r:7.1f} dBFS  ({r - rms_all:+.1f} dB vs mix RMS)')
    print(f'  last sample: L {x[0, -1]:+.6f} R {x[1, -1]:+.6f}')

    sk = spikes(x)
    print(f'\nclick detector (isolated >12 kHz spikes ≥ 10× local RMS): {len(sk)}'
          + ('' if not sk else ' → ' + ', '.join(f'{i / SR:.4f}s ({r:.0f}×)' for i, r in sk[:12])))

    render_png(x, hits, onsets, out)
    print(f'\npictures → {out}/overview.png, {out}/hits_zoom.png')


if __name__ == '__main__':
    main()
