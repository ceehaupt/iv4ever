import { hash2 } from './rng';

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Wert-Rauschen in [0, 1).
 * period > 0: in x periodisch (nahtlos), Voraussetzung für die Weltumrundung.
 */
export function valueNoise(x: number, y: number, seed: number, period = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  let x0 = xi;
  let x1 = xi + 1;
  if (period > 0) {
    x0 = ((x0 % period) + period) % period;
    x1 = ((x1 % period) + period) % period;
  }
  const a = hash2(x0, yi, seed);
  const b = hash2(x1, yi, seed);
  const c = hash2(x0, yi + 1, seed);
  const d = hash2(x1, yi + 1, seed);
  const top = a + (b - a) * u;
  const bottom = c + (d - c) * u;
  return top + (bottom - top) * v;
}

/** Fraktales Rauschen (mehrere Oktaven), normiert auf [0, 1). Periode verdoppelt sich je Oktave mit. */
export function fbm(x: number, y: number, seed: number, octaves = 5, period = 0): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 1013, period * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Grat-Rauschen: hohe Werte entlang schmaler Linien – gut für Gebirgsketten. */
export function ridged(x: number, y: number, seed: number, octaves = 4, period = 0): number {
  return 1 - Math.abs(2 * fbm(x, y, seed, octaves, period) - 1);
}

/**
 * Rauschfeld über einer umlaufenden Karte: Koordinaten in Feldern, "scale" = Strukturgröße in Feldern.
 * Die Periode wird auf eine ganze Zahl gerundet, damit die Karte an der Datumsgrenze nahtlos ist.
 */
export class WrapNoise {
  private readonly period: number;
  private readonly k: number;

  constructor(width: number, scale: number) {
    this.period = Math.max(1, Math.round(width / scale));
    this.k = this.period / width;
  }

  fbm(px: number, py: number, seed: number, octaves = 5): number {
    return fbm(px * this.k, py * this.k, seed, octaves, this.period);
  }

  ridged(px: number, py: number, seed: number, octaves = 4): number {
    return ridged(px * this.k, py * this.k, seed, octaves, this.period);
  }
}
