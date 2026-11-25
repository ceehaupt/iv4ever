import { neighborOf, tileDistance } from './hex';
import type { GameMap } from './map';
import { MOVE_SCALE } from './rules/units';
import { isWater, tileMoveCost } from './rules/terrain';

/** Kosten für den Schritt von → nach (skaliert), Infinity = nicht betretbar. */
export type StepCost = (from: number, to: number) => number;

export interface PathQuery {
  map: GameMap;
  from: number;
  to: number;
  /** Volle Bewegungspunkte pro Runde (skaliert). */
  maxMoves: number;
  /** Verbleibende Punkte in dieser Runde (skaliert). */
  movesLeft: number;
  cost: StepCost;
  /** Abbruch nach so vielen untersuchten Feldern (Schutz bei unerreichbaren Zielen). */
  limit?: number;
}

export interface PathResult {
  /** Felder ohne Startfeld, letztes = Ziel. */
  tiles: number[];
  /** Für jedes Feld: in welcher Runde es erreicht wird (0 = diese Runde). */
  turns: number[];
}

/** Kosten eines Straßenschritts: ⅓ Bewegung, mit Ingenieurwesen ¼. */
export function roadStepCost(engineering: boolean): number {
  return engineering ? MOVE_SCALE / 4 : MOVE_SCALE / 3;
}

/** Schrittkosten nach Spielregeln (ohne Wissens-/Blockadeprüfung). */
export function stepCost(map: GameMap, from: number, to: number, roadCost: number): number {
  if (isWater(map.terrain[to])) return Infinity;
  if (map.road[from] && map.road[to]) return roadCost;
  return tileMoveCost(map.terrain[to], map.relief[to], map.feature[to]) * MOVE_SCALE;
}

/**
 * Landkosten aus Sicht eines Spielers. Unbekannte Felder werden optimistisch mit 1 angenommen
 * (wie in Strategiespielen üblich); blockierte Felder (fremde Einheiten/Städte) sind unpassierbar.
 */
export function landCost(
  map: GameMap, isKnown: (i: number) => boolean, isBlocked: (i: number) => boolean, roadCost = MOVE_SCALE / 3,
): StepCost {
  return (from, to) => {
    if (isBlocked(to)) return Infinity;
    if (!isKnown(to)) return MOVE_SCALE;
    return stepCost(map, from, to, roadCost);
  };
}

/** Kleiner Binär-Heap auf (Schlüssel, Wert). */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }

  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= k.length) break;
        const r = l + 1;
        const c = r < k.length && k[r] < k[l] ? r : l;
        if (k[c] >= lastK) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}

/**
 * A* mit Rundenlogik: Ein Feld darf betreten werden, solange noch Bewegung übrig ist –
 * auch wenn es mehr kostet (die Runde ist danach zu Ende). Optimiert wird die Ankunftszeit
 * (Runde, dann verbrauchte Punkte).
 */
export function findPath(q: PathQuery): PathResult | null {
  const { map, from, to, maxMoves, cost } = q;
  if (from === to || maxMoves <= 0) return null;
  if (!Number.isFinite(cost(to, to))) return null;
  const n = map.width * map.height;
  const limit = q.limit ?? n;

  // Zeit = Runde * maxMoves + verbrauchte Punkte in dieser Runde.
  const time = new Float64Array(n).fill(Infinity);
  const turnOf = new Int32Array(n);
  const leftOf = new Int32Array(n);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();

  time[from] = maxMoves - q.movesLeft;
  turnOf[from] = 0;
  leftOf[from] = q.movesLeft;
  heap.push(time[from] + tileDistance(map, from, to) * MOVE_SCALE, from);

  let expanded = 0;
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    if (cur === to) break;
    closed[cur] = 1;
    if (++expanded > limit) return null;

    for (let d = 0; d < 6; d++) {
      const nb = neighborOf(map, cur, d);
      if (nb < 0 || closed[nb]) continue;
      const c = cost(cur, nb);
      if (!Number.isFinite(c)) continue;
      let turn = turnOf[cur];
      let left = leftOf[cur];
      if (left <= 0) {
        turn++;
        left = maxMoves;
      }
      left = Math.max(0, left - c);
      const t = turn * maxMoves + (maxMoves - left);
      if (t < time[nb]) {
        time[nb] = t;
        turnOf[nb] = turn;
        leftOf[nb] = left;
        prev[nb] = cur;
        heap.push(t + tileDistance(map, nb, to) * MOVE_SCALE, nb);
      }
    }
  }
  if (prev[to] < 0) return null;

  const tiles: number[] = [];
  const turns: number[] = [];
  for (let t = to; t !== from; t = prev[t]) {
    tiles.push(t);
    turns.push(turnOf[t]);
  }
  tiles.reverse();
  turns.reverse();
  return { tiles, turns };
}
