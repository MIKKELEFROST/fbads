#!/usr/bin/env python3
# ═════════════════════════════════════════════════════════════════════════════════════════════
#  CLAUDE — Motion Reel 2026 · procedural soundtrack                               audio/synth.py
#
#    python3 audio/synth.py             → audio/reel.wav  (48 kHz · stereo · 16-bit · 720 000 frames)
#    python3 audio/synth.py --out X.wav → somewhere else
#    python3 audio/synth.py --quiet     → no report
#
#  Every sound is built from oscillators, noise and arithmetic — no samples, no downloads — and
#  the whole render is deterministic: each random stream is seeded from a stable text key, so the
#  file is bit-identical run to run. Deps: numpy + scipy.
#
#  THE GRID. 128 BPM → one beat = 0.46875 s = exactly 22 500 samples at 48 kHz. Every accent in
#  lib/timeline.js (R.HITS) therefore lands on an integer sample, and every hit layer in this file
#  starts its transient ON that sample. Anything that must lead INTO a hit (whooshes, risers,
#  reverse swells) is placed by its END (Mix.add_end), so it can never smear the onset.
#  audio/analyze.py measures the result against the timeline (onset error must be < 2 ms).
#
#  SIGNAL FLOW
#    instruments ─► buses  kick · boom · sub · bass (mono)  |  drums · hits · music · pad · fx (stereo)
#                 └► sends room · hall (synthetic-IR convolution) · dly (ping-pong ⅜-beat)
#    bus stage     4th-order HPF (110–180 Hz) on everything that is not kick/boom/sub/bass, a
#                  DC blocker on those; kick-keyed sidechain pump (per-bus depth/release) on the
#                  sustained parts only — a hit's own sub layer lives on 'boom' and is never
#                  ducked by it; arrangement automation ("sucks" into hits, the tension gap);
#                  bus faders
#    master        air shelf → glue compressor → 4× oversampled soft clipper → true-peak
#                  look-ahead limiter (−1.3 dBTP) → loudness-normalised to −14 LUFS (BS.1770-4,
#                  gated) → end fade → TPDF dither → 16-bit PCM
#
#  KEY F minor. Harmony per beat (b = beat index):
#    0–3  F pedal (ignition)          4–9   Fm Fm Db Eb Ab Bbm (word slams, top line C C Eb G F)
#    10–15 Fm Fm Db Db Eb Eb (arp)    16–19 Dbmaj9 Dbmaj9 Bbm9 Bbm9 (depth pad)
#    20–23 Fm Fm Db Eb (wobble)       24–27 Fm Ab Bbm C (build: V → i)     28–31 Fm9 (lockup)
#
#  A few picture-sync details mirror the scene files exactly (their seeded schedules are
#  re-derived here with a port of R.rng / mulberry32): the typed line and its backspace run
#  in s1, the ruler ticks popping out from the centre, the TIMING letters landing on 32nd-note
#  triplets and the "is" tittle in s2, the drain and the dot pop in s4, and the mono line
#  decoding in s7. Staging moves (glides, camera punches, the ruler retract) get envelopes
#  shaped by the velocity of the scene's own easing curve (bezier_ease, a port of R.ease.bezier).
# ═════════════════════════════════════════════════════════════════════════════════════════════
import os
import sys
import time
import wave
import zlib

import numpy as np
from scipy import signal as sps

HERE = os.path.dirname(os.path.abspath(__file__))

# ───────────────────────────────────────── grid ─────────────────────────────────────────────
SR = 48_000
N = 720_000                       # exactly 15.000 s
BPM = 128
BEAT = 60.0 / BPM                 # 0.46875 s = 22 500 samples
BAR = 4 * BEAT
S8, S16, S32 = BEAT / 2, BEAT / 4, BEAT / 8
FPS = 60
TAU = 2.0 * np.pi
SQ2 = np.sqrt(2.0)
LUFS_TARGET = -14.0
TP_CEIL_DB = -1.3                 # limiter ceiling (true peak); spec is ≤ −1 dBTP


def b(n):
    """Beat index → seconds."""
    return n * BEAT


def smp(t):
    """Seconds → nearest sample index (beats are exact integers)."""
    return int(round(t * SR))


def nsamp(d):
    return max(1, int(round(d * SR)))


def taxis(n):
    return np.arange(n) / SR


def undb(d):
    return 10.0 ** (d / 20.0)


def lin2db(x):
    return 20.0 * np.log10(np.maximum(x, 1e-12))


def smoothstep(a, c, x):
    u = np.clip((np.asarray(x, float) - a) / (c - a), 0.0, 1.0)
    return u * u * (3.0 - 2.0 * u)


def on_frame(t):
    """First 60 fps frame time that shows an event scheduled at t (picture-side quantisation)."""
    return np.ceil(t * FPS - 1e-9) / FPS


def bezier_ease(x1, y1, x2, y2):
    """Vectorised CSS cubic-bezier (R.ease.bezier): u ∈ 0..1 (array) → eased value."""
    s = np.linspace(0.0, 1.0, 4097)
    bx = ((1 - 3 * x2 + 3 * x1) * s + (3 * x2 - 6 * x1)) * s * s + 3 * x1 * s
    by = ((1 - 3 * y2 + 3 * y1) * s + (3 * y2 - 6 * y1)) * s * s + 3 * y1 * s
    return lambda u: np.interp(np.clip(u, 0.0, 1.0), bx, by)


def ease_speed(ease, n):
    """|d ease / du| sampled on n points over u ∈ 0..1, normalised to a peak of 1 (motion → level)."""
    v = np.abs(np.gradient(ease(np.linspace(0.0, 1.0, n))))
    return v / max(v.max(), 1e-12)


# Accent map — mirrors R.HITS in lib/timeline.js (beat, strength, kind). analyze.py re-parses
# the JS and cross-checks, so a timeline edit can't silently drift away from the score.
HITS = [
    (1, .12, 'bounce'), (2, .10, 'bounce'), (3, .08, 'bounce'), (4, 1.0, 'drop'),
    (5, .45, 'slam'), (6, .45, 'slam'), (7, .45, 'slam'), (8, .55, 'slam'), (9, .45, 'slam'),
    (10, .6, 'portal'), (11, .25, 'morph'), (12, .25, 'morph'), (13, .25, 'morph'),
    (14, .25, 'morph'), (15, .3, 'morph'), (16, .8, 'burst'), (17, .25, 'morph'),
    (18, .25, 'morph'), (19, .25, 'morph'), (20, .7, 'splash'), (22, .3, 'wobble'),
    (24, .6, 'split'), (25, .5, 'split'), (26, .5, 'split'), (27, .5, 'split'),
    (28, 1.0, 'final'), (31, .4, 'sting'),
]

# ───────────────────────────────────────── pitch ────────────────────────────────────────────
_PC = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9,
       'Bb': 10, 'B': 11}


def nm(s):
    """'Ab4' → 68 (MIDI)."""
    return 12 * (int(s[-1]) + 1) + _PC[s[:-1]]


def hz(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def chord(*names):
    return [nm(s) for s in names]


# ───────────────────────────────────── determinism ──────────────────────────────────────────
def seed_of(*key):
    return zlib.crc32(repr(key).encode()) & 0xFFFFFFFF


def rng(*key):
    return np.random.default_rng(seed_of('rng', *key))


def noise(n, *key):
    return np.random.default_rng(seed_of('noise', *key)).standard_normal(n)


def mulberry32(seed):
    """Bit-exact port of R.rng (lib/core.js) — used to mirror the scenes' seeded schedules."""
    a = seed & 0xFFFFFFFF

    def nxt():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return nxt


# ═════════════════════════════════════════ DSP ══════════════════════════════════════════════
def fade(x, fin=8, fout=96):
    """Raised-cosine fade in/out (samples). Every event gets one: first & last samples are 0."""
    x = np.array(x, dtype=float)
    n = x.shape[-1]
    fin, fout = min(fin, n // 2), min(fout, n // 2)
    if fin > 0:
        x[..., :fin] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(fin) / fin)
    if fout > 0:
        x[..., n - fout:] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(fout) + 1) / fout)
    return x


def norm(x, peak=1.0):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def phase(f, n=None, ph0=0.0):
    """Running phase in cycles for a scalar or per-sample frequency; phase[0] = ph0."""
    if np.ndim(f) == 0:
        return ph0 + f * np.arange(n) / SR
    f = np.asarray(f, float)
    p = np.empty(len(f))
    p[0] = 0.0
    np.cumsum(f[:-1], out=p[1:])
    return ph0 + p / SR


def _blep(t, dt):
    y = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    y[m] = x + x - x * x - 1.0
    m = t > 1.0 - dt
    x = (t[m] - 1.0) / dt[m]
    y[m] = x * x + x + x + 1.0
    return y


def _fr_dt(f, n, ph0):
    p = phase(f, n, ph0)
    fr = p % 1.0
    dt = np.broadcast_to(np.abs(np.asarray(f, float)) / SR, fr.shape)
    return fr, np.minimum(dt, 0.5)


def saw(f, n=None, ph0=0.0):
    """Band-limited (PolyBLEP) sawtooth."""
    fr, dt = _fr_dt(f, n, ph0)
    return 2.0 * fr - 1.0 - _blep(fr, dt)


def square(f, n=None, ph0=0.0, pw=0.5):
    """Band-limited (PolyBLEP) pulse."""
    fr, dt = _fr_dt(f, n, ph0)
    y = np.where(fr < pw, 1.0, -1.0)
    return y + _blep(fr, dt) - _blep((fr + 1.0 - pw) % 1.0, dt)


def sine(f, n=None, ph0=0.0):
    return np.sin(TAU * phase(f, n, ph0))


def pan2(x, p=0.0):
    """Mono → stereo, equal-power law normalised so centre = unity per side. p may be an array."""
    th = (np.clip(p, -1.0, 1.0) + 1.0) * (np.pi / 4.0)
    return np.stack([x * np.cos(th) * SQ2, x * np.sin(th) * SQ2])


# ── filters ──────────────────────────────────────────────────────────────────────────────────
def rbj(kind, f0, Q=0.7071, gain_db=0.0):
    """RBJ-cookbook biquad → (b, a)."""
    f0 = min(max(f0, 8.0), 0.47 * SR)
    w = TAU * f0 / SR
    c, s = np.cos(w), np.sin(w)
    al = s / (2.0 * Q)
    A = 10.0 ** (gain_db / 40.0)
    if kind == 'lp':
        bb, aa = [(1 - c) / 2, 1 - c, (1 - c) / 2], [1 + al, -2 * c, 1 - al]
    elif kind == 'hp':
        bb, aa = [(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al]
    elif kind == 'bp':                                  # 0 dB peak
        bb, aa = [al, 0.0, -al], [1 + al, -2 * c, 1 - al]
    elif kind == 'peak':
        bb, aa = [1 + al * A, -2 * c, 1 - al * A], [1 + al / A, -2 * c, 1 - al / A]
    elif kind in ('hs', 'ls'):
        sq = 2.0 * np.sqrt(A) * al
        if kind == 'hs':
            bb = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c),
                  A * ((A + 1) + (A - 1) * c - sq)]
            aa = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
        else:
            bb = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c),
                  A * ((A + 1) - (A - 1) * c - sq)]
            aa = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
    else:
        raise ValueError(kind)
    bb, aa = np.array(bb), np.array(aa)
    return bb / aa[0], aa / aa[0]


def filt(x, kind, f0, Q=0.7071, gain_db=0.0):
    bb, aa = rbj(kind, f0, Q, gain_db)
    return sps.lfilter(bb, aa, x, axis=-1)


def butter(x, kind, fc, order=4):
    sos = sps.butter(order, fc, btype={'hp': 'highpass', 'lp': 'lowpass'}[kind], fs=SR, output='sos')
    return sps.sosfilt(sos, x, axis=-1)


def tvfilt(x, kind, f0, Q=0.7071, block=32):
    """Time-varying biquad: coefficients re-derived every `block` samples (0.67 ms), state carried
    across blocks — smooth enough for fast sweeps and 4 Hz wobbles, and ~100× faster than a
    per-sample Python loop."""
    x = np.asarray(x, float)
    one = x.ndim == 1
    X = np.atleast_2d(x)
    n = X.shape[-1]
    f0 = np.broadcast_to(np.asarray(f0, float), (n,))
    Qa = np.broadcast_to(np.asarray(Q, float), (n,))
    out = np.empty_like(X)
    zi = np.zeros((X.shape[0], 2))
    for s in range(0, n, block):
        e = min(n, s + block)
        m = (s + e - 1) // 2
        bb, aa = rbj(kind, f0[m], Qa[m])
        out[:, s:e], zi = sps.lfilter(bb, aa, X[:, s:e], axis=-1, zi=zi)
    return out[0] if one else out


def crush(x, hold=6, bits=6):
    """Bit-crusher: sample-and-hold decimation + amplitude quantisation."""
    n = x.shape[-1]
    y = np.repeat(x[..., ::hold], hold, axis=-1)[..., :n]
    q = 2.0 ** (bits - 1)
    return np.round(y * q) / q


# ═══════════════════════════════════ REVERB & DELAY ══════════════════════════════════════════
def make_ir(length, rt_lo, rt_hi, predelay, key, damp=9000.0, build=0.010):
    """Synthetic stereo impulse response: decorrelated noise split into octave bands (a
    partition of unity in log-frequency), each band decaying with its own RT60 (log-interpolated
    rt_lo @ 250 Hz → rt_hi @ 8 kHz, so the tail darkens as it dies), a diffusion build-up,
    a handful of low-passed early reflections and a pre-delay. Normalised to unit energy."""
    n = nsamp(length)
    t = taxis(n)
    g = rng('ir', key)
    F = np.fft.rfft(g.standard_normal((2, n)), axis=-1)
    fr = np.fft.rfftfreq(n, 1.0 / SR)
    F *= 1.0 / np.sqrt(1.0 + (fr / damp) ** 4)
    lf = np.log2(np.maximum(fr, 1.0))
    cen = np.log2([63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000])
    lo, hi = np.log2(250.0), np.log2(8000.0)
    ir = np.zeros((2, n))
    for i, c in enumerate(cen):
        d = lf - c
        w = np.cos(0.5 * np.pi * np.clip(d, -1.0, 1.0)) ** 2
        if i == 0:
            w[d < 0] = 1.0
        if i == len(cen) - 1:
            w[d > 0] = 1.0
        a = (c - lo) / (hi - lo)
        rt = rt_lo * (rt_hi / rt_lo) ** np.clip(a, -0.35, 1.25)
        ir += np.fft.irfft(F * w, n, axis=-1) * np.exp(-6.9078 * t / rt)
    ir *= 1.0 - np.exp(-t / build)
    er = np.zeros((2, n))
    for i, (dt, gl, gr) in enumerate([(0.0043, .9, .5), (0.0071, .45, .85), (0.0109, .6, .55),
                                      (0.0153, .35, .6), (0.0197, .5, .3), (0.0262, .3, .42)]):
        er[:, smp(dt)] = (gl, gr)
    er = filt(er, 'lp', 5200, 0.6)
    ir += er * (0.35 * np.sqrt(np.mean(ir[:, :smp(0.05)] ** 2)) / max(1e-9, np.sqrt(np.mean(er[:, :smp(0.05)] ** 2))))
    ir = np.concatenate([np.zeros((2, smp(predelay))), ir], axis=1)
    ir = fade(ir, 0, smp(0.05))
    return ir / np.sqrt(np.mean(np.sum(ir ** 2, axis=1)))


IR_ROOM = make_ir(1.1, 0.75, 0.38, 0.007, 'room', damp=8000)
IR_HALL = make_ir(4.2, 3.1, 1.5, 0.024, 'hall', damp=10000, build=0.018)


def convolve(x, ir):
    return np.stack([sps.oaconvolve(x[c], ir[c])[:x.shape[-1]] for c in range(2)])


def pingpong(x, delay, fb=0.42, taps=6, lp=4200.0, hp=320.0):
    """Ping-pong delay as an explicit echo train: each repeat alternates side and is darker."""
    D = smp(delay)
    s = butter(x.mean(axis=0), 'hp', hp, 2)
    out = np.zeros_like(x)
    for k in range(1, taps + 1):
        s = filt(s, 'lp', lp, 0.6) * (1.0 if k == 1 else fb)
        if k * D >= x.shape[-1]:
            break
        out[k % 2, k * D:] += s[:x.shape[-1] - k * D]
    return out


def reverse_swell(dur, key, f=2800.0, bright=1.0, ir=None):
    """A short noise burst through the hall, reversed: the tail swells INTO the next hit."""
    ir = IR_HALL if ir is None else ir
    n0 = nsamp(0.03)
    t = taxis(n0)
    burst = filt(noise(n0, 'rsw', key), 'bp', f, 0.7) * np.exp(-t / 0.008)
    burst += bright * 0.4 * filt(noise(n0, 'rsw2', key), 'hp', 6000) * np.exp(-t / 0.004)
    wet = np.stack([sps.oaconvolve(burst, ir[c])[:nsamp(dur)] for c in range(2)])
    wet = norm(wet[:, ::-1])
    u = np.linspace(0.0, 1.0, wet.shape[1])
    # a hall only decays ~9 dB in its first half-second, so shape it into a proper inhale:
    # +30 dB of swell and a low-pass that opens as it arrives
    wet = tvfilt(wet * undb(-30 * (1 - u) ** 1.6), 'lp', 700 * (16000 / 700) ** u, 0.8)
    return fade(norm(wet), smp(0.02), smp(0.0025))


def trim_tail(x, thr=1e-3, fout=0.004):
    """Drop a reverse swell's trailing silence (the reversed pre-delay, ≈25 ms), so add_end puts
    the swell's REAL end — not its padding — where it's placed."""
    live = np.flatnonzero(np.max(np.abs(x), axis=0) > thr * np.max(np.abs(x)))
    return fade(x[:, :live[-1] + 1], 0, smp(fout))


# ═════════════════════════════════════════ MIXER ════════════════════════════════════════════
# bus: (high-pass Hz or None, sidechain depth, sidechain hold s, sidechain release s, fader dB)
BUSES = {
    'kick':  (None, 0.00, 0.000, 0.00, -7.0),
    'boom':  (None, 0.00, 0.000, 0.00, -6.0),     # the sub layer OF a hit — never ducked by it
    'sub':   (None, 1.00, 0.030, 0.20, -4.0),
    'bass':  (28.0, 0.92, 0.012, 0.13, -2.5),
    'drums': (110.0, 0.00, 0.000, 0.00, 1.5),
    'hits':  (110.0, 0.00, 0.000, 0.00, 1.0),
    'music': (120.0, 0.35, 0.010, 0.12, 2.0),
    'pad':   (150.0, 0.62, 0.020, 0.26, 0.0),
    'fx':    (120.0, 0.25, 0.010, 0.15, 1.0),
    'air':   (150.0, 0.00, 0.000, 0.00, 0.0),     # the only thing allowed inside the tension gap
    'verb':  (180.0, 0.50, 0.020, 0.22, 0.0),
}
BED = ('sub', 'bass', 'drums', 'music', 'pad', 'fx', 'verb')      # what a "suck" pulls down


class Mix:
    def __init__(self):
        self.bus = {k: np.zeros((2, N)) for k in BUSES}
        self.send = {k: np.zeros((2, N)) for k in ('room', 'hall', 'dly')}
        self.auto = {k: np.ones(N) for k in BUSES}
        self.sc = []                  # sidechain triggers: (t, strength, release scale)
        self.events = 0
        self.bad_edges = []           # events whose first/last sample isn't silent (click risk)

    # ── placement ──
    def add(self, bus, sig, t, db=0.0, pan=0.0, room=0.0, hall=0.0, dly=0.0, at_sample=None):
        """Place `sig` (mono or stereo) so that its first sample lands on time t."""
        sig = np.asarray(sig, float)
        st = pan2(sig, pan) if sig.ndim == 1 else sig.copy()
        if sig.ndim == 2 and pan:
            st[0] *= min(1.0, 1.0 - pan)
            st[1] *= min(1.0, 1.0 + pan)
        pk = np.max(np.abs(st)) + 1e-12
        if max(np.max(np.abs(st[:, 0])), np.max(np.abs(st[:, -1]))) > 1e-3 * pk:
            self.bad_edges.append((bus, round(t, 4)))
        g = undb(db)
        a = smp(t) if at_sample is None else at_sample
        s0, s1 = max(0, a), min(N, a + st.shape[1])
        if s1 <= s0:
            return
        seg = st[:, s0 - a:s1 - a] * g
        self.bus[bus][:, s0:s1] += seg
        for k, v in (('room', room), ('hall', hall), ('dly', dly)):
            if v:
                self.send[k][:, s0:s1] += seg * v
        self.events += 1

    def add_end(self, bus, sig, t_end, db=0.0, **kw):
        """Place `sig` so that its LAST sample is the one just before t_end (leads into a hit)."""
        n = np.asarray(sig).shape[-1]
        self.add(bus, sig, t_end - n / SR, db, at_sample=smp(t_end) - n, **kw)

    def duck(self, t, s=1.0, rel=1.0):
        self.sc.append((t, s, rel))

    # ── automation ──
    def suck(self, t_hit, dur=0.04, floor=0.0, buses=BED, back=0.02):
        """Pre-hit 'inhale': the bed eases down to `floor` just before t_hit, then comes back."""
        h, a = smp(t_hit), smp(t_hit - dur)
        u = np.clip(np.arange(h - a) / ((h - a) * 0.9), 0, 1)
        down = floor + (1 - floor) * 0.5 * (1 + np.cos(np.pi * u))
        nb = smp(back)
        up = floor + (1 - floor) * (0.5 - 0.5 * np.cos(np.pi * np.arange(nb) / nb))
        for k in buses:
            self.auto[k][a:h] *= down
            self.auto[k][h:h + nb] *= up

    def gap(self, t0, t1, fall=0.012, keep=()):
        """Tension gap: EVERYTHING (but the `keep` buses) drops out over [t0, t1); the bed eases
        back after t1."""
        a, f, h = smp(t0), smp(t0 + fall), smp(t1)
        down = 0.5 + 0.5 * np.cos(np.pi * np.arange(f - a) / (f - a))
        nb = smp(0.008)
        up = 0.5 - 0.5 * np.cos(np.pi * np.arange(nb) / nb)
        for k in BUSES:
            if k in keep:
                continue
            self.auto[k][a:f] *= down
            self.auto[k][f:h] = 0.0
            if k in BED:
                self.auto[k][h:h + nb] *= up

    def sidechain(self, bus):
        depth, hold, rel = BUSES[bus][1:4]
        g = np.ones(N)
        if depth <= 0:
            return g
        for (t, s, rs) in self.sc:
            d = depth * s
            r = rel * rs
            pre = smp(0.002)                      # look-ahead: the duck is down before the kick
            h0 = smp(t)
            nh, nr = smp(hold), smp(r)
            u = np.arange(pre) / pre
            env = np.concatenate([
                1 - d * (0.5 - 0.5 * np.cos(np.pi * u)),
                np.full(nh, 1 - d),
                1 - d * (0.5 + 0.5 * np.cos(np.pi * np.arange(nr) / nr)) ** 1.3,
            ])
            a = h0 - pre
            s0, s1 = max(0, a), min(N, a + len(env))
            g[s0:s1] = np.minimum(g[s0:s1], env[s0 - a:s1 - a])
        return g

    # ── mixdown ──
    def render(self):
        rev = convolve(self.send['room'], IR_ROOM) * undb(-3)
        rev += convolve(self.send['hall'], IR_HALL) * undb(-4)
        rev = filt(rev, 'lp', 11000, 0.6)
        self.bus['verb'] += rev
        self.bus['fx'] += pingpong(self.send['dly'], 3 * S16)
        out = np.zeros((2, N))
        self.levels = {}
        for k, (hp, depth, _, _, fader) in BUSES.items():
            # HPF per bus, BEFORE the automation: kick/boom/sub just get a 22 Hz DC blocker. (A
            # master-bus HPF would ring on into the tension gap after everything is cut.)
            x = butter(self.bus[k], 'hp', hp, 4) if hp else butter(self.bus[k], 'hp', 22.0, 2)
            x = x * (self.auto[k] * self.sidechain(k) * undb(fader))
            kw = -0.691 + 10 * np.log10(np.mean(np.sum(kweight(x) ** 2, axis=0)) + 1e-20)
            self.levels[k] = (lin2db(np.max(np.abs(x))), kw)
            out += x
        return out


# ═════════════════════════════════════════ INSTRUMENTS ══════════════════════════════════════
# Each returns a mono (n,) or stereo (2, n) array starting AT its transient, peak ≈ 1.
KICKS = {
    #          dur   f_hi  f_lo(F1)   pitch τ chirp hold  decay drive click
    'groove': (0.36, 175., hz(29), 0.028, 520., 0.035, 0.12, 1.9, 0.32),
    'drop':   (1.25, 250., hz(29), 0.055, 760., 0.10, 0.42, 2.4, 0.42),     # kick + sub boom in one
    'final':  (2.00, 280., hz(29), 0.060, 820., 0.13, 0.62, 2.6, 0.46),
    'soft':   (0.36, 150., hz(29), 0.028, 280., 0.04, 0.13, 1.4, 0.16),
}


def kick(kind='groove'):
    dur, f0, f1, tp, ch, hold, dec, drive, clk = KICKS[kind]
    n = nsamp(dur)
    t = taxis(n)
    f = f1 + (f0 - f1) * np.exp(-t / tp) + ch * np.exp(-t / 0.0022)
    env = np.exp(-np.maximum(0.0, t - hold) / dec) * (1 - smoothstep(dur * 0.65, dur, t))
    body = np.tanh(drive * np.sin(TAU * phase(f)) * env) / np.tanh(drive)
    nz = noise(n, 'kick', kind)
    click = filt(filt(nz, 'bp', 3800, 0.8), 'hp', 1200) * np.exp(-t / 0.0014)
    knock = np.sin(TAU * 1150 * t) * np.exp(-t / 0.005)
    return fade(body + clk * (0.9 * click + 0.35 * knock), 6, 240)


def boom(f, dur=1.5, dec=0.55, rise=1.45, tp=0.07, drive=1.6, attack=0.004):
    """Sub boom: a pitched-down sine with slow saturation — felt more than heard."""
    n = nsamp(dur)
    t = taxis(n)
    fr = f * (1 + (rise - 1) * np.exp(-t / tp)) * (1 - 0.04 * t / dur)
    env = smoothstep(0, attack, t) * np.exp(-t / dec)
    return fade(np.tanh(drive * np.sin(TAU * phase(fr)) * env) / np.tanh(drive), 0, 960)


def crash(dur=1.8, dec=0.55, key=0, bright=1.0):
    """Cymbal: inharmonic square partials (per-side detune) + noise, bright part decays first."""
    n = nsamp(dur)
    t = taxis(n)
    g = rng('crash', key)
    base = g.uniform(330, 420)
    ratios = (1.0, 1.483, 1.932, 2.546, 2.630, 3.897, 4.21, 5.37)
    out = np.zeros((2, n))
    for ch in range(2):
        metal = sum(square(base * r * g.uniform(0.985, 1.015), n, ph0=g.uniform()) for r in ratios)
        metal /= np.sqrt(len(ratios))
        x = 0.6 * noise(n, 'crash', key, ch) + 0.55 * metal
        x = filt(filt(x, 'hp', 3200, 0.7), 'peak', 7200, 0.8, 3.0)
        hi = filt(x, 'hp', 9000, 0.7) * bright
        x = filt(x, 'lp', 13000, 0.7)
        out[ch] = (x * np.exp(-t / dec) * (0.7 + 0.8 * np.exp(-t / 0.035))
                   + 0.5 * hi * np.exp(-t / (dec * 0.45)))
    return fade(norm(out), 4, min(n // 3, 4800))


def clap(key=0, tail=0.11, tone=1.0):
    """Four noise bursts ~8 ms apart (the hands) and a band-passed tail — first burst ON the beat."""
    n = nsamp(0.45)
    t = taxis(n)
    g = rng('clap', key)
    env = np.zeros(n)
    offs = [0.0] + [0.0079 * i + g.uniform(-6e-4, 6e-4) for i in (1, 2, 3)]
    for i, o in enumerate(offs):
        tt = t - o
        m = tt >= 0
        env[m] += np.exp(-tt[m] / (0.0024 if i < 3 else tail)) * (1.0 if i < 3 else 0.9)
    nz = noise(n, 'clap', key)
    x = 0.85 * filt(nz, 'bp', 1150 * tone, 1.1) + 0.6 * filt(nz, 'bp', 2400 * tone, 1.4)
    x += 0.2 * filt(nz, 'hp', 5500)
    return fade(norm(filt(x, 'hp', 380) * env), 3, 480)


def snare(key=0, tone=195.0, dec=0.13, bright=1.0):
    n = nsamp(dec * 4)
    t = taxis(n)
    f = tone * (1 + 0.4 * np.exp(-t / 0.012))
    body = np.sin(TAU * phase(f)) * np.exp(-t / 0.055) + 0.45 * np.sin(TAU * phase(f * 1.63)) * np.exp(-t / 0.03)
    nz = noise(n, 'snare', key)
    rattle = filt(filt(nz, 'bp', 3800 * bright, 0.6), 'hp', 1400) * np.exp(-t / dec)
    crack = filt(nz, 'hp', 6000) * np.exp(-t / 0.0045)
    return fade(norm(0.55 * body + 1.1 * rattle + 0.45 * crack), 3, 480)


HAT_F = (205.3, 304.4, 369.6, 522.7, 540.0, 800.0)     # the 808's six square oscillators


def hat(dec, tone=1.0, key=0, hp=7000.0):
    n = nsamp(min(0.7, dec * 7 + 0.01))
    t = taxis(n)
    g = rng('hat', key)
    metal = sum(square(f * tone * g.uniform(0.995, 1.005), n, ph0=g.uniform()) for f in HAT_F) / 6
    metal = filt(filt(metal, 'bp', 9500, 0.9), 'hp', hp, 0.7)
    x = 0.9 * metal + 0.45 * filt(noise(n, 'hat', key), 'hp', 8500)
    env = np.exp(-t / dec) * (1 + 1.5 * np.exp(-t / 0.0015))
    return fade(norm(x * env), 4, min(n // 4, 480))


def ruler_tick(key=0, f=5600.0):
    """The IGNITION metronome: a tiny, narrow, filtered tick."""
    x = hat(0.006, 1.25, ('tick', key))
    return fade(norm(filt(filt(x, 'bp', f, 2.2), 'lp', 9000)), 2, 96)


def supersaw(notes, n, voices=5, detune=14.0, spread=0.85, key=(), bend=None):
    """Detuned PolyBLEP saw stack, voices fanned across the stereo field."""
    out = np.zeros((2, n))
    g = rng('ss', key)
    for i, m in enumerate(notes):
        f = hz(m)
        for v in range(voices):
            x = (2.0 * v / (voices - 1) - 1.0) if voices > 1 else 0.0
            fv = f * 2 ** ((x * detune + g.uniform(-2, 2)) / 1200)
            w = saw(fv * bend if bend is not None else fv, n, ph0=g.uniform())
            out += pan2(w, spread * x * (1 if (i + v) % 2 == 0 else -1))
    return out / np.sqrt(len(notes) * voices)


def stab(notes, dur=0.40, key=0, bright=1.0, voices=5, detune=16.0, scoop=35.0, sustain=0.34,
         rel=0.18, q=1.0, tick=0.22):
    """Synth-brass chord stab: supersaw with a brass 'scoop' (starts flat, snaps to pitch), a
    filter that opens hard on the transient then falls, and a noise tick for definition."""
    n = nsamp(dur)
    t = taxis(n)
    bend = 2 ** (-(scoop / 1200) * np.exp(-t / 0.018))
    x = supersaw(notes, n, voices, detune, 0.9, ('stab', key), bend)
    fc = 380 + bright * (6200 * np.exp(-t / 0.07) + 1400 * np.exp(-t / 0.35))
    x = tvfilt(x, 'lp', fc, q)
    env = (smoothstep(0, 0.0012, t) * (sustain + (1 - sustain) * np.exp(-t / 0.06))
           * np.exp(-np.maximum(0.0, t - (dur - rel)) / (rel * 0.35)))
    tk = pan2(filt(noise(n, 'stabtick', key), 'hp', 3000) * np.exp(-t / 0.003), 0) * tick
    return fade(norm(x * env + tk), 3, 480)


def pad(notes, dur, key, cutoff, voices=7, detune=22.0, q=0.7, attack=0.4, release=0.3):
    n = nsamp(dur)
    t = taxis(n)
    x = supersaw(notes, n, voices, detune, 1.0, ('pad', key))
    x = tvfilt(x, 'lp', cutoff if np.ndim(cutoff) == 0 else cutoff[:n], q)
    env = smoothstep(0, attack, t) * (1 - smoothstep(dur - release, dur, t))
    return fade(x * env, 0, 480)


def pluck(f, dur=0.45, decay=0.24, key=0, det=0.8, hf=0.55):
    """Additive pluck: harmonic k decays (1 + hf·(k−1))× faster — a string / filtered-saw pluck
    that is alias-free by construction. Two voices ±det cents, spread L/R, the right one shifted
    a quarter period so the twins never start phase-locked (no beating notch in mono)."""
    n = nsamp(dur)
    t = taxis(n)
    out = np.zeros((2, n))
    for side in (-1, 1):
        fv = f * 2 ** (side * det / 1200)
        off = 0.0 if side < 0 else np.pi / 2
        h = hf * (1.0 + 0.2 * side)                                    # the twins differ in timbre
        K = max(1, min(40, int(11000 / fv)))
        x = np.zeros(n)
        for k in range(1, K + 1):
            x += (k ** -1.0) * np.sin(TAU * k * fv * t + k * off) * np.exp(-t * (1 + h * (k - 1)) / decay)
        out += pan2(x, 0.45 * side)
    out += pan2(filt(noise(n, 'pick', key), 'bp', 4200, 0.8) * np.exp(-t / 0.0012) * 0.25, 0)
    return fade(norm(out * smoothstep(0, 0.0006, t)), 2, 480)


def bell(f, dur=1.8, key=0, bright=1.0, width=0.5):
    """FM bell (DX-style 1:3.5) with two inharmonic partials. Width comes from mixing the
    partials differently per side — never from a detuned twin, which would beat and cancel
    in mono (a cheap tremolo)."""
    n = nsamp(dur)
    t = taxis(n)
    I = bright * (2.6 * np.exp(-t / 0.18) + 0.35)
    core = np.sin(TAU * f * t + I * np.sin(TAU * 3.5 * f * t)) * np.exp(-t / 0.75)
    p2 = 0.32 * np.sin(TAU * 2.756 * f * t) * np.exp(-t / 0.42)
    p3 = 0.16 * np.sin(TAU * 5.404 * f * t) * np.exp(-t / 0.14)
    out = np.stack([core + p2 * (1 + width) + p3 * (1 - width), core + p2 * (1 - width) + p3 * (1 + width)])
    return fade(norm(out * smoothstep(0, 0.0007, t)), 2, 2400)


def bloop(f, dur=0.34, key=0, bright=1.0):
    """Rubbery bounce: the pitch springs up from 0.62·f with an underdamped overshoot, plus the
    same 6 Hz trampoline wobble s1 uses for its floor (cos(2π·6q)·e^(−7.5q)). 1:1 FM, soft puff."""
    n = nsamp(dur)
    t = taxis(n)
    w0, z = TAU * 16, 0.32
    wd = w0 * np.sqrt(1 - z * z)
    spring = 1 - np.exp(-z * w0 * t) * (np.cos(wd * t) + z / np.sqrt(1 - z * z) * np.sin(wd * t))
    ratio = (0.62 + 0.38 * spring) * (1 + 0.018 * np.cos(TAU * 6 * t) * np.exp(-7.5 * t))
    ph = TAU * phase(f * ratio)
    idx = bright * 1.6 * np.exp(-t / 0.028) + 0.25
    body = np.sin(ph + idx * np.sin(ph)) * smoothstep(0, 0.0015, t) * np.exp(-t / 0.10)
    puff = filt(noise(n, 'bloop', key), 'lp', 1800, 0.7) * np.exp(-t / 0.006) * 0.25
    return fade(norm(body + puff), 4, 480)


def pop(f0, f1, dur=0.16, tdrop=0.007, dec=0.04, key=0, click=0.25, wob=0.0, fm=0.0):
    """Bubble 'pop': a sine that falls from f0 to f1 in a few ms; optional spring wobble / FM."""
    n = nsamp(dur)
    t = taxis(n)
    fr = f1 + (f0 - f1) * np.exp(-t / tdrop)
    if wob:
        fr = fr * (1 + wob * np.sin(TAU * 17 * t) * np.exp(-t / 0.06))
    ph = TAU * phase(fr)
    x = np.sin(ph + fm * np.exp(-t / 0.02) * np.sin(2 * ph))
    x = x * smoothstep(0, 0.0008, t) * np.exp(-t / dec)
    x += filt(noise(n, 'pop', key), 'hp', 2500) * np.exp(-t / 0.0009) * click
    return fade(norm(x), 3, 240)


def whoosh(dur, f0, f1, q=1.2, shape=2.4, pan=(-0.5, 0.5), key=0, body=0.35, flutter=0.0):
    """Swell of swept band-passed noise that ends exactly where it's placed (add_end)."""
    n = nsamp(dur)
    t = taxis(n)
    u = t / dur
    fc = f0 * (f1 / f0) ** (u ** 1.4)
    x = tvfilt(noise(n, 'wh', key), 'bp', fc, q)
    x = x + body * tvfilt(noise(n, 'wh2', key), 'lp', fc * 0.5, 0.7)
    env = u ** shape
    if flutter:
        env = env * (1 - flutter * 0.5 * (1 + np.sin(TAU * phase(9 + 26 * u))))
    x = fade(norm(x * env), 8, smp(0.0015))
    return pan2(x, pan[0] + (pan[1] - pan[0]) * u)


def riser(dur, notes, semis=12, f0=260.0, f1=9000.0, key=0, trem=(5.0, 30.0), tone=0.55):
    """Noise sweep + gliding supersaw + accelerating tremolo, growing all the way in."""
    n = nsamp(dur)
    t = taxis(n)
    u = t / dur
    fc = f0 * (f1 / f0) ** (u ** 1.6)
    nz = np.stack([tvfilt(noise(n, 'ris', key, c), 'bp', fc, 1.0)
                   + 0.3 * tvfilt(noise(n, 'ris2', key, c), 'hp', fc, 0.7) for c in range(2)])
    bend = 2 ** (semis * u ** 2 / 12)
    ts = supersaw(notes, n, 5, 18, 0.9, ('riser', key), bend)
    ts = tvfilt(ts, 'lp', 500 + 7000 * u ** 2, 0.8)
    tr = 1 - 0.45 * u * (0.5 + 0.5 * np.sin(TAU * phase(trem[0] + (trem[1] - trem[0]) * u ** 2)))
    x = (norm(nz) + tone * norm(ts)) * (u ** 2.2) * tr
    return fade(norm(x), smp(0.01), smp(0.003))


def whoom(f_end, f_start=160.0, dur=0.7, tp=0.09, dec=0.3, drive=1.5, key=0):
    """Morph 'whoom': a sub drop (sine glides f_start → f_end) with a soft thump on the front."""
    n = nsamp(dur)
    t = taxis(n)
    fr = f_end + (f_start - f_end) * np.exp(-t / tp)
    x = np.tanh(drive * np.sin(TAU * phase(fr)) * smoothstep(0, 0.003, t) * np.exp(-t / dec)) / np.tanh(drive)
    x += 0.25 * filt(noise(n, 'whoom', key), 'lp', 900, 0.7) * np.exp(-t / 0.012)
    return fade(norm(x), 3, 960)


def grain(f, dur):
    """Hann-windowed sine grain with a whisper of 2nd harmonic — glitter."""
    n = nsamp(dur)
    t = taxis(n)
    w = np.sin(np.pi * t / dur) ** 2
    return fade((np.sin(TAU * f * t) + 0.25 * np.sin(TAU * 2.01 * f * t) * w) * w, 2, 16)


def sparkle(key, pings=3):
    """Field-dot glint: a few tiny high sine pings (hard attack, ~35 ms decay — the dots' own
    e^(−24·t) flare), the first ON the event, the rest scattered over 8 ms and across the field."""
    n = nsamp(0.14)
    g = rng('sparkle', key)
    penta = [nm(s) for s in ('F7', 'Ab7', 'Bb7', 'C8', 'Eb8')]
    out = np.zeros((2, n))
    for i in range(pings):
        a = smp(g.uniform(0.002, 0.008)) if i else 0
        tt = taxis(n - a)
        f = hz(penta[g.integers(len(penta))]) * g.uniform(0.998, 1.002)
        x = np.sin(TAU * f * tt) * smoothstep(0, 0.0006, tt) * np.exp(-tt / g.uniform(0.025, 0.045))
        out[:, a:] += pan2(x, g.uniform(-0.8, 0.8)) * (1.0 if i == 0 else g.uniform(0.45, 0.8))
    return fade(norm(out), 2, 480)


def bubble(f, dur=0.11, key=0):
    """Bubbly FM blip: pitch rises into the note (a bubble resonance), 1:2 FM that closes fast."""
    n = nsamp(dur)
    t = taxis(n)
    ph = TAU * phase(f * (0.55 + 0.45 * (1 - np.exp(-t / 0.012))))
    x = np.sin(ph + 1.8 * np.exp(-t / 0.02) * np.sin(2 * ph))
    return fade(norm(x * smoothstep(0, 0.001, t) * np.exp(-t / 0.03)), 2, 240)


def plip():
    """Water drop: a sine that falls fast (2.7 kHz → 620 Hz), then a small bubble rise."""
    n = nsamp(0.35)
    t = taxis(n)
    fr = 620 + 2100 * np.exp(-t / 0.0075) + 380 * (1 - np.exp(-np.maximum(0, t - 0.02) / 0.03))
    x = np.sin(TAU * phase(fr)) * smoothstep(0, 0.0005, t) * np.exp(-t / 0.07)
    x += filt(noise(n, 'plip'), 'hp', 3000) * np.exp(-t / 0.0008) * 0.3
    return fade(norm(x), 3, 480)


def splash(dur=0.9, key=0):
    """Spray: a band-passed wash plus ~70 droplets (micro pops + noise specks), thinning out."""
    n = nsamp(dur)
    t = taxis(n)
    g = rng('splash', key)
    out = np.zeros((2, n))
    for c in range(2):
        wash = filt(noise(n, 'wash', key, c), 'bp', 2600, 0.6)
        out[c] = wash * smoothstep(0, 0.01, t) * np.exp(-t / 0.12)
    for i in range(70):
        tt = g.exponential(0.16)
        if tt > dur - 0.05:
            continue
        a = smp(tt)
        d = pop(g.uniform(2500, 5200), g.uniform(900, 1800), 0.04, 0.003, 0.008, ('drop', key, i), 0.6)
        seg = pan2(d, g.uniform(-0.9, 0.9)) * g.uniform(0.15, 0.5) * np.exp(-tt / 0.3)
        out[:, a:a + seg.shape[1]] += seg[:, :n - a]
    return fade(norm(out), 4, 960)


def keyclick(key, kind='key'):
    """Tiny mechanical key: contact click + resonant 'tock' + bottom-out 'thock'."""
    n = nsamp(0.05)
    t = taxis(n)
    g = rng('key', key)
    nz = noise(n, 'key', key)
    fc = g.uniform(3200, 4600)
    click = filt(nz, 'bp', fc, 1.5) * np.exp(-t / 0.0009)
    ft = g.uniform(1800, 2600) if kind != 'space' else g.uniform(850, 1000)
    tock = np.sin(TAU * ft * t) * np.exp(-t / 0.004) * (0.35 if kind != 'del' else 0.5)
    d = g.uniform(0.006, 0.010)
    tt = np.maximum(0, t - d)
    thock = filt(nz[::-1], 'bp', 700 if kind != 'space' else 420, 1.0) * np.exp(-tt / 0.006) * (t >= d)
    thock *= 0.45 if kind == 'key' else (0.9 if kind == 'space' else 0.0)
    return fade(norm(click + tock + thock), 3, 240)


def crack(key=0):
    """The bone flood splitting: a sharp broadband snap + splinters + a low 'thwack'."""
    n = nsamp(0.25)
    t = taxis(n)
    g = rng('crack', key)
    nz = noise(n, 'crack', key)
    x = filt(nz, 'hp', 1500) * np.exp(-t / 0.010)
    for i in range(7):
        a = smp(g.uniform(0.004, 0.05))
        m = np.zeros(n)
        m[a:] = np.exp(-taxis(n - a) / 0.0012)
        x += filt(nz, 'bp', g.uniform(2000, 7000), 2.0) * m * g.uniform(0.3, 0.8)
    x += 0.6 * np.sin(TAU * phase(180 * (1 + 0.5 * np.exp(-t / 0.01)))) * np.exp(-t / 0.03)
    return fade(norm(x), 2, 480)


def reverse_cymbal(dur, key=0):
    c = crash(dur + 0.3, dec=dur * 0.45, key=('rev', key))[:, :nsamp(dur)]
    return fade(norm(c[:, ::-1]), smp(0.01), smp(0.003))


# ═════════════════════════════════════════ ARRANGEMENT ══════════════════════════════════════
class Kit:
    """Pre-rendered drum variants (round-robin, so repeats aren't machine-gun identical)."""

    def __init__(self):
        self.ch = [hat(0.020 + 0.004 * i, 1.0 + 0.025 * i, ('ch', i)) for i in range(4)]
        self.oh = [hat(0.10 + 0.025 * i, 0.98, ('oh', i), hp=6500) for i in range(2)]
        self.clap = [clap(i) for i in range(3)]
        self.tick = [ruler_tick(i, 5200 + 300 * i) for i in range(4)]
        self.kick = {k: kick(k) for k in KICKS}


def four_floor(mix, kit, beats, kind='groove', db=0.0):
    for n in beats:
        mix.add('kick', kit.kick[kind], b(n), db)
        mix.duck(b(n))


def claps(mix, kit, beats, db=-7.0, room=0.35, hall=0.0):
    for i, n in enumerate(beats):
        mix.add('drums', kit.clap[i % 3], b(n), db, pan=0.0, room=room, hall=hall)


def hats(mix, kit, t0, t1, open_db=-13.5, closed_db=-21.5, ghost_db=-28.0, lp=None, key=0):
    """House hats: open on the off-beat 8th, closed on the 'e' and 'a' 16ths, ghost on the one."""
    k = 0
    for i in range(int(round((t1 - t0) / S16))):
        t = t0 + i * S16
        slot = int(round(t / S16)) % 4
        if slot == 2:
            x, d, p = kit.oh[k % 2], open_db, 0.18
        elif slot == 0:
            x, d, p = kit.ch[k % 4], ghost_db, 0.0
        else:
            x, d, p = kit.ch[(k + slot) % 4], closed_db - (1.5 if slot == 3 else 0), -0.28 if slot == 1 else 0.3
        if lp:
            x = filt(x, 'lp', lp, 0.7)
        mix.add('drums', x, t, d + rng('hatv', key, i).uniform(-1.2, 0.6), pan=p, room=0.06)
        k += 1


def bass_line(mix, events, t0, t1, key, cut0=240.0, env_amt=1500.0, env_tau=0.045, q=1.1,
              drive=1.7, db=-8.0, hp=None, cut_mul=None):
    """One continuous mono bass (phase-continuous across notes): saw + detuned saw + pulse →
    time-varying LP with a per-note envelope → saturation → per-note VCA gate.
    events: (t_on, dur, midi, velocity)."""
    a0 = smp(t0)
    n = smp(t1) - a0
    f = np.full(n, hz(events[0][2]))
    gate = np.zeros(n)
    cut = np.full(n, float(cut0))
    for (ton, d, m, v) in events:
        a = smp(ton) - a0
        e = min(n, a + nsamp(d))
        f[a:] = hz(m)
        tt = taxis(e - a)
        gate[a:e] = np.maximum(gate[a:e], v * smoothstep(0, 0.0015, tt) * (1 - smoothstep(d - 0.012, d, tt)))
        cut[a:e] += env_amt * v * np.exp(-tt / env_tau)
    f = np.convolve(f, np.ones(96) / 96, mode='same')                 # 2 ms glide
    f[:48], f[-48:] = f[48], f[-49]
    osc = 0.6 * saw(f) + 0.35 * saw(f * 1.0035, ph0=0.31) + 0.35 * square(f, ph0=0.13, pw=0.42)
    if cut_mul is not None:
        cut = cut * cut_mul(t0 + taxis(n))
    x = np.tanh(drive * tvfilt(osc, 'lp', np.clip(cut, 60, 9000), q)) / np.tanh(drive)
    if hp is not None:
        x = tvfilt(x, 'hp', hp[:n] if np.ndim(hp) else hp, 0.7)
    mix.add('bass', fade(x * gate, 4, 96), t0, db)


def sub_line(mix, segs, t0, t1, db=-7.0, fin=0.005, fout=0.02, amp=None):
    """Clean mono sine sub following chord roots; the kick-keyed sidechain gives it its pump."""
    a0 = smp(t0)
    n = smp(t1) - a0
    f = np.zeros(n)
    for (ts, m) in segs:
        f[smp(ts) - a0:] = hz(m)
    f = np.convolve(f, np.ones(192) / 192, mode='same')
    f[:96], f[-96:] = f[96], f[-97]
    x = sine(f)
    if amp is not None:
        x = x * amp[:n]
    mix.add('sub', fade(x, smp(fin), smp(fout)), t0, db)


def sub_note(m):
    """Keep the sub between F1 and E2 (43–82 Hz)."""
    while m > 40:
        m -= 12
    while m < 29:
        m += 12
    return m


def rolling(beats_roots, pattern=(None, 0, 12, 0), vel=(0, 1.0, 0.8, 0.9), len16=0.8):
    """Rolling 16th bassline: the kick owns the downbeat 16th, the bass fills the other three."""
    ev = []
    for n, root in beats_roots:
        for s, iv in enumerate(pattern):
            if iv is None:
                continue
            ev.append((b(n) + s * S16, S16 * len16, root + iv, vel[s]))
    return ev


# ───────────────────────────────────── 0.000 – 1.875  IGNITION ──────────────────────────────
def ignition(mix, kit):
    T_DROP = b(4)
    # Tension bed: low F/C drone, filter creeping open, fading up from nothing.
    n = smp(T_DROP)
    t = taxis(n)
    f = hz(nm('F2'))
    x = (0.5 * saw(f * 2 ** (-5 / 1200), n) + 0.5 * saw(f * 2 ** (5 / 1200), n, 0.37)
         + 0.3 * saw(hz(nm('C3')), n, 0.61))
    x = tvfilt(x, 'lp', 170 * (1 + 3.2 * smoothstep(0.2, 1.85, t) ** 2), 0.9)
    mix.add('bass', fade(x * smoothstep(0.0, 1.1, t), 0, 480), 0.0, -27)

    # The floor's seed dot pops (s1 SEED_T .008 → first seen on f1): a tiny pip on the F pedal.
    mix.add('music', pop(2300, hz(nm('F6')), 0.1, 0.004, 0.022, 'seed', 0.12), on_frame(S1_SEED_T), -31,
            room=0.2, hall=0.08)

    # The ruler unrolls: ticks pop out from the centre (s1 TICKS[].tPop), pairs spreading L/R.
    for ak in range(17):
        tp = on_frame(0.075 + 0.23 * (ak / 16) ** 0.92)
        tk = ruler_tick(('ruler', ak), 4200 + 110 * ak)
        if ak == 0:
            mix.add('drums', tk, tp, -27)
        else:
            w = 0.85 * ak / 16
            mix.add('drums', tk, tp, -33, pan=-w)
            mix.add('drums', ruler_tick(('ruler', -ak), 4250 + 110 * ak), tp, -33, pan=w)

    # Metronome: quiet filtered 16th ticks, accented on the beat, growing into the drop.
    for i in range(int(round(T_DROP / S16))):
        tt = i * S16
        acc = i % 4 == 0
        d = (-28 if acc else -35) + 6 * smoothstep(0, T_DROP, tt)
        mix.add('drums', kit.tick[i % 4], tt, d, pan=0.12 if i % 2 else -0.12, room=0.1)

    # Free fall: the dot drops in from above the frame (s1 T_APEX ≈ .108 → contact 1).
    wf = whoosh(0.35, 250, 1400, q=0.8, shape=2.0, pan=(0.0, -0.1), key='fall', body=0.6)
    mix.add_end('fx', wf, b(1) - 0.012, -30)

    # Three bounces: rubber bloops rising F4 → Ab4 → C5 (the tonic triad) + a soft floor thud.
    for i, (n_, m) in enumerate(zip((1, 2, 3), ('F4', 'Ab4', 'C5'))):
        mix.add('music', bloop(hz(nm(m)), key=i), b(n_), -12 - 0.5 * i, pan=-0.12 + 0.06 * i, room=0.18, hall=0.06)
        th = fade(np.sin(TAU * phase(95 * (1 + 0.6 * np.exp(-taxis(nsamp(0.08)) / 0.01)))) *
                  np.exp(-taxis(nsamp(0.08)) / 0.02), 2, 96)
        mix.add('kick', th, b(n_), -18 - 3 * i)

    # Typing: the seed line types on (s1 TYPE_AT, human rhythm), then backspaces in a zip.
    LINE, TYPE_AT, DEL_AT = s1_typing()
    for i, (ch, ta) in enumerate(zip(LINE, TYPE_AT)):
        kind = 'space' if ch == ' ' else 'key'
        tq = on_frame(ta)
        if any(abs(tq - b(n_)) < 1.0 / FPS for n_ in (1, 2, 3)):
            continue                      # a key shown within a frame of a bounce would flam it — the bloop covers it
        mix.add('drums', keyclick(('type', i), kind), tq, -23 if kind == 'key' else -21,
                pan=-0.35 + 0.7 * i / len(LINE), room=0.12)
    for j, td in enumerate(DEL_AT):
        x = keyclick(('del', j), 'del' if j else 'key')
        x = filt(x, 'lp', 7000 - 110 * j, 0.7)
        # the single tap lands on the frame that shows it; the auto-repeat (5.6 ms apart, faster
        # than the frame rate) stays a continuous ratchet
        mix.add('drums', fade(x, 2, 96), on_frame(td) if j == 0 else td, -24 if j == 0 else -30 - 0.1 * j,
                pan=0.35 - 0.7 * j / len(LINE))

    # Tape-measure retract (s1 RETRACT0 → RETRACT1): both halves of the ruler whip into the centre
    # on a backIn(0.9) — a hair of anticipation, then accelerating. Since the polish its fast part
    # comes AFTER the backspace ratchet, so it gets its own swish: two sides closing on the centre,
    # level following the curve's speed, a ratchet flutter for the ticks rushing past.
    d = S1_RETRACT1 - S1_RETRACT0
    u = np.linspace(0.0, 1.0, nsamp(d))
    sp = np.maximum(0.0, 3 * 1.9 * u * u - 2 * 0.9 * u)
    sp /= sp.max()
    for side in (-1, 1):
        w = whoosh(d, 700, 5200, 1.1, 0.0, (0.9 * side, 0.0), ('retract', side), 0.25, flutter=0.35)
        mix.add_end('fx', fade(w * sp ** 0.9, 8, smp(0.006)), S1_RETRACT1, -25)
    # ... and the floor's last point flashes and zips up into the dot (ZIP0, 36 ms quadIn). The flash
    # is lit from ZIP0 − 5 ms, so f108 (1.800) is the first frame that shows it.
    n = nsamp(0.036 + 0.012)
    t = taxis(n)
    q = np.clip(t / 0.036, 0.0, 1.0)
    zp = np.sin(TAU * phase(1100 * (4600 / 1100) ** (q * q))) * smoothstep(0, 0.0015, t)
    zp *= (0.55 + 0.45 * q) * (1 - smoothstep(0.036, 0.048, t))
    zp += filt(noise(n, 'zipflash'), 'hp', 4000) * np.exp(-t / 0.0012) * 0.3     # the flash
    mix.add('fx', fade(norm(zp), 3, 96), on_frame(S1_ZIP0 - 0.005), -27, room=0.1)

    # The inhale: riser (noise sweep + rising F-C-F) + reverse cymbal, from contact 3 into the drop.
    r = riser(T_DROP - b(3), chord('F3', 'C4', 'F4'), 12, 300, 9500, 'intro', (6, 32))
    mix.add_end('fx', r, T_DROP, -3, hall=0.12)
    mix.add_end('fx', reverse_cymbal(0.62, 'intro'), T_DROP, -7)
    mix.suck(T_DROP, 0.04)


# scenes/s1.js constants mirrored here
S1_SEED_T = 0.008                            # the floor's seed dot pops
S1_TYPE_T0, S1_TYPE_T1 = 0.5, 1.12           # typing span
S1_DEL_T0, S1_DEL_REPEAT, S1_DEL_T1 = 1.56, 1.58, 1.73   # backspace: tap, then auto-repeat
S1_RETRACT0, S1_RETRACT1 = 1.613, 1.808      # ruler retract
S1_ZIP0 = 1.803                              # the floor's last point flashes and zips up


def s1_typing():
    """Re-derive s1's typing + backspace schedule (scenes/s1.js, TYPE_AT / DEL_AT)."""
    LINE = 'EVERYTHING STARTS WITH A DOT.'
    rnd = mulberry32(0x5EED1)
    gaps = []
    for i in range(1, len(LINE)):
        g = 0.65 + 0.7 * rnd()
        if LINE[i - 1] == ' ':
            g += 0.55
        if LINE[i] == '.':
            g += 0.8
        gaps.append(g)
    s = sum(gaps)
    at = [S1_TYPE_T0]
    for g in gaps:
        at.append(at[-1] + g / s * (S1_TYPE_T1 - S1_TYPE_T0))
    dl = [S1_DEL_T0 if j == 0 else S1_DEL_REPEAT + (j - 1) / (len(LINE) - 2) * (S1_DEL_T1 - S1_DEL_REPEAT)
          for j in range(len(LINE))]
    return LINE, at, dl


# ─────────────────────────────────── 1.875 – 4.6875  DROP / KINETIC TYPE ─────────────────────
FM9 = chord('F3', 'Ab3', 'C4', 'Eb4', 'G4', 'C5')
SLAMS = [  # beat, chord (bass root first), whoosh (dur, f0, f1, q, shape, pan, body, flutter), dB
    (5, chord('F3', 'F4', 'Ab4', 'C5'), (0.12, 2600, 9500, 2.0, 3.0, (-0.7, 0.3), 0.15, 0.0), -7.0),    # is  (blade)
    (6, chord('Db3', 'F4', 'Ab4', 'C5'), (0.12, 600, 5000, 1.2, 2.4, (0.6, -0.2), 0.35, 0.0), -7.0),    # RHYTHM
    (7, chord('Eb3', 'G4', 'Bb4', 'Eb5'), (0.12, 400, 6000, 1.1, 2.6, (-0.8, 0.8), 0.35, 0.0), -7.0),   # TIMING (wipe 3.161→b7, cubicIn)
    (8, chord('Ab3', 'C5', 'Eb5', 'G5'), (0.14, 200, 2600, 0.8, 2.2, (0.0, 0.0), 0.8, 0.0), -6.0),      # &  (iris)
    (9, chord('Bb3', 'Ab4', 'C5', 'Db5', 'F5'), (0.12, 500, 4200, 1.2, 2.4, (0.5, -0.5), 0.35, 0.6), -7.0),  # FLOW (wave)
]


def impact(mix, kit, t, root, big=1.0, key=0, chord_notes=None, crash_db=-9.0, boom_dur=1.5, kick='drop'):
    """Layered hit: kick + sub boom + crash (+ optional chord stab); ducks the bed.
    On F-rooted hits the long, saturated 'drop'/'final' kick IS the boom (a second F1 sine on top
    would only phase-beat against it). Off-root hits pair the short groove kick with a boom tuned
    to the chord, whose soft 20 ms attack lets the kick's transient lead."""
    mix.add('kick', kit.kick[kick], t, 2.0 + 3.0 * (big - 1))
    if kick == 'groove':
        mix.add('boom', boom(hz(sub_note(root)), boom_dur, 0.5 * big + 0.1, attack=0.02), t, -4.0)
    mix.add('hits', crash(1.4 + 0.6 * big, 0.45 + 0.25 * big, key), t, crash_db, room=0.1, hall=0.25)
    thump = filt(noise(nsamp(0.12), 'thump', key), 'lp', 700, 0.8) * np.exp(-taxis(nsamp(0.12)) / 0.018)
    mix.add('hits', fade(norm(thump), 3, 240), t, -10, room=0.3)
    if chord_notes:
        mix.add('hits', stab(chord_notes, 0.55 + 0.4 * big, ('imp', key), 1.25, 7, 18, 30, 0.5, 0.3),
                t, -6.0 + 2.5 * (big - 1), room=0.2, hall=0.3)
    mix.duck(t, 1.0, 1.4 + big)


def kinetic(mix, kit):
    T0 = b(4)
    impact(mix, kit, T0, nm('F1'), 1.1, 'drop', FM9)
    # The dot hollows into a shockwave: a falling noise sweep right after the hit.
    sw = whoosh(0.35, 5000, 400, q=0.9, shape=0.35, pan=(0.0, 0.0), key='shock', body=0.5)
    mix.add('fx', fade(sw * np.exp(-taxis(sw.shape[1]) / 0.12), 4, 480), T0 + 0.004, -16, hall=0.2)

    four_floor(mix, kit, range(5, 10))
    claps(mix, kit, (5, 7, 9))
    hats(mix, kit, T0, b(10), key='k')

    roots = {4: nm('F2'), 5: nm('F2'), 6: nm('Db2'), 7: nm('Eb2'), 8: nm('Ab2'), 9: nm('Bb2')}
    ev = rolling([(n, roots[n]) for n in range(4, 10)])
    ev_shape = rolling([(n, r) for n, r in zip(range(10, 16), [nm(s) for s in ('F2', 'F2', 'Db2', 'Db2', 'Eb2', 'Eb2')])],
                       vel=(0, 0.9, 0.7, 0.8))
    # (the filter closes over the last beat of SHAPE as the field is sucked home)
    bass_line(mix, ev + ev_shape, T0, b(16) - 0.03, 'rolling', env_amt=1500,
              cut_mul=lambda tt: 1 - 0.7 * smoothstep(b(15) + 0.05, b(16) - 0.03, tt))
    segs = [(b(n), sub_note(r)) for n, r in roots.items()]
    segs += [(b(n), sub_note(nm(s))) for n, s in zip(range(10, 16), ('F2', 'F2', 'Db2', 'Db2', 'Eb2', 'Eb2'))]
    sub_line(mix, segs, T0, b(16) - 0.02, -8)

    # Word slams: chord stab on the beat, each led in by its own whoosh.
    for n, notes, (wd, f0, f1, q, sh, pn, body, fl), d in SLAMS:
        mix.add_end('fx', whoosh(wd, f0, f1, q, sh, pn, ('slam', n), body, fl), b(n), -16)
        mix.suck(b(n), 0.012, 0.25, buses=('fx',), back=0.004)     # the whoosh tucks under the slam
        mix.add('hits', stab(notes, 0.36, ('slam', n), 1.0 + 0.1 * (n - 5), tick=0.4), b(n), d, room=0.25, hall=0.12)

    # TIMING: letters land on consecutive 32nd-note triplets (s2 LAND_STEP = BEAT/12) → tuned
    # ticks walking up the Eb pentatonic, L → R.
    for i, m in enumerate(('Eb5', 'F5', 'G5', 'Bb5', 'C6', 'Eb6')):
        tk = pluck(hz(nm(m)), 0.16, 0.05, ('tim', i), hf=1.2)
        mix.add('music', tk, b(7) + i * BEAT / 12, -16 + 0.6 * i, pan=-0.6 + 0.24 * i, room=0.2, dly=0.12)
    # "is": the tittle drops in on the off-beat 8th.
    mix.add('music', pop(2600, hz(nm('C6')), 0.14, 0.004, 0.03, 'tittle', 0.3), b(5) + S8, -19, pan=0.1, room=0.2)
    # "&": the fill snaps on the off-beat 8th.
    mix.add('drums', pop(4200, 1800, 0.06, 0.002, 0.008, 'amp', 0.8), b(8) + S8, -18, room=0.25)

    # PORTAL approach: the camera dives through the counter of the O (s2 ZOOM0 → end).
    t_zoom = T0 + b(5) + 0.14
    d = b(10) - t_zoom
    mix.add_end('fx', whoosh(d, 280, 7500, 1.0, 3.2, (0.0, 0.0), 'portal', 0.7), b(10), -9, hall=0.1)
    nz = nsamp(d)
    tz = taxis(nz)
    rise = np.sin(TAU * phase(180 * (1400 / 180) ** ((tz / d) ** 2))) * (tz / d) ** 3
    mix.add_end('fx', fade(rise, 8, smp(0.002)), b(10), -21)
    # a breath of air before the pass-through. It opens 6 ms before the counter swallows the frame
    # (s2 COVER 4.6795) — deliberately not later: a shorter breath leaves more whoosh in front of
    # b10, the reel's lowest-contrast onset.
    mix.suck(b(10), 0.014, 0.12, buses=('fx',), back=0.004)


# ─────────────────────────────────── 4.6875 – 7.5  SHAPE LANGUAGE ────────────────────────────
S3_SWAP = (0.69, 0.935)                    # s3 SWAP: hero glide X_L → X_R (local s)
S3_M4 = (4 * BEAT - 0.02, 4 * BEAT + 0.34)  # s3 MORPHS[3]: back curve, glide home + pull-out
SNAP = bezier_ease(0.7, 0, 0.2, 1)          # R.ease.snap
BACK = bezier_ease(0.34, 1.56, 0.64, 1)     # the M4 back curve


def shape(mix, kit):
    T0 = b(10)
    # Portal arrival: the long drop kick (its own sub boom) + a bright bloom + a membrane pop,
    # then the swoosh-through falls away as a pitch-down sweep.
    mix.add('kick', kit.kick['drop'], T0, 1.0)
    mix.duck(T0, 1.0, 1.6)
    n = nsamp(0.5)
    t = taxis(n)
    dn = saw(70 + 1700 * np.exp(-t / 0.08), n) * np.exp(-t / 0.14)
    dn = tvfilt(dn, 'lp', 200 + 5000 * np.exp(-t / 0.07), 1.3)
    mix.add('fx', pan2(fade(norm(dn), 4, 480), 0.0), T0, -13, hall=0.25)
    mix.add('hits', crash(1.2, 0.35, 'portal', 0.8), T0, -14, hall=0.2)
    mix.add('hits', bell(hz(nm('F6')), 1.2, 'bloom', 0.8), T0, -20, hall=0.35, dly=0.15)
    mix.add('hits', pop(5200, 1100, 0.06, 0.002, 0.012, 'membrane', 0.9), T0, -9, room=0.2)

    four_floor(mix, kit, range(11, 16))
    claps(mix, kit, (11, 13, 15))
    hats(mix, kit, T0, b(16) - S16 * 2, open_db=-14.5, key='s')

    # Bright pluck arpeggio on 8ths (F minor pentatonic), ping-pong delayed.
    ARP = [77, 84, 80, 87, 77, 84, 80, 89, 75, 82, 77, 87]
    for i, m in enumerate(ARP):
        tt = T0 + i * S8
        late = smoothstep(b(15), b(16), tt)
        mix.add('music', pluck(hz(m), 0.42, 0.22, ('arp', i)), tt, -12.5 - 1.5 * (i % 2) - 8 * late,
                pan=(-0.5 if i % 2 else 0.5), room=0.12, hall=0.14, dly=0.4)

    # Morph hits: each shape change gets its own voice.
    mix.add('hits', pop(1700, hz(nm('F5')), 0.16, 0.006, 0.045, 'm1', 0.3), b(11), -10, pan=-0.1, room=0.2)       # circle → squircle
    mix.add('hits', pop(1500, hz(nm('Ab5')), 0.22, 0.008, 0.06, 'm2', 0.25, wob=0.07), b(12), -10, pan=0.1, room=0.2)  # damped spring
    mix.add('hits', pop(3200, hz(nm('C6')), 0.12, 0.003, 0.03, 'm3', 0.35, fm=2.2), b(13), -11, pan=-0.05, room=0.2)  # sharp → star
    mix.add('hits', bloop(hz(nm('Eb5')), 0.3, 'm4', 1.2), b(14), -9, pan=0.05, room=0.2)                           # overshoot → circle
    mix.add('hits', pop(2000, hz(nm('F5')), 0.16, 0.005, 0.04, 'm5', 0.3), b(15), -10, room=0.2)                   # recall
    mix.add('music', bell(hz(nm('Eb6')), 0.9, 'recall', 0.6), b(15), -22, hall=0.4)

    # Staging (soft, and nothing leads INTO a hit, so the morph onsets stay clean).
    # Off-beat 8ths (s3 OFF): a scattered subset of the field flares → a glint over the open hat.
    for k in range(5):
        mix.add('fx', sparkle(('off', k)), T0 + (k + 0.5) * BEAT, -31, hall=0.12)
    # SWAP: the hero glides X_L → X_R on R.ease.snap (fastest ≈5.49) while the right editor folds
    # and the left one unfolds — an air glide whose level and brightness follow the glide's speed.
    g0, g1 = T0 + S3_SWAP[0], T0 + S3_SWAP[1]
    n = nsamp(g1 - g0)
    u = np.linspace(0.0, 1.0, n)
    sp = ease_speed(SNAP, n)
    x = tvfilt(noise(n, 'glide'), 'bp', 380 + 2400 * sp, 0.9) + 0.35 * tvfilt(noise(n, 'glide2'), 'lp', 300 + 900 * sp, 0.7)
    mix.add('fx', pan2(fade(norm(x * sp ** 1.2), 8, 96), -0.3 + 0.6 * SNAP(u)), g0, -25, hall=0.12)
    # M3: the whip curve drives a camera punch-in (zoom speed peaks ON B13, the kick overshoot
    # peaks ≈6.15) — an air push that starts on the beat and is spent by that peak.
    n = nsamp(0.16)
    t = taxis(n)
    ps = tvfilt(noise(n, 'punch'), 'lp', 260 + 2400 * np.exp(-t / 0.028), 0.8)
    mix.add('hits', fade(norm(ps * smoothstep(0, 0.003, t) * np.exp(-t / 0.04)), 2, 480), b(13), -19, room=0.2)
    # M4: the back curve (starting 20 ms before B14) glides the hero home to centre and pulls the
    # camera out — fast out of the beat, so a falling swish from the right, started ON the beat
    # (the first 20 ms of motion sit under the bloop).
    m0, m1 = T0 + S3_M4[0], T0 + S3_M4[1]
    n = nsamp(m1 - b(14))
    sp = ease_speed(BACK, nsamp(m1 - m0))[-n:]
    uf = np.linspace(0.0, 1.0, nsamp(m1 - m0))[-n:]            # curve progress, B14 → end
    u = np.linspace(0.0, 1.0, n)
    x = tvfilt(noise(n, 'm4glide'), 'bp', 3000 * (450 / 3000) ** u, 0.8) * sp * smoothstep(0, 0.004, taxis(n))
    mix.add('fx', pan2(fade(norm(x), 4, 480), 0.3 * (1 - np.clip(BACK(uf), 0.0, 1.0))), b(14), -17, hall=0.12)

    # RECALL: the field is sucked home into the dot — reverse swell + rising sweep into 7.5. The
    # hero implodes 7.3075 → 7.4725 (s3 COL.shrink0 → HOLD_T): the swell (its padding trimmed, so
    # it really ends at 7.488) and the sweep run through the landing, and the 30 ms suck from 7.47
    # is the one-frame hold on the contract dot before the cut.
    mix.add_end('fx', trim_tail(reverse_swell(b(16) - b(15) - 0.02, 'shape', 3200)), b(16) - 0.012, -6)
    mix.add_end('fx', whoosh(0.3, 900, 7000, 1.4, 3.5, (0.4, 0.0), 'recall', 0.2), b(16), -14)
    mix.suck(b(16), 0.03, 0.05)


# ────────────────────────────────────── 7.5 – 9.375  DEPTH ────────────────────────────────────
PAD_DB9 = chord('Db3', 'Ab3', 'C4', 'F4', 'Eb5')
PAD_BBM9 = chord('Bb2', 'F3', 'Ab3', 'Db4', 'C5')
# scenes/s4.js constants mirrored here (local s)
S4_CD = (0.22, 0.08)                        # tunnel curl: per-row duration, far → near stagger (snap)
S4_DOT0 = 1.44                              # the signal dot is born at the vanishing point
S4_TC0, S4_TC1 = 1.465, 1.815               # drain: first departure → last ring lands (the dot pops)


def depth(mix, kit):
    T0 = b(16)
    impact(mix, kit, T0, nm('Db2'), 0.8, 'burst', None, -9, 1.0, kick='groove')
    # Stereo shimmer: a fast 'strum' of high bells fanned across the field.
    for i, m in enumerate(('F6', 'Ab6', 'C7', 'Eb7', 'F7', 'Ab7', 'C8')):
        mix.add('music', bell(hz(nm(m)), 1.3, ('shim', i), 0.7), T0 + 0.004 + 0.011 * i, -19 - 0.4 * i,
                pan=(-0.9 + 0.3 * i) * (1 if i % 2 else -1), hall=0.45)

    # Pad swell: Dbmaj9 → Bbm9, filter opening across the bar, closing into the collapse.
    t = taxis(smp(b(20) - T0))
    cut = 420 * (6000 / 420) ** smoothstep(0.0, 1.0, t) * (1 - 0.6 * smoothstep(1.45, 1.85, t))
    p1 = pad(PAD_DB9, b(18) - T0 + 0.03, 'db9', cut, attack=0.45, release=0.06)
    p2 = pad(PAD_BBM9, b(20) - b(18), 'bbm9', cut[smp(b(18) - T0):], attack=0.04, release=0.12)
    mix.add('pad', p1, T0, -8, hall=0.35)
    mix.add('pad', p2, b(18), -8, hall=0.35)

    # Morph whooms (sub drops) on torus / terrain / tunnel, each with a short swell into it.
    for n_, m in ((17, 'Db2'), (18, 'Bb1'), (19, 'F1')):
        mix.add('boom', whoom(hz(nm(m)), 170, 0.6, key=n_), b(n_), -7)
        mix.add_end('fx', whoosh(0.14, 150, 900, 0.8, 2.0, (0, 0), ('pre', n_), 1.0), b(n_), -19)
        mix.add('hits', pop(1400, 260, 0.1, 0.006, 0.03, ('mm', n_), 0.7), b(n_), -13, room=0.2)
        mix.suck(b(n_), 0.015, 0.2, buses=('fx',), back=0.006)
        mix.duck(b(n_), 0.7, 1.2)

    # b19 TUNNEL: the landscape rolls up into rings round the view axis, far rows first, sweeping
    # toward the camera (each row on R.ease.snap, steepest ON the beat, ≈8.87–9.02). After the
    # whoom, the second half of that motion curls once around the field and closes in on the
    # listener: brightening, width collapsing to the centre, level = the rows' summed speed.
    D, SPR = S4_CD
    ens = np.convolve(ease_speed(SNAP, nsamp(D)), np.ones(nsamp(SPR)) / nsamp(SPR))
    ens = ens[smp(0.456 * D + SPR / 2):]                         # from the beat on
    ens = ens[:np.flatnonzero(ens > 0.02 * ens.max())[-1] + 1] / ens.max()
    n = len(ens)
    u = np.linspace(0.0, 1.0, n)
    cu = tvfilt(noise(n, 'curl'), 'bp', 500 * (3600 / 500) ** u, 1.4) + 0.3 * tvfilt(noise(n, 'curl2'), 'lp', 700, 0.7)
    cu = fade(norm(cu * ens * smoothstep(0, 0.004, taxis(n))), 2, 480)
    mix.add('fx', pan2(cu, 0.75 * (1 - u) * np.sin(TAU * u)), b(19), -21, hall=0.15)
    # The small signal dot is born at the tunnel's vanishing point (s4 T_DOT0, backOut to r 4).
    mix.add('music', bubble(hz(nm('F6')), 0.11, 'dotborn'), on_frame(T0 + S4_DOT0), -27, room=0.2, hall=0.2)

    # A distant pulse keeps time: low-passed 16th hats.
    hats(mix, kit, T0 + S8, b(19) + S8, -22, -28, -34, lp=5500, key='d')

    # Glitter: ~seeded Poisson grains; dense after the burst, sparse mid-bar, heating up and
    # spiralling into the centre as the drain winds in (s4 TC0 1.465 → far rings home ≈1.70).
    g = rng('glitter')
    penta = [nm(s) for s in ('F6', 'Ab6', 'Bb6', 'C7', 'Eb7', 'F7', 'Ab7')]
    for i in range(int((b(20) - T0) / 0.002)):
        tt = T0 + i * 0.002
        lt = tt - T0
        lam = 70 * np.exp(-lt / 0.25) + 16 + 60 * smoothstep(1.4, 1.62, lt) * (1 - smoothstep(1.66, 1.72, lt))
        if g.random() > lam * 0.002:
            continue
        coll = smoothstep(1.4, 1.7, lt)
        m = penta[g.integers(len(penta))] + (12 if coll > 0.5 and g.random() < 0.5 else 0)
        pn = g.uniform(-0.95, 0.95) * (1 - 0.85 * coll)
        mix.add('fx', grain(hz(m) * g.uniform(0.997, 1.003), g.uniform(0.02, 0.07)), tt,
                -20 + g.uniform(-6, 0) + 3 * coll, pan=pn, hall=0.35, dly=0.1)

    # The drain: a swirl that circles the field faster and faster and lands in the centre as the
    # rings contract into the signal dot (s4 TC0 1.465 → the last ring lands TC1 1.815, visible
    # from ≈1.63). The dot pops on that last ring: first shown on f559 (9.3167, r 10 → 17.8; the
    # radius peaks at T_DOTPK 1.826) and settles at T_CLEAN 1.845, where the suck into LIQUID starts.
    t_a, t_b = T0 + S4_TC0, T0 + S4_TC1
    n = smp(t_b) - smp(t_a)
    tt = taxis(n)
    u = tt / (t_b - t_a)
    sw = tvfilt(noise(n, 'drain'), 'bp', 700 * (6.0 ** u ** 1.5), 2.5) + 0.5 * np.sin(TAU * phase(300 * 4 ** (u ** 2)))
    sw = fade(norm(sw) * u ** 1.6, 8, smp(0.004))
    mix.add('fx', pan2(sw, 0.8 * (1 - u) * np.sin(TAU * phase(2 + 14 * u ** 2))), t_a, -17, hall=0.2)
    mix.add('hits', pop(2400, hz(nm('F5')), 0.12, 0.004, 0.035, 'dotpop', 0.2), on_frame(t_b), -17, room=0.25)
    mix.add_end('fx', reverse_swell(0.3, 'depth', 2400), b(20) - 0.01, -13)
    mix.suck(b(20), 0.03, 0.1)


# ────────────────────────────────────── 9.375 – 11.25  LIQUID ─────────────────────────────────
def liquid(mix, kit):
    T0 = b(20)
    mix.add('hits', plip(), T0, -5, room=0.3, hall=0.25)
    mix.add('hits', splash(0.9, 'liq'), T0, -11, room=0.2, hall=0.2)
    mix.add('kick', kit.kick['soft'], T0, -1)
    mix.add('boom', boom(hz(nm('F1')), 0.7, 0.25, 1.6, attack=0.05), T0, -5)
    mix.duck(T0, 1.0, 1.3)
    four_floor(mix, kit, (21, 22, 23))
    claps(mix, kit, (21, 23), -8, room=0.45, hall=0.12)
    hats(mix, kit, T0, b(24) - S16, -15.5, -22.5, -29, key='l')

    # Wobble bass: resonant LP whose cutoff breathes once per 8th (once per 16th on the last beat).
    t1 = b(24) - 0.006
    n = smp(t1) - smp(T0)
    t = taxis(n)
    f = np.full(n, hz(nm('F2')))
    f[smp(b(22) - T0):] = hz(nm('Db2'))
    f[smp(b(23) - T0):] = hz(nm('Eb2'))
    f = np.convolve(f, np.ones(96) / 96, mode='same')
    f[:48], f[-48:] = f[48], f[-49]
    rate = np.where(t < b(23) - T0, 1 / S8, 1 / S16)
    lfo = np.sin(np.pi * (phase(rate) % 1.0)) ** 2
    osc = 0.55 * saw(f) + 0.35 * saw(f * 1.004, ph0=0.4) + 0.4 * square(f, ph0=0.2, pw=0.35)
    x = tvfilt(osc, 'lp', 170 * (2600 / 170) ** lfo, 3.6)
    x = np.tanh(2.2 * x) / np.tanh(2.2)
    mix.add('bass', fade(x * smoothstep(0, 0.02, t), 4, 480), T0, -9)
    # width: two detuned copies through the same wobble, high-passed (the low end stays mono)
    wide = np.stack([tvfilt(saw(f * 2 ** (sd * 9 / 1200), ph0=0.2 + 0.3 * c), 'lp', 170 * (2600 / 170) ** lfo, 3.6)
                     for c, sd in enumerate((-1, 1))])
    wide = butter(np.tanh(2.0 * wide) / np.tanh(2.0), 'hp', 280, 4)
    mix.add('music', fade(wide * smoothstep(0, 0.02, t), 4, 480), T0, -14)
    sub_line(mix, [(T0, nm('F1')), (b(22), sub_note(nm('Db2'))), (b(23), sub_note(nm('Eb2')))], T0, t1, -8)

    # Bubbly FM blips on a seeded subset of 16ths.
    g = rng('bubbles')
    penta = [nm(s) for s in ('F5', 'Ab5', 'Bb5', 'C6', 'Eb6', 'F6')]
    for i in range(16):
        slot = i % 4
        if slot == 0 or g.random() > 0.55:
            continue
        m = penta[g.integers(len(penta))]
        mix.add('music', bubble(hz(m), 0.11, ('bub', i)), T0 + i * S16, -19 + g.uniform(-3, 0),
                pan=g.uniform(-0.7, 0.7), room=0.2, dly=0.2)

    # 10.3125 WOBBLE: collision — jelly modes n = 2, 3, 4 ring out, and three ripples travel.
    tj = b(22)
    n = nsamp(0.7)
    t = taxis(n)
    jel = sum(a * np.sin(TAU * phase(hz(nm('F3')) * r * (1 + 0.05 * np.sin(TAU * 8.5 * t) * np.exp(-t / 0.18))))
              * np.exp(-t / d) for r, a, d in ((1.0, 1.0, 0.2), (1.5, 0.5, 0.14), (2.0, 0.35, 0.09)))
    jel = jel * smoothstep(0, 0.002, t) + filt(noise(n, 'jel'), 'lp', 1500) * np.exp(-t / 0.01) * 0.3
    mix.add('hits', fade(norm(jel), 3, 480), tj, -9, room=0.25, hall=0.15)
    for k in range(3):
        mix.add('music', pop(1900 - 250 * k, 700 - 80 * k, 0.12, 0.005, 0.03, ('rip', k), 0.1),
                tj + 0.09 + 0.085 * k, -21 - 3 * k, pan=(-0.5, 0.5, 0.0)[k], hall=0.25)

    # FLOOD (s5 1.455 →): the frame fills with bone — a rising 'bottle-fill' resonance + bubbles.
    ta = T0 + 1.455
    d = b(24) - ta
    n = nsamp(d)
    t = taxis(n)
    u = t / d
    fl = tvfilt(noise(n, 'fill'), 'bp', 320 * (9.0 ** (u ** 1.3)), 7.0) * (0.3 + 0.7 * u ** 1.5)
    fl = fade(norm(fl), smp(0.02), smp(0.004))
    mix.add_end('fx', pan2(fl, 0.0), b(24), -9, hall=0.15)
    for i in range(14):
        tt = ta + g.uniform(0.02, d - 0.03)
        mix.add('fx', bubble(g.uniform(600, 1600) * (1 + (tt - ta) / d), 0.07, ('fb', i)), tt, -27,
                pan=g.uniform(-0.6, 0.6))


# ─────────────────────────────────── 11.25 – 13.125  MULTIVERSE ───────────────────────────────
SPLITS = [(24, chord('F3', 'F4', 'Ab4', 'C5')), (25, chord('Ab3', 'Ab4', 'C5', 'Eb5')),
          (26, chord('Bb3', 'Bb4', 'Db5', 'F5')), (27, chord('C4', 'Bb4', 'C5', 'E5', 'G5'))]
T_GAP = b(28) - 0.2
S6_OUT0, S6_CLEAN = 1.68, 1.848             # s6: the implosion starts / the last dots land (local s)
GAP_SUCK_DB = -28.0                         # reverse-suck in the gap: ≈ −28 dB (10 ms max) under the mix RMS


def stutter(notes, key):
    """BAM + three 64th-note retriggers of its own attack laid over it (each ~0.9 semitone
    higher), plus a bit-crushed copy that decays away — glitch as a transient, not a bed."""
    s = stab(notes, 0.34, ('stut', key), 1.25)
    L = smp(S32 / 2)
    out = np.zeros((2, s.shape[1] + 3 * L))
    out[:, :s.shape[1]] += s
    for k in (1, 2, 3):
        sl = s[:, :L]
        idx = np.arange(L) * 2 ** (0.9 * k / 12)
        sl = np.stack([np.interp(idx, np.arange(L), sl[c]) for c in range(2)])
        out[:, k * L:(k + 1) * L] += fade(sl, 2, 72) * (0.75 - 0.1 * k)
    grit = filt(crush(norm(out), 5, 5), 'lp', 8500, 0.7)
    grit *= np.exp(-taxis(out.shape[1]) / 0.12)                   # the crush is a transient, not a bed
    out = 0.6 * out + 0.45 * grit
    return fade(norm(out), 3, 480)


def multiverse(mix, kit):
    T0 = b(24)
    mix.add('hits', crack('mv'), T0, -8, room=0.3, hall=0.1)
    four_floor(mix, kit, range(24, 28))
    for n, notes in SPLITS:
        mix.add('hits', stutter(notes, n), b(n), -5.5 + 0.5 * (n - 24), room=0.2, hall=0.15)
        mix.add('fx', pan2(fade(norm(crush(filt(noise(nsamp(0.05), 'glitch', n), 'bp', 3000, 1.0)
                                           * np.exp(-taxis(nsamp(0.05)) / 0.01), 8, 4)), 2, 96), 0.0),
                b(n) + S32, -20, pan=0.5 * (-1) ** n)
    hats(mix, kit, T0, T_GAP, -15.5, -21.5, -28, key='m')

    # Snare roll: 8ths → 16ths → 32nds, crescendo, pitch and brightness rising.
    times = [T0 + i * S8 for i in range(4)] + [b(26) + i * S16 for i in range(4)]
    times += [b(27) + i * S32 for i in range(int((T_GAP - b(27)) / S32 + 1e-6) + 1) if b(27) + i * S32 < T_GAP - 0.01]
    for i, tt in enumerate(times):
        u = (tt - T0) / (T_GAP - T0)
        sn = snare(('roll', i), 185 + 110 * u, 0.09 + 0.05 * (1 - u), 0.8 + 0.5 * u)
        sn = filt(sn, 'lp', 2500 + 11000 * u ** 1.5, 0.7)
        mix.add('drums', fade(sn, 2, 240), tt, -16 + 10 * u ** 1.3, pan=0.15 * (-1) ** i, room=0.25)

    # Riser into the gap.
    mix.add_end('fx', riser(T_GAP - T0, chord('C4', 'G4', 'C5'), 12, 220, 10000, 'build', (4, 30), 0.5),
                T_GAP, -5, hall=0.15)
    # Offbeat pumping bass on the roots, high-passed harder and harder (the floor falls away).
    roots = (nm('F2'), nm('Ab2'), nm('Bb2'), nm('C3'))
    ev = [(b(24 + i) + S8, S8 * 0.7, r, 1.0) for i, r in enumerate(roots)]
    ev += [(b(24 + i) + 3 * S16, S16 * 0.6, r + 12, 0.6) for i, r in enumerate(roots)]
    ev.sort()
    tt = taxis(smp(T_GAP) - smp(T0))
    bass_line(mix, ev, T0, T_GAP, 'build', cut0=300, env_amt=2200, db=-9,
              hp=40 * (6.0 ** smoothstep(0.0, T_GAP - T0, tt)))
    amp = 1 - smoothstep(b(26) - T0, b(27) - T0, taxis(smp(b(27) + 0.05) - smp(T0)))
    sub_line(mix, [(T0, nm('F1')), (b(25), sub_note(nm('Ab2'))), (b(26), sub_note(nm('Bb2')))],
             T0, b(27) + 0.05, -9, amp=amp)
    mix.gap(T_GAP, b(28), keep=('air',))

    # The wall implodes back into the dot INSIDE the gap (s6 OUT0 → the last dots land at T_CLEAN).
    # So the motion isn't silent, a reverse-suck on the 'air' bus (the gap spares it), ~28 dB
    # under the mix with no transient: it swells out of nothing, darkens, collapses to mono as the
    # dots converge and vanishes as they land, so the clean-dot frames before the final hit
    # (13.098 → 13.125) are digital silence again — the same inhale → breath → hit every other
    # big accent gets from suck().
    s0, s1 = T0 + S6_OUT0, T0 + S6_CLEAN
    rs = trim_tail(reverse_swell(s1 - s0 + 0.04, 'implode', 1800, bright=0.4))[:, -nsamp(s1 - s0):]
    u = np.linspace(0.0, 1.0, rs.shape[1])
    mid, side = rs.mean(axis=0), 0.5 * (rs[0] - rs[1]) * (1 - u) ** 1.5
    rs = filt(np.stack([mid + side, mid - side]), 'lp', 5000, 0.6)
    mix.add_end('air', fade(norm(rs), smp(0.03), smp(0.014)), s1, GAP_SUCK_DB)


# ────────────────────────────────────── 13.125 – 15.0  LOCKUP ─────────────────────────────────
def lockup(mix, kit):
    T0 = b(28)
    impact(mix, kit, T0, nm('F1'), 1.3, 'final', FM9 + [nm('F2')], -7.5, 2.2, kick='final')
    # Low 'braam' under the hit.
    n = nsamp(1.6)
    t = taxis(n)
    br = sum(saw(hz(nm(s)) * 2 ** (dv / 1200), n, ph0=0.1 * i) for i, (s, dv) in
             enumerate((('F2', -6), ('F2', 6), ('C3', -4), ('F3', 5))))
    br = tvfilt(br, 'lp', 250 + 1600 * np.exp(-t / 0.25), 1.2) * smoothstep(0, 0.004, t) * np.exp(-t / 0.55)
    mix.add('hits', fade(norm(br), 3, 2400), T0, -8, hall=0.2)

    # Warm Fm9 bed with a long hall; the final impact's long duck (2.7× release) makes it swell
    # in behind the hit rather than sit on top of it.
    dur = 15.0 - T0
    tt = taxis(nsamp(dur))
    bed = pad(chord('F3', 'C4', 'Eb4', 'G4', 'Ab4', 'C5'), dur, 'bed',
              900 + 900 * smoothstep(0, 0.8, tt) - 400 * smoothstep(1.0, 1.875, tt), 7, 14, 0.6, 0.02, 0.05)
    bed *= 1 - 0.6 * smoothstep(0.85, 1.875, tt)            # the bed exhales under the sting
    mix.add('pad', bed, T0, -11, hall=0.45)

    # The dot leaps over the word and lands as the full stop (callback to the intro bloops).
    mix.add_end('fx', whoosh(0.3, 600, 3500, 1.3, 2.0, (0.0, 0.45), 'leap', 0.3), b(29), -24)
    mix.add('music', bloop(hz(nm('F5')), 0.34, 'period', 0.9), b(29), -14, pan=0.3, room=0.2, hall=0.2)
    for k in range(6):   # the impact ripples right → left through the letters
        mix.add('music', pop(3000 - 180 * k, 1400 - 60 * k, 0.05, 0.002, 0.01, ('rip7', k), 0.4),
                b(29) + 0.02 + 0.011 * k, -29 - k * 0.8, pan=0.45 - 0.16 * k, room=0.2)

    # "Motion Designer" swings up: half-time backbeat with a big tail.
    mix.add_end('fx', whoosh(0.12, 800, 3000, 1.2, 2.4, (-0.3, 0.1), 'role', 0.3), b(30), -22)
    mix.add('drums', kit.clap[1], b(30), -9, room=0.3, hall=0.35)
    mix.add('drums', snare('ht', 180, 0.16, 0.9), b(30), -13, room=0.3, hall=0.3)

    # 14.531 STING: the period winks and the signature three-note bell motif (5 → 1 → 9).
    tsg = b(31)
    mix.add('hits', pop(3600, hz(nm('C7')), 0.08, 0.002, 0.015, 'wink', 0.5), tsg, -16)
    for i, (m, dt, d) in enumerate((('C6', 0.0, -10.5), ('F6', S16, -12.5), ('G6', S8, -11.5))):
        mix.add('music', bell(hz(nm(m)), 1.6 - 0.2 * i, ('sting', i), 1.1 - 0.1 * i), tsg + dt, d,
                pan=(-0.2, 0.2, 0.0)[i], hall=0.4, dly=0.25)
        mix.add('music', pluck(hz(nm(m)) / 2, 0.5, 0.2, ('stingp', i)), tsg + dt, d - 9, room=0.2)
    # The mono line decodes L → R (s7 monoT, from T_META = b30 + ⅛): digital chatter, then each
    # glyph locks. The last glyph locks ON the sting, so its lock sits on the sting's own sample.
    dec = s7_decode()
    for i, (ch, ap, st) in enumerate(dec):
        if ch == ' ':
            continue
        g = rng('dec', i)
        blip = fade(square(g.uniform(2200, 5200), nsamp(0.004)) * np.exp(-taxis(nsamp(0.004)) / 0.0015), 2, 24)
        pn = -0.6 + 1.2 * i / 29
        mix.add('fx', fade(filt(blip, 'lp', 9000), 2, 24), on_frame(ap), -34, pan=pn)
        mix.add('fx', pop(5200, 3800, 0.02, 0.001, 0.004, ('lock', i), 0.2),
                tsg if i == len(dec) - 1 else on_frame(st), -38, pan=pn)

    # The period's wink sends a light pulse right → left along the hairline (s7 drawGlint: quartOut
    # over 0.3 s, 20 ms fade-in, (1 − u)^2.2 fade) — a whisper of air travelling with it.
    n = nsamp(S7_GLINT_D)
    t = taxis(n)
    u = t / S7_GLINT_D
    gl = tvfilt(noise(n, 'glint'), 'bp', 9500 - 3000 * u, 1.6) + 0.25 * filt(noise(n, 'glint2'), 'hp', 11000)
    gl = fade(norm(gl * smoothstep(0, 0.02, t) * (1 - u) ** 2.2), 4, 480)
    mix.add('fx', pan2(gl, 0.55 - 1.1 * (1 - (1 - u) ** 4)), tsg, -27, hall=0.2)


S7_GLINT_D = 0.3                              # s7 GLINT_D


def s7_decode():
    """Re-derive s7's per-character decode schedule (scenes/s7.js monoT) in global time:
    appear from T_META (b30 + ⅛ = 14.296875), and the last glyph settles ON the sting (b31)."""
    MONO = 'REEL 2026 — AVAILABLE FOR WORK'
    rnd = mulberry32(707)
    out = []
    for i, ch in enumerate(MONO):
        ap = b(28) + b(2) + S8 + 0.012 + i * 0.0045 + rnd() * 0.006
        st = ap + 0.04 + rnd() * 0.045
        rnd()
        out.append((ch, ap, st))
    out[-1] = (out[-1][0], out[-1][1], b(31))
    return out


# ═════════════════════════════════════════ MASTER ═══════════════════════════════════════════
_K1 = ([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585])
_K2 = ([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621])


def kweight(x):
    return sps.lfilter(*_K2, sps.lfilter(*_K1, x, axis=-1), axis=-1)


def lufs(x):
    """Integrated loudness, ITU-R BS.1770-4 (K-weighting, 400 ms blocks / 75 % overlap, gated)."""
    y = kweight(x) ** 2
    blk, hop = smp(0.4), smp(0.1)
    cs = np.concatenate([np.zeros((2, 1)), np.cumsum(y, axis=1)], axis=1)
    st = np.arange(0, x.shape[1] - blk + 1, hop)
    z = ((cs[:, st + blk] - cs[:, st]) / blk).sum(axis=0)
    lv = -0.691 + 10 * np.log10(z + 1e-20)
    m = lv > -70
    if not m.any():
        return -120.0
    rel = -0.691 + 10 * np.log10(z[m].mean()) - 10
    m &= lv > rel
    return -0.691 + 10 * np.log10(z[m].mean())


def true_peak(x, os=4):
    return np.max(np.abs(sps.resample_poly(x, os, 1, axis=-1)))


def glue(x, thr=-22.0, ratio=1.6, knee=8.0, att=0.025, rel=0.20, hop=32):
    """Stereo-linked RMS bus compressor (detector high-passed at 120 Hz so the sub doesn't pump
    the whole mix), gain smoothed at control rate."""
    det = butter(x, 'hp', 120, 2)
    p = np.sum(det ** 2, axis=0) * 0.5
    cs = np.concatenate([[0.0], np.cumsum(p)])
    win = smp(0.006)
    idx = np.arange(0, N, hop)
    lo = np.maximum(idx - win, 0)
    lvl = 10 * np.log10((cs[idx + 1] - cs[lo]) / np.maximum(idx + 1 - lo, 1) + 1e-12)
    over = lvl - thr
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, (1 / ratio - 1) * over, (1 / ratio - 1) * (over + knee / 2) ** 2 / (2 * knee)))
    aa, ar = np.exp(-hop / (att * SR)), np.exp(-hop / (rel * SR))
    sm = np.empty_like(gr)
    g = 0.0
    for i, v in enumerate(gr):
        g = aa * g + (1 - aa) * v if v < g else ar * g + (1 - ar) * v
        sm[i] = g
    gain = np.interp(np.arange(N), idx, sm)
    return x * undb(gain), gain


def softclip(x, thr=0.72, os=4):
    """Soft-knee clipper (linear below thr, tanh above), 4× oversampled to keep aliasing down."""
    up = sps.resample_poly(x, os, 1, axis=-1)
    a = np.abs(up)
    k = 1.0 - thr
    y = np.where(a <= thr, up, np.sign(up) * (thr + k * np.tanh((a - thr) / k)))
    return sps.resample_poly(y, 1, os, axis=-1)


def limiter(x, ceil_db=TP_CEIL_DB, look=0.0015, rel=0.07, os=4, hop=16):
    """True-peak look-ahead limiter. Required gain from the 4× oversampled peak of each sample →
    forward min over the look-ahead → box-smoothed (the ramp completes exactly at the peak) →
    exponential release at control rate, block edges taken as the min of neighbours so the gain
    never exceeds what any sample needs."""
    c = undb(ceil_db)
    pk = np.abs(sps.resample_poly(x, os, 1, axis=-1)).max(axis=0).reshape(-1, os).max(axis=1)
    req = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    L = smp(look)
    m = np.lib.stride_tricks.sliding_window_view(np.concatenate([req, np.ones(L - 1)]), L).min(axis=1)
    mp = np.concatenate([np.full(L - 1, m[0]), m])
    cs = np.concatenate([[0.0], np.cumsum(mp)])
    g = (cs[L:] - cs[:-L]) / L
    nb = N // hop
    cmin = g.reshape(nb, hop).min(axis=1)
    s = np.empty(nb)
    a = np.exp(-hop / (rel * SR))
    cur = 1.0
    for k in range(nb):
        v = cmin[k]
        cur = v if v < cur else v + (cur - v) * a
        s[k] = cur
    e = np.empty(nb + 1)
    e[0], e[-1] = s[0], s[-1]
    e[1:-1] = np.minimum(s[:-1], s[1:])
    r = np.arange(hop) / hop
    gain = (e[:-1, None] * (1 - r) + e[1:, None] * r).ravel()
    return x * gain, gain


def master(pre):
    pre = filt(pre, 'hs', 11000, 0.7, 1.5)                           # a little air on top
    pre = pre * undb(-20.0 - lufs(pre))                              # reference level for the glue
    glued, ggr = glue(pre)
    fade_end = np.ones(N)
    k = smp(0.2)
    fade_end[-k:] = 0.5 + 0.5 * np.cos(np.pi * (np.arange(k) + 1) / k)
    fade_end[:smp(0.003)] *= smoothstep(0, smp(0.003), np.arange(smp(0.003)))
    drive = 5.0
    for _ in range(6):                                               # loudness-normalise post-limiter
        cin = glued * undb(drive)
        y, lgr = limiter(softclip(cin))
        y = y * fade_end
        L = lufs(y)
        if abs(L - LUFS_TARGET) < 0.02:
            break
        drive += LUFS_TARGET - L
    stats = dict(lufs=L, drive=drive, glue_gr_avg=float(np.mean(ggr)), glue_gr_max=float(np.min(ggr)),
                 lim_gr_max=float(lin2db(np.min(lgr))), lim_gr_avg=float(np.mean(lin2db(lgr))),
                 tp=float(lin2db(true_peak(y))), peak=float(lin2db(np.max(np.abs(y)))),
                 clip_in=float(lin2db(np.max(np.abs(cin)))), clip_frac=float(np.mean(np.abs(cin) > 0.72)))
    return y, stats


def write_wav(path, x):
    g = np.random.default_rng(seed_of('dither'))
    d = g.random(x.shape) - g.random(x.shape)                        # TPDF, ±1 LSB
    q = np.clip(np.round(x * 32767.0 + d), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(q.T.tobytes())


# ═════════════════════════════════════════ MAIN ═════════════════════════════════════════════
def build():
    mix = Mix()
    kit = Kit()
    for part in (ignition, kinetic, shape, depth, liquid, multiverse, lockup):
        part(mix, kit)
    return mix


def main():
    out = os.path.join(HERE, 'reel.wav')
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
    quiet = '--quiet' in sys.argv
    t0 = time.perf_counter()
    mix = build()
    t1 = time.perf_counter()
    pre = mix.render()
    t2 = time.perf_counter()
    y, st = master(pre)
    t3 = time.perf_counter()
    write_wav(out, y)
    t4 = time.perf_counter()
    if not quiet:
        print(f'reel.wav → {out}')
        print(f'  {N} frames @ {SR} Hz · 2 ch · 16-bit · {N / SR:.3f} s · {mix.events} events')
        print(f'  time: arrange {1e3 * (t1 - t0):.0f} ms · mix {1e3 * (t2 - t1):.0f} ms · '
              f'master {1e3 * (t3 - t2):.0f} ms · write {1e3 * (t4 - t3):.0f} ms · total {1e3 * (t4 - t0):.0f} ms')
        print(f'  loudness {st["lufs"]:.2f} LUFS · true peak {st["tp"]:.2f} dBTP · sample peak {st["peak"]:.2f} dBFS')
        print(f'  glue GR avg {st["glue_gr_avg"]:.2f} dB max {st["glue_gr_max"]:.2f} dB · '
              f'limiter GR avg {st["lim_gr_avg"]:.2f} dB max {st["lim_gr_max"]:.2f} dB · drive {st["drive"]:.2f} dB')
        print(f'  soft clip: input peak {st["clip_in"]:+.2f} dBFS · {100 * st["clip_frac"]:.2f} % of samples above knee')
        print('  buses (pre-master peak dBFS / K-weighted loudness): ' +
              ' · '.join(f'{k} {p:.1f}/{r:.1f}' for k, (p, r) in mix.levels.items()))
        print(f'  event edge check: {len(mix.bad_edges)} non-silent event edges'
              + (f' → {mix.bad_edges[:8]}' if mix.bad_edges else ' (every event starts and ends at 0)'))
    return 1e3 * (t4 - t0)


if __name__ == '__main__':
    main()
