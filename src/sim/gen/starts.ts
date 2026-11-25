import { forEachNeighbor, tileDistance, tilesAround } from '../hex';
import { type GameMap, tileYields, touchesRiver } from '../map';
import type { Rng } from '../rng';
import { Feature, isWater, Relief, Terrain } from '../rules/terrain';
import { addBonusNear } from './resources';

/** Startfelder müssen auf einer Landmasse mit mindestens so vielen Feldern liegen. */
const MIN_LANDMASS = 24;
/** Startpositionen unter diesem Anteil der besten werden mit Bonus-Ressourcen aufgewertet. */
const FAIRNESS = 0.9;

/** Bewertung eines möglichen Stadtfeldes (Umkreis 2 = späterer Stadtradius). */
export function siteScore(m: GameMap, i: number): number {
  const t = m.terrain[i];
  if (isWater(t) || t === Terrain.Snow || m.relief[i] === Relief.Mountain) return -Infinity;
  let s = 0;
  let water = 0;
  for (const nb of tilesAround(m, i, 2)) {
    if (nb === i) continue;
    const y = tileYields(m, nb);
    s += y.food * 3 + y.prod * 2 + y.trade;
    if (m.resource[nb]) s += 2;
    if (isWater(m.terrain[nb])) water++;
  }
  if (water > 10) s -= (water - 10) * 3;
  if (touchesRiver(m, i)) s += 5;
  let coastal = false;
  forEachNeighbor(m, i, (nb) => {
    if (isWater(m.terrain[nb])) coastal = true;
  });
  if (coastal) s += 4;
  if (m.relief[i] === Relief.Hill) s += 2;
  if (t === Terrain.Desert || t === Terrain.Tundra) s -= 6;
  if (m.feature[i] === Feature.Jungle) s -= 3;
  return s;
}

function landmassSizes(m: GameMap): Int32Array {
  const n = m.width * m.height;
  const comp = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0 || isWater(m.terrain[i])) continue;
    const id = sizes.length;
    let size = 0;
    comp[i] = id;
    stack.push(i);
    while (stack.length) {
      const t = stack.pop()!;
      size++;
      forEachNeighbor(m, t, (nb) => {
        if (comp[nb] < 0 && !isWater(m.terrain[nb])) {
          comp[nb] = id;
          stack.push(nb);
        }
      });
    }
    sizes.push(size);
  }
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = comp[i] >= 0 ? sizes[comp[i]] : 0;
  return out;
}

/**
 * Wählt faire Startpositionen: beste Plätze mit Mindestabstand (wird bei Bedarf gelockert),
 * schwache Starts bekommen Bonus-Ressourcen in Reichweite.
 */
export function chooseStarts(m: GameMap, players: number, rng: Rng): number[] {
  const n = m.width * m.height;
  const mass = landmassSizes(m);
  let landCount = 0;
  const candidates: { i: number; s: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (isWater(m.terrain[i])) continue;
    landCount++;
    if (mass[i] < MIN_LANDMASS) continue;
    const s = siteScore(m, i);
    if (Number.isFinite(s)) candidates.push({ i, s: s + rng.next() });
  }
  candidates.sort((a, b) => b.s - a.s);

  let minDist = Math.max(4, Math.floor(Math.sqrt(landCount / players) * 0.8));
  let starts: number[] = [];
  while (minDist >= 2) {
    starts = [];
    for (const c of candidates) {
      if (starts.every((s) => tileDistance(m, s, c.i) >= minDist)) {
        starts.push(c.i);
        if (starts.length === players) break;
      }
    }
    if (starts.length === players) break;
    minDist--;
  }

  for (let round = 0; round < 3; round++) {
    const scores = starts.map((s) => siteScore(m, s));
    const best = Math.max(...scores);
    let changed = false;
    starts.forEach((s, k) => {
      if (scores[k] < best * FAIRNESS && addBonusNear(m, s, rng)) changed = true;
    });
    if (!changed) break;
  }
  return starts;
}
