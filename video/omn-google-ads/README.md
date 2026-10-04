# OMN – Google Ads til håndværkere (20 sek. motion graphics)

Færdig film: [`out/omn-google-ads-20s-1080p.mp4`](out/omn-google-ads-20s-1080p.mp4) – 1920×1080, 30 fps,
H.264 + AAC, 20,0 sek., -14 LUFS (klar til Meta/YouTube/LinkedIn).

## Manus (dansk speak)

| Tid | Speak | Billede |
|---|---|---|
| 0–3,3 | Lige nu søger nogen på Google efter en tømrer i nærheden. | Fire Google-prikker → søgefelt, der skriver "tømrer i nærheden", autoudfyld |
| 3,3–5,9 | Finder de dig – eller din konkurrent? | Søgeresultater i 3D; "DIG?" / "KONKURRENT?", din annonce falder ud |
| 5,9–10 | Med Google Ads fra OMN står du øverst – præcis når kunden søger. | Google-farvebånd, "Google Ads fra OMN", din annonce ryger til #1, markør klikker "Ring nu" |
| 10–12 | Tømrer. Maler. Murer. VVS. | Fuldskærms-fag i de fire Google-farver |
| 12–15,9 | Flere opkald. Flere tilbud. Flere opgaver. | Telefon med opkald/forespørgsler, stigende graf, fag-ticker |
| 15,9–20 | O M N – Online Marketing Nu. | Logo, farvebjælker, søgefelt med onlinemarketing.nu |

Stemme: Microsoft neural TTS `da-DK-JeppeNeural`. Musik og lydeffekter er syntetiseret i
`tools/mix_audio.py` – ingen licenserede samples. Fonte: Inter Tight og JetBrains Mono (OFL).
Kunderne i søgeresultaterne er fiktive ("Konkurrent ApS" osv.), og Googles logo er ikke brugt –
kun farverne og søge-/annonceuniverset.

## Sådan laves filmen

Filmen er én GSAP-tidslinje i `index.html` + `timeline.js`. `window.seek(t)` tegner præcis
billedet til tiden `t`, og `tools/render.cjs` tager et skærmbillede pr. frame i headless Chromium.

```bash
pip install edge-tts numpy scipy          # + ffmpeg, node, playwright
cd video/omn-google-ads

# 1. Speak (kun hvis tools/lines.json ændres)
python3 tools/tts.py && python3 tools/measure.py
python3 tools/build_cues.py               # placering af replikker → cues.js

# 2. Lydeffekt-tidspunkter fra animationen + lydmix
node tools/render.cjs --sfx audio/sfx.json
python3 tools/mix_audio.py                # → audio/mix.wav

# 3. Billeder (60 fps) og encode (2-frame motion blur → 30 fps)
node tools/render.cjs --out /tmp/frames --fps 60 --workers 4
ffmpeg -framerate 60 -i /tmp/frames/f%05d.png -i audio/mix.wav \
  -filter_complex "[0:v]tmix=frames=2:weights='1 1',fps=30,format=yuv420p[v]" -map "[v]" -map 1:a \
  -c:v libx264 -preset slow -crf 16 -tune animation -movflags +faststart -c:a aac -b:a 256k -shortest \
  out/omn-google-ads-20s-1080p.mp4
```

Forhåndsvisning i browser: server mappen (`npx serve .`) og åbn `index.html?play`, eller
`index.html?t=7.9` for et enkelt billede.

Ret tekst/timing: replikkernes starttider står i `tools/build_cues.py` (`PLACEMENT`), og
animationen følger automatisk med, fordi den læser ordtiderne fra `cues.js`.
