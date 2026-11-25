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

### M5 – Militär & Kampf ✅
- Einheitenklassen Nahkampf, Fernkampf, Beritten, Belagerung; 9 neue Einheiten, strategische Ressourcen als Voraussetzung
- Kampf mit Lebenspunkten, Schadensformel, Gelände-/Fluss-/Befestigungs-/Stadtboni, Fernkampf ohne Gegenschaden
- Kampfvorhersage beim Überfahren des Ziels, bester Verteidiger eines Stapels, Gefangennahme von Zivilisten
- Erfahrung und eigener Beförderungsbaum (11 Beförderungen), Kaserne, Heilung
- Stadteroberung inkl. Palastumzug, Vernichtung von Spielern
- Plünderer als neutrale Fraktion mit Lagern, eigener einfacher KI und Gold für ausgehobene Lager
- Speicherformat v4 mit Migration

### M5b – Seefahrt ✅
- Galeere, Kriegsgaleere, Karavelle; Küsten- bzw. Hochseefahrt, Bau nur in Küstenstädten
- Transport: Einsteigen auf See oder Einladen in der Stadt, Landung beendet den Zug; Wegvorschau berücksichtigt Schiffe
- Seekampf nur zwischen Schiffen, versenkte Schiffe nehmen die Ladung mit

### M6 – KI ✅
- Computerspieler im Worker über dieselbe Befehlsschnittstelle wie der Mensch (alle Regeln geprüft), ohne Schummelsicht
- 10 erfundene Herrscher mit Persönlichkeit (Aggression, Expansion, Wissenschaft, Bauen)
- Forschung nach Persönlichkeit, Bauaufträge nach Bedarf (Verteidigung, Siedler, Arbeiter, Armee, Gebäude/Wunder), Steuersatz
- Siedler suchen Standorte, Arbeiter verbessern Ressourcen/Felder und bauen Verbindungsstraßen, Späher erkunden
- Garnisonen, Abwehr von Bedrohungen und Lagern, kriegerische Herrscher greifen später fremde Städte an; Beförderungen
- Schwierigkeitsgrade Leicht/Normal/Schwer/Sehr schwer als Ertragsfaktor (0,8–1,5) der KI
- Deterministisch (Test), ~3 ms pro KI-Runde bei 6 Spielern

### M7 – Diplomatie & Sieg ✅
- Erstkontakt über Sicht, Grundzustand Frieden, Kriegserklärung nötig (Rückfrage beim Angriff), Plünderer immer feindlich
- Frieden ohne offene Grenzen sperrt fremdes Gebiet; bei Friedensschluss verlassen Truppen das fremde Gebiet
- Haltung mit Gedächtnis (Kriegserklärungen, Handel, Dauer des Friedens, Persönlichkeit)
- Angebote: Frieden, offene Grenzen, Handel mit Gold und Technologien; KI bewertet und antwortet mit Begründung
- KI-Diplomatie: Kriegserklärungen nach Stärke und Persönlichkeit, Friedensangebote, offene Grenzen untereinander
- Siegbedingungen: Eroberung, Vorherrschaft (45 % Land + 50 % Bevölkerung), Kultur (3 Städte à 1500), Punkte bei Rundenlimit
- Diplomatie-Übersicht (D) mit Siegfortschritt und Rangliste, Sieg-/Niederlagenbildschirm; Speicherformat v5

### M8 – Spätere Zeitalter & Systeme ✅
- 24 weitere Technologien (Buchdruck bis Raumfahrt/Globalisierung), 15 Stufen insgesamt
- 12 neue Einheiten (Händler, Musketier, Kanone, Kavallerie, Fregatte, Schützen, Artillerie, Panzerschiff, Infanterie, Panzer, Zerstörer, Transporter)
- 13 neue Gebäude/Wunder inkl. Fabrik, Kraftwerk, Krankenhaus, Börse, Labor
- Leitbilder als eigenes Politiksystem (Herrschaft/Wirtschaft/Gesellschaft, 15 Optionen, Umbruch beim Wechsel, KI wählt mit)
- Handelsrouten über Händler (Entfernung, Ausland, Leitbilder, Globalisierung)
- Zufallsereignisse (Ernte, Goldader, Seuche, Erfinder, Waldbrand, Flüchtlinge)
- Eisenbahn (Straßen ⅙), Navigation (alle Schiffe hochseetauglich)
- Projektsieg über das Großprojekt „Aufbruch“ (Startrampe, Sternenantrieb, Habitatmodul); Speicherformat v6

### M9 – Präsentation ✅
- Eigene Einheiten-Piktogramme (Canvas-Pfade, 16 Motive) statt Emojis
- Kampfeffekte: Blitzring und aufsteigende Schadenszahlen; Animationsgeschwindigkeit schnell/normal/aus
- Klang ohne Audiodateien: synthetisierte Effekte (Klick, Bewegung, Kampf, Gründung, Runde, Forschung, Sieg, Fehler)
  und generative Hintergrundmusik (WebAudio)
- Einstellungen (Lautstärken, Musik, Animationen, hoher Kontrast, große Schrift, Farben für Farbsehschwäche), gespeichert im Browser
- Tutorial mit 7 Schritten, die sich am Spielstand erledigen; Handbuch (F1) mit allen Inhalten aus den Regeltabellen
- Barrierefreiheit: Fokusrahmen, ARIA-Rollen für Dialoge und Meldungen, reduzierte Bewegung wird respektiert
- Bundle: Erststart ≈ 150 KB gzip; WebGPU-/Canvas-Renderer und Handbuch werden nur bei Bedarf geladen

### M10 – Multiplayer ✅
- Mehrere menschliche Spieler in der Simulation; Sicht je Spieler (Nebel, Ereignisse, Diplomatie)
- Hotseat für 2–4 Menschen am selben Gerät mit Übergabebildschirm; Speichern/Laden möglich
- Online im deterministischen Lockstep: Relay-Server (`npm run server`, WebSocket) ordnet die Aktionen, jeder Client rechnet selbst;
  Räume mit Code, Lobby, Warteanzeige, Prüfsumme je Runde mit Desync-Warnung
- Plattformunabhängige Mathematik in der Simulation (eigene ln/exp/pow, sqrt statt hypot)
- Angebote zwischen Menschen (Frieden, offene Grenzen, Handel) mit Annehmen/Ablehnen
- Grenzen: kein Wiedereinstieg nach Verbindungsabbruch, kein Speichern im Online-Spiel

## Entscheidungen

| # | Thema | Entscheidung (25.11.2026) |
|---|---|---|
| 1 | Weltumrundung | Ost-West (Zylinder) |
| 2 | Einheiten pro Feld | unbegrenzte Stapel |
| 3 | Stadtradius | wächst mit Kultur: 1 Ring → 2 Ringe, 3. Ring spät |
| 4 | Flüsse | entlang der Hex-Kanten |
| 5 | Grafik | Einheiten ab M2 als Sprites, Gelände prozedural bis M9 |
