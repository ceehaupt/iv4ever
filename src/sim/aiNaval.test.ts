import { describe, expect, it } from 'vitest';
import { addUnit, applyCommand, createGame, endTurn, type GameState, HUMAN, refreshVision } from './game';
import { createMap } from './map';
import { generateWorld } from './mapgen';
import { landmasses } from './aiCommon';
import { relation } from './diplomacy';
import { TechId } from './rules/techs';
import { Terrain } from './rules/terrain';
import { UNIT_TYPES, UnitTypeId } from './rules/units';

const W = 16;
const H = 10;
const T = (c: number, r: number) => r * W + c;

/**
 * Testwelt (ost-west umlaufend): kleine Insel (Spalten 1–3, Zeilen 4–5) – nur Platz für eine Stadt –,
 * ringsum Küstenwasser, große Insel rechts (Spalten 9–14). Alles erkundet.
 */
function islands(): GameState {
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

function aiCity(s: GameState, tile: number): void {
  const settler = addUnit(s, 1, UnitTypeId.Settler, tile);
  refreshVision(s, 1);
  applyCommand(s, 1, { type: 'found', unit: settler.id });
}

describe('KI-Seefahrt', () => {
  it('bringt einen Siedler ohne Platz an Land per Schiff auf eine andere Insel', () => {
    const s = islands();
    s.players[1].techs[TechId.Sailing] = 1;
    aiCity(s, T(2, 4));
    addUnit(s, 1, UnitTypeId.Warrior, T(2, 4));
    addUnit(s, 1, UnitTypeId.Settler, T(2, 4));
    addUnit(s, 1, UnitTypeId.Galley, T(2, 3));
    for (const p of s.players) refreshVision(s, p.id);
    const mass = landmasses(s.map);
    for (let t = 0; t < 15 && !s.cities.some((c) => c.owner === 1 && mass[c.tile] !== mass[T(2, 4)]); t++) endTurn(s);
    const overseas = s.cities.filter((c) => c.owner === 1 && mass[c.tile] !== mass[T(2, 4)]);
    expect(overseas.length).toBe(1);
  });

  it('gibt ein Transportschiff in Auftrag, wenn ein Siedler festsitzt und kein Schiff da ist', () => {
    const s = islands();
    s.players[1].techs[TechId.Sailing] = 1;
    aiCity(s, T(2, 4));
    addUnit(s, 1, UnitTypeId.Warrior, T(2, 4));
    addUnit(s, 1, UnitTypeId.Settler, T(2, 4));
    for (const p of s.players) refreshVision(s, p.id);
    endTurn(s);
    const city = s.cities.find((c) => c.owner === 1)!;
    expect(city.queue.some((q) => q.kind === 'unit' && (UNIT_TYPES[q.id].cargo ?? 0) > 0)).toBe(true);
  });

  it('Kriegsschiff versenkt ein angeschlagenes feindliches Schiff in Reichweite', () => {
    const s = islands();
    aiCity(s, T(2, 4));
    addUnit(s, 1, UnitTypeId.Warrior, T(2, 4));
    const own = addUnit(s, 1, UnitTypeId.WarGalley, T(2, 3));
    const enemy = addUnit(s, HUMAN, UnitTypeId.Galley, T(3, 3));
    enemy.hp = 10;
    const r = relation(s, HUMAN, 1);
    r.met = true;
    r.war = true;
    for (const p of s.players) refreshVision(s, p.id);
    endTurn(s);
    expect(s.units.includes(enemy)).toBe(false);
    expect(s.units.includes(own)).toBe(true);
  });
});

describe('KI-Invasion', () => {
  it('kriegerische KI bringt Truppen auf die Insel eines Gegners', () => {
    const s = islands();
    s.turn = 50;
    const ai = s.players[1];
    ai.persona = { ...ai.persona!, aggression: 0.9 };
    ai.techs[TechId.Sailing] = 1;
    aiCity(s, T(2, 4));
    for (let i = 0; i < 6; i++) addUnit(s, 1, UnitTypeId.Warrior, T(2, 4));
    addUnit(s, 1, UnitTypeId.Galley, T(2, 3));
    // Feindliche Stadt des Menschen auf der großen Insel.
    const hs = addUnit(s, HUMAN, UnitTypeId.Settler, T(12, 4));
    refreshVision(s, HUMAN);
    applyCommand(s, HUMAN, { type: 'found', unit: hs.id });
    const r = relation(s, HUMAN, 1);
    r.met = true;
    r.war = true;
    for (const p of s.players) refreshVision(s, p.id);
    const mass = landmasses(s.map);
    const landed = () => s.units.some((u) => u.owner === 1 && !u.carriedBy && mass[u.tile] === mass[T(12, 4)] && UNIT_TYPES[u.type].strength > 0);
    for (let t = 0; t < 12 && !landed(); t++) endTurn(s);
    expect(landed()).toBe(true);
  });
});

describe('KI-Händler', () => {
  it('errichtet mit einem Händler eine Handelsroute', () => {
    const s = islands();
    s.players[1].techs[TechId.Currency] = 1;
    aiCity(s, T(10, 1));
    aiCity(s, T(10, 8));
    aiCity(s, T(14, 4));
    for (const c of s.cities) addUnit(s, 1, UnitTypeId.Warrior, c.tile);
    addUnit(s, 1, UnitTypeId.Merchant, T(10, 1));
    for (const p of s.players) refreshVision(s, p.id);
    for (let t = 0; t < 10 && !s.routes.length; t++) endTurn(s);
    expect(s.routes.length).toBeGreaterThan(0);
  });
});
