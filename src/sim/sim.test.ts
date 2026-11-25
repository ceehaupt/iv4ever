import { describe, expect, it } from 'vitest';
import { Dir, hexDistance, neighbor, neighborOf, tileDistance, tilesInRadius } from './hex';
import { hasRiver, touchesRiver } from './map';
import { generateMap, generateWorld } from './mapgen';
import { RESOURCES, resourceFits } from './rules/resources';
import { isWater, Terrain } from './rules/terrain';

const grid = { width: 20, height: 20, wrapX: false };
const wrapGrid = { width: 20, height: 20, wrapX: true };

describe('hex', () => {
  it('Nachbarn haben Abstand 1, in beiden Zeilenparitäten', () => {
    for (const r of [4, 5]) {
      for (let dir = 0; dir < 6; dir++) {
        const n = neighbor(grid, 5, r, dir);
        expect(hexDistance(grid, 5, r, n % 20, Math.floor(n / 20))).toBe(1);
      }
    }
  });

  it('Radius 2 enthält 19 Felder', () => {
    expect(tilesInRadius(grid, 10, 10, 2)).toHaveLength(19);
    expect(new Set(tilesInRadius(grid, 10, 11, 2)).size).toBe(19);
  });

  it('Weltumrundung: Ost-Nachbar des letzten Feldes ist das erste, Distanz über die Naht', () => {
    expect(neighbor(wrapGrid, 19, 4, Dir.E)).toBe(4 * 20 + 0);
    expect(neighbor(grid, 19, 4, Dir.E)).toBe(-1);
    expect(hexDistance(wrapGrid, 0, 4, 19, 4)).toBe(1);
    expect(tilesInRadius(wrapGrid, 0, 10, 2)).toHaveLength(19);
  });

  it('Nachbarschaft ist symmetrisch (auch an der Naht)', () => {
    for (let i = 0; i < 400; i++) {
      for (let d = 0; d < 6; d++) {
        const n = neighborOf(wrapGrid, i, d);
        if (n >= 0) expect(neighborOf(wrapGrid, n, (d + 3) % 6)).toBe(i);
      }
    }
  });
});

describe('Weltgenerierung', () => {
  const opts = { width: 84, height: 52, seed: 7, players: 6 };

  it('ist deterministisch', () => {
    const a = generateWorld(opts);
    const b = generateWorld(opts);
    expect(a.map.terrain).toEqual(b.map.terrain);
    expect(a.map.river).toEqual(b.map.river);
    expect(a.map.resource).toEqual(b.map.resource);
    expect(a.starts).toEqual(b.starts);
  });

  it('trifft den Landanteil ungefähr', () => {
    const m = generateMap({ width: 84, height: 52, seed: 7, seaLevel: 'normal' });
    const land = Array.from(m.terrain).filter((t) => !isWater(t)).length;
    expect(land / m.terrain.length).toBeGreaterThan(0.33);
    expect(land / m.terrain.length).toBeLessThan(0.39);
  });

  it('Flüsse liegen nur zwischen Landfeldern und sind beidseitig sichtbar', () => {
    const { map } = generateWorld(opts);
    let edges = 0;
    for (let i = 0; i < map.terrain.length; i++) {
      for (let d = 0; d < 6; d++) {
        if (!hasRiver(map, i, d)) continue;
        edges++;
        const n = neighborOf(map, i, d);
        expect(isWater(map.terrain[i])).toBe(false);
        expect(isWater(map.terrain[n])).toBe(false);
        expect(hasRiver(map, n, (d + 3) % 6)).toBe(true);
      }
    }
    expect(edges).toBeGreaterThan(20);
  });

  it('Ressourcen passen zum Gelände', () => {
    const { map } = generateWorld(opts);
    let count = 0;
    for (let i = 0; i < map.terrain.length; i++) {
      const res = RESOURCES[map.resource[i]];
      if (!res) continue;
      count++;
      expect(resourceFits(res, map.terrain[i], map.relief[i], map.feature[i])).toBe(true);
    }
    expect(count).toBeGreaterThan(50);
  });

  it('liefert Startpositionen an Land mit Abstand', () => {
    for (const script of ['continents', 'pangaea', 'archipelago'] as const) {
      const { map, starts } = generateWorld({ ...opts, script });
      expect(starts).toHaveLength(6);
      for (const s of starts) {
        expect(isWater(map.terrain[s])).toBe(false);
        expect(map.terrain[s]).not.toBe(Terrain.Snow);
      }
      for (let a = 0; a < starts.length; a++) {
        for (let b = a + 1; b < starts.length; b++) {
          expect(tileDistance(map, starts[a], starts[b])).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it('Schwemmland liegt am Fluss', () => {
    const { map } = generateWorld({ ...opts, seed: 99, climate: 'warm' });
    for (let i = 0; i < map.feature.length; i++) {
      if (map.feature[i] === 4) expect(touchesRiver(map, i)).toBe(true);
    }
  });
});
