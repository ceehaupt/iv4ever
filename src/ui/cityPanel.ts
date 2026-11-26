import type { CityView, UnitView } from '../protocol';
import { type BuildItem, buildCost, buildName } from '../sim/city';
import { BUILDINGS } from '../sim/rules/buildings';
import { UNIT_TYPES } from '../sim/rules/units';

export interface CityPanelHandlers {
  onClose(): void;
  onBuild(item: BuildItem, append: boolean): void;
  onUnqueue(index: number): void;
  onSelectUnit(unitId: number): void;
}

function itemIcon(item: BuildItem): string {
  return item.kind === 'unit' ? UNIT_TYPES[item.id].icon : BUILDINGS[item.id].icon;
}

function itemInfo(item: BuildItem): string {
  if (item.kind === 'building') return BUILDINGS[item.id].description;
  const u = UNIT_TYPES[item.id];
  const extra = u.popCost ? ` Kostet ${u.popCost} Bürger (Stadt braucht Größe ${u.popCost + 1}).` : '';
  return `Stärke ${u.strength}, Bewegung ${u.moves}, Sicht ${u.sight}.${extra}`;
}

function bar(value: number, max: number, cls: string): string {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="bar ${cls}"><span style="width:${pct}%"></span></div>`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Stadtansicht als Seitenpanel; die Felder werden parallel auf der Karte angezeigt. */
export class CityPanel {
  private readonly el = document.getElementById('citypanel')!;
  private cityId = -1;

  constructor(h: CityPanelHandlers) {
    this.el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-close],[data-build],[data-unqueue],[data-unit]');
      if (!t) return;
      if (t.dataset.close !== undefined) h.onClose();
      else if (t.dataset.build) {
        const [kind, id] = t.dataset.build.split(':');
        h.onBuild({ kind: kind as BuildItem['kind'], id: Number(id) }, e.shiftKey);
      } else if (t.dataset.unqueue) h.onUnqueue(Number(t.dataset.unqueue));
      else if (t.dataset.unit) h.onSelectUnit(Number(t.dataset.unit));
    });
  }

  get openCityId(): number {
    return this.cityId;
  }

  hide(): void {
    this.cityId = -1;
    this.el.hidden = true;
  }

  show(c: CityView, unitsHere: UnitView[]): void {
    const o = c.own;
    if (!o) return;
    this.cityId = c.id;
    const r = o.report;
    const y = r.yields;
    const current = o.queue[0];
    const prod = y.prod;
    // „Ersetzen“ behält die gespeicherte Produktion – sie zählt also für jede Auswahl.
    const turnsFor = (item: BuildItem) =>
      prod > 0 ? Math.max(1, Math.ceil((buildCost(item) - o.prodStored) / prod)) : null;

    const queue = o.queue
      .map(
        (q, k) => `<li>${itemIcon(q)} ${buildName(q)} <small>${k === 0 ? `${o.prodStored}/${buildCost(q)}` : buildCost(q)}</small>
          <button type="button" class="x" data-unqueue="${k}" title="Entfernen">✕</button></li>`,
      )
      .join('');
    const options = o.available
      .map((item) => {
        const t = turnsFor(item);
        return `<button type="button" class="build" data-build="${item.kind}:${item.id}" title="${itemInfo(item)}">
          <span>${itemIcon(item)} ${buildName(item)}</span><small>${buildCost(item)} ⚒ · ${t ? plural(t, 'Runde', 'Runden') : '–'}</small></button>`;
      })
      .join('');
    const buildings = o.buildings.length
      ? o.buildings.map((b) => `<span class="tag" title="${BUILDINGS[b].description}">${BUILDINGS[b].icon} ${BUILDINGS[b].name}</span>`).join('')
      : '<small>noch keine</small>';
    const units = unitsHere
      .map((u) => `<button type="button" class="chip" data-unit="${u.id}" title="${UNIT_TYPES[u.type].name}">${UNIT_TYPES[u.type].icon}</button>`)
      .join('');

    const growth =
      r.surplus > 0
        ? `wächst in ${plural(o.turnsToGrow ?? 0, 'Runde', 'Runden')}`
        : r.surplus < 0
          ? '<span class="warn">Hunger!</span>'
          : 'stagniert';
    const moodLine = r.unrest
      ? `<span class="warn">Unruhe – keine Produktion und kein Handel</span>`
      : r.unhappy > 0
        ? `<span class="warn">${plural(r.unhappy, 'Bürger unzufrieden', 'Bürger unzufrieden')} (−${Math.round((1 - r.efficiency) * 100)} % ⚒/💰)</span>`
        : 'alle zufrieden';

    this.el.hidden = false;
    this.el.innerHTML = `
      <header>
        <h2>${c.capital ? '★ ' : ''}${c.name} <small>Größe ${c.size}</small></h2>
        <button type="button" class="x" data-close title="Schließen (Esc)">✕</button>
      </header>
      <section>
        <div class="row"><span>🌾 Nahrung ${y.food} − ${r.foodUpkeep} = <b>${r.surplus >= 0 ? '+' : ''}${r.surplus}</b></span><small>${growth}</small></div>
        ${bar(o.foodStored, r.foodToGrow, 'food')}
        <small>${o.foodStored}/${r.foodToGrow} gespeichert</small>
      </section>
      <section>
        <div class="row"><span>⚒️ Produktion <b>${prod}</b></span>
          <small>${current ? (o.turnsToBuild ? `fertig in ${plural(o.turnsToBuild, 'Runde', 'Runden')}` : 'keine Produktion') : '<span class="warn">kein Auftrag</span>'}</small></div>
        ${current ? bar(o.prodStored, buildCost(current), 'prod') : ''}
        ${queue ? `<ol class="queue">${queue}</ol>` : ''}
      </section>
      <section>
        <h3>Bauen <small>Klick = ersetzen · Shift+Klick = anhängen</small></h3>
        <div class="options">${options}</div>
      </section>
      <section class="grid2">
        <span>💰 Handel</span><b>${y.trade} <small>→ 🔬 ${r.research} · 💰 ${r.gold}</small></b>
        <span>🛤️ Handelsnetz</span><span>${c.capital ? 'Hauptstadt' : r.connected ? 'angebunden (+2 💰)' : '<span class="warn">nicht angebunden</span> – Straße oder Fluss zur Hauptstadt'}</span>
        <span>👥 Spezialisten</span><b>${r.specialists} <small>(+${r.specialists * 2} 💰)</small></b>
        <span>🙂 Stimmung</span><span>Grenze ${r.moodLimit} · ${moodLine}</span>
        <span>💧 Versorgung</span><span>Grenze ${r.supplyLimit}${r.supplyDeficit ? ` · <span class="warn">−${r.supplyDeficit} 🌾</span>` : ' · ausreichend'}</span>
        ${o.pollution ? `<span>🏭 Verschmutzung</span><span class="warn">${o.pollution}/Runde · ${Math.min(100, o.pollution * 4)} % Chance je Runde, dass ein Feld verschmutzt</span>` : ''}
        <span>🕊️ Religion</span><span>${c.religion ? `${c.religion}${c.holy ? ' (heilige Stadt)' : ''}` : 'keine'}</span>
        <span>🎭 Kultur</span><span>${o.culture} (+${r.culture}/Runde) · Radius ${r.radius}${o.cultureToNext !== null ? ` · nächster Ring in ${o.cultureToNext}` : ''}</span>
      </section>
      <section><h3>Gebäude</h3><div class="tags">${buildings}</div></section>
      ${o.routes.length ? `<section><h3>Handelsrouten</h3><div class="tags">${o.routes.map((r) => `<span class="tag">${r}</span>`).join('')}</div></section>` : ''}
      ${units ? `<section><h3>Einheiten in der Stadt</h3>${units}</section>` : ''}
      <p class="hint">Felder auf der Karte anklicken: fest bewirtschaften bzw. wieder freigeben.</p>`;
  }
}
