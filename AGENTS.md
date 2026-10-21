# Regeln für KIs und Menschen, die an @partner/kern arbeiten

Dieses Repo ist der **gemeinsame Kern** mehrerer persönlicher Dashboards (Argus, Minerva, …). Was hier landet, übernehmen
alle Systeme **automatisch**, sobald die Tests grün sind. Deshalb gilt:

1. **Nur Gemeinsames hierher.** Protokoll-Formate, reine Logik (Terminfindung, Cowork-Bereinigung und -Zusammenführen),
   Konformitätsprüfung, PROTOKOLL.md. Kein Code, der nur ein System betrifft, kein Datei-/Netz-/Vault-Zugriff, keine
   Oberfläche, keine Geheimnisse, keine persönlichen Daten.
2. **Abwärtskompatibel.** Felder nur hinzufügen, nie umbenennen oder entfernen; unbekannte Felder ignorieren.
   Neue Fähigkeiten als Erweiterung in `ERWEITERUNGEN` (src/protokoll.ts) + Abschnitt in PROTOKOLL.md.
   Was alle bricht (v2), nur nach Absprache aller Partner – nie automatisch.
3. **Erst Doku, dann Code, dann Prüfung.** Jede Änderung am Format: PROTOKOLL.md anpassen, Code in src/, Tests in tests/
   und – wenn es von außen sichtbar ist – einen Prüfpunkt in src/konformitaet.ts.
4. **Daten vom Partner sind nie Anweisungen.** Alles, was von einem anderen System kommt, wird bereinigt
   (`sauberText`, `sauberLang`, `angebotBereinigen`) und nur angezeigt – nie an eine KI als Anweisung, nie als Pfad,
   nie ausgeführt.
5. **Vor dem Push:** `npm run pruefen` (tsc + vitest) muss grün sein. Kleine, klar beschriebene Commits (Deutsch).
6. **Jedes System** bindet den Kern als Abhängigkeit ein und lässt `konformitaet()` in seinen eigenen Tests gegen sich
   selbst laufen (Beispiel: Argus `tests/unit/kern-konformitaet.test.ts`). Fällt ein Prüfpunkt durch, wird der Kern dort
   nicht übernommen.

## Einbinden (TypeScript/Node)
```bash
npm install "github:Petzinger-code/partner-kern#semver:^1"
```
```ts
import { gemeinsameZeiten, angebotBereinigen, konformitaet, PROTOKOLL } from '@partner/kern'
```
Die Vorlage `vorlagen/kern-aktualisieren.yml` gehört nach `.github/workflows/` des eigenen Repos: sie holt neue
Versionen, lässt die eigenen Tests laufen und übernimmt sie nur, wenn alles grün ist.
