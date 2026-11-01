# Holms Maler & Tømrer — statics til Meta

`statics/build.js` bygger annoncebillederne i to formater med Playwright:

- `*-feed.png` — 1080×1350 (4:5) til feed
- `*-story.png` — 1080×1920 (9:16) til Stories og Reels. Al tekst ligger mellem
  250 og ca. 1000 px, så Reels' UI (øverste 14 %, nederste 35 %) ikke dækker den.

```bash
cd statics
node build.js                  # alle annoncer
node build.js dec-planlaeg     # én annonce
```

Annoncerne defineres i `ADS` øverst i `build.js` (billede, beskæring, overskrift,
undertekst). Brand: Holms' hvide logo, gul `#F9CE11`, navy `#072235`, skrifttypen
Lato — alt hentet fra holmsmaler.dk.

Kildebillederne i `statics/src/img/` er **AI-genererede** (ChatGPT, november 2026).
Brug dem som illustration, ikke som "vores projekt" eller før/efter.

I Meta lægges begge formater i samme annonce (placement asset customization):
9:16 til `story`/`facebook_reels`/`reels`, 4:5 til resten. Lead-formular
`1493450252272167`.

| Annonce | Kørt |
|---|---|
| `vinduer-traek`, `vinduer-vater`, `indendoers-detaljer` | 1.–30. november 2026 |
| `dec-vinduer-vinter`, `dec-planlaeg`, `dec-indendoers` | fra 1. december 2026 |
