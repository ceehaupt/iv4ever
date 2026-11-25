import type { UnitView } from '../protocol';
import { toCss } from '../render/color';
import { PLAYER_COLORS } from '../render/palette';
import { Orders } from '../sim/game';
import type { SaveMeta } from '../sim/save';
import { MOVE_SCALE, UNIT_TYPES } from '../sim/rules/units';

export type UnitAction = 'fortify' | 'skip' | 'wake' | 'disband' | 'found' | 'moveMode';

export interface GameUiHandlers {
  onEndTurn(): void;
  onAction(action: UnitAction, unitId: number): void;
  onSelectUnit(unitId: number): void;
  onSave(): void;
  onOpenLoad(): void;
  onLoad(slot: string): void;
}

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} fehlt in index.html`);
  return el as T;
}

const FRACTIONS: Record<number, string> = { 2: '⅓', 3: '½', 4: '⅔' };

/** Bewegungspunkte lesbar: 6 → "1", 3 → "½", 8 → "1⅓". */
export function formatMoves(scaled: number): string {
  const whole = Math.floor(scaled / MOVE_SCALE);
  const rest = scaled % MOVE_SCALE;
  if (!rest) return String(whole);
  const frac = FRACTIONS[rest] ?? `.${Math.round((rest / MOVE_SCALE) * 100)}`;
  return whole ? `${whole}${frac}` : frac;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Einheitenpanel, Rundenanzeige, Speicherstände und Meldungen (DOM). */
export class GameUi {
  private readonly unitPanel = $('unitpanel');
  private readonly turnLabel = $('turn');
  private readonly readyLabel = $('ready');
  private readonly endTurn = $<HTMLButtonElement>('endturn');
  private readonly savesPanel = $('saves');
  private readonly toastEl = $('toast');
  private toastTimer = 0;

  constructor(h: GameUiHandlers) {
    this.endTurn.addEventListener('click', () => h.onEndTurn());
    $('save').addEventListener('click', () => h.onSave());
    $('load').addEventListener('click', () => {
      if (this.savesPanel.hidden) h.onOpenLoad();
      else this.savesPanel.hidden = true;
    });
    this.unitPanel.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action],[data-unit]');
      if (!el) return;
      const unit = Number(el.dataset.unitId ?? el.dataset.unit);
      if (el.dataset.action) h.onAction(el.dataset.action as UnitAction, unit);
      else h.onSelectUnit(unit);
    });
    this.savesPanel.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
      if (!el) return;
      this.savesPanel.hidden = true;
      h.onLoad(el.dataset.slot!);
    });
  }

  setTurn(turn: number, ready: number): void {
    this.turnLabel.textContent = `Runde ${turn}`;
    this.readyLabel.textContent =
      ready === 0 ? 'Alle Einheiten haben Befehle' : ready === 1 ? '1 Einheit wartet' : `${ready} Einheiten warten`;
    this.endTurn.classList.toggle('pulse', ready === 0);
  }

  setBusy(busy: boolean): void {
    this.endTurn.disabled = busy;
  }

  /** Zeigt die ausgewählte Einheit und den Rest ihres Stapels. */
  showUnits(stack: UnitView[], selected: UnitView | null, human: number): void {
    if (!selected) {
      this.unitPanel.hidden = true;
      return;
    }
    const t = UNIT_TYPES[selected.type];
    const own = selected.owner === human;
    const status =
      selected.orders === Orders.Fortify
        ? t.combat ? 'befestigt' : 'schläft'
        : selected.orders === Orders.Goto
          ? 'unterwegs'
          : selected.orders === Orders.Skip
            ? 'wartet diese Runde'
            : selected.moves > 0
              ? 'bereit'
              : 'keine Bewegung mehr';
    const id = selected.id;
    const btn = (action: UnitAction, label: string, key: string, enabled = true, title = '') =>
      `<button type="button" data-action="${action}" data-unit-id="${id}" ${enabled ? '' : 'disabled'} title="${escapeHtml(title)}">${label} <kbd>${key}</kbd></button>`;
    const actions = own
      ? [
          btn('moveMode', 'Bewegen', 'M', selected.moves > 0, 'Danach Zielfeld anklicken (oder Rechtsklick auf das Ziel)'),
          selected.orders === Orders.None || selected.orders === Orders.Skip
            ? btn('fortify', t.combat ? 'Befestigen' : 'Schlafen', 'F')
            : btn('wake', 'Aufwecken', 'F'),
          btn('skip', 'Überspringen', 'Leer', selected.moves > 0),
          ...(t.canFound ? [btn('found', 'Stadt gründen', 'B', false, 'Städte kommen mit Meilenstein 3')] : []),
          btn('disband', 'Auflösen', 'Entf'),
        ].join('')
      : '';
    const others = stack.filter((u) => u.id !== id);
    const chips = others
      .map((u) => {
        const ut = UNIT_TYPES[u.type];
        const ready = u.owner === human && u.moves > 0 && u.orders === Orders.None;
        return `<button type="button" class="chip${ready ? ' ready' : ''}" data-unit="${u.id}" title="${ut.name}">${ut.icon}</button>`;
      })
      .join('');
    const color = toCss(PLAYER_COLORS[selected.owner % PLAYER_COLORS.length]);
    this.unitPanel.hidden = false;
    this.unitPanel.innerHTML = `
      <div class="unit-head">
        <span class="unit-icon" style="background:${color}">${t.icon}</span>
        <div>
          <strong>${t.name}</strong> <small>${own ? status : 'fremd'}</small>
          <div class="unit-stats">
            <span title="Bewegung">👣 ${formatMoves(selected.moves)}/${formatMoves(selected.maxMoves)}</span>
            <span title="Stärke">⚔️ ${t.strength}</span>
            <span title="Sichtweite">👁️ ${t.sight}</span>
          </div>
        </div>
      </div>
      ${actions ? `<div class="unit-actions">${actions}</div>` : ''}
      ${chips ? `<div class="unit-stack"><small>Auf diesem Feld:</small> ${chips}</div>` : ''}`;
  }

  showSaves(saves: SaveMeta[]): void {
    const fmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    this.savesPanel.innerHTML = saves.length
      ? saves
          .map(
            (s) => `<button type="button" data-slot="${escapeHtml(s.slot)}">
              <strong>${escapeHtml(s.label)}</strong> · Runde ${s.turn}
              <small>${fmt.format(s.savedAt)} · ${escapeHtml(s.mapLabel)}</small></button>`,
          )
          .join('')
      : '<p>Keine Speicherstände vorhanden.</p>';
    this.savesPanel.hidden = false;
  }

  toast(text: string, level: 'info' | 'error' = 'info'): void {
    this.toastEl.textContent = text;
    this.toastEl.className = `panel ${level}`;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), level === 'error' ? 4000 : 2500);
  }
}
