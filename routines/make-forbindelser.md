# Make: lead-scenarier og Facebook-forbindelsen

Alle lead-automatiseringer i Make hænger på **én** Facebook-forbindelse. Dør den, dør
alt på én gang — for begge kunder. Det er den vigtigste ting at vide om opsætningen.

Team `1576827`, organisation `3412853`.

## Scenarier og hooks

| Scenarie | ID | Hook | Kunde | Normaltilstand |
|---|---|---|---|---|
| Holms Maler \| Meta Lead Ads → Supabase CRM | `9807778` | `4372751` | Holms | aktiv |
| Holms Maler \| Backfill Meta leads → Supabase (manuel) | `9807783` | — | Holms | **inaktiv** (on-demand) |
| Carelax \| Meta Lead Ads → Pipedrive | `9798554` | `4369680` | Carelax | aktiv |
| Carelax \| Meta Lead Ads (OMN-formular) → Pipedrive | `9845303` | `4387134` | Carelax | aktiv |

Forbindelser:

- Facebook Lead Ads: `14589446` ("frostmikkel99") — brugt af **alle fire** scenarier,
  både i hook'et og i modulerne.
- Pipedrive: `14589439` (de tre Carelax-moduler).

Hook'ene har `editable: false`. Forbindelsen i et hook kan derfor **ikke** flyttes via
API'et (`hooks_update` → `Access denied`). Derfor er genautorisering af den
eksisterende forbindelse den eneste vej, ikke oprettelse af en ny.

Der ligger ni Facebook-forbindelser i kontoen, flere længe udløbne. Ryd op, men rør
ikke `14589446`.

## Fejlmønsteret

Når Facebook-tokenet invalideres (`OAuthException 190` — "the session has been
invalidated because the user changed their password or Facebook has changed the
session"), sker følgende:

1. Første lead efter token-døden fejler. Make skriver en advarsel: "Fix the error or
   clear the queue."
2. Make **deaktiverer** scenariet.
3. Efterfølgende leads lægges i hook-køen (`queueCount` stiger). De er ikke tabt —
   men de ligger stille, og ingen får besked.
4. Der kommer kun én fejlmail til Mikkel. Ingen anden alarm.

Konsekvensen: et scenarie kan være nede i dagevis, uden at kunden eller vi opdager
det. Tjek `queueCount` på hook'et og `isActive`/`isinvalid` på scenariet — ikke bare
om der er kommet en fejlmail.

## Sådan rettes det

1. **Genautorisér den eksisterende forbindelse** `14589446` i Make → Connections →
   *Reauthorize*. Opret ikke en ny forbindelse: en ny får et nyt id, som hverken
   hook'ene eller modulerne peger på, og scenarierne bliver ved at fejle.
2. Aktivér hvert ramt scenarie igen (`scenarios_activate`).
3. Køen tømmes af sig selv i samme øjeblik. Bekræft med `hooks_get` →
   `queueCount: 0`, og med `show_executions_list` at kørslerne har `status: success`
   og fuldt operationstal (Holms: 4–5, Carelax OMN: 6).
4. Verificér i modtagersystemet — Pipedrive eller CRM'et — at rækkerne faktisk er der.
   Make's `status: success` siger kun, at kaldet blev accepteret.

### Fælde: replay beviser intet

Et replay af en fejlet kørsel bruger **gemte trigger-data** og kalder aldrig Facebook.
`{"status":"SUCCESS"}` på et replay siger derfor intet om, hvorvidt tokenet virker. Det
kostede en fejlkonklusion 9. oktober 2026.

Vil man vide, om tokenet lever, skal man fremtvinge et **live**-kald til Facebook — fx
køre backfill-scenariet `9807783`, som starter med `listLeads`. Husk at sætte det
tilbage til inaktivt efter.

### Backfill dækker ikke alt

`9807783` henter kun `limit: 10` og kun fra formular `1493450252272167`. Det live
scenarie lytter på hele siden (`pageId 1143807065478844`), så leads fra andre
formularer — eller mere end 10 — bliver ikke fanget af en backfill. Den er et
plaster, ikke en genopretning.

## Hændelse: 8.–9. oktober 2026

Tokenet på `14589446` blev invalideret mellem **8. okt kl. 00:26 og 04:36** (UTC).
Carelax OMN-scenariet kørte tæt på døgnet rundt og indkredser tidspunktet; Holms fik
først et lead kl. 19:07 og fejlede dér.

| Scenarie | Ramt | Udfald |
|---|---|---|
| `9845303` Carelax OMN | Deaktiveret 8. okt 04:36. **11 leads i kø** i ~27 timer. | Alle 11 leveret 9. okt 07:14:55. Deals `5389`–`5399` i Pipedrive. |
| `9807778` Holms | Fejlede 8. okt 19:07 med **1 lead**. | Leveret 9. okt 07:07. |
| `9798554` Carelax Rygtjek | Forblev aktiv, kø tom. | Intet at genoprette. |

**Intet gik tabt.** Metas egne tal (`ads_get_ad_entities`, felt `lead`,
`time_increment: "1"`) bekræfter for Holms: 1 lead den 2. okt, 1 lead den 8. okt, nul
alle øvrige dage 1.–9. okt. Det stemmer med eksekveringshistorikken.

Den første genautorisering virkede ikke — der blev oprettet to nye, ubrugte
forbindelser (`14655840`, `14655842`) i stedet for at genautorisere `14589446`. De kan
slettes.

Bemærk ved oprydning: Kurt Madsen optræder to gange blandt de 11 (deals `5392` og
`5394`, personer `8140` og `8143`). To selvstændige indsendelser fra Meta, så det er
reelt — men nogen bør ikke ringe til ham to gange.

## Mangler

Der er **ingen overvågning**. Et dagligt tjek af, om forbindelserne stadig svarer,
ville fange det her før kunden gør. Ikke bygget — sig til.
