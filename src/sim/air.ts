// Luftfahrt (eigener Entwurf, siehe docs/REGELN.md):
// - Flugzeuge stehen in einer eigenen Stadt oder auf einem eigenen Flugzeugträger; sie ziehen nicht über die Karte.
// - Je Runde ein Einsatz: Luftangriff auf ein Ziel im Einsatzradius oder Verlegen (bis doppelter Radius).
// - Vor jedem Luftangriff fangen feindliche Jagdflugzeuge (Radius) und Flugabwehr (Umkreis) ab – je einmal pro Runde.
// - Flugzeuge verteidigen keine Felder; in eroberten Städten bzw. mit versenkten Trägern gehen sie verloren.
import { cityAt, type TurnEvent } from './city';
import { type Battlefield, bestDefender, resolveAirDuel, resolveCombat } from './combat';
import { cargoOf, CommandError, type GameState, Orders, refreshVision, type Unit } from './game';
import { tileDistance } from './hex';
import { isHostile, relation } from './diplomacy';
import { isWater } from './rules/terrain';
import { isAir, UNIT_TYPES } from './rules/units';
import { type CombatEvent, cityDefenseAt, fighterOf, XP_RANGED, XP_SURVIVE } from './war';

/** Einheiten, die am Boden bzw. auf See kämpfen (Flugzeuge verteidigen keine Felder). */
export const isSurfaceFighter = (u: Unit) => UNIT_TYPES[u.type].strength > 0 && !isAir(u.type);

/** Ziele eines Luftangriffs: kämpfende Einheiten; auf See nur das Schiff, nicht seine Ladung (wie im Bodenkampf). */
function airTargets(state: GameState, u: Unit, target: number): Unit[] {
  const atSea = isWater(state.map.terrain[target]);
  return state.units.filter((o) => o.tile === target && o.owner !== u.owner && isSurfaceFighter(o) && !(atSea && o.carriedBy));
}

/** Freie Flugzeug-Stellplätze eines Trägers. */
export function airSlots(state: GameState, carrier: Unit): number {
  return (UNIT_TYPES[carrier.type].airCargo ?? 0) - cargoOf(state, carrier).filter((c) => isAir(c.type)).length;
}

/** Grund, warum dieser Luftangriff nicht geht – oder null. */
export function airStrikeBlocker(state: GameState, u: Unit, target: number): string | null {
  const t = UNIT_TYPES[u.type];
  if (!t.air) return 'Nur Flugzeuge fliegen Luftangriffe';
  if (u.moves <= 0) return 'Dieses Flugzeug war in dieser Runde schon im Einsatz';
  if (!state.players[u.owner].visible[target]) return 'Ziel ist nicht sichtbar';
  if (tileDistance(state.map, u.tile, target) > t.range) return `Außer Reichweite (Einsatzradius ${t.range} Felder)`;
  const enemies = airTargets(state, u, target);
  if (!enemies.length) return 'Kein Ziel – Luftangriffe treffen Einheiten (auch in Städten und auf See)';
  for (const o of new Set(enemies.map((e) => e.owner))) {
    if (!isHostile(state, u.owner, o)) {
      return relation(state, u.owner, o).met ? `Kein Krieg mit ${state.players[o].name} – erst Krieg erklären` : 'Unbekannte Zivilisation';
    }
  }
  return null;
}

/** Abfangen: feindliche Jäger im Radius und Flugabwehr im Umkreis des Ziels, je einmal pro Runde. */
function intercept(state: GameState, u: Unit, target: number, events: TurnEvent[], combats: CombatEvent[]): boolean {
  const hostile = (o: Unit) => o.owner !== u.owner && isHostile(state, u.owner, o.owner);
  const defenders = state.units.filter((o) => hostile(o) && o.interceptedTurn !== state.turn && (
    (UNIT_TYPES[o.type].interceptor && tileDistance(state.map, o.tile, target) <= UNIT_TYPES[o.type].range) ||
    (UNIT_TYPES[o.type].antiAir && !o.carriedBy && tileDistance(state.map, o.tile, target) <= UNIT_TYPES[o.type].antiAir!)
  ));
  // Stärkste Abwehr zuerst; Jäger vor Flugabwehr.
  defenders.sort((a, b) => Number(!!UNIT_TYPES[b.type].interceptor) - Number(!!UNIT_TYPES[a.type].interceptor) || b.hp - a.hp || a.id - b.id);
  for (const d of defenders) {
    if (!state.units.includes(d) || d.hp <= 0) continue;
    d.interceptedTurn = state.turn;
    const jet = !!UNIT_TYPES[d.type].interceptor;
    // Abfangjäger: Luftkampf (beide nehmen Schaden). Flugabwehr: schießt nur.
    const o = resolveAirDuel(fighterOf(d), fighterOf(u), !jet, state.rng);
    d.hp -= o.dmgAtt;
    u.hp -= o.dmgDef;
    const name = UNIT_TYPES[d.type].name;
    combats.push({
      attacker: d.id, attackerOwner: d.owner, attackerType: d.type, defender: u.id, defenderOwner: u.owner, defenderType: u.type,
      from: d.tile, tile: u.tile, ranged: !jet, dmgAtt: o.dmgAtt, dmgDef: o.dmgDef, attackerDied: o.attackerDies, defenderDied: o.defenderDies,
    });
    if (o.attackerDies) state.units = state.units.filter((x) => x !== d);
    if (o.defenderDies) {
      state.units = state.units.filter((x) => x !== u);
      for (const p of [u.owner, d.owner]) events.push({ player: p, text: `${name} schießt ${UNIT_TYPES[u.type].name} ab`, tile: target });
      return false;
    }
    for (const p of [u.owner, d.owner]) events.push({ player: p, text: `${name} fängt ${UNIT_TYPES[u.type].name} ab (−${o.dmgDef} LP)`, tile: target });
  }
  return true;
}

/** Luftangriff ausführen (inklusive Abfangen). */
export function airStrike(state: GameState, u: Unit, target: number, events: TurnEvent[]): CombatEvent[] {
  const blocker = airStrikeBlocker(state, u, target);
  if (blocker) throw new CommandError(blocker);
  u.moves = 0;
  u.acted = true;
  u.orders = Orders.None;
  const combats: CombatEvent[] = [];
  if (!intercept(state, u, target, events, combats)) return combats;
  const bf: Battlefield = { map: state.map, attackerTile: u.tile, defenderTile: target, cityDefense: cityDefenseAt(state, target) };
  const enemies = airTargets(state, u, target);
  const att = fighterOf(u);
  const k = bestDefender(enemies.map(fighterOf), att, bf, true);
  if (k < 0) return combats;
  const d = enemies[k];
  const o = resolveCombat(att, fighterOf(d), bf, true, state.rng);
  d.hp -= o.dmgDef;
  d.acted = true;
  u.xp += XP_RANGED;
  if (!o.defenderDies) d.xp += XP_SURVIVE;
  combats.push({
    attacker: u.id, attackerOwner: u.owner, attackerType: u.type, defender: d.id, defenderOwner: d.owner, defenderType: d.type,
    from: u.tile, tile: target, ranged: true, dmgAtt: 0, dmgDef: o.dmgDef, attackerDied: false, defenderDied: o.defenderDies,
  });
  const an = UNIT_TYPES[u.type].name;
  const dn = UNIT_TYPES[d.type].name;
  if (o.defenderDies) {
    // Versenkte Schiffe nehmen ihre Ladung (auch Flugzeuge) mit.
    state.units = state.units.filter((x) => x !== d && x.carriedBy !== d.id);
    u.xp += XP_RANGED;
    for (const p of [u.owner, d.owner]) events.push({ player: p, text: `${an} zerstört ${dn}`, tile: target });
  } else {
    for (const p of [u.owner, d.owner]) events.push({ player: p, text: `${an} trifft ${dn} (−${o.dmgDef} LP)`, tile: target });
  }
  refreshVision(state, u.owner);
  return combats;
}

/** Grund, warum das Flugzeug nicht dorthin verlegen kann – oder null. */
export function rebaseBlocker(state: GameState, u: Unit, target: number): string | null {
  const t = UNIT_TYPES[u.type];
  if (!t.air) return 'Nur Flugzeuge werden verlegt';
  if (u.moves <= 0) return 'Dieses Flugzeug war in dieser Runde schon im Einsatz';
  if (target === u.tile) return 'Das Flugzeug steht schon dort';
  if (tileDistance(state.map, u.tile, target) > t.range * 2) return `Zu weit (Verlegen bis ${t.range * 2} Felder)`;
  const city = cityAt(state, target);
  if (city?.owner === u.owner) return null;
  const carrier = state.units.find((o) => o.tile === target && o.owner === u.owner && (UNIT_TYPES[o.type].airCargo ?? 0) > 0 && airSlots(state, o) > 0);
  return carrier ? null : 'Ziel muss eine eigene Stadt oder ein eigener Flugzeugträger mit freiem Platz sein';
}

export function rebase(state: GameState, u: Unit, target: number): void {
  const blocker = rebaseBlocker(state, u, target);
  if (blocker) throw new CommandError(blocker);
  const city = cityAt(state, target);
  const carrier = city?.owner === u.owner ? undefined
    : state.units.find((o) => o.tile === target && o.owner === u.owner && (UNIT_TYPES[o.type].airCargo ?? 0) > 0 && airSlots(state, o) > 0);
  u.tile = target;
  u.carriedBy = carrier ? carrier.id : null;
  u.moves = 0;
  u.acted = true;
  u.orders = Orders.None;
  u.path = null;
  refreshVision(state, u.owner);
}
