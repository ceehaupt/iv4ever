import type { EconomyView, UnitView } from '../protocol';
import type { TurnEvent } from '../sim/city';
import { type JobKind, JOB_ICONS, JOB_NAMES } from '../sim/rules/improvements';
import { toCss } from '../render/color';
import { playerColor } from '../render/palette';
import { Orders } from '../sim/game';
import type { SaveMeta } from '../sim/save';
import { CLASS_NAMES, MOVE_SCALE, PROMOTIONS, UNIT_TYPES } from '../sim/rules/units';

export type UnitAction =
  | 'fortify' | 'skip' | 'wake' | 'disband' | 'found' | 'moveMode' | `job:${JobKind}` | `promote:${number}`;

/** Arbeiteraufträge, die der Spieler grundsätzlich kennt, mit Grund, falls hier nicht möglich. */
export interface JobOption {
  job: JobKind;
  turns: number;
  blocker: string | null;
}

export interface GameUiHandlers {
  onEndTurn(): void;
  onAction(action: UnitAction, unitId: number): void;
  onSelectUnit(unitId: number): void;
  onSave(): void;
  onOpenLoad(): void;
  onLoad(slot: string): void;
  onRate(rate: number): void;
  onEventClick(tile: number): void;
  onOpenTech(): void;
}

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} fehlt in index.html`);
  return el as T;
}

const FRACTIONS: Record<number, string> = { 3: '¼', 4: '⅓', 6: '½', 8: '⅔', 9: '¾' };

/** Bewegungspunkte lesbar (MOVE_SCALE = 1): 12 → "1", 6 → "½", 16 → "1⅓". */
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
  private readonly econEl = $('economy');
  private readonly rateEl = $<HTMLInputElement>('rate');
  private readonly rateVal = $('rateval');
  private readonly logEl = $('log');
  private readonly researchEl = $<HTMLButtonElement>('research');
  private toastTimer = 0;

  constructor(h: GameUiHandlers) {
    this.endTurn.addEventListener('click', () => h.onEndTurn());
    this.researchEl.addEventListener('click', () => h.onOpenTech());
    this.rateEl.addEventListener('input', () => (this.rateVal.textContent = `${this.rateEl.value} %`));
    this.rateEl.addEventListener('change', () => h.onRate(Number(this.rateEl.value)));
    this.logEl.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tile]');
      if (el) h.onEventClick(Number(el.dataset.tile));
      else if ((e.target as HTMLElement).closest('[data-close]')) this.logEl.hidden = true;
    });
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

  setEconomy(e: EconomyView): void {
    const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));
    const upkeep = e.cityUpkeep + e.unitUpkeep;
    this.econEl.innerHTML = `
      <span title="Gold (Einnahmen − Unterhalt pro Runde)">💰 ${e.gold} <small>(${sign(e.net)})</small></span>
      <span title="Forschung pro Runde (angesammelt)">🔬 +${e.research} <small>(${e.researchTotal})</small></span>
      ${upkeep ? `<small title="Unterhalt: Städte ${e.cityUpkeep}, Einheiten ${e.unitUpkeep} (frei: ${e.freeUnits})">Unterhalt ${upkeep}</small>` : ''}`;
    if (document.activeElement !== this.rateEl) {
      this.rateEl.value = String(e.rate);
      this.rateVal.textContent = `${e.rate} %`;
    }
  }

  setResearch(summary: string, missing: boolean): void {
    this.researchEl.textContent = `🔬 ${summary}`;
    this.researchEl.classList.toggle('pulse', missing);
  }

  hideEvents(): void {
    this.logEl.hidden = true;
  }

  showEvents(events: TurnEvent[]): void {
    if (!events.length) {
      this.logEl.hidden = true;
      return;
    }
    this.logEl.innerHTML =
      `<header><strong>Diese Runde</strong><button type="button" class="x" data-close>✕</button></header>` +
      events
        // Ereignisse ohne Feld (Forschung) öffnen beim Klick den Technologiebaum (tile = -1).
        .map((e) => `<button type="button" class="event" data-tile="${e.tile}">${escapeHtml(e.text)}</button>`)
        .join('');
    this.logEl.hidden = false;
  }

  setBusy(busy: boolean): void {
    this.endTurn.disabled = busy;
  }

  /** Zeigt die ausgewählte Einheit und den Rest ihres Stapels; foundBlocker: null = Stadtgründung möglich. */
  showUnits(
    stack: UnitView[], selected: UnitView | null, human: number, foundBlocker: string | null = 'unbekannt', jobs: JobOption[] = [],
  ): void {
    if (!selected) {
      this.unitPanel.hidden = true;
      return;
    }
    const t = UNIT_TYPES[selected.type];
    const own = selected.owner === human;
    const status =
      selected.orders === Orders.Fortify
        ? t.strength > 0 ? 'befestigt' : 'schläft'
        : selected.orders === Orders.Goto
          ? 'unterwegs'
          : selected.orders === Orders.Work && selected.job
            ? `arbeitet: ${JOB_NAMES[selected.job.kind]} (${selected.job.progress}/${selected.job.turns})`
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
            ? btn('fortify', t.strength > 0 ? 'Befestigen' : 'Schlafen', 'F')
            : btn('wake', 'Aufwecken', 'F'),
          btn('skip', 'Überspringen', 'Leer', selected.moves > 0),
          ...(t.canFound ? [btn('found', 'Stadt gründen', 'B', foundBlocker === null && selected.moves > 0, foundBlocker ?? (selected.moves > 0 ? '' : 'Keine Bewegung mehr übrig'))] : []),
          btn('disband', 'Auflösen', 'Entf'),
        ].join('')
      : '';
    const jobButtons =
      own && jobs.length
        ? jobs
            .map(
              (j) => `<button type="button" data-action="job:${j.job}" data-unit-id="${id}" ${j.blocker ? 'disabled' : ''}
                title="${escapeHtml(j.blocker ?? `${j.turns} Runden`)}">${JOB_ICONS[j.job]} ${JOB_NAMES[j.job]}</button>`,
            )
            .join('')
        : '';
    const others = stack.filter((u) => u.id !== id);
    const chips = others
      .map((u) => {
        const ut = UNIT_TYPES[u.type];
        const ready = u.owner === human && u.moves > 0 && u.orders === Orders.None;
        return `<button type="button" class="chip${ready ? ' ready' : ''}" data-unit="${u.id}" title="${ut.name}">${ut.icon}</button>`;
      })
      .join('');
    const color = toCss(playerColor(selected.owner));
    this.unitPanel.hidden = false;
    this.unitPanel.innerHTML = `
      <div class="unit-head">
        <span class="unit-icon" style="background:${color}">${t.icon}</span>
        <div>
          <strong>${t.name}</strong> <small>${own ? status : 'fremd'}</small>
          <div class="unit-stats">
            <span title="Bewegung">👣 ${formatMoves(selected.moves)}/${formatMoves(selected.maxMoves)}</span>
            <span title="Stärke">⚔️ ${t.strength}</span>
            ${t.ranged ? `<span title="Fernkampf (Reichweite ${t.range})">🏹 ${t.ranged}</span>` : ''}
            <span title="Sichtweite">👁️ ${t.sight}</span>
            <span title="Klasse">${CLASS_NAMES[t.cls]}</span>
          </div>
          ${t.strength > 0 ? `<div class="unit-stats">
            <span title="Lebenspunkte">❤️ ${selected.hp}/100</span>
            <span title="Erfahrung bis zur nächsten Beförderung">⭐ ${selected.xp}/${selected.xpNext}</span>
            ${selected.promotions.map((p) => `<span class="tag" title="${PROMOTIONS[p].description}">${PROMOTIONS[p].name}</span>`).join('')}
          </div>` : ''}
        </div>
      </div>
      ${own && selected.promotable.length ? `<div class="unit-actions promote"><small>Beförderung wählen:</small>${selected.promotable
        .map((p) => `<button type="button" data-action="promote:${p}" data-unit-id="${id}" title="${PROMOTIONS[p].description}">★ ${PROMOTIONS[p].name}</button>`)
        .join('')}</div>` : ''}
      ${actions ? `<div class="unit-actions">${actions}</div>` : ''}
      ${jobButtons ? `<div class="unit-actions jobs">${jobButtons}</div>` : ''}
      ${own && t.canWork && !jobs.length ? '<p class="hint">Noch keine Aufträge – erforsche z. B. Ackerbau, Bergbau oder Rad (T).</p>' : ''}
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
