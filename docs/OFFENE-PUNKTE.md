# iv4ever – Offene Punkte und Grenzen

Stand: 26.11.2026, nach M10. Alle Meilensteine aus `docs/ROADMAP.md` sind umgesetzt; 74 Tests grün, Build fehlerfrei
(Erststart ≈ 49 KB gzip für das Haupt-Bundle, Renderer werden nachgeladen).

Kennzeichnung: **[Fehler]** = Verhalten ist falsch bzw. blockiert das Spiel · **[Grenze]** = bewusst nicht umgesetzt ·
**[Lücke]** = fehlt noch, wäre sinnvoll · **[Doku]** = Dokumentation veraltet.

## Online-Mehrspieler

- **[Fehler] Verlassen blockiert das Spiel.** Trennt sich ein Spieler, zeigen die anderen nur eine Meldung. Er zählt aber weiter als
  lebender Mensch, die Runde endet also nie (`src/worker/sim.worker.ts`, `aliveHumans(...).every(...)`). Lösung: Abgang als Aktion
  über den Relay ordnen und den Platz an die KI übergeben oder automatisch „Runde beenden“ setzen.
- **[Grenze] Kein Wiedereinstieg** nach einem Verbindungsabbruch. Der Server speichert keinen Verlauf und ordnet einen Platz nicht neu zu.
- **[Grenze] Kein Speichern/Laden** im Online-Spiel.
- **[Grenze] Desync wird nur gemeldet**, nicht behoben. Es gibt weder einen Abgleich noch ein Zurücksetzen auf einen gemeinsamen Stand.
- **[Grenze] Keine Versionsprüfung.** Alle brauchen dieselbe Spielversion, geprüft wird das aber nicht. Unterschiedliche Stände führen zu Desync.
- **[Grenze] Relay ohne Absicherung:** keine Authentifizierung, kein TLS (nur `ws://`), keine Ratenbegrenzung, Nachrichten werden nicht
  geprüft. Räume liegen nur im Speicher. Gedacht für LAN bzw. vertrauenswürdige Mitspieler, nicht für einen öffentlichen Server.
- **[Grenze] Lockstep vertraut den Clients:** Jeder Client kennt den vollen Zustand. Schummeln (Nebel auslesen) ist technisch möglich.
- **[Grenze]** Höchstens 4 Menschen. Der Gastgeber ist fest Platz 0; verlässt er die Lobby, gibt es keinen neuen Gastgeber.
- **[Lücke]** Kein Chat und kein Zeitlimit pro Runde.

## Computerspieler (KI)

- **[Lücke] Keine Seefahrt:** Die KI baut zwar Schiffe, befestigt sie aber nur (`src/sim/ai.ts`). Kein Transport, keine Landungen,
  kein Seekampf. Auf Archipel-Karten ist die KI daher deutlich schwächer und erobert nicht über das Meer.
- **[Lücke] Keine Handelsrouten:** Die KI setzt keine Händler ein.
- **[Lücke]** Die KI plant den Projektsieg nicht gezielt. Projektbauten bewertet sie nur über die Persönlichkeit, ein Kultursieg wird nicht angestrebt.
- **[Grenze]** Der Schwierigkeitsgrad wirkt nur als Ertragsfaktor, nicht über besseres Verhalten.
- **[Lücke]** Belagerung und Angriff mit gemischten Verbänden sind einfach gehalten, ohne koordinierte Angriffswellen.
- **[Offen]** Das Performance-Budget aus der Roadmap (KI-Zug < 1 s bei 8 Völkern, 60 fps bei „Riesig“) ist nur
  stichprobenartig gemessen (~3 ms je KI-Runde bei 6 Spielern, frühe Partie). In späten Zeitaltern und auf großen Karten fehlen Messungen.

## Spielinhalt und Balancing

- **[Offen] Balancing nicht durchgespielt:** Kosten, Erträge, Siegschwellen (Vorherrschaft 45 %/50 %, Kultur 3 × 1500) und
  Ereigniswahrscheinlichkeiten sind Erstentwürfe. Ganze Partien bis Runde 300 wurden nicht systematisch ausgewertet.
- **[Grenze]** Keine Luft-, Atom- oder Spionageeinheiten; die späten Zeitalter enden bei Panzern, Zerstörern und Transportern.
- **[Grenze]** Keine Religion, kein Stadtstaaten-System, kein Weltkongress bzw. keine diplomatische Abstimmung.
- **[Grenze]** Diplomatie kennt nur Frieden/Krieg, offene Grenzen und Handel (Gold/Technologien): keine Bündnisse, kein Tausch von
  Städten oder Ressourcen, keine Forderungen bzw. Tribute.
- **[Grenze]** Keine Umweltfolgen (Verschmutzung, Klima) durch Fabriken und Kraftwerke.
- **[Lücke]** Keine Szenarien und keine Karteneditor-Funktion.

## Präsentation und Bedienung

- **[Grenze]** Grafik ist bewusst prozedural (Canvas-Pfade, keine Sprites/Modelle), Gelände ohne Animation.
- **[Lücke]** Keine Tastenbelegung zum Anpassen; Belegungskonflikt `R` (Ressourcen ein/aus und Händler-Route) wird nur über den Kontext aufgelöst.
- **[Lücke]** Keine Übersetzung – UI nur Deutsch.
- **[Lücke]** Touch-Bedienung ist nicht gezielt getestet (Pinch-Zoom ja, Rechtsklick-Befehle haben auf Touch keine Entsprechung).
- **[Offen]** Barrierefreiheit nur in Grundzügen (Fokus, ARIA, Kontrast). Die Karte selbst ist für Screenreader nicht zugänglich.
- **[Lücke]** Debug-Tasten (`X` Karte aufdecken) sind auch im Produktionsbuild aktiv – vor einer Veröffentlichung sperren.

## Technik und Tests

- **[Lücke] Keine UI-/Renderer-Tests:** Die 74 Tests decken nur die Simulation (`src/sim`) ab. Hauptthread, Worker-Protokoll,
  Online-Client und Relay sind ungetestet.
- **[Lücke]** Kein Determinismus-Test über verschiedene Browser bzw. Plattformen hinweg (wichtig für Online-Lockstep).
- **[Lücke]** Keine CI; Tests und Build laufen nur lokal.
- **[Grenze]** Speicherstände liegen nur in der IndexedDB des Browsers: kein Export/Import als Datei, keine Synchronisierung zwischen Geräten.
- **[Grenze]** Speicher-Migration nur vorwärts (v1 → v6); alte Spielversionen können neue Stände nicht lesen.

## Dokumentation

- **[Doku] `docs/REGELN.md` steht auf M5:** Überschrift „Stand M5“, der Satz „Bis zur Diplomatie (M7) herrscht Krieg“ ist überholt,
  Vermerke „(wirkt ab M5)“ sind veraltet. Es fehlen die Einheiten, Gebäude und Wunder aus M8 sowie die Technologie-Zahlen (54 statt 30, 15 Stufen).
  Das Handbuch im Spiel (F1) liest die Tabellen direkt und ist aktuell.
- **[Doku]** `CLAUDE.md` beschreibt das Spiel noch als „Einzelspieler gegen KI“; seit M10 gibt es auch Mehrspieler.

## Rechtliches

- **[Offen]** Vor einer Veröffentlichung Namen, Texte und Technologiebaum noch einmal gegen die Regeln in `CLAUDE.md`
  (Abschnitt „Rechtliches“) prüfen. Lizenz für das Projekt ist noch nicht festgelegt (keine `LICENSE`-Datei).
