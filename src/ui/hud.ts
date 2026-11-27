import type { NewGameOptions } from '../protocol';
import { type GameMap, type Knows, resourceActive, tileYields, touchesRiver } from '../sim/map';
import { IMPROVEMENTS, RESOURCE_IMPROVEMENT } from '../sim/rules/improvements';
import { TECHS, TechId } from '../sim/rules/techs';
import { isWater } from '../sim/rules/terrain';
import type { Climate, Elimination, MapScript, SeaLevel } from '../sim/mapgen';
import { type Difficulty, DIFFICULTY_NAMES, PERSONAS } from '../sim/rules/leaders';
import { slotColor } from '../render/palette';
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

/** Kopfleiste (neues Spiel) und Feldinfo. */
export class Hud {
  onNewMap: (options: NewGameOptions) => void = () => {};
  /** Wird vor einem neuen Spiel gefragt; false bricht ab. */
  confirmDiscard: () => boolean = () => true;

  private readonly size = $<HTMLSelectElement>('size');
  private readonly script = $<HTMLSelectElement>('script');
  private readonly sea = $<HTMLSelectElement>('sea');
  private readonly climate = $<HTMLSelectElement>('climate');
  private readonly difficulty = $<HTMLSelectElement>('difficulty');
  private readonly elimination = $<HTMLSelectElement>('elimination');
  private readonly leader = $<HTMLSelectElement>('leader');
  private readonly leaderSwatch = $('leader-swatch');
  private readonly mode = $<HTMLSelectElement>('mode');
  private readonly seed = $<HTMLInputElement>('seed');
  private readonly stats = $('stats');
  private readonly dialog = $('newgame');
  private readonly opener = $<HTMLButtonElement>('newgamebtn');
  private readonly info = $('info');
  private pinned = -1;
  /** Technologiestand des Spielers – beeinflusst Erträge in der Feldinfo. */
  knows: Knows = () => false;

  constructor() {
    fill(
      this.size,
      MAP_SIZES.map((s) => [s.key, `${s.name} (${s.width}×${s.height}, ${s.players} Spieler)`] as const),
      'standard',
    );
    fill(this.script, SCRIPTS, 'continents');
    fill(this.sea, SEA_LEVELS, 'normal');
    fill(this.climate, CLIMATES, 'temperate');
    fill(this.difficulty, Object.entries(DIFFICULTY_NAMES) as [Difficulty, string][], 'normal');
    fill(this.leader, [['', 'Zufällig'], ...PERSONAS.map((p, i) => [String(i), `${p.people} (${p.leader})`] as const)], '');
    this.leader.addEventListener('change', () => this.updateSwatch());
    this.updateSwatch();
    fill(this.elimination, [['cities', 'ohne Städte'], ['units', 'ohne Städte und Einheiten']], 'cities');
    fill(this.mode, [['single', 'Einzelspieler'], ['hotseat2', 'Hotseat (2)'], ['hotseat3', 'Hotseat (3)'], ['hotseat4', 'Hotseat (4)'], ['online', 'Online …']], 'single');
    $('newmap').addEventListener('click', () => this.startFromDialog(true));
    this.seed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.startFromDialog(false);
    });
    this.opener.addEventListener('click', () => (this.dialog.hidden ? this.openDialog() : this.closeDialog()));
    // Schließen: ✕, „Schließen“ oder Klick auf den abgedunkelten Hintergrund.
    this.dialog.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.dialog || t.closest('[data-close]')) this.closeDialog();
    });
    // Tasten im Dialog nicht ans Spiel durchreichen; Esc schließt.
    this.dialog.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.closeDialog();
    });
  }

  get dialogOpen(): boolean {
    return !this.dialog.hidden;
  }

  openDialog(): void {
    this.dialog.hidden = false;
    this.opener.setAttribute('aria-expanded', 'true');
    this.size.focus();
  }

  closeDialog(): void {
    if (this.dialog.hidden) return;
    this.dialog.hidden = true;
    this.opener.setAttribute('aria-expanded', 'false');
    this.opener.focus();
    this.opener.blur();
  }

  private startFromDialog(randomSeed: boolean): void {
    if (!this.confirmDiscard()) return;
    this.closeDialog();
    this.requestNewMap(randomSeed, false);
  }

  /** Neues Spiel. randomSeed = true würfelt neu, sonst wird der Seed aus dem Eingabefeld genommen. */
  requestNewMap(randomSeed: boolean, ask = true): void {
    if (ask && !this.confirmDiscard()) return;
    let seed = Number.parseInt(this.seed.value, 10);
    if (randomSeed || !Number.isFinite(seed)) seed = Math.floor(Math.random() * 1_000_000);
    this.seed.value = String(seed);
    // Fokus zurück aufs Spiel, sonst landen Tastenkürzel im Eingabefeld.
    (document.activeElement as HTMLElement | null)?.blur();
    this.unpin();
    this.onNewMap(this.currentOptions(seed));
  }

  /** Aktuelle Einstellungen der Kopfleiste (Seed aus dem Feld bzw. übergeben). */
  currentOptions(seedArg?: number): NewGameOptions {
    const seed = seedArg ?? (Number.parseInt(this.seed.value, 10) || Math.floor(Math.random() * 1_000_000));
    const s = MAP_SIZES.find((m) => m.key === this.size.value) ?? MAP_SIZES[2];
    const m = this.mode.value;
    const mode = m.startsWith('hotseat') ? 'hotseat' : m === 'online' ? 'online' : 'single';
    return {
      mode,
      humans: mode === 'hotseat' ? Number(m.slice(7)) : 1,
      width: s.width,
      height: s.height,
      players: s.players,
      seed,
      script: this.script.value as MapScript,
      seaLevel: this.sea.value as SeaLevel,
      climate: this.climate.value as Climate,
      difficulty: this.difficulty.value as Difficulty,
      elimination: this.elimination.value as Elimination,
      ...(this.leader.value !== '' ? { leader: Number(this.leader.value) } : {}),
    };
  }

  /** Einstellungen eines geladenen Spiels in die Kopfleiste übernehmen. */
  showOptions(o: NewGameOptions): void {
    const s = MAP_SIZES.find((m) => m.width === o.width && m.height === o.height);
    if (s) this.size.value = s.key;
    this.script.value = o.script;
    this.sea.value = o.seaLevel;
    this.climate.value = o.climate;
    this.difficulty.value = o.difficulty ?? 'normal';
    this.elimination.value = o.elimination ?? 'cities';
    this.leader.value = o.leader !== undefined ? String(o.leader) : '';
    this.updateSwatch();
    this.seed.value = String(o.seed);
  }

  /** Farbfeld neben der Volksauswahl (leer bei „Zufällig“). */
  private updateSwatch(): void {
    const v = this.leader.value;
    this.leaderSwatch.style.background = v === '' ? 'transparent' : `#${slotColor(Number(v)).toString(16).padStart(6, '0')}`;
    this.leaderSwatch.style.visibility = v === '' ? 'hidden' : 'visible';
  }

  setStats(text: string): void {
    this.stats.textContent = text;
  }

  hoverTile(map: GameMap | null, fog: Uint8Array | null, i: number): void {
    if (this.pinned < 0) this.showTile(map, fog, i);
  }

  selectTile(map: GameMap | null, fog: Uint8Array | null, i: number): void {
    this.pinned = i;
    this.showTile(map, fog, i);
  }

  unpin(): void {
    this.pinned = -1;
    this.info.hidden = true;
  }

  private showTile(map: GameMap | null, fog: Uint8Array | null, i: number): void {
    if (!map || i < 0) {
      this.info.hidden = true;
      return;
    }
    const c = i % map.width;
    const r = (i / map.width) | 0;
    this.info.hidden = false;
    if (fog && fog[i] === 0) {
      this.info.innerHTML = `<h2>Unerforschtes Gebiet</h2><dl><dt>Feld</dt><dd>${c}, ${r}</dd></dl>`;
      return;
    }
    const t = map.terrain[i];
    const rl = map.relief[i];
    const f = map.feature[i];
    const y = tileYields(map, i, this.knows);
    const move = tileMoveCost(t, rl, f);
    const def = tileDefense(rl, f);
    const res = RESOURCES[map.resource[i]];
    const rows: string[] = [];
    if (res) {
      let hint = '';
      if (!resourceActive(map, i, this.knows)) {
        hint = isWater(t)
          ? ` <small>– braucht ${TECHS[TechId.Fishing].name}</small>`
          : ` <small>– braucht ${IMPROVEMENTS[RESOURCE_IMPROVEMENT[res.key]]?.name ?? 'Verbesserung'}</small>`;
      }
      rows.push(`<dt>Ressource</dt><dd>${res.icon} ${res.name} <small>(${RESOURCE_KIND_NAME[res.kind]})</small>${hint}</dd>`);
    }
    const imp = IMPROVEMENTS[map.improvement[i]];
    if (imp || map.road[i]) {
      rows.push(`<dt>Ausbau</dt><dd>${[imp ? `${imp.icon} ${imp.name}` : '', map.road[i] ? '🛤️ Straße' : ''].filter(Boolean).join(' · ')}</dd>`);
    }
    if (map.pollution[i]) rows.push(`<dt>Umwelt</dt><dd>verschmutzt: −1 auf jeden Ertrag (Arbeiter: Säubern)</dd>`);
    if (touchesRiver(map, i)) rows.push(`<dt>Fluss</dt><dd>+1 Handel, +${RIVER_DEFENSE} % gegen Angriffe über den Fluss</dd>`);
    rows.push(`<dt>Bewegung</dt><dd>${Number.isFinite(move) ? move : 'unpassierbar'}</dd>`);
    rows.push(`<dt>Verteidigung</dt><dd>${def > 0 ? `+${def} %` : '–'}</dd>`);
    rows.push(`<dt>Feld</dt><dd>${c}, ${r}${fog && fog[i] === 1 ? ' · im Nebel' : ''}</dd>`);
    this.info.innerHTML = `
      <h2>${tileName(t, rl, f)}</h2>
      <div class="yields">
        <span title="Nahrung">🌾 ${y.food}</span>
        <span title="Produktion">⚒️ ${y.prod}</span>
        <span title="Handel">💰 ${y.trade}</span>
      </div>
      <dl>${rows.join('')}</dl>`;
  }
}
