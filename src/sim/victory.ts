import type { GameState } from './game';
import { isWater } from './rules/terrain';
import { BUILDINGS } from './rules/buildings';

/**
 * Siegbedingungen (eigener Entwurf):
 * - Eroberung: alle anderen Zivilisationen vernichtet.
 * - Vorherrschaft: ≥ 45 % des Landes und ≥ 50 % der Weltbevölkerung.
 * - Kultur: drei Städte mit je ≥ CULTURE_PER_CITY Kultur.
 * - Punkte: bei Erreichen des Rundenlimits gewinnt die höchste Punktzahl.
 * - Projekt (ab M8): Abschluss des Großprojekts.
 */
export type VictoryType = 'conquest' | 'domination' | 'culture' | 'score' | 'project';

export const VICTORY_NAMES: Record<VictoryType, string> = {
  conquest: 'Eroberungssieg', domination: 'Vorherrschaft', culture: 'Kultursieg', score: 'Punktsieg', project: 'Projektsieg',
};

export interface Victory {
  player: number;
  type: VictoryType;
  turn: number;
}

export const DOMINATION_LAND = 0.45;
export const DOMINATION_POP = 0.5;
export const CULTURE_CITIES = 3;
export const CULTURE_PER_CITY = 2400;
export const DEFAULT_TURN_LIMIT = 300;

export interface Progress {
  landShare: number;
  popShare: number;
  cultureCities: number;
  score: number;
  rank: number;
  turnsLeft: number;
}

function landTiles(state: GameState): number {
  let n = 0;
  for (let i = 0; i < state.map.terrain.length; i++) if (!isWater(state.map.terrain[i])) n++;
  return n;
}

export function score(state: GameState, pid: number): number {
  const cities = state.cities.filter((c) => c.owner === pid);
  const pop = cities.reduce((s, c) => s + c.size, 0);
  let land = 0;
  for (let i = 0; i < state.tileOwner.length; i++) if (state.tileOwner[i] === pid) land++;
  const techs = state.players[pid].techs.reduce((a, b) => a + b, 0);
  const wonders = cities.reduce((s, c) => s + c.buildings.filter((b) => BUILDINGS[b].wonder).length, 0);
  const culture = cities.reduce((s, c) => s + c.culture, 0);
  return Math.round(pop * 3 + land / 3 + techs * 6 + wonders * 20 + culture / 50);
}

export function progress(state: GameState, pid: number): Progress {
  const land = landTiles(state);
  let owned = 0;
  for (let i = 0; i < state.tileOwner.length; i++) if (state.tileOwner[i] === pid && !isWater(state.map.terrain[i])) owned++;
  const worldPop = state.cities.reduce((s, c) => s + c.size, 0);
  const pop = state.cities.filter((c) => c.owner === pid).reduce((s, c) => s + c.size, 0);
  const civs = state.players.filter((p) => !p.barbarian && p.alive);
  const scores = civs.map((p) => ({ id: p.id, s: score(state, p.id) })).sort((a, b) => b.s - a.s);
  return {
    landShare: land ? owned / land : 0,
    popShare: worldPop ? pop / worldPop : 0,
    cultureCities: state.cities.filter((c) => c.owner === pid && c.culture >= CULTURE_PER_CITY).length,
    score: score(state, pid),
    rank: scores.findIndex((x) => x.id === pid) + 1,
    turnsLeft: Math.max(0, (state.options.turnLimit ?? DEFAULT_TURN_LIMIT) - state.turn),
  };
}

/** Anzahl fertiger Teile des Großprojekts eines Spielers. */
export function projectParts(state: GameState, pid: number): number {
  const parts = BUILDINGS.map((b, id) => (b.project ? id : -1)).filter((id) => id >= 0);
  const own = state.cities.filter((c) => c.owner === pid);
  return parts.filter((id) => own.some((c) => c.buildings.includes(id))).length;
}

/** Steht ein Spieler kurz vor einem Sieg? (Für die KI: gemeinsame Bedrohung.) */
export function nearVictory(state: GameState, pid: number): boolean {
  const pr = progress(state, pid);
  return projectParts(state, pid) >= 2 || pr.cultureCities >= CULTURE_CITIES - 1 ||
    (pr.landShare >= DOMINATION_LAND * 0.8 && pr.popShare >= DOMINATION_POP * 0.8);
}

/** Prüft am Rundenende, ob jemand gewonnen hat (nur einmal). */
export function checkVictory(state: GameState): Victory | null {
  if (state.winner) return null;
  const civs = state.players.filter((p) => !p.barbarian && p.alive);
  const win = (player: number, type: VictoryType): Victory => (state.winner = { player, type, turn: state.turn });
  if (civs.length === 1) return win(civs[0].id, 'conquest');
  const projectParts = BUILDINGS.map((b, id) => (b.project ? id : -1)).filter((id) => id >= 0);
  for (const p of civs) {
    const own = state.cities.filter((c) => c.owner === p.id);
    if (projectParts.every((id) => own.some((c) => c.buildings.includes(id)))) return win(p.id, 'project');
  }
  for (const p of civs) {
    const pr = progress(state, p.id);
    if (pr.landShare >= DOMINATION_LAND && pr.popShare >= DOMINATION_POP) return win(p.id, 'domination');
    if (pr.cultureCities >= CULTURE_CITIES) return win(p.id, 'culture');
  }
  if (state.turn >= (state.options.turnLimit ?? DEFAULT_TURN_LIMIT)) {
    const best = civs.map((p) => ({ id: p.id, s: score(state, p.id) })).sort((a, b) => b.s - a.s)[0];
    if (best) return win(best.id, 'score');
  }
  return null;
}
