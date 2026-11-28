// Tastenbelegung: Aktionen ⇄ Tasten, im Browser gespeichert und im Einstellungsdialog änderbar.
// Eine Taste ist z. B. "b", "Shift+R", "Enter", "ArrowUp" (KeyboardEvent.key, Buchstaben klein; Umschalt als Präfix).

export type KeyAction =
  | 'endTurn' | 'skip' | 'nextUnit' | 'disband' | 'fortify' | 'moveMode' | 'found' | 'load' | 'route' | 'spread' | 'explore' | 'automate' | 'center'
  | 'grid' | 'resources' | 'techs' | 'diplomacy' | 'doctrines' | 'newMap' | 'handbook'
  | 'panUp' | 'panDown' | 'panLeft' | 'panRight' | 'cursorMode';

export const KEY_ACTIONS: { id: KeyAction; label: string; group: string }[] = [
  { id: 'endTurn', label: 'Runde beenden', group: 'Allgemein' },
  { id: 'nextUnit', label: 'Nächste Einheit', group: 'Allgemein' },
  { id: 'center', label: 'Zur ausgewählten Einheit', group: 'Allgemein' },
  { id: 'techs', label: 'Technologien', group: 'Allgemein' },
  { id: 'diplomacy', label: 'Diplomatie', group: 'Allgemein' },
  { id: 'doctrines', label: 'Leitbilder', group: 'Allgemein' },
  { id: 'handbook', label: 'Handbuch', group: 'Allgemein' },
  { id: 'newMap', label: 'Neues Spiel …', group: 'Allgemein' },
  { id: 'skip', label: 'Einheit überspringen', group: 'Einheiten' },
  { id: 'fortify', label: 'Befestigen / Aufwecken', group: 'Einheiten' },
  { id: 'moveMode', label: 'Bewegen (dann Feld wählen)', group: 'Einheiten' },
  { id: 'explore', label: 'Automatisch erkunden', group: 'Einheiten' },
  { id: 'automate', label: 'Arbeiter automatisch arbeiten lassen', group: 'Einheiten' },
  { id: 'found', label: 'Stadt gründen', group: 'Einheiten' },
  { id: 'load', label: 'Auf Schiff laden', group: 'Einheiten' },
  { id: 'route', label: 'Handelsroute', group: 'Einheiten' },
  { id: 'spread', label: 'Religion verbreiten', group: 'Einheiten' },
  { id: 'disband', label: 'Einheit auflösen', group: 'Einheiten' },
  { id: 'grid', label: 'Gitter ein/aus', group: 'Karte' },
  { id: 'resources', label: 'Ressourcen ein/aus', group: 'Karte' },
  { id: 'panUp', label: 'Karte nach oben', group: 'Karte' },
  { id: 'panDown', label: 'Karte nach unten', group: 'Karte' },
  { id: 'panLeft', label: 'Karte nach links', group: 'Karte' },
  { id: 'panRight', label: 'Karte nach rechts', group: 'Karte' },
  { id: 'cursorMode', label: 'Kartencursor (Tastatur/Screenreader)', group: 'Karte' },
];

/** Standardbelegung. Mehrere Tasten je Aktion möglich. */
export const DEFAULT_KEYS: Record<KeyAction, string[]> = {
  endTurn: ['Enter'],
  skip: [' '],
  nextUnit: ['Tab', '.'],
  disband: ['Delete', 'Backspace'],
  fortify: ['f'],
  moveMode: ['m'],
  found: ['b'],
  load: ['l'],
  route: ['r'],
  spread: ['v'],
  explore: ['e'],
  automate: ['Shift+A'],
  center: ['h'],
  grid: ['g'],
  resources: ['Shift+R'],
  techs: ['t'],
  // Vorher „D“ – kollidierte mit der Kamerataste D (WASD).
  diplomacy: ['k'],
  doctrines: ['p'],
  newMap: ['n'],
  handbook: ['F1', '?'],
  panUp: ['w', 'ArrowUp'],
  panDown: ['s', 'ArrowDown'],
  panLeft: ['a', 'ArrowLeft'],
  panRight: ['d', 'ArrowRight'],
  cursorMode: ['c'],
};

const STORAGE = 'iv4ever.keys';

/** Normalisierte Bezeichnung eines Tastendrucks ("Shift+R", "b", "ArrowUp"). */
export function keyOf(e: Pick<KeyboardEvent, 'key' | 'shiftKey'>): string {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // Umschalt nur bei Buchstaben/Ziffern als eigene Taste werten; bei '?' u. ä. steckt es schon im Zeichen.
  return e.shiftKey && /^[a-z0-9]$/.test(k) ? `Shift+${k.toUpperCase()}` : k;
}

/** Anzeigeform einer Taste für Menschen. */
export function keyLabel(k: string): string {
  const names: Record<string, string> = { ' ': 'Leertaste', Enter: '⏎', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Delete: 'Entf', Backspace: '⌫', Escape: 'Esc' };
  return names[k] ?? (k.length === 1 ? k.toUpperCase() : k);
}

export class Keymap {
  private keys: Record<KeyAction, string[]>;
  private reverse = new Map<string, KeyAction>();

  constructor() {
    let stored: Partial<Record<KeyAction, string[]>> = {};
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Partial<Record<KeyAction, string[]>>;
    } catch {
      // ungültig oder nicht verfügbar → Standard
    }
    this.keys = { ...DEFAULT_KEYS, ...stored };
    this.rebuild();
  }

  private rebuild(): void {
    this.reverse.clear();
    for (const a of KEY_ACTIONS) for (const k of this.keys[a.id]) this.reverse.set(k, a.id);
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(this.keys));
    } catch {
      // nur für diese Sitzung
    }
  }

  /** Welche Aktion gehört zu diesem Tastendruck? */
  action(e: Pick<KeyboardEvent, 'key' | 'shiftKey'>): KeyAction | undefined {
    return this.reverse.get(keyOf(e));
  }

  keysOf(a: KeyAction): string[] {
    return this.keys[a];
  }

  /** Erste Taste einer Aktion für Hinweise (z. B. im Tooltip). */
  label(a: KeyAction): string {
    return this.keys[a][0] !== undefined ? keyLabel(this.keys[a][0]) : '–';
  }

  /** Aktion auf eine Taste legen; eine andere Aktion verliert sie dabei. Liefert die verdrängte Aktion. */
  assign(a: KeyAction, key: string): KeyAction | undefined {
    const previous = this.reverse.get(key);
    if (previous && previous !== a) this.keys[previous] = this.keys[previous].filter((k) => k !== key);
    this.keys[a] = [key, ...this.keys[a].filter((k) => k !== key)].slice(0, 2);
    this.rebuild();
    this.persist();
    return previous && previous !== a ? previous : undefined;
  }

  reset(): void {
    this.keys = structuredClone(DEFAULT_KEYS);
    this.rebuild();
    this.persist();
  }
}
