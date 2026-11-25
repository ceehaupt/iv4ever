import { describe, expect, it } from 'vitest';
import { detExp, detLn, detPow } from './detmath';

describe('deterministische Mathematik', () => {
  it('stimmt mit Math.* auf 1e-12 überein', () => {
    for (const x of [0.01, 0.25, 0.5, 1, 1.3, 2, 3.7, 10, 123.4]) {
      expect(Math.abs(detLn(x) - Math.log(x))).toBeLessThan(1e-12);
      expect(Math.abs(detPow(x, 1.3) - Math.pow(x, 1.3)) / Math.pow(x, 1.3)).toBeLessThan(1e-12);
    }
    for (const t of [-5, -1, 0, 0.5, 2, 7]) expect(Math.abs(detExp(t) - Math.exp(t)) / Math.exp(t)).toBeLessThan(1e-12);
  });
});
