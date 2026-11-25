/**
 * Hex-Gitter-Mathematik.
 * Spitze Hexagone ("pointy top"), Speicherung als Offset-Koordinaten "odd-r"
 * (ungerade Zeilen um ein halbes Feld nach rechts versetzt).
 * Optional Ost-West-Weltumrundung (Zylinder): Spalten werden modulo Breite gerechnet.
 * Referenz: https://www.redblobgames.com/grids/hexagons/
 */

export const SQRT3 = Math.sqrt(3);

export interface Grid {
  readonly width: number;
  readonly height: number;
  readonly wrapX: boolean;
}

/** Richtungen: 0 O, 1 NO, 2 NW, 3 W, 4 SW, 5 SO. Gegenrichtung = (d + 3) % 6. */
export const Dir = { E: 0, NE: 1, NW: 2, W: 3, SW: 4, SE: 5 } as const;

/** Nachbar-Offsets (dc, dr) für gerade bzw. ungerade Zeilen, Reihenfolge wie Dir. */
const ODDR_DIRS: readonly (readonly (readonly [number, number])[])[] = [
  [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]],
  [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]],
];

/** Spalte normieren; -1, wenn außerhalb und keine Weltumrundung. */
export function wrapCol(g: Grid, c: number): number {
  if (c >= 0 && c < g.width) return c;
  if (!g.wrapX) return -1;
  return ((c % g.width) + g.width) % g.width;
}

/** Index für (c, r) inkl. Umrundung; -1 außerhalb. */
export function tileAt(g: Grid, c: number, r: number): number {
  if (r < 0 || r >= g.height) return -1;
  const cc = wrapCol(g, c);
  return cc < 0 ? -1 : r * g.width + cc;
}

export function tileCol(g: Grid, i: number): number {
  return i % g.width;
}

export function tileRow(g: Grid, i: number): number {
  return (i / g.width) | 0;
}

/** Index des Nachbarn in Richtung dir (0–5) oder -1. */
export function neighbor(g: Grid, c: number, r: number, dir: number): number {
  const d = ODDR_DIRS[r & 1][dir];
  return tileAt(g, c + d[0], r + d[1]);
}

export function neighborOf(g: Grid, i: number, dir: number): number {
  return neighbor(g, i % g.width, (i / g.width) | 0, dir);
}

export function forEachNeighbor(g: Grid, i: number, fn: (n: number, dir: number) => void): void {
  const c = i % g.width;
  const r = (i / g.width) | 0;
  for (let dir = 0; dir < 6; dir++) {
    const n = neighbor(g, c, r, dir);
    if (n >= 0) fn(n, dir);
  }
}

export function offsetToAxialQ(c: number, r: number): number {
  return c - ((r - (r & 1)) >> 1);
}

export function axialToOffsetCol(q: number, r: number): number {
  return q + ((r - (r & 1)) >> 1);
}

function rawDistance(c1: number, r1: number, c2: number, r2: number): number {
  const dq = offsetToAxialQ(c1, r1) - offsetToAxialQ(c2, r2);
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Hex-Distanz, bei Umrundung über die kürzere Seite. */
export function hexDistance(g: Grid, c1: number, r1: number, c2: number, r2: number): number {
  let d = rawDistance(c1, r1, c2, r2);
  if (g.wrapX) {
    d = Math.min(d, rawDistance(c1, r1, c2 - g.width, r2), rawDistance(c1, r1, c2 + g.width, r2));
  }
  return d;
}

export function tileDistance(g: Grid, a: number, b: number): number {
  return hexDistance(g, a % g.width, (a / g.width) | 0, b % g.width, (b / g.width) | 0);
}

/**
 * Felder auf der geraden Linie zwischen a und b, ohne Start und Ziel.
 * Bei Umrundung über die kürzere Seite.
 */
export function hexLineBetween(g: Grid, a: number, b: number): number[] {
  const c1 = a % g.width;
  const r1 = (a / g.width) | 0;
  let c2 = b % g.width;
  const r2 = (b / g.width) | 0;
  if (g.wrapX) {
    let best = rawDistance(c1, r1, c2, r2);
    for (const alt of [c2 - g.width, c2 + g.width]) {
      const d = rawDistance(c1, r1, alt, r2);
      if (d < best) {
        best = d;
        c2 = alt;
      }
    }
  }
  const q1 = offsetToAxialQ(c1, r1);
  const q2 = offsetToAxialQ(c2, r2);
  const n = rawDistance(c1, r1, c2, r2);
  const out: number[] = [];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    // Kleiner Versatz, damit Linien genau auf Kanten eindeutig gerundet werden.
    const [q, r] = axialRound(q1 + (q2 - q1) * t + 1e-6, r1 + (r2 - r1) * t + 2e-6);
    const i = tileAt(g, axialToOffsetCol(q, r), r);
    if (i >= 0) out.push(i);
  }
  return out;
}

/** Rundet gebrochene Axial-Koordinaten auf das nächste Hexfeld. */
export function axialRound(q: number, r: number): [number, number] {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}

/** Alle Feld-Indizes im Radius um (c, r), inklusive Mittelpunkt, ohne Duplikate. */
export function tilesInRadius(g: Grid, c: number, r: number, radius: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const q0 = offsetToAxialQ(c, r);
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) {
      const rr = r + dr;
      const i = tileAt(g, axialToOffsetCol(q0 + dq, rr), rr);
      if (i >= 0 && !seen.has(i)) {
        seen.add(i);
        out.push(i);
      }
    }
  }
  return out;
}

export function tilesAround(g: Grid, i: number, radius: number): number[] {
  return tilesInRadius(g, i % g.width, (i / g.width) | 0, radius);
}
