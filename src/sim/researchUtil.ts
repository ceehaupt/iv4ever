import type { Player } from './game';
import { nextStepTowards } from './rules/techs';

/** Aktuell erforschte Technologie eines Spielers (ohne Zugriff auf den ganzen Zustand). */
export function currentResearchOf(p: Player): number {
  return p.goal >= 0 ? nextStepTowards(p.techs, p.goal) : -1;
}
