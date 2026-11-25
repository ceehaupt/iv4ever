import type { BuildItem, CityReport, TurnEvent } from './sim/city';
import type { Command, Economy, MoveEvent } from './sim/game';
import type { GameMap } from './sim/map';
import type { Climate, MapScript, SeaLevel } from './sim/mapgen';
import type { JobKind } from './sim/rules/improvements';
import type { CombatEvent } from './sim/war';
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
  /** Arbeiterauftrag mit Fortschritt (nur eigene Einheiten). */
  job: { kind: JobKind; progress: number; turns: number } | null;
  hp: number;
  xp: number;
  promotions: number[];
  /** Erfahrung für die nächste Beförderung. */
  xpNext: number;
  /** Wählbare Beförderungen (leer = derzeit keine). */
  promotable: number[];
}

export interface ResearchView {
  known: number[];
  goal: number;
  current: number;
  progress: number;
  /** Forschung pro Runde (nach Unterhalt nicht bereinigt). */
  perTurn: number;
}

/** Veränderliche Kartenebenen (Verbesserungen, Straßen, Bewuchs), nur für erkundete Felder aktuell. */
export interface MapLayers {
  improvement: Uint8Array;
  road: Uint8Array;
  feature: Uint8Array;
}

export interface PlayerView {
  id: number;
  name: string;
  human: boolean;
  barbarian: boolean;
  alive: boolean;
}

/** Stadt aus Sicht des Menschen; Details nur für eigene Städte. */
export interface CityView {
  id: number;
  owner: number;
  name: string;
  tile: number;
  size: number;
  capital: boolean;
  /** Verteidigungsbonus der Stadt in % (Gebäude, Wunder) – für die Kampfvorhersage. */
  defense: number;
  own?: {
    foodStored: number;
    prodStored: number;
    culture: number;
    cultureToNext: number | null;
    queue: BuildItem[];
    buildings: number[];
    worked: number[];
    locked: number[];
    workable: number[];
    available: BuildItem[];
    report: CityReport;
    /** Runden bis zum Wachstum (null = wächst nicht). */
    turnsToGrow: number | null;
    /** Runden bis zur Fertigstellung des aktuellen Auftrags (null = kein Auftrag / keine Produktion). */
    turnsToBuild: number | null;
  };
}

export interface EconomyView extends Economy {
  gold: number;
  researchTotal: number;
  rate: number;
}

/** Alles, was der Hauptthread vom Spielzustand sehen darf (Nebel des Krieges!). */
export interface GameView {
  turn: number;
  human: number;
  /** Je Feld: 0 unbekannt, 1 erkundet (Nebel), 2 sichtbar. */
  fog: Uint8Array;
  units: UnitView[];
  players: PlayerView[];
  cities: CityView[];
  /** Feldbesitzer (nur auf erkundeten Feldern, sonst -1). */
  tileOwner: Int16Array;
  economy: EconomyView;
  research: ResearchView;
  layers: MapLayers;
  /** Bekannte Plündererlager (Felder). */
  camps: number[];
  barbarian: number;
}

export type ViewReason = 'new' | 'load' | 'command' | 'turn';

/** Nachrichten Hauptthread → Simulations-Worker. */
export type ToWorker =
  | { type: 'newGame'; options: NewGameOptions }
  | { type: 'command'; command: Command }
  | { type: 'endTurn' }
  | { type: 'save'; slot: string; label: string }
  | { type: 'load'; slot: string }
  | { type: 'listSaves' }
  /** Nur Entwicklung: Plünderer neben ein Feld setzen. */
  | { type: 'debugRaider'; tile: number };

/** Nachrichten Simulations-Worker → Hauptthread. */
export type FromWorker =
  | { type: 'mapReady'; map: GameMap; options: NewGameOptions; genMs: number }
  | {
      type: 'view';
      view: GameView;
      moves: MoveEvent[];
      events: TurnEvent[];
      combats: CombatEvent[];
      reason: ViewReason;
      foundedCity?: number;
    }
  | { type: 'saves'; saves: SaveMeta[] }
  | { type: 'notice'; text: string; level: 'info' | 'error' };
