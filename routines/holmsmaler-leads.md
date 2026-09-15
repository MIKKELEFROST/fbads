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

Obs. 15-09-2026: i planlagte kørsler er Zapier-serveren ikke autoriseret — dens værktøjer
er slet ikke tilgængelige, og en planlagt session kan ikke selv køre OAuth-flowet.
Autorisation skal ske i en interaktiv session (connector-indstillinger på claude.ai eller
`/mcp`). Indtil da kan en planlagt kørsel bekræfte antal og dato via Meta Ads MCP, men
ikke hente kontaktoplysninger.

Krydstjek gerne antallet mod Meta Ads MCP (`ads_get_ad_entities`, felt `lead`,
`time_increment: "1"`) — den kan bekræfte antal og dato, men ikke oplysningerne.

## Sådan afgøres hvad der er "nyt"

Der findes ingen tilstandsfil. Skæringsdatoen læses fra Gmail:

1. Søg i Gmail efter seneste mail sendt til `holmsmaler.dk` om leads.
2. Læs den. Emnelinjen og teksten angiver, hvilken periode den dækkede
   (fx "4 nye leads fra Meta Ads – 2.-4. september" → dækker t.o.m. 4. september).
3. Alt med `created_time` efter den skæring er nyt og skal sendes.

Tjek altid mod den faktiske mail — ikke mod en antagelse om, hvornår rutinen sidst kørte.
Rutinen kan have kørt uden at sende noget, og Mikkel sender også selv manuelt.

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

## Åben sag: leveringen ser ud til at være flyttet til et CRM (obs. 15-09-2026)

**Indtil Mikkel har taget stilling: send ikke lead-lister til kunden.**

Den seneste lead-liste i formatet ovenfor dækkede t.o.m. 10. september (sendt 11-09).
Efter den er der i stedet sendt tre korte mails til `tomrer@holmsmaler.dk` (cc Mikkel)
med emnet `NYT LEAD` og teksten "der er et nyt lead - du finder det i CRM systemet"
med link til `https://crm.holmsmaler.dk/`. Ingen kontaktoplysninger i selve mailen.

Tidspunkterne matcher Meta Ads' leadtal én-til-én:

| Lead iflg. Meta Ads | `NYT LEAD`-mail (UTC) |
|---|---|
| 14-09, 1 stk. | 14-09 14:45 |
| 15-09, 2 stk. | 15-09 04:00 og 15-09 07:27 |

Alle leads efter 10. september er altså allerede givet videre — bare ad den nye vej.
En liste i det gamle format ville være en dublet og ville sende kontaktoplysninger på
mail, som leveringen netop ser ud til at være gået væk fra.

Bemærk at skæringsreglen længere oppe ikke fanger det her: den leder efter den seneste
*liste* og ville pege på 10. september og dermed udløse tre dubletter. Reglen skal enten
omskrives til at tælle `NYT LEAD`-mails med som skæring, eller også skal rutinen lukkes
ned, hvis CRM'et har overtaget. Det er Mikkels beslutning.

## Notifikation

Send kun push, når der er noget, Mikkel skal forholde sig til:

- Nye leads fundet og sendt → kort besked med antal og navne.
- Rutinen kunne ikke køre (forbindelse nede, adgang nægtet, mail fejlede) → sig det.
- Ingen nye leads → **ingen notifikation**. Stilhed er det rigtige svar.

Værd at nævne, hvis det opdages undervejs: pris pr. lead er steget markant.
5.-9. september kostede 401,52 kr for ét lead, mod ca. 170 kr i perioden før.
