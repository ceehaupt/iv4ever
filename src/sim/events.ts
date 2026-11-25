import type { TurnEvent } from './city';
import type { GameState } from './game';
import { BuildingId } from './rules/buildings';
import { Feature } from './rules/terrain';
import { currentResearchOf } from './researchUtil';
import { techCost } from './rules/techs';

/**
 * Zufallsereignisse (eigene Auswahl): Jedes Volk mit Städten erlebt mit 4 % je Runde ein Ereignis.
 * Alles läuft über den Spiel-RNG und ist damit deterministisch.
 */
const CHANCE = 0.04;

export function randomEvents(state: GameState, events: TurnEvent[]): void {
  if (state.turn < 10) return;
  for (const p of state.players) {
    if (p.barbarian || !p.alive) continue;
    const cities = state.cities.filter((c) => c.owner === p.id);
    if (!cities.length || state.rng.next() >= CHANCE) continue;
    const c = cities[state.rng.int(cities.length)];
    const ev = (text: string, tile = c.tile) => events.push({ player: p.id, text, tile });
    switch (state.rng.int(6)) {
      case 0:
        c.foodStored += 15;
        ev(`Gute Ernte in ${c.name}: +15 Nahrung`);
        break;
      case 1:
        p.gold += 40;
        ev(`Eine Goldader wurde nahe ${c.name} entdeckt: +40 Gold`);
        break;
      case 2:
        if (c.size > 2 && !c.buildings.includes(BuildingId.Aqueduct) && !c.buildings.includes(BuildingId.Hospital)) {
          c.size--;
          ev(`Seuche in ${c.name}: −1 Bevölkerung (Aquädukt oder Krankenhaus schützen)`);
        } else ev(`Eine Seuche zieht an ${c.name} vorüber`);
        break;
      case 3: {
        const tech = currentResearchOf(p);
        if (tech >= 0) {
          const gain = Math.floor(techCost(tech) * 0.3);
          p.research += gain;
          ev(`Ein Erfinder aus ${c.name} bringt die Forschung voran: +${gain} Forschung`, -1);
        } else {
          p.gold += 20;
          ev(`Gelehrte spenden ihr Vermögen: +20 Gold`);
        }
        break;
      }
      case 4: {
        const forest = c.worked.find((t) => state.map.feature[t] === Feature.Forest && !state.map.improvement[t]);
        if (forest !== undefined) {
          state.map.feature[forest] = Feature.None;
          ev(`Waldbrand bei ${c.name}: Der Wald ist verloren`, forest);
        } else ev(`Ein Unwetter zieht über ${c.name} hinweg`);
        break;
      }
      default:
        c.size++;
        ev(`Flüchtlinge suchen Schutz in ${c.name}: +1 Bevölkerung`);
    }
  }
}
