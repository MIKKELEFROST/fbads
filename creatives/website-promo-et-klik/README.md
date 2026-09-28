# Ét klik: kædereaktion (15 s, 9:16)

En Rube Goldberg-maskine for et firma, der laver hjemmesider til håndværkere. Et klik på "Book tid" på en
tømrers hjemmeside sætter en kæde af håndværkerting i gang. Den ender med, at klokken ringer for en ny opgave.
Pointen er, at hjemmesiden klarer resten selv. Brandet **sitecrew** er en pladsholder.

| Fil | Hvad |
| --- | --- |
| `out/et-klik-1080x1920.mp4` | 9:16 til Reels / Stories / feed · H.264 High · 60 fps · AAC 48 kHz · 15 s |
| `out/soundtrack.wav` | Musik og lyd (−14 LUFS), ingen speak |

## Storyboard

Alt ligger på et 120 BPM-grid (1 slag = 0,5 s), og maskinen spiller med i musikken: hver landing, dominobrik og
stjerne er en tone eller et slag.

| Tid | Scene |
| --- | --- |
| 0,0–1,6 s | En telefon viser en tømrers hjemmeside: "Ét klik på din hjemmeside …". En finger trykker på "Book tid", og knappen springer ud af skærmen som en orange kugle. |
| 1,6–4,3 s | Kuglen ruller ned ad en tommestok, lander på en planke og forsvinder ned i et kobberrør: "… og det hele går i gang." |
| 4,3–5,3 s | Den vælter fire dominobrikker, og hvert trin bliver krydset af øverst: booking, bekræftelse sendt, påmindelse sendt, lagt i kalenderen. |
| 5,3–7,8 s | Den sidste brik vælter en hammer, der slår på disk-klokken: "Ny opgave booket". Fem stjerner flyver op, og telefonen viser "Booket". |
| 7,8–10,5 s | "Du skal bare møde op." Kameraet trækker sig tilbage, så hele maskinen ses. |
| 10,5–15,0 s | Slutkort med logo, "sitecrew" skrevet som på et tastatur og "Hjemmesider, der sætter kunderne i gang." Kuglen ruller ind og bliver til knappen "Få en gratis demo". |

## Sådan er den lavet

Alt er egen kode, uden AI-værktøjer, samples eller grafik udefra.

- `src/main.js` tegner maskinen på et canvas. Den består af telefonen, hjemmesiden, fingeren, tommestokken,
  planken, røret, dominobrikkerne, hammeren, klokken og væggen med hulplader. Kuglens bane og hammerens sving er
  regnet som enkel fysik. Hver dominobrik læner sig op ad den næste, efter hvor den står, og hvert billede er en
  ren funktion af tiden.
- `tools/make_audio.py` syntetiserer musikken og maskinens lyde:
  - marimba og plukket kontrabas, lavet som Karplus-Strong-streng
  - klokkespil, woodblock, shaker, stortromme og klap
  - kuglen, der ruller på træ og i kobberrøret
  - dominoklik og disk-klokken

  Lydene placeres ud fra `out/cues.json`, som siden selv eksporterer.
- `tools/render.mjs` tegner billederne i headless Chromium med motion blur (4 delbilleder, 16 på de hurtigste
  bevægelser) og pakker dem med ffmpeg.

Skrifttyperne er JetBrains Mono og Inter (SIL Open Font License 1.1, se `src/fonts/LICENSE.txt`), og de ligger i
repoet, så alt kan renderes offline.

## Ret tekst eller brand

Al tekst og alle farver ligger i [`src/config.js`](src/config.js). Det gælder også trinene på dominobrikkerne,
beskeden, der dukker op, og eksemplet på hjemmesiden på telefonen. Overskrifterne er sat i en skrift med fast
bredde, så der er plads til ca. 17 tegn pr. linje. Efter ændringer:

```bash
npm install
npm run audio     # henter lyd-cues fra siden og laver out/soundtrack.wav
npm run render    # out/et-klik-1080x1920.mp4
npm run preview   # live preview med tidslinje (mellemrum = afspil/pause)
npm run stills    # PNG-stills i out/stills/ til hurtige tjek
```

Det kræver Node 18+, Python 3 med `numpy` og `scipy` og en `ffmpeg` med libx264 på `PATH` (eller
`FFMPEG=/sti/til/ffmpeg`).
