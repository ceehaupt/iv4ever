import { BitmapText, Container, Graphics, GraphicsContext } from 'pixi.js';
import type { CityView } from '../protocol';
import { neighborOf } from '../sim/hex';
import { type GameMap, tileYields } from '../sim/map';
import { hash2 } from '../sim/rng';
import { shade } from './color';
import { PLAYER_COLORS } from './palette';
import { CORNER_X, CORNER_Y, centerX, centerY, liftOf, topPoly } from './projection';

/** Ecken je Kantenrichtung (O, NO, NW, W, SW, SO). */
const EDGE_CORNERS: readonly (readonly [number, number])[] = [[5, 0], [4, 5], [3, 4], [2, 3], [1, 2], [0, 1]];
const BORDER_INSET = 0.9;

function tileCenter(map: GameMap, i: number): { x: number; y: number } {
  const c = i % map.width;
  const r = (i / map.width) | 0;
  return { x: centerX(c, r), y: centerY(r) - liftOf(map, i) };
}

/**
 * Grenzen, Stadtgebäude, Namensschilder und die Feldanzeige der Stadtansicht.
 * Grenzen und Gebäude liegen in geteilten GraphicsContexts (eine Geometrie, drei Instanzen bei Umrundung).
 */
export class CityLayer {
  /** Unter den Einheiten: Grenzen und Häuser. */
  readonly ground = new Container();
  /** Über den Einheiten: Namensschilder. */
  readonly labels = new Container();
  /** Ganz oben: Erträge und Bewirtschaftung der geöffneten Stadt. */
  readonly work = new Container();

  private readonly borderCtx = new GraphicsContext();
  private readonly houseCtx = new GraphicsContext();
  private readonly workCtx = new GraphicsContext();
  private map: GameMap | null = null;
  private labelCopies: Container[] = [];

  constructor() {
    for (const c of [this.ground, this.labels, this.work]) {
      c.eventMode = 'none';
      c.interactiveChildren = false;
    }
  }

  setMap(map: GameMap, offsets: number[]): void {
    this.map = map;
    for (const c of [this.ground, this.labels, this.work]) c.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    this.borderCtx.clear();
    this.houseCtx.clear();
    this.workCtx.clear();
    this.labelCopies = offsets.map((off) => {
      const b = new Graphics(this.borderCtx);
      const h = new Graphics(this.houseCtx);
      const w = new Graphics(this.workCtx);
      b.x = h.x = w.x = off;
      this.ground.addChild(b, h);
      this.work.addChild(w);
      const l = new Container();
      l.x = off;
      this.labels.addChild(l);
      return l;
    });
  }

  update(cities: CityView[], tileOwner: Int16Array): void {
    const map = this.map;
    if (!map) return;
    this.drawBorders(map, tileOwner);
    this.houseCtx.clear();
    for (const c of cities) this.drawHouses(map, c);
    for (const copy of this.labelCopies) {
      copy.removeChildren().forEach((ch) => ch.destroy({ children: true }));
      for (const c of cities) copy.addChild(this.banner(map, c));
    }
  }

  /** Erträge und Bewirtschaftung einer eigenen Stadt einblenden (null = ausblenden). */
  setFocus(city: CityView | null): void {
    const g = this.workCtx;
    g.clear();
    const map = this.map;
    if (!map || !city?.own) return;
    const worked = new Set(city.own.worked);
    const locked = new Set(city.own.locked);
    for (const t of [city.tile, ...city.own.workable]) {
      const p = tileCenter(map, t);
      const poly = topPoly(p.x, p.y);
      // Das Stadtfeld wird immer bewirtschaftet und bekommt keinen Rahmen.
      if (locked.has(t)) g.poly(poly).stroke({ width: 3, color: 0xffd54a });
      else if (worked.has(t)) g.poly(poly).stroke({ width: 2.5, color: 0xffffff, alpha: 0.95 });
      else if (t !== city.tile) g.poly(poly).fill({ color: 0x000000, alpha: 0.28 });
      this.pips(g, map, t, p.x, p.y, t === city.tile || worked.has(t));
    }
  }

  private pips(g: GraphicsContext, map: GameMap, t: number, x: number, y: number, active: boolean): void {
    const yv = tileYields(map, t);
    const rows: [number, number][] = [
      [yv.food, 0x7bd35a],
      [yv.prod, 0xe0913f],
      [yv.trade, 0xf2c230],
    ].filter(([n]) => n > 0) as [number, number][];
    if (!rows.length) return;
    const alpha = active ? 1 : 0.6;
    const h = rows.length * 6 + 4;
    const w = Math.max(...rows.map(([n]) => Math.min(n, 6))) * 6 + 4;
    g.roundRect(x - w / 2, y - h / 2, w, h, 3).fill({ color: 0x0b1220, alpha: 0.6 * alpha });
    rows.forEach(([n, color], k) => {
      const count = Math.min(n, 6);
      const ry = y - h / 2 + 5 + k * 6;
      for (let i = 0; i < count; i++) {
        g.circle(x - ((count - 1) * 6) / 2 + i * 6, ry, 2.3).fill({ color, alpha });
      }
    });
  }

  private drawBorders(map: GameMap, owner: Int16Array): void {
    const g = this.borderCtx;
    g.clear();
    for (let i = 0; i < owner.length; i++) {
      const o = owner[i];
      if (o < 0) continue;
      const color = PLAYER_COLORS[o % PLAYER_COLORS.length];
      const p = tileCenter(map, i);
      g.poly(topPoly(p.x, p.y)).fill({ color, alpha: 0.13 });
      for (let d = 0; d < 6; d++) {
        const n = neighborOf(map, i, d);
        if (n >= 0 && owner[n] === o) continue;
        const [a, b] = EDGE_CORNERS[d];
        g.moveTo(p.x + CORNER_X[a] * BORDER_INSET, p.y + CORNER_Y[a] * BORDER_INSET)
          .lineTo(p.x + CORNER_X[b] * BORDER_INSET, p.y + CORNER_Y[b] * BORDER_INSET)
          .stroke({ width: 3, color, alpha: 0.9, cap: 'round' });
      }
    }
  }

  /** Ein paar Häuser – mit der Größe werden es mehr. */
  private drawHouses(map: GameMap, c: CityView): void {
    const g = this.houseCtx;
    const p = tileCenter(map, c.tile);
    const count = Math.min(3 + c.size, 9);
    const spots: [number, number][] = [
      [0, -2], [-11, 1], [11, 1], [-5, 7], [6, 8], [-15, -5], [15, -5], [0, -10], [-2, 12],
    ];
    const houses = spots.slice(0, count).sort((a, b) => a[1] - b[1]);
    houses.forEach(([dx, dy], k) => {
      const x = p.x + dx;
      const y = p.y + dy * 0.8;
      const wall = shade(0xd9cbb0, 0.9 + hash2(c.tile, k, 3) * 0.2);
      const roof = k === 0 && c.capital ? 0xd4a72c : shade(0xa4432f, 0.85 + hash2(k, c.tile, 4) * 0.3);
      g.rect(x - 5, y - 6, 10, 7).fill(wall);
      g.rect(x + 1, y - 6, 4, 7).fill(shade(wall, 0.8));
      g.poly([x - 6.5, y - 6, x, y - 12, x + 6.5, y - 6]).fill(roof);
    });
  }

  private banner(map: GameMap, c: CityView): Container {
    const p = tileCenter(map, c.tile);
    const box = new Container();
    const color = PLAYER_COLORS[c.owner % PLAYER_COLORS.length];
    const name = new BitmapText({
      text: c.capital ? `★ ${c.name}` : c.name,
      style: { fontFamily: 'Arial', fontSize: 11, fill: 0xffffff, fontWeight: 'bold' },
    });
    const size = new BitmapText({
      text: String(c.size),
      style: { fontFamily: 'Arial', fontSize: 11, fill: 0xffffff, fontWeight: 'bold' },
    });
    const w = name.width + 26;
    const bg = new Graphics();
    bg.roundRect(-w / 2, -8, w, 16, 8).fill({ color: 0x10151f, alpha: 0.82 }).stroke({ width: 1.5, color });
    bg.circle(-w / 2 + 8, 0, 7).fill(color);
    size.anchor.set(0.5);
    size.position.set(-w / 2 + 8, 0);
    name.anchor.set(0, 0.5);
    name.position.set(-w / 2 + 18, 0);
    box.addChild(bg, size, name);
    // Über der Einheitenplakette, damit beide lesbar bleiben.
    box.position.set(p.x, p.y - 42);
    return box;
  }

  destroy(): void {
    this.borderCtx.destroy();
    this.houseCtx.destroy();
    this.workCtx.destroy();
  }
}
