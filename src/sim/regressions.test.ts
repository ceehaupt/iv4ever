// Regressionstests für behobene Logikfehler (Eroberung, Ausscheiden, Friedensschluss, Seekampf).
import { describe, expect, it } from 'vitest';
import { foundCity } from './city';
import { aiDiplomacy, declareWar, makePeace, MEMORY_FADE, relation } from './diplomacy';
import { addUnit, createGame, endTurn, type GameState, HUMAN } from './game';
import { neighborOf } from './hex';
import { generateWorld } from './mapgen';
import { Feature, Relief, Terrain } from './rules/terrain';
import { UnitTypeId } from './rules/units';
import { fromSaveData, toSaveData } from './save';
import { checkVictory } from './victory';
import { attackBlocker, performAttack } from './war';
import { assignSlots, PERSONAS, personaFor } from './rules/leaders';
import { applyCommand, refreshVision } from './game';
import { barbarianTurn } from './barbarians';
import { CAMP_REWARD } from './war';
import { forEachNeighbor } from './hex';
import { aiCity, islands, T } from './testWorld';

const opts = { width: 64, height: 40, seed: 321, players: 4, script: 'continents' as const };

/** Krieg Mensch ↔ Volk 1, freies Grasfeld neben dem Krieger des Menschen. */
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
  const r = relation(s, HUMAN, 1);
  r.met = true;
  r.war = true;
  s.players[HUMAN].visible[target] = 1;
  return { s, warrior, target };
}

const foundFor = (s: GameState, pid: number) => {
  const settler = s.units.find((u) => u.owner === pid && u.type === UnitTypeId.Settler)!;
  s.units = s.units.filter((u) => u !== settler);
  return foundCity(s, pid, settler.tile);
};

describe('Verladene Einheiten im Hafen', () => {
  it('verteidigen die Stadt statt kampflos gefangen zu werden', () => {
    const { s, warrior, target } = battle();
    const city = foundCity(s, 1, target);
    const ship = addUnit(s, 1, UnitTypeId.Galley, target);
    const sword = addUnit(s, 1, UnitTypeId.Swordsman, target);
    sword.carriedBy = ship.id;
    const ev = performAttack(s, warrior, target, []);
    expect(ev.defender).toBe(sword.id);
    expect(city.owner).toBe(1);
  });

  it('verladene Zivilisten werden bei der Eroberung ohne Schiffsbezug übernommen', () => {
    const { s, warrior, target } = battle();
    const city = foundCity(s, 1, target);
    const ship = addUnit(s, 1, UnitTypeId.Galley, target);
    const worker = addUnit(s, 1, UnitTypeId.Worker, target);
    worker.carriedBy = ship.id;
    performAttack(s, warrior, target, []);
    expect(city.owner).toBe(HUMAN);
    expect(s.units.includes(ship)).toBe(false);
    expect(worker.owner).toBe(HUMAN);
    expect(worker.carriedBy).toBeNull();
  });

  it('Fernangriff auf eine Stadt trifft die verladenen Truppen (vorher: Angriff ohne Kampf)', () => {
    const { s, warrior, target } = battle();
    foundCity(s, 1, target);
    const ship = addUnit(s, 1, UnitTypeId.Galley, target);
    const sword = addUnit(s, 1, UnitTypeId.Swordsman, target);
    sword.carriedBy = ship.id;
    const archer = addUnit(s, HUMAN, UnitTypeId.Archer, warrior.tile);
    expect(attackBlocker(s, archer, target)).toBeNull();
    const ev = performAttack(s, archer, target, []);
    expect(ev.defender).toBe(sword.id);
    expect(ev.dmgDef).toBeGreaterThan(0);
  });
});

describe('Ausscheiden', () => {
  it('ein Volk ohne Stadt scheidet aus, auch wenn noch Einheiten übrig sind', () => {
    const { s, warrior, target } = battle();
    for (const pid of [HUMAN, 2, 3]) foundFor(s, pid);
    foundCity(s, 1, target);
    s.units = s.units.filter((u) => u.owner !== 1 || u.type !== UnitTypeId.Settler);
    const scout = s.units.find((u) => u.owner === 1 && u.tile !== target)!;
    expect(scout).toBeDefined();
    performAttack(s, warrior, target, []);
    expect(s.players[1].alive).toBe(false);
    expect(s.units.some((u) => u.owner === 1)).toBe(false);
  });

  it('wer seinen letzten Siedler vor der ersten Gründung verliert, scheidet am Rundenende aus', () => {
    const s = createGame(generateWorld(opts), opts);
    foundFor(s, HUMAN);
    s.units = s.units.filter((u) => !(u.owner === 1 && u.type === UnitTypeId.Settler));
    endTurn(s);
    expect(s.players[1].alive).toBe(false);
  });

  it('ohne Stadt, aber mit Siedler bleibt ein Volk vor der ersten Gründung im Spiel', () => {
    const s = createGame(generateWorld(opts), opts);
    foundFor(s, HUMAN);
    // Die KI-Völker gründen in ihrem Zug; hier zählt nur, dass niemand vorher ausscheidet.
    for (const p of s.players) if (!p.barbarian) expect(p.alive).toBe(true);
  });

  it('nur ein Volk übrig → Eroberungssieg', () => {
    const s = createGame(generateWorld(opts), opts);
    foundFor(s, HUMAN);
    s.units = s.units.filter((u) => u.owner === HUMAN || s.players[u.owner].barbarian);
    endTurn(s);
    expect(s.winner?.player).toBe(HUMAN);
    expect(s.winner?.type).toBe('conquest');
    expect(checkVictory(s)).toBeNull();
  });

  it('Option „ohne Städte und Einheiten“: ein Volk ohne Stadt bleibt, solange es Einheiten hat', () => {
    const { s, warrior, target } = battle();
    s.options.elimination = 'units';
    for (const pid of [HUMAN, 2, 3]) foundFor(s, pid);
    foundCity(s, 1, target);
    s.units = s.units.filter((u) => u.owner !== 1 || u.type !== UnitTypeId.Settler);
    performAttack(s, warrior, target, []);
    expect(s.cities.some((c) => c.owner === 1)).toBe(false);
    expect(s.players[1].alive).toBe(true);
    // Erst ohne jede Einheit scheidet es aus.
    s.units = s.units.filter((u) => u.owner !== 1);
    endTurn(s);
    expect(s.players[1].alive).toBe(false);
  });

  it('Speicherstände ohne foundedCity: Stadtbesitzer gelten als gegründet', () => {
    const s = createGame(generateWorld(opts), opts);
    foundFor(s, HUMAN);
    const data = toSaveData(s);
    for (const p of data.players) delete (p as { foundedCity?: boolean }).foundedCity;
    const back = fromSaveData(data);
    expect(back.players[HUMAN].foundedCity).toBe(true);
    expect(back.players[1].foundedCity).toBe(false);
  });
});

describe('Friedensschluss', () => {
  it('Schiffe nehmen ihre Ladung mit und fahren nur in Küstenstädte', () => {
    const s = createGame(generateWorld(opts), opts);
    foundFor(s, HUMAN);
    const home = foundFor(s, 1);
    // Heimatstadt zur Küstenstadt machen, fremdes Wasserfeld im Gebiet des Menschen anlegen
    s.map.terrain[neighborOf(s.map, home.tile, 0)] = Terrain.Coast;
    const water = s.tileOwner.findIndex((o, i) => o === HUMAN && !s.cities.some((c) => c.tile === i));
    s.map.terrain[water] = Terrain.Coast;
    const r = relation(s, HUMAN, 1);
    r.met = true;
    r.war = true;
    const ship = addUnit(s, 1, UnitTypeId.Galley, water);
    const cargo = addUnit(s, 1, UnitTypeId.Swordsman, water);
    cargo.carriedBy = ship.id;
    makePeace(s, HUMAN, 1, []);
    expect(ship.tile).toBe(home.tile);
    expect(cargo.tile).toBe(ship.tile);
  });

  it('Kriegserklärung beendet ein bestehendes Bündnis', () => {
    const s = createGame(generateWorld(opts), opts);
    const r = relation(s, 1, 2);
    r.met = true;
    r.alliance = true;
    declareWar(s, 1, 2, []);
    expect(r.war).toBe(true);
    expect(r.alliance).toBe(false);
  });
});

describe('Seekampf', () => {
  it('ein nachrückendes Schiff nimmt seine Ladung mit', () => {
    const { s, target } = battle();
    const from = s.units.find((u) => u.owner === HUMAN && u.type === UnitTypeId.Warrior)!.tile;
    s.units = s.units.filter((u) => u.tile !== from || u.owner !== HUMAN);
    s.map.terrain[from] = Terrain.Coast;
    s.map.terrain[target] = Terrain.Coast;
    const transport = addUnit(s, HUMAN, UnitTypeId.Galley, from);
    const passenger = addUnit(s, HUMAN, UnitTypeId.Warrior, from);
    passenger.carriedBy = transport.id;
    const victim = addUnit(s, 1, UnitTypeId.Galley, target);
    victim.hp = 1;
    s.players[HUMAN].visible[target] = 1;
    performAttack(s, transport, target, []);
    expect(s.units.includes(victim)).toBe(false);
    expect(transport.tile).toBe(target);
    expect(passenger.tile).toBe(target);
  });
});

describe('Volkswahl', () => {
  it('der Mensch bekommt das gewählte Volk, keine KI bekommt es auch', () => {
    const s = createGame(generateWorld(opts), { ...opts, leader: 5 });
    expect(s.players[HUMAN].slot).toBe(5);
    expect(s.players[HUMAN].name).toBe(PERSONAS[5].people);
    const ai = s.players.filter((p) => !p.human && !p.barbarian);
    expect(ai.every((p) => p.slot !== 5 && p.persona === PERSONAS[p.slot!])).toBe(true);
    expect(new Set(s.players.filter((p) => !p.barbarian).map((p) => p.slot)).size).toBe(ai.length + 1);
  });

  it('ohne Wahl behalten die KIs ihre bisherigen Völker (gleiche Seeds, gleiche Gegner)', () => {
    const s = createGame(generateWorld(opts), opts);
    for (const p of s.players.filter((x) => !x.human && !x.barbarian)) expect(p.persona).toBe(personaFor(opts.seed, p.id - 1));
    expect(s.players[HUMAN].slot).toBeDefined();
  });

  it('Plätze sind deterministisch und wiederholen sich nicht', () => {
    const human = [true, true, false, false, false];
    const a = assignSlots(42, human, [3]);
    expect(a).toEqual(assignSlots(42, human, [3]));
    expect(a[0]).toBe(3);
    expect(new Set(a).size).toBe(a.length);
  });

  it('Spielstand behält das Volk', () => {
    const s = createGame(generateWorld(opts), { ...opts, leader: 2 });
    expect(fromSaveData(toSaveData(s)).players[HUMAN].slot).toBe(2);
  });
});

describe('Plündererlager', () => {
  it('ein verlassenes Lager wird beim Betreten ausgehoben (vorher: blieb bestehen)', () => {
    const { s, warrior, target } = battle();
    s.camps.push({ tile: target, timer: 0 });
    const gold = s.players[HUMAN].gold;
    const res = applyCommand(s, HUMAN, { type: 'move', unit: warrior.id, target });
    expect(warrior.tile).toBe(target);
    expect(s.camps.length).toBe(0);
    expect(s.players[HUMAN].gold).toBe(gold + CAMP_REWARD);
    expect(res.events?.some((e) => e.text.includes('ausgehoben'))).toBe(true);
  });

  it('setzt keine neuen Plünderer auf fremde Einheiten im Lager', () => {
    const { s, warrior } = battle();
    s.turn = 21;
    // Lager unter dem Krieger, ringsum nur Gebirge: kein freies Feld zum Erscheinen.
    forEachNeighbor(s.map, warrior.tile, (nb) => { s.map.relief[nb] = Relief.Mountain; });
    s.camps.push({ tile: warrior.tile, timer: 10 });
    s.units = s.units.filter((u) => u.owner !== s.barbarian);
    barbarianTurn(s, [], [], []);
    expect(s.units.some((u) => u.owner === s.barbarian && u.tile === warrior.tile)).toBe(false);
  });
});

describe('Luftangriff auf See', () => {
  it('trifft das Schiff, nicht die verladenen Truppen', () => {
    const s = islands();
    aiCity(s, T(13, 8));
    const r = relation(s, HUMAN, 1);
    r.met = true;
    r.war = true;
    const sea = T(11, 4);
    s.map.terrain[sea] = Terrain.Coast;
    const ship = addUnit(s, 1, UnitTypeId.Transport, sea);
    const tank = addUnit(s, 1, UnitTypeId.Tank, sea);
    tank.carriedBy = ship.id;
    const b = addUnit(s, HUMAN, UnitTypeId.Bomber, T(10, 1));
    for (const p of s.players) {
      refreshVision(s, p.id);
      p.visible.fill(1);
    }
    const res = applyCommand(s, HUMAN, { type: 'airStrike', unit: b.id, target: sea });
    const hit = res.combats!.find((c) => c.attacker === b.id)!;
    expect(hit.defender).toBe(ship.id);
    expect(tank.hp).toBe(100);
  });
});

describe('Diplomatisches Gedächtnis', () => {
  it('verblasst alle MEMORY_FADE Runden um 1 Richtung 0', () => {
    const s = createGame(generateWorld(opts), opts);
    s.diplomacy.memory = { '1:2': -4, '2:1': 1 };
    s.turn = MEMORY_FADE * 3;
    aiDiplomacy(s, []);
    expect(s.diplomacy.memory['1:2']).toBe(-3);
    expect(s.diplomacy.memory['2:1']).toBeUndefined();
    s.turn++;
    aiDiplomacy(s, []);
    expect(s.diplomacy.memory['1:2']).toBe(-3);
  });
});
