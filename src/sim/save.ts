import type { Religion } from './religion';
import { assignTiles, type City, recomputeOwnership } from './city';
import type { Camp } from './barbarians';
import { createDiplomacy, type Diplomacy } from './diplomacy';
import type { Victory } from './victory';
import { DEFAULT_RATE, type GameState, newPlayer, type TradeRoute, type Unit } from './game';
import { DEFAULT_DOCTRINES } from './rules/doctrines';
import { TECHS } from './rules/techs';
import { type Persona, personaFor } from './rules/leaders';
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
 * 4 – M5: Lebenspunkte/Erfahrung/Beförderungen, Plünderer (eigener Spieler) und Lager
 * 5 – M7: Diplomatie (Beziehungen, Gedächtnis, Angebote), Gewinner
 * 6 – M8: Leitbilder und Umbruch je Spieler, Handelsrouten
 * 7 – Umwelt: Verschmutzung je Feld
 * 8 – Religion: Religionen, Glaube je Spieler (Stadtreligion steckt in den Städten)
 */
export const SAVE_VERSION = 8;

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
  barbarian?: boolean;
  persona?: Persona;
  doctrines: number[];
  upheaval: number;
  faith?: number;
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
  barbarian: number;
  camps: Camp[];
  diplomacy: Diplomacy;
  winner: Victory | null;
  routes: TradeRoute[];
  religions: Religion[];
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
      pollution: s.map.pollution.slice(),
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
      ...(p.barbarian ? { barbarian: true } : {}),
      ...(p.persona ? { persona: { ...p.persona } } : {}),
      doctrines: p.doctrines.slice(),
      upheaval: p.upheaval,
      faith: p.faith ?? 0,
    })),
    units: s.units.map((u) => ({ ...u, path: u.path ? u.path.slice() : null, promotions: u.promotions.slice(), exploreSeen: u.exploreSeen?.slice() })),
    nextUnitId: s.nextUnitId,
    cities: s.cities.map((c) => structuredClone(c)),
    nextCityId: s.nextCityId,
    jobs: { ...s.jobs },
    barbarian: s.barbarian,
    camps: s.camps.map((c) => ({ ...c })),
    diplomacy: structuredClone(s.diplomacy),
    winner: s.winner ? { ...s.winner } : null,
    routes: s.routes.map((r) => ({ ...r })),
    religions: s.religions.map((r) => ({ ...r })),
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
  if (d.version === 3) {
    const n = d.map.width * d.map.height;
    const barbarian = d.players.length;
    const { visible: _v, ...barb } = newPlayer(barbarian, n, 'Plünderer', false);
    d = {
      ...d,
      version: 4,
      players: [...d.players, { ...barb, barbarian: true }],
      units: d.units.map((u) => ({ ...u, hp: 100, xp: 0, promotions: [], acted: false })),
      barbarian,
      camps: [],
    };
  }
  if (d.version === 4) {
    d = { ...d, version: 5, diplomacy: createDiplomacy(), winner: null };
  }
  if (d.version === 5) {
    d = {
      ...d,
      version: 6,
      routes: [],
      players: d.players.map((p) => ({ ...p, doctrines: [DEFAULT_DOCTRINES.gov, DEFAULT_DOCTRINES.econ, DEFAULT_DOCTRINES.society], upheaval: 0 })),
    };
  }
  if (d.version === 6) {
    d = { ...d, version: 7, map: { ...d.map, pollution: new Uint8Array(d.map.width * d.map.height) } };
  }
  if (d.version === 7) {
    d = { ...d, version: 8, religions: [], players: d.players.map((p) => ({ ...p, faith: 0 })) };
  }
  return d;
}

function padTechs(t: Uint8Array): Uint8Array {
  if (t.length >= TECHS.length) return t;
  const out = new Uint8Array(TECHS.length);
  out.set(t);
  return out;
}

export function fromSaveData(raw: SaveData): GameState {
  if (!raw || typeof raw !== 'object') throw new SaveError('Speicherstand ist beschädigt');
  if (typeof raw.version !== 'number' || raw.version < 1 || raw.version > SAVE_VERSION) {
    throw new SaveError(
      typeof raw.version === 'number' && raw.version > SAVE_VERSION
        ? `Dieser Spielstand stammt aus einer neueren Spielversion (Format ${raw.version}, dieses Spiel kennt bis ${SAVE_VERSION}). Bitte das Spiel aktualisieren.`
        : `Speicherstand-Version ${raw.version} wird nicht unterstützt (erwartet ≤ ${SAVE_VERSION})`,
    );
  }
  const d = migrate(raw);
  const n = d.map.width * d.map.height;
  for (const key of ['terrain', 'relief', 'feature', 'resource', 'river', 'improvement', 'road', 'pollution'] as const) {
    if (!(d.map[key] instanceof Uint8Array) || d.map[key].length !== n) throw new SaveError('Kartendaten sind beschädigt');
  }
  const state: GameState = {
    turn: d.turn,
    map: d.map,
    options: d.options,
    starts: d.starts,
    // Neue Technologien werden hinten angehängt: ältere Stände bekommen längere Arrays (unbekannt = 0).
    players: d.players.map((p) => ({ ...p, techs: padTechs(p.techs), visible: new Uint8Array(n) })),
    units: d.units,
    nextUnitId: d.nextUnitId,
    cities: d.cities,
    nextCityId: d.nextCityId,
    jobs: d.jobs,
    barbarian: d.barbarian,
    camps: d.camps,
    diplomacy: d.diplomacy,
    winner: d.winner,
    routes: d.routes,
    religions: d.religions,
    tileOwner: new Int16Array(n).fill(-1),
    tileCity: new Int32Array(n).fill(-1),
    rng: Rng.fromState(d.rngState),
  };
  // Ältere Stände ohne KI-Persönlichkeit nachrüsten.
  for (const p of state.players) {
    if (!p.human && !p.barbarian && !p.persona) p.persona = personaFor(d.options.seed, p.id - 1);
  }
  recomputeOwnership(state);
  for (const c of state.cities) assignTiles(state, c);
  return state;
}
