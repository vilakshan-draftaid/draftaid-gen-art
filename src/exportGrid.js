import { FONT } from './shared.js';

// Turns the current Symbol grid into exact geometry, then SVG or PNG
// Cells carry their grid index; a callout cell spans `span` squares as one strip
export function layoutGrid(p, cells, colors) {
  const { columns, rows, cellSize: s, gap, jitter } = p.grid;
  const width = columns * s + (columns - 1) * gap;
  const height = rows * s + (rows - 1) * gap;
  const items = cells.map((c, n) => {
    const i = c.index ?? n;
    const col = i % columns, row = Math.floor(i / columns);
    const shift = c.filled ? { x: c.dx * jitter * s, y: c.dy * jitter * s } : { x: 0, y: 0 };
    const x = col * (s + gap) + shift.x, y = row * (s + gap) + shift.y;
    if (c.callout) {
      return { x, y, s, w: c.span * s + (c.span - 1) * gap, square: colors[c.color], callout: c.callout.pieces, em: s * p.numbers.size * c.scale };
    }
    return {
      x, y, s,
      square: c.filled ? colors[c.color] : null,
      circle: !c.filled && !p.shapesOnly && p.empty.style === 'circles'
        ? { r: (s / 2) * p.empty.circleSize, fill: p.empty.circleColor === 'single' ? p.empty.single : colors[c.color] } : null,
      text: !p.shapesOnly && (c.filled || p.symbols.onEmpty) ? (p.symbols.use === 'mix' ? c.symbol : p.symbols.use) : null,
    };
  });
  return { width, height, items, bg: p.color.background, ink: p.symbols.ink, weight: p.symbols.weight, fontSize: s * p.symbols.size };
}

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toSVG(L) {
  const r = (n) => Math.round(n * 100) / 100;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r(L.width)}" height="${r(L.height)}" viewBox="0 0 ${r(L.width)} ${r(L.height)}">`,
    `<rect width="100%" height="100%" fill="${L.bg}"/>`,
    `<g font-family='${FONT.replace(/"/g, '')}' font-weight="${L.weight}" font-size="${r(L.fontSize)}" fill="${L.ink}" text-anchor="middle" dominant-baseline="central">`,
  ];
  for (const it of L.items) {
    if (it.callout) {
      const cx = it.x + it.w / 2, cy = it.y + it.s / 2;
      out.push(`<g><rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.s)}" fill="${it.square}"/>`);
      for (const q of it.callout) {
        out.push(`<text x="${r(cx + q.x * it.em)}" y="${r(cy + q.y * it.em)}" font-size="${r(q.size * it.em)}" text-anchor="start">${esc(q.t)}</text>`);
        if (q.over) out.push(`<rect x="${r(cx + q.over.x1 * it.em)}" y="${r(cy + q.over.y * it.em)}" width="${r((q.over.x2 - q.over.x1) * it.em)}" height="${r(0.07 * it.em)}"/>`);
      }
      out.push('</g>');
      continue;
    }
    if (it.square) out.push(`<rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.s)}" height="${r(it.s)}" fill="${it.square}"/>`);
    if (it.circle) out.push(`<circle cx="${r(it.x + it.s / 2)}" cy="${r(it.y + it.s / 2)}" r="${r(it.circle.r)}" fill="${it.circle.fill}"/>`);
    if (it.text) out.push(`<text x="${r(it.x + it.s / 2)}" y="${r(it.y + it.s / 2)}">${esc(it.text)}</text>`);
  }
  out.push('</g></svg>');
  return out.join('\n');
}

export async function toPNG(L, scale = 2) {
  await document.fonts.ready;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(L.width * scale); cv.height = Math.ceil(L.height * scale);
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  // Transparent background, so the PNG drops onto anything
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${L.weight} ${L.fontSize}px ${FONT}`;
  for (const it of L.items) {
    if (it.callout) {
      const cx = it.x + it.w / 2, cy = it.y + it.s / 2;
      ctx.fillStyle = it.square; ctx.fillRect(it.x, it.y, it.w, it.s);
      ctx.fillStyle = L.ink; ctx.textAlign = 'left';
      for (const q of it.callout) {
        ctx.font = `${L.weight} ${q.size * it.em}px ${FONT}`;
        ctx.fillText(q.t, cx + q.x * it.em, cy + q.y * it.em);
        if (q.over) ctx.fillRect(cx + q.over.x1 * it.em, cy + q.over.y * it.em, (q.over.x2 - q.over.x1) * it.em, 0.07 * it.em);
      }
      ctx.textAlign = 'center'; ctx.font = `${L.weight} ${L.fontSize}px ${FONT}`;
      continue;
    }
    if (it.square) { ctx.fillStyle = it.square; ctx.fillRect(it.x, it.y, it.s, it.s); }
    if (it.circle) { ctx.fillStyle = it.circle.fill; ctx.beginPath(); ctx.arc(it.x + it.s / 2, it.y + it.s / 2, it.circle.r, 0, Math.PI * 2); ctx.fill(); }
    if (it.text) { ctx.fillStyle = L.ink; ctx.fillText(it.text, it.x + it.s / 2, it.y + it.s / 2); }
  }
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

// Hands the file to the viewer through the artifact's downloads capability
export async function saveFile(filename, data) {
  const downloads = await window.claude?.use?.('downloads');
  if (!downloads) return 'Export isn’t available in this view';
  try {
    await downloads.save({ filename, data });
    return `Saved ${filename}`;
  } catch (e) {
    return e?.code === 'declined' ? 'Export cancelled' : 'Couldn’t export, try again';
  }
}

// Copy to the clipboard. SVG copies as text (paste straight into Figma as vectors);
// PNG copies as an image. Falls back to saving a file if the clipboard is blocked.
export function copySVG(svg, filename) {
  const fallback = async () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = svg; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      if (ok) return 'SVG copied. Paste it into Figma.';
    } catch {}
    return (await saveFile(filename, svg)) + ' (clipboard blocked, saved instead)';
  };
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(svg).then(() => 'SVG copied. Paste it into Figma.', fallback);
  }
  return fallback();
}
export function copyPNG(blobPromise, filename) {
  try {
    if (navigator.clipboard?.write && window.ClipboardItem) {
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })])
        .then(() => 'PNG copied. Paste it anywhere.', async () => (await saveFile(filename, await blobPromise)) + ' (clipboard blocked, saved instead)');
    }
  } catch {}
  return blobPromise.then(async (b) => (await saveFile(filename, b)) + ' (clipboard blocked, saved instead)');
}
