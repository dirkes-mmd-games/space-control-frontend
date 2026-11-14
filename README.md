# Space Control – Browser-Frontend

Mobile Weboberfläche und Spielleiteransicht für den Hybrid-Demonstrator. Die Anwendung ist eine statische Website und läuft am Laptop sowie auf Smartphones direkt im Browser; es wird keine native App benötigt.

## Enthaltene Abläufe

- Anonyme Supabase-Anmeldung pro Browser über Supabase Auth.
- Partieerstellung durch die Spielleitung; die erstellende Identität erhält Adminrechte, wird aber nicht automatisch Spieler.
- Erzeugung eines gemeinsamen Einladungslinks und QR-Codes.
- Beitrittsanfrage mit Nickname nach dem Scannen des QR-Codes.
- Anzeige offener Beitrittsanfragen in der Spielleiteransicht.
- Freigabe oder Ablehnung einer Anfrage.
- Bei Freigabe werden Spieler und Konto mit 1.000 Credits serverseitig atomar angelegt.

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

Die Liste offener Anfragen wird über die Tabelle `join_requests` gelesen. Die vorhandene RLS-Policy erlaubt diese Abfrage nur dem Partie-Admin beziehungsweise dem jeweiligen Antragsteller; die Adminberechtigung wird nicht aus der Browseroberfläche abgeleitet.

## Veröffentlichung mit GitHub Pages

1. Im Repository unter **Settings → Pages** öffnen.
2. Bei **Build and deployment** als Source **Deploy from a branch** wählen.
3. Branch **main**, Ordner **/(root)** auswählen und speichern.
4. Die Anwendung ist anschließend erreichbar unter:

   https://dirkes-mmd-games.github.io/space-control-frontend/

Ein QR-Code enthält einen Link auf diese Website mit dem Einladungstoken als Query-Parameter. Der Token ist ein kurzlebiges Zugangsmittel für die Beitrittsanfrage und wird nach erfolgreicher Übermittlung aus der Adresszeile entfernt.

## Technischer Status und Grenzen

Der Browser-Client ist in GitHub gespeichert. Die Anwendung wurde hier nicht gegen ein laufendes Supabase-Projekt ausgeführt. Vor einem realen Spieletest müssen die Datenbankmigrationen in der vorgesehenen Reihenfolge ausgeführt, die Edge Functions deployed und die Supabase-Einstellung für anonyme Anmeldungen aktiviert werden.

Die QR-Code-Erzeugung verwendet QRCode.js über cdnjs. Für einen produktiven Einsatz sollten zusätzlich restriktive CORS-Regeln, Rate-Limits und ein Wiederherstellungsweg für anonyme Identitäten geprüft werden.
