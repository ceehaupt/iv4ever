/**
 * Eigene Einheiten-Piktogramme, mit Canvas-Pfaden gezeichnet (keine fremden Grafiken, keine Emojis).
 * Weiß mit dunkler Kontur, damit sie auf jeder Spielerfarbe lesbar sind.
 */
type Glyph =
  | 'tent' | 'pick' | 'eye' | 'club' | 'spear' | 'bow' | 'horse' | 'sword' | 'catapult' | 'cannon' | 'sail' | 'steamship'
  | 'bag' | 'rifle' | 'tank' | 'transport' | 'plane' | 'bomber' | 'flak' | 'carrier';

const GLYPH_BY_KEY: Record<string, Glyph> = {
  settler: 'tent', worker: 'pick', scout: 'eye', warrior: 'club', spearman: 'spear', archer: 'bow', horseman: 'horse',
  swordsman: 'sword', catapult: 'catapult', longbow: 'bow', pikeman: 'spear', knight: 'horse', trebuchet: 'catapult',
  galley: 'sail', war_galley: 'sail', caravel: 'sail', merchant: 'bag', musketeer: 'rifle', cannon: 'cannon',
  cavalry: 'horse', frigate: 'sail', rifleman: 'rifle', artillery: 'cannon', ironclad: 'steamship', infantry: 'rifle',
  tank: 'tank', destroyer: 'steamship', transport: 'transport',
  fighter: 'plane', bomber: 'bomber', flak: 'flak', carrier: 'carrier',
};

/** Zeichnet das Piktogramm zentriert bei (x, y) in einem Quadrat der Kantenlänge s. */
export function drawUnitGlyph(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, s: number): void {
  const glyph = GLYPH_BY_KEY[key] ?? 'club';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#141820';
  ctx.lineWidth = 7;
  const shape = (draw: () => void, fill = true) => {
    ctx.beginPath();
    draw();
    ctx.stroke();
    if (fill) ctx.fill();
  };
  const line = (pts: [number, number][], width = 9) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.lineWidth = width + 7;
    ctx.strokeStyle = '#141820';
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.strokeStyle = '#141820';
    ctx.lineWidth = 7;
  };
  switch (glyph) {
    case 'tent':
      shape(() => {
        ctx.moveTo(-34, 28);
        ctx.lineTo(0, -32);
        ctx.lineTo(34, 28);
        ctx.closePath();
      });
      ctx.fillStyle = '#141820';
      ctx.beginPath();
      ctx.moveTo(-8, 28);
      ctx.lineTo(0, 6);
      ctx.lineTo(8, 28);
      ctx.fill();
      break;
    case 'pick':
      line([[-20, 30], [16, -18]]);
      shape(() => {
        ctx.moveTo(-6, -34);
        ctx.quadraticCurveTo(22, -30, 34, -6);
        ctx.quadraticCurveTo(20, -18, 4, -22);
        ctx.closePath();
      });
      break;
    case 'eye':
      shape(() => {
        ctx.moveTo(-36, 0);
        ctx.quadraticCurveTo(0, -32, 36, 0);
        ctx.quadraticCurveTo(0, 32, -36, 0);
      });
      ctx.fillStyle = '#141820';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'club':
      // Axt: Stiel mit halbmondförmigem Blatt
      line([[-24, 32], [14, -26]], 8);
      shape(() => {
        ctx.moveTo(6, -30);
        ctx.quadraticCurveTo(34, -34, 36, -6);
        ctx.quadraticCurveTo(22, -14, 14, -12);
        ctx.closePath();
      });
      break;
    case 'spear':
      line([[-26, 32], [20, -20]], 7);
      shape(() => {
        ctx.moveTo(32, -32);
        ctx.lineTo(12, -24);
        ctx.lineTo(24, -12);
        ctx.closePath();
      });
      break;
    case 'bow':
      ctx.beginPath();
      ctx.arc(-6, 0, 32, -Math.PI / 2.4, Math.PI / 2.4);
      ctx.lineWidth = 15;
      ctx.stroke();
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.strokeStyle = '#141820';
      line([[-26, 0], [34, 0]], 5);
      shape(() => {
        ctx.moveTo(38, 0);
        ctx.lineTo(26, -8);
        ctx.lineTo(26, 8);
        ctx.closePath();
      });
      break;
    case 'horse':
      shape(() => {
        ctx.moveTo(-24, 32);
        ctx.lineTo(-18, -2);
        ctx.quadraticCurveTo(-14, -30, 10, -34);
        ctx.lineTo(16, -26);
        ctx.quadraticCurveTo(34, -18, 32, -6);
        ctx.lineTo(22, -4);
        ctx.quadraticCurveTo(10, -10, 6, 2);
        ctx.lineTo(14, 32);
        ctx.closePath();
      });
      break;
    case 'sword':
      line([[-24, 28], [24, -24]], 9);
      line([[-14, 6], [0, 20]], 7);
      break;
    case 'catapult':
      shape(() => ctx.rect(-32, 12, 64, 12));
      shape(() => ctx.arc(-20, 28, 8, 0, Math.PI * 2));
      shape(() => ctx.arc(20, 28, 8, 0, Math.PI * 2));
      line([[-10, 12], [22, -26]], 7);
      shape(() => ctx.arc(26, -30, 8, 0, Math.PI * 2));
      break;
    case 'cannon':
      shape(() => {
        ctx.save();
        ctx.rotate(-0.35);
        ctx.roundRect(-30, -12, 62, 22, 8);
        ctx.restore();
      });
      shape(() => ctx.arc(-6, 18, 14, 0, Math.PI * 2));
      break;
    case 'sail':
      shape(() => {
        ctx.moveTo(-36, 14);
        ctx.lineTo(36, 14);
        ctx.lineTo(24, 30);
        ctx.lineTo(-24, 30);
        ctx.closePath();
      });
      shape(() => {
        ctx.moveTo(-2, 8);
        ctx.lineTo(-2, -34);
        ctx.quadraticCurveTo(30, -16, 24, 8);
        ctx.closePath();
      });
      break;
    case 'steamship':
    case 'transport':
      shape(() => {
        ctx.moveTo(-38, 8);
        ctx.lineTo(38, 8);
        ctx.lineTo(28, 28);
        ctx.lineTo(-28, 28);
        ctx.closePath();
      });
      shape(() => ctx.rect(-16, -10, 30, 18));
      shape(() => ctx.rect(-6, -30, 10, 20));
      if (glyph === 'transport') shape(() => ctx.rect(18, -6, 14, 14));
      break;
    case 'bag':
      shape(() => {
        ctx.moveTo(-10, -26);
        ctx.lineTo(10, -26);
        ctx.lineTo(4, -16);
        ctx.quadraticCurveTo(34, 0, 26, 24);
        ctx.quadraticCurveTo(0, 36, -26, 24);
        ctx.quadraticCurveTo(-34, 0, -4, -16);
        ctx.closePath();
      });
      ctx.fillStyle = '#141820';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 8);
      break;
    case 'rifle':
      line([[-34, 16], [30, -16]], 8);
      shape(() => {
        ctx.moveTo(-34, 16);
        ctx.lineTo(-22, 30);
        ctx.lineTo(-10, 22);
        ctx.lineTo(-18, 10);
        ctx.closePath();
      });
      line([[22, -12], [34, -26]], 4);
      break;
    case 'plane':
    case 'bomber': {
      // Rumpf, Tragflächen, Leitwerk – von oben gesehen; Bomber mit breiteren Flächen und zwei Motoren.
      const wide = glyph === 'bomber';
      shape(() => ctx.roundRect(-6, -36, 12, 72, 6));
      shape(() => {
        ctx.moveTo(-6, -6);
        ctx.lineTo(wide ? -44 : -38, wide ? 8 : 4);
        ctx.lineTo(wide ? -44 : -38, wide ? 18 : 12);
        ctx.lineTo(-6, 10);
        ctx.moveTo(6, -6);
        ctx.lineTo(wide ? 44 : 38, wide ? 8 : 4);
        ctx.lineTo(wide ? 44 : 38, wide ? 18 : 12);
        ctx.lineTo(6, 10);
      });
      shape(() => {
        ctx.moveTo(-4, 24);
        ctx.lineTo(-18, 34);
        ctx.lineTo(18, 34);
        ctx.lineTo(4, 24);
        ctx.closePath();
      });
      if (wide) {
        shape(() => ctx.arc(-22, 6, 6, 0, Math.PI * 2));
        shape(() => ctx.arc(22, 6, 6, 0, Math.PI * 2));
      }
      break;
    }
    case 'flak':
      // Geschütz mit zwei steil nach oben gerichteten Rohren auf einer Lafette.
      shape(() => ctx.roundRect(-30, 14, 60, 16, 6));
      shape(() => ctx.arc(0, 10, 12, Math.PI, 0));
      line([[-4, 4], [-18, -32]], 6);
      line([[4, 4], [10, -34]], 6);
      break;
    case 'carrier':
      // Langer Rumpf mit flachem Deck und Inselaufbau.
      shape(() => {
        ctx.moveTo(-42, 4);
        ctx.lineTo(42, 4);
        ctx.lineTo(32, 24);
        ctx.lineTo(-32, 24);
        ctx.closePath();
      });
      shape(() => ctx.rect(-42, -4, 84, 8));
      shape(() => ctx.rect(18, -22, 12, 18));
      line([[-30, 0], [6, 0]], 3);
      break;
    case 'tank':
      shape(() => ctx.roundRect(-34, 6, 68, 22, 10));
      shape(() => ctx.roundRect(-18, -12, 34, 20, 6));
      line([[12, -4], [38, -14]], 6);
      break;
  }
  ctx.restore();
}
