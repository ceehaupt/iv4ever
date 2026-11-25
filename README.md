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
| Klick | Einheit bzw. Feld wählen (erneuter Klick wechselt im Stapel) |
| Rechtsklick oder `M` + Klick | Ausgewählte Einheit zum Feld schicken (Vorschau zeigt Runden) |
| `Leertaste` | Einheit überspringt diese Runde |
| `F` | Befestigen / Schlafen bzw. Aufwecken |
| `Tab` | Nächste Einheit, die einen Befehl braucht |
| `Enter` | Runde beenden |
| `Entf` | Einheit auflösen |
| `H` | Zur ausgewählten Einheit |
| `G` / `R` | Gitter / Ressourcen ein/aus |
| `Strg/⌘ + S` | Schnellspeichern (Laden über „Laden ▾“) |
| `Esc` | Auswahl aufheben |
| `X` | Debug: Karte aufdecken |
| Minimap klicken/ziehen | Springen |

Gleicher Seed + gleiche Einstellungen = gleiche Karte. Die Welt ist ost-west umlaufend.
Speicherstände liegen in IndexedDB des Browsers (Schnellspeicherung + Autosave jede Runde).

## Stand und Planung

Siehe [`docs/ROADMAP.md`](docs/ROADMAP.md).
