import { FONT } from './shared.js';

// One piece square at size s: the fill shape and the stroke ring, so the screen,
// SVG and PNG all draw it the same way. Dashes are spaced so each side gets
// `dashes` of them, centered on the corners.
export function squareGeom(s, look) {
  const rx = Math.min(look.radius, 0.5) * s;
  const out = { fill: look.fill ? { x: 0, y: 0, w: s, h: s, rx } : null, stroke: null };
  const st = look.stroke;
  if (!st.visible || st.width <= 0) return out;
  const off = st.position === 'inside' ? st.width / 2 : st.position === 'outside' ? -st.width / 2 : 0;
  const side = s - off * 2, r = Math.max(0, Math.min(rx - off, side / 2));
  const perimeter = 4 * (side - 2 * r) + 2 * Math.PI * r;
  const unit = perimeter / (4 * Math.max(1, st.dashes));
  let dash = null, offset = 0, cap = 'butt';
  if (st.style === 'dashed') { dash = [unit / 2, unit / 2]; offset = unit / 4; }
  if (st.style === 'dotted') { dash = [0.001, unit]; cap = 'round'; }
  out.stroke = { x: off, y: off, w: side, h: side, rx: r, width: st.width, dash, offset, cap };
  return out;
}

const r2 = (n) => Math.round(n * 100) / 100;
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Whole board as editable SVG
export function boardSVG(B) {
  const { s, look } = B;
  const g = squareGeom(s, look);
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(B.width)}" height="${r2(B.height)}" viewBox="0 0 ${r2(B.width)} ${r2(B.height)}">`,
    `<rect width="100%" height="100%" fill="${B.bg}"/>`,
  ];
  for (const c of B.circles) out.push(`<circle cx="${r2(c.x + s / 2)}" cy="${r2(c.y + s / 2)}" r="${r2(c.r)}" fill="${c.fill}"/>`);
  for (const q of B.squares) {
    const parts = [];
    if (g.fill) parts.push(`<rect x="${r2(q.x)}" y="${r2(q.y)}" width="${r2(s)}" height="${r2(s)}" rx="${r2(g.fill.rx)}" fill="${q.fill}"/>`);
    if (g.stroke) {
      const k = g.stroke;
      const dash = k.dash ? ` stroke-dasharray="${k.dash.map(r2).join(' ')}" stroke-dashoffset="${r2(k.offset)}"` : '';
      parts.push(`<rect x="${r2(q.x + k.x)}" y="${r2(q.y + k.y)}" width="${r2(k.w)}" height="${r2(k.h)}" rx="${r2(k.rx)}" fill="none" stroke="${q.stroke}" stroke-width="${r2(k.width)}" stroke-linecap="${k.cap}"${dash}/>`);
    }
    if (q.text) parts.push(`<text x="${r2(q.x + s / 2)}" y="${r2(q.y + s / 2)}" font-family='${FONT.replace(/"/g, '')}' font-weight="${B.weight}" font-size="${r2(B.fontSize)}" fill="${B.ink}" text-anchor="middle" dominant-baseline="central">${esc(q.text)}</text>`);
    out.push(`<g>${parts.join('')}</g>`);
  }
  out.push('</svg>');
  return out.join('\n');
}

// Whole board as a transparent PNG
export async function boardPNG(B, scale = 2) {
  await document.fonts.ready;
  const { s, look } = B;
  const g = squareGeom(s, look);
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(B.width * scale); cv.height = Math.ceil(B.height * scale);
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  for (const c of B.circles) {
    ctx.fillStyle = c.fill; ctx.beginPath(); ctx.arc(c.x + s / 2, c.y + s / 2, c.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${B.weight} ${B.fontSize}px ${FONT}`;
  for (const q of B.squares) {
    if (g.fill) {
      ctx.fillStyle = q.fill; ctx.beginPath(); ctx.roundRect(q.x, q.y, s, s, g.fill.rx); ctx.fill();
    }
    if (g.stroke) {
      const k = g.stroke;
      ctx.strokeStyle = q.stroke; ctx.lineWidth = k.width; ctx.lineCap = k.cap;
      ctx.setLineDash(k.dash ?? []); ctx.lineDashOffset = k.offset;
      ctx.beginPath(); ctx.roundRect(q.x + k.x, q.y + k.y, k.w, k.h, k.rx); ctx.stroke();
    }
    if (q.text) { ctx.fillStyle = B.ink; ctx.fillText(q.text, q.x + s / 2, q.y + s / 2); }
  }
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}
