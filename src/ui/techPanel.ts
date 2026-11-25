import type { ResearchView } from '../protocol';
import { BUILDINGS } from '../sim/rules/buildings';
import { CLEAR_TECH, IMPROVEMENTS, ROAD_TECH } from '../sim/rules/improvements';
import { canResearch, costTowards, nextStepTowards, TECHS, techCost } from '../sim/rules/techs';
import { UNIT_TYPES } from '../sim/rules/units';
import { DOCTRINES } from '../sim/rules/doctrines';

/** Was eine Technologie freischaltet – aus den Regeltabellen abgeleitet. */
export function techUnlocks(id: number): string[] {
  const out: string[] = [];
  BUILDINGS.forEach((b) => {
    if (b.tech === id) out.push(`${b.icon} ${b.name}${b.wonder ? ' (Weltwunder)' : ''}`);
  });
  IMPROVEMENTS.forEach((i) => {
    if (i && i.tech === id) out.push(`${i.icon} ${i.name}`);
  });
  UNIT_TYPES.forEach((u) => {
    if (u.tech === id) out.push(`${u.icon} ${u.name}`);
  });
  DOCTRINES.forEach((d) => {
    if (d.tech === id) out.push(`📜 ${d.name}`);
  });
  if (id === ROAD_TECH) out.push('🛤️ Straße');
  if (id === CLEAR_TECH) out.push('🪓 Roden');
  const effect = TECHS[id].effect;
  if (effect) out.push(`✨ ${effect}`);
  return out;
}

const plural = (n: number) => `${n} ${n === 1 ? 'Runde' : 'Runden'}`;

/** Technologiebaum als Überlagerung: Spalten = Stufen, Klick setzt das Forschungsziel. */
export class TechPanel {
  private readonly el = document.getElementById('techpanel')!;
  private research: ResearchView | null = null;

  constructor(onGoal: (tech: number) => void) {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]') || t === this.el) {
        this.hide();
        return;
      }
      const node = t.closest<HTMLElement>('[data-tech]');
      if (node && !node.classList.contains('known')) onGoal(Number(node.dataset.tech));
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  hide(): void {
    this.el.hidden = true;
  }

  show(): void {
    this.el.hidden = false;
    this.render();
  }

  update(r: ResearchView): void {
    this.research = r;
    if (this.open) this.render();
  }

  /** Kurzbeschreibung für die Rundenanzeige. */
  static summary(r: ResearchView): string {
    if (r.current < 0) return 'Keine Forschung gewählt';
    const left = Math.max(0, techCost(r.current) - r.progress);
    const turns = r.perTurn > 0 ? plural(Math.max(1, Math.ceil(left / r.perTurn))) : '–';
    return `${TECHS[r.current].name} (${Math.min(r.progress, techCost(r.current))}/${techCost(r.current)}, ${turns})`;
  }

  private render(): void {
    const r = this.research;
    if (!r) return;
    const known = new Uint8Array(TECHS.length);
    for (const t of r.known) known[t] = 1;
    const path = new Set<number>();
    if (r.goal >= 0) {
      // Alle noch fehlenden Schritte bis zum Ziel markieren.
      const sim = known.slice();
      for (let k = 0; k < TECHS.length; k++) {
        const step = nextStepTowards(sim, r.goal);
        if (step < 0) break;
        path.add(step);
        sim[step] = 1;
      }
    }
    const tiers = Math.max(...TECHS.map((t) => t.tier));
    const columns: string[] = [];
    for (let tier = 1; tier <= tiers; tier++) {
      const nodes = TECHS.map((t, id) => ({ t, id }))
        .filter(({ t }) => t.tier === tier)
        .map(({ t, id }) => {
          const state = known[id]
            ? 'known'
            : id === r.current
              ? 'current'
              : path.has(id)
                ? 'path'
                : canResearch(known, id)
                  ? 'available'
                  : 'locked';
          const pre = t.prereqs.map((p) => TECHS[p].name).join(', ');
          const unlocks = techUnlocks(id);
          const cost = known[id] ? 'erforscht' : `${techCost(id)} 🔬`;
          const turns = !known[id] && r.perTurn > 0 ? ` · ~${plural(Math.ceil(costTowards(known, id) / r.perTurn))}` : '';
          return `<button type="button" class="tech ${state}" data-tech="${id}" title="${pre ? `Benötigt: ${pre}` : 'Keine Voraussetzungen'}">
            <strong>${t.name}</strong><small>${cost}${turns}</small>
            ${unlocks.length ? `<span class="unlocks">${unlocks.join('<br>')}</span>` : ''}
          </button>`;
        })
        .join('');
      columns.push(`<div class="tier"><h3>Stufe ${tier}</h3>${nodes}</div>`);
    }
    this.el.innerHTML = `
      <div class="tech-box panel">
        <header>
          <h2>Technologien</h2>
          <span>🔬 ${TechPanel.summary(r)} · +${r.perTurn}/Runde</span>
          <button type="button" class="x" data-close title="Schließen (T / Esc)">✕</button>
        </header>
        <p class="hint">Klick setzt das Forschungsziel – Voraussetzungen werden automatisch der Reihe nach erforscht.</p>
        <div class="tiers">${columns.join('')}</div>
      </div>`;
  }
}
