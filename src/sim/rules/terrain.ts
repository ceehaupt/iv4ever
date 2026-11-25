/**
 * Gelände-Regeln. Eigene Werte – bewusst nicht aus einem bestehenden Spiel übernommen.
 * IDs sind Bytes, damit die Karte in kompakten Uint8Arrays liegt.
 */

export interface Yields {
  food: number;
  prod: number;
  trade: number;
}

export const Terrain = {
  Ocean: 0,
  Coast: 1,
  Grassland: 2,
  Plains: 3,
  Desert: 4,
  Tundra: 5,
  Snow: 6,
  Lake: 7,
} as const;

export const Relief = {
  Flat: 0,
  Hill: 1,
  Mountain: 2,
} as const;

export const Feature = {
  None: 0,
  Forest: 1,
  Jungle: 2,
  Ice: 3,
  Floodplain: 4,
} as const;

export interface TerrainInfo {
  key: string;
  name: string;
  water: boolean;
  yields: Yields;
}

export const TERRAIN: readonly TerrainInfo[] = [
  { key: 'ocean', name: 'Ozean', water: true, yields: { food: 1, prod: 0, trade: 1 } },
  { key: 'coast', name: 'Küste', water: true, yields: { food: 2, prod: 0, trade: 1 } },
  { key: 'grassland', name: 'Grasland', water: false, yields: { food: 2, prod: 0, trade: 0 } },
  { key: 'plains', name: 'Ebene', water: false, yields: { food: 1, prod: 1, trade: 0 } },
  { key: 'desert', name: 'Wüste', water: false, yields: { food: 0, prod: 1, trade: 0 } },
  { key: 'tundra', name: 'Tundra', water: false, yields: { food: 1, prod: 0, trade: 0 } },
  { key: 'snow', name: 'Schnee', water: false, yields: { food: 0, prod: 0, trade: 0 } },
  { key: 'lake', name: 'See', water: true, yields: { food: 2, prod: 0, trade: 2 } },
];

export interface ModifierInfo {
  key: string;
  name: string;
  delta: Yields;
  moveCost: number;
  defense: number;
}

export const RELIEF: readonly ModifierInfo[] = [
  { key: 'flat', name: 'Flachland', delta: { food: 0, prod: 0, trade: 0 }, moveCost: 1, defense: 0 },
  { key: 'hill', name: 'Hügel', delta: { food: 0, prod: 1, trade: 0 }, moveCost: 2, defense: 25 },
  { key: 'mountain', name: 'Gebirge', delta: { food: 0, prod: 0, trade: 0 }, moveCost: Infinity, defense: 0 },
];

export const FEATURE: readonly ModifierInfo[] = [
  { key: 'none', name: '', delta: { food: 0, prod: 0, trade: 0 }, moveCost: 1, defense: 0 },
  { key: 'forest', name: 'Wald', delta: { food: 0, prod: 1, trade: 0 }, moveCost: 2, defense: 25 },
  { key: 'jungle', name: 'Dschungel', delta: { food: -1, prod: 0, trade: 0 }, moveCost: 2, defense: 15 },
  { key: 'ice', name: 'Packeis', delta: { food: 0, prod: 0, trade: 0 }, moveCost: Infinity, defense: 0 },
  { key: 'floodplain', name: 'Schwemmland', delta: { food: 2, prod: 0, trade: 0 }, moveCost: 1, defense: 0 },
];

/** Ertragsbonus eines Feldes mit Fluss an mindestens einer Kante. */
export const RIVER_TRADE = 1;
/** Verteidigungsbonus für Angriffe über einen Fluss (wird ab M5 verwendet). */
export const RIVER_DEFENSE = 25;

export function isWater(terrain: number): boolean {
  return TERRAIN[terrain].water;
}

export function baseYields(terrain: number, relief: number, feature: number, river: boolean): Yields {
  if (relief === Relief.Mountain || feature === Feature.Ice) {
    return { food: 0, prod: relief === Relief.Mountain ? 1 : 0, trade: 0 };
  }
  const b = TERRAIN[terrain].yields;
  const r = RELIEF[relief].delta;
  const f = FEATURE[feature].delta;
  return {
    food: Math.max(0, b.food + r.food + f.food),
    prod: Math.max(0, b.prod + r.prod + f.prod),
    trade: Math.max(0, b.trade + r.trade + f.trade) + (river ? RIVER_TRADE : 0),
  };
}

/** Bewegungskosten für Landeinheiten bzw. Schiffe; Infinity = unpassierbar. */
export function tileMoveCost(terrain: number, relief: number, feature: number): number {
  if (TERRAIN[terrain].water) return feature === Feature.Ice ? Infinity : 1;
  return Math.max(RELIEF[relief].moveCost, FEATURE[feature].moveCost);
}

export function tileDefense(relief: number, feature: number): number {
  return RELIEF[relief].defense + FEATURE[feature].defense;
}

export function tileName(terrain: number, relief: number, feature: number): string {
  const parts = [TERRAIN[terrain].name];
  if (relief !== Relief.Flat) parts.push(RELIEF[relief].name);
  if (feature !== Feature.None) parts.push(FEATURE[feature].name);
  return parts.join(' · ');
}
