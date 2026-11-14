# Spielleitung und Spielerbeitritt – korrigierter Ablauf

**Projekt:** Space Control – Hybrid-Demonstrator  
**Stand:** 14.11.2026  
**Status:** Technische Zielvorgabe; Code in GitHub, noch nicht auf Supabase ausgeführt.

## Verbindliche Rollenaufteilung

Spielleitung und Partieteilnahme sind zwei voneinander unabhängige Eigenschaften:

- Dirk erstellt und verwaltet die Partie zunächst am Laptop.
- Bei der Partieerstellung erhält Dirk ausschließlich die sessionbezogene Adminberechtigung.
- Dirk wird dabei ausdrücklich **nicht** als Mitspieler angelegt und erhält noch kein Spielerkonto.
- Anschließend scannen Dirk, Markus und Marc denselben QR-Code.
- Alle drei stellen eine Beitrittsanfrage und warten auf Dirks Freigabe.
- Dirk bestätigt die Anfragen in seiner Spielleiteransicht. Nach Freigabe wird jede Person als normaler Mitspieler angelegt und erhält genau ein Konto mit 1.000 Credits.
- Dirk bleibt parallel Spielleiter/Admin und ist als Spieler hinsichtlich seiner eigenen Karte und seines Kontos denselben Regeln unterworfen wie Markus und Marc.

## Ablauf

1. Dirk meldet sich im Browser an und erstellt am Laptop eine Partie.
2. Das Backend speichert die Partie und vergibt Dirk die Adminberechtigung. Es erzeugt weder einen Teilnehmerdatensatz noch ein Spielerkonto.
3. Dirk erzeugt einen Einladungscode und zeigt den dazugehörigen QR-Code an.
4. Dirk, Markus und Marc scannen denselben QR-Code auf ihren jeweiligen Smartphones.
5. Jeder Browser authentifiziert sich mit einer eigenen anonymen Supabase-Identität und sendet eine Beitrittsanfrage mit Nickname.
6. Dirk prüft die Anfragen am Laptop und bestätigt jede einzeln.
7. Erst bei Bestätigung werden Teilnehmerdatensatz und Startkonto atomar angelegt.
8. Die drei Mitspieler erhalten jeweils ihre eigene Spieleransicht und später eine geheime Auftragskarte.

## Teilnehmergrenze

Die Demonstratorpartie hat maximal drei Spieler. Der Spielleiter zählt nicht automatisch als Spieler; Dirk belegt erst nach seiner bestätigten eigenen Beitrittsanfrage einen der drei Plätze.

## Sicherheitsregeln

- Adminrechte werden ausschließlich bei der Partieerstellung serverseitig an den authentifizierten Ersteller vergeben.
- Der QR-Code überträgt keine Adminberechtigung.
- Nickname oder übermittelte Benutzer-ID begründen niemals Adminrechte.
- Eine offene Beitrittsanfrage gewährt keinen Zugriff auf Partiedaten.
- Nur ein Partie-Admin darf Anfragen bestätigen oder ablehnen.
- Bestätigung, Teilnehmeranlage und Kontoerstellung erfolgen atomar und idempotent.
- Die normale Spieleransicht berücksichtigt keine Admin-Sonderrechte; sie zeigt nur die eigenen vertraulichen Spielerdaten.

## Einladung und QR-Code

- Nur Dirk als Partie-Admin kann eine Einladung erzeugen.
- Das Backend erstellt einen kryptografisch zufälligen Token mit 256 Bit Entropie.
- Gespeichert wird ausschließlich der SHA-256-Hash; der Klartext-Token wird dem Admin nur bei der Erstellung zurückgegeben.
- Die Einladung ist 24 Stunden gültig und erlaubt höchstens so viele bestätigte Beitritte wie die maximale Spielerzahl der Partie (im Demonstrator drei). Die Nutzung wird erst bei der späteren Bestätigung gezählt, nicht schon bei einer offenen oder abgelehnten Anfrage.
- Eine neu erzeugte Einladung widerruft zuvor aktive Einladungen derselben Partie. Dadurch ist immer nur der zuletzt ausgegebene QR-Code gültig.
- Das Backend liefert den Token, nicht eine fest codierte Webadresse. Das Browser-Frontend ergänzt den Token zur passenden Beitrittsroute und erzeugt daraus den QR-Code.
- Die spätere Beitrittsfunktion prüft Hash, Ablaufzeit, Widerruf und Nutzungslimit serverseitig.

## Konsequenz für die Backend-Funktionen

- `create_session`: Partie anlegen und Ersteller als Partie-Admin eintragen; **keine** Spieleranlage.
- `create_session_invite`: sicheren Einladungstoken erzeugen und den QR-Code-Client mit den dafür nötigen Daten versorgen.
- `request_session_join`: Anfrage für jeden der drei Spieler entgegennehmen.
- `approve_join_request`: bestätigten Spieler und Startkonto atomar anlegen.
- `reject_join_request`: Anfrage ablehnen, ohne Teilnehmer oder Konto anzulegen.

## Abnahmekriterien

- Nach `create_session` existiert genau eine Partie und eine Adminberechtigung für Dirk.
- Nach `create_session` existiert noch kein Teilnehmerdatensatz und kein Spielerkonto für Dirk.
- Dirk kann denselben QR-Code wie Markus und Marc scannen.
- Erst nach seiner eigenen bestätigten Anfrage wird Dirk als Spieler registriert.
- Nach drei bestätigten Beitritten sind genau drei Spieler und drei Konten vorhanden.
