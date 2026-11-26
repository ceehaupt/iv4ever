// Religion (eigener Entwurf, siehe docs/REGELN.md):
// - Glaubenspunkte aus Schrein, Kathedrale und Ewiger Flamme. Mit 40 Punkten (und Mystik) gründet ein Volk eine Religion,
//   solange noch eine frei ist (höchstens halb so viele wie Völker, mindestens 2, höchstens 5).
// - Der Gründer wählt eine Lehre; sie wirkt in allen Städten, die der Religion folgen – auch bei anderen Völkern.
// - Städte üben Glaubensdruck auf Städte im Umkreis aus (heilige Stadt dreifach, Handelsrouten verstärken);
//   übersteigt der Druck einer Religion die Schwelle und den der bisherigen deutlich, tritt die Stadt über.
// - Missionare bekehren eine Stadt sofort. Gleiche Staatsreligion verbessert die Haltung, verschiedene verschlechtert sie.
import type { City, TurnEvent } from './city';
import type { GameState } from './game';
import { tileDistance } from './hex';
import { BUILDINGS, BuildingId } from './rules/buildings';
import { TechId } from './rules/techs';

export type TenetKey = 'pilgrimage' | 'charity' | 'scholars' | 'fellowship' | 'tithe';

export interface Tenet {
  key: TenetKey;
  name: string;
  description: string;
  culture?: number;
  mood?: number;
  researchPct?: number;
  supply?: number;
  /** Gold je anhängender Stadt (alle Besitzer) für den Gründer. */
  titheGold?: number;
}

export const TENETS: readonly Tenet[] = [
  { key: 'pilgrimage', name: 'Pilgerfahrt', description: '+2 Kultur in jeder Stadt der Religion', culture: 2 },
  { key: 'charity', name: 'Nächstenliebe', description: '+1 Stimmung in jeder Stadt der Religion', mood: 1 },
  { key: 'scholars', name: 'Klosterschulen', description: '+10 % Forschung in jeder Stadt der Religion', researchPct: 10 },
  { key: 'fellowship', name: 'Gemeinschaft', description: '+1 Versorgung in jeder Stadt der Religion', supply: 1 },
  { key: 'tithe', name: 'Zehnt', description: 'Der Gründer erhält +1 Gold je Stadt der Religion (auch im Ausland)', titheGold: 1 },
];

/** Erfundene Namen, in Gründungsreihenfolge vergeben. */
export const RELIGION_NAMES = ['Lehre der Quelle', 'Bund der Sterne', 'Weg des Hains', 'Kreis der Ahnen', 'Orden der Flamme'];

export interface Religion {
  id: number;
  name: string;
  founder: number;
  holyCity: number;
  tenet: TenetKey;
  founded: number;
}

export const FAITH_TO_FOUND = 40;
/** Druck, ab dem eine Stadt übertritt. */
export const CONVERT_PRESSURE = 20;
const PRESSURE_RADIUS = 10;
/** Glaubenspunkte je Gebäude (Schrein, Kathedrale, Ewige Flamme). */
export const FAITH_BUILDINGS: Partial<Record<number, number>> = {
  [BuildingId.Shrine]: 1, [BuildingId.Cathedral]: 2, [BuildingId.EternalFlame]: 2,
};

export const maxReligions = (state: GameState) =>
  Math.max(2, Math.min(5, Math.floor(state.players.filter((p) => !p.barbarian).length / 2)));

export function tenetOf(r: Religion): Tenet {
  return TENETS.find((t) => t.key === r.tenet)!;
}

export function religionById(state: GameState, id: number | undefined): Religion | undefined {
  return id === undefined ? undefined : state.religions.find((r) => r.id === id);
}

/** Staatsreligion = Religion der Hauptstadt (sonst der ersten Stadt). */
export function stateReligion(state: GameState, pid: number): number | undefined {
  const own = state.cities.filter((c) => c.owner === pid);
  const capital = own.find((c) => c.buildings.includes(BuildingId.Palace)) ?? own[0];
  return capital?.religion;
}

export function faithPerTurn(state: GameState, pid: number): number {
  let f = 0;
  for (const c of state.cities) if (c.owner === pid) for (const b of c.buildings) f += FAITH_BUILDINGS[b] ?? 0;
  return f;
}

/** Warum (noch) keine Religion gegründet werden kann – oder null. */
export function foundBlocker(state: GameState, pid: number): string | null {
  const p = state.players[pid];
  if (state.religions.some((r) => r.founder === pid)) return 'Ihr habt bereits eine Religion gegründet';
  if (!p.techs[TechId.Mysticism]) return 'Benötigt Mystik';
  if (state.religions.length >= maxReligions(state)) return 'Alle Religionen sind bereits gegründet';
  if ((p.faith ?? 0) < FAITH_TO_FOUND) return `Benötigt ${FAITH_TO_FOUND} Glauben (${p.faith ?? 0} vorhanden)`;
  if (!state.cities.some((c) => c.owner === pid)) return 'Keine Stadt';
  return null;
}

export function foundReligion(state: GameState, pid: number, tenet: TenetKey, events: TurnEvent[]): Religion {
  const own = state.cities.filter((c) => c.owner === pid);
  // Heilige Stadt: die Stadt mit dem meisten Glauben (bei Gleichstand die Hauptstadt bzw. die älteste).
  const faith = (c: City) => c.buildings.reduce((s, b) => s + (FAITH_BUILDINGS[b] ?? 0), 0) + (c.buildings.includes(BuildingId.Palace) ? 0.5 : 0);
  const holy = own.slice().sort((a, b) => faith(b) - faith(a) || a.id - b.id)[0];
  const r: Religion = { id: state.religions.length, name: RELIGION_NAMES[state.religions.length % RELIGION_NAMES.length], founder: pid, holyCity: holy.id, tenet, founded: state.turn };
  state.religions.push(r);
  state.players[pid].faith = (state.players[pid].faith ?? 0) - FAITH_TO_FOUND;
  convert(holy, r.id, 3 * CONVERT_PRESSURE);
  const who = state.players[pid];
  for (const p of state.players) {
    if (p.barbarian) continue;
    const t = p.id === pid ? `Du gründest „${r.name}“ (${tenetOf(r).name}) – heilige Stadt ${holy.name}` : `${who.name} gründet die Religion „${r.name}“`;
    events.push({ player: p.id, text: t, tile: p.id === pid ? holy.tile : -1 });
  }
  return r;
}

function convert(c: City, religion: number, pressure: number): void {
  c.religion = religion;
  c.pressure = { ...(c.pressure ?? {}), [religion]: Math.max(pressure, c.pressure?.[religion] ?? 0) };
}

/** Missionar: Stadt sofort bekehren. */
export function missionize(state: GameState, c: City, religion: number, events: TurnEvent[]): void {
  convert(c, religion, 2 * CONVERT_PRESSURE);
  const r = religionById(state, religion)!;
  events.push({ player: c.owner, text: `${c.name} folgt jetzt „${r.name}“`, tile: c.tile });
}

/** Wirkung der Religion einer Stadt (Lehre). */
export function religionEffect(state: GameState, c: City): { culture: number; mood: number; researchPct: number; supply: number } {
  const r = religionById(state, c.religion);
  if (!r) return { culture: 0, mood: 0, researchPct: 0, supply: 0 };
  const t = tenetOf(r);
  return { culture: t.culture ?? 0, mood: t.mood ?? 0, researchPct: t.researchPct ?? 0, supply: t.supply ?? 0 };
}

/** Jede Runde: Glauben sammeln, Zehnt, Ausbreitung durch Druck, KI gründet Religionen. */
export function religionTurn(state: GameState, events: TurnEvent[]): void {
  for (const p of state.players) {
    if (p.barbarian || !p.alive) continue;
    p.faith = (p.faith ?? 0) + faithPerTurn(state, p.id);
  }
  // Zehnt
  for (const r of state.religions) {
    const gold = tenetOf(r).titheGold ?? 0;
    if (!gold) continue;
    const n = state.cities.filter((c) => c.religion === r.id).length;
    if (state.players[r.founder]?.alive) state.players[r.founder].gold += gold * n;
  }
  if (!state.religions.length) return;
  // Druck: jede Stadt mit Religion auf Städte im Umkreis; heilige Stadt dreifach, Handelsroute +2.
  const add = new Map<number, Map<number, number>>();
  for (const src of state.cities) {
    if (src.religion === undefined) continue;
    const r = religionById(state, src.religion)!;
    const strength = r.holyCity === src.id ? 3 : 1;
    for (const dst of state.cities) {
      if (dst === src || tileDistance(state.map, src.tile, dst.tile) > PRESSURE_RADIUS) continue;
      const route = state.routes.some((x) => (x.from === src.id && x.to === dst.id) || (x.to === src.id && x.from === dst.id)) ? 2 : 0;
      const m = add.get(dst.id) ?? new Map<number, number>();
      m.set(src.religion, (m.get(src.religion) ?? 0) + strength + route);
      add.set(dst.id, m);
    }
  }
  for (const c of state.cities) {
    const pr: Record<number, number> = {};
    // Vorhandener Druck verfällt um 10 %, neuer kommt hinzu (ganzzahlig, deterministisch).
    for (const [k, v] of Object.entries(c.pressure ?? {})) pr[Number(k)] = Math.floor(v * 0.9);
    for (const [k, v] of add.get(c.id) ?? []) pr[k] = (pr[k] ?? 0) + v;
    c.pressure = pr;
    let best = -1;
    let bestV = 0;
    for (const [k, v] of Object.entries(pr)) {
      if (v > bestV || (v === bestV && Number(k) < best)) {
        best = Number(k);
        bestV = v;
      }
    }
    const current = c.religion === undefined ? 0 : pr[c.religion] ?? 0;
    const holy = state.religions.some((r) => r.holyCity === c.id);
    if (best >= 0 && best !== c.religion && !holy && bestV >= CONVERT_PRESSURE && bestV > current * 1.2) {
      c.religion = best;
      const r = religionById(state, best)!;
      events.push({ player: c.owner, text: `${c.name} wendet sich „${r.name}“ zu`, tile: c.tile });
    }
  }
}

/** Haltungsbonus aus der Staatsreligion: gleich +1, verschieden −1, sonst 0. */
export function religionAttitude(state: GameState, a: number, b: number): number {
  const ra = stateReligion(state, a);
  const rb = stateReligion(state, b);
  if (ra === undefined || rb === undefined) return 0;
  return ra === rb ? 1 : -1;
}

/** Glaubensgebäude als Text (für Hinweise). */
export const faithSources = () =>
  Object.entries(FAITH_BUILDINGS).map(([id, v]) => `${BUILDINGS[Number(id)].name} +${v}`).join(', ');
