import { describe, expect, it } from 'vitest';
import type { TurnEvent } from './city';
import { addUnit, applyCommand, endTurn, HUMAN, refreshVision } from './game';
import { cityPollution, environmentTurn, pollutedTiles } from './environment';
import { tileYields } from './map';
import { fromSaveData, toSaveData } from './save';
import { BuildingId } from './rules/buildings';
import { TechId } from './rules/techs';
import { Terrain } from './rules/terrain';
import { UnitTypeId } from './rules/units';
import { islands, T } from './testWorld';

function industrialCity() {
  const s = islands();
  const st = addUnit(s, HUMAN, UnitTypeId.Settler, T(11, 4));
  refreshVision(s, HUMAN);
  applyCommand(s, HUMAN, { type: 'found', unit: st.id });
  const c = s.cities[0];
  c.buildings.push(BuildingId.Factory, BuildingId.PowerPlant);
  return { s, c };
}

describe('Umwelt', () => {
  it('Industrie verschmutzt Felder im eigenen Gebiet; der Recyclinghof entlastet', () => {
    const { s, c } = industrialCity();
    expect(cityPollution(c)).toBe(5);
    const events: TurnEvent[] = [];
    for (let t = 0; t < 40; t++) environmentTurn(s, events);
    expect(pollutedTiles(s)).toBeGreaterThan(0);
    for (let i = 0; i < s.map.pollution.length; i++) if (s.map.pollution[i]) expect(s.tileOwner[i]).toBe(HUMAN);
    expect(events.some((e) => e.text.startsWith('Verschmutzung bei'))).toBe(true);
    c.buildings.push(BuildingId.Recycling);
    expect(cityPollution(c)).toBe(2);
  });

  it('verschmutzte Felder bringen je 1 weniger', () => {
    const { s } = industrialCity();
    const t = T(11, 5);
    const before = tileYields(s.map, t);
    s.map.pollution[t] = 1;
    const after = tileYields(s.map, t);
    expect(after.food).toBe(Math.max(0, before.food - 1));
    expect(after.prod).toBe(Math.max(0, before.prod - 1));
  });

  it('Arbeiter säubern ein Feld (mit Ökologie doppelt so schnell)', () => {
    for (const eco of [false, true]) {
      const { s } = industrialCity();
      s.players[HUMAN].techs[TechId.Industrialization] = 1;
      if (eco) s.players[HUMAN].techs[TechId.Ecology] = 1;
      s.cities[0].buildings = []; // keine neue Verschmutzung während des Tests
      const t = T(11, 5);
      s.map.pollution[t] = 1;
      const w = addUnit(s, HUMAN, UnitTypeId.Worker, t);
      applyCommand(s, HUMAN, { type: 'work', unit: w.id, job: 'cleanup' });
      let turns = 0;
      while (s.map.pollution[t] && turns < 10) {
        endTurn(s);
        turns++;
      }
      expect(s.map.pollution[t]).toBe(0);
      expect(turns).toBe(eco ? 2 : 4);
    }
  });

  it('Klimawandel lässt bei vielen verschmutzten Feldern Land veröden', () => {
    const { s } = industrialCity();
    s.cities[0].buildings = [];
    for (let i = 0; i < s.map.pollution.length; i += 2) s.map.pollution[i] = 1;
    const grass = () => Array.from(s.map.terrain).filter((t) => t === Terrain.Grassland).length;
    const before = grass();
    for (let t = 0; t < 30; t++) environmentTurn(s, []);
    expect(grass()).toBeLessThan(before);
  });

  it('Verschmutzung wird gespeichert; ältere Spielstände bekommen eine leere Ebene', () => {
    const { s } = industrialCity();
    s.map.pollution[T(11, 5)] = 1;
    const loaded = fromSaveData(toSaveData(s));
    expect(loaded.map.pollution[T(11, 5)]).toBe(1);
    const old = toSaveData(s) as unknown as { version: number; map: Record<string, unknown> };
    old.version = 6;
    delete old.map.pollution;
    const migrated = fromSaveData(old as never);
    expect(migrated.map.pollution.length).toBe(s.map.terrain.length);
    expect(pollutedTiles(migrated)).toBe(0);
  });
});
