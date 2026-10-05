"""Mål hvor talen starter/slutter i hvert speak-klip (RMS-tærskel) → audio/<variant>/vo/spans.json."""
import json
import subprocess

import numpy as np
import scipy.io.wavfile as w

import variant

VO = variant.paths(variant.name())["vo"]
res = {}
for f in sorted(VO.glob("*.mp3")):
    k = f.stem
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-ar", "48000", "-ac", "1", str(VO / f"{k}.wav")], check=True)
    sr, x = w.read(VO / f"{k}.wav")
    x = x.astype(np.float32) / 32768
    n = sr // 100
    fr = np.sqrt(np.mean(x[: len(x) // n * n].reshape(-1, n) ** 2, axis=1))
    on = np.where(fr > 0.008)[0]
    s, e = on[0] / 100, (on[-1] + 1) / 100
    res[k] = {"total": len(x) / sr, "start": s, "end": e}
    print(f"{k:4s} total {len(x)/sr:5.2f}  speech {s:.2f}-{e:.2f}  ({e-s:.2f}s)")
(VO / "spans.json").write_text(json.dumps(res, indent=1))
