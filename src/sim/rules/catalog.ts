// Spielinhalte als Tabellen – eine Quelle für das Handbuch (F1) und docs/REGELN-DATEN.md.
// Rein und ohne DOM, damit es auch in Tests/Node läuft.
import { BUILDINGS } from './buildings';
import { CATEGORY_NAMES, DOCTRINES } from './doctrines';
import { CLEAR_TECH, IMPROVEMENTS, RESOURCE_IMPROVEMENT, ROAD_TECH } from './improvements';
import { RESOURCE_KIND_NAME, RESOURCES } from './resources';
import { TECHS, techCost } from './techs';
import { FEATURE, RELIEF, TERRAIN } from './terrain';
import { CLASS_NAMES, PROMOTIONS, UNIT_TYPES } from './units';
import { TENETS } from '../religion';

export type CatalogTab = 'terrain' | 'resources' | 'units' | 'promotions' | 'buildings' | 'wonders' | 'techs' | 'doctrines' | 'tenets';

export interface CatalogTable {
  title: string;
  head: string[];
  /** Zellen; mehrere Einträge in einer Zelle sind durch "\n" getrennt. */
  rows: string[][];
}

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

const y = (f: number, p: number, t: number) => `🌾${f} ⚒️${p} 💰${t}`;
const techName = (id: number | null) => (id === null ? '–' : TECHS[id].name);

export function catalog(tab: CatalogTab): CatalogTable {
  switch (tab) {
    case 'terrain':
      return {
        title: 'Gelände',
        head: ['Gelände', 'Erträge', 'Hinweis'],
        rows: [
          ...TERRAIN.map((t) => [t.name, y(t.yields.food, t.yields.prod, t.yields.trade), t.water ? 'Wasser – nur Schiffe' : '']),
          ...RELIEF.slice(1).map((r) => [r.name, `+${r.delta.prod} ⚒️`, Number.isFinite(r.moveCost) ? `Bewegung ${r.moveCost}, Verteidigung +${r.defense} %` : 'unpassierbar']),
          ...FEATURE.slice(1).map((f) => [f.name, y(f.delta.food, f.delta.prod, f.delta.trade), Number.isFinite(f.moveCost) ? `Bewegung ${f.moveCost}, Verteidigung +${f.defense} %` : 'unpassierbar']),
        ],
      };
    case 'resources':
      return {
        title: 'Ressourcen',
        head: ['Ressource', 'Art', 'Bonus', 'Braucht'],
        rows: RESOURCES.filter((r) => r !== null).map((r) => [
          `${r!.icon} ${r!.name}`, RESOURCE_KIND_NAME[r!.kind], y(r!.delta.food, r!.delta.prod, r!.delta.trade),
          RESOURCE_IMPROVEMENT[r!.key] ? IMPROVEMENTS[RESOURCE_IMPROVEMENT[r!.key]]!.name : 'Fischerei',
        ]),
      };
    case 'units':
      return {
        title: 'Einheiten',
        head: ['Einheit', 'Klasse', 'Kosten', 'Stärke', 'Fernkampf', 'Bewegung', 'Technologie', 'Ressourcen'],
        rows: UNIT_TYPES.map((u) => [`${u.icon} ${u.name}`, CLASS_NAMES[u.cls], String(u.cost), String(u.strength || '–'),
          u.ranged ? `${u.ranged} (${u.range})` : '–', String(u.moves), techName(u.tech),
          u.resources.map((k) => RESOURCES.find((r) => r?.key === k)?.name ?? k).join(', ') || '–']),
      };
    case 'promotions':
      return {
        title: 'Beförderungen',
        head: ['Beförderung', 'Wirkung', 'Voraussetzung'],
        rows: PROMOTIONS.map((p) => [p.name, p.description, p.requires.map((r) => PROMOTIONS[r].name).join(' oder ') || '–']),
      };
    case 'buildings':
      return {
        title: 'Gebäude',
        head: ['Gebäude', 'Kosten', 'Technologie', 'Wirkung'],
        rows: BUILDINGS.filter((b) => !b.wonder && !b.project).map((b) => [`${b.icon} ${b.name}`, b.buildable ? String(b.cost) : '–', techName(b.tech), b.description]),
      };
    case 'wonders':
      return {
        title: 'Wunder und Projekt',
        head: ['Wunder / Projekt', 'Kosten', 'Technologie', 'Wirkung'],
        rows: BUILDINGS.filter((b) => b.wonder || b.project).map((b) => [`${b.icon} ${b.name}`, String(b.cost), techName(b.tech), b.description]),
      };
    case 'techs':
      return {
        title: 'Technologien',
        head: ['Technologie', 'Stufe', 'Kosten', 'Voraussetzungen', 'Schaltet frei'],
        rows: TECHS.map((t, id) => [t.name, String(t.tier), String(techCost(id)), t.prereqs.map((p) => TECHS[p].name).join(', ') || '–', techUnlocks(id).join('\n') || '–']),
      };
    case 'tenets':
      return {
        title: 'Lehren der Religionen',
        head: ['Lehre', 'Wirkung'],
        rows: TENETS.map((t) => [t.name, t.description]),
      };
    case 'doctrines':
      return {
        title: 'Leitbilder',
        head: ['Leitbild', 'Bereich', 'Technologie', 'Wirkung'],
        rows: DOCTRINES.map((d) => [d.name, CATEGORY_NAMES[d.category], techName(d.tech), d.description]),
      };
  }
}

export const CATALOG_TABS: CatalogTab[] = ['terrain', 'resources', 'units', 'promotions', 'buildings', 'wonders', 'techs', 'doctrines', 'tenets'];

const mdCell = (c: string) => c.replace(/\|/g, '\\|').replace(/\n/g, '<br>');

/** Alle Tabellen als Markdown (Inhalt von docs/REGELN-DATEN.md). */
export function catalogMarkdown(): string {
  const parts = [
    '# iv4ever – Spieldaten',
    '',
    'Automatisch aus `src/sim/rules/` erzeugt (`npm run docs`). Nicht von Hand bearbeiten – Regeln und Erklärungen stehen in `REGELN.md`.',
  ];
  for (const tab of CATALOG_TABS) {
    const t = catalog(tab);
    parts.push('', `## ${t.title}`, '', `| ${t.head.join(' | ')} |`, `|${t.head.map(() => '---').join('|')}|`);
    for (const r of t.rows) parts.push(`| ${r.map(mdCell).join(' | ')} |`);
  }
  return parts.join('\n') + '\n';
}
