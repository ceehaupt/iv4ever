import type { GameState } from './game';

/**
 * Prüfsumme (FNV-1a) über den spielrelevanten Zustand. Erkennt Abweichungen im Online-Spiel
 * und dient den Tests, die dieselbe Partie in verschiedenen Browsern vergleichen.
 */
export function stateHash(s: GameState): string {
  const parts = [
    s.turn, s.rng.getState(),
    ...s.units.map((u) => `${u.id},${u.owner},${u.type},${u.tile},${u.hp},${u.moves}`),
    ...s.cities.map((c) => `${c.id},${c.owner},${c.size},${c.foodStored},${c.prodStored},${c.culture}`),
    ...s.players.map((p) => `${p.gold},${p.research},${p.alive}`),
  ].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
