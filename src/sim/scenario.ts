// Szenarien: selbst gebaute Karten mit Startfeldern (Karteneditor ⇄ Datei ⇄ neues Spiel).
// Dateiformat: JSON, Kartenebenen als Base64. Läuft im Browser, im Worker und in Node.
import { forEachNeighbor, tileDistance } from './hex';
import { createMap, type GameMap, hasRiver, setRiver } from './map';
import type { GeneratedWorld } from './mapgen';
import { fromBase64, toBase64 } from './saveCodec';
import { RESOURCES } from './rules/resources';
import { FEATURE, isWater, RELIEF, Relief, TERRAIN } from './rules/terrain';

export const SCENARIO_KIND = 'iv4ever-scenario';
export const SCENARIO_VERSION = 1;
export const MIN_STARTS = 2;
export const MAX_STARTS = 10;
/** Mindestabstand zwischen Startfeldern. */
export const MIN_START_DISTANCE = 4;
export const MIN_SIZE = 16;
export const MAX_SIZE = 160;

/** Im Szenario gespeicherte Kartenebenen (Verbesserungen, Straßen, Verschmutzung gehören nicht dazu). */
const FIELDS = ['terrain', 'relief', 'feature', 'resource', 'river'] as const;

export interface Scenario {
  name: string;
  description: string;
  map: GameMap;
  /** Startfeld je Volk; Index 0 = erster Mensch. */
  starts: number[];
  /** Optional: Rundenlimit für den Punktsieg. */
  turnLimit?: number;
}

export class ScenarioError extends Error {}

export function encodeScenario(s: Scenario): string {
  const map: Record<string, unknown> = { width: s.map.width, height: s.map.height, wrapX: s.map.wrapX, seed: s.map.seed };
  for (const f of FIELDS) map[f] = toBase64(s.map[f]);
  return JSON.stringify({
    kind: SCENARIO_KIND, version: SCENARIO_VERSION, name: s.name, description: s.description, starts: s.starts,
    ...(s.turnLimit ? { turnLimit: s.turnLimit } : {}), map,
  }, null, 1);
}

/** check = false: nur Format und Kartenwerte prüfen, nicht die Spielbarkeit (Entwürfe im Editor). */
export function decodeScenario(text: string, check = true): Scenario {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ScenarioError('Keine gültige JSON-Datei');
  }
  if (raw?.kind !== SCENARIO_KIND) throw new ScenarioError('Keine iv4ever-Szenariodatei');
  if (typeof raw.version !== 'number' || raw.version > SCENARIO_VERSION) {
    throw new ScenarioError('Das Szenario stammt aus einer neueren Version von iv4ever');
  }
  const m = raw.map as Record<string, unknown> | undefined;
  const width = Number(m?.width);
  const height = Number(m?.height);
  if (!m || !Number.isInteger(width) || !Number.isInteger(height) || width < MIN_SIZE || height < MIN_SIZE || width > MAX_SIZE || height > MAX_SIZE) {
    throw new ScenarioError('Ungültige Kartengröße');
  }
  const map = createMap(width, height, Number(m.seed) >>> 0, m.wrapX !== false);
  for (const f of FIELDS) {
    let bytes: Uint8Array;
    try {
      bytes = fromBase64(String(m[f] ?? ''));
    } catch {
      throw new ScenarioError(`Kartenebene „${f}“ ist beschädigt`);
    }
    if (bytes.length !== width * height) throw new ScenarioError(`Kartenebene „${f}“ hat die falsche Größe`);
    map[f].set(bytes);
  }
  const starts = Array.isArray(raw.starts) ? raw.starts.map(Number) : [];
  const s: Scenario = {
    name: String(raw.name ?? 'Ohne Namen').slice(0, 80),
    description: String(raw.description ?? '').slice(0, 2000),
    map,
    starts,
    turnLimit: Number.isInteger(raw.turnLimit) && Number(raw.turnLimit) > 0 ? Number(raw.turnLimit) : undefined,
  };
  const problems = validateScenario(s).filter((p) => check || !/Startfeld/.test(p));
  if (problems.length) throw new ScenarioError(problems[0]);
  if (!check) s.starts = s.starts.filter((t) => Number.isInteger(t) && !startBlocker(map, t));
  return s;
}

/** Ist das Feld als Startfeld geeignet? */
export function startBlocker(map: GameMap, tile: number): string | null {
  if (tile < 0 || tile >= map.terrain.length) return 'außerhalb der Karte';
  if (isWater(map.terrain[tile])) return 'Wasser';
  if (map.relief[tile] === Relief.Mountain) return 'Berg';
  return null;
}

/** Alle Probleme eines Szenarios (leer = spielbar). */
export function validateScenario(s: Scenario): string[] {
  const out: string[] = [];
  const m = s.map;
  const n = m.width * m.height;
  for (let i = 0; i < n; i++) {
    if (m.terrain[i] >= TERRAIN.length || m.relief[i] >= RELIEF.length || m.feature[i] >= FEATURE.length || m.resource[i] >= RESOURCES.length || m.river[i] > 63) {
      out.push(`Ungültiger Wert auf Feld ${i % m.width}, ${(i / m.width) | 0}`);
      break;
    }
  }
  if (s.starts.length < MIN_STARTS) out.push(`Mindestens ${MIN_STARTS} Startfelder setzen`);
  if (s.starts.length > MAX_STARTS) out.push(`Höchstens ${MAX_STARTS} Startfelder`);
  s.starts.forEach((t, k) => {
    if (!Number.isInteger(t)) {
      out.push(`Startfeld ${k + 1} ist ungültig`);
      return;
    }
    const b = startBlocker(m, t);
    if (b) out.push(`Startfeld ${k + 1} liegt auf ungeeignetem Feld (${b})`);
    for (let j = 0; j < k; j++) {
      if (Number.isInteger(s.starts[j]) && t >= 0 && t < n && tileDistance(m, t, s.starts[j]) < MIN_START_DISTANCE) {
        out.push(`Startfelder ${j + 1} und ${k + 1} liegen zu dicht beieinander (mindestens ${MIN_START_DISTANCE} Felder)`);
      }
    }
  });
  return out;
}

/** Welt für createGame. Die Karte wird kopiert, damit das Szenario unverändert bleibt. */
export function scenarioWorld(s: Scenario): GeneratedWorld {
  const map = createMap(s.map.width, s.map.height, s.map.seed, s.map.wrapX);
  for (const f of FIELDS) map[f].set(s.map[f]);
  return { map, starts: s.starts.slice() };
}

/** Passt Bewuchs, Ressource und Relief an das Gelände an (nach einer Änderung im Editor). */
export function tidyTile(map: GameMap, i: number): void {
  const water = isWater(map.terrain[i]);
  if (water) {
    map.relief[i] = Relief.Flat;
    map.feature[i] = 0;
  }
  const r = RESOURCES[map.resource[i]];
  if (r && (!r.terrains.includes(map.terrain[i]) || !r.reliefs.includes(map.relief[i]) || !r.features.includes(map.feature[i]))) {
    map.resource[i] = 0;
  }
}

/** Flüsse am Feld entfernen (auch die Kanten, die beim Nachbarn gespeichert sind). */
export function clearRivers(map: GameMap, i: number): void {
  map.river[i] = 0;
  forEachNeighbor(map, i, (nb, dir) => {
    map.river[nb] &= ~(1 << ((dir + 3) % 6));
  });
}

/** Fluss auf der gemeinsamen Kante zweier Nachbarfelder an- bzw. ausschalten. false = keine Nachbarn. */
export function toggleRiverEdge(map: GameMap, a: number, b: number): boolean {
  let dir = -1;
  forEachNeighbor(map, a, (nb, d) => {
    if (nb === b) dir = d;
  });
  if (dir < 0) return false;
  if (hasRiver(map, a, dir)) {
    // Kante liegt entweder bei a (Richtung dir) oder bei b (Gegenrichtung).
    map.river[a] &= ~(1 << dir);
    map.river[b] &= ~(1 << ((dir + 3) % 6));
  } else setRiver(map, a, dir);
  return true;
}
