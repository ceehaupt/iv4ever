// Feldbeschreibung als Text – für den Kartencursor (Screenreader) und alle, die die Karte ohne Sehen nutzen.
import type { GameView } from '../protocol';
import { type GameMap, type Knows, resourceActive, tileYields, touchesRiver } from '../sim/map';
import { IMPROVEMENTS } from '../sim/rules/improvements';
import { RESOURCES } from '../sim/rules/resources';
import { tileName } from '../sim/rules/terrain';
import { UNIT_TYPES } from '../sim/rules/units';

export function describeTile(map: GameMap, view: GameView, i: number, knows: Knows): string {
  const c = i % map.width;
  const r = (i / map.width) | 0;
  const pos = `Feld ${c}, ${r}`;
  const fog = view.fog[i];
  if (fog === 0) return `Unerforscht. ${pos}.`;
  const parts: string[] = [tileName(map.terrain[i], map.relief[i], map.feature[i])];
  const city = view.cities.find((x) => x.tile === i);
  const owner = view.tileOwner[i];
  const name = (pid: number) => (pid === view.human ? 'dein' : view.players.find((p) => p.id === pid)?.name ?? 'fremd');
  if (city) parts.unshift(`Stadt ${city.name}, Größe ${city.size}${city.owner === view.human ? '' : `, gehört ${name(city.owner)}`}`);
  else if (owner >= 0) parts.push(owner === view.human ? 'eigenes Gebiet' : `Gebiet von ${name(owner)}`);
  const res = RESOURCES[map.resource[i]];
  if (res) parts.push(`${res.name}${resourceActive(map, i, knows) ? '' : ' (noch ohne Wirkung)'}`);
  const imp = IMPROVEMENTS[view.layers.improvement[i]];
  if (imp) parts.push(imp.name);
  if (view.layers.road[i]) parts.push('Straße');
  if (touchesRiver(map, i)) parts.push('Fluss');
  if (view.layers.pollution[i]) parts.push('verschmutzt');
  const y = tileYields(map, i, knows);
  parts.push(`Nahrung ${y.food}, Produktion ${y.prod}, Handel ${y.trade}`);
  if (fog === 2) {
    const units = view.units.filter((u) => u.tile === i && !u.carriedBy);
    if (units.length) {
      const list = units.map((u) => `${u.owner === view.human ? '' : `${name(u.owner)}: `}${UNIT_TYPES[u.type].name}${u.hp < 100 ? ` (${u.hp} LP)` : ''}`);
      parts.push(`Einheiten: ${list.join(', ')}`);
    }
  } else parts.push('im Nebel');
  return `${parts.join('. ')}. ${pos}.`;
}
