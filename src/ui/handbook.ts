import { catalog, type CatalogTab } from '../sim/rules/catalog';

/**
 * Handbuch (F1): alle Spielinhalte direkt aus den Regeltabellen, mit eigenen Kurztexten.
 * Wird erst beim Öffnen geladen (eigener Code-Chunk).
 */
type Tab = CatalogTab | 'basics';

const TABS: [Tab, string][] = [
  ['basics', 'Grundlagen'], ['terrain', 'Gelände'], ['resources', 'Ressourcen'], ['units', 'Einheiten'], ['promotions', 'Beförderungen'],
  ['buildings', 'Gebäude'], ['wonders', 'Wunder & Projekt'], ['techs', 'Technologien'], ['doctrines', 'Leitbilder'], ['tenets', 'Religion'],
];

function table(head: string[], rows: string[][]): string {
  return `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c.replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function content(tab: Tab): string {
  switch (tab) {
    case 'basics':
      return `<p>Ziel ist es, ein Volk von der ersten Siedlung bis zur Raumfahrt zu führen. Gewinnen kannst du durch Eroberung,
        Vorherrschaft, Kultur, das Großprojekt „Aufbruch“ oder die höchste Punktzahl beim Rundenlimit.</p>
        <ul>
          <li><b>Städte</b> wachsen durch Nahrung, bauen mit Produktion und erzeugen Handel (Forschung/Gold).</li>
          <li><b>Stimmung</b> und <b>Versorgung</b> begrenzen das Wachstum: Luxusgüter, Gebäude und Leitbilder helfen.</li>
          <li><b>Arbeiter</b> verbessern Felder; Ressourcen wirken erst verbessert. Straßen und Flüsse bilden das Handelsnetz.</li>
          <li><b>Kampf</b>: Lebenspunkte, Gelände, Flüsse und Befestigung zählen; die Vorschau zeigt die Siegchance.</li>
          <li><b>Diplomatie</b>: Grundzustand ist Frieden; Krieg muss erklärt werden. Handel mit Gold und Technologien.</li>
        </ul>
        <p>Alle Zahlen findest du in den anderen Reitern sowie in <code>docs/REGELN.md</code> und <code>docs/REGELN-DATEN.md</code>.</p>`;
    default: {
      const t = catalog(tab);
      return table(t.head, t.rows);
    }
  }
}

let current: Tab = 'basics';

export function openHandbook(el: HTMLElement): void {
  const render = () => {
    el.innerHTML = `<div class="panel handbook-box" role="dialog" aria-label="Handbuch">
      <header><h2>Handbuch</h2><button type="button" class="x" data-close aria-label="Schließen">✕</button></header>
      <nav>${TABS.map(([k, n]) => `<button type="button" data-tab="${k}" class="${k === current ? 'active' : ''}">${n}</button>`).join('')}</nav>
      <div class="handbook-content">${content(current)}</div></div>`;
  };
  if (!el.dataset.bound) {
    el.dataset.bound = '1';
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === el || t.closest('[data-close]')) {
        el.hidden = true;
        return;
      }
      const tab = t.closest<HTMLElement>('[data-tab]')?.dataset.tab as Tab | undefined;
      if (tab) {
        current = tab;
        render();
      }
    });
  }
  render();
  el.hidden = false;
}
