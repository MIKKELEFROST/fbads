# Vejrudsigten: vejret for din kalender (15 s, 9:16)

En parodi på en TV-vejrudsigt for et firma, der laver hjemmesider til håndværkere. Udsigten gælder din kalender:
først tørke og ingen opgaver i sigte, så driver en front med en ny hjemmeside ind fra vest, og til sidst regner
det med bookinger over hele landet. Den har dansk speak som en rolig vejrvært. Brandet **sitecrew** er en
pladsholder.

| Fil | Hvad |
| --- | --- |
| `out/vejrudsigten-1080x1920.mp4` | 9:16 til Reels / Stories / feed · H.264 High · 60 fps · AAC 48 kHz · 15 s · med dansk speak |
| `out/soundtrack-da.wav` | Lydsporet i videoen: musik, lyd og speak (−14 LUFS) |
| `out/soundtrack.wav` | Musik og lyd uden speak |

## Storyboard

Billedet følger speaken. Tidspunkterne for replikkerne står i [`vo/da/cues.json`](vo/da/cues.json), og
`src/main.js` lægger scenerne efter dem.

| Tid | Scene | Speak |
| --- | --- | --- |
| 0,0–2,1 s | "VEJRET for din kalender" over et Danmarkskort. Kortet trækker sig ud fra Jylland, og solene står op over et udtørret land. | "Her er udsigten for kalenderen." |
| 2,1–4,9 s | Jorden sprækker, varmen dirrer, og hver by viser 0 opgaver. | "Det er tørt. Ingen opgaver i sigte." |
| 4,9–8,0 s | En varmfront med skiltet "NY HJEMMESIDE" driver ind fra vest med skyer og regn, og landet bliver grønt bag den. | "Men fra vest driver en ny hjemmeside ind over landet." |
| 8,0–10,4 s | Skyer over byerne regner bookinger, og tællerne stiger: Aalborg 6, Aarhus 12, Esbjerg 5, Odense 8, København 21. | "Den giver et skybrud af kunder." |
| 10,4–15,0 s | Kortet træder tilbage for femdagesudsigten, fuldt booket hver dag: "Prognose: travlt." Derefter logo, "sitecrew", "Hjemmesider, der fylder kalenderen." og "Få en gratis demo". | "Udsigten for resten af ugen: travlt." |

## Sådan er den lavet

Billedet, musikken og lyden er lavet med kode uden samples. Speaken er AI-genereret (se [Speak](#speak)).

- `src/map.js` er et håndtegnet Danmarkskort: kystlinjerne er punkter i længde- og breddegrad, sat ind i hånden
  til denne annonce og glattet, når de tegnes. Bornholm sidder i sin egen boks, som på danske vejrkort.
- `src/main.js` tegner vejrudsigten på et canvas: havet, landet med kant og kystlys, revner i den tørre jord,
  sole, varmedis, fronten med sine halvcirkler, skyer, regn, byerne med tællere og de fem dage. Kortet har sit
  eget kamera til den langsomme TV-agtige bevægelse. Hvert billede er en ren funktion af tiden.
- `tools/make_audio.py` syntetiserer et let vejrudsigt-jingle:
  - vibrafon (stave stemt 1:4:10 med tremolo-motor), kontrabas (Karplus-Strong), viskere, ride-bækken, en blød
    stortromme og klokkespil
  - vind, der krydser fra vest mod øst med fronten, regn og varmedis

  Hver booking, der lander på en by under bygen, slår en vibrafontone an fra akkorden, så regnen bliver til en
  melodi. Lydene placeres ud fra `out/cues.json`, som siden selv eksporterer.
- `tools/render.mjs` tegner billederne i headless Chromium med motion blur (4 delbilleder, 16 på de hurtigste
  bevægelser) og pakker dem med ffmpeg.

Skrifttyperne er Archivo og Inter (SIL Open Font License 1.1, se `src/fonts/LICENSE.txt`). De er de samme som i
den første annonce og ligger i repoet, så alt kan renderes offline.

## Speak

Den er AI-genereret med [Røst-v3-chatterbox-500m](https://huggingface.co/CoRal-project/roest-v3-chatterbox-500m),
som er Alexandra Instituttets danske udgave af Resemble AI's Chatterbox fra CoRal-projektet. Stemmen er modellens
indbyggede, den samme som i "Døgnet rundt", "Håndlavet" og i den første annonce, så den er ikke en kopi af en
rigtig persons stemme.

Hver replik er valgt blandt flere bud:
- Den danske talegenkender Røst skulle høre præcis den rigtige tekst, både i replikken alene og i det færdige mix
  med musikken under, også efter AAC-kodningen i MP4'en.
- Stemmen er sammenlignet med de andre annoncer, så det lyder som samme speaker.

Tre formuleringer er valgt, fordi talegenkenderen ellers ikke kunne bekræfte dem:
- "Her er udsigten for kalenderen." i stedet for "Her er vejret for din kalender.": "din kalender" blev hver gang
  til "dine kalender", og "vejret" vippede mellem "vejret" og "vejet".
- "et skybrud af kunder" i stedet for "kraftige byger af kunder": "byger" og "byer" udtales næsten ens.
- "Udsigten" i stedet for "Prognosen": "prognosen" blev til "pronosen".

Lyt den alligevel igennem, før annoncen går live.

Musikken spiller som et jingle under en vært. Mens værten taler, holder ride og stortromme pause, viskerne bliver
bløde, og musikken dukker sig 8–11 dB med 6 dB ekstra i 1,5–6 kHz-båndet, hvor konsonanterne ligger. Under den
sidste replik holder bandet helt pause og kommer ind igen på en akkord efter "travlt". Stemmen ligger mindst 14 dB
over musikken. Der er ingen kompressor på stemmen i denne annonce, fordi den gjorde "dr" i "driver" til et "l".

Tidspunkterne står i sekunder i [`vo/da/cues.json`](vo/da/cues.json) (`at`). `VO` og `WORD` øverst i
`src/main.js` skal følge med, hvis en replik flyttes eller skiftes ud, for siden fortæller musikken, hvornår der
tales.

Sådan retter du en replik:

1. Ret `text` i `vo/da/cues.json`. Skift `seed` for at få en anden oplæsning af samme tekst.
2. Generér replikken igen (kræver PyTorch og kører fint på CPU, ca. 15 s pr. replik):
   ```bash
   python3 -m venv .venv-tts
   .venv-tts/bin/pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
   .venv-tts/bin/pip install chatterbox-tts==0.1.7
   .venv-tts/bin/python tools/make_vo.py --only=l3
   ```
   Hvis oplæsningen ender med en vejrtrækning, så sæt `keep: [start, slut]` (sekunder i den rå oplæsning).
3. Ret `VO` og `WORD` i `src/main.js`, så billedet passer til den nye oplæsning.
4. Kør `npm run audio` og `npm run render`. Hvis kun lyden er ændret, er `npm run remux` nok.

Licenser: Chatterbox er MIT-licenseret. Røst-modellen har Alexandra Instituttets licens baseret på OpenRAIL-M. Den
tillader kommerciel brug, men forbyder blandt andet vildledning og at efterligne rigtige personers stemmer uden
samtykke. Lyden har et uhørligt vandmærke (Perth), der viser, at den er AI-genereret.

## Ret tekst eller brand

Brandnavn, tagline, CTA, overskriften, teksterne i båndet, tallene over byerne og de fem dage ligger i
[`src/config.js`](src/config.js). Efter ændringer:

```bash
npm install
npm run audio     # henter lyd-cues fra siden og laver out/soundtrack.wav og out/soundtrack-da.wav
npm run render    # out/vejrudsigten-1080x1920.mp4
npm run remux     # skifter kun lydsporet i den færdige video
npm run preview   # live preview med tidslinje (mellemrum = afspil/pause)
npm run stills    # PNG-stills i out/stills/ til hurtige tjek
```

Det kræver Node 18+, Python 3 med `numpy` og `scipy` og en `ffmpeg` med libx264 på `PATH` (eller
`FFMPEG=/sti/til/ffmpeg`).
