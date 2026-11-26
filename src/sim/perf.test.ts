import { describe, expect, it } from 'vitest';
import { createGame, endTurn } from './game';
import { generateWorld } from './mapgen';

// Leistungsbudgets aus docs/ROADMAP.md. Grenzen mit Puffer für langsamere CI-Rechner (Faktor ~3).
const HUGE = { width: 140, height: 88, players: 8, seed: 31337, humans: 0 };

describe('Leistung', () => {
  it('Kartenerzeugung „Riesig“ bleibt im Budget (Ziel < 200 ms)', () => {
    generateWorld({ ...HUGE, seed: 1 }); // Aufwärmen (JIT)
    const t0 = performance.now();
    generateWorld(HUGE);
    expect(performance.now() - t0).toBeLessThan(600);
  });

  it('KI-Runde mit 8 Völkern auf „Riesig“ bleibt bis in die späte Partie im Budget (Ziel < 1 s)', () => {
    const s = createGame(generateWorld(HUGE), HUGE);
    let worst = 0;
    let total = 0;
    const turns = 220;
    for (let t = 0; t < turns && !s.winner; t++) {
      const t0 = performance.now();
      endTurn(s);
      const dt = performance.now() - t0;
      total += dt;
      worst = Math.max(worst, dt);
    }
    expect(worst).toBeLessThan(1000);
    expect(total / turns).toBeLessThan(150);
  }, 120_000);
});
