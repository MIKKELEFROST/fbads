#!/usr/bin/env python3
"""
Soundtrack for "Døgnet rundt" (96 BPM, F major, 24 beats = 15 s), synthesised for this ad in numpy/scipy:
FM electric piano, a warm pad, sine sub bass and a soft beat, with the clock, the night's bookings, the dawn
and the end card scored from out/cues.json, which the page itself exports.

    node tools/render.mjs --cues && python3 tools/make_audio.py     # -> out/soundtrack.wav (48 kHz, ~-14 LUFS)
    python3 tools/make_audio.py --vo=vo/da                          # -> out/soundtrack-da.wav (+ Danish voice-over)

Music (beats):  0-4 dusk, Fmaj9 and a ticking clock · 4-6.5 the clock races through the evening (riser)
· 7-15 night groove Dm9 | Bbmaj9 | Fmaj9 | C6/9, a bell for every booking · 15-18.5 dawn opens up
Bbmaj7 → C → Fmaj9, birds · 18.5-24 end card Fmaj9 → Bbmaj9 → Fmaj9.

The music has no words; --vo lays the voice-over lines from vo/<lang>/cues.json (made by make_vo.py) on
top and ducks the music under them.
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
BPM = 96
B = 60 / BPM
HERE = os.path.dirname(os.path.abspath(__file__))
VO_DIR = os.path.join(HERE, '..', ARGS.vo) if ARGS.vo else None
VO = json.load(open(os.path.join(VO_DIR, 'cues.json'), encoding='utf-8')) if VO_DIR else None
OUT = os.path.join(HERE, '..', 'out', f"soundtrack-{VO['lang']}.wav" if VO else 'soundtrack.wav')
CUES = json.load(open(os.path.join(HERE, '..', 'out', 'cues.json'), encoding='utf-8'))
DUR = CUES['DUR']
N = int(round(SR * DUR))
rng = np.random.default_rng(96)


def b(n):
    return n * B


NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def hz(x):
    return 440.0 * 2 ** ((12 * (int(x[-1]) + 1) + NOTE[x[:-1]] - 69) / 12)


def tt(sec):
    return np.arange(int(round(sec * SR))) / SR


def filt(x, kind, f, order=2):
    f = np.clip(np.asarray(f, dtype=float) / (SR / 2), 1e-4, 0.999)
    return sg.sosfilt(sg.butter(order, f.item() if f.size == 1 else f, btype=kind, output='sos'), x, axis=-1)


def fade(x, a=0.003, r=0.02):
    n = x.shape[-1]
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[n - nr:] *= np.linspace(1, 0, nr)
    return x * e


# ------------------------------------------------------------------ buses
BUS = {k: np.zeros((2, N)) for k in ('keys', 'pad', 'bass', 'drums', 'fx', 'vo', 'send')}


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
def epiano(name, dur, vel=1.0):
    """Two-operator FM electric piano: a 1:1 pair for the body, a 14:1 tine that barks on the attack."""
    t = tt(dur + 0.6)
    f = hz(name) * (1 + (rng.random() - 0.5) * 0.002)
    body = np.sin(2 * np.pi * f * t + (1.8 * vel) * np.exp(-t / 0.45) * np.sin(2 * np.pi * f * t))
    tine = np.sin(2 * np.pi * f * t + 1.2 * vel * np.exp(-t / 0.04) * np.sin(2 * np.pi * 14 * f * t)) * np.exp(-t / 0.08)
    env = np.minimum(1, t / 0.003) * np.exp(-t / 1.6) * np.where(t > dur, np.exp(-(t - dur) / 0.12), 1)
    return fade((0.8 * body + 0.35 * tine) * env * vel, 0.002, 0.05)


def chord_keys(notes, beat, length, vel=0.8, spread=0.012):
    for i, n in enumerate(notes):  # a slight strum, low to high, panned across
        pan = -0.35 + 0.7 * i / max(1, len(notes) - 1)
        place('keys', epiano(n, b(length), vel), b(beat) + i * spread, 0.16, pan, send=0.35)


def pad(notes, t0, t1, cut0=900, cut1=900, att=0.6, rel=0.9):
    """Detuned saw stack through a moving low-pass."""
    dur = t1 - t0
    t = tt(dur + rel)
    out = np.zeros((2, len(t)))
    for i, n in enumerate(notes):
        f = hz(n)
        for v, det in enumerate((-7, 0, 7)):
            ph = rng.uniform(0, 2 * np.pi)
            fv = f * 2 ** (det / 1200)
            x = sum(np.sin(2 * np.pi * fv * k * t + ph * k) / k for k in range(1, 12) if fv * k < 12000)
            th = (np.clip((v - 1) * 0.7 + (i - len(notes) / 2) * 0.1, -1, 1) + 1) * np.pi / 4
            out += np.stack([x * np.cos(th), x * np.sin(th)])
    cut = np.interp(t, [0, dur], [cut0, cut1])
    # time-varying low-pass: filter in short blocks with the cutoff of each block
    y = np.zeros_like(out)
    blk = 2048
    zi = None
    for s0 in range(0, len(t), blk):
        sos = sg.butter(2, min(0.99, cut[s0] / (SR / 2)), 'lowpass', output='sos')
        if zi is None:
            zi = np.zeros((sos.shape[0], 2, 2))
        seg, zi = sg.sosfilt(sos, out[:, s0:s0 + blk], axis=-1, zi=zi)
        y[:, s0:s0 + blk] = seg
    env = np.minimum(1, t / att) * np.where(t > dur, np.exp(-(t - dur) / (rel / 3)), 1)
    return fade(y * env / (3 * len(notes)) ** 0.7, 0.01, 0.1)


def sub(name, dur):
    t = tt(dur + 0.1)
    f = hz(name)
    x = np.sin(2 * np.pi * f * t) + 0.15 * np.sin(4 * np.pi * f * t)
    env = np.minimum(1, t / 0.02) * np.where(t > dur, np.exp(-(t - dur) / 0.04), 1)
    return fade(np.tanh(1.4 * x) * env, 0.005, 0.03)


def bell(name, dur=1.8, ratio=3.5, index=2.2):
    t = tt(dur)
    f = hz(name)
    x = np.sin(2 * np.pi * f * t + index * np.exp(-t / 0.25) * np.sin(2 * np.pi * f * ratio * t)) * np.exp(-t / 0.55)
    x += 0.3 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.2)
    return fade(x, 0.001, 0.1)


def kick():
    t = tt(0.35)
    return fade(np.sin(2 * np.pi * np.cumsum(48 + 60 * np.exp(-t / 0.04)) / SR) * np.exp(-t / 0.22), 0.001, 0.05)


def snap():
    t = tt(0.2)
    n = filt(rng.standard_normal(len(t)), 'bandpass', [1500, 6000])
    return fade(n * (np.exp(-t / 0.035) + 0.3 * np.exp(-np.maximum(t - 0.012, 0) / 0.02) * (t > 0.012)) + 0.25 * np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.015), 0.0005, 0.03)


def shaker():
    t = tt(0.06)
    return fade(filt(rng.standard_normal(len(t)), 'highpass', 6000) * np.minimum(1, t / 0.01) * np.exp(-t / 0.02), 0.001, 0.01)


def hat():
    t = tt(0.08)
    return fade(filt(rng.standard_normal(len(t)), 'highpass', 8000) * np.exp(-t / 0.018), 0.0005, 0.01)


def tick(high=True):
    t = tt(0.05)
    f = 3200 if high else 2100
    click = filt(rng.standard_normal(len(t)), 'bandpass', [f * 0.7, f * 1.4]) * np.exp(-t / 0.004)
    return fade(click + 0.35 * np.sin(2 * np.pi * f * 0.6 * t) * np.exp(-t / 0.008), 0.0003, 0.01)


def swell(dur, f0, f1, peak=0.85):
    n = int(dur * SR)
    u = np.linspace(0, 1, n)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 512
    zi = np.zeros((1, 2))
    for s0 in range(0, n, blk):  # band-pass that sweeps from f0 to f1, its state carried from block to block
        fc = f0 * (f1 / f0) ** u[s0]
        sos = sg.butter(1, [fc * 0.6 / (SR / 2), min(fc * 1.6, 20000) / (SR / 2)], btype='bandpass', output='sos')
        out[s0:s0 + blk], zi = sg.sosfilt(sos, x[s0:s0 + blk], zi=zi)
    env = np.where(u < peak, (u / peak) ** 2, ((1 - u) / (1 - peak)) ** 1.5)
    return out * env / (np.max(np.abs(out * env)) + 1e-9)


def chirp():
    t = tt(0.09)
    f = 3400 + 1300 * np.sin(np.pi * t / 0.09) + 200 * np.sin(2 * np.pi * 40 * t)
    return fade(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.09) ** 2, 0.002, 0.01)


# ------------------------------------------------------------------ music
CH = {
    'Fmaj9': ('F2', ['F3', 'A3', 'C4', 'E4', 'G4']),
    'Dm9': ('D2', ['F3', 'A3', 'C4', 'E4']),
    'Bbmaj9': ('A#1', ['A3', 'C4', 'D4', 'F4']),
    'C69': ('C2', ['E3', 'G3', 'A3', 'D4']),
    'Bbmaj7': ('A#1', ['A3', 'D4', 'F4']),
    'Cadd9': ('C2', ['G3', 'C4', 'D4', 'E4']),
}
BELLS = {'Dm9': ['A5', 'D6', 'F6'], 'Bbmaj9': ['C6', 'D6', 'F6'], 'Fmaj9': ['C6', 'E6', 'A6'], 'C69': ['D6', 'G6', 'A6']}
PLAN = [(0, 4, 'Fmaj9'), (4, 6.5, 'Fmaj9'), (6.5, 9, 'Dm9'), (9, 11, 'Bbmaj9'), (11, 13, 'Fmaj9'), (13, 15, 'C69'),
        (15, 16, 'Bbmaj7'), (16, 17, 'Cadd9'), (17, 18.5, 'Fmaj9'), (18.5, 20.5, 'Fmaj9'), (20.5, 22, 'Bbmaj9'), (22, 24, 'Fmaj9')]


def chord_at(beat):
    for s, e, c in PLAN:
        if s <= beat < e:
            return c
    return PLAN[-1][2]


# pad: dark in the night, opens up at dawn
for s, e, c in PLAN:
    night = 6.5 <= s < 15
    dawn = 15 <= s < 18.5
    cut0, cut1 = (700, 700) if night else (1200, 2600) if dawn else (1500, 1500)
    if s == 4:
        cut0, cut1 = 1500, 650  # the evening closes in
    place('pad', pad(CH[c][1], b(s), b(e), cut0, cut1, att=0.3 if s else 0.05, rel=0.5), b(s), 0.5, 0.0, send=0.25)
# sub bass
for s, e, c in PLAN:
    if s >= 7 or s == 0:
        place('bass', sub(CH[c][0], b(e - s) * 0.97), b(s), 0.36)
# electric piano: stabs at dusk, a syncopated pattern through the night and the morning
for beat in (0, 1.5, 2.5, 3.5):
    chord_keys(CH['Fmaj9'][1], beat, 0.9 if beat else 1.4, 0.7)
for s, e, c in PLAN:
    if s < 6.5:
        continue
    if s == 6.5:
        chord_keys(CH[c][1], 6.5, 2.2, 0.55)
        continue
    for off, ln, v in ((0, 1.3, 0.8), (1.5, 0.45, 0.6)):
        if s + off < e:
            chord_keys(CH[c][1], s + off, ln, v)
# beat: kicks on 1 and 3, snaps on 2 and 4 (bars start on beat 7), shaker 16ths with a little swing
for beat in np.arange(7, 22.01, 1):
    if (beat - 7) % 2 == 0:
        place('drums', kick(), b(beat), 0.9)
    else:
        place('drums', snap(), b(beat), 0.34, 0.1, send=0.2)
for k, beat in enumerate(np.arange(7, 22, 0.25)):
    swing = 0.03 * B if k % 2 else 0
    place('drums', shaker(), b(beat) + swing, 0.07 if k % 2 else 0.1, 0.35)
for beat in np.arange(15.5, 22, 0.5):
    place('drums', hat(), b(beat), 0.08, -0.3)
place('drums', kick(), b(22), 0.9)
place('fx', swell(b(0.5), 9000, 2000, 0.05), b(22), 0.12, 0.0, send=0.5)


# ------------------------------------------------------------------ sound effects from the page's cue list
def fx_tick(c):
    place('fx', tick(True), c['t'], 0.5, 0.2)
    place('fx', bell('F6', 1.4, 3.5, 1.2), c['t'] + 0.02, 0.18, 0.1, send=0.5)  # 17.00: a little chime, you're off


def fx_lapse(c):
    t0, t1 = c['t'], c['until']
    s, k = t0, 0
    while s < t1:  # the clock races: ticks come faster and faster, then slow into 23.47
        u = (s - t0) / (t1 - t0)
        gap = 0.16 * (1 - np.sin(np.pi * u)) ** 2 + 0.018
        place('fx', tick(k % 2 == 0), s, 0.28 + 0.2 * np.sin(np.pi * u), 0.15 if k % 2 else -0.15)
        s += gap
        k += 1
    place('fx', swell(t1 - t0, 300, 6000, 0.8), t0, 0.22, 0.0, send=0.3)
    place('fx', bell('D5', 2.4, 2.0, 1.4), t1, 0.2, 0.0, send=0.6)


def fx_booking(c):
    notes = BELLS[chord_at(c['t'] / B)]
    for i, n in enumerate(notes):
        place('fx', bell(n), c['t'] + i * 0.07, 0.2, -0.3 + 0.3 * i, send=0.55)


def fx_deliver(c):
    t = tt(1.2)
    bloom = sum(np.sin(2 * np.pi * hz(n) * t) for n in ('F4', 'C5', 'A5')) / 3
    env = np.minimum(1, t / 0.12) * np.exp(-t / 0.4)
    place('fx', fade(bloom * env), c['t'] - 0.05, 0.2, 0.0, send=0.6)
    place('fx', kick() * 0.6, c['t'], 0.35)


def fx_roll(c):
    for k in range(6):
        place('fx', tick(k % 2 == 0), c['t'] + k * 0.045, 0.16, 0.2)


def fx_switch(c):
    place('fx', tick(True) * 0.6, c['t'], 0.12, 0.3 * (1 if int(c['t'] * 13) % 2 else -1))


def fx_lamp(c):
    t = tt(0.3)
    hum = np.sin(2 * np.pi * 100 * t) + 0.4 * np.sin(2 * np.pi * 200 * t)
    flick = (np.sin(2 * np.pi * 23 * t) > -0.2).astype(float)
    place('fx', fade(hum * flick * np.exp(-t / 0.15), 0.002, 0.05), c['t'], 0.08, -0.4)


def fx_dawn(c):
    place('fx', swell(b(1.5), 200, 5000, 0.9), c['t'] - b(0.5), 0.18, 0.0, send=0.4)


def fx_birds(c):
    for k, (dt, pan) in enumerate([(0, 0.6), (0.14, 0.5), (0.7, 0.4), (0.8, 0.35), (1.6, 0.1), (1.72, 0.0), (2.5, -0.2)]):
        place('fx', chirp(), c['t'] + dt, 0.1, pan, send=0.3)


def fx_check(c):
    n = ['C6', 'D6', 'F6', 'A6'][c['i'] % 4]
    place('fx', bell(n, 0.6, 2.0, 1.0), c['t'], 0.16, 0.2, send=0.3)


def fx_card(c):
    place('fx', swell(0.6, 400, 7000, 0.7), c['t'] - 0.15, 0.16, 0.0, send=0.3)


def fx_cta(c):
    place('fx', bell('C6', 1.6), c['t'], 0.22, -0.1, send=0.5)
    place('fx', bell('F6', 1.8), c['t'] + 0.16, 0.2, 0.1, send=0.5)


FX = {'tick': fx_tick, 'lapse': fx_lapse, 'booking': fx_booking, 'deliver': fx_deliver, 'roll': fx_roll, 'switch': fx_switch,
      'lamp': fx_lamp, 'dawn': fx_dawn, 'birds': fx_birds, 'check': fx_check, 'card': fx_card, 'cta': fx_cta}
for c in CUES['cues']:
    if c['type'] in FX:
        FX[c['type']](c)
# the clock ticks through the first bar; a faint night air sits under the dark
for k, beat in enumerate(np.arange(0, 4, 0.5)):
    if abs(beat - 1) > 0.01:
        place('fx', tick(k % 2 == 0), b(beat), 0.2, 0.15 if k % 2 else -0.15)
air = filt(rng.standard_normal((2, int(b(10) * SR))), 'lowpass', 900)
air *= np.sin(np.linspace(0, np.pi, air.shape[1])) ** 2
place('fx', air * 0.02, b(5))
# vinyl-ish crackle for warmth
crackle = np.zeros((2, N))
for i in rng.integers(0, N - 200, 260):
    crackle[:, i:i + 40] += rng.standard_normal((2, 40)) * np.exp(-np.arange(40) / 8) * rng.uniform(0.2, 1)
BUS['fx'] += filt(crackle, 'highpass', 2500) * 0.015


# ------------------------------------------------------------------ mix + master
# sidechain: the pad and keys breathe with the kick
duck = np.ones(N)
tl = np.arange(N) / SR
for beat in np.arange(7, 22.01, 2):
    t0 = b(beat)
    i0 = int(t0 * SR)
    seg = tl[i0:] - t0
    duck[i0:] = np.minimum(duck[i0:], 1 - 0.35 * np.exp(-seg / 0.15) * np.minimum(1, seg / 0.01 + 0.2))
for bus in ('pad', 'keys'):
    BUS[bus] *= duck

GAINS = {'keys': 1.8, 'pad': 0.53, 'bass': 0.75, 'drums': 0.8, 'fx': 1.0}


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
DUCK_DB = {'keys': 8, 'pad': 6, 'bass': 3, 'drums': 6, 'fx': 9, 'send': 7}
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

ir_t = tt(2.4)
ir = np.stack([filt(rng.standard_normal(len(ir_t)), 'lowpass', 5000) * np.exp(-ir_t / 0.55) for _ in range(2)])
ir[:, : int(0.02 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
verb = np.stack([sg.fftconvolve(BUS['send'][ch], ir[ch])[:N] for ch in range(2)]) * 0.55

mixed = sum(BUS[k] * g for k, g in GAINS.items()) + verb
mixed = filt(mixed, 'highpass', 30)
mixed = filt(mixed, 'lowpass', 16000)
mixed[:, -int(0.35 * SR):] *= np.linspace(1, 0, int(0.35 * SR)) ** 1.5


def limit(x, ceiling=0.89, look=0.004, release=0.06):
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
