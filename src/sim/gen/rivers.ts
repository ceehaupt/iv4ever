import { neighborOf } from '../hex';
import { type GameMap, setRiver, touchesRiver } from '../map';
import type { Rng } from '../rng';
import { Feature, isWater, Relief, Terrain } from '../rules/terrain';

/**
 * Flüsse entlang der Hex-Kanten.
 *
 * Jede Hex-Ecke ist entweder die obere (Ecke 4) oder die untere (Ecke 1) Ecke genau eines Feldes.
 * Damit hat jede Ecke eine eindeutige ID: feld * 2 + (0 oben | 1 unten).
 * Ein Fluss wandert von Ecke zu Ecke bergab; jede durchlaufene Kante trennt zwei Landfelder.
 */

// Ecken eines Feldes (Winkel 30° + 60°·k): 0 rechts unten, 1 unten, 2 links unten, 3 links oben, 4 oben, 5 rechts oben.
// Kante in Richtung d liegt zwischen diesen Ecken:
const EDGE_CORNERS: readonly (readonly [number, number])[] = [
  [5, 0], // O
  [4, 5], // NO
  [3, 4], // NW
  [2, 3], // W
  [1, 2], // SW
  [0, 1], // SO
];

const TOP = 0;
const BOTTOM = 1;

/** Kanonische Ecken-ID von Ecke k des Feldes i, -1 am Kartenrand. */
function vertexId(m: GameMap, i: number, k: number): number {
  switch (k) {
    case 4: return i * 2 + TOP;
    case 1: return i * 2 + BOTTOM;
    case 5: { const n = neighborOf(m, i, 1); return n < 0 ? -1 : n * 2 + BOTTOM; } // NO-Nachbar, unten
    case 3: { const n = neighborOf(m, i, 2); return n < 0 ? -1 : n * 2 + BOTTOM; } // NW-Nachbar, unten
    case 0: { const n = neighborOf(m, i, 5); return n < 0 ? -1 : n * 2 + TOP; } // SO-Nachbar, oben
    case 2: { const n = neighborOf(m, i, 4); return n < 0 ? -1 : n * 2 + TOP; } // SW-Nachbar, oben
  }
  return -1;
}

interface VEdge {
  to: number;
  /** Feld, an dessen Kante (Richtung dir) der Fluss liegt. */
  tile: number;
  dir: number;
  other: number;
}

export interface RiverOptions {
  /** Höhe je Feld (aus der Kartengenerierung). */
  elev: Float32Array;
  count: number;
  rng: Rng;
}

export function generateRivers(m: GameMap, o: RiverOptions): void {
  const n = m.width * m.height;
  const vCount = n * 2;

  // Ecken-Graph aufbauen: Nachbarecken + die beiden Felder an der Kante.
  const adj: VEdge[][] = Array.from({ length: vCount }, () => []);
  const vTiles: number[][] = Array.from({ length: vCount }, () => []);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 6; k++) {
      const v = vertexId(m, i, k);
      if (v >= 0) vTiles[v].push(i);
    }
    for (let d = 0; d < 6; d++) {
      const other = neighborOf(m, i, d);
      if (other < 0 || other < i) continue; // jede Kante einmal
      const a = vertexId(m, i, EDGE_CORNERS[d][0]);
      const b = vertexId(m, i, EDGE_CORNERS[d][1]);
      if (a < 0 || b < 0) continue;
      adj[a].push({ to: b, tile: i, dir: d, other });
      adj[b].push({ to: a, tile: i, dir: d, other });
    }
  }

  const isLand = (t: number) => !isWater(m.terrain[t]);
  const vHeight = new Float32Array(vCount);
  const vWet = new Uint8Array(vCount);
  for (let v = 0; v < vCount; v++) {
    const ts = vTiles[v];
    let h = 0;
    for (const t of ts) {
      h += o.elev[t];
      if (!isLand(t)) vWet[v] = 1;
    }
    vHeight[v] = ts.length ? h / ts.length : 0;
  }

  // Quellen: hohe Ecken im Landesinneren, an Hügeln oder Gebirgen.
  const sources: number[] = [];
  for (let v = 0; v < vCount; v++) {
    const ts = vTiles[v];
    if (ts.length < 3 || vWet[v]) continue;
    if (ts.some((t) => m.relief[t] !== Relief.Flat) && ts.every((t) => m.terrain[t] !== Terrain.Snow)) {
      sources.push(v);
    }
  }
  sources.sort((a, b) => vHeight[b] - vHeight[a]);

  const onRiver = new Uint8Array(vCount);
  const usedSourceTiles = new Set<number>();
  let made = 0;
  for (let s = 0; s < sources.length && made < o.count; s++) {
    // Zufällige Auswahl unter den höheren Kandidaten, mit Abstand zueinander.
    if (o.rng.next() < 0.6) continue;
    const src = sources[s];
    if (onRiver[src] || vTiles[src].some((t) => usedSourceTiles.has(t))) continue;

    const path: VEdge[] = [];
    const visited = new Set<number>([src]);
    let v = src;
    let ok = false;
    for (let step = 0; step < 80; step++) {
      if (vWet[v] || (step > 0 && onRiver[v])) {
        ok = true; // Mündung ins Wasser oder in einen anderen Fluss
        break;
      }
      let best: VEdge | null = null;
      let bestH = Infinity;
      for (const e of adj[v]) {
        if (visited.has(e.to)) continue;
        // Kante muss zwischen zwei Landfeldern liegen, nicht durch Gebirge auf beiden Seiten.
        if (!isLand(e.tile) || !isLand(e.other)) continue;
        const h = vHeight[e.to] + o.rng.next() * 0.02;
        if (h < bestH) {
          bestH = h;
          best = e;
        }
      }
      if (!best) break;
      path.push(best);
      visited.add(best.to);
      v = best.to;
    }
    if (!ok || path.length < 3) continue;

    for (const e of path) setRiver(m, e.tile, e.dir);
    for (const e of path) {
      onRiver[e.to] = 1;
      usedSourceTiles.add(e.tile);
      usedSourceTiles.add(e.other);
    }
    onRiver[src] = 1;
    made++;
  }

  // Schwemmland: flache Wüste am Fluss.
  for (let i = 0; i < n; i++) {
    if (m.terrain[i] !== Terrain.Desert || m.relief[i] !== Relief.Flat || m.feature[i] !== Feature.None) continue;
    if (touchesRiver(m, i)) m.feature[i] = Feature.Floodplain;
  }
}
