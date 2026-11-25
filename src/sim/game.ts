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
}

export interface GameState {
  turn: number;
  map: GameMap;
  options: MapGenOptions;
  starts: number[];
  players: Player[];
  units: Unit[];
  nextUnitId: number;
  rng: Rng;
}

export type Command =
  | { type: 'move'; unit: number; target: number }
  | { type: 'fortify'; unit: number }
  | { type: 'skip'; unit: number }
  | { type: 'wake'; unit: number }
  | { type: 'disband'; unit: number };

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
    })),
    units: [],
    nextUnitId: 1,
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
  for (let i = 0; i < p.visible.length; i++) if (p.visible[i]) p.explored[i] = 1;
}

/** Feld → Besitzer der dort stehenden Einheiten (-1 = leer). Stapel sind nur einfarbig möglich. */
function occupancy(state: GameState): Int16Array {
  const occ = new Int16Array(state.map.width * state.map.height).fill(-1);
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
    occ[u.tile] = state.units.some((o) => o !== u && o.tile === u.tile) ? u.owner : -1;
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

export function applyCommand(state: GameState, player: number, cmd: Command): MoveEvent[] {
  const u = findUnit(state, cmd.unit);
  if (!u || u.owner !== player) throw new CommandError('Einheit nicht gefunden');
  switch (cmd.type) {
    case 'move': {
      if (cmd.target === u.tile) return [];
      if (u.moves <= 0) throw new CommandError('Keine Bewegung mehr übrig');
      const path = planPath(state, u, cmd.target, occupancy(state));
      if (!path) throw new CommandError('Ziel ist nicht erreichbar');
      u.path = path;
      u.orders = Orders.Goto;
      const ev = continueMove(state, u);
      return ev ? [ev] : [];
    }
    case 'fortify':
      u.orders = Orders.Fortify;
      u.path = null;
      return [];
    case 'skip':
      u.orders = Orders.Skip;
      return [];
    case 'wake':
      u.orders = Orders.None;
      u.path = null;
      return [];
    case 'disband':
      state.units = state.units.filter((o) => o !== u);
      refreshVision(state, player);
      return [];
  }
}

/**
 * Rundenende des Menschen: Gegner ziehen (KI folgt in M6), neue Runde beginnt,
 * Bewegung wird aufgefüllt, laufende Marschbefehle werden fortgesetzt.
 */
export function endTurn(state: GameState): MoveEvent[] {
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
  return events;
}

/** Eigene Einheiten, die noch einen Befehl brauchen. */
export function readyUnits(state: GameState, player: number): Unit[] {
  return state.units.filter((u) => u.owner === player && u.moves > 0 && u.orders === Orders.None);
}
