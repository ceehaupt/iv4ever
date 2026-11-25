import { Feature, Relief, Terrain } from '../sim/rules/terrain';
import { mix } from './color';

/** Grundfarben je Terrain-ID (Reihenfolge wie Terrain in rules/terrain.ts). */
export const TERRAIN_COLOR: readonly number[] = [
  0x1b4a80, // Ozean
  0x2e75ad, // Küste
  0x5c9a3c, // Grasland
  0xa59b52, // Ebene
  0xd8c17f, // Wüste
  0x8b9884, // Tundra
  0xe4ebef, // Schnee
  0x3d8fc6, // See
];

export const ICE_COLOR = 0xdce9f1;
export const ROCK_COLOR = 0x7a7065;
export const EARTH_COLOR = 0x5a4634;
export const FLOODPLAIN_COLOR = 0x9fae5a;
export const RIVER_COLOR = 0x3f92d2;
export const BACKGROUND = 0x0a1020;

/** Spielerfarben (Index = Spieler). */
export const PLAYER_COLORS: readonly number[] = [
  0xe8453c, 0x3c7be8, 0xf2c230, 0x9b4de0, 0x2fbf71, 0xf07f2a, 0x29c7d4, 0xe04da6, 0xf5f5f5, 0x7a5230,
];
export const BARBARIAN_COLOR = 0x2a2a2e;

let barbarianId = -1;

/** Spieler-ID der Plünderer (kommt mit jeder Spielansicht vom Worker). */
export function setBarbarianId(id: number): void {
  barbarianId = id;
}

export function playerColor(owner: number): number {
  return owner === barbarianId ? BARBARIAN_COLOR : PLAYER_COLORS[owner % PLAYER_COLORS.length];
}

/** Oberflächenfarbe eines Feldes ohne Schattierung (für Minimap und Renderer). */
export function surfaceColor(terrain: number, relief: number, feature: number): number {
  if (feature === Feature.Ice) return ICE_COLOR;
  if (feature === Feature.Floodplain) return FLOODPLAIN_COLOR;
  let c = TERRAIN_COLOR[terrain];
  if (relief === Relief.Mountain) c = mix(c, ROCK_COLOR, 0.55);
  return c;
}

/** Farbe auf der Minimap (Vegetation sichtbar, Gebirge betont). */
export function minimapColor(terrain: number, relief: number, feature: number): number {
  if (relief === Relief.Mountain) return 0x8d8478;
  if (feature === Feature.Forest) return mix(TERRAIN_COLOR[terrain], 0x1f4d24, 0.5);
  if (feature === Feature.Jungle) return 0x2a6b2c;
  if (terrain === Terrain.Lake) return 0x4a9fd6;
  return surfaceColor(terrain, relief, feature);
}
