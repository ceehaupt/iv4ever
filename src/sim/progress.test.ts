import { describe, expect, it } from 'vitest';
import { availableItems, cityReport, playerContext, tradeNetwork } from './city';
import { addUnit, applyCommand, CommandError, createGame, currentResearch, endTurn, type GameState, HUMAN, Orders } from './game';
import { neighborOf, tilesAround } from './hex';
import { tileYields } from './map';
import { generateWorld } from './mapgen';
import { findPath, landCost } from './path';
import { BuildingId } from './rules/buildings';
import { Improvement } from './rules/improvements';
import { canResearch, nextStepTowards, TECHS, TechId, techCost } from './rules/techs';
import { Feature, Relief, Terrain } from './rules/terrain';
import { MOVE_SCALE, UnitTypeId } from './rules/units';
import { fromSaveData, toSaveData } from './save';

const opts = { width: 64, height: 40, seed: 321, players: 4, script: 'continents' as const };

function setup(): { s: GameState; cityId: number } {
  const s = createGame(generateWorld(opts), opts);
  const settler = s.units.find((u) => u.owner === HUMAN && u.type === UnitTypeId.Settler)!;
  const cityId = applyCommand(s, HUMAN, { type: 'found', unit: settler.id }).foundedCity!;
  return { s, cityId };
}

function addWorker(s: GameState, tile: number) {
  return addUnit(s, HUMAN, UnitTypeId.Worker, tile);
}

describe('Technologiebaum', () => {
  it('ist ein gültiger Baum: Voraussetzungen existieren und liegen in früheren Stufen', () => {
    expect(TECHS).toHaveLength(54);
    TECHS.forEach((t) => {
      for (const p of t.prereqs) expect(TECHS[p].tier).toBeLessThan(t.tier);
    });
  });

  it('nextStepTowards wählt eine erforschbare Voraussetzung', () => {
    const known = new Uint8Array(TECHS.length);
    const step = nextStepTowards(known, TechId.Currency);
    expect(canResearch(known, step)).toBe(true);
    expect([TechId.Agriculture]).toContain(step);
  });

  it('Forschung schreitet über Zwischenschritte zum Ziel voran', () => {
    const { s } = setup();
    const p = s.players[HUMAN];
    applyCommand(s, HUMAN, { type: 'research', tech: TechId.Writing });
    expect(currentResearch(s, HUMAN)).toBe(TechId.Agriculture);
    p.research = techCost(TechId.Agriculture) + techCost(TechId.Pottery) + techCost(TechId.Writing);
    endTurn(s);
    expect(p.techs[TechId.Agriculture]).toBe(1);
    expect(p.techs[TechId.Pottery]).toBe(1);
    expect(p.techs[TechId.Writing]).toBe(1);
    expect(p.goal).toBe(-1);
  });

  it('Gebäude erscheinen erst mit ihrer Technologie', () => {
    const { s, cityId } = setup();
    const c = s.cities.find((x) => x.id === cityId)!;
    const has = (id: number) => availableItems(s, c).some((i) => i.kind === 'building' && i.id === id);
    expect(has(BuildingId.Library)).toBe(false);
    s.players[HUMAN].techs[TechId.Writing] = 1;
    expect(has(BuildingId.Library)).toBe(true);
    expect(has(BuildingId.University)).toBe(false); // braucht zusätzlich die Bibliothek
  });
});

describe('Arbeiter', () => {
  it('Straßen brauchen das Rad und verbilligen die Bewegung', () => {
    const { s, cityId } = setup();
    const c = s.cities.find((x) => x.id === cityId)!;
    const next = tilesAround(s.map, c.tile, 1).find((t) => t !== c.tile && s.map.terrain[t] !== Terrain.Coast &&
      s.map.relief[t] !== Relief.Mountain && s.map.terrain[t] !== Terrain.Ocean && s.map.terrain[t] !== Terrain.Lake)!;
    const w = addWorker(s, next);
    expect(() => applyCommand(s, HUMAN, { type: 'work', unit: w.id, job: 'road' })).toThrow(CommandError);
    s.players[HUMAN].techs[TechId.Wheel] = 1;
    applyCommand(s, HUMAN, { type: 'work', unit: w.id, job: 'road' });
    endTurn(s);
    endTurn(s);
    expect(s.map.road[next]).toBe(1);
    expect(w.orders).toBe(Orders.None);
    const cost = landCost(s.map, () => true, () => false);
    expect(cost(c.tile, next)).toBe(MOVE_SCALE / 3);
    const res = findPath({ map: s.map, from: c.tile, to: next, maxMoves: MOVE_SCALE, movesLeft: MOVE_SCALE, cost })!;
    expect(res.turns).toEqual([0]);
  });

  it('Farm erhöht die Nahrung, Ressourcen brauchen ihre Verbesserung', () => {
    const { s } = setup();
    const m = s.map;
    const t = s.cities[0].tile;
    const flat = tilesAround(m, t, 1).find((i) => i !== t && m.relief[i] === Relief.Flat &&
      (m.terrain[i] === Terrain.Grassland || m.terrain[i] === Terrain.Plains) && m.feature[i] === Feature.None);
    if (flat === undefined) return; // Startlage ohne passendes Feld – andere Tests decken die Regeln ab
    const before = tileYields(m, flat).food;
    m.improvement[flat] = Improvement.Farm;
    expect(tileYields(m, flat).food).toBe(before + 1);
    // Weizen auf dem Feld wirkt nur mit Farm
    m.resource[flat] = 1;
    expect(tileYields(m, flat).food).toBe(before + 2);
    m.improvement[flat] = 0;
    expect(tileYields(m, flat).food).toBe(before);
  });
});

describe('Handelsnetz und Wunder', () => {
  it('Straße verbindet eine zweite Stadt mit dem Palast (+2 Handel)', () => {
    const { s, cityId } = setup();
    const cap = s.cities.find((x) => x.id === cityId)!;
    // Zweite Stadt künstlich im Abstand 3 entlang einer Straßenkette anlegen
    let t = cap.tile;
    const chain: number[] = [];
    for (let k = 0; k < 3; k++) {
      t = neighborOf(s.map, t, 0);
      chain.push(t);
    }
    for (const x of chain) {
      s.map.terrain[x] = Terrain.Grassland;
      s.map.relief[x] = Relief.Flat;
      s.map.feature[x] = Feature.None;
    }
    s.cities.push({ ...structuredClone(cap), id: 99, tile: chain[2], buildings: [], name: 'Test', worked: [], locked: [] });
    const net = () => tradeNetwork(s, HUMAN, () => false).connected;
    s.map.road.fill(0);
    s.map.river.fill(0);
    expect(net().has(99)).toBe(false);
    for (const x of [cap.tile, ...chain]) s.map.road[x] = 1;
    expect(net().has(99)).toBe(true);
    const other = s.cities.find((x) => x.id === 99)!;
    expect(cityReport(s, other, playerContext(s, HUMAN)).connected).toBe(true);
  });

  it('ein Weltwunder gibt es nur einmal', () => {
    const { s, cityId } = setup();
    const c = s.cities.find((x) => x.id === cityId)!;
    s.players[HUMAN].techs[TechId.Mysticism] = 1;
    const has = () => availableItems(s, c).some((i) => i.kind === 'building' && i.id === BuildingId.EternalFlame);
    expect(has()).toBe(true);
    applyCommand(s, HUMAN, { type: 'build', city: c.id, item: { kind: 'building', id: BuildingId.EternalFlame }, append: false });
    c.prodStored = 500;
    endTurn(s);
    expect(c.buildings).toContain(BuildingId.EternalFlame);
    expect(has()).toBe(false);
  });
});

describe('Speicherformat v3', () => {
  it('erhält Technologien, Straßen und Aufträge; migriert v2', () => {
    const { s } = setup();
    s.players[HUMAN].techs[TechId.Wheel] = 1;
    s.players[HUMAN].goal = TechId.Currency;
    s.map.road[5] = 1;
    s.jobs['5:road'] = 1;
    const loaded = fromSaveData(structuredClone(toSaveData(s)));
    expect(loaded.players[HUMAN].techs[TechId.Wheel]).toBe(1);
    expect(loaded.players[HUMAN].goal).toBe(TechId.Currency);
    expect(loaded.map.road[5]).toBe(1);
    expect(loaded.jobs['5:road']).toBe(1);

    const v3 = structuredClone(toSaveData(s));
    const { improvement: _i, road: _r, ...mapV2 } = v3.map;
    const v2 = { ...v3, version: 2, map: mapV2, jobs: undefined,
      players: v3.players.map(({ techs: _t, goal: _g, ...p }) => p),
      units: v3.units.map((u) => ({ ...u, moves: 6 })) } as unknown as typeof v3;
    const migrated = fromSaveData(v2);
    expect(migrated.players[HUMAN].techs.length).toBe(TECHS.length);
    expect(migrated.units[0].moves).toBe(12);
    expect(migrated.map.road[s.cities[0].tile]).toBe(1);
  });
});
