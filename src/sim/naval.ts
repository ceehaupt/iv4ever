import type { GameMap } from './map';
import { type StepCost, stepCost } from './path';
import { Terrain } from './rules/terrain';
import { MOVE_SCALE, UNIT_TYPES } from './rules/units';

/**
 * Seefahrt: Schiffe fahren auf Küstengewässern (Ozean nur hochseetaugliche), in eigene Küstenstädte
 * und nie auf Binnenseen. Landeinheiten steigen auf ein eigenes Transportschiff mit freiem Platz, indem sie
 * auf dessen Wasserfeld ziehen, und gehen an Land, indem sie auf ein Landfeld ziehen (Landung beendet den Zug).
 */

export function sailable(map: GameMap, type: number, tile: number, ownCities: ReadonlySet<number>): boolean {
  const t = map.terrain[tile];
  if (t === Terrain.Coast) return true;
  if (t === Terrain.Ocean) return UNIT_TYPES[type].ocean === true;
  return ownCities.has(tile);
}

export interface MoveContext {
  map: GameMap;
  type: number;
  isKnown: (i: number) => boolean;
  /** Fremde Einheiten/Städte, soweit bekannt. */
  isBlocked: (i: number) => boolean;
  /** Eigene Städte (Schiffe dürfen hinein, falls an der Küste). */
  ownCities: ReadonlySet<number>;
  /** Wasserfelder mit eigenem Transportschiff, das noch Platz hat. */
  transports: ReadonlySet<number>;
  roadCost: number;
}

/** Schrittkosten für eine Einheit – Land- oder Seeeinheit, inklusive Ein- und Aussteigen. */
export function unitCost(ctx: MoveContext): StepCost {
  const { map, type } = ctx;
  if (UNIT_TYPES[type].naval) {
    return (_from, to) => {
      if (ctx.isBlocked(to)) return Infinity;
      if (!ctx.isKnown(to)) return MOVE_SCALE;
      return sailable(map, type, to, ctx.ownCities) ? MOVE_SCALE : Infinity;
    };
  }
  return (from, to) => {
    if (ctx.transports.has(to)) return MOVE_SCALE;
    if (ctx.isBlocked(to)) return Infinity;
    if (!ctx.isKnown(to)) return MOVE_SCALE;
    return stepCost(map, from, to, ctx.roadCost);
  };
}
