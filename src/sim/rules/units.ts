/**
 * Einheitentypen – eigene Werte.
 * Bewegungspunkte werden intern mit MOVE_SCALE multipliziert, damit spätere Straßen
 * (Bruchteile eines Punktes) ohne Gleitkomma auskommen.
 */
export const MOVE_SCALE = 6;

export const UnitTypeId = {
  Settler: 0,
  Worker: 1,
  Scout: 2,
  Warrior: 3,
} as const;

export interface UnitType {
  key: string;
  name: string;
  /** Platzhalter-Symbol bis zur eigenen Grafik (M9). */
  icon: string;
  moves: number;
  strength: number;
  sight: number;
  /** Kann kämpfen und sich befestigen. */
  combat: boolean;
  canFound: boolean;
  canWork: boolean;
  /** Produktionskosten. */
  cost: number;
  /** Bevölkerung, die beim Bau abgezogen wird (Siedler). */
  popCost: number;
}

export const UNIT_TYPES: readonly UnitType[] = [
  { key: 'settler', name: 'Siedler', icon: '⛺', moves: 1, strength: 0, sight: 1, combat: false, canFound: true, canWork: false, cost: 35, popCost: 1 },
  { key: 'worker', name: 'Arbeiter', icon: '⛏️', moves: 1, strength: 0, sight: 1, combat: false, canFound: false, canWork: true, cost: 25, popCost: 0 },
  { key: 'scout', name: 'Späher', icon: '🧭', moves: 2, strength: 1, sight: 2, combat: true, canFound: false, canWork: false, cost: 15, popCost: 0 },
  { key: 'warrior', name: 'Krieger', icon: '🪓', moves: 1, strength: 2, sight: 1, combat: true, canFound: false, canWork: false, cost: 12, popCost: 0 },
];

/** Einheiten, mit denen jede Zivilisation beginnt. */
export const START_UNITS: readonly number[] = [UnitTypeId.Settler, UnitTypeId.Warrior, UnitTypeId.Scout];

export function maxMoves(type: number): number {
  return UNIT_TYPES[type].moves * MOVE_SCALE;
}
