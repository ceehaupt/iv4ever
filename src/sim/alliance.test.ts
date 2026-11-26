import { describe, expect, it } from 'vitest';
import { addUnit, applyCommand, CommandError, createGame, HUMAN, refreshVision } from './game';
import { attitude, declareWar, evaluate, execute, relation } from './diplomacy';
import { generateWorld } from './mapgen';
import { UnitTypeId } from './rules/units';
import type { TurnEvent } from './city';

const opts = { width: 64, height: 40, seed: 99, players: 4 };
/** Drei KIs (1–3) und ein Mensch (0); alle kennen sich, offene Grenzen zwischen 0 und 1. */
function world() {
  const s = createGame(generateWorld(opts), opts);
  for (const [a, b] of [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]) relation(s, a, b).met = true;
  relation(s, HUMAN, 1).openBorders = true;
  return s;
}

describe('Bündnisse', () => {
  it('nur mit offenen Grenzen; teilen danach die Sicht', () => {
    const s = world();
    s.diplomacy.memory['1:0'] = 6; // KI 1 mag den Menschen
    expect(evaluate(s, 2, HUMAN, { kind: 'alliance' }).accept).toBe(false); // keine offenen Grenzen
    const res = applyCommand(s, HUMAN, { type: 'propose', target: 1, proposal: { kind: 'alliance' } });
    expect(res.reply?.accepted).toBe(true);
    expect(relation(s, HUMAN, 1).alliance).toBe(true);
    // Eine Einheit von KI 1 macht ihr Umfeld für den Menschen sichtbar.
    const far = s.units.find((u) => u.owner === 1)!;
    refreshVision(s, HUMAN);
    expect(s.players[HUMAN].visible[far.tile]).toBe(1);
  });

  it('Bündnisfall: Wer einen Partner angreift, hat beide gegen sich; Verbündete kann man nicht angreifen', () => {
    const s = world();
    s.diplomacy.memory['1:0'] = 6;
    applyCommand(s, HUMAN, { type: 'propose', target: 1, proposal: { kind: 'alliance' } });
    const events: TurnEvent[] = [];
    declareWar(s, 2, HUMAN, events);
    expect(relation(s, 2, HUMAN).war).toBe(true);
    expect(relation(s, 2, 1).war).toBe(true);
    expect(events.some((e) => e.text.includes('in den Krieg ein'))).toBe(true);
    expect(() => applyCommand(s, HUMAN, { type: 'declareWar', target: 1 })).toThrow(CommandError);
  });

  it('Kündigen ist möglich, verärgert aber den Partner', () => {
    const s = world();
    s.diplomacy.memory['1:0'] = 6;
    applyCommand(s, HUMAN, { type: 'propose', target: 1, proposal: { kind: 'alliance' } });
    const before = attitude(s, 1, HUMAN);
    applyCommand(s, HUMAN, { type: 'cancelAlliance', target: 1 });
    expect(relation(s, HUMAN, 1).alliance).toBe(false);
    expect(attitude(s, 1, HUMAN)).toBeLessThan(before);
  });
});

describe('Forderungen', () => {
  it('die KI gibt nur einem deutlich Stärkeren nach und ist danach verärgert', () => {
    const s = world();
    s.players[2].gold = 200;
    const demand = { kind: 'demand' as const, get: [{ kind: 'gold' as const, amount: 50 }] };
    expect(evaluate(s, 2, HUMAN, demand).accept).toBe(false);
    const home = s.units.find((u) => u.owner === HUMAN)!.tile;
    for (let i = 0; i < 12; i++) addUnit(s, HUMAN, UnitTypeId.Swordsman, home);
    expect(evaluate(s, 2, HUMAN, demand).accept).toBe(true);
    const before = attitude(s, 2, HUMAN);
    execute(s, HUMAN, 2, demand, []);
    expect(s.players[2].gold).toBe(150);
    expect(attitude(s, 2, HUMAN)).toBeLessThan(before);
  });

  it('abgelehnte Forderung an einen Menschen kann Krieg bedeuten', () => {
    let wars = 0;
    for (let seed = 0; seed < 20; seed++) {
      const s = world();
      s.rng = new (s.rng.constructor as new (n: number) => typeof s.rng)(seed);
      s.players[1].persona = { ...s.players[1].persona!, aggression: 1 };
      s.diplomacy.pending.push({ id: 1, from: 1, to: HUMAN, proposal: { kind: 'demand', get: [{ kind: 'gold', amount: 0 }] }, turn: s.turn });
      s.players[HUMAN].gold = 10;
      s.diplomacy.pending[0].proposal = { kind: 'demand', get: [{ kind: 'gold', amount: 5 }] };
      applyCommand(s, HUMAN, { type: 'respond', proposal: 1, accept: false });
      if (relation(s, 1, HUMAN).war) wars++;
    }
    // Wahrscheinlichkeit 60 % bei voller Aggression: in 20 Fällen deutlich mehr als 0 und weniger als 20.
    expect(wars).toBeGreaterThan(5);
    expect(wars).toBeLessThan(20);
  });
});
