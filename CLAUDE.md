# fbads

Drift af Meta-annoncering for kunder hos Frost Digital / onlinemarketing.nu.

Repoet holder driftsviden, som planlagte rutiner har brug for. En planlagt kørsel
starter uden hukommelse fra tidligere sessioner — alt, der skal overleve, står her.

## Rutiner

- [Holmsmaler — leads fra Meta Ads](routines/holmsmaler-leads.md)

## Automatisering

- [Make: lead-scenarier og Facebook-forbindelsen](routines/make-forbindelser.md) — scenarie- og hook-ID'er, fejlmønsteret når Facebook-tokenet dør, og hvordan det rettes.

## Generelt om lead-håndtering

**Meta Ads MCP kan ikke hente lead-oplysninger.** Feltkataloget indeholder præcis ét
lead-felt: `lead` (heltal, antal). `lead_id`, `full_name`, `phone_number`, `email` og
`leadgen_form` findes ikke. Meta Ads MCP kan altså bruges til at se *om* og *hvor mange*
leads der er kommet, og hvornår — men aldrig hvem.

**Kontaktoplysninger hentes via Zapier MCP → Facebook Lead Ads.** Det kræver ikke, at en
zap er aktiv. Zappen `FB Leads -> Email (HolmsMaler)` har været på pause siden 10-08-2026
(kontoen røg på Free-planen, og Facebook Lead Ads er en premium-app), men selve
handlingen kan stadig kaldes direkte på forespørgsel. Verificeret 09-09-2026: hentede 30
leads tilbage til juni med pauset zap.

Brug de to kilder sammen: Meta Ads MCP til at bekræfte antal og dato, Zapier til
oplysningerne. Hvis de to ikke stemmer overens, sig det til Mikkel frem for at gætte.
