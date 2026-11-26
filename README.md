# iv4ever

Rundenbasiertes 4X-Strategiespiel im Browser – Hexfelder, 2.5D-Ansicht, WebGL.

## Start

```bash
nvm use            # Node 26
npm install
npm run dev        # http://localhost:5173
```

## Steuerung

| Eingabe | Wirkung |
|---|---|
| Ziehen, WASD, Pfeiltasten | Karte bewegen |
| Mausrad, Trackpad-Pinch, `+` / `−` | Zoomen |
| Klick | Einheit, Stadt bzw. Feld wählen (erneuter Klick wechselt im Stapel) |
| Klick auf Feld bei offener Stadt | Feld fest bewirtschaften / freigeben |
| Rechtsklick oder `M` + Klick | Ausgewählte Einheit zum Feld schicken bzw. Gegner angreifen (Vorschau zeigt Runden bzw. Siegchance) |
| `Leertaste` | Einheit überspringt diese Runde |
| `F` | Befestigen / Schlafen bzw. Aufwecken |
| `B` | Stadt gründen (Siedler) |
| `L` | Landeinheiten auf das ausgewählte Schiff laden |
| Rechtsklick mit Flugzeug | Feindliches Ziel im Einsatzradius: Luftangriff · eigene Stadt/Träger: verlegen |
| `Tab` | Nächste Einheit, die einen Befehl braucht |
| `T` | Technologien (Forschungsziel wählen) |
| `K` | Diplomatie, Handel und Siegfortschritt (vorher `D`, kollidierte mit der Kamera) |
| `P` | Leitbilder (Politik) |
| `F1` / `?` | Handbuch |
| `R` (Händler) | Handelsroute errichten |
| `Enter` | Runde beenden |
| `Entf` | Einheit auflösen |
| `H` | Zur ausgewählten Einheit |
| `G` / `Shift + R` | Gitter / Ressourcen ein/aus |
| `Strg/⌘ + S` | Schnellspeichern (Laden über „Laden ▾“) |
| `Esc` | Auswahl aufheben |
| `C` | Kartencursor: Pfeiltasten wandern über die Karte, jedes Feld wird angesagt (Screenreader); Enter wählt bzw. schickt die Einheit hin |
| `X` | Debug (nur Dev-Server, nicht online): Karte aufdecken |
| `Shift + P` | Debug (nur Dev-Server): Plünderer neben die ausgewählte Einheit setzen |
| Minimap klicken/ziehen | Springen |
| Touch: lange drücken | wie Rechtsklick (Einheit bewegen/angreifen) |

Alle Tasten lassen sich unter ⚙ → Tastenbelegung ändern; die Hilfezeile zeigt immer die aktuelle Belegung.

Gleicher Seed + gleiche Einstellungen = gleiche Karte. Die Welt ist ost-west umlaufend.
Einstellungen (⚙): Klang, Animationen, Kontrast, Schriftgröße, Farben für Farbsehschwäche, Tutorial.

## Mehrspieler

- **Hotseat**: In der Kopfleiste „Modus: Hotseat (2–4)“ wählen und „Neues Spiel“. Zwischen den Zügen verdeckt ein Übergabebildschirm die Karte.
- **Online** (2–8 Menschen): Einer startet den Relay-Server (`npm run server`, Port 8787, über `PORT` änderbar). Alle wählen
  „Modus: Online …“ → „Neues Spiel“, tragen die Serveradresse ein (z. B. `ws://192.168.1.10:8787`), der Gastgeber erstellt einen
  Raum, die anderen treten mit dem Code bei. Der Gastgeber startet mit den Karteneinstellungen aus seiner Kopfleiste oder setzt
  einen gespeicherten Spielstand fort; optional mit Zeitlimit je Runde. Alle brauchen dieselbe Spielversion.
  Die Runde endet, wenn alle Menschen „Runde beenden“ gedrückt haben. Chat unten links.
- **Verbindung weg?** „Online …“ → „Wieder beitreten“. Wer länger fehlt, wird von der KI vertreten und bekommt seinen Platz zurück.
- Details zu Server, Sicherheit und TLS: [`docs/SERVER.md`](docs/SERVER.md).

## Spielstände

Speicherstände liegen in der IndexedDB des Browsers (Schnellspeicherung + Autosave jede Runde). Über „Laden ▾“ lässt sich
das aktuelle Spiel als Datei sichern und eine Spielstanddatei laden – auch auf einem anderen Gerät.

## Tests

```bash
npm test           # Unit-Tests (Simulation, Relay-Server, Doku aktuell)
npm run test:e2e   # Playwright: Oberfläche, Online-Spiel, Determinismus in Chromium/Firefox/WebKit
```

Einmalig vorher: `npx playwright install chromium firefox webkit`.

Automatische Testpartien fürs Balancing: `npm run autoplay` (Parameter und Auswertung in `docs/BALANCING.md`). Die GitHub Action führt alles bei jedem Push aus.

## Stand und Planung

Siehe [`docs/ROADMAP.md`](docs/ROADMAP.md), Spielregeln in [`docs/REGELN.md`](docs/REGELN.md).
