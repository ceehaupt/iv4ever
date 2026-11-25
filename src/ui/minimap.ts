import type { CityView, UnitView } from '../protocol';
import { mix, shade, toCss } from '../render/color';
import { BACKGROUND, minimapColor, playerColor } from '../render/palette';
import { centerX, centerY, COL_W, HEX, liftOf, ROW_H, TILT, worldSize } from '../render/projection';
import type { ViewRect } from '../render/renderer';
import type { GameMap } from '../sim/map';

const MAX_W = 240;
const MAX_H = 160;

/**
 * Übersichtskarte. Das Kartenbild (inkl. Nebel und Einheiten) wird bei Änderungen einmal
 * in ein Offscreen-Canvas gemalt; pro Frame wird nur dieses Bild kopiert und der Sichtbereich darübergezeichnet.
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base = document.createElement('canvas');
  private scale = 1;
  private dpr = 1;
  private map: GameMap | null = null;
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
      if (!this.map) return;
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      jump(e);
    });
    canvas.addEventListener('pointermove', (e) => dragging && jump(e));
    canvas.addEventListener('pointerup', () => (dragging = false));
    canvas.addEventListener('pointercancel', () => (dragging = false));
  }

  setMap(map: GameMap): void {
    this.map = map;
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
  }

  /** Kartenbild neu malen: fog = null zeigt alles. */
  update(fog: Uint8Array | null, units: readonly UnitView[], tileOwner: Int16Array | null, cities: readonly CityView[]): void {
    const map = this.map;
    if (!map) return;
    const b = this.base.getContext('2d')!;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.fillStyle = toCss(BACKGROUND);
    b.fillRect(0, 0, this.base.width, this.base.height);
    b.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    const w = COL_W + 1 / this.scale;
    const h = ROW_H * TILT + 1 / this.scale;
    for (let r = 0; r < map.height; r++) {
      for (let c = 0; c < map.width; c++) {
        const i = r * map.width + c;
        const f = fog ? fog[i] : 2;
        if (f === 0) continue;
        let color = minimapColor(map.terrain[i], map.relief[i], map.feature[i]);
        const o = tileOwner ? tileOwner[i] : -1;
        if (o >= 0) color = mix(color, playerColor(o), 0.45);
        b.fillStyle = toCss(f === 2 ? color : shade(color, 0.55));
        b.fillRect(centerX(c, r) - COL_W / 2, centerY(r) - (ROW_H * TILT) / 2 + (HEX * TILT) / 2, w, h);
      }
    }
    for (const c of cities) {
      const cc = c.tile % map.width;
      const r = (c.tile / map.width) | 0;
      const s = 4.5 / this.scale;
      b.fillStyle = '#ffffff';
      b.fillRect(centerX(cc, r) - s / 2 - 1 / this.scale, centerY(r) - s / 2 - 1 / this.scale, s + 2 / this.scale, s + 2 / this.scale);
      b.fillStyle = toCss(playerColor(c.owner));
      b.fillRect(centerX(cc, r) - s / 2, centerY(r) - s / 2, s, s);
    }
    for (const u of units) {
      const c = u.tile % map.width;
      const r = (u.tile / map.width) | 0;
      b.beginPath();
      b.arc(centerX(c, r), centerY(r) - liftOf(map, u.tile), 2.6 / this.scale, 0, Math.PI * 2);
      b.fillStyle = toCss(playerColor(u.owner));
      b.fill();
      b.lineWidth = 0.8 / this.scale;
      b.strokeStyle = '#000';
      b.stroke();
    }
  }

  draw(view: ViewRect): void {
    if (!this.map) return;
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
