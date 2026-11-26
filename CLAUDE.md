# iv4ever

Rundenbasiertes 4X-Strategiespiel im Browser (Hexfelder, 2.5D) gegen KI, im Hotseat oder online im Lockstep.
Plan und Meilensteine: `docs/ROADMAP.md`, offene Punkte: `docs/OFFENE-PUNKTE.md`, Spielregeln: `docs/REGELN.md` (bei Regeländerungen mitpflegen).
`docs/REGELN-DATEN.md` wird aus den Regeltabellen erzeugt (`npm run docs`); ein Test schlägt fehl, wenn sie veraltet ist.
UI-Sprache Deutsch, Code-Bezeichner Englisch, Kommentare Deutsch.

## Rechtliches (verbindlich)

Genre-Mechaniken sind erlaubt, ein Nachbau eines bestehenden Spiels nicht. Daher **nicht** übernehmen:
Spielnamen, Herrscher/Persönlichkeiten, Technologiebaum-Struktur und Zahlenwerte im Detail, Zitate,
Enzyklopädie-Texte, Grafiken, UI-Layout/-Look, Musik, Sounds, Szenarien. Historische Begriffe
(Bronzeverarbeitung, Speerkämpfer, Pyramiden …) sind frei. Balancing und Inhalte entwerfen wir selbst.

## Architektur

- `src/sim/` – Spiellogik, rein und deterministisch, kein DOM/Pixi, kein `Math.random()` (nur `Rng`). Läuft im Worker.
  Für Online-Lockstep auch plattformgleich: kein `Math.pow/exp/log/hypot/sin/cos` in der Simulation – `sim/detmath.ts` bzw. `Math.sqrt` verwenden.
- `src/sim/ai.ts` – KI; `diplomacy.ts`, `victory.ts`, `events.ts`, `naval.ts`; `rules/doctrines.ts`, `rules/leaders.ts`.
- `src/net/online.ts` + `server/relay.mjs` – Online-Mehrspieler (Server ordnet nur Aktionen, rechnet nichts).
- `src/sim/rules/` – Spieldaten (Gelände, Ressourcen, Einheiten, Gebäude, Technologien, Leitbilder …) als Tabellen; `catalog.ts` macht daraus die Tabellen für Handbuch und `REGELN-DATEN.md`.
- `src/sim/gen/` – Weltgenerierung: Flüsse, Ressourcen, Startpositionen; Einstieg `src/sim/mapgen.ts`.
- Welt ist ost-west umlaufend: Nachbarn/Distanzen immer über `src/sim/hex.ts` (`tileAt`, `neighborOf`, `tileDistance`), nie selbst `c ± 1` rechnen.
- Flüsse liegen auf Kanten; Abfrage nur über `hasRiver`/`touchesRiver` (`src/sim/map.ts`).
- `src/sim/city.ts` – Städte: Gründung, Feldbesitz, Bewirtschaftung, Wachstum, Produktion, Stimmung/Versorgung.
- `src/sim/work.ts` – Arbeiteraufträge (Prüfung/Anwendung, auch von der UI genutzt); `rules/techs.ts`, `rules/improvements.ts`, `rules/buildings.ts` (Indizes nur hinten anhängen – stehen in Speicherständen).
- `src/sim/combat.ts` – Kampfformel (rein, auch für die Vorhersage in der UI); `war.ts` – Angriff, Eroberung, Heilung; `barbarians.ts` – Plünderer.
- `src/sim/game.ts` – Spielzustand, Befehle, Rundenwechsel, Wirtschaft, Forschung; `path.ts` (A*), `vision.ts` (Sichtlinie), `save.ts` (versioniertes Speicherformat – bei Änderungen `SAVE_VERSION` erhöhen).
- `src/worker/` – Worker-Einstieg, hält den Spielzustand; `storage.ts` = IndexedDB.
- Der Hauptthread bekommt nur `GameView` (Sicht des Menschen, Nebel!) – nie den vollen Zustand.
- `src/protocol.ts` – einzige Schnittstelle Worker ↔ Hauptthread.
- `src/render/` – PixiJS-Renderer. Projektion/Konstanten in `projection.ts`; Zeichenreihenfolge zeilenweise hinten → vorn.
- `src/ui/` – DOM-UI (HUD, Minimap).

## Performance-Regeln

- Rendern nur, wenn `dirty`. Keine Pro-Frame-Allokationen in heißen Pfaden.
- Statische Geometrie einmal bauen (`GraphicsContext`), bei Umrundung als Instanzen teilen; Culling pro Kartenzeile und Instanz. Dynamisches (Einheiten, Markierungen) in eigenen Ebenen.
- Karte/Zustand als typisierte Arrays; Übertragung per Transferable.

## Befehle

Node über nvm (`.nvmrc` = 26):

```bash
npm run dev        # Dev-Server
npm run build      # Typecheck + Produktionsbuild
npm test           # Vitest (Simulation)
npm run docs       # docs/REGELN-DATEN.md neu erzeugen
```
