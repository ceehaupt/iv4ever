import { Feature, Relief, Terrain, type Yields } from './terrain';

/**
 * Ressourcen – eigene Auswahl und eigene Werte.
 * Bonus: mehr Ertrag. Luxus: später Zufriedenheit/Handel. Strategisch: später Voraussetzung für Einheiten.
 */
export const ResourceKind = { Bonus: 0, Luxury: 1, Strategic: 2 } as const;
export type ResourceKindId = (typeof ResourceKind)[keyof typeof ResourceKind];

export interface ResourceInfo {
  key: string;
  name: string;
  kind: ResourceKindId;
  /** Platzhalter-Symbol bis zur eigenen Grafik (M9). */
  icon: string;
  delta: Yields;
  terrains: readonly number[];
  reliefs: readonly number[];
  features: readonly number[];
  /** Relative Häufigkeit innerhalb der eigenen Art. */
  weight: number;
}

const T = Terrain;
const R = Relief;
const F = Feature;
const y = (food: number, prod: number, trade: number): Yields => ({ food, prod, trade });
const LAND_FLAT_HILL = [R.Flat, R.Hill];

/** Index = Ressourcen-ID; 0 = keine Ressource. */
export const RESOURCES: readonly (ResourceInfo | null)[] = [
  null,
  // Bonus
  { key: 'wheat', name: 'Weizen', kind: 0, icon: '🌾', delta: y(1, 0, 0), terrains: [T.Plains, T.Grassland], reliefs: [R.Flat], features: [F.None, F.Floodplain], weight: 3 },
  { key: 'rice', name: 'Reis', kind: 0, icon: '🍚', delta: y(1, 0, 0), terrains: [T.Grassland], reliefs: [R.Flat], features: [F.None, F.Jungle], weight: 2 },
  { key: 'cattle', name: 'Rinder', kind: 0, icon: '🐄', delta: y(1, 1, 0), terrains: [T.Grassland, T.Plains], reliefs: LAND_FLAT_HILL, features: [F.None], weight: 3 },
  { key: 'sheep', name: 'Schafe', kind: 0, icon: '🐑', delta: y(1, 0, 1), terrains: [T.Grassland, T.Plains, T.Tundra], reliefs: [R.Hill], features: [F.None], weight: 3 },
  { key: 'game', name: 'Wild', kind: 0, icon: '🦌', delta: y(1, 0, 0), terrains: [T.Grassland, T.Plains, T.Tundra], reliefs: LAND_FLAT_HILL, features: [F.Forest], weight: 3 },
  { key: 'fish', name: 'Fisch', kind: 0, icon: '🐟', delta: y(2, 0, 0), terrains: [T.Coast, T.Lake], reliefs: [R.Flat], features: [F.None], weight: 4 },
  { key: 'stone', name: 'Stein', kind: 0, icon: '🪨', delta: y(0, 2, 0), terrains: [T.Plains, T.Desert, T.Tundra], reliefs: LAND_FLAT_HILL, features: [F.None], weight: 2 },
  { key: 'dates', name: 'Datteln', kind: 0, icon: '🌴', delta: y(1, 0, 1), terrains: [T.Desert], reliefs: [R.Flat], features: [F.None, F.Floodplain], weight: 2 },
  // Luxus
  { key: 'wine', name: 'Wein', kind: 1, icon: '🍇', delta: y(0, 0, 2), terrains: [T.Plains, T.Grassland], reliefs: LAND_FLAT_HILL, features: [F.None], weight: 1 },
  { key: 'spices', name: 'Gewürze', kind: 1, icon: '🌶️', delta: y(0, 0, 2), terrains: [T.Grassland], reliefs: LAND_FLAT_HILL, features: [F.Jungle, F.Forest], weight: 1 },
  { key: 'silk', name: 'Seide', kind: 1, icon: '🧵', delta: y(0, 0, 2), terrains: [T.Grassland, T.Plains], reliefs: LAND_FLAT_HILL, features: [F.Forest], weight: 1 },
  { key: 'salt', name: 'Salz', kind: 1, icon: '🧂', delta: y(0, 1, 1), terrains: [T.Desert, T.Plains], reliefs: [R.Flat], features: [F.None], weight: 1 },
  { key: 'gems', name: 'Edelsteine', kind: 1, icon: '💎', delta: y(0, 0, 3), terrains: [T.Grassland, T.Plains, T.Desert, T.Tundra], reliefs: [R.Hill], features: [F.None, F.Jungle], weight: 1 },
  { key: 'gold', name: 'Gold', kind: 1, icon: '🪙', delta: y(0, 0, 3), terrains: [T.Desert, T.Plains, T.Tundra], reliefs: [R.Hill], features: [F.None], weight: 1 },
  { key: 'furs', name: 'Pelze', kind: 1, icon: '🦊', delta: y(0, 0, 2), terrains: [T.Tundra, T.Plains], reliefs: LAND_FLAT_HILL, features: [F.Forest], weight: 1 },
  { key: 'pearls', name: 'Perlen', kind: 1, icon: '🦪', delta: y(0, 0, 2), terrains: [T.Coast], reliefs: [R.Flat], features: [F.None], weight: 1 },
  // Strategisch
  { key: 'copper', name: 'Kupfer', kind: 2, icon: '🥉', delta: y(0, 1, 0), terrains: [T.Grassland, T.Plains, T.Desert, T.Tundra], reliefs: [R.Hill], features: [F.None, F.Forest], weight: 2 },
  { key: 'iron', name: 'Eisen', kind: 2, icon: '⛓️', delta: y(0, 1, 0), terrains: [T.Plains, T.Desert, T.Tundra, T.Grassland], reliefs: LAND_FLAT_HILL, features: [F.None], weight: 2 },
  { key: 'horses', name: 'Pferde', kind: 2, icon: '🐎', delta: y(0, 1, 0), terrains: [T.Grassland, T.Plains, T.Tundra], reliefs: [R.Flat], features: [F.None], weight: 2 },
];

export const RESOURCE_KIND_NAME = ['Bonus', 'Luxus', 'Strategisch'] as const;

export function resourceFits(res: ResourceInfo, terrain: number, relief: number, feature: number): boolean {
  return res.terrains.includes(terrain) && res.reliefs.includes(relief) && res.features.includes(feature);
}

/** IDs aller Ressourcen einer Art. */
export function resourcesOfKind(kind: ResourceKindId): number[] {
  const out: number[] = [];
  RESOURCES.forEach((r, id) => {
    if (r && r.kind === kind) out.push(id);
  });
  return out;
}
