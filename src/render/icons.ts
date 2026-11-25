import { Rectangle, Texture } from 'pixi.js';
import { RESOURCES } from '../sim/rules/resources';
import { UNIT_TYPES } from '../sim/rules/units';

const CELL = 64;
const RING = ['#7bd35a', '#c07cf0', '#ef6b5b']; // Bonus, Luxus, Strategisch
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

function atlasCanvas(cells: number, cols = 8): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; cols: number } {
  const rows = Math.ceil(cells / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  return { canvas, ctx, cols };
}

function slice(canvas: HTMLCanvasElement, cols: number, count: number): Texture[] {
  const base = Texture.from(canvas);
  return Array.from({ length: count }, (_, id) =>
    new Texture({ source: base.source, frame: new Rectangle((id % cols) * CELL, Math.floor(id / cols) * CELL, CELL, CELL) }),
  );
}

/**
 * Ressourcen-Symbole als ein einziger Textur-Atlas (ein Upload, alle Sprites batchen in einen Draw-Call).
 * Platzhalter-Emojis in einer Plakette – wird in M9 durch eigene Grafik ersetzt.
 */
export function createResourceAtlas(): Texture[] {
  const { canvas, ctx, cols } = atlasCanvas(RESOURCES.length);
  ctx.font = `${CELL * 0.5}px ${EMOJI_FONT}`;
  RESOURCES.forEach((res, id) => {
    if (!res) return;
    const x = (id % cols) * CELL + CELL / 2;
    const y = Math.floor(id / cols) * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(x, y, CELL * 0.44, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12, 18, 32, 0.78)';
    ctx.fill();
    ctx.lineWidth = CELL * 0.06;
    ctx.strokeStyle = RING[res.kind];
    ctx.stroke();
    ctx.fillText(res.icon, x, y + CELL * 0.03);
  });
  return slice(canvas, cols, RESOURCES.length);
}

export interface UnitAtlas {
  /** Weiße Scheibe mit dunklem Rand – wird per Tint in Spielerfarbe eingefärbt. */
  disc: Texture;
  /** Kleiner weißer Punkt (Bewegungsanzeige, Zähler-Hintergrund). */
  dot: Texture;
  /** Schild-Symbol für befestigte Einheiten. */
  shield: Texture;
  /** Symbol je Einheitentyp. */
  types: Texture[];
}

export function createUnitAtlas(): UnitAtlas {
  const count = 3 + UNIT_TYPES.length;
  const { canvas, ctx, cols } = atlasCanvas(count);
  const at = (k: number) => [(k % cols) * CELL + CELL / 2, Math.floor(k / cols) * CELL + CELL / 2] as const;

  let [x, y] = at(0);
  ctx.beginPath();
  ctx.arc(x, y, CELL * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = CELL * 0.07;
  ctx.strokeStyle = '#141820';
  ctx.stroke();

  [x, y] = at(1);
  ctx.beginPath();
  ctx.arc(x, y, CELL * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  [x, y] = at(2);
  ctx.font = `${CELL * 0.62}px ${EMOJI_FONT}`;
  ctx.fillText('🛡️', x, y + CELL * 0.04);

  ctx.font = `${CELL * 0.5}px ${EMOJI_FONT}`;
  UNIT_TYPES.forEach((t, k) => {
    [x, y] = at(3 + k);
    ctx.fillText(t.icon, x, y + CELL * 0.04);
  });

  const tex = slice(canvas, cols, count);
  return { disc: tex[0], dot: tex[1], shield: tex[2], types: tex.slice(3) };
}

export const ICON_CELL = CELL;
