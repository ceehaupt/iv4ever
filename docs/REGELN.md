# Spielregeln (Stand M10)

Eigene Entwürfe. Alle Zahlen stehen als Konstanten bzw. Tabellen im Code und lassen sich dort anpassen:
`src/sim/city.ts`, `src/sim/game.ts`, `src/sim/rules/*.ts`.

Die vollständigen Tabellen (Gelände, Ressourcen, Einheiten, Beförderungen, Gebäude, Wunder, Technologien, Leitbilder) stehen in
[`REGELN-DATEN.md`](REGELN-DATEN.md). Sie wird mit `npm run docs` aus dem Code erzeugt; ein Test prüft, dass sie aktuell ist.
Hier stehen die Regeln, die sich nicht aus Tabellen ablesen lassen.

## Gelände

Erträge und Bewegungskosten je Gelände: siehe [`REGELN-DATEN.md`](REGELN-DATEN.md#gelände).

Zuschläge: Hügel +1 ⚒, Bewegung 2, +25 % Verteidigung · Wald +1 ⚒, Bewegung 2, +25 % · Dschungel −1 🌾, Bewegung 2, +15 % ·
Schwemmland +2 🌾 · Fluss an einer Kante +1 💰 · Gebirge und Packeis unpassierbar · Ressourcen siehe [`REGELN-DATEN.md`](REGELN-DATEN.md#ressourcen).

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

54 Technologien in 15 Stufen (Kosten von 24 🔬 in Stufe 1 bis 1500 🔬 in Stufe 15, je Stufe gleich). Man wählt ein **Ziel**;
die Voraussetzungen werden automatisch der Reihe nach erforscht. Ohne Ziel wird Forschung angespart. Freischaltungen:
[`REGELN-DATEN.md`](REGELN-DATEN.md#technologien) bzw. im Spiel über **T**.

## Einheiten

Werte aller Einheiten: [`REGELN-DATEN.md`](REGELN-DATEN.md#einheiten). Start mit Siedler, Krieger und Späher.

- **Seefahrt:** Schiffe entstehen in Küstenstädten und fahren auf Küstengewässern (Karavelle auch auf dem Ozean), nie auf Binnenseen.
  Landeinheiten gehen an Bord, indem sie auf das Wasserfeld eines eigenen Transportschiffs mit freiem Platz ziehen
  oder in einer Stadt eingeladen werden (L). Sie gehen an Land, indem sie auf ein Landfeld ziehen – die Landung beendet den Zug.
  Schiffe kämpfen nur gegen Schiffe; ein versenktes Schiff reißt seine Ladung mit. Schiffe in einer eroberten Stadt werden versenkt.
  Mit **Navigation** sind alle Schiffe hochseetauglich.
- Strategische Ressourcen zählen, wenn sie verbessert, im eigenen Gebiet und an das Handelsnetz angebunden sind.
- Bewegung intern in Zwölfteln (Straßen ⅓, mit Ingenieurwesen ¼, Eisenbahn ⅙).
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

### Erfahrung und Beförderungen

- Sieg im Nahkampf +3, Fernkampftreffer +1 (+2 bei Tötung), Überleben als Verteidiger +2. Kaserne: neue Einheiten mit 5 EP.
- Beförderung ab 5 / 12 / 22 / 35 / 52 / 75 / 100 EP; jede Beförderung heilt +25 LP.
- Kampferprobt I–III (+15/+15/+20 %), Waldläufer (+30 % in Hügeln/Wald/Dschungel), Sturmtrupp I–II (+20/+30 % gegen Städte),
  Stadtwache I–II (+20/+30 % in Städten), Flankenschutz (+50 % gegen Berittene), Gewaltmarsch (+1 Bewegung),
  Feldscher (+10 Heilung auf dem Feld). Voraussetzungen siehe `src/sim/rules/units.ts`.

## Leitbilder

Je Bereich gilt ein Leitbild; ein Wechsel kostet eine Runde **Umbruch** (keine Forschung, kein Gold). Details: `src/sim/rules/doctrines.ts` bzw. im Spiel über **P**.

| Bereich | Leitbilder |
|---|---|
| Herrschaft | Stammesrat · Erbmonarchie (Mystik) · Bürgerrepublik (Gesetzgebung) · Volksherrschaft (Verfassung) · Machtstaat (Ideologien) |
| Wirtschaft | Tauschwirtschaft · Zunftwesen (Währung) · Handelsherrschaft (Bankwesen) · Freier Markt (Ökonomie) · Planwirtschaft (Industrialisierung) |
| Gesellschaft | Ahnenverehrung · Tempelpflicht (Theologie) · Bildungsideal (Bildungswesen) · Freiheitsrechte (Verfassung) · Fürsorgestaat (Medizin) |

## Handelsrouten und Ereignisse

- Ein **Händler** in oder neben einer mindestens 6 Felder entfernten Stadt errichtet eine Route von der nächsten eigenen Stadt
  dorthin (je Stadt höchstens 2). Ertrag: 2 + 1 je 8 Felder + 1 ins Ausland (+ Leitbild/Globalisierung); die Zielstadt erhält +1.
- Händler dürfen im Frieden **fremdes Gebiet betreten** (auch ohne offene Grenzen), fremde Städte aber nicht – die Route
  zu einer fremden Stadt entsteht vom Nachbarfeld aus. Im Krieg gilt das nicht.
- **Zufallsereignisse**: 4 % je Runde und Volk (ab Runde 10) – gute Ernte, Goldader, Seuche (Aquädukt/Krankenhaus schützen),
  Erfinder, Waldbrand, Flüchtlinge.

## Diplomatie

- Völker lernen sich kennen, sobald sie Einheiten, Städte oder Gebiet der anderen sehen. Grundzustand ist **Frieden**.
- Angriffe auf Völker im Frieden erfordern eine **Kriegserklärung** (Rückfrage beim Angriff oder in der Diplomatie, D).
  Plünderer sind immer feindlich.
- Im Frieden ohne **offene Grenzen** darf man fremdes Gebiet nicht betreten; bei Friedensschluss kehren Truppen
  aus fremdem Gebiet in die nächste eigene Stadt zurück.
- **Haltung** (−10 … +10): −4 im Krieg, bis +3 durch lange Friedenszeit, +2 offene Grenzen, ±Gedächtnis
  (erlittene Kriegserklärung −4, Handel +1, Dritte −1 gegenüber Aggressoren), aggressive Herrscher −1 bis −2.
- **Angebote**: Frieden (nach mind. 6 Kriegsrunden; die KI willigt ein, wenn sie unterlegen ist oder der Krieg lange dauert),
  offene Grenzen (ab Haltung +1 oder bei friedfertigen Herrschern), Handel mit Gold und Technologien
  (Technologie zählt 1,2 × ihre Kosten; Aufschlag je nach Haltung 0,9 / 1,0 / 1,3; ab −6 kein Handel).

## Siegbedingungen

- **Eroberung**: alle anderen Völker vernichtet.
- **Vorherrschaft**: mindestens 45 % des Landes und 50 % der Weltbevölkerung.
- **Kultur**: drei eigene Städte mit je mindestens 2400 Kultur.
- **Projekt**: alle drei Teile des Großprojekts „Aufbruch“ (Startrampe, Sternenantrieb, Habitatmodul) in eigenen Städten.
- **Punkte**: Beim Rundenlimit (Standard 300) gewinnt die höchste Punktzahl
  (Bevölkerung ×3, Land ÷3, Technologien ×6, Wunder ×20, Kultur ÷50).

## Computerspieler

- Erfundene Völker und Herrscher (`src/sim/rules/leaders.ts`); die Persönlichkeit bestimmt Forschung, Expansion, Militär und Bauten.
- Schwierigkeitsgrad: Die KI erhält einen Faktor auf Produktion, Forschung und Nahrungsüberschuss –
  Leicht 0,8 · Normal 1,0 · Schwer 1,25 · Sehr schwer 1,5. Die KI sieht nur, was sie erkundet hat.
- Der Schwierigkeitsgrad ändert auch das **Verhalten** (`AI_TACTICS`):

  | | Leicht | Normal | Schwer | Sehr schwer |
  |---|---|---|---|---|
  | Mindest-Siegchance für Angriffe | 70 % | 55 % | 50 % | 45 % |
  | Armeegröße für einen Feldzug | 6 | 4 | 4 | 5 |
  | Kriegserklärungen frühestens ab Runde | 80 | 35 | 30 | 25 |
  | Armee im Verhältnis zur Städtezahl | 0,7 | 1,0 | 1,2 | 1,4 |

- **Feldzüge:** Kriegerische Herrscher sammeln ihre Armee in der Stadt, die dem Ziel am nächsten liegt, und ziehen erst
  geschlossen los; Fern- und Belagerungseinheiten greifen zuerst an.
- **Seefahrt:** Findet ein Siedler an Land keinen Platz mehr, bringt ein Transportschiff ihn mit Begleitschutz auf eine andere
  Landmasse. Kriegerische Herrscher landen Truppen bei Gegnern in Übersee; Kriegsschiffe greifen feindliche Schiffe an.
- **Händler:** Die KI baut Händler, solange Routenplätze frei sind, und wählt die lohnendste erreichbare Stadt.
- **Großprojekt:** Forschungsorientierte Herrscher steuern ab dem mittleren Spiel die Raumfahrt an und bauen die Teile
  in ihrer produktivsten Stadt.
- **Drohender Sieg:** Steht ein Volk kurz vor einem Sieg (zwei Projektteile, eine Kulturstadt weniger als nötig oder 80 %
  der Vorherrschaftsschwellen), erklären ihm auch friedliche Herrscher eher den Krieg und bieten keinen Frieden an;
  Feldzüge richten sich bevorzugt gegen seine Städte.

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

### Gebäude und Wunder

Kosten, Voraussetzungen und Wirkungen: [`REGELN-DATEN.md`](REGELN-DATEN.md#gebäude) und
[Wunder und Projekt](REGELN-DATEN.md#wunder-und-projekt). Allgemein gilt:

- Die erste Stadt erhält den **Palast**. Manche Gebäude setzen ein anderes voraus (z. B. Bank → Markt, Universität → Bibliothek,
  Burg → Palisade).
- **Weltwunder** gibt es nur einmal auf der Welt. Wird ein Wunder anderswo zuerst fertig, verschwindet es aus der Bauliste;
  die Produktion bleibt erhalten.
- Das **Großprojekt „Aufbruch“** besteht aus Startrampe, Sternenantrieb und Habitatmodul (siehe Siegbedingungen).

## Wirtschaft

- Der Handel jeder Stadt wird per Regler aufgeteilt: Forschung (Standard 60 %) und Gold; danach wirken
  Gebäude-Boni (Bibliothek, Markt …).
- **Unterhalt:** Städte ab der vierten je 1 Gold (Gerichtsgebäude befreit); Einheiten über dem Freikontingent
  (3 + 2 je Stadt, mit Lehnswesen 3 je Stadt) je 1 Gold.
  Fehlt Gold, wird der Fehlbetrag aus der Forschung der Runde gedeckt.

## Mehrspieler

- **Hotseat:** 2–4 Menschen am selben Gerät; zwischen den Zügen verdeckt ein Übergabebildschirm die Karte. Speichern und Laden möglich.
- **Online (2–8 Menschen):** deterministischer Lockstep über einen Relay-Server, der nur die Reihenfolge der Aktionen festlegt.
  Jeder Rechner berechnet die Simulation selbst; eine Prüfsumme je Runde deckt Abweichungen auf, dann verteilt der Gastgeber
  seinen Stand. Die Runde endet, wenn alle Menschen „Runde beenden“ gedrückt haben – oder wenn das Zeitlimit des Gastgebers abläuft.
- **Verbindungsabbruch:** Nach einer Kulanzzeit (Standard 30 s) übernimmt die KI das Volk („… (KI)“), an derselben Stelle der
  Aktionsfolge auf allen Rechnern. Beim Wiedereinstieg spielt der Mensch wieder selbst.
- **Speichern:** Im Online-Spiel speichert der Gastgeber; fortgesetzt wird in einem neuen Raum, fehlende Menschen spielt die KI.
- Angebote zwischen Menschen (Frieden, offene Grenzen, Handel) müssen vom Gegenüber angenommen werden.
