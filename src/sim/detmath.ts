/**
 * Plattformunabhängige Mathematik für die Simulation.
 * Math.pow/exp/log/hypot dürfen je Browser minimal unterschiedlich runden – im Mehrspieler-Lockstep
 * würde das die Spielstände auseinanderlaufen lassen. Hier nur Grundrechenarten (IEEE-754, überall gleich).
 */
const LN2 = 0.6931471805599453;

/** Natürlicher Logarithmus für x > 0. */
export function detLn(x: number): number {
  if (!(x > 0)) return NaN;
  let k = 0;
  while (x >= 2) {
    x /= 2;
    k++;
  }
  while (x < 1) {
    x *= 2;
    k--;
  }
  // ln(m) = 2·atanh(z), z = (m−1)/(m+1) ∈ [0, 1/3)
  const z = (x - 1) / (x + 1);
  const z2 = z * z;
  let term = z;
  let sum = 0;
  for (let n = 1; n < 60; n += 2) {
    sum += term / n;
    term *= z2;
  }
  return 2 * sum + k * LN2;
}

export function detExp(t: number): number {
  const k = Math.round(t / LN2);
  const r = t - k * LN2;
  let term = 1;
  let sum = 1;
  for (let n = 1; n < 30; n++) {
    term *= r / n;
    sum += term;
  }
  let scale = 1;
  if (k > 0) for (let i = 0; i < k; i++) scale *= 2;
  else for (let i = 0; i < -k; i++) scale /= 2;
  return sum * scale;
}

export function detPow(x: number, y: number): number {
  if (x === 0) return 0;
  return detExp(y * detLn(x));
}
