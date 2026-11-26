import type { CityView, FromWorker, GameView, NewGameOptions, RemoteAction, ToWorker, ViewReason } from '../protocol';
import { availableItems, buildCost, type City, cityReport, cultureToNextRadius, foodToGrow, type TurnEvent, workableTiles } from '../sim/city';
import {
  addUnit, applyCommand, canPromote, CommandError, createGame, currentResearch, economy, endTurn, type GameState, handBackToHuman, handOverToAi,
  type MoveEvent, refreshVision,
} from '../sim/game';
import { promotionChoices, UnitTypeId, xpForNext } from '../sim/rules/units';
import { tilesAround } from '../sim/hex';
import { isWater, Relief } from '../sim/rules/terrain';
import { type CombatEvent, cityDefenseAt } from '../sim/war';
import { attitude, attitudeLabel, canGive, militaryPower, type Proposal, relation, type TradeItem } from '../sim/diplomacy';
import { DEFAULT_TURN_LIMIT, progress, score } from '../sim/victory';
import { TECHS } from '../sim/rules/techs';
import { jobTurns } from '../sim/work';
import { BuildingId } from '../sim/rules/buildings';
import { cloneMap, mapTransferables } from '../sim/map';
import { generateWorld } from '../sim/mapgen';
import { fromSaveData, type SaveData, SaveError, type SaveMeta, toSaveData } from '../sim/save';
import { decodeSave, encodeSave } from '../sim/saveCodec';
import { maxMoves } from '../sim/rules/units';
import { getSave, listSaves, putSave } from './storage';
import { stateHash } from '../sim/hash';
import { cityPollution } from '../sim/environment';
import { decodeScenario, ScenarioError, scenarioWorld } from '../sim/scenario';
import { faithPerTurn, foundBlocker, religionById, stateReligion, tenetOf } from '../sim/religion';

/**
 * Die Simulation läuft vollständig hier. Der Hauptthread rendert nur und schickt Befehle,
 * damit KI-Züge und Rundenberechnung nie die Darstellung blockieren.
 */
let state: GameState | null = null;

/** Mehrspieler: wessen Sicht gerade gezeigt wird, welche Spieler Menschen sind, wer die Runde beendet hat. */
let viewer = 0;
let mode: 'single' | 'hotseat' | 'online' = 'single';
let humans: number[] = [0];
const ended = new Set<number>();
/** Ereignisse der letzten Rundenauswertung je Spieler (für die Übergabe im Hotseat). */
let lastEvents: TurnEvent[] = [];

function aliveHumans(s: GameState): number[] {
  return humans.filter((h) => s.players[h]?.alive);
}

/** Alle Menschen fertig → Runde auswerten (KI, Wirtschaft, Plünderer …). */
async function finishRound(s: GameState): Promise<void> {
  const res = endTurn(s);
  ended.clear();
  lastEvents = res.events;
  const alive = aliveHumans(s);
  if (mode !== 'online') viewer = alive[0] ?? viewer;
  if (replaying) return;
  sendView(s, mode === 'hotseat' && alive.length > 1 ? 'handoff' : 'turn', res.moves, res.events, undefined, res.combats);
  post({ type: 'hash', turn: s.turn, hash: stateHash(s) });
  if (mode === 'online') return;
  try {
    await putSave(saveMeta(s, 'auto', 'Autosave'), toSaveData(s));
  } catch {
    notice('Autosave fehlgeschlagen', 'error');
  }
}

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  // Im Worker hat postMessage dieselbe Options-Signatur wie window.postMessage.
  self.postMessage(msg, { transfer });
}

function notice(text: string, level: 'info' | 'error' = 'info'): void {
  post({ type: 'notice', text, level });
}

function sendMap(s: GameState, genMs: number): void {
  const copy = cloneMap(s.map);
  post({ type: 'mapReady', map: copy, options: s.options as NewGameOptions, genMs }, mapTransferables(copy));
}

/** Sicht des menschlichen Spielers: eigene Einheiten immer, fremde nur auf sichtbaren Feldern. */
function cityView(s: GameState, c: City, explored: Uint8Array): CityView | null {
  const base = {
    id: c.id, owner: c.owner, name: c.name, tile: c.tile, size: c.size, capital: c.buildings.includes(BuildingId.Palace),
    defense: cityDefenseAt(s, c.tile) ?? 0,
    religion: religionById(s, c.religion)?.name ?? null,
    holy: s.religions.some((r) => r.holyCity === c.id),
  };
  if (c.owner !== viewer) return explored[c.tile] ? base : null;
  const report = cityReport(s, c);
  const item = c.queue[0];
  return {
    ...base,
    own: {
      foodStored: c.foodStored,
      pollution: cityPollution(c),
      prodStored: c.prodStored,
      culture: c.culture,
      cultureToNext: cultureToNextRadius(c),
      queue: c.queue.map((q) => ({ ...q })),
      buildings: c.buildings.slice(),
      worked: c.worked.slice(),
      locked: c.locked.slice(),
      workable: workableTiles(s, c),
      available: availableItems(s, c),
      report,
      turnsToGrow:
        report.surplus > 0 ? Math.max(1, Math.ceil((foodToGrow(c.size) - c.foodStored) / report.surplus)) : null,
      turnsToBuild:
        item && report.yields.prod > 0 ? Math.max(1, Math.ceil((buildCost(item) - c.prodStored) / report.yields.prod)) : null,
      routes: s.routes
        .filter((r) => r.from === c.id || r.to === c.id)
        .map((r) => {
          const other = s.cities.find((x) => x.id === (r.from === c.id ? r.to : r.from));
          return `${r.from === c.id ? '→' : '←'} ${other?.name ?? '?'}`;
        }),
    },
  };
}

function sendView(
  s: GameState, reason: ViewReason, moves: MoveEvent[] = [], events: TurnEvent[] = [], foundedCity?: number,
  combats: CombatEvent[] = [],
): void {
  const p = s.players[viewer];
  const n = s.map.width * s.map.height;
  const fog = new Uint8Array(n);
  for (let i = 0; i < n; i++) fog[i] = p.visible[i] ? 2 : p.explored[i] ? 1 : 0;
  const tileOwner = new Int16Array(n);
  for (let i = 0; i < n; i++) tileOwner[i] = p.explored[i] ? s.tileOwner[i] : -1;
  const pl = s.players[viewer];
  const econ = economy(s, viewer);
  // Kartenebenen: nur auf erkundeten Feldern den echten Stand zeigen.
  const layers = {
    improvement: new Uint8Array(n), road: new Uint8Array(n), feature: s.map.feature.slice(), terrain: s.map.terrain.slice(),
    pollution: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    if (!p.explored[i]) continue;
    layers.improvement[i] = s.map.improvement[i];
    layers.road[i] = s.map.road[i];
    layers.pollution[i] = s.map.pollution[i];
  }
  const view: GameView = {
    turn: s.turn,
    tileOwner,
    cities: s.cities.map((c) => cityView(s, c, p.explored)).filter((c): c is CityView => c !== null),
    economy: { ...econ, gold: pl.gold, researchTotal: pl.research, rate: pl.rate },
    research: {
      known: [...pl.techs.keys()].filter((t) => pl.techs[t]),
      goal: pl.goal,
      current: currentResearch(s, viewer),
      progress: pl.research,
      perTurn: econ.research,
    },
    layers,
    human: viewer,
    mode,
    humans: humans.slice(),
    waitingFor: mode === 'online' ? aliveHumans(s).filter((h) => !ended.has(h)) : [],
    fog,
    players: s.players.map((pl) => ({
      id: pl.id, name: pl.name, human: pl.human, barbarian: !!pl.barbarian, alive: pl.alive, leader: pl.persona?.leader,
    })),
    units: s.units
      .filter((u) => u.owner === viewer || p.visible[u.tile])
      .map((u) => ({
        id: u.id,
        type: u.type,
        owner: u.owner,
        tile: u.tile,
        moves: u.moves,
        maxMoves: maxMoves(u.type),
        orders: u.orders,
        path: u.owner === viewer && u.path ? u.path.slice() : null,
        job:
          u.owner === viewer && u.job
            ? { kind: u.job, progress: s.jobs[`${u.tile}:${u.job}`] ?? 0, turns: jobTurns(u.job) }
            : null,
        hp: u.hp,
        xp: u.xp,
        promotions: u.promotions.slice(),
        xpNext: xpForNext(u.promotions.length),
        promotable: u.owner === viewer && canPromote(u) ? promotionChoices(u.type, u.promotions) : [],
        carriedBy: u.carriedBy ?? null,
      })),
    camps: s.camps.filter((c) => p.explored[c.tile]).map((c) => c.tile),
    barbarian: s.barbarian,
    doctrines: { active: pl.doctrines.slice(), upheaval: pl.upheaval },
    religion: {
      faith: pl.faith ?? 0,
      faithPerTurn: faithPerTurn(s, viewer),
      foundBlocker: foundBlocker(s, viewer),
      state: religionById(s, stateReligion(s, viewer))?.name ?? null,
      religions: s.religions.map((r) => ({
        id: r.id, name: r.name, founder: r.founder === viewer ? 'du' : s.players[r.founder].name, tenet: `${tenetOf(r).name}: ${tenetOf(r).description}`,
        cities: s.cities.filter((c) => c.religion === r.id).length, own: r.founder === viewer,
      })),
    },
    diplomacy: {
      civs: s.players
        .filter((o) => o.id !== viewer && !o.barbarian && o.alive && relation(s, viewer, o.id).met)
        .map((o) => {
          const r = relation(s, viewer, o.id);
          const att = attitude(s, o.id, viewer);
          const techs = (giver: number, receiver: number) =>
            TECHS.map((_, id) => id).filter((id) => canGive(s, giver, receiver, { kind: 'tech', tech: id }));
          return {
            id: o.id, name: o.name, leader: o.persona?.leader ?? '', war: r.war, openBorders: r.openBorders, alliance: !!r.alliance,
            attitude: att, attitudeLabel: attitudeLabel(att),
            powerRatio: militaryPower(s, o.id) / Math.max(1, militaryPower(s, viewer)), gold: o.gold,
            techsToGet: techs(o.id, viewer), techsToGive: techs(viewer, o.id),
          };
        }),
      pending: s.diplomacy.pending.filter((x) => x.to === viewer).map((x) => ({ id: x.id, from: x.from, kind: x.proposal.kind, text: proposalText(x.proposal) })),
    },
    victory: {
      progress: progress(s, viewer),
      winner: s.winner,
      humanAlive: pl.alive,
      ranking: s.players.filter((o) => !o.barbarian && o.alive && (o.id === viewer || relation(s, viewer, o.id).met))
        .map((o) => ({ id: o.id, name: o.human ? 'Du' : o.name, score: score(s, o.id) }))
        .sort((a, b) => b.score - a.score),
      turnLimit: s.options.turnLimit ?? DEFAULT_TURN_LIMIT,
    },
  };
  // Fremde Bewegungen nur zeigen, wenn sie im Sichtbereich liegen.
  const visibleMoves = moves.filter((m) => m.owner === viewer || m.steps.some((t) => p.visible[t]));
  const ownEvents = events.filter((e) => e.player === viewer);
  const visibleCombats = combats.filter((c) => c.attackerOwner === viewer || c.defenderOwner === viewer || p.visible[c.tile] || p.visible[c.from]);
  post({ type: 'view', view, moves: visibleMoves, events: ownEvents, combats: visibleCombats, reason, foundedCity }, [
    fog.buffer, tileOwner.buffer, layers.improvement.buffer, layers.road.buffer, layers.feature.buffer, layers.terrain.buffer, layers.pollution.buffer,
  ]);
}

const itemText = (i: TradeItem) => (i.kind === 'gold' ? `${i.amount} Gold` : TECHS[i.tech].name);

/** Lesbarer Inhalt eines Angebots (aus Sicht des Empfängers). */
function proposalText(p: Proposal): string {
  switch (p.kind) {
    case 'peace':
      return 'bietet Frieden an.';
    case 'openBorders':
      return 'bietet offene Grenzen an.';
    case 'alliance':
      return 'bietet ein Verteidigungsbündnis an (gemeinsame Sicht, Beistand bei Angriffen).';
    case 'demand':
      return `fordert ${p.get.map(itemText).join(' und ')} – ohne Gegenleistung.`;
    case 'trade':
      return `bietet ${p.give.map(itemText).join(' und ') || 'nichts'} für ${p.get.map(itemText).join(' und ') || 'nichts'}.`;
  }
}

function saveMeta(s: GameState, slot: string, label: string): SaveMeta {
  return {
    slot,
    label,
    turn: s.turn,
    savedAt: Date.now(),
    mapLabel: `${s.map.width}×${s.map.height}, Seed ${s.options.seed}`,
  };
}

/** Während des Nachspielens (Wiedereinstieg) keine Ansichten und Prüfsummen schicken. */
let replaying = false;

/** Eine Online-Aktion anwenden – auf allen Rechnern in derselben Reihenfolge. */
async function applyRemote(s: GameState, player: number, action: RemoteAction, quiet: boolean): Promise<void> {
  if (action.kind === 'leave' || action.kind === 'rejoin') {
    if (action.kind === 'leave') {
      handOverToAi(s, player);
      ended.delete(player);
    } else handBackToHuman(s, player);
    humans = s.players.filter((p) => p.human).map((p) => p.id);
    if (!quiet) {
      notice(action.kind === 'leave'
        ? `${s.players[player].name} übernimmt den Platz eines Spielers, der das Spiel verlassen hat`
        : `${s.players[player].name} ist zurück und spielt wieder selbst`);
    }
    // Haben alle Verbliebenen die Runde schon beendet, geht es jetzt weiter.
    if (action.kind === 'leave' && aliveHumans(s).every((h) => ended.has(h))) await finishRound(s);
    else if (!quiet) sendView(s, ended.has(viewer) ? 'waiting' : 'command');
    return;
  }
  if (action.kind === 'endTurn') {
    ended.add(player);
    if (aliveHumans(s).every((h) => ended.has(h))) await finishRound(s);
    else if (player === viewer && !quiet) sendView(s, 'waiting');
    return;
  }
  try {
    const res = applyCommand(s, player, action.command);
    if (!quiet) sendView(s, 'command', res.moves, res.events ?? [], player === viewer ? res.foundedCity : undefined, res.combats ?? []);
  } catch (e) {
    // Ungültige Befehle sind auf allen Rechnern gleich ungültig – nur der Absender erfährt davon.
    if (!(e instanceof CommandError)) throw e;
    if (player === viewer && !quiet) notice(e.message, 'error');
  }
}

async function handle(msg: ToWorker): Promise<void> {
  switch (msg.type) {
    case 'newScenario': {
      try {
        const sc = decodeScenario(msg.data);
        const options = {
          ...msg.options, width: sc.map.width, height: sc.map.height, players: sc.starts.length, seed: sc.map.seed || msg.options.seed,
          turnLimit: sc.turnLimit, scenario: sc.name,
        };
        state = createGame(scenarioWorld(sc), options);
        mode = options.mode ?? 'single';
        humans = state.players.filter((p) => p.human).map((p) => p.id);
        viewer = humans[0];
        ended.clear();
        lastEvents = [];
        sendMap(state, 0);
        sendView(state, mode === 'hotseat' ? 'handoff' : 'new');
        notice(`Szenario „${sc.name}“ gestartet`, 'info');
      } catch (e) {
        notice(e instanceof ScenarioError ? `Szenario: ${e.message}` : 'Szenario konnte nicht geladen werden', 'error');
      }
      break;
    }
    case 'newGame': {
      const t0 = performance.now();
      const world = generateWorld(msg.options);
      state = createGame(world, msg.options);
      mode = msg.options.mode ?? 'single';
      humans = state.players.filter((p) => p.human).map((p) => p.id);
      viewer = mode === 'online' ? (msg.options.seat ?? 0) : humans[0];
      ended.clear();
      lastEvents = [];
      sendMap(state, performance.now() - t0);
      sendView(state, mode === 'hotseat' ? 'handoff' : 'new');
      break;
    }
    case 'command': {
      if (!state) return;
      try {
        const res = applyCommand(state, viewer, msg.command);
        sendView(state, 'command', res.moves, res.events ?? [], res.foundedCity, res.combats ?? []);
      } catch (e) {
        if (e instanceof CommandError) notice(e.message, 'error');
        else throw e;
      }
      break;
    }
    case 'endTurn': {
      if (!state) return;
      ended.add(viewer);
      const next = aliveHumans(state).find((h) => !ended.has(h));
      if (next !== undefined) {
        // Hotseat: nächster Mensch ist dran (gleiche Runde).
        viewer = next;
        sendView(state, 'handoff', [], lastEvents);
      } else {
        await finishRound(state);
      }
      break;
    }
    case 'remote': {
      // Online: Befehle aller Spieler in der vom Server festgelegten Reihenfolge.
      if (!state) return;
      await applyRemote(state, msg.player, msg.action, false);
      break;
    }
    case 'remoteBatch': {
      if (!state) return;
      replaying = true;
      try {
        for (const a of msg.actions) await applyRemote(state, a.player, a.action, true);
      } finally {
        replaying = false;
      }
      sendView(state, ended.has(viewer) ? 'waiting' : 'load');
      break;
    }
    case 'loadData': {
      try {
        const loaded = fromSaveData(decodeSave(msg.data));
        for (const p of loaded.players) refreshVision(loaded, p.id);
        state = loaded;
        ended.clear();
        lastEvents = [];
        if (msg.online) {
          mode = 'online';
          loaded.options = { ...loaded.options, mode: 'online' };
          // Online fortsetzen mit weniger Menschen als im Spielstand: freie Plätze übernimmt die KI.
          const seats = msg.online.humans;
          if (seats !== undefined) for (const p of loaded.players) if (p.human && p.id >= seats) handOverToAi(loaded, p.id);
          viewer = msg.online.seat;
        } else {
          mode = loaded.options.mode === 'online' ? 'single' : (loaded.options.mode ?? 'single');
        }
        humans = loaded.players.filter((p) => p.human).map((p) => p.id);
        if (!msg.online) viewer = humans[0] ?? 0;
        sendMap(loaded, 0);
        sendView(loaded, mode === 'hotseat' ? 'handoff' : 'load');
      } catch (e) {
        notice(e instanceof SaveError || e instanceof Error ? `Laden fehlgeschlagen: ${e.message}` : 'Laden fehlgeschlagen', 'error');
      }
      break;
    }
    case 'snapshot': {
      let data: SaveData | null | undefined;
      if (msg.slot) data = await getSave(msg.slot);
      else if (state) data = toSaveData(state);
      if (!data) {
        notice('Kein Spielstand vorhanden', 'error');
        return;
      }
      post({ type: 'snapshot', purpose: msg.purpose, data: encodeSave(data), turn: data.turn });
      break;
    }
    case 'save': {
      if (!state) return;
      await putSave(saveMeta(state, msg.slot, msg.label), toSaveData(state));
      notice(`Gespeichert: ${msg.label} (Runde ${state.turn})`);
      break;
    }
    case 'load': {
      const data = await getSave(msg.slot);
      if (!data) {
        notice('Kein Speicherstand gefunden', 'error');
        return;
      }
      try {
        const loaded = fromSaveData(data);
        // Sicht ist abgeleitet und wird neu berechnet.
        for (const p of loaded.players) refreshVision(loaded, p.id);
        state = loaded;
        mode = loaded.options.mode === 'online' ? 'single' : (loaded.options.mode ?? 'single');
        humans = state.players.filter((p) => p.human).map((p) => p.id);
        viewer = humans[0];
        ended.clear();
        sendMap(state, 0);
        sendView(state, mode === 'hotseat' ? 'handoff' : 'load');
        notice(`Geladen: Runde ${state.turn}`);
      } catch (e) {
        notice(e instanceof SaveError ? e.message : 'Laden fehlgeschlagen', 'error');
      }
      break;
    }
    case 'debugRaider': {
      if (!state) return;
      const s = state;
      const free = tilesAround(s.map, msg.tile, 1).find(
        (t) => t !== msg.tile && !isWater(s.map.terrain[t]) && s.map.relief[t] !== Relief.Mountain && !s.units.some((u) => u.tile === t),
      );
      if (free === undefined) {
        notice('Kein freies Feld daneben', 'error');
        return;
      }
      addUnit(s, s.barbarian, UnitTypeId.Warrior, free);
      refreshVision(s, viewer);
      sendView(s, 'command');
      break;
    }
    case 'listSaves':
      post({ type: 'saves', saves: await listSaves() });
      break;
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  handle(e.data).catch((err: unknown) => {
    console.error(err);
    notice(`Interner Fehler: ${err instanceof Error ? err.message : String(err)}`, 'error');
  });
};
