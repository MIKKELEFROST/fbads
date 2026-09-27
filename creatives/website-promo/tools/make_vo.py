#!/usr/bin/env python3
"""
Generates the voice-over lines listed in vo/<lang>/cues.json and writes one trimmed WAV per line next to
cues.json. make_audio.py --vo=vo/<lang> then places each line on its beat and ducks the music under it.

The Danish lines use Røst-v3-chatterbox-500m (the Alexandra Institute's Danish fine-tune of Resemble AI's
Chatterbox, from the CoRal project) in its built-in voice. The finished WAVs are committed, so this only
has to run when a line changes. It needs PyTorch and runs fine on a CPU (about 15 s per line):

    python3 -m venv .venv-tts
    .venv-tts/bin/pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
    .venv-tts/bin/pip install chatterbox-tts==0.1.7
    .venv-tts/bin/python tools/make_vo.py                  # every line in vo/da/cues.json
    .venv-tts/bin/python tools/make_vo.py --only=l3,l4     # just these lines

Each line has its own seed and `cfg` (pacing: lower is slower), and the same seed gives the same take on
the same setup, so to try another read of a line, change its seed and listen. Takes sometimes end with a
breath or a mumble after the words; everything after the first pause longer than 0.35 s is cut, and
`keep: [start, end]` (seconds in the raw take) overrides that. Chatterbox marks its output with an
inaudible Perth watermark.
"""
import argparse
import json
import os

import numpy as np
import torch
import torchaudio
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from huggingface_hub import snapshot_download

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--dir', default='vo/da', help='folder with cues.json (default vo/da)')
ap.add_argument('--only', help='comma-separated line ids to (re)generate')
args = ap.parse_args()
folder = os.path.join(HERE, '..', args.dir)
cues = json.load(open(os.path.join(folder, 'cues.json'), encoding='utf-8'))
only = set(args.only.split(',')) if args.only else None


def trim(y, sr, keep=None, floor_db=-35, gap=0.35, blip=0.05, pre=0.03, post=0.08):
    """Keep the words: from the first speech to the first pause longer than `gap`. Speech = 10 ms frames within
    floor_db of the loudest, in runs of at least `blip` seconds (shorter clicks around the words are dropped)."""
    if keep:
        a, z = int(keep[0] * sr), int(keep[1] * sr)
    else:
        hop = int(0.01 * sr)
        rms = np.sqrt(np.convolve(y ** 2, np.ones(2 * hop) / (2 * hop), 'same')[::hop])
        on = np.flatnonzero(np.diff(np.concatenate([[0], rms > rms.max() * 10 ** (floor_db / 20), [0]]).astype(int)))
        runs = [(s, e) for s, e in zip(on[::2], on[1::2]) if e - s >= blip * 100]  # [start, end) in frames
        s0, e0 = runs[0]
        for s, e in runs[1:]:
            if s - e0 > gap * 100:
                break
            e0 = e
        a, z = max(0, s0 * hop - int(pre * sr)), min(len(y), e0 * hop + int(post * sr))
    y = y[a:z].copy()
    n_in, n_out = int(0.005 * sr), int(0.03 * sr)
    y[:n_in] *= np.linspace(0, 1, n_in)
    y[-n_out:] *= np.linspace(1, 0, n_out)
    return y


torch.set_num_threads(os.cpu_count() or 4)
device = 'cuda' if torch.cuda.is_available() else 'cpu'
files = ['ve.pt', 't3_mtl23ls_v2.safetensors', 's3gen.pt', 'grapheme_mtl_merged_expanded_v1.json', 'conds.pt', 'Cangjie5_TC.json']
model = ChatterboxMultilingualTTS.from_local(snapshot_download(cues['model'], allow_patterns=files), device=device)
for ln in cues['lines']:
    if only and ln['id'] not in only:
        continue
    torch.manual_seed(ln['seed'])
    wav = model.generate(ln['text'], language_id=cues['lang'], cfg_weight=ln['cfg'],
                         temperature=ln.get('temperature', cues.get('temperature', 0.7)), top_p=cues.get('top_p', 0.95))
    y = trim(wav[0].numpy().astype(np.float64), model.sr, ln.get('keep'))
    y = y / np.max(np.abs(y)) * 0.89
    path = os.path.join(folder, ln['file'])
    torchaudio.save(path, torch.from_numpy(y).float().unsqueeze(0), model.sr, encoding='PCM_S', bits_per_sample=16)
    print(f"{os.path.normpath(path)}  {len(y) / model.sr:.2f}s  “{ln['text']}”")
