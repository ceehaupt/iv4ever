// Karteneditor: Karte malen, Startfelder setzen, als Szenario speichern oder direkt spielen.
// Eigene Seite (editor.html), nutzt den Renderer des Spiels; die Simulation läuft hier nicht.
import '../style.css';
import type { UnitView } from '../protocol';
import { GameRenderer, isTyping } from '../render/renderer';
import { tileDistance, tilesAround } from '../sim/hex';
import { createMap, touchesRiver } from '../sim/map';
import { generateWorld, type MapScript } from '../sim/mapgen';
import { RESOURCES } from '../sim/rules/resources';
import { Feature, FEATURE, isWater, RELIEF, TERRAIN, Terrain, tileName } from '../sim/rules/terrain';
import { UnitTypeId } from '../sim/rules/units';
import {
  clearRivers, decodeScenario, encodeScenario, MAX_STARTS, MIN_START_DISTANCE, type Scenario, startBlocker, tidyTile,
  toggleRiverEdge, validateScenario,
} from '../sim/scenario';
import { MAP_SIZES } from '../ui/hud';
import { EDITOR_DRAFT, SCENARIO_STORAGE } from './shared';

type Tool =
  | { kind: 'terrain'; value: number }
  | { kind: 'relief'; value: number }
  | { kind: 'feature'; value: number }
  | { kind: 'resource'; value: number }
  | { kind: 'river' }
  | { kind: 'unriver' }
  | { kind: 'start' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const SCRIPTS: [MapScript, string][] = [['continents', 'Kontinente'], ['pangaea', 'Pangäa'], ['archipelago', 'Archipel']];
const UNDO_LIMIT = 50;

let sc: Scenario = blankScenario(MAP_SIZES[1].width, MAP_SIZES[1].height);
let tool: Tool = { kind: 'terrain', value: Terrain.Grassland };
let brush = 0;
let riverFrom = -1;
const undo: string[] = [];

function blankScenario(width: number, height: number, seed = 1): Scenario {
  const map = createMap(width, height, seed, true);
  return { name: 'Neues Szenario', description: '', map, starts: [] };
}

function randomScenario(width: number, height: number, players: number, script: MapScript): Scenario {
  const seed = Math.floor(Math.random() * 1_000_000);
  const world = generateWorld({ width, height, seed, players, script });
  return { name: 'Neues Szenario', description: '', map: world.map, starts: world.starts };
}

// --- Darstellung --------------------------------------------------------------------

const renderer = new GameRenderer($('game'), {
  onHover: (tile) => showTile(tile),
  onClick: (tile) => paint(tile),
  onRightClick: () => {
    riverFrom = -1;
    renderStatus();
  },
  onFrame: () => {},
});
await renderer.init();

function loadIntoView(): void {
  renderer.setMap(sc.map);
  renderer.setFog(new Uint8Array(sc.map.width * sc.map.height).fill(2));
  drawStarts();
  renderer.centerOnTile(sc.starts[0] ?? ((sc.map.height >> 1) * sc.map.width + (sc.map.width >> 1)));
  renderTools();
  renderStatus();
}

/** Startfelder als Siedler in den Farben der Völker. */
function drawStarts(): void {
  const units: UnitView[] = sc.starts.map((tile, k) => ({
    id: k + 1, type: UnitTypeId.Settler, owner: k, tile, moves: 0, maxMoves: 0, orders: 0, path: null, job: null,
    hp: 100, xp: 0, promotions: [], xpNext: 0, promotable: [], carriedBy: null, auto: false,
  }));
  renderer.setUnits(units, -1, []);
}

function showTile(i: number): void {
  const el = $('stats');
  if (i < 0) {
    el.textContent = '';
    return;
  }
  const m = sc.map;
  const res = RESOURCES[m.resource[i]];
  const start = sc.starts.indexOf(i);
  el.textContent = [
    `${i % m.width}, ${(i / m.width) | 0}`,
    tileName(m.terrain[i], m.relief[i], m.feature[i]),
    res ? res.name : '',
    touchesRiver(m, i) ? 'Fluss' : '',
    start >= 0 ? `Start ${start + 1}` : '',
  ].filter(Boolean).join(' · ');
}

// --- Werkzeuge ----------------------------------------------------------------------

function same(a: Tool, b: Tool): boolean {
  return a.kind === b.kind && ('value' in a ? a.value === (b as { value: number }).value : true);
}

function renderTools(): void {
  const btn = (t: Tool, label: string, title = label) =>
    `<button type="button" data-tool='${JSON.stringify(t)}' aria-pressed="${same(t, tool)}" title="${title}">${label}</button>`;
  const res = RESOURCES.map((r, id) => (r ? `<option value="${id}" ${tool.kind === 'resource' && tool.value === id ? 'selected' : ''}>${r.icon} ${r.name}</option>` : ''))
    .join('');
  $('ed-tools').innerHTML = `
    <h3>Gelände</h3><div class="tools">${TERRAIN.map((t, id) => btn({ kind: 'terrain', value: id }, t.name)).join('')}</div>
    <h3>Höhe</h3><div class="tools">${RELIEF.map((r, id) => btn({ kind: 'relief', value: id }, r.name)).join('')}</div>
    <h3>Bewuchs</h3><div class="tools">${FEATURE.map((f, id) => btn({ kind: 'feature', value: id }, f.name || 'ohne')).join('')}</div>
    <h3>Ressource</h3><div class="tools">
      ${btn({ kind: 'resource', value: 0 }, 'entfernen')}
      <select id="ed-resource" aria-label="Ressource setzen"><option value="">Ressource setzen …</option>${res}</select></div>
    <h3>Flüsse</h3><div class="tools">
      ${btn({ kind: 'river' }, 'Fluss ziehen', 'Zwei benachbarte Felder nacheinander anklicken: Fluss auf der gemeinsamen Kante an/aus')}
      ${btn({ kind: 'unriver' }, 'Flüsse entfernen')}</div>
    <h3>Völker</h3><div class="tools">
      ${btn({ kind: 'start' }, 'Startfeld', `Klick setzt bzw. entfernt ein Startfeld (Spieler 1 = Mensch, höchstens ${MAX_STARTS})`)}</div>
    <h3>Pinsel</h3><div class="tools">
      ${[0, 1, 2].map((b) => `<button type="button" data-brush="${b}" aria-pressed="${b === brush}">${b ? `Radius ${b}` : 'Einzeln'}</button>`).join('')}</div>
    <h3>Szenario</h3>
    <label class="field">Name <input id="ed-name" maxlength="80" value="${escapeAttr(sc.name)}" /></label>
    <label class="field">Beschreibung <textarea id="ed-desc" rows="3" maxlength="2000">${escapeHtml(sc.description)}</textarea></label>
    <label class="field">Rundenlimit <input id="ed-limit" type="number" min="0" step="10" value="${sc.turnLimit ?? ''}" placeholder="Standard" /></label>
    <p class="hint">Klick malt · Ziehen verschiebt · Mausrad zoomt · Strg/⌘+Z macht rückgängig</p>`;
}

$('ed-tools').addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tool],[data-brush]');
  if (!t) return;
  if (t.dataset.brush) brush = Number(t.dataset.brush);
  else tool = JSON.parse(t.dataset.tool!) as Tool;
  riverFrom = -1;
  renderTools();
  renderStatus();
});
$('ed-tools').addEventListener('change', (e) => {
  const t = e.target as HTMLElement;
  if (t.id === 'ed-resource') {
    const v = Number((t as HTMLSelectElement).value);
    if (v) tool = { kind: 'resource', value: v };
    renderTools();
  }
});
$('ed-tools').addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'ed-name') sc.name = t.value;
  else if (t.id === 'ed-desc') sc.description = t.value;
  else if (t.id === 'ed-limit') sc.turnLimit = Number(t.value) > 0 ? Math.floor(Number(t.value)) : undefined;
  else return;
  saveDraft();
});

// --- Malen --------------------------------------------------------------------------

function snapshot(): void {
  undo.push(encodeScenario(sc));
  if (undo.length > UNDO_LIMIT) undo.shift();
}

function paint(tile: number): void {
  if (tile < 0) return;
  const m = sc.map;
  if (tool.kind === 'start') {
    toggleStart(tile);
    return;
  }
  if (tool.kind === 'river') {
    if (riverFrom < 0 || riverFrom === tile) {
      riverFrom = tile;
      renderer.setSelectedTile(tile);
      renderStatus();
      return;
    }
    snapshot();
    if (!toggleRiverEdge(m, riverFrom, tile)) {
      undo.pop();
      toast('Die beiden Felder müssen benachbart sein', 'error');
      riverFrom = tile;
      renderer.setSelectedTile(tile);
      return;
    }
    renderer.refreshTiles([riverFrom, tile]);
    // Weiterziehen: das zweite Feld ist der Anfang der nächsten Kante.
    riverFrom = tile;
    renderer.setSelectedTile(tile);
    changed();
    return;
  }
  snapshot();
  const tiles = tilesAround(m, tile, brush);
  for (const i of tiles) {
    switch (tool.kind) {
      case 'terrain':
        m.terrain[i] = tool.value;
        break;
      case 'relief':
        if (!isWater(m.terrain[i])) m.relief[i] = tool.value;
        break;
      case 'feature':
        if (!isWater(m.terrain[i]) || tool.value === Feature.None) m.feature[i] = tool.value;
        break;
      case 'resource': {
        const r = RESOURCES[tool.value];
        if (!r) m.resource[i] = 0;
        else if (r.terrains.includes(m.terrain[i]) && r.reliefs.includes(m.relief[i]) && r.features.includes(m.feature[i])) m.resource[i] = tool.value;
        else if (tiles.length === 1) toast(`${r.name} passt nicht auf ${tileName(m.terrain[i], m.relief[i], m.feature[i])}`, 'error');
        break;
      }
      case 'unriver':
        clearRivers(m, i);
        break;
    }
    tidyTile(m, i);
  }
  // Startfelder, die jetzt ungeeignet sind, entfernen.
  const before = sc.starts.length;
  sc.starts = sc.starts.filter((t) => !startBlocker(m, t));
  if (sc.starts.length !== before) {
    toast('Startfeld entfernt (liegt jetzt auf Wasser oder Berg)', 'info');
    drawStarts();
  }
  renderer.refreshTiles(tilesAround(m, tile, brush + 1));
  changed();
}

function toggleStart(tile: number): void {
  const k = sc.starts.indexOf(tile);
  if (k >= 0) {
    snapshot();
    sc.starts.splice(k, 1);
  } else {
    const b = startBlocker(sc.map, tile);
    if (b) return toast(`Kein Startfeld auf ${b}`, 'error');
    if (sc.starts.length >= MAX_STARTS) return toast(`Höchstens ${MAX_STARTS} Startfelder`, 'error');
    if (sc.starts.some((t) => tileDistance(sc.map, t, tile) < MIN_START_DISTANCE)) {
      return toast(`Startfelder brauchen mindestens ${MIN_START_DISTANCE} Felder Abstand`, 'error');
    }
    snapshot();
    sc.starts.push(tile);
  }
  drawStarts();
  changed();
}

function doUndo(): void {
  const prev = undo.pop();
  if (!prev) return toast('Nichts rückgängig zu machen', 'info');
  const restored = decodeLenient(prev);
  const sameSize = restored.map.width === sc.map.width && restored.map.height === sc.map.height;
  sc = restored;
  if (sameSize) {
    // Gleiche Karte: nur neu zeichnen, Kamera bleibt.
    const m = sc.map;
    renderer.setMap(m);
    renderer.setFog(new Uint8Array(m.width * m.height).fill(2));
    drawStarts();
    renderTools();
  } else loadIntoView();
  changed();
}

/** Entwürfe dürfen unfertig sein (z. B. noch ohne Startfelder). */
const decodeLenient = (text: string) => decodeScenario(text, false);

// --- Status, Speichern, Spielen -----------------------------------------------------

function changed(): void {
  renderStatus();
  saveDraft();
}

function saveDraft(): void {
  try {
    localStorage.setItem(EDITOR_DRAFT, encodeScenario(sc));
  } catch {
    // Speicher voll oder nicht verfügbar – Entwurf nur in dieser Sitzung.
  }
}

function renderStatus(): void {
  const problems = validateScenario(sc);
  let land = 0;
  for (let i = 0; i < sc.map.terrain.length; i++) if (!isWater(sc.map.terrain[i])) land++;
  const hint = tool.kind === 'river' ? (riverFrom >= 0 ? 'Fluss: jetzt ein Nachbarfeld anklicken (Rechtsklick bricht ab)' : 'Fluss: erstes Feld anklicken') : '';
  $('ed-status').innerHTML = `
    <div><b>${escapeHtml(sc.name || 'Ohne Namen')}</b> · ${sc.map.width}×${sc.map.height} · Land ${Math.round((100 * land) / sc.map.terrain.length)} % ·
      ${sc.starts.length} ${sc.starts.length === 1 ? 'Startfeld' : 'Startfelder'}</div>
    ${hint ? `<div class="hint">${hint}</div>` : ''}
    ${problems.length ? `<ul class="warn">${problems.slice(0, 4).map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : '<div class="ok">✓ Spielbar</div>'}`;
  ($('ed-play') as HTMLButtonElement).disabled = problems.length > 0;
}

$('ed-save').addEventListener('click', () => {
  const blob = new Blob([encodeScenario(sc)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(sc.name || 'szenario').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim().replace(/\s+/g, '-') || 'szenario'}.iv4ever-szenario.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('ed-open').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    snapshot();
    sc = decodeLenient(text);
    loadIntoView();
    changed();
    toast(`„${sc.name}“ geladen`, 'info');
  } catch (err) {
    undo.pop();
    toast(err instanceof Error ? `Öffnen fehlgeschlagen: ${err.message}` : 'Öffnen fehlgeschlagen', 'error');
  }
});

$('ed-play').addEventListener('click', () => {
  const problems = validateScenario(sc);
  if (problems.length) return toast(problems[0], 'error');
  sessionStorage.setItem(SCENARIO_STORAGE, encodeScenario(sc));
  location.href = './?scenario';
});

function newMap(random: boolean): void {
  if (!window.confirm('Aktuelle Karte ersetzen? (Strg/⌘+Z holt sie zurück)')) return;
  const size = MAP_SIZES.find((s) => s.key === ($('ed-size') as HTMLSelectElement).value) ?? MAP_SIZES[1];
  snapshot();
  sc = random
    ? randomScenario(size.width, size.height, size.players, ($('ed-script') as HTMLSelectElement).value as MapScript)
    : blankScenario(size.width, size.height);
  if (!random) sc.map.terrain.fill(Terrain.Ocean);
  loadIntoView();
  changed();
}
$('ed-random').addEventListener('click', () => newMap(true));
$('ed-blank').addEventListener('click', () => newMap(false));

window.addEventListener('keydown', (e) => {
  if (isTyping(e)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    doUndo();
  }
});

// --- Hilfen -------------------------------------------------------------------------

let toastTimer = 0;
function toast(text: string, level: 'info' | 'error'): void {
  const el = $('toast');
  el.textContent = text;
  el.className = `panel ${level}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), level === 'error' ? 4000 : 2500);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
const escapeAttr = escapeHtml;

// --- Start --------------------------------------------------------------------------

const sizeSel = $('ed-size') as HTMLSelectElement;
sizeSel.innerHTML = MAP_SIZES.map((s) => `<option value="${s.key}">${s.name} (${s.width}×${s.height})</option>`).join('');
sizeSel.value = 'small';
($('ed-script') as HTMLSelectElement).innerHTML = SCRIPTS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('');

const draft = localStorage.getItem(EDITOR_DRAFT);
if (draft) {
  try {
    sc = decodeLenient(draft);
  } catch {
    sc = randomScenario(MAP_SIZES[1].width, MAP_SIZES[1].height, MAP_SIZES[1].players, 'continents');
  }
} else sc = randomScenario(MAP_SIZES[1].width, MAP_SIZES[1].height, MAP_SIZES[1].players, 'continents');
loadIntoView();
