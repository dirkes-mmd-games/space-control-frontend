# Space Control – Browser-Frontend\n\n**Frontend-Version:** 1.2.0  \n**Stand:** 16. November 2026  \n**Cache-Kennung der ausgelieferten HTML-Referenzen:** `20261116-5`

Mobile Weboberfläche und Spielleiteransicht für den Hybrid-Demonstrator. Die Anwendung ist eine statische Website und läuft am Laptop sowie auf Smartphones direkt im Browser; es wird keine native App benötigt.

## Enthaltene Abläufe

- Anonyme Supabase-Anmeldung pro Browser über Supabase Auth.
- Partieerstellung durch die Spielleitung; die erstellende Identität erhält Adminrechte, wird aber nicht automatisch Spieler.
- Erzeugung eines gemeinsamen Einladungslinks und QR-Codes.
- Beitrittsanfrage mit Nickname nach dem Scannen des QR-Codes.
- Anzeige offener Beitrittsanfragen in der Spielleiteransicht.
- Freigabe oder Ablehnung einer Anfrage.
- Bei Freigabe werden Spieler und Konto mit 1.000 Credits serverseitig atomar angelegt.
- Nach dem Partie-Start wechselt die Spieleroberfläche in ein Cockpit mit drei Ansichten: Partie-Übersicht, Konto und geheime Aufträge.
- Die Übersicht zeigt Partiename, Mitspieler, Spielstatus, Startzeit und laufende Spielzeit. Die technische Partienummer wird nur verkürzt angezeigt.
- Im Konto können Spieler Überweisungsanfragen in 50-Credit-Schritten stellen. Offene Anfragen reservieren kein Guthaben. Der Empfänger bestätigt oder lehnt ab; erst nach Bestätigung werden die Konten atomar gebucht.\n- Eingehende offene Überweisungsanfragen öffnen unabhängig von der gerade angezeigten Spieleransicht einen Dialog. Der Empfänger kann direkt dort annehmen oder ablehnen. Die Erkennung erfolgt über das regelmäßige Dashboard-Polling (im aktiven Browser alle zehn Sekunden), nicht über Push oder Supabase Realtime.\n- Die Kontoansicht zeigt als zentrale Bewegungsübersicht die gebuchten Transaktionen; separat erscheinen nur offene eingehende Anfragen, für die eine Entscheidung aussteht.
- Im Spieler-Cockpit wird kein wechselnder Statushinweis neben der Cockpit-Kennzeichnung eingeblendet. Dadurch bleibt die Kopfzeile während der automatischen Aktualisierung unverändert und ruhig.
- Spieler sehen ihre eigenen Transaktionen und beteiligten Überweisungen. Die Spielleitung erhält einen Partie-Monitor mit vollständiger Transaktionshistorie.
- Pro Partie gibt es zehn geheime Beispielaufträge. Die Ziehung erfolgt zufällig ohne Zurücklegen; jeder Spieler erhält höchstens einen Auftrag. Der Auftrag kann nicht gewechselt werden und wird im Spielercockpit als gestaltete, responsive Auftragskarte dargestellt.
- Die Spielleitung kann alle zehn Aufträge und deren Vergabestatus einsehen.

## Dateien

- `index.html`: Seitenstruktur und Einstiegspunkt
- `styles.css`: responsive Darstellung für Laptop und Smartphone
- `app.js`: Browserlogik und Supabase-Aufrufe
- `config.js`: öffentliche Supabase-Projekt-URL und Publishable-/Anon-Key

## Supabase-Konfiguration

`config.js` enthält ausschließlich öffentliche Browser-Konfiguration. Dort dürfen niemals ein `service_role`-Key oder andere Secrets stehen.

Im Supabase-Projekt muss **Anonymous Sign-ins** aktiviert sein. Die Anwendung verwendet pro Browser eine anonyme Supabase-Identität und hält die Sitzung über den Supabase-Client im Browser persistent. Wird der Browser-Speicher gelöscht oder ein anderer Browser verwendet, entsteht eine andere Identität.

Die Oberfläche ruft folgende Edge Functions auf:

- `create_session`
- `create_session_invite`
- `request_session_join`
- `approve_join_request`
- `reject_join_request`
- `get_session_invite_info`

Zusätzlich verwendet die Anwendung folgende Datenbank-RPCs:
- `start_session`
- `get_player_account_dashboard`
- `create_transfer_request`
- `decide_transfer_request`
- `draw_secret_mission`
- `get_my_secret_mission`
- `admin_get_transfer_dashboard`
- `admin_get_secret_mission_pool`

Die Startfunktion verlangt mindestens zwei aktive Spieler und setzt `started_at`. Die Spielleitung ist keine automatische Spielteilnahme. Austritt und Pause sind im Player-Cockpit V1.0 bewusst noch nicht enthalten.

Die Liste offener Anfragen wird über die Tabelle `join_requests` gelesen. Die vorhandene RLS-Policy erlaubt diese Abfrage nur dem Partie-Admin beziehungsweise dem jeweiligen Antragsteller; die Adminberechtigung wird nicht aus der Browseroberfläche abgeleitet.

## Veröffentlichung mit GitHub Pages

1. Im Repository unter **Settings → Pages** öffnen.
2. Bei **Build and deployment** als Source **Deploy from a branch** wählen.
3. Branch **main**, Ordner **/(root)** auswählen und speichern.
4. Die Anwendung ist anschließend erreichbar unter:

   https://dirkes-mmd-games.github.io/space-control-frontend/

Direkter Einstieg für die Spielleitung (im Browser, in dem die Partie erstellt wurde):

   https://dirkes-mmd-games.github.io/space-control-frontend/?admin=1

Ein QR-Code enthält einen Link auf diese Website mit dem Einladungstoken als Query-Parameter. Der Token ist ein kurzlebiges Zugangsmittel für die Beitrittsanfrage und wird nach erfolgreicher Übermittlung aus der Adresszeile entfernt.

## Technischer Status und Grenzen

Der bisherige Einladungs- und Beitrittsablauf wurde vom Projektverantwortlichen erfolgreich mit iPhone und Android getestet. Die Player-Cockpit-Basisversion V1.0 wurde in `main` übernommen. Der aktuelle Frontend-Stand V1.1 liegt ebenfalls in `main`; die jüngsten HTML-Referenzen verwenden die Cache-Kennung `20261116-3`. Der Pages-Deploy für genau diese jüngste Revision ist noch nicht bestätigt. Das Backend V1.1 ist im Live-Supabase-Projekt `mbztajfcqunkbuismkkt` migriert; insbesondere verhindert die Migration `20261116084005_transfer_requests_no_balance_reservation`, dass offene Überweisungsanfragen Guthaben reservieren. Synthetische Datenbanktests für den vorherigen Cockpit-Stand wurden vollständig zurückgerollt. Der vollständige End-to-End-Test der aktuellen Frontend-/Backend-Kombination auf realen Geräten steht noch aus.

Die QR-Code-Erzeugung verwendet QRCode.js über cdnjs. Für einen produktiven Einsatz sollten zusätzlich restriktive CORS-Regeln, Rate-Limits und ein Wiederherstellungsweg für anonyme Identitäten geprüft werden.


## Versionsstand und Änderungsverlauf

| Komponente | Stand am 16.11.2026 | Hinweis |
|---|---:|---|
| Technischer Demonstrator | V1.1 | Fortschreibung des Player-Cockpit-Basisstands |
| Frontend | V1.1.1 | Globale Überweisungsbenachrichtigung, bereinigte Kontoansicht, Auftragskarte |
| Backend | V1.1 | Überweisungsanfragen ohne Guthabenreservierung; Bestätigung bucht atomar |
| HTML-/Asset-Cache | `20261116-5` | Cache-Kennung, keine fachliche Versionsnummer |

V1.1 bezeichnet den dokumentierten Quellcode-/Funktionsstand in GitHub, nicht automatisch eine bestätigte Live-Auslieferung über GitHub Pages. Die fachliche Produktdokumentation bleibt das Lastenheft 0.9 im Hauptrepository; diese Frontend-Version trifft keine Entscheidung über eine hybride Produktentwicklung.


**Frontend V1.2.0:** Cosmic-Design mit sternen-/nebelartigem Hintergrund, violett-blauen Kontrollflächen und angepassten Kontrasten. Direkter Admin-Einstieg über `/?admin=1`; bei vorhandenem Admin-Browserkontext wird die gespeicherte Partie direkt geöffnet. Die Adminberechtigung wird weiterhin serverseitig geprüft. Cache-Kennung: `20261116-5`.
