# Space Control – Spieler-Frontend

Öffentliche, mobile Weboberfläche für den technischen Spieler-Anmeldetest.

## Aktueller Funktionsumfang

- Nickname-Eingabe (2–20 Zeichen)
- Aufruf der Supabase Edge Function `player-registration`
- Anzeige der Backend-Bestätigung oder eines Fehlers
- Keine Benutzerkonten, keine Authentifizierung und keine Speicherung von Spielerdaten

## Backend-Konfiguration

Die Verbindung ist in `config.js` hinterlegt. Dort dürfen ausschließlich die Supabase-Projekt-URL und ein öffentlicher Publishable-/Anon-Key stehen. **Niemals** einen `service_role`- oder anderen Secret-Key veröffentlichen.

Backend-Endpunkt: `/functions/v1/player-registration`

## Veröffentlichung mit GitHub Pages

1. Im Repository unter **Settings → Pages** öffnen.
2. Bei **Build and deployment** als Source **Deploy from a branch** wählen.
3. Branch **main**, Ordner **/(root)** auswählen und speichern.
4. Nach Abschluss des Deployments ist die Oberfläche erreichbar unter:

   https://dirkes-mmd-games.github.io/space-control-frontend/

## Sicherheit und Grenzen

Dies ist ein technischer Prototyp. Nicknames sind nicht eindeutig und stellen keine Identität oder Anmeldung mit Benutzerkonto dar. Das Backend bestätigt nur die Eingabe und speichert nichts. Vor einem produktiven Einsatz sind unter anderem restriktive CORS-Regeln, Missbrauchsschutz und ein echtes Authentifizierungs-/Spielersitzungskonzept erforderlich.
