import {
  assignTiles, availableItems, type BuildItem, type City, cityAt, cityReport, foundCity, foundingBlocker, processCity,
  recomputeOwnership, sameItem, type TurnEvent, workableTiles,
} from './city';
import { tilesAround } from './hex';
import type { GameMap } from './map';
import type { GeneratedWorld, MapGenOptions } from './mapgen';
import { findPath, landCost } from './path';
import { Rng } from './rng';
import { isWater, tileMoveCost } from './rules/terrain';
import { MOVE_SCALE, maxMoves, START_UNITS, UNIT_TYPES } from './rules/units';
import { markVisible } from './vision';

export const Orders = {
  None: 0,
  /** Befestigt (Kampfeinheiten) bzw. schlafend – bleibt bis zum Aufwecken. */
  Fortify: 1,
  /** Diese Runde nichts tun. */
  Skip: 2,
  /** Unterwegs zu einem Ziel (Restweg in path). */
  Goto: 3,
} as const;

export interface Unit {
  id: number;
  type: number;
  owner: number;
  tile: number;
  /** Verbleibende Bewegungspunkte (skaliert mit MOVE_SCALE). */
  moves: number;
  orders: number;
  path: number[] | null;
}

export interface Player {
  id: number;
  name: string;
  human: boolean;
  alive: boolean;
  /** 1 = Feld wurde schon einmal gesehen. */
  explored: Uint8Array;
  /** 1 = Feld ist aktuell sichtbar (abgeleitet, wird nicht gespeichert). */
  visible: Uint8Array;
  gold: number;
  /** Angesammelte Forschung (wird ab M4 für Technologien ausgegeben). */
  research: number;
  /** Anteil des Handels für Forschung in Prozent (Rest = Gold), Schritte zu 10. */
  rate: number;
}

/** Wirtschaftsbilanz eines Spielers pro Runde. */
export interface Economy {
  trade: number;
  research: number;
  goldIncome: number;
  cityUpkeep: number;
  unitUpkeep: number;
  freeUnits: number;
  net: number;
}

export interface GameState {
  turn: number;
  map: GameMap;
  options: MapGenOptions;
  starts: number[];
  players: Player[];
  units: Unit[];
  nextUnitId: number;
  cities: City[];
  nextCityId: number;
  /** Abgeleitet (recomputeOwnership): Besitzer bzw. Stadt je Feld, -1 = niemand. */
  tileOwner: Int16Array;
  tileCity: Int32Array;
  rng: Rng;
}

export type Command =
  | { type: 'move'; unit: number; target: number }
  | { type: 'fortify'; unit: number }
  | { type: 'skip'; unit: number }
  | { type: 'wake'; unit: number }
  | { type: 'disband'; unit: number }
  | { type: 'found'; unit: number }
  | { type: 'build'; city: number; item: BuildItem; append: boolean }
  | { type: 'unqueue'; city: number; index: number }
  | { type: 'toggleTile'; city: number; tile: number }
  | { type: 'setRate'; rate: number };

export interface MoveEvent {
  unit: number;
  owner: number;
  /** Startfeld + betretene Felder. */
  steps: number[];
}

export class CommandError extends Error {}

export const HUMAN = 0;
/** Radius um das Startfeld, der zu Spielbeginn bekannt ist. */
export const START_KNOWN_RADIUS = 3;
export const DEFAULT_RATE = 60;
/** Sichtweite einer Stadt (zusätzlich ist das eigene Gebiet sichtbar). */
export const CITY_SIGHT = 2;

export function createGame(world: GeneratedWorld, options: MapGenOptions): GameState {
  const n = world.map.width * world.map.height;
  const state: GameState = {
    turn: 1,
    map: world.map,
    options,
    starts: world.starts,
    players: world.starts.map((_, id) => ({
      id,
      name: id === HUMAN ? 'Du' : `Spieler ${id + 1}`,
      human: id === HUMAN,
      alive: true,
      explored: new Uint8Array(n),
      visible: new Uint8Array(n),
      gold: 0,
      research: 0,
      rate: DEFAULT_RATE,
    })),
    units: [],
    nextUnitId: 1,
    cities: [],
    nextCityId: 1,
    tileOwner: new Int16Array(n).fill(-1),
    tileCity: new Int32Array(n).fill(-1),
    rng: new Rng(options.seed ^ 0x5eed),
  };
  world.starts.forEach((tile, owner) => {
    for (const type of START_UNITS) addUnit(state, owner, type, tile);
    // Die eigene Heimat kennt man: Umgebung des Startfeldes gilt als erkundet.
    for (const t of tilesAround(state.map, tile, START_KNOWN_RADIUS)) state.players[owner].explored[t] = 1;
  });
  for (const p of state.players) refreshVision(state, p.id);
  return state;
}

export function addUnit(state: GameState, owner: number, type: number, tile: number): Unit {
  const u: Unit = { id: state.nextUnitId++, type, owner, tile, moves: maxMoves(type), orders: Orders.None, path: null };
  state.units.push(u);
  return u;
}

export function findUnit(state: GameState, id: number): Unit | undefined {
  return state.units.find((u) => u.id === id);
}

/** Sicht eines Spielers neu berechnen und Erkundetes ergänzen. */
export function refreshVision(state: GameState, playerId: number): void {
  const p = state.players[playerId];
  p.visible.fill(0);
  for (const u of state.units) {
    if (u.owner === playerId) markVisible(state.map, u.tile, UNIT_TYPES[u.type].sight, p.visible);
  }
  for (const c of state.cities) {
    if (c.owner === playerId) markVisible(state.map, c.tile, CITY_SIGHT, p.visible);
  }
  for (let i = 0; i < p.visible.length; i++) if (state.tileOwner[i] === playerId) p.visible[i] = 1;
  for (let i = 0; i < p.visible.length; i++) if (p.visible[i]) p.explored[i] = 1;
}

/** Feld → Besitzer der dort stehenden Einheiten (-1 = leer). Stapel sind nur einfarbig möglich. */
function occupancy(state: GameState): Int16Array {
  const occ = new Int16Array(state.map.width * state.map.height).fill(-1);
  for (const c of state.cities) occ[c.tile] = c.owner;
  for (const u of state.units) occ[u.tile] = u.owner;
  return occ;
}

/** Kostenfunktion aus Sicht eines Spielers: eigenes Wissen, sichtbare fremde Einheiten blockieren. */
function costFor(state: GameState, owner: number, occ: Int16Array) {
  const p = state.players[owner];
  return landCost(
    state.map,
    (i) => p.explored[i] === 1,
    (i) => occ[i] >= 0 && occ[i] !== owner && p.visible[i] === 1,
  );
}

/** Kann die Einheit das Feld tatsächlich betreten (wahres Gelände, alle fremden Einheiten)? */
function canEnter(state: GameState, u: Unit, tile: number, occ: Int16Array): boolean {
  const m = state.map;
  if (isWater(m.terrain[tile])) return false;
  if (!Number.isFinite(tileMoveCost(m.terrain[tile], m.relief[tile], m.feature[tile]))) return false;
  return occ[tile] < 0 || occ[tile] === u.owner;
}

function planPath(state: GameState, u: Unit, target: number, occ: Int16Array): number[] | null {
  const res = findPath({
    map: state.map,
    from: u.tile,
    to: target,
    maxMoves: maxMoves(u.type),
    movesLeft: u.moves,
    cost: costFor(state, u.owner, occ),
  });
  return res ? res.tiles : null;
}

/** Geht den gespeicherten Weg so weit wie möglich; plant neu, wenn unterwegs Hindernisse auftauchen. */
function continueMove(state: GameState, u: Unit): MoveEvent | null {
  const steps = [u.tile];
  const occ = occupancy(state);
  let replans = 0;
  while (u.moves > 0 && u.path && u.path.length) {
    const next = u.path[0];
    if (!canEnter(state, u, next, occ)) {
      const target = u.path[u.path.length - 1];
      u.path = replans++ < 3 && next !== target ? planPath(state, u, target, occ) : null;
      if (!u.path) break;
      continue;
    }
    const m = state.map;
    const cost = tileMoveCost(m.terrain[next], m.relief[next], m.feature[next]) * MOVE_SCALE;
    occ[u.tile] = state.units.some((o) => o !== u && o.tile === u.tile) || cityAt(state, u.tile) ? u.owner : -1;
    u.tile = next;
    occ[next] = u.owner;
    u.moves = Math.max(0, u.moves - cost);
    u.path.shift();
    steps.push(next);
    refreshVision(state, u.owner);
  }
  if (!u.path || u.path.length === 0) {
    u.path = null;
    if (u.orders === Orders.Goto) u.orders = Orders.None;
  }
  return steps.length > 1 ? { unit: u.id, owner: u.owner, steps } : null;
}

export interface CommandResult {
  moves: MoveEvent[];
  /** Neu gegründete Stadt (für die Oberfläche: Stadtansicht öffnen). */
  foundedCity?: number;
}

function ownCity(state: GameState, player: number, id: number): City {
  const c = state.cities.find((x) => x.id === id);
  if (!c || c.owner !== player) throw new CommandError('Stadt nicht gefunden');
  return c;
}

export function applyCommand(state: GameState, player: number, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'build': {
      const c = ownCity(state, player, cmd.city);
      if (!availableItems(c).some((i) => sameItem(i, cmd.item))) {
        throw new CommandError('Kann hier nicht gebaut werden');
      }
      if (cmd.append) c.queue.push(cmd.item);
      else if (c.queue.length) c.queue[0] = cmd.item;
      else c.queue.push(cmd.item);
      return { moves: [] };
    }
    case 'unqueue': {
      const c = ownCity(state, player, cmd.city);
      c.queue.splice(cmd.index, 1);
      return { moves: [] };
    }
    case 'toggleTile': {
      const c = ownCity(state, player, cmd.city);
      if (!workableTiles(state, c).includes(cmd.tile)) throw new CommandError('Feld gehört nicht zu dieser Stadt');
      if (c.locked.includes(cmd.tile)) {
        // Festes Feld lösen → Bürger wird frei (Spezialist), Automatik verteilt nicht neu darauf.
        c.locked = c.locked.filter((t) => t !== cmd.tile);
        c.worked = c.worked.filter((t) => t !== cmd.tile);
      } else {
        if (c.locked.length >= c.size) c.locked.shift();
        c.locked.push(cmd.tile);
      }
      assignTiles(state, c);
      return { moves: [] };
    }
    case 'setRate': {
      state.players[player].rate = Math.max(0, Math.min(100, Math.round(cmd.rate / 10) * 10));
      return { moves: [] };
    }
    default:
      return unitCommand(state, player, cmd);
  }
}

function unitCommand(state: GameState, player: number, cmd: Extract<Command, { unit: number }>): CommandResult {
  const u = findUnit(state, cmd.unit);
  if (!u || u.owner !== player) throw new CommandError('Einheit nicht gefunden');
  switch (cmd.type) {
    case 'found': {
      if (!UNIT_TYPES[u.type].canFound) throw new CommandError('Diese Einheit kann keine Stadt gründen');
      const blocker = foundingBlocker(state, player, u.tile);
      if (blocker) throw new CommandError(blocker);
      state.units = state.units.filter((o) => o !== u);
      const c = foundCity(state, player, u.tile);
      for (const city of state.cities) assignTiles(state, city);
      for (const p of state.players) refreshVision(state, p.id);
      return { moves: [], foundedCity: c.id };
    }
    case 'move': {
      if (cmd.target === u.tile) return { moves: [] };
      if (u.moves <= 0) throw new CommandError('Keine Bewegung mehr übrig');
      const path = planPath(state, u, cmd.target, occupancy(state));
      if (!path) throw new CommandError('Ziel ist nicht erreichbar');
      u.path = path;
      u.orders = Orders.Goto;
      const ev = continueMove(state, u);
      return { moves: ev ? [ev] : [] };
    }
    case 'fortify':
      u.orders = Orders.Fortify;
      u.path = null;
      return { moves: [] };
    case 'skip':
      u.orders = Orders.Skip;
      return { moves: [] };
    case 'wake':
      u.orders = Orders.None;
      u.path = null;
      return { moves: [] };
    case 'disband':
      state.units = state.units.filter((o) => o !== u);
      refreshVision(state, player);
      return { moves: [] };
  }
}

/**
 * Rundenende des Menschen: Gegner ziehen (KI folgt in M6), neue Runde beginnt,
 * Bewegung wird aufgefüllt, laufende Marschbefehle werden fortgesetzt.
 */
export function endTurn(state: GameState): { moves: MoveEvent[]; events: TurnEvent[] } {
  const turnEvents: TurnEvent[] = [];
  processEconomy(state, turnEvents);
  state.turn++;
  const events: MoveEvent[] = [];
  for (const u of state.units) {
    u.moves = maxMoves(u.type);
    if (u.orders === Orders.Skip) u.orders = Orders.None;
  }
  for (const u of state.units) {
    if (u.orders === Orders.Goto && u.path) {
      const ev = continueMove(state, u);
      if (ev) events.push(ev);
    }
  }
  for (const p of state.players) refreshVision(state, p.id);
  return { moves: events, events: turnEvents };
}

/** Unterhalt: Städte ab der vierten je 1 Gold, Einheiten über dem Freikontingent je 1 Gold. */
export function economy(state: GameState, player: number, trade?: number): Economy {
  const p = state.players[player];
  const cities = state.cities.filter((c) => c.owner === player);
  const units = state.units.filter((u) => u.owner === player).length;
  const t = trade ?? cities.reduce((sum, c) => sum + cityTrade(state, c), 0);
  const research = Math.floor((t * p.rate) / 100);
  const goldIncome = t - research;
  const freeUnits = 3 + 2 * cities.length;
  const cityUpkeep = Math.max(0, cities.length - 3);
  const unitUpkeep = Math.max(0, units - freeUnits);
  return { trade: t, research, goldIncome, cityUpkeep, unitUpkeep, freeUnits, net: goldIncome - cityUpkeep - unitUpkeep };
}

function cityTrade(state: GameState, c: City): number {
  return cityReport(state, c).yields.trade;
}

/** Städte aller Spieler abrechnen, neue Einheiten aufstellen, Forschung und Gold verbuchen. */
function processEconomy(state: GameState, events: TurnEvent[]): void {
  let radiusChanged = false;
  const tradeBy = new Map<number, number>();
  for (const c of [...state.cities].sort((a, b) => a.id - b.id)) {
    const res = processCity(state, c, events);
    tradeBy.set(c.owner, (tradeBy.get(c.owner) ?? 0) + res.trade);
    for (const type of res.newUnits) addUnit(state, c.owner, type, c.tile);
    radiusChanged ||= res.radiusChanged;
  }
  if (radiusChanged) {
    recomputeOwnership(state);
    for (const c of state.cities) assignTiles(state, c);
  }
  for (const p of state.players) {
    const e = economy(state, p.id, tradeBy.get(p.id) ?? 0);
    p.research += e.research;
    p.gold += e.net;
    if (p.gold < 0) {
      // Fehlbetrag wird aus der Forschung dieser Runde gedeckt.
      const cover = Math.min(-p.gold, e.research);
      p.research -= cover;
      p.gold += cover;
      if (p.gold < 0) {
        p.gold = 0;
        events.push({ player: p.id, text: 'Die Staatskasse ist leer – Unterhalt kann nicht bezahlt werden', tile: -1 });
      }
    }
  }
}

/** Eigene Einheiten, die noch einen Befehl brauchen. */
export function readyUnits(state: GameState, player: number): Unit[] {
  return state.units.filter((u) => u.owner === player && u.moves > 0 && u.orders === Orders.None);
}
