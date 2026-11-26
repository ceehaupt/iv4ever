import { describe, expect, it } from 'vitest';
import { createGame, endTurn } from './game';
import { stateHash } from './hash';
import { generateWorld } from './mapgen';
import { fromSaveData, toSaveData } from './save';
import { decodeSave, encodeSave } from './saveCodec';

describe('Spielstand als Text', () => {
  it('Hin- und Rückweg ergeben denselben Spielstand, der identisch weiterläuft', () => {
    const opts = { width: 48, height: 30, seed: 5, players: 3, humans: 0 };
    const a = createGame(generateWorld(opts), opts);
    for (let t = 0; t < 30; t++) endTurn(a);
    const text = encodeSave(toSaveData(a));
    const b = fromSaveData(decodeSave(text));
    expect(stateHash(b)).toBe(stateHash(a));
    expect(b.map.terrain).toEqual(a.map.terrain);
    for (let t = 0; t < 20; t++) {
      endTurn(a);
      endTurn(b);
    }
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it('lehnt fremde Dateien ab', () => {
    expect(() => decodeSave('{"foo":1}')).toThrow('Keine iv4ever-Spielstanddatei');
  });
});
