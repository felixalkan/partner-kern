# @partner/kern

Gemeinsamer Kern des Partner-Protokolls für Argus, Minerva und weitere persönliche Dashboards:
Terminfindung, Cowork-Format, Bereinigung und eine Konformitätsprüfung, die jedes System gegen sich selbst laufen lässt.

- Protokoll: [PROTOKOLL.md](PROTOKOLL.md)
- Regeln für Beiträge (auch für KIs): [AGENTS.md](AGENTS.md)
- Prüfen: `npm ci && npm run pruefen`

Jeder grüne Stand auf `main` bekommt automatisch eine Version `v1.N.0`. Die Partner-Systeme übernehmen sie automatisch,
wenn ihre eigenen Tests (inklusive Konformitätsprüfung) grün sind.
