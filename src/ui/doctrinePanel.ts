import { CATEGORY_NAMES, DOCTRINES, type DoctrineCategory } from '../sim/rules/doctrines';
import { TECHS } from '../sim/rules/techs';
import type { ReligionView } from '../protocol';
import { FAITH_TO_FOUND, TENETS, type TenetKey } from '../sim/religion';

/** Leitbilder (P): je Bereich ein aktives Leitbild; Wechsel kostet eine Runde Umbruch. */
export class DoctrinePanel {
  private readonly el = document.getElementById('doctrinepanel')!;
  private active: number[] = [];
  private upheaval = 0;
  private known: number[] = [];
  private religion: ReligionView | null = null;

  constructor(onChoose: (doctrine: number) => void, onFoundReligion: (tenet: TenetKey) => void) {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el || t.closest('[data-close]')) {
        this.hide();
        return;
      }
      if (t.closest('[data-act="found-religion"]')) {
        const tenet = (this.el.querySelector('#tenet') as HTMLSelectElement).value as TenetKey;
        onFoundReligion(tenet);
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

  update(active: number[], upheaval: number, known: number[], religion: ReligionView): void {
    this.active = active;
    this.upheaval = upheaval;
    this.known = known;
    this.religion = religion;
    if (this.open) this.render();
  }

  private religionSection(): string {
    const r = this.religion;
    if (!r) return '';
    const list = r.religions.length
      ? `<ul>${r.religions.map((x) => `<li><b>${x.name}</b> (gegründet von ${x.founder}) – ${x.tenet} · ${x.cities} ${x.cities === 1 ? 'Stadt' : 'Städte'}</li>`).join('')}</ul>`
      : '<p class="hint">Noch keine Religion gegründet.</p>';
    const found = r.foundBlocker === null
      ? `<div class="row"><label>Lehre <select id="tenet">${TENETS.map((t) => `<option value="${t.key}">${t.name} – ${t.description}</option>`).join('')}</select></label>
         <button type="button" data-act="found-religion">Religion gründen</button></div>`
      : `<p class="hint">Religion gründen: ${r.foundBlocker}</p>`;
    return `<section class="religion"><h3>Religion</h3>
      <p>Glaube: <b>${r.faith}</b> (+${r.faithPerTurn}/Runde aus Schrein, Kathedrale, Ewiger Flamme) · ${FAITH_TO_FOUND} zum Gründen ·
        Staatsreligion: <b>${r.state ?? 'keine'}</b></p>
      ${found}${list}
      <p class="hint">Städte breiten ihre Religion im Umkreis aus; Missionare (Theologie) bekehren eine Stadt sofort.</p></section>`;
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
      <header><h2>Leitbilder und Religion</h2><span>${this.upheaval ? 'Umbruch – nächste Runde wieder wählbar' : 'Ein Wechsel kostet eine Runde Umbruch'}</span>
      <button type="button" class="x" data-close title="Schließen (P / Esc)">✕</button></header>
      <div class="tiers doctrines">${cols}</div>
      ${this.religionSection()}</div>`;
  }
}
