import { describe, expect, it } from 'vitest';
import { applyCommand, CommandError, createGame, endTurn, HUMAN, Orders, readyUnits, refreshVision } from './game';
import { neighborOf, tileDistance, tilesAround } from './hex';
import { createMap } from './map';
import { generateWorld } from './mapgen';
import { findPath, landCost } from './path';
import { Feature, isWater, Relief, Terrain } from './rules/terrain';
import { MOVE_SCALE, UnitTypeId } from './rules/units';
import { fromSaveData, SAVE_VERSION, toSaveData } from './save';
import { markVisible } from './vision';

/** Flache Graslandkarte als Testgelände. */
function flatMap(w = 12, h = 10) {
  const m = createMap(w, h, 1, true);
  m.terrain.fill(Terrain.Grassland);
  return m;
}

const at = (m: { width: number }, c: number, r: number) => r * m.width + c;

describe('Wegfindung', () => {
  it('findet den kürzesten Weg auf freier Fläche', () => {
    const m = flatMap();
    const cost = landCost(m, () => true, () => false);
    const res = findPath({ map: m, from: at(m, 1, 4), to: at(m, 6, 4), maxMoves: MOVE_SCALE, movesLeft: MOVE_SCALE, cost })!;
    expect(res.tiles).toHaveLength(5);
    expect(res.turns).toEqual([0, 1, 2, 3, 4]);
  });

  it('nutzt die Weltumrundung', () => {
    const m = flatMap();
    const cost = landCost(m, () => true, () => false);
    const res = findPath({ map: m, from: at(m, 0, 4), to: at(m, 11, 4), maxMoves: MOVE_SCALE, movesLeft: MOVE_SCALE, cost })!;
    expect(res.tiles).toEqual([at(m, 11, 4)]);
  });

  it('umgeht Gebirge und Wasser', () => {
    const m = flatMap();
    for (let r = 0; r < 9; r++) m.relief[at(m, 5, r)] = Relief.Mountain;
    const cost = landCost(m, () => true, () => false);
    const res = findPath({ map: m, from: at(m, 3, 2), to: at(m, 7, 2), maxMoves: MOVE_SCALE, movesLeft: MOVE_SCALE, cost })!;
    expect(res).not.toBeNull();
    for (const t of res.tiles) expect(m.relief[t]).not.toBe(Relief.Mountain);
  });

  it('teures Feld darf mit Restbewegung betreten werden, verbraucht dann die Runde', () => {
    const m = flatMap();
    m.feature[at(m, 3, 4)] = Feature.Forest; // kostet 2
    const cost = landCost(m, () => true, () => false);
    const res = findPath({ map: m, from: at(m, 2, 4), to: at(m, 4, 4), maxMoves: MOVE_SCALE, movesLeft: MOVE_SCALE, cost })!;
    expect(res.turns).toEqual([0, 1]);
  });

  it('liefert null für unerreichbare Ziele', () => {
    const m = flatMap();
    m.terrain[at(m, 6, 6)] = Terrain.Coast;
    const cost = landCost(m, () => true, () => false);
    expect(findPath({ map: m, from: at(m, 1, 1), to: at(m, 6, 6), maxMoves: MOVE_SCALE, movesLeft: MOVE_SCALE, cost })).toBeNull();
  });
});

describe('Sicht', () => {
  it('Wald verdeckt, Hügel erhöht die Sichtweite', () => {
    const m = flatMap(20, 12);
    const viewer = at(m, 5, 6);
    const out = new Uint8Array(m.width * m.height);
    markVisible(m, viewer, 2, out);
    const ring2 = tilesAround(m, viewer, 2).filter((t) => tileDistance(m, viewer, t) === 2);
    expect(ring2.every((t) => out[t] === 1)).toBe(true);

    // Wald östlich davor → Feld dahinter unsichtbar
    const east = neighborOf(m, viewer, 0);
    const behind = neighborOf(m, east, 0);
    m.feature[east] = Feature.Forest;
    out.fill(0);
    markVisible(m, viewer, 2, out);
    expect(out[east]).toBe(1);
    expect(out[behind]).toBe(0);

    // Vom Hügel aus sieht man über den Wald und weiter
    m.relief[viewer] = Relief.Hill;
    out.fill(0);
    markVisible(m, viewer, 2, out);
    expect(out[behind]).toBe(1);
    const ring3 = tilesAround(m, viewer, 3).filter((t) => tileDistance(m, viewer, t) === 3);
    expect(ring3.some((t) => out[t] === 1)).toBe(true);
  });
});

describe('Spielablauf', () => {
  const opts = { width: 64, height: 40, seed: 321, players: 4, script: 'continents' as const };
  const newGame = () => createGame(generateWorld(opts), opts);

  it('jeder Spieler startet mit Siedler, Krieger, Späher auf seinem Startfeld', () => {
    const s = newGame();
    expect(s.units).toHaveLength(12);
    for (const p of s.players) {
      const own = s.units.filter((u) => u.owner === p.id);
      expect(own.map((u) => u.type).sort()).toEqual([UnitTypeId.Settler, UnitTypeId.Scout, UnitTypeId.Warrior].sort());
      expect(new Set(own.map((u) => u.tile))).toEqual(new Set([s.starts[p.id]]));
      expect(p.explored[s.starts[p.id]]).toBe(1);
    }
  });

  it('Bewegung verbraucht Punkte, deckt Karte auf, Rest des Weges wird nächste Runde fortgesetzt', () => {
    const s = newGame();
    const scout = s.units.find((u) => u.owner === HUMAN && u.type === UnitTypeId.Scout)!;
    const explored0 = s.players[HUMAN].explored.reduce((a, b) => a + b, 0);
    // Ziel: ein erreichbares Landfeld in 6 Feldern Entfernung
    const target = tilesAround(s.map, scout.tile, 6).find(
      (t) => tileDistance(s.map, scout.tile, t) === 6 && !isWater(s.map.terrain[t]) && s.map.relief[t] !== Relief.Mountain &&
        findPath({ map: s.map, from: scout.tile, to: t, maxMoves: 2 * MOVE_SCALE, movesLeft: 2 * MOVE_SCALE, cost: landCost(s.map, () => true, () => false) }),
    )!;
    expect(target).toBeDefined();
    const ev = applyCommand(s, HUMAN, { type: 'move', unit: scout.id, target }).moves;
    expect(ev[0].steps[0]).not.toBe(scout.tile);
    expect(scout.moves).toBe(0);
    expect(scout.orders).toBe(Orders.Goto);

    for (let k = 0; k < 10 && scout.tile !== target; k++) endTurn(s);
    expect(scout.tile).toBe(target);
    // 6 Felder vom Start entfernt liegt außerhalb der bekannten Startumgebung → neu erkundet.
    expect(s.players[HUMAN].explored.reduce((a, b) => a + b, 0)).toBeGreaterThan(explored0);
    expect(scout.orders).toBe(Orders.None);
  });

  it('lehnt fremde Einheiten und unmögliche Ziele ab', () => {
    const s = newGame();
    const foreign = s.units.find((u) => u.owner !== HUMAN)!;
    expect(() => applyCommand(s, HUMAN, { type: 'skip', unit: foreign.id })).toThrow(CommandError);
    const own = s.units.find((u) => u.owner === HUMAN)!;
    // Bekanntes Wasser ist kein Ziel; ins Unerforschte darf man dagegen losgeschickt werden.
    const water = s.map.terrain.findIndex((t) => isWater(t));
    s.players[HUMAN].explored[water] = 1;
    expect(() => applyCommand(s, HUMAN, { type: 'move', unit: own.id, target: water })).toThrow(CommandError);
  });

  it('Überspringen gilt eine Runde, Befestigen bleibt', () => {
    const s = newGame();
    const [a, b] = s.units.filter((u) => u.owner === HUMAN);
    applyCommand(s, HUMAN, { type: 'skip', unit: a.id });
    applyCommand(s, HUMAN, { type: 'fortify', unit: b.id });
    expect(readyUnits(s, HUMAN)).toHaveLength(1);
    endTurn(s);
    expect(a.orders).toBe(Orders.None);
    expect(b.orders).toBe(Orders.Fortify);
    expect(s.turn).toBe(2);
  });

  it('Speichern und Laden ergibt denselben Zustand', () => {
    const s = newGame();
    endTurn(s);
    const data = structuredClone(toSaveData(s));
    expect(data.version).toBe(SAVE_VERSION);
    const loaded = fromSaveData(data);
    for (const p of loaded.players) refreshVision(loaded, p.id);
    expect(loaded.turn).toBe(2);
    expect(loaded.units).toEqual(s.units);
    expect(loaded.map.terrain).toEqual(s.map.terrain);
    expect(loaded.players[0].visible).toEqual(s.players[0].visible);
    expect(loaded.rng.getState()).toBe(s.rng.getState());
    expect(() => fromSaveData({ ...data, version: 999 })).toThrow();
  });
});
