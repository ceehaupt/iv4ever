/**
 * Gebäude – eigene Auswahl und Werte. Technologie-Voraussetzungen kommen mit M4.
 */
export const BuildingId = {
  Palace: 0,
  Monument: 1,
  Shrine: 2,
  Granary: 3,
  Well: 4,
  Palisade: 5,
} as const;

export interface BuildingType {
  key: string;
  name: string;
  icon: string;
  cost: number;
  /** false = kann nicht gebaut werden (z. B. Palast entsteht mit der ersten Stadt). */
  buildable: boolean;
  culture: number;
  /** Zusätzliche zufriedene Bürger. */
  mood: number;
  /** Zusätzliche versorgte Bürger. */
  supply: number;
  /** Anteil des Nahrungsspeichers, der nach dem Wachstum erhalten bleibt. */
  keepFood: number;
  /** Verteidigungsbonus in Prozent (wirkt ab M5). */
  defense: number;
  description: string;
}

export const BUILDINGS: readonly BuildingType[] = [
  { key: 'palace', name: 'Palast', icon: '🏛️', cost: 0, buildable: false, culture: 2, mood: 1, supply: 0, keepFood: 0, defense: 0,
    description: 'Regierungssitz. +2 Kultur, +1 zufriedener Bürger.' },
  { key: 'monument', name: 'Denkmal', icon: '🗿', cost: 25, buildable: true, culture: 2, mood: 0, supply: 0, keepFood: 0, defense: 0,
    description: '+2 Kultur – die Grenzen wachsen schneller.' },
  { key: 'shrine', name: 'Schrein', icon: '⛩️', cost: 35, buildable: true, culture: 1, mood: 2, supply: 0, keepFood: 0, defense: 0,
    description: '+2 zufriedene Bürger, +1 Kultur.' },
  { key: 'granary', name: 'Kornspeicher', icon: '🌾', cost: 45, buildable: true, culture: 0, mood: 0, supply: 0, keepFood: 0.4, defense: 0,
    description: 'Nach dem Wachstum bleiben 40 % der Nahrung im Speicher.' },
  { key: 'well', name: 'Brunnen', icon: '⛲', cost: 30, buildable: true, culture: 0, mood: 0, supply: 2, keepFood: 0, defense: 0,
    description: '+2 versorgte Bürger.' },
  { key: 'palisade', name: 'Palisade', icon: '🪵', cost: 40, buildable: true, culture: 0, mood: 0, supply: 0, keepFood: 0, defense: 50,
    description: '+50 % Verteidigung der Stadt (wirkt mit dem Kampfsystem).' },
];
