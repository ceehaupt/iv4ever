import {
  assignTiles, availableItems, type BuildItem, type City, cityAt, cityReport, foundCity, foundingBlocker, knowsFn,
  playerContext, processCity, recomputeOwnership, sameItem, type TurnEvent, workableTiles,
} from './city';
import { tilesAround } from './hex';
import type { GameMap } from './map';
import type { GeneratedWorld, MapGenOptions } from './mapgen';
import { findPath, roadStepCost, stepCost } from './path';
import { Rng } from './rng';
import { BUILDINGS, BuildingId } from './rules/buildings';
import { type JobKind, JOB_NAMES } from './rules/improvements';
import { canResearch, nextStepTowards, TECHS, TechId, techCost } from './rules/techs';
import { isWater, tileMoveCost } from './rules/terrain';
import { MOVE_SCALE, promotionChoices, PROMOTIONS, START_UNITS, UNIT_TYPES, unitMaxMoves, xpForNext } from './rules/units';
import { markVisible } from './vision';
import { DEFAULT_DOCTRINES, DOCTRINES } from './rules/doctrines';
import { tileDistance } from './hex';
import { randomEvents } from './events';
import { type Persona, personaFor } from './rules/leaders';
import { applyJob, jobBlocker, jobTurns } from './work';
import { sailable, unitCost } from './naval';
import { aiTurn } from './ai';
import {
  aiDiplomacy, canGive, createDiplomacy, declareWar, type Diplomacy, evaluate, execute, mayEnterTerritory, type Proposal, relation,
  updateContacts,
} from './diplomacy';
import { checkVictory, type Victory } from './victory';
import { barbarianTurn, type Camp } from './barbarians';
import { type CombatEvent, healUnits, performAttack } from './war';

export const Orders = {
  None: 0,
  /** Befestigt (Kampfeinheiten) bzw. schlafend – bleibt bis zum Aufwecken. */
  Fortify: 1,
  /** Diese Runde nichts tun. */
  Skip: 2,
  /** Unterwegs zu einem Ziel (Restweg in path). */
  Goto: 3,
  /** Arbeiter bei der Arbeit (Auftrag in job). */
  Work: 4,
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
  /** Laufender Arbeiterauftrag. */
  job?: JobKind | null;
  /** Lebenspunkte 0–100. */
  hp: number;
  xp: number;
  promotions: number[];
  /** Hat sich in dieser Runde bewegt oder gekämpft (keine Heilung). */
  acted: boolean;
  /** An Bord dieses Schiffes (Einheiten-ID). */
  carriedBy?: number | null;
  /** KI-Gedächtnis: Zielfeld bzw. Auftrag. */
  aiTarget?: number;
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
  /** Forschungsfortschritt (für die aktuelle Technologie bzw. angespart, solange keine gewählt ist). */
  research: number;
  /** Anteil des Handels für Forschung in Prozent (Rest = Gold), Schritte zu 10. */
  rate: number;
  /** 1 = Technologie bekannt (Index = Tech-ID). */
  techs: Uint8Array;
  /** Forschungsziel (-1 = keins); erforscht wird jeweils der nächste Schritt dorthin. */
  goal: number;
  /** Neutrale Plünderer-Fraktion. */
  barbarian?: boolean;
  /** KI-Persönlichkeit (nur Computerspieler). */
  persona?: Persona;
  /** Aktive Leitbilder [Herrschaft, Wirtschaft, Gesellschaft]. */
  doctrines: number[];
  /** Verbleibende Runden Umbruch nach einem Leitbildwechsel. */
  upheaval: number;
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
  /** Fortschritt laufender Arbeiteraufträge: Schlüssel "feld:auftrag" → Runden. */
  jobs: Record<string, number>;
  /** Spieler-ID der Plünderer (letzter Eintrag in players). */
  barbarian: number;
  camps: Camp[];
  diplomacy: Diplomacy;
  /** Gewinner (sobald eine Siegbedingung erfüllt ist). */
  winner: Victory | null;
  /** Handelsrouten zwischen Städten. */
  routes: TradeRoute[];
  rng: Rng;
}

export interface TradeRoute {
  from: number;
  to: number;
}

/** Mindestentfernung für eine Handelsroute; Höchstzahl je Heimatstadt. */
export const ROUTE_MIN_DISTANCE = 6;
export const ROUTES_PER_CITY = 2;

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
  | { type: 'setRate'; rate: number }
  | { type: 'work'; unit: number; job: JobKind }
  | { type: 'research'; tech: number }
  | { type: 'attack'; unit: number; target: number }
  | { type: 'promote'; unit: number; promotion: number }
  | { type: 'load'; unit: number }
  | { type: 'declareWar'; target: number }
  | { type: 'propose'; target: number; proposal: Proposal }
  | { type: 'respond'; proposal: number; accept: boolean }
  | { type: 'setDoctrine'; doctrine: number }
  | { type: 'establishRoute'; unit: number };

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

export function newPlayer(id: number, n: number, name: string, human: boolean): Player {
  return {
    id,
    name,
    human,
    alive: true,
    explored: new Uint8Array(n),
    visible: new Uint8Array(n),
    gold: 0,
    research: 0,
    rate: DEFAULT_RATE,
    techs: new Uint8Array(TECHS.length),
    goal: -1,
    doctrines: [DEFAULT_DOCTRINES.gov, DEFAULT_DOCTRINES.econ, DEFAULT_DOCTRINES.society],
    upheaval: 0,
  };
}

export function createGame(world: GeneratedWorld, options: MapGenOptions): GameState {
  const n = world.map.width * world.map.height;
  const humans = Math.max(1, Math.min(world.starts.length, options.humans ?? 1));
  const players = world.starts.map((_, id) => {
    if (id < humans) return newPlayer(id, n, humans > 1 ? `Spieler ${id + 1}` : 'Du', true);
    const persona = personaFor(options.seed, id - 1);
    return { ...newPlayer(id, n, persona.people, false), persona };
  });
  const barbarian = players.length;
  players.push({ ...newPlayer(barbarian, n, 'Plünderer', false), barbarian: true });
  const state: GameState = {
    turn: 1,
    map: world.map,
    options,
    starts: world.starts,
    barbarian,
    camps: [],
    diplomacy: createDiplomacy(),
    winner: null,
    routes: [],
    players,
    units: [],
    nextUnitId: 1,
    cities: [],
    nextCityId: 1,
    tileOwner: new Int16Array(n).fill(-1),
    tileCity: new Int32Array(n).fill(-1),
    jobs: {},
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

/**
 * Ein Mensch verlässt das Online-Spiel: Die KI übernimmt sein Volk. Deterministisch (Persönlichkeit aus Seed und Platz),
 * damit alle Rechner im Lockstep denselben Zustand behalten.
 */
export function handOverToAi(state: GameState, id: number): void {
  const p = state.players[id];
  if (!p || !p.human) return;
  p.human = false;
  p.persona = personaFor(state.options.seed, id - 1 + state.players.length);
  p.name = `${p.name} (KI)`;
}

export function addUnit(state: GameState, owner: number, type: number, tile: number, xp = 0): Unit {
  const u: Unit = {
    id: state.nextUnitId++, type, owner, tile, moves: unitMaxMoves(type, []), orders: Orders.None, path: null,
    hp: 100, xp, promotions: [], acted: false,
  };
  state.units.push(u);
  return u;
}

/** Kann die Einheit eine Beförderung wählen? */
export function canPromote(u: Unit): boolean {
  return UNIT_TYPES[u.type].strength > 0 && u.xp >= xpForNext(u.promotions.length) &&
    promotionChoices(u.type, u.promotions).length > 0;
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

export function roadCostFor(state: GameState, owner: number): number {
  const t = state.players[owner].techs;
  return roadStepCost(t[TechId.Engineering] === 1, t[TechId.Railroad] === 1);
}

export function ownCityTiles(state: GameState, owner: number): Set<number> {
  return new Set(state.cities.filter((c) => c.owner === owner).map((c) => c.tile));
}

export function cargoOf(state: GameState, ship: Unit): Unit[] {
  return state.units.filter((x) => x.carriedBy === ship.id);
}

/** Freie Transportschiffe eines Spielers auf Wasserfeldern: Feld → Schiff. */
export function transportsOf(state: GameState, owner: number): Map<number, Unit> {
  const out = new Map<number, Unit>();
  for (const s of state.units) {
    const cap = UNIT_TYPES[s.type].cargo ?? 0;
    if (s.owner !== owner || !cap || !isWater(state.map.terrain[s.tile])) continue;
    if (cargoOf(state, s).length < cap && !out.has(s.tile)) out.set(s.tile, s);
  }
  return out;
}

/** Kostenfunktion aus Sicht eines Spielers: eigenes Wissen, sichtbare fremde Einheiten blockieren. */
function costFor(state: GameState, u: Unit, occ: Int16Array) {
  const p = state.players[u.owner];
  return unitCost({
    map: state.map,
    type: u.type,
    isKnown: (i) => p.explored[i] === 1,
    isBlocked: (i) =>
      (occ[i] >= 0 && occ[i] !== u.owner && p.visible[i] === 1) ||
      (p.explored[i] === 1 && !mayEnterTerritory(state, u.owner, state.tileOwner[i])),
    ownCities: ownCityTiles(state, u.owner),
    transports: new Set(transportsOf(state, u.owner).keys()),
    roadCost: roadCostFor(state, u.owner),
    navigation: p.techs[TechId.Navigation] === 1,
  });
}

/** Kann die Einheit das Feld tatsächlich betreten (wahres Gelände, alle fremden Einheiten)? */
function canEnter(state: GameState, u: Unit, tile: number, occ: Int16Array): boolean {
  const m = state.map;
  if (occ[tile] >= 0 && occ[tile] !== u.owner) return false;
  if (!mayEnterTerritory(state, u.owner, state.tileOwner[tile])) return false;
  if (UNIT_TYPES[u.type].naval) {
    return sailable(m, u.type, tile, ownCityTiles(state, u.owner), state.players[u.owner].techs[TechId.Navigation] === 1);
  }
  if (isWater(m.terrain[tile])) return transportsOf(state, u.owner).has(tile);
  return Number.isFinite(tileMoveCost(m.terrain[tile], m.relief[tile], m.feature[tile]));
}

function planPath(state: GameState, u: Unit, target: number, occ: Int16Array): number[] | null {
  const res = findPath({
    map: state.map,
    from: u.tile,
    to: target,
    maxMoves: unitMaxMoves(u.type, u.promotions),
    movesLeft: u.moves,
    cost: costFor(state, u, occ),
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
    const naval = UNIT_TYPES[u.type].naval === true;
    const toWater = isWater(state.map.terrain[next]);
    const cost = naval || toWater ? MOVE_SCALE : stepCost(state.map, u.tile, next, roadCostFor(state, u.owner));
    const ship = !naval && toWater ? transportsOf(state, u.owner).get(next) : undefined;
    occ[u.tile] = state.units.some((o) => o !== u && o.tile === u.tile) || cityAt(state, u.tile) ? u.owner : -1;
    u.tile = next;
    u.acted = true;
    occ[next] = u.owner;
    u.moves = Math.max(0, u.moves - cost);
    if (naval) {
      for (const c of cargoOf(state, u)) c.tile = next;
    } else if (ship) {
      u.carriedBy = ship.id; // an Bord gehen
    } else if (u.carriedBy) {
      u.carriedBy = null; // Landung beendet den Zug
      u.moves = 0;
    }
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
  combats?: CombatEvent[];
  events?: TurnEvent[];
  /** Antwort auf ein Angebot. */
  reply?: { accepted: boolean; text: string };
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
      if (!availableItems(state, c).some((i) => sameItem(i, cmd.item))) {
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
    case 'declareWar': {
      const r = relation(state, player, cmd.target);
      if (!r.met) throw new CommandError('Ihr kennt euch noch nicht');
      if (r.war) throw new CommandError('Ihr seid bereits im Krieg');
      const events: TurnEvent[] = [];
      declareWar(state, player, cmd.target, events);
      return { moves: [], events };
    }
    case 'propose': {
      const target = state.players[cmd.target];
      if (!target || target.barbarian || !relation(state, player, cmd.target).met) throw new CommandError('Unbekannter Gesprächspartner');
      if (target.human) {
        // Mensch an Mensch: Angebot wartet auf Antwort (Diplomatie-Übersicht des Empfängers).
        state.diplomacy.pending.push({ id: state.diplomacy.nextProposalId++, from: player, to: cmd.target, proposal: cmd.proposal, turn: state.turn });
        return {
          moves: [],
          events: [
            { player, text: `Angebot an ${target.name} gesendet`, tile: -1 },
            { player: cmd.target, text: `${state.players[player].name} macht dir ein Angebot (Diplomatie: D)`, tile: -1 },
          ],
        };
      }
      const verdict = evaluate(state, cmd.target, player, cmd.proposal);
      const events: TurnEvent[] = [];
      if (verdict.accept) execute(state, player, cmd.target, cmd.proposal, events);
      events.push({ player, text: `${target.name}: „${verdict.reason}“ – ${verdict.accept ? 'angenommen' : 'abgelehnt'}`, tile: -1 });
      return { moves: [], events, reply: { accepted: verdict.accept, text: verdict.reason } };
    }
    case 'respond': {
      const idx = state.diplomacy.pending.findIndex((p) => p.id === cmd.proposal && p.to === player);
      if (idx < 0) throw new CommandError('Angebot nicht mehr gültig');
      const [prop] = state.diplomacy.pending.splice(idx, 1);
      const events: TurnEvent[] = [];
      if (cmd.accept && prop.proposal.kind === 'trade') {
        // Bedingungen können sich seit dem Angebot geändert haben.
        const ok = prop.proposal.give.every((i) => canGive(state, prop.from, prop.to, i)) &&
          prop.proposal.get.every((i) => canGive(state, prop.to, prop.from, i));
        if (!ok) throw new CommandError('Das Angebot kann nicht mehr erfüllt werden');
      }
      if (cmd.accept) execute(state, prop.from, prop.to, prop.proposal, events);
      else events.push({ player: prop.from, text: `${state.players[player].name} lehnt dein Angebot ab`, tile: -1 });
      return { moves: [], events };
    }
    case 'setDoctrine': {
      const d = DOCTRINES[cmd.doctrine];
      const p = state.players[player];
      if (!d) throw new CommandError('Unbekanntes Leitbild');
      if (d.tech !== null && !p.techs[d.tech]) throw new CommandError(`Benötigt ${TECHS[d.tech].name}`);
      const slot = (['gov', 'econ', 'society'] as const).indexOf(d.category);
      if (p.doctrines[slot] === cmd.doctrine) return { moves: [] };
      p.doctrines[slot] = cmd.doctrine;
      p.upheaval = 1;
      return { moves: [], events: [{ player, text: `Neues Leitbild: ${d.name} – eine Runde Umbruch`, tile: -1 }] };
    }
    case 'setRate': {
      state.players[player].rate = Math.max(0, Math.min(100, Math.round(cmd.rate / 10) * 10));
      return { moves: [] };
    }
    case 'research': {
      const p = state.players[player];
      if (!TECHS[cmd.tech]) throw new CommandError('Unbekannte Technologie');
      if (p.techs[cmd.tech]) throw new CommandError('Schon erforscht');
      p.goal = cmd.tech;
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
    case 'attack': {
      const events: TurnEvent[] = [];
      const combat = performAttack(state, u, cmd.target, events);
      return { moves: [], combats: [combat], events };
    }
    case 'promote': {
      if (!canPromote(u)) throw new CommandError('Noch keine Beförderung möglich');
      if (!promotionChoices(u.type, u.promotions).includes(cmd.promotion)) throw new CommandError('Diese Beförderung ist nicht wählbar');
      u.promotions.push(cmd.promotion);
      // Eine Beförderung gibt Zuversicht: +25 LP.
      u.hp = Math.min(100, u.hp + 25);
      if (PROMOTIONS[cmd.promotion].moves) u.moves += (PROMOTIONS[cmd.promotion].moves ?? 0) * MOVE_SCALE;
      return { moves: [] };
    }
    case 'work': {
      if (!UNIT_TYPES[u.type].canWork) throw new CommandError('Nur Arbeiter können das');
      const blocker = jobBlocker(state.map, state.tileOwner, player, u.tile, cmd.job, knowsFn(state, player));
      if (blocker) throw new CommandError(blocker);
      u.orders = Orders.Work;
      u.job = cmd.job;
      u.path = null;
      u.moves = 0;
      return { moves: [] };
    }
    case 'move': {
      if (cmd.target === u.tile) return { moves: [] };
      u.job = null;
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
      u.job = null;
      return { moves: [] };
    case 'skip':
      u.orders = Orders.Skip;
      return { moves: [] };
    case 'wake':
      u.orders = Orders.None;
      u.path = null;
      u.job = null;
      return { moves: [] };
    case 'disband': {
      // Mit einem Schiff auf See geht auch die Ladung unter.
      const lost = isWater(state.map.terrain[u.tile]) ? cargoOf(state, u) : [];
      for (const c of cargoOf(state, u)) c.carriedBy = null;
      state.units = state.units.filter((o) => o !== u && !lost.includes(o));
      refreshVision(state, player);
      return { moves: [] };
    }
    case 'establishRoute': {
      if (!UNIT_TYPES[u.type].trade) throw new CommandError('Nur Händler errichten Handelsrouten');
      const target = cityAt(state, u.tile);
      if (!target) throw new CommandError('Händler muss in einer Stadt stehen');
      const home = state.cities
        .filter((c) => c.owner === player && c.id !== target.id)
        .sort((a, b) => tileDistance(state.map, a.tile, target.tile) - tileDistance(state.map, b.tile, target.tile))[0];
      if (!home) throw new CommandError('Keine Heimatstadt für die Route');
      if (tileDistance(state.map, home.tile, target.tile) < ROUTE_MIN_DISTANCE) {
        throw new CommandError(`Zu nah an ${home.name} (mindestens ${ROUTE_MIN_DISTANCE} Felder)`);
      }
      if (state.routes.filter((r) => r.from === home.id).length >= ROUTES_PER_CITY) throw new CommandError(`${home.name} hat schon ${ROUTES_PER_CITY} Routen`);
      if (state.routes.some((r) => r.from === home.id && r.to === target.id)) throw new CommandError('Diese Route gibt es schon');
      state.routes.push({ from: home.id, to: target.id });
      state.units = state.units.filter((o) => o !== u);
      return { moves: [], events: [{ player, text: `Handelsroute ${home.name} → ${target.name} errichtet`, tile: target.tile }] };
    }
    case 'load': {
      const cap = UNIT_TYPES[u.type].cargo ?? 0;
      if (!cap) throw new CommandError('Dieses Schiff kann nichts transportieren');
      const free = cap - cargoOf(state, u).length;
      const waiting = state.units.filter((x) => x.owner === player && x.tile === u.tile && !UNIT_TYPES[x.type].naval && !x.carriedBy);
      if (!waiting.length) throw new CommandError('Keine Landeinheiten zum Einladen hier');
      for (const x of waiting.slice(0, free)) {
        x.carriedBy = u.id;
        x.orders = Orders.Fortify; // schläft an Bord, bis sie bewegt wird
        x.path = null;
      }
      return { moves: [] };
    }
  }
}

/**
 * Rundenende des Menschen: Gegner ziehen (KI folgt in M6), neue Runde beginnt,
 * Bewegung wird aufgefüllt, laufende Marschbefehle werden fortgesetzt.
 */
export function endTurn(state: GameState): { moves: MoveEvent[]; events: TurnEvent[]; combats: CombatEvent[] } {
  const turnEvents: TurnEvent[] = [];
  const combats: CombatEvent[] = [];
  const events: MoveEvent[] = [];
  aiTurn(state, { events: turnEvents, combats, moves: events });
  aiDiplomacy(state, turnEvents);
  processJobs(state, turnEvents);
  processEconomy(state, turnEvents);
  barbarianTurn(state, turnEvents, combats, events);
  randomEvents(state, turnEvents);
  for (const p of state.players) if (p.upheaval > 0) p.upheaval--;
  // Routen zu verlorenen oder zerstörten Städten verfallen.
  state.routes = state.routes.filter((r) => {
    const from = state.cities.find((c) => c.id === r.from);
    return from && state.cities.some((c) => c.id === r.to);
  });
  state.turn++;
  healUnits(state);
  for (const u of state.units) {
    // Arbeitende Einheiten verbrauchen ihre Bewegung für den Auftrag.
    u.moves = u.orders === Orders.Work ? 0 : unitMaxMoves(u.type, u.promotions);
    if (u.orders === Orders.Skip) u.orders = Orders.None;
  }
  for (const u of state.units) {
    if (u.orders === Orders.Goto && u.path) {
      const ev = continueMove(state, u);
      if (ev) events.push(ev);
    }
  }
  for (const p of state.players) refreshVision(state, p.id);
  updateContacts(state, turnEvents);
  const won = checkVictory(state);
  if (won) {
    const w = state.players[won.player];
    for (const p of state.players) turnEvents.push({ player: p.id, text: `${w.human ? 'Du hast' : `${w.name} hat`} gewonnen!`, tile: -1 });
  }
  return { moves: events, events: turnEvents, combats };
}

/** Fortschritt der Arbeiteraufträge; fertige Aufträge verändern die Karte. */
function processJobs(state: GameState, events: TurnEvent[]): void {
  const done = new Set<string>();
  for (const u of state.units) {
    if (u.orders !== Orders.Work || !u.job) continue;
    const key = `${u.tile}:${u.job}`;
    // Gelände kann sich geändert haben (z. B. gerodet) – dann Auftrag abbrechen.
    if (jobBlocker(state.map, state.tileOwner, u.owner, u.tile, u.job, knowsFn(state, u.owner))) {
      u.orders = Orders.None;
      u.job = null;
      continue;
    }
    state.jobs[key] = (state.jobs[key] ?? 0) + 1;
    if (state.jobs[key] >= jobTurns(u.job) && !done.has(key)) {
      done.add(key);
      applyJob(state.map, u.tile, u.job);
      events.push({ player: u.owner, text: `${JOB_NAMES[u.job]} fertiggestellt`, tile: u.tile });
    }
  }
  if (!done.size) return;
  for (const key of done) delete state.jobs[key];
  for (const u of state.units) {
    if (u.orders === Orders.Work && u.job && done.has(`${u.tile}:${u.job}`)) {
      u.orders = Orders.None;
      u.job = null;
    }
  }
  // Erträge haben sich geändert → Bewirtschaftung neu verteilen.
  for (const c of state.cities) assignTiles(state, c);
}

/** Unterhalt: Städte ab der vierten je 1 Gold (Gerichtsgebäude befreit), Einheiten über dem Freikontingent je 1 Gold. */
export function economy(state: GameState, player: number, income?: { research: number; gold: number }): Economy {
  const p = state.players[player];
  const cities = state.cities.filter((c) => c.owner === player);
  const units = state.units.filter((u) => u.owner === player).length;
  let research = 0;
  let goldIncome = 0;
  let trade = 0;
  if (income) {
    research = income.research;
    goldIncome = income.gold;
  } else {
    const ctx = playerContext(state, player);
    for (const c of cities) {
      const r = cityReport(state, c, ctx);
      research += r.research;
      goldIncome += r.gold;
      trade += r.yields.trade;
    }
  }
  const doctrineFree = p.doctrines.reduce((s, d) => s + (DOCTRINES[d].effects.freeUnits ?? 0), 0);
  const freeUnits = 3 + 2 * cities.length + (p.techs[TechId.Feudalism] ? cities.length : 0) + doctrineFree * cities.length;
  const paying = cities.filter((c) => !c.buildings.some((b) => BUILDINGS[b].noUpkeep)).length;
  const cityUpkeep = Math.max(0, paying - 3);
  const unitUpkeep = Math.max(0, units - freeUnits);
  return { trade, research, goldIncome, cityUpkeep, unitUpkeep, freeUnits, net: goldIncome - cityUpkeep - unitUpkeep };
}

/** Aktuell erforschte Technologie (nächster Schritt zum Ziel), -1 = keine. */
export function currentResearch(state: GameState, player: number): number {
  const p = state.players[player];
  return p.goal >= 0 ? nextStepTowards(p.techs, p.goal) : -1;
}

/** Städte aller Spieler abrechnen, neue Einheiten aufstellen, Forschung und Gold verbuchen. */
function processEconomy(state: GameState, events: TurnEvent[]): void {
  let radiusChanged = false;
  const income = new Map<number, { research: number; gold: number }>();
  const contexts = new Map(state.players.map((p) => [p.id, playerContext(state, p.id)]));
  for (const c of [...state.cities].sort((a, b) => a.id - b.id)) {
    const res = processCity(state, c, events, contexts.get(c.owner)!);
    const inc = income.get(c.owner) ?? { research: 0, gold: 0 };
    inc.research += res.research;
    inc.gold += res.gold;
    income.set(c.owner, inc);
    // Kaserne: neue Kampfeinheiten starten mit Erfahrung für eine Beförderung.
    const doctrineXp = state.players[c.owner].doctrines.reduce((s, d) => s + (DOCTRINES[d].effects.xp ?? 0), 0);
    const xp = (c.buildings.includes(BuildingId.Barracks) ? xpForNext(0) : 0) + doctrineXp;
    for (const type of res.newUnits) addUnit(state, c.owner, type, c.tile, UNIT_TYPES[type].strength > 0 ? xp : 0);
    radiusChanged ||= res.radiusChanged;
    if (res.wonder !== undefined) {
      // Weltwunder: Auftrag bei allen anderen Städten entfernen.
      for (const other of state.cities) {
        if (other === c) continue;
        const before = other.queue.length;
        other.queue = other.queue.filter((q) => !(q.kind === 'building' && q.id === res.wonder));
        if (other.queue.length !== before) {
          events.push({ player: other.owner, text: `${other.name}: ${BUILDINGS[res.wonder].name} wurde anderswo vollendet`, tile: other.tile, city: other.id });
        }
      }
    }
  }
  if (radiusChanged) {
    recomputeOwnership(state);
    for (const c of state.cities) assignTiles(state, c);
  }
  for (const p of state.players) {
    const e = economy(state, p.id, income.get(p.id) ?? { research: 0, gold: 0 });
    let research = e.research;
    p.gold += e.net;
    if (p.gold < 0) {
      // Fehlbetrag wird aus der Forschung dieser Runde gedeckt.
      const cover = Math.min(-p.gold, research);
      research -= cover;
      p.gold += cover;
      if (p.gold < 0) {
        p.gold = 0;
        events.push({ player: p.id, text: 'Die Staatskasse ist leer – Unterhalt kann nicht bezahlt werden', tile: -1 });
      }
    }
    p.research += research;
    advanceResearch(state, p.id, events);
  }
}

/** Fortschritt in Technologien umsetzen (auch mehrere pro Runde, wenn genug angespart ist). */
function advanceResearch(state: GameState, player: number, events: TurnEvent[]): void {
  const p = state.players[player];
  for (let guard = 0; guard < 10; guard++) {
    const tech = currentResearch(state, player);
    if (tech < 0 || !canResearch(p.techs, tech) || p.research < techCost(tech)) break;
    p.research -= techCost(tech);
    p.techs[tech] = 1;
    events.push({ player, text: `Erforscht: ${TECHS[tech].name}`, tile: -1 });
    if (p.goal === tech) {
      p.goal = -1;
      events.push({ player, text: 'Forschungsziel erreicht – wähle ein neues (T)', tile: -1 });
    }
  }
  if (p.goal < 0 && state.cities.some((c) => c.owner === player) && TECHS.some((_, id) => canResearch(p.techs, id))) {
    if (!events.some((e) => e.player === player && e.text.startsWith('Forschungsziel'))) {
      events.push({ player, text: 'Keine Forschung gewählt – Fortschritt wird angespart (T)', tile: -1 });
    }
  }
}

/** Eigene Einheiten, die noch einen Befehl brauchen. */
export function readyUnits(state: GameState, player: number): Unit[] {
  return state.units.filter((u) => u.owner === player && u.moves > 0 && u.orders === Orders.None);
}
