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

56 Technologien in 15 Stufen (Kosten von 24 🔬 in Stufe 1 bis 1500 🔬 in Stufe 15, je Stufe gleich). Man wählt ein **Ziel**;
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
- **Erkunden (E):** Jede Einheit außer Flugzeugen zieht auf Befehl jede Runde selbst zum nächsten erreichbaren Feld am Rand des Bekannten
  (Landeinheiten über Land, Schiffe übers Wasser). Erkunden mehrere eigene Einheiten, meidet jede Ziele, die näher als 4 Felder
  am Ziel einer anderen liegen – nur wenn es keine Alternative gibt, laufen sie dasselbe Gebiet an. Sie hält an – mit Meldung, auch mitten im Zug –, sobald eine fremde Einheit
  (jedes Volk, auch Plünderer) neu in ihr eigenes Sichtfeld kommt. Einheiten, die beim Erteilen schon zu sehen waren, zählen erst
  wieder, wenn sie aus dem Blick waren; ein Kriegsgegner oder Plünderer höchstens 2 Felder entfernt hält sie aber ab der nächsten Runde an.
  Außerdem endet das Erkunden an Bord oder wenn nichts mehr zu entdecken ist. Aufwecken (F) beendet den Befehl.
- Sicht: +1 auf Hügeln; Wald/Dschungel, Hügel und Gebirge verdecken, was dahinter liegt.

## Religion

- **Glaube:** Schrein +1, Kathedrale +2, Ewige Flamme +2 je Runde. Mit **40 Glauben** und **Mystik** gründet ein Volk eine
  Religion (jedes Volk höchstens eine; insgesamt halb so viele wie Völker, mindestens 2, höchstens 5). Gegründet wird im Fenster
  **Leitbilder und Religion** (P); heilige Stadt ist die Stadt mit dem meisten Glauben.
- **Lehre** (beim Gründen gewählt, wirkt in jeder Stadt der Religion, auch bei anderen Völkern): Pilgerfahrt +2 Kultur,
  Nächstenliebe +1 Stimmung, Klosterschulen +10 % Forschung, Gemeinschaft +1 Versorgung, Zehnt +1 Gold je Stadt der Religion für den Gründer.
- **Ausbreitung:** Jede Stadt übt im Umkreis von 10 Feldern Glaubensdruck aus (heilige Stadt dreifach, Handelsroute +2);
  bestehender Druck verfällt um 10 % je Runde. Ab Druck 20, und wenn er den der bisherigen Religion um mehr als 20 % übersteigt,
  tritt die Stadt über. Heilige Städte wechseln nie.
- **Missionar** (Theologie, nur mit Staatsreligion): bekehrt in einer eigenen oder neben einer fremden Stadt (nicht im Krieg)
  sofort (Taste V); er verbraucht sich dabei und darf wie Händler im Frieden fremdes Gebiet betreten.
- **Staatsreligion** = Religion der Hauptstadt. Gleiche Staatsreligion verbessert die Haltung zweier Völker um 1, verschiedene verschlechtert sie um 1.
- Die KI baut Glaubensgebäude, solange noch Religionen frei sind, gründet sofort und schickt Missionare.

## Umwelt

- **Verschmutzung je Stadt und Runde:** Fabrik +2, Kraftwerk +3, ab Größe 13 je angefangene 8 Einwohner +1; der
  **Recyclinghof** (Technologie **Ökologie**) zieht 3 ab. Je Punkt besteht jede Runde eine Chance von 4 %, dass ein Landfeld im
  Gebiet der Stadt verschmutzt (bewirtschaftete Felder zuerst). Die Stadtansicht zeigt den Wert.
- **Verschmutzte Felder** bringen je 1 weniger Nahrung, Produktion und Handel (nicht unter 0). Arbeiter können sie **säubern**
  (ab Industrialisierung, 4 Runden; mit Ökologie 2 Runden).
- **Klimawandel:** Mit je 200 verschmutzten Feldern weltweit steigt die Chance je Runde um 100 % (höchstens 50 %), dass irgendwo
  ein Feld verödet: Grasland wird Ebene, Ebene wird Wüste.
- Die KI säubert verschmutzte Felder vorrangig und baut Recyclinghöfe in stark verschmutzenden Städten.

## Luftfahrt

Mit der Technologie **Luftfahrt** (Stufe 13, nach Verbrennungsmotor und Funktechnik) kommen vier Einheiten:

| Einheit | Rolle |
|---|---|
| **Jagdflugzeug** | fängt feindliche Luftangriffe im Einsatzradius (6) ab; kann auch selbst angreifen |
| **Bomber** | starker Luftangriff (Radius 8) auf Land- und Seeeinheiten, +25 % gegen Städte, +50 % gegen Schiffe |
| **Flugabwehr** | Landeinheit; beschießt angreifende Flugzeuge im Umkreis von 2 Feldern |
| **Flugzeugträger** | Schiff mit 3 Stellplätzen für Flugzeuge |

- Flugzeuge **ziehen nicht über die Karte**. Sie stehen in einer eigenen Stadt oder auf einem eigenen Träger und haben je Runde
  **einen Einsatz**: Luftangriff auf ein sichtbares Ziel im Einsatzradius oder **Verlegen** in eine eigene Stadt bzw. auf einen
  Träger mit freiem Platz (bis zum doppelten Radius). Bedienung: Rechtsklick, „Einsatz“ oder langes Drücken auf das Ziel.
- Luftangriffe sind Fernkampf: Das Ziel wehrt sich nicht. Vorher fängt aber jedes feindliche Jagdflugzeug, dessen Radius das
  Ziel erreicht, und jede Flugabwehr im Umkreis ab – **je einmal pro Runde**. Abfangjäger und Flugzeug nehmen beide Schaden,
  Flugabwehr schießt nur. Wird das Flugzeug abgeschossen, fällt der Angriff aus.
- Flugzeuge **verteidigen kein Feld**. Wird ihre Stadt erobert oder ihr Träger versenkt, sind sie verloren.
- Die KI baut im Krieg Jäger zur Abwehr, kriegerische Herrscher auch Bomber, und Flugabwehr, wenn feindliche Flugzeuge in der
  Nähe sind. Bomber suchen das lohnendste Ziel (Abfanggefahr eingerechnet) und verlegen ohne Ziel Richtung Front.

## Kampf

- Jede Einheit hat **100 Lebenspunkte**; Verletzte kämpfen schwächer (Stärke × (50 % + 50 % × LP-Anteil)).
- **Schaden** je Seite = 28 × (eigene / gegnerische Stärke)^1,3 × Zufall 0,8–1,2. **Nahkampf**: beide Seiten nehmen Schaden;
  **Fernkampf** (Reichweite 2): nur der Verteidiger. Fallen beide, überlebt die Seite mit dem kleineren Defizit mit 1 LP.
- **Verteidigung**: Hügel/Wald +25 %, Dschungel +15 %, Fluss zwischen den Feldern +25 % (nur Nahkampf), befestigt +25 %,
  Stadt +25 % + Gebäude (Palisade 50, Burg 100) + Wunder, dazu Einheiten- und Beförderungsboni.
- Gegen einen Stapel kämpft immer dessen **bester Verteidiger**. Fällt der letzte Kämpfer, rückt ein Nahkämpfer nach:
  Zivilisten werden gefangen (Siedler werden zu Arbeitern), Städte erobert, Lager ausgehoben (+25 Gold).
  In einer Stadt verteidigen auch Einheiten, die auf ein Schiff verladen sind; Schiffe und Flugzeuge im Hafen gehen bei der Eroberung verloren.
- **Eroberte Städte**: −1 Größe, Bauliste und Produktion verloren, der Palast zieht in die älteste verbleibende Stadt des Verlierers.
  Wer keine Stadt mehr hat, ist vernichtet; seine übrigen Einheiten verschwinden. Vor der ersten Stadtgründung
  hält ein Siedler das Volk im Spiel. Spieloption „Aus: ohne Städte und Einheiten“: Ein Volk scheidet erst aus,
  wenn auch seine letzte Einheit gefallen ist.
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
- **Krieg zerstört Handelsrouten** zwischen den Städten der Kriegsparteien (bei der Kriegserklärung, beim Bündnisfall und
  wenn eine Stadt an einen Gegner fällt). Ein Friedensschluss stellt sie nicht wieder her – dafür braucht es neue Händler.
- **Zufallsereignisse**: 4 % je Runde und Volk (ab Runde 10) – gute Ernte, Goldader, Seuche (Aquädukt/Krankenhaus schützen),
  Erfinder, Waldbrand, Flüchtlinge.

## Diplomatie

- Völker lernen sich kennen, sobald sie Einheiten, Städte oder Gebiet der anderen sehen. Grundzustand ist **Frieden**.
- Angriffe auf Völker im Frieden erfordern eine **Kriegserklärung** (Rückfrage beim Angriff oder in der Diplomatie, D).
  Plünderer sind immer feindlich.
- Im Frieden ohne **offene Grenzen** darf man fremdes Gebiet nicht betreten; bei Friedensschluss kehren Truppen
  aus fremdem Gebiet in die nächste eigene Stadt zurück (Schiffe samt Ladung in die nächste Küstenstadt).
- **Haltung** (−10 … +10): −4 im Krieg, bis +3 durch lange Friedenszeit, +2 offene Grenzen, ±Gedächtnis
  (erlittene Kriegserklärung −4, Handel +1, Dritte −1 gegenüber Aggressoren; verblasst alle 10 Runden um 1 Richtung 0),
  aggressive Herrscher −1 bis −2. KIs bieten einander offene Grenzen ab Haltung +2 an.
- **Angebote**: Frieden (nach mind. 6 Kriegsrunden; die KI willigt ein, wenn sie unterlegen ist oder der Krieg lange dauert),
  offene Grenzen (ab Haltung +1 oder bei friedfertigen Herrschern), Handel mit Gold und Technologien
  (Technologie zählt 1,2 × ihre Kosten; Aufschlag je nach Haltung 0,9 / 1,0 / 1,3; ab −6 kein Handel).

- **Bündnis** (Verteidigungsbündnis, nur mit offenen Grenzen): gemeinsame Sicht; erklärt ein Dritter einem Partner den Krieg,
  tritt der andere automatisch bei. Verbündeten kann man nicht den Krieg erklären – erst kündigen (Haltung des Partners −3).
- **Forderung (Tribut):** Gold oder Technologie ohne Gegenleistung. Die KI gibt nur deutlich Stärkeren nach (Haltung −2);
  wird eine Forderung einer kriegerischen KI abgelehnt, erklärt sie eher den Krieg. Starke kriegerische KIs fordern selbst.

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
  Ab Runde 30 (mit mindestens zwei Städten) erkundet ein Schiff die Küsten, solange bekanntes Wasser an Unerforschtes grenzt –
  erst dadurch kennt die KI andere Landmassen.
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

## Karteneditor und Szenarien

- **Editor** (Kopfleiste „🗺️ Editor“ bzw. `editor.html`): Zufallskarte als Ausgangspunkt oder leere Karte (Ozean) in allen Größen.
  Werkzeuge: Gelände, Höhe, Bewuchs, Ressource (nur wo sie passt), Flüsse (zwei Nachbarfelder nacheinander anklicken = Fluss auf der
  gemeinsamen Kante an/aus), Flüsse entfernen, Startfelder; Pinsel einzeln oder Radius 1/2; Strg/⌘+Z macht rückgängig.
  Klick malt, Ziehen verschiebt die Karte. Der Arbeitsstand bleibt im Browser erhalten.
- **Spielbar** ist ein Szenario mit 2–10 Startfeldern auf Land (kein Gebirge) und mindestens 4 Feldern Abstand; Probleme stehen unten rechts.
  Startfeld 1 gehört dem (ersten) Menschen, die übrigen der KI bzw. weiteren Hotseat-Spielern. Optional: Name, Beschreibung, Rundenlimit.
- **Speichern** als Datei (`*.iv4ever-szenario.json`); **Spielen** startet sofort. Im Spiel startet „Laden ▾ → Spielstand oder
  Szenario aus Datei laden“ ein Szenario mit Schwierigkeit und Modus aus der Kopfleiste. Online-Partien mit Szenario gibt es noch nicht.
