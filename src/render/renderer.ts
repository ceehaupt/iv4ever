import { Application, BitmapText, Container, Graphics, type Texture } from 'pixi.js';
import type { CityView, UnitView } from '../protocol';
import type { GameMap } from '../sim/map';
import { CityLayer } from './cityLayer';
import { createResourceAtlas, createUnitAtlas } from './icons';
import { buildMapView, changedRows, destroyMapView, type Fog, type MapView, rebuildRow } from './mapView';
import { BACKGROUND } from './palette';
import { centerX, centerY, HEX, liftOf, pickTile, topPoly, worldSize } from './projection';
import { TOKEN_SIZE, tokenPos, UnitLayer } from './unitLayer';
import { EffectsLayer } from './effects';

export interface RendererEvents {
  /** Feld unter dem Mauszeiger (-1 = keins) und Bildschirmposition für Hinweise. */
  onHover(tile: number, x: number, y: number): void;
  /** Linksklick (ohne Ziehen) auf ein Feld. */
  onClick(tile: number): void;
  /** Rechtsklick auf ein Feld (Bewegungsbefehl). */
  onRightClick(tile: number): void;
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
const START_ZOOM = 1;
const DRAG_THRESHOLD = 5;
const KEY_PAN_SPEED = 900; // Bildschirmpixel pro Sekunde

/**
 * Rendert nur bei Bedarf ("dirty"): Ohne Eingabe und Animation steht die GPU still.
 * Ebenen (unten → oben): Karte, Einheiten, Markierungen/Wegvorschau.
 */
export class GameRenderer {
  readonly app = new Application();
  readonly camera = { x: 0, y: 0, zoom: START_ZOOM };
  lastRenderMs = 0;

  private readonly world = new Container();
  private readonly overlay = new Graphics();
  private readonly pathLabels = new Container();
  private units!: UnitLayer;
  private readonly cities = new CityLayer();
  readonly effects = new EffectsLayer();
  private view: MapView | null = null;
  private map: GameMap | null = null;
  private fog: Fog = null;
  private revealAll = false;
  private dirty = true;
  private overlayDirty = true;
  private gridVisible = true;
  private iconsVisible = true;
  private icons: Texture[] = [];
  private hover = -1;
  private selectedTile = -1;
  private selectedUnitTile = -1;
  private path: { from: number; tiles: number[]; turns: number[] } | null = null;
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
    this.pathLabels.eventMode = 'none';
    this.icons = createResourceAtlas();
    this.units = new UnitLayer(createUnitAtlas());
    this.app.stage.addChild(this.world);
    // Reihenfolge: (Karte) · Grenzen/Häuser · Einheiten · Stadtnamen · Stadtfelder · Markierungen
    this.world.addChild(
      this.cities.ground, this.units.root, this.cities.labels, this.cities.work, this.overlay, this.pathLabels, this.effects.root,
    );
    this.host.appendChild(this.app.canvas);
    this.bindInput();
    window.addEventListener('resize', () => {
      this.app.renderer.resize(this.host.clientWidth, this.host.clientHeight);
      this.dirty = true;
    });
    requestAnimationFrame(this.frame);
  }

  // --- Daten ---------------------------------------------------------------

  /** Neue Karte. Gezeichnet wird erst, wenn mit setFog der Nebel bekannt ist. */
  setMap(map: GameMap): void {
    if (this.view) destroyMapView(this.view);
    this.map = map;
    this.fog = null;
    this.view = buildMapView(map);
    this.world.addChildAt(this.view.root, 0);
    this.units.setMap(map, this.view.offsets);
    this.cities.setMap(map, this.view.offsets);
    this.hover = -1;
    this.selectedTile = -1;
    this.selectedUnitTile = -1;
    this.path = null;
    this.camera.zoom = START_ZOOM;
    this.overlayDirty = true;
    this.dirty = true;
  }

  setFog(fog: Uint8Array): void {
    if (!this.map || !this.view) return;
    const prev = this.fog;
    this.fog = fog;
    if (this.revealAll && prev) return;
    const rows = changedRows(this.map, this.revealAll ? null : prev, this.revealAll ? null : fog);
    for (const r of rows) rebuildRow(this.view, this.map, r, this.revealAll ? null : fog, this.icons);
    this.dirty = true;
  }

  /** Felder haben sich verändert (Verbesserung, Straße, Rodung) → betroffene Zeilen neu zeichnen. */
  refreshTiles(tiles: number[]): void {
    if (!this.map || !this.view || !tiles.length) return;
    const fog = this.revealAll ? null : this.fog;
    const rows = new Set<number>();
    for (const t of tiles) {
      const r = (t / this.map.width) | 0;
      // Straßen der Nachbarn zeigen zu diesem Feld → Nachbarzeilen mit neu zeichnen.
      for (const rr of [r - 1, r, r + 1]) if (rr >= 0 && rr < this.map.height) rows.add(rr);
    }
    for (const r of rows) rebuildRow(this.view, this.map, r, fog, this.icons);
    this.dirty = true;
  }

  /** Debug: ganze Karte ohne Nebel zeigen. */
  toggleRevealAll(): boolean {
    this.revealAll = !this.revealAll;
    if (this.map && this.view) {
      const fog = this.revealAll ? null : this.fog;
      for (let r = 0; r < this.map.height; r++) rebuildRow(this.view, this.map, r, fog, this.icons);
    }
    this.dirty = true;
    return this.revealAll;
  }

  /** Gibt die Dauer der Bewegungsanimationen in ms zurück. */
  setUnits(units: UnitView[], human: number, moves: { unit: number; steps: number[] }[]): number {
    const ms = this.units.setUnits(units, human, moves, performance.now());
    this.dirty = true;
    return ms;
  }

  setCities(cities: CityView[], tileOwner: Int16Array, camps: readonly number[] = []): void {
    this.cities.update(cities, tileOwner, camps);
    this.dirty = true;
  }

  /** Stadtansicht: Erträge und bewirtschaftete Felder auf der Karte zeigen (null = aus). */
  setCityFocus(city: CityView | null): void {
    this.cities.setFocus(city);
    this.dirty = true;
  }

  /** Kampf anzeigen: Schaden schwebt über beiden Feldern auf. */
  showCombat(from: number, tile: number, dmgAtt: number, dmgDef: number): void {
    if (!this.map) return;
    const now = performance.now();
    const p = tokenPos(this.map, tile);
    const q = tokenPos(this.map, from);
    this.effects.flash(p.x, p.y, 0xff5a4a, now);
    if (dmgDef) this.effects.floatText(p.x, p.y - 22, `−${dmgDef}`, 0xff6a5a, now);
    if (dmgAtt) this.effects.floatText(q.x, q.y - 22, `−${dmgAtt}`, 0xffb05a, now);
    this.dirty = true;
  }

  /** Alles neu zeichnen, was Spielerfarben nutzt (z. B. nach Farbschema-Wechsel). */
  redrawColors(units: UnitView[], human: number, cities: CityView[], tileOwner: Int16Array, camps: readonly number[]): void {
    this.units.setUnits(units, human, [], performance.now());
    this.cities.update(cities, tileOwner, camps);
    this.dirty = true;
  }

  setSelectedUnit(unitId: number, tile: number): void {
    this.units.setSelected(unitId);
    this.selectedUnitTile = tile;
    this.overlayDirty = true;
    this.dirty = true;
  }

  setSelectedTile(tile: number): void {
    this.selectedTile = tile;
    this.overlayDirty = true;
  }

  setPath(from: number, tiles: number[] | null, turns: number[] | null): void {
    this.path = tiles && turns ? { from, tiles, turns } : null;
    this.overlayDirty = true;
  }

  // --- Kamera ----------------------------------------------------------------

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

  /** Liegt das Feld (mit Rand) im sichtbaren Bereich? */
  isTileOnScreen(i: number, margin = 80): boolean {
    if (!this.map || !this.view) return false;
    const p = tokenPos(this.map, i);
    const v = this.viewRect();
    const m = margin / this.camera.zoom;
    const ww = this.view.worldWidth;
    const inY = p.y >= v.y + m && p.y <= v.y + v.height - m;
    return inY && [-ww, 0, ww].some((off) => p.x + off >= v.x + m && p.x + off <= v.x + v.width - m);
  }

  toggleGrid(): void {
    this.gridVisible = !this.gridVisible;
    this.dirty = true;
  }

  toggleResources(): void {
    this.iconsVisible = !this.iconsVisible;
    this.dirty = true;
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
    if (this.units.animating) {
      this.units.tick(performance.now());
      this.dirty = true;
    }
    if (this.effects.active) {
      this.effects.tick(performance.now());
      this.dirty = true;
    }
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
    // Linienbreiten der Markierungen bleiben auf dem Bildschirm konstant.
    this.overlayDirty = true;
  }

  private drawOverlay(): void {
    this.overlayDirty = false;
    const g = this.overlay;
    g.clear();
    for (const c of this.pathLabels.removeChildren()) c.destroy();
    const map = this.map;
    if (!map || !this.view) return;
    const w = 1 / this.camera.zoom;
    for (const off of this.view.offsets) {
      if (this.hover >= 0 && this.hover !== this.selectedTile) {
        g.poly(this.tileTop(this.hover, off)).stroke({ width: 2 * w, color: 0xffffff, alpha: 0.7 });
      }
      if (this.selectedTile >= 0) {
        g.poly(this.tileTop(this.selectedTile, off)).stroke({ width: 3 * w, color: 0xffd54a, alpha: 1 });
      }
      if (this.selectedUnitTile >= 0) {
        const p = tokenPos(map, this.selectedUnitTile);
        g.circle(p.x + off, p.y, TOKEN_SIZE / 2 + 3).stroke({ width: 3 * w, color: 0xffd54a });
      }
      if (this.path) this.drawPath(g, off, w);
    }
  }

  private drawPath(g: Graphics, off: number, w: number): void {
    const map = this.map!;
    const { from, tiles, turns } = this.path!;
    // Weltkoordinaten entlang der Naht stetig halten (kein Sprung über die ganze Karte).
    const ww = this.view!.worldWidth;
    const pts: { x: number; y: number }[] = [];
    let last = tokenPos(map, from);
    pts.push(last);
    for (const t of tiles) {
      const p = { ...tokenPos(map, t) };
      p.y += TOKEN_RAISE_PATH;
      while (p.x - last.x > ww / 2) p.x -= ww;
      while (last.x - p.x > ww / 2) p.x += ww;
      pts.push(p);
      last = p;
    }
    pts[0] = { x: pts[0].x, y: pts[0].y + TOKEN_RAISE_PATH };
    g.moveTo(pts[0].x + off, pts[0].y);
    for (let k = 1; k < pts.length; k++) g.lineTo(pts[k].x + off, pts[k].y);
    g.stroke({ width: 3 * w, color: 0xffffff, alpha: 0.85, cap: 'round', join: 'round' });

    for (let k = 0; k < tiles.length; k++) {
      const p = pts[k + 1];
      const endOfTurn = k === tiles.length - 1 || turns[k + 1] !== turns[k];
      if (!endOfTurn) {
        g.circle(p.x + off, p.y, 3 * w).fill(0xffffff);
        continue;
      }
      g.circle(p.x + off, p.y, 9 * w).fill({ color: 0x10151f, alpha: 0.9 }).stroke({ width: 2 * w, color: 0xffffff });
      const label = new BitmapText({
        text: String(turns[k] + 1),
        style: { fontFamily: 'Arial', fontSize: 12, fill: 0xffffff, fontWeight: 'bold' },
      });
      label.anchor.set(0.5);
      label.scale.set(w);
      label.position.set(p.x + off, p.y);
      this.pathLabels.addChild(label);
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

  private setHover(tile: number, x = 0, y = 0): void {
    if (tile === this.hover) {
      this.events.onHover(tile, x, y);
      return;
    }
    this.hover = tile;
    this.overlayDirty = true;
    this.events.onHover(tile, x, y);
  }

  private bindInput(): void {
    const canvas = this.app.canvas;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        const t = this.pick(e.offsetX, e.offsetY);
        if (t >= 0) this.events.onRightClick(t);
        return;
      }
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
      this.setHover(this.pick(e.offsetX, e.offsetY), e.clientX, e.clientY);
    });

    const endDrag = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      if (!d.moved && e.type === 'pointerup') this.events.onClick(this.pick(e.offsetX, e.offsetY));
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
      if (isTyping(e) || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (PAN_KEYS.has(k)) {
        this.keys.add(k);
        e.preventDefault();
      } else if (k === '+' || k === '=') {
        this.zoomAt(this.app.screen.width / 2, this.app.screen.height / 2, 1.2);
      } else if (k === '-') {
        this.zoomAt(this.app.screen.width / 2, this.app.screen.height / 2, 1 / 1.2);
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

/** Wegpunkte liegen etwas unter der Plakette, auf Höhe der Feldoberfläche. */
const TOKEN_RAISE_PATH = 10;

const PAN_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
}
