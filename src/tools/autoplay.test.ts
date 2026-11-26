/// <reference types="node" />
// Automatische Testpartien (reine KI) für das Balancing. Läuft nur mit `npm run autoplay`, nicht im normalen Testlauf.
//   GAMES=12 TURNS=300 SIZE=standard SCRIPT=continents DIFFICULTY=normal npm run autoplay
// Ergebnis: reports/autoplay-<Zeit>.csv (je Partie eine Zeile) und reports/autoplay-<Zeit>.md (Zusammenfassung).
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { landmasses } from '../sim/aiCommon';
import { pollutedTiles } from '../sim/environment';
import { createGame, endTurn, type GameState } from '../sim/game';
import { generateWorld, type MapGenOptions } from '../sim/mapgen';
import type { Difficulty } from '../sim/rules/leaders';
import { TECHS } from '../sim/rules/techs';
import { isNaval, UNIT_TYPES } from '../sim/rules/units';
import { score, VICTORY_NAMES } from '../sim/victory';

const SIZES = {
  duel: { width: 48, height: 30, players: 2 },
  small: { width: 64, height: 40, players: 4 },
  standard: { width: 84, height: 52, players: 6 },
  large: { width: 108, height: 68, players: 8 },
  huge: { width: 140, height: 88, players: 10 },
} as const;

interface GameStats {
  seed: number;
  winner: string;
  victory: string;
  victoryTurn: number;
  turns: number;
  alive: number;
  citiesAvg: number;
  citiesMax: number;
  popAvg: number;
  techsAvg: number;
  techsMax: number;
  /** Runde, in der erstmals jemand eine Technologie der Stufe 5 / 10 / 15 kannte. */
  tier5: number;
  tier10: number;
  tier15: number;
  wars: number;
  /** Von Völkern (nicht Plünderern) eroberte Städte. */
  captures: number;
  eliminated: number;
  routes: number;
  /** Bündnisse am Ende der Partie. */
  alliances: number;
  alliancesFormed: number;
  openBorders: number;
  overseasCities: number;
  maxShips: number;
  maxPlanes: number;
  polluted: number;
  religions: number;
  religiousCities: number;
  maxPolluted: number;
  airStrikes: number;
  msPerTurn: number;
  scoreSpread: number;
}

function maxTier(s: GameState): number {
  let t = 0;
  for (const p of s.players) TECHS.forEach((tech, id) => {
    if (p.techs[id]) t = Math.max(t, tech.tier);
  });
  return t;
}

function play(opts: MapGenOptions, turns: number): GameStats {
  const s = createGame(generateWorld(opts), opts);
  const civs = () => s.players.filter((p) => !p.barbarian);
  let wars = 0;
  let captures = 0;
  let alliancesFormed = 0;
  let maxShips = 0;
  let maxPlanes = 0;
  let maxPolluted = 0;
  let airStrikes = 0;
  const tierTurn: Record<number, number> = { 5: -1, 10: -1, 15: -1 };
  const t0 = performance.now();
  let played = 0;
  for (let t = 0; t < turns && !s.winner; t++) {
    const res = endTurn(s);
    played++;
    for (const e of res.events) {
      // Ereignisse werden je Spieler gemeldet; je Ereignis nur einmal zählen (Meldung an den Erklärenden).
      if (e.text.startsWith('Bündnis zwischen') && e.text.startsWith(`Bündnis zwischen ${s.players[e.player].name}`)) alliancesFormed++;
      if (/erklärt .* den Krieg|Du erklärst/.test(e.text) && e.text.startsWith(s.players[e.player].name)) wars++;
    }
    captures += res.combats.filter((c) => c.capturedCity && !s.players[c.attackerOwner].barbarian).length;
    maxPolluted = Math.max(maxPolluted, pollutedTiles(s));
    maxPlanes = Math.max(maxPlanes, s.units.filter((u) => UNIT_TYPES[u.type].air).length);
    airStrikes += res.combats.filter((c) => UNIT_TYPES[c.attackerType].air && c.ranged && !UNIT_TYPES[c.defenderType ?? 0].air).length;
    maxShips = Math.max(maxShips, s.units.filter((u) => isNaval(u.type)).length);
    const tier = maxTier(s);
    for (const k of [5, 10, 15]) if (tierTurn[k] < 0 && tier >= k) tierTurn[k] = s.turn;
  }
  const ms = (performance.now() - t0) / Math.max(1, played);
  const mass = landmasses(s.map);
  const alive = civs().filter((p) => p.alive);
  const cityCount = alive.map((p) => s.cities.filter((c) => c.owner === p.id).length);
  const pop = alive.map((p) => s.cities.filter((c) => c.owner === p.id).reduce((a, c) => a + c.size, 0));
  const techs = alive.map((p) => p.techs.reduce((a, b) => a + b, 0));
  const scores = alive.map((p) => score(s, p.id)).sort((a, b) => b - a);
  const overseas = s.cities.filter((c) => {
    const cap = s.cities.find((o) => o.owner === c.owner && o.buildings.includes(0));
    return cap && mass[cap.tile] !== mass[c.tile];
  }).length;
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return {
    seed: opts.seed,
    winner: s.winner ? `${s.players[s.winner.player].name} (${s.players[s.winner.player].persona?.leader ?? ''})` : '–',
    victory: s.winner ? VICTORY_NAMES[s.winner.type] : 'offen',
    victoryTurn: s.winner?.turn ?? -1,
    turns: played,
    alive: alive.length,
    citiesAvg: avg(cityCount),
    citiesMax: Math.max(0, ...cityCount),
    popAvg: avg(pop),
    techsAvg: avg(techs),
    techsMax: Math.max(0, ...techs),
    tier5: tierTurn[5],
    tier10: tierTurn[10],
    tier15: tierTurn[15],
    wars,
    captures,
    eliminated: civs().length - alive.length,
    routes: s.routes.length,
    alliances: Object.values(s.diplomacy.relations).filter((r) => r.alliance).length,
    alliancesFormed,
    openBorders: Object.values(s.diplomacy.relations).filter((r) => r.openBorders).length,
    overseasCities: overseas,
    maxShips,
    maxPlanes,
    polluted: pollutedTiles(s),
    religions: s.religions.length,
    religiousCities: s.cities.length ? Math.round((100 * s.cities.filter((c) => c.religion !== undefined).length) / s.cities.length) : 0,
    maxPolluted,
    airStrikes,
    msPerTurn: ms,
    scoreSpread: scores.length > 1 ? scores[0] / Math.max(1, scores[1]) : 1,
  };
}

const fmt = (v: unknown) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v));

it.skipIf(!process.env.AUTOPLAY)('automatische Testpartien', () => {
  const games = Number(process.env.GAMES ?? 8);
  const turns = Number(process.env.TURNS ?? 300);
  const sizeKey = (process.env.SIZE ?? 'standard') as keyof typeof SIZES;
  const size = SIZES[sizeKey];
  const script = (process.env.SCRIPT ?? 'continents') as MapGenOptions['script'];
  const difficulty = (process.env.DIFFICULTY ?? 'normal') as Difficulty;
  const firstSeed = Number(process.env.SEED ?? 1000);
  const rows: GameStats[] = [];
  for (let g = 0; g < games; g++) {
    rows.push(play({ ...size, seed: firstSeed + g, script, difficulty, humans: 0 }, turns));
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = new URL('../../reports/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const keys = Object.keys(rows[0]) as (keyof GameStats)[];
  writeFileSync(new URL(`autoplay-${stamp}.csv`, dir), [keys.join(';'), ...rows.map((r) => keys.map((k) => fmt(r[k])).join(';'))].join('\n') + '\n');

  const count = (f: (r: GameStats) => boolean) => rows.filter(f).length;
  const mean = (k: keyof GameStats, f: (r: GameStats) => boolean = () => true) => {
    const v = rows.filter(f).map((r) => r[k] as number).filter((x) => x >= 0);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '–';
  };
  const victories = Object.values(VICTORY_NAMES).concat('offen').map((v) => `${v}: ${count((r) => r.victory === v)}`).join(' · ');
  const md = `# Automatische Testpartien ${stamp}

${games} Partien · ${turns} Runden max. · ${sizeKey} · ${script} · ${difficulty} · Seeds ${firstSeed}–${firstSeed + games - 1}

| Kennzahl | Wert |
|---|---|
| Siegarten | ${victories} |
| Ø Siegrunde | ${mean('victoryTurn', (r) => r.victoryTurn > 0)} |
| Ø Städte je Volk (Ende) | ${mean('citiesAvg')} (max. ${Math.max(...rows.map((r) => r.citiesMax))}) |
| Ø Bevölkerung je Volk | ${mean('popAvg')} |
| Ø Technologien je Volk (Ende) | ${mean('techsAvg')} von ${TECHS.length} |
| Erste Stufe 5 / 10 / 15 (Runde) | ${mean('tier5')} / ${mean('tier10')} / ${mean('tier15')} |
| Ø Kriegserklärungen je Partie | ${mean('wars')} |
| Ø eroberte Städte je Partie | ${mean('captures')} |
| Ø vernichtete Völker | ${mean('eliminated')} |
| Ø Handelsrouten (Ende) | ${mean('routes')} |
| Ø Bündnisse (Ende / geschlossen) | ${mean('alliances')} / ${mean('alliancesFormed')} |
| Ø offene Grenzen (Ende) | ${mean('openBorders')} |
| Ø Städte in Übersee | ${mean('overseasCities')} |
| Ø max. Schiffe gleichzeitig | ${mean('maxShips')} |
| Ø Religionen / Städte mit Religion | ${mean('religions')} / ${mean('religiousCities')} % |
| Ø verschmutzte Felder (Ende / max.) | ${mean('polluted')} / ${mean('maxPolluted')} |
| Ø max. Flugzeuge / Luftangriffe | ${mean('maxPlanes')} / ${mean('airStrikes')} |
| Abstand Erster/Zweiter (Punkte) | ${mean('scoreSpread')} × |
| Ø Rechenzeit je Runde | ${mean('msPerTurn')} ms |

| Seed | Sieger | Sieg | Runde | Lebend | Ø Städte | Techs Ø/max | Kriege | Routen | Übersee |
|---|---|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.seed} | ${r.winner} | ${r.victory} | ${r.victoryTurn} | ${r.alive} | ${fmt(r.citiesAvg)} | ${fmt(r.techsAvg)}/${r.techsMax} | ${r.wars} | ${r.routes} | ${r.overseasCities} |`).join('\n')}
`;
  writeFileSync(new URL(`autoplay-${stamp}.md`, dir), md);
  process.stdout.write(md);
}, 3_600_000);
