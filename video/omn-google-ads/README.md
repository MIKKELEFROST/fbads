# OMN – Google Ads til håndværkere (20 sek. motion graphics)

Testversioner af samme film. Alle er 20,0 sek., 30 fps, H.264 + AAC og -14 LUFS, med hvid,
clean stil, dansk speak, musik og lydeffekter:

| Version | Hook | 9:16 (Reels, Stories, TikTok, Shorts) | 16:9 (YouTube, LinkedIn, feed) |
|---|---|---|---|
| v1 | "Lige nu søger nogen på Google efter en tømrer i nærheden." | [`out/omn-google-ads-v1-9x16.mp4`](out/omn-google-ads-v1-9x16.mp4) | [`out/omn-google-ads-v1-16x9.mp4`](out/omn-google-ads-v1-16x9.mp4) |
| v2 | "Bliver du fundet, når nogen søger efter en lokal tømrer?" | [`out/omn-google-ads-v2-9x16.mp4`](out/omn-google-ads-v2-9x16.mp4) | [`out/omn-google-ads-v2-16x9.mp4`](out/omn-google-ads-v2-16x9.mp4) |
| v3 | "Er du maler?" – hele filmen handler om malere | [`out/omn-google-ads-v3-9x16.mp4`](out/omn-google-ads-v3-9x16.mp4) | [`out/omn-google-ads-v3-16x9.mp4`](out/omn-google-ads-v3-16x9.mp4) |
| v4 | "Er du tømrer?" – hele filmen handler om tømrere | [`out/omn-google-ads-v4-9x16.mp4`](out/omn-google-ads-v4-9x16.mp4) | [`out/omn-google-ads-v4-16x9.mp4`](out/omn-google-ads-v4-16x9.mp4) |

I 9:16 ligger tekst og vigtige elementer mellem ca. 250 og 1500 px fra toppen, så de ikke
dækkes af appens knapper.

## Manus

Scenerne og tiderne er de samme i alle versioner; speak og skærmtekst skifter.

| Tid | Scene | v1 speak | v2 speak |
|---|---|---|---|
| 0–3,3 | Søgefelt + autoudfyld | Lige nu søger nogen på Google efter en tømrer i nærheden. | Bliver du fundet, når nogen søger efter en lokal tømrer? |
| 3,3–5,9 | Søgeresultater, din annonce falder ud | Finder de dig – eller din konkurrent? | Lige nu går opgaven til din konkurrent. |
| 5,9–10 | Annoncen ryger til #1, klik på "Ring nu" | Med Google Ads fra OMN står du øverst – præcis når kunden søger. | Med Google Ads fra OMN kommer du øverst – og det er dig, de ringer til. |
| 10–12 | Fagene i fuld skærm | Tømrer. Maler. Murer. VVS. | (samme) |
| 12–15,9 | Telefon, notifikationer, graf | Flere opkald. Flere tilbud. Flere opgaver. | (samme) |
| 15,9–20 | Logo og onlinemarketing.nu | O M N – Online Marketing Nu. | O M N – Google Ads til håndværkere. |

### v3 og v4 – ét fag i fokus

v3 (maler) og v4 (tømrer) har samme manus, så de kan testes direkte mod hinanden; kun faget
skifter. Søgning, autoudfyld, søgeresultater, opgaverne i scene 4, notifikationen, tickeren og
slutkortet følger faget.

| Tid | v3 – maler | v4 – tømrer |
|---|---|---|
| 0–3,3 | Er du maler? Dine næste kunder søger på Google. | Er du tømrer? Dine næste kunder søger på Google. |
| 3,3–5,9 | Men lige nu går opgaven til din konkurrent. | (samme) |
| 5,9–10 | Med Google Ads fra OMN kommer du øverst – og det er dig, de ringer til. | (samme) |
| 10–12 | Vægge. Lofter. Vinduer. Facader. | Tag. Gulve. Vinduer. Terrasse. |
| 12–15,9 | Flere opkald. Flere tilbud. Flere opgaver. | (samme) |
| 15,9–20 | O M N – Google Ads til malere. | O M N – Google Ads til tømrere. |

Stemme: Microsoft neural TTS `da-DK-JeppeNeural`. Musik og lydeffekter er syntetiseret i
`tools/mix_audio.py` – ingen licenserede samples. Fonte: Inter Tight og JetBrains Mono (OFL).
Konkurrenterne i søgeresultaterne er fiktive ("Konkurrent ApS" osv.), og Googles logo er ikke
brugt – kun farverne og søge-/annonceuniverset.

## Opbygning

Filmen er én GSAP-tidslinje i `index.html` + `timeline.js`. `window.seek(t)` tegner præcis
billedet til tiden `t`, og `tools/render.cjs` tager et skærmbillede pr. frame i headless Chromium.
`index.html?v=v2` vælger version, `&f=916` vælger det lodrette format.

En version er en mappe i `variants/`:

- `lines.json` – manus: tekst, taletempo og starttid (`at`, sekunder) for hvert speak-klip
- `copy.js` – teksterne på skærmen og hvilke ord i speaken de følger. Ud over overskrifterne kan
  en version også skifte baggrundsteksten i scene 1 (`s1.mq`), søgeresultaterne (`serp`),
  panelerne i scene 4 (`s4.panels`: ord, ikon og søgning), notifikation og ticker (`s5`) og
  topteksten (`hud`); mangler et felt, bruges teksten i `index.html`. Se `variants/v3/copy.js`.
  Ikonerne til scene 4 vælges med navn fra `ICONS` øverst i `timeline.js`.
- `cues.js` – ordtider, genereres af `tools/build_cues.py`

Et speak-klip kan deles i flere (v3/v4 har `l1` + `l1b`), hvis pausen efter et spørgsmål bliver
for lang. Lyd for versionen ligger i `audio/<v>/`. Scene 3 forudsætter, at klip `l3` begynder med "Med
Google Ads fra O M N", og logoet, at `l6` begynder med "O M N".

## Ny version

Kopiér fx `variants/v3` til `variants/v5`, ret `lines.json` og `copy.js`, og kør:

```bash
pip install edge-tts numpy scipy          # + ffmpeg, node, playwright
cd video/omn-google-ads
V=v5

# 1. Speak og ordtider (build_cues advarer, hvis to klip overlapper)
(cd tools && CA_BUNDLE=... python3 tts.py $V && python3 measure.py $V && python3 build_cues.py $V)

# 2. Lydeffekt-tidspunkter fra animationen + lydmix → audio/$V/mix.wav
node tools/render.cjs --variant $V --sfx audio/$V/sfx.json
(cd tools && python3 mix_audio.py $V)

# 3. Billeder (60 fps) og encode (2-frame motion blur → 30 fps) – for 9:16 tilføj --format 916
node tools/render.cjs --variant $V --out /tmp/frames --fps 60 --workers 4
ffmpeg -framerate 60 -i /tmp/frames/f%05d.png -i audio/$V/mix.wav \
  -filter_complex "[0:v]tmix=frames=2:weights='1 1',fps=30,format=yuv420p[v]" -map "[v]" -map 1:a \
  -c:v libx264 -preset slow -crf 16 -tune animation -movflags +faststart -c:a aac -b:a 256k -shortest \
  out/omn-google-ads-$V-16x9.mp4
```

Forhåndsvisning i browser: server mappen (`npx serve .`) og åbn `index.html?v=v2&play`, eller
`index.html?v=v2&t=7.9` for et enkelt billede.
