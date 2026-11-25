import { CATEGORY_NAMES, DOCTRINES, type DoctrineCategory } from '../sim/rules/doctrines';
import { TECHS } from '../sim/rules/techs';

/** Leitbilder (P): je Bereich ein aktives Leitbild; Wechsel kostet eine Runde Umbruch. */
export class DoctrinePanel {
  private readonly el = document.getElementById('doctrinepanel')!;
  private active: number[] = [];
  private upheaval = 0;
  private known: number[] = [];

  constructor(onChoose: (doctrine: number) => void) {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el || t.closest('[data-close]')) {
        this.hide();
        return;
      }
      const b = t.closest<HTMLElement>('[data-doctrine]');
      if (!b || b.hasAttribute('disabled')) return;
      const id = Number(b.dataset.doctrine);
      if (window.confirm(`${DOCTRINES[id].name} einführen? Das kostet eine Runde Umbruch (keine Forschung, kein Gold).`)) onChoose(id);
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  toggle(): void {
    this.el.hidden = !this.el.hidden;
    if (!this.el.hidden) this.render();
  }

  hide(): void {
    this.el.hidden = true;
  }

  update(active: number[], upheaval: number, known: number[]): void {
    this.active = active;
    this.upheaval = upheaval;
    this.known = known;
    if (this.open) this.render();
  }

  private render(): void {
    const cats: DoctrineCategory[] = ['gov', 'econ', 'society'];
    const cols = cats
      .map((cat, slot) => {
        const opts = DOCTRINES.map((d, id) => ({ d, id }))
          .filter(({ d }) => d.category === cat)
          .map(({ d, id }) => {
            const available = d.tech === null || this.known.includes(d.tech);
            const isActive = this.active[slot] === id;
            return `<button type="button" class="tech ${isActive ? 'current' : available ? 'available' : 'locked'}" data-doctrine="${id}"
              ${available && !isActive && !this.upheaval ? '' : 'disabled'}>
              <strong>${d.name}</strong><small>${isActive ? 'aktiv' : available ? 'verfügbar' : `benötigt ${TECHS[d.tech!].name}`}</small>
              <span class="unlocks">${d.description}</span></button>`;
          })
          .join('');
        return `<div class="tier"><h3>${CATEGORY_NAMES[cat]}</h3>${opts}</div>`;
      })
      .join('');
    this.el.innerHTML = `<div class="tech-box panel doctrine-box">
      <header><h2>Leitbilder</h2><span>${this.upheaval ? 'Umbruch – nächste Runde wieder wählbar' : 'Ein Wechsel kostet eine Runde Umbruch'}</span>
      <button type="button" class="x" data-close title="Schließen (P / Esc)">✕</button></header>
      <div class="tiers doctrines">${cols}</div></div>`;
  }
}
