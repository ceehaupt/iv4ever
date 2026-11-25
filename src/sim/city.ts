import type { GameState } from './game';
import { forEachNeighbor, tileDistance, tilesAround } from './hex';
import { tileYields, touchesRiver, type GameMap } from './map';
import { cityName } from './names';
import { BUILDINGS, BuildingId } from './rules/buildings';
import { RESOURCES, ResourceKind } from './rules/resources';
import { Feature, isWater, Relief, Terrain, type Yields } from './rules/terrain';
import { UNIT_TYPES } from './rules/units';

/**
 * Städte. Regeln (eigene Entwürfe, siehe docs/REGELN.md):
 * - Grenzen/Arbeitsradius wachsen mit Kultur: 1 Ring → 2 Ringe (15 Kultur) → 3 Ringe (150 Kultur).
 * - Jeder Bürger isst 2 Nahrung und bewirtschaftet ein Feld; ohne lohnendes Feld wird er Spezialist (+2 Handel).
 * - Stimmung: Bürger über der Zufriedenheitsgrenze sind unzufrieden: je −10 % Produktion und Handel;
 *   ist mindestens die Hälfte unzufrieden, herrscht Unruhe (keine Produktion, kein Handel).
 * - Versorgung: Bürger über der Versorgungsgrenze essen je 1 Nahrung zusätzlich.
 */

export type BuildItem = { kind: 'unit' | 'building'; id: number };

export interface City {
  id: number;
  owner: number;
  name: string;
  tile: number;
  size: number;
  foodStored: number;
  prodStored: number;
  culture: number;
  founded: number;
  queue: BuildItem[];
  buildings: number[];
  /** Bewirtschaftete Felder (ohne Stadtfeld). */
  worked: number[];
  /** Vom Spieler festgelegte Felder – werden bei der Automatik nicht verändert. */
  locked: number[];
}

export interface CityReport {
  yields: Yields;
  culture: number;
  foodUpkeep: number;
  surplus: number;
  foodToGrow: number;
  specialists: number;
  moodLimit: number;
  unhappy: number;
  unrest: boolean;
  supplyLimit: number;
  supplyDeficit: number;
  /** Faktor auf Produktion und Handel durch Unzufriedenheit (0–1). */
  efficiency: number;
  radius: number;
}

export interface TurnEvent {
  player: number;
  text: string;
  tile: number;
  city?: number;
}

export const CITY_MIN_DISTANCE = 3;
export const FOOD_PER_CITIZEN = 2;
export const SPECIALIST_TRADE = 2;
export const BASE_MOOD = 4;
export const BASE_SUPPLY = 4;
export const FRESH_WATER_SUPPLY = 2;
export const BASE_CULTURE = 1;
const BORDER_STEPS = [0, 15, 150];
const CENTER_MIN: Yields = { food: 2, prod: 1, trade: 1 };

export function foodToGrow(size: number): number {
  return 14 + 6 * size;
}

export function cityRadius(c: City): number {
  let r = 0;
  for (const step of BORDER_STEPS) if (c.culture >= step) r++;
  return r;
}

/** Kultur bis zum nächsten Grenzwachstum, null = Maximum erreicht. */
export function cultureToNextRadius(c: City): number | null {
  const next = BORDER_STEPS.find((s) => s > c.culture);
  return next === undefined ? null : next - c.culture;
}

export function buildCost(item: BuildItem): number {
  return item.kind === 'unit' ? UNIT_TYPES[item.id].cost : BUILDINGS[item.id].cost;
}

export function buildName(item: BuildItem): string {
  return item.kind === 'unit' ? UNIT_TYPES[item.id].name : BUILDINGS[item.id].name;
}

export function sameItem(a: BuildItem, b: BuildItem): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** Was kann diese Stadt grundsätzlich bauen? (Technologien kommen in M4.) */
export function availableItems(c: City): BuildItem[] {
  const items: BuildItem[] = UNIT_TYPES.map((_, id) => ({ kind: 'unit', id }));
  BUILDINGS.forEach((b, id) => {
    if (b.buildable && !c.buildings.includes(id) && !c.queue.some((q) => q.kind === 'building' && q.id === id)) {
      items.push({ kind: 'building', id });
    }
  });
  return items;
}

export function cityAt(state: GameState, tile: number): City | undefined {
  return state.cities.find((c) => c.tile === tile);
}

export function hasFreshWater(map: GameMap, tile: number): boolean {
  if (touchesRiver(map, tile)) return true;
  let lake = false;
  forEachNeighbor(map, tile, (n) => {
    if (map.terrain[n] === Terrain.Lake) lake = true;
  });
  return lake;
}

/**
 * Grund, warum hier keine Stadt gegründet werden kann – oder null.
 * Rein über Karte, bekannte Städte und Feldbesitz, damit die Oberfläche dieselbe Prüfung nutzen kann.
 */
export function foundingBlockerAt(
  map: GameMap, cityTiles: readonly number[], tileOwner: ArrayLike<number>, owner: number, tile: number,
): string | null {
  if (isWater(map.terrain[tile]) || map.relief[tile] === Relief.Mountain || map.feature[tile] === Feature.Ice) {
    return 'Hier kann keine Stadt stehen';
  }
  if (cityTiles.some((t) => tileDistance(map, t, tile) < CITY_MIN_DISTANCE)) {
    return `Zu nah an einer anderen Stadt (mindestens ${CITY_MIN_DISTANCE} Felder Abstand)`;
  }
  const o = tileOwner[tile];
  if (o >= 0 && o !== owner) return 'Fremdes Gebiet';
  return null;
}

export function foundingBlocker(state: GameState, owner: number, tile: number): string | null {
  return foundingBlockerAt(state.map, state.cities.map((c) => c.tile), state.tileOwner, owner, tile);
}

export function foundCity(state: GameState, owner: number, tile: number): City {
  const taken = new Set(state.cities.map((c) => c.name));
  const ownCount = state.cities.filter((c) => c.owner === owner).length;
  const city: City = {
    id: state.nextCityId++,
    owner,
    name: cityName(state.map.seed, owner, ownCount, taken),
    tile,
    size: 1,
    foodStored: 0,
    prodStored: 0,
    culture: 0,
    founded: state.turn,
    queue: [],
    buildings: ownCount === 0 ? [BuildingId.Palace] : [],
    worked: [],
    locked: [],
  };
  state.cities.push(city);
  recomputeOwnership(state);
  assignTiles(state, city);
  return city;
}

/**
 * Feldbesitz: Jede Stadt beansprucht die Felder in ihrem Radius; bei Überschneidung gewinnt die
 * nähere Stadt, bei Gleichstand die ältere. Stadtfelder gehören immer ihrer Stadt.
 */
export function recomputeOwnership(state: GameState): void {
  const m = state.map;
  state.tileOwner.fill(-1);
  state.tileCity.fill(-1);
  const best = new Int32Array(m.width * m.height).fill(1 << 30);
  const cities = [...state.cities].sort((a, b) => a.id - b.id);
  for (const c of cities) {
    best[c.tile] = -1;
    state.tileOwner[c.tile] = c.owner;
    state.tileCity[c.tile] = c.id;
  }
  for (const c of cities) {
    for (const t of tilesAround(m, c.tile, cityRadius(c))) {
      const d = tileDistance(m, c.tile, t);
      if (d < best[t]) {
        best[t] = d;
        state.tileOwner[t] = c.owner;
        state.tileCity[t] = c.id;
      }
    }
  }
  for (const c of cities) {
    c.worked = c.worked.filter((t) => state.tileCity[t] === c.id);
    c.locked = c.locked.filter((t) => state.tileCity[t] === c.id);
  }
}

/** Felder, die diese Stadt bewirtschaften darf. */
export function workableTiles(state: GameState, c: City): number[] {
  return tilesAround(state.map, c.tile, cityRadius(c)).filter((t) => t !== c.tile && state.tileCity[t] === c.id);
}

function centerYields(state: GameState, c: City): Yields {
  const y = tileYields(state.map, c.tile);
  return {
    food: Math.max(y.food, CENTER_MIN.food),
    prod: Math.max(y.prod, CENTER_MIN.prod),
    trade: Math.max(y.trade, CENTER_MIN.trade),
  };
}

/** Verschiedene Luxusgüter im eigenen Gebiet (Handelsnetz folgt in M4). */
export function luxuryCount(state: GameState, owner: number): number {
  const seen = new Set<number>();
  const m = state.map;
  for (let i = 0; i < state.tileOwner.length; i++) {
    if (state.tileOwner[i] !== owner) continue;
    const r = RESOURCES[m.resource[i]];
    if (r && r.kind === ResourceKind.Luxury) seen.add(m.resource[i]);
  }
  return seen.size;
}

/**
 * Bürger auf Felder verteilen. Feste Felder bleiben; der Rest wird nach Nutzen gewählt,
 * solange die Nahrung knapp ist mit Vorrang für Nahrung. Wer kein lohnendes Feld findet, wird Spezialist.
 */
export function assignTiles(state: GameState, c: City): void {
  const workable = new Set(workableTiles(state, c));
  c.locked = c.locked.filter((t) => workable.has(t)).slice(0, c.size);
  c.worked = [...c.locked];
  const center = centerYields(state, c);
  let food = center.food;
  for (const t of c.worked) food += tileYields(state.map, t).food;
  const free = [...workable].filter((t) => !c.worked.includes(t)).map((t) => ({ t, y: tileYields(state.map, t) }));
  while (c.worked.length < c.size && free.length) {
    const need = (c.worked.length + 1) * FOOD_PER_CITIZEN + 2; // +2 Überschuss als Ziel
    const foodWeight = food < need ? 3 : 1.6;
    let bestIdx = -1;
    let bestScore = SPECIALIST_TRADE * 1.0;
    free.forEach((f, k) => {
      const s = f.y.food * foodWeight + f.y.prod * 1.7 + f.y.trade * 1.0 + f.t * 1e-9;
      if (s > bestScore) {
        bestScore = s;
        bestIdx = k;
      }
    });
    if (bestIdx < 0) break;
    const [pick] = free.splice(bestIdx, 1);
    c.worked.push(pick.t);
    food += pick.y.food;
  }
}

export function cityReport(state: GameState, c: City): CityReport {
  const m = state.map;
  const y = centerYields(state, c);
  for (const t of c.worked) {
    const ty = tileYields(m, t);
    y.food += ty.food;
    y.prod += ty.prod;
    y.trade += ty.trade;
  }
  const specialists = Math.max(0, c.size - c.worked.length);
  y.trade += specialists * SPECIALIST_TRADE;

  let culture = BASE_CULTURE;
  let mood = BASE_MOOD + luxuryCount(state, c.owner);
  let supply = BASE_SUPPLY + (hasFreshWater(m, c.tile) ? FRESH_WATER_SUPPLY : 0);
  for (const b of c.buildings) {
    culture += BUILDINGS[b].culture;
    mood += BUILDINGS[b].mood;
    supply += BUILDINGS[b].supply;
  }
  const unhappy = Math.max(0, c.size - mood);
  const unrest = unhappy > 0 && unhappy * 2 >= c.size;
  const efficiency = unrest ? 0 : Math.max(0, 1 - 0.1 * unhappy);
  const supplyDeficit = Math.max(0, c.size - supply);
  const foodUpkeep = c.size * FOOD_PER_CITIZEN + supplyDeficit;
  const yields = { food: y.food, prod: Math.floor(y.prod * efficiency), trade: Math.floor(y.trade * efficiency) };
  return {
    yields,
    culture: unrest ? 0 : culture,
    foodUpkeep,
    surplus: yields.food - foodUpkeep,
    foodToGrow: foodToGrow(c.size),
    specialists,
    moodLimit: mood,
    unhappy,
    unrest,
    supplyLimit: supply,
    supplyDeficit,
    efficiency,
    radius: cityRadius(c),
  };
}

export interface CityTurnResult {
  trade: number;
  /** Neue Einheiten (Typ), die auf dem Stadtfeld erscheinen. */
  newUnits: number[];
  radiusChanged: boolean;
}

/** Eine Runde für eine Stadt: Nahrung, Produktion, Kultur. */
export function processCity(state: GameState, c: City, events: TurnEvent[]): CityTurnResult {
  assignTiles(state, c);
  const rep = cityReport(state, c);
  const res: CityTurnResult = { trade: rep.yields.trade, newUnits: [], radiusChanged: false };
  const ev = (text: string) => events.push({ player: c.owner, text: `${c.name}: ${text}`, tile: c.tile, city: c.id });

  // Nahrung
  c.foodStored += rep.surplus;
  if (c.foodStored >= rep.foodToGrow) {
    const keep = Math.max(0, ...c.buildings.map((b) => BUILDINGS[b].keepFood));
    c.foodStored = c.foodStored - rep.foodToGrow + Math.floor(rep.foodToGrow * keep);
    c.size++;
    ev(`wächst auf Größe ${c.size}`);
  } else if (c.foodStored < 0) {
    c.foodStored = 0;
    if (c.size > 1) {
      c.size--;
      ev(`Hungersnot – schrumpft auf Größe ${c.size}`);
    }
  }

  // Produktion (höchstens ein fertiges Objekt pro Runde)
  c.prodStored += rep.yields.prod;
  const item = c.queue[0];
  if (!item) {
    ev('braucht einen Bauauftrag');
  } else if (c.prodStored >= buildCost(item)) {
    const unit = item.kind === 'unit' ? UNIT_TYPES[item.id] : null;
    if (unit && unit.popCost > 0 && c.size <= unit.popCost) {
      ev(`${unit.name} braucht Größe ${unit.popCost + 1}`);
    } else {
      c.prodStored -= buildCost(item);
      c.queue.shift();
      if (unit) {
        c.size -= unit.popCost;
        res.newUnits.push(item.id);
      } else {
        c.buildings.push(item.id);
      }
      ev(`${buildName(item)} fertiggestellt`);
    }
  }

  // Kultur
  const before = cityRadius(c);
  c.culture += rep.culture;
  if (cityRadius(c) !== before) {
    res.radiusChanged = true;
    ev('Grenzen wachsen');
  }
  assignTiles(state, c);
  return res;
}
