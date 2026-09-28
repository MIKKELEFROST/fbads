#!/usr/bin/env python3
"""
Soundtrack for "Vejrudsigten" (96 BPM, F major, 24 beats = 15 s), synthesised for this ad in numpy/scipy: a light
weather-forecast jingle on vibraphone, upright bass and brushes. Sound effects are placed from out/cues.json, which
the page itself exports; every booking that lands on a city under the shower plays a vibraphone note from the
chord, so the rain turns into a melody.

    node tools/render.mjs --cues && python3 tools/make_audio.py     # -> out/soundtrack.wav (48 kHz, ~-14 LUFS)
    python3 tools/make_audio.py --vo=vo/da                          # -> out/soundtrack-da.wav (+ Danish voice-over)

Instruments: vibraphone (bars tuned 1:4:10 with a tremolo motor), an upright bass (Karplus-Strong), brushes, a
ride cymbal, a soft kick, glockenspiel. Sound effects: the opening sting, heat shimmer, dull clicks for the empty
counters, the wind of the front, rain, the raindrop notes, ticks for the five days, the brand chime.

Music: the sting on the downbeat · a light comp while it is dry (no bass, a heat shimmer on top) · the band comes in
with the front, walking bass and swung ride · the shower plays the chord in raindrops · the outlook and end card on
the full groove, a final F chord that rings out.
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
first = lambda kind: next(c for c in CUES['cues'] if c['type'] == kind)  # noqa: E731
T_DRY = first('zero')['t'] - 1.0
T_FRONT, T_FRONT1 = first('front')['t'], first('front')['until']
T_OUTLOOK, T_BUSY, T_BRAND, T_CTA = first('outlook')['t'], first('busy')['t'], first('brand')['t'], first('cta')['t']


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
BUS = {k: np.zeros((2, N)) for k in ('vibes', 'bass', 'drums', 'fx', 'send', 'vo')}


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
def vibes(name, vel=1.0, dur=2.2, motor=5.5):
    """Vibraphone: aluminium bars tuned 1:4:10, a soft mallet thump, and the motor's tremolo."""
    f = hz(name) if isinstance(name, str) else name
    t = tt(dur)
    life = np.clip(2.2 * (440 / f) ** 0.3, 0.8, 3.0)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / life)
    x += 0.22 * vel * np.sin(2 * np.pi * f * 4.0 * t) * np.exp(-t / (life * 0.18))
    x += 0.05 * vel * np.sin(2 * np.pi * f * 10.0 * t) * np.exp(-t / (life * 0.05))
    x *= 1 - 0.28 * (0.5 - 0.5 * np.cos(2 * np.pi * motor * t))
    x += filt(noise(dur), 'bandpass', [600, 2500]) * np.exp(-t / 0.003) * 0.15 * vel
    return fade(x * vel, 0.001, 0.1)


def glock(name, vel=1.0):
    f = hz(name)
    t = tt(1.4)
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in ((1, 1, 0.6), (2.76, 0.35, 0.16), (5.4, 0.15, 0.06), (8.93, 0.06, 0.03)))
    return fade(x * vel, 0.0005, 0.05)


def pluck_bass(name, dur, vel=1.0):
    f = hz(name)
    n = int(dur * SR) + int(0.15 * SR)
    period = max(2, int(round(SR / f)))
    exc = np.zeros(n)
    burst = filt(rng.standard_normal(period), 'lowpass', 1200)
    exc[:period] = burst / (np.max(np.abs(burst)) + 1e-9)
    g = 0.996
    a = np.zeros(period + 2)
    a[0], a[period], a[period + 1] = 1.0, -g / 2, -g / 2
    y = sg.lfilter([1.0], a, exc)
    t = np.arange(n) / SR
    env = np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.05))
    y = filt(y * env, 'lowpass', 900) + 0.55 * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.4) * env
    return fade(y / (np.max(np.abs(y)) + 1e-9) * vel, 0.001, 0.04)


def brush(vel=1.0, dur=0.22):
    """A brush slap: soft-attack band noise."""
    t = tt(dur)
    x = filt(noise(dur), 'bandpass', [1800, 9000]) * np.minimum(1, t / 0.012) * np.exp(-t / 0.07)
    return fade(x * vel, 0.002, 0.03)


def ride(vel=1.0):
    t = tt(0.9)
    m = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * np.exp(-t / d) for f, d in ((3890, 0.5), (5270, 0.35), (6740, 0.25), (8120, 0.2)))
    return fade((0.12 * m + filt(noise(0.9), 'highpass', 6000) * np.exp(-t / 0.08) * 0.5) * vel, 0.0005, 0.1)


def kick(vel=1.0):
    t = tt(0.3)
    return fade(np.sin(2 * np.pi * np.cumsum(46 + 60 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.18) * vel, 0.002, 0.04)


def swell(dur, f0, f1, peak=0.8):
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


# ------------------------------------------------------------------ music
CH = {  # bass walk (4 quarter notes over 2 beats → two per beat is too busy; roots on 1, approach on 2), vibes voicing
    'Fmaj7': (['F2', 'A2'], ['A3', 'C4', 'E4', 'A4']),
    'Dm7': (['D2', 'E2'], ['F3', 'A3', 'C4', 'F4']),
    'Gm7': (['G2', 'A2'], ['F3', 'Bb3', 'D4', 'F4']),
    'C7': (['C2', 'E2'], ['E3', 'Bb3', 'D4', 'G4']),
}
LOOP = ['Fmaj7', 'Dm7', 'Gm7', 'C7']


def chord_at(t):
    return LOOP[int(t / b(2)) % 4]


SWING = 2 / 3  # swung 8ths: the off-beat sits two thirds into the beat
# the opening sting: a quick vibes run up and a glockenspiel on top
for i, n in enumerate(['F4', 'A4', 'C5', 'E5', 'F5']):
    place('vibes', vibes(n, 0.9, 2.0), 0.02 + i * 0.055, 0.2, -0.4 + 0.2 * i, send=0.3)
place('fx', glock('F6', 0.8), 0.3, 0.12, 0.2, send=0.4)
place('drums', ride(0.9), 0.02, 0.2, 0.3, send=0.2)
place('drums', kick(0.8), 0.02, 0.5)

# comping: vibes chords on 1 and the swung "and" of 2, from the sting to the final chord
t_fin = min(b(np.ceil((T_CTA + 0.4) / B)), b(np.floor((DUR - 1.2) / B)))  # the final chord: on a beat after the CTA, 1.2 s before the end
t_end_music = t_fin
beat = 2
while b(beat) < t_end_music:
    t0 = b(beat)
    c = chord_at(t0)
    dry = T_DRY - 0.2 <= t0 < T_FRONT - 0.3
    for k, n in enumerate(CH[c][1]):
        place('vibes', vibes(n, 0.6, 1.6 if not dry else 2.4), t0 + 0.01 * k, 0.08, -0.3 + 0.2 * k, send=0.25)
    if not dry:
        for k, n in enumerate(CH[c][1][1:]):
            place('vibes', vibes(n, 0.45, 0.8), t0 + b(1 + SWING) + 0.008 * k, 0.06, 0.2 - 0.15 * k, send=0.2)
    beat += 2

# bass and drums: brushes from the start, the band proper from the front on
for k in range(2, int(t_end_music / B)):
    t0 = b(k)
    in_band = t0 >= T_FRONT - 0.05
    dry = T_DRY - 0.2 <= t0 < T_FRONT - 0.05
    if k % 2 == 1:
        place('drums', brush(0.8 if in_band else 0.55), t0, 0.12, 0.15, send=0.1)
    if in_band:
        root, walk = CH[chord_at(t0)][0]
        place('bass', pluck_bass(root if k % 2 == 0 else walk, B * 0.85), t0, 0.55)
        place('drums', ride(0.75 if k % 2 == 0 else 0.6), t0, 0.1, 0.35, send=0.08)
        place('drums', ride(0.45), t0 + b(SWING), 0.07, 0.35)
        if k % 2 == 0:
            place('drums', kick(0.6), t0, 0.4)
    elif not dry and k % 2 == 0:
        place('bass', pluck_bass(CH[chord_at(t0)][0][0], B * 1.6), t0, 0.45)
# the final chord
for i, n in enumerate(['F2', 'C4', 'E4', 'A4', 'C5', 'F5']):
    place('vibes' if i else 'bass', vibes(n, 0.8, DUR - t_fin) if i else pluck_bass(n, DUR - t_fin - 0.2), t_fin + 0.02 * i, 0.12 if i else 0.5, -0.4 + 0.16 * i, send=0.35)
place('drums', ride(1.0), t_fin, 0.2, 0.3, send=0.25)
place('drums', kick(0.9), t_fin, 0.55)


# ------------------------------------------------------------------ sound effects from the page's cue list
def fx_intro(c):
    place('fx', swell(0.6, 400, 5000, 0.6), c['t'], 0.08, 0.0, send=0.2)


def fx_sun(c):
    for k, n in enumerate(['C6', 'F6']):
        place('fx', glock(n, 0.7), c['t'] + 0.05 * k, 0.07, -0.4 + 0.4 * c['i'], send=0.4)


def fx_zero(c):
    t = tt(0.07)
    x = np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.02) + filt(noise(0.07), 'bandpass', [800, 2500]) * np.exp(-t / 0.006) * 0.4
    place('fx', fade(x, 0.001, 0.02), c['t'], 0.12, -0.5 + 0.25 * c['i'])


def fx_front(c):
    d = c['until'] - c['t']
    w = swell(d + 0.6, 250, 1400, 0.55)
    n = len(w)
    pan = np.linspace(-0.8, 0.8, n)  # the wind crosses from west to east with the front
    th = (pan + 1) * np.pi / 4
    place('fx', np.stack([w * np.cos(th), w * np.sin(th)]), c['t'] - 0.2, 0.18, send=0.2)
    # rain behind the front
    r = filt(noise(d + 1.5), 'bandpass', [2500, 9000]) * 0.25
    env = np.clip(np.linspace(-0.5, 1.5, len(r)), 0, 1) * np.clip(np.linspace(3, 0, len(r)), 0, 1)
    place('fx', r * env, c['t'] + 0.4, 0.1, 0.1, send=0.1)


def fx_drop(c):
    # each landing booking: a vibes note from the chord, high and short; cities spread across the stereo field
    voice = CH[chord_at(c['t'])][1]
    n = voice[(c['k'] * 3 + c['i']) % len(voice)]
    f = hz(n) * 2
    place('fx', vibes(f, 0.55, 0.7, motor=0), c['t'], 0.045, [-0.2, 0.0, -0.6, 0.1, 0.6][c['i']], send=0.3)


def fx_outlook(c):
    place('fx', swell(0.6, 3000, 700, 0.25), c['t'], 0.06, 0.0, send=0.2)


def fx_day(c):
    t = tt(0.05)
    x = filt(noise(0.05), 'bandpass', [2000, 7000]) * np.exp(-t / 0.005)
    place('fx', fade(x, 0.0002, 0.01), c['t'], 0.12, -0.5 + 0.25 * c['i'])
    place('fx', glock(['F5', 'G5', 'A5', 'C6', 'D6'][c['i']], 0.5), c['t'], 0.06, -0.5 + 0.25 * c['i'], send=0.3)


def fx_busy(c):
    place('drums', kick(1.0), c['t'], 0.5)
    place('drums', ride(1.0), c['t'], 0.16, 0.2, send=0.2)
    for i, n in enumerate(['F4', 'A4', 'C5', 'F5']):
        place('fx', vibes(n, 0.9, 1.4), c['t'] + 0.012 * i, 0.07, -0.3 + 0.2 * i, send=0.3)


def fx_brand(c):
    for k, n in enumerate(['A5', 'C6', 'F6']):
        place('fx', glock(n, 0.8), c['t'] + 0.06 * k, 0.08, -0.2 + 0.2 * k, send=0.4)


def fx_cta(c):
    t = tt(0.25)
    pop = np.sin(2 * np.pi * np.cumsum(260 + 900 * (1 - np.exp(-t / 0.05))) / SR) * np.exp(-t / 0.07)
    place('fx', fade(pop, 0.001, 0.03), c['t'], 0.25, send=0.2)
    place('fx', glock('F6', 1.0), c['t'] + 0.02, 0.12, 0.0, send=0.4)


FX = {'intro': fx_intro, 'sun': fx_sun, 'zero': fx_zero, 'front': fx_front, 'drop': fx_drop, 'outlook': fx_outlook,
      'day': fx_day, 'busy': fx_busy, 'brand': fx_brand, 'cta': fx_cta}
for cue in CUES['cues']:
    FX[cue['type']](cue)
# heat shimmer while it is dry: two high sines drifting against each other
d = T_FRONT + 0.8 - T_DRY
t = tt(d)
sh = (np.sin(2 * np.pi * 3520 * t + 2 * np.sin(2 * np.pi * 0.7 * t)) + np.sin(2 * np.pi * 3530 * t)) * 0.5
sh *= np.clip(t / 0.6, 0, 1) * np.clip((d - t) / 0.8, 0, 1)
place('fx', sh, T_DRY, 0.012, 0.0, send=0.3)


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


GAINS = {'vibes': 1.0, 'bass': 0.6, 'drums': 0.85, 'fx': 1.0}
VO_OVER_BED = 12.0  # dB (K-weighted) the voice sits above the ducked music while it speaks, at least per line
DUCK_DB = {'vibes': 8, 'bass': 3, 'drums': 6, 'fx': 7, 'send': 7}
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
ir_t = tt(1.8)
ir = np.stack([filt(rng.standard_normal(len(ir_t)), 'lowpass', 6000) * np.exp(-ir_t / 0.4) for _ in range(2)])
ir[:, : int(0.012 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
verb = np.stack([sg.fftconvolve(BUS['send'][ch], ir[ch])[:N] for ch in range(2)]) * 0.5

mixed = sum(BUS[k] * g for k, g in GAINS.items()) + verb
mixed = filt(mixed, 'highpass', 30)
mixed = filt(mixed, 'lowpass', 16000)
mixed[:, -int(0.35 * SR):] *= np.linspace(1, 0, int(0.35 * SR)) ** 1.5


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
print(f'wrote {os.path.normpath(OUT)}  peak {20 * np.log10(np.max(np.abs(mixed))):.2f} dBFS  loudness {lufs(mixed):.1f} LUFS  {N / SR:.3f}s')
