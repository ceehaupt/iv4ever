// Reine KI-Partie mit festem Seed – läuft unverändert in Node (Referenz) und im Browser.
import { createGame, endTurn } from '../src/sim/game';
import { stateHash } from '../src/sim/hash';
import { generateWorld } from '../src/sim/mapgen';

export const SIM_OPTIONS = { width: 64, height: 40, seed: 4242, players: 5 };
export const SIM_TURNS = 80;

/** Spielt die Partie und liefert die Prüfsumme nach jeder zehnten Runde. */
export function simRun(): string[] {
  const s = createGame(generateWorld(SIM_OPTIONS), SIM_OPTIONS);
  const hashes: string[] = [];
  for (let t = 1; t <= SIM_TURNS; t++) {
    endTurn(s);
    if (t % 10 === 0) hashes.push(stateHash(s));
  }
  return hashes;
}
