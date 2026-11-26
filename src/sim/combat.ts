import { detPow } from './detmath';
import { neighborOf } from './hex';
import { type GameMap, hasRiver } from './map';
import type { Rng } from './rng';
import { Feature, Relief, RIVER_DEFENSE, tileDefense } from './rules/terrain';
import { PROMOTIONS, type PromotionType, UNIT_TYPES } from './rules/units';

/**
 * Kampfregeln (eigener Entwurf, siehe docs/REGELN.md):
 * - Jede Einheit hat 100 Lebenspunkte; Verletzte kämpfen schwächer (50 % + 50 % × LP-Anteil).
 * - Schaden je Seite = 28 × (eigene Stärke / gegnerische Stärke)^1,3 × Zufall (0,8–1,2).
 * - Nahkampf: beide Seiten nehmen Schaden. Fernkampf: nur der Verteidiger.
 * - Fallen beide auf 0, überlebt die Seite mit dem kleineren Defizit mit 1 LP (Gleichstand: Verteidiger).
 */

export interface Fighter {
  type: number;
  hp: number;
  promotions: readonly number[];
  fortified: boolean;
}

export interface Battlefield {
  map: GameMap;
  attackerTile: number;
  defenderTile: number;
  /** Zusätzlicher Verteidigungsbonus der Stadt auf dem Zielfeld in % (null = keine Stadt). */
  cityDefense: number | null;
}

export const MAX_HP = 100;
export const BASE_CITY_DEFENSE = 25;
export const FORTIFY_BONUS = 25;
const BASE_DAMAGE = 28;
const EXPONENT = 1.3;
const ROLL_MIN = 0.8;
const ROLL_MAX = 1.2;

function promo(f: Fighter, key: keyof PromotionType): number {
  let sum = 0;
  for (const p of f.promotions) sum += (PROMOTIONS[p][key] as number | undefined) ?? 0;
  return sum;
}

function hpFactor(hp: number): number {
  return 0.5 + (0.5 * Math.max(0, hp)) / MAX_HP;
}

export function isRough(map: GameMap, tile: number): boolean {
  const f = map.feature[tile];
  return map.relief[tile] === Relief.Hill || f === Feature.Forest || f === Feature.Jungle;
}

/** Liegt zwischen zwei Nachbarfeldern ein Fluss? */
export function riverBetween(map: GameMap, a: number, b: number): boolean {
  for (let d = 0; d < 6; d++) if (neighborOf(map, a, d) === b) return hasRiver(map, a, d);
  return false;
}

export function attackPower(att: Fighter, def: Fighter, bf: Battlefield, ranged: boolean): number {
  const t = UNIT_TYPES[att.type];
  const dt = UNIT_TYPES[def.type];
  const base = ranged ? t.ranged : t.strength;
  let pct = promo(att, 'strength');
  pct += t.vs?.[dt.cls] ?? 0;
  if (dt.cls === 'mounted') pct += promo(att, 'vsMounted');
  if (bf.cityDefense !== null) pct += (t.vsCity ?? 0) + promo(att, 'vsCity');
  if (isRough(bf.map, bf.defenderTile)) pct += promo(att, 'rough');
  return base * (1 + pct / 100) * hpFactor(att.hp);
}

export function defensePower(def: Fighter, att: Fighter, bf: Battlefield, ranged: boolean): number {
  const t = UNIT_TYPES[def.type];
  const at = UNIT_TYPES[att.type];
  const m = bf.map;
  let pct = promo(def, 'strength');
  pct += tileDefense(m.relief[bf.defenderTile], m.feature[bf.defenderTile]);
  if (!ranged && riverBetween(m, bf.attackerTile, bf.defenderTile)) pct += RIVER_DEFENSE;
  if (def.fortified) pct += FORTIFY_BONUS;
  if (bf.cityDefense !== null) pct += BASE_CITY_DEFENSE + bf.cityDefense + (t.cityDefense ?? 0) + promo(def, 'cityDefense');
  if (isRough(m, bf.defenderTile)) pct += promo(def, 'rough');
  pct += t.vs?.[at.cls] ?? 0;
  if (at.cls === 'mounted') pct += promo(def, 'vsMounted');
  return t.strength * (1 + pct / 100) * hpFactor(def.hp);
}

function damage(ratio: number, roll: number): number {
  return Math.max(1, Math.min(MAX_HP, Math.round(BASE_DAMAGE * detPow(ratio, EXPONENT) * roll)));
}

export interface CombatOutcome {
  dmgDef: number;
  dmgAtt: number;
  attackerDies: boolean;
  defenderDies: boolean;
}

function outcome(att: Fighter, def: Fighter, A: number, D: number, ranged: boolean, r1: number, r2: number): CombatOutcome {
  const ratio = A / Math.max(0.01, D);
  const dmgDef = damage(ratio, r1);
  const dmgAtt = ranged ? 0 : damage(1 / ratio, r2);
  const attLeft = att.hp - dmgAtt;
  const defLeft = def.hp - dmgDef;
  let attackerDies = attLeft <= 0;
  let defenderDies = defLeft <= 0;
  let finalDef = Math.min(dmgDef, def.hp);
  let finalAtt = Math.min(dmgAtt, att.hp);
  if (attackerDies && defenderDies) {
    // Beide wären tot: das kleinere Defizit überlebt mit 1 LP, bei Gleichstand der Verteidiger.
    if (attLeft > defLeft) {
      attackerDies = false;
      finalAtt = att.hp - 1;
    } else {
      defenderDies = false;
      finalDef = def.hp - 1;
    }
  }
  return { dmgDef: finalDef, dmgAtt: finalAtt, attackerDies, defenderDies };
}

/** Kampf mit Zufall auswerten (deterministisch über den Spiel-RNG). */
export function resolveCombat(att: Fighter, def: Fighter, bf: Battlefield, ranged: boolean, rng: Rng): CombatOutcome {
  const A = attackPower(att, def, bf, ranged);
  const D = defensePower(def, att, bf, ranged);
  return outcome(att, def, A, D, ranged, rng.range(ROLL_MIN, ROLL_MAX), rng.range(ROLL_MIN, ROLL_MAX));
}

export interface Prediction {
  attack: number;
  defense: number;
  /** Wahrscheinlichkeit, dass der Verteidiger stirbt und der Angreifer überlebt. */
  win: number;
  /** Wahrscheinlichkeit, dass der Angreifer stirbt. */
  loss: number;
  dmgDef: [number, number];
  dmgAtt: [number, number];
}

/**
 * Luftkampf ohne Gelände: Abfangjäger gegen Flugzeug (beide nehmen Schaden) bzw. Flugabwehr gegen Flugzeug
 * (`ranged`: nur das Flugzeug). Stärken sind die reinen Kampfwerte, Lebenspunkte und Beförderungen zählen.
 */
export function resolveAirDuel(att: Fighter, def: Fighter, ranged: boolean, rng: Rng): CombatOutcome {
  const A = UNIT_TYPES[att.type].strength * (1 + promo(att, 'strength') / 100) * hpFactor(att.hp);
  const D = UNIT_TYPES[def.type].strength * (1 + promo(def, 'strength') / 100) * hpFactor(def.hp);
  return outcome(att, def, A, D, ranged, rng.range(ROLL_MIN, ROLL_MAX), rng.range(ROLL_MIN, ROLL_MAX));
}

/** Vorhersage über ein Raster der Zufallswerte (gleiche Regeln wie resolveCombat). */
export function predictCombat(att: Fighter, def: Fighter, bf: Battlefield, ranged: boolean): Prediction {
  const A = attackPower(att, def, bf, ranged);
  const D = defensePower(def, att, bf, ranged);
  const steps = 11;
  let win = 0;
  let loss = 0;
  let n = 0;
  const dd: number[] = [];
  const da: number[] = [];
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const r1 = ROLL_MIN + ((ROLL_MAX - ROLL_MIN) * i) / (steps - 1);
      const r2 = ROLL_MIN + ((ROLL_MAX - ROLL_MIN) * j) / (steps - 1);
      const o = outcome(att, def, A, D, ranged, r1, r2);
      if (o.defenderDies && !o.attackerDies) win++;
      if (o.attackerDies) loss++;
      dd.push(o.dmgDef);
      da.push(o.dmgAtt);
      n++;
    }
  }
  return {
    attack: A,
    defense: D,
    win: win / n,
    loss: loss / n,
    dmgDef: [Math.min(...dd), Math.max(...dd)],
    dmgAtt: [Math.min(...da), Math.max(...da)],
  };
}

/** Bester Verteidiger eines Stapels gegen diesen Angreifer (Index), -1 = keiner kann kämpfen. */
export function bestDefender(defenders: readonly Fighter[], att: Fighter, bf: Battlefield, ranged: boolean): number {
  let best = -1;
  let bestPower = -1;
  defenders.forEach((d, k) => {
    if (UNIT_TYPES[d.type].strength <= 0) return;
    const p = defensePower(d, att, bf, ranged);
    if (p > bestPower) {
      bestPower = p;
      best = k;
    }
  });
  return best;
}
