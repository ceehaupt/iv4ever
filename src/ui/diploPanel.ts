import type { DiplomacyView, VictoryView } from '../protocol';
import { toCss } from '../render/color';
import { playerColor } from '../render/palette';
import type { Proposal, TradeItem } from '../sim/diplomacy';
import { TECHS } from '../sim/rules/techs';
import { CULTURE_CITIES, CULTURE_PER_CITY, DOMINATION_LAND, DOMINATION_POP, VICTORY_NAMES } from '../sim/victory';

export interface DiploHandlers {
  onDeclareWar(civ: number): void;
  onPropose(civ: number, proposal: Proposal): void;
  onRespond(proposal: number, accept: boolean): void;
  onCancelAlliance(civ: number): void;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

function powerLabel(r: number): string {
  return r > 1.5 ? 'deutlich stärker' : r > 1.1 ? 'stärker' : r > 0.9 ? 'ebenbürtig' : r > 0.6 ? 'schwächer' : 'deutlich schwächer';
}

/** Diplomatie-Übersicht (K): Beziehungen, Angebote, Handel, Siegfortschritt. */
export class DiploPanel {
  private readonly el = document.getElementById('diplopanel')!;
  private diplo: DiplomacyView | null = null;
  private victory: VictoryView | null = null;

  constructor(private readonly h: DiploHandlers) {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el || t.closest('[data-close]')) {
        this.hide();
        return;
      }
      const b = t.closest<HTMLElement>('[data-act]');
      if (!b) return;
      const civ = Number(b.dataset.civ);
      switch (b.dataset.act) {
        case 'war':
          if (window.confirm('Wirklich den Krieg erklären?')) h.onDeclareWar(civ);
          break;
        case 'peace':
          h.onPropose(civ, { kind: 'peace' });
          break;
        case 'borders':
          h.onPropose(civ, { kind: 'openBorders' });
          break;
        case 'trade':
          this.proposeTrade(civ, false);
          break;
        case 'demand':
          this.proposeTrade(civ, true);
          break;
        case 'alliance':
          h.onPropose(civ, { kind: 'alliance' });
          break;
        case 'cancel-alliance':
          if (window.confirm('Bündnis wirklich kündigen? Der Partner wird das nicht vergessen.')) h.onCancelAlliance(civ);
          break;
        case 'accept':
        case 'decline':
          h.onRespond(Number(b.dataset.id), b.dataset.act === 'accept');
          break;
      }
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  toggle(): void {
    if (this.open) this.hide();
    else {
      this.el.hidden = false;
      this.render();
    }
  }

  hide(): void {
    this.el.hidden = true;
  }

  update(d: DiplomacyView, v: VictoryView): void {
    this.diplo = d;
    this.victory = v;
    if (this.open) this.render();
  }

  /** Handel vorschlagen bzw. (demand) nur fordern – dann zählt nur „Ich bekomme“. */
  private proposeTrade(civ: number, demand: boolean): void {
    const form = this.el.querySelector<HTMLElement>(`[data-trade="${civ}"]`);
    if (!form) return;
    const val = (sel: string) => (form.querySelector(sel) as HTMLInputElement | HTMLSelectElement).value;
    const items = (goldSel: string, techSel: string): TradeItem[] => {
      const out: TradeItem[] = [];
      const gold = Number(val(goldSel));
      if (gold > 0) out.push({ kind: 'gold', amount: gold });
      const tech = val(techSel);
      if (tech !== '') out.push({ kind: 'tech', tech: Number(tech) });
      return out;
    };
    const give = items('.give-gold', '.give-tech');
    const get = items('.get-gold', '.get-tech');
    if (demand) {
      if (get.length) this.h.onPropose(civ, { kind: 'demand', get });
      return;
    }
    if (!give.length && !get.length) return;
    this.h.onPropose(civ, { kind: 'trade', give, get });
  }

  private render(): void {
    const d = this.diplo;
    const v = this.victory;
    if (!d || !v) return;
    const pending = d.pending
      .map((p) => {
        const civ = d.civs.find((c) => c.id === p.from);
        return `<div class="pending"><span>${civ?.name ?? 'Jemand'} ${p.text}</span>
          <button type="button" data-act="accept" data-id="${p.id}">Annehmen</button>
          <button type="button" data-act="decline" data-id="${p.id}">Ablehnen</button></div>`;
      })
      .join('');
    const techOptions = (ids: number[]) =>
      `<option value="">– keine –</option>${ids.map((t) => `<option value="${t}">${TECHS[t].name}</option>`).join('')}`;
    const civs = d.civs.length
      ? d.civs
          .map((c) => `
        <article class="civ">
          <header>
            <span class="swatch" style="background:${toCss(playerColor(c.id))}"></span>
            <strong>${c.name}</strong> <small>${c.leader}</small>
            <span class="status ${c.war ? 'war' : 'peace'}">${c.war ? 'Krieg' : c.alliance ? 'Bündnis' : c.openBorders ? 'Frieden · offene Grenzen' : 'Frieden'}</span>
          </header>
          <div class="facts">Haltung: <b>${c.attitudeLabel}</b> (${c.attitude >= 0 ? '+' : ''}${c.attitude}) · Militär: ${powerLabel(c.powerRatio)} · Gold: ${c.gold}</div>
          <div class="actions">
            ${c.war
              ? `<button type="button" data-act="peace" data-civ="${c.id}">Frieden anbieten</button>`
              : c.alliance
                ? `<button type="button" data-act="cancel-alliance" data-civ="${c.id}" class="danger">Bündnis kündigen</button>`
                : `<button type="button" data-act="war" data-civ="${c.id}" class="danger">Krieg erklären</button>
                 ${c.openBorders
                    ? `<button type="button" data-act="alliance" data-civ="${c.id}">Bündnis anbieten</button>`
                    : `<button type="button" data-act="borders" data-civ="${c.id}">Offene Grenzen anbieten</button>`}`}
          </div>
          ${c.war ? '' : `<div class="trade" data-trade="${c.id}">
            <label>Ich gebe <input class="give-gold" type="number" min="0" step="5" value="0" /> 💰 <select class="give-tech">${techOptions(c.techsToGive)}</select></label>
            <label>Ich bekomme <input class="get-gold" type="number" min="0" step="5" value="0" /> 💰 <select class="get-tech">${techOptions(c.techsToGet)}</select></label>
            <button type="button" data-act="trade" data-civ="${c.id}">Handel vorschlagen</button>
            <button type="button" data-act="demand" data-civ="${c.id}" title="Nur „Ich bekomme“ zählt – ohne Gegenleistung. Wer sich weigert, ist verärgert; Kriegerische greifen dann eher zu den Waffen.">Fordern</button>
          </div>`}
        </article>`)
          .join('')
      : '<p class="hint">Noch keine anderen Völker getroffen.</p>';
    const pr = v.progress;
    const ranking = v.ranking.map((r, k) => `<li${r.name === 'Du' ? ' class="me"' : ''}>${k + 1}. ${r.name} – ${r.score}</li>`).join('');
    this.el.innerHTML = `
      <div class="diplo-box panel">
        <header><h2>Diplomatie</h2><button type="button" class="x" data-close title="Schließen (Esc)">✕</button></header>
        ${pending ? `<section class="pendings">${pending}</section>` : ''}
        <section class="civs">${civs}</section>
        <section class="victory">
          <h3>Siegbedingungen</h3>
          <ul>
            <li>${VICTORY_NAMES.domination}: Land ${pct(pr.landShare)} / ${pct(DOMINATION_LAND)}, Bevölkerung ${pct(pr.popShare)} / ${pct(DOMINATION_POP)}</li>
            <li>${VICTORY_NAMES.culture}: ${pr.cultureCities} / ${CULTURE_CITIES} Städte mit ${CULTURE_PER_CITY} Kultur</li>
            <li>${VICTORY_NAMES.conquest}: alle anderen Völker vernichten</li>
            <li>${VICTORY_NAMES.score}: Platz ${pr.rank} mit ${pr.score} Punkten – noch ${pr.turnsLeft} Runden (Limit ${v.turnLimit})</li>
          </ul>
          <ol class="ranking">${ranking}</ol>
        </section>
      </div>`;
  }
}
