import './style.css';
import type { CityView, FromWorker, GameView, ToWorker, UnitView } from './protocol';
import { GameRenderer, isTyping } from './render/renderer';
import { foundingBlockerAt } from './sim/city';
import { type Battlefield, bestDefender, type Fighter, predictCombat } from './sim/combat';
import { tileDistance } from './sim/hex';
import { setBarbarianId } from './render/palette';
import { Orders } from './sim/game';
import { UNIT_TYPES } from './sim/rules/units';
import { CityPanel } from './ui/cityPanel';
import type { GameMap } from './sim/map';
import { findPath, roadStepCost } from './sim/path';
import { unitCost } from './sim/naval';
import { isWater } from './sim/rules/terrain';
import { TechId } from './sim/rules/techs';
import { ALL_JOBS, jobBlocker, jobTech, jobTurns } from './sim/work';
import { TechPanel } from './ui/techPanel';
import { DiploPanel } from './ui/diploPanel';
import { VICTORY_NAMES } from './sim/victory';
import { GameUi, type JobOption, type UnitAction } from './ui/gameUi';
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
  onRate: (rate) => send({ type: 'command', command: { type: 'setRate', rate } }),
  onEventClick: (tile) => {
    if (tile < 0) {
      techPanel.show();
      return;
    }
    renderer.centerOnTile(tile);
    const c = cityAtTile(tile);
    if (c?.own) openCity(c.id);
  },
  onOpenTech: () => techPanel.toggle(),
  onOpenDiplomacy: () => diploPanel.toggle(),
});
const techPanel = new TechPanel((tech) => send({ type: 'command', command: { type: 'research', tech } }));
const diploPanel = new DiploPanel({
  onDeclareWar: (civ) => command({ type: 'command', command: { type: 'declareWar', target: civ } }),
  onPropose: (civ, proposal) => command({ type: 'command', command: { type: 'propose', target: civ, proposal } }),
  onRespond: (id, accept) => command({ type: 'command', command: { type: 'respond', proposal: id, accept } }),
});
let victoryShown = false;
const victoryEl = document.getElementById('victory')!;
victoryEl.addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act === 'continue') victoryEl.hidden = true;
  else if (act === 'new') {
    victoryEl.hidden = true;
    hud.requestNewMap(true, false);
  }
});

function showVictory(v: GameView['victory']): void {
  if (victoryShown || !view) return;
  const lost = !v.humanAlive;
  if (!v.winner && !lost) return;
  victoryShown = true;
  const won = v.winner && v.winner.player === view.human;
  const winnerName = v.winner ? (view.players.find((p) => p.id === v.winner!.player)?.name ?? '?') : '';
  victoryEl.innerHTML = `<div class="panel victory-box">
    <h2>${won ? '🏆 Sieg!' : '⚑ Niederlage'}</h2>
    <p>${won ? `${VICTORY_NAMES[v.winner!.type]} in Runde ${v.winner!.turn}.` : lost ? 'Dein Volk wurde vernichtet.' : `${winnerName} gewinnt durch ${VICTORY_NAMES[v.winner!.type]}.`}</p>
    <ol>${v.ranking.map((r) => `<li>${r.name} – ${r.score} Punkte</li>`).join('')}</ol>
    <div><button type="button" data-act="continue">Weiterspielen</button> <button type="button" data-act="new">Neues Spiel</button></div>
  </div>`;
  victoryEl.hidden = false;
}
const cityPanel = new CityPanel({
  onClose: closeCity,
  onBuild: (item, append) => {
    const id = cityPanel.openCityId;
    if (id >= 0) command({ type: 'command', command: { type: 'build', city: id, item, append } });
  },
  onUnqueue: (index) => {
    const id = cityPanel.openCityId;
    if (id >= 0) command({ type: 'command', command: { type: 'unqueue', city: id, index } });
  },
  onSelectUnit: (unitId) => {
    closeCity();
    selectUnit(unitId, false);
  },
});
const renderer = new GameRenderer(document.getElementById('game')!, {
  onHover: (i, x, y) => {
    if (i !== hoverTile) {
      hoverTile = i;
      // Während der Stadtansicht belegt das Stadtpanel die linke Seite.
      if (cityPanel.openCityId < 0) hud.hoverTile(map, fogForUi(), i);
      updatePathPreview();
    }
    updateCombatTooltip(x, y);
  },
  onClick: handleClick,
  onRightClick: (tile) => {
    const u = selectedUnit();
    if (u && isOwn(u)) moveOrAttack(u, tile);
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

function cityAtTile(tile: number): CityView | undefined {
  return view?.cities.find((c) => c.tile === tile);
}

function knows(tech: number): boolean {
  return !!view && view.research.known.includes(tech);
}

/** Arbeiteraufträge, deren Technologie bekannt ist, mit Blockade-Grund (dieselben Regeln wie im Worker). */
function jobOptions(u: UnitView): JobOption[] {
  if (!map || !view || !UNIT_TYPES[u.type].canWork) return [];
  return ALL_JOBS.filter((j) => knows(jobTech(j))).map((job) => ({
    job,
    turns: jobTurns(job),
    blocker: jobBlocker(map!, view!.tileOwner, u.owner, u.tile, job, knows),
  }));
}

/** Veränderte Kartenebenen in die lokale Karte übernehmen; liefert die geänderten Felder. */
function applyLayers(layers: GameView['layers']): number[] {
  if (!map) return [];
  const changed: number[] = [];
  for (let i = 0; i < layers.road.length; i++) {
    if (map.improvement[i] !== layers.improvement[i] || map.road[i] !== layers.road[i] || map.feature[i] !== layers.feature[i]) {
      changed.push(i);
    }
  }
  map.improvement.set(layers.improvement);
  map.road.set(layers.road);
  map.feature.set(layers.feature);
  return changed;
}

/** null = Stadtgründung möglich, sonst Begründung (dieselbe Prüfung wie im Worker). */
function foundBlocker(u: UnitView): string | null {
  if (!map || !view || !UNIT_TYPES[u.type].canFound) return 'Diese Einheit kann keine Stadt gründen';
  return foundingBlockerAt(map, view.cities.map((c) => c.tile), view.tileOwner, u.owner, u.tile);
}

// --- Stadtansicht ------------------------------------------------------------------

function openCity(id: number): void {
  const c = view?.cities.find((x) => x.id === id);
  if (!c?.own) return;
  selectUnit(-1, false);
  renderer.setSelectedTile(-1);
  hud.unpin();
  ui.hideEvents();
  cityPanel.show(c, stackAt(c.tile).filter(isOwn));
  renderer.setCityFocus(c);
  if (!renderer.isTileOnScreen(c.tile, 200)) renderer.centerOnTile(c.tile);
}

function closeCity(): void {
  cityPanel.hide();
  renderer.setCityFocus(null);
}

function refreshCityPanel(): void {
  const id = cityPanel.openCityId;
  if (id < 0) return;
  const c = view?.cities.find((x) => x.id === id);
  if (c?.own) {
    cityPanel.show(c, stackAt(c.tile).filter(isOwn));
    renderer.setCityFocus(c);
  } else closeCity();
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
  if (cityPanel.openCityId >= 0) closeCity();
  renderer.setSelectedUnit(u.id, u.tile);
  renderer.setSelectedTile(-1);
  hud.unpin();
  ui.showUnits(stackAt(u.tile), u, view!.human, foundBlocker(u), isOwn(u) ? jobOptions(u) : []);
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
    moveOrAttack(u, tile);
    return;
  }
  // Stadtansicht offen: Klick auf eigenes Feld der Stadt legt die Bewirtschaftung fest.
  const open = view.cities.find((c) => c.id === cityPanel.openCityId);
  if (open?.own && open.own.workable.includes(tile)) {
    command({ type: 'command', command: { type: 'toggleTile', city: open.id, tile } });
    return;
  }
  const city = cityAtTile(tile);
  if (city?.own && (!u || u.tile !== tile)) {
    openCity(city.id);
    return;
  }
  if (cityPanel.openCityId >= 0) closeCity();
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
  for (const c of view.cities) if (c.owner !== view.human) foreign.add(c.tile);
  // Im Frieden ohne offene Grenzen ist fremdes Gebiet gesperrt.
  const closedBorders = new Set(view.diplomacy.civs.filter((c) => !c.war && !c.openBorders).map((c) => c.id));
  // Eigene Transportschiffe auf Wasser mit freiem Platz (zum Einsteigen).
  const transports = new Set<number>();
  for (const s of view.units) {
    const cap = UNIT_TYPES[s.type].cargo ?? 0;
    if (s.owner !== view.human || !cap || !isWater(map.terrain[s.tile])) continue;
    if (view.units.filter((x) => x.carriedBy === s.id).length < cap) transports.add(s.tile);
  }
  const res = findPath({
    map,
    from: u.tile,
    to: hoverTile,
    maxMoves: u.maxMoves,
    movesLeft: u.moves,
    cost: unitCost({
      map,
      type: u.type,
      isKnown: (i) => fog[i] > 0,
      isBlocked: (i) => foreign.has(i) || closedBorders.has(view!.tileOwner[i]),
      ownCities: new Set(view.cities.filter((c) => c.owner === view!.human).map((c) => c.tile)),
      transports,
      roadCost: roadStepCost(knows(TechId.Engineering)),
    }),
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

// --- Kampf ------------------------------------------------------------------------------

const combatEl = document.getElementById('combat')!;

function fighter(u: UnitView): Fighter {
  return { type: u.type, hp: u.hp, promotions: u.promotions, fortified: u.orders === Orders.Fortify };
}

/** Sichtbares feindliches Ziel auf dem Feld? (Einheiten, Stadt oder Lager) */
function hasEnemyTarget(u: UnitView, tile: number): boolean {
  if (!view || view.fog[tile] !== 2) return false;
  if (view.units.some((x) => x.tile === tile && x.owner !== u.owner)) return true;
  const c = cityAtTile(tile);
  return (!!c && c.owner !== u.owner) || view.camps.includes(tile);
}

/** Gleiche Regeln wie attackBlocker im Worker, aus Sicht der Oberfläche. */
function attackProblem(u: UnitView, tile: number): string | null {
  if (!map) return 'Keine Karte';
  const t = UNIT_TYPES[u.type];
  if (t.strength <= 0 && t.ranged <= 0) return 'Diese Einheit kann nicht angreifen';
  if (u.moves <= 0) return 'Keine Bewegung mehr übrig';
  if (u.carriedBy) return 'Von Bord aus kann nicht angegriffen werden';
  const water = isWater(map.terrain[tile]);
  if (t.naval && !water) return 'Schiffe greifen nur Schiffe auf See an';
  if (!t.naval && water) return 'Schiffe auf See können nur Schiffe angreifen';
  const dist = tileDistance(map, u.tile, tile);
  if (t.ranged > 0) {
    if (dist > t.range) return `Außer Reichweite (${t.range} Felder)`;
    if (!view!.units.some((x) => x.tile === tile && x.owner !== u.owner && UNIT_TYPES[x.type].strength > 0)) {
      return 'Kein Ziel für Fernkampf';
    }
    return null;
  }
  return dist === 1 ? null : 'Erst neben das Ziel ziehen';
}

function predictionFor(u: UnitView, tile: number) {
  if (!map || !view) return null;
  const t = UNIT_TYPES[u.type];
  const ranged = t.ranged > 0;
  const defenders = view.units.filter(
    (x) => x.tile === tile && x.owner !== u.owner && !!UNIT_TYPES[x.type].naval === !!t.naval && !x.carriedBy,
  );
  const city = cityAtTile(tile);
  const bf: Battlefield = { map, attackerTile: u.tile, defenderTile: tile, cityDefense: city ? city.defense : null };
  const att = fighter(u);
  const k = bestDefender(defenders.map(fighter), att, bf, ranged);
  if (k < 0) return { defender: null, prediction: null };
  return { defender: defenders[k], prediction: predictCombat(att, fighter(defenders[k]), bf, ranged) };
}

function updateCombatTooltip(x: number, y: number): void {
  const u = selectedUnit();
  if (!u || !isOwn(u) || hoverTile < 0 || !hasEnemyTarget(u, hoverTile) || cityPanel.openCityId >= 0) {
    combatEl.hidden = true;
    return;
  }
  const problem = attackProblem(u, hoverTile);
  const p = predictionFor(u, hoverTile);
  let html: string;
  if (p && p.prediction && p.defender) {
    const pr = p.prediction;
    const pct = Math.round(pr.win * 100);
    const cls = pr.win >= 0.7 ? 'good' : pr.win >= 0.4 ? 'mid' : 'bad';
    html = `<div class="odds ${cls}">${pct} % Sieg</div>
      <small>${UNIT_TYPES[u.type].name} ${pr.attack.toFixed(1)} gegen ${UNIT_TYPES[p.defender.type].name} ${pr.defense.toFixed(1)}</small>
      <small>Schaden: Gegner −${pr.dmgDef[0]}–${pr.dmgDef[1]}${pr.dmgAtt[1] ? ` · eigene −${pr.dmgAtt[0]}–${pr.dmgAtt[1]}` : ' · kein Gegenschaden'}</small>
      ${pr.loss > 0 ? `<small>Risiko zu fallen: ${Math.round(pr.loss * 100)} %</small>` : ''}`;
  } else {
    html = `<div class="odds good">Kein Verteidiger</div><small>${cityAtTile(hoverTile) ? 'Stadt wird erobert' : view!.camps.includes(hoverTile) ? 'Lager wird ausgehoben' : 'Einheiten werden gefangen'}</small>`;
  }
  if (problem) html += `<small class="bad">${problem}</small>`;
  combatEl.innerHTML = html;
  combatEl.hidden = false;
  combatEl.style.left = `${Math.min(window.innerWidth - 220, x + 16)}px`;
  combatEl.style.top = `${Math.min(window.innerHeight - 120, y + 16)}px`;
}

/** Besitzer auf dem Ziel, mit dem kein Krieg herrscht (für die Kriegsrückfrage), sonst -1. */
function peacefulOwnerAt(u: UnitView, tile: number): number {
  if (!view) return -1;
  const owners = new Set(view.units.filter((x) => x.tile === tile && x.owner !== u.owner).map((x) => x.owner));
  const c = cityAtTile(tile);
  if (c && c.owner !== u.owner) owners.add(c.owner);
  for (const o of owners) {
    if (o === view.barbarian) continue;
    const rel = view.diplomacy.civs.find((x) => x.id === o);
    if (!rel || !rel.war) return o;
  }
  return -1;
}

function moveOrAttack(u: UnitView, tile: number): void {
  if (hasEnemyTarget(u, tile)) {
    moveMode = false;
    const problem = attackProblem(u, tile);
    if (problem) {
      ui.toast(problem, 'error');
      return;
    }
    const peaceful = peacefulOwnerAt(u, tile);
    if (peaceful >= 0) {
      const civ = view!.players.find((p) => p.id === peaceful)?.name ?? 'diesem Volk';
      if (!window.confirm(`Mit ${civ} herrscht Frieden. Krieg erklären und angreifen?`)) return;
      send({ type: 'command', command: { type: 'declareWar', target: peaceful } });
    }
    combatEl.hidden = true;
    command({ type: 'command', command: { type: 'attack', unit: u.id, target: tile } });
    return;
  }
  moveTo(u, tile);
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
    default: {
      if (action.startsWith('promote:')) {
        command({ type: 'command', command: { type: 'promote', unit: u.id, promotion: Number(action.slice(8)) } });
      } else if (action.startsWith('job:')) {
        const job = action.slice(4) as Parameters<typeof jobTurns>[0];
        command({ type: 'command', command: { type: 'work', unit: u.id, job } });
      }
      break;
    }
    case 'load':
      command({ type: 'command', command: { type: 'load', unit: u.id } });
      break;
    case 'found': {
      const blocker = foundBlocker(u);
      if (blocker) ui.toast(blocker, 'error');
      else command({ type: 'command', command: { type: 'found', unit: u.id } });
      break;
    }
  }
}

function endTurn(): void {
  if (!view) return;
  selectUnit(-1, false);
  closeCity();
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
      victoryShown = false;
      closeCity();
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
      const changedTiles = applyLayers(view.layers);
      hud.knows = knows;
      renderer.setFog(view.fog);
      renderer.refreshTiles(changedTiles);
      techPanel.update(view.research);
      diploPanel.update(view.diplomacy, view.victory);
      ui.setDiplomacy(view.diplomacy.pending.length);
      showVictory(view.victory);
      if (msg.reason === 'command' && msg.events.length) ui.toast(msg.events[msg.events.length - 1].text);
      ui.setResearch(TechPanel.summary(view.research), view.research.current < 0);
      setBarbarianId(view.barbarian);
      renderer.setCities(view.cities, view.tileOwner, view.camps);
      // Eigene Angriffe: Ergebnis kurz einblenden.
      for (const c of msg.combats) {
        if (c.attackerOwner !== view.human || msg.reason !== 'command') continue;
        const text = c.capturedCity
          ? `${c.capturedCity} erobert!`
          : c.destroyedCamp
            ? 'Lager ausgehoben!'
            : c.defenderDied
              ? `Sieg! ${c.defenderType !== null ? UNIT_TYPES[c.defenderType].name : 'Gegner'} besiegt`
              : c.attackerDied
                ? `Niederlage – ${UNIT_TYPES[c.attackerType].name} gefallen`
                : `Gegner −${c.dmgDef} LP${c.dmgAtt ? `, eigene −${c.dmgAtt} LP` : ''}`;
        ui.toast(text, c.attackerDied ? 'error' : 'info');
      }
      const animMs = renderer.setUnits(view.units, view.human, msg.moves);
      minimap.update(fogForUi(), view.units, view.tileOwner, view.cities);
      ui.setTurn(view.turn, readyUnits().length);
      ui.setEconomy(view.economy);
      if (msg.reason === 'turn' || msg.reason === 'new' || msg.reason === 'load') ui.showEvents(msg.events);
      if (msg.foundedCity !== undefined) {
        openCity(msg.foundedCity);
        break;
      }
      if (cityPanel.openCityId >= 0) {
        refreshCityPanel();
        break;
      }

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
  if (import.meta.env.DEV && e.shiftKey && e.key.toLowerCase() === 'p' && u) {
    send({ type: 'debugRaider', tile: u.tile });
    return;
  }
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
      if (diploPanel.open) diploPanel.hide();
      else if (techPanel.open) techPanel.hide();
      else if (cityPanel.openCityId >= 0) closeCity();
      else if (moveMode) moveMode = false;
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
    case 'l':
      if (own && UNIT_TYPES[u.type].cargo) runAction('load', u.id);
      break;
    case 'h': {
      const target = u ?? view?.units.find(isOwn);
      if (target) renderer.centerOnTile(target.tile);
      break;
    }
    case 'g':
      renderer.toggleGrid();
      break;
    case 't':
      techPanel.toggle();
      break;
    case 'd':
      diploPanel.toggle();
      break;
    case 'r':
      renderer.toggleResources();
      break;
    case 'n':
      hud.requestNewMap(true);
      break;
    case 'x':
      revealAll = renderer.toggleRevealAll();
      if (view) minimap.update(fogForUi(), view.units, view.tileOwner, view.cities);
      ui.toast(revealAll ? 'Debug: Karte aufgedeckt' : 'Debug: Nebel wieder an');
      break;
  }
});

hud.requestNewMap(false, false);
