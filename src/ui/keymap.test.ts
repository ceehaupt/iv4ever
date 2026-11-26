import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_KEYS, KEY_ACTIONS, keyOf, Keymap } from './keymap';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
});

describe('Tastenbelegung', () => {
  it('Standardbelegung ist eindeutig (keine Taste für zwei Aktionen)', () => {
    const all = KEY_ACTIONS.flatMap((a) => DEFAULT_KEYS[a.id]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('normalisiert Tasten: Buchstaben klein, Umschalt als Präfix', () => {
    expect(keyOf({ key: 'B', shiftKey: false })).toBe('b');
    expect(keyOf({ key: 'R', shiftKey: true })).toBe('Shift+R');
    expect(keyOf({ key: '?', shiftKey: true })).toBe('?');
    expect(keyOf({ key: 'Enter', shiftKey: false })).toBe('Enter');
  });

  it('Diplomatie und Kamera kollidieren nicht mehr', () => {
    const km = new Keymap();
    expect(km.action({ key: 'd', shiftKey: false })).toBe('panRight');
    expect(km.action({ key: 'k', shiftKey: false })).toBe('diplomacy');
  });

  it('Umbelegen entzieht die Taste der alten Aktion und wird gespeichert', () => {
    const km = new Keymap();
    expect(km.assign('endTurn', 'f')).toBe('fortify');
    expect(km.action({ key: 'f', shiftKey: false })).toBe('endTurn');
    expect(km.keysOf('fortify')).toEqual([]);
    const again = new Keymap();
    expect(again.action({ key: 'f', shiftKey: false })).toBe('endTurn');
    again.reset();
    expect(again.action({ key: 'f', shiftKey: false })).toBe('fortify');
  });
});
