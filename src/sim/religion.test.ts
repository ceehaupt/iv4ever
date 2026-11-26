import { describe, expect, it } from 'vitest';
import type { TurnEvent } from './city';
import { addUnit, applyCommand, CommandError, HUMAN, refreshVision } from './game';
import { CONVERT_PRESSURE, FAITH_TO_FOUND, foundBlocker, religionAttitude, religionTurn, stateReligion } from './religion';
import { cityReport } from './city';
import { fromSaveData, toSaveData } from './save';
import { BuildingId } from './rules/buildings';
import { TechId } from './rules/techs';
import { UnitTypeId } from './rules/units';
import { islands, T } from './testWorld';

function world() {
  const s = islands();
  for (const tile of [T(11, 4), T(2, 4)]) {
    const st = addUnit(s, HUMAN, UnitTypeId.Settler, tile);
    refreshVision(s, HUMAN);
    applyCommand(s, HUMAN, { type: 'found', unit: st.id });
  }
  const p = s.players[HUMAN];
  p.techs[TechId.Mysticism] = 1;
  p.techs[TechId.Theology] = 1;
  return s;
}

describe('Religion', () => {
  it('gründen braucht Mystik und Glauben; die Lehre wirkt in der Stadt', () => {
    const s = world();
    const [a] = s.cities;
    a.buildings.push(BuildingId.Shrine);
    expect(foundBlocker(s, HUMAN)).toMatch(/Glauben/);
    for (let t = 0; t < FAITH_TO_FOUND; t++) religionTurn(s, []);
    expect(foundBlocker(s, HUMAN)).toBeNull();
    const before = cityReport(s, a).moodLimit;
    applyCommand(s, HUMAN, { type: 'foundReligion', tenet: 'charity' });
    expect(s.religions).toHaveLength(1);
    expect(a.religion).toBe(0);
    expect(stateReligion(s, HUMAN)).toBe(0);
    expect(cityReport(s, a).moodLimit).toBe(before + 1);
    expect(() => applyCommand(s, HUMAN, { type: 'foundReligion', tenet: 'charity' })).toThrow(CommandError);
  });

  it('breitet sich durch Druck auf Nachbarstädte aus', () => {
    const s = world();
    s.players[HUMAN].faith = FAITH_TO_FOUND;
    applyCommand(s, HUMAN, { type: 'foundReligion', tenet: 'pilgrimage' });
    const other = s.cities.find((c) => c.religion === undefined)!;
    const events: TurnEvent[] = [];
    for (let t = 0; t < 20 && other.religion === undefined; t++) religionTurn(s, events);
    expect(other.religion).toBe(0);
    expect((other.pressure?.[0] ?? 0)).toBeGreaterThanOrEqual(CONVERT_PRESSURE);
  });

  it('Missionare bekehren eine Stadt sofort und verschwinden dabei', () => {
    const s = world();
    s.players[HUMAN].faith = FAITH_TO_FOUND;
    applyCommand(s, HUMAN, { type: 'foundReligion', tenet: 'scholars' });
    const other = s.cities.find((c) => c.religion === undefined)!;
    const m = addUnit(s, HUMAN, UnitTypeId.Missionary, other.tile);
    applyCommand(s, HUMAN, { type: 'spreadReligion', unit: m.id });
    expect(other.religion).toBe(0);
    expect(s.units.includes(m)).toBe(false);
  });

  it('gemeinsame Staatsreligion verbessert die Haltung', () => {
    const s = world();
    expect(religionAttitude(s, HUMAN, 1)).toBe(0);
  });

  it('wird gespeichert; ältere Spielstände bekommen keine Religionen', () => {
    const s = world();
    s.players[HUMAN].faith = FAITH_TO_FOUND;
    applyCommand(s, HUMAN, { type: 'foundReligion', tenet: 'tithe' });
    const loaded = fromSaveData(toSaveData(s));
    expect(loaded.religions).toHaveLength(1);
    expect(loaded.cities[0].religion).toBe(s.cities[0].religion);
    const old = toSaveData(s) as unknown as { version: number; religions?: unknown };
    old.version = 7;
    delete old.religions;
    expect(fromSaveData(old as never).religions).toEqual([]);
  });
});
