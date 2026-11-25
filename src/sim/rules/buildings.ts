import { TechId } from './techs';

/**
 * Gebäude und Weltwunder – eigene Auswahl und Werte.
 * Weltwunder (wonder: true) kann es nur einmal auf der ganzen Welt geben.
 * Neue Einträge nur hinten anhängen: Die Indizes stehen in Speicherständen.
 */
export const BuildingId = {
  Palace: 0,
  Monument: 1,
  Shrine: 2,
  Granary: 3,
  Well: 4,
  Palisade: 5,
  Library: 6,
  Market: 7,
  Harbor: 8,
  Barracks: 9,
  Forge: 10,
  Aqueduct: 11,
  Theater: 12,
  Courthouse: 13,
  University: 14,
  Castle: 15,
  Cathedral: 16,
  Bank: 17,
  EternalFlame: 18,
  TerraceGardens: 19,
  SkyWatch: 20,
  GreatAmphitheater: 21,
  TradersHarbor: 22,
  AncestorsWall: 23,
  SagesAcademy: 24,
  PrintingHouse: 25,
  Laboratory: 26,
  Factory: 27,
  PowerPlant: 28,
  Hospital: 29,
  StockExchange: 30,
  Stadium: 31,
  RadioTower: 32,
  LaunchPad: 33,
  StarDrive: 34,
  HabitatModule: 35,
  WorldFair: 36,
  BeaconOfKnowledge: 37,
} as const;

export interface BuildingType {
  key: string;
  name: string;
  icon: string;
  cost: number;
  /** false = kann nicht gebaut werden (z. B. Palast entsteht mit der ersten Stadt). */
  buildable: boolean;
  /** Benötigte Technologie (null = keine). */
  tech: number | null;
  /** Benötigtes Gebäude in derselben Stadt. */
  requires?: number;
  /** Nur in Städten am Meer. */
  coastal?: boolean;
  wonder?: boolean;
  culture: number;
  /** Zusätzliche zufriedene Bürger in dieser Stadt. */
  mood: number;
  /** Zusätzliche versorgte Bürger in dieser Stadt. */
  supply: number;
  /** Anteil des Nahrungsspeichers, der nach dem Wachstum erhalten bleibt. */
  keepFood: number;
  /** Verteidigungsbonus in Prozent (wirkt ab M5). */
  defense: number;
  /** Prozentuale Boni dieser Stadt. */
  researchPct?: number;
  goldPct?: number;
  prodPct?: number;
  /** Fester Handels-/Forschungsbonus dieser Stadt. */
  trade?: number;
  research?: number;
  /** +Nahrung auf bewirtschafteten Wasserfeldern. */
  waterFood?: number;
  /** Stadt zählt nicht für den Städte-Unterhalt. */
  noUpkeep?: boolean;
  /** Teil des Großprojekts (je Spieler einmal; alle Teile = Projektsieg). */
  project?: boolean;
  /** Wirkt in allen eigenen Städten (Wunder). */
  all?: { mood?: number; supply?: number; specialistTrade?: number; coastalTrade?: number; defense?: number };
  description: string;
}

const B = (b: Omit<BuildingType, 'buildable' | 'culture' | 'mood' | 'supply' | 'keepFood' | 'defense'> &
  Partial<Pick<BuildingType, 'buildable' | 'culture' | 'mood' | 'supply' | 'keepFood' | 'defense'>>): BuildingType => ({
  buildable: true,
  culture: 0,
  mood: 0,
  supply: 0,
  keepFood: 0,
  defense: 0,
  ...b,
});

const T = TechId;

export const BUILDINGS: readonly BuildingType[] = [
  B({ key: 'palace', name: 'Palast', icon: '🏛️', cost: 0, buildable: false, tech: null, culture: 2, mood: 1, research: 3,
    description: 'Regierungssitz. +3 Forschung, +2 Kultur, +1 Stimmung. Andere Städte werden über das Handelsnetz an ihn angebunden.' }),
  B({ key: 'monument', name: 'Denkmal', icon: '🗿', cost: 25, tech: null, culture: 2,
    description: '+2 Kultur – die Grenzen wachsen schneller.' }),
  B({ key: 'shrine', name: 'Schrein', icon: '⛩️', cost: 35, tech: T.Mysticism, culture: 1, mood: 2,
    description: '+2 Stimmung, +1 Kultur.' }),
  B({ key: 'granary', name: 'Kornspeicher', icon: '🌾', cost: 45, tech: T.Pottery, keepFood: 0.4,
    description: 'Nach dem Wachstum bleiben 40 % der Nahrung im Speicher.' }),
  B({ key: 'well', name: 'Brunnen', icon: '⛲', cost: 30, tech: null, supply: 2,
    description: '+2 Versorgung.' }),
  B({ key: 'palisade', name: 'Palisade', icon: '🪵', cost: 40, tech: null, defense: 50,
    description: '+50 % Verteidigung der Stadt (wirkt mit dem Kampfsystem).' }),
  B({ key: 'library', name: 'Bibliothek', icon: '📚', cost: 60, tech: T.Writing, culture: 1, researchPct: 50,
    description: '+50 % Forschung dieser Stadt, +1 Kultur.' }),
  B({ key: 'market', name: 'Markt', icon: '🏪', cost: 60, tech: T.Currency, goldPct: 50, mood: 1,
    description: '+50 % Gold dieser Stadt, +1 Stimmung.' }),
  B({ key: 'harbor', name: 'Hafen', icon: '⚓', cost: 55, tech: T.Sailing, coastal: true, waterFood: 1,
    description: '+1 Nahrung auf bewirtschafteten Wasserfeldern.' }),
  B({ key: 'barracks', name: 'Kaserne', icon: '🛡️', cost: 40, tech: T.BronzeWorking,
    description: 'Neue Einheiten starten mit Erfahrung (wirkt mit dem Kampfsystem).' }),
  B({ key: 'forge', name: 'Schmiede', icon: '⚒️', cost: 80, tech: T.IronWorking, prodPct: 25,
    description: '+25 % Produktion.' }),
  B({ key: 'aqueduct', name: 'Aquädukt', icon: '🚰', cost: 90, tech: T.Engineering, supply: 4,
    description: '+4 Versorgung.' }),
  B({ key: 'theater', name: 'Theater', icon: '🎭', cost: 70, tech: T.Drama, culture: 2, mood: 2,
    description: '+2 Stimmung, +2 Kultur.' }),
  B({ key: 'courthouse', name: 'Gerichtsgebäude', icon: '⚖️', cost: 60, tech: T.Law, noUpkeep: true, mood: 1,
    description: 'Stadt kostet keinen Unterhalt, +1 Stimmung.' }),
  B({ key: 'university', name: 'Universität', icon: '🎓', cost: 130, tech: T.Scholarship, requires: 6, culture: 1, researchPct: 50,
    description: '+50 % Forschung (zusätzlich zur Bibliothek), +1 Kultur.' }),
  B({ key: 'castle', name: 'Burg', icon: '🏰', cost: 100, tech: T.Fortification, requires: 5, defense: 100,
    description: '+100 % Verteidigung (wirkt mit dem Kampfsystem).' }),
  B({ key: 'cathedral', name: 'Kathedrale', icon: '⛪', cost: 120, tech: T.Theology, culture: 3, mood: 3,
    description: '+3 Stimmung, +3 Kultur.' }),
  B({ key: 'bank', name: 'Bank', icon: '🏦', cost: 110, tech: T.Banking, requires: 7, goldPct: 50,
    description: '+50 % Gold (zusätzlich zum Markt).' }),
  // --- Weltwunder ---
  B({ key: 'eternal_flame', name: 'Ewige Flamme', icon: '🔥', cost: 90, tech: T.Mysticism, wonder: true, culture: 3, all: { mood: 1 },
    description: 'Weltwunder: +3 Kultur, +1 Stimmung in allen eigenen Städten.' }),
  B({ key: 'terrace_gardens', name: 'Terrassengärten', icon: '🪴', cost: 120, tech: T.Irrigation, wonder: true, culture: 2, all: { supply: 2 },
    description: 'Weltwunder: +2 Versorgung in allen eigenen Städten, +2 Kultur.' }),
  B({ key: 'sky_watch', name: 'Himmelswarte', icon: '🔭', cost: 150, tech: T.Astronomy, wonder: true, culture: 2, research: 3, researchPct: 50,
    description: 'Weltwunder: +3 Forschung und +50 % Forschung in dieser Stadt, +2 Kultur.' }),
  B({ key: 'great_amphitheater', name: 'Großes Amphitheater', icon: '🏟️', cost: 140, tech: T.Drama, wonder: true, culture: 3, all: { mood: 1 }, mood: 2,
    description: 'Weltwunder: +1 Stimmung in allen eigenen Städten, +2 hier, +3 Kultur.' }),
  B({ key: 'traders_harbor', name: 'Hafen der Händler', icon: '⛵', cost: 130, tech: T.Seafaring, wonder: true, coastal: true, culture: 2, trade: 4, all: { coastalTrade: 1 },
    description: 'Weltwunder: +4 Handel hier, +1 Handel in allen eigenen Küstenstädten.' }),
  B({ key: 'ancestors_wall', name: 'Wall der Ahnen', icon: '🧱', cost: 170, tech: T.Fortification, wonder: true, culture: 2, all: { defense: 50 },
    description: 'Weltwunder: +50 % Verteidigung in allen eigenen Städten (wirkt mit dem Kampfsystem).' }),
  B({ key: 'sages_academy', name: 'Akademie der Weisen', icon: '🦉', cost: 180, tech: T.Philosophy, wonder: true, culture: 3, all: { specialistTrade: 1 },
    description: 'Weltwunder: Spezialisten in allen eigenen Städten +1 Handel, +3 Kultur.' }),
  // --- Neuzeit und Moderne (M8) ---
  B({ key: 'printing_house', name: 'Druckerei', icon: '🖨️', cost: 110, tech: T.Printing, culture: 2, researchPct: 15,
    description: '+2 Kultur, +15 % Forschung.' }),
  B({ key: 'laboratory', name: 'Labor', icon: '🧪', cost: 220, tech: T.Computers, requires: 14, researchPct: 50,
    description: '+50 % Forschung (braucht Universität).' }),
  B({ key: 'factory', name: 'Fabrik', icon: '🏭', cost: 200, tech: T.Industrialization, requires: 10, prodPct: 50, supply: -1,
    description: '+50 % Produktion, −1 Versorgung (braucht Schmiede).' }),
  B({ key: 'power_plant', name: 'Kraftwerk', icon: '⚡', cost: 220, tech: T.Electricity, requires: 27, prodPct: 25,
    description: '+25 % Produktion (braucht Fabrik).' }),
  B({ key: 'hospital', name: 'Krankenhaus', icon: '🏥', cost: 160, tech: T.Medicine, supply: 4, keepFood: 0.25,
    description: '+4 Versorgung, 25 % Nahrung bleibt nach dem Wachstum.' }),
  B({ key: 'stock_exchange', name: 'Börse', icon: '📈', cost: 200, tech: T.Economics, requires: 17, goldPct: 50,
    description: '+50 % Gold (braucht Bank).' }),
  B({ key: 'stadium', name: 'Stadion', icon: '🏟', cost: 180, tech: T.Ideologies, mood: 4,
    description: '+4 Stimmung.' }),
  B({ key: 'radio_tower', name: 'Sendeturm', icon: '📡', cost: 160, tech: T.Radio, culture: 4, mood: 1,
    description: '+4 Kultur, +1 Stimmung.' }),
  B({ key: 'launch_pad', name: 'Startrampe', icon: '🚀', cost: 450, tech: T.Rocketry, project: true,
    description: 'Großprojekt „Aufbruch“, Teil 1 von 3. Alle drei Teile = Projektsieg.' }),
  B({ key: 'star_drive', name: 'Sternenantrieb', icon: '☄️', cost: 600, tech: T.Computers, project: true,
    description: 'Großprojekt „Aufbruch“, Teil 2 von 3.' }),
  B({ key: 'habitat', name: 'Habitatmodul', icon: '🛰️', cost: 700, tech: T.Spaceflight, project: true,
    description: 'Großprojekt „Aufbruch“, Teil 3 von 3.' }),
  B({ key: 'world_fair', name: 'Weltausstellung', icon: '🎡', cost: 380, tech: T.Industrialization, wonder: true, culture: 6, all: { mood: 1 },
    description: 'Weltwunder: +6 Kultur, +1 Stimmung in allen eigenen Städten.' }),
  B({ key: 'beacon', name: 'Leuchtfeuer des Wissens', icon: '💡', cost: 420, tech: T.Education, wonder: true, culture: 4, researchPct: 100,
    description: 'Weltwunder: +100 % Forschung in dieser Stadt, +4 Kultur.' }),
];
