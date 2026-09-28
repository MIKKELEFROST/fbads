# Tvillingerne · tegneserie (15 s, 9:16)

Samme historie som [Tvillingerne](../website-promo-tvillingerne/) med samme timing og samme stereolyd, men fortalt
som en tegneserieside. To ens tømrere har samme værktøj og samme pris, men kun den ene har en hjemmeside, og kun
hans telefon ringer. Siden har paneler, tykke tuschstreger, rasterprikker, gule tekstbokse og lydord. Brandet
**sitecrew** er en pladsholder.

| Fil | Hvad |
| --- | --- |
| `out/tvillingerne-tegneserie-1080x1920.mp4` | 9:16 til Reels / Stories / feed · H.264 High · 60 fps · AAC 48 kHz · 15 s |
| `out/soundtrack.wav` | Musik og lyd i stereo (−14 LUFS), ingen speak |

## Storyboard

Alt ligger på et 120 BPM-grid (1 slag = 0,5 s), præcis som i den flade version.

| Tid | Scene |
| --- | --- |
| 0,0–0,5 s | Ét panel med én tømrer. Panelet flænges ned gennem midten ("RRRIP!") til to paneler med én tvilling i hvert. |
| 0,5–2,8 s | "TO TØMRERE. LIGE DYGTIGE." Begge kaster en hammer op ("SVUP!"), griber den ("KLAP!") og får fem stjerner. |
| 2,8–5,5 s | "SAMME VÆRKTØJ. SAMME PRIS." Sav, vaterpas og boremaskine skifter ind på slagene, og et prismærke klistres på ("KA-CHING!"). |
| 5,5–9,2 s | "MEN KUN DEN ENE … FÅR OPGAVERNE." Den højre telefon ringer ("RIIING!"), og talebobler med nye opgaver popper ud af den ("PLING!"). Det venstre panel bliver gråt: "KRIK … KRIK …", en svedperle, spindelvæv på telefonen, en tankeboble med "…" og en tumbleweed. |
| 9,2–11,3 s | "ÉN FORSKEL: HJEMMESIDEN." Nærbilleder af telefonerne med fartstreger: ingen hjemmeside til venstre, hans hjemmeside til højre, ringet ind med rød tusch. |
| 11,3–15,0 s | Det højre panel smækker det venstre af siden ("BAM!"), og siden bliver til en tegneserieforside: "NR. 1", logo, "sitecrew", "Hjemmesider, der gør forskellen." og "Få en gratis demo". |

## Sådan er den lavet

Alt er egen kode, uden AI-værktøjer, samples eller grafik udefra.

- `src/main.js` tegner siden på et canvas. Hver gruppe af former, fx en arm, hovedet eller overkroppen, tegnes to
  gange: først som en fed sort silhuet og så i farve. Det giver en ren ydre kontur, mens de indre streger er
  tyndere. Skyggerne er cel-skyggelagt med rasterprikker (Ben-Day), som ligger fast på skærmen som trykte prikker.
  Solstrålerne og de store prikker ude mod kanten er også "trykt" på siden, så de står stille, når kameraet
  bevæger sig. Skovmandsskjorten er tern i to lag, skægstubbene er blå prikker, og lydordene er håndletterede:
  hvert bogstav er drejet og skaleret en smule og har kontur og 3D-kant. Tvillingerne bevæger sig præcis som i den
  flade version: skelettet, armene med invers kinematik og tidslinjen er de samme. Tegningen er animeret "on
  twos" som en tegnefilm, så hver positur holdes i to billeder ved 60 fps, mens kameraet bevæger sig i hvert
  billede. Hvert billede er en ren funktion af tiden.
- `tools/make_audio.py` syntetiserer et 60'er-agtigt spion- og surfnummer i stereo:
  - twangy surfguitar (Karplus-Strong gennem en fjederklang), messingblæsere (båndbegrænsede savtakker med
    klangkurve), spionbas, trommer med toms og bækken, klokkespil
  - tegnefilmslyde: papir der flænges, slide-fløjte, klap, pop, save- og borelyd, kasseapparat, en gammel
    telefonklokke, pling, fårekyllinger, vind, tumbleweed, en vanddråbe, en trist trombone, tuschpen og et stort BAM

  Venstre tvilling høres i venstre kanal og højre i højre. Når den højre telefon ringer, forsvinder bandet fra
  venstre side, så der kun er fårekyllinger og vind. Når det højre panel smækker det venstre væk, fylder bandet
  begge sider igen. Lydene placeres ud fra `out/cues.json`, som siden selv eksporterer.
- `tools/render.mjs` tegner billederne i headless Chromium med motion blur på kamerabevægelserne (4 delbilleder,
  16 på de hurtigste) og pakker dem med ffmpeg.

Der er ingen speak. Lydordene og tekstboksene bærer historien, også uden lyd.

Skrifttyperne er Archivo og Inter (SIL Open Font License 1.1, se `src/fonts/LICENSE.txt`). De er de samme som i
den første annonce og ligger i repoet, så alt kan renderes offline.

## Ret tekst eller brand

Al tekst og alle farver ligger i [`src/config.js`](src/config.js). Det gælder også lydordene, prismærket,
opgaverne i taleboblerne og eksemplet på hjemmesiden på telefonen. En tekstboks kan rumme ca. 16 tegn og et
lydord ca. 8. Efter ændringer:

```bash
npm install
npm run audio     # henter lyd-cues fra siden og laver out/soundtrack.wav
npm run render    # out/tvillingerne-tegneserie-1080x1920.mp4
npm run preview   # live preview med tidslinje (mellemrum = afspil/pause)
npm run stills    # PNG-stills i out/stills/ til hurtige tjek
```

Det kræver Node 18+, Python 3 med `numpy` og `scipy` og en `ffmpeg` med libx264 på `PATH` (eller
`FFMPEG=/sti/til/ffmpeg`).
