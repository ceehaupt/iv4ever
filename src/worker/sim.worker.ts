import type { FromWorker, GameView, NewGameOptions, ToWorker, ViewReason } from '../protocol';
import { applyCommand, CommandError, createGame, endTurn, type GameState, HUMAN, type MoveEvent, refreshVision } from '../sim/game';
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
function sendView(s: GameState, reason: ViewReason, moves: MoveEvent[] = []): void {
  const p = s.players[HUMAN];
  const n = s.map.width * s.map.height;
  const fog = new Uint8Array(n);
  for (let i = 0; i < n; i++) fog[i] = p.visible[i] ? 2 : p.explored[i] ? 1 : 0;
  const view: GameView = {
    turn: s.turn,
    human: HUMAN,
    fog,
    players: s.players.map((pl) => ({ id: pl.id, name: pl.name, human: pl.human })),
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
      })),
  };
  // Fremde Bewegungen nur zeigen, wenn sie im Sichtbereich liegen.
  const visibleMoves = moves.filter((m) => m.owner === HUMAN || m.steps.some((t) => p.visible[t]));
  post({ type: 'view', view, moves: visibleMoves, reason }, [fog.buffer]);
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
        sendView(state, 'command', applyCommand(state, HUMAN, msg.command));
      } catch (e) {
        if (e instanceof CommandError) notice(e.message, 'error');
        else throw e;
      }
      break;
    }
    case 'endTurn': {
      if (!state) return;
      const moves = endTurn(state);
      sendView(state, 'turn', moves);
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
