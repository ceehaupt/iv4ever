import { TechId } from './techs';

/**
 * Leitbilder – eigenes Politiksystem: je Bereich (Herrschaft, Wirtschaft, Gesellschaft) gilt genau ein Leitbild.
 * Ein Wechsel löst eine Runde „Umbruch“ aus (keine Forschung, kein Gold).
 */
export type DoctrineCategory = 'gov' | 'econ' | 'society';

export const CATEGORY_NAMES: Record<DoctrineCategory, string> = { gov: 'Herrschaft', econ: 'Wirtschaft', society: 'Gesellschaft' };

export interface DoctrineEffects {
  prodPct?: number;
  researchPct?: number;
  goldPct?: number;
  culturePct?: number;
  mood?: number;
  supply?: number;
  /** Zusätzliche unterhaltsfreie Einheiten je Stadt. */
  freeUnits?: number;
  /** Erfahrung für neue Kampfeinheiten. */
  xp?: number;
  /** Stimmung je Stadt, solange man im Krieg ist (negativ = Kriegsmüdigkeit). */
  warMood?: number;
  /** Zusätzlicher Handel je Handelsroute. */
  routeTrade?: number;
}

export interface Doctrine {
  key: string;
  name: string;
  category: DoctrineCategory;
  tech: number | null;
  effects: DoctrineEffects;
  description: string;
}

const T = TechId;

/** Index = Leitbild-ID. Die erste Option je Bereich ist der Grundzustand. */
export const DOCTRINES: readonly Doctrine[] = [
  { key: 'council', name: 'Stammesrat', category: 'gov', tech: null, effects: {}, description: 'Grundzustand ohne Besonderheiten.' },
  { key: 'monarchy', name: 'Erbmonarchie', category: 'gov', tech: T.Mysticism, effects: { mood: 1, freeUnits: 1 },
    description: '+1 Stimmung je Stadt, +1 freie Einheit je Stadt.' },
  { key: 'republic', name: 'Bürgerrepublik', category: 'gov', tech: T.Law, effects: { researchPct: 10, goldPct: 10, warMood: -1 },
    description: '+10 % Forschung und Gold, −1 Stimmung je Stadt im Krieg.' },
  { key: 'democracy', name: 'Volksherrschaft', category: 'gov', tech: T.Constitution, effects: { researchPct: 15, goldPct: 20, warMood: -2 },
    description: '+15 % Forschung, +20 % Gold, −2 Stimmung je Stadt im Krieg.' },
  { key: 'autocracy', name: 'Machtstaat', category: 'gov', tech: T.Ideologies, effects: { prodPct: 15, xp: 5, mood: -1 },
    description: '+15 % Produktion, neue Kampfeinheiten +5 Erfahrung, −1 Stimmung.' },
  { key: 'barter', name: 'Tauschwirtschaft', category: 'econ', tech: null, effects: {}, description: 'Grundzustand ohne Besonderheiten.' },
  { key: 'guilds', name: 'Zunftwesen', category: 'econ', tech: T.Currency, effects: { prodPct: 10, goldPct: -5 },
    description: '+10 % Produktion, −5 % Gold.' },
  { key: 'mercantile', name: 'Handelsherrschaft', category: 'econ', tech: T.Banking, effects: { goldPct: 20, researchPct: -5 },
    description: '+20 % Gold, −5 % Forschung.' },
  { key: 'free_market', name: 'Freier Markt', category: 'econ', tech: T.Economics, effects: { goldPct: 15, routeTrade: 2 },
    description: '+15 % Gold, +2 Handel je Handelsroute.' },
  { key: 'planned', name: 'Planwirtschaft', category: 'econ', tech: T.Industrialization, effects: { prodPct: 20, mood: -1 },
    description: '+20 % Produktion, −1 Stimmung.' },
  { key: 'ancestors', name: 'Ahnenverehrung', category: 'society', tech: null, effects: {}, description: 'Grundzustand ohne Besonderheiten.' },
  { key: 'temple_duty', name: 'Tempelpflicht', category: 'society', tech: T.Theology, effects: { mood: 2, culturePct: 10 },
    description: '+2 Stimmung, +10 % Kultur.' },
  { key: 'scholarship', name: 'Bildungsideal', category: 'society', tech: T.Education, effects: { researchPct: 15 },
    description: '+15 % Forschung.' },
  { key: 'liberty', name: 'Freiheitsrechte', category: 'society', tech: T.Constitution, effects: { mood: 1, culturePct: 25 },
    description: '+1 Stimmung, +25 % Kultur.' },
  { key: 'welfare', name: 'Fürsorgestaat', category: 'society', tech: T.Medicine, effects: { supply: 2, mood: 1, goldPct: -10 },
    description: '+2 Versorgung, +1 Stimmung, −10 % Gold.' },
];

export const DEFAULT_DOCTRINES: Record<DoctrineCategory, number> = { gov: 0, econ: 5, society: 10 };

export function sumEffects(ids: readonly number[]): Required<DoctrineEffects> {
  const out: Required<DoctrineEffects> = {
    prodPct: 0, researchPct: 0, goldPct: 0, culturePct: 0, mood: 0, supply: 0, freeUnits: 0, xp: 0, warMood: 0, routeTrade: 0,
  };
  for (const id of ids) {
    const e = DOCTRINES[id].effects;
    for (const k of Object.keys(out) as (keyof DoctrineEffects)[]) out[k] += e[k] ?? 0;
  }
  return out;
}
