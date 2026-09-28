#!/usr/bin/env python3
"""
Soundtrack for "Tvillingerne · tegneserie" (120 BPM, E minor, 30 beats = 15 s), synthesised for this ad in
numpy/scipy: a 60s spy-surf caper for a comic page. Like the flat version, the mix is split like the picture: the
left twin is heard in the left channel, the right twin in the right. Both share the band until the right phone
rings; from then on the left channel has only crickets, wind and a tumbleweed, while the right keeps the band and
the phone. When the right panel slams the left one off the page, the band fills both sides.
Sound effects are placed from out/cues.json, which the page itself exports (each cue says which side it is on).

    node tools/render.mjs --cues && python3 tools/make_audio.py     # -> out/soundtrack.wav (48 kHz, ~-14 LUFS)

Instruments: a twangy surf guitar (Karplus-Strong through a spring reverb), a brass section (band-limited saws with
a brightness envelope), a spy bass line (Karplus-Strong), drums with toms and crash, a glockenspiel. Sound effects,
cartoon style: a paper rip, a slide whistle, a slap, pops, a saw stroke, a bubble, a drill, a cash register, an
old telephone bell, plings, crickets, wind, a tumbleweed, a water drop, a sad trombone, a marker squeak, a big BAM.

Music (beats): 0-1 a surf chord and the rip · 1-12 the caper: spy bass, the guitar tune, brass on the catch and the
price · 12-18.5 the same band in the right channel only · 18.5-19.75 a snare roll and tremolo guitar under
"Én forskel:", a brass hit on "hjemmesiden." · 20-22.5 the band on the right · 22.5 BAM · 23-28 the cover: the tune
on brass in full stereo · 28 the last hit.
"""
import json
import os
import shutil
import subprocess
import wave

import numpy as np
import scipy.signal as sg

SR = 48000
BPM = 120
B = 60 / BPM
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'out', 'soundtrack.wav')
CUES = json.load(open(os.path.join(HERE, '..', 'out', 'cues.json'), encoding='utf-8'))
DUR = CUES['DUR']
N = int(round(SR * DUR))
rng = np.random.default_rng(66)
SIDE = {'L': -0.85, 'R': 0.85, 'C': 0.0}


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


def noise(sec):
    return rng.standard_normal(int(round(sec * SR)))


# ------------------------------------------------------------------ buses
MUSIC = ('drums', 'bass', 'guitar', 'brass')
BUS = {k: np.zeros((2, N)) for k in (*MUSIC, 'fx', 'send', 'spring')}


def place(bus, x, t0, gain=1.0, pan=0.0, send=0.0):
    x = np.asarray(x, dtype=float)
    if x.ndim == 1:
        th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        x = np.stack([x * np.cos(th), x * np.sin(th)]) * np.sqrt(2)
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
def kick(vel=1.0):
    t = tt(0.32)
    return fade(np.sin(2 * np.pi * np.cumsum(46 + 95 * np.exp(-t / 0.026)) / SR) * np.exp(-t / 0.16) * vel, 0.001, 0.04)


def snare(vel=1.0):
    t = tt(0.26)
    n = filt(noise(0.26), 'bandpass', [1400, 8000]) * np.exp(-t / 0.06)
    tone = np.sin(2 * np.pi * 196 * t) * np.exp(-t / 0.05) * 0.8
    return fade((0.8 * n + tone) * vel, 0.0005, 0.03)


def hat(open_=False, vel=1.0):
    d = 0.22 if open_ else 0.05
    t = tt(d)
    return fade(filt(noise(d), 'highpass', 7500) * np.exp(-t / (d * 0.33)) * vel, 0.0005, 0.01)


def tom(freq, vel=1.0):
    t = tt(0.35)
    x = np.sin(2 * np.pi * np.cumsum(freq * (1 + 0.5 * np.exp(-t / 0.03))) / SR) * np.exp(-t / 0.18)
    return fade((x + filt(noise(0.35), 'bandpass', [300, 2500]) * np.exp(-t / 0.02) * 0.3) * vel, 0.001, 0.04)


def crash(vel=1.0, dur=1.8):
    t = tt(dur)
    m = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) for f in (3120, 4270, 5510, 6930, 8140, 9570)) * 0.06
    return fade((filt(noise(dur), 'highpass', 4200) * 0.6 + m) * np.exp(-t / 0.55) * vel, 0.001, 0.2)


def ks_string(f, dur, bright=3200, g=0.997, vel=1.0):
    """Karplus-Strong string: a burst of noise in a feedback delay with a gentle low-pass."""
    n = int(dur * SR) + int(0.12 * SR)
    period = max(2, int(round(SR / f)))
    exc = np.zeros(n)
    burst = filt(rng.standard_normal(period), 'lowpass', bright)
    exc[:period] = burst / (np.max(np.abs(burst)) + 1e-9)
    a = np.zeros(period + 2)
    a[0], a[period], a[period + 1] = 1.0, -g / 2, -g / 2
    y = sg.lfilter([1.0], a, exc)
    t = np.arange(n) / SR
    env = np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.035))
    return fade(y * env / (np.max(np.abs(y)) + 1e-9) * vel, 0.001, 0.03)


def bass(name, dur, vel=1.0):
    f = hz(name)
    y = filt(ks_string(f, dur, 1800, 0.995), 'lowpass', 1400)
    t = np.arange(len(y)) / SR
    y = y + 0.55 * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.3) * np.where(t < dur, 1, np.exp(-(t - dur) / 0.03))
    return fade(y / (np.max(np.abs(y)) + 1e-9) * vel, 0.001, 0.03)


def surf(name, dur, vel=1.0, trem=False):
    """Twangy surf guitar: a bright string with a little vibrato; `trem` re-picks it every 16th."""
    f = hz(name)
    if not trem:
        y = ks_string(f, dur, 5200, 0.998)
    else:
        step = b(0.25) / 2
        y = np.zeros(int((dur + 0.12) * SR))
        for k in range(int(dur / step)):
            s = ks_string(f, step * 1.3, 5200, 0.998, 0.8 + 0.2 * (k % 2 == 0))
            i0 = int(k * step * SR)
            n = min(len(s), len(y) - i0)
            y[i0:i0 + n] += s[:n]
    t = np.arange(len(y)) / SR
    y = y * (1 + 0.04 * np.sin(2 * np.pi * 6 * t))
    return fade(filt(y, 'highpass', 180) * vel, 0.001, 0.04)


def brass(names, dur, vel=1.0, bright=1.0):
    """A brass section: band-limited saws, detuned, a pitch scoop into each note, and a brightness envelope
    (harmonic k is weighted by exp(-k f / fc(t)), fc opening fast and settling)."""
    t = tt(dur + 0.15)
    fc = (700 + 4200 * bright * np.minimum(1, t / 0.035) * (0.55 + 0.45 * np.exp(-t / 0.18)))
    env = np.minimum(1, t / 0.018) * (0.75 + 0.25 * np.exp(-t / 0.12)) * np.where(t < dur, 1, np.exp(-(t - dur) / 0.06))
    out = np.zeros(len(t))
    for name in names:
        f0 = hz(name)
        for det in (-0.1, 0.0, 0.11):
            f = f0 * 2 ** (det / 12) * 2 ** (-0.6 * np.exp(-t / 0.035) / 12)
            ph = 2 * np.pi * np.cumsum(f) / SR
            K = int(9000 / f0)
            for k in range(1, K + 1):
                out += np.sin(k * ph) / k * np.exp(-k * f0 / fc)
    out *= env
    return fade(out / (np.max(np.abs(out)) + 1e-9) * vel, 0.002, 0.05)


def glock(name, vel=1.0):
    f = hz(name)
    t = tt(1.3)
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in ((1, 1, 0.6), (2.76, 0.35, 0.16), (5.4, 0.15, 0.06), (8.93, 0.06, 0.03)))
    return fade(x * vel, 0.0005, 0.05)


def bell(freq, dur=0.9, vel=1.0):
    t = tt(dur)
    x = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / d) for r, a, d in ((1, 1, 0.35), (2.0, 0.4, 0.2), (3.01, 0.2, 0.1), (4.2, 0.1, 0.05)))
    return fade(x * vel, 0.0005, 0.05)


def swell(dur, f0, f1, peak=0.8):
    """Noise through a band-pass sweeping from f0 to f1 (state carried from block to block)."""
    n = int(dur * SR)
    u = np.linspace(0, 1, n)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 512
    zi = np.zeros((1, 2))
    for s0 in range(0, n, blk):
        fc = f0 * (f1 / f0) ** u[s0]
        sos = sg.butter(1, [fc * 0.6 / (SR / 2), min(fc * 1.6, 20000) / (SR / 2)], btype='bandpass', output='sos')
        out[s0:s0 + blk], zi = sg.sosfilt(sos, x[s0:s0 + blk], zi=zi)
    env = np.where(u < peak, (u / peak) ** 2, ((1 - u) / (1 - peak)) ** 1.5)
    return out * env / (np.max(np.abs(out * env)) + 1e-9)


def wah(name, dur, vel=1.0):
    """A muted trombone note: a bright harmonic tone crossfaded from dull to bright and back (the wah)."""
    f = hz(name)
    t = tt(dur)
    vib = 1 + 0.008 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.15, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    x = sum(np.sin(k * ph) / k ** 0.9 for k in range(1, 14))
    dull, bright = filt(x, 'lowpass', 420), filt(x, 'lowpass', 2200)
    w = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    env = np.minimum(1, t / 0.03) * np.minimum(1, (dur - t) / 0.06)
    return fade((dull * (1 - w) + bright * w) * env * vel, 0.005, 0.04)


# ------------------------------------------------------------------ music
# the caper's chords, two beats each: Em | Em | C | B7 (and around again)
CH = {'Em': ('E2', ['E3', 'G3', 'B3']), 'C': ('C2', ['C3', 'E3', 'G3']), 'B7': ('B1', ['B2', 'D#3', 'A3']), 'Am': ('A1', ['A2', 'C3', 'E3'])}
LOOP = ['Em', 'Em', 'C', 'B7']
# the spy bass line over one 2-beat chord, in 8ths: (offset in beats, semitones above the root, velocity)
BASS_LINE = {'Em': [(0, 0, 1.0), (0.5, 0, 0.6), (1.0, 3, 0.8), (1.5, 5, 0.8)],
             'C': [(0, 0, 1.0), (0.5, 7, 0.6), (1.0, 4, 0.8), (1.5, 2, 0.7)],
             'B7': [(0, 0, 1.0), (0.5, 0, 0.6), (1.0, 7, 0.8), (1.5, 10, 0.8)],
             'Am': [(0, 0, 1.0), (0.5, 3, 0.6), (1.0, 5, 0.8), (1.5, 7, 0.8)]}
# the tune: (beat offset in its 8-beat phrase, note, length in beats)
TUNE = [(0, 'E4', 0.5), (0.5, 'G4', 0.5), (1.0, 'A4', 0.5), (1.5, 'B4', 1.0), (2.5, 'A4', 0.5), (3.0, 'G4', 0.5), (3.5, 'E4', 0.5),
        (4.0, 'D4', 0.5), (4.5, 'E4', 0.5), (5.0, 'G4', 0.5), (5.5, 'E4', 1.0), (6.5, 'D#4', 0.5), (7.0, 'B3', 1.0)]


def semis(name, k):
    f = hz(name) * 2 ** (k / 12)
    return f


def chord_at(beat):
    return LOOP[int((beat - 1) // 2) % 4] if beat >= 1 else 'Em'


def band(b0, b1, drums_on=True, tune=True, brass_tune=False, fill_at=None):
    """The caper from beat b0 to b1: drums, spy bass, the tune on surf guitar (or brass on the cover)."""
    if drums_on:
        for beat in np.arange(b0, b1, 1):
            if int(beat) % 2 == 1:
                place('drums', kick(), b(beat), 0.62)
                if (beat - b0) % 4 == 3:
                    place('drums', kick(0.7), b(beat + 0.5), 0.4)
            else:
                place('drums', snare(), b(beat), 0.34, 0.05, send=0.12)
        for k, beat in enumerate(np.arange(b0, b1, 0.5)):
            place('drums', hat(vel=0.85 if k % 2 == 0 else 0.55), b(beat) + (0.012 if k % 2 else 0), 0.11, 0.3)
    for cb in np.arange(b0, b1, 2):
        c = chord_at(cb)
        root = CH[c][0]
        for off, k, vel in BASS_LINE[c]:
            if cb + off >= b1:
                continue
            f = semis(root, k)
            place('bass', bass_f(f, b(0.42), vel), b(cb + off), 0.6)
    if tune:
        for ph0 in np.arange(b0, b1, 8):
            for off, n, ln in TUNE:
                if ph0 + off + ln > b1 + 0.01:
                    continue
                if brass_tune:
                    place('brass', brass([n, transpose(n, -12)], b(ln) * 0.9, 0.9), b(ph0 + off), 0.2, 0.15, send=0.2)
                else:
                    place('guitar', surf(n, b(ln) * 0.95, 0.9, trem=ln >= 1.0), b(ph0 + off), 0.3, -0.25)


def bass_f(f, dur, vel):
    y = filt(ks_string(f, dur, 1800, 0.995), 'lowpass', 1400)
    t = np.arange(len(y)) / SR
    y = y + 0.55 * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.3) * np.where(t < dur, 1, np.exp(-(t - dur) / 0.03))
    return fade(y / (np.max(np.abs(y)) + 1e-9) * vel, 0.001, 0.03)


def transpose(name, k):
    n = 12 * (int(name[-1]) + 1) + NOTE[name[:-1]] + k
    names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    return f'{names[n % 12]}{n // 12 - 1}'


# 0-1: a surf chord rings out, a tom pickup into the caper
for i, n in enumerate(['E3', 'B3', 'E4', 'G4']):
    place('guitar', surf(n, b(1.6), 0.8), 0.0 + i * 0.012, 0.22, -0.3 + 0.2 * i)
for k, beat in enumerate((0.5, 0.625, 0.75, 0.875)):
    place('drums', tom(150 - 18 * k, 0.8), b(beat), 0.34, -0.4 + 0.25 * k)
# 1-12: the caper in both channels
band(1, 12)
# 12-18.5: the same band, in the right channel only (the left channel is muted below)
band(12, 18.5)
# 18.5-19.75: a snare roll and tremolo guitar under "Én forskel:"
for k, beat in enumerate(np.arange(18.5, 19.75, 0.125)):
    place('fx', snare(0.3 + 0.5 * k / 10), b(beat), 0.15 + 0.12 * k / 10, 0.0, send=0.1)
place('fx', surf('B3', b(1.2), 0.9, trem=True), b(18.5), 0.22, -0.1)
place('fx', surf('D#4', b(1.2), 0.8, trem=True), b(18.5), 0.16, 0.2)
# 20-22.5: the band again on the right
band(20, 22.5, tune=False)
# 23-28: the cover, the tune on brass in full stereo
band(23, 28, brass_tune=True)
for k, beat in enumerate(np.arange(27, 28, 0.25)):  # a tom fill into the last hit
    place('drums', tom(170 - 22 * k, 0.8), b(beat), 0.34, -0.4 + 0.25 * k)
place('drums', kick(1.0), b(28), 0.7)
place('drums', crash(0.8, 2.0), b(28), 0.16, 0.0, send=0.2)
place('bass', bass('E2', b(3)), b(28), 0.65)
place('brass', brass(['E3', 'G3', 'B3', 'E4'], b(2.6), 1.0), b(28), 0.24, 0.0, send=0.3)
for i, n in enumerate(['E3', 'B3', 'E4', 'G4', 'B4']):
    place('guitar', surf(n, b(2.5), 0.8), b(28) + i * 0.015, 0.2, -0.4 + 0.2 * i)


# ------------------------------------------------------------------ sound effects from the page's cue list
def pan_of(c):
    return SIDE[c.get('side', 'C')]


def fx_split(c):
    # paper tearing down the middle: crackly band noise, then the two halves whoosh apart
    d = 0.32
    t = tt(d)
    crack = (rng.random(len(t)) < 0.02 + 0.06 * t / d).astype(float)
    crack = filt(crack, 'lowpass', 6000) * 3
    tear = filt(noise(d), 'bandpass', [1800, 7000]) * (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 36 * t)))
    place('fx', fade((tear + crack) * np.minimum(1, t / 0.02), 0.002, 0.05), c['t'] - 0.08, 0.26)
    for p in (-0.9, 0.9):
        place('fx', swell(0.4, 900, 3500, 0.3), c['t'] + 0.12, 0.12, p, send=0.15)
    place('brass', brass(['E3', 'B3', 'E4'], 0.22, 1.0), c['t'], 0.22, 0.0, send=0.2)
    place('drums', kick(0.9), c['t'], 0.5)
    place('drums', crash(0.5), c['t'], 0.1, 0.0, send=0.1)


def fx_caption(c):
    t = tt(0.06)
    x = filt(noise(0.06), 'bandpass', [2500, 7000]) * np.exp(-t / 0.006) + 0.5 * np.sin(2 * np.pi * 1100 * t) * np.exp(-t / 0.012)
    place('fx', fade(x, 0.0003, 0.01), c['t'], 0.1)


def fx_punch(c):
    # on the fx bus: both panels get the punchline, so it plays in both channels
    place('fx', brass(['E3', 'G3', 'B3', 'E4'], 0.55, 1.0, 1.2), c['t'], 0.26, 0.0, send=0.3)
    place('fx', kick(1.0), c['t'], 0.72)
    place('fx', crash(0.9), c['t'], 0.18, 0.0, send=0.2)


def fx_lift(c):
    place('fx', swell(0.3, 600, 2500, 0.7), c['t'], 0.05)


def fx_toss(c):
    # a slide whistle up as the hammer flies, down as it falls
    d = b(1)
    t = tt(d)
    f = 700 + 900 * np.sin(np.pi * t / d) ** 0.8
    x = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.01 * np.sin(2 * np.pi * 7 * t))) / SR)
    x += 0.15 * filt(noise(d), 'bandpass', [1500, 4000])
    place('fx', fade(x * np.minimum(1, t / 0.03), 0.01, 0.05), c['t'], 0.08, send=0.1)


def fx_catch(c):
    t = tt(0.2)
    slap = filt(noise(0.2), 'bandpass', [900, 5000]) * np.exp(-t / 0.012) + 0.8 * np.sin(2 * np.pi * np.cumsum(160 + 120 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.06)
    place('fx', fade(slap, 0.0005, 0.03), c['t'], 0.42)
    place('brass', brass(['B3', 'E4'], 0.16, 0.9), c['t'], 0.14, 0.2)


def fx_star(c):
    place('fx', glock(['B6', 'D7', 'E7', 'G7', 'B7'][c['i']], 0.8), c['t'], 0.1, -0.4 + 0.2 * c['i'], send=0.35)


def fx_tool(c):
    t0 = c['t']
    t = tt(0.2)
    pop = np.sin(2 * np.pi * np.cumsum(300 + 900 * (1 - np.exp(-t / 0.04))) / SR) * np.exp(-t / 0.05)
    place('fx', fade(pop, 0.001, 0.03), t0, 0.2, send=0.15)
    if c['kind'] == 'saw':
        tt_ = tt(0.24)
        x = filt(noise(0.24), 'bandpass', [1800, 6500]) * (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 14 * tt_)))
        place('fx', fade(x * np.exp(-tt_ / 0.12), 0.003, 0.04), t0 + 0.03, 0.2)
    elif c['kind'] == 'level':
        tt_ = tt(0.16)  # a bubble: a sine that jumps up in pitch
        x = np.sin(2 * np.pi * np.cumsum(420 + 1100 * (tt_ / 0.16) ** 2) / SR) * np.exp(-tt_ / 0.07)
        place('fx', fade(x, 0.002, 0.03), t0 + 0.04, 0.18)
    else:
        tt_ = tt(0.32)
        f = 170 + 120 * np.minimum(1, tt_ / 0.12)
        ph = 2 * np.pi * np.cumsum(f) / SR
        x = sum(np.sin(k * ph) / k for k in range(1, 12))
        x = filt(x, 'bandpass', [250, 3500]) + filt(noise(0.32), 'bandpass', [2000, 6000]) * 0.2
        place('fx', fade(x * np.exp(-tt_ / 0.15), 0.004, 0.05), t0 + 0.03, 0.12)


def fx_sticker(c):
    t = tt(0.15)
    slap = filt(noise(0.15), 'bandpass', [600, 4000]) * np.exp(-t / 0.018) + 0.8 * np.sin(2 * np.pi * 110 * t) * np.exp(-t / 0.05)
    place('fx', fade(slap, 0.0003, 0.03), c['t'], 0.45)
    place('fx', bell(hz('C7')), c['t'] + 0.06, 0.14, 0.0, send=0.25)
    place('fx', bell(hz('G7')), c['t'] + 0.14, 0.14, 0.0, send=0.25)
    for k in range(7):
        tc = tt(0.03)
        place('fx', np.sin(2 * np.pi * rng.uniform(5000, 8000) * tc) * np.exp(-tc / 0.006), c['t'] + 0.1 + k * rng.uniform(0.02, 0.04), 0.05, rng.uniform(-0.3, 0.3))
    # and the band shouts it: ba-DAA
    place('brass', brass(['G3', 'B3', 'E4'], 0.12, 0.9), c['t'] + b(0.5), 0.18, 0.1, send=0.2)
    place('brass', brass(['A3', 'C4', 'F#4'], 0.4, 1.0), c['t'] + b(1), 0.2, 0.1, send=0.25)


def fx_poof(c):
    place('fx', swell(0.3, 3000, 900, 0.2), c['t'], 0.07)


def fx_phone(c):
    place('fx', swell(0.3, 800, 3000, 0.6), c['t'], 0.06)


def fx_ring(c):
    """An old telephone bell: two bells struck by a clapper twenty times a second."""
    d = c['until'] - c['t']
    p = pan_of(c)
    t = tt(d + 0.3)
    strikes = np.zeros(len(t))
    for k in range(int(d * 20)):
        if (k // 16) % 2 == 0:  # ring-ring, a short pause, ring-ring
            strikes[int(k / 20 * SR)] = 1.0 if k % 2 == 0 else 0.8
    tone = np.zeros(len(t))
    for f, a, dd in ((1650, 1.0, 0.25), (1650 * 2.4, 0.4, 0.12), (1320, 0.7, 0.22), (1320 * 2.6, 0.25, 0.1)):
        tt_ = tt(0.4)
        tone_k = a * np.sin(2 * np.pi * f * tt_) * np.exp(-tt_ / dd)
        tone += sg.fftconvolve(strikes, tone_k)[:len(t)]
    place('fx', fade(tone / (np.max(np.abs(tone)) + 1e-9), 0.002, 0.08), c['t'], 0.24, p, send=0.15)


def fx_answer(c):
    t = tt(0.04)
    place('fx', fade(filt(noise(0.04), 'bandpass', [2500, 7000]) * np.exp(-t / 0.004), 0.0002, 0.01), c['t'], 0.16, pan_of(c))


CARD_NOTES = [('B6', 'E7'), ('D7', 'G7'), ('E7', 'B7'), ('G7', 'B7')]


def fx_card(c):
    lo, hi = CARD_NOTES[c['i']]
    p = pan_of(c)
    place('fx', bell(hz(lo), 0.6, 0.9), c['t'], 0.11, p, send=0.25)
    place('fx', bell(hz(hi), 0.8, 0.9), c['t'] + 0.07, 0.11, p, send=0.25)


def fx_thumb(c):
    for k, n in enumerate(['E7', 'G7', 'B7']):
        place('fx', glock(n, 0.8), c['t'] + k * 0.04, 0.09, pan_of(c), send=0.35)


def cricket(f, chirps=3):
    pulse, gap = 0.017, 0.015
    t = tt(chirps * (pulse + gap) + 0.01)
    x = np.zeros(len(t))
    for k in range(chirps):
        t0 = k * (pulse + gap)
        m = (t >= t0) & (t < t0 + pulse)
        x[m] += np.sin(np.pi * (t[m] - t0) / pulse) ** 2 * np.sin(2 * np.pi * f * (1 + 0.003 * k) * t[m])
    return x


def fx_cricket(c):
    for k in range(4):
        place('fx', cricket(4650 + 40 * (k % 2)), c['t'] + k * 0.3, 0.1, pan_of(c))


def fx_tap(c):
    for dt in (0.36, 0.61):
        t = tt(0.05)
        x = filt(noise(0.05), 'bandpass', [1500, 6000]) * np.exp(-t / 0.005) + 0.5 * np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.012)
        place('fx', fade(x, 0.0002, 0.01), c['t'] + dt, 0.28, pan_of(c))


def fx_shake(c):
    for k in range(5):
        place('fx', swell(0.1, 1500, 3500, 0.5), c['t'] + 0.12 + k * b(0.28), 0.05, pan_of(c))


def fx_sweat(c):
    t = tt(0.12)  # a water drop: a sine whose pitch leaps up
    x = np.sin(2 * np.pi * np.cumsum(700 + 1600 * (t / 0.12) ** 1.5) / SR) * np.exp(-t / 0.04)
    place('fx', fade(x, 0.001, 0.02), c['t'] + 0.1, 0.1, pan_of(c), send=0.2)


def fx_web(c):
    pass  # the web spins silently: nothing is happening, and it sounds like it


def fx_tumble(c):
    p = pan_of(c)
    d = c['until'] - c['t']
    place('fx', swell(d + 0.8, 380, 900, 0.5), c['t'] - 0.3, 0.1, p, send=0.2)
    for k in range(1, 4):
        tl = c['t'] + d * k / 3
        t = tt(0.16)
        x = filt(noise(0.16), 'bandpass', [1500, 6000]) * np.exp(-t / 0.05) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 40 * t)))
        place('fx', fade(x, 0.002, 0.03), tl, 0.12 * (1.1 - 0.2 * k), p)


def fx_bump(c):
    t = tt(0.25)
    x = np.sin(2 * np.pi * np.cumsum(95 + 40 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.08) + filt(noise(0.25), 'bandpass', [800, 3000]) * np.exp(-t / 0.03) * 0.4
    place('fx', fade(x, 0.001, 0.04), c['t'], 0.38, pan_of(c))


def fx_shrug(c):
    p = pan_of(c)
    place('fx', wah('Bb3', 0.3), c['t'], 0.13, p, send=0.15)
    place('fx', wah('A3', 0.3), c['t'] + 0.33, 0.13, p, send=0.15)
    place('fx', wah('Ab3', 0.75), c['t'] + 0.66, 0.13, p, send=0.15)


def fx_reveal(c):
    place('fx', swell(0.5, 400, 3000, 0.8), c['t'] - 0.1, 0.09)


def fx_circle(c):
    t = tt(0.45)
    f = 2300 + 350 * np.sin(2 * np.pi * 3 * t) + 120 * np.sin(2 * np.pi * 19 * t)
    sq = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 8 * t)))
    scratch = filt(noise(0.45), 'bandpass', [2500, 8000]) * 0.5
    env = np.minimum(1, t / 0.03) * np.minimum(1, (0.45 - t) / 0.06)
    place('fx', fade((0.25 * sq + scratch) * env, 0.003, 0.03), c['t'], 0.11, pan_of(c))


def fx_expand(c):
    # the right panel's whoosh travels across to the left before it hits
    w = swell(0.45, 300, 4000, 0.9)
    n = len(w)
    pan = np.linspace(0.85, -0.6, n)
    th = (pan + 1) * np.pi / 4
    place('fx', np.stack([w * np.cos(th), w * np.sin(th)]) * np.sqrt(2), c['t'] - 0.15, 0.14, send=0.2)


def fx_bam(c):
    t = tt(0.8)
    boom = np.sin(2 * np.pi * np.cumsum(40 + 80 * np.exp(-t / 0.05)) / SR) * np.exp(-t / 0.3)
    hit = filt(noise(0.8), 'lowpass', 3000) * np.exp(-t / 0.05)
    place('fx', fade(boom + 0.6 * hit, 0.001, 0.1), c['t'], 0.55, -0.35)
    place('drums', crash(1.0, 2.0), c['t'], 0.18, -0.2, send=0.25)
    place('brass', brass(['E3', 'B3', 'E4', 'G4'], 0.35, 1.0, 1.3), c['t'], 0.24, 0.0, send=0.3)


def fx_logo(c):
    place('brass', brass(['B3', 'E4'], 0.3, 0.9), c['t'], 0.16, 0.0, send=0.3)


def fx_wordmark(c):
    for k in range(8):  # letters popping on: a quick run of plucks
        place('fx', ks_string(hz(['E5', 'G5', 'A5', 'B5', 'D6', 'E6', 'G6', 'B6'][k]), 0.12, 6000, 0.99, 0.6), c['t'] + k * 0.045, 0.08, -0.35 + 0.1 * k)


def fx_tag(c):
    fx_caption(c)


def fx_cta(c):
    t = tt(0.25)
    pop = np.sin(2 * np.pi * np.cumsum(260 + 900 * (1 - np.exp(-t / 0.05))) / SR) * np.exp(-t / 0.07)
    place('fx', fade(pop, 0.001, 0.03), c['t'], 0.28, send=0.2)
    place('fx', glock('E6', 1.0), c['t'] + 0.02, 0.14, 0.0, send=0.4)


FX = {'split': fx_split, 'caption': fx_caption, 'punch': fx_punch, 'lift': fx_lift, 'toss': fx_toss, 'catch': fx_catch, 'star': fx_star,
      'tool': fx_tool, 'sticker': fx_sticker, 'poof': fx_poof, 'phone': fx_phone, 'ring': fx_ring, 'answer': fx_answer, 'card': fx_card,
      'thumb': fx_thumb, 'cricket': fx_cricket, 'tap': fx_tap, 'shake': fx_shake, 'sweat': fx_sweat, 'web': fx_web, 'tumble': fx_tumble,
      'bump': fx_bump, 'shrug': fx_shrug, 'reveal': fx_reveal, 'circle': fx_circle, 'expand': fx_expand, 'bam': fx_bam, 'logo': fx_logo,
      'wordmark': fx_wordmark, 'tag': fx_tag, 'cta': fx_cta}
for cue in CUES['cues']:
    FX[cue['type']](cue)
# a second, farther cricket keeps going in the left channel while nothing happens there
for tc in np.arange(b(12.4), b(22.5), 0.62):
    if not (b(18.5) <= tc < b(19.8)):
        place('fx', cricket(4200, 3), tc, 0.035, -0.95)


# ------------------------------------------------------------------ the split: the band leaves the left channel
tn = np.arange(N) / SR
left = np.ones(N)
left[(tn >= b(12)) & (tn < b(22.5))] = 0.0
ramp = (tn >= b(22.5)) & (tn < b(22.6))
left[ramp] = (tn[ramp] - b(22.5)) / (b(22.6) - b(22.5))  # the BAM brings it back at once
left = filt(left, 'lowpass', 40)
for k in MUSIC:
    BUS[k][0] *= left
BUS['send'][0] *= np.maximum(left, 0.35)

# ------------------------------------------------------------------ mix + master
# the guitar goes through a spring reverb: a short, bright, boingy tail
ir_t = tt(1.4)
chirp = np.sin(2 * np.pi * np.cumsum(2400 - 1500 * np.exp(-ir_t / 0.004)) / SR)
spring = (filt(rng.standard_normal(len(ir_t)), 'bandpass', [500, 4500]) + 0.3 * chirp) * np.exp(-ir_t / 0.35)
comb = np.zeros(len(ir_t))
for k in range(1, 14):  # the spring's flutter: regular echoes 34 ms apart
    i = int(k * 0.034 * SR)
    if i < len(comb):
        comb[i] = 0.7 ** k
spring = sg.fftconvolve(spring, comb + np.eye(1, len(comb)).ravel())[:len(ir_t)]
spring[: int(0.004 * SR)] = 0
spring /= np.sqrt((spring ** 2).sum())
wet = np.stack([sg.fftconvolve(BUS['guitar'][ch], spring)[:N] for ch in range(2)]) * 0.55

ir_t = tt(1.6)
ir = np.stack([filt(rng.standard_normal(len(ir_t)), 'lowpass', 7000) * np.exp(-ir_t / 0.3) for _ in range(2)])
ir[:, : int(0.01 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
verb = np.stack([sg.fftconvolve(BUS['send'][ch], ir[ch])[:N] for ch in range(2)]) * 0.45

GAINS = {'drums': 0.9, 'bass': 0.55, 'guitar': 1.0, 'brass': 1.0, 'fx': 1.0}
mixed = sum(BUS[k] * g for k, g in GAINS.items()) + verb + wet
mixed = filt(mixed, 'highpass', 30)
mixed = filt(mixed, 'lowpass', 16500)
mixed[:, -int(0.4 * SR):] *= np.linspace(1, 0, int(0.4 * SR)) ** 1.5


def limit(x, ceiling=0.85, look=0.004, release=0.06):
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
seg = lambda a, z, ch: 20 * np.log10(np.sqrt(np.mean(mixed[ch, int(a * SR):int(z * SR)] ** 2)) + 1e-12)  # noqa: E731
print(f'split section {b(12.5):.1f}-{b(18):.1f}s: left {seg(b(12.5), b(18), 0):.1f} dB, right {seg(b(12.5), b(18), 1):.1f} dB (RMS)')
print(f'wrote {os.path.normpath(OUT)}  peak {20 * np.log10(np.max(np.abs(mixed))):.2f} dBFS  loudness {lufs(mixed):.1f} LUFS  {N / SR:.3f}s')
