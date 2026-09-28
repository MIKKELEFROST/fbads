#!/usr/bin/env python3
"""
Soundtrack for "Tvillingerne" (120 BPM, G major, 30 beats = 15 s), synthesised for this ad in numpy/scipy. The mix is
split like the picture: the left twin is heard in the left channel, the right twin in the right. Both share the
groove until the right phone rings; from then on the left channel has only crickets, wind and a tumbleweed, while
the right keeps the music and the phone. When the right half takes over the screen, the music fills both sides.
Sound effects are placed from out/cues.json, which the page itself exports (each cue says which side it is on).

    node tools/render.mjs --cues && python3 tools/make_audio.py     # -> out/soundtrack.wav (48 kHz, ~-14 LUFS)

Instruments: kick, snare, hi-hats, claps, a plucked bass (Karplus-Strong), an FM electric piano, a marimba for the
ringtone hook, a glockenspiel. Sound effects: whooshes, the hammer toss, tool pops, a cash register, the phone's
ringtone and buzz, notification pings, crickets, wind, a tumbleweed, a muted "wah-wah", a marker squeak.

Music (beats): 0-1 the split · 1-12 G | Em | C | D in both channels · 12-18.5 the same groove in the right channel
only, the ringtone hook on 12 and 17 · 18.5-19.75 a snare roll under "Én forskel:", a hit on "hjemmesiden." ·
19.75-22.5 the groove again on the right · 22.5-30 the end card in full stereo, C | D with the ringtone hook as the
melody, a snare fill and a final G chord on 28.
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
rng = np.random.default_rng(6)
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
MUSIC = ('drums', 'bass', 'keys', 'lead')
BUS = {k: np.zeros((2, N)) for k in (*MUSIC, 'fx', 'send')}


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
    return fade(np.sin(2 * np.pi * np.cumsum(48 + 90 * np.exp(-t / 0.028)) / SR) * np.exp(-t / 0.17) * vel, 0.001, 0.04)


def snare(vel=1.0):
    t = tt(0.26)
    n = filt(noise(0.26), 'bandpass', [1300, 7500]) * np.exp(-t / 0.055)
    tone = np.sin(2 * np.pi * 186 * t) * np.exp(-t / 0.045) * 0.8
    return fade((0.75 * n + tone) * vel, 0.0005, 0.03)


def hat(open_=False, vel=1.0):
    d = 0.2 if open_ else 0.05
    t = tt(d)
    return fade(filt(noise(d), 'highpass', 7200) * np.exp(-t / (d * 0.33)) * vel, 0.0005, 0.01)


def clap(vel=1.0):
    t = tt(0.25)
    n = filt(noise(0.25), 'bandpass', [900, 5000])
    env = sum(np.exp(-np.maximum(t - d, 0) / 0.006) * (t >= d) for d in (0, 0.009, 0.018)) + 0.5 * np.exp(-np.maximum(t - 0.027, 0) / 0.06) * (t >= 0.027)
    return fade(n * env * vel, 0.0005, 0.03)


def crash(vel=1.0, dur=1.8):
    t = tt(dur)
    m = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) for f in (3120, 4270, 5510, 6930, 8140, 9570)) * 0.06
    return fade((filt(noise(dur), 'highpass', 4200) * 0.6 + m) * np.exp(-t / 0.55) * vel, 0.001, 0.2)


def pluck_bass(name, dur, vel=1.0, bright=1400):
    """Karplus-Strong string: a burst of noise in a feedback delay with a gentle low-pass."""
    f = hz(name)
    n = int(dur * SR) + int(0.15 * SR)
    period = max(2, int(round(SR / f)))
    exc = np.zeros(n)
    burst = filt(rng.standard_normal(period), 'lowpass', bright)
    exc[:period] = burst / (np.max(np.abs(burst)) + 1e-9)
    g = 0.995
    a = np.zeros(period + 2)
    a[0], a[period], a[period + 1] = 1.0, -g / 2, -g / 2
    y = sg.lfilter([1.0], a, exc)
    t = np.arange(n) / SR
    env = np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.04))
    y = filt(y * env, 'lowpass', 1100) + 0.6 * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.3) * env
    return fade(y / (np.max(np.abs(y)) + 1e-9) * vel, 0.001, 0.03)


def epiano(name, dur=0.2, vel=1.0):
    """FM electric piano: a 1:1 modulator with a decaying index, plus a short tine."""
    f = hz(name)
    t = tt(dur + 0.5)
    idx = 1.7 * np.exp(-t / 0.16) * vel + 0.25
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    x += 0.18 * np.sin(2 * np.pi * f * 14 * t) * np.exp(-t / 0.015)
    env = np.exp(-t / 1.1) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.07))
    return fade(x * env * vel, 0.002, 0.03)


def marimba(name, vel=1.0, dur=None):
    f = hz(name) if isinstance(name, str) else name
    life = np.clip(0.9 * (220 / f) ** 0.5, 0.15, 1.1)
    t = tt(life * 2.2 if dur is None else dur)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / life)
    x += 0.32 * vel * np.sin(2 * np.pi * f * 3.96 * t) * np.exp(-t / (life * 0.25))
    x += 0.10 * vel * np.sin(2 * np.pi * f * 9.8 * t) * np.exp(-t / (life * 0.08))
    knock = filt(noise(len(t) / SR), 'bandpass', [900, 4000]) * np.exp(-t / 0.004) * 0.25 * vel
    return fade((x + knock) * vel, 0.001, 0.03)


def glock(name, vel=1.0):
    f = hz(name)
    t = tt(1.4)
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in ((1, 1, 0.6), (2.76, 0.35, 0.16), (5.4, 0.15, 0.06), (8.93, 0.06, 0.03)))
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


def bell(freq, dur=0.9, vel=1.0):
    t = tt(dur)
    x = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / d) for r, a, d in ((1, 1, 0.35), (2.0, 0.4, 0.2), (3.01, 0.2, 0.1), (4.2, 0.1, 0.05)))
    return fade(x * vel, 0.0005, 0.05)


def wah(name, dur, vel=1.0):
    """A muted brass note: a bright harmonic tone crossfaded from dull to bright and back (the wah)."""
    f = hz(name)
    t = tt(dur)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.15, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    x = sum(np.sin(k * ph) / k ** 0.9 for k in range(1, 14))
    dull, bright = filt(x, 'lowpass', 420), filt(x, 'lowpass', 2200)
    w = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    env = np.minimum(1, t / 0.03) * np.minimum(1, (dur - t) / 0.06)
    return fade((dull * (1 - w) + bright * w) * env * vel, 0.005, 0.04)


# ------------------------------------------------------------------ music
CH = {  # bass root, e-piano voicing
    'G': ('G2', ['B3', 'D4', 'G4']),
    'Em': ('E2', ['B3', 'E4', 'G4']),
    'C': ('C2', ['C4', 'E4', 'G4']),
    'D': ('D2', ['A3', 'D4', 'F#4']),
}
LOOP = ['G', 'Em', 'C', 'D']


def chord_at(beat):
    if beat >= 28:
        return 'G'
    if beat >= 25:
        return 'D'
    if beat >= 22.5:
        return 'C'
    return LOOP[int((beat - 1) // 2) % 4]


BASS_PAT = [(0, 'r', 0.9), (0.75, 'r', 0.5), (1.0, 'o', 0.6), (1.5, 'r', 0.7)]  # (beat offset in a 2-beat chord, root/octave, vel)


def groove(b0, b1, claps=False, full=True):
    """The shared groove from beat b0 to b1: drums, bass, e-piano stabs on the off-beats."""
    for beat in np.arange(b0, b1, 1):
        if int(beat) % 2 == 1:
            place('drums', kick(), b(beat), 0.62)
        else:
            place('drums', snare(), b(beat), 0.36, 0.05, send=0.12)
            if claps:
                place('drums', clap(), b(beat), 0.2, -0.1, send=0.15)
    for k, beat in enumerate(np.arange(b0, b1, 0.5)):
        place('drums', hat(vel=0.8 if k % 2 == 0 else 0.55), b(beat) + (0.01 if k % 2 else 0), 0.12, 0.25)
    for beat in np.arange(b0, b1, 1):
        if full and int(beat) % 4 == 2:
            place('drums', kick(0.7), b(beat + 0.75), 0.45)
    for cb in np.arange(b0, b1, 2):
        root, voice = CH[chord_at(cb)]
        for off, kind, vel in BASS_PAT:
            if cb + off >= b1:
                continue
            n = root if kind == 'r' else root[:-1] + str(int(root[-1]) + 1)
            place('bass', pluck_bass(n, b(0.4), vel), b(cb + off), 0.6)
        for off in (0.5, 1.5):
            if cb + off >= b1:
                continue
            for i, n in enumerate(voice):
                place('keys', epiano(n, 0.16, 0.75), b(cb + off) + 0.006 * i, 0.11, -0.3 + 0.3 * i, send=0.12)


RING = ['D6', 'B5', 'G5', 'B5', 'D6', 'G6', 'F#6', 'D6']  # the ringtone hook, 16ths over two beats


def ringtone(t0, bus='lead', pan=0.0, gain=0.2, vel=0.9):
    for k, n in enumerate(RING):
        place(bus, marimba(n, vel), t0 + k * b(0.25), gain, pan, send=0.2)


# 0-1: the split; the groove starts on beat 1
groove(1, 12)
# the catch gets a cymbal
place('drums', crash(0.5), b(3), 0.12, 0.0, send=0.1)
# the stars run up the scale
for i, n in enumerate(['G6', 'A6', 'B6', 'D7', 'G7']):
    place('lead', glock(n, 0.9), b(4 + 0.25 * i), 0.14, -0.4 + 0.2 * i, send=0.35)
# 12-18.5: the groove goes on in the right channel only (the left channel is muted below)
groove(12, 18.5)
ringtone(b(17), gain=0.12, vel=0.7)
# 18.5-19.75: a snare roll under "Én forskel:", in both channels
for k, beat in enumerate(np.arange(18.5, 19.75, 0.125)):
    place('fx', snare(0.35 + 0.5 * k / 10), b(beat), 0.16 + 0.12 * k / 10, 0.0, send=0.1)
place('fx', swell(b(1.25), 300, 5000, 0.95), b(18.5), 0.12)
place('fx', pluck_bass('D2', b(1.2), 0.8), b(18.5), 0.4)
# 19.75: the hit on "hjemmesiden."
place('fx', kick(1.0), b(19.75), 0.75)
place('fx', crash(0.9), b(19.75), 0.2, 0.0, send=0.2)
for i, n in enumerate(['G3', 'B3', 'D4', 'G4', 'B4']):
    place('fx', epiano(n, 0.7, 0.9), b(19.75) + 0.008 * i, 0.12, -0.3 + 0.15 * i, send=0.25)
# 19.75-22: the groove again on the right, then a fill into the end card's downbeat
groove(20, 22)
for k, beat in enumerate(np.arange(22, 23, 0.25)):
    place('drums', snare(0.45 + 0.15 * k), b(beat), 0.3, 0.05, send=0.1)
place('drums', kick(), b(23), 0.62)
place('drums', crash(0.8), b(23), 0.16, 0.0, send=0.2)
# 22.5-30: the end card, full stereo, the ringtone hook as the melody, a final chord on 28
groove(23, 27, claps=True)
for k, beat in enumerate(np.arange(27, 28, 0.25)):  # a snare fill into the last chord
    place('drums', snare(0.5 + 0.12 * k), b(beat), 0.3, 0.05, send=0.1)
place('bass', pluck_bass('D2', b(0.9)), b(27), 0.55)
ringtone(b(24), gain=0.16)
ringtone(b(26), gain=0.16)
place('drums', kick(1.0), b(28), 0.7)
place('drums', crash(0.7, 2.0), b(28), 0.16, 0.0, send=0.2)
place('bass', pluck_bass('G2', b(3)), b(28), 0.65)
for i, n in enumerate(['G3', 'B3', 'D4', 'G4', 'B4', 'D5']):
    place('keys', epiano(n, 1.4, 0.9), b(28) + 0.012 * i, 0.12, -0.4 + 0.16 * i, send=0.3)
place('lead', marimba('G6', 1.0, dur=1.5), b(28), 0.18, 0.0, send=0.3)


# ------------------------------------------------------------------ sound effects from the page's cue list
def pan_of(c):
    return SIDE[c.get('side', 'C')]


def whoosh(dur, f0, f1, peak=0.6):
    return swell(dur, f0, f1, peak)


def fx_split(c):
    # one whoosh splitting into two, one to each side
    for p in (-0.9, 0.9):
        place('fx', whoosh(0.45, 900, 3500, 0.35), c['t'] - 0.12, 0.14, p, send=0.15)
    t = tt(0.3)
    zip_ = np.sin(2 * np.pi * np.cumsum(500 + 1600 * t / 0.3) / SR) * np.exp(-t / 0.12)
    for p in (-0.8, 0.8):
        place('fx', fade(zip_, 0.002, 0.05), c['t'], 0.06, p)
    place('drums', kick(0.8), c['t'], 0.5)


def fx_word(c):
    t = tt(0.05)
    x = filt(noise(0.05), 'bandpass', [2000, 6000]) * np.exp(-t / 0.006)
    place('fx', fade(x, 0.0003, 0.01), c['t'], 0.08)


def fx_lift(c):
    place('fx', whoosh(0.3, 600, 2500, 0.7), c['t'], 0.05)


def fx_toss(c):
    # the hammer spins up: a whoosh pulsing with its two turns
    d = b(2)
    w = whoosh(d, 900, 2500, 0.45)
    t = np.arange(len(w)) / SR
    w *= 0.55 + 0.45 * np.abs(np.sin(2 * np.pi * 2 * t / d))
    place('fx', w, c['t'], 0.12)


def fx_catch(c):
    t = tt(0.2)
    thwack = np.sin(2 * np.pi * np.cumsum(140 + 120 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.07)
    thwack += filt(noise(0.2), 'bandpass', [1500, 5000]) * np.exp(-t / 0.01) * 0.6
    place('fx', fade(thwack, 0.0005, 0.03), c['t'], 0.45)


def fx_star(c):
    pass  # scored as the glockenspiel run above


def fx_tool(c):
    t0 = c['t']
    t = tt(0.2)
    pop = np.sin(2 * np.pi * np.cumsum(300 + 900 * (1 - np.exp(-t / 0.04))) / SR) * np.exp(-t / 0.05)
    place('fx', fade(pop, 0.001, 0.03), t0, 0.22, send=0.15)
    if c['kind'] == 'saw':
        tt_ = tt(0.22)
        x = filt(noise(0.22), 'bandpass', [1800, 6500]) * (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 14 * tt_)))
        place('fx', fade(x * np.exp(-tt_ / 0.12), 0.003, 0.04), t0 + 0.03, 0.22)
    elif c['kind'] == 'level':
        tt_ = tt(0.14)
        x = np.sin(2 * np.pi * np.cumsum(520 + 900 * tt_ / 0.14) / SR) * np.exp(-tt_ / 0.06)
        place('fx', fade(x, 0.002, 0.03), t0 + 0.04, 0.2)
    else:
        tt_ = tt(0.3)
        f = 170 + 110 * np.minimum(1, tt_ / 0.12)
        ph = 2 * np.pi * np.cumsum(f) / SR
        x = sum(np.sin(k * ph) / k for k in range(1, 12))
        x = filt(x, 'bandpass', [250, 3500]) + filt(noise(0.3), 'bandpass', [2000, 6000]) * 0.2
        place('fx', fade(x * np.exp(-tt_ / 0.15), 0.004, 0.05), t0 + 0.03, 0.14)


def fx_sticker(c):
    t = tt(0.15)
    slap = filt(noise(0.15), 'bandpass', [600, 4000]) * np.exp(-t / 0.018) + 0.8 * np.sin(2 * np.pi * 110 * t) * np.exp(-t / 0.05)
    place('fx', fade(slap, 0.0003, 0.03), c['t'], 0.5)
    # ka-ching: two bells and a few coins
    place('fx', bell(hz('C7')), c['t'] + 0.06, 0.16, 0.0, send=0.25)
    place('fx', bell(hz('G7')), c['t'] + 0.14, 0.16, 0.0, send=0.25)
    for k in range(7):
        tc = tt(0.03)
        place('fx', np.sin(2 * np.pi * rng.uniform(5000, 8000) * tc) * np.exp(-tc / 0.006), c['t'] + 0.1 + k * rng.uniform(0.02, 0.04), 0.06, rng.uniform(-0.3, 0.3))


def fx_poof(c):
    place('fx', whoosh(0.3, 3000, 900, 0.2), c['t'], 0.08)


def fx_phone(c):
    place('fx', whoosh(0.3, 800, 3000, 0.6), c['t'], 0.07)


def fx_ring(c):
    p = pan_of(c)
    ringtone(c['t'], bus='fx', pan=p, gain=0.22)
    # the phone buzzing in his hand
    d = c['until'] - c['t']
    t = tt(d)
    x = filt(np.sign(np.sin(2 * np.pi * 150 * t)) * 0.5 + np.sin(2 * np.pi * 150 * t), 'lowpass', 900)
    gate = (np.sin(2 * np.pi * 2 * t) > -0.2).astype(float)
    gate = filt(gate, 'lowpass', 60)
    place('fx', fade(x * gate, 0.005, 0.03), c['t'], 0.06, p)


def fx_answer(c):
    t = tt(0.04)
    place('fx', fade(filt(noise(0.04), 'bandpass', [2500, 7000]) * np.exp(-t / 0.004), 0.0002, 0.01), c['t'], 0.18, pan_of(c))


CARD_NOTES = [('B6', 'G7'), ('D7', 'B7'), ('G6', 'D7'), ('A6', 'F#7')]


def fx_card(c):
    lo, hi = CARD_NOTES[c['i']]
    p = pan_of(c)
    place('fx', bell(hz(lo), 0.6, 0.9), c['t'], 0.12, p, send=0.25)
    place('fx', bell(hz(hi), 0.8, 0.9), c['t'] + 0.08, 0.12, p, send=0.25)


def fx_thumb(c):
    for k, n in enumerate(['D7', 'G7', 'B7']):
        place('fx', glock(n, 0.8), c['t'] + k * 0.04, 0.1, pan_of(c), send=0.35)


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
    p = pan_of(c)
    for k in range(4):
        place('fx', cricket(4650 + 40 * (k % 2)), c['t'] + k * 0.3, 0.1, p)


def fx_tap(c):
    for dt in (0.36, 0.61):
        t = tt(0.05)
        x = filt(noise(0.05), 'bandpass', [1500, 6000]) * np.exp(-t / 0.005) + 0.5 * np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.012)
        place('fx', fade(x, 0.0002, 0.01), c['t'] + dt, 0.3, pan_of(c))


def fx_shake(c):
    p = pan_of(c)
    for k in range(5):
        place('fx', whoosh(0.1, 1500, 3500, 0.5), c['t'] + 0.12 + k * b(0.28), 0.05, p)


def fx_tumble(c):
    p = pan_of(c)
    d = c['until'] - c['t']
    # desert wind
    place('fx', swell(d + 0.8, 380, 900, 0.5), c['t'] - 0.3, 0.1, p, send=0.2)
    # dry twigs on each landing (three hops)
    for k in range(1, 4):
        tl = c['t'] + d * k / 3
        t = tt(0.16)
        x = filt(noise(0.16), 'bandpass', [1500, 6000]) * np.exp(-t / 0.05) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 40 * t)))
        place('fx', fade(x, 0.002, 0.03), tl, 0.12 * (1.1 - 0.2 * k), p)


def fx_bump(c):
    t = tt(0.25)
    x = np.sin(2 * np.pi * np.cumsum(95 + 40 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.08) + filt(noise(0.25), 'bandpass', [800, 3000]) * np.exp(-t / 0.03) * 0.4
    place('fx', fade(x, 0.001, 0.04), c['t'], 0.4, pan_of(c))


def fx_shrug(c):
    p = pan_of(c)
    place('fx', wah('Bb3', 0.32), c['t'], 0.14, p, send=0.15)
    place('fx', wah('A3', 0.6), c['t'] + 0.36, 0.14, p, send=0.15)


def fx_reveal(c):
    place('fx', whoosh(0.5, 400, 3000, 0.8), c['t'] - 0.1, 0.1)


def fx_circle(c):
    t = tt(0.45)
    f = 2300 + 350 * np.sin(2 * np.pi * 3 * t) + 120 * np.sin(2 * np.pi * 19 * t)
    sq = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 8 * t)))
    scratch = filt(noise(0.45), 'bandpass', [2500, 8000]) * 0.5
    env = np.minimum(1, t / 0.03) * np.minimum(1, (0.45 - t) / 0.06)
    place('fx', fade((0.25 * sq + scratch) * env, 0.003, 0.03), c['t'], 0.12, pan_of(c))


def fx_expand(c):
    w = whoosh(0.7, 300, 4000, 0.7)
    n = len(w)
    pan = np.linspace(0.85, 0.0, n)
    th = (pan + 1) * np.pi / 4
    place('fx', np.stack([w * np.cos(th), w * np.sin(th)]) * np.sqrt(2), c['t'] - 0.15, 0.16, send=0.2)
    place('drums', kick(0.9), c['t'] + 0.5, 0.55)


def fx_logo(c):
    place('lead', marimba('G5', 0.9), c['t'], 0.18, 0.0, send=0.3)


def fx_wordmark(c):
    t = tt(0.2)
    for p in (-0.7, 0.7):
        place('fx', whoosh(0.35, 1500, 5000, 0.8), c['t'] - 0.05, 0.05, p)
    clack = filt(noise(0.2), 'bandpass', [1500, 5000]) * np.exp(-t / 0.008) + 0.5 * np.sin(2 * np.pi * 700 * t) * np.exp(-t / 0.02)
    place('fx', fade(clack, 0.0003, 0.03), c['t'] + 0.3, 0.3)


def fx_tag(c):
    place('fx', whoosh(0.4, 3000, 800, 0.3), c['t'], 0.04)


def fx_cta(c):
    t = tt(0.25)
    pop = np.sin(2 * np.pi * np.cumsum(260 + 900 * (1 - np.exp(-t / 0.05))) / SR) * np.exp(-t / 0.07)
    place('fx', fade(pop, 0.001, 0.03), c['t'], 0.3, send=0.2)
    place('lead', glock('G6', 1.0), c['t'] + 0.02, 0.16, 0.0, send=0.4)


FX = {'split': fx_split, 'word': fx_word, 'lift': fx_lift, 'toss': fx_toss, 'catch': fx_catch, 'star': fx_star, 'tool': fx_tool,
      'sticker': fx_sticker, 'poof': fx_poof, 'phone': fx_phone, 'ring': fx_ring, 'answer': fx_answer, 'card': fx_card,
      'thumb': fx_thumb, 'cricket': fx_cricket, 'tap': fx_tap, 'shake': fx_shake, 'tumble': fx_tumble, 'bump': fx_bump,
      'shrug': fx_shrug, 'reveal': fx_reveal, 'circle': fx_circle, 'expand': fx_expand, 'logo': fx_logo, 'wordmark': fx_wordmark,
      'tag': fx_tag, 'cta': fx_cta}
for cue in CUES['cues']:
    FX[cue['type']](cue)
# a second, farther cricket keeps going in the left channel while nothing happens there
for tc in np.arange(b(12.4), b(22.5), 0.62):
    if not (b(18.5) <= tc < b(19.8)):
        place('fx', cricket(4200, 3), tc, 0.035, -0.95)


# ------------------------------------------------------------------ the split: music leaves the left channel while nothing happens there
tn = np.arange(N) / SR
left = np.ones(N)
left[(tn >= b(12)) & (tn < b(22.5))] = 0.0
ramp = (tn >= b(22.5)) & (tn < b(23))
left[ramp] = (tn[ramp] - b(22.5)) / (b(23) - b(22.5))
left = filt(left, 'lowpass', 40)  # ~10 ms edges, no clicks
for k in MUSIC:
    BUS[k][0] *= left

# ------------------------------------------------------------------ mix + master
ir_t = tt(1.6)
ir = np.stack([filt(rng.standard_normal(len(ir_t)), 'lowpass', 7000) * np.exp(-ir_t / 0.3) for _ in range(2)])
ir[:, : int(0.01 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
verb = np.stack([sg.fftconvolve(BUS['send'][ch], ir[ch])[:N] for ch in range(2)]) * 0.45
verb[0] *= np.maximum(left, 0.35)  # the left channel's tail follows its music, but the crickets keep a little room

GAINS = {'drums': 0.9, 'bass': 0.55, 'keys': 1.0, 'lead': 1.0, 'fx': 1.0}
mixed = sum(BUS[k] * g for k, g in GAINS.items()) + verb
mixed = filt(mixed, 'highpass', 30)
mixed = filt(mixed, 'lowpass', 16500)
mixed[:, -int(0.4 * SR):] *= np.linspace(1, 0, int(0.4 * SR)) ** 1.5


def limit(x, ceiling=0.86, look=0.004, release=0.06):
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
seg = lambda a, z, ch: 20 * np.log10(np.sqrt(np.mean(mixed[ch, int(a * SR):int(z * SR)] ** 2)) + 1e-12)
print(f'split section {b(12.5):.1f}-{b(18):.1f}s: left {seg(b(12.5), b(18), 0):.1f} dB, right {seg(b(12.5), b(18), 1):.1f} dB (RMS)')
print(f'wrote {os.path.normpath(OUT)}  peak {20 * np.log10(np.max(np.abs(mixed))):.2f} dBFS  loudness {lufs(mixed):.1f} LUFS  {N / SR:.3f}s')
