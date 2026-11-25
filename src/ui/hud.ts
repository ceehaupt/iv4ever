import type { NewGameOptions } from '../protocol';
import { toCss } from '../render/color';
import { PLAYER_COLORS } from '../render/palette';
import { type GameMap, tileYields, touchesRiver } from '../sim/map';
import type { Climate, MapScript, SeaLevel } from '../sim/mapgen';
import { RESOURCE_KIND_NAME, RESOURCES } from '../sim/rules/resources';
import { RIVER_DEFENSE, tileDefense, tileMoveCost, tileName } from '../sim/rules/terrain';

export interface MapSize {
  key: string;
  name: string;
  width: number;
  height: number;
  players: number;
}

export const MAP_SIZES: readonly MapSize[] = [
  { key: 'duel', name: 'Duell', width: 48, height: 30, players: 2 },
  { key: 'small', name: 'Klein', width: 64, height: 40, players: 4 },
  { key: 'standard', name: 'Standard', width: 84, height: 52, players: 6 },
  { key: 'large', name: 'Groß', width: 108, height: 68, players: 8 },
  { key: 'huge', name: 'Riesig', width: 140, height: 88, players: 10 },
];

const SCRIPTS: readonly [MapScript, string][] = [
  ['continents', 'Kontinente'],
  ['pangaea', 'Pangäa'],
  ['archipelago', 'Archipel'],
];
const SEA_LEVELS: readonly [SeaLevel, string][] = [
  ['low', 'niedrig'],
  ['normal', 'normal'],
  ['high', 'hoch'],
];
const CLIMATES: readonly [Climate, string][] = [
  ['cool', 'kühl'],
  ['temperate', 'gemäßigt'],
  ['warm', 'warm'],
];

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} fehlt in index.html`);
  return el as T;
}

function fill(select: HTMLSelectElement, entries: readonly (readonly [string, string])[], selected: string): void {
  for (const [value, label] of entries) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    o.selected = value === selected;
    select.append(o);
  }
}

/** Bedienoberfläche als schlankes DOM über dem Canvas. */
export class Hud {
  onNewMap: (options: NewGameOptions) => void = () => {};

  private readonly size = $<HTMLSelectElement>('size');
  private readonly script = $<HTMLSelectElement>('script');
  private readonly sea = $<HTMLSelectElement>('sea');
  private readonly climate = $<HTMLSelectElement>('climate');
  private readonly seed = $<HTMLInputElement>('seed');
  private readonly stats = $('stats');
  private readonly info = $('info');
  private pinned = -1;
  private starts: readonly number[] = [];

  constructor() {
    fill(
      this.size,
      MAP_SIZES.map((s) => [s.key, `${s.name} (${s.width}×${s.height}, ${s.players} Spieler)`] as const),
      'standard',
    );
    fill(this.script, SCRIPTS, 'continents');
    fill(this.sea, SEA_LEVELS, 'normal');
    fill(this.climate, CLIMATES, 'temperate');
    $('newmap').addEventListener('click', () => this.requestNewMap(true));
    for (const s of [this.size, this.script, this.sea, this.climate]) {
      s.addEventListener('change', () => this.requestNewMap(false));
    }
    this.seed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.requestNewMap(false);
    });
  }

  /** randomSeed = true würfelt neu, sonst wird der Seed aus dem Eingabefeld genommen. */
  requestNewMap(randomSeed: boolean): void {
    let seed = Number.parseInt(this.seed.value, 10);
    if (randomSeed || !Number.isFinite(seed)) seed = Math.floor(Math.random() * 1_000_000);
    this.seed.value = String(seed);
    const s = MAP_SIZES.find((m) => m.key === this.size.value) ?? MAP_SIZES[2];
    this.pinned = -1;
    this.info.hidden = true;
    this.onNewMap({
      width: s.width,
      height: s.height,
      players: s.players,
      seed,
      script: this.script.value as MapScript,
      seaLevel: this.sea.value as SeaLevel,
      climate: this.climate.value as Climate,
    });
  }

  setStarts(starts: readonly number[]): void {
    this.starts = starts;
  }

  setStats(text: string): void {
    this.stats.textContent = text;
  }

  hoverTile(map: GameMap | null, i: number): void {
    if (this.pinned < 0) this.showTile(map, i);
  }

  selectTile(map: GameMap | null, i: number): void {
    this.pinned = i;
    this.showTile(map, i);
  }

  private showTile(map: GameMap | null, i: number): void {
    if (!map || i < 0) {
      this.info.hidden = true;
      return;
    }
    const t = map.terrain[i];
    const rl = map.relief[i];
    const f = map.feature[i];
    const y = tileYields(map, i);
    const move = tileMoveCost(t, rl, f);
    const def = tileDefense(rl, f);
    const river = touchesRiver(map, i);
    const res = RESOURCES[map.resource[i]];
    const start = this.starts.indexOf(i);
    const c = i % map.width;
    const r = (i / map.width) | 0;
    const rows: string[] = [];
    if (res) rows.push(`<dt>Ressource</dt><dd>${res.icon} ${res.name} <small>(${RESOURCE_KIND_NAME[res.kind]})</small></dd>`);
    if (river) rows.push(`<dt>Fluss</dt><dd>ja – +1 Handel, +${RIVER_DEFENSE} % gegen Angriffe über den Fluss</dd>`);
    rows.push(`<dt>Bewegung</dt><dd>${Number.isFinite(move) ? move : 'unpassierbar'}</dd>`);
    rows.push(`<dt>Verteidigung</dt><dd>${def > 0 ? `+${def} %` : '–'}</dd>`);
    if (start >= 0) {
      const color = toCss(PLAYER_COLORS[start % PLAYER_COLORS.length]);
      rows.push(`<dt>Start</dt><dd><span class="swatch" style="background:${color}"></span>${start === 0 ? 'Du' : `Spieler ${start + 1}`}</dd>`);
    }
    rows.push(`<dt>Feld</dt><dd>${c}, ${r}</dd>`);
    this.info.hidden = false;
    this.info.innerHTML = `
      <h2>${tileName(t, rl, f)}</h2>
      <div class="yields">
        <span title="Nahrung">🌾 ${y.food}</span>
        <span title="Produktion">⚒️ ${y.prod}</span>
        <span title="Handel">💰 ${y.trade}</span>
      </div>
      <dl>${rows.join('')}</dl>
      ${this.pinned >= 0 ? '<p class="hint">Esc: Auswahl aufheben</p>' : ''}`;
  }
}
