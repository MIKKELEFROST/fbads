# Tvillingerne: delt skærm (15 s, 9:16)

En annonce med delt skærm for et firma, der laver hjemmesider til håndværkere. To ens tømrere med samme værktøj og
samme pris står side om side, men kun den ene har en hjemmeside, og kun hans telefon ringer. Pointen er, at
hjemmesiden er den eneste forskel. Brandet **sitecrew** er en pladsholder.

| Fil | Hvad |
| --- | --- |
| `out/tvillingerne-1080x1920.mp4` | 9:16 til Reels / Stories / feed · H.264 High · 60 fps · AAC 48 kHz · 15 s |
| `out/soundtrack.wav` | Musik og lyd i stereo (−14 LUFS), ingen speak |

## Storyboard

Alt ligger på et 120 BPM-grid (1 slag = 0,5 s), og tvillingerne bevæger sig i takt med musikken.

| Tid | Scene |
| --- | --- |
| 0,0–0,5 s | Én tømrer står midt i billedet og deler sig ned gennem midten til to ens tvillinger. |
| 0,5–2,8 s | "To tømrere. Lige dygtige." Begge kaster en hammer op, fanger den i takt og får fem stjerner. |
| 2,8–5,5 s | "Samme værktøj. Samme pris." Sav, vaterpas og boremaskine skifter ind på slagene, og et prismærke klistres på begge brystkasser. |
| 5,5–9,2 s | "Men kun den ene får opgaverne." Begge tager telefonen frem. Den højre ringer, han tager den, og nye opgaver stables op, mens hans tæller stiger. Den venstre trykker og ryster sin telefon, en tumbleweed ruller forbi, og hans halvdel mister farven. |
| 9,2–11,3 s | "Én forskel: hjemmesiden." Begge holder telefonen op mod kameraet: "Ingen hjemmeside" til venstre og hans hjemmeside til højre, cirklet ind med rødt som i en find-forskellen-opgave. |
| 11,3–15,0 s | Den højre halvdel skubber den venstre ud. Slutkort med logo, "sitecrew", "Hjemmesider, der gør forskellen." og "Få en gratis demo". |

## Sådan er den lavet

Alt er egen kode, uden AI-værktøjer, samples eller grafik udefra.

- `src/main.js` tegner tvillingerne som flad vektorgrafik på et canvas. Hver tømrer har et lille skelet, hvor
  armene regnes med invers kinematik, så hænderne kan gribe værktøj og telefon. Den venstre tvilling er den
  højre spejlvendt. Hver halvdel har sit eget kamera til zoomet ind på telefonerne. Alle farver går gennem et
  filter, der dræner den venstre halvdel for farve, mens der ikke sker noget. Hvert billede er en ren funktion
  af tiden.
- `tools/make_audio.py` syntetiserer lyden i stereo, så venstre tvilling høres i venstre kanal og højre i
  højre:
  - trommer, klap, plukket bas (Karplus-Strong), FM-el-klaver, marimba og klokkespil
  - hammerkastet, værktøjet, et kasseapparat, telefonens ringetone og vibration, notifikationer
  - fårekyllinger, ørkenvind, en tumbleweed, en sørgmodig "wah-wah" og en tusch, der knirker

  Musikken spiller i begge kanaler, til den højre telefon ringer. Derefter er der kun fårekyllinger og vind i
  venstre kanal, mens musikken fortsætter i højre. Når den højre halvdel overtager skærmen, fylder musikken begge
  sider igen. Ringetonens melodi bliver til slut hovedmotivet i musikken. Lydene placeres ud fra
  `out/cues.json`, som siden selv eksporterer, og hvert cue fortæller, hvilken side det hører til.
- `tools/render.mjs` tegner billederne i headless Chromium med motion blur (4 delbilleder, 16 på de hurtigste
  bevægelser) og pakker dem med ffmpeg.

Der er ingen speak. Stilheden i venstre side over for ringetonen i højre side er selve pointen, og teksten på
skærmen bærer budskabet, også uden lyd.

Skrifttyperne er Archivo og Inter (SIL Open Font License 1.1, se `src/fonts/LICENSE.txt`). De er de samme som i
den første annonce og ligger i repoet, så alt kan renderes offline.

## Ret tekst eller brand

Al tekst og alle farver ligger i [`src/config.js`](src/config.js). Det gælder også prismærket, opgaverne, der
tikker ind, og eksemplet på hjemmesiden på telefonen. Overskrifterne kan rumme ca. 16 tegn pr. linje. Efter
ændringer:

```bash
npm install
npm run audio     # henter lyd-cues fra siden og laver out/soundtrack.wav
npm run render    # out/tvillingerne-1080x1920.mp4
npm run preview   # live preview med tidslinje (mellemrum = afspil/pause)
npm run stills    # PNG-stills i out/stills/ til hurtige tjek
```

Det kræver Node 18+, Python 3 med `numpy` og `scipy` og en `ffmpeg` med libx264 på `PATH` (eller
`FFMPEG=/sti/til/ffmpeg`).
