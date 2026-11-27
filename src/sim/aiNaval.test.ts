import { describe, expect, it } from 'vitest';
import { addUnit, applyCommand, endTurn, HUMAN, Orders, refreshVision } from './game';
import { aiCity, islands, T } from './testWorld';
import { landmasses } from './aiCommon';
import { relation } from './diplomacy';
import { TechId } from './rules/techs';
import { UNIT_TYPES, UnitTypeId } from './rules/units';

describe('KI-Seefahrt', () => {
  it('bringt einen Siedler ohne Platz an Land per Schiff auf eine andere Insel', () => {
    const s = islands();
    s.players[1].techs[TechId.Sailing] = 1;
    aiCity(s, T(2, 4));
    addUnit(s, 1, UnitTypeId.Warrior, T(2, 4));
    addUnit(s, 1, UnitTypeId.Settler, T(2, 4));
    addUnit(s, 1, UnitTypeId.Galley, T(2, 3));
    for (const p of s.players) refreshVision(s, p.id);
    const mass = landmasses(s.map);
    for (let t = 0; t < 15 && !s.cities.some((c) => c.owner === 1 && mass[c.tile] !== mass[T(2, 4)]); t++) endTurn(s);
    const overseas = s.cities.filter((c) => c.owner === 1 && mass[c.tile] !== mass[T(2, 4)]);
    expect(overseas.length).toBe(1);
  });

  it('gibt ein Transportschiff in Auftrag, wenn ein Siedler festsitzt und kein Schiff da ist', () => {
    const s = islands();
    s.players[1].techs[TechId.Sailing] = 1;
    aiCity(s, T(2, 4));
    addUnit(s, 1, UnitTypeId.Warrior, T(2, 4));
    addUnit(s, 1, UnitTypeId.Settler, T(2, 4));
    for (const p of s.players) refreshVision(s, p.id);
    endTurn(s);
    const city = s.cities.find((c) => c.owner === 1)!;
    expect(city.queue.some((q) => q.kind === 'unit' && (UNIT_TYPES[q.id].cargo ?? 0) > 0)).toBe(true);
  });

  it('Kriegsschiff versenkt ein angeschlagenes feindliches Schiff in Reichweite', () => {
    const s = islands();
    aiCity(s, T(2, 4));
    addUnit(s, 1, UnitTypeId.Warrior, T(2, 4));
    const own = addUnit(s, 1, UnitTypeId.WarGalley, T(2, 3));
    const enemy = addUnit(s, HUMAN, UnitTypeId.Galley, T(3, 3));
    enemy.hp = 10;
    const r = relation(s, HUMAN, 1);
    r.met = true;
    r.war = true;
    for (const p of s.players) refreshVision(s, p.id);
    endTurn(s);
    expect(s.units.includes(enemy)).toBe(false);
    expect(s.units.includes(own)).toBe(true);
  });
});

describe('KI-Invasion', () => {
  it('kriegerische KI bringt Truppen auf die Insel eines Gegners', () => {
    const s = islands();
    s.turn = 50;
    const ai = s.players[1];
    ai.persona = { ...ai.persona!, aggression: 0.9 };
    ai.techs[TechId.Sailing] = 1;
    aiCity(s, T(2, 4));
    for (let i = 0; i < 6; i++) addUnit(s, 1, UnitTypeId.Warrior, T(2, 4));
    addUnit(s, 1, UnitTypeId.Galley, T(2, 3));
    // Feindliche Stadt des Menschen auf der großen Insel.
    const hs = addUnit(s, HUMAN, UnitTypeId.Settler, T(12, 4));
    refreshVision(s, HUMAN);
    applyCommand(s, HUMAN, { type: 'found', unit: hs.id });
    const r = relation(s, HUMAN, 1);
    r.met = true;
    r.war = true;
    for (const p of s.players) refreshVision(s, p.id);
    const mass = landmasses(s.map);
    const landed = () => s.units.some((u) => u.owner === 1 && !u.carriedBy && mass[u.tile] === mass[T(12, 4)] && UNIT_TYPES[u.type].strength > 0);
    for (let t = 0; t < 12 && !landed(); t++) endTurn(s);
    expect(landed()).toBe(true);
  });
});

describe('KI-Händler', () => {
  it('errichtet mit einem Händler eine Handelsroute', () => {
    const s = islands();
    s.players[1].techs[TechId.Currency] = 1;
    aiCity(s, T(10, 1));
    aiCity(s, T(10, 8));
    aiCity(s, T(14, 4));
    for (const c of s.cities) addUnit(s, 1, UnitTypeId.Warrior, c.tile);
    addUnit(s, 1, UnitTypeId.Merchant, T(10, 1));
    for (const p of s.players) refreshVision(s, p.id);
    for (let t = 0; t < 10 && !s.routes.length; t++) endTurn(s);
    expect(s.routes.length).toBeGreaterThan(0);
  });

  it('schickt ein Schiff auf Erkundung, wenn bekannte Küsten an Unerforschtes grenzen', () => {
    const s = islands();
    s.players[1].techs[TechId.Sailing] = 1;
    aiCity(s, T(9, 2));
    aiCity(s, T(14, 6));
    // Die KI kennt nur ihre Insel und das Wasser direkt daneben.
    for (let t = 0; t < s.map.terrain.length; t++) s.players[1].explored[t] = t % 16 >= 8 ? 1 : 0;
    const galley = addUnit(s, 1, UnitTypeId.Galley, T(8, 2));
    s.turn = 30;
    endTurn(s);
    expect(galley.orders).toBe(Orders.Explore);
    expect(s.players[1].explored[T(5, 2)]).toBe(1);
  });

  it('baut ein Erkundungsschiff, wenn sie noch keines hat', () => {
    const s = islands();
    s.players[1].techs[TechId.Sailing] = 1;
    aiCity(s, T(9, 2));
    aiCity(s, T(14, 6));
    for (let t = 0; t < s.map.terrain.length; t++) s.players[1].explored[t] = t % 16 >= 8 ? 1 : 0;
    s.turn = 30;
    endTurn(s);
    expect(s.cities.some((c) => c.owner === 1 && c.queue.some((q) => q.kind === 'unit' && UNIT_TYPES[q.id].naval))).toBe(true);
  });
});

