import { Container, Graphics, GraphicsContext, Sprite, type Texture } from 'pixi.js';
import { Dir, neighborOf } from '../sim/hex';
import { type GameMap, hasRiver } from '../sim/map';
import { hash2 } from '../sim/rng';
import { Improvement } from '../sim/rules/improvements';
import { Feature, isWater, Relief, Terrain } from '../sim/rules/terrain';
import { mix, shade } from './color';
import { ICON_CELL } from './icons';
import { EARTH_COLOR, RIVER_COLOR, surfaceColor } from './palette';
import { CORNER_X, CORNER_Y, centerX, centerY, HEX, liftOf, MAX_OVERHANG, TILT, topPoly, worldSize } from './projection';

/**
 * Statische Kartendarstellung mit Nebel des Krieges.
 *
 * Pro Kartenzeile je ein GraphicsContext für Gelände, Flüsse und Gitter plus Ressourcen-Sprites.
 * Unbekannte Felder werden gar nicht gezeichnet, erkundete aber nicht sichtbare gedimmt.
 * Ändert sich der Nebel, werden nur die betroffenen Zeilen neu aufgebaut.
 * Bei Weltumrundung wird jede Zeile dreimal instanziiert (Versatz −1, 0, +1 Weltbreite);
 * die Instanzen teilen sich die Geometrie. Zeichenreihenfolge zeilenweise hinten → vorn.
 */
export interface MapRow {
  minY: number;
  maxY: number;
  tctx: GraphicsContext;
  rctx: GraphicsContext;
  gctx: GraphicsContext;
  terrain: Graphics[];
  rivers: Graphics[];
  grid: Graphics[];
  icons: Container[];
}

export interface MapView {
  root: Container;
  rows: MapRow[];
  offsets: number[];
  worldWidth: number;
}

/** Nebelzustand je Feld: 0 unbekannt, 1 erkundet, 2 sichtbar. null = alles sichtbar. */
export type Fog = Uint8Array | null;

const ICON_SIZE = 22;
const FOG_ICON_TINT = 0x8a8f99;

type Tint = (c: number) => number;
const CLEAR: Tint = (c) => c;
const FOGGED: Tint = (c) => shade(mix(c, 0x56606e, 0.35), 0.62);

export function buildMapView(map: GameMap): MapView {
  const root = new Container();
  root.eventMode = 'none';
  root.interactiveChildren = false;
  const worldWidth = worldSize(map).width;
  const offsets = map.wrapX ? [-worldWidth, 0, worldWidth] : [0];
  const rows: MapRow[] = [];

  for (let r = 0; r < map.height; r++) {
    const row: MapRow = {
      minY: centerY(r) - HEX * TILT - MAX_OVERHANG,
      maxY: centerY(r) + HEX * TILT + 2,
      tctx: new GraphicsContext(),
      rctx: new GraphicsContext(),
      gctx: new GraphicsContext(),
      terrain: [],
      rivers: [],
      grid: [],
      icons: [],
    };
    for (const off of offsets) {
      const t = new Graphics(row.tctx);
      const rv = new Graphics(row.rctx);
      const g = new Graphics(row.gctx);
      const ic = new Container();
      t.x = rv.x = g.x = ic.x = off;
      row.terrain.push(t);
      row.rivers.push(rv);
      row.grid.push(g);
      row.icons.push(ic);
    }
    root.addChild(...row.terrain, ...row.rivers, ...row.grid, ...row.icons);
    rows.push(row);
  }
  return { root, rows, offsets, worldWidth };
}

/** Zeile r neu zeichnen (nach Nebeländerung). */
export function rebuildRow(view: MapView, map: GameMap, r: number, fog: Fog, icons: readonly Texture[]): void {
  const row = view.rows[r];
  row.tctx.clear();
  row.rctx.clear();
  row.gctx.clear();
  for (const ic of row.icons) ic.removeChildren().forEach((c) => c.destroy());

  const spots: { x: number; y: number; id: number; dim: boolean }[] = [];
  for (let c = 0; c < map.width; c++) {
    const i = r * map.width + c;
    const state = fog ? fog[i] : 2;
    if (state > 0) {
      const tint = state === 2 ? CLEAR : FOGGED;
      const cx = centerX(c, r);
      const cy = centerY(r) - liftOf(map, i);
      drawTile(row.tctx, map, i, c, r, cx, cy, tint);
      row.gctx.poly(topPoly(cx, cy)).stroke({ width: 1, color: 0x06101c, alpha: 0.28 });
      if (map.resource[i]) spots.push({ x: cx, y: cy - 1, id: map.resource[i], dim: state === 1 });
    }
    drawRiverEdges(row.rctx, map, i, c, r, fog);
  }
  for (const ic of row.icons) {
    for (const s of spots) {
      const sp = new Sprite(icons[s.id]);
      sp.anchor.set(0.5);
      sp.scale.set(ICON_SIZE / ICON_CELL);
      sp.position.set(s.x, s.y);
      if (s.dim) sp.tint = FOG_ICON_TINT;
      ic.addChild(sp);
    }
  }
}

/** Zeilen, deren Darstellung sich durch den Nebelwechsel ändert (inkl. Flusskanten der Folgezeile). */
export function changedRows(map: GameMap, prev: Fog, next: Fog): number[] {
  const out = new Set<number>();
  for (let r = 0; r < map.height; r++) {
    let changed = !prev || !next;
    for (let c = 0; !changed && c < map.width; c++) {
      const i = r * map.width + c;
      changed = prev![i] !== next![i];
    }
    if (changed) {
      out.add(r);
      if (r + 1 < map.height) out.add(r + 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export function destroyMapView(view: MapView): void {
  view.root.destroy({ children: true });
  for (const row of view.rows) {
    row.tctx.destroy();
    row.rctx.destroy();
    row.gctx.destroy();
  }
}

// --- Gelände -----------------------------------------------------------------

function drawTile(g: GraphicsContext, map: GameMap, i: number, c: number, r: number, cx: number, cy: number, tint: Tint): void {
  const t = map.terrain[i];
  const rl = map.relief[i];
  const f = map.feature[i];
  const lift = liftOf(map, i);
  const h = hash2(c, r, map.seed ^ 0xabc);
  const base = shade(surfaceColor(t, rl, f), 0.95 + h * 0.1);
  const top = tint(base);

  if (lift > 0) {
    const wall = mix(base, EARTH_COLOR, 0.45);
    sideWall(g, cx, cy, 0, 1, lift, tint(shade(wall, 0.6)));
    sideWall(g, cx, cy, 1, 2, lift, tint(shade(wall, 0.8)));
  }
  g.poly(topPoly(cx, cy)).fill(top);

  if (isWater(t)) {
    if (f !== Feature.Ice && t === Terrain.Ocean && h > 0.55) waves(g, cx, cy, h, tint(shade(base, 1.18)));
  } else if (rl === Relief.Mountain) {
    mountain(g, cx, cy, t === Terrain.Snow || t === Terrain.Tundra, tint);
  } else {
    if (rl === Relief.Hill) hills(g, cx, cy, base, tint);
    improvement(g, map.improvement[i], cx, cy, tint);
    if (map.road[i]) road(g, map, i, cx, cy, tint);
    if (f === Feature.Forest) forest(g, cx, cy, c, r, map.seed, t === Terrain.Tundra, tint);
    else if (f === Feature.Jungle) jungle(g, cx, cy, c, r, map.seed, tint);
  }
}

// --- Verbesserungen und Straßen ---------------------------------------------------

/** Kantenmitten je Richtung (O, NO, NW, W, SW, SO) relativ zum Mittelpunkt. */
const EDGE_MID: readonly (readonly [number, number])[] = [[5, 0], [4, 5], [3, 4], [2, 3], [1, 2], [0, 1]].map(
  ([a, b]) => [(CORNER_X[a] + CORNER_X[b]) / 2, (CORNER_Y[a] + CORNER_Y[b]) / 2] as const,
);

function road(g: GraphicsContext, map: GameMap, i: number, cx: number, cy: number, tint: Tint): void {
  const color = tint(0x8a6a44);
  let any = false;
  for (let d = 0; d < 6; d++) {
    const n = neighborOf(map, i, d);
    if (n < 0 || !map.road[n]) continue;
    any = true;
    g.moveTo(cx, cy).lineTo(cx + EDGE_MID[d][0], cy + EDGE_MID[d][1]);
  }
  if (any) g.stroke({ width: 3.2, color, cap: 'round', alpha: 0.95 });
  g.circle(cx, cy, 2.6).fill(color);
}

function improvement(g: GraphicsContext, id: number, cx: number, cy: number, tint: Tint): void {
  if (!id) return;
  // Leicht nach links unten versetzt, damit Ressourcen-Symbol (Mitte) frei bleibt.
  const x = cx - 9;
  const y = cy + 5;
  switch (id) {
    case Improvement.Farm:
      for (let k = -1; k <= 1; k++) {
        g.moveTo(cx - 17, cy + k * 5 + 2).lineTo(cx + 17, cy + k * 5 + 2);
      }
      g.stroke({ width: 2.2, color: tint(0xd8d06a), alpha: 0.85 });
      break;
    case Improvement.Mine:
      g.ellipse(x, y, 9, 5).fill(tint(0x6f6a64));
      g.ellipse(x, y + 1, 4, 3).fill(tint(0x1c1a18));
      break;
    case Improvement.Pasture:
      g.moveTo(x - 9, y - 2).lineTo(x + 9, y - 2).moveTo(x - 9, y + 2).lineTo(x + 9, y + 2);
      for (const px of [-9, 0, 9]) g.moveTo(x + px, y - 5).lineTo(x + px, y + 4);
      g.stroke({ width: 1.4, color: tint(0xe6d3a8) });
      break;
    case Improvement.Camp:
      g.poly([x - 7, y + 3, x, y - 7, x + 7, y + 3]).fill(tint(0xb07a45));
      g.poly([x - 2, y + 3, x, y - 2, x + 2, y + 3]).fill(tint(0x3a2614));
      break;
    case Improvement.Plantation:
      for (let k = 0; k < 6; k++) g.circle(x - 6 + (k % 3) * 6, y - 2 + Math.floor(k / 3) * 5, 2.2).fill(tint(0x2d6b2a));
      break;
    case Improvement.Lumbermill:
      for (let k = 0; k < 3; k++) g.roundRect(x - 8, y - 4 + k * 3.2, 16, 3, 1.5).fill(tint(k % 2 ? 0x8a5a2b : 0x9c6a36));
      break;
    case Improvement.Quarry:
      g.rect(x - 8, y - 2, 7, 5).fill(tint(0xb9b2a6));
      g.rect(x, y - 4, 7, 7).fill(tint(0x9a9388));
      break;
  }
}

function sideWall(g: GraphicsContext, cx: number, cy: number, a: number, b: number, lift: number, color: number): void {
  const ax = cx + CORNER_X[a];
  const ay = cy + CORNER_Y[a];
  const bx = cx + CORNER_X[b];
  const by = cy + CORNER_Y[b];
  g.poly([ax, ay, bx, by, bx, by + lift, ax, ay + lift]).fill(color);
}

function waves(g: GraphicsContext, cx: number, cy: number, h: number, color: number): void {
  const x = cx + (h - 0.75) * 20;
  const y = cy + (h - 0.7) * 10;
  g.moveTo(x - 7, y).quadraticCurveTo(x - 3.5, y - 2.5, x, y).quadraticCurveTo(x + 3.5, y + 2.5, x + 7, y);
  g.stroke({ width: 1.2, color, alpha: 0.55 });
}

function hills(g: GraphicsContext, cx: number, cy: number, base: number, tint: Tint): void {
  const light = tint(shade(base, 1.12));
  const dark = tint(shade(base, 0.82));
  g.ellipse(cx - 7, cy + 3, 12, 5.5).fill(dark);
  g.ellipse(cx - 8, cy + 2, 11, 4.5).fill(light);
  g.ellipse(cx + 9, cy - 2, 9, 4.5).fill(dark);
  g.ellipse(cx + 8, cy - 3, 8, 3.6).fill(light);
}

function peak(g: GraphicsContext, x: number, baseY: number, w: number, h: number, light: number, dark: number, snow: number): void {
  const ay = baseY - h;
  g.poly([x - w, baseY, x, ay, x, baseY]).fill(light);
  g.poly([x, ay, x + w, baseY, x, baseY]).fill(dark);
  const k = 0.3;
  g.poly([x, ay, x - w * k, ay + h * k, x - w * k * 0.2, ay + h * k * 0.75, x + w * k * 0.4, ay + h * k * 0.9, x + w * k, ay + h * k]).fill(snow);
}

function mountain(g: GraphicsContext, cx: number, cy: number, cold: boolean, tint: Tint): void {
  const light = tint(cold ? 0xa7a9ad : 0x9a8f83);
  const dark = tint(cold ? 0x6d7177 : 0x5f564d);
  const snow = tint(0xf1f4f6);
  peak(g, cx - 10, cy + 5, 11, 17, light, dark, snow);
  peak(g, cx + 9, cy + 6, 10, 14, light, dark, snow);
  peak(g, cx + 1, cy + 8, 15, 26, light, dark, snow);
}

const TREE_SLOTS: readonly (readonly [number, number])[] = [
  [-12, -5], [1, -9], [13, -5], [-6, 1], [7, 2], [-13, 6], [0, 8], [13, 6],
];

function forest(g: GraphicsContext, cx: number, cy: number, c: number, r: number, seed: number, taiga: boolean, tint: Tint): void {
  const light = tint(taiga ? 0x3f6b4f : 0x3c7a32);
  const dark = tint(taiga ? 0x284937 : 0x26531f);
  for (let k = 0; k < TREE_SLOTS.length; k++) {
    if (hash2(c * 8 + k, r, seed + 5) < 0.2) continue;
    const jx = (hash2(c, r * 8 + k, seed + 6) - 0.5) * 4;
    const x = cx + TREE_SLOTS[k][0] + jx;
    const y = cy + TREE_SLOTS[k][1] * TILT * 1.4;
    g.poly([x, y - 12, x - 5.5, y + 1, x, y + 1]).fill(light);
    g.poly([x, y - 12, x + 5.5, y + 1, x, y + 1]).fill(dark);
  }
}

function jungle(g: GraphicsContext, cx: number, cy: number, c: number, r: number, seed: number, tint: Tint): void {
  const dark = tint(0x1d5a26);
  const light = tint(0x2f7d33);
  for (let k = 0; k < TREE_SLOTS.length; k++) {
    const jx = (hash2(c, r * 8 + k, seed + 7) - 0.5) * 4;
    const x = cx + TREE_SLOTS[k][0] + jx;
    const y = cy + TREE_SLOTS[k][1] * TILT * 1.4 - 4;
    g.circle(x, y, 6).fill(dark);
    g.circle(x - 1.6, y - 1.8, 3.4).fill(light);
  }
}

// --- Flüsse ------------------------------------------------------------------

/**
 * Flusskanten, die in Zeile r gezeichnet werden: die O-Kante der Felder dieser Zeile sowie
 * SW-/SO-Kanten der Zeile darüber (die liegen an der Grenze zu dieser Zeile und würden sonst
 * von ihr überdeckt). Höhe = höhere der beiden Feldoberkanten.
 */
function drawRiverEdges(g: GraphicsContext, map: GameMap, i: number, c: number, r: number, fog: Fog): void {
  if (hasRiver(map, i, Dir.E)) riverEdge(g, map, i, c, r, Dir.E, 5, 0, fog);
  if (r === 0) return;
  const ne = neighborOf(map, i, Dir.NE);
  if (ne >= 0 && hasRiver(map, ne, Dir.SW)) riverEdge(g, map, ne, c + (r & 1 ? 1 : 0), r - 1, Dir.SW, 1, 2, fog);
  const nw = neighborOf(map, i, Dir.NW);
  if (nw >= 0 && hasRiver(map, nw, Dir.SE)) riverEdge(g, map, nw, c - (r & 1 ? 0 : 1), r - 1, Dir.SE, 0, 1, fog);
}

function riverEdge(
  g: GraphicsContext, map: GameMap, a: number, c: number, r: number, dir: number, k0: number, k1: number, fog: Fog,
): void {
  const b = neighborOf(map, a, dir);
  const sa = fog ? fog[a] : 2;
  const sb = fog && b >= 0 ? fog[b] : 2;
  if (sa === 0 && sb === 0) return;
  const lift = Math.max(liftOf(map, a), b >= 0 ? liftOf(map, b) : 0);
  const cx = centerX(c, r);
  const cy = centerY(r) - lift;
  const color = sa === 2 || sb === 2 ? RIVER_COLOR : FOGGED(RIVER_COLOR);
  g.moveTo(cx + CORNER_X[k0], cy + CORNER_Y[k0]).lineTo(cx + CORNER_X[k1], cy + CORNER_Y[k1]);
  g.stroke({ width: 4.5, color, cap: 'round' });
}
