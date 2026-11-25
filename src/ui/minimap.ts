import type { GameMap } from '../sim/map';
import { toCss } from '../render/color';
import { minimapColor, PLAYER_COLORS } from '../render/palette';
import { centerX, centerY, COL_W, HEX, liftOf, ROW_H, TILT, worldSize } from '../render/projection';
import type { ViewRect } from '../render/renderer';

const MAX_W = 240;
const MAX_H = 160;

/**
 * Übersichtskarte. Das Kartenbild wird einmal in ein Offscreen-Canvas gemalt;
 * pro Frame wird nur dieses Bild kopiert und der Sichtbereich darübergezeichnet.
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base = document.createElement('canvas');
  private scale = 1;
  private dpr = 1;
  private hasMap = false;
  private worldW = 1;
  private worldH = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onJump: (wx: number, wy: number) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    let dragging = false;
    const jump = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      // Über das tatsächliche Rechteck rechnen – auf Mobilgeräten wird das Canvas per CSS skaliert.
      this.onJump(
        ((e.clientX - rect.left) / rect.width) * this.worldW,
        ((e.clientY - rect.top) / rect.height) * this.worldH,
      );
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.hasMap) return;
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      jump(e);
    });
    canvas.addEventListener('pointermove', (e) => dragging && jump(e));
    canvas.addEventListener('pointerup', () => (dragging = false));
    canvas.addEventListener('pointercancel', () => (dragging = false));
  }

  setMap(map: GameMap, starts: readonly number[]): void {
    const size = worldSize(map);
    this.worldW = size.width;
    this.worldH = size.height;
    this.scale = Math.min(MAX_W / size.width, MAX_H / size.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.round(size.width * this.scale);
    const cssH = Math.round(size.height * this.scale);
    for (const c of [this.canvas, this.base]) {
      c.width = cssW * this.dpr;
      c.height = cssH * this.dpr;
    }
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    const b = this.base.getContext('2d')!;
    b.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    const w = COL_W + 1 / this.scale;
    const h = ROW_H * TILT + 1 / this.scale;
    for (let r = 0; r < map.height; r++) {
      for (let c = 0; c < map.width; c++) {
        const i = r * map.width + c;
        b.fillStyle = toCss(minimapColor(map.terrain[i], map.relief[i], map.feature[i]));
        b.fillRect(centerX(c, r) - COL_W / 2, centerY(r) - (ROW_H * TILT) / 2 + (HEX * TILT) / 2, w, h);
      }
    }
    // Startpositionen als farbige Punkte.
    starts.forEach((s, p) => {
      const c = s % map.width;
      const r = (s / map.width) | 0;
      b.beginPath();
      b.arc(centerX(c, r), centerY(r) - liftOf(map, s), 3.2 / this.scale, 0, Math.PI * 2);
      b.fillStyle = toCss(PLAYER_COLORS[p % PLAYER_COLORS.length]);
      b.fill();
      b.lineWidth = 1 / this.scale;
      b.strokeStyle = '#000';
      b.stroke();
    });
    this.hasMap = true;
  }

  draw(view: ViewRect): void {
    if (!this.hasMap) return;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    ctx.lineWidth = 1.5 / this.scale;
    ctx.strokeStyle = '#ffffff';
    // Bei Weltumrundung den Sichtbereich zusätzlich um ± eine Weltbreite versetzt zeichnen.
    for (const off of [-this.worldW, 0, this.worldW]) {
      ctx.strokeRect(view.x + off, view.y, view.width, view.height);
    }
  }
}
