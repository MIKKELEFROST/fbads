# Døgnet rundt: illustreret annonce (15 s, 9:16)

En filmisk gadescene fra kl. 17 til næste morgen. Elektrikeren har fri og går i seng, men hjemmesiden tager
imod bookinger hele natten. Hver booking falder ned i det sovende hus som en lysdråbe, og uret springer til
bookingens tidspunkt. Om morgenen står der "Godmorgen. 4 nye opgaver." Brandet **sitecrew** er en pladsholder.

| Fil | Hvad |
| --- | --- |
| `out/doegnet-rundt-1080x1920.mp4` | 9:16 til Reels / Stories / feed · H.264 High · 60 fps · AAC 48 kHz · 15 s |
| `out/soundtrack.wav` | Musik og lyd (−14 LUFS) |

## Storyboard

Alt ligger på et 96 BPM-grid (1 slag = 0,625 s).

| Tid | Scene |
| --- | --- |
| 0,0–2,5 s | Skumring på gaden. Uret ruller fra 16.59 til 17.00: "Du har fri." |
| 2,5–4,4 s | Time-lapse: uret suser til 23.47, lysene går ud et efter et, gadelampen tænder, og månen står op: "Du sover." |
| 4,4–9,4 s | "Din hjemmeside gør ikke." Fire bookinger kommer ind i løbet af natten (00.12, 02.14, 04.05 og 05.38). Hver sendes ned i huset som en lysdråbe, og en ring breder sig fra taget. |
| 9,4–11,6 s | Solopgang kl. 07.00, og fuglene flyver forbi solen: "Godmorgen. 4 nye opgaver." Bookingerne får flueben. |
| 11,6–15,0 s | Et frostet glaskort med logo, sitecrew, "Hjemmesider, der arbejder døgnet rundt." og knappen "Få en gratis demo". |

## Sådan er den lavet

Der er ingen AI-værktøjer og ingen samples.

- `src/main.js` tegner hele scenen på et canvas i fuld opløsning: himlen fra skumring over nat til morgen, sol,
  måne, stjerner, skyer, husene med vinduer, der tænder og slukker efter en plan, gadelampen, varevognen med
  lynet, fuglene, det rullende ur, teksterne og slutkortet. Ikoner og logo-mærke er tegnet til annoncen. Hvert
  billede er en ren funktion af tiden.
- `tools/make_audio.py` syntetiserer FM-el-klaver, pad, sub-bas og en blød beat samt uret, klokkerne for hver
  booking, lysbadet når den lander, og fuglene ved daggry. Lydene placeres ud fra `out/cues.json`, som siden
  selv eksporterer.
- `tools/render.mjs` tegner billederne i headless Chromium med motion blur (4 delbilleder, 16 på de hurtigste
  bevægelser) og pakker dem med ffmpeg.

Skrifttypen er Inter (SIL Open Font License 1.1, se `src/fonts/LICENSE.txt`) og ligger i repoet, så alt kan
renderes offline.

## Ret tekst, brand eller bookinger

Brandnavn, tagline, CTA, linjerne og nattens bookinger (tidspunkt og tekst) ligger i
[`src/config.js`](src/config.js). Tallet i "{n} nye opgaver." følger automatisk antallet af bookinger. Efter
ændringer:

```bash
npm install
npm run audio     # henter lyd-cues fra siden og laver out/soundtrack.wav
npm run render    # out/doegnet-rundt-1080x1920.mp4
npm run preview   # live preview med tidslinje (mellemrum = afspil/pause)
npm run stills    # PNG-stills i out/stills/ til hurtige tjek
```

Det kræver Node 18+, Python 3 med `numpy` og `scipy` og en `ffmpeg` med libx264 på `PATH` (eller
`FFMPEG=/sti/til/ffmpeg`).
