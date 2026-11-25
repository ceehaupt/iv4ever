import { Rectangle, Texture } from 'pixi.js';
import { RESOURCES } from '../sim/rules/resources';

const CELL = 64;
const RING = ['#7bd35a', '#c07cf0', '#ef6b5b']; // Bonus, Luxus, Strategisch

/**
 * Ressourcen-Symbole als ein einziger Textur-Atlas (ein Upload, alle Sprites batchen in einen Draw-Call).
 * Platzhalter-Emojis in einer Plakette – wird in M9 durch eigene Grafik ersetzt.
 */
export function createResourceAtlas(): Texture[] {
  const ids = RESOURCES.length;
  const cols = 8;
  const rows = Math.ceil(ids / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${CELL * 0.5}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

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

  const base = Texture.from(canvas);
  return RESOURCES.map((_, id) =>
    new Texture({
      source: base.source,
      frame: new Rectangle((id % cols) * CELL, Math.floor(id / cols) * CELL, CELL, CELL),
    }),
  );
}

export const ICON_CELL = CELL;
