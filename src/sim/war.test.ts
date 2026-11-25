import { describe, expect, it } from 'vitest';
import { barbarianTurn, BARB_START_TURN } from './barbarians';
import { type Battlefield, defensePower, type Fighter, predictCombat, resolveCombat } from './combat';
import { addUnit, applyCommand, CommandError, createGame, endTurn, type GameState, HUMAN, Orders, refreshVision } from './game';
import { neighborOf } from './hex';
import { createMap } from './map';
import { generateWorld } from './mapgen';
import { Rng } from './rng';
import { Feature, Relief, Terrain } from './rules/terrain';
import { PromotionId, UnitTypeId, xpForNext } from './rules/units';
import { fromSaveData, toSaveData } from './save';
import { relation } from './diplomacy';

const flat = () => {
  const m = createMap(10, 8, 1, true);
  m.terrain.fill(Terrain.Grassland);
  return m;
};
const fighter = (type: number, extra: Partial<Fighter> = {}): Fighter => ({ type, hp: 100, promotions: [], fortified: false, ...extra });

describe('Kampfformel', () => {
  const m = flat();
  const bf: Battlefield = { map: m, attackerTile: 11, defenderTile: 12, cityDefense: null };

  it('stärkere Einheit gewinnt häufiger, gleich starke etwa ausgeglichen', () => {
    const even = predictCombat(fighter(UnitTypeId.Warrior), fighter(UnitTypeId.Warrior), bf, false);
    expect(even.win).toBeLessThan(0.2); // ein Kampf tötet selten sofort
    const strong = predictCombat(fighter(UnitTypeId.Swordsman), fighter(UnitTypeId.Warrior), bf, false);
    // 3:1 überlegen: tötet meist (nicht immer) in einem Kampf.
    expect(strong.win).toBeGreaterThan(0.75);
    expect(strong.dmgAtt[1]).toBeLessThan(strong.dmgDef[0]);
  });

  it('Gelände, Befestigung, Stadt und Fluss stärken den Verteidiger', () => {
    const att = fighter(UnitTypeId.Warrior);
    const base = defensePower(fighter(UnitTypeId.Warrior), att, bf, false);
    expect(defensePower(fighter(UnitTypeId.Warrior, { fortified: true }), att, bf, false)).toBeCloseTo(base * 1.25);
    expect(defensePower(fighter(UnitTypeId.Warrior), att, { ...bf, cityDefense: 50 }, false)).toBeCloseTo(base * 1.75);
    m.relief[12] = Relief.Hill;
    expect(defensePower(fighter(UnitTypeId.Warrior), att, bf, false)).toBeCloseTo(base * 1.25);
    m.relief[12] = Relief.Flat;
    m.feature[12] = Feature.Forest;
    expect(defensePower(fighter(UnitTypeId.Warrior), att, bf, false)).toBeCloseTo(base * 1.25);
    m.feature[12] = Feature.None;
  });

  it('Speerkämpfer kontern Berittene, Verletzte sind schwächer', () => {
    const vsHorse = predictCombat(fighter(UnitTypeId.Horseman), fighter(UnitTypeId.Spearman), bf, false);
    expect(vsHorse.defense).toBeGreaterThan(vsHorse.attack * 1.5);
    const hurt = defensePower(fighter(UnitTypeId.Warrior, { hp: 40 }), fighter(UnitTypeId.Warrior), bf, false);
    expect(hurt).toBeLessThan(defensePower(fighter(UnitTypeId.Warrior), fighter(UnitTypeId.Warrior), bf, false));
  });

  it('ist deterministisch und Fernkampf verletzt den Angreifer nicht', () => {
    const a = resolveCombat(fighter(UnitTypeId.Archer), fighter(UnitTypeId.Warrior), bf, true, new Rng(5));
    const b = resolveCombat(fighter(UnitTypeId.Archer), fighter(UnitTypeId.Warrior), bf, true, new Rng(5));
    expect(a).toEqual(b);
    expect(a.dmgAtt).toBe(0);
    expect(a.attackerDies).toBe(false);
  });
});

const opts = { width: 64, height: 40, seed: 321, players: 4, script: 'continents' as const };

function atWar(s: GameState): void {
  const r = relation(s, HUMAN, 1);
  r.met = true;
  r.war = true;
}

/** Spiel mit einer Landfläche neben dem eigenen Krieger zum Testen von Angriffen. */
function battle(): { s: GameState; warrior: ReturnType<typeof addUnit>; target: number } {
  const s = createGame(generateWorld(opts), opts);
  const warrior = s.units.find((u) => u.owner === HUMAN && u.type === UnitTypeId.Warrior)!;
  let target = -1;
  for (let d = 0; d < 6 && target < 0; d++) {
    const n = neighborOf(s.map, warrior.tile, d);
    if (n >= 0) target = n;
  }
  s.map.terrain[target] = Terrain.Grassland;
  s.map.relief[target] = Relief.Flat;
  s.map.feature[target] = Feature.None;
  s.map.river.fill(0);
  return { s, warrior, target };
}

describe('Angriff und Eroberung', () => {
  it('besiegter Verteidiger macht das Feld frei, der Angreifer rückt nach und gewinnt Erfahrung', () => {
    const { s, warrior, target } = battle();
    const enemy = addUnit(s, s.barbarian, UnitTypeId.Warrior, target);
    enemy.hp = 1;
    refreshVision(s, HUMAN);
    const res = applyCommand(s, HUMAN, { type: 'attack', unit: warrior.id, target });
    expect(res.combats![0].defenderDied).toBe(true);
    expect(s.units.includes(enemy)).toBe(false);
    expect(warrior.tile).toBe(target);
    expect(warrior.xp).toBeGreaterThan(0);
    expect(warrior.moves).toBe(0);
  });

  it('Zivilisten werden gefangen genommen (Siedler werden Arbeiter)', () => {
    const { s, warrior, target } = battle();
    const settler = addUnit(s, 1, UnitTypeId.Settler, target);
    atWar(s);
    refreshVision(s, HUMAN);
    applyCommand(s, HUMAN, { type: 'attack', unit: warrior.id, target });
    expect(settler.owner).toBe(HUMAN);
    expect(settler.type).toBe(UnitTypeId.Worker);
  });

  it('eine unverteidigte fremde Stadt wird erobert', () => {
    const { s, warrior, target } = battle();
    s.cities.push({
      id: 77, owner: 1, name: 'Fremdstadt', tile: target, size: 3, foodStored: 0, prodStored: 10, culture: 0,
      founded: 1, queue: [{ kind: 'unit', id: 3 }], buildings: [0], worked: [], locked: [],
    });
    atWar(s);
    refreshVision(s, HUMAN);
    const res = applyCommand(s, HUMAN, { type: 'attack', unit: warrior.id, target });
    const c = s.cities.find((x) => x.id === 77)!;
    expect(res.combats![0].capturedCity).toBe('Fremdstadt');
    expect(c.owner).toBe(HUMAN);
    expect(c.size).toBe(2);
    expect(c.queue).toHaveLength(0);
    expect(c.buildings).not.toContain(0); // Palast verschwindet
  });

  it('Plündererlager ausheben bringt Gold', () => {
    const { s, warrior, target } = battle();
    s.camps.push({ tile: target, timer: 0 });
    refreshVision(s, HUMAN);
    const gold = s.players[HUMAN].gold;
    applyCommand(s, HUMAN, { type: 'attack', unit: warrior.id, target });
    expect(s.camps).toHaveLength(0);
    expect(s.players[HUMAN].gold).toBeGreaterThan(gold);
  });

  it('Fernkampf braucht Reichweite und ein Kampfziel', () => {
    const { s, warrior, target } = battle();
    const archer = addUnit(s, HUMAN, UnitTypeId.Archer, warrior.tile);
    addUnit(s, s.barbarian, UnitTypeId.Worker, target);
    refreshVision(s, HUMAN);
    expect(() => applyCommand(s, HUMAN, { type: 'attack', unit: archer.id, target })).toThrow(CommandError);
  });
});

describe('Beförderung und Heilung', () => {
  it('Erfahrung erlaubt eine Beförderung, die stärkt und heilt', () => {
    const { s, warrior } = battle();
    expect(() => applyCommand(s, HUMAN, { type: 'promote', unit: warrior.id, promotion: PromotionId.Drill1 })).toThrow(CommandError);
    warrior.xp = xpForNext(0);
    warrior.hp = 50;
    applyCommand(s, HUMAN, { type: 'promote', unit: warrior.id, promotion: PromotionId.Drill1 });
    expect(warrior.promotions).toEqual([PromotionId.Drill1]);
    expect(warrior.hp).toBe(75);
  });

  it('ruhende Einheiten heilen am Rundenbeginn', () => {
    const { s, warrior } = battle();
    warrior.hp = 50;
    warrior.orders = Orders.Fortify;
    endTurn(s);
    expect(warrior.hp).toBeGreaterThan(50);
  });
});

describe('Plünderer', () => {
  it('errichten ab Runde 15 Lager fern der Zivilisationen und greifen nahe schwache Ziele an', () => {
    const s = createGame(generateWorld({ ...opts, width: 84, height: 52 }), { ...opts, width: 84, height: 52 });
    s.turn = BARB_START_TURN + 1;
    while (s.turn % 4 !== 0) s.turn++;
    barbarianTurn(s, [], [], []);
    expect(s.camps.length).toBe(1);
    const camp = s.camps[0];
    for (const c of s.cities) expect(Math.abs(c.tile - camp.tile)).toBeGreaterThan(0);
    // Ein menschlicher Arbeiter direkt neben einem Plünderer wird angegriffen.
    const raider = s.units.find((u) => u.owner === s.barbarian)!;
    raider.orders = Orders.None;
    const next = neighborOf(s.map, raider.tile, 0);
    s.map.terrain[next] = Terrain.Grassland;
    s.map.relief[next] = Relief.Flat;
    const worker = addUnit(s, HUMAN, UnitTypeId.Worker, next);
    const combats: unknown[] = [];
    barbarianTurn(s, [], combats as never[], []);
    expect(combats.length).toBeGreaterThan(0);
    expect(s.units.includes(worker)).toBe(false);
  });
});

describe('Speicherformat v4', () => {
  it('erhält Lebenspunkte, Beförderungen, Lager; migriert v3', () => {
    const { s, warrior } = battle();
    warrior.hp = 42;
    warrior.promotions = [PromotionId.Drill1];
    s.camps.push({ tile: 3, timer: 2 });
    const loaded = fromSaveData(structuredClone(toSaveData(s)));
    const w = loaded.units.find((u) => u.id === warrior.id)!;
    expect(w.hp).toBe(42);
    expect(w.promotions).toEqual([PromotionId.Drill1]);
    expect(loaded.camps).toEqual([{ tile: 3, timer: 2 }]);
    expect(loaded.players[loaded.barbarian].barbarian).toBe(true);

    const v4 = structuredClone(toSaveData(s));
    const v3 = { ...v4, version: 3, barbarian: undefined, camps: undefined,
      players: v4.players.filter((p) => !p.barbarian),
      units: v4.units.filter((u) => u.owner !== v4.barbarian).map(({ hp: _h, xp: _x, promotions: _p, acted: _a, ...u }) => u) } as unknown as typeof v4;
    const migrated = fromSaveData(v3);
    expect(migrated.players[migrated.barbarian].barbarian).toBe(true);
    expect(migrated.units.every((u) => u.hp === 100 && u.promotions.length === 0)).toBe(true);
  });
});
