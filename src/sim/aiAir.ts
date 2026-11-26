// Luftwaffe der Computerspieler: Bomber greifen lohnende Ziele an (Abfanggefahr eingerechnet) und verlegen zur Front,
// Jäger schützen vorrangig die eigenen Städte. Zustandslos je Runde geplant.
import { airStrikeBlocker, isSurfaceFighter } from './air';
import { type Out, run } from './aiCommon';
import { cityAt } from './city';
import { predictCombat } from './combat';
import { isHostile } from './diplomacy';
import type { GameState, Player, Unit } from './game';
import { tileDistance } from './hex';
import { UNIT_TYPES } from './rules/units';
import { cityDefenseAt, fighterOf } from './war';

/** Feindliche Abwehr gegen einen Luftangriff auf `target`: Jäger im Radius plus Flugabwehr im Umkreis. */
export function airDefenseAt(state: GameState, pid: number, target: number): number {
  let threat = 0;
  for (const o of state.units) {
    if (o.owner === pid || !isHostile(state, pid, o.owner)) continue;
    const t = UNIT_TYPES[o.type];
    const d = tileDistance(state.map, o.tile, target);
    if (t.interceptor && d <= t.range) threat += t.strength * (o.hp / 100);
    else if (t.antiAir && !o.carriedBy && d <= t.antiAir) threat += t.strength * 0.7 * (o.hp / 100);
  }
  return threat;
}

/** Wert eines Luftangriffs: erwarteter Schaden, Bonus für Abschüsse und Ziele in Städten, Abzug für Abwehr. */
function strikeValue(state: GameState, u: Unit, target: number): number {
  const enemies = state.units.filter((o) => o.tile === target && o.owner !== u.owner && isSurfaceFighter(o));
  if (!enemies.length) return -Infinity;
  const bf = { map: state.map, attackerTile: u.tile, defenderTile: target, cityDefense: cityDefenseAt(state, target) };
  let best = -Infinity;
  for (const d of enemies) {
    const pr = predictCombat(fighterOf(u), fighterOf(d), bf, true);
    const dmg = (pr.dmgDef[0] + pr.dmgDef[1]) / 2;
    best = Math.max(best, dmg + pr.win * 40 + (cityAt(state, target) ? 10 : 0));
  }
  const risk = airDefenseAt(state, u.owner, target) / Math.max(1, UNIT_TYPES[u.type].strength * (u.hp / 100));
  return best - risk * 25;
}

/** Ziel eines Bombers im Einsatzradius (oder -1). */
function bestStrike(state: GameState, u: Unit, minValue: number): number {
  const p = state.players[u.owner];
  const range = UNIT_TYPES[u.type].range;
  let best = -1;
  let bestV = minValue;
  const seen = new Set<number>();
  for (const o of state.units) {
    if (o.owner === u.owner || seen.has(o.tile) || !p.visible[o.tile]) continue;
    if (tileDistance(state.map, u.tile, o.tile) > range || !isHostile(state, u.owner, o.owner)) continue;
    seen.add(o.tile);
    if (airStrikeBlocker(state, u, o.tile)) continue;
    const v = strikeValue(state, u, o.tile);
    if (v > bestV) {
      bestV = v;
      best = o.tile;
    }
  }
  return best;
}

/** Luftzug eines Computerspielers. `front` = Zielfeld eines Feldzugs (oder -1). */
export function airTurn(state: GameState, p: Player, out: Out, front: number): void {
  const planes = state.units.filter((u) => u.owner === p.id && UNIT_TYPES[u.type].air);
  for (const u of planes) {
    if (!state.units.includes(u) || u.moves <= 0) continue;
    const t = UNIT_TYPES[u.type];
    // Jäger greifen nur ohne Abfanggefahr an und bleiben sonst zur Abwehr.
    const target = bestStrike(state, u, t.interceptor ? 25 : 12);
    if (target >= 0 && (!t.interceptor || airDefenseAt(state, p.id, target) === 0)) {
      run(state, p.id, { type: 'airStrike', unit: u.id, target }, out);
      continue;
    }
    if (t.interceptor || front < 0) continue;
    // Bomber ohne Ziel: in die eigene Stadt verlegen, die der Front am nächsten liegt.
    const base = state.cities
      .filter((c) => c.owner === p.id && tileDistance(state.map, c.tile, u.tile) <= t.range * 2)
      .sort((a, b) => tileDistance(state.map, a.tile, front) - tileDistance(state.map, b.tile, front))[0];
    if (base && tileDistance(state.map, base.tile, front) < tileDistance(state.map, u.tile, front)) {
      run(state, p.id, { type: 'rebase', unit: u.id, target: base.tile }, out);
    }
  }
}

/** Bauwunsch Luftwaffe: Jäger zur Abwehr, Bomber für Angriffe, Flugabwehr bei feindlichen Flugzeugen in der Nähe. */
export function airBuildWish(state: GameState, p: Player, cityTile: number, cities: number, aggressive: boolean): 'fighter' | 'bomber' | 'flak' | null {
  const atWar = state.players.some((o) => o.id !== p.id && o.alive && !o.barbarian && isHostile(state, p.id, o.id));
  if (!atWar) return null;
  const own = state.units.filter((u) => u.owner === p.id);
  const count = (key: string) => own.filter((u) => UNIT_TYPES[u.type].key === key).length;
  const enemyPlanes = state.units.some((u) => u.owner !== p.id && UNIT_TYPES[u.type].air && isHostile(state, p.id, u.owner) &&
    p.visible[u.tile] && tileDistance(state.map, u.tile, cityTile) <= 10);
  if (enemyPlanes && !own.some((u) => UNIT_TYPES[u.type].antiAir && u.tile === cityTile)) return 'flak';
  if (count('fighter') < Math.ceil(cities / 3)) return 'fighter';
  if (aggressive && count('bomber') < Math.ceil(cities / 3)) return 'bomber';
  return null;
}
