// Seefahrt der Computerspieler: Siedler auf andere Landmassen bringen, Invasionen übers Meer, Seekampf.
// Zustandslos geplant (jede Runde neu aus dem Spielstand), Ziele stehen nur in Unit.aiTarget – damit übersteht
// ein Plan auch Speichern/Laden und bleibt im Online-Lockstep deterministisch.
import { predictCombat } from './combat';
import { cargoOf, type GameState, Orders, pathFor, type Player, type Unit } from './game';
import { forEachNeighbor, tileDistance } from './hex';
import { siteScore } from './gen/starts';
import { isMilitary, landmasses, moveTo, type Out, run } from './aiCommon';
import { isWater, Relief, Terrain } from './rules/terrain';
import { isNaval, UNIT_TYPES, UnitTypeId } from './rules/units';
import { BuildingId } from './rules/buildings';
import { TechId } from './rules/techs';
import { isHostile } from './diplomacy';
import { availableItems, type BuildItem, cityAt, foundingBlocker, playerContext } from './city';
import { cityDefenseAt, fighterOf } from './war';

const isSea = (t: number) => t === Terrain.Coast || t === Terrain.Ocean;
const cargoCap = (type: number) => UNIT_TYPES[type].cargo ?? 0;
const isWarship = (type: number) => isNaval(type) && cargoCap(type) === 0 && UNIT_TYPES[type].strength > 0;

/** Kontext einer Runde für einen Spieler. */
interface NavalCtx {
  state: GameState;
  p: Player;
  out: Out;
  mass: Int32Array;
  /** Landmassen mit eigener Stadt. */
  home: Set<number>;
  /** Einheiten, die diese Runde schon einen Auftrag haben (für militaryTurn tabu). */
  reserved: Set<number>;
}

function seaNeighbors(state: GameState, tile: number): number[] {
  const out: number[] = [];
  forEachNeighbor(state.map, tile, (n) => {
    if (isSea(state.map.terrain[n])) out.push(n);
  });
  return out;
}

function coastalCities(state: GameState, pid: number) {
  return state.cities.filter((c) => c.owner === pid && seaNeighbors(state, c.tile).length > 0);
}

/** Ein Wasserfeld neben `land`, das das Schiff erreicht (nächstes zuerst). */
function reachableSeaNear(state: GameState, ship: Unit, land: number): number {
  const cand = seaNeighbors(state, land)
    .filter((t) => !state.units.some((o) => o.tile === t && o.owner !== ship.owner))
    .sort((a, b) => tileDistance(state.map, ship.tile, a) - tileDistance(state.map, ship.tile, b));
  for (const t of cand) if (t === ship.tile || pathFor(state, ship, t)) return t;
  return -1;
}

/** Erreichbares Wasserfeld an der Küste der Ziel-Landmasse, möglichst nahe am Ziel (das Ziel selbst muss nicht an der Küste liegen). */
function seaNearGoal(ctx: NavalCtx, ship: Unit, goal: number): number {
  const { state } = ctx;
  const shores: number[] = [];
  for (let d = 0; d <= 3 && !shores.length; d++) {
    for (let t = 0; t < state.map.width * state.map.height; t++) {
      if (ctx.mass[t] !== ctx.mass[goal] || tileDistance(state.map, t, goal) !== d) continue;
      if (seaNeighbors(state, t).length) shores.push(t);
    }
  }
  for (const land of shores.slice(0, 4)) {
    const sea = reachableSeaNear(state, ship, land);
    if (sea >= 0) return sea;
  }
  return -1;
}

/** Freies Landfeld neben dem Schiff, möglichst nahe am Ziel. */
function landingTile(state: GameState, from: number, goal: number, pid: number): number {
  const opts: number[] = [];
  forEachNeighbor(state.map, from, (n) => {
    if (isWater(state.map.terrain[n]) || state.map.relief[n] === Relief.Mountain) return;
    if (state.units.some((o) => o.tile === n && o.owner !== pid)) return;
    const c = cityAt(state, n);
    if (c && c.owner !== pid) return;
    opts.push(n);
  });
  opts.sort((a, b) => tileDistance(state.map, a, goal) - tileDistance(state.map, b, goal));
  return opts[0] ?? -1;
}

/** Schiff fährt zum Zielwasserfeld, Ladung geht dort an Land. Liefert true, wenn gelandet wurde. */
function ferry(ctx: NavalCtx, ship: Unit, goal: number): boolean {
  const { state, out } = ctx;
  ctx.reserved.add(ship.id);
  const cargo = cargoOf(state, ship);
  for (const c of cargo) ctx.reserved.add(c.id);
  // Schon an der Küste des Ziels? Dann aussteigen.
  const land = landingTile(state, ship.tile, goal, ship.owner);
  if (land >= 0 && ctx.mass[land] === ctx.mass[goal]) {
    let landed = false;
    for (const c of cargo) {
      if (c.moves <= 0) continue;
      if (moveTo(state, c, land, out)) landed = true;
    }
    if (landed) ship.aiTarget = undefined;
    return landed;
  }
  if (ship.orders === Orders.Goto && ship.aiTarget !== undefined) return false;
  const sea = ship.aiTarget !== undefined && isSea(state.map.terrain[ship.aiTarget]) ? ship.aiTarget : seaNearGoal(ctx, ship, goal);
  if (sea < 0) {
    ship.aiTarget = undefined;
    return false;
  }
  ship.aiTarget = sea;
  if (ship.tile !== sea && ship.moves > 0) moveTo(state, ship, sea, out);
  return false;
}

/** Leere Transporter holen Einheiten ab: Schiff wartet neben der Stadt, Einheiten steigen einzeln zu. */
function pickUp(ctx: NavalCtx, ship: Unit, riders: Unit[]): void {
  const { state, out } = ctx;
  ctx.reserved.add(ship.id);
  const meet = riders[0];
  // Wasserfeld neben dem ersten Passagier (der in einer Küstenstadt oder an der Küste steht).
  const sea = reachableSeaNear(state, ship, meet.tile);
  if (sea < 0) return;
  if (ship.tile !== sea) {
    moveTo(state, ship, sea, out);
    if (ship.tile !== sea) return;
  }
  let free = cargoCap(ship.type) - cargoOf(state, ship).length;
  for (const r of riders) {
    if (free <= 0) break;
    ctx.reserved.add(r.id);
    if (tileDistance(state.map, r.tile, ship.tile) === 1 && r.moves > 0 && moveTo(state, r, ship.tile, out) && r.carriedBy === ship.id) free--;
  }
}

/** Bestes Siedlungsfeld auf einer fremden (noch nicht besiedelten) Landmasse, nahe an einer eigenen Küstenstadt. */
function overseasSite(ctx: NavalCtx, from: number): number {
  const { state, p } = ctx;
  let best = -1;
  let bestScore = -Infinity;
  const n = state.map.width * state.map.height;
  for (let t = 0; t < n; t++) {
    if (!p.explored[t] || ctx.mass[t] < 0 || ctx.home.has(ctx.mass[t])) continue;
    if (state.tileOwner[t] >= 0 || foundingBlocker(state, p.id, t)) continue;
    // Landeplatz in der Nähe nötig: Feld an der Küste oder ein Feld dahinter.
    let coastal = seaNeighbors(state, t).length > 0;
    if (!coastal) forEachNeighbor(state.map, t, (nb) => {
      if (seaNeighbors(state, nb).length) coastal = true;
    });
    if (!coastal) continue;
    const score = siteScore(state.map, t) - tileDistance(state.map, from, t) * 0.8;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

function queueShip(ctx: NavalCtx, want: (type: number) => number, near: number): void {
  const { state, p, out } = ctx;
  const cities = coastalCities(state, p.id);
  if (!cities.length) return;
  const pctx = playerContext(state, p.id);
  // Schon in Bau?
  const wanted = (i: BuildItem) => i.kind === 'unit' && want(i.id) > 0;
  if (cities.some((c) => c.queue.some(wanted))) return;
  const city = cities.slice().sort((a, b) => tileDistance(state.map, a.tile, near) - tileDistance(state.map, b.tile, near))[0];
  let best: BuildItem | null = null;
  let bestV = 0;
  for (const i of availableItems(state, city, pctx)) {
    if (i.kind !== 'unit') continue;
    const v = want(i.id);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  if (best) run(state, p.id, { type: 'build', city: city.id, item: best, append: city.queue.length > 0 }, out);
}

const transportValue = (type: number) => (cargoCap(type) ? cargoCap(type) * 10 + (UNIT_TYPES[type].ocean ? 5 : 0) - UNIT_TYPES[type].cost / 20 : 0);
const warshipValue = (type: number) => (isWarship(type) ? UNIT_TYPES[type].strength * 3 - UNIT_TYPES[type].cost / 20 : 0);

// --- 0. Erkundung zur See ----------------------------------------------------------------------
// Ohne sie kennt die KI keine anderen Landmassen – und plant weder Siedlungen noch Invasionen in Übersee.

/** Ab dieser Runde (und mit mindestens zwei Städten) schickt die KI ein Schiff auf Erkundung. */
const SEA_SCOUT_TURN = 30;

/** Gibt es bekanntes, befahrbares Wasser neben Unerforschtem? */
function seaFrontier(state: GameState, p: Player, ocean: boolean): boolean {
  const m = state.map;
  for (let t = 0; t < m.width * m.height; t++) {
    if (!p.explored[t]) continue;
    const ter = m.terrain[t];
    if (ter !== Terrain.Coast && !(ocean && ter === Terrain.Ocean)) continue;
    let edge = false;
    forEachNeighbor(m, t, (n) => {
      if (!p.explored[n]) edge = true;
    });
    if (edge) return true;
  }
  return false;
}

const scoutValue = (type: number) => (isNaval(type) ? UNIT_TYPES[type].moves * 3 + UNIT_TYPES[type].sight * 2 - UNIT_TYPES[type].cost / 20 : 0);

function exploreSea(ctx: NavalCtx): void {
  const { state, p, out } = ctx;
  const ships = state.units.filter((u) => u.owner === p.id && isNaval(u.type));
  const scouts = ships.filter((u) => u.orders === Orders.Explore);
  for (const u of scouts) ctx.reserved.add(u.id);
  if (scouts.length || state.turn < SEA_SCOUT_TURN || state.cities.filter((c) => c.owner === p.id).length < 2) return;
  // Nur alle paar Runden prüfen – ein Schiff, das nichts mehr findet, soll nicht jede Runde neu starten.
  if (state.turn % 5 !== 0) return;
  const ocean = p.techs[TechId.Navigation] === 1 || ships.some((u) => UNIT_TYPES[u.type].ocean);
  if (!seaFrontier(state, p, ocean)) return;
  const idle = ships.find((u) => !ctx.reserved.has(u.id) && !cargoOf(state, u).length && u.moves > 0 &&
    (u.orders === Orders.None || u.orders === Orders.Fortify));
  if (idle) {
    if (run(state, p.id, { type: 'explore', unit: idle.id }, out)) ctx.reserved.add(idle.id);
    return;
  }
  // Noch gar kein Schiff: eines bauen (das schnellste mit guter Sicht).
  if (!ships.length) {
    const capital = state.cities.find((c) => c.owner === p.id && c.buildings.includes(BuildingId.Palace)) ?? state.cities.find((c) => c.owner === p.id)!;
    queueShip(ctx, scoutValue, capital.tile);
  }
}

// --- 1. Siedler übers Meer --------------------------------------------------------------------

function expandOverseas(ctx: NavalCtx, stranded: Unit[]): void {
  const { state, p } = ctx;
  const transports = state.units.filter((u) => u.owner === p.id && cargoCap(u.type) > 0);
  // Siedler an Bord: zum Ziel fahren.
  for (const ship of transports) {
    const settler = cargoOf(state, ship).find((c) => c.type === UnitTypeId.Settler);
    if (!settler) continue;
    const goal = settler.aiTarget ?? overseasSite(ctx, ship.tile);
    if (goal < 0) continue;
    settler.aiTarget = goal;
    ferry(ctx, ship, goal);
  }
  const waiting = stranded.filter((s) => !s.carriedBy && state.units.includes(s));
  if (!waiting.length) return;
  const goal = overseasSite(ctx, waiting[0].tile);
  if (goal < 0) return;
  const free = transports.filter((t) => !ctx.reserved.has(t.id) && cargoOf(state, t).length === 0);
  if (!free.length) {
    queueShip(ctx, transportValue, waiting[0].tile);
    return;
  }
  // Siedler zur nächsten Küstenstadt, Schiff holt ihn dort ab; ein freier Krieger fährt als Begleitschutz mit.
  const settler = waiting[0];
  settler.aiTarget = goal;
  ctx.reserved.add(settler.id);
  const coast = coastalCities(state, p.id).sort((a, b) => tileDistance(state.map, a.tile, settler.tile) - tileDistance(state.map, b.tile, settler.tile))[0];
  if (!coast) return;
  if (settler.tile !== coast.tile && seaNeighbors(state, settler.tile).length === 0) {
    moveTo(state, settler, coast.tile, ctx.out);
    return;
  }
  const escort = state.units.find((u) => u.owner === p.id && u.tile === settler.tile && isMilitary(u.type) && !ctx.reserved.has(u.id) &&
    state.units.filter((o) => o.owner === p.id && o.tile === u.tile && isMilitary(o.type)).length > 1);
  pickUp(ctx, free[0], escort ? [settler, escort] : [settler]);
}

// --- 2. Invasion übers Meer --------------------------------------------------------------------

/** Feindliche Stadt auf einer anderen Landmasse, die die KI kennt (die nächste zur eigenen Hauptstadt). */
function overseasTarget(ctx: NavalCtx): number {
  const { state, p } = ctx;
  const capital = state.cities.find((c) => c.owner === p.id && c.buildings.includes(BuildingId.Palace));
  const origin = capital?.tile ?? state.cities.find((c) => c.owner === p.id)?.tile;
  if (origin === undefined) return -1;
  return state.cities
    .filter((c) => c.owner !== p.id && p.explored[c.tile] && isHostile(state, p.id, c.owner) && !ctx.home.has(ctx.mass[c.tile]))
    .sort((a, b) => tileDistance(state.map, origin, a.tile) - tileDistance(state.map, origin, b.tile))[0]?.tile ?? -1;
}

function invade(ctx: NavalCtx, garrison: Set<number>): void {
  const { state, p } = ctx;
  const target = overseasTarget(ctx);
  if (target < 0) return;
  const transports = state.units.filter((u) => u.owner === p.id && cargoCap(u.type) > 0 && !ctx.reserved.has(u.id));
  // Beladene Schiffe: Kurs aufs Ziel; gelandet wird ein Feld vor der Stadt.
  for (const ship of transports) {
    const cargo = cargoOf(state, ship);
    if (!cargo.length || !cargo.every((c) => isMilitary(c.type))) continue;
    ferry(ctx, ship, target);
  }
  const army = state.units.filter((u) => u.owner === p.id && isMilitary(u.type) && !u.carriedBy && !garrison.has(u.id) &&
    !ctx.reserved.has(u.id) && ctx.home.has(ctx.mass[u.tile]));
  const free = transports.filter((t) => !ctx.reserved.has(t.id) && cargoOf(state, t).length === 0);
  if (army.length < 3) return;
  if (!free.length) {
    queueShip(ctx, transportValue, army[0].tile);
    return;
  }
  // Truppen sammeln sich in der Küstenstadt, die dem Ziel am nächsten liegt.
  const port = coastalCities(state, p.id).sort((a, b) => tileDistance(state.map, a.tile, target) - tileDistance(state.map, b.tile, target))[0];
  if (!port) return;
  const ship = free[0];
  const riders = army.sort((a, b) => tileDistance(state.map, a.tile, port.tile) - tileDistance(state.map, b.tile, port.tile)).slice(0, cargoCap(ship.type));
  for (const r of riders) ctx.reserved.add(r.id);
  const atPort = riders.filter((r) => r.tile === port.tile);
  for (const r of riders) if (r.tile !== port.tile && r.orders !== Orders.Goto) moveTo(state, r, port.tile, ctx.out);
  // Erst ablegen, wenn mindestens zwei Einheiten bereitstehen.
  if (atPort.length >= Math.min(2, cargoCap(ship.type))) pickUp(ctx, ship, atPort);
  else {
    ctx.reserved.add(ship.id);
    const sea = reachableSeaNear(state, ship, port.tile);
    if (sea >= 0 && ship.tile !== sea) moveTo(state, ship, sea, ctx.out);
  }
}

// --- 3. Kriegsschiffe ---------------------------------------------------------------------------

function seaOdds(state: GameState, u: Unit, target: Unit): number {
  const bf = { map: state.map, attackerTile: u.tile, defenderTile: target.tile, cityDefense: cityDefenseAt(state, target.tile) };
  return predictCombat(fighterOf(u), fighterOf(target), bf, false).win;
}

function warships(ctx: NavalCtx): void {
  const { state, p, out } = ctx;
  const ships = state.units.filter((u) => u.owner === p.id && isWarship(u.type));
  const enemies = state.units.filter((u) => u.owner !== p.id && isNaval(u.type) && p.visible[u.tile] && isHostile(state, p.id, u.owner));
  for (const s of ships) {
    if (s.moves <= 0) continue;
    const prey = enemies
      .filter((e) => state.units.includes(e) && tileDistance(state.map, s.tile, e.tile) <= 1)
      .sort((a, b) => seaOdds(state, s, b) - seaOdds(state, s, a))[0];
    if (prey && seaOdds(state, s, prey) >= 0.6) {
      ctx.reserved.add(s.id);
      run(state, p.id, { type: 'attack', unit: s.id, target: prey.tile }, out);
      continue;
    }
    // Feind in Reichweite: näher heran, sonst im Hafen befestigen.
    const near = enemies.filter((e) => state.units.includes(e) && tileDistance(state.map, s.tile, e.tile) <= 6)
      .sort((a, b) => tileDistance(state.map, s.tile, a.tile) - tileDistance(state.map, s.tile, b.tile))[0];
    if (near && seaOdds(state, s, near) >= 0.6) {
      const sea = reachableSeaNear(state, s, near.tile);
      if (sea >= 0) {
        moveTo(state, s, sea, out);
        continue;
      }
    }
    if (s.orders === Orders.None) run(state, p.id, { type: 'fortify', unit: s.id }, out);
  }
  // Feindliche Schiffe nahe den eigenen Küsten → eigene Kriegsschiffe bauen.
  const threatened = coastalCities(state, p.id).find((c) => enemies.some((e) => tileDistance(state.map, e.tile, c.tile) <= 6));
  if (threatened && ships.length < Math.ceil(coastalCities(state, p.id).length / 2) + 1) queueShip(ctx, warshipValue, threatened.tile);
}

/** Untätige Transporter warten befestigt im nächsten eigenen Hafen. */
function parkIdle(ctx: NavalCtx): void {
  const { state, p, out } = ctx;
  for (const s of state.units.filter((u) => u.owner === p.id && cargoCap(u.type) > 0 && !ctx.reserved.has(u.id))) {
    if (s.orders !== Orders.None || cargoOf(state, s).length) continue;
    const port = coastalCities(state, p.id).sort((a, b) => tileDistance(state.map, a.tile, s.tile) - tileDistance(state.map, b.tile, s.tile))[0];
    if (port && s.tile !== port.tile && moveTo(state, s, port.tile, out)) continue;
    run(state, p.id, { type: 'fortify', unit: s.id }, out);
  }
}

/**
 * Seezug eines Computerspielers. `stranded` = Siedler ohne erreichbaren Bauplatz an Land.
 * Liefert die Einheiten, die einen Seeauftrag haben (militaryTurn lässt sie in Ruhe).
 */
export function navalTurn(state: GameState, p: Player, out: Out, stranded: Unit[], garrison: Set<number>, offensive: boolean): Set<number> {
  const mass = landmasses(state.map);
  const home = new Set(state.cities.filter((c) => c.owner === p.id).map((c) => mass[c.tile]));
  const ctx: NavalCtx = { state, p, out, mass, home, reserved: new Set() };
  if (!coastalCities(state, p.id).length) return ctx.reserved;
  exploreSea(ctx);
  expandOverseas(ctx, stranded);
  if (offensive) invade(ctx, garrison);
  warships(ctx);
  parkIdle(ctx);
  return ctx.reserved;
}
