import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { hasRiver } from './map';
import { generateWorld } from './mapgen';
import { fromSaveData, toSaveData } from './save';
import {
  clearRivers, decodeScenario, encodeScenario, type Scenario, ScenarioError, scenarioWorld, startBlocker, tidyTile, toggleRiverEdge, validateScenario,
} from './scenario';
import { Relief, Terrain } from './rules/terrain';
import { neighborOf } from './hex';

function sample(): Scenario {
  const w = generateWorld({ width: 48, height: 30, seed: 5, players: 3 });
  return { name: 'Test', description: 'Drei Völker', map: w.map, starts: w.starts, turnLimit: 150 };
}

describe('Szenarien', () => {
  it('überstehen Speichern und Laden unverändert', () => {
    const s = sample();
    const back = decodeScenario(encodeScenario(s));
    expect(back.name).toBe('Test');
    expect(back.turnLimit).toBe(150);
    expect(back.starts).toEqual(s.starts);
    for (const f of ['terrain', 'relief', 'feature', 'resource', 'river'] as const) expect(Array.from(back.map[f])).toEqual(Array.from(s.map[f]));
  });

  it('melden Probleme: zu wenige, ungeeignete und zu dichte Startfelder', () => {
    const s = sample();
    expect(validateScenario(s)).toEqual([]);
    const water = Array.from(s.map.terrain).findIndex((t) => t === Terrain.Ocean);
    expect(validateScenario({ ...s, starts: [s.starts[0]] })[0]).toMatch(/Mindestens 2/);
    expect(validateScenario({ ...s, starts: [...s.starts, water] }).join()).toMatch(/Wasser/);
    const near = neighborOf(s.map, s.starts[0], 0);
    s.map.terrain[near] = Terrain.Grassland;
    s.map.relief[near] = Relief.Flat;
    expect(validateScenario({ ...s, starts: [...s.starts, near] }).join()).toMatch(/zu dicht/);
  });

  it('weisen fremde und beschädigte Dateien ab; Entwürfe ohne Startfelder lassen sich laden', () => {
    expect(() => decodeScenario('{}')).toThrow(ScenarioError);
    expect(() => decodeScenario('kein json')).toThrow(ScenarioError);
    const raw = JSON.parse(encodeScenario(sample())) as { map: { terrain: string }; version: number; starts: number[] };
    expect(() => decodeScenario(JSON.stringify({ ...raw, version: 99 }))).toThrow(/neueren Version/);
    expect(() => decodeScenario(JSON.stringify({ ...raw, map: { ...raw.map, terrain: 'AAAA' } }))).toThrow(/falsche Größe/);
    const draft = JSON.stringify({ ...raw, starts: [] });
    expect(() => decodeScenario(draft)).toThrow(/Startfelder/);
    expect(decodeScenario(draft, false).starts).toEqual([]);
  });

  it('starten ein Spiel auf genau dieser Karte; Spielstände bleiben unabhängig vom Szenario', () => {
    const s = sample();
    const state = createGame(scenarioWorld(s), { width: 48, height: 30, seed: 5, players: 3 });
    expect(state.players.filter((p) => !p.barbarian)).toHaveLength(3);
    expect(state.units.filter((u) => u.owner === 0).every((u) => u.tile === s.starts[0])).toBe(true);
    state.map.road[s.starts[0]] = 1;
    expect(s.map.road[s.starts[0]]).toBe(0);
    expect(fromSaveData(toSaveData(state)).map.terrain).toEqual(state.map.terrain);
  });

  it('Editor-Helfer: Flusskanten, Aufräumen nach Geländewechsel', () => {
    const s = sample();
    const a = s.starts[0];
    const b = neighborOf(s.map, a, 1);
    clearRivers(s.map, a);
    clearRivers(s.map, b);
    expect(toggleRiverEdge(s.map, a, b)).toBe(true);
    expect(hasRiver(s.map, a, 1)).toBe(true);
    expect(hasRiver(s.map, b, 4)).toBe(true);
    toggleRiverEdge(s.map, b, a);
    expect(hasRiver(s.map, a, 1)).toBe(false);
    expect(toggleRiverEdge(s.map, a, neighborOf(s.map, b, 1))).toBe(false);
    s.map.relief[a] = Relief.Hill;
    s.map.terrain[a] = Terrain.Ocean;
    tidyTile(s.map, a);
    expect(s.map.relief[a]).toBe(Relief.Flat);
    expect(startBlocker(s.map, a)).toBe('Wasser');
  });
});
