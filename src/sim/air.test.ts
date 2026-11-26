import { describe, expect, it } from 'vitest';
import { addUnit, applyCommand, CommandError, endTurn, HUMAN, refreshVision } from './game';
import { relation } from './diplomacy';
import { fromSaveData, toSaveData } from './save';
import { TECHS, TechId } from './rules/techs';
import { UnitTypeId } from './rules/units';
import { aiCity, islands, T } from './testWorld';

/** Mensch mit Stadt auf der großen Insel, KI-Stadt daneben, Krieg. */
function war() {
  const s = islands();
  const st = addUnit(s, HUMAN, UnitTypeId.Settler, T(10, 1));
  refreshVision(s, HUMAN);
  applyCommand(s, HUMAN, { type: 'found', unit: st.id });
  aiCity(s, T(13, 8));
  const r = relation(s, HUMAN, 1);
  r.met = true;
  r.war = true;
  for (const p of s.players) p.explored.fill(1);
  return s;
}
const see = (s: ReturnType<typeof islands>) => {
  for (const p of s.players) {
    refreshVision(s, p.id);
    p.visible.fill(1);
  }
};

describe('Luftfahrt', () => {
  it('Bomber greift im Einsatzradius an, zieht aber nicht über die Karte', () => {
    const s = war();
    const b = addUnit(s, HUMAN, UnitTypeId.Bomber, T(10, 1));
    const target = addUnit(s, 1, UnitTypeId.Infantry, T(12, 6));
    see(s);
    expect(() => applyCommand(s, HUMAN, { type: 'move', unit: b.id, target: T(10, 2) })).toThrow(CommandError);
    const res = applyCommand(s, HUMAN, { type: 'airStrike', unit: b.id, target: T(12, 6) });
    expect(res.combats!.length).toBe(1);
    expect(target.hp).toBeLessThan(100);
    expect(b.hp).toBe(100); // keine Gegenwehr vom Boden
    expect(() => applyCommand(s, HUMAN, { type: 'airStrike', unit: b.id, target: T(12, 6) })).toThrow('schon im Einsatz');
  });

  it('außer Reichweite und gegen leere Felder nicht möglich', () => {
    const s = war();
    const f = addUnit(s, HUMAN, UnitTypeId.Fighter, T(10, 1));
    addUnit(s, 1, UnitTypeId.Infantry, T(2, 9));
    see(s);
    expect(() => applyCommand(s, HUMAN, { type: 'airStrike', unit: f.id, target: T(2, 9) })).toThrow('Außer Reichweite');
    expect(() => applyCommand(s, HUMAN, { type: 'airStrike', unit: f.id, target: T(11, 2) })).toThrow('Kein Ziel');
  });

  it('Abfangjäger und Flugabwehr beschädigen den Angreifer; jeder Jäger fängt nur einmal pro Runde ab', () => {
    const s = war();
    const b1 = addUnit(s, HUMAN, UnitTypeId.Bomber, T(10, 1));
    const b2 = addUnit(s, HUMAN, UnitTypeId.Bomber, T(10, 1));
    addUnit(s, 1, UnitTypeId.Infantry, T(13, 8));
    const jet = addUnit(s, 1, UnitTypeId.Fighter, T(13, 8));
    see(s);
    const r1 = applyCommand(s, HUMAN, { type: 'airStrike', unit: b1.id, target: T(13, 8) });
    expect(r1.combats!.some((c) => c.attacker === jet.id)).toBe(true);
    expect(jet.interceptedTurn).toBe(s.turn);
    const r2 = applyCommand(s, HUMAN, { type: 'airStrike', unit: b2.id, target: T(13, 8) });
    expect(r2.combats!.some((c) => c.attacker === jet.id)).toBe(false);
    expect(b2.hp).toBe(100);
    // Flugabwehr im Umkreis von 2 Feldern schießt ebenfalls.
    const s2 = war();
    const b3 = addUnit(s2, HUMAN, UnitTypeId.Bomber, T(10, 1));
    addUnit(s2, 1, UnitTypeId.Infantry, T(12, 6));
    addUnit(s2, 1, UnitTypeId.AntiAir, T(13, 7));
    see(s2);
    applyCommand(s2, HUMAN, { type: 'airStrike', unit: b3.id, target: T(12, 6) });
    expect(b3.hp).toBeLessThan(100);
  });

  it('Verlegen auf einen Träger: der Träger nimmt das Flugzeug mit, versenkt reißt er es mit', () => {
    const s = war();
    const carrier = addUnit(s, HUMAN, UnitTypeId.Carrier, T(8, 2));
    const f = addUnit(s, HUMAN, UnitTypeId.Fighter, T(10, 1));
    see(s);
    applyCommand(s, HUMAN, { type: 'rebase', unit: f.id, target: T(8, 2) });
    expect(f.tile).toBe(T(8, 2));
    expect(f.carriedBy).toBe(carrier.id);
    applyCommand(s, HUMAN, { type: 'move', unit: carrier.id, target: T(6, 2) });
    expect(f.tile).toBe(carrier.tile);
    // Kein Platz mehr nach drei Flugzeugen.
    for (let i = 0; i < 2; i++) {
      const x = addUnit(s, HUMAN, UnitTypeId.Fighter, T(10, 1));
      applyCommand(s, HUMAN, { type: 'rebase', unit: x.id, target: carrier.tile });
    }
    const extra = addUnit(s, HUMAN, UnitTypeId.Fighter, T(10, 1));
    expect(() => applyCommand(s, HUMAN, { type: 'rebase', unit: extra.id, target: carrier.tile })).toThrow('freiem Platz');
    // Träger versenken (Bomber der KI).
    carrier.hp = 1;
    // Die Jäger an Bord würden den Angreifer abfangen – für diesen Teil schon im Einsatz.
    for (const x of s.units.filter((u) => u.carriedBy === carrier.id)) x.interceptedTurn = s.turn;
    const kb = addUnit(s, 1, UnitTypeId.Bomber, T(9, 4));
    s.players[1].visible.fill(1);
    applyCommand(s, 1, { type: 'airStrike', unit: kb.id, target: carrier.tile });
    expect(s.units.includes(carrier)).toBe(false);
    expect(s.units.includes(f)).toBe(false);
  });

  it('Flugzeuge verteidigen keine Stadt und gehen bei der Eroberung verloren', () => {
    const s = war();
    const city = s.cities.find((c) => c.owner === 1)!;
    const plane = addUnit(s, 1, UnitTypeId.Fighter, city.tile);
    for (const u of s.units.filter((x) => x.owner === 1 && x.tile === city.tile && x !== plane)) s.units.splice(s.units.indexOf(u), 1);
    const tank = addUnit(s, HUMAN, UnitTypeId.Tank, T(12, 8));
    see(s);
    applyCommand(s, HUMAN, { type: 'attack', unit: tank.id, target: city.tile });
    expect(city.owner).toBe(HUMAN);
    expect(s.units.includes(plane)).toBe(false);
  });

  it('die KI fliegt im Krieg Luftangriffe', () => {
    const s = war();
    const kb = addUnit(s, 1, UnitTypeId.Bomber, T(13, 8));
    // Ziele in Sichtweite der KI (sie greift nur an, was sie sieht); sie wählt das lohnendste.
    addUnit(s, HUMAN, UnitTypeId.Infantry, T(12, 6));
    see(s);
    const before = s.units.filter((u) => u.owner === HUMAN).map((u) => `${u.id}:${u.hp}`).join();
    endTurn(s);
    const after = s.units.filter((u) => u.owner === HUMAN).map((u) => `${u.id}:${u.hp}`).join();
    expect(after).not.toBe(before);
    expect(s.units.includes(kb)).toBe(true);
  });

  it('ältere Spielstände mit weniger Technologien lassen sich laden', () => {
    const s = war();
    const data = toSaveData(s);
    for (const p of data.players) p.techs = p.techs.slice(0, TECHS.length - 1);
    const loaded = fromSaveData(data);
    expect(loaded.players[0].techs.length).toBe(TECHS.length);
    loaded.players[0].techs[TechId.Aviation] = 1;
    expect(loaded.players[0].techs[TechId.Aviation]).toBe(1);
  });
});
