# Rutine: Holmsmaler — kontrol af leads fra Meta Ads

Siden 14. september 2026 går leads automatisk fra Holms Malers Meta-annoncer
ind i kundens CRM (crm.holmsmaler.dk) via Make, og Make sender selv mailen
"NYT LEAD" til kunden. **Rutinen sender ikke længere leads til kunden.** Den
kontrollerer, at hvert lead i Meta også er nået frem, og siger til, når det
ikke er sket.

Opsætningen i Make er beskrevet i `docs/lead-intake.md` i
`holmsmalertomrer-crm`-repoet. Facebook-forbindelsen, og hvad man gør, når den
dør, står i `routines/make-forbindelser.md`, hvis den fil findes (PR #7).

## Faste ID'er

| Hvad | Værdi |
|---|---|
| Annoncekonto | `831224416697545` (Holms Maler & Tømrer Enterprise Annoncekonto) |
| Business | `1727985991502984` (Holms Maler & Tømrer Enterprise ApS) |
| Facebook-side | `1143807065478844` (Holms Maler & Tømrer Entreprise ApS) |
| Lead-formular (aktiv) | `1493450252272167` ("08.05.26-copy") |
| Lead-formular (gammel) | `975087995453059` ("08.05.26") |
| Kampagne | `120245026210190073` ("Lynleads"), 100 kr/dag |
| Annoncesæt (aktivt) | `120245026210200073` ("Tømrer") |
| Make-scenarie | `9807778` ("Holms Maler \| Meta Lead Ads → Supabase CRM"), team `1576827` |
| Make-backfill | `9807783` (manuel, sender ingen mail) |
| Modtager hos kunden | `tomrer@holmsmaler.dk` (Meick) |

## Sådan kontrolleres det

Kig på de seneste 3 døgn. Ældre afvigelser er enten rettet eller allerede set.

1. **Leads i Meta:** Meta Ads MCP, `ads_get_ad_entities` på kontoen,
   `level: "ad_account"`, felt `lead`, `time_increment: "1"`. Datoerne er i
   kontoens tidszone (dansk tid).
2. **Make kører:** Make MCP, `scenarios_get` på `9807778` — `isActive` skal
   være `true`. `hooks_get` på webhooken `4372751` — `queueCount` skal være
   `0`. `executions_list` på scenariet: notér kørsler med `status: 3` (fejl) i
   perioden. Tidsstemplerne er UTC.
3. **Mails sendt:** Gmail, søg `to:tomrer@holmsmaler.dk subject:"NYT LEAD"`
   i perioden. Én mail pr. nyt lead.

Det er i orden, når antallet af leads i Meta pr. dag svarer til antallet af
"NYT LEAD"-mails, og der ingen fejlkørsler er. Et lead sent om aftenen kan
lande på næste dag i den ene kilde — sammenlign over hele perioden, ikke kun
dag for dag.

## Når noget ikke stemmer

- **Fejl med `InvalidAccessTokenError` i Make:** Facebook-forbindelsen
  (`frostmikkel99`, id `14589446`) er udløbet. Det er sket 8. og 18. oktober
  2026. Make slukker scenariet, og nye leads hober sig op i webhookens kø,
  indtil Mikkel genautoriserer forbindelsen. Sig det med det samme — det
  rammer også Carelax, som bruger samme forbindelse.
- **Scenariet er ikke aktivt, eller `queueCount` er over 0:** sig det med det
  samme.
- **Flere leads i Meta end mails:** sig hvilke datoer, der mangler. Mikkel kan
  køre backfill-scenariet; det henter leads ind i CRM'et men sender ingen mail,
  så Meick skal have besked separat.

Ret ikke selv noget i Make, og send ikke leads til kunden — giv Mikkel besked.

Meta Ads MCP kan kun se antal og dato, aldrig hvem. Skal der bruges
kontaktoplysninger (fx til at fortælle Mikkel hvilket lead der mangler), kan de
hentes via Zapier MCP → Facebook Lead Ads, se `CLAUDE.md`.

## Notifikation

Send kun push, når Mikkel skal gøre noget:

- Fejl i Make, scenariet er slukket, eller leads mangler → kort besked med
  hvad og hvornår.
- Alt stemmer → **ingen notifikation**. Stilhed er det rigtige svar.

Værd at nævne, hvis det opdages undervejs: pris pr. lead er steget markant i
forhold til tidligere (september: 230 kr, oktober: 432 kr).

## Status pr. 2. november 2026

- Kører i "Tømrer" (4:5 til feed, 9:16 til Stories/Reels), alle på formular
  `1493450252272167`:
  - fra 2. november: "Maskot – Tjekliste #5.0" (`120250592107120073`), "Maskot –
    Talebobbel #5.0" (`120250592110250073`), "Maskot – Tape #5.0"
    (`120250592111630073`);
  - fra 3. november: "Maskot – Tag #5.0" (`120250592172860073`), "Maskot –
    Indendørs #5.0" (`120250592175440073`).
- Klar på pause i "Tømrer": "Maskot – Tilbygning #5.0" (`120250592173970073`) og
  "Maskot – Terrasse #5.0" (`120250592176680073`, tænkt til februar). De tændes
  kun, når Mikkel siger til.
- Pauset 2. november: november-annoncerne "Vinduer – Trækker det #3.0", "Vinduer –
  Sat i vater #3.0", "Tømrer – Målt to gange #3.0" (AI-genererede fotos;
  AI-erklæringen i Meta er ikke udfyldt).
- December-planen er droppet: "Dec – … #4.0"-annoncerne (`120250567442270073`,
  `120250567443950073`, `120250567445170073`) bliver på pause, og der er ingen
  planlagt opgave, der tænder dem.
- Også pauset: "Tømrer – Foto Sjælland #2.0" (239 kr/lead aug–okt), "Før/Efter
  #2.1", "Få Hjælp #1.1", "Hvorfor os? #1.2", samt annoncesættene "Tømrer – 25-44"
  og "Tømrer – 45+".
- Billeder og skabeloner: `creatives/holmsmaler/` (maskot-annoncerne ligger i
  `maskot/`).
