import './style.css';
import { SCENARIO_STORAGE } from './editor/shared';
import type { CityView, FromWorker, GameView, ToWorker, UnitView } from './protocol';
import { GameRenderer, isTyping } from './render/renderer';
import { foundingBlockerAt } from './sim/city';
import { type Battlefield, bestDefender, type Fighter, predictCombat } from './sim/combat';
import { tileDistance } from './sim/hex';
import { setBarbarianId, setPlayerSlots } from './render/palette';
import { Orders } from './sim/game';
import { UNIT_TYPES } from './sim/rules/units';
import { CityPanel } from './ui/cityPanel';
import type { GameMap } from './sim/map';
import { findPath, roadStepCost } from './sim/path';
import { unitCost } from './sim/naval';
import { isWater } from './sim/rules/terrain';
import { TechId, TECHS } from './sim/rules/techs';
import { ALL_JOBS, jobBlocker, jobTech, jobTurns } from './sim/work';
import { TechPanel } from './ui/techPanel';
import { DiploPanel } from './ui/diploPanel';
import { DoctrinePanel } from './ui/doctrinePanel';
import { SoundEngine } from './audio/sound';
import { loadSettings, saveSettings, type Settings, SettingsPanel } from './ui/settings';
import { Tutorial } from './ui/tutorial';
import { clearSession, OnlineClient, savedSession } from './net/online';
import type { SaveMeta } from './sim/save';
import { setAnimationSpeed } from './render/unitLayer';
import { setColorblind } from './render/palette';
import { VICTORY_NAMES } from './sim/victory';
import { GameUi, type JobOption, type UnitAction } from './ui/gameUi';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { type KeyAction, Keymap } from './ui/keymap';
import { describeTile } from './ui/describe';
import { tileAt } from './sim/hex';

/**
 * Steuerung auf dem Hauptthread: Auswahl, Eingaben, Wegvorschau. Der Spielzustand selbst
 * liegt im Worker; hier gibt es nur die Sicht des menschlichen Spielers (GameView).
 */
const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
/** Online-Spiel aktiv? Dann gehen Spielaktionen über den Server, nicht direkt an die Simulation. */
let onlineGame = false;
const send = (msg: ToWorker) => {
  if (onlineGame && msg.type === 'command') online.act({ kind: 'command', command: msg.command });
  else if (onlineGame && msg.type === 'endTurn') online.act({ kind: 'endTurn' });
  else worker.postMessage(msg);
};

// --- Online ---------------------------------------------------------------------------
const onlineEl = document.getElementById('onlinepanel')!;
let lobbyPlayers: { seat: number; name: string; connected: boolean }[] = [];
/** Spielstände für „Online-Spiel fortsetzen“ (aus der letzten Liste des Workers). */
let knownSaves: SaveMeta[] = [];
/** Aktionsnummer zum Zeitpunkt der Stand-Anfrage für eine Reparatur. */
let resyncUpto = -1;
let startTurnSeconds = 0;
let turnDeadline = 0;

const online = new OnlineClient({
  onJoined: (room) => {
    renderOnline(`Raum <b>${room}</b> – Code an Mitspieler weitergeben.`);
  },
  onLobby: (players) => {
    lobbyPlayers = players;
    renderOnline();
  },
  onStart: (options, _names, save) => {
    onlineGame = true;
    onlineEl.hidden = true;
    chat.show();
    if (save) worker.postMessage({ type: 'loadData', data: save, online: { seat: online.seat, humans: options.humans } });
    else worker.postMessage({ type: 'newGame', options: { ...options, seat: online.seat } });
  },
  onAction: (seat, action) => worker.postMessage({ type: 'remote', player: seat, action }),
  onReplay: (acts) => worker.postMessage({ type: 'remoteBatch', actions: acts.map((a) => ({ player: a.seat, action: a.action })) }),
  onResync: (save) => {
    worker.postMessage({ type: 'loadData', data: save, online: { seat: online.seat } });
    ui.toast('Spielstand mit dem Gastgeber abgeglichen');
  },
  onDesync: (turn) => {
    if (online.host) {
      // Der Gastgeber repariert automatisch: sein Stand gilt für alle.
      resyncUpto = online.lastSeq;
      worker.postMessage({ type: 'snapshot', purpose: 'resync' });
      ui.toast(`Spielstände weichen in Runde ${turn} ab – Stand des Gastgebers wird verteilt …`, 'error');
    } else ui.toast(`Spielstände weichen in Runde ${turn} ab – der Gastgeber gleicht ab …`, 'error');
  },
  onLeft: (name, final) =>
    ui.toast(final ? `${name} hat das Spiel verlassen – die KI übernimmt` : `${name} hat die Verbindung verloren …`, 'error'),
  onBack: (name) => ui.toast(`${name} ist wieder da`),
  onChat: (name, text, own) => chat.add(name, text, own),
  onTimer: (deadline) => {
    turnDeadline = deadline;
    updateTimer();
  },
  onError: (text) => {
    ui.toast(text, 'error');
    if (!onlineGame) renderOnline(text);
  },
});

let onlineStatus = '';
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function renderOnline(status?: string): void {
  if (status !== undefined) onlineStatus = status;
  const inRoom = !!online.room && !onlineGame;
  const session = savedSession();
  const url = (document.getElementById('onlineurl') as HTMLInputElement | null)?.value ?? session?.url ?? `ws://${location.hostname || 'localhost'}:8787`;
  const name = (document.getElementById('onlinename') as HTMLInputElement | null)?.value ?? session?.name ?? 'Spieler';
  const host = inRoom && online.host;
  onlineEl.innerHTML = `<div class="panel settings-box" role="dialog" aria-label="Online-Spiel">
    <header><h2>Online-Spiel</h2><button type="button" class="x" data-close aria-label="Schließen">✕</button></header>
    <section>
      <label>Server <input id="onlineurl" value="${esc(url)}" ${inRoom ? 'disabled' : ''} /></label>
      <label>Name <input id="onlinename" value="${esc(name)}" maxlength="24" ${inRoom ? 'disabled' : ''} /></label>
      ${inRoom ? '' : `<div class="row"><button type="button" data-act="create">Raum erstellen</button>
        <input id="onlineroom" placeholder="Code" size="6" aria-label="Raumcode" /> <button type="button" data-act="join">Beitreten</button></div>
        ${session ? `<div class="row"><button type="button" data-act="rejoin">Wieder beitreten (Raum ${esc(session.room)})</button>
          <button type="button" data-act="forget">Vergessen</button></div>` : ''}`}
      <p class="hint">${onlineStatus || `Server starten mit <code>npm run server</code>. Alle brauchen dieselbe Spielversion (${esc(online.version)}).`}</p>
    </section>
    ${inRoom ? `<section><h3>Spieler</h3><ol>${lobbyPlayers.map((p) => `<li>${esc(p.name)}${p.seat === online.seat ? ' (du)' : ''}</li>`).join('')}</ol>
      ${host ? `<label>Zeitlimit je Runde <select id="onlinetimer">
          ${[[0, 'aus'], [60, '1 Minute'], [120, '2 Minuten'], [300, '5 Minuten'], [600, '10 Minuten']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select></label>
        <label>Spielstand fortsetzen <select id="onlinesave"><option value="">– neues Spiel (Einstellungen aus der Kopfleiste) –</option>
          ${knownSaves.map((sv) => `<option value="${esc(sv.slot)}">${esc(sv.label)} · Runde ${sv.turn}</option>`).join('')}</select></label>
        <button type="button" data-act="start">Spiel starten</button>`
        : '<p class="hint">Warte auf den Start durch den Gastgeber …</p>'}</section>` : ''}
  </div>`;
  onlineEl.hidden = false;
}
onlineEl.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  if (t === onlineEl || t.closest('[data-close]')) {
    onlineEl.hidden = true;
    return;
  }
  const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
  if (!act) return;
  const url = (document.getElementById('onlineurl') as HTMLInputElement).value;
  const name = (document.getElementById('onlinename') as HTMLInputElement).value || 'Spieler';
  try {
    if (act === 'create' || act === 'join') {
      await online.connect(url, name);
      if (act === 'create') {
        online.create();
        worker.postMessage({ type: 'listSaves' });
      } else online.join((document.getElementById('onlineroom') as HTMLInputElement).value.trim());
    } else if (act === 'rejoin') {
      const session = savedSession();
      if (session) await online.rejoin(session);
    } else if (act === 'forget') {
      clearSession();
      renderOnline('');
    } else if (act === 'start') {
      startTurnSeconds = Number((document.getElementById('onlinetimer') as HTMLSelectElement).value);
      const slot = (document.getElementById('onlinesave') as HTMLSelectElement).value;
      if (slot) worker.postMessage({ type: 'snapshot', purpose: 'start', slot });
      else online.start(hud.currentOptions(), undefined, startTurnSeconds);
    }
  } catch (err) {
    renderOnline(err instanceof Error ? err.message : String(err));
  }
});

/** Restzeit der Runde (Zeitlimit) neben der Rundenanzeige. */
const timerEl = document.getElementById('turntimer')!;
function updateTimer(): void {
  const left = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000));
  timerEl.hidden = !onlineGame || !turnDeadline;
  timerEl.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  timerEl.classList.toggle('low', left <= 15);
}
setInterval(updateTimer, 1000);

/** Chat im Online-Spiel. */
const chat = {
  el: document.getElementById('chat')!,
  log: document.getElementById('chatlog')!,
  show() {
    this.el.hidden = false;
  },
  add(name: string, text: string, own: boolean) {
    const li = document.createElement('li');
    const who = document.createElement('b');
    who.textContent = own ? 'Du' : name;
    li.append(who, `: ${text}`);
    this.log.append(li);
    while (this.log.children.length > 50) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
    if (!own) sound.play('click');
  },
};
document.getElementById('chatform')!.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('chatinput') as HTMLInputElement;
  const text = input.value.trim();
  if (text) online.chat(text);
  input.value = '';
});

// --- Hotseat-Übergabe ------------------------------------------------------------------
const handoffEl = document.getElementById('handoff')!;
handoffEl.addEventListener('click', () => (handoffEl.hidden = true));
function showHandoff(v: GameView): void {
  const name = v.players.find((p) => p.id === v.human)?.name ?? 'Nächster Spieler';
  handoffEl.innerHTML = `<div class="panel victory-box"><h2>${name} ist am Zug</h2>
    <p>Runde ${v.turn}. Gerät weitergeben – die anderen bitte wegsehen.</p><button type="button">Weiter</button></div>`;
  handoffEl.hidden = false;
}

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
  onExport: () => {
    if (view) worker.postMessage({ type: 'snapshot', purpose: 'export' });
  },
  onImport: (text) => {
    if (onlineGame) {
      ui.toast('Im Online-Spiel nicht möglich – Fortsetzen über „Online …“', 'error');
      return;
    }
    if (!confirmDiscard()) return;
    // Szenario (Karteneditor) oder Spielstand – am Dateikennzeichen erkennen.
    if (text.includes('"iv4ever-scenario"')) startScenario(text);
    else worker.postMessage({ type: 'loadData', data: text });
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
  onCancelAlliance: (civ) => command({ type: 'command', command: { type: 'cancelAlliance', target: civ } }),
});
const doctrinePanel = new DoctrinePanel(
  (doctrine) => command({ type: 'command', command: { type: 'setDoctrine', doctrine } }),
  (tenet) => command({ type: 'command', command: { type: 'foundReligion', tenet } }),
);
let victoryShown = false;
const victoryEl = document.getElementById('victory')!;
victoryEl.addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act === 'continue') victoryEl.hidden = true;
  else if (act === 'new') {
    victoryEl.hidden = true;
    hud.openDialog(); // Einstellungen fürs nächste Spiel wählen
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

// --- Klang, Einstellungen, Tutorial, Handbuch (M9) ------------------------------------
const sound = new SoundEngine();
let settings = loadSettings();
function applySettings(s: Settings): void {
  settings = s;
  sound.apply(s);
  setAnimationSpeed(s.animations);
  renderer.effects.enabled = s.animations !== 'off';
  document.body.classList.toggle('high-contrast', s.highContrast);
  document.body.classList.toggle('large-text', s.largeText);
  setColorblind(s.colorblind);
  if (view) {
    renderer.redrawColors(view.units, view.human, view.cities, view.tileOwner, view.camps);
    minimap.update(fogForUi(), view.units, view.tileOwner, view.cities);
  }
  if (s.tutorial && view && tutorialIdle) {
    tutorialIdle = false;
    tutorial.begin(view);
  }
}
let tutorialIdle = true;
const tutorial = new Tutorial(() => {
  tutorialIdle = true;
  settings = { ...settings, tutorial: false };
  saveSettings(settings);
});
const keymap = new Keymap();
/** Einstellungsdialog wartet auf eine neue Taste – dann keine Spielaktionen. */
let keyCapture = false;
const settingsPanel = new SettingsPanel(settings, applySettings, keymap, (capturing) => {
  keyCapture = capturing;
  if (!capturing) renderKeyHints();
});
document.getElementById('settingsbtn')!.addEventListener('click', () => settingsPanel.toggle());
const handbookEl = document.getElementById('handbook')!;
async function toggleHandbook(): Promise<void> {
  if (!handbookEl.hidden) {
    handbookEl.hidden = true;
    return;
  }
  const { openHandbook } = await import('./ui/handbook');
  openHandbook(handbookEl);
}
document.getElementById('handbookbtn')!.addEventListener('click', () => void toggleHandbook());
// Audio darf erst nach einer Nutzereingabe starten; Klicks auf Knöpfe klingen leise.
const unlockAudio = () => sound.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) sound.play('click');
});
applySettings(settings);

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
    if (map.improvement[i] !== layers.improvement[i] || map.road[i] !== layers.road[i] || map.feature[i] !== layers.feature[i] ||
      map.terrain[i] !== layers.terrain[i] || map.pollution[i] !== layers.pollution[i]) {
      changed.push(i);
    }
  }
  map.improvement.set(layers.improvement);
  map.road.set(layers.road);
  map.feature.set(layers.feature);
  map.terrain.set(layers.terrain);
  map.pollution.set(layers.pollution);
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

/**
 * Automatisches Rundenende (Einstellung). Nach jedem Befehl und zu Rundenbeginn wird geprüft, ob noch etwas zu tun ist.
 * Echte Gründe zum Anhalten (wartende Einheit, Stadt ohne Bauauftrag, kein Forschungsziel, Angebot, Sieg) entschärfen;
 * offene Fenster, laufende Befehle und Animationen nur aufschieben.
 */
let autoEndTimer = 0;
function scheduleAutoEnd(delayMs: number): void {
  window.clearTimeout(autoEndTimer);
  if (!settings.autoEndTurn || !view) return;
  autoEndTimer = window.setTimeout(tryAutoEndTurn, delayMs);
}
/** Grund, warum die Runde nicht von selbst enden darf, oder null. */
function autoEndBlocker(v: GameView): string | null {
  if (readyUnits().length) return 'Einheit wartet';
  if (v.victory.winner) return 'Sieg';
  if (v.diplomacy.pending.length) return 'offenes Angebot';
  if (v.research.current < 0 && v.research.known.length < TECHS.length) return 'kein Forschungsziel gewählt';
  const idle = v.cities.find((c) => c.owner === v.human && c.own && !c.own.queue.length);
  return idle ? `${idle.name} baut nichts` : null;
}
/** Zuletzt gemeldeter Grund (je Runde nur einmal melden). */
let autoEndNotice = '';
function tryAutoEndTurn(): void {
  if (!settings.autoEndTurn || !view) return;
  const blocker = autoEndBlocker(view);
  if (blocker) {
    const key = `${view.turn}:${blocker}`;
    if (blocker !== 'Einheit wartet' && blocker !== 'Sieg' && key !== autoEndNotice) {
      autoEndNotice = key;
      ui.toast(`Runde endet nicht automatisch: ${blocker}`);
    }
    return;
  }
  // Spieler ist noch beschäftigt oder es läuft etwas: später erneut prüfen.
  const uiOpen = cityPanel.openCityId >= 0 || techPanel.open || diploPanel.open || doctrinePanel.open || settingsPanel.open ||
    !handoffEl.hidden || !victoryEl.hidden || !handbookEl.hidden;
  if (busy || uiOpen || renderer.animating) {
    scheduleAutoEnd(400);
    return;
  }
  endTurn();
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
  const visibleStack = (revealAll || view.fog[tile] === 2) ? stackAt(tile) : [];
  // Eigene Stadt: Klick öffnet die Stadt; erneute Klicks wechseln durch die Einheiten darin und dann zurück zur Stadt.
  if (city?.own) {
    const ownHere = visibleStack.filter(isOwn);
    const idx = u && u.tile === tile ? ownHere.findIndex((x) => x.id === u.id) : -1;
    const cityOpen = cityPanel.openCityId === city.id;
    if (!ownHere.length || (!cityOpen && idx < 0) || idx === ownHere.length - 1) {
      openCity(city.id);
      return;
    }
    if (cityOpen) closeCity();
    selectUnit((idx < 0 ? (ownHere.find(isReady) ?? ownHere[0]) : ownHere[idx + 1]).id, false);
    return;
  }
  if (cityPanel.openCityId >= 0) closeCity();
  // Ausgewählte eigene Einheit: Klick auf ein erreichbares freies Feld bewegt sie dorthin (wie Rechtsklick).
  // Angriffe bleiben beim Rechtsklick bzw. Bewegen-Modus, damit ein Klick nie versehentlich einen Kampf auslöst.
  if (u && isOwn(u) && u.moves > 0 && !UNIT_TYPES[u.type].air && !visibleStack.length && !city && !hasEnemyTarget(u, tile) &&
      tile !== u.tile && previewPath(u, tile)) {
    moveOrAttack(u, tile);
    return;
  }
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
  // Flugzeuge haben keinen Weg: Einsatz bzw. Verlegen zeigt der Hinweis am Mauszeiger.
  if (!u || !isOwn(u) || !map || !view || hoverTile < 0 || hoverTile === u.tile || UNIT_TYPES[u.type].air) {
    renderer.setPath(-1, null, null);
    return;
  }
  const res = previewPath(u, hoverTile);
  renderer.setPath(u.tile, res?.tiles ?? null, res?.turns ?? null);
}

/** Weg einer eigenen Einheit zum Feld aus Sicht der Oberfläche (Vorschau und Klick-Bewegung). */
function previewPath(u: UnitView, target: number): ReturnType<typeof findPath> {
  if (!map || !view) return null;
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
  return findPath({
    map,
    from: u.tile,
    to: target,
    maxMoves: u.maxMoves,
    movesLeft: u.moves,
    cost: unitCost({
      map,
      type: u.type,
      isKnown: (i) => fog[i] > 0,
      isBlocked: (i) => foreign.has(i) || closedBorders.has(view!.tileOwner[i]),
      ownCities: new Set(view.cities.filter((c) => c.owner === view!.human).map((c) => c.tile)),
      transports,
      roadCost: roadStepCost(knows(TechId.Engineering), knows(TechId.Railroad)),
      navigation: knows(TechId.Navigation),
    }),
    limit: 6000,
  });
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
  const dist0 = tileDistance(map, u.tile, tile);
  if (t.air) {
    if (u.moves <= 0) return 'Dieses Flugzeug war in dieser Runde schon im Einsatz';
    if (dist0 > t.range) return `Außer Reichweite (Einsatzradius ${t.range} Felder)`;
    if (!view!.units.some((x) => x.tile === tile && x.owner !== u.owner && UNIT_TYPES[x.type].strength > 0 && !UNIT_TYPES[x.type].air)) {
      return 'Kein Ziel – Luftangriffe treffen Einheiten';
    }
    return null;
  }
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
  // Flugzeuge am Boden verteidigen nie; Luftangriffe treffen Land- und Seeeinheiten.
  const defenders = view.units.filter(
    (x) => x.tile === tile && x.owner !== u.owner && !x.carriedBy && !UNIT_TYPES[x.type].air && (t.air || !!UNIT_TYPES[x.type].naval === !!t.naval),
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
  if (UNIT_TYPES[u.type].air) {
    const threats = airThreats(u, hoverTile);
    html += threats ? `<small class="bad">Abfanggefahr: ${threats}</small>` : '<small>Keine bekannte Abwehr</small>';
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

/** Sichtbare feindliche Luftabwehr gegen einen Angriff auf `tile` (Text) – Jäger im Radius, Flugabwehr im Umkreis. */
function airThreats(u: UnitView, tile: number): string {
  if (!map || !view) return '';
  const hostile = new Set([view.barbarian, ...view.diplomacy.civs.filter((c) => c.war).map((c) => c.id)]);
  let jets = 0;
  let flak = 0;
  for (const x of view.units) {
    if (x.owner === u.owner || !hostile.has(x.owner)) continue;
    const t = UNIT_TYPES[x.type];
    const d = tileDistance(map, x.tile, tile);
    if (t.interceptor && d <= t.range) jets++;
    else if (t.antiAir && d <= t.antiAir) flak++;
  }
  return [jets ? `${jets} Jäger` : '', flak ? `${flak} Flugabwehr` : ''].filter(Boolean).join(', ');
}

function moveOrAttack(u: UnitView, tile: number): void {
  if (UNIT_TYPES[u.type].air) {
    moveMode = false;
    if (!hasEnemyTarget(u, tile)) {
      // Verlegen in eigene Stadt oder auf eigenen Träger (Regeln prüft der Worker).
      command({ type: 'command', command: { type: 'rebase', unit: u.id, target: tile } });
      return;
    }
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
    command({ type: 'command', command: { type: 'airStrike', unit: u.id, target: tile } });
    return;
  }
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
    case 'explore':
      command({ type: 'command', command: { type: 'explore', unit: u.id } });
      break;
    case 'automate':
      command({ type: 'command', command: { type: 'automate', unit: u.id } });
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
    case 'route':
      command({ type: 'command', command: { type: 'establishRoute', unit: u.id } });
      break;
    case 'spread':
      command({ type: 'command', command: { type: 'spreadReligion', unit: u.id } });
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

/** Spielstand als Datei anbieten (Export). */
function downloadSave(data: string, turn: number): void {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `iv4ever-runde-${turn}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function save(): void {
  if (onlineGame) {
    // Im Online-Spiel speichert der Gastgeber; fortsetzen über „Online …“ → „Spielstand fortsetzen“.
    if (!online.host) {
      ui.toast('Im Online-Spiel speichert der Gastgeber', 'error');
      return;
    }
    if (view) worker.postMessage({ type: 'save', slot: `online-${online.room}`, label: `Online ${online.room}` });
    return;
  }
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
      // Farben vor allem Zeichnen setzen (Grenzen, Städte, Einheiten).
      setPlayerSlots(view.players.map((p) => p.slot));
      setBarbarianId(view.barbarian);
      busy = false;
      ui.setBusy(false);
      const changedTiles = applyLayers(view.layers);
      hud.knows = knows;
      renderer.setFog(view.fog);
      renderer.refreshTiles(changedTiles);
      techPanel.update(view.research);
      diploPanel.update(view.diplomacy, view.victory);
      doctrinePanel.update(view.doctrines.active, view.doctrines.upheaval, view.research.known, view.religion);
      ui.setDiplomacy(view.diplomacy.pending.length);
      if (view.victory.winner && !victoryShown) sound.play('victory');
      showVictory(view.victory);
      // Klang und Effekte zur Rückmeldung
      if (msg.combats.length) {
        sound.play('hit');
        for (const c of msg.combats) renderer.showCombat(c.from, c.tile, c.dmgAtt, c.dmgDef);
      } else if (msg.foundedCity !== undefined) sound.play('found');
      else if (msg.reason === 'turn') sound.play(msg.events.some((e) => e.text.startsWith('Erforscht')) ? 'tech' : 'turn');
      else if (msg.moves.some((m) => m.owner === view!.human)) sound.play('move');
      if (msg.reason === 'new' && settings.tutorial && tutorialIdle) {
        tutorialIdle = false;
        tutorial.begin(view);
      } else tutorial.update(view);
      if (msg.reason === 'command' && msg.events.length) ui.toast(msg.events[msg.events.length - 1].text);
      ui.setResearch(TechPanel.summary(view.research), view.research.current < 0);
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
      const animMs = renderer.setUnits(view.units, view.human, msg.moves, msg.reason === 'turn' || msg.reason === 'handoff');
      // Nach Befehlen und zu Rundenbeginn (nicht nach Laden/Neustart): ggf. automatisch weiter, wenn die Animationen durch sind.
      if (msg.reason === 'command' || msg.reason === 'turn' || msg.reason === 'handoff') scheduleAutoEnd(animMs + 500);
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

      if (msg.reason === 'waiting') {
        ui.setBusy(true);
        ui.toast(`Warte auf ${view.waitingFor.length} Mitspieler …`);
        break;
      }
      if (msg.reason === 'handoff') {
        showHandoff(view);
        ui.showEvents(msg.events.filter((e) => e.player === view!.human));
      }
      if (msg.reason === 'new' || msg.reason === 'load' || msg.reason === 'handoff') {
        selected = -1;
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
      knownSaves = msg.saves;
      if (!onlineEl.hidden) renderOnline();
      else ui.showSaves(msg.saves);
      break;
    case 'snapshot':
      if (msg.purpose === 'start') online.start(hud.currentOptions(), msg.data, startTurnSeconds);
      else if (msg.purpose === 'resync') online.resync(msg.data, resyncUpto);
      else downloadSave(msg.data, msg.turn);
      break;
    case 'hash':
      if (onlineGame) online.hash(msg.turn, msg.hash);
      break;
    case 'notice':
      if (msg.level === 'error') sound.play('error');
      ui.toast(msg.text, msg.level);
      if (msg.level === 'error') {
        busy = false;
        ui.setBusy(false);
      }
      break;
  }
};

hud.confirmDiscard = confirmDiscard;

function startScenario(text: string): void {
  const options = hud.currentOptions();
  if (options.mode === 'online') {
    ui.toast('Szenarien gibt es (noch) nicht online – bitte Einzelspieler oder Hotseat wählen', 'error');
    return;
  }
  onlineGame = false;
  online.close();
  chat.el.hidden = true;
  turnDeadline = 0;
  worker.postMessage({ type: 'newScenario', data: text, options });
}
hud.onNewMap = (options) => {
  if (options.mode === 'online') {
    renderOnline();
    return;
  }
  onlineGame = false;
  online.close();
  chat.el.hidden = true;
  turnDeadline = 0;
  worker.postMessage({ type: 'newGame', options });
};

// --- Tastatur ---------------------------------------------------------------------

// --- Kartencursor (Tastatur und Screenreader) -----------------------------------------
let cursorTile = -1;
const announcer = document.getElementById('announcer')!;
function announce(text: string): void {
  // Gleicher Text zweimal hintereinander soll erneut vorgelesen werden.
  announcer.textContent = '';
  requestAnimationFrame(() => (announcer.textContent = text));
}
function moveCursor(tile: number): void {
  if (!map || !view || tile < 0) return;
  cursorTile = tile;
  renderer.setSelectedTile(tile);
  renderer.centerOnTile(tile);
  announce(describeTile(map, view, tile, knows));
}
function toggleCursor(): void {
  if (cursorTile >= 0) {
    cursorTile = -1;
    announce('Kartencursor aus');
    return;
  }
  const u = selectedUnit();
  const start = u?.tile ?? view?.cities.find((c) => c.owner === view?.human)?.tile ?? view?.units.find(isOwn)?.tile ?? 0;
  announce('Kartencursor an: Pfeiltasten bewegen, Enter wählt oder zieht die ausgewählte Einheit, Escape beendet.');
  setTimeout(() => moveCursor(start), 600);
}
/** Pfeiltasten im Cursor-Modus: Zeile hoch/runter, Spalte links/rechts (Weltumrundung beachtet). */
function cursorStep(key: string): boolean {
  if (cursorTile < 0 || !map) return false;
  const c = cursorTile % map.width;
  const r = (cursorTile / map.width) | 0;
  const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[key];
  if (!d) return false;
  const next = tileAt(map, c + d[0], r + d[1]);
  if (next >= 0) moveCursor(next);
  return true;
}
function cursorEnter(): void {
  if (cursorTile < 0 || !view) return;
  const u = selectedUnit();
  if (u && isOwn(u) && u.tile !== cursorTile) {
    // Ausgewählte Einheit zum Feld schicken (bzw. angreifen) – wie Rechtsklick.
    moveOrAttack(u, cursorTile);
    return;
  }
  handleClick(cursorTile);
  const sel = selectedUnit();
  if (sel) announce(`${UNIT_TYPES[sel.type].name} ausgewählt. Cursor bewegen und Enter drücken, um sie dorthin zu schicken.`);
}

window.addEventListener('keydown', (e) => {
  if (keyCapture) return;
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
  // Kartencursor fängt Pfeiltasten, Enter und Escape ab.
  if (cursorTile >= 0) {
    if (cursorStep(e.key)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      cursorEnter();
      return;
    }
    if (e.key === 'Escape') {
      toggleCursor();
      return;
    }
  }
  if (e.key === 'Escape') {
    if (doctrinePanel.open) doctrinePanel.hide();
    else if (diploPanel.open) diploPanel.hide();
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
  // Debug nur auf dem Dev-Server und nie im Online-Spiel (dort wäre es ein Blick hinter den Nebel).
  if (e.key.toLowerCase() === 'x' && !e.shiftKey && import.meta.env.DEV && view?.mode !== 'online') {
    revealAll = renderer.toggleRevealAll();
    if (view) minimap.update(fogForUi(), view.units, view.tileOwner, view.cities);
    ui.toast(revealAll ? 'Debug: Karte aufgedeckt' : 'Debug: Nebel wieder an');
    return;
  }
  const action = keymap.action(e);
  if (!action) return;
  const own = u && isOwn(u);
  switch (action) {
    case 'endTurn':
      e.preventDefault();
      if (!busy) endTurn();
      break;
    case 'skip':
      e.preventDefault();
      if (own) runAction('skip', u.id);
      break;
    case 'nextUnit':
      e.preventDefault();
      selectNext();
      break;
    case 'disband':
      if (own) runAction('disband', u.id);
      break;
    case 'fortify':
      if (own) runAction(u.auto || u.orders === Orders.Fortify || u.orders === Orders.Goto || u.orders === Orders.Explore ? 'wake' : 'fortify', u.id);
      break;
    case 'moveMode':
      if (own) runAction('moveMode', u.id);
      break;
    case 'explore':
      if (own && !UNIT_TYPES[u.type].air) runAction('explore', u.id);
      break;
    case 'automate':
      if (own && UNIT_TYPES[u.type].canWork && !u.auto) runAction('automate', u.id);
      break;
    case 'found':
      if (own) runAction('found', u.id);
      break;
    case 'load':
      if (own && UNIT_TYPES[u.type].cargo) runAction('load', u.id);
      break;
    case 'route':
      if (own && UNIT_TYPES[u.type].trade) runAction('route', u.id);
      break;
    case 'spread':
      if (own && UNIT_TYPES[u.type].missionary) runAction('spread', u.id);
      break;
    case 'center': {
      const target = u ?? view?.units.find(isOwn);
      if (target) renderer.centerOnTile(target.tile);
      break;
    }
    case 'grid':
      renderer.toggleGrid();
      break;
    case 'resources':
      renderer.toggleResources();
      break;
    case 'techs':
      techPanel.toggle();
      break;
    case 'diplomacy':
      diploPanel.toggle();
      break;
    case 'doctrines':
      doctrinePanel.toggle();
      break;
    case 'handbook':
      e.preventDefault();
      void toggleHandbook();
      break;
    case 'newMap':
      hud.openDialog();
      break;
    case 'cursorMode':
      toggleCursor();
      break;
  }
});

/** Tastenbelegung: Kamera folgt der Belegung (außer im Cursor-Modus), Hilfezeile und Tooltips zeigen die aktuellen Tasten. */
renderer.panKey = (e) => {
  if (cursorTile >= 0 || e.altKey) return null;
  const a = keymap.action(e);
  return a === 'panUp' ? 'up' : a === 'panDown' ? 'down' : a === 'panLeft' ? 'left' : a === 'panRight' ? 'right' : null;
};
function renderKeyHints(): void {
  const k = (a: KeyAction) => keymap.label(a);
  document.getElementById('help')!.textContent =
    `Ziehen / ${k('panUp')}${k('panLeft')}${k('panDown')}${k('panRight')}: Karte · Rad: Zoom · Klick: wählen bzw. ausgewählte Einheit bewegen · Rechtsklick oder ${k('moveMode')}: bewegen/angreifen · ` +
    `${k('skip')}: überspringen · ${k('fortify')}: befestigen · ${k('explore')}: erkunden · ${k('found')}: Stadt gründen · ${k('nextUnit')}: nächste Einheit · ${k('endTurn')}: Runde beenden · ` +
    `${k('techs')}: Technologien · ${k('diplomacy')}: Diplomatie · ${k('doctrines')}: Leitbilder · ${k('handbook')}: Handbuch · ${k('cursorMode')}: Kartencursor · Tasten ändern: ⚙`;
  document.getElementById('diplobtn')!.title = `Diplomatie und Siegbedingungen (${k('diplomacy')})`;
  document.getElementById('research')!.title = `Technologien (${k('techs')})`;
}
renderKeyHints();

// Aus dem Karteneditor „Spielen“: Szenario liegt in der Sitzung bereit.
const pendingScenario = new URLSearchParams(location.search).has('scenario') ? sessionStorage.getItem(SCENARIO_STORAGE) : null;
if (pendingScenario) {
  history.replaceState(null, '', location.pathname);
  startScenario(pendingScenario);
} else hud.requestNewMap(false, false);
