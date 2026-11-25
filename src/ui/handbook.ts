import { BUILDINGS } from '../sim/rules/buildings';
import { CATEGORY_NAMES, DOCTRINES } from '../sim/rules/doctrines';
import { IMPROVEMENTS, RESOURCE_IMPROVEMENT } from '../sim/rules/improvements';
import { RESOURCE_KIND_NAME, RESOURCES } from '../sim/rules/resources';
import { TECHS, techCost } from '../sim/rules/techs';
import { FEATURE, RELIEF, TERRAIN } from '../sim/rules/terrain';
import { CLASS_NAMES, PROMOTIONS, UNIT_TYPES } from '../sim/rules/units';
import { techUnlocks } from './techPanel';

/**
 * Handbuch (F1): alle Spielinhalte direkt aus den Regeltabellen, mit eigenen Kurztexten.
 * Wird erst beim Öffnen geladen (eigener Code-Chunk).
 */
type Tab = 'terrain' | 'resources' | 'units' | 'buildings' | 'wonders' | 'techs' | 'doctrines' | 'promotions' | 'basics';

const TABS: [Tab, string][] = [
  ['basics', 'Grundlagen'], ['terrain', 'Gelände'], ['resources', 'Ressourcen'], ['units', 'Einheiten'], ['promotions', 'Beförderungen'],
  ['buildings', 'Gebäude'], ['wonders', 'Wunder & Projekt'], ['techs', 'Technologien'], ['doctrines', 'Leitbilder'],
];

const y = (f: number, p: number, t: number) => `🌾${f} ⚒️${p} 💰${t}`;
const techName = (id: number | null) => (id === null ? '–' : TECHS[id].name);

function table(head: string[], rows: string[][]): string {
  return `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
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
        <p>Alle Zahlen findest du in den anderen Reitern und in <code>docs/REGELN.md</code>.</p>`;
    case 'terrain':
      return table(['Gelände', 'Erträge', 'Hinweis'], [
        ...TERRAIN.map((t) => [t.name, y(t.yields.food, t.yields.prod, t.yields.trade), t.water ? 'Wasser – nur Schiffe' : '']),
        ...RELIEF.slice(1).map((r) => [r.name, `+${r.delta.prod} ⚒️`, Number.isFinite(r.moveCost) ? `Bewegung ${r.moveCost}, Verteidigung +${r.defense} %` : 'unpassierbar']),
        ...FEATURE.slice(1).map((f) => [f.name, y(f.delta.food, f.delta.prod, f.delta.trade), Number.isFinite(f.moveCost) ? `Bewegung ${f.moveCost}, Verteidigung +${f.defense} %` : 'unpassierbar']),
      ]);
    case 'resources':
      return table(['Ressource', 'Art', 'Bonus', 'Braucht'], RESOURCES.filter((r) => r !== null).map((r) => [
        `${r!.icon} ${r!.name}`, RESOURCE_KIND_NAME[r!.kind], y(r!.delta.food, r!.delta.prod, r!.delta.trade),
        RESOURCE_IMPROVEMENT[r!.key] ? IMPROVEMENTS[RESOURCE_IMPROVEMENT[r!.key]]!.name : 'Fischerei',
      ]));
    case 'units':
      return table(['Einheit', 'Klasse', 'Kosten', 'Stärke', 'Fernkampf', 'Bewegung', 'Technologie', 'Ressourcen'],
        UNIT_TYPES.map((u) => [`${u.icon} ${u.name}`, CLASS_NAMES[u.cls], String(u.cost), String(u.strength || '–'),
          u.ranged ? `${u.ranged} (${u.range})` : '–', String(u.moves), techName(u.tech),
          u.resources.map((k) => RESOURCES.find((r) => r?.key === k)?.name ?? k).join(', ') || '–']));
    case 'promotions':
      return table(['Beförderung', 'Wirkung', 'Voraussetzung'], PROMOTIONS.map((p) => [p.name, p.description,
        p.requires.map((r) => PROMOTIONS[r].name).join(' oder ') || '–']));
    case 'buildings':
      return table(['Gebäude', 'Kosten', 'Technologie', 'Wirkung'], BUILDINGS.filter((b) => !b.wonder && !b.project).map((b) => [
        `${b.icon} ${b.name}`, b.buildable ? String(b.cost) : '–', techName(b.tech), b.description]));
    case 'wonders':
      return table(['Wunder / Projekt', 'Kosten', 'Technologie', 'Wirkung'], BUILDINGS.filter((b) => b.wonder || b.project).map((b) => [
        `${b.icon} ${b.name}`, String(b.cost), techName(b.tech), b.description]));
    case 'techs':
      return table(['Technologie', 'Stufe', 'Kosten', 'Voraussetzungen', 'Schaltet frei'], TECHS.map((t, id) => [
        t.name, String(t.tier), String(techCost(id)), t.prereqs.map((p) => TECHS[p].name).join(', ') || '–', techUnlocks(id).join('<br>') || '–']));
    case 'doctrines':
      return table(['Leitbild', 'Bereich', 'Technologie', 'Wirkung'], DOCTRINES.map((d) => [d.name, CATEGORY_NAMES[d.category], techName(d.tech), d.description]));
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
