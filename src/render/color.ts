/** Helligkeit eines 0xRRGGBB-Werts skalieren. */
export function shade(color: number, f: number): number {
  const r = Math.min(255, ((color >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((color >> 8) & 255) * f) | 0;
  const b = Math.min(255, (color & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
}

/** Lineare Mischung zweier Farben, t = 0 → a, t = 1 → b. */
export function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return ((r | 0) << 16) | ((g | 0) << 8) | (bl | 0);
}

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
