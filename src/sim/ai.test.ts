import { describe, expect, it } from 'vitest';
import { createGame, endTurn, type GameState } from './game';
import { generateWorld } from './mapgen';
import { toSaveData } from './save';

const opts = { width: 64, height: 40, seed: 99, players: 4, script: 'continents' as const };
function play(turns: number): GameState {
  const s = createGame(generateWorld(opts), opts);
  for (let t = 0; t < turns; t++) endTurn(s);
  return s;
}

describe('KI', () => {
  it('gründet Städte, forscht und baut Einheiten', () => {
    const s = play(45);
    const ais = s.players.filter((p) => !p.human && !p.barbarian);
    for (const p of ais) {
      expect(s.cities.filter((c) => c.owner === p.id).length).toBeGreaterThanOrEqual(1);
      expect(p.techs.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(2);
    }
    expect(Math.max(...ais.map((p) => s.cities.filter((c) => c.owner === p.id).length))).toBeGreaterThanOrEqual(2);
  });

  it('ist deterministisch (Grundlage für Mehrspieler)', () => {
    const a = toSaveData(play(30));
    const b = toSaveData(play(30));
    expect(a.units).toEqual(b.units);
    expect(a.cities).toEqual(b.cities);
    expect(a.rngState).toBe(b.rngState);
  });
});
