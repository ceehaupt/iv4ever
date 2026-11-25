import { BitmapText, Container, Sprite } from 'pixi.js';
import type { UnitView } from '../protocol';
import { Orders } from '../sim/game';
import type { GameMap } from '../sim/map';
import { UNIT_TYPES } from '../sim/rules/units';
import { ICON_CELL, type UnitAtlas } from './icons';
import { PLAYER_COLORS } from './palette';
import { centerX, centerY, liftOf } from './projection';

/** Durchmesser einer Einheiten-Plakette in Weltpixeln. */
export const TOKEN_SIZE = 30;
/** Plakette schwebt etwas über der Feldmitte (Billboard). */
export const TOKEN_RAISE = 13;
const STEP_MS = 140;

export function tokenPos(map: GameMap, tile: number): { x: number; y: number } {
  const c = tile % map.width;
  const r = (tile / map.width) | 0;
  return { x: centerX(c, r), y: centerY(r) - liftOf(map, tile) - TOKEN_RAISE };
}

interface Animation {
  unit: UnitView;
  points: { x: number; y: number }[];
  start: number;
  tokens: Container[];
}

/**
 * Einheiten als Plaketten (Spielerfarbe + Typ-Symbol). Gestapelte Einheiten zeigen die
 * wichtigste Einheit plus Anzahl. Bewegungen werden entlang des Weges animiert.
 */
export class UnitLayer {
  readonly root = new Container();
  private copies: Container[] = [];
  private animations: Animation[] = [];
  private map: GameMap | null = null;
  private units: UnitView[] = [];
  private human = 0;
  private selected = -1;

  constructor(private readonly atlas: UnitAtlas) {
    this.root.eventMode = 'none';
    this.root.interactiveChildren = false;
  }

  setMap(map: GameMap, offsets: number[]): void {
    this.map = map;
    this.animations = [];
    this.root.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.copies = offsets.map((off) => {
      const c = new Container();
      c.x = off;
      this.root.addChild(c);
      return c;
    });
  }

  /** Neue Einheitenliste; moves = Wege, die animiert werden sollen. Gibt die Animationsdauer in ms zurück. */
  setUnits(units: UnitView[], human: number, moves: { unit: number; steps: number[] }[], now: number): number {
    this.units = units;
    this.human = human;
    this.finishAnimations();
    let longest = 0;
    if (this.map) {
      for (const m of moves) {
        const u = units.find((x) => x.id === m.unit);
        if (!u || m.steps.length < 2) continue;
        const points = m.steps.map((t) => tokenPos(this.map!, t));
        const tokens = this.copies.map((copy) => {
          const t = this.makeToken(u, 1);
          copy.addChild(t);
          return t;
        });
        this.animations.push({ unit: u, points, start: now, tokens });
        longest = Math.max(longest, (m.steps.length - 1) * STEP_MS);
      }
    }
    this.rebuild();
    this.tick(now);
    return longest;
  }

  setSelected(unitId: number): void {
    if (unitId === this.selected) return;
    this.selected = unitId;
    this.rebuild();
  }

  get animating(): boolean {
    return this.animations.length > 0;
  }

  /** Animationen fortschreiben; true, solange noch etwas läuft. */
  tick(now: number): boolean {
    if (!this.animations.length) return false;
    let done = false;
    for (const a of this.animations) {
      const t = Math.max(0, now - a.start) / STEP_MS;
      const k = Math.min(a.points.length - 1, Math.floor(t));
      const f = k >= a.points.length - 1 ? 0 : t - k;
      const p0 = a.points[k];
      const p1 = a.points[Math.min(k + 1, a.points.length - 1)];
      for (const tok of a.tokens) tok.position.set(p0.x + (p1.x - p0.x) * f, p0.y + (p1.y - p0.y) * f);
      if (t >= a.points.length - 1) done = true;
    }
    if (done && this.animations.every((a) => now - a.start >= (a.points.length - 1) * STEP_MS)) {
      this.finishAnimations();
      this.rebuild();
      return false;
    }
    return true;
  }

  private finishAnimations(): void {
    for (const a of this.animations) for (const t of a.tokens) t.destroy({ children: true });
    this.animations = [];
  }

  private rebuild(): void {
    const map = this.map;
    if (!map) return;
    for (const copy of this.copies) {
      for (const child of copy.removeChildren()) {
        if (!this.animations.some((a) => a.tokens.includes(child as Container))) child.destroy({ children: true });
      }
    }
    const animating = new Set(this.animations.map((a) => a.unit.id));
    const stacks = new Map<number, UnitView[]>();
    for (const u of this.units) {
      if (animating.has(u.id)) continue;
      const s = stacks.get(u.tile);
      if (s) s.push(u);
      else stacks.set(u.tile, [u]);
    }
    // Hinten → vorn sortieren, damit nähere Plaketten oben liegen.
    const tiles = [...stacks.keys()].sort((a, b) => a - b);
    this.copies.forEach((copy, k) => {
      for (const tile of tiles) {
        const stack = stacks.get(tile)!;
        const token = this.makeToken(this.representative(stack), stack.length);
        const p = tokenPos(map, tile);
        token.position.set(p.x, p.y);
        copy.addChild(token);
      }
      for (const a of this.animations) copy.addChild(a.tokens[k]);
    });
  }

  /** Welche Einheit oben auf dem Stapel gezeigt wird: ausgewählt > wartet auf Befehl > stärkste. */
  private representative(stack: UnitView[]): UnitView {
    const sel = stack.find((u) => u.id === this.selected);
    if (sel) return sel;
    const ready = stack.find((u) => u.owner === this.human && u.moves > 0 && u.orders === Orders.None);
    if (ready) return ready;
    return stack.reduce((a, b) => (UNIT_TYPES[b.type].strength > UNIT_TYPES[a.type].strength ? b : a));
  }

  private makeToken(u: UnitView, count: number): Container {
    const at = this.atlas;
    const c = new Container();
    const scale = TOKEN_SIZE / ICON_CELL;
    const disc = new Sprite(at.disc);
    disc.anchor.set(0.5);
    disc.scale.set(scale);
    disc.tint = PLAYER_COLORS[u.owner % PLAYER_COLORS.length];
    const icon = new Sprite(at.types[u.type]);
    icon.anchor.set(0.5);
    icon.scale.set(scale * 0.95);
    c.addChild(disc, icon);

    if (u.orders === Orders.Fortify) {
      const sh = new Sprite(at.shield);
      sh.anchor.set(0.5);
      sh.scale.set(scale * 0.45);
      sh.position.set(-TOKEN_SIZE * 0.38, TOKEN_SIZE * 0.36);
      c.addChild(sh);
    }
    if (u.owner === this.human) {
      // Bewegungsanzeige: grün = volle Bewegung, gelb = teilweise, grau = keine.
      const dot = new Sprite(at.dot);
      dot.anchor.set(0.5);
      dot.scale.set(scale * 0.26);
      dot.position.set(-TOKEN_SIZE * 0.4, -TOKEN_SIZE * 0.38);
      dot.tint = u.moves <= 0 ? 0x6b7280 : u.moves >= u.maxMoves ? 0x3ddc6a : 0xf2c230;
      c.addChild(dot);
    }
    if (count > 1) {
      const bg = new Sprite(at.dot);
      bg.anchor.set(0.5);
      bg.scale.set(scale * 0.42);
      bg.tint = 0x10151f;
      bg.position.set(TOKEN_SIZE * 0.42, -TOKEN_SIZE * 0.36);
      const txt = new BitmapText({
        text: count > 9 ? '9+' : String(count),
        style: { fontFamily: 'Arial', fontSize: 10, fill: 0xffffff, fontWeight: 'bold' },
      });
      txt.anchor.set(0.5);
      txt.position.copyFrom(bg.position);
      c.addChild(bg, txt);
    }
    return c;
  }
}
