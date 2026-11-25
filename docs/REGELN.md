# Spielregeln (Stand M4)

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

**Ressourcen wirken erst mit ihrer Verbesserung** (Weizen/Reis → Farm, Rinder/Schafe/Pferde → Weide, Wild/Pelze → Jagdlager,
Stein → Steinbruch, Kupfer/Eisen/Edelsteine/Gold/Salz → Mine, Datteln/Wein/Gewürze/Seide → Plantage);
Fisch und Perlen wirken mit der Technologie Fischerei.

## Geländeverbesserungen (Arbeiter)

| Auftrag | Technologie | Runden | Wirkung | Erlaubt auf |
|---|---|---|---|---|
| Straße | Rad | 2 | Bewegung zwischen zwei Straßenfeldern ⅓ (mit Ingenieurwesen ¼); Handelsnetz | Land, nicht in fremdem Gebiet |
| Farm | Ackerbau | 5 | +1 🌾 (mit Bewässerung +1 🌾 an Fluss/See) | flach, ohne Bewuchs (Wüste nur Schwemmland) |
| Mine | Bergbau | 6 | +2 ⚒ | Hügel oder passende Ressource |
| Weide | Tierzucht | 4 | +1 ⚒ | Rinder, Schafe, Pferde |
| Jagdlager | Jagd | 4 | +1 💰 | Wild, Pelze |
| Plantage | Kalender | 5 | +1 💰 | Datteln, Wein, Gewürze, Seide |
| Sägewerk | Holzhandwerk | 5 | +1 ⚒ +1 💰 | Wald |
| Steinbruch | Steinmetzkunst | 5 | +1 ⚒ | Stein |
| Roden | Bronzeverarbeitung | 4 | entfernt Wald/Dschungel | nicht, wenn eine Ressource den Bewuchs braucht |

Verbesserungen nur im eigenen Gebiet. Mehrere Arbeiter am selben Auftrag addieren ihren Fortschritt. Städte zählen als Straße.

## Technologien

30 Technologien in 7 Stufen (Kosten 24 / 42 / 70 / 110 / 165 / 240 / 330 🔬). Man wählt ein **Ziel**; die Voraussetzungen werden
automatisch der Reihe nach erforscht. Ohne Ziel wird Forschung angespart. Details und Freischaltungen: `src/sim/rules/techs.ts`
bzw. im Spiel über **T**.

## Einheiten

| Einheit | Kosten | Bewegung | Stärke | Sicht | Besonderes |
|---|---|---|---|---|---|
| Siedler | 35 | 1 | 0 | 1 | gründet Städte; braucht Stadtgröße 2, kostet 1 Bürger |
| Arbeiter | 25 | 1 | 0 | 1 | Geländeverbesserungen und Straßen |
| Späher | 15 | 2 | 1 | 2 | |
| Krieger | 12 | 1 | 2 | 1 | |

- Bewegung intern in Zwölfteln (Straßen ⅓ bzw. ¼).
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
- **Handelsnetz:** Straßen, Flüsse und Städte verbinden (nicht durch fremdes Gebiet); mit Seefahrt sind alle eigenen
  Küstenstädte untereinander verbunden. Jede an den Palast angebundene Stadt erhält +2 💰.
- **Stimmung:** Zufriedenheitsgrenze = 4 + 1 je unterschiedlichem Luxusgut (verbessert, im eigenen Gebiet, angebunden) + Gebäude/Wunder.
  Jeder Bürger darüber ist unzufrieden: −10 % Produktion und Handel. Ist mindestens die Hälfte unzufrieden,
  herrscht **Unruhe**: keine Produktion, kein Handel, keine Kultur.
- **Versorgung:** Versorgungsgrenze = 4 + 2 bei Süßwasser (Fluss oder See am Stadtfeld) + Gebäude.
  Jeder Bürger darüber isst 1 🌾 zusätzlich.

### Gebäude

| Gebäude | Technologie | Kosten | Wirkung |
|---|---|---|---|
| Palast | – | – | erste Stadt: +3 🔬, +2 Kultur, +1 Stimmung |
| Denkmal | – | 25 | +2 Kultur |
| Brunnen | – | 30 | +2 Versorgung |
| Palisade | – | 40 | +50 % Verteidigung (wirkt ab M5) |
| Schrein | Mystik | 35 | +2 Stimmung, +1 Kultur |
| Kornspeicher | Töpferei | 45 | 40 % des Nahrungsbedarfs bleiben nach dem Wachstum |
| Kaserne | Bronzeverarbeitung | 40 | Erfahrung für neue Einheiten (ab M5) |
| Hafen | Segeln | 55 | +1 🌾 auf bewirtschafteten Wasserfeldern (Küstenstadt) |
| Bibliothek | Schrift | 60 | +50 % 🔬, +1 Kultur |
| Markt | Währung | 60 | +50 % Gold, +1 Stimmung |
| Gerichtsgebäude | Gesetzgebung | 60 | kein Städte-Unterhalt, +1 Stimmung |
| Theater | Theaterkunst | 70 | +2 Stimmung, +2 Kultur |
| Schmiede | Eisenverarbeitung | 80 | +25 % ⚒ |
| Aquädukt | Ingenieurwesen | 90 | +4 Versorgung |
| Burg | Burgenbau | 100 | +100 % Verteidigung (braucht Palisade, ab M5) |
| Bank | Bankwesen | 110 | +50 % Gold (braucht Markt) |
| Kathedrale | Theologie | 120 | +3 Stimmung, +3 Kultur |
| Universität | Gelehrsamkeit | 130 | +50 % 🔬 (braucht Bibliothek) |

### Weltwunder (je nur einmal auf der Welt)

| Wunder | Technologie | Kosten | Wirkung |
|---|---|---|---|
| Ewige Flamme | Mystik | 90 | +3 Kultur, +1 Stimmung in allen eigenen Städten |
| Terrassengärten | Bewässerung | 120 | +2 Versorgung in allen eigenen Städten |
| Hafen der Händler | Seefahrt | 130 | +4 💰 hier, +1 💰 in allen eigenen Küstenstädten |
| Großes Amphitheater | Theaterkunst | 140 | +1 Stimmung überall, +2 hier |
| Himmelswarte | Astronomie | 150 | +3 🔬 und +50 % 🔬 hier |
| Wall der Ahnen | Burgenbau | 170 | +50 % Verteidigung in allen eigenen Städten (ab M5) |
| Akademie der Weisen | Philosophie | 180 | Spezialisten überall +1 💰 |

Wird ein Wunder anderswo zuerst fertig, verschwindet es aus der Bauliste; die Produktion bleibt erhalten.

## Wirtschaft

- Der Handel jeder Stadt wird per Regler aufgeteilt: Forschung (Standard 60 %) und Gold; danach wirken
  Gebäude-Boni (Bibliothek, Markt …).
- **Unterhalt:** Städte ab der vierten je 1 Gold (Gerichtsgebäude befreit); Einheiten über dem Freikontingent
  (3 + 2 je Stadt, mit Lehnswesen 3 je Stadt) je 1 Gold.
  Fehlt Gold, wird der Fehlbetrag aus der Forschung der Runde gedeckt.
