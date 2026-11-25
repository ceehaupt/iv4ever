import './style.css';
import type { FromWorker, GameView, ToWorker, UnitView } from './protocol';
import { GameRenderer, isTyping } from './render/renderer';
import { Orders } from './sim/game';
import type { GameMap } from './sim/map';
import { findPath, landCost } from './sim/path';
import { GameUi, type UnitAction } from './ui/gameUi';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';

/**
 * Steuerung auf dem Hauptthread: Auswahl, Eingaben, Wegvorschau. Der Spielzustand selbst
 * liegt im Worker; hier gibt es nur die Sicht des menschlichen Spielers (GameView).
 */
const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
const send = (msg: ToWorker) => worker.postMessage(msg);

let map: GameMap | null = null;
let view: GameView | null = null;
let selected = -1;
let moveMode = false;
let busy = false;
let hoverTile = -1;
let revealAll = false;
let mapStats = '';

const hud = new Hud();
const minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, (x, y) => renderer.centerOn(x, y));
const ui = new GameUi({
  onEndTurn: endTurn,
  onAction: (action, unitId) => runAction(action, unitId),
  onSelectUnit: (id) => selectUnit(id, false),
  onSave: save,
  onOpenLoad: () => send({ type: 'listSaves' }),
  onLoad: (slot) => {
    if (confirmDiscard()) send({ type: 'load', slot });
  },
});
const renderer = new GameRenderer(document.getElementById('game')!, {
  onHover: (i) => {
    hoverTile = i;
    hud.hoverTile(map, fogForUi(), i);
    updatePathPreview();
  },
  onClick: handleClick,
  onRightClick: (tile) => {
    const u = selectedUnit();
    if (u && isOwn(u)) moveTo(u, tile);
  },
  onFrame: () => {
    minimap.draw(renderer.viewRect());
    hud.setStats(`${mapStats} · Frame ${renderer.lastRenderMs.toFixed(1)} ms`);
  },
});
await renderer.init();

// --- Hilfen ------------------------------------------------------------------

function fogForUi(): Uint8Array | null {
  return revealAll ? null : (view?.fog ?? null);
}

function isOwn(u: UnitView): boolean {
  return !!view && u.owner === view.human;
}

function selectedUnit(): UnitView | undefined {
  return view?.units.find((u) => u.id === selected);
}

function isReady(u: UnitView): boolean {
  return isOwn(u) && u.moves > 0 && u.orders === Orders.None;
}

function readyUnits(): UnitView[] {
  return (view?.units ?? []).filter(isReady).sort((a, b) => a.id - b.id);
}

function stackAt(tile: number): UnitView[] {
  return (view?.units ?? []).filter((u) => u.tile === tile);
}

function confirmDiscard(): boolean {
  return !view || view.turn <= 1 || window.confirm('Das laufende Spiel wird verworfen. Fortfahren?');
}

// --- Auswahl -------------------------------------------------------------------

function selectUnit(id: number, center: boolean): void {
  selected = id;
  moveMode = false;
  const u = selectedUnit();
  if (!u) {
    selected = -1;
    renderer.setSelectedUnit(-1, -1);
    ui.showUnits([], null, 0);
    updatePathPreview();
    return;
  }
  renderer.setSelectedUnit(u.id, u.tile);
  renderer.setSelectedTile(-1);
  hud.unpin();
  ui.showUnits(stackAt(u.tile), u, view!.human);
  if (center && !renderer.isTileOnScreen(u.tile)) renderer.centerOnTile(u.tile);
  updatePathPreview();
}

/** Nächste Einheit, die einen Befehl braucht (nach der aktuellen, zyklisch). */
function selectNext(): void {
  const ready = readyUnits();
  if (!ready.length) {
    selectUnit(-1, false);
    return;
  }
  const next = ready.find((u) => u.id > selected) ?? ready[0];
  selectUnit(next.id, true);
}

function handleClick(tile: number): void {
  if (tile < 0 || !view || !map) return;
  const u = selectedUnit();
  if (moveMode && u && isOwn(u)) {
    moveTo(u, tile);
    return;
  }
  const visibleStack = (revealAll || view.fog[tile] === 2) ? stackAt(tile) : [];
  if (visibleStack.length) {
    // Erneuter Klick auf denselben Stapel wechselt durch die Einheiten.
    const idx = visibleStack.findIndex((x) => x.id === selected);
    const pick = idx >= 0 ? visibleStack[(idx + 1) % visibleStack.length] : (visibleStack.find(isReady) ?? visibleStack[0]);
    selectUnit(pick.id, false);
    return;
  }
  selectUnit(-1, false);
  renderer.setSelectedTile(tile);
  hud.selectTile(map, fogForUi(), tile);
}

function updatePathPreview(): void {
  const u = selectedUnit();
  if (!u || !isOwn(u) || !map || !view || hoverTile < 0 || hoverTile === u.tile) {
    renderer.setPath(-1, null, null);
    return;
  }
  const fog = view.fog;
  const foreign = new Set(view.units.filter((x) => x.owner !== view!.human).map((x) => x.tile));
  const res = findPath({
    map,
    from: u.tile,
    to: hoverTile,
    maxMoves: u.maxMoves,
    movesLeft: u.moves,
    cost: landCost(map, (i) => fog[i] > 0, (i) => foreign.has(i)),
    limit: 6000,
  });
  renderer.setPath(u.tile, res?.tiles ?? null, res?.turns ?? null);
}

// --- Befehle ---------------------------------------------------------------------

function command(cmd: Parameters<typeof send>[0]): void {
  if (busy) return;
  busy = true;
  ui.setBusy(true);
  send(cmd);
}

function moveTo(u: UnitView, tile: number): void {
  moveMode = false;
  if (tile === u.tile) return;
  command({ type: 'command', command: { type: 'move', unit: u.id, target: tile } });
}

function runAction(action: UnitAction, unitId: number): void {
  const u = view?.units.find((x) => x.id === unitId);
  if (!u || !isOwn(u)) return;
  switch (action) {
    case 'moveMode':
      if (selected !== u.id) selectUnit(u.id, false);
      moveMode = !moveMode;
      if (moveMode) ui.toast('Ziel anklicken (Esc bricht ab)');
      break;
    case 'fortify':
      command({ type: 'command', command: { type: 'fortify', unit: u.id } });
      break;
    case 'wake':
      command({ type: 'command', command: { type: 'wake', unit: u.id } });
      break;
    case 'skip':
      command({ type: 'command', command: { type: 'skip', unit: u.id } });
      break;
    case 'disband':
      if (window.confirm('Einheit wirklich auflösen?')) command({ type: 'command', command: { type: 'disband', unit: u.id } });
      break;
    case 'found':
      ui.toast('Städte kommen mit Meilenstein 3');
      break;
  }
}

function endTurn(): void {
  if (!view) return;
  selectUnit(-1, false);
  command({ type: 'endTurn' });
}

function save(): void {
  if (view) send({ type: 'save', slot: 'quick', label: 'Schnellspeicherung' });
}

// --- Nachrichten vom Worker ------------------------------------------------------

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'mapReady': {
      map = msg.map;
      view = null;
      selected = -1;
      const t0 = performance.now();
      renderer.setMap(map);
      minimap.setMap(map);
      hud.showOptions(msg.options);
      mapStats = `${map.width}×${map.height} · Generierung ${msg.genMs.toFixed(0)} ms · Aufbau ${(performance.now() - t0).toFixed(0)} ms`;
      break;
    }
    case 'view': {
      const prevSelected = selected;
      view = msg.view;
      busy = false;
      ui.setBusy(false);
      renderer.setFog(view.fog);
      const animMs = renderer.setUnits(view.units, view.human, msg.moves);
      minimap.update(fogForUi(), view.units);
      ui.setTurn(view.turn, readyUnits().length);

      if (msg.reason === 'new' || msg.reason === 'load') {
        const first = readyUnits()[0] ?? view.units.find(isOwn);
        if (first) {
          renderer.centerOnTile(first.tile);
          selectUnit(first.id, false);
        }
        break;
      }
      const u = view.units.find((x) => x.id === prevSelected);
      if (msg.reason === 'command' && u && isReady(u)) {
        selectUnit(u.id, false);
      } else {
        // Ausgewählte Einheit ist fertig – nach der Animation zur nächsten wechseln.
        if (u) selectUnit(u.id, false);
        else selectUnit(-1, false);
        window.setTimeout(() => {
          if (selected === prevSelected || selected === -1) selectNext();
        }, animMs);
      }
      break;
    }
    case 'saves':
      ui.showSaves(msg.saves);
      break;
    case 'notice':
      ui.toast(msg.text, msg.level);
      if (msg.level === 'error') {
        busy = false;
        ui.setBusy(false);
      }
      break;
  }
};

hud.confirmDiscard = confirmDiscard;
hud.onNewMap = (options) => send({ type: 'newGame', options });

// --- Tastatur ---------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (isTyping(e)) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const u = selectedUnit();
  const own = u && isOwn(u);
  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      if (!busy) endTurn();
      return;
    case ' ':
      e.preventDefault();
      if (own) runAction('skip', u.id);
      return;
    case 'Tab':
    case '.':
      e.preventDefault();
      selectNext();
      return;
    case 'Delete':
    case 'Backspace':
      if (own) runAction('disband', u.id);
      return;
    case 'Escape':
      if (moveMode) moveMode = false;
      else if (selected >= 0) selectUnit(-1, false);
      else {
        renderer.setSelectedTile(-1);
        hud.unpin();
      }
      return;
  }
  switch (e.key.toLowerCase()) {
    case 'f':
      if (own) runAction(u.orders === Orders.Fortify || u.orders === Orders.Goto ? 'wake' : 'fortify', u.id);
      break;
    case 'm':
      if (own) runAction('moveMode', u.id);
      break;
    case 'b':
      if (own) runAction('found', u.id);
      break;
    case 'h': {
      const target = u ?? view?.units.find(isOwn);
      if (target) renderer.centerOnTile(target.tile);
      break;
    }
    case 'g':
      renderer.toggleGrid();
      break;
    case 'r':
      renderer.toggleResources();
      break;
    case 'n':
      hud.requestNewMap(true);
      break;
    case 'x':
      revealAll = renderer.toggleRevealAll();
      if (view) minimap.update(fogForUi(), view.units);
      ui.toast(revealAll ? 'Debug: Karte aufgedeckt' : 'Debug: Nebel wieder an');
      break;
  }
});

hud.requestNewMap(false, false);
