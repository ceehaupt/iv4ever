import { describe, expect, it } from 'vitest';
import { chooseWorkerTask, desiredRoads } from './autoWork';
import { assignTiles } from './city';
import { addUnit, applyCommand, endTurn, type GameState, HUMAN, Orders, refreshVision } from './game';
import { tileDistance, tilesAround } from './hex';
import { Improvement } from './rules/improvements';
import { TechId } from './rules/techs';
import { Feature } from './rules/terrain';
import { UnitTypeId } from './rules/units';
import { fromSaveData, toSaveData } from './save';
import { islands, T } from './testWorld';

/** Testwelt mit einer menschlichen Stadt mitten auf der großen Insel (Grasland), Ackerbau bekannt. */
function withCity(): { s: GameState; city: number } {
  const s = islands();
  const settler = s.units.find((u) => u.owner === HUMAN && u.type === UnitTypeId.Settler)!;
  settler.tile = T(12, 5);
  refreshVision(s, HUMAN);
  const city = applyCommand(s, HUMAN, { type: 'found', unit: settler.id }).foundedCity!;
  s.players[HUMAN].techs[TechId.Agriculture] = 1;
  return { s, city };
}

const cityOf = (s: GameState, id: number) => s.cities.find((c) => c.id === id)!;

describe('Automatische Arbeiter', () => {
  it('legt auf einem bewirtschafteten Feld eine Farm an und arbeitet danach selbst weiter', () => {
    const { s, city } = withCity();
    const c = cityOf(s, city);
    const w = addUnit(s, HUMAN, UnitTypeId.Worker, c.tile);
    applyCommand(s, HUMAN, { type: 'automate', unit: w.id });
    expect(w.auto).toBe(true);
    expect(w.orders).not.toBe(Orders.None); // braucht keinen Befehl
    for (let k = 0; k < 12; k++) endTurn(s);
    expect(w.auto).toBe(true);
    const farms = tilesAround(s.map, c.tile, 2).filter((t) => s.map.improvement[t] === Improvement.Farm);
    expect(farms.length).toBeGreaterThanOrEqual(2);
    expect(c.worked.some((t) => farms.includes(t))).toBe(true);
  });

  it('rodet Dschungel für eine Farm, lässt Wald ohne Hunger stehen und rodet nie auf Ressourcenfeldern', () => {
    const setupWith = (feature: number) => {
      const { s, city } = withCity();
      const c = cityOf(s, city);
      s.players[HUMAN].techs[TechId.BronzeWorking] = 1;
      for (const t of tilesAround(s.map, c.tile, 3)) if (t !== c.tile) s.map.feature[t] = feature;
      s.map.improvement[c.tile] = Improvement.Farm; // Stadtfeld schon verbessert
      c.size = 3;
      c.locked = [];
      assignTiles(s, c);
      return { s, w: addUnit(s, HUMAN, UnitTypeId.Worker, c.tile) };
    };
    // Dschungel (1/0/0) → gerodet mit Farm (3/0/0) lohnt immer.
    const j = setupWith(Feature.Jungle);
    const task = chooseWorkerTask(j.s, j.w, desiredRoads(j.s, HUMAN));
    expect(task?.job).toBe('clear');
    // Ressource auf dem Feld → dort wird nicht gerodet.
    j.s.map.resource[task!.tile] = 1;
    const again = chooseWorkerTask(j.s, j.w, desiredRoads(j.s, HUMAN));
    expect(again && again.tile === task!.tile && again.job === 'clear').toBeFalsy();
    // Wald auf Grasland (2/1/0) ohne Hunger: Roden kostet Produktion – bleibt stehen.
    const f = setupWith(Feature.Forest);
    expect(chooseWorkerTask(f.s, f.w, desiredRoads(f.s, HUMAN))?.job).not.toBe('clear');
  });

  it('mehrere automatische Arbeiter teilen sich die Felder auf', () => {
    const { s, city } = withCity();
    const c = cityOf(s, city);
    c.size = 3;
    const a = addUnit(s, HUMAN, UnitTypeId.Worker, c.tile);
    const b = addUnit(s, HUMAN, UnitTypeId.Worker, c.tile);
    applyCommand(s, HUMAN, { type: 'automate', unit: a.id });
    applyCommand(s, HUMAN, { type: 'automate', unit: b.id });
    const target = (u: typeof a) => (u.orders === Orders.Work ? u.tile : u.aiTarget);
    expect(target(a)).toBeDefined();
    expect(target(b)).toBeDefined();
    expect(target(a)).not.toBe(target(b));
  });

  it('jeder andere Befehl beendet die Automatik; Gegner in der Nähe halten den Arbeiter an', () => {
    const { s, city } = withCity();
    const c = cityOf(s, city);
    const w = addUnit(s, HUMAN, UnitTypeId.Worker, c.tile);
    applyCommand(s, HUMAN, { type: 'automate', unit: w.id });
    applyCommand(s, HUMAN, { type: 'wake', unit: w.id });
    expect(w.auto).toBe(false);
    expect(w.orders).toBe(Orders.None);

    const near = tilesAround(s.map, w.tile, 2).find((t) => t !== w.tile && tileDistance(s.map, t, w.tile) === 2 &&
      s.map.terrain[t] === s.map.terrain[c.tile])!;
    addUnit(s, s.barbarian, UnitTypeId.Warrior, near);
    refreshVision(s, HUMAN);
    const r = applyCommand(s, HUMAN, { type: 'automate', unit: w.id });
    expect(w.auto).toBe(false);
    expect(w.orders).toBe(Orders.None);
    expect(r.events?.some((e) => e.text.includes('Automatik unterbrochen'))).toBe(true);
  });

  it('der Automatikmodus übersteht Speichern und Laden', () => {
    const { s, city } = withCity();
    const w = addUnit(s, HUMAN, UnitTypeId.Worker, cityOf(s, city).tile);
    applyCommand(s, HUMAN, { type: 'automate', unit: w.id });
    const loaded = fromSaveData(toSaveData(s));
    expect(loaded.units.find((u) => u.id === w.id)!.auto).toBe(true);
  });

  it('nur Arbeiter können automatisch arbeiten', () => {
    const { s, city } = withCity();
    const warrior = addUnit(s, HUMAN, UnitTypeId.Warrior, cityOf(s, city).tile);
    expect(() => applyCommand(s, HUMAN, { type: 'automate', unit: warrior.id })).toThrow();
  });
});
