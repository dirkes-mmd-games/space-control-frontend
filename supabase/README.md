# Supabase – Hybrid-Demonstrator

## Stand

Das Datenbankschema liegt unter `migrations/`. Die ursprüngliche Migration
`20261114130000_initial_hybrid_schema.sql` legt Tabellen, Constraints,
Indizes, Sicherheits-Hilfsfunktionen und erste RLS-Leseregeln an.

Die Migration `20261114134000_create_session_rpc.sql` ergänzt die erste
Version von `create_session`. Die nachfolgende Migration
`20261114135000_create_session_game_master_only.sql` korrigiert den Ablauf:
Der Ersteller wird nur als Partie-Admin eingetragen, nicht automatisch als
Mitspieler.

## Rollen- und Beitrittsmodell

- Dirk erstellt und verwaltet die Partie zunächst am Laptop.
- `create_session` legt die Partie an und vergibt Dirk die sessionbezogene
  Adminberechtigung.
- Bei der Partieerstellung werden ausdrücklich weder ein Mitspieler-Datensatz
  noch ein Spielerkonto für Dirk erzeugt.
- Dirk, Markus und Marc scannen anschließend denselben QR-Code.
- Alle drei stellen eine Beitrittsanfrage; Dirk bestätigt jede Anfrage am Laptop.
- Erst nach Bestätigung werden Mitspieler-Datensatz und Startkonto mit
  standardmäßig 1.000 Credits atomar angelegt.
- Dirk bleibt Admin und wird zusätzlich erst durch seinen eigenen bestätigten
  Beitritt normaler Mitspieler.

Die ausführliche Ablauf- und Sicherheitsbeschreibung steht in
[`docs/spielbetrieb/spielverwaltung-und-beitritt.md`](../docs/spielbetrieb/spielverwaltung-und-beitritt.md).

## Edge Function: create_session

Datei: `functions/create_session/index.ts`

Aufruf: `POST /functions/v1/create_session`

Beispiel-JSON:

```json
{
  "game_id": "space-control",
  "display_name": "Space Control – Demonstrator",
  "max_members": 3
}
```

Die Funktion authentifiziert den Aufrufer über sein Supabase-Access-Token und
ruft die Datenbankfunktion `public.create_session` auf. Der Aufrufer wird als
Partie-Admin eingetragen, aber noch nicht als Spieler angelegt.

## Edge Function: create_session_invite

Datei: `functions/create_session_invite/index.ts`

Aufruf: `POST /functions/v1/create_session_invite`

Beispiel-JSON:

```json
{
  "session_id": "<UUID der Partie>"
}
```

Die Funktion prüft die authentifizierte Identität und lässt die Datenbankfunktion
`public.create_session_invite` die Adminberechtigung kontrollieren. Sie erzeugt
einen kryptografisch zufälligen Token mit 256 Bit Entropie. In der Datenbank
wird ausschließlich der SHA-256-Hash gespeichert; der Klartext-Token wird dem
Admin einmalig in der Antwort zurückgegeben. Die Einladung läuft nach 24 Stunden
ab und erlaubt höchstens so viele bestätigte Beitritte wie `max_members` der Partie. Die spätere Freigabefunktion zählt die Nutzung atomar bei der Bestätigung, nicht bereits beim Stellen einer Anfrage.

Wird ein neuer QR-Code erzeugt, werden vorherige noch aktive Einladungen dieser
Partie widerrufen. Der Client setzt den zurückgegebenen Token in die Beitritts-URL
ein und rendert daraus den QR-Code. Die konkrete Frontend-URL wird nicht im
Backend fest verdrahtet.

## Noch nicht enthalten

Die Backend-Funktionen für folgende Abläufe sind noch zu implementieren:

- Beitrittsanfrage stellen und durch Dirk bestätigen/ablehnen
- Teilnehmer und Startkonto bei bestätigtem Beitritt atomar anlegen
- Credits atomar übertragen
- Geheime Karte atomar ziehen
- Adminzugriffe protokollieren

Für kritische Aktionen gibt es bewusst keine direkten Schreib-Policies für
Browser-Clients. Schreibzugriffe müssen über geprüfte Edge Functions oder
Datenbankfunktionen erfolgen.

## Einspielen und Deployment

1. Supabase-Projekt für den Demonstrator bereitstellen.
2. Anonyme Anmeldungen in Supabase Auth aktivieren.
3. Alle Migrationen in zeitlicher Reihenfolge mit der Supabase CLI oder dem
   SQL Editor ausführen.
4. Edge Function deployen.
5. RLS- und Negativtests mit mindestens drei getrennten Benutzeridentitäten
   durchführen, bevor ein Frontend angeschlossen wird.

**Wichtig:** Die Migrationen und Edge Function sind in GitHub gespeichert,
aber noch nicht gegen ein konkretes Supabase-Projekt ausgeführt bzw. deployed.
Es wurden keine Zugangsdaten oder Secrets im Repository gespeichert.
