import type { ResearchView } from '../protocol';
import { canResearch, costTowards, nextStepTowards, TECHS, techCost } from '../sim/rules/techs';

import { techUnlocks } from '../sim/rules/catalog';

export { techUnlocks };

const plural = (n: number) => `${n} ${n === 1 ? 'Runde' : 'Runden'}`;

/** Umkehrung der Voraussetzungen: Folgetechnologien je Technologie. */
const DEPENDENTS: number[][] = TECHS.map(() => []);
TECHS.forEach((t, id) => t.prereqs.forEach((p) => DEPENDENTS[p].push(id)));

/** Eine Verbindung: Voraussetzung `from` → Folgetechnologie `to`. */
interface Edge {
  from: number;
  to: number;
}
const EDGES: Edge[] = [];
TECHS.forEach((t, to) => t.prereqs.forEach((from) => EDGES.push({ from, to })));

/** Alle Voraussetzungen einer Technologie, auch indirekte (der gesamte Weg dorthin). */
function ancestorsOf(id: number): Set<number> {
  const out = new Set<number>();
  const visit = (k: number) => {
    for (const p of TECHS[k].prereqs) {
      if (out.has(p)) continue;
      out.add(p);
      visit(p);
    }
  };
  visit(id);
  return out;
}

/**
 * Anordnung der Karten: je Stufe die Technologien von oben nach unten. Die Reihenfolge folgt den
 * Voraussetzungen (Mittelwert der Plätze), damit sich die Linien möglichst wenig kreuzen.
 */
function planRows(): number[][] {
  const maxTier = Math.max(...TECHS.map((t) => t.tier));
  const pos = new Array<number>(TECHS.length).fill(0);
  const columns: number[][] = [];
  for (let tier = 1; tier <= maxTier; tier++) {
    const ids = TECHS.map((_, id) => id).filter((id) => TECHS[id].tier === tier);
    const key = (id: number) => {
      const ps = TECHS[id].prereqs;
      return ps.length ? ps.reduce((s, p) => s + pos[p], 0) / ps.length : id;
    };
    ids.sort((a, b) => key(a) - key(b) || a - b);
    ids.forEach((id, i) => {
      pos[id] = i;
    });
    columns.push(ids);
  }
  return columns;
}

/** Technologiebaum als Überlagerung: Spalten = Stufen, Klick setzt das Forschungsziel. */
export class TechPanel {
  private readonly el = document.getElementById('techpanel')!;
  private research: ResearchView | null = null;
  /** Laufende Verschiebung per Maus: Startpunkt und Scroll-Stand des Kastens. */
  private drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null;
  /** Nach einem Verschieben soll der anschließende Klick keinen Forschungsauftrag auslösen. */
  private suppressClick = false;

  constructor(onGoal: (tech: number) => void) {
    this.el.addEventListener('pointerdown', (e) => {
      const box = this.el.querySelector<HTMLElement>('.tech-scroll');
      if (!box || e.button !== 0 || !box.contains(e.target as Node)) return;
      this.suppressClick = false;
      this.drag = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
      const d = this.drag;
      const box = this.el.querySelector<HTMLElement>('.tech-scroll');
      if (!d || !box) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 5) return;
        d.moved = true;
        box.classList.add('dragging');
      }
      box.scrollLeft = d.left - dx;
      box.scrollTop = d.top - dy;
    });
    window.addEventListener('pointerup', () => {
      if (this.drag?.moved) this.suppressClick = true;
      this.drag = null;
      this.el.querySelector('.tech-scroll')?.classList.remove('dragging');
    });
    this.el.addEventListener('click', (e) => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]') || t === this.el) {
        this.hide();
        return;
      }
      const node = t.closest<HTMLElement>('[data-tech]');
      if (node && !node.classList.contains('known')) onGoal(Number(node.dataset.tech));
    });
    // Überfahren einer Technologie markiert ihren Weg und die direkten Folgetechnologien.
    this.el.addEventListener('pointerover', (e) => {
      const node = (e.target as HTMLElement).closest<HTMLElement>('[data-tech]');
      this.highlight(node ? Number(node.dataset.tech) : -1);
    });
    window.addEventListener('resize', () => {
      if (this.open) this.drawLinks();
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

  private highlight(id: number): void {
    const nodes = this.el.querySelectorAll<HTMLElement>('[data-tech]');
    nodes.forEach((n) => n.classList.remove('hl-self', 'hl-req', 'hl-dep'));
    // Der gesamte Weg dorthin: alle Voraussetzungen bis zu den Wurzeln (blau), direkte Folgetechnologien lila.
    const anc = id >= 0 ? ancestorsOf(id) : new Set<number>();
    if (id >= 0) {
      const dep = new Set(DEPENDENTS[id]);
      nodes.forEach((n) => {
        const k = Number(n.dataset.tech);
        if (k === id) n.classList.add('hl-self');
        else if (anc.has(k)) n.classList.add('hl-req');
        else if (dep.has(k)) n.classList.add('hl-dep');
      });
    }
    const svg = this.el.querySelector<SVGSVGElement>('.tech-links');
    svg?.classList.toggle('has-hl', id >= 0);
    this.el.querySelectorAll<SVGPathElement>('.tech-links path').forEach((p) => {
      const from = Number(p.dataset.from);
      const to = Number(p.dataset.to);
      // Eine Verbindung liegt auf dem Weg, wenn ihr Ziel auf dem Weg liegt (dann liegt auch ihre Quelle darauf).
      p.classList.toggle('hl-req', id >= 0 && (to === id || anc.has(to)));
      p.classList.toggle('hl-dep', id >= 0 && from === id && to !== id);
    });
  }

  /**
   * Zeichnet jede Verbindung rechtwinklig: waagerecht von Karte zu Karte in der Mittelhöhe der Kacheln,
   * senkrecht in der Mitte des Zwischenraums zwischen zwei Stufen. Zwischen Stufen wählt jede
   * Verbindung die Lücken mit dem kürzesten senkrechten Weg.
   */
  private drawLinks(): void {
    const box = this.el.querySelector<HTMLElement>('.tiers');
    const svg = this.el.querySelector<SVGSVGElement>('.tech-links');
    if (!box || !svg) return;
    const origin = box.getBoundingClientRect();
    const known = new Set(this.research?.known ?? []);
    const colEls = Array.from(this.el.querySelectorAll<HTMLElement>('.tier'));
    const cols = colEls.map((c) => c.getBoundingClientRect());
    const rects = new Map<number, DOMRect>();
    this.el.querySelectorAll<HTMLElement>('[data-tech]').forEach((n) => {
      rects.set(Number(n.dataset.tech), n.getBoundingClientRect());
    });
    const yOf = (r: DOMRect) => r.top + r.height / 2 - origin.top;

    // Mögliche Durchgangshöhen in einer Stufe: die Lücken über, zwischen und unter den Kacheln.
    const gapCache = new Map<number, number[]>();
    const gapsOf = (tier: number): number[] => {
      const hit = gapCache.get(tier);
      if (hit) return hit;
      const cards = Array.from(colEls[tier - 1].querySelectorAll<HTMLElement>('[data-tech]')).map((c) =>
        c.getBoundingClientRect(),
      );
      const ys: number[] = [];
      let prevBottom = cards[0].top - 16;
      for (const r of cards) {
        ys.push((prevBottom + r.top) / 2 - origin.top);
        prevBottom = r.bottom;
      }
      ys.push(prevBottom + 8 - origin.top);
      gapCache.set(tier, ys);
      return ys;
    };

    // Kürzester Weg durch die Lücken: je Zwischenstufe eine Höhe, die Summe der senkrechten Strecken ist minimal.
    const shortestRoute = (y0: number, y1: number, tiers: number[]): number[] => {
      const layers = tiers.map(gapsOf);
      let prevCost = [0];
      let prevY = [y0];
      const back: number[][] = [];
      for (const ys of layers) {
        const cost: number[] = [];
        const from: number[] = [];
        for (const y of ys) {
          let best = Infinity;
          let arg = 0;
          prevY.forEach((py, i) => {
            const c = prevCost[i] + Math.abs(y - py);
            if (c < best) {
              best = c;
              arg = i;
            }
          });
          cost.push(best);
          from.push(arg);
        }
        back.push(from);
        prevCost = cost;
        prevY = ys;
      }
      let bestI = 0;
      let bestC = Infinity;
      prevY.forEach((py, i) => {
        const c = prevCost[i] + Math.abs(y1 - py);
        if (c < bestC) {
          bestC = c;
          bestI = i;
        }
      });
      const out: number[] = new Array(layers.length).fill(0);
      let idx = bestI;
      for (let k = layers.length - 1; k >= 0; k--) {
        out[k] = layers[k][idx];
        idx = back[k][idx];
      }
      return out;
    };

    interface Route {
      e: Edge;
      y0: number;
      x0: number;
      x1: number;
      stops: { tier: number; y: number }[];
    }
    const routes: Route[] = [];
    for (const e of EDGES) {
      const from = rects.get(e.from);
      const to = rects.get(e.to);
      if (!from || !to) continue;
      const tiers: number[] = [];
      for (let t = TECHS[e.from].tier + 1; t < TECHS[e.to].tier; t++) tiers.push(t);
      const ys = shortestRoute(yOf(from), yOf(to), tiers);
      const stops = tiers.map((tier, k) => ({ tier, y: ys[k] }));
      stops.push({ tier: TECHS[e.to].tier, y: yOf(to) });
      routes.push({ e, y0: yOf(from), x0: from.right - origin.left, x1: to.left - origin.left, stops });
    }

    // Senkrechte Stücke laufen mittig im Zwischenraum vor der jeweiligen Stufe. Überlappen ist erlaubt.
    const gapCenter = (tier: number) => (cols[tier - 2].right + cols[tier - 1].left) / 2 - origin.left;

    const parts: string[] = [];
    for (const route of routes) {
      const { e } = route;
      let y = route.y0;
      const pts = [`${route.x0},${y}`];
      for (const st of route.stops) {
        const x = gapCenter(st.tier);
        pts.push(`${x},${y}`, `${x},${st.y}`);
        y = st.y;
      }
      pts.push(`${route.x1},${y}`);
      const cls = known.has(e.from) ? 'link met' : 'link';
      parts.push(`<path class="${cls}" data-from="${e.from}" data-to="${e.to}" d="M${pts.join(' L')}"/>`);
    }
    const w = box.scrollWidth;
    const h = box.scrollHeight;
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = parts.join('');
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
    const card = (id: number): string => {
      const t = TECHS[id];
      const state = known[id]
        ? 'known'
        : id === r.current
          ? 'current'
          : path.has(id)
            ? 'path'
            : canResearch(known, id)
              ? 'available'
              : 'locked';
      const reqs = t.prereqs.length
        ? `<span class="reqs">Benötigt: ${t.prereqs
            .map((p) => `<span class="req${known[p] ? ' met' : ''}">${TECHS[p].name}</span>`)
            .join(', ')}</span>`
        : '<span class="reqs none">Keine Voraussetzungen</span>';
      const unlocks = techUnlocks(id);
      const cost = known[id] ? 'erforscht' : `${techCost(id)} 🔬`;
      const turns = !known[id] && r.perTurn > 0 ? ` · ~${plural(Math.ceil(costTowards(known, id) / r.perTurn))}` : '';
      return `<button type="button" class="tech ${state}" data-tech="${id}">
        <strong>${t.name}</strong><small>${cost}${turns}</small>
        ${reqs}
        ${unlocks.length ? `<span class="unlocks">${unlocks.join('<br>')}</span>` : ''}
      </button>`;
    };
    const columns = planRows().map(
      (ids, i) => `<div class="tier"><h3>Stufe ${i + 1}</h3>${ids.map(card).join('')}</div>`,
    );
    this.el.innerHTML = `
      <div class="tech-box panel">
        <header>
          <h2>Technologien</h2>
          <span>🔬 ${TechPanel.summary(r)} · +${r.perTurn}/Runde</span>
          <button type="button" class="x" data-close title="Schließen (T / Esc)">✕</button>
        </header>
        <p class="hint">Klick setzt das Forschungsziel – Voraussetzungen werden automatisch der Reihe nach erforscht. Beim Überfahren werden nur der Weg dorthin (blau) und die direkten Folgetechnologien (lila) angezeigt.</p>
        <div class="tech-scroll"><div class="tiers"><svg class="tech-links" aria-hidden="true"></svg>${columns.join('')}</div></div>
      </div>`;
    this.drawLinks();
  }
}
