"""Placer speak-klippene på tidslinjen og skriv variants/<v>/cues.js til animationen.

"at" i variants/<v>/lines.json angiver, hvornår talen i hvert klip skal starte
(sekunder i videoen). Både animationen (cues.js) og lydmixet (mix_audio.py) læser
herfra, så billede og stemme altid er i sync.

    python3 tools/build_cues.py v2
"""
import json

import variant


def build(v):
    P = variant.paths(v)
    lines = json.loads(P["lines"].read_text())
    words = json.loads((P["vo"] / "words.json").read_text())
    spans = json.loads((P["vo"] / "spans.json").read_text())
    cues = {}
    for key, line in lines.items():
        speech_at = line["at"]
        clip_start = speech_at - spans[key]["start"]
        cues[key] = {
            "clip": round(clip_start, 3),
            "start": round(speech_at, 3),
            "end": round(clip_start + spans[key]["end"], 3),
            "words": [{"w": w["w"].strip(".,?"), "t": round(clip_start + w["t"], 3)} for w in words[key]],
        }
    return cues


if __name__ == "__main__":
    v = variant.name()
    cues = build(v)
    variant.paths(v)["cues"].write_text("window.CUES = " + json.dumps(cues, ensure_ascii=False, indent=1) + ";\n")
    prev_end = 0
    for k, c in cues.items():
        warn = "  << overlapper forrige klip" if c["start"] < prev_end else ""
        print(f"{k:3s} {c['start']:6.2f} -> {c['end']:6.2f}  " + " ".join(f"{w['w']}@{w['t']}" for w in c["words"]) + warn)
        prev_end = c["end"]
