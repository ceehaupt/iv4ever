import { Rng } from './rng';

/**
 * Städtenamen aus Silben – frei erfunden, damit keine realen Völker oder Spielinhalte nachgebildet werden.
 * Jeder Spieler bekommt einen eigenen, deterministischen Silbenstil.
 */
const STARTS = ['Al', 'Bra', 'Cor', 'Del', 'Es', 'Fal', 'Gor', 'Hal', 'Ir', 'Ka', 'Lor', 'Mar', 'Nor', 'Os', 'Pra', 'Quel', 'Ros', 'Sal', 'Tor', 'Ul', 'Ver', 'Wen', 'Yor', 'Zan', 'Bel', 'Dun', 'Tam', 'Vel'];
const MIDDLES = ['', '', '', 'a', 'e', 'i', 'o', 'an', 'el', 'ir', 'or', 'un'];
const ENDS = ['heim', 'ford', 'mar', 'ia', 'on', 'burg', 'dal', 'is', 'ora', 'wick', 'stein', 'ar', 'holm', 'ene', 'au', 'tal'];

export function cityName(seed: number, player: number, index: number, taken: ReadonlySet<string>): string {
  const rng = new Rng((seed ^ (player * 7919) ^ (index * 104729)) >>> 0);
  for (let attempt = 0; attempt < 50; attempt++) {
    const name =
      STARTS[rng.int(STARTS.length)] + MIDDLES[rng.int(MIDDLES.length)] + ENDS[rng.int(ENDS.length)];
    // Keine Vokalhaufen oder Doppelvokale („Quelaau“), keine Doppelkonsonanten am Silbenübergang.
    if (/[aeiou]{3}|aa|ee|ii|oo|uu/i.test(name) || /([^aeiou])\1\1/i.test(name)) continue;
    if (!taken.has(name)) return name;
  }
  return `Siedlung ${index + 1}`;
}
