import { assignTiles, type City, recomputeOwnership } from './city';
import { DEFAULT_RATE, type GameState, type Unit } from './game';
import { TECHS } from './rules/techs';
import type { GameMap } from './map';
import type { MapGenOptions } from './mapgen';
import { Rng } from './rng';

/**
 * Speicherformat. Bei inkompatiblen Änderungen SAVE_VERSION erhöhen und in migrate() nachrüsten.
 * Abgeleitete Daten (Sicht, Feldbesitz) werden nicht gespeichert, sondern beim Laden neu berechnet.
 *
 * Versionen:
 * 1 – M2: Karte, Spieler (Erkundung), Einheiten
 * 2 – M3: Städte, Gold/Forschung/Steuersatz je Spieler
 * 3 – M4: Technologien, Forschungsziel, Verbesserungen/Straßen, Arbeiteraufträge; Bewegung ×2 (MOVE_SCALE 12)
 */
export const SAVE_VERSION = 3;

interface SavedPlayer {
  id: number;
  name: string;
  human: boolean;
  alive: boolean;
  explored: Uint8Array;
  gold: number;
  research: number;
  rate: number;
  techs: Uint8Array;
  goal: number;
}

export interface SaveData {
  version: number;
  turn: number;
  options: MapGenOptions;
  starts: number[];
  map: GameMap;
  players: SavedPlayer[];
  units: Unit[];
  nextUnitId: number;
  cities: City[];
  nextCityId: number;
  jobs: Record<string, number>;
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
      improvement: s.map.improvement.slice(),
      road: s.map.road.slice(),
    },
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      human: p.human,
      alive: p.alive,
      explored: p.explored.slice(),
      gold: p.gold,
      research: p.research,
      rate: p.rate,
      techs: p.techs.slice(),
      goal: p.goal,
    })),
    units: s.units.map((u) => ({ ...u, path: u.path ? u.path.slice() : null })),
    nextUnitId: s.nextUnitId,
    cities: s.cities.map((c) => structuredClone(c)),
    nextCityId: s.nextCityId,
    jobs: { ...s.jobs },
    rngState: s.rng.getState(),
  };
}

export class SaveError extends Error {}

/** Ältere Speicherstände auf das aktuelle Format bringen. */
function migrate(d: SaveData): SaveData {
  if (d.version === 1) {
    d = {
      ...d,
      version: 2,
      cities: [],
      nextCityId: 1,
      players: d.players.map((p) => ({ ...p, gold: 0, research: 0, rate: DEFAULT_RATE })),
    };
  }
  if (d.version === 2) {
    const n = d.map.width * d.map.height;
    const road = new Uint8Array(n);
    for (const c of d.cities) road[c.tile] = 1;
    d = {
      ...d,
      version: 3,
      map: { ...d.map, improvement: new Uint8Array(n), road },
      players: d.players.map((p) => ({ ...p, techs: new Uint8Array(TECHS.length), goal: -1 })),
      // Bewegungspunkte wurden von Sechsteln auf Zwölftel umgestellt.
      units: d.units.map((u) => ({ ...u, moves: u.moves * 2 })),
      jobs: {},
    };
  }
  return d;
}

export function fromSaveData(raw: SaveData): GameState {
  if (!raw || typeof raw !== 'object') throw new SaveError('Speicherstand ist beschädigt');
  if (typeof raw.version !== 'number' || raw.version < 1 || raw.version > SAVE_VERSION) {
    throw new SaveError(`Speicherstand-Version ${raw.version} wird nicht unterstützt (erwartet ≤ ${SAVE_VERSION})`);
  }
  const d = migrate(raw);
  const n = d.map.width * d.map.height;
  for (const key of ['terrain', 'relief', 'feature', 'resource', 'river', 'improvement', 'road'] as const) {
    if (!(d.map[key] instanceof Uint8Array) || d.map[key].length !== n) throw new SaveError('Kartendaten sind beschädigt');
  }
  const state: GameState = {
    turn: d.turn,
    map: d.map,
    options: d.options,
    starts: d.starts,
    players: d.players.map((p) => ({ ...p, visible: new Uint8Array(n) })),
    units: d.units,
    nextUnitId: d.nextUnitId,
    cities: d.cities,
    nextCityId: d.nextCityId,
    jobs: d.jobs,
    tileOwner: new Int16Array(n).fill(-1),
    tileCity: new Int32Array(n).fill(-1),
    rng: Rng.fromState(d.rngState),
  };
  recomputeOwnership(state);
  for (const c of state.cities) assignTiles(state, c);
  return state;
}
