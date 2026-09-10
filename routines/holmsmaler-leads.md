# Rutine: Holmsmaler — leads fra Meta Ads

Tjekker om der er kommet nye leads ind via Holms Malers Meta-annoncer, og sender dem
videre til kunden. Kører flere gange dagligt.

## Faste ID'er

| Hvad | Værdi |
|---|---|
| Annoncekonto | `831224416697545` (Holms Maler & Tømrer Enterprise Annoncekonto) |
| Business | `1727985991502984` (Holms Maler & Tømrer Enterprise ApS) |
| Facebook-side | `1143807065478844` (Holms Maler & Tømrer Entreprise ApS) |
| Lead-formular (aktiv) | `1493450252272167` ("08.05.26-copy") |
| Lead-formular (gammel) | `975087995453059` ("08.05.26") |
| Kampagne | `120245026210190073` ("Lynleads") |
| Modtager hos kunden | `tomrer@holmsmaler.dk` |

`kontakt@holmsmaler.dk` (Jimmi Holm) er CC'et på ældre mails, men henviser videre til
Meick. Send som udgangspunkt kun til `tomrer@`.

## Sådan hentes leads

Zapier MCP:

- `selected_api`: `FacebookLeadsCLIAPI`
- `action`: `lead` / `tool_name`: `facebook_lead_ads_new_lead`
- `params`: `{"page": "1143807065478844", "form": ""}` — tom `form` = alle formularer
- Standardforbindelse: `frostmalthe@gmail.com`
  (`0294a819-92f2-8aa2-864f-89b26b0c0422`)

Returnerer nyeste først med `created_time`, `full_name`, `phone_number`, `email`,
`postnummer`, `hvad_kan_vi_hjælpe_med?_(beskriv_din_opgave)`, samt `ad_name` og
`platform` (fb/ig).

Hvis forbindelsen mangler en standardkonto, fejler kaldet med "Authorization
access_token missing". Sæt den med `manage_zapier_connections` og prøv igen.

Krydstjek gerne antallet mod Meta Ads MCP (`ads_get_ad_entities`, felt `lead`,
`time_increment: "1"`) — den kan bekræfte antal og dato, men ikke oplysningerne.

## Sådan afgøres hvad der er "nyt"

Der findes ingen tilstandsfil. Rækkefølgen er: **find først ud af hvem der allerede er
sendt — derefter hvad der er kommet ind.** Aldrig omvendt.

1. **Hent alle tidligere lead-mails.** Søg i Gmail på `to:holmsmaler.dk` uden nogen
   nøgleord, fx `to:holmsmaler.dk newer_than:60d`. Læs dem alle, ikke kun den nyeste.
2. **Byg listen over allerede sendte leads** — navn + telefonnummer fra hver mail.
   Det er denne liste, der afgør, hvad der må sendes. Ikke en dato.
3. **Notér tidspunktet på det nyeste allerede sendte lead.** Det bruges kun i svaret
   ("INGEN NYE LEADS SIDEN ..."), ikke som filter.
4. **Hent leads fra Zapier** og frasortér alle, hvis navn/telefon står på listen fra
   punkt 2.
5. Det, der er tilbage, er nyt og må sendes.

### Faldgruber — begge har kostet kunden en dobbeltmail

- **Søg aldrig med nøgleord som `leads`.** Mails med emnet "Nyt lead" (ental) matcher
  ikke `leads`, og så forsvinder de lydløst ud af resultatet. Søgningen ser rigtig ud,
  men mangler netop den mail, man skulle bruge. Søg bredt på modtageren og læs alt.
- **Brug ikke skæringsdatoen fra emnelinjen som filter.** Et lead kan være sendt i en
  mail, man ikke fandt — så er datoen forkert, og leadet ryger afsted igen.
  Sammenlign lead for lead.

Rutinen kan have kørt uden at sende noget, og Mikkel sender også selv manuelt — begge
dele er grunde til at tjekke de faktiske mails frem for at antage noget om sidste kørsel.

## Mailformat

Dansk, samme opbygning som de foregående. Skabelon:

```
Emne: {antal} nyt/nye lead(s) fra Meta Ads – {dato eller datointerval}

Hej

Her er de leads, der er kommet ind via jeres Meta-annoncer siden sidste liste
(den sluttede {dato}) - {antal} i alt.

Bemærk: formularen indsamler kun postnummer, ikke fuld adresse. Den skal I have
med på opkaldet.

---

1) {NAVN MED VERSALER} - {d/m} kl. {HH:MM}
Tlf: {telefon} | Mail: {mail} | Postnr: {postnummer}
Opgave: {opgavebeskrivelse, let renskrevet}

---

Sig til hvis I vil have dem leveret på en anden måde - fx direkte i et regneark
eller pushet til jeres system, efterhånden som de kommer ind.

Bedste hilsner
Mikkel
```

Detaljer der betyder noget:

- `created_time` er UTC. Dansk tid er +2 om sommeren, +1 om vinteren. Omregn.
- Telefonnumre skrives læsevenligt: `+45 40 20 62 07`.
- Skriv en note ved leads, hvor mailadressen ikke matcher navnet ("ring hellere end
  at skrive") — det er sket før og kostede kunden tid.
- Opgavebeskrivelsen renskrives let (kundens egne stavefejl rettes), men indholdet
  ændres ikke.
- Hold pris- og performancesnak ude af kundemailen, medmindre tallene er gode.
  Send det til Mikkel i stedet.

## Når der ingen nye leads er

Så sendes **ingen mail til kunden**. Svaret i sessionen er præcis denne ene linje:

```
INGEN NYE LEADS SIDEN {dd-mm-åååå} kl. {HH:MM}
```

Tidspunktet er det nyeste lead, der allerede er sendt til kunden (dansk tid). En mail
"der er ikke sket noget" til kunden er spam — den skal aldrig sendes.

## Notifikation

Send kun push, når der er noget, Mikkel skal forholde sig til:

- Nye leads fundet og sendt → kort besked med antal og navne.
- Rutinen kunne ikke køre (forbindelse nede, adgang nægtet, mail fejlede) → sig det.
- Ingen nye leads → **ingen notifikation**. Stilhed er det rigtige svar.

Værd at nævne, hvis det opdages undervejs: pris pr. lead er steget markant.
5.-9. september kostede 401,52 kr for ét lead, mod ca. 170 kr i perioden før.
