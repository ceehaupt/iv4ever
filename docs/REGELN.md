# Spielregeln (Stand M5)

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

| Einheit | Klasse | Technologie | Ressource | Kosten | Bew. | Stärke | Fernkampf | Besonderes |
|---|---|---|---|---|---|---|---|---|
| Siedler | Zivil | – | – | 35 | 1 | – | – | gründet Städte; braucht Stadtgröße 2, kostet 1 Bürger |
| Arbeiter | Zivil | – | – | 25 | 1 | – | – | Verbesserungen und Straßen |
| Späher | Aufklärung | – | – | 15 | 2 | 1 | – | Sicht 2 |
| Krieger | Nahkampf | – | – | 12 | 1 | 2 | – | |
| Bogenschütze | Fernkampf | Jagd | – | 22 | 1 | 2 | 3 (2 Felder) | +25 % in Städten |
| Speerkämpfer | Nahkampf | Bronzeverarbeitung | Kupfer | 25 | 1 | 4 | – | +100 % gegen Berittene |
| Reiter | Beritten | Tierzucht | Pferde | 30 | 2 | 4 | – | |
| Schwertkämpfer | Nahkampf | Eisenverarbeitung | Eisen | 40 | 1 | 6 | – | +25 % gegen Städte |
| Katapult | Belagerung | Mathematik | – | 45 | 1 | 2 | 6 (2 Felder) | +100 % gegen Städte |
| Langbogenschütze | Fernkampf | Baukunst | – | 45 | 1 | 4 | 5 (2 Felder) | +50 % in Städten |
| Pikenier | Nahkampf | Lehnswesen | Eisen | 50 | 1 | 7 | – | +100 % gegen Berittene |
| Ritter | Beritten | Lehnswesen | Pferde + Eisen | 70 | 2 | 10 | – | |
| Tribok | Belagerung | Burgenbau | – | 70 | 1 | 3 | 9 (2 Felder) | +100 % gegen Städte |

| Galeere | Schiff | Segeln | – | 35 | 3 | 1 | – | Küste; transportiert 2 Landeinheiten |
| Kriegsgaleere | Schiff | Seefahrt | – | 40 | 3 | 3 | – | Küste; Seekampf |
| Karavelle | Schiff | Astronomie | – | 55 | 4 | 2 | – | auch Ozean; transportiert 3 |

- **Seefahrt:** Schiffe entstehen in Küstenstädten und fahren auf Küstengewässern (Karavelle auch auf dem Ozean), nie auf Binnenseen.
  Landeinheiten gehen an Bord, indem sie auf das Wasserfeld eines eigenen Transportschiffs mit freiem Platz ziehen
  oder in einer Stadt eingeladen werden (L). Sie gehen an Land, indem sie auf ein Landfeld ziehen – die Landung beendet den Zug.
  Schiffe kämpfen nur gegen Schiffe; ein versenktes Schiff reißt seine Ladung mit. Schiffe in einer eroberten Stadt werden versenkt.
- Strategische Ressourcen zählen, wenn sie verbessert, im eigenen Gebiet und an das Handelsnetz angebunden sind.
- Bewegung intern in Zwölfteln (Straßen ⅓ bzw. ¼).
- Mit der letzten Bewegung darf jedes betretbare Feld noch betreten werden (die Runde ist danach vorbei).
- Stapel: unbegrenzt viele eigene Einheiten pro Feld; fremde Einheiten und Städte blockieren.
- Sicht: +1 auf Hügeln; Wald/Dschungel, Hügel und Gebirge verdecken, was dahinter liegt.

## Kampf

- Jede Einheit hat **100 Lebenspunkte**; Verletzte kämpfen schwächer (Stärke × (50 % + 50 % × LP-Anteil)).
- **Schaden** je Seite = 28 × (eigene / gegnerische Stärke)^1,3 × Zufall 0,8–1,2. **Nahkampf**: beide Seiten nehmen Schaden;
  **Fernkampf** (Reichweite 2): nur der Verteidiger. Fallen beide, überlebt die Seite mit dem kleineren Defizit mit 1 LP.
- **Verteidigung**: Hügel/Wald +25 %, Dschungel +15 %, Fluss zwischen den Feldern +25 % (nur Nahkampf), befestigt +25 %,
  Stadt +25 % + Gebäude (Palisade 50, Burg 100) + Wunder, dazu Einheiten- und Beförderungsboni.
- Gegen einen Stapel kämpft immer dessen **bester Verteidiger**. Fällt der letzte Kämpfer, rückt ein Nahkämpfer nach:
  Zivilisten werden gefangen (Siedler werden zu Arbeitern), Städte erobert, Lager ausgehoben (+25 Gold).
- **Eroberte Städte**: −1 Größe, Bauliste und Produktion verloren, der Palast zieht in die älteste verbleibende Stadt des Verlierers.
  Wer keine Städte und Einheiten mehr hat, ist vernichtet.
- Angreifen beendet den Zug der Einheit. Die Vorhersage (Maus über dem Ziel) zeigt Siegchance und Schadensspannen.
- **Heilung** am Rundenbeginn, wenn die Einheit nicht gezogen hat oder angegriffen wurde: +10 im Feld, +15 im eigenen Gebiet,
  +25 in eigener Stadt (+10 mit Feldscher auf dem Feld).
- Bis zur Diplomatie (M7) herrscht mit allen Zivilisationen Krieg.

### Erfahrung und Beförderungen

- Sieg im Nahkampf +3, Fernkampftreffer +1 (+2 bei Tötung), Überleben als Verteidiger +2. Kaserne: neue Einheiten mit 5 EP.
- Beförderung ab 5 / 12 / 22 / 35 / 52 / 75 / 100 EP; jede Beförderung heilt +25 LP.
- Kampferprobt I–III (+15/+15/+20 %), Waldläufer (+30 % in Hügeln/Wald/Dschungel), Sturmtrupp I–II (+20/+30 % gegen Städte),
  Stadtwache I–II (+20/+30 % in Städten), Flankenschutz (+50 % gegen Berittene), Gewaltmarsch (+1 Bewegung),
  Feldscher (+10 Heilung auf dem Feld). Voraussetzungen siehe `src/sim/rules/units.ts`.

## Computerspieler

- Erfundene Völker und Herrscher (`src/sim/rules/leaders.ts`); die Persönlichkeit bestimmt Forschung, Expansion, Militär und Bauten.
- Schwierigkeitsgrad: Die KI erhält einen Faktor auf Produktion, Forschung und Nahrungsüberschuss –
  Leicht 0,8 · Normal 1,0 · Schwer 1,25 · Sehr schwer 1,5. Die KI sieht nur, was sie erkundet hat.

## Plünderer

- Neutrale Fraktion ab Runde 15. Alle 4 Runden kann ein Lager entstehen: auf freiem Land außerhalb jeder Grenze, unbeobachtet,
  mindestens 5 Felder von Städten entfernt (höchstens 1 Lager je 160 Landfelder).
- Lager bringen alle 7 Runden eine Einheit hervor (höchstens 3 je Lager); die Typen werden mit der Zeit stärker.
- Plünderer greifen Ziele in 7 Feldern Umkreis an, wenn der Schadenstausch günstig ist; Zivilisten und leere Städte immer.

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
