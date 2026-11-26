// Gemeinsame Bausteine der Computerspieler (ai.ts, aiNaval.ts).
import type { TurnEvent } from './city';
import { applyCommand, type Command, CommandError, type CommandResult, type GameState, type MoveEvent, type Unit } from './game';
import { forEachNeighbor } from './hex';
import type { GameMap } from './map';
import { isWater } from './rules/terrain';
import { isNaval, UNIT_TYPES } from './rules/units';
import type { CombatEvent } from './war';

export interface Out {
  events: TurnEvent[];
  combats: CombatEvent[];
  moves: MoveEvent[];
}

/** Befehl ausführen wie ein Mensch; ungültige Befehle sind für die KI kein Fehler. */
export function run(state: GameState, pid: number, c: Command, out: Out): CommandResult | null {
  try {
    const r = applyCommand(state, pid, c);
    out.moves.push(...r.moves);
    if (r.combats) out.combats.push(...r.combats);
    if (r.events) out.events.push(...r.events);
    return r;
  } catch (e) {
    if (e instanceof CommandError) return null;
    throw e;
  }
}

export function moveTo(state: GameState, u: Unit, target: number, out: Out): boolean {
  if (u.tile === target) return true;
  return run(state, u.owner, { type: 'move', unit: u.id, target }, out) !== null;
}

/** Landstreitkräfte (ohne Späher, Schiffe und Flugzeuge). */
export const isMilitary = (type: number) => UNIT_TYPES[type].strength > 0 && UNIT_TYPES[type].cls !== 'recon' && !isNaval(type) && !UNIT_TYPES[type].air;
export const power = (type: number) => UNIT_TYPES[type].strength + UNIT_TYPES[type].ranged * 0.8;

/** Landmassen-Kennung je Feld (−1 = Wasser); zusammenhängendes Land gehört zu einer Landmasse. */
export function landmasses(m: GameMap): Int32Array {
  const n = m.width * m.height;
  const comp = new Int32Array(n).fill(-1);
  const stack: number[] = [];
  let id = 0;
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0 || isWater(m.terrain[i])) continue;
    comp[i] = id;
    stack.push(i);
    while (stack.length) {
      const t = stack.pop()!;
      forEachNeighbor(m, t, (nb) => {
        if (comp[nb] < 0 && !isWater(m.terrain[nb])) {
          comp[nb] = id;
          stack.push(nb);
        }
      });
    }
    id++;
  }
  return comp;
}
