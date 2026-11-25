import { generateRivers } from './gen/rivers';
import { placeResources } from './gen/resources';
import { chooseStarts } from './gen/starts';
import { forEachNeighbor } from './hex';
import { createMap, type GameMap } from './map';
import { WrapNoise } from './noise';
import { hash2, Rng } from './rng';
import type { Difficulty } from './rules/leaders';
import { Feature, Relief, Terrain } from './rules/terrain';

export type MapScript = 'continents' | 'pangaea' | 'archipelago';
export type SeaLevel = 'low' | 'normal' | 'high';
export type Climate = 'cool' | 'temperate' | 'warm';

export interface MapGenOptions {
  width: number;
  height: number;
  seed: number;
  players: number;
  script?: MapScript;
  seaLevel?: SeaLevel;
  climate?: Climate;
  /** Schwierigkeitsgrad (wirkt nur auf die KI, nicht auf die Karte). */
  difficulty?: Difficulty;
  /** Rundenlimit für den Punktsieg. */
  turnLimit?: number;
}

export interface GeneratedWorld {
  map: GameMap;
  /** Startfeld je Spieler (Index 0 = menschlicher Spieler). */
  starts: number[];
}

/** Zeilenabstand in Spaltenbreiten – Rauschen läuft in "flachen" Hex-Koordinaten, damit nichts verzerrt. */
const ROW = Math.sqrt(3) / 2;
const LAND_RATIO: Record<SeaLevel, number> = { low: 0.44, normal: 0.36, high: 0.28 };
const CLIMATE_SHIFT: Record<Climate, number> = { cool: -0.08, temperate: 0, warm: 0.08 };

interface Blob {
  x: number;
  y: number;
  r: number;
  w: number;
}

function smooth01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

function quantile(values: ArrayLike<number>, q: number): number {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
}

function makeBlobs(script: MapScript, W: number, H: number, rng: Rng): Blob[] {
  const blobs: Blob[] = [];
  const add = (count: number, yMin: number, yMax: number, rMin: number, rMax: number, wMin: number, wMax: number) => {
    for (let k = 0; k < count; k++) {
      blobs.push({
        x: rng.range(0, W),
        y: rng.range(yMin, yMax) * H * ROW,
        r: rng.range(rMin, rMax) * W,
        w: rng.range(wMin, wMax),
      });
    }
  };
  switch (script) {
    case 'pangaea': {
      const x = rng.range(0, W);
      blobs.push({ x, y: 0.5 * H * ROW, r: 0.3 * W, w: 1 });
      blobs.push({ x: x + rng.range(-0.15, 0.15) * W, y: rng.range(0.35, 0.65) * H * ROW, r: 0.2 * W, w: 0.9 });
      add(2 + rng.int(3), 0.2, 0.8, 0.03, 0.06, 0.5, 0.75);
      break;
    }
    case 'archipelago':
      // Viele kleine Inseln; geringerer Rauschanteil (siehe detailAmp) hält sie getrennt.
      add(26 + rng.int(10), 0.15, 0.85, 0.028, 0.05, 0.7, 1);
      break;
    default: {
      // Kontinente gleichmäßig um den Globus verteilen, damit sie sich nicht verschmelzen.
      const count = 2 + rng.int(3);
      const x0 = rng.range(0, W);
      for (let k = 0; k < count; k++) {
        blobs.push({
          x: x0 + (k / count) * W + rng.range(-0.06, 0.06) * W,
          y: rng.range(0.3, 0.7) * H * ROW,
          r: rng.range(0.15, 0.22) * W * (count === 2 ? 1.25 : 1),
          w: rng.range(0.85, 1),
        });
      }
      add(3 + rng.int(5), 0.15, 0.85, 0.035, 0.07, 0.55, 0.8);
    }
  }
  return blobs;
}

/**
 * Erzeugt eine umlaufende Welt (Ost-West):
 * 1. Höhe = verzerrte Landmassen-Blobs + fraktales Rauschen, Polregionen fallen ins Meer ab.
 * 2. Meeresspiegel über Quantil → exakter Landanteil.
 * 3. Gebirgsketten über Grat-Rauschen, Hügel darum herum.
 * 4. Klima aus Breitengrad + Rauschen → Biome, Wald, Dschungel; Seen, Küste, Packeis.
 * 5. Flüsse, Schwemmland, Ressourcen, Startpositionen.
 */
export function generateWorld(opts: MapGenOptions): GeneratedWorld {
  const W = opts.width;
  const H = opts.height;
  const seed = opts.seed >>> 0;
  const script = opts.script ?? 'continents';
  const landRatio = LAND_RATIO[opts.seaLevel ?? 'normal'] * (script === 'archipelago' ? 0.8 : 1);
  const climateShift = CLIMATE_SHIFT[opts.climate ?? 'temperate'];
  const n = W * H;
  const map = createMap(W, H, seed, true);
  const rng = new Rng(seed);

  // Rauschfelder mit Strukturgröße in Feldern – nahtlos in x.
  const nWarp = new WrapNoise(W, 9);
  const nDetail = new WrapNoise(W, 7);
  const nRidge = new WrapNoise(W, 5);
  const nMoist = new WrapNoise(W, 9);
  const nTemp = new WrapNoise(W, 7);
  const nForest = new WrapNoise(W, 4);

  // --- 1. Höhe -------------------------------------------------------------
  const blobs = makeBlobs(script, W, H, rng);
  const elev = new Float32Array(n);
  const warp = W * (script === 'archipelago' ? 0.05 : 0.1);
  const detailAmp = script === 'archipelago' ? 0.8 : 1.4;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const px = c + 0.5 * (r & 1);
      const py = r * ROW;
      // Domain-Warping macht aus Kreisen zerklüftete Küsten.
      const wx = px + (nWarp.fbm(px, py, seed + 21, 4) - 0.5) * 2 * warp;
      const wy = py + (nWarp.fbm(px, py, seed + 22, 4) - 0.5) * 2 * warp;
      let cont = 0;
      for (const b of blobs) {
        let dx = Math.abs(wx - b.x) % W;
        if (dx > W / 2) dx = W - dx; // kürzester Abstand um den Globus
        const d = Math.hypot(dx, wy - b.y) / b.r;
        if (d < 1) cont = Math.max(cont, b.w * (1 - d * d));
      }
      let h = cont + (nDetail.fbm(px, py, seed + 11, 5) - 0.5) * detailAmp;
      const ey = Math.min(r, H - 1 - r) / (H * 0.12);
      h -= (1 - smooth01(ey)) * 1.5;
      elev[r * W + c] = h;
    }
  }

  const sea = quantile(elev, 1 - landRatio);
  const land: number[] = [];
  let maxElev = sea;
  for (let i = 0; i < n; i++) {
    if (elev[i] > sea) {
      land.push(i);
      if (elev[i] > maxElev) maxElev = elev[i];
    }
  }

  // --- 2. Relief -----------------------------------------------------------
  const ridge = new Float32Array(land.length);
  for (let k = 0; k < land.length; k++) {
    const i = land[k];
    const r = (i / W) | 0;
    const px = (i % W) + 0.5 * (r & 1);
    const height01 = (elev[i] - sea) / (maxElev - sea || 1);
    // Kleine Höhengewichtung, sonst entstehen im Landesinneren Gebirgsklumpen statt Ketten.
    ridge[k] = nRidge.ridged(px, r * ROW, seed + 31, 4) + height01 * 0.12;
  }
  const mountainT = quantile(ridge, 0.92);
  const hillT = quantile(ridge, 0.72);

  // --- 3. Klima ------------------------------------------------------------
  const moistRaw = new Float32Array(land.length);
  for (let k = 0; k < land.length; k++) {
    const i = land[k];
    const r = (i / W) | 0;
    moistRaw[k] = nMoist.fbm((i % W) + 0.5 * (r & 1), r * ROW, seed + 41, 4);
  }
  // Rang-Normierung: Feuchte gleichverteilt in [0, 1] → Schwellwerte = Flächenanteile.
  const order = Array.from(moistRaw.keys()).sort((a, b) => moistRaw[a] - moistRaw[b]);
  const moist = new Float32Array(land.length);
  for (let k = 0; k < order.length; k++) moist[order[k]] = k / Math.max(1, order.length - 1);

  for (let k = 0; k < land.length; k++) {
    const i = land[k];
    const c = i % W;
    const r = (i / W) | 0;
    const px = c + 0.5 * (r & 1);
    const py = r * ROW;

    const relief = ridge[k] >= mountainT ? Relief.Mountain : ridge[k] >= hillT ? Relief.Hill : Relief.Flat;
    map.relief[i] = relief;

    const lat = Math.abs((r + 0.5) / H - 0.5) * 2;
    const temp =
      1 - lat + climateShift + (nTemp.fbm(px, py, seed + 51, 3) - 0.5) * 0.35 -
      (relief === Relief.Mountain ? 0.12 : relief === Relief.Hill ? 0.04 : 0);
    const m = moist[k];

    let terrain: number;
    if (temp < 0.14) terrain = Terrain.Snow;
    else if (temp < 0.3) terrain = Terrain.Tundra;
    else if (m < 0.22 && temp > 0.5) terrain = Terrain.Desert;
    else if (m < 0.5) terrain = Terrain.Plains;
    else terrain = Terrain.Grassland;

    let feature: number = Feature.None;
    if (relief !== Relief.Mountain) {
      if (temp > 0.8 && m > 0.62 && terrain !== Terrain.Desert) {
        terrain = Terrain.Grassland;
        feature = Feature.Jungle;
      } else if (
        m > 0.42 &&
        temp > 0.18 &&
        terrain !== Terrain.Desert &&
        terrain !== Terrain.Snow &&
        nForest.fbm(px, py, seed + 61, 3) > 0.52
      ) {
        feature = Feature.Forest;
      }
    }
    map.terrain[i] = terrain;
    map.feature[i] = feature;
  }

  // --- 4. Wasser: Seen, Küste, Ozean, Packeis -------------------------------
  const isLand = new Uint8Array(n);
  for (const i of land) isLand[i] = 1;
  classifyWater(map, isLand);
  for (let i = 0; i < n; i++) {
    if (isLand[i] || map.terrain[i] === Terrain.Lake) continue;
    const r = (i / W) | 0;
    const lat = Math.abs((r + 0.5) / H - 0.5) * 2;
    if (lat > 0.86 + (hash2(i % W, r, seed + 71) - 0.5) * 0.1) map.feature[i] = Feature.Ice;
  }

  // --- 5. Flüsse, Ressourcen, Starts ----------------------------------------
  generateRivers(map, { elev, count: Math.round(land.length / 45), rng });
  placeResources(map, rng);
  const starts = chooseStarts(map, opts.players, rng);
  return { map, starts };
}

/** Kleine abgeschlossene Wasserflächen werden Seen, Wasser neben Land wird Küste. */
function classifyWater(map: GameMap, isLand: Uint8Array): void {
  const n = map.width * map.height;
  const maxLake = Math.max(6, Math.round(n * 0.003));
  const comp = new Int32Array(n).fill(-1);
  const stack: number[] = [];
  const members: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isLand[i] || comp[i] >= 0) continue;
    members.length = 0;
    comp[i] = i;
    stack.push(i);
    while (stack.length) {
      const t = stack.pop()!;
      members.push(t);
      forEachNeighbor(map, t, (nb) => {
        if (!isLand[nb] && comp[nb] < 0) {
          comp[nb] = i;
          stack.push(nb);
        }
      });
    }
    const lake = members.length <= maxLake;
    for (const t of members) {
      map.relief[t] = Relief.Flat;
      map.feature[t] = Feature.None;
      if (lake) {
        map.terrain[t] = Terrain.Lake;
        continue;
      }
      let coastal = false;
      forEachNeighbor(map, t, (nb) => {
        if (isLand[nb]) coastal = true;
      });
      map.terrain[t] = coastal ? Terrain.Coast : Terrain.Ocean;
    }
  }
}

/** Kompatibilität für Tests/Werkzeuge: nur die Karte. */
export function generateMap(opts: Omit<MapGenOptions, 'players'> & { players?: number }): GameMap {
  return generateWorld({ players: 2, ...opts }).map;
}

