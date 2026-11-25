import { Dir, type Grid, neighborOf } from './hex';
import { RESOURCES } from './rules/resources';
import { baseYields, type Yields } from './rules/terrain';

/**
 * Spielkarte als Struct-of-Arrays: ein Byte pro Feld und Eigenschaft.
 * Kompakt, cachefreundlich und per Transfer (ohne Kopie) zwischen Worker und Hauptthread übertragbar.
 *
 * Flüsse liegen auf Kanten. Jede Kante gehört genau einem Feld: Bits für O (1), SW (16) und SO (32)
 * werden am Feld selbst gespeichert; NO/NW/W ergeben sich aus dem Nachbarn (siehe hasRiver).
 */
export interface GameMap extends Grid {
  readonly seed: number;
  readonly terrain: Uint8Array;
  readonly relief: Uint8Array;
  readonly feature: Uint8Array;
  readonly resource: Uint8Array;
  readonly river: Uint8Array;
}

const FIELDS = ['terrain', 'relief', 'feature', 'resource', 'river'] as const;

export function createMap(width: number, height: number, seed: number, wrapX = true): GameMap {
  const n = width * height;
  return {
    width,
    height,
    wrapX,
    seed,
    terrain: new Uint8Array(n),
    relief: new Uint8Array(n),
    feature: new Uint8Array(n),
    resource: new Uint8Array(n),
    river: new Uint8Array(n),
  };
}

export function cloneMap(m: GameMap): GameMap {
  return {
    width: m.width,
    height: m.height,
    wrapX: m.wrapX,
    seed: m.seed,
    terrain: m.terrain.slice(),
    relief: m.relief.slice(),
    feature: m.feature.slice(),
    resource: m.resource.slice(),
    river: m.river.slice(),
  };
}

export function mapTransferables(m: GameMap): ArrayBuffer[] {
  return FIELDS.map((f) => m[f].buffer as ArrayBuffer);
}

const OWNED = (1 << Dir.E) | (1 << Dir.SW) | (1 << Dir.SE);

/** Liegt auf der Kante von Feld i in Richtung dir ein Fluss? */
export function hasRiver(m: GameMap, i: number, dir: number): boolean {
  if ((1 << dir) & OWNED) return (m.river[i] & (1 << dir)) !== 0;
  const n = neighborOf(m, i, dir);
  return n >= 0 && (m.river[n] & (1 << ((dir + 3) % 6))) !== 0;
}

export function setRiver(m: GameMap, i: number, dir: number): void {
  if ((1 << dir) & OWNED) {
    m.river[i] |= 1 << dir;
    return;
  }
  const n = neighborOf(m, i, dir);
  if (n >= 0) m.river[n] |= 1 << ((dir + 3) % 6);
}

export function touchesRiver(m: GameMap, i: number): boolean {
  for (let d = 0; d < 6; d++) if (hasRiver(m, i, d)) return true;
  return false;
}

export function tileYields(m: GameMap, i: number): Yields {
  const y = baseYields(m.terrain[i], m.relief[i], m.feature[i], touchesRiver(m, i));
  const res = RESOURCES[m.resource[i]];
  if (res) {
    y.food += res.delta.food;
    y.prod += res.delta.prod;
    y.trade += res.delta.trade;
  }
  return y;
}
