import { type TurnEvent } from './city';
import { predictCombat } from './combat';
import { addUnit, type GameState, type MoveEvent, Orders, refreshVision, type Unit } from './game';
import { forEachNeighbor, tileDistance, tilesAround } from './hex';
import { findPath, landCost, stepCost } from './path';
import { Feature, isWater, Relief } from './rules/terrain';
import { MOVE_SCALE, UNIT_TYPES, UnitTypeId } from './rules/units';
import { attackBlocker, type CombatEvent, cityDefenseAt, fighterOf, performAttack } from './war';

/**
 * Plünderer: neutrale Fraktion, die ab Runde 15 Lager in unbewohnten, unbeobachteten Gegenden errichtet.
 * Lager bringen regelmäßig Einheiten hervor, die nahe Ziele angreifen. Ein ausgehobenes Lager bringt Gold.
 */
export interface Camp {
  tile: number;
  timer: number;
}

export const BARB_START_TURN = 15;
const CAMP_EVERY = 4;
const SPAWN_EVERY = 7;
const MAX_UNITS_PER_CAMP = 3;
const AGGRO_RANGE = 7;
/** Plünderer greifen an, wenn sie im Schnitt mindestens so viel Schaden austeilen wie einstecken (× Faktor). */
const TRADE_FACTOR = 0.9;
const UNITS_PER_CAMP_TOTAL = 3;

function campLimit(state: GameState): number {
  let land = 0;
  for (let i = 0; i < state.map.terrain.length; i++) if (!isWater(state.map.terrain[i])) land++;
  return Math.max(2, Math.floor(land / 160));
}

/** Einheitentyp je nach Spielfortschritt. */
function spawnType(state: GameState): number {
  const r = state.rng.next();
  if (state.turn < 50) return r < 0.75 ? UnitTypeId.Warrior : UnitTypeId.Archer;
  if (state.turn < 100) return r < 0.4 ? UnitTypeId.Spearman : r < 0.7 ? UnitTypeId.Archer : UnitTypeId.Horseman;
  return r < 0.5 ? UnitTypeId.Swordsman : r < 0.75 ? UnitTypeId.Horseman : UnitTypeId.Archer;
}

function trySpawnCamp(state: GameState): void {
  if (state.camps.length >= campLimit(state)) return;
  const m = state.map;
  const n = m.width * m.height;
  const civs = state.players.filter((p) => !p.barbarian);
  for (let attempt = 0; attempt < 40; attempt++) {
    const t = state.rng.int(n);
    if (isWater(m.terrain[t]) || m.relief[t] === Relief.Mountain || m.feature[t] === Feature.Ice) continue;
    if (state.tileOwner[t] >= 0) continue;
    if (civs.some((p) => p.visible[t])) continue;
    if (state.cities.some((c) => tileDistance(m, c.tile, t) < 5)) continue;
    if (state.units.some((u) => tileDistance(m, u.tile, t) < 4)) continue;
    if (state.camps.some((c) => tileDistance(m, c.tile, t) < 6)) continue;
    state.camps.push({ tile: t, timer: SPAWN_EVERY - 2 });
    // Jedes Lager hat einen Wächter.
    const guard = addUnit(state, state.barbarian, UnitTypeId.Warrior, t);
    guard.orders = Orders.Fortify;
    return;
  }
}

function spawnFromCamps(state: GameState): void {
  const m = state.map;
  const total = state.units.filter((u) => u.owner === state.barbarian).length;
  if (total >= state.camps.length * UNITS_PER_CAMP_TOTAL + 1) return;
  for (const camp of state.camps) {
    camp.timer++;
    if (camp.timer < SPAWN_EVERY) continue;
    const near = state.units.filter((u) => u.owner === state.barbarian && tileDistance(m, u.tile, camp.tile) <= 4).length;
    if (near >= MAX_UNITS_PER_CAMP) continue;
    camp.timer = 0;
    const free: number[] = [];
    // Nicht in fremde Städte oder auf fremde Einheiten setzen (auch nicht aufs Lager selbst).
    const blocked = (t: number) => state.units.some((u) => u.tile === t && u.owner !== state.barbarian) ||
      state.cities.some((c) => c.tile === t && c.owner !== state.barbarian);
    forEachNeighbor(m, camp.tile, (nb) => {
      if (!isWater(m.terrain[nb]) && m.relief[nb] !== Relief.Mountain && !blocked(nb)) free.push(nb);
    });
    if (!free.length && blocked(camp.tile)) continue;
    const tile = free.length ? free[state.rng.int(free.length)] : camp.tile;
    addUnit(state, state.barbarian, spawnType(state), tile);
  }
}

/** Ziele in Reichweite: fremde Einheiten und Städte. */
function targetsNear(state: GameState, u: Unit): number[] {
  const out = new Set<number>();
  for (const o of state.units) if (o.owner !== u.owner && tileDistance(state.map, u.tile, o.tile) <= AGGRO_RANGE) out.add(o.tile);
  for (const c of state.cities) if (c.owner !== u.owner && tileDistance(state.map, u.tile, c.tile) <= AGGRO_RANGE) out.add(c.tile);
  return [...out];
}

/**
 * Lohnt sich der Angriff? Zivilisten und leere Städte immer; sonst gegen den stärksten Verteidiger,
 * wenn der Schadenstausch günstig ist (Plünderer sind draufgängerisch, aber nicht selbstmörderisch).
 */
function worthAttacking(state: GameState, u: Unit, target: number): boolean {
  const defenders = state.units.filter((o) => o.tile === target && o.owner !== u.owner && UNIT_TYPES[o.type].strength > 0);
  if (!defenders.length) return true;
  const bf = { map: state.map, attackerTile: u.tile, defenderTile: target, cityDefense: cityDefenseAt(state, target) };
  const ranged = UNIT_TYPES[u.type].ranged > 0;
  const att = fighterOf(u);
  return defenders.every((d) => {
    const p = predictCombat(att, fighterOf(d), bf, ranged);
    const dealt = (p.dmgDef[0] + p.dmgDef[1]) / 2;
    const taken = (p.dmgAtt[0] + p.dmgAtt[1]) / 2;
    return p.win >= 0.35 || (p.loss < 0.2 && dealt >= taken * TRADE_FACTOR);
  });
}

function act(state: GameState, u: Unit, events: TurnEvent[], combats: CombatEvent[], moves: MoveEvent[]): void {
  if (u.orders === Orders.Fortify && state.camps.some((c) => c.tile === u.tile)) return; // Lagerwache
  const targets = targetsNear(state, u).sort((a, b) => tileDistance(state.map, u.tile, a) - tileDistance(state.map, u.tile, b));
  // 1. Direkt angreifen, wenn möglich und lohnend
  for (const t of targets) {
    if (attackBlocker(state, u, t) === null && worthAttacking(state, u, t)) {
      combats.push(performAttack(state, u, t, events));
      return;
    }
  }
  // 2. Auf das nächste lohnende Ziel zugehen
  const m = state.map;
  const occupied = new Set<number>();
  for (const o of state.units) if (o.owner !== u.owner) occupied.add(o.tile);
  for (const c of state.cities) occupied.add(c.tile);
  const goal = targets.find((t) => worthAttacking(state, u, t));
  const steps = [u.tile];
  if (goal !== undefined) {
    const path = findPath({
      map: m, from: u.tile, to: goal, maxMoves: UNIT_TYPES[u.type].moves * MOVE_SCALE, movesLeft: u.moves,
      cost: landCost(m, () => true, (i) => i !== goal && occupied.has(i)), limit: 3000,
    });
    if (path) {
      for (const next of path.tiles) {
        if (next === goal || u.moves <= 0) break;
        u.moves = Math.max(0, u.moves - stepCost(m, u.tile, next, MOVE_SCALE / 3));
        u.tile = next;
        u.acted = true;
        steps.push(next);
      }
      if (u.moves > 0 && attackBlocker(state, u, goal) === null) {
        if (steps.length > 1) moves.push({ unit: u.id, owner: u.owner, steps });
        combats.push(performAttack(state, u, goal, events));
        return;
      }
    }
  } else if (state.rng.next() < 0.5) {
    // 3. Umherstreifen in der Nähe
    const options = tilesAround(m, u.tile, 1).filter(
      (t) => t !== u.tile && !isWater(m.terrain[t]) && m.relief[t] !== Relief.Mountain && !occupied.has(t),
    );
    if (options.length) {
      u.tile = options[state.rng.int(options.length)];
      u.acted = true;
      steps.push(u.tile);
    }
  }
  if (steps.length > 1) moves.push({ unit: u.id, owner: u.owner, steps });
}

export function barbarianTurn(state: GameState, events: TurnEvent[], combats: CombatEvent[], moves: MoveEvent[]): void {
  if (state.turn < BARB_START_TURN) return;
  refreshVision(state, state.barbarian);
  if (state.turn % CAMP_EVERY === 0) trySpawnCamp(state);
  spawnFromCamps(state);
  for (const u of state.units.filter((x) => x.owner === state.barbarian)) {
    if (!state.units.includes(u)) continue; // inzwischen gefallen
    act(state, u, events, combats, moves);
  }
  refreshVision(state, state.barbarian);
}
