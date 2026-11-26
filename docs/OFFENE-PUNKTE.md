# iv4ever – Offene Punkte und Grenzen

Stand: 26.11.2026, nach M10. Alle Meilensteine aus `docs/ROADMAP.md` sind umgesetzt; 74 Tests grün, Build fehlerfrei
(Erststart ≈ 49 KB gzip für das Haupt-Bundle, Renderer werden nachgeladen).

Kennzeichnung: **[Erledigt]** = umgesetzt · **[Fehler]** = Verhalten ist falsch bzw. blockiert das Spiel · **[Grenze]** = bewusst nicht umgesetzt ·
**[Lücke]** = fehlt noch, wäre sinnvoll · **[Doku]** = Dokumentation veraltet.

## Online-Mehrspieler

- **[Erledigt] Verlassen blockiert das Spiel.** Der Relay reiht das Verlassen als Aktion ein; auf allen Rechnern übernimmt an derselben Stelle die KI.
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

- **[Erledigt] Seefahrt der KI** (`src/sim/aiNaval.ts`): Siedler ohne Platz an Land fahren mit Begleitschutz auf andere Inseln, kriegerische KIs landen Truppen bei Gegnern in Übersee, Kriegsschiffe versenken feindliche Schiffe und werden bei Bedrohung gebaut. Getestet in `aiNaval.test.ts`.
- **[Erledigt] Handelsrouten der KI:** Sie baut Händler, solange Routenplätze frei sind, und wählt die lohnendste erreichbare Stadt (Entfernung, Ausland).
- **[Erledigt]** Projektsieg: Forschungs-KIs steuern die Raumfahrt an und bauen die Teile in der produktivsten Stadt; Völker kurz vor einem Sieg werden gemeinsam bekämpft.
- **[Erledigt]** Schwierigkeitsgrad wirkt auch auf das Verhalten (Siegchance, Armeegröße, Kriegsbeginn; `AI_TACTICS`).
- **[Erledigt]** Koordinierte Feldzüge: Sammeln in der Stadt nahe dem Ziel, geschlossener Vormarsch, Fern- und Belagerungseinheiten zuerst.
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
- **[Lücke]** Keine Tastenbelegung zum Anpassen. **[Erledigt]** `R`-Konflikt: `R` = Handelsroute, `Shift + R` = Ressourcen.
- **[Lücke]** Keine Übersetzung – UI nur Deutsch.
- **[Lücke]** Touch-Bedienung ist nicht gezielt getestet (Pinch-Zoom ja, Rechtsklick-Befehle haben auf Touch keine Entsprechung).
- **[Offen]** Barrierefreiheit nur in Grundzügen (Fokus, ARIA, Kontrast). Die Karte selbst ist für Screenreader nicht zugänglich.
- **[Erledigt]** Debug-Taste `X` nur noch auf dem Dev-Server und nie online.

## Technik und Tests

- **[Erledigt] Oberflächentests:** Playwright-Tests für Spielstart, Stadtgründung, Rundenwechsel, Speichern/Laden, Handbuch und ein Online-Spiel mit zwei Browsern (inkl. Abgang). Relay-Server mit echten WebSocket-Clients getestet (`src/net/relay.test.ts`).
- **[Erledigt]** Determinismus über Browser: dieselbe 80-Runden-KI-Partie liefert in Node, Chromium, Firefox und WebKit identische Prüfsummen (`e2e/determinism.spec.ts`).
- **[Erledigt]** CI per GitHub Action: Unit-Tests, Build und alle Playwright-Tests bei jedem Push.
- **[Grenze]** Speicherstände liegen nur in der IndexedDB des Browsers: kein Export/Import als Datei, keine Synchronisierung zwischen Geräten.
- **[Grenze]** Speicher-Migration nur vorwärts (v1 → v6); alte Spielversionen können neue Stände nicht lesen.

## Dokumentation

- **[Erledigt]** `docs/REGELN.md` auf Stand M10; Tabellen stehen in `docs/REGELN-DATEN.md`, erzeugt aus dem Code (`npm run docs`, per Test abgesichert).
- **[Erledigt]** `CLAUDE.md` beschreibt Mehrspieler und die erzeugte Datendoku.

## Rechtliches

- **[Offen]** Vor einer Veröffentlichung Namen, Texte und Technologiebaum noch einmal gegen die Regeln in `CLAUDE.md`
  (Abschnitt „Rechtliches“) prüfen. Lizenz für das Projekt ist noch nicht festgelegt (keine `LICENSE`-Datei).
