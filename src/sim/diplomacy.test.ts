import { describe, expect, it } from 'vitest';
import { addUnit, applyCommand, CommandError, createGame, endTurn, type GameState, HUMAN, refreshVision } from './game';
import { neighborOf } from './hex';
import { generateWorld } from './mapgen';
import { attitude, evaluate, relation } from './diplomacy';
import { Feature, Relief, Terrain } from './rules/terrain';
import { TechId } from './rules/techs';
import { UnitTypeId } from './rules/units';
import { checkVictory } from './victory';
import { fromSaveData, toSaveData } from './save';

const opts = { width: 64, height: 40, seed: 321, players: 3, script: 'continents' as const };

function game(): { s: GameState; target: number; warrior: ReturnType<typeof addUnit> } {
  const s = createGame(generateWorld(opts), opts);
  const warrior = s.units.find((u) => u.owner === HUMAN && u.type === UnitTypeId.Warrior)!;
  const target = neighborOf(s.map, warrior.tile, 0);
  s.map.terrain[target] = Terrain.Grassland;
  s.map.relief[target] = Relief.Flat;
  s.map.feature[target] = Feature.None;
  return { s, target, warrior };
}

describe('Diplomatie', () => {
  it('Angriff nur nach Kriegserklärung; Kriegserklärung verschlechtert die Haltung', () => {
    const { s, target, warrior } = game();
    addUnit(s, 1, UnitTypeId.Warrior, target);
    refreshVision(s, HUMAN);
    relation(s, HUMAN, 1).met = true;
    expect(() => applyCommand(s, HUMAN, { type: 'attack', unit: warrior.id, target })).toThrow(CommandError);
    const before = attitude(s, 1, HUMAN);
    applyCommand(s, HUMAN, { type: 'declareWar', target: 1 });
    expect(relation(s, HUMAN, 1).war).toBe(true);
    expect(attitude(s, 1, HUMAN)).toBeLessThan(before);
    applyCommand(s, HUMAN, { type: 'attack', unit: warrior.id, target });
  });

  it('im Frieden ohne offene Grenzen ist fremdes Gebiet gesperrt', () => {
    const { s, target, warrior } = game();
    relation(s, HUMAN, 1).met = true;
    s.tileOwner[target] = 1;
    expect(() => applyCommand(s, HUMAN, { type: 'move', unit: warrior.id, target })).toThrow(CommandError);
    relation(s, HUMAN, 1).openBorders = true;
    applyCommand(s, HUMAN, { type: 'move', unit: warrior.id, target });
    expect(warrior.tile).toBe(target);
  });

  it('KI bewertet Handel: fairer Tausch ja, einseitige Forderung nein', () => {
    const { s } = game();
    relation(s, HUMAN, 1).met = true;
    s.players[HUMAN].techs[TechId.Agriculture] = 1;
    s.players[1].techs[TechId.Mining] = 1;
    const fair = evaluate(s, 1, HUMAN, { kind: 'trade', give: [{ kind: 'tech', tech: TechId.Agriculture }], get: [{ kind: 'tech', tech: TechId.Mining }] });
    expect(fair.accept).toBe(true);
    const greedy = evaluate(s, 1, HUMAN, { kind: 'trade', give: [], get: [{ kind: 'tech', tech: TechId.Mining }] });
    expect(greedy.accept).toBe(false);
    applyCommand(s, HUMAN, { type: 'propose', target: 1, proposal: { kind: 'trade', give: [{ kind: 'tech', tech: TechId.Agriculture }], get: [{ kind: 'tech', tech: TechId.Mining }] } });
    expect(s.players[HUMAN].techs[TechId.Mining]).toBe(1);
    expect(s.players[1].techs[TechId.Agriculture]).toBe(1);
  });

  it('Erstkontakt entsteht durch Sicht', () => {
    const { s, target } = game();
    addUnit(s, 1, UnitTypeId.Scout, target);
    endTurn(s);
    expect(relation(s, HUMAN, 1).met).toBe(true);
  });
});

describe('Sieg', () => {
  it('Eroberung: nur noch eine Zivilisation übrig', () => {
    const { s } = game();
    for (const p of s.players) if (p.id !== HUMAN && !p.barbarian) p.alive = false;
    expect(checkVictory(s)?.type).toBe('conquest');
    expect(s.winner?.player).toBe(HUMAN);
  });

  it('Punktsieg beim Rundenlimit; Speicherstand erhält Diplomatie und Sieger', () => {
    const { s } = game();
    s.options.turnLimit = s.turn;
    expect(checkVictory(s)?.type).toBe('score');
    relation(s, HUMAN, 1).met = true;
    const loaded = fromSaveData(structuredClone(toSaveData(s)));
    expect(loaded.winner).toEqual(s.winner);
    expect(relation(loaded, HUMAN, 1).met).toBe(true);
  });
});
