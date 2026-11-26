import type { GameMap, Knows } from './map';
import {
  CLEANUP_TECH, CLEANUP_TURNS, CLEAR_TECH, CLEAR_TURNS, IMPROVEMENTS, improvementForJob, type JobKind, JOB_NAMES, ROAD_TECH, ROAD_TURNS,
} from './rules/improvements';
import { RESOURCES, resourceFits } from './rules/resources';
import { Feature, isWater, Relief } from './rules/terrain';
import { TECHS } from './rules/techs';

/**
 * Arbeiteraufträge – reine Prüf- und Anwendungsfunktionen auf der Karte,
 * damit Oberfläche (Knöpfe) und Simulation dieselben Regeln verwenden.
 */
export const ALL_JOBS: readonly JobKind[] = ['road', 'farm', 'mine', 'pasture', 'camp', 'plantation', 'lumbermill', 'quarry', 'clear', 'cleanup'];

export function jobTurns(job: JobKind): number {
  if (job === 'road') return ROAD_TURNS;
  if (job === 'clear') return CLEAR_TURNS;
  if (job === 'cleanup') return CLEANUP_TURNS;
  return IMPROVEMENTS[improvementForJob(job)]!.turns;
}

export function jobTech(job: JobKind): number {
  if (job === 'road') return ROAD_TECH;
  if (job === 'clear') return CLEAR_TECH;
  if (job === 'cleanup') return CLEANUP_TECH;
  return IMPROVEMENTS[improvementForJob(job)]!.tech;
}

/** Grund, warum der Auftrag hier nicht geht – oder null. */
export function jobBlocker(
  map: GameMap, tileOwner: ArrayLike<number>, owner: number, tile: number, job: JobKind, knows: Knows,
): string | null {
  if (isWater(map.terrain[tile])) return 'Nur an Land';
  if (map.relief[tile] === Relief.Mountain || map.feature[tile] === Feature.Ice) return 'Nicht auf diesem Gelände';
  if (!knows(jobTech(job))) return `Benötigt ${TECHS[jobTech(job)].name}`;
  const o = tileOwner[tile];
  if (o >= 0 && o !== owner) return 'Fremdes Gebiet';
  const res = RESOURCES[map.resource[tile]];
  if (job === 'road') return map.road[tile] ? 'Hier ist schon eine Straße' : null;
  if (job === 'cleanup') return !map.pollution[tile] ? 'Hier ist nichts verschmutzt' : o !== owner ? 'Nur im eigenen Gebiet' : null;
  if (job === 'clear') {
    const f = map.feature[tile];
    if (f !== Feature.Forest && f !== Feature.Jungle) return 'Nur Wald oder Dschungel';
    if (res && !resourceFits(res, map.terrain[tile], map.relief[tile], Feature.None)) return `${res.name} braucht den Bewuchs`;
    return null;
  }
  if (o !== owner) return 'Nur im eigenen Gebiet';
  const id = improvementForJob(job);
  if (map.improvement[tile] === id) return `${JOB_NAMES[job]} ist schon vorhanden`;
  const imp = IMPROVEMENTS[id]!;
  if (!imp.allowed(map.terrain[tile], map.relief[tile], map.feature[tile], res ? res.key : null)) {
    return `${JOB_NAMES[job]} passt nicht auf dieses Feld`;
  }
  return null;
}

/** Fertigen Auftrag auf die Karte anwenden. */
export function applyJob(map: GameMap, tile: number, job: JobKind): void {
  if (job === 'road') {
    map.road[tile] = 1;
    return;
  }
  if (job === 'cleanup') {
    map.pollution[tile] = 0;
    return;
  }
  if (job === 'clear') {
    map.feature[tile] = Feature.None;
    // Verbesserungen, die den Bewuchs brauchten, verschwinden.
    const imp = IMPROVEMENTS[map.improvement[tile]];
    const res = RESOURCES[map.resource[tile]];
    if (imp && !imp.allowed(map.terrain[tile], map.relief[tile], Feature.None, res ? res.key : null)) map.improvement[tile] = 0;
    return;
  }
  map.improvement[tile] = improvementForJob(job);
}
