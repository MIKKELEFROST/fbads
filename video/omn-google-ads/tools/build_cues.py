"""Placer speak-klippene på tidslinjen og skriv cues.js til animationen.

PLACEMENT angiver, hvornår talen i hvert klip skal starte (sekunder i videoen).
Både animationen (cues.js) og lydmixet (mix_audio.py) læser herfra, så billede
og stemme altid er i sync.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VO = ROOT / "audio" / "vo"

PLACEMENT = {
    "l1": 0.55,   # Lige nu søger nogen på Google efter en tømrer i nærheden.
    "l2": 3.55,   # Finder de dig – eller din konkurrent?
    "l3": 5.85,   # Med Google Ads fra O M N står du øverst – præcis når kunden søger.
    "t1": 10.00,  # Tømrer.
    "t2": 10.50,  # Maler.
    "t3": 11.00,  # Murer.
    "t4": 11.50,  # VVS.
    "f1": 12.50,  # Flere opkald.
    "f2": 13.50,  # Flere tilbud.
    "f3": 14.50,  # Flere opgaver.
    "l6": 16.25,  # O M N – Online Marketing Nu.
}


def build():
    words = json.loads((VO / "words.json").read_text())
    spans = json.loads((VO / "spans.json").read_text())
    cues = {}
    for key, speech_at in PLACEMENT.items():
        clip_start = speech_at - spans[key]["start"]
        cues[key] = {
            "clip": round(clip_start, 3),
            "start": round(speech_at, 3),
            "end": round(clip_start + spans[key]["end"], 3),
            "words": [{"w": w["w"].strip(".,"), "t": round(clip_start + w["t"], 3)} for w in words[key]],
        }
    return cues


if __name__ == "__main__":
    cues = build()
    (ROOT / "cues.js").write_text("window.CUES = " + json.dumps(cues, ensure_ascii=False, indent=1) + ";\n")
    for k, c in cues.items():
        print(k, c["start"], "->", c["end"], " ".join(f"{w['w']}@{w['t']}" for w in c["words"]))
