# Hjemmeside-promo: motion graphic (16,9 s)

Motion graphics-annonce for et firma, der laver hjemmesider til håndværkere og servicevirksomheder.
Dansk med dansk speak er standard, og en engelsk version kan renderes med `--lang=en`. Brandet
**sitecrew** og eksempel-kunden **Nordflow VVS** er pladsholdere. Tekst, farver og brand ligger samlet
i én fil.

| Fil | Hvad |
| --- | --- |
| `out/website-promo-da-1920x1080.mp4` | 16:9 · H.264 High · 60 fps · AAC 48 kHz · 16,9 s · med dansk speak |
| `out/website-promo-da-1080x1920.mp4` | 9:16 til Reels / Stories / TikTok |
| `out/poster-da-1920x1080.png`, `out/poster-da-1080x1920.png` | Slutbillede til thumbnails |
| `out/soundtrack-da.wav` | Musik, lyddesign og dansk speak (−14 LUFS) |
| `out/soundtrack.wav` | Musik og lyddesign uden tale (−14 LUFS), til andre sprog som den engelske version |
| `vo/da/` | Speaken: én WAV pr. replik og `cues.json` med tekst og tidspunkter |

## Storyboard

Alt ligger på et 128 BPM-grid (1 slag = 0,469 s), så hvert klip og hver lydeffekt rammer musikken.
Problem-scenen har fået 2 sekunder ekstra i forhold til den første 15 s-version, så den danske
tekst kan nå at blive læst.

| Tid | Scene | På skærmen | Speak |
| --- | --- | --- | --- |
| 0,0–1,9 s | Hook | "Hjemmesider til" VVS’ERE. / ELEKTRIKERE. / MALERE. / TØMRERE. Ét fag pr. slag med farve-wipes, og til sidst zoomer kameraet gennem punktummet. | "Er du håndværker?" |
| 1,9–5,6 s | Problem | "Dit arbejde får 5 stjerner." Så falder fire stjerner af: "Din hjemmeside? Knap så mange." | "Dit arbejde får fem stjerner. Din hjemmeside? Knap så mange." |
| 5,6–9,4 s | Løsning | Hazard-wipe og "OMBYGNING I GANG"-tape, derefter "Vi bygger en ny." En VVS-hjemmeside bygger sig selv op fra wireframes med callouts (Klar til Google, Lynhurtig, Online booking, Mobilvenlig), og der bliver klikket på *Book tid*. | "Vi bygger en ny." |
| 9,4–13,1 s | Gevinst | Browseren bliver til en telefon: "Du får opkaldene." Telefonen ringer, og bookinger, tilbudsforespørgsler og anmeldelser tikker ind. | "Så du får opkaldene." |
| 13,1–16,9 s | Slutbillede | Logo, "Hjemmesider, der skaffer flere opgaver.", knappen *Få en gratis demo* og et rullende bånd med fag. | "Hjemmesider, der skaffer flere opgaver. Få en gratis demo." (slutslaget lander på "demo") |

## Speak

Den danske speak er AI-genereret med [Røst-v3-chatterbox-500m](https://huggingface.co/CoRal-project/roest-v3-chatterbox-500m),
Alexandra Instituttets danske udgave af Resemble AI's Chatterbox fra CoRal-projektet. Den bruger modellens
indbyggede stemme, så det er ikke en kopi af en rigtig persons stemme. Hver replik er valgt blandt flere
bud. To talegenkendere (CoRal's danske Røst og Whisper) skulle høre præcis den rigtige tekst og genkende
sproget som dansk. Den danske talegenkender kan også genkende replikkerne direkte fra det færdige mix med
musikken under. Lyt den alligevel igennem, før annoncen går live.

Musikken dukker sig under stemmen: 5–8 dB, og 6 dB ekstra i 1,5–6 kHz-båndet, hvor konsonanterne ligger.
Stemmen ligger mindst 10 dB over musikken. Tidspunkterne står i sekunder i
[`vo/da/cues.json`](vo/da/cues.json) (`at`) og følger teksten på skærmen.

Sådan retter du en replik:

1. Ret `text` i `vo/da/cues.json`. Skift `seed` for at få en anden oplæsning af samme tekst.
2. Generér replikken igen (kræver PyTorch og kører fint på CPU, ca. 15 s pr. replik):
   ```bash
   python3 -m venv .venv-tts
   .venv-tts/bin/pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
   .venv-tts/bin/pip install chatterbox-tts==0.1.7
   .venv-tts/bin/python tools/make_vo.py --only=l3
   ```
3. Kør `npm run audio` og derefter `npm run remux`. Så får de færdige videoer det nye lydspor uden at
   blive renderet forfra.

Licenser: Chatterbox er MIT-licenseret. Røst-modellen har Alexandra Instituttets licens baseret på
OpenRAIL-M, som tillader kommerciel brug, men forbyder blandt andet vildledning og at efterligne rigtige
personers stemmer uden samtykke. Lyden har et uhørligt vandmærke (Perth), der viser, at den er
AI-genereret.

## Ret tekst, brand eller sprog

Alt tekst ligger i [`src/config.js`](src/config.js) (dansk) og [`src/config.en.js`](src/config.en.js)
(engelsk). Det gælder brandnavn, tagline, CTA, en valgfri URL, farver, alle replikker, notifikationerne
og eksempel-hjemmesiden. `*ord*` giver accentfarve, `\n` tvinger et linjeskift, og `|` skifter kun
linje i 9:16. Hold linjerne nogenlunde så lange som nu, for timingen ligger fast på beatet. For lange
overskrifter bliver automatisk skaleret ned, så de passer. Speaken ligger for sig i `vo/da/` (se
[Speak](#speak)), så ret den med, hvis du ændrer teksten på skærmen.

## Preview og rendering

Krav: Node 18+, Python 3 med `numpy` og `scipy` (kun til lydsporet) og en `ffmpeg` med libx264 på
`PATH` (eller `FFMPEG=/sti/til/ffmpeg`).

```bash
npm install                      # Playwright. Kør `npx playwright install chromium`, hvis der ikke er en browser
npm run preview                  # live preview i browseren med tidslinje (mellemrum = afspil/pause)
npm run audio                    # out/soundtrack.wav (kun musik) og out/soundtrack-da.wav (med speak)
npm run render                   # out/website-promo-da-1920x1080.mp4
npm run render:portrait          # out/website-promo-da-1080x1920.mp4
npm run remux                    # nyt lydspor i de færdige danske videoer, uden at rendere billederne igen
npm run posters                  # slutbilleder til thumbnails (out/poster-da-*.png)
npm run render:en                # engelsk version i begge formater (out/website-promo-en-*.mp4)
npm run stills                   # PNG-stills i out/stills/ til hurtige tjek
```

`tools/render.mjs` går billede for billede gennem siden i headless Chromium (`window.__seek(t)`).
Hvert billede er et gennemsnit af 4 delbilleder, hvilket giver motion blur. Under de hurtigste
bevægelser (wipes, zoom, tape og bjælker) bruges 16 delbilleder. De tidsintervaller står i
`__meta.blur` i `src/main.js`. Til sidst encoder ffmpeg videoen. En fuld rendering tager nogle
minutter pr. format. `--samples=1` slår motion blur fra til hurtige kladder, og `--fps=30` giver en
30 fps-version.

## Sådan er den bygget

- `src/main.js`: hele animationen. Hver scene er en ren funktion af tiden, og der bruges ingen
  CSS-animationer, så hvert billede renderes ens hver gang.
- `src/anim.js`: easing, springs og keyframes.
- `tools/make_audio.py`: musik og lydeffekter syntetiseret i numpy/scipy på samme beat-grid (kick,
  snare, hats, bas, pads, plucks, stjerne-blips, tape-rip, UI-pops, telefonsummen, notifikationslyde
  og et slutslag). Der bruges ingen samples, så der er ingen musikrettigheder at tage hensyn til. Med
  `--vo=vo/da` lægger den speaken på, dukker musikken og masterer det hele til −14 LUFS.
- `tools/make_vo.py`: genererer og trimmer speak-replikkerne ud fra `vo/da/cues.json`.

Kreditering: skrifttyperne Archivo, Inter og JetBrains Mono (SIL OFL 1.1, se
`src/fonts/LICENSE.txt`) og ikoner fra [Lucide](https://lucide.dev) (ISC).
