# Balancing

Werkzeug: automatische Testpartien ohne Menschen.

```bash
GAMES=12 TURNS=300 SIZE=standard SCRIPT=continents DIFFICULTY=normal SEED=1000 npm run autoplay
```

Ergebnis in `reports/` (nicht im Repository): eine CSV-Zeile je Partie und eine Zusammenfassung als Markdown
(Siegarten, Siegrunde, Städte, Forschungstempo, Kriege, eroberte Städte, Handelsrouten, Übersee-Städte, Rechenzeit).
Der Leistungstest `src/sim/perf.test.ts` läuft im normalen `npm test` mit.

## Runde 1 – 26.11.2026

Ausgangslage: Standardkarte, 6 Völker, Normal, 300 Runden; Kontinente (12 Partien) und Archipel (8 Partien).

| Befund | Wert vorher | Ursache |
|---|---|---|
| Kultursieg dominiert | 18 von 20 Partien, Ø Runde 205 | Schwelle 3 × 1500 Kultur wird zu früh erreicht |
| Kaum Handelsrouten | Ø 1,3 bzw. 0,9 je Partie (alle Völker) | Händler durften fremdes Gebiet im Frieden nicht betreten, fremde Städte blockierten jede Einheit – Routen ins Ausland waren praktisch unmöglich |
| Kein Eroberungs- oder Vorherrschaftssieg | 0 | siehe unten |

Änderungen:

1. **Händler** dürfen im Frieden fremdes Gebiet betreten und errichten Routen zu fremden Städten vom Nachbarfeld aus
   (Regeländerung, Fehlerbehebung). → Ø 8 Routen je Partie auf Kontinenten.
2. **Kultursieg** braucht drei Städte mit je **2400** statt 1500 Kultur (getestet: 2000 → Kultur weiter dominant, 2500 → Kultur fast nie).
3. **Großprojekt** teurer: Startrampe 700 (vorher 450), Sternenantrieb 900 (600), Habitatmodul 1100 (700) –
   sonst kippte das Spiel nach Schritt 2 in Richtung Projektsieg (11 von 12).

Ergebnis nach den Änderungen:

| Karte | Siegarten | Ø Siegrunde |
|---|---|---|
| Kontinente, Standard (12) | Kultur 4 · Projekt 8 | 244 |
| Archipel, Standard (8) | Kultur 6 · Projekt 2 | 248 |
| Pangäa, Klein (6) | Kultur 3 · Projekt 3 | 242 |

Kriege haben Folgen (Ø 13 eroberte Städte je Partie auf Kontinenten), Völker werden aber selten ganz vernichtet.
Eroberung und Vorherrschaft kommen in reinen KI-Partien nicht vor; das ist vertretbar, weil die KI keinen gezielten
Vernichtungskrieg führt. Gegen Menschen bleibt der Druck durch Feldzüge und die Reaktion auf drohende Siege.

Leistung (Riesig, 8 Völker, 220 Runden): Kartenerzeugung 38 ms, KI-Runde Ø 20 ms, schlechteste 83 ms
(Budget laut Roadmap: 200 ms bzw. 1 s).

## Offene Beobachtungen

- Seefahrt wird auf Archipel-Karten selten gebraucht (Ø 0,3 Städte in Übersee), weil die Inseln den Völkern meist reichen.
- Der Punkteabstand zwischen Erstem und Zweitem liegt bei etwa 1,2 × – Partien bleiben lange offen.
