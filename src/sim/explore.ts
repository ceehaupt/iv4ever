// Automatisches Erkunden: Ziele am Rand des bekannten Gebiets (für den Befehl „Erkunden“).
import { forEachNeighbor } from './hex';
import type { GameMap } from './map';

/** Höchstzahl der durchsuchten Felder je Suche (begrenzt den Aufwand auf großen Karten). */
const SEARCH_LIMIT = 4000;

/**
 * Bekannte, begehbare Felder mit unerforschtem Nachbarn, nach Schrittzahl vom Start aufsteigend (Breitensuche).
 * Die Suche läuft nur über bekannte begehbare Felder; das Startfeld selbst zählt nicht.
 */
export function frontierTiles(
  map: GameMap,
  explored: Uint8Array,
  start: number,
  passable: (tile: number) => boolean,
  limit: number,
): number[] {
  const out: number[] = [];
  const seen = new Uint8Array(map.width * map.height);
  seen[start] = 1;
  const queue = [start];
  let visited = 0;
  for (let head = 0; head < queue.length && out.length < limit && visited < SEARCH_LIMIT; head++, visited++) {
    const t = queue[head];
    let edge = false;
    forEachNeighbor(map, t, (n) => {
      if (!explored[n]) edge = true;
    });
    if (edge && t !== start) out.push(t);
    forEachNeighbor(map, t, (n) => {
      if (seen[n] || !explored[n] || !passable(n)) return;
      seen[n] = 1;
      queue.push(n);
    });
  }
  return out;
}
