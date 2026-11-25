import type { GameState, Unit } from './game';
import type { GameMap } from './map';
import type { MapGenOptions } from './mapgen';
import { Rng } from './rng';

/**
 * Speicherformat. Bei inkompatiblen Änderungen SAVE_VERSION erhöhen und eine Migration ergänzen.
 * Abgeleitete Daten (aktuelle Sicht) werden nicht gespeichert, sondern beim Laden neu berechnet.
 */
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  turn: number;
  options: MapGenOptions;
  starts: number[];
  map: GameMap;
  players: { id: number; name: string; human: boolean; alive: boolean; explored: Uint8Array }[];
  units: Unit[];
  nextUnitId: number;
  rngState: number;
}

export interface SaveMeta {
  slot: string;
  label: string;
  turn: number;
  savedAt: number;
  mapLabel: string;
}

export function toSaveData(s: GameState): SaveData {
  return {
    version: SAVE_VERSION,
    turn: s.turn,
    options: { ...s.options },
    starts: s.starts.slice(),
    map: {
      width: s.map.width,
      height: s.map.height,
      wrapX: s.map.wrapX,
      seed: s.map.seed,
      terrain: s.map.terrain.slice(),
      relief: s.map.relief.slice(),
      feature: s.map.feature.slice(),
      resource: s.map.resource.slice(),
      river: s.map.river.slice(),
    },
    players: s.players.map((p) => ({ id: p.id, name: p.name, human: p.human, alive: p.alive, explored: p.explored.slice() })),
    units: s.units.map((u) => ({ ...u, path: u.path ? u.path.slice() : null })),
    nextUnitId: s.nextUnitId,
    rngState: s.rng.getState(),
  };
}

export class SaveError extends Error {}

export function fromSaveData(d: SaveData): GameState {
  if (!d || typeof d !== 'object') throw new SaveError('Speicherstand ist beschädigt');
  if (d.version !== SAVE_VERSION) {
    throw new SaveError(`Speicherstand-Version ${d.version} wird nicht unterstützt (erwartet ${SAVE_VERSION})`);
  }
  const n = d.map.width * d.map.height;
  for (const key of ['terrain', 'relief', 'feature', 'resource', 'river'] as const) {
    if (!(d.map[key] instanceof Uint8Array) || d.map[key].length !== n) throw new SaveError('Kartendaten sind beschädigt');
  }
  return {
    turn: d.turn,
    map: d.map,
    options: d.options,
    starts: d.starts,
    players: d.players.map((p) => ({ ...p, visible: new Uint8Array(n) })),
    units: d.units,
    nextUnitId: d.nextUnitId,
    rng: Rng.fromState(d.rngState),
  };
}
