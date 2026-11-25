import type { Command, MoveEvent } from './sim/game';
import type { GameMap } from './sim/map';
import type { Climate, MapScript, SeaLevel } from './sim/mapgen';
import type { SaveMeta } from './sim/save';

export interface NewGameOptions {
  width: number;
  height: number;
  seed: number;
  players: number;
  script: MapScript;
  seaLevel: SeaLevel;
  climate: Climate;
}

/** Einheit, wie der menschliche Spieler sie sieht. */
export interface UnitView {
  id: number;
  type: number;
  owner: number;
  tile: number;
  moves: number;
  maxMoves: number;
  orders: number;
  /** Restweg bei Marschbefehl (nur eigene Einheiten). */
  path: number[] | null;
}

export interface PlayerView {
  id: number;
  name: string;
  human: boolean;
}

/** Alles, was der Hauptthread vom Spielzustand sehen darf (Nebel des Krieges!). */
export interface GameView {
  turn: number;
  human: number;
  /** Je Feld: 0 unbekannt, 1 erkundet (Nebel), 2 sichtbar. */
  fog: Uint8Array;
  units: UnitView[];
  players: PlayerView[];
}

export type ViewReason = 'new' | 'load' | 'command' | 'turn';

/** Nachrichten Hauptthread → Simulations-Worker. */
export type ToWorker =
  | { type: 'newGame'; options: NewGameOptions }
  | { type: 'command'; command: Command }
  | { type: 'endTurn' }
  | { type: 'save'; slot: string; label: string }
  | { type: 'load'; slot: string }
  | { type: 'listSaves' };

/** Nachrichten Simulations-Worker → Hauptthread. */
export type FromWorker =
  | { type: 'mapReady'; map: GameMap; options: NewGameOptions; genMs: number }
  | { type: 'view'; view: GameView; moves: MoveEvent[]; reason: ViewReason }
  | { type: 'saves'; saves: SaveMeta[] }
  | { type: 'notice'; text: string; level: 'info' | 'error' };
