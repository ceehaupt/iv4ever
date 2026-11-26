import { religionAttitude } from './religion';
import type { TurnEvent } from './city';
import type { GameState, Player } from './game';
import { TECHS, techCost } from './rules/techs';
import { UNIT_TYPES } from './rules/units';
import { AI_TACTICS } from './rules/leaders';
import { nearVictory } from './victory';

/**
 * Diplomatie (eigener Entwurf, siehe docs/REGELN.md):
 * - Zivilisationen lernen sich kennen, sobald sie Einheiten, Städte oder Gebiet der anderen sehen.
 * - Grundzustand ist Frieden; Angriffe erfordern eine Kriegserklärung. Plünderer sind immer feindlich.
 * - Im Frieden ohne offene Grenzen darf man fremdes Gebiet nicht betreten.
 * - Die Haltung (−10 … +10) speist sich aus Frieden, offenen Grenzen, Handel und erlittenen Kriegserklärungen.
 */

export interface Relation {
  met: boolean;
  war: boolean;
  openBorders: boolean;
  /** Runde des letzten Wechsels zwischen Krieg und Frieden. */
  since: number;
  /** Wer zuletzt den Krieg erklärt hat (-1 = niemand). */
  aggressor: number;
  /** Verteidigungsbündnis (fehlt in alten Spielständen = kein Bündnis). */
  alliance?: boolean;
}

export type TradeItem = { kind: 'gold'; amount: number } | { kind: 'tech'; tech: number };

export type Proposal =
  | { kind: 'peace' }
  | { kind: 'openBorders' }
  | { kind: 'trade'; give: TradeItem[]; get: TradeItem[] }
  /** Verteidigungsbündnis: gemeinsame Sicht, Beistand bei Angriffen Dritter. */
  | { kind: 'alliance' }
  /** Forderung (Tribut): Der Empfänger soll ohne Gegenleistung liefern. */
  | { kind: 'demand'; get: TradeItem[] };

export interface PendingProposal {
  id: number;
  from: number;
  to: number;
  proposal: Proposal;
  turn: number;
}

export interface Diplomacy {
  /** Schlüssel "a:b" mit a < b. */
  relations: Record<string, Relation>;
  /** Gerichtete Haltungs-Modifikatoren aus Ereignissen: "von:zu" → Wert. */
  memory: Record<string, number>;
  pending: PendingProposal[];
  nextProposalId: number;
}

export function createDiplomacy(): Diplomacy {
  return { relations: {}, memory: {}, pending: [], nextProposalId: 1 };
}

const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export function relation(state: GameState, a: number, b: number): Relation {
  const k = key(a, b);
  let r = state.diplomacy.relations[k];
  if (!r) {
    r = { met: false, war: false, openBorders: false, since: 0, aggressor: -1 };
    state.diplomacy.relations[k] = r;
  }
  return r;
}

/** Verbündete eines Spielers (Verteidigungsbündnis). */
export function alliesOf(state: GameState, pid: number): number[] {
  return state.players.filter((p) => p.id !== pid && !p.barbarian && p.alive && relation(state, pid, p.id).alliance).map((p) => p.id);
}

/** Feindlich: Krieg oder Plünderer. Eigene Einheiten sind nie feindlich. */
export function isHostile(state: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  if (state.players[a]?.barbarian || state.players[b]?.barbarian) return true;
  return relation(state, a, b).war;
}

/** Darf `mover` Gebiet von `owner` betreten? (Krieg oder offene Grenzen oder eigenes/freies Gebiet) */
export function mayEnterTerritory(state: GameState, mover: number, owner: number): boolean {
  if (owner < 0 || owner === mover) return true;
  if (state.players[mover]?.barbarian || state.players[owner]?.barbarian) return true;
  const r = relation(state, mover, owner);
  return r.war || r.openBorders;
}

function remember(state: GameState, from: number, to: number, delta: number): void {
  const k = `${from}:${to}`;
  state.diplomacy.memory[k] = Math.max(-8, Math.min(8, (state.diplomacy.memory[k] ?? 0) + delta));
}

/** Haltung von `from` gegenüber `to` (−10 … +10). */
export function attitude(state: GameState, from: number, to: number): number {
  const r = relation(state, from, to);
  let v = state.diplomacy.memory[`${from}:${to}`] ?? 0;
  if (r.war) v -= 4;
  else v += Math.min(3, Math.floor((state.turn - r.since) / 15));
  if (r.openBorders) v += 2;
  if (r.alliance) v += 2;
  v += religionAttitude(state, from, to);
  const persona = state.players[from].persona;
  if (persona) v -= Math.round(persona.aggression * 2);
  return Math.max(-10, Math.min(10, v));
}

export function attitudeLabel(v: number): string {
  return v >= 5 ? 'freundlich' : v >= 2 ? 'wohlwollend' : v > -2 ? 'neutral' : v > -5 ? 'misstrauisch' : 'feindselig';
}

function name(p: Player): string {
  return p.human ? 'Du' : p.name;
}

function civs(state: GameState): Player[] {
  return state.players.filter((p) => !p.barbarian && p.alive);
}

/** Kontakt prüfen (nach der Sichtberechnung). */
export function updateContacts(state: GameState, events: TurnEvent[]): void {
  const list = civs(state);
  for (const a of list) {
    for (const b of list) {
      if (a.id >= b.id) continue;
      const r = relation(state, a.id, b.id);
      if (r.met) continue;
      const sees = (x: Player, y: Player) =>
        state.units.some((u) => u.owner === y.id && x.visible[u.tile]) ||
        state.cities.some((c) => c.owner === y.id && x.visible[c.tile]) ||
        state.tileOwner.some((o, i) => o === y.id && x.visible[i] === 1);
      if (sees(a, b) || sees(b, a)) {
        r.met = true;
        r.since = state.turn;
        events.push({ player: a.id, text: `Erstkontakt: ${name(b)}${b.persona ? ` (${b.persona.leader})` : ''}`, tile: -1 });
        events.push({ player: b.id, text: `Erstkontakt: ${name(a)}${a.persona ? ` (${a.persona.leader})` : ''}`, tile: -1 });
      }
    }
  }
}

export function declareWar(state: GameState, a: number, b: number, events: TurnEvent[]): void {
  const r = relation(state, a, b);
  if (r.war || !r.met) return;
  r.war = true;
  r.openBorders = false;
  r.since = state.turn;
  r.aggressor = a;
  remember(state, b, a, -4);
  for (const p of civs(state)) {
    if (p.id === a || p.id === b) continue;
    // Dritte sehen den Angreifer kritisch, wenn sie den Angegriffenen kennen und mögen.
    if (relation(state, p.id, b).met && attitude(state, p.id, b) > 1) remember(state, p.id, a, -1);
  }
  const an = state.players[a];
  const bn = state.players[b];
  const text = an.human ? `Du erklärst ${bn.name} den Krieg!` : bn.human ? `${an.name} erklärt dir den Krieg!` : `${an.name} erklärt ${bn.name} den Krieg!`;
  for (const p of [a, b]) events.push({ player: p, text, tile: -1 });
  // Bündnisfall: Verbündete des Angegriffenen treten an seine Seite (nicht umgekehrt – reines Verteidigungsbündnis).
  for (const ally of alliesOf(state, b)) {
    if (ally === a) continue;
    const ra = relation(state, ally, a);
    if (ra.war) continue;
    ra.met = true;
    ra.war = true;
    ra.openBorders = false;
    ra.alliance = false;
    ra.since = state.turn;
    ra.aggressor = a;
    const t = `${name(state.players[ally])} ${state.players[ally].human ? 'trittst' : 'tritt'} als Verbündete${state.players[ally].human ? 'r' : ''} von ${name(bn)} gegen ${name(an)} in den Krieg ein`;
    for (const p of [ally, a, b]) events.push({ player: p, text: t, tile: -1 });
  }
}

/** Bündnis kündigen: Der Partner nimmt es übel. */
export function cancelAlliance(state: GameState, a: number, b: number, events: TurnEvent[]): void {
  const r = relation(state, a, b);
  if (!r.alliance) return;
  r.alliance = false;
  remember(state, b, a, -3);
  for (const p of [a, b]) events.push({ player: p, text: `${name(state.players[a])} kündigt das Bündnis mit ${name(state.players[b])}`, tile: -1 });
}

/** Frieden schließen: fremde Truppen verlassen das jeweilige Gebiet (zur nächsten eigenen Stadt). */
export function makePeace(state: GameState, a: number, b: number, events: TurnEvent[]): void {
  const r = relation(state, a, b);
  if (!r.war) return;
  r.war = false;
  r.since = state.turn;
  for (const [x, y] of [[a, b], [b, a]]) {
    const home = state.cities.filter((c) => c.owner === x);
    for (const u of state.units) {
      if (u.owner !== x || state.tileOwner[u.tile] !== y || u.carriedBy) continue;
      const target = home.sort((p, q) => Math.abs(p.tile - u.tile) - Math.abs(q.tile - u.tile))[0];
      if (target) {
        u.tile = target.tile;
        u.path = null;
        u.orders = 0;
      }
    }
  }
  for (const p of [a, b]) events.push({ player: p, text: `Frieden zwischen ${name(state.players[a])} und ${name(state.players[b])}`, tile: -1 });
}

/** KI macht ein Angebot: an Menschen als offenes Angebot, an KIs direkt (mit Reaktion auf Ablehnung). */
function offer(state: GameState, a: Player, b: Player, p: Proposal, events: TurnEvent[]): void {
  if (b.human) {
    if (state.diplomacy.pending.some((x) => x.from === a.id && x.to === b.id)) return;
    state.diplomacy.pending.push({ id: state.diplomacy.nextProposalId++, from: a.id, to: b.id, proposal: p, turn: state.turn });
    const what = p.kind === 'alliance' ? 'bietet dir ein Bündnis an' : p.kind === 'demand' ? 'stellt eine Forderung' : 'macht dir ein Angebot';
    events.push({ player: b.id, text: `${a.name} ${what} (🤝 Diplomatie)`, tile: -1 });
    return;
  }
  if (evaluate(state, b.id, a.id, p).accept) execute(state, a.id, b.id, p, events);
  else if (p.kind === 'demand') refusedDemand(state, a.id, b.id, events);
}

/** Abgelehnte Forderung: Kriegerische Herrscher greifen dann eher zu den Waffen. */
export function refusedDemand(state: GameState, demander: number, target: number, events: TurnEvent[]): void {
  remember(state, demander, target, -2);
  const persona = state.players[demander].persona;
  if (persona && state.rng.next() < persona.aggression * 0.6) declareWar(state, demander, target, events);
}

/** Was eine KI von einem Schwächeren fordert: eine Technologie, sonst Gold. */
function demandFor(state: GameState, from: number, to: number): Proposal | null {
  const tech = TECHS.map((_, id) => id).find((id) => canGive(state, to, from, { kind: 'tech', tech: id }));
  if (tech !== undefined) return { kind: 'demand', get: [{ kind: 'tech', tech }] };
  const gold = Math.min(150, Math.floor(state.players[to].gold * 0.5));
  return gold >= 30 ? { kind: 'demand', get: [{ kind: 'gold', amount: gold - (gold % 5) }] } : null;
}

// --- Bewertung von Angeboten durch die KI ---------------------------------------------

function itemValue(state: GameState, receiver: number, item: TradeItem): number {
  if (item.kind === 'gold') return item.amount;
  return state.players[receiver].techs[item.tech] ? 0 : techCost(item.tech) * 1.2;
}

export function canGive(state: GameState, giver: number, receiver: number, item: TradeItem): boolean {
  if (item.kind === 'gold') return item.amount > 0 && state.players[giver].gold >= item.amount;
  const g = state.players[giver];
  const r = state.players[receiver];
  return g.techs[item.tech] === 1 && !r.techs[item.tech] && TECHS[item.tech].prereqs.every((p) => r.techs[p]);
}

/** Militärische Stärke (Summe der Kampfkraft). */
export function militaryPower(state: GameState, pid: number): number {
  let sum = 0;
  for (const u of state.units) {
    if (u.owner !== pid) continue;
    const t = UNIT_TYPES[u.type];
    sum += (t.strength + t.ranged * 0.8) * (u.hp / 100) * (1 + u.promotions.length * 0.15);
  }
  return sum + state.cities.filter((c) => c.owner === pid).length * 0.5;
}

/** Nimmt die KI (`ai`) das Angebot von `from` an? Gibt Begründung zurück. */
export function evaluate(state: GameState, ai: number, from: number, p: Proposal): { accept: boolean; reason: string } {
  const r = relation(state, ai, from);
  const att = attitude(state, ai, from);
  const persona = state.players[ai].persona;
  if (p.kind === 'peace') {
    if (!r.war) return { accept: false, reason: 'Wir sind nicht im Krieg.' };
    if (state.turn - r.since < 6) return { accept: false, reason: 'Der Krieg hat gerade erst begonnen.' };
    const ratio = militaryPower(state, ai) / Math.max(1, militaryPower(state, from));
    const want = ratio < 1.2 || state.turn - r.since > 25 || att > -3;
    return want ? { accept: true, reason: 'Frieden liegt in unser beider Interesse.' } : { accept: false, reason: 'Wir sind im Vorteil.' };
  }
  if (p.kind === 'openBorders') {
    if (r.war) return { accept: false, reason: 'Nicht während eines Krieges.' };
    return att >= 1 || (persona && persona.aggression < 0.4)
      ? { accept: true, reason: 'Unsere Händler werden sich freuen.' }
      : { accept: false, reason: 'Wir trauen euch noch nicht.' };
  }
  if (p.kind === 'alliance') {
    if (r.war) return { accept: false, reason: 'Wir sind im Krieg miteinander.' };
    if (!r.openBorders) return { accept: false, reason: 'Erst offene Grenzen, dann sprechen wir über ein Bündnis.' };
    if (r.alliance) return { accept: false, reason: 'Wir sind bereits verbündet.' };
    const shared = commonEnemy(state, ai, from);
    return att >= 4 || (att >= 2 && shared)
      ? { accept: true, reason: shared ? 'Gemeinsam gegen unsere Feinde!' : 'Auf eine lange Freundschaft.' }
      : { accept: false, reason: 'So gut kennen wir uns noch nicht.' };
  }
  if (p.kind === 'demand') {
    if (r.war) return { accept: false, reason: 'Wir verhandeln nicht mit Feinden.' };
    for (const i of p.get) if (!canGive(state, ai, from, i)) return { accept: false, reason: 'Das haben wir nicht.' };
    const ratio = militaryPower(state, from) / Math.max(1, militaryPower(state, ai));
    const pride = persona ? persona.aggression : 0.5;
    const value = p.get.reduce((s, i) => s + itemValue(state, from, i), 0);
    const affordable = value <= Math.max(60, state.players[ai].gold * 0.6 + 80);
    return ratio >= 1.5 + pride && affordable && att > -6
      ? { accept: true, reason: 'Wir beugen uns – diesmal.' }
      : { accept: false, reason: ratio >= 1.5 ? 'Erpressen lassen wir uns nicht!' : 'Wofür hältst du dich?' };
  }
  if (r.war) return { accept: false, reason: 'Mit Feinden handeln wir nicht.' };
  for (const i of p.give) if (!canGive(state, from, ai, i)) return { accept: false, reason: 'Das könnt ihr nicht liefern.' };
  for (const i of p.get) if (!canGive(state, ai, from, i)) return { accept: false, reason: 'Das können wir nicht liefern.' };
  const gain = p.give.reduce((s, i) => s + itemValue(state, ai, i), 0);
  if (att <= -6) return { accept: false, reason: 'Mit euch machen wir keine Geschäfte.' };
  // Aufschlag je nach Haltung: Freunde sind großzügig, Misstrauische verlangen mehr.
  const margin = att >= 3 ? 0.9 : att >= -2 ? 1 : 1.3;
  const loss = p.get.reduce((s, i) => s + itemValue(state, from, i), 0) * margin;
  return gain >= loss ? { accept: true, reason: 'Ein fairer Handel.' } : { accept: false, reason: 'Das ist uns zu wenig.' };
}

function transferItem(state: GameState, giver: number, receiver: number, item: TradeItem): void {
  if (item.kind === 'gold') {
    state.players[giver].gold -= item.amount;
    state.players[receiver].gold += item.amount;
  } else {
    state.players[receiver].techs[item.tech] = 1;
  }
}

/** Haben zwei Völker einen gemeinsamen Kriegsgegner? */
function commonEnemy(state: GameState, a: number, b: number): boolean {
  return civs(state).some((c) => c.id !== a && c.id !== b && relation(state, a, c.id).war && relation(state, b, c.id).war);
}

/** Angebot ausführen (beide Seiten haben zugestimmt). */
export function execute(state: GameState, from: number, to: number, p: Proposal, events: TurnEvent[]): void {
  if (p.kind === 'peace') {
    makePeace(state, from, to, events);
    return;
  }
  const r = relation(state, from, to);
  if (p.kind === 'alliance') {
    r.alliance = true;
    r.openBorders = true;
    for (const x of [from, to]) events.push({ player: x, text: `Bündnis zwischen ${name(state.players[from])} und ${name(state.players[to])} – gemeinsame Sicht, Beistand bei Angriffen`, tile: -1 });
    return;
  }
  if (p.kind === 'demand') {
    for (const i of p.get) transferItem(state, to, from, i);
    remember(state, to, from, -2);
    for (const x of [from, to]) events.push({ player: x, text: `${name(state.players[to])} ${state.players[to].human ? 'erfüllst' : 'erfüllt'} die Forderung von ${name(state.players[from])}`, tile: -1 });
    return;
  }
  if (p.kind === 'openBorders') {
    r.openBorders = true;
    for (const x of [from, to]) events.push({ player: x, text: `Offene Grenzen zwischen ${name(state.players[from])} und ${name(state.players[to])}`, tile: -1 });
    return;
  }
  for (const i of p.give) transferItem(state, from, to, i);
  for (const i of p.get) transferItem(state, to, from, i);
  remember(state, to, from, 1);
  remember(state, from, to, 1);
  for (const x of [from, to]) events.push({ player: x, text: `Handel zwischen ${name(state.players[from])} und ${name(state.players[to])} abgeschlossen`, tile: -1 });
}

/** Diplomatische Züge der KI am Rundenende. */
export function aiDiplomacy(state: GameState, events: TurnEvent[]): void {
  const list = civs(state);
  for (const a of list) {
    if (a.human || !a.persona) continue;
    for (const b of list) {
      if (a.id === b.id) continue;
      const r = relation(state, a.id, b.id);
      if (!r.met) continue;
      const myPower = militaryPower(state, a.id);
      const theirPower = militaryPower(state, b.id);
      const att = attitude(state, a.id, b.id);
      if (!r.war) {
        // Krieg erklären?
        const tactics = AI_TACTICS[state.options.difficulty ?? 'normal'];
        const ready = state.turn > tactics.warTurn && state.turn - r.since > 15 && myPower > theirPower * (1.6 - a.persona.aggression * 0.6);
        // Wer kurz vor dem Sieg steht, wird gemeinsam bekämpft – auch von friedlichen Herrschern.
        const threat = state.turn > tactics.warTurn && nearVictory(state, b.id) && myPower > theirPower * 0.6;
        if (r.alliance) {
          // Bündnis halten, solange die Haltung stimmt; sonst kündigen.
          if ((att < 1 || (threat && state.rng.next() < 0.3)) && state.rng.next() < 0.3) cancelAlliance(state, a.id, b.id, events);
          continue;
        }
        if (threat && state.rng.next() < 0.3) declareWar(state, a.id, b.id, events);
        else if (ready && att < 2 && state.rng.next() < a.persona.aggression * 0.06) declareWar(state, a.id, b.id, events);
        // Bündnis anbieten (Freunde oder gemeinsamer Feind)
        else if (r.openBorders && (att >= 4 || (att >= 2 && commonEnemy(state, a.id, b.id))) && state.rng.next() < 0.05) {
          offer(state, a, b, { kind: 'alliance' }, events);
        }
        // Forderung an deutlich Schwächere (kriegerische Herrscher)
        else if (state.turn > tactics.warTurn && a.persona.aggression > 0.6 && myPower > theirPower * 2 && state.rng.next() < 0.02) {
          const demand = demandFor(state, a.id, b.id);
          if (demand) offer(state, a, b, demand, events);
        }
        // Offene Grenzen mit Freunden
        else if (!r.openBorders && att >= 3 && !b.human && state.rng.next() < 0.05 && evaluate(state, b.id, a.id, { kind: 'openBorders' }).accept) {
          execute(state, a.id, b.id, { kind: 'openBorders' }, events);
        }
      } else if (state.turn - r.since >= 10 && !nearVictory(state, b.id) && (myPower < theirPower * 0.9 || state.turn - r.since > 30) && state.rng.next() < 0.25) {
        // Frieden anbieten
        if (b.human) {
          if (!state.diplomacy.pending.some((p) => p.from === a.id && p.to === b.id)) {
            state.diplomacy.pending.push({ id: state.diplomacy.nextProposalId++, from: a.id, to: b.id, proposal: { kind: 'peace' }, turn: state.turn });
            events.push({ player: b.id, text: `${a.name} bietet Frieden an (🤝 Diplomatie)`, tile: -1 });
          }
        } else if (evaluate(state, b.id, a.id, { kind: 'peace' }).accept) {
          makePeace(state, a.id, b.id, events);
        }
      }
    }
  }
  // Unbeantwortete Angebote verfallen nach 5 Runden; Friedensangebote auch, wenn kein Krieg mehr herrscht.
  state.diplomacy.pending = state.diplomacy.pending.filter(
    (p) => state.turn - p.turn <= 5 && (p.proposal.kind !== 'peace' || relation(state, p.from, p.to).war),
  );
}
