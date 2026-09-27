#!/usr/bin/env python3
"""
Synthesises the 15 s soundtrack (128 BPM, D major) with every hit and sound effect locked to the
same beat grid as the animation in src/main.js. Pure numpy/scipy — no samples, nothing to license.

    python3 tools/make_audio.py            # -> out/soundtrack.wav (48 kHz, 16-bit, ~-14 LUFS)

Cue sheet (beats; 1 beat = 0.46875 s):
   0-4   trade words        kick + snap on every word, Bm
   4-8   5-star / not so much   breakdown: star blips, slide-whistle drop, snare roll + riser
   8     hazard wipe + tape  DROP (D) — tape slams, rips at 9
   9-16  the build           UI pops climb the chord, chip chimes, click at 14, morph whoosh
  16-24  the calls           phone buzz + ringtone at 16.25, notification dings at 18.5..21.5
  24-32  end card            logo impact at 24, CTA pop at 26.5, final chord at 30
"""
import os
import shutil
import subprocess
import wave

import numpy as np
import scipy.signal as sg

SR = 48000
BPM = 128
B = 60 / BPM
DUR = 15.0
N = int(round(SR * DUR))
rng = np.random.default_rng(128)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'out', 'soundtrack.wav')


def b(n):
    return n * B


def tt(dur):
    return np.arange(int(round(dur * SR))) / SR


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}


def n2m(name):  # 'F#4' -> 66
    return 12 * (int(name[-1]) + 1) + NOTE[name[:-1]]


def hz(name):
    return mtof(n2m(name))


def noise(n):
    return rng.standard_normal(n)


def filt(x, kind, f, order=2):
    f = np.clip(np.asarray(f, dtype=float) / (SR / 2), 1e-4, 0.999)
    sos = sg.butter(order, f.item() if f.size == 1 else f, btype=kind, output='sos')
    return sg.sosfilt(sos, x, axis=-1)


def lp(x, f, o=2): return filt(x, 'lowpass', f, o)
def hp(x, f, o=2): return filt(x, 'highpass', f, o)
def bp(x, lo, hi, o=2): return filt(x, 'bandpass', [lo, hi], o)


def svf(x, fc, q=1.0, mode='bp'):
    """Time-varying state-variable filter (TPT form); fc is an array (Hz) or a scalar."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1.0 / q
    a1 = 1 / (1 + g * (g + k))
    y = np.empty_like(x)
    ic1 = ic2 = 0.0
    for i in range(len(x)):
        v3 = x[i] - ic2
        v1 = a1[i] * ic1 + g[i] * a1[i] * v3
        v2 = ic2 + g[i] * v1
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        y[i] = v1 if mode == 'bp' else v2 if mode == 'lp' else x[i] - k * v1 - v2
    return y


def fade(x, a=0.002, r=0.01):
    n = x.shape[-1]
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[n - nr:] *= np.linspace(1, 0, nr)
    return x * e


# ------------------------------------------------------------------ buses + placement
BUS = {k: np.zeros((2, N)) for k in ('drums', 'bass', 'music', 'sfx', 'send')}


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
def kick(punch=1.0):
    t = tt(0.5)
    f = 43 + 125 * np.exp(-t / 0.026) + 28 * np.exp(-t / 0.11)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.24)
    click = hp(noise(len(t)), 2500) * np.exp(-t / 0.0035) * 0.4 * punch
    return fade(np.tanh(1.7 * (body + click)), 0.0005, 0.03)


def clap():
    t = tt(0.4)
    hits = sum(np.exp(-np.maximum(t - d, 0) / 0.0045) * (t >= d) for d in (0, 0.01, 0.021))
    tail = np.exp(-np.maximum(t - 0.03, 0) / 0.1) * (t >= 0.03)
    return fade(bp(noise(len(t)), 850, 5200) * (0.9 * hits + 0.55 * tail), 0.0005, 0.02)


def snare(pitch=1.0):
    t = tt(0.22)
    tone = np.sin(2 * np.pi * 190 * pitch * t) * np.exp(-t / 0.05)
    sn = bp(noise(len(t)), 1500, 7000) * np.exp(-t / 0.07)
    return fade(0.5 * tone + 0.8 * sn, 0.0005, 0.02)


def hat(open_=False):
    t = tt(0.32 if open_ else 0.07)
    metal = sum(np.sign(np.sin(2 * np.pi * f * 1.62 * t + i)) for i, f in enumerate((205.3, 304.4, 369.6, 522.7, 540.0, 800.0))) / 6
    x = hp(0.5 * metal + 0.9 * noise(len(t)), 7200, 4)
    return fade(x * np.exp(-t / (0.085 if open_ else 0.016)), 0.0005, 0.01)


def crash(dur=2.2):
    t = tt(dur)
    metal = sum(np.sign(np.sin(2 * np.pi * f * 2.9 * t + i)) for i, f in enumerate((205.3, 304.4, 369.6, 522.7, 540.0, 800.0))) / 6
    x = hp(noise(len(t)) + 0.35 * metal, 3800, 2)
    x = lp(x, 13000) * np.exp(-t / 0.6) * (1 - np.exp(-t / 0.002))
    return np.stack([x, np.roll(x, 240)])


def boom(dur=1.6, f0=95, f1=31, tau=0.5):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t / 0.09)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau)
    x += lp(noise(len(t)), 700) * np.exp(-t / 0.07) * 0.6
    return fade(np.tanh(1.4 * x), 0.001, 0.2)


def whoosh(dur, f0, f1, peak=0.65, q=1.4, tilt=0.0):
    n = int(dur * SR)
    u = np.linspace(0, 1, n)
    y = svf(noise(n), f0 * (f1 / f0) ** u, q, 'bp')
    env = np.where(u < peak, (u / peak) ** 2, ((1 - u) / (1 - peak)) ** 1.5)
    y = y * env / (np.max(np.abs(y * env)) + 1e-9)
    if tilt:  # stereo movement: pan from -tilt to +tilt
        th = (np.clip(np.linspace(-tilt, tilt, n), -1, 1) + 1) * np.pi / 4
        return np.stack([y * np.cos(th), y * np.sin(th)])
    return y


def additive(f, t, nh, amp_fn, dec_fn, phase=None):
    k = np.arange(1, nh + 1)
    k = k[k * f < SR * 0.45]
    ph = phase if phase is not None else rng.uniform(0, 2 * np.pi, len(k))
    return (np.sin(2 * np.pi * f * np.outer(t, k) + ph[:len(k)]) * (amp_fn(k) * np.exp(-np.outer(t, 1 / dec_fn(k))))).sum(axis=1)


def pluck(notes, dur=0.55, decay=0.32, bright=1.0, voices=3, detune=10, width=0.7):
    """Supersaw-ish pluck: additive saw, higher harmonics die faster (a built-in filter envelope)."""
    t = tt(dur)
    out = np.zeros((2, len(t)))
    for name in notes:
        f = hz(name) if isinstance(name, str) else name
        for v in range(voices):
            off = (v - (voices - 1) / 2)
            fv = f * 2 ** (detune * off / 1200)
            x = additive(fv, t, 48, lambda k: 1 / k, lambda k: decay / (1 + 0.5 * (k - 1) / bright))
            th = (np.clip(off * width, -1, 1) + 1) * np.pi / 4
            out += np.stack([x * np.cos(th), x * np.sin(th)])
    return fade(out / (voices * len(notes)) ** 0.7, 0.002, 0.03)


def pad(notes, dur, att=0.25, rel=0.6, bright=2600, voices=3, detune=12):
    t = tt(dur + rel)
    env = np.minimum(1, t / att) * np.where(t > dur, np.exp(-(t - dur) / (rel / 3)), 1)
    out = np.zeros((2, len(t)))
    for name in notes:
        f = hz(name)
        for v in range(voices):
            off = v - (voices - 1) / 2
            fv = f * 2 ** (detune * off / 1200)
            x = additive(fv, t, 40, lambda k, fv=fv: 1 / k / (1 + (k * fv / bright) ** 2), lambda k: np.full(len(k), 1e9))
            th = (np.clip(off * 0.8, -1, 1) + 1) * np.pi / 4
            out += np.stack([x * np.cos(th), x * np.sin(th)])
    return fade(out * env / (voices * len(notes)) ** 0.7, 0.01, 0.05)


def bass(name, dur=0.2, bright=1.0):
    t = tt(dur)
    f = hz(name)
    saw = additive(f, t, 28, lambda k: 1 / k, lambda k: 0.16 / (1 + 0.3 * (k - 1) / bright))
    sub = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.35)
    return fade(np.tanh(1.3 * (0.45 * saw + 0.95 * sub)), 0.002, 0.025)


def bell(f, dur=1.2, ratio=3.5, index=2.4, decay=0.4):
    t = tt(dur)
    mod = index * np.exp(-t / 0.15) * np.sin(2 * np.pi * f * ratio * t)
    x = np.sin(2 * np.pi * f * t + mod) * np.exp(-t / decay)
    x += 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / (decay / 3))
    return fade(x, 0.001, 0.05)


def marimba(f, dur=0.5):
    t = tt(dur)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.22) + 0.35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.03)
    x += hp(noise(len(t)), 3000) * np.exp(-t / 0.002) * 0.15
    return fade(x, 0.0008, 0.05)


def blip(f, dur=0.18, drop=1.5):
    t = tt(dur)
    ff = f * (1 + (drop - 1) * np.exp(-t / 0.012))
    x = np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / 0.06)
    x += 0.2 * np.sin(4 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / 0.02)
    return fade(x, 0.0008, 0.02)


def pop(f=520):
    t = tt(0.12)
    ff = f * (1.9 - 0.9 * np.minimum(1, t / 0.025))
    x = np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / 0.035)
    return fade(x + hp(noise(len(t)), 2000) * np.exp(-t / 0.002) * 0.25, 0.0005, 0.02)


def tick(f=6000, dur=0.03, tau=0.004):
    t = tt(dur)
    return bp(noise(len(t)), f * 0.6, min(f * 1.6, 20000)) * np.exp(-t / tau)


def snap():
    t = tt(0.09)
    return fade(bp(noise(len(t)), 1800, 6500) * np.exp(-t / 0.012) + 0.3 * np.sin(2 * np.pi * 1100 * t) * np.exp(-t / 0.01), 0.0003, 0.01)


def slide_whistle(dur=0.62, f0=1450, f1=360):
    t = tt(dur)
    u = t / dur
    f = f0 * (f1 / f0) ** (u ** 1.3) * (1 + 0.02 * np.sin(2 * np.pi * 7 * t))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.15 * np.sin(4 * np.pi * np.cumsum(f) / SR)
    return fade(x * np.sin(np.pi * np.minimum(1, u * 1.15)) ** 0.6, 0.01, 0.05)


def bloop(f0=260, f1=1150, dur=0.12):
    t = tt(dur)
    f = f0 * (f1 / f0) ** (t / dur)
    return fade(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / dur), 0.001, 0.01)


def rip(dur=0.3):
    n = int(dur * SR)
    u = np.linspace(0, 1, n)
    gate = (rng.random(n // 60 + 1) > 0.35).repeat(60)[:n] * (0.4 + 0.6 * rng.random(n // 60 + 1).repeat(60)[:n])
    y = svf(noise(n), 9000 * (1200 / 9000) ** u, 1.1, 'bp') * gate
    return fade(y * (1 - u) ** 1.2 / (np.max(np.abs(y)) + 1e-9), 0.001, 0.02)


def buzz(dur):
    t = tt(dur)
    x = lp(np.sign(np.sin(2 * np.pi * 178 * t)), 1100, 2) * (0.55 + 0.45 * np.sin(2 * np.pi * 31 * t))
    x += hp(noise(len(t)), 2500) * 0.05
    return fade(x, 0.012, 0.03)


def riser(dur):
    n = int(dur * SR)
    u = np.linspace(0, 1, n)
    nz = svf(noise(n), 500 * (9000 / 500) ** u, 1.6, 'bp')
    f = 180 * 4 ** u
    tone = sum(np.sin(2 * np.pi * np.cumsum(f * r) / SR) / r for r in (1, 2, 3, 4))
    return fade((0.8 * nz / (np.max(np.abs(nz)) + 1e-9) + 0.12 * tone) * u ** 2.2, 0.01, 0.005)


def rev_cymbal(dur):
    c = crash(dur + 0.2)[0][: int(dur * SR)]
    return fade(c[::-1], 0.01, 0.004)


def shimmer(dur=0.5):
    t = tt(dur)
    out = np.zeros(len(t))
    for i, name in enumerate(('D7', 'F#7', 'A7', 'D8')):
        d = i * 0.05
        out += np.roll(np.sin(2 * np.pi * hz(name) * t) * np.exp(-t / 0.12), int(d * SR)) * (t >= d)
    return fade(out, 0.002, 0.05)


# ------------------------------------------------------------------ arrangement
CHORDS = [  # (start beat, end beat, pad voicing, bass root, arp tones)
    (0, 4, ['B3', 'D4', 'F#4'], 'B1', ['B4', 'D5', 'F#5', 'B5']),
    (4, 8, ['B3', 'D4', 'G4'], 'G1', ['G4', 'B4', 'D5', 'G5']),
    (8, 12, ['A3', 'D4', 'F#4'], 'D2', ['D5', 'F#5', 'A5', 'D6']),
    (12, 16, ['A3', 'C#4', 'E4'], 'A1', ['C#5', 'E5', 'A5', 'C#6']),
    (16, 20, ['B3', 'D4', 'F#4'], 'B1', ['B4', 'D5', 'F#5', 'B5']),
    (20, 22, ['B3', 'D4', 'G4'], 'G1', ['G4', 'B4', 'D5', 'G5']),
    (22, 24, ['A3', 'C#4', 'E4'], 'A1', ['A4', 'C#5', 'E5', 'A5']),
    (24, 28, ['A3', 'D4', 'F#4'], 'D2', ['D5', 'F#5', 'A5', 'D6']),
    (28, 30, ['B3', 'D4', 'G4'], 'G1', ['G4', 'B4', 'D5', 'G5']),
    (30, 32, ['A3', 'D4', 'F#4'], 'D2', ['D5', 'F#5', 'A5', 'D6']),
]


def chord_at(beat):
    for c in CHORDS:
        if c[0] <= beat < c[1]:
            return c
    return CHORDS[-1]


def up(notes, octaves=1):
    return [n[:-1] + str(int(n[-1]) + octaves) for n in notes]


KICKS = [0, 1, 2, 3, 4] + list(range(8, 30))
FULL = lambda beat: beat < 4 or 8 <= beat < 30  # noqa: E731  sections with the full groove

# drums
for k in KICKS:
    place('drums', kick(), b(k), 0.95)
place('drums', kick(1.3), b(30), 1.0)
for c in [1, 3] + list(range(9, 30, 2)):
    place('drums', clap(), b(c), 0.42, 0.0, send=0.35)
for i in range(4 * 2):  # bar 1: 8th hats
    place('drums', hat(), b(i * 0.5), 0.16 if i % 2 else 0.1, 0.25)
for i in range(int(8 * 4), int(30 * 4)):  # bars 3-7(+): 16th hats with accents
    beat = i / 4
    place('drums', hat(), b(beat), [0.13, 0.06, 0.1, 0.06][i % 4], 0.25)
for beat in [x + 0.5 for x in range(0, 4)] + [x + 0.5 for x in range(8, 30)]:
    place('drums', hat(True), b(beat), 0.12, -0.2, send=0.1)
# breakdown snare roll into the drop: 8ths, 16ths then 32nds, rising
roll = [6 + i * 0.5 for i in range(2)] + [7 + i * 0.25 for i in range(2)] + [7.5 + i * 0.125 for i in range(4)]
for j, r in enumerate(roll):
    place('drums', snare(1 + 0.06 * j), b(r), 0.12 + 0.05 * j, 0.0, send=0.25)
for cb in (8, 16, 24):
    place('drums', crash(), b(cb), 0.22, 0.0, send=0.2)
place('drums', crash(2.6), b(30), 0.3, 0.0, send=0.35)

# bass: off-beat 8ths + a pickup 16th, ducked by the kick
for beat16 in range(0, 30 * 4):
    beat = beat16 / 4
    if not FULL(beat):
        continue
    c = chord_at(beat)
    pos = beat16 % 16
    if pos in (2, 6, 10, 14):
        place('bass', bass(c[3], 0.2), b(beat), 0.55)
    elif pos == 15 and beat >= 8:
        place('bass', bass(c[3][:-1] + str(int(c[3][-1]) + 1), 0.1, 1.4), b(beat), 0.35)
place('bass', bass('G1', 0.9), b(4), 0.5)            # breakdown sub under the stars
place('bass', bass('D2', 1.0, 0.8), b(30), 0.6)      # final note

# pads: bar by bar (darker in the breakdown, full afterwards)
for s, e, notes, _, _ in CHORDS:
    bright = 1100 if s == 4 else 2800
    dur = b(e) - b(s)
    place('music', pad(notes, dur, att=0.05 if s != 4 else 0.6, rel=0.9 if e == 32 else 0.25, bright=bright), b(s),
          0.16 if s != 4 else 0.13, 0.0, send=0.25)

# plucks: on the words in bar 1, syncopated in the drop, accents on the end-card beats
pl_beats = [0, 1, 2, 3]
for bar in range(8, 24, 4):
    pl_beats += [bar + p for p in (0, 0.75, 1.5, 2.5, 3.25)]
pl_beats += [24, 25.5, 26.5, 27.5, 28, 30]
for beat in pl_beats:
    notes = chord_at(beat)[2]
    place('music', pluck(notes + up(notes[-1:]), 0.6 if beat < 24 else 1.1, 0.26 if beat < 24 else 0.5), b(beat), 0.34,
          0.0, send=0.3)
# arp: 16ths through the build and the calls (quiet, for motion)
for i in range(8 * 4, 24 * 4):
    beat = i / 4
    tones = chord_at(beat)[4]
    place('music', pluck([tones[i % 4]], 0.22, 0.09, 1.3, voices=1), b(beat), 0.085, 0.35 if i % 2 else -0.35, send=0.2)

# ------------------------------------------------------------------ sound effects on the visual cues
# S1: a snap on every word + a swish ahead of each colour wipe; zoom whoosh into the full stop
for i in range(4):
    place('sfx', snap(), b(i) + 0.01, 0.32, 0.0, send=0.2)
    if i:
        place('sfx', whoosh(0.22, 700, 4000, 0.8), b(i) - 0.19, 0.18, -0.3 + 0.2 * i)
place('sfx', whoosh(0.34, 300, 5000, 0.92, 1.2), b(4) - 0.32, 0.4)
place('sfx', boom(1.2, 80, 30, 0.35), b(4), 0.45)
# S2: star blips climb, then the fall
for i, name in enumerate(('D6', 'E6', 'F#6', 'A6', 'B6')):
    place('sfx', blip(hz(name)), b(4) + 0.04 + i * B / 4, 0.26, -0.4 + 0.2 * i, send=0.3)
place('sfx', whoosh(0.2, 1200, 5000, 0.6), b(6) - 0.02, 0.14)
place('sfx', slide_whistle(), b(6.5), 0.2, 0.1, send=0.3)
for i, name in enumerate(('A5', 'F#5', 'D5', 'A4')):
    place('sfx', blip(hz(name), 0.14, 1.2), b(6.5) + i * 0.06, 0.13, 0.1 + 0.15 * i)
place('sfx', riser(b(8) - b(6.75)), b(6.75), 0.3, 0.0, send=0.2)
place('sfx', whoosh(0.46, 250, 6000, 0.85, 1.0, tilt=0.8), b(7.55) - 0.02, 0.45)
# DROP
place('sfx', boom(1.8, 110, 30, 0.6), b(8), 0.75, 0.0, send=0.15)
place('sfx', whoosh(0.4, 3000, 400, 0.15, 1.2, tilt=-0.9), b(8) - 0.02, 0.35)
place('sfx', whoosh(0.4, 3000, 400, 0.15, 1.2, tilt=0.9), b(8) + 0.07, 0.3)
place('sfx', rip(), b(9), 0.36, -0.45)
place('sfx', rip(), b(9) + 0.05, 0.32, 0.45)
place('sfx', whoosh(0.5, 150, 900, 0.3, 0.9), b(9), 0.3)
for i in range(8):  # wireframe boxes drawing on
    place('sfx', tick(4500 + 400 * i, 0.03, 0.006), b(9.25) + i * 0.05, 0.12, -0.5 + i * 0.12)
# the build: pops climb the chord tones
for beat, name in [(10, 'D6'), (10.5, 'F#6'), (11, 'A6'), (11.5, 'D7'), (12, 'A5'), (12.38, 'C#6'), (12.5, 'E6'), (12.75, 'A6'), (13, 'C#7')]:
    place('sfx', pop(hz(name) / 2), b(beat), 0.34, 0.15, send=0.2)
for i in range(5):
    place('sfx', tick(9000, 0.02, 0.003), b(12) + i * B / 8, 0.09, 0.2)
place('sfx', whoosh(0.7, 400, 3500, 0.5, 2.2), b(11) + 0.12, 0.12, 0.35)   # water through the pipes
place('sfx', bloop(), b(11) + 0.55, 0.3, 0.35, send=0.3)
for beat, name in [(10.25, 'F#6'), (11.25, 'A6'), (12.25, 'C#7'), (13.25, 'E7')]:  # feature chips
    place('sfx', bell(hz(name), 1.0, 3.5, 1.6, 0.3), b(beat), 0.14, -0.5 if beat != 10.25 else 0.5, send=0.4)
    place('sfx', pop(700), b(beat), 0.12, 0.0)
place('sfx', whoosh(0.55, 800, 2500, 0.6, 1.5, tilt=0.5), b(13.3), 0.07)
for d in (0.0, 0.07):  # mouse click
    place('sfx', tick(3500, 0.02, 0.0015), b(14) + d, 0.4, -0.2)
place('sfx', whoosh(0.9, 250, 3200, 0.55, 1.0), b(14.3), 0.3, send=0.15)
place('sfx', whoosh(0.4, 400, 5000, 0.9, 1.2), b(15.25), 0.3)
place('sfx', boom(1.2, 90, 32, 0.3), b(16), 0.4)
# S4: the phone rings — vibration buzz + ringtone — then notification dings
for s, e in [(16.25, 17), (17.25, 18)]:
    place('sfx', buzz(b(e) - b(s)), b(s), 0.12, 0.3)
    for j, name in enumerate(('B5', 'D6', 'F#6')):
        place('sfx', marimba(hz(name)), b(s) + j * B / 4, 0.3, 0.3, send=0.25)
place('sfx', whoosh(0.25, 2000, 600, 0.3), b(18.25) - 0.05, 0.12, 0.3)
for beat in (18.5, 19.5, 20.5, 21.5):
    n1, n2 = ('F#6', 'B6') if beat < 20 else ('D6', 'G6')
    place('sfx', bell(hz(n1), 0.9, 2.0, 1.2, 0.28), b(beat), 0.2, 0.1, send=0.3)
    place('sfx', bell(hz(n2), 1.1, 2.0, 1.2, 0.35), b(beat) + 0.09, 0.2, 0.1, send=0.3)
    place('sfx', whoosh(0.22, 900, 3000, 0.5), b(beat) - 0.03, 0.08, -0.2)
# S5: bars drop, logo, CTA, final chord
place('sfx', rev_cymbal(b(24) - b(22.5)), b(22.5), 0.25)
for i in range(8):
    place('sfx', tick(2500 + 250 * i, 0.04, 0.01), b(23) - 0.02 + i * 0.03, 0.2, -0.7 + i * 0.2)
place('sfx', boom(2.0, 120, 30, 0.6), b(24), 0.75, 0.0, send=0.2)
place('sfx', whoosh(0.45, 300, 4000, 0.4, 1.0), b(24), 0.2)
place('sfx', whoosh(0.35, 1500, 6000, 0.5, 1.4, tilt=0.7), b(24) + 0.5, 0.16)
place('sfx', whoosh(0.3, 900, 4000, 0.5, 1.2), b(25.5) - 0.02, 0.1)
place('sfx', pop(420), b(26.5), 0.4, 0.0, send=0.2)
place('sfx', bell(hz('D7'), 1.2, 3.5, 1.5, 0.35), b(26.5) + 0.02, 0.12, 0.0, send=0.4)
for beat in (28.2, 30.2):
    place('sfx', shimmer(), b(beat), 0.07, 0.3, send=0.5)
place('sfx', boom(2.2, 110, 30, 0.7), b(30), 0.7, 0.0, send=0.3)

# ------------------------------------------------------------------ mix
# sidechain: duck the tonal buses under every kick
duck = np.ones(N)
t_all = np.arange(N) / SR
for k in KICKS + [30]:
    t0 = b(k)
    i0 = int(t0 * SR)
    seg = t_all[i0:] - t0
    g = 1 - 0.62 * np.exp(-seg / 0.1) * np.minimum(1, seg / 0.004 + 0.3)
    duck[i0:] = np.minimum(duck[i0:], g)
for bus in ('bass', 'music'):
    BUS[bus] *= duck

# reverb: stereo exponentially decaying noise IR
ir_t = tt(1.6)
ir = np.stack([lp(noise(len(ir_t)), 5500) * np.exp(-ir_t / 0.32) for _ in range(2)])
ir[:, : int(0.012 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
verb = np.stack([sg.fftconvolve(BUS['send'][c], ir[c])[:N] for c in range(2)]) * 0.5

GAINS = {'drums': 0.75, 'bass': 1.1, 'music': 1.5, 'sfx': 1.15}
mixed = sum(BUS[k] * g for k, g in GAINS.items()) + verb
mixed = hp(mixed, 28, 2)
mixed[:, -int(0.25 * SR):] *= np.linspace(1, 0, int(0.25 * SR)) ** 1.5  # clean tail to silence at 15.0 s


def limit(x, ceiling=0.89, look=0.004, release=0.05):
    """Look-ahead peak limiter: gain drops before each peak (min + moving-average window), recovers slowly."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    L = int(look * SR)
    peak = np.max(np.abs(x), axis=0)
    g = np.minimum(1, ceiling / np.maximum(peak, 1e-9))
    g = minimum_filter1d(g, size=2 * L + 1, mode='nearest')
    g = uniform_filter1d(g, size=2 * L + 1, mode='nearest')
    a = np.exp(-1 / (release * SR))
    out = np.empty_like(g)
    prev = 1.0
    for i, v in enumerate(g):  # instant attack, smooth release
        prev = v if v < prev else a * prev + (1 - a) * v
        out[i] = prev
    return x * out


def lufs(x):
    """Integrated loudness via ffmpeg's EBU R128 meter (falls back to RMS if ffmpeg is missing)."""
    ff = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if not ff:
        return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12) - 0.7
    tmp = OUT + '.tmp.wav'
    write_wav(tmp, x)
    r = subprocess.run([ff, '-hide_banner', '-nostats', '-i', tmp, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    os.remove(tmp)
    line = [l for l in r.stderr.splitlines() if l.strip().startswith('I:')][-1]
    return float(line.split()[1])


def write_wav(path, x):
    y = np.clip(x + (rng.random(x.shape) - rng.random(x.shape)) / 32768, -1, 1)  # TPDF dither
    pcm = (y.T * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


TARGET = -14.0
mixed = limit(mixed * 0.9)
for _ in range(3):
    gain = 10 ** ((TARGET - lufs(mixed)) / 20)
    mixed = limit(mixed * gain)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
write_wav(OUT, mixed)
for k in ('drums', 'bass', 'music', 'sfx'):
    v = BUS[k] * GAINS[k]
    print(f'{k:6s} peak {20 * np.log10(np.max(np.abs(v)) + 1e-12):6.1f} dBFS  rms {20 * np.log10(np.sqrt(np.mean(v ** 2)) + 1e-12):6.1f} dBFS')
print(f'wrote {os.path.normpath(OUT)}  peak {20 * np.log10(np.max(np.abs(mixed))):.2f} dBFS  loudness {lufs(mixed):.1f} LUFS  {N / SR:.3f}s')
