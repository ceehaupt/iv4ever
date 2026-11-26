import { Dir, forEachNeighbor, type Grid, neighborOf } from './hex';
import { Improvement, IMPROVEMENTS, RESOURCE_IMPROVEMENT } from './rules/improvements';
import { RESOURCES } from './rules/resources';
import { TechId } from './rules/techs';
import { baseYields, isWater, Terrain, type Yields } from './rules/terrain';

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
  /** Geländeverbesserung je Feld (Improvement-ID). Veränderlich während des Spiels. */
  readonly improvement: Uint8Array;
  /** 1 = Straße. Veränderlich während des Spiels. */
  readonly road: Uint8Array;
  /** 1 = verschmutzt (−1 auf jeden Ertrag). Veränderlich während des Spiels. */
  readonly pollution: Uint8Array;
}

export const MAP_FIELDS = ['terrain', 'relief', 'feature', 'resource', 'river', 'improvement', 'road', 'pollution'] as const;
const FIELDS = MAP_FIELDS;

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
    improvement: new Uint8Array(n),
    road: new Uint8Array(n),
    pollution: new Uint8Array(n),
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
    improvement: m.improvement.slice(),
    road: m.road.slice(),
    pollution: m.pollution.slice(),
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

/** Süßwasser: Fluss an einer Kante oder ein See daneben. */
export function hasFreshWater(m: GameMap, tile: number): boolean {
  if (touchesRiver(m, tile)) return true;
  let lake = false;
  forEachNeighbor(m, tile, (n) => {
    if (m.terrain[n] === Terrain.Lake) lake = true;
  });
  return lake;
}

/** Welche Technologien der betrachtende Spieler kennt (Standard: keine). */
export type Knows = (tech: number) => boolean;
const KNOWS_NOTHING: Knows = () => false;

/** Bringt die Ressource ihren Bonus? Landressourcen brauchen die passende Verbesserung, Wasserressourcen Fischerei. */
export function resourceActive(m: GameMap, i: number, knows: Knows = KNOWS_NOTHING): boolean {
  const res = RESOURCES[m.resource[i]];
  if (!res) return false;
  if (isWater(m.terrain[i])) return knows(TechId.Fishing);
  return m.improvement[i] !== Improvement.None && RESOURCE_IMPROVEMENT[res.key] === m.improvement[i];
}

export function tileYields(m: GameMap, i: number, knows: Knows = KNOWS_NOTHING): Yields {
  const y = baseYields(m.terrain[i], m.relief[i], m.feature[i], touchesRiver(m, i));
  const imp = IMPROVEMENTS[m.improvement[i]];
  if (imp) {
    y.food += imp.delta.food;
    y.prod += imp.delta.prod;
    y.trade += imp.delta.trade;
    if (m.improvement[i] === Improvement.Farm && knows(TechId.Irrigation) && hasFreshWater(m, i)) y.food += 1;
  }
  if (resourceActive(m, i, knows)) {
    const res = RESOURCES[m.resource[i]]!;
    y.food += res.delta.food;
    y.prod += res.delta.prod;
    y.trade += res.delta.trade;
  }
  if (m.pollution?.[i]) {
    // Verschmutzung kostet je einen Punkt (nicht unter 0).
    y.food = Math.max(0, y.food - 1);
    y.prod = Math.max(0, y.prod - 1);
    y.trade = Math.max(0, y.trade - 1);
  }
  return y;
}
