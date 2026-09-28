#!/usr/bin/env python3
"""
Chiptune soundtrack for "Næste level" (144 BPM, 36 beats = 15 s), written for this ad: two pulse channels,
a 4-bit triangle bass and LFSR noise drums with 4-bit volume steps, like an old game console. Every sound
effect is placed from out/cues.json, which the page itself exports, so each sound lands on the frame that
shows it.

    node tools/render.mjs --cues && python3 tools/make_audio.py     # -> out/soundtrack.wav (48 kHz, ~-14 LUFS)

Music (beats):  0-4 fanfare · 4-12 sneaky A minor groove while he is stuck · 12-18 suspense, power-up and the
LEVEL UP jingle · 18-28 main theme in C major for the climb · 28-30 victory fanfare · 30-36 end card outro.
"""
import json
import os
import shutil
import subprocess
import wave

import numpy as np
import scipy.signal as sg

SR = 48000
BPM = 144
B = 60 / BPM
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'out', 'soundtrack.wav')
CUES = json.load(open(os.path.join(HERE, '..', 'out', 'cues.json'), encoding='utf-8'))
DUR = CUES['DUR']
N = int(round(SR * DUR))
rng = np.random.default_rng(144)


def b(n):
    return n * B


NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}


def hz(x):
    if not isinstance(x, str):
        return float(x)
    return 440.0 * 2 ** ((12 * (int(x[-1]) + 1) + NOTE[x[:-1]] - 69) / 12)


# ------------------------------------------------------------------ the sound chip
def _blep(t, dt):
    """PolyBLEP correction, so the square edges don't alias into ugly inharmonic tones."""
    out = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    out[m] = x + x - x * x - 1
    m = t > 1 - dt
    x = (t[m] - 1) / dt[m]
    out[m] = x * x + x + x + 1
    return out


def pulse(freq, n, duty=0.5):
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    dt = np.clip(f / SR, 1e-6, 0.49)
    ph = np.cumsum(dt) % 1.0
    y = np.where(ph < duty, 1.0, -1.0)
    return y + _blep(ph, dt) - _blep((ph - duty) % 1.0, dt)


def tri(freq, n):
    """Triangle in 16 steps, the gritty bass of old consoles."""
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    ph = np.cumsum(f / SR) % 1.0
    y = 1 - 4 * np.abs(ph - 0.5)
    return np.floor((y + 1) / 2 * 15.999) / 7.5 - 1


def _lfsr(tap):
    reg, out = 1, np.empty(32767, np.int8)
    for i in range(32767):
        bit = (reg ^ (reg >> tap)) & 1
        reg = (reg >> 1) | (bit << 14)
        out[i] = reg & 1
    return out.astype(float) * 2 - 1


LONG, SHORT = _lfsr(1), _lfsr(6)[:93]


def noise(n, clock, short=False):
    seq = SHORT if short else LONG
    c = np.broadcast_to(np.asarray(clock, float), (n,))
    return seq[(np.cumsum(c / SR)).astype(np.int64) % len(seq)]


def tt(sec):
    return np.arange(int(round(sec * SR))) / SR


def chunky(e):
    """4-bit volume, updated 240 times a second."""
    step = SR // 240
    q = np.round(e[::step] * 15) / 15
    return np.repeat(q, step)[: len(e)]


def env(n, a=0.004, d=0.15, s=0.55, rel=0.03):
    t = np.arange(n) / SR
    e = np.minimum(1, t / a) * (s + (1 - s) * np.exp(-t / d))
    nr = min(n, int(rel * SR))
    if nr:
        e[n - nr:] *= np.linspace(1, 0, nr)
    return chunky(e)


def tone(kind, note, dur, duty=0.5, vib=0.0, a=0.004, d=0.15, s=0.55, rel=0.03):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(note) * 2 ** ((vib / 12) * np.sin(2 * np.pi * 6.5 * t) * np.clip((t - 0.12) / 0.1, 0, 1))
    y = pulse(f, n, duty) if kind == 'pulse' else tri(f, n)
    return y * env(n, a, d, s, rel)


def sweep(f0, f1, dur, duty=0.5, curve=1.0, decay=None):
    t = tt(dur)
    u = (t / dur) ** curve
    y = pulse(f0 * (f1 / f0) ** u, len(t), duty)
    e = np.ones(len(t)) if decay is None else np.exp(-t / decay)
    return y * chunky(e * np.minimum(1, t / 0.003))


# ------------------------------------------------------------------ buses
BUS = {k: np.zeros((2, N)) for k in ('lead', 'harm', 'bass', 'drums', 'sfx', 'echo')}


def place(bus, x, t0, gain=1.0, pan=0.0, echo=0.0):
    th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    x = np.stack([x * np.cos(th), x * np.sin(th)])
    i0 = int(round(t0 * SR))
    n = min(x.shape[1], N - i0)
    if n <= 0 or i0 < 0:
        return
    BUS[bus][:, i0:i0 + n] += gain * x[:, :n]
    if echo:
        BUS['echo'][:, i0:i0 + n] += gain * echo * x[:, :n]


def seq(bus, notes, kind='pulse', duty=0.5, gain=1.0, pan=0.0, echo=0.0, **kw):
    """notes: (start beat, length in beats, note) — the note sounds for 90 % of its slot."""
    for beat, length, note in notes:
        if note is None:
            continue
        place(bus, tone(kind, note, b(length) * 0.92, duty, **kw), b(beat), gain, pan, echo)


# ------------------------------------------------------------------ drums
def kick():
    t = tt(0.2)
    y = tri(45 + 150 * np.exp(-t / 0.028), len(t)) * chunky(np.exp(-t / 0.09))
    return y + noise(len(t), 22000) * np.exp(-t / 0.005) * 0.5


def snare():
    t = tt(0.17)
    return noise(len(t), 9500) * chunky(np.exp(-t / 0.055)) + pulse(np.full(len(t), 185.0), len(t), 0.5) * np.exp(-t / 0.02) * 0.35


def hat(open_=False):
    t = tt(0.1 if open_ else 0.035)
    return noise(len(t), 42000, short=True) * chunky(np.exp(-t / (0.035 if open_ else 0.009)))


def crash(dur=0.9):
    t = tt(dur)
    return noise(len(t), 32000) * chunky(np.exp(-t / 0.28))


def drums(kicks, snares, hats=(), opens=(), crashes=(), gain=1.0):
    for k in kicks:
        place('drums', kick(), b(k), 0.95 * gain)
    for s in snares:
        place('drums', snare(), b(s), 0.55 * gain)
    for h in hats:
        place('drums', hat(), b(h), 0.18 * gain, 0.2)
    for o in opens:
        place('drums', hat(True), b(o), 0.2 * gain, -0.2)
    for c in crashes:
        place('drums', crash(), b(c), 0.3 * gain)


def rng_beats(a, z, step):
    return list(np.arange(a, z - 1e-9, step))


# ------------------------------------------------------------------ music
# 0-4 · title fanfare
seq('lead', [(0, 0.5, 'G4'), (0.5, 0.5, 'C5'), (1, 0.5, 'E5'), (1.5, 0.5, 'G5'), (2, 1.5, 'C6')], duty=0.5, gain=0.3, vib=0.25, echo=0.4)
seq('harm', [(0, 0.5, 'E4'), (0.5, 0.5, 'G4'), (1, 0.5, 'C5'), (1.5, 0.5, 'E5'), (2, 1.5, 'G5')], duty=0.25, gain=0.2, pan=0.35)
seq('bass', [(0, 2, 'C3'), (2, 1.5, 'C2')], kind='tri', gain=0.55, s=0.9)
drums([0, 2], [3, 3.25], hats=rng_beats(0, 3.5, 0.5), crashes=[0, 2], gain=0.8)

# 4-12 · sneaky A minor groove while he is stuck (Am | G | F | E, two beats each)
bass_stuck = []
for i, (r, f) in enumerate([('A2', 'E2'), ('G2', 'D2'), ('F2', 'C3'), ('E2', 'B2')]):
    s0 = 4 + 2 * i
    bass_stuck += [(s0, 0.5, r), (s0 + 0.5, 0.5, r), (s0 + 1, 0.5, f), (s0 + 1.5, 0.5, r)]
seq('bass', bass_stuck, kind='tri', gain=0.55, s=0.8)
seq('lead', [(4, 0.5, 'A4'), (5, 0.5, 'C5'), (5.5, 0.5, 'E5'), (6, 0.5, 'D5'), (7, 0.5, 'B4'), (7.5, 0.5, 'G4'),
             (8, 0.5, 'A4'), (9, 0.5, 'C5'), (9.5, 0.5, 'F5'), (10, 1, 'E5'), (11, 0.5, 'G#4')], duty=0.25, gain=0.22, echo=0.3)
seq('harm', [(s + 0.5, 0.25, n) for s, n in zip(range(4, 12), ['C5', 'E5', 'B4', 'D5', 'A4', 'C5', 'G#4', 'B4'])], duty=0.125, gain=0.14, pan=0.4)
drums([4, 5.5, 6, 7.5, 8, 9.5, 10], [5, 7, 9], hats=rng_beats(4, 11, 0.5))
drums([], [11 + i / 4 for i in range(4)], gain=0.7)  # roll into the power-up
place('sfx', sweep(200, 900, b(1), 0.125, 1.5) * 0.25, b(11))

# 12-18 · suspense trill, the power-up, then the LEVEL UP jingle
seq('harm', [(12 + i / 4, 0.25, 'C5' if i % 2 else 'D5') for i in range(10)], duty=0.125, gain=0.1, pan=0.3)
seq('bass', [(12, 2.4, 'C2')], kind='tri', gain=0.45, s=0.9)
seq('lead', [(16, 0.25, 'C5'), (16.25, 0.25, 'E5'), (16.5, 0.25, 'G5'), (16.75, 1.25, 'C6')], duty=0.5, gain=0.3, vib=0.25, echo=0.4)
seq('harm', [(16, 0.25, 'G4'), (16.25, 0.25, 'C5'), (16.5, 0.25, 'E5'), (16.75, 1.25, 'G5')], duty=0.25, gain=0.2, pan=0.35)
seq('bass', [(16, 1, 'C3'), (17, 1, 'G2')], kind='tri', gain=0.55, s=0.85)
drums([16], [17 + i / 4 for i in range(4)], crashes=[16], gain=0.9)

# 18-28 · main theme for the climb (C | G | Am | F G), octave bass, 16th arpeggios, lead from beat 20
CHORDS = [(18, 'C', ['C5', 'E5', 'G5', 'C6'], ('C2', 'C3')), (20, 'C', ['C5', 'E5', 'G5', 'C6'], ('C2', 'C3')),
          (22, 'G', ['B4', 'D5', 'G5', 'B5'], ('G1', 'G2')), (24, 'Am', ['C5', 'E5', 'A5', 'C6'], ('A1', 'A2')),
          (26, 'F', ['C5', 'F5', 'A5', 'C6'], ('F1', 'F2'))]
for s0, _, arp, (lo, hi) in CHORDS:
    span = 2
    seq('harm', [(s0 + i / 4, 0.25, arp[i % 4]) for i in range(span * 4)], duty=0.125, gain=0.11, pan=0.35, d=0.05, s=0.3)
    seq('bass', [(s0 + i / 2, 0.5, lo if i % 2 == 0 else hi) for i in range(span * 2)], kind='tri', gain=0.55, s=0.8)
seq('harm', [(27 + i / 4, 0.25, ['B4', 'D5', 'G5', 'D6'][i % 4]) for i in range(4)], duty=0.125, gain=0.11, pan=0.35, d=0.05, s=0.3)
seq('bass', [(27, 0.5, 'G1'), (27.5, 0.5, 'G2')], kind='tri', gain=0.55, s=0.8)
seq('lead', [(20, 1, 'G5'), (21, 0.5, 'C6'), (21.5, 0.5, 'E6'), (22, 1, 'D6'), (23, 0.5, 'B5'), (23.5, 0.5, 'G5'),
             (24, 0.5, 'A5'), (24.5, 0.5, 'C6'), (25, 1, 'E6'), (26, 0.5, 'F6'), (26.5, 0.5, 'E6'), (27, 0.5, 'D6'), (27.5, 0.5, 'B5')],
    duty=0.25, gain=0.24, vib=0.2, echo=0.35, pan=-0.1)
drums(rng_beats(18, 28, 1), rng_beats(19, 28, 2), hats=rng_beats(18, 28, 0.25), opens=rng_beats(18.5, 28, 1), crashes=[18, 20, 24])

# 28-30 · victory fanfare
seq('lead', [(28, 1 / 3, 'C6'), (28 + 1 / 3, 1 / 3, 'E6'), (28 + 2 / 3, 1 / 3, 'G6'), (29, 1.25, 'C7')], duty=0.5, gain=0.26, vib=0.25, echo=0.45)
seq('harm', [(28, 1 / 3, 'G5'), (28 + 1 / 3, 1 / 3, 'C6'), (28 + 2 / 3, 1 / 3, 'E6'), (29, 1.25, 'G6')], duty=0.25, gain=0.17, pan=0.35)
seq('bass', [(28, 1, 'C3'), (29, 1.25, 'C2')], kind='tri', gain=0.55, s=0.9)
drums([28, 29], [28.5, 28.75], crashes=[28], gain=0.9)

# 30-36 · end card outro: soft groove, a little tune for the CTA, final chord on beat 34
seq('bass', [(30.5, 1.5, 'C2'), (32, 1, 'F2'), (33, 1, 'G2'), (34, 2, 'C2')], kind='tri', gain=0.5, s=0.85)
for s0, arp in [(30.5, ['C5', 'E5', 'G5', 'E5']), (32, ['C5', 'F5', 'A5', 'F5']), (33, ['B4', 'D5', 'G5', 'D5'])]:
    seq('harm', [(s0 + i / 4, 0.25, arp[i % 4]) for i in range(int((2 if s0 == 30.5 else 1) * 4) - (2 if s0 == 30.5 else 0))], duty=0.125, gain=0.09, pan=0.35, d=0.05, s=0.3)
seq('lead', [(32.5, 0.5, 'E5'), (33, 0.5, 'F5'), (33.5, 0.5, 'G5'), (34, 1.8, 'C6')], duty=0.25, gain=0.2, vib=0.25, echo=0.4)
seq('harm', [(34, 1.8, 'E5'), (34, 1.8, 'G5')], duty=0.5, gain=0.1, pan=0.35, s=0.7)
drums([30.5, 31.5, 32, 33, 34], [31, 33], hats=rng_beats(30.5, 34, 0.5), crashes=[34], gain=0.7)


# ------------------------------------------------------------------ sound effects from the page's cue list
PENTA = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7']


def blip():
    return tone('pulse', 'E6', 0.018, 0.125, d=0.01, s=0.2, rel=0.004)


def arp(notes, step, duty=0.125, d=0.02):
    return np.concatenate([tone('pulse', n, step, duty, d=d, s=0.4, rel=0.004) for n in notes])


def boing(big):
    t = tt(0.4 if big else 0.2)
    f = 420 * (140 / 420) ** np.minimum(1, t / 0.09) * 2 ** (np.sin(2 * np.pi * 14 * t) * (0.35 if big else 0.15) * np.exp(-t / 0.15))
    y = pulse(f, len(t), 0.5) * chunky(np.exp(-t / (0.14 if big else 0.07)))
    return y + noise(len(t), 6000) * np.exp(-t / 0.01) * 0.6


def thud():
    t = tt(0.1)
    return tri(90 * (50 / 90) ** (t / 0.1), len(t)) * np.exp(-t / 0.04) + noise(len(t), 3000) * np.exp(-t / 0.012) * 0.4


def firework():
    t = tt(0.6)
    y = noise(len(t), 12000) * chunky(np.exp(-t / 0.05))
    for k in range(9):  # crackle
        s0 = int((0.12 + 0.05 * k + rng.random() * 0.03) * SR)
        n = int(0.012 * SR)
        if s0 + n < len(y):
            y[s0:s0 + n] += noise(n, 30000) * 0.45 * (1 - k / 10)
    return y


def smash():
    t = tt(0.9)
    y = noise(len(t), 20000 * (1500 / 20000) ** np.minimum(1, t / 0.5)) * chunky(np.exp(-t / 0.22))
    return y + tri(130 * (35 / 130) ** np.minimum(1, t / 0.25), len(t)) * np.exp(-t / 0.3) * 0.9


SFX = {
    'blip': lambda c: (blip(), 0.1, 0.0),
    'letter': lambda c: (tone('pulse', PENTA[c.get('i', 0) % len(PENTA)], 0.05, 0.25, d=0.02, s=0.3, rel=0.005), 0.14, 0.0),
    'start': lambda c: (np.concatenate([tone('pulse', 'A5', 0.07, 0.5, d=0.04, s=0.5), tone('pulse', 'A6', 0.3, 0.5, d=0.1, s=0.2)]), 0.28, 0.0),
    'iris': lambda c: (sweep(300, 1400, 0.22, 0.25, 1.0, 0.12), 0.14, 0.0),
    'jump': lambda c: (sweep(280, 950, 0.13, 0.25, 0.7, 0.08), 0.24, 0.0),
    'bonk': lambda c: (boing(c.get('big')), 0.42 if c.get('big') else 0.36, 0.0),
    'land': lambda c: (thud(), 0.35, 0.0),
    'dizzy': lambda c: (pulse(1500 * 2 ** (np.sin(2 * np.pi * 10 * tt(0.55)) * 0.3 - tt(0.55) * 0.9), len(tt(0.55)), 0.125) * chunky(np.exp(-tt(0.55) / 0.3)), 0.12, 0.3),
    'item': lambda c: (arp(['C7', 'G6', 'E6', 'C6', 'E6', 'G6', 'C7', 'E7'], 0.035), 0.16, 0.3),
    'powerup': lambda c: (arp(['C4', 'G4', 'E4', 'C5', 'G4', 'E5', 'C5', 'G5', 'E5', 'C6', 'G5', 'E6', 'C6', 'G6'], 0.06, 0.5, 0.05), 0.26, 0.0),
    'levelup': lambda c: (arp(['C7', 'E7', 'G7', 'C7'], 0.03), 0.1, 0.4),
    'charge': lambda c: (sweep(150, 1400, B, 0.5, 1.4) * (0.6 + 0.4 * np.sin(2 * np.pi * 24 * tt(B))[: int(B * SR)]), 0.16, 0.0),
    'superjump': lambda c: (sweep(400, 2200, 0.15, 0.25, 0.8, 0.12), 0.26, 0.0),
    'smash': lambda c: (smash(), 0.7, 0.0),
    'feature': lambda c: (tone('pulse', 'C7', 0.3, 0.5, d=0.08, s=0.1) + tone('tri', 'C6', 0.3, d=0.1, s=0.2) * 0.8, 0.22, 0.0),
    'token': lambda c: (arp(['C7', 'E7', 'G7'], 0.025), 0.12, 0.0),
    'firework': lambda c: (firework(), 0.3, 0.0),
    'irisout': lambda c: (sweep(1200, 180, 0.4, 0.25, 0.8, 0.25), 0.16, 0.0),
    'logo': lambda c: (thud() * 1.4, 0.4, 0.0),
    'cta': lambda c: (np.concatenate([tone('pulse', 'E6', 0.12, 0.5, d=0.06, s=0.3), tone('pulse', 'C6', 0.3, 0.5, d=0.1, s=0.2)]), 0.2, 0.0),
}
pans = {'token': 0.25, 'firework': -0.3}
for c in CUES['cues']:
    fn = SFX.get(c['type'])
    if fn:
        x, g, echo = fn(c)
        pan = pans.get(c['type'], 0.0) * (1 if int(c['t'] * 10) % 2 else -1)
        place('sfx', x, c['t'], g, pan, echo)


# ------------------------------------------------------------------ mix + master
def delay(x, sec, fb=0.35, n_taps=4):
    out = np.zeros_like(x)
    d = int(sec * SR)
    for k in range(1, n_taps + 1):
        g = fb ** k
        sh = d * k
        if sh >= x.shape[1]:
            break
        src = x[::-1] if k % 2 else x  # ping-pong: odd repeats swap sides
        out[:, sh:] += g * src[:, : x.shape[1] - sh]
    return out


GAINS = {'lead': 1.6, 'harm': 1.4, 'bass': 0.65, 'drums': 0.72, 'sfx': 1.0}
mixed = sum(BUS[k] * g for k, g in GAINS.items()) + delay(BUS['echo'], b(0.75), 0.35) * 0.8
mixed = sg.sosfilt(sg.butter(2, 30 / (SR / 2), 'highpass', output='sos'), mixed, axis=-1)
mixed = sg.sosfilt(sg.butter(2, 14000 / (SR / 2), 'lowpass', output='sos'), mixed, axis=-1)
mixed[:, -int(0.3 * SR):] *= np.linspace(1, 0, int(0.3 * SR)) ** 1.5


def limit(x, ceiling=0.89, look=0.004, release=0.05):
    """Look-ahead peak limiter: gain drops before each peak, recovers smoothly."""
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
    print(f'{k:6s} peak {20 * np.log10(np.max(np.abs(v)) + 1e-12):6.1f} dBFS  rms {20 * np.log10(np.sqrt(np.mean(v ** 2)) + 1e-12):6.1f} dBFS')
print(f'wrote {os.path.normpath(OUT)}  peak {20 * np.log10(np.max(np.abs(mixed))):.2f} dBFS  loudness {lufs(mixed):.1f} LUFS  {N / SR:.3f}s')
