import { Feature, Relief, Terrain, type Yields } from './terrain';
import { TechId } from './techs';

/**
 * Geländeverbesserungen durch Arbeiter. Ein Feld hat höchstens eine Verbesserung;
 * Straßen liegen auf einer eigenen Ebene und kommen zusätzlich dazu.
 */
export const Improvement = {
  None: 0,
  Farm: 1,
  Mine: 2,
  Pasture: 3,
  Camp: 4,
  Plantation: 5,
  Lumbermill: 6,
  Quarry: 7,
} as const;

/** Arbeiteraufträge: Verbesserungen plus Straße und Roden. */
export type JobKind = 'farm' | 'mine' | 'pasture' | 'camp' | 'plantation' | 'lumbermill' | 'quarry' | 'road' | 'clear';

export interface ImprovementType {
  key: string;
  job: JobKind;
  name: string;
  icon: string;
  tech: number;
  /** Arbeiter-Runden. */
  turns: number;
  delta: Yields;
  /** Erlaubt auf diesem Gelände (Ressourcen-Bedarf siehe resourceImprovement). */
  allowed: (terrain: number, relief: number, feature: number, resourceKey: string | null) => boolean;
}

const y = (food: number, prod: number, trade: number): Yields => ({ food, prod, trade });
const T = Terrain;
const flatOpen = (t: number, r: number, f: number) =>
  r === Relief.Flat && (f === Feature.None || f === Feature.Floodplain) && t !== T.Snow;

/** Ressourcen, deren Bonus eine bestimmte Verbesserung braucht. Wasser-Ressourcen brauchen „Fischerei“. */
export const RESOURCE_IMPROVEMENT: Record<string, number> = {
  wheat: Improvement.Farm,
  rice: Improvement.Farm,
  cattle: Improvement.Pasture,
  sheep: Improvement.Pasture,
  horses: Improvement.Pasture,
  game: Improvement.Camp,
  furs: Improvement.Camp,
  stone: Improvement.Quarry,
  copper: Improvement.Mine,
  iron: Improvement.Mine,
  gems: Improvement.Mine,
  gold: Improvement.Mine,
  salt: Improvement.Mine,
  dates: Improvement.Plantation,
  wine: Improvement.Plantation,
  spices: Improvement.Plantation,
  silk: Improvement.Plantation,
};

/** Index = Improvement-ID; 0 = keine. */
export const IMPROVEMENTS: readonly (ImprovementType | null)[] = [
  null,
  {
    key: 'farm', job: 'farm', name: 'Farm', icon: '🌱', tech: TechId.Agriculture, turns: 5, delta: y(1, 0, 0),
    allowed: (t, r, f) => flatOpen(t, r, f) && (t !== T.Desert || f === Feature.Floodplain),
  },
  {
    key: 'mine', job: 'mine', name: 'Mine', icon: '⛏️', tech: TechId.Mining, turns: 6, delta: y(0, 2, 0),
    allowed: (_t, r, f, res) => (r === Relief.Hill && f !== Feature.Jungle) || (res !== null && RESOURCE_IMPROVEMENT[res] === Improvement.Mine),
  },
  {
    key: 'pasture', job: 'pasture', name: 'Weide', icon: '🐂', tech: TechId.AnimalHusbandry, turns: 4, delta: y(0, 1, 0),
    allowed: (_t, _r, _f, res) => res !== null && RESOURCE_IMPROVEMENT[res] === Improvement.Pasture,
  },
  {
    key: 'camp', job: 'camp', name: 'Jagdlager', icon: '🏕️', tech: TechId.Hunting, turns: 4, delta: y(0, 0, 1),
    allowed: (_t, _r, _f, res) => res !== null && RESOURCE_IMPROVEMENT[res] === Improvement.Camp,
  },
  {
    key: 'plantation', job: 'plantation', name: 'Plantage', icon: '🌿', tech: TechId.Calendar, turns: 5, delta: y(0, 0, 1),
    allowed: (_t, _r, _f, res) => res !== null && RESOURCE_IMPROVEMENT[res] === Improvement.Plantation,
  },
  {
    key: 'lumbermill', job: 'lumbermill', name: 'Sägewerk', icon: '🪵', tech: TechId.Woodworking, turns: 5, delta: y(0, 1, 1),
    allowed: (_t, _r, f, res) => f === Feature.Forest && (res === null || RESOURCE_IMPROVEMENT[res] !== Improvement.Camp),
  },
  {
    key: 'quarry', job: 'quarry', name: 'Steinbruch', icon: '🧱', tech: TechId.Masonry, turns: 5, delta: y(0, 1, 0),
    allowed: (_t, _r, _f, res) => res !== null && RESOURCE_IMPROVEMENT[res] === Improvement.Quarry,
  },
];

export const ROAD_TECH = TechId.Wheel;
export const ROAD_TURNS = 2;
export const CLEAR_TECH = TechId.BronzeWorking;
export const CLEAR_TURNS = 4;

export function improvementForJob(job: JobKind): number {
  return IMPROVEMENTS.findIndex((i) => i?.job === job);
}

export const JOB_NAMES: Record<JobKind, string> = {
  farm: 'Farm', mine: 'Mine', pasture: 'Weide', camp: 'Jagdlager', plantation: 'Plantage',
  lumbermill: 'Sägewerk', quarry: 'Steinbruch', road: 'Straße', clear: 'Roden',
};

export const JOB_ICONS: Record<JobKind, string> = {
  farm: '🌱', mine: '⛏️', pasture: '🐂', camp: '🏕️', plantation: '🌿',
  lumbermill: '🪵', quarry: '🧱', road: '🛤️', clear: '🪓',
};
