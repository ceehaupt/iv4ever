import { axialRound, axialToOffsetCol, SQRT3, tileAt } from '../sim/hex';
import type { GameMap } from '../sim/map';
import { Relief, TERRAIN } from '../sim/rules/terrain';

/**
 * 2.5D-Projektion: Die Hex-Ebene wird vertikal gestaucht (Kippung) und Felder werden
 * je nach Relief angehoben. Gezeichnet wird zeilenweise von hinten (oben) nach vorn (unten),
 * dadurch verdecken nähere Felder korrekt die weiter entfernten (Maleralgorithmus).
 */

/** Hex-Radius (Mittelpunkt → Ecke) in Weltpixeln. */
export const HEX = 32;
/** Vertikale Stauchung: 1 = Draufsicht, kleiner = flacherer Blickwinkel. */
export const TILT = 0.62;
export const COL_W = SQRT3 * HEX;
export const ROW_H = 1.5 * HEX;
/** Anhebung je Relief in Weltpixeln. */
export const LIFT = { water: 0, flat: 6, hill: 13, mountain: 20 } as const;
/** Wie weit Gebirgsspitzen und Bäume über die Feldoberkante ragen. */
export const MAX_OVERHANG = 30;

/**
 * Eckpunkte relativ zum Mittelpunkt, Winkel 30° + 60°·i (y nach unten):
 * 0 rechts unten, 1 unten, 2 links unten, 3 links oben, 4 oben, 5 rechts oben.
 */
export const CORNER_X = new Float64Array(6);
export const CORNER_Y = new Float64Array(6);
for (let i = 0; i < 6; i++) {
  const a = (Math.PI / 180) * (60 * i + 30);
  CORNER_X[i] = HEX * Math.cos(a);
  CORNER_Y[i] = HEX * Math.sin(a) * TILT;
}

export function centerX(c: number, r: number): number {
  return COL_W * (c + 0.5 * (r & 1));
}

/** y der Grundebene (ohne Anhebung). */
export function centerY(r: number): number {
  return ROW_H * r * TILT;
}

export function liftOf(map: GameMap, i: number): number {
  if (TERRAIN[map.terrain[i]].water) return LIFT.water;
  const rl = map.relief[i];
  return rl === Relief.Mountain ? LIFT.mountain : rl === Relief.Hill ? LIFT.hill : LIFT.flat;
}

/** Oberseite eines Feldes als Polygon (cy bereits angehoben). */
export function topPoly(cx: number, cy: number): number[] {
  const p = new Array<number>(12);
  for (let k = 0; k < 6; k++) {
    p[2 * k] = cx + CORNER_X[k];
    p[2 * k + 1] = cy + CORNER_Y[k];
  }
  return p;
}

/** Sichtbare Silhouette inkl. Seitenwände – für die Mausauswahl. */
function silhouette(cx: number, cy: number, lift: number): number[] {
  const p: number[] = [];
  for (const k of [2, 3, 4, 5, 0]) p.push(cx + CORNER_X[k], cy + CORNER_Y[k]);
  for (const k of [0, 1, 2]) p.push(cx + CORNER_X[k], cy + CORNER_Y[k] + lift);
  return p;
}

function pointInPoly(x: number, y: number, p: number[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i];
    const yi = p[i + 1];
    const xj = p[j];
    const yj = p[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Feld unter einem Weltpunkt; berücksichtigt angehobene Felder davor. -1 = keins.
 * wx darf beliebig sein – bei Weltumrundung wird die Spalte normiert.
 */
export function pickTile(map: GameMap, wx: number, wy: number): number {
  const fy = wy / TILT;
  const [q, r0] = axialRound(((SQRT3 / 3) * wx - fy / 3) / HEX, ((2 / 3) * fy) / HEX);
  const c0 = axialToOffsetCol(q, r0);
  // Zeilen weiter vorn (größeres r) können durch ihre Anhebung den Punkt überdecken.
  for (let r = r0 + 2; r >= r0 - 1; r--) {
    for (let c = c0 - 2; c <= c0 + 2; c++) {
      const i = tileAt(map, c, r);
      if (i < 0) continue;
      const cx = centerX(c, r); // ungewrappte Spalte → Geometrie passt zum Punkt
      if (Math.abs(wx - cx) > HEX) continue;
      const lift = liftOf(map, i);
      if (pointInPoly(wx, wy, silhouette(cx, centerY(r) - lift, lift))) return i;
    }
  }
  return tileAt(map, c0, r0);
}

/** Weltgröße; bei Umrundung ist width genau eine Periode. */
export function worldSize(map: GameMap): { width: number; height: number } {
  return {
    width: COL_W * (map.wrapX ? map.width : map.width + 0.5),
    height: centerY(map.height - 1) + HEX * TILT,
  };
}
