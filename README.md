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
| Klick | Feld auswählen (Esc hebt auf) |
| `H` | Zur eigenen Startposition |
| `G` | Gitter ein/aus |
| `R` | Ressourcen-Symbole ein/aus |
| `N` | Neue Karte mit zufälligem Seed |
| Minimap klicken/ziehen | Springen |

Gleicher Seed + gleiche Einstellungen = gleiche Karte. Die Welt ist ost-west umlaufend.

## Stand und Planung

Siehe [`docs/ROADMAP.md`](docs/ROADMAP.md).
