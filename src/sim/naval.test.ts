import { describe, expect, it } from 'vitest';
import { addUnit, applyCommand, CommandError, createGame, endTurn, type GameState, HUMAN, refreshVision } from './game';
import { createMap } from './map';
import { Terrain } from './rules/terrain';
import { UnitTypeId } from './rules/units';
import { generateWorld } from './mapgen';
import { relation } from './diplomacy';

/** Kleine Testwelt: Land links (Spalten 0–3), Küste (4–5), Ozean (6–9), Land rechts ab Spalte 10. */
function seaWorld(): GameState {
  const opts = { width: 64, height: 40, seed: 321, players: 2, script: 'continents' as const };
  const s = createGame(generateWorld(opts), opts);
  const m = createMap(14, 8, 1, true);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 14; c++) {
      const i = r * 14 + c;
      m.terrain[i] = c <= 3 || c >= 11 ? Terrain.Grassland : c <= 5 || c === 10 ? Terrain.Coast : Terrain.Ocean;
    }
  }
  const n = m.width * m.height;
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
  // Ein Siedler hält den Menschen im Spiel (ohne Stadt und Siedler schiede er am Rundenende aus).
  addUnit(s, HUMAN, UnitTypeId.Settler, 3 * 14 + 2);
  return s;
}
const T = (c: number, r: number) => r * 14 + c;

describe('Seefahrt', () => {
  it('Galeere fährt auf Küste, nicht auf Ozean; Karavelle auch auf Ozean', () => {
    const s = seaWorld();
    const g = addUnit(s, HUMAN, UnitTypeId.Galley, T(4, 3));
    refreshVision(s, HUMAN);
    applyCommand(s, HUMAN, { type: 'move', unit: g.id, target: T(5, 3) });
    expect(g.tile).toBe(T(5, 3));
    expect(() => applyCommand(s, HUMAN, { type: 'move', unit: g.id, target: T(8, 3) })).toThrow(CommandError);
    const c = addUnit(s, HUMAN, UnitTypeId.Caravel, T(5, 4));
    applyCommand(s, HUMAN, { type: 'move', unit: c.id, target: T(8, 4) });
    expect(c.tile).toBe(T(8, 4));
  });

  it('Landeinheit steigt ein, fährt mit und geht an Land', () => {
    const s = seaWorld();
    const ship = addUnit(s, HUMAN, UnitTypeId.Caravel, T(4, 3));
    const w = addUnit(s, HUMAN, UnitTypeId.Warrior, T(3, 3));
    refreshVision(s, HUMAN);
    applyCommand(s, HUMAN, { type: 'move', unit: w.id, target: T(4, 3) });
    expect(w.carriedBy).toBe(ship.id);
    applyCommand(s, HUMAN, { type: 'move', unit: ship.id, target: T(8, 3) });
    expect(w.tile).toBe(T(8, 3));
    endTurn(s);
    applyCommand(s, HUMAN, { type: 'move', unit: ship.id, target: T(10, 3) });
    applyCommand(s, HUMAN, { type: 'move', unit: w.id, target: T(11, 3) });
    expect(w.tile).toBe(T(11, 3));
    expect(w.carriedBy).toBeNull();
    expect(w.moves).toBe(0); // Landung beendet den Zug
  });

  it('Seekampf: versenktes Transportschiff reißt die Ladung mit, Land greift keine Schiffe an', () => {
    const s = seaWorld();
    const ship = addUnit(s, 1, UnitTypeId.Galley, T(5, 3));
    const cargo = addUnit(s, 1, UnitTypeId.Warrior, T(5, 3));
    cargo.carriedBy = ship.id;
    ship.hp = 1;
    const war = addUnit(s, HUMAN, UnitTypeId.WarGalley, T(4, 3));
    const land = addUnit(s, HUMAN, UnitTypeId.Warrior, T(3, 3));
    relation(s, HUMAN, 1).met = true;
    relation(s, HUMAN, 1).war = true;
    refreshVision(s, HUMAN);
    expect(() => applyCommand(s, HUMAN, { type: 'attack', unit: land.id, target: T(4, 3) })).toThrow(CommandError);
    applyCommand(s, HUMAN, { type: 'attack', unit: war.id, target: T(5, 3) });
    expect(s.units.includes(ship)).toBe(false);
    expect(s.units.includes(cargo)).toBe(false);
  });
});
