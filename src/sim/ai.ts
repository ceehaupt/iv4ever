import { availableItems, type BuildItem, type City, cityAt, cityReport, foundingBlocker, playerContext, type PlayerContext } from './city';
import { predictCombat } from './combat';
import { economy, type GameState, Orders, type Player, ROUTE_MIN_DISTANCE, ROUTES_PER_CITY, type Unit } from './game';
import { isMilitary, landmasses, moveTo, type Out, power, run } from './aiCommon';
import { navalTurn } from './aiNaval';
import { forEachNeighbor, tileDistance, tilesAround } from './hex';
import { siteScore } from './gen/starts';
import { findPath, landCost } from './path';
import { BUILDINGS, BuildingId } from './rules/buildings';
import { AI_TACTICS, type Persona, type Tactics } from './rules/leaders';
import { nearVictory } from './victory';
import { isWater, Relief } from './rules/terrain';
import { TECHS, TechId } from './rules/techs';
import { isNaval, MOVE_SCALE, promotionChoices, UNIT_TYPES, UnitTypeId } from './rules/units';
import { cityDefenseAt, fighterOf } from './war';
import { ALL_JOBS, jobBlocker } from './work';
import { isHostile, mayEnterTerritory } from './diplomacy';
import { RESOURCES } from './rules/resources';
import { RESOURCE_IMPROVEMENT, improvementForJob } from './rules/improvements';
import { DOCTRINES } from './rules/doctrines';

/**
 * Computerspieler. Nutzt dieselbe Befehlsschnittstelle wie der Mensch (alle Regeln werden geprüft)
 * und arbeitet mit vollständigem eigenem Wissen, aber ohne Schummelsicht: Ziele müssen erkundet sein.
 * Schwierigkeit wirkt über Ertragsboni (siehe city.ts), nicht über Sonderrechte.
 */

/** Feindschaft kommt aus der Diplomatie (Krieg bzw. Plünderer). */
let hostile = (_a: number, _b: number) => true;

// --- Forschung ---------------------------------------------------------------------

const T = TechId;
const RESEARCH_BASE: number[] = [T.Agriculture, T.Mining, T.Wheel, T.Pottery, T.BronzeWorking, T.Writing, T.Mysticism, T.AnimalHusbandry,
  T.Hunting, T.Masonry, T.Calendar, T.Currency, T.IronWorking, T.Mathematics, T.Fishing, T.Sailing, T.Philosophy, T.Law];
const RESEARCH_WAR: number[] = [T.BronzeWorking, T.Hunting, T.AnimalHusbandry, T.IronWorking, T.Mathematics, T.Architecture, T.Feudalism,
  T.Fortification];
const RESEARCH_SCIENCE: number[] = [T.Writing, T.Currency, T.Philosophy, T.Astronomy, T.Scholarship, T.Banking];

function chooseResearch(state: GameState, p: Player, out: Out): void {
  if (p.goal >= 0 && !p.techs[p.goal]) return;
  const persona = p.persona!;
  // Ab dem mittleren Spiel steuern forschungsorientierte Herrscher den Projektsieg an (Voraussetzungen kommen automatisch).
  const known = p.techs.reduce((a, b) => a + b, 0);
  if (persona.science >= 0.5 && known >= TECHS.length * 0.55 && !p.techs[T.Spaceflight]) {
    run(state, p.id, { type: 'research', tech: T.Spaceflight }, out);
    return;
  }
  const lists = [RESEARCH_BASE];
  if (persona.aggression > 0.6) lists.unshift(RESEARCH_WAR);
  if (persona.science > 0.6) lists.unshift(RESEARCH_SCIENCE);
  for (const list of lists) {
    const t = list.find((id) => !p.techs[id]);
    if (t !== undefined) {
      run(state, p.id, { type: 'research', tech: t }, out);
      return;
    }
  }
  // Alles aus den Listen bekannt: günstigste noch unbekannte Technologie.
  const rest = TECHS.map((t, id) => ({ t, id })).filter(({ id }) => !p.techs[id]).sort((a, b) => a.t.tier - b.t.tier);
  if (rest.length) run(state, p.id, { type: 'research', tech: rest[0].id }, out);
}

// --- Städte ------------------------------------------------------------------------

interface Situation {
  cities: City[];
  military: Unit[];
  workers: number;
  settlers: number;
  queuedSettlers: number;
  queuedWorkers: number;
  merchants: number;
  queuedMerchants: number;
  enemiesNear: (tile: number, radius: number) => number;
}

function situation(state: GameState, pid: number): Situation {
  const own = state.units.filter((u) => u.owner === pid);
  const cities = state.cities.filter((c) => c.owner === pid);
  const enemyUnits = state.units.filter((u) => u.owner !== pid && isMilitary(u.type) && state.players[pid].visible[u.tile]);
  return {
    cities,
    military: own.filter((u) => isMilitary(u.type)),
    workers: own.filter((u) => u.type === UnitTypeId.Worker).length,
    settlers: own.filter((u) => u.type === UnitTypeId.Settler).length,
    queuedSettlers: cities.filter((c) => c.queue.some((q) => q.kind === 'unit' && q.id === UnitTypeId.Settler)).length,
    queuedWorkers: cities.filter((c) => c.queue.some((q) => q.kind === 'unit' && q.id === UnitTypeId.Worker)).length,
    merchants: own.filter((u) => UNIT_TYPES[u.type].trade).length,
    queuedMerchants: cities.filter((c) => c.queue.some((q) => q.kind === 'unit' && UNIT_TYPES[q.id].trade)).length,
    enemiesNear: (tile, radius) =>
      enemyUnits.filter((u) => hostile(pid, u.owner) && tileDistance(state.map, u.tile, tile) <= radius).length,
  };
}

function defendersIn(state: GameState, c: City): number {
  return state.units.filter((u) => u.owner === c.owner && u.tile === c.tile && isMilitary(u.type)).length;
}

function defendersNeeded(_state: GameState, c: City, sit: Situation): number {
  const capital = c.buildings.includes(BuildingId.Palace);
  return 1 + (capital ? 1 : 0) + (sit.enemiesNear(c.tile, 5) > 0 ? 1 : 0) + (c.size >= 8 ? 1 : 0);
}

function bestUnit(items: BuildItem[], score: (type: number) => number): BuildItem | null {
  let best: BuildItem | null = null;
  let bestScore = -Infinity;
  for (const i of items) {
    if (i.kind !== 'unit') continue;
    const s = score(i.id);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

/** Gebäudewert aus Sicht der KI. */
function buildingValue(id: number, c: City, persona: Persona, ctx: PlayerContext, state: GameState): number {
  const b = BUILDINGS[id];
  const rep = { size: c.size };
  let v = 0;
  v += b.culture * (1 + persona.builder) * (c.culture < 15 ? 3 : 1);
  v += b.mood * (rep.size >= 4 ? 3 : 1);
  v += b.supply * (rep.size >= 4 ? 2.5 : 0.5);
  v += (b.researchPct ?? 0) * 0.08 * (1 + persona.science) * Math.max(1, c.size / 3);
  v += (b.goldPct ?? 0) * 0.06 * Math.max(1, c.size / 3);
  v += (b.prodPct ?? 0) * 0.1 * Math.max(1, c.size / 3);
  v += b.keepFood * 10;
  v += b.defense * 0.04 * (1 + persona.aggression);
  if (b.wonder) v = v * 0.6 + persona.builder * 10 + (state.rng.next() < 0.3 ? 4 : 0);
  if (b.noUpkeep) v += ctx.connected.size > 3 ? 5 : 1;
  if (b.project) v += 40 * (0.5 + persona.science);
  return v / Math.max(20, b.cost) * 40;
}

function chooseBuild(state: GameState, c: City, persona: Persona, sit: Situation, ctx: PlayerContext): BuildItem | null {
  const items = availableItems(state, c, ctx);
  const landMil = (type: number) => isMilitary(type) ? 1 : 0;
  // 1. Verteidigung
  if (defendersIn(state, c) < defendersNeeded(state, c, sit)) {
    const u = bestUnit(items, (t) => landMil(t) ? UNIT_TYPES[t].strength + (UNIT_TYPES[t].cityDefense ?? 0) / 25 - UNIT_TYPES[t].cost / 100 : -Infinity);
    if (u) return u;
  }
  // 2. Siedler, solange es Platz gibt
  const target = Math.round(3 + 7 * persona.expansion);
  if (c.size >= 2 && sit.cities.length + sit.settlers + sit.queuedSettlers < target && sit.settlers + sit.queuedSettlers < 2 &&
    sit.enemiesNear(c.tile, 4) === 0) {
    const s = items.find((i) => i.kind === 'unit' && i.id === UnitTypeId.Settler);
    if (s) return s;
  }
  // 3. Arbeiter
  if (sit.workers + sit.queuedWorkers < Math.ceil(sit.cities.length * 0.8)) {
    const w = items.find((i) => i.kind === 'unit' && i.id === UnitTypeId.Worker);
    if (w) return w;
  }
  // 4a. Händler, solange Routenplätze frei sind (einer gleichzeitig unterwegs)
  if (sit.cities.length >= 2 && sit.merchants + sit.queuedMerchants === 0 && freeRouteSlots(state, c.owner) > 0 &&
    state.rng.next() < 0.25 + persona.builder * 0.25) {
    const m = items.find((i) => i.kind === 'unit' && UNIT_TYPES[i.id].trade);
    if (m) return m;
  }
  // 4. Militär für Angriffe bei kriegerischen Herrschern
  const tactics = AI_TACTICS[state.options.difficulty ?? 'normal'];
  const threatened = state.players.some((o) => o.id !== c.owner && o.alive && !o.barbarian && hostile(c.owner, o.id) && nearVictory(state, o.id));
  const wantArmy = Math.round(sit.cities.length * (1 + 2 * persona.aggression) * tactics.armyFactor * (threatened ? 1.5 : 1));
  if (sit.military.length < wantArmy && state.rng.next() < 0.35 + persona.aggression * 0.4) {
    const u = bestUnit(items, (t) => landMil(t) ? power(t) * (UNIT_TYPES[t].cls === 'mounted' ? 1.2 : 1) - UNIT_TYPES[t].cost / 60 : -Infinity);
    if (u) return u;
  }
  // 4b. Großprojekt: Teile in der produktivsten Stadt (je Teil nur eine Stadt gleichzeitig)
  const project = items.find((i) => i.kind === 'building' && BUILDINGS[i.id].project &&
    !sit.cities.some((o) => o !== c && o.queue.some((q) => q.kind === 'building' && q.id === i.id)));
  if (project && c === [...sit.cities].sort((a, b) => cityReport(state, b, ctx).yields.prod - cityReport(state, a, ctx).yields.prod)[0]) return project;
  // 5. Bestes Gebäude
  let best: BuildItem | null = null;
  let bestV = 0.5;
  for (const i of items) {
    if (i.kind !== 'building') continue;
    const v = buildingValue(i.id, c, persona, ctx, state);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  if (best) return best;
  return bestUnit(items, (t) => landMil(t) ? power(t) : -Infinity);
}

function manageCities(state: GameState, p: Player, sit: Situation, out: Out): void {
  const ctx = playerContext(state, p.id);
  for (const c of sit.cities) {
    if (c.queue.length) continue;
    const item = chooseBuild(state, c, p.persona!, sit, ctx);
    if (item) {
      run(state, p.id, { type: 'build', city: c.id, item, append: false }, out);
      if (item.kind === 'unit' && item.id === UnitTypeId.Settler) sit.queuedSettlers++;
      if (item.kind === 'unit' && item.id === UnitTypeId.Worker) sit.queuedWorkers++;
      if (item.kind === 'unit' && UNIT_TYPES[item.id].trade) sit.queuedMerchants++;
    }
  }
  // Steuersatz: nur bei negativem Saldo und knapper Kasse senken, bei vollem Schatz anheben.
  const e = economy(state, p.id);
  if (e.net < 0 && p.gold + e.net * 5 < 0 && p.rate > 20) run(state, p.id, { type: 'setRate', rate: p.rate - 10 }, out);
  else if ((p.gold > 120 || e.net > 4) && p.rate < 80) run(state, p.id, { type: 'setRate', rate: p.rate + 10 }, out);
}

// --- Einheiten ---------------------------------------------------------------------

function knownLandCost(state: GameState, pid: number) {
  const p = state.players[pid];
  const occupied = new Set<number>();
  for (const u of state.units) if (u.owner !== pid && p.visible[u.tile]) occupied.add(u.tile);
  for (const c of state.cities) if (c.owner !== pid) occupied.add(c.tile);
  return landCost(state.map, (i) => p.explored[i] === 1, (i) => occupied.has(i) || !mayEnterTerritory(state, pid, state.tileOwner[i]));
}

/** Liefert true, wenn der Siedler an Land keinen Bauplatz erreicht (dann übernimmt die Seefahrt, aiNaval.ts). */
function settle(state: GameState, u: Unit, out: Out, claimed: Set<number>, mass: Int32Array): boolean {
  // Ziel auf einer anderen Landmasse (von der Seefahrt geplant): hier nichts tun.
  if (u.aiTarget !== undefined && mass[u.aiTarget] !== mass[u.tile] && !foundingBlocker(state, u.owner, u.aiTarget)) return true;
  if (u.orders === Orders.Goto && u.aiTarget !== undefined && !foundingBlocker(state, u.owner, u.aiTarget)) return false;
  if (u.aiTarget === undefined || foundingBlocker(state, u.owner, u.aiTarget)) {
    const p = state.players[u.owner];
    const cost = knownLandCost(state, u.owner);
    let best = -1;
    let bestScore = -Infinity;
    for (const t of tilesAround(state.map, u.tile, 9)) {
      // Nur die eigene Landmasse – andere Inseln übernimmt die Seefahrt.
      if (!p.explored[t] || mass[t] !== mass[u.tile] || claimed.has(t) || foundingBlocker(state, u.owner, t)) continue;
      const d = tileDistance(state.map, u.tile, t);
      const score = siteScore(state.map, t) - d * 3;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (best < 0) {
      if (u.orders === Orders.None) run(state, u.owner, { type: 'fortify', unit: u.id }, out);
      return true;
    }
    if (best !== u.tile && !findPath({ map: state.map, from: u.tile, to: best, maxMoves: MOVE_SCALE, movesLeft: u.moves, cost, limit: 2500 })) {
      claimed.add(best);
      return false;
    }
    u.aiTarget = best;
  }
  claimed.add(u.aiTarget);
  if (u.tile === u.aiTarget) {
    run(state, u.owner, { type: 'found', unit: u.id }, out);
    return false;
  }
  if (!moveTo(state, u, u.aiTarget, out)) u.aiTarget = undefined;
  else if (u.tile === u.aiTarget && u.moves > 0) run(state, u.owner, { type: 'found', unit: u.id }, out);
  return false;
}

// --- Händler -----------------------------------------------------------------------

/** Freie Routenplätze der eigenen Städte. */
function freeRouteSlots(state: GameState, pid: number): number {
  return state.cities.filter((c) => c.owner === pid).reduce((n, c) => n + Math.max(0, ROUTES_PER_CITY - state.routes.filter((r) => r.from === c.id).length), 0);
}

/** Händler: lohnendste erreichbare Stadt suchen (Entfernung, Ausland), dort die Route errichten. */
function trade(state: GameState, u: Unit, out: Out): void {
  const pid = u.owner;
  const p = state.players[pid];
  if (run(state, pid, { type: 'establishRoute', unit: u.id }, out)) return;
  if (u.orders === Orders.Goto && u.aiTarget !== undefined) return;
  const own = state.cities.filter((c) => c.owner === pid);
  const candidates = state.cities
    .filter((c) => p.explored[c.tile] && !hostile(pid, c.owner) && c.tile !== u.tile)
    .map((c) => {
      const home = own.filter((h) => h.id !== c.id).sort((a, b) => tileDistance(state.map, a.tile, c.tile) - tileDistance(state.map, b.tile, c.tile))[0];
      if (!home) return null;
      const d = tileDistance(state.map, home.tile, c.tile);
      if (d < ROUTE_MIN_DISTANCE) return null;
      if (state.routes.filter((r) => r.from === home.id).length >= 2 || state.routes.some((r) => r.from === home.id && r.to === c.id)) return null;
      return { c, v: 2 + Math.floor(d / 8) + (c.owner !== pid ? 1 : 0) - tileDistance(state.map, u.tile, c.tile) / 6 };
    })
    .filter((x): x is { c: City; v: number } => x !== null)
    .sort((a, b) => b.v - a.v);
  for (const { c } of candidates.slice(0, 4)) {
    // Eigene Städte betreten, an fremde Städte nur heran (Nachbarfeld).
    const dest = c.owner === pid ? c.tile : tilesAround(state.map, c.tile, 1)
      .filter((t) => t !== c.tile && !isWater(state.map.terrain[t]) && state.map.relief[t] !== Relief.Mountain && !state.units.some((o) => o.tile === t && o.owner !== pid))
      .sort((a, b) => tileDistance(state.map, u.tile, a) - tileDistance(state.map, u.tile, b))[0];
    if (dest === undefined) continue;
    if (moveTo(state, u, dest, out)) {
      u.aiTarget = dest;
      if (u.tile === dest) run(state, pid, { type: 'establishRoute', unit: u.id }, out);
      return;
    }
  }
  run(state, pid, { type: 'fortify', unit: u.id }, out);
}

/** Straßenfelder, die Städte mit der Hauptstadt verbinden würden. */
function desiredRoads(state: GameState, pid: number): Set<number> {
  const out = new Set<number>();
  const cities = state.cities.filter((c) => c.owner === pid);
  const capital = cities.find((c) => c.buildings.includes(BuildingId.Palace));
  if (!capital) return out;
  const ctx = playerContext(state, pid);
  const cost = landCost(state.map, () => true, (i) => state.tileOwner[i] >= 0 && state.tileOwner[i] !== pid);
  for (const c of cities) {
    if (c === capital || ctx.connected.has(c.id)) continue;
    const path = findPath({ map: state.map, from: c.tile, to: capital.tile, maxMoves: MOVE_SCALE, movesLeft: MOVE_SCALE, cost, limit: 2500 });
    if (path) for (const t of path.tiles) if (!state.map.road[t]) out.add(t);
  }
  return out;
}

function work(state: GameState, u: Unit, out: Out, roads: Set<number>, claimed: Set<number>): void {
  if (u.orders === Orders.Work || (u.orders === Orders.Goto && u.aiTarget !== undefined)) return;
  const pid = u.owner;
  const p = state.players[pid];
  const knows = (t: number) => p.techs[t] === 1;
  let best: { tile: number; job: (typeof ALL_JOBS)[number]; v: number } | null = null;
  for (const t of tilesAround(state.map, u.tile, 6)) {
    if (claimed.has(t)) continue;
    const ownTile = state.tileOwner[t] === pid;
    if (!ownTile && !roads.has(t)) continue;
    const d = tileDistance(state.map, u.tile, t);
    const res = RESOURCES[state.map.resource[t]];
    for (const job of ALL_JOBS) {
      if (jobBlocker(state.map, state.tileOwner, pid, t, job, knows)) continue;
      let v = 0;
      if (job === 'road') v = roads.has(t) ? 5 : 0;
      else if (job === 'clear') v = 0;
      else {
        const imp = improvementForJob(job);
        if (res && RESOURCE_IMPROVEMENT[res.key] === imp) v = 8;
        else if (state.map.improvement[t]) v = 0;
        else if (job === 'farm') v = state.cities.some((c) => c.worked.includes(t)) ? 4 : 2.5;
        else if (job === 'mine') v = state.map.relief[t] === Relief.Hill ? 3 : 0;
        else if (job === 'lumbermill') v = 1.5;
      }
      v -= d * 0.6;
      if (v > 0 && (!best || v > best.v)) best = { tile: t, job, v };
    }
  }
  if (!best) {
    run(state, pid, { type: 'skip', unit: u.id }, out);
    return;
  }
  claimed.add(best.tile);
  if (u.tile !== best.tile) {
    u.aiTarget = best.tile;
    if (!moveTo(state, u, best.tile, out)) return;
  }
  if (u.tile === best.tile) {
    u.aiTarget = undefined;
    run(state, pid, { type: 'work', unit: u.id, job: best.job }, out);
  }
}

/** Nächstes Feld am Rand des Bekannten (für Späher). */
function frontier(state: GameState, u: Unit): number {
  const p = state.players[u.owner];
  const m = state.map;
  const seen = new Set([u.tile]);
  const queue = [u.tile];
  while (queue.length && seen.size < 1500) {
    const t = queue.shift()!;
    let edge = false;
    forEachNeighbor(m, t, (n) => {
      if (!p.explored[n]) edge = true;
    });
    if (edge && t !== u.tile) return t;
    forEachNeighbor(m, t, (n) => {
      if (seen.has(n) || !p.explored[n] || isWater(m.terrain[n]) || m.relief[n] === Relief.Mountain) return;
      seen.add(n);
      queue.push(n);
    });
  }
  return -1;
}

function explore(state: GameState, u: Unit, out: Out): void {
  if (u.orders === Orders.Goto) return;
  const t = frontier(state, u);
  if (t < 0 || !moveTo(state, u, t, out)) run(state, u.owner, { type: 'fortify', unit: u.id }, out);
}

function attackOdds(state: GameState, u: Unit, target: number): number {
  const defenders = state.units.filter((o) => o.tile === target && o.owner !== u.owner && UNIT_TYPES[o.type].strength > 0 && !isNaval(o.type));
  if (!defenders.length) return 1;
  const bf = { map: state.map, attackerTile: u.tile, defenderTile: target, cityDefense: cityDefenseAt(state, target) };
  const ranged = UNIT_TYPES[u.type].ranged > 0;
  let worst = 1;
  for (const d of defenders) {
    const pr = predictCombat(fighterOf(u), fighterOf(d), bf, ranged);
    const dealt = (pr.dmgDef[0] + pr.dmgDef[1]) / 2;
    const taken = (pr.dmgAtt[0] + pr.dmgAtt[1]) / 2;
    worst = Math.min(worst, ranged ? Math.min(1, dealt / 25) : Math.max(pr.win, taken < dealt * 0.6 && pr.loss < 0.1 ? 0.6 : 0));
  }
  return worst;
}

/** Feindliche Ziele, die die KI kennt: Einheiten (sichtbar), Städte und Lager (erkundet). */
function knownTargets(state: GameState, pid: number): number[] {
  const p = state.players[pid];
  const out = new Set<number>();
  for (const u of state.units) {
    if (u.owner !== pid && p.visible[u.tile] && hostile(pid, u.owner) && !isWater(state.map.terrain[u.tile])) out.add(u.tile);
  }
  for (const c of state.cities) if (c.owner !== pid && p.explored[c.tile] && hostile(pid, c.owner)) out.add(c.tile);
  for (const c of state.camps) if (p.explored[c.tile]) out.add(c.tile);
  return [...out];
}

/** Garnisonseinheiten (bleiben in der Stadt), je Stadt bis zum Bedarf. */
function garrisonOf(state: GameState, p: Player, sit: Situation): Set<number> {
  const g = new Set<number>();
  for (const c of sit.cities) {
    const inside = state.units.filter((u) => u.owner === p.id && u.tile === c.tile && isMilitary(u.type));
    for (const u of inside.slice(0, defendersNeeded(state, c, sit))) g.add(u.id);
  }
  return g;
}

/** Bereit für Angriffe auf fremde Städte (nicht nur Verteidigung)? */
function isOffensive(state: GameState, p: Player, sit: Situation): boolean {
  const threat = state.players.some((o) => o.id !== p.id && o.alive && !o.barbarian && hostile(p.id, o.id) && nearVictory(state, o.id));
  return (state.turn > 40 && (p.persona!.aggression > 0.5 || threat)) && sit.military.length >= sit.cities.length * 2 + 2;
}

function militaryTurn(state: GameState, p: Player, sit: Situation, out: Out, reserved: Set<number>, mass: Int32Array): void {
  const busy = new Set<number>(reserved);
  // 1. Garnisonen auffüllen
  for (const c of sit.cities) {
    const need = defendersNeeded(state, c, sit);
    // Vorhandene Verteidiger (bis zum Bedarf) bleiben befestigt in der Stadt.
    const inside = state.units.filter((u) => u.owner === p.id && u.tile === c.tile && isMilitary(u.type));
    for (const u of inside.slice(0, need)) {
      busy.add(u.id);
      if (u.orders !== Orders.Fortify) run(state, p.id, { type: 'fortify', unit: u.id }, out);
    }
    const have = inside.length;
    if (have >= need) continue;
    const free = sit.military
      .filter((u) => !busy.has(u.id) && state.units.includes(u) && u.tile !== c.tile)
      .sort((a, b) => tileDistance(state.map, a.tile, c.tile) - tileDistance(state.map, b.tile, c.tile));
    for (const u of free.slice(0, need - have)) {
      busy.add(u.id);
      u.aiTarget = c.tile;
      if (u.orders !== Orders.Goto) moveTo(state, u, c.tile, out);
    }
  }
  // 2. Übrige Einheiten: Bedrohungen und Lager in der Nähe; bei Offensive ein gemeinsamer Feldzug gegen eine Stadt.
  const tactics: Tactics = AI_TACTICS[state.options.difficulty ?? 'normal'];
  const targets = knownTargets(state, p.id);
  const homeTargets = targets.filter((t) => sit.cities.some((c) => tileDistance(state.map, c.tile, t) <= 8));
  const campaign = isOffensive(state, p, sit) ? campaignTarget(state, p, sit, mass) : -1;
  const staging = campaign >= 0
    ? sit.cities.filter((c) => mass[c.tile] === mass[campaign]).sort((a, b) => tileDistance(state.map, a.tile, campaign) - tileDistance(state.map, b.tile, campaign))[0]
    : undefined;
  // Fern- und Belagerungseinheiten zuerst, damit sie die Verteidiger schwächen.
  const free = sit.military
    .filter((u) => !busy.has(u.id) && state.units.includes(u) && u.moves > 0)
    .sort((a, b) => UNIT_TYPES[b.type].ranged - UNIT_TYPES[a.type].ranged);
  const army = staging ? free.filter((u) => mass[u.tile] === mass[campaign]) : [];
  const atFront = (u: Unit) => tileDistance(state.map, u.tile, campaign) <= 3;
  const gathered = army.filter((u) => staging && (tileDistance(state.map, u.tile, staging.tile) <= 1 || atFront(u))).length;
  const marching = army.length >= tactics.armySize && gathered >= tactics.armySize;
  for (const u of free) {
    if (!state.units.includes(u) || u.moves <= 0) continue;
    const inArmy = army.includes(u);
    const pool = inArmy && (marching || atFront(u)) ? [...homeTargets, ...targets.filter((t) => tileDistance(state.map, t, campaign) <= 2)] : homeTargets;
    // Angriff auf ein erreichbares Ziel?
    const inRange = pool
      .filter((t) => tileDistance(state.map, u.tile, t) <= Math.max(1, UNIT_TYPES[u.type].range))
      .sort((a, b) => attackOdds(state, u, b) - attackOdds(state, u, a));
    if (inRange.length && attackOdds(state, u, inRange[0]) >= tactics.attackOdds) {
      run(state, p.id, { type: 'attack', unit: u.id, target: inRange[0] }, out);
      continue;
    }
    let goal: number | undefined;
    if (inArmy && staging) {
      if (marching) goal = campaign;
      else if (!atFront(u) && tileDistance(state.map, u.tile, staging.tile) > 1) {
        // Sammeln in der Stadt, die dem Ziel am nächsten ist.
        moveTo(state, u, staging.tile, out);
        continue;
      } else {
        if (u.orders === Orders.None) run(state, p.id, { type: 'fortify', unit: u.id }, out);
        continue;
      }
    } else {
      goal = homeTargets.sort((a, b) => tileDistance(state.map, u.tile, a) - tileDistance(state.map, u.tile, b))[0];
    }
    if (goal === undefined) {
      if (u.orders === Orders.None) run(state, p.id, { type: 'fortify', unit: u.id }, out);
      continue;
    }
    // Neben das Ziel ziehen (Fernkämpfer bleiben auf Abstand).
    const keep = UNIT_TYPES[u.type].ranged > 0 ? Math.min(2, UNIT_TYPES[u.type].range) : 1;
    const next = tilesAround(state.map, goal, keep)
      .filter((t) => t !== goal && tileDistance(state.map, t, goal) === keep && !isWater(state.map.terrain[t]) &&
        state.map.relief[t] !== Relief.Mountain && !state.units.some((o) => o.tile === t && o.owner !== p.id) && !cityAt(state, t))
      .sort((a, b) => tileDistance(state.map, u.tile, a) - tileDistance(state.map, u.tile, b))[0];
    if (next !== undefined) moveTo(state, u, next, out);
  }
}

/** Ziel eines Feldzugs: Städte von Spielern kurz vor dem Sieg zuerst, sonst die nächste feindliche Stadt auf eigener Landmasse. */
function campaignTarget(state: GameState, p: Player, sit: Situation, mass: Int32Array): number {
  const home = new Set(sit.cities.map((c) => mass[c.tile]));
  const origin = sit.cities.find((c) => c.buildings.includes(BuildingId.Palace))?.tile ?? sit.cities[0]?.tile;
  if (origin === undefined) return -1;
  const candidates = state.cities.filter((c) => c.owner !== p.id && p.explored[c.tile] && hostile(p.id, c.owner) && home.has(mass[c.tile]));
  const score = (c: City) => tileDistance(state.map, origin, c.tile) - (nearVictory(state, c.owner) ? 30 : 0) + c.size;
  return candidates.sort((a, b) => score(a) - score(b))[0]?.tile ?? -1;
}

/** Leitbilder alle 10 Runden prüfen und das jeweils beste wählen (höchstens ein Wechsel). */
function chooseDoctrines(state: GameState, p: Player, out: Out): void {
  if (state.turn % 10 !== 0 || p.upheaval > 0) return;
  const persona = p.persona!;
  const score = (id: number) => {
    const e = DOCTRINES[id].effects;
    return (e.prodPct ?? 0) * 0.6 + (e.researchPct ?? 0) * (0.4 + persona.science) + (e.goldPct ?? 0) * 0.5 +
      (e.culturePct ?? 0) * 0.3 * (0.5 + persona.builder) + (e.mood ?? 0) * 4 + (e.supply ?? 0) * 2 +
      (e.freeUnits ?? 0) * 3 * (0.5 + persona.aggression) + (e.xp ?? 0) * persona.aggression +
      (e.warMood ?? 0) * 3 * (0.5 + persona.aggression) + (e.routeTrade ?? 0);
  };
  for (const [slot, cat] of (['gov', 'econ', 'society'] as const).entries()) {
    const options = DOCTRINES.map((d, id) => ({ d, id })).filter(({ d }) => d.category === cat && (d.tech === null || p.techs[d.tech]));
    const best = options.sort((a, b) => score(b.id) - score(a.id))[0];
    if (best && best.id !== p.doctrines[slot] && score(best.id) > score(p.doctrines[slot]) + 5) {
      run(state, p.id, { type: 'setDoctrine', doctrine: best.id }, out);
      return;
    }
  }
}

function promote(state: GameState, p: Player, out: Out): void {
  for (const u of state.units) {
    if (u.owner !== p.id) continue;
    const choices = promotionChoices(u.type, u.promotions);
    if (!choices.length) continue;
    run(state, p.id, { type: 'promote', unit: u.id, promotion: choices[0] }, out);
  }
}

/** Ein Zug aller Computerspieler. */
export function aiTurn(state: GameState, out: Out): void {
  hostile = (a, b) => isHostile(state, a, b);
  const mass = landmasses(state.map);
  for (const p of state.players) {
    if (p.human || p.barbarian || !p.alive || !p.persona) continue;
    chooseResearch(state, p, out);
    chooseDoctrines(state, p, out);
    const sit = situation(state, p.id);
    manageCities(state, p, sit, out);
    promote(state, p, out);
    const claimedSites = new Set<number>();
    const claimedJobs = new Set<number>();
    const roads = desiredRoads(state, p.id);
    const stranded: Unit[] = [];
    for (const u of state.units.filter((x) => x.owner === p.id)) {
      if (!state.units.includes(u) || u.carriedBy) continue;
      if (u.type === UnitTypeId.Settler) {
        if (settle(state, u, out, claimedSites, mass)) stranded.push(u);
      } else if (u.type === UnitTypeId.Worker) work(state, u, out, roads, claimedJobs);
      else if (u.type === UnitTypeId.Scout) explore(state, u, out);
      else if (UNIT_TYPES[u.type].trade) trade(state, u, out);
    }
    const sit2 = situation(state, p.id);
    const reserved = navalTurn(state, p, out, stranded, garrisonOf(state, p, sit2), isOffensive(state, p, sit2));
    militaryTurn(state, p, situation(state, p.id), out, reserved, mass);
  }
}
