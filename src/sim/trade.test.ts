import { describe, expect, it } from 'vitest';
import { addUnit, applyCommand, CommandError, HUMAN, refreshVision } from './game';
import { relation } from './diplomacy';
import { UnitTypeId } from './rules/units';
import { aiCity, islands, T } from './testWorld';

/** Mensch mit Händler; fremde Stadt der KI 6+ Felder von der eigenen Stadt entfernt. */
function setup() {
  const s = islands();
  const own = addUnit(s, HUMAN, UnitTypeId.Settler, T(9, 1));
  refreshVision(s, HUMAN);
  applyCommand(s, HUMAN, { type: 'found', unit: own.id });
  aiCity(s, T(13, 8));
  const r = relation(s, HUMAN, 1);
  r.met = true;
  r.war = false;
  r.openBorders = false;
  const m = addUnit(s, HUMAN, UnitTypeId.Merchant, T(12, 6));
  for (const p of s.players) refreshVision(s, p.id);
  return { s, m };
}

describe('Handelsrouten mit fremden Städten', () => {
  it('Händler betritt im Frieden fremdes Gebiet und errichtet die Route vom Nachbarfeld', () => {
    const { s, m } = setup();
    // Ziel: Nachbarfeld der fremden Stadt (im fremden Gebiet, ohne offene Grenzen).
    applyCommand(s, HUMAN, { type: 'move', unit: m.id, target: T(12, 7) });
    expect(m.tile).toBe(T(12, 7));
    expect(s.tileOwner[T(12, 7)]).toBe(1);
    applyCommand(s, HUMAN, { type: 'establishRoute', unit: m.id });
    expect(s.routes).toHaveLength(1);
    expect(s.cities.find((c) => c.id === s.routes[0].to)!.owner).toBe(1);
  });

  it('fremde Städte bleiben tabu, und das Durchreiserecht gilt nur für Händler', () => {
    const { s, m } = setup();
    expect(() => applyCommand(s, HUMAN, { type: 'move', unit: m.id, target: T(13, 8) })).toThrow(CommandError);
    const w = addUnit(s, HUMAN, UnitTypeId.Warrior, T(12, 6));
    refreshVision(s, HUMAN);
    expect(() => applyCommand(s, HUMAN, { type: 'move', unit: w.id, target: T(12, 7) })).toThrow(CommandError);
  });
});
