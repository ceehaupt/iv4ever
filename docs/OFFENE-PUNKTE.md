# iv4ever – Offene Punkte und Grenzen

Stand: 26.11.2026, nach M10. Alle Meilensteine aus `docs/ROADMAP.md` sind umgesetzt; 74 Tests grün, Build fehlerfrei
(Erststart ≈ 49 KB gzip für das Haupt-Bundle, Renderer werden nachgeladen).

Kennzeichnung: **[Erledigt]** = umgesetzt · **[Fehler]** = Verhalten ist falsch bzw. blockiert das Spiel · **[Grenze]** = bewusst nicht umgesetzt ·
**[Lücke]** = fehlt noch, wäre sinnvoll · **[Doku]** = Dokumentation veraltet.

## Online-Mehrspieler

- **[Erledigt] Verlassen blockiert das Spiel.** Der Relay reiht das Verlassen als Aktion ein; auf allen Rechnern übernimmt an derselben Stelle die KI.
- **[Erledigt] Wiedereinstieg** mit Token und Kulanzzeit; der Server spielt alle Aktionen nach, die KI gibt den Platz zurück.
- **[Erledigt] Speichern/Fortsetzen online:** Gastgeber speichert, Fortsetzen in neuem Raum (fehlende Menschen → KI).
- **[Erledigt] Reparatur bei Desync:** Der Gastgeber verteilt automatisch seinen Stand, alle spielen spätere Aktionen erneut an.
- **[Erledigt] Versionsprüfung** (Paketversion + Git-Stand); fremde Versionen können nicht beitreten.
- **[Erledigt] Relay abgesichert:** Nachrichtenprüfung, Größen- und Ratenlimit, Raumlimit, Tokens; TLS über Reverse-Proxy (`docs/SERVER.md`).
- **[Grenze] Lockstep vertraut den Clients:** Jeder Client kennt den vollen Zustand. Schummeln (Nebel auslesen) ist technisch möglich.
- **[Erledigt]** Bis zu 8 Menschen online.
- **[Erledigt]** Chat im Spiel und Zeitlimit je Runde (vom Gastgeber gewählt, vom Server durchgesetzt).

## Computerspieler (KI)

- **[Erledigt] Seefahrt der KI** (`src/sim/aiNaval.ts`): Siedler ohne Platz an Land fahren mit Begleitschutz auf andere Inseln, kriegerische KIs landen Truppen bei Gegnern in Übersee, Kriegsschiffe versenken feindliche Schiffe und werden bei Bedrohung gebaut. Getestet in `aiNaval.test.ts`.
- **[Erledigt] Handelsrouten der KI:** Sie baut Händler, solange Routenplätze frei sind, und wählt die lohnendste erreichbare Stadt (Entfernung, Ausland).
- **[Erledigt]** Projektsieg: Forschungs-KIs steuern die Raumfahrt an und bauen die Teile in der produktivsten Stadt; Völker kurz vor einem Sieg werden gemeinsam bekämpft.
- **[Erledigt]** Schwierigkeitsgrad wirkt auch auf das Verhalten (Siegchance, Armeegröße, Kriegsbeginn; `AI_TACTICS`).
- **[Erledigt]** Koordinierte Feldzüge: Sammeln in der Stadt nahe dem Ziel, geschlossener Vormarsch, Fern- und Belagerungseinheiten zuerst.
- **[Erledigt]** Leistungsbudget gemessen und per Test abgesichert (`perf.test.ts`): Riesig, 8 Völker, 220 Runden – Karte 38 ms, KI-Runde Ø 20 ms, max. 83 ms.

## Spielinhalt und Balancing

- **[Erledigt] Balancing:** automatische Testpartien (`npm run autoplay`), erste Runde ausgewertet und angepasst (Kultursieg 2400, Projekt teurer, Händlerregel) – siehe `docs/BALANCING.md`.
- **[Grenze]** Keine Luft-, Atom- oder Spionageeinheiten; die späten Zeitalter enden bei Panzern, Zerstörern und Transportern.
- **[Grenze]** Keine Religion, kein Stadtstaaten-System, kein Weltkongress bzw. keine diplomatische Abstimmung.
- **[Grenze]** Diplomatie kennt nur Frieden/Krieg, offene Grenzen und Handel (Gold/Technologien): keine Bündnisse, kein Tausch von
  Städten oder Ressourcen, keine Forderungen bzw. Tribute.
- **[Grenze]** Keine Umweltfolgen (Verschmutzung, Klima) durch Fabriken und Kraftwerke.
- **[Lücke]** Keine Szenarien und keine Karteneditor-Funktion.

## Präsentation und Bedienung

- **[Grenze]** Grafik ist bewusst prozedural (Canvas-Pfade, keine Sprites/Modelle), Gelände ohne Animation.
- **[Erledigt]** Tastenbelegung frei änderbar (⚙ → Tastenbelegung), auch für die Kamera; Konflikt D (Diplomatie/Kamera) gelöst: Diplomatie jetzt `K`.
- **[Lücke]** Keine Übersetzung – UI nur Deutsch.
- **[Erledigt]** Touch: langes Drücken wirkt wie Rechtsklick; dazu der Bewegen-Knopf im Einheitenpanel.
- **[Erledigt]** Kartencursor (`C`): Pfeiltasten wandern über die Karte, Screenreader sagen jedes Feld an (Gelände, Stadt, Besitzer, Ressource, Einheiten, Erträge); Enter wählt bzw. schickt Einheiten.
- **[Erledigt]** Debug-Taste `X` nur noch auf dem Dev-Server und nie online.

## Technik und Tests

- **[Erledigt] Oberflächentests:** Playwright-Tests für Spielstart, Stadtgründung, Rundenwechsel, Speichern/Laden, Handbuch und ein Online-Spiel mit zwei Browsern (inkl. Abgang). Relay-Server mit echten WebSocket-Clients getestet (`src/net/relay.test.ts`).
- **[Erledigt]** Determinismus über Browser: dieselbe 80-Runden-KI-Partie liefert in Node, Chromium, Firefox und WebKit identische Prüfsummen (`e2e/determinism.spec.ts`).
- **[Erledigt]** CI per GitHub Action: Unit-Tests, Build und alle Playwright-Tests bei jedem Push.
- **[Erledigt]** Speicherstände als Datei exportieren und importieren (auch für andere Geräte).
- **[Grenze]** Speicher-Migration nur vorwärts; ein Spielstand aus einer neueren Version wird jetzt mit klarer Meldung abgelehnt.

## Dokumentation

- **[Erledigt]** `docs/REGELN.md` auf Stand M10; Tabellen stehen in `docs/REGELN-DATEN.md`, erzeugt aus dem Code (`npm run docs`, per Test abgesichert).
- **[Erledigt]** `CLAUDE.md` beschreibt Mehrspieler und die erzeugte Datendoku.

## Rechtliches

- **[Offen]** Vor einer Veröffentlichung Namen, Texte und Technologiebaum noch einmal gegen die Regeln in `CLAUDE.md`
  (Abschnitt „Rechtliches“) prüfen. Lizenz für das Projekt ist noch nicht festgelegt (keine `LICENSE`-Datei).
