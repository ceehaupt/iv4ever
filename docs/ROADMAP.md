# iv4ever – Roadmap

Rundenbasiertes 4X-Strategiespiel im Browser, Hexfelder, 2.5D, Einzelspieler gegen KI.
Genre-Mechaniken (Städte, Forschung, Einheiten, Grenzen, Siegbedingungen) ja – Inhalte, Namen,
Grafik, Texte und Balancing sind eigene Entwürfe (siehe `CLAUDE.md`, Abschnitt „Rechtliches“).

## Leitplanken

- **Architektur:** Simulation (`src/sim`) ist reines, deterministisches TypeScript ohne DOM/Pixi, läuft im Web Worker. Hauptthread = Rendering (PixiJS/WebGL) + DOM-UI. Kommunikation nur über `src/protocol.ts`.
- **Determinismus:** Kein `Math.random()` in `src/sim` – nur `Rng` mit Seed. Grundlage für Speicherstände, Wiederholungen, Tests und späteren Lockstep-Multiplayer.
- **Datenhaltung:** Karte als Struct-of-Arrays (`Uint8Array`/`Int16Array` je Eigenschaft), Einheiten/Städte als kompakte Tabellen mit numerischen IDs.
- **Performance-Budget:**
  - 60 fps bei „Riesig“ (140×88) inkl. Einheiten und Nebel, Frame < 4 ms CPU
  - KI-Zug aller Gegner < 1 s bei 8 Zivilisationen (im Worker, UI bleibt flüssig)
  - Kartengenerierung < 200 ms, initiales Bundle < 300 KB gzip
  - Rendern nur bei Änderung (kein Dauer-Rendering im Leerlauf)

## Meilensteine

### M0 – Fundament ✅ (dieser Stand)
- Projektgerüst (Vite, TypeScript strict, PixiJS 8, Vitest)
- Hex-Mathematik (odd-r, Nachbarn, Distanz, Radius)
- Seed-basierter Kartengenerator: Kontinente, Inseln, Gebirgsketten, Hügel, Klima-Biome, Wald, Dschungel, Packeis
- 2.5D-Renderer: gekippte Ebene, angehobene Felder mit Seitenwänden, prozedurale Gebirge/Bäume, zeilenweises Culling
- Kamera: Ziehen, WASD/Pfeile, Mausrad/Pinch-Zoom zum Cursor; Mausauswahl berücksichtigt Anhebung
- Minimap (Klick/Ziehen springt), Feldinfo (Erträge, Bewegung, Verteidigung), Gitter umschaltbar

### M1 – Karte vertiefen ✅
- Ost-West-Weltumrundung: Hex-Mathe (Nachbarn, Distanz, Radius), nahtloses periodisches Rauschen, Renderer mit drei Instanzen (geteilte Geometrie), Minimap, Mausauswahl über die Naht
- Flüsse entlang der Hex-Kanten (Ecken-Graph, bergab bis ins Wasser oder in einen anderen Fluss): +1 Handel, später +25 % Verteidigung über den Fluss
- Seen (kleine abgeschlossene Wasserflächen), Schwemmland (flache Wüste am Fluss)
- 19 Ressourcen (8 Bonus, 8 Luxus regional gehäuft, 3 strategisch), Symbole als Textur-Atlas
- Startpositionen: Standortbewertung (Umkreis 2, Fluss, Küste, Hügel), Mindestabstand, nur auf Landmassen ≥ 24 Felder, schwache Starts bekommen Bonus-Ressourcen
- Kartentypen Kontinente / Pangäa / Archipel, Meeresspiegel, Klima; Spielerzahl nach Kartengröße (2–10)

### M2 – Runden, Einheiten, Sicht ✅
- Spielzustand im Worker: Spieler, Einheiten, Runde, Rundenwechsel; Gegner ziehen noch nicht (KI in M6)
- Einheiten: Siedler, Arbeiter, Späher, Krieger; Start mit Siedler, Krieger, Späher; Stapel unbegrenzt (nur eigene)
- Bewegung mit A* (Bewegungskosten, Rest-Bewegung darf teure Felder betreten, Weltumrundung), Wegvorschau mit Rundenzahl, Marschbefehle über mehrere Runden, Neuplanung bei Hindernissen
- Nebel des Krieges: unbekannt / erkundet / sichtbar; Sichtlinie (Wald, Hügel, Gebirge verdecken), +1 Sicht auf Hügeln; Startumgebung (Radius 3) bekannt; nur betroffene Kartenzeilen werden neu gezeichnet
- Einheiten als Plaketten in Spielerfarbe mit Bewegungs-/Befestigungsanzeige und Stapelzähler, Bewegungsanimation
- Befehle: Bewegen (Rechtsklick / M), Befestigen/Schlafen, Überspringen, Aufwecken, Auflösen; automatische Auswahl der nächsten Einheit
- Speichern/Laden in IndexedDB (versioniertes Format, Schnellspeicherung + Autosave je Runde)

### M3 – Städte ✅
- Gründung (Abstand ≥ 3, nicht in fremdem Gebiet), Palast in der ersten Stadt, erfundene Städtenamen
- Bewirtschaftung automatisch (Nahrung zuerst) + manuell festlegbare Felder, Spezialisten
- Wachstum/Hunger, Bauliste (Einheiten, 5 Gebäude), Siedler kosten einen Bürger
- Handel → Forschung/Gold per Regler, Unterhalt für Städte und Einheiten
- Eigene Mechaniken: Stimmung (Unzufriedenheit kostet Effizienz, Unruhe stoppt die Stadt) und Versorgung (Mehrverbrauch an Nahrung)
- Kulturgrenzen (Radius 1 → 2 → 3), Feldbesitz, Grenzlinien und Minimap-Färbung, eigenes Gebiet ist sichtbar
- Stadtansicht mit Erträgen auf der Karte, Ereignisprotokoll pro Runde
- Speicherformat v2 mit Migration von v1
- Regeln dokumentiert in `docs/REGELN.md`

### M4 – Forschung & Ausbau ✅
- Eigener Technologiebaum: 30 Technologien in 7 Stufen, Forschungsziel mit automatischem Weg, Ansparen ohne Ziel
- Arbeiter: Straße, Farm, Mine, Weide, Jagdlager, Plantage, Sägewerk, Steinbruch, Roden; Ressourcen wirken erst verbessert
- Straßen verbilligen Bewegung (⅓, mit Ingenieurwesen ¼) und bilden mit Flüssen das Handelsnetz (+2 Handel, Luxusgüter zählen nur angebunden)
- 13 neue Gebäude, 7 eigene Weltwunder (einmalig, Bauliste der anderen wird bereinigt)
- Technologie-Übersicht (T), Arbeiteraufträge im Einheitenpanel, Ausbau in der Feldinfo
- Speicherformat v3 mit Migration (Bewegung jetzt in Zwölfteln)

### M5 – Militär & Kampf
- Einheitenklassen (Nahkampf, Fernkampf, beritten, Belagerung, Schiffe)
- Kampfformel mit Gelände-, Fluss-, Befestigungs- und Stadtboni; Kampfvorhersage vor dem Angriff
- Erfahrung/Beförderungen (eigener Baum), Stadteroberung, Plünderer/Banditen als neutrale Fraktion

### M6 – KI
- Utility-basierte KI im Worker: Siedelplätze, Bauaufträge, Forschungspfad, Arbeiter-Automatik, Verteidigung, Angriffsplanung
- Persönlichkeiten als Parameter (eigene, fiktive Herrscher), Schwierigkeitsgrade über Boni statt Schummel-Sicht

### M7 – Diplomatie & Sieg
- Kontakt, Krieg/Frieden, offene Grenzen, Tausch von Ressourcen/Gold/Technologien, Beziehungsgedächtnis
- Siegbedingungen: Eroberung, Vorherrschaft (Land/Bevölkerung), Kultur, Punkte bei Rundenlimit

### M8 – Spätere Zeitalter & Systeme
- Renaissance bis Moderne, eigenes Glaubens-/Ideologiesystem, Handelsrouten, Ereignisse, Weltraum- oder Projekt-Sieg

### M9 – Präsentation
- Eigene Grafik (Sprite-Atlas, Animationen), Wasser-/Licht-Effekte, Sound/Musik (eigene oder lizenzfreie)
- Einstellungen, Tutorial, Enzyklopädie mit eigenen Texten, Barrierefreiheit (Tastatur, Kontrast)
- Bundle-Optimierung (Pixi-Teilimporte, Lazy Loading)

### M10 – optional: Multiplayer
- Hotseat → Online (deterministischer Lockstep, Befehle statt Zustand übertragen)

## Entscheidungen

| # | Thema | Entscheidung (25.11.2026) |
|---|---|---|
| 1 | Weltumrundung | Ost-West (Zylinder) |
| 2 | Einheiten pro Feld | unbegrenzte Stapel |
| 3 | Stadtradius | wächst mit Kultur: 1 Ring → 2 Ringe, 3. Ring spät |
| 4 | Flüsse | entlang der Hex-Kanten |
| 5 | Grafik | Einheiten ab M2 als Sprites, Gelände prozedural bis M9 |
