import type { CityView, FromWorker, GameView, NewGameOptions, ToWorker, ViewReason } from '../protocol';
import { availableItems, buildCost, type City, cityReport, cultureToNextRadius, foodToGrow, type TurnEvent, workableTiles } from '../sim/city';
import {
  addUnit, applyCommand, canPromote, CommandError, createGame, currentResearch, economy, endTurn, type GameState, HUMAN, type MoveEvent,
  refreshVision,
} from '../sim/game';
import { promotionChoices, UnitTypeId, xpForNext } from '../sim/rules/units';
import { tilesAround } from '../sim/hex';
import { isWater, Relief } from '../sim/rules/terrain';
import { type CombatEvent, cityDefenseAt } from '../sim/war';
import { jobTurns } from '../sim/work';
import { BuildingId } from '../sim/rules/buildings';
import { cloneMap, mapTransferables } from '../sim/map';
import { generateWorld } from '../sim/mapgen';
import { fromSaveData, SaveError, type SaveMeta, toSaveData } from '../sim/save';
import { maxMoves } from '../sim/rules/units';
import { getSave, listSaves, putSave } from './storage';

/**
 * Die Simulation läuft vollständig hier. Der Hauptthread rendert nur und schickt Befehle,
 * damit KI-Züge und Rundenberechnung nie die Darstellung blockieren.
 */
let state: GameState | null = null;

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
  };
  if (c.owner !== HUMAN) return explored[c.tile] ? base : null;
  const report = cityReport(s, c);
  const item = c.queue[0];
  return {
    ...base,
    own: {
      foodStored: c.foodStored,
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
    },
  };
}

function sendView(
  s: GameState, reason: ViewReason, moves: MoveEvent[] = [], events: TurnEvent[] = [], foundedCity?: number,
  combats: CombatEvent[] = [],
): void {
  const p = s.players[HUMAN];
  const n = s.map.width * s.map.height;
  const fog = new Uint8Array(n);
  for (let i = 0; i < n; i++) fog[i] = p.visible[i] ? 2 : p.explored[i] ? 1 : 0;
  const tileOwner = new Int16Array(n);
  for (let i = 0; i < n; i++) tileOwner[i] = p.explored[i] ? s.tileOwner[i] : -1;
  const pl = s.players[HUMAN];
  const econ = economy(s, HUMAN);
  // Kartenebenen: nur auf erkundeten Feldern den echten Stand zeigen.
  const layers = { improvement: new Uint8Array(n), road: new Uint8Array(n), feature: s.map.feature.slice() };
  for (let i = 0; i < n; i++) {
    if (!p.explored[i]) continue;
    layers.improvement[i] = s.map.improvement[i];
    layers.road[i] = s.map.road[i];
  }
  const view: GameView = {
    turn: s.turn,
    tileOwner,
    cities: s.cities.map((c) => cityView(s, c, p.explored)).filter((c): c is CityView => c !== null),
    economy: { ...econ, gold: pl.gold, researchTotal: pl.research, rate: pl.rate },
    research: {
      known: [...pl.techs.keys()].filter((t) => pl.techs[t]),
      goal: pl.goal,
      current: currentResearch(s, HUMAN),
      progress: pl.research,
      perTurn: econ.research,
    },
    layers,
    human: HUMAN,
    fog,
    players: s.players.map((pl) => ({ id: pl.id, name: pl.name, human: pl.human, barbarian: !!pl.barbarian, alive: pl.alive })),
    units: s.units
      .filter((u) => u.owner === HUMAN || p.visible[u.tile])
      .map((u) => ({
        id: u.id,
        type: u.type,
        owner: u.owner,
        tile: u.tile,
        moves: u.moves,
        maxMoves: maxMoves(u.type),
        orders: u.orders,
        path: u.owner === HUMAN && u.path ? u.path.slice() : null,
        job:
          u.owner === HUMAN && u.job
            ? { kind: u.job, progress: s.jobs[`${u.tile}:${u.job}`] ?? 0, turns: jobTurns(u.job) }
            : null,
        hp: u.hp,
        xp: u.xp,
        promotions: u.promotions.slice(),
        xpNext: xpForNext(u.promotions.length),
        promotable: u.owner === HUMAN && canPromote(u) ? promotionChoices(u.type, u.promotions) : [],
      })),
    camps: s.camps.filter((c) => p.explored[c.tile]).map((c) => c.tile),
    barbarian: s.barbarian,
  };
  // Fremde Bewegungen nur zeigen, wenn sie im Sichtbereich liegen.
  const visibleMoves = moves.filter((m) => m.owner === HUMAN || m.steps.some((t) => p.visible[t]));
  const ownEvents = events.filter((e) => e.player === HUMAN);
  const visibleCombats = combats.filter((c) => c.attackerOwner === HUMAN || c.defenderOwner === HUMAN || p.visible[c.tile] || p.visible[c.from]);
  post({ type: 'view', view, moves: visibleMoves, events: ownEvents, combats: visibleCombats, reason, foundedCity }, [
    fog.buffer, tileOwner.buffer, layers.improvement.buffer, layers.road.buffer, layers.feature.buffer,
  ]);
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

async function handle(msg: ToWorker): Promise<void> {
  switch (msg.type) {
    case 'newGame': {
      const t0 = performance.now();
      const world = generateWorld(msg.options);
      state = createGame(world, msg.options);
      sendMap(state, performance.now() - t0);
      sendView(state, 'new');
      break;
    }
    case 'command': {
      if (!state) return;
      try {
        const res = applyCommand(state, HUMAN, msg.command);
        sendView(state, 'command', res.moves, res.events ?? [], res.foundedCity, res.combats ?? []);
      } catch (e) {
        if (e instanceof CommandError) notice(e.message, 'error');
        else throw e;
      }
      break;
    }
    case 'endTurn': {
      if (!state) return;
      const res = endTurn(state);
      sendView(state, 'turn', res.moves, res.events, undefined, res.combats);
      try {
        await putSave(saveMeta(state, 'auto', 'Autosave'), toSaveData(state));
      } catch {
        notice('Autosave fehlgeschlagen', 'error');
      }
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
        sendMap(state, 0);
        sendView(state, 'load');
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
      refreshVision(s, HUMAN);
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
