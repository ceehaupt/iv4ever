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
| `Tab` | Nächste Einheit, die einen Befehl braucht |
| `T` | Technologien (Forschungsziel wählen) |
| `D` | Diplomatie, Handel und Siegfortschritt |
| `P` | Leitbilder (Politik) |
| `F1` / `?` | Handbuch |
| `R` (Händler) | Handelsroute errichten |
| `Enter` | Runde beenden |
| `Entf` | Einheit auflösen |
| `H` | Zur ausgewählten Einheit |
| `G` / `R` | Gitter / Ressourcen ein/aus |
| `Strg/⌘ + S` | Schnellspeichern (Laden über „Laden ▾“) |
| `Esc` | Auswahl aufheben |
| `X` | Debug: Karte aufdecken |
| `Shift + P` | Debug (nur Dev-Server): Plünderer neben die ausgewählte Einheit setzen |
| Minimap klicken/ziehen | Springen |

Gleicher Seed + gleiche Einstellungen = gleiche Karte. Die Welt ist ost-west umlaufend.
Einstellungen (⚙): Klang, Animationen, Kontrast, Schriftgröße, Farben für Farbsehschwäche, Tutorial.
Speicherstände liegen in IndexedDB des Browsers (Schnellspeicherung + Autosave jede Runde).

## Stand und Planung

Siehe [`docs/ROADMAP.md`](docs/ROADMAP.md), Spielregeln in [`docs/REGELN.md`](docs/REGELN.md).
