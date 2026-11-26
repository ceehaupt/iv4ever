/**
 * Technologiebaum Antike bis Mittelalter – eigene Struktur und Kosten.
 * Freischaltungen stehen jeweils beim freigeschalteten Objekt (Gebäude, Verbesserung, Einheit)
 * im Feld `tech`; hier stehen nur Voraussetzungen, Kosten und Sondereffekte.
 */
export const TechId = {
  Agriculture: 0,
  Hunting: 1,
  Mysticism: 2,
  Mining: 3,
  Fishing: 4,
  AnimalHusbandry: 5,
  Pottery: 6,
  BronzeWorking: 7,
  Wheel: 8,
  Writing: 9,
  Sailing: 10,
  Irrigation: 11,
  Calendar: 12,
  Woodworking: 13,
  Currency: 14,
  Masonry: 15,
  Seafaring: 16,
  IronWorking: 17,
  Mathematics: 18,
  Astronomy: 19,
  Philosophy: 20,
  Drama: 21,
  Law: 22,
  Engineering: 23,
  Architecture: 24,
  Scholarship: 25,
  Theology: 26,
  Fortification: 27,
  Feudalism: 28,
  Banking: 29,
  // --- Neuzeit und Moderne (M8) ---
  Printing: 30,
  Gunpowder: 31,
  Navigation: 32,
  Economics: 33,
  Constitution: 34,
  Physics: 35,
  Metallurgy: 36,
  MilitaryTradition: 37,
  Education: 38,
  SteamPower: 39,
  Chemistry: 40,
  Railroad: 41,
  Industrialization: 42,
  Electricity: 43,
  Rifling: 44,
  Medicine: 45,
  Combustion: 46,
  Ideologies: 47,
  Radio: 48,
  Motorization: 49,
  Rocketry: 50,
  Computers: 51,
  Spaceflight: 52,
  Globalization: 53,
  Aviation: 54,
} as const;

export interface TechType {
  key: string;
  name: string;
  /** Stufe 1–15 (Spalte im Baum, bestimmt die Kosten). */
  tier: number;
  prereqs: readonly number[];
  /** Sondereffekte, die nicht über `tech`-Felder anderer Tabellen laufen. */
  effect?: string;
}

const T = TechId;

export const TECHS: readonly TechType[] = [
  { key: 'agriculture', name: 'Ackerbau', tier: 1, prereqs: [] },
  { key: 'hunting', name: 'Jagd', tier: 1, prereqs: [] },
  { key: 'mysticism', name: 'Mystik', tier: 1, prereqs: [] },
  { key: 'mining', name: 'Bergbau', tier: 1, prereqs: [] },
  { key: 'fishing', name: 'Fischerei', tier: 1, prereqs: [], effect: 'Fisch und Perlen bringen ihren Bonus' },
  { key: 'husbandry', name: 'Tierzucht', tier: 2, prereqs: [T.Hunting] },
  { key: 'pottery', name: 'Töpferei', tier: 2, prereqs: [T.Agriculture] },
  { key: 'bronze', name: 'Bronzeverarbeitung', tier: 2, prereqs: [T.Mining], effect: 'Arbeiter können Wald und Dschungel roden' },
  { key: 'wheel', name: 'Rad', tier: 2, prereqs: [T.Agriculture], effect: 'Arbeiter bauen Straßen' },
  { key: 'writing', name: 'Schrift', tier: 3, prereqs: [T.Pottery] },
  { key: 'sailing', name: 'Segeln', tier: 2, prereqs: [T.Fishing] },
  { key: 'irrigation', name: 'Bewässerung', tier: 3, prereqs: [T.Pottery, T.Wheel], effect: 'Farmen +1 🌾 an Flüssen und Seen' },
  { key: 'calendar', name: 'Kalender', tier: 3, prereqs: [T.Mysticism, T.Agriculture] },
  { key: 'woodworking', name: 'Holzhandwerk', tier: 3, prereqs: [T.BronzeWorking] },
  { key: 'currency', name: 'Währung', tier: 4, prereqs: [T.Writing, T.Wheel] },
  { key: 'masonry', name: 'Steinmetzkunst', tier: 3, prereqs: [T.Mining, T.Mysticism] },
  { key: 'seafaring', name: 'Seefahrt', tier: 4, prereqs: [T.Sailing, T.Calendar], effect: 'Küstenstädte sind über das Meer verbunden' },
  { key: 'iron', name: 'Eisenverarbeitung', tier: 4, prereqs: [T.BronzeWorking] },
  { key: 'mathematics', name: 'Mathematik', tier: 4, prereqs: [T.Writing, T.Masonry] },
  { key: 'astronomy', name: 'Astronomie', tier: 5, prereqs: [T.Calendar, T.Mathematics] },
  { key: 'philosophy', name: 'Philosophie', tier: 4, prereqs: [T.Writing, T.Mysticism] },
  { key: 'drama', name: 'Theaterkunst', tier: 5, prereqs: [T.Mysticism, T.Currency] },
  { key: 'law', name: 'Gesetzgebung', tier: 5, prereqs: [T.Writing, T.Currency] },
  { key: 'engineering', name: 'Ingenieurwesen', tier: 5, prereqs: [T.Mathematics, T.Wheel], effect: 'Straßen kosten nur noch ¼ Bewegung' },
  { key: 'architecture', name: 'Baukunst', tier: 5, prereqs: [T.Masonry, T.Mathematics] },
  { key: 'scholarship', name: 'Gelehrsamkeit', tier: 6, prereqs: [T.Philosophy, T.Astronomy] },
  { key: 'theology', name: 'Theologie', tier: 6, prereqs: [T.Philosophy, T.Drama] },
  { key: 'fortification', name: 'Burgenbau', tier: 6, prereqs: [T.IronWorking, T.Engineering] },
  { key: 'feudalism', name: 'Lehnswesen', tier: 7, prereqs: [T.Law, T.Fortification], effect: '+1 freie Einheit je Stadt' },
  { key: 'banking', name: 'Bankwesen', tier: 7, prereqs: [T.Law, T.Scholarship] },
  { key: 'printing', name: 'Buchdruck', tier: 7, prereqs: [T.Scholarship, T.Theology] },
  { key: 'gunpowder', name: 'Schießpulver', tier: 7, prereqs: [T.IronWorking, T.Fortification] },
  { key: 'navigation', name: 'Navigation', tier: 6, prereqs: [T.Seafaring, T.Astronomy], effect: 'Alle Schiffe dürfen auf den Ozean' },
  { key: 'economics', name: 'Ökonomie', tier: 8, prereqs: [T.Banking, T.Printing] },
  { key: 'constitution', name: 'Verfassung', tier: 8, prereqs: [T.Law, T.Printing] },
  { key: 'physics', name: 'Physik', tier: 8, prereqs: [T.Astronomy, T.Printing] },
  { key: 'metallurgy', name: 'Metallurgie', tier: 8, prereqs: [T.Gunpowder] },
  { key: 'military_tradition', name: 'Militärtradition', tier: 8, prereqs: [T.Gunpowder, T.Feudalism] },
  { key: 'education', name: 'Bildungswesen', tier: 9, prereqs: [T.Constitution, T.Physics] },
  { key: 'steam', name: 'Dampfkraft', tier: 9, prereqs: [T.Physics, T.Metallurgy] },
  { key: 'chemistry', name: 'Chemie', tier: 9, prereqs: [T.Metallurgy, T.Physics] },
  { key: 'railroad', name: 'Eisenbahn', tier: 10, prereqs: [T.SteamPower], effect: 'Straßen kosten nur noch ⅙ Bewegung' },
  { key: 'industrialization', name: 'Industrialisierung', tier: 10, prereqs: [T.SteamPower, T.Economics] },
  { key: 'electricity', name: 'Elektrizität', tier: 11, prereqs: [T.Industrialization, T.Chemistry] },
  { key: 'rifling', name: 'Präzisionswaffen', tier: 10, prereqs: [T.Chemistry, T.MilitaryTradition] },
  { key: 'medicine', name: 'Medizin', tier: 10, prereqs: [T.Chemistry, T.Education] },
  { key: 'combustion', name: 'Verbrennungsmotor', tier: 12, prereqs: [T.Electricity, T.Railroad] },
  { key: 'ideologies', name: 'Ideologien', tier: 11, prereqs: [T.Industrialization, T.Constitution] },
  { key: 'radio', name: 'Funktechnik', tier: 12, prereqs: [T.Electricity] },
  { key: 'motorization', name: 'Motorisierung', tier: 13, prereqs: [T.Combustion, T.Rifling] },
  { key: 'rocketry', name: 'Raketentechnik', tier: 13, prereqs: [T.Combustion, T.Radio] },
  { key: 'computers', name: 'Computer', tier: 14, prereqs: [T.Radio, T.Rocketry] },
  { key: 'spaceflight', name: 'Raumfahrt', tier: 15, prereqs: [T.Rocketry, T.Computers] },
  { key: 'globalization', name: 'Globalisierung', tier: 15, prereqs: [T.Computers, T.Ideologies], effect: '+1 Handel je Handelsroute' },
  // Nachträglich angehängt (Indizes stehen in Speicherständen).
  { key: 'aviation', name: 'Luftfahrt', tier: 13, prereqs: [T.Combustion, T.Radio] },
];

const TIER_COST = [0, 24, 42, 70, 110, 165, 240, 330, 430, 540, 660, 800, 950, 1120, 1300, 1500];

export function techCost(id: number): number {
  return TIER_COST[TECHS[id].tier];
}

/** Bekannte Technologien als Bitfeld-Array (Index = Tech-ID). */
export type TechSet = Uint8Array;

export function canResearch(known: TechSet, id: number): boolean {
  return !known[id] && TECHS[id].prereqs.every((p) => known[p]);
}

/**
 * Nächster Schritt auf dem Weg zum Ziel: die erforschbare Voraussetzung mit der
 * kleinsten Stufe (bei Gleichstand kleinste ID). -1, wenn das Ziel schon bekannt ist.
 */
export function nextStepTowards(known: TechSet, goal: number): number {
  if (known[goal]) return -1;
  const needed = new Set<number>();
  const visit = (id: number) => {
    if (known[id] || needed.has(id)) return;
    needed.add(id);
    for (const p of TECHS[id].prereqs) visit(p);
  };
  visit(goal);
  let best = -1;
  for (const id of needed) {
    if (!canResearch(known, id)) continue;
    if (best < 0 || TECHS[id].tier < TECHS[best].tier || (TECHS[id].tier === TECHS[best].tier && id < best)) best = id;
  }
  return best;
}

/** Summe der Kosten aller noch fehlenden Technologien bis zum Ziel. */
export function costTowards(known: TechSet, goal: number): number {
  const needed = new Set<number>();
  const visit = (id: number) => {
    if (known[id] || needed.has(id)) return;
    needed.add(id);
    for (const p of TECHS[id].prereqs) visit(p);
  };
  visit(goal);
  let sum = 0;
  for (const id of needed) sum += techCost(id);
  return sum;
}
