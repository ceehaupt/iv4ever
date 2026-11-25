import { tilesAround } from '../hex';
import type { GameMap } from '../map';
import { hash2, type Rng } from '../rng';
import { RESOURCES, ResourceKind, resourceFits, resourcesOfKind, type ResourceKindId } from '../rules/resources';
import { Feature, Relief, Terrain } from '../rules/terrain';

/** Anteil der geeigneten Felder, die eine Ressource der jeweiligen Art bekommen. */
const DENSITY = { bonus: 0.1, luxury: 0.03, strategic: 0.025 };
/** Luxusgüter kommen regional gehäuft vor (Handelsanreiz): Regionsgröße in Feldern. */
const LUXURY_REGION = { cols: 7, rows: 6 };

function eligible(m: GameMap, i: number): boolean {
  const t = m.terrain[i];
  if (t === Terrain.Ocean || t === Terrain.Snow) return false;
  if (m.relief[i] === Relief.Mountain || m.feature[i] === Feature.Ice) return false;
  return true;
}

function fitting(m: GameMap, i: number, ids: readonly number[]): number[] {
  return ids.filter((id) => resourceFits(RESOURCES[id]!, m.terrain[i], m.relief[i], m.feature[i]));
}

function pickWeighted(rng: Rng, ids: number[]): number {
  let total = 0;
  for (const id of ids) total += RESOURCES[id]!.weight;
  let roll = rng.next() * total;
  for (const id of ids) {
    roll -= RESOURCES[id]!.weight;
    if (roll <= 0) return id;
  }
  return ids[ids.length - 1];
}

export function placeResources(m: GameMap, rng: Rng): void {
  const n = m.width * m.height;
  const order = Array.from({ length: n }, (_, i) => i);
  for (let k = n - 1; k > 0; k--) {
    const j = rng.int(k + 1);
    [order[k], order[j]] = [order[j], order[k]];
  }
  const bonus = resourcesOfKind(ResourceKind.Bonus);
  const strategic = resourcesOfKind(ResourceKind.Strategic);
  const luxury = resourcesOfKind(ResourceKind.Luxury);

  for (const i of order) {
    if (!eligible(m, i) || m.resource[i]) continue;
    if (tilesAround(m, i, 1).some((nb) => m.resource[nb] !== 0)) continue;

    const roll = rng.next();
    let kind: ResourceKindId | -1 = -1;
    if (roll < DENSITY.bonus) kind = ResourceKind.Bonus;
    else if (roll < DENSITY.bonus + DENSITY.luxury) kind = ResourceKind.Luxury;
    else if (roll < DENSITY.bonus + DENSITY.luxury + DENSITY.strategic) kind = ResourceKind.Strategic;
    if (kind < 0) continue;

    if (kind === ResourceKind.Luxury) {
      // Jede Region hat ein bevorzugtes Luxusgut; nur das wird dort platziert.
      const c = i % m.width;
      const r = (i / m.width) | 0;
      const region = hash2(Math.floor(c / LUXURY_REGION.cols), Math.floor(r / LUXURY_REGION.rows), m.seed + 91);
      const id = luxury[Math.floor(region * luxury.length)];
      if (resourceFits(RESOURCES[id]!, m.terrain[i], m.relief[i], m.feature[i])) m.resource[i] = id;
      continue;
    }
    const options = fitting(m, i, kind === ResourceKind.Bonus ? bonus : strategic);
    if (options.length) m.resource[i] = pickWeighted(rng, options);
  }
}

/** Setzt eine passende Bonus-Ressource auf ein freies Feld im Umkreis; true bei Erfolg. */
export function addBonusNear(m: GameMap, center: number, rng: Rng): boolean {
  const bonus = resourcesOfKind(ResourceKind.Bonus);
  const ring = tilesAround(m, center, 2).filter((i) => i !== center && eligible(m, i) && !m.resource[i]);
  for (let k = ring.length - 1; k > 0; k--) {
    const j = rng.int(k + 1);
    [ring[k], ring[j]] = [ring[j], ring[k]];
  }
  for (const i of ring) {
    const options = fitting(m, i, bonus);
    if (options.length) {
      m.resource[i] = pickWeighted(rng, options);
      return true;
    }
  }
  return false;
}
