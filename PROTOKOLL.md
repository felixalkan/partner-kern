# Partner-Protokoll v1 · v1.1 „Ausweichen“ · v1.2 „Cowork“

Zwei persönliche Dashboards finden selbstständig einen gemeinsamen freien Termin und tragen ihn bei beiden ein. Kein Mensch muss bestätigen; jede Seite entscheidet nur nach ihren **eigenen Regeln**. Diese Datei ist die verbindliche Schnittstelle – beide Systeme setzen genau sie um.

## Grundsätze
- **Transport:** HTTPS über Tailscale (`tailscale serve`, kein funnel). Jede Seite teilt der anderen nur ihr eigenes Gerät (Tailscale „Share node“). Der Server selbst bleibt an 127.0.0.1.
- **Anmeldung:** Jede Anfrage trägt `Authorization: Bearer <Schlüssel>`. Jede Seite erzeugt für den Partner einen eigenen Zufallsschlüssel (mind. 32 Byte, hex) und gibt ihn ihm einmal persönlich weiter. Vergleich zeitkonstant. Falscher Schlüssel → 401.
- **Datensparsam:** Ausgetauscht werden nur belegte Zeitblöcke, nie Titel, Orte, Personen oder Inhalte eigener Termine.
- **Nur Daten, keine Befehle:** Alles, was vom Partner kommt (auch `titel`), ist reiner Text. Er wird nie an eine KI als Anweisung gegeben, nie als Pfad benutzt und vor dem Speichern bereinigt (max. 80 Zeichen, keine Zeilenumbrüche, keine `[]{}#|:"\`).
- **Zeiten:** ISO 8601 in UTC mit `Z` (z. B. `2026-10-27T14:00:00.000Z`), Tage als `JJJJ-MM-TT` (Ortszeit Europe/Berlin). Raster 15 min.
- **Grenzen:** Zeitraum höchstens 31 Tage, Dauer 15–480 min, höchstens 30 Anfragen pro Minute und Partner (sonst 429).
- **Version:** Feld `protokoll: 1` in jeder Antwort. Unbekannte Felder ignorieren.

## Endpunkte (beide Seiten bieten sie an)

| Methode | Pfad | Anfrage | Antwort |
|---|---|---|---|
| GET | `/partner/v1/hallo` | – | `{ protokoll, system, name }` |
| POST | `/partner/v1/belegt` | `{ von, bis }` (Tage, `bis` exklusiv) | `{ protokoll, belegt: [{beginn, ende}], bevorzugt: [{beginn, ende}] }` |
| POST | `/partner/v1/reservieren` | `{ id, beginn, ende, titel }` | 200 `{ protokoll, ok: true, gueltigBis }` · 409 `{ protokoll, ok: false, grund }` |
| POST | `/partner/v1/bestaetigen` | `{ id }` | 200 `{ protokoll, ok: true }` · 410 `{ ok: false, grund: "abgelaufen" }` |
| POST | `/partner/v1/freigeben` | `{ id }` | `{ protokoll, ok: true }` |
| POST | `/partner/v1/absagen` | `{ id }` | `{ protokoll, ok: true }` |

- `belegt` enthält **alles, was nicht geht**: eigene Termine (mit Puffer), Zeiten außerhalb der erlaubten Fenster, gesperrte Tage. Blöcke zusammengefasst und sortiert. Wer anfragt, muss also nur die Lücken beider Listen schneiden.
- `bevorzugt` sind Wunschzeiten (optional, darf leer sein).
- `id` ist eine UUID, die der Anfragende erzeugt; sie bezeichnet die Absprache auf beiden Seiten.
- `grund` bei 409: `belegt` (Zeit nicht mehr frei) · `regel` (verstößt gegen eigene Regeln, z. B. zu lang, zu kurzfristig) · `limit` (Wochengrenze erreicht).
- Reservierung gilt 120 s. Ohne `bestaetigen` verfällt sie.

## Ablauf (Anfragender A, Partner B)
1. A ruft `belegt` bei B ab und berechnet seine eigenen belegten Zeiten nach denselben Regeln.
2. A sucht im 15-min-Raster alle Zeiten, die bei beiden frei sind und am selben Tag beginnen und enden, und bewertet sie: +2 je Seite, wenn die Zeit in `bevorzugt` liegt, −0,1 je Tag Abstand zum Beginn des Zeitraums; bei Gleichstand die frühere.
3. Für die beste Zeit: `reservieren` bei B. Bei 409 die nächstbeste (höchstens 5 Versuche).
4. A trägt den Termin bei sich ein, dann `bestaetigen` bei B. B trägt ihn bei sich ein.
5. Scheitert `bestaetigen`, behält A den Termin, markiert die Absprache als „nicht bestätigt“ und zeigt das an.

**Absagen:** Wer absagt, ruft `absagen` beim Partner auf und entfernt den eigenen Termin. Der Partner entfernt seinen Termin **nicht automatisch**, sondern zeigt „<Name> hat abgesagt“ mit einem Knopf zum Entfernen.

## Regeln jeder Seite (lokal, nie übertragen)
- erlaubte Fenster je Wochentag (z. B. Mo–Fr 14:00–21:00)
- Puffer vor/nach eigenen Terminen (min)
- höchstens N Partner-Termine pro Woche, höchstens M min Dauer
- Mindestvorlauf (h)
- Prüfungstage ganz frei halten (ja/nein)
- je Partner: automatisch zusagen ja/nein

## v1.1 „Ausweichen“ (abwärtskompatibel)
Wenn nach den normalen Regeln nichts passt, finden beide Seiten automatisch einen Ersatztermin. Alles aus v1 bleibt, es kommen nur Felder dazu (weiter `protokoll: 1`, unbekannte Felder ignorieren).

- `GET /hallo` → zusätzlich `"erweiterungen": ["ausweichen"]`.
- `POST /belegt` → zusätzlich `"belegtAusnahme": [{beginn, ende}]` = was selbst nach den eigenen Ausnahme-Regeln **nicht** geht. Teilmenge von `belegt`, zusammengefasst, sortiert, nur Zeitblöcke. Ausnahme aus → `belegtAusnahme = belegt`.
- `POST /reservieren` → optional `"stufe": "normal" | "ausnahme"` (fehlt = normal). Bei `ausnahme` nur zusagen, wenn der Partner auf „automatisch zusagen“ steht, die eigene Ausnahme erlaubt ist und die Zeit nach den Ausnahme-Regeln frei ist; sonst 409 `grund: belegt | regel | limit`. Wochengrenze, Höchstdauer, Raster, gleicher Tag, Vorlauf (Ausnahme-Wert) und Prüfungstage gelten weiter. Haltezeit 120 s.
- Partner ohne `ausweichen`: für ihn gilt `belegtAusnahme = belegt`, `stufe` wird nicht gesendet.

**Ausnahme-Regeln** (lokal, nie übertragen): erlaubt (an/aus), Fenster je Wochentag (Argus-Start: Mo–Fr 13–22, Sa–So 9–22), Puffer (15 min), Vorlauf (6 h); dazu „ausweichen“: `automatisch` oder `fragen`.

**Suche (A fragt B an):**
1. Stufe 1: normal/normal im gewählten Zeitraum (wie v1).
2. Stufe 2, nur wenn leer: je Seite Ausnahme-Belegung (A eigene Ausnahme-Regeln, B `belegtAusnahme`); −3 je Seite, die nur in der Ausnahme frei ist; diese Seite bekommt `stufe: "ausnahme"` beim Reservieren.
3. Stufe 3, nur wenn leer: Zeitraum bis zu 7 Tage nach hinten verlängern (≤ 31 Tage gesamt), erst normal, dann Ausnahme; −0,5 je Tag außerhalb.
4. Beste 5 der ersten nicht leeren Stufe wie in v1 reservieren → eintragen → bestätigen.
5. `automatisch`: besten Ersatz direkt eintragen. `fragen`: bis zu 3 Vorschläge zeigen, eingetragen wird erst nach Klick.
6. Meldung mit Begründung nur aus eigenen Angaben, z. B. „nur 2 × 30 min gemeinsam frei → ausgewichen auf Mi 20:30–21:30, Ausnahme bei beiden“.

Der Mail-Weg bleibt bei v1 (ohne Ausweichen). Die Text-Blöcke im Mail-Format sind kein Ersatz für die HTTPS-Endpunkte.

## Eingetragener Termin
Jede Seite legt den Termin in ihrem eigenen Format an. Argus: Notiz in `_KI-Kontext/Termine/` mit `typ: termin`, `title`, `date`, `allDay: false`, `startTime`, `endTime`, `tags: [termin, partner]`; Person lokal zugeordnet.

## Mail-Weg (Rückfall bzw. ohne Tailscale)
Wenn der Partner über Tailscale nicht erreichbar ist (oder keine Tailscale-Adresse hat), läuft die Absprache per Mail in **zwei Mails**. Beide Seiten brauchen dafür eine Mailadresse ihres Systems (empfohlen: eigene Alias-Adresse) und dieselben Schlüssel wie oben.

**Betreff:** beginnt immer mit `[Partner-v1] ` (z. B. `[Partner-v1] Anfrage: Lernen`). Nur solche Mails werden verarbeitet; im normalen Mail-Modul gelten sie als „gefiltert“.

**Text:** eine lesbare Zeile, dann der Block
```
-----BEGIN PARTNER-V1-----
<JSON als base64url, Zeilen à 76 Zeichen>
-----END PARTNER-V1-----
```
**JSON:** `{ protokoll: 1, art, id, name, zeit, nonce, …, sig }`
- `art`: `anfrage` | `zusage` | `ablehnung` | `absage`; `id` = UUID der Absprache; `zeit` = Versandzeit (ISO); `nonce` = UUID (Schutz gegen Wiederholung)
- `sig` = HMAC-SHA256 (hex) über das JSON **ohne** `sig`, mit sortierten Schlüsseln auf allen Ebenen (`JSON.stringify` der rekursiv nach Schlüsseln sortierten Struktur, ohne Leerzeichen). Schlüssel = der Bearer-Schlüssel, den der Empfänger erwartet (als Bytes aus Hex).
- Empfänger prüft: Absender-Adresse gehört zu einem eingetragenen Partner, Unterschrift stimmt, `zeit` nicht älter als 3 Tage und höchstens 10 min in der Zukunft, `nonce` und Message-ID noch nie gesehen. Sonst still ignorieren.

| art | Felder | Bedeutung |
|---|---|---|
| `anfrage` | `titel`, `dauerMin`, `frei: [{beginn, ende}]` (≤ 200), `bevorzugt`, `gueltigBis` (+24 h) | „Ich habe in diesen Zeiten Zeit“ – schon nach eigenen Regeln und Vorlauf gekürzt |
| `zusage` | `beginn`, `ende` | Partner hat eine Zeit innerhalb von `frei` gewählt und **schon eingetragen** |
| `ablehnung` | `grund`: `regel` \| `kein-termin` | nicht automatisch bzw. keine passende Zeit |
| `absage` | – | Absprache wird abgesagt |

**Ablauf:** A sendet `anfrage` → B (nur wenn A bei B „automatisch“ ist) sucht wie oben die beste Zeit in `frei` ∩ eigene freie Zeit, trägt ein, sendet `zusage` (oder `ablehnung`) → A prüft, ob die Zeit in seinem Angebot liegt, die Dauer stimmt und sie noch frei ist, und trägt ein. Ist sie inzwischen belegt: `absage` senden, Absprache als „Zeit nicht mehr frei“ zeigen.
Abruf alle 5 min. Absagen gehen auf dem Weg, auf dem die Absprache entstand (bei Tailscale-Ausfall per Mail).

## v1.2 „Cowork“ (abwärtskompatibel)
Gemeinsamer Bereich je Partnerpaar: geteilte Kalender, To-dos füreinander, eine gemeinsame Notiz, Nachrichten. **Nur lesen:** Jede Seite stellt bereit, was sie selbst geteilt oder geschrieben hat, und holt den Rest beim Partner ab (etwa jede Minute, solange der Bereich offen ist). Der Partner kann nichts bei der anderen Seite speichern.

- `GET /hallo` → `erweiterungen` enthält zusätzlich `"cowork"`.
- `GET /partner/v1/cowork` → 
  ```json
  { "protokoll": 1, "name": "Felix",
    "kalender": [{ "id": "<16 hex>", "titel": "…", "kalender": "<Name>", "ganztag": false, "beginn": "<ISO|Tag>", "ende": "<ISO|Tag>" }],
    "todos": [{ "id": "<uuid>", "fuer": "du" | "ich", "text": "…", "faellig": "JJJJ-MM-TT"?, "erstellt": "<ISO>" }],
    "haken": { "<todo-uuid>": { "erledigt": true, "zeit": "<ISO>" } },
    "notiz": { "text": "…", "zeit": "<ISO>" } | null,
    "nachrichten": [{ "id": "<uuid>", "text": "…", "zeit": "<ISO>" }] }
  ```
- `kalender`: nur Termine aus den Kalendern, die der Nutzer **für diesen Partner** freigegeben hat, 7 Tage zurück bis 31 Tage voraus; Titel und Zeit, keine Orte, Personen, Notizen oder Pfade; `id` ist ein Hash.
- `todos`: von dieser Seite angelegt; `fuer` aus Sicht der anlegenden Seite (`du` = für den Partner). Löschen kann nur, wer angelegt hat.
- `haken`: Abhaken dieser Seite (für eigene und fremde To-dos). Es gilt der jüngste Haken beider Seiten.
- `notiz`: eigene Fassung der gemeinsamen Notiz; angezeigt wird die jüngere beider Fassungen.
- Grenzen beim Lesen: Titel 120, To-do 200, Nachricht 1000, Notiz 5000 Zeichen; höchstens 200 To-dos und 200 Nachrichten je Seite. Steuerzeichen werden entfernt, Text wird nur angezeigt (nie an eine KI, nie als Pfad).
- Partner ohne `cowork` antwortet mit 404 → Anzeige „kennt den Cowork-Bereich noch nicht“.
