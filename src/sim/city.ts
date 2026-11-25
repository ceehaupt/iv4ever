import type { GameState } from './game';
import { forEachNeighbor, tileDistance, tilesAround } from './hex';
import { hasFreshWater, type GameMap, type Knows, resourceActive, tileYields, touchesRiver } from './map';
import { cityName } from './names';
import { BUILDINGS, BuildingId } from './rules/buildings';
import { RESOURCES, ResourceKind } from './rules/resources';
import { TechId } from './rules/techs';
import { Feature, isWater, Relief, Terrain, type Yields } from './rules/terrain';
import { UNIT_TYPES } from './rules/units';

/**
 * Städte. Regeln (eigene Entwürfe, siehe docs/REGELN.md):
 * - Grenzen/Arbeitsradius wachsen mit Kultur: 1 Ring → 2 Ringe (15 Kultur) → 3 Ringe (150 Kultur).
 * - Jeder Bürger isst 2 Nahrung und bewirtschaftet ein Feld; ohne lohnendes Feld wird er Spezialist (+2 Handel).
 * - Stimmung: Bürger über der Zufriedenheitsgrenze sind unzufrieden: je −10 % Produktion und Handel;
 *   ist mindestens die Hälfte unzufrieden, herrscht Unruhe (keine Produktion, kein Handel).
 * - Versorgung: Bürger über der Versorgungsgrenze essen je 1 Nahrung zusätzlich.
 * - Handelsnetz: Straßen, Flüsse und eigene Städte verbinden; mit Seefahrt auch die Küstenstädte untereinander.
 *   An den Palast angebundene Städte erhalten +2 Handel; Luxusgüter zählen nur, wenn verbessert und angebunden.
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
  research: number;
  gold: number;
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
  /** An den Palast angebunden (Handelsnetz). */
  connected: boolean;
  coastal: boolean;
}

export interface TurnEvent {
  player: number;
  text: string;
  tile: number;
  city?: number;
}

/** Alles, was eine Stadtabrechnung über ihren Spieler wissen muss (einmal pro Runde berechnet). */
export interface PlayerContext {
  knows: Knows;
  /** Verfügbare strategische Ressourcen (Schlüssel): verbessert, im eigenen Gebiet, angebunden. */
  strategic: Set<string>;
  rate: number;
  capital: number;
  connected: Set<number>;
  luxuries: number;
  all: { mood: number; supply: number; specialistTrade: number; coastalTrade: number };
}

export const CITY_MIN_DISTANCE = 3;
export const FOOD_PER_CITIZEN = 2;
export const SPECIALIST_TRADE = 2;
export const BASE_MOOD = 4;
export const BASE_SUPPLY = 4;
export const FRESH_WATER_SUPPLY = 2;
export const BASE_CULTURE = 1;
export const CONNECTION_TRADE = 2;
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

export function isCoastal(map: GameMap, tile: number): boolean {
  let coast = false;
  forEachNeighbor(map, tile, (n) => {
    if (map.terrain[n] === Terrain.Coast || map.terrain[n] === Terrain.Ocean) coast = true;
  });
  return coast;
}

export function knowsFn(state: GameState, owner: number): Knows {
  const techs = state.players[owner].techs;
  return (t) => techs[t] === 1;
}

/** Weltwunder, die schon irgendwo stehen. */
export function builtWonders(state: GameState): Set<number> {
  const out = new Set<number>();
  for (const c of state.cities) for (const b of c.buildings) if (BUILDINGS[b].wonder) out.add(b);
  return out;
}

/** Was kann diese Stadt jetzt bauen? Einheiten brauchen Technologie und angebundene strategische Ressourcen. */
export function availableItems(state: GameState, c: City, ctx: PlayerContext = playerContext(state, c.owner)): BuildItem[] {
  const knows = ctx.knows;
  const items: BuildItem[] = [];
  const coastalCity = isCoastal(state.map, c.tile);
  UNIT_TYPES.forEach((u, id) => {
    if (u.tech !== null && !knows(u.tech)) return;
    if (u.naval && !coastalCity) return;
    if (u.resources.some((r) => !ctx.strategic.has(r))) return;
    items.push({ kind: 'unit', id });
  });
  const wonders = builtWonders(state);
  const coastal = isCoastal(state.map, c.tile);
  BUILDINGS.forEach((b, id) => {
    if (!b.buildable || c.buildings.includes(id) || c.queue.some((q) => q.kind === 'building' && q.id === id)) return;
    if (b.tech !== null && !knows(b.tech)) return;
    if (b.requires !== undefined && !c.buildings.includes(b.requires)) return;
    if (b.coastal && !coastal) return;
    if (b.wonder && wonders.has(id)) return;
    items.push({ kind: 'building', id });
  });
  return items;
}

export function cityAt(state: GameState, tile: number): City | undefined {
  return state.cities.find((c) => c.tile === tile);
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
  // Städte gelten als Straßenknoten; eine Verbesserung unter der Stadt entfällt.
  state.map.road[tile] = 1;
  state.map.improvement[tile] = 0;
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

/**
 * Handelsnetz eines Spielers: Städte, die mit dem Palast verbunden sind.
 * Knoten sind Felder mit Straße oder Fluss (nicht in fremdem Gebiet); mit Seefahrt
 * sind zusätzlich alle eigenen Küstenstädte untereinander verbunden.
 */
export function tradeNetwork(state: GameState, owner: number, knows: Knows): { capital: number; connected: Set<number> } {
  const own = state.cities.filter((c) => c.owner === owner);
  const capital = own.find((c) => c.buildings.includes(BuildingId.Palace));
  const connected = new Set<number>();
  if (!capital) return { capital: -1, connected };
  const m = state.map;
  const node = (t: number) =>
    (m.road[t] === 1 || touchesRiver(m, t)) && (state.tileOwner[t] < 0 || state.tileOwner[t] === owner);
  const cityByTile = new Map(own.map((c) => [c.tile, c]));
  const seafaring = knows(TechId.Seafaring);
  const seen = new Uint8Array(m.width * m.height);
  const queue = [capital.tile];
  seen[capital.tile] = 1;
  let coastLinked = false;
  while (queue.length) {
    const t = queue.pop()!;
    const city = cityByTile.get(t);
    if (city) {
      connected.add(city.id);
      if (seafaring && !coastLinked && isCoastal(m, t)) {
        coastLinked = true;
        for (const c of own) {
          if (!seen[c.tile] && isCoastal(m, c.tile)) {
            seen[c.tile] = 1;
            queue.push(c.tile);
          }
        }
      }
    }
    forEachNeighbor(m, t, (n) => {
      if (!seen[n] && (node(n) || cityByTile.has(n))) {
        seen[n] = 1;
        queue.push(n);
      }
    });
  }
  return { capital: capital.id, connected };
}

export function playerContext(state: GameState, owner: number): PlayerContext {
  const knows = knowsFn(state, owner);
  const { capital, connected } = tradeNetwork(state, owner, knows);
  // Luxusgüter: verbessert, im eigenen Gebiet und über die Stadt des Feldes angebunden.
  const lux = new Set<number>();
  const strategic = new Set<string>();
  const m = state.map;
  for (let i = 0; i < state.tileOwner.length; i++) {
    if (state.tileOwner[i] !== owner) continue;
    const r = RESOURCES[m.resource[i]];
    if (!r || r.kind === ResourceKind.Bonus || !resourceActive(m, i, knows)) continue;
    if (!connected.has(state.tileCity[i])) continue;
    if (r.kind === ResourceKind.Luxury) lux.add(m.resource[i]);
    else strategic.add(r.key);
  }
  const all = { mood: 0, supply: 0, specialistTrade: 0, coastalTrade: 0 };
  for (const c of state.cities) {
    if (c.owner !== owner) continue;
    for (const b of c.buildings) {
      const a = BUILDINGS[b].all;
      if (!a) continue;
      all.mood += a.mood ?? 0;
      all.supply += a.supply ?? 0;
      all.specialistTrade += a.specialistTrade ?? 0;
      all.coastalTrade += a.coastalTrade ?? 0;
    }
  }
  return { knows, strategic, rate: state.players[owner].rate, capital, connected, luxuries: lux.size, all };
}

function centerYields(state: GameState, c: City, knows: Knows): Yields {
  const y = tileYields(state.map, c.tile, knows);
  return {
    food: Math.max(y.food, CENTER_MIN.food),
    prod: Math.max(y.prod, CENTER_MIN.prod),
    trade: Math.max(y.trade, CENTER_MIN.trade),
  };
}

function workedYields(state: GameState, c: City, t: number, knows: Knows): Yields {
  const y = tileYields(state.map, t, knows);
  if (isWater(state.map.terrain[t])) for (const b of c.buildings) y.food += BUILDINGS[b].waterFood ?? 0;
  return y;
}

/** Verschiedene aktive, angebundene Luxusgüter eines Spielers. */
export function luxuryCount(state: GameState, owner: number): number {
  return playerContext(state, owner).luxuries;
}

/**
 * Bürger auf Felder verteilen. Feste Felder bleiben; der Rest wird nach Nutzen gewählt,
 * solange die Nahrung knapp ist mit Vorrang für Nahrung. Wer kein lohnendes Feld findet, wird Spezialist.
 */
export function assignTiles(state: GameState, c: City): void {
  const knows = knowsFn(state, c.owner);
  const workable = new Set(workableTiles(state, c));
  c.locked = c.locked.filter((t) => workable.has(t)).slice(0, c.size);
  c.worked = [...c.locked];
  const center = centerYields(state, c, knows);
  let food = center.food;
  for (const t of c.worked) food += workedYields(state, c, t, knows).food;
  const free = [...workable].filter((t) => !c.worked.includes(t)).map((t) => ({ t, y: workedYields(state, c, t, knows) }));
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

export function cityReport(state: GameState, c: City, ctx: PlayerContext = playerContext(state, c.owner)): CityReport {
  const m = state.map;
  const y = centerYields(state, c, ctx.knows);
  for (const t of c.worked) {
    const ty = workedYields(state, c, t, ctx.knows);
    y.food += ty.food;
    y.prod += ty.prod;
    y.trade += ty.trade;
  }
  const specialists = Math.max(0, c.size - c.worked.length);
  y.trade += specialists * (SPECIALIST_TRADE + ctx.all.specialistTrade);
  const connected = ctx.connected.has(c.id);
  const coastal = isCoastal(m, c.tile);
  if (connected && c.id !== ctx.capital) y.trade += CONNECTION_TRADE;
  if (coastal) y.trade += ctx.all.coastalTrade;

  let culture = BASE_CULTURE;
  let mood = BASE_MOOD + ctx.luxuries + ctx.all.mood;
  let supply = BASE_SUPPLY + (hasFreshWater(m, c.tile) ? FRESH_WATER_SUPPLY : 0) + ctx.all.supply;
  let researchPct = 0;
  let goldPct = 0;
  let prodPct = 0;
  let flatResearch = 0;
  for (const id of c.buildings) {
    const b = BUILDINGS[id];
    culture += b.culture;
    mood += b.mood;
    supply += b.supply;
    researchPct += b.researchPct ?? 0;
    goldPct += b.goldPct ?? 0;
    prodPct += b.prodPct ?? 0;
    flatResearch += b.research ?? 0;
    y.trade += b.trade ?? 0;
  }
  const unhappy = Math.max(0, c.size - mood);
  const unrest = unhappy > 0 && unhappy * 2 >= c.size;
  const efficiency = unrest ? 0 : Math.max(0, 1 - 0.1 * unhappy);
  const supplyDeficit = Math.max(0, c.size - supply);
  const foodUpkeep = c.size * FOOD_PER_CITIZEN + supplyDeficit;
  const trade = Math.floor(y.trade * efficiency);
  const prod = Math.floor(Math.floor(y.prod * efficiency) * (1 + prodPct / 100));
  const baseResearch = Math.floor((trade * ctx.rate) / 100);
  const research = unrest ? 0 : Math.floor(baseResearch * (1 + researchPct / 100)) + flatResearch;
  const gold = Math.floor((trade - baseResearch) * (1 + goldPct / 100));
  return {
    yields: { food: y.food, prod, trade },
    research,
    gold,
    culture: unrest ? 0 : culture,
    foodUpkeep,
    surplus: y.food - foodUpkeep,
    foodToGrow: foodToGrow(c.size),
    specialists,
    moodLimit: mood,
    unhappy,
    unrest,
    supplyLimit: supply,
    supplyDeficit,
    efficiency,
    radius: cityRadius(c),
    connected,
    coastal,
  };
}

export interface CityTurnResult {
  research: number;
  gold: number;
  /** Neue Einheiten (Typ), die auf dem Stadtfeld erscheinen. */
  newUnits: number[];
  radiusChanged: boolean;
  /** Fertiggestelltes Weltwunder (Gebäude-ID). */
  wonder?: number;
}

/** Eine Runde für eine Stadt: Nahrung, Produktion, Kultur. */
export function processCity(state: GameState, c: City, events: TurnEvent[], ctx: PlayerContext): CityTurnResult {
  assignTiles(state, c);
  const rep = cityReport(state, c, ctx);
  const res: CityTurnResult = { research: rep.research, gold: rep.gold, newUnits: [], radiusChanged: false };
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
  } else if (item.kind === 'building' && BUILDINGS[item.id].wonder && builtWonders(state).has(item.id)) {
    c.queue.shift();
    ev(`${BUILDINGS[item.id].name} wurde anderswo vollendet – Produktion bleibt erhalten`);
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
        if (BUILDINGS[item.id].wonder) res.wonder = item.id;
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
