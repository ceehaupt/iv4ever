# Spielregeln (Stand M3)

Eigene Entwürfe. Alle Zahlen stehen als Konstanten bzw. Tabellen im Code und lassen sich dort anpassen:
`src/sim/city.ts`, `src/sim/game.ts`, `src/sim/rules/*.ts`.

## Gelände

| Gelände | 🌾 | ⚒️ | 💰 | Bewegung |
|---|---|---|---|---|
| Grasland | 2 | 0 | 0 | 1 |
| Ebene | 1 | 1 | 0 | 1 |
| Wüste | 0 | 1 | 0 | 1 |
| Tundra | 1 | 0 | 0 | 1 |
| Schnee | 0 | 0 | 0 | 1 |
| Küste | 2 | 0 | 1 | – |
| Ozean | 1 | 0 | 1 | – |
| See | 2 | 0 | 2 | – |

Zuschläge: Hügel +1 ⚒, Bewegung 2, +25 % Verteidigung · Wald +1 ⚒, Bewegung 2, +25 % · Dschungel −1 🌾, Bewegung 2, +15 % ·
Schwemmland +2 🌾 · Fluss an einer Kante +1 💰 · Gebirge unpassierbar (0/1/0) · Ressourcen siehe `rules/resources.ts`.

## Einheiten

| Einheit | Kosten | Bewegung | Stärke | Sicht | Besonderes |
|---|---|---|---|---|---|
| Siedler | 35 | 1 | 0 | 1 | gründet Städte; braucht Stadtgröße 2, kostet 1 Bürger |
| Arbeiter | 25 | 1 | 0 | 1 | Geländeverbesserungen ab M4 |
| Späher | 15 | 2 | 1 | 2 | |
| Krieger | 12 | 1 | 2 | 1 | |

- Mit der letzten Bewegung darf jedes betretbare Feld noch betreten werden (die Runde ist danach vorbei).
- Stapel: unbegrenzt viele eigene Einheiten pro Feld; fremde Einheiten und Städte blockieren.
- Sicht: +1 auf Hügeln; Wald/Dschungel, Hügel und Gebirge verdecken, was dahinter liegt.

## Städte

- **Gründung:** auf Land (nicht Gebirge/Eis), mindestens 3 Felder Abstand zu jeder anderen Stadt, nicht in fremdem Gebiet.
  Die erste Stadt erhält den Palast.
- **Stadtfeld:** liefert mindestens 2 🌾 / 1 ⚒ / 1 💰 und wird immer bewirtschaftet.
- **Bürger:** Jeder Bürger isst 2 🌾 und bewirtschaftet ein Feld im eigenen Gebiet der Stadt. Findet sich kein lohnendes Feld,
  wird er Spezialist (+2 💰). Felder lassen sich in der Stadtansicht festlegen; den Rest verteilt die Automatik
  (Nahrung zuerst, bis +2 Überschuss erreicht ist).
- **Wachstum:** Überschuss füllt den Speicher; Bedarf für die nächste Größe = 14 + 6 × Größe. Bei Hunger schrumpft die Stadt.
- **Produktion:** Bauliste, pro Runde höchstens ein fertiges Objekt; überschüssige Produktion bleibt erhalten,
  auch beim Wechsel des Auftrags.
- **Kultur und Grenzen:** 1 Kultur pro Runde + Gebäude. Radius 1 → 2 (ab 15 Kultur) → 3 (ab 150 Kultur).
  Überschneiden sich Gebiete, gehört ein Feld der näheren Stadt, bei Gleichstand der älteren.
- **Stimmung:** Zufriedenheitsgrenze = 4 + 1 je unterschiedlichem Luxusgut im eigenen Gebiet + Gebäude.
  Jeder Bürger darüber ist unzufrieden: −10 % Produktion und Handel. Ist mindestens die Hälfte unzufrieden,
  herrscht **Unruhe**: keine Produktion, kein Handel, keine Kultur.
- **Versorgung:** Versorgungsgrenze = 4 + 2 bei Süßwasser (Fluss oder See am Stadtfeld) + Gebäude.
  Jeder Bürger darüber isst 1 🌾 zusätzlich.

### Gebäude

| Gebäude | Kosten | Wirkung |
|---|---|---|
| Palast | – | erste Stadt: +2 Kultur, +1 Stimmung |
| Denkmal | 25 | +2 Kultur |
| Schrein | 35 | +2 Stimmung, +1 Kultur |
| Kornspeicher | 45 | 40 % des Nahrungsbedarfs bleiben nach dem Wachstum im Speicher |
| Brunnen | 30 | +2 Versorgung |
| Palisade | 40 | +50 % Verteidigung (wirkt ab M5) |

## Wirtschaft

- Handel aller Städte wird per Regler aufgeteilt: Forschung (Standard 60 %) und Gold.
  Forschung sammelt sich an und wird ab M4 für Technologien ausgegeben.
- **Unterhalt:** Städte ab der vierten je 1 Gold; Einheiten über dem Freikontingent (3 + 2 je Stadt) je 1 Gold.
  Fehlt Gold, wird der Fehlbetrag aus der Forschung der Runde gedeckt.
