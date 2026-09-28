# Håndlavet: papirklip i stop-motion (15 s, 9:16)

En papirklips-annonce i stop-motion for et firma, der laver hjemmesider til håndværkere. Collagebogstaver, værktøj
af papir, en papirtelefon, saks og tape bygger historien: du er dygtig med dine hænder, men online er du svær at
finde, så vi klipper, limer og bygger din hjemmeside, og så ringer telefonen. Den har dansk speak. Brandet
**sitecrew** er en pladsholder.

| Fil | Hvad |
| --- | --- |
| `out/haandlavet-1080x1920.mp4` | 9:16 til Reels / Stories / feed · H.264 High · 24 fps · AAC 48 kHz · 15 s · med dansk speak |
| `out/soundtrack-da.wav` | Lydsporet i videoen: musik, lyd og speak (−14 LUFS) |
| `out/soundtrack.wav` | Musik og lyd uden speak |

## Storyboard

Bevægelserne er trinvise med 12 tegninger i sekundet, og hver tegning vises i to billeder ved 24 fps, som i
rigtig stop-motion. Hvert stykke papir flytter sig en anelse fra tegning til tegning, som om det blev skubbet
med hånden. Collageordene bliver klistret på i samme øjeblik, som stemmen siger dem.

| Tid | Scene | Speak |
| --- | --- | --- |
| 0,0–2,4 s | Kraftpapir. Hammer, sav, malerrulle, svensknøgle og blyant af papir lander om collagen "DU ER DYGTIG MED DINE HÆNDER." | "Du er dygtig med dine hænder." |
| 2,4–4,9 s | En papirtelefon glider ind med en søgning på "tømrer i nærheden", der ikke finder noget. En lup hopper hen over resultaterne, og et rødt "?" dukker op: "MEN ONLINE ER DU SVÆR AT FINDE." | "Men online er du svær at finde." |
| 4,9–8,4 s | En saks klipper den gamle skærm væk, tape holder en ny fast, og hjemmesiden limes på stykke for stykke: "KLIP. LIM. BYG." | "Vi klipper, limer og bygger din hjemmeside." |
| 8,4–10,9 s | "RING RING!" Derefter ringer telefonen, og sedler stables oven på den (ny booking, nyt tilbud, ny anmeldelse). | "Og så ringer telefonen." |
| 10,9–15,0 s | Et blåt ark glider ind over det hele. Logoet og "sitecrew" klistres på, derefter taglinen og et papirskilt med "Få en gratis demo". | "Hjemmesider med håndværk, til håndværkere." |

## Sådan er den lavet

Billedet, musikken og lyden er lavet med kode uden samples. Speaken er AI-genereret (se [Speak](#speak)).

- `src/main.js` tegner alle papirstykkerne på et canvas med klippede kanter, skygger og papirstruktur. Det gælder
  værktøjet, telefonen, saksen, tapen, sedlerne og collagebogstaverne, hvor hvert bogstav har sin egen skrift,
  papirfarve og hældning. Kraftpapiret og kornet er genereret én gang. Hvert billede er en ren funktion af tiden.
- `tools/make_audio.py` syntetiserer:
  - akustisk guitar og kontrabas som Karplus-Strong-strenge
  - stamp, klap, tamburin og en fløjtet melodi
  - papirlyde: bogstaver, der klistres på, saksen, tape, der rives af, og den gamle telefonklokke

  Lydene placeres ud fra `out/cues.json`, som siden selv eksporterer.
- `tools/render.mjs` tegner billederne i headless Chromium og pakker dem med ffmpeg. Der er ingen motion blur,
  fordi stop-motion består af skarpe enkeltbilleder.

Skrifttyperne er Archivo, Inter og JetBrains Mono (SIL Open Font License 1.1, se `src/fonts/LICENSE.txt`). De er
de samme som i den første annonce og ligger i repoet, så alt kan renderes offline.

## Speak

Den er AI-genereret med [Røst-v3-chatterbox-500m](https://huggingface.co/CoRal-project/roest-v3-chatterbox-500m),
som er Alexandra Instituttets danske udgave af Resemble AI's Chatterbox fra CoRal-projektet. Stemmen er modellens
indbyggede, den samme som i "Døgnet rundt" og i den første annonce, så den er ikke en kopi af en rigtig persons
stemme.

Hver replik er valgt blandt flere bud:
- Den danske talegenkender Røst skulle høre præcis den rigtige tekst, både i replikken alene og i det færdige mix
  med musikken under, også efter AAC-kodningen i MP4'en.
- Stemmen er sammenlignet med de andre annoncer, så det lyder som samme speaker.

Tre formuleringer er valgt, fordi stemmen udtaler dem rent:
- "dygtig" i stedet for "god": "du er god" blev til "du går".
- "limer" i stedet for "klistrer": stemmen sagde "klistre".
- "Hjemmesider med håndværk" i stedet for "Håndlavede hjemmesider": endelsen "-ede" forsvandt.

Lyt den alligevel igennem, før annoncen går live.

Musikken dukker sig under stemmen: 3–12 dB, og 6 dB ekstra i 1,5–6 kHz-båndet, hvor konsonanterne ligger.
Papirlydene fra collagebogstaverne er dæmpet, mens stemmen taler, fordi ordene klistres på samtidig med, at de
bliver sagt.
Stemmen ligger mindst 12 dB over musikken. Tidspunkterne står i sekunder i [`vo/da/cues.json`](vo/da/cues.json)
(`at`). Collageordene i `src/config.js` er sat til de tidspunkter, hvor stemmen siger dem.

Sådan retter du en replik:

1. Ret `text` i `vo/da/cues.json`. Skift `seed` for at få en anden oplæsning af samme tekst.
2. Generér replikken igen (kræver PyTorch og kører fint på CPU, ca. 15 s pr. replik):
   ```bash
   python3 -m venv .venv-tts
   .venv-tts/bin/pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
   .venv-tts/bin/pip install chatterbox-tts==0.1.7
   .venv-tts/bin/python tools/make_vo.py --only=l3
   ```
3. Ret ordenes tidspunkter i `src/config.js`, så de passer til den nye oplæsning.
4. Kør `npm run audio` og `npm run render`. Hvis kun lyden er ændret, er `npm run remux` nok.

Licenser: Chatterbox er MIT-licenseret. Røst-modellen har Alexandra Instituttets licens baseret på OpenRAIL-M. Den
tillader kommerciel brug, men forbyder blandt andet vildledning og at efterligne rigtige personers stemmer uden
samtykke. Lyden har et uhørligt vandmærke (Perth), der viser, at den er AI-genereret.

## Ret tekst eller brand

Brandnavn, tagline, CTA, collageordene, søgningen, eksemplet på hjemmesiden og sedlerne ligger i
[`src/config.js`](src/config.js). Collagelinjerne kan rumme 10–12 tegn. Efter ændringer:

```bash
npm install
npm run audio     # henter lyd-cues fra siden og laver out/soundtrack.wav og out/soundtrack-da.wav
npm run render    # out/haandlavet-1080x1920.mp4
npm run remux     # skifter kun lydsporet i den færdige video
npm run preview   # live preview med tidslinje (mellemrum = afspil/pause)
npm run stills    # PNG-stills i out/stills/ til hurtige tjek
```

Det kræver Node 18+, Python 3 med `numpy` og `scipy` og en `ffmpeg` med libx264 på `PATH` (eller
`FFMPEG=/sti/til/ffmpeg`).
