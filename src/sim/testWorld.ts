// Kleine Testwelten für KI-Tests (kein Testfile, wird nur von Tests importiert).
import { addUnit, applyCommand, createGame, type GameState, HUMAN, refreshVision } from './game';
import { createMap } from './map';
import { generateWorld } from './mapgen';
import { Terrain } from './rules/terrain';
import { UnitTypeId } from './rules/units';

const W = 16;
const H = 10;
export const T = (c: number, r: number) => r * W + c;

/**
 * Testwelt (ost-west umlaufend): kleine Insel (Spalten 1–3, Zeilen 4–5) – nur Platz für eine Stadt –,
 * ringsum Küstenwasser, große Insel rechts (Spalten 9–14). Alles erkundet.
 */
export function islands(): GameState {
  const opts = { width: 64, height: 40, seed: 77, players: 2 };
  const s = createGame(generateWorld(opts), opts);
  const m = createMap(W, H, 1, true);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const smallIsland = c >= 1 && c <= 3 && r >= 4 && r <= 5;
      m.terrain[T(c, r)] = smallIsland || (c >= 9 && c <= 14) ? Terrain.Grassland : Terrain.Coast;
    }
  }
  const n = W * H;
  const st = s as unknown as Record<string, unknown>;
  st.map = m;
  st.tileOwner = new Int16Array(n).fill(-1);
  st.tileCity = new Int32Array(n).fill(-1);
  for (const p of s.players) {
    p.explored = new Uint8Array(n).fill(1);
    p.visible = new Uint8Array(n);
  }
  s.units = [];
  s.cities = [];
  // Der Mensch hat nur einen Späher weit weg (sonst gilt er als vernichtet).
  addUnit(s, HUMAN, UnitTypeId.Scout, T(14, 9));
  return s;
}

export function aiCity(s: GameState, tile: number): void {
  const settler = addUnit(s, 1, UnitTypeId.Settler, tile);
  refreshVision(s, 1);
  applyCommand(s, 1, { type: 'found', unit: settler.id });
}

