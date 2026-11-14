# Supabase – Hybrid-Demonstrator

## Stand
Die erste Datenbankmigration für das Hybrid-Datenmodell liegt unter
`migrations/20261114130000_initial_hybrid_schema.sql`.

Sie legt Tabellen, Constraints, Indizes, Sicherheits-Hilfsfunktionen und
erste Row-Level-Security-(RLS)-Leseregeln an.

## Enthalten
- Benutzerprofile und Partien
- Partieteilnehmer und sessionbezogene Adminrechte
- Einladungen und Beitrittsanfragen
- Spielerkonten und doppelte Buchungssätze
- Kartenvorlagen, Kartenpool und Kartenzuteilungen
- Admin-Audit-Log
- RLS für Teilnehmer- und Admin-Lesezugriffe

## Noch nicht enthalten
Die Migration stellt noch keinen vollständigen Spielbetrieb her. Insbesondere
sind die schreibenden Backend-Funktionen noch zu implementieren:
- Partie und Einladung anlegen
- Beitrittsanfrage stellen und bestätigen/ablehnen
- Konto initialisieren
- Credits atomar übertragen
- Karte atomar ziehen
- Adminzugriffe protokollieren

Für diese Aktionen sind bewusst keine direkten Schreib-Policies für
Browser-Clients angelegt. Schreibzugriffe müssen über geprüfte Edge Functions
oder Datenbankfunktionen erfolgen.

## Einspielen
1. Supabase-Projekt für den Demonstrator bereitstellen.
2. Anonyme Anmeldungen in Supabase Auth aktivieren.
3. Migration mit der Supabase CLI oder dem SQL Editor ausführen.
4. RLS- und Negativtests mit mindestens drei getrennten Benutzeridentitäten
   durchführen, bevor ein Frontend angeschlossen wird.

**Wichtig:** Diese Migration wurde in GitHub abgelegt, aber noch nicht gegen
ein konkretes Supabase-Projekt ausgeführt. Es wurden keine Zugangsdaten oder
Secrets im Repository gespeichert.


## Erste Backend-Funktion: create_session

Die Edge Function liegt unter `functions/create_session/index.ts`. Sie authentifiziert den Aufrufer über sein Supabase-Access-Token und ruft die Datenbankfunktion `public.create_session` auf.

Die Datenbankfunktion wird durch die Migration `20261114134000_create_session_rpc.sql` angelegt. Sie erstellt in **einer Transaktion**:
- die Partie,
- den Ersteller als ersten normalen Teilnehmer,
- dessen separate Adminberechtigung,
- das Spielerkonto mit standardmäßig 1.000 Credits,
- den zugehörigen Eröffnungsbuchungssatz.

Aufruf: `POST /functions/v1/create_session`

Beispiel-JSON:
```json
{
  "game_id": "space-control",
  "display_name": "Space Control – Demonstrator",
  "nickname": "Dirk",
  "max_members": 3
}
```

Die Migration muss vor dem Deploy der Edge Function angewendet werden. Danach kann die Funktion mit der Supabase CLI deployed werden. Erforderlich sind die regulären Supabase-Projektvariablen `SUPABASE_URL` und `SUPABASE_ANON_KEY`; ein Service-Role-Schlüssel wird nicht im Browser verwendet.

**Status:** Code in GitHub gespeichert; weder Migration noch Edge Function wurden bereits in einem Supabase-Projekt ausgeführt bzw. deployed. Ein Laufzeittest benötigt ein eingerichtetes Supabase-Projekt.
