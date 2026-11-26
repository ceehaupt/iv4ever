# iv4ever – Spieldaten

Automatisch aus `src/sim/rules/` erzeugt (`npm run docs`). Nicht von Hand bearbeiten – Regeln und Erklärungen stehen in `REGELN.md`.

## Gelände

| Gelände | Erträge | Hinweis |
|---|---|---|
| Ozean | 🌾1 ⚒️0 💰1 | Wasser – nur Schiffe |
| Küste | 🌾2 ⚒️0 💰1 | Wasser – nur Schiffe |
| Grasland | 🌾2 ⚒️0 💰0 |  |
| Ebene | 🌾1 ⚒️1 💰0 |  |
| Wüste | 🌾0 ⚒️1 💰0 |  |
| Tundra | 🌾1 ⚒️0 💰0 |  |
| Schnee | 🌾0 ⚒️0 💰0 |  |
| See | 🌾2 ⚒️0 💰2 | Wasser – nur Schiffe |
| Hügel | +1 ⚒️ | Bewegung 2, Verteidigung +25 % |
| Gebirge | +0 ⚒️ | unpassierbar |
| Wald | 🌾0 ⚒️1 💰0 | Bewegung 2, Verteidigung +25 % |
| Dschungel | 🌾-1 ⚒️0 💰0 | Bewegung 2, Verteidigung +15 % |
| Packeis | 🌾0 ⚒️0 💰0 | unpassierbar |
| Schwemmland | 🌾2 ⚒️0 💰0 | Bewegung 1, Verteidigung +0 % |

## Ressourcen

| Ressource | Art | Bonus | Braucht |
|---|---|---|---|
| 🌾 Weizen | Bonus | 🌾1 ⚒️0 💰0 | Farm |
| 🍚 Reis | Bonus | 🌾1 ⚒️0 💰0 | Farm |
| 🐄 Rinder | Bonus | 🌾1 ⚒️1 💰0 | Weide |
| 🐑 Schafe | Bonus | 🌾1 ⚒️0 💰1 | Weide |
| 🦌 Wild | Bonus | 🌾1 ⚒️0 💰0 | Jagdlager |
| 🐟 Fisch | Bonus | 🌾2 ⚒️0 💰0 | Fischerei |
| 🪨 Stein | Bonus | 🌾0 ⚒️2 💰0 | Steinbruch |
| 🌴 Datteln | Bonus | 🌾1 ⚒️0 💰1 | Plantage |
| 🍇 Wein | Luxus | 🌾0 ⚒️0 💰2 | Plantage |
| 🌶️ Gewürze | Luxus | 🌾0 ⚒️0 💰2 | Plantage |
| 🧵 Seide | Luxus | 🌾0 ⚒️0 💰2 | Plantage |
| 🧂 Salz | Luxus | 🌾0 ⚒️1 💰1 | Mine |
| 💎 Edelsteine | Luxus | 🌾0 ⚒️0 💰3 | Mine |
| 🪙 Gold | Luxus | 🌾0 ⚒️0 💰3 | Mine |
| 🦊 Pelze | Luxus | 🌾0 ⚒️0 💰2 | Jagdlager |
| 🦪 Perlen | Luxus | 🌾0 ⚒️0 💰2 | Fischerei |
| 🥉 Kupfer | Strategisch | 🌾0 ⚒️1 💰0 | Mine |
| ⛓️ Eisen | Strategisch | 🌾0 ⚒️1 💰0 | Mine |
| 🐎 Pferde | Strategisch | 🌾0 ⚒️1 💰0 | Weide |

## Einheiten

| Einheit | Klasse | Kosten | Stärke | Fernkampf | Bewegung | Technologie | Ressourcen |
|---|---|---|---|---|---|---|---|
| ⛺ Siedler | Zivil | 35 | – | – | 1 | – | – |
| ⛏️ Arbeiter | Zivil | 25 | – | – | 1 | – | – |
| 🧭 Späher | Aufklärung | 15 | 1 | – | 2 | – | – |
| 🪓 Krieger | Nahkampf | 12 | 2 | – | 1 | – | – |
| 🔱 Speerkämpfer | Nahkampf | 25 | 4 | – | 1 | Bronzeverarbeitung | Kupfer |
| 🏹 Bogenschütze | Fernkampf | 22 | 2 | 3 (2) | 1 | Jagd | – |
| 🐎 Reiter | Beritten | 30 | 4 | – | 2 | Tierzucht | Pferde |
| ⚔️ Schwertkämpfer | Nahkampf | 40 | 6 | – | 1 | Eisenverarbeitung | Eisen |
| 🪨 Katapult | Belagerung | 45 | 2 | 6 (2) | 1 | Mathematik | – |
| 🎯 Langbogenschütze | Fernkampf | 45 | 4 | 5 (2) | 1 | Baukunst | – |
| 🗡️ Pikenier | Nahkampf | 50 | 7 | – | 1 | Lehnswesen | Eisen |
| 🏇 Ritter | Beritten | 70 | 10 | – | 2 | Lehnswesen | Pferde, Eisen |
| 🏗️ Tribok | Belagerung | 70 | 3 | 9 (2) | 1 | Burgenbau | – |
| 🛶 Galeere | Schiff | 35 | 1 | – | 3 | Segeln | – |
| ⛵ Kriegsgaleere | Schiff | 40 | 3 | – | 3 | Seefahrt | – |
| 🚢 Karavelle | Schiff | 55 | 2 | – | 4 | Astronomie | – |
| 🐪 Händler | Zivil | 40 | – | – | 2 | Währung | – |
| 💂 Musketier | Nahkampf | 60 | 9 | – | 1 | Schießpulver | – |
| 💣 Kanone | Belagerung | 80 | 4 | 12 (2) | 1 | Metallurgie | – |
| 🐴 Kavallerie | Beritten | 85 | 13 | – | 3 | Militärtradition | Pferde |
| ⛴️ Fregatte | Schiff | 75 | 7 | – | 5 | Navigation | – |
| 🎖️ Schützen | Nahkampf | 100 | 16 | – | 1 | Präzisionswaffen | – |
| 🎇 Artillerie | Belagerung | 120 | 6 | 22 (2) | 1 | Elektrizität | – |
| 🛳️ Panzerschiff | Schiff | 110 | 14 | – | 4 | Dampfkraft | Eisen |
| 🪖 Infanterie | Nahkampf | 140 | 24 | – | 1 | Motorisierung | – |
| 🛡 Panzer | Beritten | 180 | 32 | – | 3 | Motorisierung | Eisen |
| 🚤 Zerstörer | Schiff | 140 | 24 | – | 7 | Verbrennungsmotor | – |
| 🚛 Transporter | Schiff | 110 | 6 | – | 6 | Verbrennungsmotor | – |

## Beförderungen

| Beförderung | Wirkung | Voraussetzung |
|---|---|---|
| Kampferprobt I | +15 % Stärke | – |
| Kampferprobt II | +15 % Stärke | Kampferprobt I |
| Kampferprobt III | +20 % Stärke | Kampferprobt II |
| Waldläufer | +30 % in Hügeln, Wald und Dschungel | – |
| Sturmtrupp I | +20 % beim Angriff auf Städte | – |
| Sturmtrupp II | +30 % beim Angriff auf Städte | Sturmtrupp I |
| Stadtwache I | +20 % Verteidigung in Städten | – |
| Stadtwache II | +30 % Verteidigung in Städten | Stadtwache I |
| Flankenschutz | +50 % gegen Berittene | Kampferprobt I |
| Gewaltmarsch | +1 Bewegung | Kampferprobt II oder Waldläufer |
| Feldscher | Einheiten auf dem Feld heilen +10 pro Runde | Kampferprobt I oder Stadtwache I |

## Gebäude

| Gebäude | Kosten | Technologie | Wirkung |
|---|---|---|---|
| 🏛️ Palast | – | – | Regierungssitz. +3 Forschung, +2 Kultur, +1 Stimmung. Andere Städte werden über das Handelsnetz an ihn angebunden. |
| 🗿 Denkmal | 25 | – | +2 Kultur – die Grenzen wachsen schneller. |
| ⛩️ Schrein | 35 | Mystik | +2 Stimmung, +1 Kultur. |
| 🌾 Kornspeicher | 45 | Töpferei | Nach dem Wachstum bleiben 40 % der Nahrung im Speicher. |
| ⛲ Brunnen | 30 | – | +2 Versorgung. |
| 🪵 Palisade | 40 | – | +50 % Verteidigung der Stadt (wirkt mit dem Kampfsystem). |
| 📚 Bibliothek | 60 | Schrift | +50 % Forschung dieser Stadt, +1 Kultur. |
| 🏪 Markt | 60 | Währung | +50 % Gold dieser Stadt, +1 Stimmung. |
| ⚓ Hafen | 55 | Segeln | +1 Nahrung auf bewirtschafteten Wasserfeldern. |
| 🛡️ Kaserne | 40 | Bronzeverarbeitung | Neue Einheiten starten mit Erfahrung (wirkt mit dem Kampfsystem). |
| ⚒️ Schmiede | 80 | Eisenverarbeitung | +25 % Produktion. |
| 🚰 Aquädukt | 90 | Ingenieurwesen | +4 Versorgung. |
| 🎭 Theater | 70 | Theaterkunst | +2 Stimmung, +2 Kultur. |
| ⚖️ Gerichtsgebäude | 60 | Gesetzgebung | Stadt kostet keinen Unterhalt, +1 Stimmung. |
| 🎓 Universität | 130 | Gelehrsamkeit | +50 % Forschung (zusätzlich zur Bibliothek), +1 Kultur. |
| 🏰 Burg | 100 | Burgenbau | +100 % Verteidigung (wirkt mit dem Kampfsystem). |
| ⛪ Kathedrale | 120 | Theologie | +3 Stimmung, +3 Kultur. |
| 🏦 Bank | 110 | Bankwesen | +50 % Gold (zusätzlich zum Markt). |
| 🖨️ Druckerei | 110 | Buchdruck | +2 Kultur, +15 % Forschung. |
| 🧪 Labor | 220 | Computer | +50 % Forschung (braucht Universität). |
| 🏭 Fabrik | 200 | Industrialisierung | +50 % Produktion, −1 Versorgung (braucht Schmiede). |
| ⚡ Kraftwerk | 220 | Elektrizität | +25 % Produktion (braucht Fabrik). |
| 🏥 Krankenhaus | 160 | Medizin | +4 Versorgung, 25 % Nahrung bleibt nach dem Wachstum. |
| 📈 Börse | 200 | Ökonomie | +50 % Gold (braucht Bank). |
| 🏟 Stadion | 180 | Ideologien | +4 Stimmung. |
| 📡 Sendeturm | 160 | Funktechnik | +4 Kultur, +1 Stimmung. |

## Wunder und Projekt

| Wunder / Projekt | Kosten | Technologie | Wirkung |
|---|---|---|---|
| 🔥 Ewige Flamme | 90 | Mystik | Weltwunder: +3 Kultur, +1 Stimmung in allen eigenen Städten. |
| 🪴 Terrassengärten | 120 | Bewässerung | Weltwunder: +2 Versorgung in allen eigenen Städten, +2 Kultur. |
| 🔭 Himmelswarte | 150 | Astronomie | Weltwunder: +3 Forschung und +50 % Forschung in dieser Stadt, +2 Kultur. |
| 🏟️ Großes Amphitheater | 140 | Theaterkunst | Weltwunder: +1 Stimmung in allen eigenen Städten, +2 hier, +3 Kultur. |
| ⛵ Hafen der Händler | 130 | Seefahrt | Weltwunder: +4 Handel hier, +1 Handel in allen eigenen Küstenstädten. |
| 🧱 Wall der Ahnen | 170 | Burgenbau | Weltwunder: +50 % Verteidigung in allen eigenen Städten (wirkt mit dem Kampfsystem). |
| 🦉 Akademie der Weisen | 180 | Philosophie | Weltwunder: Spezialisten in allen eigenen Städten +1 Handel, +3 Kultur. |
| 🚀 Startrampe | 700 | Raketentechnik | Großprojekt „Aufbruch“, Teil 1 von 3. Alle drei Teile = Projektsieg. |
| ☄️ Sternenantrieb | 900 | Computer | Großprojekt „Aufbruch“, Teil 2 von 3. |
| 🛰️ Habitatmodul | 1100 | Raumfahrt | Großprojekt „Aufbruch“, Teil 3 von 3. |
| 🎡 Weltausstellung | 380 | Industrialisierung | Weltwunder: +6 Kultur, +1 Stimmung in allen eigenen Städten. |
| 💡 Leuchtfeuer des Wissens | 420 | Bildungswesen | Weltwunder: +100 % Forschung in dieser Stadt, +4 Kultur. |

## Technologien

| Technologie | Stufe | Kosten | Voraussetzungen | Schaltet frei |
|---|---|---|---|---|
| Ackerbau | 1 | 24 | – | 🌱 Farm |
| Jagd | 1 | 24 | – | 🏕️ Jagdlager<br>🏹 Bogenschütze |
| Mystik | 1 | 24 | – | ⛩️ Schrein<br>🔥 Ewige Flamme (Weltwunder)<br>📜 Erbmonarchie |
| Bergbau | 1 | 24 | – | ⛏️ Mine |
| Fischerei | 1 | 24 | – | ✨ Fisch und Perlen bringen ihren Bonus |
| Tierzucht | 2 | 42 | Jagd | 🐂 Weide<br>🐎 Reiter |
| Töpferei | 2 | 42 | Ackerbau | 🌾 Kornspeicher |
| Bronzeverarbeitung | 2 | 42 | Bergbau | 🛡️ Kaserne<br>🔱 Speerkämpfer<br>🪓 Roden<br>✨ Arbeiter können Wald und Dschungel roden |
| Rad | 2 | 42 | Ackerbau | 🛤️ Straße<br>✨ Arbeiter bauen Straßen |
| Schrift | 3 | 70 | Töpferei | 📚 Bibliothek |
| Segeln | 2 | 42 | Fischerei | ⚓ Hafen<br>🛶 Galeere |
| Bewässerung | 3 | 70 | Töpferei, Rad | 🪴 Terrassengärten (Weltwunder)<br>✨ Farmen +1 🌾 an Flüssen und Seen |
| Kalender | 3 | 70 | Mystik, Ackerbau | 🌿 Plantage |
| Holzhandwerk | 3 | 70 | Bronzeverarbeitung | 🪵 Sägewerk |
| Währung | 4 | 110 | Schrift, Rad | 🏪 Markt<br>🐪 Händler<br>📜 Zunftwesen |
| Steinmetzkunst | 3 | 70 | Bergbau, Mystik | 🧱 Steinbruch |
| Seefahrt | 4 | 110 | Segeln, Kalender | ⛵ Hafen der Händler (Weltwunder)<br>⛵ Kriegsgaleere<br>✨ Küstenstädte sind über das Meer verbunden |
| Eisenverarbeitung | 4 | 110 | Bronzeverarbeitung | ⚒️ Schmiede<br>⚔️ Schwertkämpfer |
| Mathematik | 4 | 110 | Schrift, Steinmetzkunst | 🪨 Katapult |
| Astronomie | 5 | 165 | Kalender, Mathematik | 🔭 Himmelswarte (Weltwunder)<br>🚢 Karavelle |
| Philosophie | 4 | 110 | Schrift, Mystik | 🦉 Akademie der Weisen (Weltwunder) |
| Theaterkunst | 5 | 165 | Mystik, Währung | 🎭 Theater<br>🏟️ Großes Amphitheater (Weltwunder) |
| Gesetzgebung | 5 | 165 | Schrift, Währung | ⚖️ Gerichtsgebäude<br>📜 Bürgerrepublik |
| Ingenieurwesen | 5 | 165 | Mathematik, Rad | 🚰 Aquädukt<br>✨ Straßen kosten nur noch ¼ Bewegung |
| Baukunst | 5 | 165 | Steinmetzkunst, Mathematik | 🎯 Langbogenschütze |
| Gelehrsamkeit | 6 | 240 | Philosophie, Astronomie | 🎓 Universität |
| Theologie | 6 | 240 | Philosophie, Theaterkunst | ⛪ Kathedrale<br>📜 Tempelpflicht |
| Burgenbau | 6 | 240 | Eisenverarbeitung, Ingenieurwesen | 🏰 Burg<br>🧱 Wall der Ahnen (Weltwunder)<br>🏗️ Tribok |
| Lehnswesen | 7 | 330 | Gesetzgebung, Burgenbau | 🗡️ Pikenier<br>🏇 Ritter<br>✨ +1 freie Einheit je Stadt |
| Bankwesen | 7 | 330 | Gesetzgebung, Gelehrsamkeit | 🏦 Bank<br>📜 Handelsherrschaft |
| Buchdruck | 7 | 330 | Gelehrsamkeit, Theologie | 🖨️ Druckerei |
| Schießpulver | 7 | 330 | Eisenverarbeitung, Burgenbau | 💂 Musketier |
| Navigation | 6 | 240 | Seefahrt, Astronomie | ⛴️ Fregatte<br>✨ Alle Schiffe dürfen auf den Ozean |
| Ökonomie | 8 | 430 | Bankwesen, Buchdruck | 📈 Börse<br>📜 Freier Markt |
| Verfassung | 8 | 430 | Gesetzgebung, Buchdruck | 📜 Volksherrschaft<br>📜 Freiheitsrechte |
| Physik | 8 | 430 | Astronomie, Buchdruck | – |
| Metallurgie | 8 | 430 | Schießpulver | 💣 Kanone |
| Militärtradition | 8 | 430 | Schießpulver, Lehnswesen | 🐴 Kavallerie |
| Bildungswesen | 9 | 540 | Verfassung, Physik | 💡 Leuchtfeuer des Wissens (Weltwunder)<br>📜 Bildungsideal |
| Dampfkraft | 9 | 540 | Physik, Metallurgie | 🛳️ Panzerschiff |
| Chemie | 9 | 540 | Metallurgie, Physik | – |
| Eisenbahn | 10 | 660 | Dampfkraft | ✨ Straßen kosten nur noch ⅙ Bewegung |
| Industrialisierung | 10 | 660 | Dampfkraft, Ökonomie | 🏭 Fabrik<br>🎡 Weltausstellung (Weltwunder)<br>📜 Planwirtschaft |
| Elektrizität | 11 | 800 | Industrialisierung, Chemie | ⚡ Kraftwerk<br>🎇 Artillerie |
| Präzisionswaffen | 10 | 660 | Chemie, Militärtradition | 🎖️ Schützen |
| Medizin | 10 | 660 | Chemie, Bildungswesen | 🏥 Krankenhaus<br>📜 Fürsorgestaat |
| Verbrennungsmotor | 12 | 950 | Elektrizität, Eisenbahn | 🚤 Zerstörer<br>🚛 Transporter |
| Ideologien | 11 | 800 | Industrialisierung, Verfassung | 🏟 Stadion<br>📜 Machtstaat |
| Funktechnik | 12 | 950 | Elektrizität | 📡 Sendeturm |
| Motorisierung | 13 | 1120 | Verbrennungsmotor, Präzisionswaffen | 🪖 Infanterie<br>🛡 Panzer |
| Raketentechnik | 13 | 1120 | Verbrennungsmotor, Funktechnik | 🚀 Startrampe |
| Computer | 14 | 1300 | Funktechnik, Raketentechnik | 🧪 Labor<br>☄️ Sternenantrieb |
| Raumfahrt | 15 | 1500 | Raketentechnik, Computer | 🛰️ Habitatmodul |
| Globalisierung | 15 | 1500 | Computer, Ideologien | ✨ +1 Handel je Handelsroute |

## Leitbilder

| Leitbild | Bereich | Technologie | Wirkung |
|---|---|---|---|
| Stammesrat | Herrschaft | – | Grundzustand ohne Besonderheiten. |
| Erbmonarchie | Herrschaft | Mystik | +1 Stimmung je Stadt, +1 freie Einheit je Stadt. |
| Bürgerrepublik | Herrschaft | Gesetzgebung | +10 % Forschung und Gold, −1 Stimmung je Stadt im Krieg. |
| Volksherrschaft | Herrschaft | Verfassung | +15 % Forschung, +20 % Gold, −2 Stimmung je Stadt im Krieg. |
| Machtstaat | Herrschaft | Ideologien | +15 % Produktion, neue Kampfeinheiten +5 Erfahrung, −1 Stimmung. |
| Tauschwirtschaft | Wirtschaft | – | Grundzustand ohne Besonderheiten. |
| Zunftwesen | Wirtschaft | Währung | +10 % Produktion, −5 % Gold. |
| Handelsherrschaft | Wirtschaft | Bankwesen | +20 % Gold, −5 % Forschung. |
| Freier Markt | Wirtschaft | Ökonomie | +15 % Gold, +2 Handel je Handelsroute. |
| Planwirtschaft | Wirtschaft | Industrialisierung | +20 % Produktion, −1 Stimmung. |
| Ahnenverehrung | Gesellschaft | – | Grundzustand ohne Besonderheiten. |
| Tempelpflicht | Gesellschaft | Theologie | +2 Stimmung, +10 % Kultur. |
| Bildungsideal | Gesellschaft | Bildungswesen | +15 % Forschung. |
| Freiheitsrechte | Gesellschaft | Verfassung | +1 Stimmung, +25 % Kultur. |
| Fürsorgestaat | Gesellschaft | Medizin | +2 Versorgung, +1 Stimmung, −10 % Gold. |
