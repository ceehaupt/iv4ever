// Automatische Arbeiter: Auswahl des nächsten Auftrags (Feld + Arbeit) – gemeinsam für KI und Mensch.
// Rein und deterministisch; die Ausführung (Hinlaufen, Auftrag erteilen) übernehmen game.ts bzw. ai.ts.
import { type City, cityReport, knowsFn, playerContext } from './city';
import type { GameState, Unit } from './game';
import { Orders } from './game';
import { tileDistance, tilesAround } from './hex';
import { type Knows, tileYields } from './map';
import { findPath, landCost } from './path';
import { BuildingId } from './rules/buildings';
import { improvementForJob, type JobKind, RESOURCE_IMPROVEMENT } from './rules/improvements';
import { RESOURCES } from './rules/resources';
import { Feature, type Yields } from './rules/terrain';
import { MOVE_SCALE, UNIT_TYPES } from './rules/units';
import { ALL_JOBS, applyJob, jobBlocker, jobTurns } from './work';

/** Suchradius um den Arbeiter. */
const SEARCH_RADIUS = 6;
/** Wert eines Straßenfelds auf der Verbindung zwischen Städten (je Arbeitsrunde, in gewichteten Ertragspunkten). */
const CONNECT_ROAD_VALUE = 1.2;
/** Zusatzwert, wenn eine Verbesserung eine Ressource erschließt (Luxus/strategisch). */
const RESOURCE_BONUS = 2;
/** Verschmutzung beseitigen: Zusatzwert (Gesundheit der Umgebung). */
const CLEANUP_BONUS = 1.5;
/** Mindestwert, unter dem ein Auftrag nicht lohnt. */
const MIN_SCORE = 0.08;

export interface WorkerTask {
  tile: number;
  job: JobKind;
  score: number;
}

/** Straßenfelder, die nicht angebundene Städte mit der Hauptstadt verbinden würden. */
export function desiredRoads(state: GameState, pid: number): Set<number> {
  const out = new Set<number>();
  const cities = state.cities.filter((c) => c.owner === pid);
  const capital = cities.find((c) => c.buildings.includes(BuildingId.Palace));
  if (!capital) return out;
  const ctx = playerContext(state, pid);
  const cost = landCost(state.map, () => true, (i) => state.tileOwner[i] >= 0 && state.tileOwner[i] !== pid);
  for (const c of cities) {
    if (c === capital || ctx.connected.has(c.id)) continue;
    const path = findPath({ map: state.map, from: c.tile, to: capital.tile, maxMoves: MOVE_SCALE, movesLeft: MOVE_SCALE, cost, limit: 2500 });
    if (path) for (const t of path.tiles) if (!state.map.road[t]) out.add(t);
  }
  return out;
}

/** Felder, die andere eigene Arbeiter schon bearbeiten oder ansteuern. */
export function claimedWorkTiles(state: GameState, u: Unit): Set<number> {
  const out = new Set<number>();
  for (const o of state.units) {
    if (o === u || o.owner !== u.owner || !UNIT_TYPES[o.type].canWork) continue;
    if (o.orders === Orders.Work) out.add(o.tile);
    if (o.aiTarget !== undefined) out.add(o.aiTarget);
  }
  return out;
}

/** Gewichte je Ertragsart nach dem Bedarf der Stadt: Hunger → Nahrung, schwache Produktion → Produktion. */
function needWeights(state: GameState, c: City | undefined): Yields {
  if (!c) return { food: 1.2, prod: 1.5, trade: 0.8 };
  const r = cityReport(state, c);
  const food = r.surplus <= 0 ? 3 : r.surplus < 2 ? 2 : 1.2;
  const prod = r.yields.prod < 3 ? 2.4 : r.yields.prod < 6 ? 1.8 : 1.4;
  return { food, prod, trade: 0.9 };
}

/** Ertrag des Felds nach den gegebenen Aufträgen (auf einer Kopie der Feldwerte simuliert). */
function yieldsAfter(state: GameState, t: number, jobs: JobKind[], knows: Knows): Yields {
  const m = state.map;
  const saved = [m.improvement[t], m.feature[t], m.road[t], m.pollution[t]] as const;
  for (const j of jobs) applyJob(m, t, j);
  const y = tileYields(m, t, knows);
  [m.improvement[t], m.feature[t], m.road[t], m.pollution[t]] = saved;
  return y;
}

const weigh = (y: Yields, w: Yields) => y.food * w.food + y.prod * w.prod + y.trade * w.trade;

/**
 * Bester nächster Auftrag für einen Arbeiter: Wert = gewichteter Mehrertrag je Arbeitsrunde (inkl. Weg).
 * Bewirtschaftete Felder zählen voll, unbewirtschaftete eigene Felder abgeschwächt. Roden nur zusammen mit einer
 * Folgeverbesserung, die mehr bringt als der Wald. Bestehende Verbesserungen werden nur für Ressourcen ersetzt.
 */
export function chooseWorkerTask(
  state: GameState, u: Unit, roads: Set<number>, claimed: Set<number> = claimedWorkTiles(state, u), only?: number,
): WorkerTask | null {
  const pid = u.owner;
  const m = state.map;
  const knows = knowsFn(state, pid);
  const speed = Math.max(1, UNIT_TYPES[u.type].moves);
  const weights = new Map<number, Yields>();
  const weightsFor = (cityId: number) => {
    let w = weights.get(cityId);
    if (!w) {
      w = needWeights(state, state.cities.find((c) => c.id === cityId));
      weights.set(cityId, w);
    }
    return w;
  };
  let best: WorkerTask | null = null;
  for (const t of only !== undefined ? [only] : tilesAround(m, u.tile, SEARCH_RADIUS)) {
    if (claimed.has(t)) continue;
    const ownTile = state.tileOwner[t] === pid;
    if (!ownTile && !roads.has(t)) continue;
    const cityId = state.tileCity[t];
    const city = cityId >= 0 ? state.cities.find((c) => c.id === cityId) : undefined;
    const worked = city ? t === city.tile || city.worked.includes(t) : false; // Stadtfeld wird immer bewirtschaftet
    // Unbewirtschaftete Felder bringen erst etwas, wenn die Stadt wächst.
    const relevance = worked ? 1 : city ? 0.55 : 0.3;
    const w = weightsFor(cityId);
    const now = weigh(tileYields(m, t, knows), w);
    const res = RESOURCES[m.resource[t]];
    const travel = Math.ceil(tileDistance(m, u.tile, t) / speed);
    const consider = (job: JobKind, gain: number, turns: number) => {
      const score = gain / (turns + travel);
      if (score > MIN_SCORE && (!best || score > best.score)) best = { tile: t, job, score };
    };
    for (const job of ALL_JOBS) {
      if (jobBlocker(m, state.tileOwner, pid, t, job, knows)) continue;
      if (job === 'road') {
        const gain = roads.has(t) ? CONNECT_ROAD_VALUE * jobTurns(job) : 0;
        if (gain > 0) consider(job, gain, jobTurns(job));
        continue;
      }
      if (job === 'cleanup') {
        consider(job, (weigh(yieldsAfter(state, t, [job], knows), w) - now) * relevance + CLEANUP_BONUS, jobTurns(job));
        continue;
      }
      if (job === 'clear') {
        // Roden lohnt nur mit Folgeverbesserung (z. B. Farm) – nie auf Ressourcenfeldern.
        if (res) continue;
        for (const next of ALL_JOBS) {
          if (next === 'road' || next === 'clear' || next === 'cleanup') continue;
          const saved = m.feature[t];
          m.feature[t] = Feature.None;
          const blocked = jobBlocker(m, state.tileOwner, pid, t, next, knows);
          m.feature[t] = saved;
          if (blocked) continue;
          const gain = (weigh(yieldsAfter(state, t, ['clear', next], knows), w) - now) * relevance;
          if (gain > 0) consider(job, gain, jobTurns(job) + jobTurns(next));
        }
        continue;
      }
      const imp = improvementForJob(job);
      const unlocks = res !== undefined && res !== null && RESOURCE_IMPROVEMENT[res.key] === imp;
      // Vorhandene Verbesserung nur ersetzen, wenn die neue eine Ressource erschließt (kein Hin und Her).
      if (m.improvement[t] && !unlocks) continue;
      const gain = (weigh(yieldsAfter(state, t, [job], knows), w) - now) * relevance + (unlocks ? RESOURCE_BONUS : 0);
      if (gain > 0) consider(job, gain, jobTurns(job));
    }
  }
  return best;
}
