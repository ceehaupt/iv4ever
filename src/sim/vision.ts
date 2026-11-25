import { hexLineBetween, tileDistance, tilesAround } from './hex';
import type { GameMap } from './map';
import { Feature, isWater, Relief } from './rules/terrain';

/**
 * Sichtregeln:
 * - Sichtweite = Einheitentyp + 1 auf Hügeln.
 * - Direkte Nachbarn sind immer sichtbar.
 * - Weiter entfernte Felder sind verdeckt, wenn ein Feld auf der Linie höher ist als der Betrachter.
 *   Höhe: flach 0, Hügel 1, Gebirge 2; Wald/Dschungel +1.
 */

function groundLevel(map: GameMap, i: number): number {
  if (isWater(map.terrain[i])) return 0;
  const r = map.relief[i];
  return r === Relief.Mountain ? 2 : r === Relief.Hill ? 1 : 0;
}

function occlusion(map: GameMap, i: number): number {
  const f = map.feature[i];
  return groundLevel(map, i) + (f === Feature.Forest || f === Feature.Jungle ? 1 : 0);
}

export function sightRange(map: GameMap, tile: number, baseSight: number): number {
  return baseSight + (map.relief[tile] === Relief.Hill ? 1 : 0);
}

/** Markiert alle von tile aus sichtbaren Felder in out (setzt 1). */
export function markVisible(map: GameMap, tile: number, baseSight: number, out: Uint8Array): void {
  const range = sightRange(map, tile, baseSight);
  const eye = groundLevel(map, tile);
  out[tile] = 1;
  for (const t of tilesAround(map, tile, range)) {
    if (out[t]) continue;
    if (tileDistance(map, tile, t) <= 1) {
      out[t] = 1;
      continue;
    }
    let blocked = false;
    for (const k of hexLineBetween(map, tile, t)) {
      if (occlusion(map, k) > eye) {
        blocked = true;
        break;
      }
    }
    if (!blocked) out[t] = 1;
  }
}
