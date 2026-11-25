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
} as const;

export interface TechType {
  key: string;
  name: string;
  /** Stufe 1–7 (Spalte im Baum, bestimmt die Kosten). */
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
];

const TIER_COST = [0, 24, 42, 70, 110, 165, 240, 330];

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
