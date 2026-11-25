import type { GameMap } from './sim/map';
import type { Climate, MapScript, SeaLevel } from './sim/mapgen';

export interface NewGameOptions {
  width: number;
  height: number;
  seed: number;
  players: number;
  script: MapScript;
  seaLevel: SeaLevel;
  climate: Climate;
}

/** Nachrichten Hauptthread → Simulations-Worker. */
export type ToWorker = { type: 'newGame'; options: NewGameOptions };

/** Nachrichten Simulations-Worker → Hauptthread. */
export type FromWorker = { type: 'mapReady'; map: GameMap; starts: number[]; genMs: number };
