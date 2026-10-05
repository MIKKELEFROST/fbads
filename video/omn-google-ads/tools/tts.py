"""Generér dansk speak (Microsoft Edge neural TTS, stemme da-DK-JeppeNeural).

    python3 tools/tts.py v2         → audio/v2/vo/<klip>.mp3 + words.json
    python3 tools/measure.py v2     → audio/v2/vo/<klip>.wav + spans.json

Kræver `pip install edge-tts`. Bag en TLS-proxy: sæt CA_BUNDLE til proxyens CA-fil.
"""
import asyncio
import json
import os

import certifi

if os.environ.get("CA_BUNDLE"):
    certifi.where = lambda: os.environ["CA_BUNDLE"]
import edge_tts  # noqa: E402

import variant  # noqa: E402

P = variant.paths(variant.name())
OUT = P["vo"]
LINES = json.loads(P["lines"].read_text())
VOICE = "da-DK-JeppeNeural"


async def gen(key, text, rate, pitch):
    c = edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch, boundary="WordBoundary")
    words = []
    with open(OUT / f"{key}.mp3", "wb") as f:
        async for chunk in c.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"w": chunk["text"], "t": chunk["offset"] / 1e7, "d": chunk["duration"] / 1e7})
    return key, words


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    res = await asyncio.gather(*[gen(k, v["text"], v.get("rate", "+0%"), v.get("pitch", "+0Hz")) for k, v in LINES.items()])
    (OUT / "words.json").write_text(json.dumps(dict(res), ensure_ascii=False, indent=1))


asyncio.run(main())
