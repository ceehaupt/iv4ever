import { assignTiles, type City, cityAt, recomputeOwnership, type TurnEvent } from './city';
import { type Battlefield, bestDefender, type Fighter, resolveCombat } from './combat';
import { cargoOf, CommandError, type GameState, Orders, refreshVision, type Unit } from './game';
import { tileDistance } from './hex';
import { isWater } from './rules/terrain';
import { cutWarRoutes, isHostile, relation } from './diplomacy';
import { BUILDINGS, BuildingId } from './rules/buildings';
import { PROMOTIONS, UNIT_TYPES, UnitTypeId } from './rules/units';

/** Gold für das Ausheben eines Plündererlagers. */
export const CAMP_REWARD = 25;
export const XP_WIN = 3;
export const XP_RANGED = 1;
export const XP_SURVIVE = 2;
const HEAL_FIELD = 10;
const HEAL_TERRITORY = 15;
const HEAL_CITY = 25;
/** Zusatzheilung je Beförderung (Feldscher). */
const PROMO_HEAL = PROMOTIONS.map((p) => p.heal ?? 0);

export interface CombatEvent {
  attacker: number;
  attackerOwner: number;
  attackerType: number;
  defender: number | null;
  defenderOwner: number;
  defenderType: number | null;
  from: number;
  tile: number;
  ranged: boolean;
  dmgAtt: number;
  dmgDef: number;
  attackerDied: boolean;
  defenderDied: boolean;
  capturedCity?: string;
  destroyedCamp?: boolean;
  capturedUnits?: number;
}

export function fighterOf(u: Unit): Fighter {
  return { type: u.type, hp: u.hp, promotions: u.promotions, fortified: u.orders === Orders.Fortify };
}

/** Verteidigungsbonus einer Stadt in % (Gebäude + Wunder des Besitzers), null = keine Stadt. */
export function cityDefenseAt(state: GameState, tile: number): number | null {
  const c = cityAt(state, tile);
  if (!c) return null;
  let pct = 0;
  for (const b of c.buildings) pct += BUILDINGS[b].defense;
  for (const other of state.cities) {
    if (other.owner !== c.owner) continue;
    for (const b of other.buildings) pct += BUILDINGS[b].all?.defense ?? 0;
  }
  return pct;
}

function playerName(state: GameState, id: number): string {
  const p = state.players[id];
  return p.barbarian ? 'Plünderer' : p.human ? 'Du' : p.name;
}

/**
 * Fremde Einheiten auf dem Zielfeld, die gegen diesen Angreifer verteidigen bzw. angegriffen werden können:
 * nur dieselbe Sphäre (Land/See), keine Flugzeuge am Boden. Verladene Einheiten zählen nur im Hafen
 * (Landfeld = Stadt) – auf See verteidigt das Schiff für seine Ladung.
 */
export function defendersAt(state: GameState, target: number, attacker: Unit): Unit[] {
  const naval = !!UNIT_TYPES[attacker.type].naval;
  const atSea = isWater(state.map.terrain[target]);
  return state.units.filter((o) => o.tile === target && o.owner !== attacker.owner && !!UNIT_TYPES[o.type].naval === naval &&
    !UNIT_TYPES[o.type].air && (!o.carriedBy || !atSea));
}

/** Grund, warum die Einheit dieses Ziel nicht angreifen kann – oder null. */
export function attackBlocker(state: GameState, u: Unit, target: number): string | null {
  const t = UNIT_TYPES[u.type];
  if (t.strength <= 0 && t.ranged <= 0) return 'Diese Einheit kann nicht angreifen';
  if (u.moves <= 0) return 'Keine Bewegung mehr übrig';
  if (!state.players[u.owner].visible[target]) return 'Ziel ist nicht sichtbar';
  if (u.carriedBy) return 'Von Bord aus kann nicht angegriffen werden';
  if (t.air) return 'Flugzeuge fliegen Luftangriffe (Rechtsklick auf das Ziel)';
  const dist = tileDistance(state.map, u.tile, target);
  const water = isWater(state.map.terrain[target]);
  if (t.naval && !water) return 'Schiffe greifen nur Schiffe auf See an';
  if (!t.naval && water) return 'Schiffe auf See können nur Schiffe angreifen';
  // Flugzeuge am Boden verteidigen nicht und sind kein Ziel für Boden-/Seeangriffe.
  const enemies = defendersAt(state, target, u);
  const city = cityAt(state, target);
  const enemyCity = city && city.owner !== u.owner ? city : null;
  const camp = state.camps.some((c) => c.tile === target);
  if (!enemies.length && !enemyCity && !camp) return 'Kein Gegner auf diesem Feld';
  const owners = new Set([...enemies.map((o) => o.owner), ...(enemyCity ? [enemyCity.owner] : [])]);
  for (const o of owners) {
    if (!isHostile(state, u.owner, o)) {
      return relation(state, u.owner, o).met ? `Kein Krieg mit ${state.players[o].name} – erst Krieg erklären` : 'Unbekannte Zivilisation';
    }
  }
  if (t.ranged > 0) {
    if (dist < 1 || dist > t.range) return `Außer Reichweite (${t.range} Felder)`;
    if (!enemies.some((o) => UNIT_TYPES[o.type].strength > 0)) return 'Kein Ziel für Fernkampf – Nahkämpfer nötig';
    return null;
  }
  if (dist !== 1) return 'Nur benachbarte Felder angreifen';
  return null;
}

/** Angriff ausführen. Voraussetzung: attackBlocker(...) === null. */
export function performAttack(state: GameState, u: Unit, target: number, events: TurnEvent[]): CombatEvent {
  const blocker = attackBlocker(state, u, target);
  if (blocker) throw new CommandError(blocker);
  const t = UNIT_TYPES[u.type];
  const ranged = t.ranged > 0;
  const bf: Battlefield = { map: state.map, attackerTile: u.tile, defenderTile: target, cityDefense: cityDefenseAt(state, target) };
  const enemies = defendersAt(state, target, u);
  const att = fighterOf(u);
  const k = bestDefender(enemies.map(fighterOf), att, bf, ranged);
  const city = cityAt(state, target);
  const ev: CombatEvent = {
    attacker: u.id,
    attackerOwner: u.owner,
    attackerType: u.type,
    defender: null,
    defenderOwner: k >= 0 ? enemies[k].owner : city ? city.owner : state.barbarian,
    defenderType: null,
    from: u.tile,
    tile: target,
    ranged,
    dmgAtt: 0,
    dmgDef: 0,
    attackerDied: false,
    defenderDied: false,
  };
  u.moves = 0;
  u.acted = true;
  u.orders = Orders.None;
  u.path = null;
  u.job = null;

  let tileCleared = k < 0;
  if (k >= 0) {
    const d = enemies[k];
    ev.defender = d.id;
    ev.defenderType = d.type;
    const o = resolveCombat(att, fighterOf(d), bf, ranged, state.rng);
    ev.dmgAtt = o.dmgAtt;
    ev.dmgDef = o.dmgDef;
    u.hp -= o.dmgAtt;
    d.hp -= o.dmgDef;
    d.acted = true;
    ev.attackerDied = o.attackerDies;
    ev.defenderDied = o.defenderDies;
    const an = UNIT_TYPES[u.type].name;
    const dn = UNIT_TYPES[d.type].name;
    if (o.defenderDies) {
      // Ein versenktes Schiff reißt seine Ladung mit.
      state.units = state.units.filter((x) => x !== d && x.carriedBy !== d.id);
      u.xp += ranged ? XP_RANGED + 1 : XP_WIN;
    } else {
      d.xp += XP_SURVIVE;
      if (ranged) u.xp += XP_RANGED;
    }
    if (o.attackerDies) {
      state.units = state.units.filter((x) => x !== u && x.carriedBy !== u.id);
      d.xp += XP_WIN;
    }
    const verdict = o.defenderDies ? `${dn} besiegt` : o.attackerDies ? `${an} gefallen` : `${dn} −${o.dmgDef} LP`;
    const text = `${playerName(state, u.owner)} (${an}) greift ${playerName(state, d.owner)} (${dn}) an: ${verdict}`;
    for (const p of new Set([u.owner, d.owner])) events.push({ player: p, text, tile: target });
    // Frei ist das Feld, wenn kein weiterer Verteidiger nach denselben Regeln wie oben übrig ist.
    tileCleared = !ranged && o.defenderDies && !o.attackerDies &&
      !defendersAt(state, target, u).some((x) => UNIT_TYPES[x.type].strength > 0);
  }

  if (tileCleared && !ranged) {
    occupyTile(state, u, target, ev, events);
  }
  refreshVision(state, u.owner);
  if (ev.defenderOwner >= 0) refreshVision(state, ev.defenderOwner);
  return ev;
}

/** Lager auf dem Feld ausheben (Belohnung, außer für Plünderer selbst). true, wenn eines dort stand. */
export function razeCamp(state: GameState, owner: number, tile: number, events: TurnEvent[]): boolean {
  const idx = state.camps.findIndex((c) => c.tile === tile);
  if (idx < 0) return false;
  state.camps.splice(idx, 1);
  if (!state.players[owner].barbarian) {
    state.players[owner].gold += CAMP_REWARD;
    events.push({ player: owner, text: `Plündererlager ausgehoben: +${CAMP_REWARD} Gold`, tile });
  }
  return true;
}

/** Feld ohne Verteidiger einnehmen: Zivilisten fangen, Stadt erobern, Lager ausheben, hineinziehen. */
function occupyTile(state: GameState, u: Unit, target: number, ev: CombatEvent, events: TurnEvent[]): void {
  const barb = state.players[u.owner].barbarian;
  const civilians = state.units.filter((x) => x.tile === target && x.owner !== u.owner);
  for (const c of civilians) {
    if (barb || UNIT_TYPES[c.type].naval || UNIT_TYPES[c.type].air) {
      // Plünderer machen keine Gefangenen; Schiffe und Flugzeuge in einer eroberten Stadt sind verloren.
      state.units = state.units.filter((x) => x !== c);
    } else {
      c.owner = u.owner;
      c.carriedBy = null; // das Schiff im Hafen geht verloren (s. o.)
      if (c.type === UnitTypeId.Settler) c.type = UnitTypeId.Worker;
      c.orders = Orders.None;
      c.path = null;
      c.job = null;
      c.moves = 0;
    }
  }
  if (civilians.length) ev.capturedUnits = civilians.length;
  if (razeCamp(state, u.owner, target, events)) ev.destroyedCamp = true;
  u.tile = target;
  // Ein nachrückendes Schiff nimmt seine Ladung mit.
  for (const c of cargoOf(state, u)) c.tile = target;
  const city = cityAt(state, target);
  if (city && city.owner !== u.owner) {
    ev.capturedCity = city.name;
    captureCity(state, city, u.owner, events);
  }
}

/** Stadt wechselt den Besitzer: −1 Größe, Bauliste leer, Palast zieht in die älteste verbleibende Stadt. */
export function captureCity(state: GameState, city: City, newOwner: number, events: TurnEvent[]): void {
  const old = city.owner;
  city.owner = newOwner;
  state.players[newOwner].foundedCity = true;
  city.size = Math.max(1, city.size - 1);
  city.queue = [];
  city.prodStored = 0;
  city.locked = [];
  const hadPalace = city.buildings.includes(BuildingId.Palace);
  city.buildings = city.buildings.filter((b) => b !== BuildingId.Palace);
  if (hadPalace) {
    const next = state.cities.filter((c) => c.owner === old).sort((a, b) => a.id - b.id)[0];
    if (next) next.buildings.push(BuildingId.Palace);
  }
  const text = `${playerName(state, newOwner)} erobert ${city.name}`;
  for (const p of new Set([old, newOwner])) events.push({ player: p, text, tile: city.tile, city: city.id });
  recomputeOwnership(state);
  for (const c of state.cities) assignTiles(state, c);
  for (const p of [old, newOwner]) refreshVision(state, p);
  cutWarRoutes(state, events);
  checkEliminations(state, events);
}

/**
 * Völker ohne Stadt scheiden aus (Spieloption elimination = 'cities', Standard). Vor der ersten Gründung zählt
 * ein Siedler als Stadt in spe. Mit 'units' scheidet ein Volk erst aus, wenn es weder Städte noch Einheiten hat.
 * Restliche Einheiten und offene Angebote des Ausgeschiedenen verschwinden.
 */
export function checkEliminations(state: GameState, events: TurnEvent[]): void {
  const untilLastUnit = state.options.elimination === 'units';
  for (const p of state.players) {
    if (p.barbarian || !p.alive || state.cities.some((c) => c.owner === p.id)) continue;
    if (untilLastUnit && state.units.some((x) => x.owner === p.id)) continue;
    if (!p.foundedCity && state.units.some((x) => x.owner === p.id && x.type === UnitTypeId.Settler)) continue;
    p.alive = false;
    state.units = state.units.filter((x) => x.owner !== p.id);
    state.diplomacy.pending = state.diplomacy.pending.filter((x) => x.from !== p.id && x.to !== p.id);
    for (const o of state.players) events.push({ player: o.id, text: `${p.name} wurde vernichtet`, tile: -1 });
  }
}

/** Heilung am Rundenbeginn für Einheiten, die in der letzten Runde nicht gekämpft oder sich bewegt haben. */
export function healUnits(state: GameState): void {
  const medic = new Map<string, number>();
  for (const u of state.units) {
    for (const p of u.promotions) {
      const h = PROMO_HEAL[p];
      if (h) {
        const key = `${u.owner}:${u.tile}`;
        medic.set(key, Math.max(medic.get(key) ?? 0, h));
      }
    }
  }
  for (const u of state.units) {
    if (!u.acted && u.hp < 100) {
      const city = cityAt(state, u.tile);
      const base = city && city.owner === u.owner ? HEAL_CITY : state.tileOwner[u.tile] === u.owner ? HEAL_TERRITORY : HEAL_FIELD;
      u.hp = Math.min(100, u.hp + base + (medic.get(`${u.owner}:${u.tile}`) ?? 0));
    }
    u.acted = false;
  }
}
