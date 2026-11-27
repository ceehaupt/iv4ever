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

/** Farbschema mit besser unterscheidbaren Farben für Farbsehschwäche (an Okabe-Ito angelehnt, erweitert). */
export const COLORBLIND_COLORS: readonly number[] = [
  0xe69f00, 0x56b4e9, 0x009e73, 0xf0e442, 0x0072b2, 0xd55e00, 0xcc79a7, 0xffffff, 0x8a6d3b, 0x9aa0a6,
];
let colorblind = false;
export function setColorblind(on: boolean): void {
  colorblind = on;
}

let slots: readonly (number | undefined)[] = [];

/** Farbplatz je Spieler-ID (Volk; kommt mit jeder Spielansicht). Ohne Platz gilt die ID. */
export function setPlayerSlots(s: readonly (number | undefined)[]): void {
  slots = s;
}

export function playerColor(owner: number): number {
  if (owner === barbarianId) return BARBARIAN_COLOR;
  const pal = colorblind ? COLORBLIND_COLORS : PLAYER_COLORS;
  return pal[(slots[owner] ?? owner) % pal.length];
}

/** Farbe eines Volks-Platzes (Auswahl vor Spielbeginn). */
export function slotColor(slot: number): number {
  const pal = colorblind ? COLORBLIND_COLORS : PLAYER_COLORS;
  return pal[slot % pal.length];
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
