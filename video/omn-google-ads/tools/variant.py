"""Stier for en filmversion (variant). Første argument på kommandolinjen er varianten, fx v2.

    variants/<v>/lines.json   manus: tekst, taletempo og starttid ("at") pr. speak-klip
    variants/<v>/copy.js      tekster på skærmen og hvilke ord de følger
    variants/<v>/cues.js      genereret af build_cues.py
    audio/<v>/                speak-klip, sfx.json og lydmix
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def name(argv=None):
    argv = sys.argv if argv is None else argv
    return argv[1] if len(argv) > 1 else "v1"


def paths(v):
    aud = ROOT / "audio" / v
    return {
        "lines": ROOT / "variants" / v / "lines.json",
        "cues": ROOT / "variants" / v / "cues.js",
        "aud": aud,
        "vo": aud / "vo",
    }


def mood(v):
    """Stemning fra copy.js: mood: 'soft' giver blød musik og bløde anslag, ellers standard ("punch")."""
    m = re.search(r"\bmood:\s*'(\w+)'", (ROOT / "variants" / v / "copy.js").read_text())
    return m.group(1) if m else "punch"
