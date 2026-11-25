import { BitmapText, Container, Graphics } from 'pixi.js';

interface Effect {
  node: Container;
  start: number;
  duration: number;
  x: number;
  y: number;
  kind: 'float' | 'flash';
}

/**
 * Kurze Kampfeffekte: Schadenszahlen steigen auf und verblassen, ein Ring blitzt auf.
 * Läuft nur, solange Effekte aktiv sind (danach rendert der Renderer wieder nur bei Bedarf).
 */
export class EffectsLayer {
  readonly root = new Container();
  private effects: Effect[] = [];
  enabled = true;

  constructor() {
    this.root.eventMode = 'none';
  }

  get active(): boolean {
    return this.effects.length > 0;
  }

  floatText(x: number, y: number, text: string, color: number, now: number): void {
    if (!this.enabled) return;
    const t = new BitmapText({ text, style: { fontFamily: 'Arial', fontSize: 16, fill: color, fontWeight: 'bold' } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.root.addChild(t);
    this.effects.push({ node: t, start: now, duration: 1100, x, y, kind: 'float' });
  }

  flash(x: number, y: number, color: number, now: number): void {
    if (!this.enabled) return;
    const g = new Graphics();
    g.circle(0, 0, 18).stroke({ width: 4, color });
    g.position.set(x, y);
    this.root.addChild(g);
    this.effects.push({ node: g, start: now, duration: 450, x, y, kind: 'flash' });
  }

  /** Fortschreiben; true, solange etwas läuft. */
  tick(now: number): boolean {
    for (const e of this.effects) {
      const t = Math.min(1, (now - e.start) / e.duration);
      if (e.kind === 'float') {
        e.node.y = e.y - 28 * t;
        e.node.alpha = 1 - t * t;
      } else {
        e.node.scale.set(1 + t * 1.2);
        e.node.alpha = 1 - t;
      }
    }
    const done = this.effects.filter((e) => now - e.start >= e.duration);
    for (const e of done) e.node.destroy();
    this.effects = this.effects.filter((e) => now - e.start < e.duration);
    return this.effects.length > 0;
  }
}
