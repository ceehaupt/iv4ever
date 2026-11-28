import { describe, expect, it } from 'vitest';
import { addUnit, applyCommand, CommandError, createGame, endTurn, type GameState, HUMAN, Orders, refreshVision } from './game';
import { tileDistance } from './hex';
import { generateWorld } from './mapgen';
import { isWater } from './rules/terrain';
import { UnitTypeId } from './rules/units';
import { islands, T } from './testWorld';

/** Testwelt, in der der Mensch nur die Umgebung seines Spähers kennt. */
function fogged(): GameState {
  const s = islands();
  s.players[HUMAN].explored.fill(0);
  refreshVision(s, HUMAN);
  return s;
}

const scoutOf = (s: GameState) => s.units.find((u) => u.owner === HUMAN && u.type === UnitTypeId.Scout)!;
const landTiles = (s: GameState) => [...s.map.terrain.keys()].filter((t) => !isWater(s.map.terrain[t]));

describe('Erkunden', () => {
  it('zieht selbstständig ins Unbekannte, bis die erreichbare Landmasse bekannt ist', () => {
    const s = fogged();
    const scout = scoutOf(s);
    const p = s.players[HUMAN];
    const before = p.explored.reduce((a, b) => a + b, 0);
    const r = applyCommand(s, HUMAN, { type: 'explore', unit: scout.id });
    expect(scout.orders).toBe(Orders.Explore);
    expect(r.moves.length).toBe(1);
    expect(p.explored.reduce((a, b) => a + b, 0)).toBeGreaterThan(before);

    const texts: string[] = [];
    for (let k = 0; k < 30 && scout.orders === Orders.Explore; k++) {
      texts.push(...endTurn(s).events.filter((e) => e.player === HUMAN).map((e) => e.text));
    }
    expect(scout.orders).toBe(Orders.None);
    expect(texts.some((t) => t.includes('nichts mehr zu erkunden'))).toBe(true);
    // Große Insel (Spalten 9–14) vollständig bekannt; die kleine Insel ist zu Land nicht erreichbar.
    const big = landTiles(s).filter((t) => t % 16 >= 9);
    expect(big.every((t) => p.explored[t] === 1)).toBe(true);
  });

  it('ohne Unbekanntes in Reichweite wird der Befehl abgelehnt', () => {
    const s = islands(); // alles erkundet
    expect(() => applyCommand(s, HUMAN, { type: 'explore', unit: scoutOf(s).id })).toThrow(CommandError);
    expect(scoutOf(s).orders).toBe(Orders.None);
  });

  it('hält an, wenn ein Plünderer in Sicht kommt', () => {
    const s = fogged();
    const scout = scoutOf(s);
    applyCommand(s, HUMAN, { type: 'explore', unit: scout.id });
    expect(scout.orders).toBe(Orders.Explore);
    // Plünderer direkt neben den Späher stellen.
    const near = landTiles(s).find((t) => tileDistance(s.map, t, scout.tile) === 1)!;
    addUnit(s, s.barbarian, UnitTypeId.Warrior, near);
    refreshVision(s, HUMAN);
    const tile = scout.tile;
    const { events } = endTurn(s);
    expect(s.units.includes(scout)).toBe(true);
    expect(scout.orders).toBe(Orders.None);
    expect(scout.tile).toBe(tile);
    expect(events.some((e) => e.player === HUMAN && e.text.includes('Erkundung unterbrochen'))).toBe(true);
    expect(scout.exploreSeen).toBeUndefined();
  });

  it('hält an, sobald eine Einheit einer anderen Zivilisation ins Sichtfeld kommt – auch mitten im Zug', () => {
    // Friedliche Einheit von Spieler 1 in 3 Feldern Abstand (außerhalb der Sicht 2) – je nach Lage läuft der Späher hinein.
    let stoppedMidMove = 0;
    for (const t of landTiles(islands()).filter((x) => tileDistance(islands().map, x, T(14, 9)) === 3)) {
      const s = fogged();
      const scout = scoutOf(s);
      const other = addUnit(s, 1, UnitTypeId.Warrior, t);
      const r = applyCommand(s, HUMAN, { type: 'explore', unit: scout.id });
      const sees = tileDistance(s.map, scout.tile, other.tile) <= 2;
      if (!sees) continue;
      expect(scout.orders).toBe(Orders.None);
      expect(r.events?.some((e) => e.text.includes('Krieger') && e.text.includes('in Sicht'))).toBe(true);
      if (scout.moves > 0) stoppedMidMove++;
    }
    expect(stoppedMidMove).toBeGreaterThan(0);
  });

  it('schon beim Erteilen sichtbare Einheiten halten nicht an', () => {
    const s = fogged();
    const scout = scoutOf(s);
    const near = landTiles(s).find((t) => tileDistance(s.map, t, scout.tile) === 2)!;
    const other = addUnit(s, 1, UnitTypeId.Warrior, near);
    other.orders = Orders.Fortify;
    applyCommand(s, HUMAN, { type: 'explore', unit: scout.id });
    expect(scout.orders).toBe(Orders.Explore);
    expect(scout.exploreSeen).toContain(other.id);
  });

  it('Aufwecken beendet das Erkunden; Flugzeuge können nicht erkunden', () => {
    const s = fogged();
    const scout = scoutOf(s);
    applyCommand(s, HUMAN, { type: 'explore', unit: scout.id });
    applyCommand(s, HUMAN, { type: 'wake', unit: scout.id });
    expect(scout.orders).toBe(Orders.None);
    const tile = scout.tile;
    endTurn(s);
    expect(scout.tile).toBe(tile);

    const plane = addUnit(s, HUMAN, UnitTypeId.Fighter, T(12, 5));
    expect(() => applyCommand(s, HUMAN, { type: 'explore', unit: plane.id })).toThrow(CommandError);
  });

  it('mehrere Erkunder wählen verschiedene Ziele statt im Pulk zu laufen', () => {
    const opts = { width: 64, height: 40, seed: 77, players: 2 };
    const s = createGame(generateWorld(opts), opts);
    const home = s.units.find((u) => u.owner === HUMAN)!.tile;
    const a = addUnit(s, HUMAN, UnitTypeId.Warrior, home);
    const b = addUnit(s, HUMAN, UnitTypeId.Spearman, home);
    s.units = s.units.filter((u) => u.owner !== HUMAN || u === a || u === b || u.type === UnitTypeId.Settler);
    refreshVision(s, HUMAN);
    applyCommand(s, HUMAN, { type: 'explore', unit: a.id });
    applyCommand(s, HUMAN, { type: 'explore', unit: b.id });
    let together = 0;
    for (let k = 0; k < 6 && a.orders === Orders.Explore && b.orders === Orders.Explore; k++) {
      endTurn(s);
      if (tileDistance(s.map, a.tile, b.tile) <= 1) together++;
    }
    expect(together).toBeLessThanOrEqual(1);
  });

  it('ist deterministisch', () => {
    const run = () => {
      const s = fogged();
      applyCommand(s, HUMAN, { type: 'explore', unit: scoutOf(s).id });
      const trail: number[] = [];
      for (let k = 0; k < 8; k++) {
        endTurn(s);
        trail.push(scoutOf(s).tile);
      }
      return trail;
    };
    expect(run()).toEqual(run());
  });
});
