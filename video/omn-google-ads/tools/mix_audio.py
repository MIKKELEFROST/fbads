"""Lydspor til OMN-filmen: syntetiseret musik (120 BPM), lydeffekter og speak.

Versioner med mood: 'soft' i copy.js (v3, v4) får music_soft(): ingen stortromme, clap eller
sidechain-pumpen, kun pad, klokke-arpeggio, blød bas, shaker og fingerknips.

Alt genereres her (ingen licenserede samples). Musik og effekter følger de samme
tidspunkter som animationen: speak fra variants/<v>/lines.json ("at"), effekter fra
audio/<v>/sfx.json (eksporteret af `node tools/render.cjs --variant v2 --sfx audio/v2/sfx.json`).

    python3 tools/mix_audio.py v2       → audio/v2/mix.wav (48 kHz stereo, 20 s)
"""
import json
import subprocess
from pathlib import Path

import numpy as np
import scipy.io.wavfile as wavfile
from scipy import signal

import variant
from build_cues import build as build_cues

ROOT = Path(__file__).resolve().parent.parent
VARIANT = variant.name()
MOOD = variant.mood(VARIANT)
AUD = variant.paths(VARIANT)["aud"]
SR = 48000
DUR = 20.0
N = int(SR * DUR)
BEAT = 0.5  # 120 BPM
rng = np.random.default_rng(7)


# ---------------------------------------------------------------- helpers
def tt(d):
    return np.arange(int(d * SR)) / SR


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], "bandpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "highpass", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "lowpass", fs=SR, output="sos"), x)


def place(buf, sig, t, gain=1.0, pan=0.0):
    """Læg mono-signal ind i stereo-buffer ved tid t med constant-power pan (-1..1)."""
    i = int(round(t * SR))
    if i >= buf.shape[1]:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    n = min(len(sig), buf.shape[1] - i)
    a = (pan + 1) * np.pi / 4
    buf[0, i:i + n] += sig[:n] * gain * np.cos(a)
    buf[1, i:i + n] += sig[:n] * gain * np.sin(a)


def place_st(buf, st, t, gain=1.0):
    i = int(round(t * SR))
    n = min(st.shape[1], buf.shape[1] - i)
    buf[:, i:i + n] += st[:, :n] * gain


def reverb_ir(d=1.6, tau=0.45, bright=5000):
    t = tt(d)
    ir = np.stack([rng.standard_normal(len(t)), rng.standard_normal(len(t))]) * np.exp(-t / tau)
    ir = np.stack([lp(ir[0], bright), lp(ir[1], bright)])
    ir[:, : int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))  # pre-delay-ish
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True))


IR = reverb_ir()


def reverb(st, mix=0.25):
    wet = np.stack([signal.fftconvolve(st[0], IR[0])[: st.shape[1]], signal.fftconvolve(st[1], IR[1])[: st.shape[1]]])
    return st * (1 - mix * 0.3) + wet * mix


def saw(f, t, harm=14):
    out = np.zeros_like(t)
    for k in range(1, harm + 1):
        if f * k > SR / 2.2:
            break
        out += np.sin(2 * np.pi * f * k * t) / k
    return out * 0.6


def adsr(n, a=0.005, r=0.05):
    e = np.ones(n)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr)
    return e


# ---------------------------------------------------------------- instrumenter
def kick(gain=1.0):
    t = tt(0.45)
    f = 46 + 120 * np.exp(-t / 0.032)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.2)
    click = hp(rng.standard_normal(len(t)), 2000) * np.exp(-t / 0.004) * 0.25
    return np.tanh((body + click) * 1.6) * gain


def clap():
    t = tt(0.35)
    n = bp(rng.standard_normal(len(t)), 900, 5000)
    e = np.zeros_like(t)
    for o in (0.0, 0.011, 0.022):
        e += np.where(t >= o, np.exp(-(t - o) / 0.006), 0)
    e += np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.09), 0)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.04) * 0.4
    return (n * e * 0.7 + body)


def hat(open_=False):
    t = tt(0.25 if open_ else 0.06)
    return hp(rng.standard_normal(len(t)), 7500, 4) * np.exp(-t / (0.09 if open_ else 0.014)) * 0.5


def bass_note(m, d=0.23, bright=1.0):
    t = tt(d)
    f = mtof(m)
    out = np.sin(2 * np.pi * f * t) * 0.9
    for k in range(2, 10):
        out += np.sin(2 * np.pi * f * k * t) / k * np.exp(-t * (6 + 5 * k) / bright) * 0.9
    return np.tanh(out * 1.3) * adsr(len(t), 0.004, 0.04)


def pluck(m, d=0.35):
    t = tt(d)
    f = mtof(m)
    out = np.zeros_like(t)
    for k in range(1, 7):
        out += np.sin(2 * np.pi * f * k * t) / (k ** 1.4) * np.exp(-t * (9 + 4 * k))
    return out * adsr(len(t), 0.002, 0.05)


def pad_chord(notes, d, bright=1800):
    t = tt(d)
    L = np.zeros_like(t)
    R = np.zeros_like(t)
    for m in notes:
        f = mtof(m)
        L += saw(f * 2 ** (-7 / 1200), t, 10) + saw(f * 2 ** (4 / 1200), t, 10) * 0.6
        R += saw(f * 2 ** (7 / 1200), t, 10) + saw(f * 2 ** (-4 / 1200), t, 10) * 0.6
    st = np.stack([lp(L, bright), lp(R, bright)]) / len(notes)
    return st * adsr(len(t), 0.35, 0.6)


def shaker(accent=1.0):
    t = tt(0.09)
    env = np.minimum(t / 0.012, 1) * np.exp(-t / 0.03)
    return bp(rng.standard_normal(len(t)), 4500, 11000) * env * accent


def snap():
    t = tt(0.12)
    return bp(rng.standard_normal(len(t)), 1400, 4200) * np.exp(-t / 0.018) * 0.8


def soft_bass(m, d):
    t = tt(d)
    f = mtof(m)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.3)
    return s * adsr(len(t), 0.12, 0.45)


def bell(m, d=0.6):
    t = tt(d)
    f = mtof(m)
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.35) + 0.35 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / 0.12)
         + 0.15 * np.sin(2 * np.pi * f * 4.2 * t) * np.exp(-t / 0.06))
    return s * adsr(len(t), 0.003, 0.05)


# ---------------------------------------------------------------- lydeffekter
def noise_sweep(d, f0, f1, q=0.6, shape="bell"):
    t = tt(d)
    x = rng.standard_normal(len(t))
    out = np.zeros_like(t)
    seg = int(0.01 * SR)
    for i in range(0, len(t), seg):
        p = i / len(t)
        fc = f0 * (f1 / f0) ** p
        lo, hi = max(40, fc * (1 - q / 2)), min(SR / 2.1, fc * (1 + q / 2))
        out[i:i + seg] = bp(x[max(0, i - 2048):i + seg], lo, hi)[-len(out[i:i + seg]):]
    if shape == "bell":
        e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    elif shape == "rise":
        e = (t / d) ** 2.2
    else:
        e = np.exp(-t / (d / 3))
    return out * e


def sfx_sound(ev):
    k, o = ev["type"], ev
    t = None
    if k == "key":
        t = tt(0.03)
        s = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t / 0.0035) * 0.6
        s += np.sin(2 * np.pi * (1800 + 600 * o.get("v", 0.5)) * t) * np.exp(-t / 0.004) * 0.15
        return s, 0.18 * o.get("v", 0.7), rng.uniform(-0.2, 0.2)
    if k == "pop":
        t = tt(0.14)
        f = (700 + 140 * o.get("p", 0)) * (1 + 0.8 * np.exp(-t / 0.012))
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.045)
        return s, 0.18 if o.get("soft") else 0.32, -0.3 + 0.2 * o.get("p", 0)
    if k == "tick":
        t = tt(0.06)
        s = np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.01) + hp(rng.standard_normal(len(t)), 4000) * np.exp(-t / 0.004) * 0.3
        return s, 0.12, -0.4 + 0.15 * o.get("p", 0)
    if k == "click":
        t = tt(0.08)
        s = hp(rng.standard_normal(len(t)), 1500) * (np.exp(-t / 0.003) + 0.6 * np.where(t > 0.035, np.exp(-(t - 0.035) / 0.003), 0))
        s += np.sin(2 * np.pi * 1100 * t) * np.exp(-t / 0.008) * 0.4
        return s, 0.35, 0.15
    if k == "whoosh":
        d = o.get("d", 0.6)
        return noise_sweep(d, 300 * o.get("f", 1), 4500 * o.get("f", 1), 0.9), 0.5, 0.0
    if k == "swish":
        return noise_sweep(0.32, 1200 * o.get("f", 1), 7000 * o.get("f", 1), 0.8), 0.32, 0.2
    if k == "swell":
        d = o.get("d", 0.5)
        return noise_sweep(d, 200, 3000, 1.0, "rise") + np.sin(2 * np.pi * np.cumsum(60 + 200 * (tt(d) / d) ** 2) / SR) * (tt(d) / d) ** 2 * 0.5, 0.5, 0.0
    if k == "riser":
        d = o.get("d", 0.6)
        t = tt(d)
        tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (2 * t / d)) / SR) * 0.35
        return (noise_sweep(d, 400, 9000, 0.7, "rise") + tone * (t / d) ** 2), 0.5, 0.0
    if k == "hit":
        g = o.get("g", 1.0)
        t = tt(0.6)
        boom = np.sin(2 * np.pi * np.cumsum(40 + 90 * np.exp(-t / 0.05)) / SR) * np.exp(-t / 0.25)
        crack = bp(rng.standard_normal(len(t)), 5000, 12000) * np.exp(-t / 0.03) * 0.35
        return np.tanh((boom + crack) * 1.5), 0.42 * g, 0.0
    if k == "tap":   # blødt anslag (soft-udgaven af "hit"): marimba-agtig tone
        t = tt(0.5)
        f = mtof(o.get("n", 76))
        s = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.16) + 0.3 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.03)
        s += hp(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.004) * 0.15
        return s * adsr(len(t), 0.001, 0.05), 0.2 * o.get("g", 1.0), 0.0
    if k == "bloom":   # soft-udgaven af "impact": lys akkord, der folder sig ud, uden sub-bas
        t = tt(2.6)
        s = sum(np.sin(2 * np.pi * mtof(m) * t) * (1.0 if m < 70 else 0.6) for m in (60, 64, 67, 71, 74, 79)) / 6
        s *= (1 - np.exp(-t / 0.05)) * np.exp(-t / 0.9)
        s[: int(1.2 * SR)] += noise_sweep(1.2, 7000, 2500, 0.8, "decay") * 0.2
        return s, 0.45, 0.0
    if k == "impact":
        t = tt(2.6)
        boom = np.sin(2 * np.pi * np.cumsum(34 + 110 * np.exp(-t / 0.08)) / SR) * np.exp(-t / 0.9)
        crash = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.7) * 0.35
        thud = lp(rng.standard_normal(len(t)), 300) * np.exp(-t / 0.08) * 0.8
        return np.tanh((boom * 1.2 + crash + thud) * 1.3), 0.85, 0.0
    if k == "fall":
        t = tt(0.75)
        f = 700 * 2 ** (-2.2 * t / 0.75)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.4) * (1 + 0.3 * np.sin(2 * np.pi * 18 * t))
        return s, 0.16, -0.5
    if k == "up":
        t = tt(0.7)
        f = 300 * 2 ** (2.2 * t / 0.7)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.7) ** 2
        return s * 0.4 + noise_sweep(0.7, 500, 6000, 0.8) * 0.8, 0.35, 0.4
    if k == "ding":
        t = tt(1.4)
        s = sum(a * np.sin(2 * np.pi * 1318.5 * r * t) * np.exp(-t / dcy) for r, a, dcy in [(1, 1, 0.6), (2.0, 0.4, 0.3), (2.76, 0.25, 0.2), (5.4, 0.1, 0.08)])
        return s, 0.14, 0.4
    if k == "ring":
        t = tt(1.0)
        gate = ((t % 0.5) < 0.38).astype(float) * np.clip(np.sin(np.pi * (t % 0.5) / 0.38) * 4, 0, 1)
        trill = np.where((t * 22) % 1 < 0.5, 1320, 1660)
        s = np.sin(2 * np.pi * np.cumsum(trill) / SR) * gate * np.exp(-t / 1.2)
        return lp(s, 5000), 0.09, 0.45
    if k == "notif":
        t = tt(0.9)
        s = np.sin(2 * np.pi * 1318.5 * t) * np.exp(-t / 0.25)
        s += np.where(t > 0.09, np.sin(2 * np.pi * 1975.5 * t) * np.exp(-(t - 0.09) / 0.35), 0)
        return s, 0.13, 0.45
    if k == "shine":
        t = tt(1.2)
        s = np.zeros_like(t)
        for j in range(9):
            o0 = j * 0.09
            f = 3000 + 3500 * rng.random()
            s += np.where(t >= o0, np.sin(2 * np.pi * f * (t - o0)) * np.exp(-np.clip(t - o0, 0, None) / 0.12), 0)
        return s / 3, 0.08, 0.0
    raise ValueError(k)


# ---------------------------------------------------------------- musik
CHORDS = {  # (bas-midi, akkordtoner)
    "Am": (45, [57, 60, 64, 71]),
    "F": (41, [53, 57, 60, 64]),
    "C": (48, [55, 60, 64, 67]),
    "G": (43, [55, 59, 62, 69]),
}
BARS = ["Am", "F", "C", "G", "Am", "F", "C", "G", "C", "F"]  # 2 s pr. takt


def music():
    mus = np.zeros((2, N + SR * 3))
    drums = np.zeros((2, N + SR * 3))
    K = kick()

    def active(t, a, b):
        return a <= t < b

    for bar, name in enumerate(BARS):
        b0 = bar * 2.0
        root, notes = CHORDS[name]
        # pad
        if bar < 8:
            gain = 0.18 if b0 < 6 else 0.22
            place_st(mus, pad_chord(notes, 2.4, 1500 if b0 < 6 else 2200), b0, gain)
        elif bar == 8:
            place_st(mus, pad_chord(notes + [72], 2.6, 2600), 15.98, 0.3)
        else:
            place_st(mus, pad_chord(notes, 1.3, 2200), 18.0, 0.24)
            place_st(mus, pad_chord(CHORDS["C"][1] + [72], 2.4, 2000), 19.0, 0.24)
        # bas i 8.-dele
        for s in range(8):
            t = b0 + s * 0.25
            if t < 1.0 or active(t, 5.86, 6.0) or active(t, 15.5, 16.0) or t >= 19.0:
                continue
            bright = 0.6 if t < 6 else 1.0
            m = root - 12 + (12 if s % 2 else 0) if t >= 6 else root - 12
            place(mus, bass_note(m + 12, 0.22, bright), t, 0.32 if t >= 6 else 0.24)
        # pluk-arpeggio i 16.-dele (scene 3 og 5)
        arp = [notes[0] + 12, notes[2] + 12, notes[1] + 12, notes[3] + 12]
        for s in range(16):
            t = b0 + s * 0.125
            if active(t, 6.0, 9.9) or active(t, 12.0, 15.45) or active(t, 16.5, 19.0):
                g = 0.07 if t < 16 else 0.05
                place(mus, pluck(arp[s % 4]), t, g, -0.35 if s % 2 else 0.35)

    # trommer
    for b in range(40):
        t = b * BEAT
        intro = t < 1.0
        light = 1.0 <= t < 6.0
        full = 6.0 <= t < 15.5
        outro = t >= 16.0
        if intro or active(t, 15.5, 16.0):
            continue
        if light and b % 2 == 0:
            place(drums, K, t, 0.55)
        if full:
            place(drums, K, t, 0.75)
        if outro and t < 19.0 and b % 2 == 0:
            place(drums, K, t, 0.45)
        if (full or (3.3 <= t < 6.0)) and b % 2 == 1:
            place(drums, clap(), t, 0.32, 0.05)
        for h in range(4 if full else 2):
            th = t + h * (BEAT / (4 if full else 2))
            if (light or full or (outro and th < 19.0)) and th < DUR:
                open_ = full and h == 2
                place(drums, hat(open_), th, (0.16 if open_ else 0.11) * (1.0 if h % 2 == 0 else 0.7), 0.3)
    # trommehvirvel op til drop
    for i in range(8):
        t = 5.45 + i * 0.0625 * (1 - i * 0.04)
        place(drums, clap(), t, 0.08 + 0.03 * i, 0.0)

    # sidechain fra kick: dup musikken kort efter hvert kickslag
    sc = np.ones(mus.shape[1])
    for b in range(40):
        t = b * BEAT
        if t >= 6.0 and t < 15.5:
            i = int(t * SR)
            d = tt(0.22)
            sc[i:i + len(d)] = np.minimum(sc[i:i + len(d)], 1 - 0.55 * np.exp(-d / 0.07))
    mus *= sc
    mus = reverb(mus, 0.3)
    drums = reverb(drums, 0.08)
    return (mus + drums)[:, :N]


def music_soft():
    """Rolig udgave: samme akkorder og tempo, men ingen stortromme, clap eller sidechain."""
    mus = np.zeros((2, N + SR * 3))
    perc = np.zeros((2, N + SR * 3))
    for bar, name in enumerate(BARS):
        b0 = bar * 2.0
        root, notes = CHORDS[name]
        if bar < 8:
            place_st(mus, pad_chord(notes, 2.4, 1400 if b0 < 6 else 1900), b0, 0.2)
        elif bar == 8:
            place_st(mus, pad_chord(notes + [72], 2.6, 2200), 15.98, 0.26)
        else:
            place_st(mus, pad_chord(notes, 1.3, 1900), 18.0, 0.22)
            place_st(mus, pad_chord(CHORDS["C"][1] + [72], 2.4, 1800), 19.0, 0.22)
        # blød, liggende bas – én tone pr. takt, så den ikke pulserer
        t = max(b0, 1.0)
        end = min(b0 + 2.0, 15.5 if b0 < 16 else 19.0)
        place(mus, soft_bass(root, end - t), t, 0.2 if t < 6 else 0.26)
        # klokke-arpeggio: fjerdedele i starten, ottendedele fra scene 2
        arp = [notes[0] + 12, notes[2] + 12, notes[1] + 12, notes[3] + 12]
        for s in range(8):
            t = b0 + s * 0.25
            if t < 1.0 or 15.45 <= t < 16.5 or t >= 19.0 or (t < 3.3 and s % 2):
                continue
            place(mus, bell(arp[s % 4]), t, 0.05 if t < 16 else 0.04, -0.35 if s % 2 else 0.35)
    # shaker i 16.-dele og fingerknips på 2 og 4
    for i in range(160):
        t = i * 0.125
        if 3.3 <= t < 15.5 or (16.0 <= t < 19.0 and i % 2 == 0):
            place(perc, shaker(1.0 if i % 2 == 0 else 0.55), t, 0.07 if t >= 6.0 else 0.05, 0.3)
    for b in range(40):
        t = b * BEAT
        if 6.0 <= t < 15.5 and b % 2 == 1:
            place(perc, snap(), t, 0.12, -0.1)
    mus = reverb(mus, 0.35)
    perc = reverb(perc, 0.12)
    return (mus + perc)[:, :N]


# ---------------------------------------------------------------- speak
def voice(cues):
    vo = np.zeros((2, N))
    for key, c in cues.items():
        src = AUD / "vo" / f"{key}.wav"
        proc = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(src), "-af",
             "highpass=f=85,equalizer=f=280:t=q:w=1.2:g=-2.5,equalizer=f=3400:t=q:w=1.4:g=3,"
             "equalizer=f=9000:t=h:w=1:g=2,acompressor=threshold=-22dB:ratio=3:attack=4:release=90:makeup=3",
             "-ar", str(SR), "-ac", "1", "-f", "f32le", "-"],
            check=True, capture_output=True)
        x = np.frombuffer(proc.stdout, dtype=np.float32).astype(np.float64)
        place(vo, x, c["clip"], 1.0, 0.0)
    return vo


def duck_env(vo, depth_db=8.0):
    m = np.abs(vo).max(axis=0)
    win = int(0.03 * SR)
    rms = np.sqrt(np.convolve(m ** 2, np.ones(win) / win, mode="same"))
    on = (rms > 0.02).astype(float)
    # attack 30 ms, release 300 ms
    env = np.zeros_like(on)
    a, r = np.exp(-1 / (0.03 * SR)), np.exp(-1 / (0.3 * SR))
    e = 0.0
    for i, v in enumerate(on):  # (960k samples – hurtigt nok)
        e = a * e + (1 - a) * v if v > e else r * e + (1 - r) * v
        env[i] = e
    return 10 ** (-depth_db * env / 20)


def main():
    cues = build_cues(VARIANT)
    sfx_events = json.loads((AUD / "sfx.json").read_text())

    mus = music_soft() if MOOD == "soft" else music()
    sfx = np.zeros((2, N + SR * 3))
    for ev in sfx_events:
        s, g, pan = sfx_sound(ev)
        place(sfx, s, ev["t"], g, pan)
    sfx = reverb(sfx, 0.18)[:, :N]
    vo = voice(cues)

    duck = duck_env(vo, 9.0)
    sduck = duck_env(vo, 4.0)
    mus = mus * (0.75 if MOOD == "soft" else 0.62) * duck   # soft-musikken mangler trommernes energi
    sfx = sfx * 0.75 * sduck
    mix = mus + sfx + vo
    # blød fade i de sidste 0,5 s
    fade = np.ones(N)
    fade[-int(0.5 * SR):] = np.linspace(1, 0, int(0.5 * SR)) ** 1.5
    mix *= fade

    def db(x):
        return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)

    print(f"rms  music {db(mus):.1f} dB  sfx {db(sfx):.1f} dB  vo {db(vo):.1f} dB  mix {db(mix):.1f} dB  peak {20*np.log10(np.abs(mix).max()):.1f} dB")
    for name, st in (("music", mus), ("sfx", sfx), ("vo", vo)):
        wavfile.write(AUD / f"stem_{name}.wav", SR, (np.clip(st.T, -1, 1) * 32767).astype(np.int16))
    mix /= max(1.0, np.abs(mix).max() / 0.95)
    wavfile.write(AUD / "mix_raw.wav", SR, (mix.T * 32767).astype(np.int16))

    # loudness: to-trins loudnorm til -14 LUFS / -1 dBTP (sociale medier)
    meas = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(AUD / "mix_raw.wav"), "-af",
                           "loudnorm=I=-14:TP=-1.0:LRA=9:print_format=json", "-f", "null", "-"],
                          capture_output=True, text=True).stderr
    j = json.loads(meas[meas.rindex("{"):meas.rindex("}") + 1])
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(AUD / "mix_raw.wav"), "-af",
                    f"loudnorm=I=-14:TP=-1.0:LRA=9:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
                    f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true",
                    "-ar", str(SR), str(AUD / "mix.wav")], check=True)
    print("loudnorm in:", j["input_i"], "LUFS → -14 LUFS")


if __name__ == "__main__":
    main()
