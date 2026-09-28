#!/usr/bin/env python3
"""
Soundtrack for "Håndlavet" (104 BPM, G major, 26 beats = 15 s), synthesised for this ad in numpy/scipy: a strummed
acoustic guitar and an upright bass (both Karplus-Strong strings), stomps, claps and a tambourine, a whistled phrase,
and the paper sounds of the stop motion (tiles stuck on, scissors, tape, the old phone bell), placed from
out/cues.json, which the page itself exports.

    node tools/render.mjs --cues && python3 tools/make_audio.py     # -> out/soundtrack.wav (48 kHz, ~-14 LUFS)
    python3 tools/make_audio.py --vo=vo/da                          # -> out/soundtrack-da.wav (+ Danish voice-over)

Music (beats): 0-4 G, a light strum under "Du er dygtig med dine hænder" · 4-8 Em | C, quieter, "Men online ..."
· 8-14.5 G | D | C | G, the band picks up while the website is glued on · 14.5-19 D | G, the phone rings
· 19-26 C | G | D | G, the end card (a whistled phrase leads into it).
"""
import argparse
import json
import os
import shutil
import subprocess
import wave

import numpy as np
import scipy.signal as sg

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--vo', metavar='DIR', help='voice-over folder with cues.json + one WAV per line, e.g. vo/da')
ARGS = ap.parse_args()

SR = 48000
BPM = 104
B = 60 / BPM
HERE = os.path.dirname(os.path.abspath(__file__))
VO_DIR = os.path.join(HERE, '..', ARGS.vo) if ARGS.vo else None
VO = json.load(open(os.path.join(VO_DIR, 'cues.json'), encoding='utf-8')) if VO_DIR else None
OUT = os.path.join(HERE, '..', 'out', f"soundtrack-{VO['lang']}.wav" if VO else 'soundtrack.wav')
CUES = json.load(open(os.path.join(HERE, '..', 'out', 'cues.json'), encoding='utf-8'))
DUR = CUES['DUR']
N = int(round(SR * DUR))
rng = np.random.default_rng(104)


def b(n):
    return n * B


NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def hz(x):
    return 440.0 * 2 ** ((12 * (int(x[-1]) + 1) + NOTE[x[:-1]] - 69) / 12)


def tt(sec):
    return np.arange(int(round(sec * SR))) / SR


def filt(x, kind, f, order=2):
    f = np.clip(np.asarray(f, dtype=float) / (SR / 2), 1e-4, 0.999)
    return sg.sosfilt(sg.butter(order, f.item() if f.size == 1 else f, btype=kind, output='sos'), x, axis=-1)


def fade(x, a=0.002, r=0.02):
    n = x.shape[-1]
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[n - nr:] *= np.linspace(1, 0, nr)
    return x * e


# ------------------------------------------------------------------ buses
BUS = {k: np.zeros((2, N)) for k in ('guitar', 'bass', 'drums', 'lead', 'fx', 'vo', 'send')}


def place(bus, x, t0, gain=1.0, pan=0.0, send=0.0):
    x = np.asarray(x, dtype=float)
    if x.ndim == 1:
        th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        x = np.stack([x * np.cos(th), x * np.sin(th)])
    i0 = int(round(t0 * SR))
    if i0 < 0:
        x, i0 = x[:, -i0:], 0
    n = min(x.shape[1], N - i0)
    if n <= 0:
        return
    BUS[bus][:, i0:i0 + n] += gain * x[:, :n]
    if send:
        BUS['send'][:, i0:i0 + n] += gain * send * x[:, :n]


# ------------------------------------------------------------------ instruments
def ks(f, dur, bright=3000, damp=0.996, pick=0.5):
    """Karplus-Strong string: a filtered noise burst in a feedback delay. `pick` shapes the burst (where the string
    is plucked), `bright` its colour, `damp` how long it rings."""
    n = int(dur * SR)
    period = max(2, int(round(SR / f)))
    burst = filt(rng.standard_normal(period), 'lowpass', bright)
    burst -= np.roll(burst, int(period * pick))  # pick position comb
    exc = np.zeros(n)
    exc[:period] = burst / (np.max(np.abs(burst)) + 1e-9)
    a = np.zeros(period + 2)
    a[0], a[period], a[period + 1] = 1.0, -damp / 2, -damp / 2
    return sg.lfilter([1.0], a, exc)


GUITAR = {  # six-string voicings, low to high
    'G': ['G2', 'B2', 'D3', 'G3', 'B3', 'G4'],
    'C': ['C3', 'E3', 'G3', 'C4', 'E4', 'G4'],
    'Em': ['E2', 'B2', 'E3', 'G3', 'B3', 'E4'],
    'D': ['D3', 'A3', 'D4', 'F#4', 'A4', 'D5'],
}


def strum(chord, up=False, dur=0.6, vel=1.0):
    """All six strings, 11 ms apart (low to high on a down stroke), ringing until the next stroke."""
    notes = GUITAR[chord][::-1] if up else GUITAR[chord]
    n = int((dur + 0.08) * SR)
    out = np.zeros((2, n))
    for i, nm in enumerate(notes):
        s = ks(hz(nm), dur + 0.08, bright=2600 if up else 3400, damp=0.997, pick=0.3 + 0.05 * i)
        s = s * np.exp(-np.arange(len(s)) / SR / 1.2) * (0.7 if up else 1.0)
        d = int(i * 0.011 * SR)
        pan = -0.3 + 0.12 * (GUITAR[chord].index(nm))
        th = (pan + 1) * np.pi / 4
        seg = s[: n - d]
        out[0, d:d + len(seg)] += seg * np.cos(th)
        out[1, d:d + len(seg)] += seg * np.sin(th)
    # a little pick noise
    pick = filt(rng.standard_normal(int(0.02 * SR)), 'bandpass', [2000, 7000]) * np.exp(-np.arange(int(0.02 * SR)) / SR / 0.004) * 0.3
    out[:, :len(pick)] += pick
    env = np.ones(n)
    env[-int(0.06 * SR):] = np.linspace(1, 0, int(0.06 * SR))  # damped by the next stroke
    return out * env * vel / 3.0


def upright(name, dur, vel=1.0):
    f = hz(name)
    s = ks(f, dur + 0.15, bright=900, damp=0.995, pick=0.2)
    t = np.arange(len(s)) / SR
    s = filt(s, 'lowpass', 800) + 0.6 * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.4)
    env = np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.04))
    return fade(s * env / (np.max(np.abs(s)) + 1e-9) * vel, 0.002, 0.04)


def stomp():
    t = tt(0.4)
    body = np.sin(2 * np.pi * np.cumsum(55 + 50 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.12)
    wood = filt(rng.standard_normal(len(t)), 'bandpass', [120, 700]) * np.exp(-t / 0.03) * 0.5
    return fade(body + wood, 0.001, 0.05)


def clap():
    t = tt(0.3)
    n = filt(rng.standard_normal(len(t)), 'bandpass', [800, 5000])
    env = sum(np.exp(-np.maximum(t - d, 0) / 0.007) * (t >= d) for d in (0, 0.011, 0.02)) + 0.6 * np.exp(-np.maximum(t - 0.03, 0) / 0.08) * (t >= 0.03)
    return fade(n * env, 0.0005, 0.04)


def tambourine(vel=1.0):
    t = tt(0.18)
    jingle = sum(np.sin(2 * np.pi * f * t) for f in (5200, 6900, 8300, 9700)) / 4
    x = (filt(rng.standard_normal(len(t)), 'highpass', 6000) * 0.8 + jingle * 0.5) * np.exp(-t / 0.05)
    return fade(x * vel, 0.001, 0.02)


def whistle(notes, t0):
    """A whistled phrase: sine with vibrato and a breathy edge; notes = [(name, beats), ...]."""
    out = []
    for name, beats in notes:
        d = b(beats)
        t = tt(d)
        f = hz(name) * (1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.15))
        tone = np.sin(2 * np.pi * np.cumsum(f) / SR)
        breath = filt(rng.standard_normal(len(t)), 'bandpass', [hz(name) * 0.9, hz(name) * 1.15]) * 0.25
        env = np.minimum(1, t / 0.04) * np.minimum(1, (d - t) / 0.06) * (1 - 0.15 * t / d)
        out.append((tone + breath) * env)
    x = np.concatenate(out)
    place('lead', fade(x, 0.01, 0.08), t0, 0.22, 0.15, send=0.4)


# ------------------------------------------------------------------ music
PLAN = [(0, 4, 'G'), (4, 6, 'Em'), (6, 8, 'C'), (8, 10, 'G'), (10, 12, 'D'), (12, 13.5, 'C'), (13.5, 14.5, 'G'),
        (14.5, 16.5, 'D'), (16.5, 19, 'G'), (19, 20.5, 'C'), (20.5, 22, 'G'), (22, 24, 'D'), (24, 26, 'G')]
ROOT = {'G': 'G1', 'C': 'C2', 'Em': 'E2', 'D': 'D2'}
# folk strum on eighths: D . D U . U D U
PATTERN = [(0, False, 1.0), (1, False, 0.85), (1.5, True, 0.6), (2.5, True, 0.6), (3, False, 0.85), (3.5, True, 0.6)]


def chord_at(beat):
    for s, e, c in PLAN:
        if s <= beat < e:
            return c
    return PLAN[-1][2]


strokes = []
for bar0 in np.arange(0, 24, 4):
    for off, up, vel in PATTERN:
        beat = bar0 + off
        if beat >= 24:
            continue
        quiet = 4 <= beat < 8  # "men online ..." — just the downbeats
        if quiet and off not in (0, 3):
            continue
        strokes.append((beat, up, vel * (0.6 if quiet else 1.0)))
strokes.sort()
for k, (beat, up, vel) in enumerate(strokes):
    nxt = strokes[k + 1][0] if k + 1 < len(strokes) else beat + 2
    place('guitar', strum(chord_at(beat), up, b(nxt - beat), vel), b(beat), 0.5, 0.0, send=0.12)
# final chord, let ring
place('guitar', strum('G', False, 2.6, 1.0), b(24), 0.55, 0.0, send=0.25)

# upright bass: roots on 1 and 3 (and a walk into the next chord), from beat 8
for s, e, c in PLAN:
    for beat in np.arange(s, e, 2 if s >= 8 else 4):
        if beat >= 24:
            continue
        place('bass', upright(ROOT[c], b(0.9)), b(beat), 0.5)
place('bass', upright('G1', 2.2), b(24), 0.55)

# stomps and claps from beat 8, tambourine on the offbeats from 8.5
for beat in np.arange(8, 24, 1):
    if int(beat) % 2 == 0:
        place('drums', stomp(), b(beat), 0.7)
    else:
        place('drums', clap(), b(beat), 0.26, 0.15, send=0.3)
for beat in np.arange(8.5, 24, 1):
    place('drums', tambourine(0.9), b(beat), 0.12, 0.4)
place('drums', stomp(), b(24), 0.7)
# a whistled phrase after the phone bell, leading into the end card and the last line
whistle([('D5', 0.5), ('G5', 0.5), ('B5', 1.0)], 10.65)


# ------------------------------------------------------------------ paper sounds from the page's cue list
def rustle(dur, lo=1200, hi=7000, grain=0.012):
    """Paper: noise in quick crinkly grains."""
    n = int(dur * SR)
    x = filt(rng.standard_normal(n), 'bandpass', [lo, hi])
    g = int(grain * SR)
    am = np.repeat(rng.random(n // g + 1) ** 2, g)[:n]
    am = np.convolve(am, np.ones(64) / 64, 'same')
    return x * am


def fx_slide(c):
    d = 0.3
    x = rustle(d, 600, 5000, 0.02) * np.sin(np.pi * np.linspace(0, 1, int(d * SR))) ** 0.6
    place('fx', fade(x, 0.01, 0.05), c['t'] - 0.05, 0.22, (-0.4, 0.4, 0, -0.3, 0.3, 0, 0, 0, 0, 0, -0.4)[c['i'] % 11], send=0.1)


def fx_word(c):
    # each letter tile slapped down: a soft thump and a crinkle, one per letter (a drawing apart). The words are
    # stuck on as the voice says them, so under the voice only the thump stays: the crinkle would sit right on
    # the consonants that start the word.
    for k in range(min(c['n'], 7)):
        t = tt(0.07)
        th = np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.012) * 0.6
        if not VO:
            th = th + rustle(0.07, 1500, 7000, 0.006) * np.exp(-t / 0.02)
        place('fx', fade(th, 0.0005, 0.02), c['t'] + k * 0.02, 0.2 if not VO else 0.12, rng.uniform(-0.3, 0.3))


def fx_sweep(c):
    x = rustle(0.4, 500, 6000, 0.03) * np.linspace(1, 0, int(0.4 * SR)) ** 1.5
    place('fx', fade(x, 0.005, 0.05), c['t'], 0.2, -0.4, send=0.1)


def fx_flap(c):
    t = tt(0.08)
    x = np.sin(2 * np.pi * 150 * t) * np.exp(-t / 0.015) * 0.5 + rustle(0.08, 1000, 6000, 0.008) * np.exp(-t / 0.025)
    place('fx', fade(x, 0.0005, 0.02), c['t'], 0.16, 0.1)


def fx_hop(c):
    fx_flap(c)


def fx_question(c):
    t = tt(0.4)
    f = 300 * (1 + 0.5 * np.exp(-t / 0.05)) * (1 + 0.03 * np.sin(2 * np.pi * 9 * t))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12)
    place('fx', fade(x, 0.001, 0.05), c['t'], 0.14, 0.2, send=0.2)
    fx_flap(c)


def fx_snip(c):
    t = tt(0.12)
    click = sum(np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006) for f in (3100, 4700, 6800)) / 3
    shear = filt(rng.standard_normal(len(t)), 'bandpass', [3000, 9000]) * np.exp(-t / 0.03) * 0.6
    place('fx', fade(click + shear, 0.0003, 0.02), c['t'], 0.35, -0.2)


def fx_fall(c):
    d = 0.55
    n = int(d * SR)
    x = rustle(d, 800, 5000, 0.04) * (0.5 + 0.5 * np.sin(2 * np.pi * 7 * np.arange(n) / SR)) * np.linspace(1, 0.2, n)
    place('fx', fade(x, 0.01, 0.08), c['t'], 0.16, 0.0)


def fx_tape(c):
    # tape pulled off the roll (a rising tearing noise), then pressed down
    d = 0.22
    n = int(d * SR)
    u = np.linspace(0, 1, n)
    x = rng.standard_normal(n)
    y = np.zeros(n)
    blk = 256
    zi = np.zeros((1, 2))
    for s0 in range(0, n, blk):
        fc = 900 * (4000 / 900) ** u[s0]
        sos = sg.butter(1, [fc * 0.7 / (SR / 2), min(fc * 1.5, 20000) / (SR / 2)], 'bandpass', output='sos')
        y[s0:s0 + blk], zi = sg.sosfilt(sos, x[s0:s0 + blk], zi=zi)
    crackle = (rng.random(n) < 0.02) * rng.standard_normal(n) * 3
    place('fx', fade((y + filt(crackle, 'highpass', 2000)) * np.sin(np.pi * u) ** 0.5, 0.005, 0.03), c['t'] - d, 0.18, 0.3)
    fx_flap(c)


def fx_stick(c):
    t = tt(0.1)
    x = np.sin(2 * np.pi * 120 * t) * np.exp(-t / 0.02) * 0.8 + rustle(0.1, 800, 5000, 0.01) * np.exp(-t / 0.03) * 0.6
    place('fx', fade(x, 0.0005, 0.03), c['t'], 0.22, 0.0)


def fx_ring(c):
    """An old phone bell: a clapper hitting two bells at 20 Hz, in two bursts."""
    for k, t0 in enumerate((c['t'], c['t'] + 0.5)):
        d = 0.38
        t = tt(d + 0.3)
        f1, f2 = 1170, 1470
        bell = (np.sin(2 * np.pi * f1 * t) + 0.8 * np.sin(2 * np.pi * f2 * t) + 0.3 * np.sin(2 * np.pi * f1 * 2.76 * t)) / 2.1
        strikes = (np.sin(2 * np.pi * 20 * t) > 0.6).astype(float) * (t < d)
        env = np.convolve(strikes, np.exp(-np.arange(int(0.05 * SR)) / SR / 0.02), 'full')[:len(t)]
        place('fx', fade(bell * env / (np.max(env) + 1e-9), 0.001, 0.1), t0, 0.16, 0.3 if k else -0.3, send=0.3)


def fx_note(c):
    fx_slide({'t': c['t'], 'i': 3 + c['i']})
    t = tt(0.5)
    ding = np.sin(2 * np.pi * hz(('B5', 'D6', 'G6')[c['i']]) * t) * np.exp(-t / 0.2)
    place('fx', fade(ding, 0.001, 0.05), c['t'] + 0.2, 0.08, 0.2, send=0.3)


def fx_sheet(c):
    d = 0.5
    x = rustle(d, 300, 4000, 0.03) * np.sin(np.pi * np.linspace(0, 1, int(d * SR))) ** 0.5
    place('fx', fade(x, 0.01, 0.06), c['t'] - 0.05, 0.3, 0.3, send=0.15)


def fx_letter(c):
    t = tt(0.06)
    x = np.sin(2 * np.pi * 200 * t) * np.exp(-t / 0.01) * 0.6 + rustle(0.06, 1500, 7000, 0.006) * np.exp(-t / 0.02)
    place('fx', fade(x, 0.0005, 0.02), c['t'], 0.18, -0.3 + 0.08 * c['i'])


def fx_cta(c):
    fx_stick(c)
    place('guitar', ks(hz('G4'), 1.2, 3000, 0.997, 0.4) * np.exp(-np.arange(int(1.2 * SR)) / SR / 0.6) * 0.3, c['t'] + 0.05, 0.4, 0.2, send=0.2)


FX = {'slide': fx_slide, 'word': fx_word, 'sweep': fx_sweep, 'flap': fx_flap, 'hop': fx_hop, 'question': fx_question,
      'snip': fx_snip, 'fall': fx_fall, 'tape': fx_tape, 'stick': fx_stick, 'ring': fx_ring, 'note': fx_note,
      'sheet': fx_sheet, 'letter': fx_letter, 'cta': fx_cta}
for cue in CUES['cues']:
    FX[cue['type']](cue)

GAINS = {'guitar': 1.2, 'bass': 0.6, 'drums': 0.8, 'lead': 1.0, 'fx': 1.6}


# ------------------------------------------------------------------ voice-over (--vo)
def read_wav(path):
    """Mono float signal at SR from a 16-bit PCM WAV of any sample rate."""
    with wave.open(path) as w:
        sr, ch = w.getframerate(), w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float) / 32768
    x = x.reshape(-1, ch).mean(axis=1)
    if sr != SR:
        g = np.gcd(sr, SR)
        x = sg.resample_poly(x, SR // g, sr // g)
    return x


def biquad(x, kind, f0, gain_db, q=0.707):
    """RBJ-cookbook peaking or high-shelf filter."""
    A, w0 = 10 ** (gain_db / 40), 2 * np.pi * f0 / SR
    c, al = np.cos(w0), np.sin(w0) / (2 * q)
    if kind == 'peak':
        bb, aa = [1 + al * A, -2 * c, 1 - al * A], [1 + al / A, -2 * c, 1 - al / A]
    else:
        r = 2 * np.sqrt(A) * al
        bb = [A * ((A + 1) + (A - 1) * c + r), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - r)]
        aa = [(A + 1) - (A - 1) * c + r, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - r]
    return sg.lfilter(bb, aa, x)


def kweight(x):
    """ITU-R BS.1770 K-weighting, for comparing the loudness of the voice and the music under it."""
    return filt(biquad(x, 'shelf', 1682, 4.0), 'highpass', 38)


def compress(x, thresh=-20.0, ratio=3.0, attack=0.004, release=0.09):
    """Feed-forward RMS compressor (threshold in dBFS)."""
    ka, kr = 1 - np.exp(-1 / (attack * SR)), 1 - np.exp(-1 / (release * SR))
    env = np.empty_like(x)
    e = 0.0
    for i, v in enumerate(x * x):
        e += (v - e) * (ka if v > e else kr)
        env[i] = e
    return x * 10 ** (np.minimum(0, (thresh - 10 * np.log10(env + 1e-12)) * (1 - 1 / ratio)) / 20)


def speech_rms(x):
    """K-weighted RMS over the 20 ms frames that carry speech (within 30 dB of the loudest)."""
    k = kweight(x)
    fr = int(0.02 * SR)
    ms = np.array([np.mean(k[i:i + fr] ** 2) for i in range(0, len(k) - fr, fr)])
    return np.sqrt(np.mean(ms[ms > ms.max() * 1e-3]))


VO_OVER_BED = 12.0  # dB (K-weighted) the voice sits above the ducked music while it speaks, at least per line
DUCK_DB = {'guitar': 12, 'bass': 3, 'drums': 8, 'lead': 9, 'fx': 10, 'send': 7}
CARVE_DB = 6  # extra dip of the 1.5-6 kHz band (where consonants live) in everything except the bass
if VO:
    lines, spans = [], []
    for ln in VO['lines']:
        x = read_wav(os.path.join(VO_DIR, ln['file']))
        x = filt(x, 'highpass', 85)
        x = biquad(x, 'peak', 250, -2.0, 1.0)  # a little less boxy
        x = biquad(x, 'shelf', 4500, 2.5)      # presence, so it cuts through on phone speakers
        x = compress(x / np.max(np.abs(x)), -20, 3.0)
        x = fade(x * 0.1 / speech_rms(x), 0.005, 0.03)
        t0 = ln['at']
        lines.append((x, t0))
        spans.append((t0, t0 + len(x) / SR))
        if t0 + len(x) / SR > DUR - 0.35:
            print(f"warning: {ln['file']} runs into the fade-out at the end")
    # the music ducks under the voice: gate on the line spans (with look-ahead), smoothed at 1 kHz
    rate = 1000
    gate = np.zeros(int(DUR * rate) + 1)
    for a, z in spans:
        gate[max(0, int((a - 0.06) * rate)):int((z + 0.06) * rate)] = 1
    act = np.empty_like(gate)
    ka, kr = 1 - np.exp(-1 / (0.05 * rate)), 1 - np.exp(-1 / (0.3 * rate))
    e = 0.0
    for i, g in enumerate(gate):
        e += (g - e) * (ka if g > e else kr)
        act[i] = e
    act = np.interp(np.arange(N) / SR, np.arange(len(act)) / rate, act)
    carve_sos = sg.butter(2, [1500 / (SR / 2), 6000 / (SR / 2)], btype='bandpass', output='sos')
    for k, d in DUCK_DB.items():
        if k != 'bass':  # zero-phase band split, so band + rest adds back up exactly
            band = sg.sosfiltfilt(carve_sos, BUS[k], axis=-1)
            BUS[k] += band * (10 ** (-CARVE_DB * act / 20) - 1)
        BUS[k] *= 10 ** (-d * act / 20)
    for x, t0 in lines:
        place('vo', x, t0)  # dry and centred, like a studio read
    # set the voice level from the music actually under it
    rms = lambda v: np.sqrt(np.mean(v ** 2))  # noqa: E731
    talk = np.zeros(N, bool)
    for a, z in spans:
        talk[int(a * SR):int(z * SR)] = True
    kbed = kweight(sum(BUS[k] * g for k, g in GAINS.items()).mean(axis=0))
    kvo = kweight(BUS['vo'][0])
    GAINS['vo'] = 10 ** (VO_OVER_BED / 20) * rms(kbed[talk]) / rms(kvo[talk])
    for (a, z), ln in zip(spans, VO['lines']):
        s = slice(int(a * SR), int(z * SR))
        over = 20 * np.log10(GAINS['vo'] * rms(kvo[s]) / rms(kbed[s]))
        lift = min(2.5, max(0.0, VO_OVER_BED - over))  # lines over the busiest music come up a little
        BUS['vo'][:, s] *= 10 ** (lift / 20)
        print(f"vo {ln['id']}  {a:5.2f}-{z:5.2f}s  {over + lift:+5.1f} dB over the music"
              f"{f' (lifted {lift:.1f} dB)' if lift else ''}  {ln['text']}")


# ------------------------------------------------------------------ mix + master
ir_t = tt(1.6)
ir = np.stack([filt(rng.standard_normal(len(ir_t)), 'lowpass', 5000) * np.exp(-ir_t / 0.3) for _ in range(2)])
ir[:, : int(0.01 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
verb = np.stack([sg.fftconvolve(BUS['send'][ch], ir[ch])[:N] for ch in range(2)]) * 0.45

mixed = sum(BUS[k] * g for k, g in GAINS.items()) + verb
mixed = filt(mixed, 'highpass', 30)
mixed = filt(mixed, 'lowpass', 16000)
mixed[:, -int(0.35 * SR):] *= np.linspace(1, 0, int(0.35 * SR)) ** 1.5


def limit(x, ceiling=0.85, look=0.004, release=0.06):
    """Look-ahead peak limiter: gain drops before each peak, recovers smoothly. The ceiling sits a little lower
    than in the other ads: the paper clicks are sharp, and AAC would otherwise push them to -0.5 dBTP."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    L = int(look * SR)
    g = np.minimum(1, ceiling / np.maximum(np.max(np.abs(x), axis=0), 1e-9))
    g = uniform_filter1d(minimum_filter1d(g, size=2 * L + 1, mode='nearest'), size=2 * L + 1, mode='nearest')
    a = np.exp(-1 / (release * SR))
    out = np.empty_like(g)
    prev = 1.0
    for i, v in enumerate(g):
        prev = v if v < prev else a * prev + (1 - a) * v
        out[i] = prev
    return x * out


def write_wav(path, x):
    y = np.clip(x + (rng.random(x.shape) - rng.random(x.shape)) / 32768, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((y.T * 32767).astype('<i2').tobytes())


def lufs(x):
    """Integrated loudness via ffmpeg's EBU R128 meter (falls back to an RMS estimate without ffmpeg)."""
    ff = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if not ff:
        return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12) - 0.7
    tmp = OUT + '.tmp.wav'
    write_wav(tmp, x)
    r = subprocess.run([ff, '-hide_banner', '-nostats', '-i', tmp, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    os.remove(tmp)
    return float([ln for ln in r.stderr.splitlines() if ln.strip().startswith('I:')][-1].split()[1])


TARGET = -14.0
mixed *= 10 ** ((TARGET - lufs(mixed)) / 20)
mixed = limit(mixed)
for _ in range(3):
    mixed = limit(mixed * 10 ** ((TARGET - lufs(mixed)) / 20))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
write_wav(OUT, mixed)
for k in GAINS:
    v = BUS[k] * GAINS[k]
    print(f'{k:7s} peak {20 * np.log10(np.max(np.abs(v)) + 1e-12):6.1f} dBFS  rms {20 * np.log10(np.sqrt(np.mean(v ** 2)) + 1e-12):6.1f} dBFS')
print(f'wrote {os.path.normpath(OUT)}  peak {20 * np.log10(np.max(np.abs(mixed))):.2f} dBFS  loudness {lufs(mixed):.1f} LUFS  {N / SR:.3f}s')
