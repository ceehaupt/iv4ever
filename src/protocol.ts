import type { BuildItem, CityReport, TurnEvent } from './sim/city';
import type { Command, Economy, MoveEvent } from './sim/game';
import type { GameMap } from './sim/map';
import type { Climate, MapScript, SeaLevel } from './sim/mapgen';
import type { JobKind } from './sim/rules/improvements';
import type { Difficulty } from './sim/rules/leaders';
import type { CombatEvent } from './sim/war';
import type { Progress, Victory } from './sim/victory';
import type { SaveMeta } from './sim/save';

export interface NewGameOptions {
  width: number;
  height: number;
  seed: number;
  players: number;
  script: MapScript;
  seaLevel: SeaLevel;
  climate: Climate;
  difficulty: Difficulty;
  /** Spielmodus; Hotseat/Online mit mehreren Menschen. */
  mode?: GameMode;
  /** Anzahl menschlicher Spieler (Sitze 0 … humans−1). */
  humans?: number;
  /** Online: eigener Sitz. */
  seat?: number;
}

export type GameMode = 'single' | 'hotseat' | 'online';

/** Online-Aktion eines Spielers (vom Server in eine feste Reihenfolge gebracht). */
export type RemoteAction =
  | { kind: 'command'; command: Command }
  | { kind: 'endTurn' }
  /** Vom Server erzeugt, wenn ein Mensch die Verbindung verliert: Die KI übernimmt seinen Platz. */
  | { kind: 'leave' }
  /** Vom Server erzeugt, wenn er zurückkehrt: Er übernimmt sein Volk wieder. */
  | { kind: 'rejoin' };

/** Wofür ein Spielstand als Text gebraucht wird. */
export type SnapshotPurpose = 'resync' | 'export' | 'start';

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
  /** An Bord dieses Schiffes. */
  carriedBy: number | null;
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
  /** Gelände kann sich ändern (Klimawandel). */
  terrain: Uint8Array;
  /** Verschmutzung (nur erkundete Felder). */
  pollution: Uint8Array;
}

export interface PlayerView {
  id: number;
  name: string;
  human: boolean;
  barbarian: boolean;
  alive: boolean;
  /** Herrscher (nur Computerspieler). */
  leader?: string;
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
      /** Verschmutzung je Runde (Chance je Punkt 4 %, dass ein Feld verschmutzt). */
      pollution: number;
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
    /** Handelsrouten dieser Stadt (Beschreibung). */
    routes: string[];
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
  /** Spieler, dessen Sicht das ist. */
  human: number;
  mode: GameMode;
  humans: number[];
  /** Online: Menschen, die die Runde noch nicht beendet haben. */
  waitingFor: number[];
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
  diplomacy: DiplomacyView;
  victory: VictoryView;
  doctrines: { active: number[]; upheaval: number };
}

export interface CivRelationView {
  id: number;
  name: string;
  leader: string;
  war: boolean;
  openBorders: boolean;
  alliance: boolean;
  attitude: number;
  attitudeLabel: string;
  /** Militärische Stärke im Verhältnis zur eigenen (1 = gleich). */
  powerRatio: number;
  gold: number;
  /** Technologien, die man von ihnen bekommen bzw. ihnen geben könnte. */
  techsToGet: number[];
  techsToGive: number[];
}

export interface DiplomacyView {
  civs: CivRelationView[];
  /** Offene Angebote an den Betrachter, mit lesbarem Inhalt. */
  pending: { id: number; from: number; kind: string; text: string }[];
}

export interface VictoryView {
  progress: Progress;
  winner: Victory | null;
  humanAlive: boolean;
  ranking: { id: number; name: string; score: number }[];
  turnLimit: number;
}

export type ViewReason = 'new' | 'load' | 'command' | 'turn' | 'handoff' | 'waiting';

/** Nachrichten Hauptthread → Simulations-Worker. */
export type ToWorker =
  | { type: 'newGame'; options: NewGameOptions }
  | { type: 'command'; command: Command }
  | { type: 'endTurn' }
  | { type: 'save'; slot: string; label: string }
  | { type: 'load'; slot: string }
  | { type: 'listSaves' }
  | { type: 'remote'; player: number; action: RemoteAction }
  /** Mehrere Online-Aktionen auf einmal (Wiedereinstieg, nach Reparatur) – nur eine Ansicht am Ende. */
  | { type: 'remoteBatch'; actions: { player: number; action: RemoteAction }[] }
  /**
   * Spielstand aus Text laden (Datei-Import, Online-Fortsetzen, Reparatur). Online: eigener Platz; Menschen-Plätze ab
   * `humans` (nicht besetzt) übernimmt die KI.
   */
  | { type: 'loadData'; data: string; online?: { seat: number; humans?: number } }
  /** Spielstand als Text anfordern – aktueller Stand oder ein gespeicherter Platz (`slot`). */
  | { type: 'snapshot'; purpose: SnapshotPurpose; slot?: string }
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
  | { type: 'hash'; turn: number; hash: string }
  | { type: 'snapshot'; purpose: SnapshotPurpose; data: string; turn: number }
  | { type: 'notice'; text: string; level: 'info' | 'error' };
