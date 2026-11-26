import { describe, expect, it } from 'vitest';
import { addUnit, applyCommand, endTurn, HUMAN, refreshVision } from './game';
import { relation } from './diplomacy';
import { BUILDINGS } from './rules/buildings';
import { TECHS, TechId } from './rules/techs';
import { UnitTypeId } from './rules/units';
import { nearVictory } from './victory';
import { aiCity, islands, T } from './testWorld';
import { AI_TACTICS } from './rules/leaders';

const PROJECT = BUILDINGS.map((b, id) => (b.project ? id : -1)).filter((id) => id >= 0);

describe('KI-Strategie', () => {
  it('erkennt einen Spieler kurz vor dem Projektsieg und erklärt ihm den Krieg – auch als friedlicher Herrscher', () => {
    const s = islands();
    s.turn = 120;
    const ai = s.players[1];
    ai.persona = { ...ai.persona!, aggression: 0 };
    aiCity(s, T(10, 1));
    for (let i = 0; i < 4; i++) addUnit(s, 1, UnitTypeId.Warrior, T(10, 1));
    const hs = addUnit(s, HUMAN, UnitTypeId.Settler, T(13, 8));
    refreshVision(s, HUMAN);
    applyCommand(s, HUMAN, { type: 'found', unit: hs.id });
    const city = s.cities.find((c) => c.owner === HUMAN)!;
    city.buildings.push(PROJECT[0], PROJECT[1]);
    relation(s, HUMAN, 1).met = true;
    relation(s, HUMAN, 1).since = 0;
    expect(nearVictory(s, HUMAN)).toBe(true);
    for (let t = 0; t < 20 && !relation(s, HUMAN, 1).war; t++) endTurn(s);
    expect(relation(s, HUMAN, 1).war).toBe(true);
  });

  it('forschungsorientierte KI steuert ab dem mittleren Spiel die Raumfahrt an', () => {
    const s = islands();
    const ai = s.players[1];
    ai.persona = { ...ai.persona!, science: 0.9 };
    aiCity(s, T(10, 1));
    // Gut die Hälfte des Baums ist bekannt (die ersten Stufen).
    TECHS.map((t, id) => ({ t, id })).sort((a, b) => a.t.tier - b.t.tier).slice(0, Math.ceil(TECHS.length * 0.6))
      .forEach(({ id }) => (ai.techs[id] = 1));
    ai.goal = -1;
    endTurn(s);
    expect(ai.goal).toBe(TechId.Spaceflight);
  });

  it('Feldzug: kriegerische KI sammelt ihre Armee und zieht vor die feindliche Stadt', () => {
    const s = islands();
    s.turn = 60;
    const ai = s.players[1];
    ai.persona = { ...ai.persona!, aggression: 0.9 };
    aiCity(s, T(10, 1));
    for (let i = 0; i < 8; i++) addUnit(s, 1, UnitTypeId.Warrior, T(10, 1));
    const hs = addUnit(s, HUMAN, UnitTypeId.Settler, T(13, 8));
    refreshVision(s, HUMAN);
    applyCommand(s, HUMAN, { type: 'found', unit: hs.id });
    addUnit(s, HUMAN, UnitTypeId.Warrior, T(13, 8));
    const r = relation(s, HUMAN, 1);
    r.met = true;
    r.war = true;
    for (const p of s.players) refreshVision(s, p.id);
    const near = () => s.units.filter((u) => u.owner === 1 && u.type === UnitTypeId.Warrior && Math.abs((u.tile % 16) - 13) <= 1 && Math.abs(Math.floor(u.tile / 16) - 8) <= 1).length;
    let best = 0;
    for (let t = 0; t < 15; t++) {
      endTurn(s);
      best = Math.max(best, near());
    }
    // Mehrere Einheiten standen gleichzeitig vor der Stadt (kein Einzelangriff).
    expect(best).toBeGreaterThanOrEqual(AI_TACTICS.normal.armySize - 1);
  });
});
