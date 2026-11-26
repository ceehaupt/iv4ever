/**
 * Erfundene Völker und Herrscher – keine realen Personen, keine Figuren aus anderen Spielen.
 * Persönlichkeitswerte 0–1 steuern die KI.
 */
export interface Persona {
  leader: string;
  people: string;
  /** Neigung zu Krieg und Militär. */
  aggression: number;
  /** Wunsch nach vielen Städten. */
  expansion: number;
  /** Gewicht auf Forschung und Bibliotheken. */
  science: number;
  /** Gewicht auf Wunder und Kultur. */
  builder: number;
}

export const PERSONAS: readonly Persona[] = [
  { leader: 'Königin Velra', people: 'Aureliten', aggression: 0.3, expansion: 0.7, science: 0.6, builder: 0.5 },
  { leader: 'Fürst Odran', people: 'Karvanen', aggression: 0.8, expansion: 0.6, science: 0.3, builder: 0.2 },
  { leader: 'Weise Imara', people: 'Selenter', aggression: 0.2, expansion: 0.4, science: 0.9, builder: 0.6 },
  { leader: 'Hochkönig Brannoc', people: 'Durmaner', aggression: 0.6, expansion: 0.8, science: 0.4, builder: 0.3 },
  { leader: 'Kaiserin Sahvi', people: 'Tamaren', aggression: 0.4, expansion: 0.5, science: 0.5, builder: 0.9 },
  { leader: 'Kriegsherr Ulgar', people: 'Vorsken', aggression: 0.95, expansion: 0.5, science: 0.2, builder: 0.1 },
  { leader: 'Erzkanzlerin Mirel', people: 'Ostravier', aggression: 0.3, expansion: 0.6, science: 0.7, builder: 0.4 },
  { leader: 'Großfürst Telvan', people: 'Quarnesen', aggression: 0.5, expansion: 0.9, science: 0.4, builder: 0.4 },
  { leader: 'Hüterin Anwe', people: 'Lirrer', aggression: 0.15, expansion: 0.3, science: 0.6, builder: 0.8 },
  { leader: 'Despot Krayl', people: 'Morgaren', aggression: 0.85, expansion: 0.7, science: 0.3, builder: 0.2 },
];

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: 'Leicht', normal: 'Normal', hard: 'Schwer', expert: 'Sehr schwer',
};

/** Ertragsfaktor der KI auf Produktion, Forschung und Wachstum. */
export const AI_BONUS: Record<Difficulty, number> = { easy: 0.8, normal: 1, hard: 1.25, expert: 1.5 };

/** Persönlichkeit für Spieler-Index (deterministisch je Seed, ohne Wiederholung). */
export function personaFor(seed: number, index: number): Persona {
  const offset = seed % PERSONAS.length;
  return PERSONAS[(offset + index) % PERSONAS.length];
}

/** Verhalten der KI je Schwierigkeitsgrad (zusätzlich zum Ertragsfaktor AI_BONUS). */
export interface Tactics {
  /** Mindest-Siegchance für einen Angriff. */
  attackOdds: number;
  /** Mindeststärke einer Angriffsarmee (Einheiten). */
  armySize: number;
  /** Frühester Zeitpunkt für Kriegserklärungen. */
  warTurn: number;
  /** Armeegröße im Verhältnis zur Städtezahl. */
  armyFactor: number;
}

export const AI_TACTICS: Record<Difficulty, Tactics> = {
  easy: { attackOdds: 0.7, armySize: 6, warTurn: 80, armyFactor: 0.7 },
  normal: { attackOdds: 0.55, armySize: 4, warTurn: 35, armyFactor: 1 },
  hard: { attackOdds: 0.5, armySize: 4, warTurn: 30, armyFactor: 1.2 },
  expert: { attackOdds: 0.45, armySize: 5, warTurn: 25, armyFactor: 1.4 },
};
