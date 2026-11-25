import { Container, Graphics, GraphicsContext, Sprite, type Texture } from 'pixi.js';
import { Dir, neighborOf } from '../sim/hex';
import { type GameMap, hasRiver } from '../sim/map';
import { hash2 } from '../sim/rng';
import { Feature, isWater, Relief, Terrain } from '../sim/rules/terrain';
import { mix, shade } from './color';
import { ICON_CELL } from './icons';
import { EARTH_COLOR, PLAYER_COLORS, RIVER_COLOR, surfaceColor } from './palette';
import {
  CORNER_X, CORNER_Y, centerX, centerY, HEX, liftOf, MAX_OVERHANG, TILT, topPoly, worldSize,
} from './projection';

/**
 * Statische Kartendarstellung.
 *
 * Pro Kartenzeile je ein GraphicsContext für Gelände, Flüsse und Gitter (einmal tesselliert, liegt auf der GPU)
 * plus Ressourcen-Sprites. Bei Weltumrundung wird jede Zeile dreimal instanziiert (Versatz −1, 0, +1 Weltbreite);
 * die Instanzen teilen sich die Geometrie, kosten also nur je einen Draw-Call, wenn sichtbar.
 * Zeichenreihenfolge zeilenweise hinten → vorn (Maleralgorithmus).
 */
export interface MapRow {
  minY: number;
  maxY: number;
  terrain: Graphics[];
  rivers: Graphics[];
  grid: Graphics[];
  icons: Container[];
}

export interface MapView {
  root: Container;
  rows: MapRow[];
  /** x-Versatz je Instanz. */
  offsets: number[];
  worldWidth: number;
  markers: Graphics[];
  contexts: GraphicsContext[];
}

const ICON_SIZE = 22;

export function buildMapView(map: GameMap, starts: readonly number[], icons: readonly Texture[]): MapView {
  const root = new Container();
  root.eventMode = 'none';
  root.interactiveChildren = false;
  const worldWidth = worldSize(map).width;
  const offsets = map.wrapX ? [-worldWidth, 0, worldWidth] : [0];
  const rows: MapRow[] = [];
  const contexts: GraphicsContext[] = [];

  for (let r = 0; r < map.height; r++) {
    const tctx = new GraphicsContext();
    const rctx = new GraphicsContext();
    const gctx = new GraphicsContext();
    contexts.push(tctx, rctx, gctx);
    const iconSpots: { x: number; y: number; id: number }[] = [];

    for (let c = 0; c < map.width; c++) {
      const i = r * map.width + c;
      const cx = centerX(c, r);
      const cy = centerY(r) - liftOf(map, i);
      drawTile(tctx, map, i, c, r, cx, cy);
      gctx.poly(topPoly(cx, cy)).stroke({ width: 1, color: 0x06101c, alpha: 0.28 });
      if (map.resource[i]) iconSpots.push({ x: cx, y: cy - 1, id: map.resource[i] });
      drawRiverEdges(rctx, map, i, c, r);
    }

    const row: MapRow = {
      minY: centerY(r) - HEX * TILT - MAX_OVERHANG,
      maxY: centerY(r) + HEX * TILT + 2,
      terrain: [],
      rivers: [],
      grid: [],
      icons: [],
    };
    for (const off of offsets) {
      const t = new Graphics(tctx);
      const rv = new Graphics(rctx);
      const g = new Graphics(gctx);
      t.x = rv.x = g.x = off;
      const ic = new Container();
      ic.x = off;
      for (const s of iconSpots) {
        const sp = new Sprite(icons[s.id]);
        sp.anchor.set(0.5);
        sp.scale.set(ICON_SIZE / ICON_CELL);
        sp.position.set(s.x, s.y);
        ic.addChild(sp);
      }
      row.terrain.push(t);
      row.rivers.push(rv);
      row.grid.push(g);
      row.icons.push(ic);
    }
    root.addChild(...row.terrain, ...row.rivers, ...row.grid, ...row.icons);
    rows.push(row);
  }

  const mctx = new GraphicsContext();
  contexts.push(mctx);
  starts.forEach((s, p) => drawStartFlag(mctx, map, s, PLAYER_COLORS[p % PLAYER_COLORS.length]));
  const markers = offsets.map((off) => {
    const g = new Graphics(mctx);
    g.x = off;
    root.addChild(g);
    return g;
  });

  return { root, rows, offsets, worldWidth, markers, contexts };
}

export function destroyMapView(view: MapView): void {
  view.root.destroy({ children: true });
  for (const ctx of view.contexts) ctx.destroy();
}

// --- Gelände -----------------------------------------------------------------

function drawTile(g: GraphicsContext, map: GameMap, i: number, c: number, r: number, cx: number, cy: number): void {
  const t = map.terrain[i];
  const rl = map.relief[i];
  const f = map.feature[i];
  const lift = liftOf(map, i);
  const h = hash2(c, r, map.seed ^ 0xabc);
  const top = shade(surfaceColor(t, rl, f), 0.95 + h * 0.1);

  if (lift > 0) {
    const wall = mix(top, EARTH_COLOR, 0.45);
    sideWall(g, cx, cy, 0, 1, lift, shade(wall, 0.6));
    sideWall(g, cx, cy, 1, 2, lift, shade(wall, 0.8));
  }
  g.poly(topPoly(cx, cy)).fill(top);

  if (isWater(t)) {
    if (f !== Feature.Ice && t === Terrain.Ocean && h > 0.55) waves(g, cx, cy, h, shade(top, 1.18));
  } else if (rl === Relief.Mountain) {
    mountain(g, cx, cy, t === Terrain.Snow || t === Terrain.Tundra);
  } else {
    if (rl === Relief.Hill) hills(g, cx, cy, top);
    if (f === Feature.Forest) forest(g, cx, cy, c, r, map.seed, t === Terrain.Tundra);
    else if (f === Feature.Jungle) jungle(g, cx, cy, c, r, map.seed);
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

function hills(g: GraphicsContext, cx: number, cy: number, top: number): void {
  const light = shade(top, 1.12);
  const dark = shade(top, 0.82);
  g.ellipse(cx - 7, cy + 3, 12, 5.5).fill(dark);
  g.ellipse(cx - 8, cy + 2, 11, 4.5).fill(light);
  g.ellipse(cx + 9, cy - 2, 9, 4.5).fill(dark);
  g.ellipse(cx + 8, cy - 3, 8, 3.6).fill(light);
}

function peak(g: GraphicsContext, x: number, baseY: number, w: number, h: number, light: number, dark: number): void {
  const ay = baseY - h;
  g.poly([x - w, baseY, x, ay, x, baseY]).fill(light);
  g.poly([x, ay, x + w, baseY, x, baseY]).fill(dark);
  const k = 0.3;
  g.poly([x, ay, x - w * k, ay + h * k, x - w * k * 0.2, ay + h * k * 0.75, x + w * k * 0.4, ay + h * k * 0.9, x + w * k, ay + h * k]).fill(0xf1f4f6);
}

function mountain(g: GraphicsContext, cx: number, cy: number, cold: boolean): void {
  const light = cold ? 0xa7a9ad : 0x9a8f83;
  const dark = cold ? 0x6d7177 : 0x5f564d;
  peak(g, cx - 10, cy + 5, 11, 17, light, dark);
  peak(g, cx + 9, cy + 6, 10, 14, light, dark);
  peak(g, cx + 1, cy + 8, 15, 26, light, dark);
}

const TREE_SLOTS: readonly (readonly [number, number])[] = [
  [-12, -5], [1, -9], [13, -5], [-6, 1], [7, 2], [-13, 6], [0, 8], [13, 6],
];

function forest(g: GraphicsContext, cx: number, cy: number, c: number, r: number, seed: number, taiga: boolean): void {
  const light = taiga ? 0x3f6b4f : 0x3c7a32;
  const dark = taiga ? 0x284937 : 0x26531f;
  for (let k = 0; k < TREE_SLOTS.length; k++) {
    if (hash2(c * 8 + k, r, seed + 5) < 0.2) continue;
    const jx = (hash2(c, r * 8 + k, seed + 6) - 0.5) * 4;
    const x = cx + TREE_SLOTS[k][0] + jx;
    const y = cy + TREE_SLOTS[k][1] * TILT * 1.4;
    g.poly([x, y - 12, x - 5.5, y + 1, x, y + 1]).fill(light);
    g.poly([x, y - 12, x + 5.5, y + 1, x, y + 1]).fill(dark);
  }
}

function jungle(g: GraphicsContext, cx: number, cy: number, c: number, r: number, seed: number): void {
  for (let k = 0; k < TREE_SLOTS.length; k++) {
    const jx = (hash2(c, r * 8 + k, seed + 7) - 0.5) * 4;
    const x = cx + TREE_SLOTS[k][0] + jx;
    const y = cy + TREE_SLOTS[k][1] * TILT * 1.4 - 4;
    g.circle(x, y, 6).fill(0x1d5a26);
    g.circle(x - 1.6, y - 1.8, 3.4).fill(0x2f7d33);
  }
}

// --- Flüsse ------------------------------------------------------------------

/**
 * Flusskanten, die in Zeile r gezeichnet werden: die O-Kante der Felder dieser Zeile sowie
 * SW-/SO-Kanten der Zeile darüber (die liegen an der Grenze zu dieser Zeile und würden sonst
 * von ihr überdeckt). Höhe = höhere der beiden Feldoberkanten.
 */
function drawRiverEdges(g: GraphicsContext, map: GameMap, i: number, c: number, r: number): void {
  if (hasRiver(map, i, Dir.E)) riverEdge(g, map, i, c, r, Dir.E, 5, 0);
  if (r === 0) return;
  // Felder der vorigen Zeile, deren SW/SO-Kante an dieses Feld grenzt: NO- und NW-Nachbar.
  const ne = neighborOf(map, i, Dir.NE);
  if (ne >= 0 && hasRiver(map, ne, Dir.SW)) {
    // ungewrappte Spalte des Nachbarn relativ zu c bestimmen
    riverEdge(g, map, ne, c + ((r & 1) ? 1 : 0), r - 1, Dir.SW, 1, 2);
  }
  const nw = neighborOf(map, i, Dir.NW);
  if (nw >= 0 && hasRiver(map, nw, Dir.SE)) {
    riverEdge(g, map, nw, c - ((r & 1) ? 0 : 1), r - 1, Dir.SE, 0, 1);
  }
}

function riverEdge(g: GraphicsContext, map: GameMap, a: number, c: number, r: number, dir: number, k0: number, k1: number): void {
  const b = neighborOf(map, a, dir);
  const lift = Math.max(liftOf(map, a), b >= 0 ? liftOf(map, b) : 0);
  const cx = centerX(c, r);
  const cy = centerY(r) - lift;
  g.moveTo(cx + CORNER_X[k0], cy + CORNER_Y[k0]).lineTo(cx + CORNER_X[k1], cy + CORNER_Y[k1]);
  g.stroke({ width: 4.5, color: RIVER_COLOR, cap: 'round' });
}

// --- Startmarker ---------------------------------------------------------------

function drawStartFlag(g: GraphicsContext, map: GameMap, i: number, color: number): void {
  const c = i % map.width;
  const r = (i / map.width) | 0;
  const x = centerX(c, r);
  const y = centerY(r) - liftOf(map, i) + 4;
  g.ellipse(x, y, 7, 3).fill({ color: 0x000000, alpha: 0.3 });
  g.rect(x - 1, y - 30, 2, 30).fill(0x3b2e22);
  g.poly([x + 1, y - 30, x + 17, y - 25, x + 1, y - 20]).fill(color);
  g.poly([x + 1, y - 30, x + 17, y - 25, x + 1, y - 20]).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
}
