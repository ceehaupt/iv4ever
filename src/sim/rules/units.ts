import { TechId } from './techs';

/**
 * Einheitentypen – eigene Werte.
 * Bewegungspunkte werden intern mit MOVE_SCALE multipliziert, damit Straßen
 * (Bruchteile eines Punktes) ohne Gleitkomma auskommen.
 * Neue Einträge nur hinten anhängen: Die Indizes stehen in Speicherständen.
 */
export const MOVE_SCALE = 12;

export const UnitTypeId = {
  Settler: 0,
  Worker: 1,
  Scout: 2,
  Warrior: 3,
  Spearman: 4,
  Archer: 5,
  Horseman: 6,
  Swordsman: 7,
  Catapult: 8,
  Longbowman: 9,
  Pikeman: 10,
  Knight: 11,
  Trebuchet: 12,
  Galley: 13,
  WarGalley: 14,
  Caravel: 15,
  Merchant: 16,
  Musketeer: 17,
  Cannon: 18,
  Cavalry: 19,
  Frigate: 20,
  Rifleman: 21,
  Artillery: 22,
  Ironclad: 23,
  Infantry: 24,
  Tank: 25,
  Destroyer: 26,
  Transport: 27,
  Fighter: 28,
  Bomber: 29,
  AntiAir: 30,
  Carrier: 31,
  Missionary: 32,
} as const;

/** Einheitenklassen – bestimmen Boni und Konter. */
export type UnitClass = 'civil' | 'recon' | 'melee' | 'ranged' | 'mounted' | 'siege' | 'naval' | 'air';

export const CLASS_NAMES: Record<UnitClass, string> = {
  civil: 'Zivil', recon: 'Aufklärung', melee: 'Nahkampf', ranged: 'Fernkampf', mounted: 'Beritten', siege: 'Belagerung',
  naval: 'Schiff', air: 'Flugzeug',
};

export interface UnitType {
  key: string;
  name: string;
  /** Platzhalter-Symbol bis zur eigenen Grafik (M9). */
  icon: string;
  cls: UnitClass;
  moves: number;
  /** Nahkampf- und Verteidigungsstärke. */
  strength: number;
  /** Fernkampfstärke (0 = kein Fernkampf). */
  ranged: number;
  /** Fernkampfreichweite in Feldern. */
  range: number;
  sight: number;
  canFound: boolean;
  canWork: boolean;
  /** Produktionskosten. */
  cost: number;
  /** Bevölkerung, die beim Bau abgezogen wird (Siedler). */
  popCost: number;
  tech: number | null;
  /** Benötigte strategische Ressourcen (Schlüssel aus rules/resources.ts), angebunden im eigenen Gebiet. */
  resources: readonly string[];
  /** Prozentboni gegen Klassen bzw. gegen Städte (beim Angriff). */
  vs?: Partial<Record<UnitClass, number>>;
  vsCity?: number;
  /** Verteidigungsbonus in Städten. */
  cityDefense?: number;
  /** Schiff: fährt auf Wasser. */
  naval?: boolean;
  /** Schiff darf auch auf den Ozean (sonst nur Küstengewässer). */
  ocean?: boolean;
  /** Transportplätze für Landeinheiten. */
  cargo?: number;
  /** Kann Handelsrouten errichten. */
  trade?: boolean;
  /** Flugzeug: steht in einer Stadt oder auf einem Träger; `range` = Einsatzradius, ein Einsatz je Runde. */
  air?: boolean;
  /** Fängt feindliche Luftangriffe im Einsatzradius ab (Jagdflugzeug). */
  interceptor?: boolean;
  /** Flugabwehr: beschießt angreifende Flugzeuge in diesem Umkreis (Felder). */
  antiAir?: number;
  /** Stellplätze für Flugzeuge (Flugzeugträger). */
  airCargo?: number;
  /** Verbreitet die Staatsreligion (Missionar). */
  missionary?: boolean;
}

const U = (u: Omit<UnitType, 'ranged' | 'range' | 'canFound' | 'canWork' | 'popCost' | 'tech' | 'resources'> &
  Partial<Pick<UnitType, 'ranged' | 'range' | 'canFound' | 'canWork' | 'popCost' | 'tech' | 'resources'>>): UnitType => ({
  ranged: 0,
  range: 0,
  canFound: false,
  canWork: false,
  popCost: 0,
  tech: null,
  resources: [],
  ...u,
});

const T = TechId;

export const UNIT_TYPES: readonly UnitType[] = [
  U({ key: 'settler', name: 'Siedler', icon: '⛺', cls: 'civil', moves: 1, strength: 0, sight: 1, canFound: true, cost: 35, popCost: 1 }),
  U({ key: 'worker', name: 'Arbeiter', icon: '⛏️', cls: 'civil', moves: 1, strength: 0, sight: 1, canWork: true, cost: 25 }),
  U({ key: 'scout', name: 'Späher', icon: '🧭', cls: 'recon', moves: 2, strength: 1, sight: 2, cost: 15 }),
  U({ key: 'warrior', name: 'Krieger', icon: '🪓', cls: 'melee', moves: 1, strength: 2, sight: 1, cost: 12 }),
  U({ key: 'spearman', name: 'Speerkämpfer', icon: '🔱', cls: 'melee', moves: 1, strength: 4, sight: 1, cost: 25,
    tech: T.BronzeWorking, resources: ['copper'], vs: { mounted: 100 } }),
  U({ key: 'archer', name: 'Bogenschütze', icon: '🏹', cls: 'ranged', moves: 1, strength: 2, ranged: 3, range: 2, sight: 1, cost: 22,
    tech: T.Hunting, cityDefense: 25 }),
  U({ key: 'horseman', name: 'Reiter', icon: '🐎', cls: 'mounted', moves: 2, strength: 4, sight: 1, cost: 30,
    tech: T.AnimalHusbandry, resources: ['horses'] }),
  U({ key: 'swordsman', name: 'Schwertkämpfer', icon: '⚔️', cls: 'melee', moves: 1, strength: 6, sight: 1, cost: 40,
    tech: T.IronWorking, resources: ['iron'], vsCity: 25 }),
  U({ key: 'catapult', name: 'Katapult', icon: '🪨', cls: 'siege', moves: 1, strength: 2, ranged: 6, range: 2, sight: 1, cost: 45,
    tech: T.Mathematics, vsCity: 100 }),
  U({ key: 'longbow', name: 'Langbogenschütze', icon: '🎯', cls: 'ranged', moves: 1, strength: 4, ranged: 5, range: 2, sight: 1, cost: 45,
    tech: T.Architecture, cityDefense: 50 }),
  U({ key: 'pikeman', name: 'Pikenier', icon: '🗡️', cls: 'melee', moves: 1, strength: 7, sight: 1, cost: 50,
    tech: T.Feudalism, resources: ['iron'], vs: { mounted: 100 } }),
  U({ key: 'knight', name: 'Ritter', icon: '🏇', cls: 'mounted', moves: 2, strength: 10, sight: 1, cost: 70,
    tech: T.Feudalism, resources: ['horses', 'iron'] }),
  U({ key: 'trebuchet', name: 'Tribok', icon: '🏗️', cls: 'siege', moves: 1, strength: 3, ranged: 9, range: 2, sight: 1, cost: 70,
    tech: T.Fortification, vsCity: 100 }),
  U({ key: 'galley', name: 'Galeere', icon: '🛶', cls: 'naval', moves: 3, strength: 1, sight: 2, cost: 35,
    tech: T.Sailing, naval: true, cargo: 2 }),
  U({ key: 'war_galley', name: 'Kriegsgaleere', icon: '⛵', cls: 'naval', moves: 3, strength: 3, sight: 2, cost: 40,
    tech: T.Seafaring, naval: true }),
  U({ key: 'caravel', name: 'Karavelle', icon: '🚢', cls: 'naval', moves: 4, strength: 2, sight: 2, cost: 55,
    tech: T.Astronomy, naval: true, ocean: true, cargo: 3 }),
  // --- Neuzeit und Moderne (M8) ---
  U({ key: 'merchant', name: 'Händler', icon: '🐪', cls: 'civil', moves: 2, strength: 0, sight: 1, cost: 40,
    tech: T.Currency, trade: true }),
  U({ key: 'musketeer', name: 'Musketier', icon: '💂', cls: 'melee', moves: 1, strength: 9, sight: 1, cost: 60,
    tech: T.Gunpowder }),
  U({ key: 'cannon', name: 'Kanone', icon: '💣', cls: 'siege', moves: 1, strength: 4, ranged: 12, range: 2, sight: 1, cost: 80,
    tech: T.Metallurgy, vsCity: 75 }),
  U({ key: 'cavalry', name: 'Kavallerie', icon: '🐴', cls: 'mounted', moves: 3, strength: 13, sight: 1, cost: 85,
    tech: T.MilitaryTradition, resources: ['horses'] }),
  U({ key: 'frigate', name: 'Fregatte', icon: '⛴️', cls: 'naval', moves: 5, strength: 7, sight: 2, cost: 75,
    tech: T.Navigation, naval: true, ocean: true, cargo: 2 }),
  U({ key: 'rifleman', name: 'Schützen', icon: '🎖️', cls: 'melee', moves: 1, strength: 16, sight: 1, cost: 100,
    tech: T.Rifling }),
  U({ key: 'artillery', name: 'Artillerie', icon: '🎇', cls: 'siege', moves: 1, strength: 6, ranged: 22, range: 2, sight: 1, cost: 120,
    tech: T.Electricity, vsCity: 50 }),
  U({ key: 'ironclad', name: 'Panzerschiff', icon: '🛳️', cls: 'naval', moves: 4, strength: 14, sight: 2, cost: 110,
    tech: T.SteamPower, naval: true, ocean: true, resources: ['iron'] }),
  U({ key: 'infantry', name: 'Infanterie', icon: '🪖', cls: 'melee', moves: 1, strength: 24, sight: 1, cost: 140,
    tech: T.Motorization }),
  U({ key: 'tank', name: 'Panzer', icon: '🛡', cls: 'mounted', moves: 3, strength: 32, sight: 1, cost: 180,
    tech: T.Motorization, resources: ['iron'] }),
  U({ key: 'destroyer', name: 'Zerstörer', icon: '🚤', cls: 'naval', moves: 7, strength: 24, sight: 3, cost: 140,
    tech: T.Combustion, naval: true, ocean: true }),
  U({ key: 'transport', name: 'Transporter', icon: '🚛', cls: 'naval', moves: 6, strength: 6, sight: 2, cost: 110,
    tech: T.Combustion, naval: true, ocean: true, cargo: 4 }),
  // --- Luftfahrt ---
  U({ key: 'fighter', name: 'Jagdflugzeug', icon: '✈️', cls: 'air', moves: 1, strength: 20, ranged: 12, range: 6, sight: 4, cost: 150,
    tech: T.Aviation, air: true, interceptor: true }),
  U({ key: 'bomber', name: 'Bomber', icon: '🛩️', cls: 'air', moves: 1, strength: 10, ranged: 34, range: 8, sight: 3, cost: 200,
    tech: T.Aviation, air: true, vsCity: 25, vs: { naval: 50 } }),
  U({ key: 'flak', name: 'Flugabwehr', icon: '🎯', cls: 'melee', moves: 1, strength: 20, sight: 2, cost: 110,
    tech: T.Aviation, antiAir: 2 }),
  U({ key: 'carrier', name: 'Flugzeugträger', icon: '🚢', cls: 'naval', moves: 5, strength: 14, sight: 3, cost: 180,
    tech: T.Aviation, naval: true, ocean: true, airCargo: 3 }),
  U({ key: 'missionary', name: 'Missionar', icon: '📿', cls: 'civil', moves: 2, strength: 0, sight: 1, cost: 50,
    tech: T.Theology, missionary: true }),
];

export function isAir(type: number): boolean {
  return UNIT_TYPES[type].air === true;
}

export function isNaval(type: number): boolean {
  return UNIT_TYPES[type].naval === true;
}

/** Einheiten, mit denen jede Zivilisation beginnt. */
export const START_UNITS: readonly number[] = [UnitTypeId.Settler, UnitTypeId.Warrior, UnitTypeId.Scout];

export function maxMoves(type: number): number {
  return UNIT_TYPES[type].moves * MOVE_SCALE;
}

export function isCombat(type: number): boolean {
  return UNIT_TYPES[type].strength > 0;
}

// --- Beförderungen -------------------------------------------------------------

export const PromotionId = {
  Drill1: 0,
  Drill2: 1,
  Drill3: 2,
  Rough: 3,
  Siege1: 4,
  Siege2: 5,
  Garrison1: 6,
  Garrison2: 7,
  Flank: 8,
  March: 9,
  Medic: 10,
} as const;

export interface PromotionType {
  key: string;
  name: string;
  /** Voraussetzung: mindestens eine dieser Beförderungen (leer = keine). */
  requires: readonly number[];
  /** Für welche Klassen (leer = alle Kampfklassen). */
  classes: readonly UnitClass[];
  strength?: number;
  /** Bonus in Hügeln/Wald/Dschungel (Angriff und Verteidigung). */
  rough?: number;
  vsCity?: number;
  cityDefense?: number;
  vsMounted?: number;
  moves?: number;
  /** Heilt Einheiten auf demselben Feld zusätzlich pro Runde. */
  heal?: number;
  description: string;
}

const P = PromotionId;

export const PROMOTIONS: readonly PromotionType[] = [
  { key: 'drill1', name: 'Kampferprobt I', requires: [], classes: [], strength: 15, description: '+15 % Stärke' },
  { key: 'drill2', name: 'Kampferprobt II', requires: [P.Drill1], classes: [], strength: 15, description: '+15 % Stärke' },
  { key: 'drill3', name: 'Kampferprobt III', requires: [P.Drill2], classes: [], strength: 20, description: '+20 % Stärke' },
  { key: 'rough', name: 'Waldläufer', requires: [], classes: ['melee', 'ranged', 'recon'], rough: 30,
    description: '+30 % in Hügeln, Wald und Dschungel' },
  { key: 'siege1', name: 'Sturmtrupp I', requires: [], classes: ['melee', 'siege'], vsCity: 20, description: '+20 % beim Angriff auf Städte' },
  { key: 'siege2', name: 'Sturmtrupp II', requires: [P.Siege1], classes: ['melee', 'siege'], vsCity: 30, description: '+30 % beim Angriff auf Städte' },
  { key: 'garrison1', name: 'Stadtwache I', requires: [], classes: ['melee', 'ranged'], cityDefense: 20, description: '+20 % Verteidigung in Städten' },
  { key: 'garrison2', name: 'Stadtwache II', requires: [P.Garrison1], classes: ['melee', 'ranged'], cityDefense: 30, description: '+30 % Verteidigung in Städten' },
  { key: 'flank', name: 'Flankenschutz', requires: [P.Drill1], classes: ['melee', 'mounted'], vsMounted: 50, description: '+50 % gegen Berittene' },
  { key: 'march', name: 'Gewaltmarsch', requires: [P.Drill2, P.Rough], classes: [], moves: 1, description: '+1 Bewegung' },
  { key: 'medic', name: 'Feldscher', requires: [P.Drill1, P.Garrison1], classes: [], heal: 10, description: 'Einheiten auf dem Feld heilen +10 pro Runde' },
];

/** Erfahrung, ab der die n-te Beförderung möglich ist. */
export const XP_LEVELS = [5, 12, 22, 35, 52, 75, 100];

export function xpForNext(promotions: number): number {
  return XP_LEVELS[Math.min(promotions, XP_LEVELS.length - 1)] + Math.max(0, promotions - XP_LEVELS.length + 1) * 30;
}

export function promotionChoices(type: number, owned: readonly number[]): number[] {
  const cls = UNIT_TYPES[type].cls;
  return PROMOTIONS.map((p, id) => ({ p, id }))
    .filter(({ p, id }) =>
      !owned.includes(id) &&
      (p.classes.length === 0 || p.classes.includes(cls)) &&
      (p.requires.length === 0 || p.requires.some((r) => owned.includes(r))))
    .map(({ id }) => id);
}

export function unitMaxMoves(type: number, promotions: readonly number[]): number {
  let m = UNIT_TYPES[type].moves;
  for (const p of promotions) m += PROMOTIONS[p].moves ?? 0;
  return m * MOVE_SCALE;
}
