import { describe, expect, it } from 'vitest';
import { PERSONAS } from './rules/leaders';
import { applyCommand, type Command, CommandError, createGame, endTurn, type GameState, handOverToAi } from './game';
import { generateWorld } from './mapgen';
import { relation } from './diplomacy';
import { UnitTypeId } from './rules/units';
import { toSaveData } from './save';

const opts = { width: 64, height: 40, seed: 2024, players: 4, humans: 2, mode: 'online' as const };

function fresh(): GameState {
  return createGame(generateWorld(opts), opts);
}

/** Gleiche Befehlsfolge auf zwei getrennten Zuständen – wie zwei Rechner im Lockstep. */
function lockstep(actions: (s: GameState) => [number, Command][], turns: number): [GameState, GameState] {
  const a = fresh();
  const b = fresh();
  for (let t = 0; t < turns; t++) {
    for (const s of [a, b]) {
      for (const [player, cmd] of actions(s)) {
        try {
          applyCommand(s, player, cmd);
        } catch (e) {
          if (!(e instanceof CommandError)) throw e;
        }
      }
      endTurn(s);
    }
  }
  return [a, b];
}

describe('Mehrspieler', () => {
  it('legt mehrere menschliche Spieler an', () => {
    const s = fresh();
    expect(s.players.filter((p) => p.human).map((p) => p.id)).toEqual([0, 1]);
    expect(s.players[0].name).toBe(`Spieler 1 (${PERSONAS[s.players[0].slot!].people})`);
  });

  it('Lockstep: gleiche Befehle ergeben auf zwei Rechnern denselben Zustand', () => {
    const actions = (s: GameState): [number, Command][] => {
      const out: [number, Command][] = [];
      for (const h of [0, 1]) {
        const settler = s.units.find((u) => u.owner === h && u.type === UnitTypeId.Settler);
        if (settler) out.push([h, { type: 'found', unit: settler.id }]);
        for (const c of s.cities.filter((x) => x.owner === h && !x.queue.length)) {
          out.push([h, { type: 'build', city: c.id, item: { kind: 'unit', id: UnitTypeId.Warrior }, append: false }]);
        }
        const scout = s.units.find((u) => u.owner === h && u.type === UnitTypeId.Scout && u.moves > 0);
        if (scout) out.push([h, { type: 'move', unit: scout.id, target: (scout.tile + 3) % s.map.terrain.length }]);
      }
      return out;
    };
    const [a, b] = lockstep(actions, 25);
    const da = toSaveData(a);
    const db = toSaveData(b);
    expect(da.units).toEqual(db.units);
    expect(da.cities).toEqual(db.cities);
    expect(da.rngState).toBe(db.rngState);
    expect(a.cities.some((c) => c.owner === 1)).toBe(true);
  });

  it('Angebote zwischen Menschen warten auf Antwort', () => {
    const s = fresh();
    relation(s, 0, 1).met = true;
    s.players[0].gold = 50;
    applyCommand(s, 0, { type: 'propose', target: 1, proposal: { kind: 'trade', give: [{ kind: 'gold', amount: 30 }], get: [] } });
    const pending = s.diplomacy.pending.find((p) => p.to === 1)!;
    expect(pending).toBeDefined();
    applyCommand(s, 1, { type: 'respond', proposal: pending.id, accept: true });
    expect(s.players[0].gold).toBe(20);
    expect(s.players[1].gold).toBe(30);
  });

  it('Verlässt ein Mensch das Spiel, übernimmt die KI – auf allen Rechnern gleich', () => {
    const run = () => {
      const s = fresh();
      for (let t = 0; t < 5; t++) endTurn(s);
      handOverToAi(s, 1);
      for (let t = 0; t < 20; t++) endTurn(s);
      return s;
    };
    const a = run();
    const b = run();
    expect(a.players[1].human).toBe(false);
    expect(a.players[1].persona).toBeDefined();
    // Die KI hat mit dem Volk weitergespielt (z. B. eine Stadt gegründet).
    expect(a.cities.some((c) => c.owner === 1)).toBe(true);
    expect(toSaveData(a).units).toEqual(toSaveData(b).units);
    expect(a.rng.getState()).toBe(b.rng.getState());
  });
});
