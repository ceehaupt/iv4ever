// Umwelt (eigener Entwurf, siehe docs/REGELN.md):
// - Industriegebäude und sehr große Städte verursachen Verschmutzung; der Recyclinghof entlastet.
// - Je Punkt Verschmutzung besteht jede Runde eine Chance von 4 %, dass ein Landfeld im Gebiet der Stadt verschmutzt.
// - Verschmutzte Felder bringen je 1 weniger Nahrung, Produktion und Handel; Arbeiter können sie säubern.
// - Klimawandel: Je mehr Felder weltweit verschmutzt sind, desto eher verödet irgendwo ein Feld (Grasland → Ebene → Wüste).
import type { City, TurnEvent } from './city';
import type { GameState } from './game';
import { tilesAround } from './hex';
import { BUILDINGS } from './rules/buildings';
import { Feature, isWater, Relief, Terrain } from './rules/terrain';

/** Chance je Punkt Verschmutzung und Runde, dass ein Feld verschmutzt. */
export const POLLUTION_CHANCE = 0.04;
/** Ab dieser Stadtgröße verschmutzt auch die Bevölkerung (+1 je 8 Einwohner darüber, aufgerundet). */
export const POLLUTION_SIZE = 12;

/** Verschmutzung einer Stadt je Runde (≥ 0). */
export function cityPollution(c: City): number {
  let p = c.buildings.reduce((s, b) => s + (BUILDINGS[b].pollution ?? 0), 0);
  if (c.size > POLLUTION_SIZE) p += Math.ceil((c.size - POLLUTION_SIZE) / 8);
  return Math.max(0, p);
}

/** Anzahl verschmutzter Felder auf der Welt. */
export function pollutedTiles(state: GameState): number {
  let n = 0;
  for (let i = 0; i < state.map.pollution.length; i++) n += state.map.pollution[i];
  return n;
}

const pollutable = (state: GameState, t: number) =>
  !isWater(state.map.terrain[t]) && state.map.relief[t] !== Relief.Mountain && state.map.feature[t] !== Feature.Ice && !state.map.pollution[t];

export function environmentTurn(state: GameState, events: TurnEvent[]): void {
  for (const c of state.cities) {
    const p = cityPollution(c);
    if (p <= 0 || state.rng.next() >= p * POLLUTION_CHANCE) continue;
    const candidates = tilesAround(state.map, c.tile, 3).filter((t) => state.tileOwner[t] === c.owner && pollutable(state, t));
    if (!candidates.length) continue;
    // Bewirtschaftete Felder zuerst – dort spürt man es.
    const worked = candidates.filter((t) => c.worked.includes(t));
    const pool = worked.length ? worked : candidates;
    const t = pool[Math.floor(state.rng.next() * pool.length)];
    state.map.pollution[t] = 1;
    events.push({ player: c.owner, text: `Verschmutzung bei ${c.name} – Arbeiter können das Feld säubern`, tile: t });
  }
  // Klimawandel
  const g = pollutedTiles(state);
  if (g > 0 && state.rng.next() < Math.min(0.5, g / 200)) {
    const n = state.map.terrain.length;
    for (let tries = 0; tries < 20; tries++) {
      const t = Math.floor(state.rng.next() * n);
      const ter = state.map.terrain[t];
      if (ter !== Terrain.Grassland && ter !== Terrain.Plains) continue;
      if (state.map.relief[t] === Relief.Mountain) continue;
      state.map.terrain[t] = ter === Terrain.Grassland ? Terrain.Plains : Terrain.Desert;
      for (const p of state.players) {
        if (p.explored[t]) events.push({ player: p.id, text: `Klimawandel: Ein Feld verödet (${g} verschmutzte Felder weltweit)`, tile: t });
      }
      break;
    }
  }
}
