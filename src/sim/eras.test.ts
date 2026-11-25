import { describe, expect, it } from 'vitest';
import { cityReport, foundCity } from './city';
import { addUnit, applyCommand, CommandError, createGame, endTurn, type GameState, HUMAN } from './game';
import { generateWorld } from './mapgen';
import { roadStepCost } from './path';
import { BUILDINGS } from './rules/buildings';
import { DOCTRINES } from './rules/doctrines';
import { Feature, Relief, Terrain } from './rules/terrain';
import { TechId } from './rules/techs';
import { MOVE_SCALE, UnitTypeId } from './rules/units';
import { checkVictory } from './victory';
import { fromSaveData, toSaveData } from './save';

const opts = { width: 64, height: 40, seed: 321, players: 3, script: 'continents' as const };

function withCity(): { s: GameState; cityId: number } {
  const s = createGame(generateWorld(opts), opts);
  const settler = s.units.find((u) => u.owner === HUMAN && u.type === UnitTypeId.Settler)!;
  return { s, cityId: applyCommand(s, HUMAN, { type: 'found', unit: settler.id }).foundedCity! };
}

describe('Leitbilder', () => {
  it('brauchen ihre Technologie, wirken auf die Stadt und lösen eine Runde Umbruch aus', () => {
    const { s, cityId } = withCity();
    const c = s.cities.find((x) => x.id === cityId)!;
    const guilds = DOCTRINES.findIndex((d) => d.key === 'guilds');
    expect(() => applyCommand(s, HUMAN, { type: 'setDoctrine', doctrine: guilds })).toThrow(CommandError);
    s.players[HUMAN].techs[TechId.Currency] = 1;
    c.size = 4;
    const before = cityReport(s, c);
    applyCommand(s, HUMAN, { type: 'setDoctrine', doctrine: guilds });
    const during = cityReport(s, c);
    expect(during.research).toBe(0);
    expect(during.gold).toBe(0);
    endTurn(s);
    const after = cityReport(s, c);
    expect(after.yields.prod).toBeGreaterThanOrEqual(before.yields.prod);
    expect(s.players[HUMAN].upheaval).toBe(0);
  });
});

describe('Handelsrouten', () => {
  it('Händler in ferner Stadt errichtet eine Route, die Handel bringt', () => {
    const { s, cityId } = withCity();
    const home = s.cities.find((x) => x.id === cityId)!;
    // Ferne zweite Stadt (eigene) auf einem Landfeld anlegen
    let far = -1;
    for (let i = 0; i < s.map.terrain.length && far < 0; i++) {
      const dx = Math.abs((i % s.map.width) - (home.tile % s.map.width));
      if (dx >= 10 && dx <= 20 && s.map.terrain[i] === Terrain.Grassland && s.map.relief[i] === Relief.Flat) far = i;
    }
    s.map.feature[far] = Feature.None;
    s.tileOwner.fill(-1);
    const target = foundCity(s, HUMAN, far);
    const before = cityReport(s, home).yields.trade;
    const m = addUnit(s, HUMAN, UnitTypeId.Merchant, target.tile);
    applyCommand(s, HUMAN, { type: 'establishRoute', unit: m.id });
    expect(s.routes).toHaveLength(1);
    const routeHome = s.cities.find((c) => c.id === s.routes[0].from)!;
    expect(cityReport(s, routeHome).yields.trade).toBeGreaterThan(routeHome === home ? before : 0);
    expect(s.units.includes(m)).toBe(false);
  });
});

describe('Spätere Zeitalter', () => {
  it('Eisenbahn verbilligt Straßen auf ⅙', () => {
    expect(roadStepCost(true, true)).toBe(MOVE_SCALE / 6);
  });

  it('alle drei Teile des Großprojekts ergeben den Projektsieg', () => {
    const { s, cityId } = withCity();
    const c = s.cities.find((x) => x.id === cityId)!;
    for (const [id, b] of BUILDINGS.entries()) if (b.project) c.buildings.push(id);
    expect(checkVictory(s)?.type).toBe('project');
  });

  it('Speicherformat v6 erhält Leitbilder und Routen', () => {
    const { s } = withCity();
    s.players[HUMAN].doctrines[0] = 1;
    s.routes.push({ from: 1, to: 2 });
    const loaded = fromSaveData(structuredClone(toSaveData(s)));
    expect(loaded.players[HUMAN].doctrines[0]).toBe(1);
    expect(loaded.routes).toEqual([{ from: 1, to: 2 }]);
  });
});
