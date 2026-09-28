# Næste level: pixel-spil-annonce (15 s, 9:16)

Motion graphics-annonce i 8-bit-spilstil for et firma, der laver hjemmesider til håndværkere. Håndværkeren
slår hjelmen mod loftet "INGEN HJEMMESIDE", får en ny hjemmeside som power-up, smadrer loftet og klatrer op
gennem banerne, mens han samler kunder. Brandet **sitecrew** er en pladsholder.

| Fil | Hvad |
| --- | --- |
| `out/level-up-1080x1920.mp4` | 9:16 til Reels / Stories / feed · H.264 High · 60 fps · AAC 48 kHz · 15 s |
| `out/soundtrack.wav` | Chiptune-musik og lydeffekter (−14 LUFS) |

## Storyboard

Alt ligger på et 144 BPM-grid (1 slag = 0,417 s), så hvert hop, bump og power-up rammer musikken.

| Tid | Scene |
| --- | --- |
| 0,0–1,7 s | Titel: "NÆSTE LEVEL", "Er dit firma klar?" og et blinkende "▶ TRYK START". |
| 1,7–5,0 s | Håndværkeren hopper og slår hjelmen mod loftet "INGEN HJEMMESIDE": "Av! Uden hjemmeside kommer du ikke videre." |
| 5,0–8,3 s | En ny hjemmeside flyver ind som power-up, så kommer "LEVEL UP!", og han smadrer loftet. |
| 8,3–11,7 s | Klatring fra nat til solopgang over fire platforme: Lynhurtig, Mobilvenlig, Nem at booke og 5 stjerner. Kunderne samles op, og tælleren i toppen stiger. |
| 11,7–15,0 s | "Næste level: Klaret!" og fyrværkeri. Til sidst slutkortet med logo, "Hjemmesider til håndværkere" og knappen "▶ Få en gratis demo", som håndværkeren hopper op på. |

## Sådan er den lavet

Alt er egen kode. Der er ingen AI-værktøjer, ingen samples og ingen grafik eller skrifttyper udefra.

- `src/pixel.js` er en lille pixel-renderer på 135×240 pixels, der vises 8 gange forstørret. Den har også en
  pixel-skrifttype med æ, ø og å, som er tegnet til annoncen.
- `src/main.js` indeholder hele spillet: banen, håndværkeren (bygget af rektangler), platformene, kunderne,
  partiklerne, HUD'en, dialogboksen, titlen og slutkortet. Figurer og ikoner er tegnet til annoncen. Hvert
  billede er en ren funktion af tiden, så en rendering bliver ens hver gang.
- `tools/make_audio.py` laver chiptune-musikken med to pulsbølger, en trekant-bas og støj-trommer med 4-bit
  lydstyrke, ligesom en gammel spillekonsol. Lydeffekterne placeres ud fra `out/cues.json`, som siden selv
  eksporterer, så hver lyd rammer det billede, der viser den.
- `tools/render.mjs` tegner billederne ét ad gangen i headless Chromium og pakker dem med ffmpeg.

## Ret tekst eller brand

Al tekst og alle farver ligger i [`src/config.js`](src/config.js). En linje i dialogboksen kan rumme ca. 21 tegn.
Efter ændringer:

```bash
npm install
npm run audio     # henter lyd-cues fra siden og laver out/soundtrack.wav
npm run render    # out/level-up-1080x1920.mp4
npm run preview   # live preview med tidslinje (mellemrum = afspil/pause)
npm run stills    # PNG-stills i out/stills/ til hurtige tjek
```

Det kræver Node 18+, Python 3 med `numpy` og `scipy` og en `ffmpeg` med libx264 på `PATH` (eller
`FFMPEG=/sti/til/ffmpeg`).
