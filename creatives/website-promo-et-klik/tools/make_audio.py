#!/usr/bin/env python3
"""
Soundtrack for "Ét klik" (120 BPM, D major, 30 beats = 15 s), synthesised for this ad in numpy/scipy. The machine
plays along with the music: every landing, domino and star is a note or a hit on the same beat grid, placed from
out/cues.json, which the page itself exports.

    node tools/render.mjs --cues && python3 tools/make_audio.py     # -> out/soundtrack.wav (48 kHz, ~-14 LUFS)

Instruments: a marimba (modal bar synthesis), a plucked upright bass (Karplus-Strong), a glockenspiel for the stars,
woodblock, shaker, soft kick and claps. Sound effects: the ball rolling on wood and in a copper pipe, domino clacks,
the counter bell, key clicks for the typed wordmark.

Music (beats): 0-4 a clock-like woodblock under the tap and the pop · 4-12 the groove, D | A | Bm | G, the four
dominoes play D F# A D · 11-12 the band stops while the hammer falls, the bell rings on 12 · 12-15.5 the stars play
up the scale · 15.5-21 half time under the payoff, then a build over the camera move · 21-30 end card groove, a
final D chord on 28.
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
rng = np.random.default_rng(120)


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
BUS = {k: np.zeros((2, N)) for k in ('mallets', 'bass', 'drums', 'fx', 'send')}


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
def marimba(name, vel=1.0, dur=None):
    """Modal bar: the tuned fundamental, the 4th and 10th partials a marimba bar is cut for, and a mallet knock."""
    f = hz(name) if isinstance(name, str) else name
    life = np.clip(0.9 * (220 / f) ** 0.5, 0.18, 1.2)
    t = tt(life * 2.2 if dur is None else dur)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / life)
    x += 0.32 * vel * np.sin(2 * np.pi * f * 3.96 * t) * np.exp(-t / (life * 0.25))
    x += 0.10 * vel * np.sin(2 * np.pi * f * 9.8 * t) * np.exp(-t / (life * 0.08))
    knock = filt(rng.standard_normal(len(t)), 'bandpass', [900, 4000]) * np.exp(-t / 0.004) * 0.25 * vel
    return fade((x + knock) * vel, 0.001, 0.03)


def glock(name, vel=1.0):
    """Free bar partials (1, 2.76, 5.40, 8.93): the bright ping for the stars."""
    f = hz(name)
    t = tt(1.6)
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in ((1, 1, 0.7), (2.76, 0.35, 0.18), (5.4, 0.15, 0.07), (8.93, 0.06, 0.03)))
    return fade(x * vel, 0.0005, 0.05)


def pluck_bass(name, dur, vel=1.0):
    """Karplus-Strong string: a burst of noise in a feedback delay with a gentle low-pass, like an upright pizz."""
    f = hz(name)
    n = int(dur * SR) + int(0.2 * SR)
    period = max(2, int(round(SR / f)))
    exc = np.zeros(n)
    burst = filt(rng.standard_normal(period), 'lowpass', 1400)
    exc[:period] = burst / (np.max(np.abs(burst)) + 1e-9)
    g = 0.996
    a = np.zeros(period + 2)
    a[0], a[period], a[period + 1] = 1.0, -g / 2, -g / 2
    y = sg.lfilter([1.0], a, exc)
    t = np.arange(n) / SR
    env = np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.05))
    y = filt(y * env, 'lowpass', 900) + 0.5 * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.35) * env
    return fade(y / (np.max(np.abs(y)) + 1e-9) * vel, 0.001, 0.04)


def woodblock(freq=900, vel=1.0):
    t = tt(0.12)
    x = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.018) + 0.5 * np.sin(2 * np.pi * freq * 2.7 * t) * np.exp(-t / 0.008)
    x += filt(rng.standard_normal(len(t)), 'bandpass', [freq * 1.5, freq * 4]) * np.exp(-t / 0.002) * 0.4
    return fade(x * vel, 0.0003, 0.02)


def kick():
    t = tt(0.3)
    return fade(np.sin(2 * np.pi * np.cumsum(50 + 80 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.16), 0.001, 0.04)


def clap():
    t = tt(0.25)
    n = filt(rng.standard_normal(len(t)), 'bandpass', [900, 5000])
    env = sum(np.exp(-np.maximum(t - d, 0) / 0.006) * (t >= d) for d in (0, 0.009, 0.018)) + 0.5 * np.exp(-np.maximum(t - 0.027, 0) / 0.06) * (t >= 0.027)
    return fade(n * env, 0.0005, 0.03)


def shaker(vel=1.0):
    t = tt(0.07)
    return fade(filt(rng.standard_normal(len(t)), 'highpass', 5500) * np.minimum(1, t / 0.012) * np.exp(-t / 0.022) * vel, 0.001, 0.01)


def swell(dur, f0, f1, peak=0.8):
    n = int(dur * SR)
    u = np.linspace(0, 1, n)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 512
    zi = np.zeros((1, 2))
    for s0 in range(0, n, blk):  # band-pass sweeping from f0 to f1, its state carried from block to block
        fc = f0 * (f1 / f0) ** u[s0]
        sos = sg.butter(1, [fc * 0.6 / (SR / 2), min(fc * 1.6, 20000) / (SR / 2)], btype='bandpass', output='sos')
        out[s0:s0 + blk], zi = sg.sosfilt(sos, x[s0:s0 + blk], zi=zi)
    env = np.where(u < peak, (u / peak) ** 2, ((1 - u) / (1 - peak)) ** 1.5)
    return out * env / (np.max(np.abs(out * env)) + 1e-9)


# ------------------------------------------------------------------ music
CH = {  # bass root, marimba voicing
    'D': ('D2', ['D4', 'F#4', 'A4', 'E5']),
    'A': ('A1', ['C#4', 'E4', 'A4', 'B4']),
    'Bm': ('B1', ['D4', 'F#4', 'B4', 'C#5']),
    'G': ('G1', ['D4', 'G4', 'B4', 'E5']),
    'Em7': ('E2', ['D4', 'G4', 'B4', 'E5']),
    'A7': ('A1', ['C#4', 'G4', 'A4', 'E5']),
}
PLAN = [(0, 4, 'D'), (4, 6, 'D'), (6, 8, 'A'), (8, 10, 'Bm'), (10, 12, 'G'), (12, 14, 'D'), (14, 15.5, 'G'),
        (15.5, 18, 'Em7'), (18, 21, 'A7'), (21, 24, 'D'), (24, 26, 'G'), (26, 28, 'A'), (28, 30, 'D')]


def chord_at(beat):
    for s, e, c in PLAN:
        if s <= beat < e:
            return c
    return PLAN[-1][2]


# 0-4: a woodblock ticks like a clock under the tap
for k, beat in enumerate(np.arange(0, 4, 1)):
    place('drums', woodblock(1100 if k % 2 == 0 else 850, 0.8), b(beat), 0.25, 0.3 if k % 2 else -0.3)
for beat, n in ((0, 'D5'), (0.75, 'A4'), (1.5, 'F#4')):  # a little pickup on the marimba
    place('mallets', marimba(n, 0.7), b(beat), 0.18, 0.2, send=0.2)

# 4-11: the groove — bass on 1 and the "and" of 2, marimba ostinato in 8ths, drums
OSTI = [0, 2, 1, 3, 2, 1, 3, 2]  # index into the chord voicing, per 8th note
for s, e, c in PLAN:
    if s < 4 or s >= 21:
        continue
    root, voice = CH[c]
    half = s >= 15.5 and s < 18
    for beat in np.arange(s, e, 2 if half else 1):
        if beat >= 11 and beat < 12:
            continue  # the band stops while the hammer falls
        place('bass', pluck_bass(root, b(0.9 if half else 0.45)), b(beat), 0.55)
        if not half and (beat - s) % 2 == 1:
            place('bass', pluck_bass(root.replace('1', '2') if '1' in root else root, b(0.3), 0.7), b(beat + 0.5), 0.4)
    if s < 8.5 or (s >= 12 and s < 15.5):
        for k, beat in enumerate(np.arange(s, e, 0.5)):
            if 11 <= beat < 12:
                continue
            n = voice[OSTI[k % 8]]
            place('mallets', marimba(n, 0.55 + 0.15 * (k % 2 == 0)), b(beat), 0.14, -0.25 + 0.5 * ((k % 4) / 3), send=0.15)
for beat in np.arange(4, 15.5, 1):
    if 11 <= beat < 12:
        continue
    if int(beat) % 2 == 0:
        place('drums', kick(), b(beat), 0.55)
    else:
        place('drums', clap(), b(beat), 0.22, 0.1, send=0.2)
for k, beat in enumerate(np.arange(4, 15.5, 0.25)):
    if 11 <= beat < 12:
        continue
    place('drums', shaker(0.8 if k % 2 == 0 else 0.55), b(beat) + (0.012 if k % 2 else 0), 0.09, 0.35)
# 15.5-21: half time under the payoff, then a build over the camera move
for beat in (15.5, 17.5):
    place('drums', kick(), b(beat), 0.5)
for beat, n in ((15.5, 'B4'), (16.5, 'G4'), (17.5, 'E5'), (18.5, 'C#5'), (19.5, 'A4'), (20.0, 'B4'), (20.5, 'C#5')):
    place('mallets', marimba(n, 0.6), b(beat), 0.16, 0.0, send=0.3)
for k, beat in enumerate(np.arange(19, 21, 0.25)):
    place('drums', woodblock(700 + 40 * k, 0.4 + 0.07 * k), b(beat), 0.14 + 0.02 * k, -0.4 + 0.1 * k)
place('fx', swell(b(3), 300, 6000, 0.92), b(18), 0.16, 0.0, send=0.3)

# 21-30: end card groove
for s, e, c in PLAN:
    if s < 21:
        continue
    root, voice = CH[c]
    for beat in np.arange(s, e, 1):
        place('bass', pluck_bass(root, b(0.45)), b(beat), 0.55)
    for k, beat in enumerate(np.arange(s, e, 0.5)):
        if beat >= 28:
            break
        place('mallets', marimba(voice[OSTI[k % 8]], 0.55 + 0.15 * (k % 2 == 0)), b(beat), 0.13, -0.25 + 0.5 * ((k % 4) / 3), send=0.15)
for beat in np.arange(21, 28, 1):
    place('drums', kick() if int(beat) % 2 == 1 else clap(), b(beat), 0.55 if int(beat) % 2 == 1 else 0.22, 0.1, send=0.1)
for k, beat in enumerate(np.arange(21, 28, 0.25)):
    place('drums', shaker(0.8 if k % 2 == 0 else 0.55), b(beat) + (0.012 if k % 2 else 0), 0.08, 0.35)
# final chord: rolled marimba + bass, and a kick
place('drums', kick(), b(28), 0.6)
place('bass', pluck_bass('D2', b(1.8)), b(28), 0.6)
for i, n in enumerate(['D4', 'A4', 'D5', 'F#5', 'A5', 'D6']):
    place('mallets', marimba(n, 0.8, dur=2.2), b(28) + i * 0.03, 0.15, -0.4 + 0.16 * i, send=0.35)


# ------------------------------------------------------------------ sound effects from the page's cue list
def roll_noise(dur, surface, v0, v1):
    """Rolling: noise through the surface's resonances, louder and brighter with speed, with a slow rumble."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    speed = np.linspace(v0, v1, n)
    x = rng.standard_normal(n)
    res = {'ruler': [(1900, 6), (3400, 5)], 'plank': [(420, 5), (1150, 4)], 'shelf': [(500, 5), (1300, 4)], 'card': [(700, 4), (1800, 4)]}[surface]
    y = sum(sg.lfilter(*sg.iirpeak(f / (SR / 2), q), x) for f, q in res)
    y = filt(y, 'lowpass', 2500 + 4000 * speed.mean())
    rot = speed * 5.0  # turns per second, roughly
    rumble = 0.75 + 0.25 * np.sin(2 * np.pi * np.cumsum(rot) / SR)
    env = speed * rumble * np.minimum(1, t / 0.02) * np.minimum(1, (dur - t) / 0.03)
    return fade(y * env / (np.max(np.abs(y)) + 1e-9), 0.005, 0.03)


def fx_swish(c):
    place('fx', swell(0.45, 800, 4000, 0.7), c['t'], 0.08, 0.3)


def fx_tap(c):
    t = tt(0.06)
    x = filt(rng.standard_normal(len(t)), 'bandpass', [2000, 7000]) * np.exp(-t / 0.004) + 0.6 * np.sin(2 * np.pi * 1300 * t) * np.exp(-t / 0.01)
    place('fx', fade(x, 0.0002, 0.01), c['t'], 0.5, 0.1)
    place('drums', kick() * 0.5, c['t'], 0.4)


def fx_pop(c):
    t = tt(0.25)
    f = 260 + 900 * (1 - np.exp(-t / 0.05))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.07)
    place('fx', fade(x, 0.001, 0.03), c['t'], 0.35, 0.1, send=0.2)


def fx_land(c):
    surf = c['surface']
    base = {'ruler': 1500, 'plank': 520, 'shelf': 600}[surf]
    place('fx', woodblock(base, 1.0), c['t'], 0.4, -0.1)
    place('drums', kick() * 0.4, c['t'], 0.3)
    # the ball is on the beat: each landing also plays a marimba note from the chord
    n = CH[chord_at(c['t'] / B)][1][{'ruler': 3, 'plank': 1, 'shelf': 0}[surf]]
    place('mallets', marimba(n, 0.8), c['t'], 0.16, 0.0, send=0.2)


def fx_roll(c):
    place('fx', roll_noise(c['until'] - c['t'], c['surface'], c['v0'], c['v1']), c['t'], 0.6 if c['surface'] != 'card' else 0.35, 0.15)


def fx_pipe(c):
    d = c['until'] - c['t']
    t = tt(0.35)
    clang = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / dd) for f, a, dd in ((1320, 1, 0.12), (2870, 0.6, 0.06), (4410, 0.3, 0.03)))
    place('fx', fade(clang, 0.0005, 0.05), c['t'] - 0.07, 0.18, 0.45, send=0.3)
    # the rumble inside a copper tube: noise through a comb (the tube's modes)
    n = int((d + 0.12) * SR)
    x = rng.standard_normal(n)
    delay = int(SR / 180)
    a = np.zeros(delay + 1)
    a[0], a[delay] = 1, -0.93
    y = filt(sg.lfilter([1], a, x), 'bandpass', [150, 2500])
    tau = np.arange(n) / SR
    env = np.sin(np.pi * np.clip(tau / (d + 0.12), 0, 1)) ** 0.7
    place('fx', fade(y * env / (np.max(np.abs(y)) + 1e-9), 0.01, 0.04), c['t'], 0.35, 0.5)


DOMINO_NOTES = ['D5', 'F#5', 'A5', 'D6']


def fx_domino(c):
    i = c['i']
    t = tt(0.08)
    clack = filt(rng.standard_normal(len(t)), 'bandpass', [1800, 6000]) * np.exp(-t / 0.004) + 0.5 * np.sin(2 * np.pi * 2300 * t) * np.exp(-t / 0.012)
    place('fx', fade(clack, 0.0002, 0.01), c['t'], 0.45, 0.35 - 0.2 * i)
    place('mallets', marimba(DOMINO_NOTES[i], 1.0), c['t'], 0.26, 0.35 - 0.2 * i, send=0.25)


def fx_knock(c):
    place('fx', woodblock(430, 1.0), c['t'], 0.5, -0.4)
    place('fx', swell(b(1.5), 500, 5000, 0.97), c['t'], 0.12, -0.3, send=0.3)


def fx_ding(c):
    """The counter bell: inharmonic partials with slow beats, a long ring."""
    t = tt(3.0)
    f = hz('A6') * 0.998
    x = sum(a * np.sin(2 * np.pi * f * r * t + ph) * np.exp(-t / d) for r, a, d, ph in (
        (1.0, 1.0, 1.4, 0), (1.004, 0.6, 1.3, 1.0), (2.41, 0.45, 0.6, 0.3), (3.93, 0.25, 0.3, 0.8), (5.39, 0.12, 0.15, 0.2)))
    x += filt(rng.standard_normal(len(t)), 'highpass', 4000) * np.exp(-t / 0.003) * 0.4
    place('fx', fade(x, 0.0003, 0.2), c['t'], 0.4, -0.5, send=0.45)
    place('drums', kick(), c['t'], 0.6)
    # the band comes back in on the bell: a rolled D chord
    for i, n in enumerate(['D4', 'F#4', 'A4', 'D5']):
        place('mallets', marimba(n, 0.8), c['t'] + i * 0.025, 0.14, -0.3 + 0.2 * i, send=0.3)


STAR_NOTES = ['D6', 'E6', 'F#6', 'A6', 'B6']


def fx_star(c):
    place('mallets', glock(STAR_NOTES[c['i']]), c['t'], 0.24, -0.4 + 0.2 * c['i'], send=0.4)


def fx_notice(c):
    t = tt(0.18)
    x = np.sin(2 * np.pi * np.cumsum(700 + 500 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.05)
    place('fx', fade(x, 0.001, 0.03), c['t'], 0.12, 0.2, send=0.2)


def fx_payoff(c):
    place('fx', swell(0.5, 3000, 600, 0.3), c['t'] - 0.1, 0.07, 0.0, send=0.3)


def fx_zoom(c):
    pass  # scored by the build (woodblock run + swell) above


def fx_card(c):
    place('fx', swell(0.6, 200, 3000, 0.75), c['t'] - 0.25, 0.14, 0.0, send=0.2)
    place('drums', kick(), c['t'], 0.5)


def fx_logo(c):
    place('mallets', marimba('D5', 0.9), c['t'], 0.2, 0.0, send=0.3)


def fx_key(c):
    t = tt(0.05)
    x = filt(rng.standard_normal(len(t)), 'bandpass', [2500, 8000]) * np.exp(-t / 0.003) + 0.4 * np.sin(2 * np.pi * (1800 + 90 * c['i']) * t) * np.exp(-t / 0.006)
    place('fx', fade(x, 0.0002, 0.01), c['t'], 0.2, -0.2 + 0.05 * c['i'])


def fx_cta(c):
    fx_pop(c)
    place('mallets', glock('D6', 1.0), c['t'] + 0.02, 0.2, 0.0, send=0.4)


FX = {'swish': fx_swish, 'tap': fx_tap, 'pop': fx_pop, 'land': fx_land, 'roll': fx_roll, 'pipe': fx_pipe, 'domino': fx_domino,
      'knock': fx_knock, 'ding': fx_ding, 'star': fx_star, 'notice': fx_notice, 'payoff': fx_payoff, 'zoom': fx_zoom,
      'card': fx_card, 'logo': fx_logo, 'key': fx_key, 'cta': fx_cta}
for cue in CUES['cues']:
    FX[cue['type']](cue)


# ------------------------------------------------------------------ mix + master
ir_t = tt(1.8)
ir = np.stack([filt(rng.standard_normal(len(ir_t)), 'lowpass', 6000) * np.exp(-ir_t / 0.35) for _ in range(2)])
ir[:, : int(0.012 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
verb = np.stack([sg.fftconvolve(BUS['send'][ch], ir[ch])[:N] for ch in range(2)]) * 0.5

GAINS = {'mallets': 1.0, 'bass': 0.56, 'drums': 0.9, 'fx': 1.0}
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
    print(f'{k:8s} peak {20 * np.log10(np.max(np.abs(v)) + 1e-12):6.1f} dBFS  rms {20 * np.log10(np.sqrt(np.mean(v ** 2)) + 1e-12):6.1f} dBFS')
print(f'wrote {os.path.normpath(OUT)}  peak {20 * np.log10(np.max(np.abs(mixed))):.2f} dBFS  loudness {lufs(mixed):.1f} LUFS  {N / SR:.3f}s')
