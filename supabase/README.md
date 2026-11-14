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
