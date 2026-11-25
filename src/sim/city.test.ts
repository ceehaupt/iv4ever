import { describe, expect, it } from 'vitest';
import { cityRadius, cityReport, foodToGrow, workableTiles } from './city';
import { applyCommand, CommandError, createGame, endTurn, type GameState, HUMAN } from './game';
import { tileDistance, tilesAround } from './hex';
import { generateWorld } from './mapgen';
import { BuildingId } from './rules/buildings';
import { UnitTypeId } from './rules/units';
import { fromSaveData, toSaveData } from './save';

const opts = { width: 64, height: 40, seed: 321, players: 4, script: 'continents' as const };

function gameWithCity(): { s: GameState; cityId: number } {
  const s = createGame(generateWorld(opts), opts);
  const settler = s.units.find((u) => u.owner === HUMAN && u.type === UnitTypeId.Settler)!;
  const res = applyCommand(s, HUMAN, { type: 'found', unit: settler.id });
  return { s, cityId: res.foundedCity! };
}

const city = (s: GameState, id: number) => s.cities.find((c) => c.id === id)!;

describe('Stadtgründung', () => {
  it('verbraucht den Siedler, erste Stadt bekommt den Palast und Radius-1-Gebiet', () => {
    const { s, cityId } = gameWithCity();
    const c = city(s, cityId);
    expect(s.units.some((u) => u.owner === HUMAN && u.type === UnitTypeId.Settler)).toBe(false);
    expect(c.buildings).toContain(BuildingId.Palace);
    expect(c.size).toBe(1);
    expect(cityRadius(c)).toBe(1);
    for (const t of tilesAround(s.map, c.tile, 1)) expect(s.tileOwner[t]).toBe(HUMAN);
    expect(c.worked).toHaveLength(1);
    expect(s.players[HUMAN].visible[c.tile]).toBe(1);
  });

  it('verbietet Städte zu dicht beieinander', () => {
    const { s, cityId } = gameWithCity();
    const c = city(s, cityId);
    const warrior = s.units.find((u) => u.owner === HUMAN && u.type === UnitTypeId.Warrior)!;
    // Ein zweiter Siedler direkt neben der Stadt
    s.units.push({ ...warrior, id: 999, type: UnitTypeId.Settler, tile: tilesAround(s.map, c.tile, 1).find((t) => t !== c.tile)! });
    expect(() => applyCommand(s, HUMAN, { type: 'found', unit: 999 })).toThrow(CommandError);
  });
});

describe('Stadtentwicklung', () => {
  it('wächst durch Nahrungsüberschuss', () => {
    const { s, cityId } = gameWithCity();
    const c = city(s, cityId);
    const rep = cityReport(s, c);
    expect(rep.surplus).toBeGreaterThan(0);
    const turns = Math.ceil(foodToGrow(1) / rep.surplus);
    for (let k = 0; k < turns; k++) endTurn(s);
    expect(c.size).toBe(2);
    expect(c.worked).toHaveLength(2);
  });

  it('baut Einheiten und Gebäude aus der Bauliste', () => {
    const { s, cityId } = gameWithCity();
    const c = city(s, cityId);
    applyCommand(s, HUMAN, { type: 'build', city: c.id, item: { kind: 'unit', id: UnitTypeId.Warrior }, append: false });
    applyCommand(s, HUMAN, { type: 'build', city: c.id, item: { kind: 'building', id: BuildingId.Monument }, append: true });
    const warriors = () => s.units.filter((u) => u.owner === HUMAN && u.type === UnitTypeId.Warrior && u.tile === c.tile).length;
    const before = warriors();
    for (let k = 0; k < 40 && !c.buildings.includes(BuildingId.Monument); k++) endTurn(s);
    expect(warriors()).toBe(before + 1);
    expect(c.buildings).toContain(BuildingId.Monument);
    expect(c.queue).toHaveLength(0);
  });

  it('Siedler braucht Größe 2 und kostet einen Bürger', () => {
    const { s, cityId } = gameWithCity();
    const c = city(s, cityId);
    applyCommand(s, HUMAN, { type: 'build', city: c.id, item: { kind: 'unit', id: UnitTypeId.Settler }, append: false });
    c.prodStored = 100; // Produktion ist fertig, aber Stadt hat Größe 1
    endTurn(s);
    expect(c.queue).toHaveLength(1);
    c.size = 3;
    endTurn(s);
    expect(c.queue).toHaveLength(0);
    expect(c.size).toBe(2);
    expect(s.units.filter((u) => u.owner === HUMAN && u.type === UnitTypeId.Settler)).toHaveLength(1);
  });

  it('Grenzen wachsen mit Kultur auf Radius 2', () => {
    const { s, cityId } = gameWithCity();
    const c = city(s, cityId);
    for (let k = 0; k < 10; k++) endTurn(s);
    expect(c.culture).toBeGreaterThanOrEqual(15);
    expect(cityRadius(c)).toBe(2);
    const owned = tilesAround(s.map, c.tile, 2).filter((t) => s.tileOwner[t] === HUMAN);
    expect(owned.length).toBeGreaterThan(7);
    expect(workableTiles(s, c).every((t) => tileDistance(s.map, c.tile, t) <= 2)).toBe(true);
  });

  it('festgelegte Felder bleiben bewirtschaftet', () => {
    const { s, cityId } = gameWithCity();
    const c = city(s, cityId);
    const other = workableTiles(s, c).find((t) => !c.worked.includes(t))!;
    applyCommand(s, HUMAN, { type: 'toggleTile', city: c.id, tile: other });
    expect(c.worked).toEqual([other]);
    endTurn(s);
    expect(c.worked).toContain(other);
  });

  it('Unzufriedenheit senkt Produktion, Unruhe stoppt sie', () => {
    const { s, cityId } = gameWithCity();
    const c = city(s, cityId);
    const limit = cityReport(s, c).moodLimit;
    c.size = limit + 1;
    const rep = cityReport(s, c);
    expect(rep.unhappy).toBe(1);
    expect(rep.efficiency).toBeCloseTo(0.9);
    c.size = limit * 2;
    expect(cityReport(s, c).unrest).toBe(true);
    expect(cityReport(s, c).yields.prod).toBe(0);
  });

  it('Handel wird nach Steuersatz in Forschung und Gold geteilt', () => {
    const { s } = gameWithCity();
    applyCommand(s, HUMAN, { type: 'setRate', rate: 100 });
    endTurn(s);
    expect(s.players[HUMAN].research).toBeGreaterThan(0);
    const g = s.players[HUMAN].gold;
    applyCommand(s, HUMAN, { type: 'setRate', rate: 0 });
    endTurn(s);
    expect(s.players[HUMAN].gold).toBeGreaterThan(g);
  });
});

describe('Speichern mit Städten', () => {
  it('Runde-Trip erhält Städte und Feldbesitz', () => {
    const { s } = gameWithCity();
    for (let k = 0; k < 3; k++) endTurn(s);
    const loaded = fromSaveData(structuredClone(toSaveData(s)));
    expect(loaded.cities).toEqual(s.cities);
    expect(loaded.tileOwner).toEqual(s.tileOwner);
    expect(loaded.players[0].gold).toBe(s.players[0].gold);
  });

  it('migriert Speicherstände der Version 1', () => {
    const { s } = gameWithCity();
    const v2 = structuredClone(toSaveData(s));
    const v1 = { ...v2, version: 1, cities: undefined, nextCityId: undefined,
      players: v2.players.map(({ gold: _g, research: _r, rate: _t, ...p }) => p) } as unknown as typeof v2;
    const loaded = fromSaveData(v1);
    expect(loaded.cities).toEqual([]);
    expect(loaded.players[0].rate).toBe(60);
  });
});
