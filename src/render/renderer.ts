import { Application, Container, Graphics, type Texture } from 'pixi.js';
import type { GameMap } from '../sim/map';
import { createResourceAtlas } from './icons';
import { BACKGROUND } from './palette';
import { buildMapView, destroyMapView, type MapView } from './mapView';
import { centerX, centerY, HEX, liftOf, pickTile, topPoly, worldSize } from './projection';

export interface RendererEvents {
  onHover(tile: number): void;
  onSelect(tile: number): void;
  /** Kamera oder Bild hat sich geändert (für Minimap/Statistik). */
  onFrame(): void;
}

export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const GRID_MIN_ZOOM = 0.45;
const ICON_MIN_ZOOM = 0.38;
const START_ZOOM = 0.7;
const DRAG_THRESHOLD = 5;
const KEY_PAN_SPEED = 900; // Bildschirmpixel pro Sekunde

/**
 * Rendert nur bei Bedarf ("dirty"): Ohne Eingabe steht die GPU still.
 * Eingaben (Maus, Rad, Tastatur, Trackpad-Pinch) steuern eine einfache 2D-Kamera.
 */
export class GameRenderer {
  readonly app = new Application();
  readonly camera = { x: 0, y: 0, zoom: 1 };
  lastRenderMs = 0;

  private readonly world = new Container();
  private readonly overlay = new Graphics();
  private view: MapView | null = null;
  private map: GameMap | null = null;
  private dirty = true;
  private overlayDirty = true;
  private gridVisible = true;
  private iconsVisible = true;
  private icons: Texture[] = [];
  private hover = -1;
  private selected = -1;
  private readonly keys = new Set<string>();
  private lastTime = 0;
  private drag: { id: number; x: number; y: number; moved: boolean } | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly events: RendererEvents,
  ) {}

  async init(): Promise<void> {
    await this.app.init({
      width: this.host.clientWidth,
      height: this.host.clientHeight,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      background: BACKGROUND,
      autoStart: false,
      sharedTicker: false,
      preference: 'webgl',
      // Pixi-eigenes Event-System wird nicht gebraucht – Eingaben laufen direkt über das Canvas.
      eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
    });
    this.app.ticker.stop();
    this.app.stage.eventMode = 'none';
    this.world.eventMode = 'none';
    this.overlay.eventMode = 'none';
    this.app.stage.addChild(this.world);
    this.world.addChild(this.overlay);
    this.host.appendChild(this.app.canvas);
    this.icons = createResourceAtlas();
    this.bindInput();
    window.addEventListener('resize', () => {
      this.app.renderer.resize(this.host.clientWidth, this.host.clientHeight);
      this.dirty = true;
    });
    requestAnimationFrame(this.frame);
  }

  setMap(map: GameMap, starts: readonly number[]): void {
    if (this.view) destroyMapView(this.view);
    this.map = map;
    this.view = buildMapView(map, starts, this.icons);
    this.world.addChildAt(this.view.root, 0);
    this.hover = -1;
    this.selected = -1;
    this.camera.zoom = START_ZOOM;
    if (starts.length) this.centerOnTile(starts[0]);
    else {
      const size = worldSize(map);
      this.centerOn(size.width / 2, size.height / 2);
    }
    this.overlayDirty = true;
    this.dirty = true;
  }

  centerOnTile(i: number): void {
    if (!this.map) return;
    const c = i % this.map.width;
    const r = (i / this.map.width) | 0;
    this.centerOn(centerX(c, r), centerY(r) - liftOf(this.map, i));
  }

  centerOn(wx: number, wy: number): void {
    this.camera.x = wx;
    this.camera.y = wy;
    this.dirty = true;
  }

  toggleGrid(): void {
    this.gridVisible = !this.gridVisible;
    this.dirty = true;
  }

  toggleResources(): void {
    this.iconsVisible = !this.iconsVisible;
    this.dirty = true;
  }

  /** Weltbreite einer Periode (für Minimap bei Umrundung). */
  get worldWidth(): number {
    return this.view?.worldWidth ?? 0;
  }

  viewRect(): ViewRect {
    const { width, height } = this.app.screen;
    const z = this.camera.zoom;
    return {
      x: this.camera.x - width / 2 / z,
      y: this.camera.y - height / 2 / z,
      width: width / z,
      height: height / z,
    };
  }

  // --- Frame-Schleife ------------------------------------------------------

  private frame = (time: number): void => {
    const dt = Math.min(0.05, (time - this.lastTime) / 1000 || 0);
    this.lastTime = time;
    this.applyKeyboard(dt);
    if (this.dirty || this.overlayDirty) {
      this.dirty = false;
      this.applyCamera();
      if (this.overlayDirty) this.drawOverlay();
      const t0 = performance.now();
      this.app.renderer.render(this.app.stage);
      this.lastRenderMs = performance.now() - t0;
      this.events.onFrame();
    }
    requestAnimationFrame(this.frame);
  };

  private applyCamera(): void {
    const { width, height } = this.app.screen;
    if (this.map) {
      const size = worldSize(this.map);
      if (this.map.wrapX) {
        // Mit drei Instanzen darf der Sichtbereich höchstens zwei Weltbreiten umfassen.
        this.camera.zoom = Math.max(this.camera.zoom, width / (2 * size.width));
        this.camera.x = ((this.camera.x % size.width) + size.width) % size.width;
      } else {
        this.camera.x = Math.max(0, Math.min(size.width, this.camera.x));
      }
      this.camera.y = Math.max(0, Math.min(size.height, this.camera.y));
    }
    const z = this.camera.zoom;
    this.world.scale.set(z);
    this.world.position.set(width / 2 - this.camera.x * z, height / 2 - this.camera.y * z);

    if (!this.view) return;
    const top = this.camera.y - height / 2 / z;
    const bottom = this.camera.y + height / 2 / z;
    const left = this.camera.x - width / 2 / z;
    const right = this.camera.x + width / 2 / z;
    const ww = this.view.worldWidth;
    const showGrid = this.gridVisible && z >= GRID_MIN_ZOOM;
    const showIcons = this.iconsVisible && z >= ICON_MIN_ZOOM;
    const copyVisible = this.view.offsets.map((off) => off + ww + HEX >= left && off - HEX <= right);
    for (const row of this.view.rows) {
      const rowVisible = row.maxY >= top && row.minY <= bottom;
      for (let k = 0; k < copyVisible.length; k++) {
        const v = rowVisible && copyVisible[k];
        row.terrain[k].visible = v;
        row.rivers[k].visible = v;
        row.grid[k].visible = v && showGrid;
        row.icons[k].visible = v && showIcons;
      }
    }
    this.view.markers.forEach((m, k) => (m.visible = copyVisible[k]));
    // Linienbreite der Markierung bleibt auf dem Bildschirm konstant.
    this.overlayDirty = true;
  }

  private drawOverlay(): void {
    this.overlayDirty = false;
    const g = this.overlay;
    g.clear();
    if (!this.map || !this.view) return;
    const w = 1 / this.camera.zoom;
    for (const off of this.view.offsets) {
      if (this.hover >= 0 && this.hover !== this.selected) {
        g.poly(this.tileTop(this.hover, off)).stroke({ width: 2 * w, color: 0xffffff, alpha: 0.85 });
      }
      if (this.selected >= 0) {
        g.poly(this.tileTop(this.selected, off)).stroke({ width: 3 * w, color: 0xffd54a, alpha: 1 });
      }
    }
  }

  private tileTop(i: number, offset: number): number[] {
    const map = this.map!;
    const c = i % map.width;
    const r = (i / map.width) | 0;
    return topPoly(centerX(c, r) + offset, centerY(r) - liftOf(map, i));
  }

  // --- Eingabe -------------------------------------------------------------

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const { width, height } = this.app.screen;
    const z = this.camera.zoom;
    return { x: (sx - width / 2) / z + this.camera.x, y: (sy - height / 2) / z + this.camera.y };
  }

  private pick(sx: number, sy: number): number {
    if (!this.map) return -1;
    const p = this.screenToWorld(sx, sy);
    return pickTile(this.map, p.x, p.y);
  }

  private zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.camera.zoom * factor));
    const { width, height } = this.app.screen;
    this.camera.x = before.x - (sx - width / 2) / this.camera.zoom;
    this.camera.y = before.y - (sy - height / 2) / this.camera.zoom;
    this.dirty = true;
  }

  private setHover(tile: number): void {
    if (tile === this.hover) return;
    this.hover = tile;
    this.overlayDirty = true;
    this.events.onHover(tile);
  }

  private bindInput(): void {
    const canvas = this.app.canvas;
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.drag) return;
      canvas.setPointerCapture(e.pointerId);
      this.drag = { id: e.pointerId, x: e.offsetX, y: e.offsetY, moved: false };
    });

    canvas.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (d && d.id === e.pointerId) {
        const dx = e.offsetX - d.x;
        const dy = e.offsetY - d.y;
        if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        d.moved = true;
        d.x = e.offsetX;
        d.y = e.offsetY;
        this.camera.x -= dx / this.camera.zoom;
        this.camera.y -= dy / this.camera.zoom;
        this.dirty = true;
        return;
      }
      this.setHover(this.pick(e.offsetX, e.offsetY));
    });

    const endDrag = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      if (!d.moved && e.type === 'pointerup') {
        this.selected = this.pick(e.offsetX, e.offsetY);
        this.overlayDirty = true;
        this.events.onSelect(this.selected);
      }
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', () => {
      if (!this.drag) this.setHover(-1);
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        // Trackpad-Pinch kommt als wheel-Event mit ctrlKey.
        const speed = e.ctrlKey ? 0.01 : 0.0015;
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        this.zoomAt(e.offsetX, e.offsetY, Math.exp(-delta * speed));
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      const k = e.key.toLowerCase();
      if (PAN_KEYS.has(k)) {
        this.keys.add(k);
        e.preventDefault();
      } else if (k === '+' || k === '=') {
        this.zoomAt(this.app.screen.width / 2, this.app.screen.height / 2, 1.2);
      } else if (k === '-') {
        this.zoomAt(this.app.screen.width / 2, this.app.screen.height / 2, 1 / 1.2);
      } else if (k === 'escape') {
        this.selected = -1;
        this.overlayDirty = true;
        this.events.onSelect(-1);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private applyKeyboard(dt: number): void {
    if (this.keys.size === 0 || dt === 0) return;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    if (dx === 0 && dy === 0) return;
    const step = (KEY_PAN_SPEED * dt) / this.camera.zoom;
    this.camera.x += dx * step;
    this.camera.y += dy * step;
    this.dirty = true;
  }
}

const PAN_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
}
