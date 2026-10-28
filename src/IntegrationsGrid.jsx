import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialKitController } from 'dialkit';

import { hashSeed } from './shared.js';
import { usePaletteSync, paletteSlots, paletteAction, PaletteRows } from './usePaletteSync.js';
import { NOISE_TYPES, makeNoise, fbm } from './noise.js';
import { LOGOS, integrationsLayout, logoRect } from './integrations.js';
import { copySVG, copyPNG } from './exportGrid.js';

// Draftaid's CAD integrations on a noise grid: logos sit where the squares collect,
// available ones in one tile color and coming soon in another
export default function IntegrationsGrid() {
  const ctrl = useRef(null);
  const [status, setStatus] = useState('');
  const exportRef = useRef(null);
  const dial = useDialKitController('Integrations', {
    seed: { type: 'text', default: 'draftaid', placeholder: 'Any word' },
    shuffle: { type: 'action', label: 'New seed' },
    exportSvg: { type: 'action', label: 'Copy SVG' },
    exportPng: { type: 'action', label: 'Copy PNG' },
    grid: {
      columns: [14, 6, 30, 1],
      rows: [12, 4, 24, 1],
      cellSize: [64, 24, 140, 1],
      gap: [0, 0, 24, 1],
      fill: [0.3, 0, 1, 0.01],
    },
    noise: {
      type: { type: 'select', options: NOISE_TYPES, default: 'perlin' },
      scale: [0.18, 0.02, 1, 0.01],
      octaves: [3, 1, 6, 1],
      contrast: [0.85, 0, 1, 0.01],
      noiseMap: { type: 'image', default: '' },
    },
    logos: {
      size: [0.5, 0.25, 0.9, 0.01],
      // How tall tiles start; drag a tile's corner to resize just that one
      tileRows: [1, 1, 4, 1],
      availableTile: '#00E8AD',
      availableLogo: '#000000',
      comingSoonTile: '#0A0A0A',
      comingSoonLogo: '#FFFFFF',
    },
    // Tiles you moved or resized, saved with each version
    manual: {
      pins: { type: 'text', default: '{}' },
      resetPins: { type: 'action', label: 'Reset pins' },
    },
    // On/off per logo
    showLogos: Object.fromEntries(LOGOS.map((l) => [l.id, true])),
    empty: {
      style: { type: 'select', options: [
        { value: 'blank', label: 'Blank' },
        { value: 'circles', label: 'Circles' },
      ], default: 'circles' },
      circleSize: [0.8, 0.1, 1, 0.01],
      circleColor: '#F4F4F4',
    },
    color: {
      // Random mixes the palette evenly; By noise bands it, C1 densest to C4 sparsest
      mode: { type: 'select', options: [
        { value: 'random', label: 'Random' },
        { value: 'noise', label: 'By noise' },
      ], default: 'random' },
      palette: { type: 'select', options: [
        { value: 'plot', label: 'Plot' },
        { value: 'draftaid', label: 'Draftaid' },
        { value: 'draftaidDark', label: 'Draftaid Dark' },
        { value: 'custom', label: 'Custom' },
      ], default: 'custom' },
      // Light greys by default, so the green and black logo tiles stand out
      ...paletteSlots(['#E4E4E4', '#DADADA', '#D0D0D0', '#C6C6C6']),
      background: '#FFFFFF',
    },
  }, {
    id: 'integrations-grid',
    persist: true,
    onAction: (a) => {
      paletteAction(a, ctrl.current);
      if (a === 'shuffle') ctrl.current?.setValue('seed', Math.random().toString(36).slice(2, 8));
      if (a === 'exportSvg' || a === 'exportPng') exportRef.current?.(a === 'exportSvg' ? 'svg' : 'png');
      if (String(a).includes('resetPins')) ctrl.current?.setValue('manual.pins', '{}');
    },
  });
  ctrl.current = dial;
  const p = dial.values;
  const colors = usePaletteSync(dial);
  const { columns, rows, cellSize, gap, fill } = p.grid;
  const seed = hashSeed((p.seed || ' ') + '#noise');

  // Saved pins, plus the tile being dragged right now
  const pins = useMemo(() => { try { return JSON.parse(p.manual.pins || '{}'); } catch { return {}; } }, [p.manual.pins]);
  const [drag, setDrag] = useState(null);
  const livePins = drag ? { ...pins, [drag.id]: drag.rect } : pins;

  const layout = useMemo(() => integrationsLayout({
    columns, rows, fill, seed, logoSize: p.logos.size, tileRows: p.logos.tileRows, pins: livePins,
    logos: LOGOS.filter((l) => p.showLogos?.[l.id] !== false),
    noise: p.noise, colorByNoise: p.color.mode === 'noise', colorCount: colors.length,
  }), [colors.length, JSON.stringify(livePins), p.logos.tileRows, p.color.mode, columns, rows, fill, seed, p.logos.size, JSON.stringify(p.showLogos), p.noise.type, p.noise.scale, p.noise.octaves, p.noise.contrast]);

  // Live picture of the noise map for the panel
  useEffect(() => {
    const noise = makeNoise(p.noise.type, seed);
    const W = 240, H = Math.max(40, Math.min(240, Math.round((W * rows) / columns)));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H);
    const vals = new Float32Array(W * H);
    let lo = Infinity, hi = -Infinity;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = fbm(noise, (x / W) * columns * p.noise.scale, (y / H) * rows * p.noise.scale, p.noise.octaves);
      vals[y * W + x] = n; lo = Math.min(lo, n); hi = Math.max(hi, n);
    }
    for (let i = 0; i < vals.length; i++) {
      const g = Math.round(((vals[i] - lo) / (hi - lo || 1)) * 255);
      img.data.set([g, g, g, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    dial.setValue('noise.noiseMap', cv.toDataURL('image/png'));
    // Also when the map is empty: the first run can land before the panel is ready
  }, [seed, columns, rows, p.noise.type, p.noise.scale, p.noise.octaves, !p.noise.noiseMap]);

  const circles = p.empty.style === 'circles';
  const tileColor = (t) => (t.available ? p.logos.availableTile : p.logos.comingSoonTile);
  const logoColor = (t) => (t.available ? p.logos.availableLogo : p.logos.comingSoonLogo);
  const cell = `min(${cellSize}px, calc((100vw - 32px - ${gap * (columns - 1)}px) / ${columns}), calc((100vh - 120px - ${gap * (rows - 1)}px) / ${rows}))`;

  // Drag a tile to move it; drag its corner handle to resize. Snaps to whole squares
  const gridRef = useRef(null);
  const startDrag = (e, t, mode) => {
    e.preventDefault(); e.stopPropagation();
    const box = gridRef.current.getBoundingClientRect();
    const px = (box.width + gap) / columns, py = (box.height + gap) / rows;
    const from = { col: t.col, row: t.row, w: t.w, h: t.h };
    const x0 = e.clientX, y0 = e.clientY;
    let rect = from;
    const move = (ev) => {
      const dc = Math.round((ev.clientX - x0) / px), dr = Math.round((ev.clientY - y0) / py);
      rect = mode === 'move'
        ? { ...from, col: Math.max(0, Math.min(columns - from.w, from.col + dc)), row: Math.max(0, Math.min(rows - from.h, from.row + dr)) }
        : { ...from, w: Math.max(1, Math.min(columns - from.col, from.w + dc)), h: Math.max(1, Math.min(rows - from.row, from.h + dr)) };
      setDrag({ id: t.id, rect });
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      setDrag(null);
      const moved = Object.keys(rect).some((k) => rect[k] !== from[k]);
      if (moved) dial.setValue('manual.pins', JSON.stringify({ ...pins, [t.id]: rect }));
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  exportRef.current = async (kind) => {
    const name = `integrations-${p.seed || 'seed'}.${kind}`;
    const B = { layout, colors, p, circles, tileColor, logoColor };
    const job = kind === 'svg' ? copySVG(await boardSVG(B), name) : copyPNG(boardPNG(B), name);
    Promise.resolve(job).then((m) => { setStatus(m); setTimeout(() => setStatus(''), 2600); });
  };

  return (
    <main className="stage" style={{ background: p.color.background }}>
      <PaletteRows count={colors.length} />
      <div
        ref={gridRef}
        className="grid integrations-grid"
        role="img"
        aria-label="Draftaid CAD integrations: Autodesk Inventor and SolidWorks available, more coming soon"
        style={{
          '--cell': cell,
          gridTemplateColumns: `repeat(${columns}, var(--cell))`,
          gridTemplateRows: `repeat(${rows}, var(--cell))`,
          gap,
        }}
      >
        {circles && layout.empties.map((e) => (
          <div key={`e${e.col}-${e.row}`} className="cell" style={{ gridColumn: e.col + 1, gridRow: e.row + 1 }}>
            <i className="dot" style={{ width: `${p.empty.circleSize * 100}%`, height: `${p.empty.circleSize * 100}%`, background: p.empty.circleColor }} />
          </div>
        ))}
        {layout.squares.map((q) => (
          <div key={`s${q.col}-${q.row}`} className="cell" style={{ gridColumn: q.col + 1, gridRow: q.row + 1, background: colors[q.color] }} />
        ))}
        {layout.tiles.map((t) => {
          // Logo box as a share of the tile, from the nominal sizes
          const W = t.w * cellSize + (t.w - 1) * gap, H = t.h * cellSize + (t.h - 1) * gap;
          const L = logoRect(W, H, cellSize, t.aspect, p.logos.size);
          return (
            <div
              key={t.id}
              className="logo-tile"
              data-dragging={drag?.id === t.id || undefined}
              title={`${t.label}${t.available ? '' : ' (coming soon)'}. Drag to move, drag the corner to resize`}
              onPointerDown={(e) => startDrag(e, t, 'move')}
              style={{ gridColumn: `${t.col + 1} / span ${t.w}`, gridRow: `${t.row + 1} / span ${t.h}`, background: tileColor(t) }}
            >
              <i
                style={{
                  left: `${(L.x / W) * 100}%`, top: `${(L.y / H) * 100}%`, width: `${(L.w / W) * 100}%`, height: `${(L.h / H) * 100}%`,
                  background: logoColor(t),
                  WebkitMask: `url("${t.src}") center / contain no-repeat`,
                  mask: `url("${t.src}") center / contain no-repeat`,
                }}
              />
              <b className="logo-resize" aria-hidden="true" onPointerDown={(e) => startDrag(e, t, 'resize')} />
            </div>
          );
        })}
      </div>
      <p className="reel-toast" role="status" aria-live="polite">{status}</p>
    </main>
  );
}

// Board geometry at the nominal cell size, shared by both exports
function geometry({ layout, p }) {
  const { columns, rows, cellSize: s, gap } = p.grid;
  const at = (c, r) => [c * (s + gap), r * (s + gap)];
  return { s, gap, at, width: columns * s + (columns - 1) * gap, height: rows * s + (rows - 1) * gap };
}
const r2 = (n) => Math.round(n * 100) / 100;
const dataURL = async (src) => {
  if (src.startsWith('data:')) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
};

// Editable SVG: each logo is its artwork used as a mask over a color, so it recolors in Figma
async function boardSVG(B) {
  const { layout, colors, p, circles, tileColor, logoColor } = B;
  const g = geometry(B);
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${r2(g.width)}" height="${r2(g.height)}" viewBox="0 0 ${r2(g.width)} ${r2(g.height)}">`,
    `<rect width="100%" height="100%" fill="${p.color.background}"/>`,
  ];
  if (circles) {
    out.push('<g id="Circles">');
    for (const e of layout.empties) { const [x, y] = g.at(e.col, e.row); out.push(`<circle cx="${r2(x + g.s / 2)}" cy="${r2(y + g.s / 2)}" r="${r2((g.s / 2) * p.empty.circleSize)}" fill="${p.empty.circleColor}"/>`); }
    out.push('</g>');
  }
  out.push('<g id="Squares">');
  for (const q of layout.squares) { const [x, y] = g.at(q.col, q.row); out.push(`<rect x="${r2(x)}" y="${r2(y)}" width="${g.s}" height="${g.s}" fill="${colors[q.color]}"/>`); }
  out.push('</g><g id="Logos">');
  for (const t of layout.tiles) {
    const [x, y] = g.at(t.col, t.row);
    const w = t.w * g.s + (t.w - 1) * g.gap, h = t.h * g.s + (t.h - 1) * g.gap;
    const L = logoRect(w, h, g.s, t.aspect, p.logos.size);
    const lx = x + L.x, ly = y + L.y, lw = L.w, lh = L.h;
    const href = await dataURL(t.src);
    out.push(`<g id="${t.label}${t.available ? '' : ' (coming soon)'}">`,
      `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${tileColor(t)}"/>`,
      `<mask id="m-${t.id}" maskUnits="userSpaceOnUse" x="${r2(lx)}" y="${r2(ly)}" width="${r2(lw)}" height="${r2(lh)}" style="mask-type:alpha"><image x="${r2(lx)}" y="${r2(ly)}" width="${r2(lw)}" height="${r2(lh)}" href="${href}" xlink:href="${href}"/></mask>`,
      `<rect x="${r2(lx)}" y="${r2(ly)}" width="${r2(lw)}" height="${r2(lh)}" fill="${logoColor(t)}" mask="url(#m-${t.id})"/>`,
      '</g>');
  }
  out.push('</g></svg>');
  return out.join('\n');
}

// Transparent PNG: logos tinted by drawing their artwork, then filling over it with source-in
async function boardPNG(B, scale = 2) {
  const { layout, colors, p, circles, tileColor, logoColor } = B;
  const g = geometry(B);
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(g.width * scale); cv.height = Math.ceil(g.height * scale);
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  if (circles) {
    ctx.fillStyle = p.empty.circleColor;
    for (const e of layout.empties) { const [x, y] = g.at(e.col, e.row); ctx.beginPath(); ctx.arc(x + g.s / 2, y + g.s / 2, (g.s / 2) * p.empty.circleSize, 0, Math.PI * 2); ctx.fill(); }
  }
  for (const q of layout.squares) { const [x, y] = g.at(q.col, q.row); ctx.fillStyle = colors[q.color]; ctx.fillRect(x, y, g.s, g.s); }
  for (const t of layout.tiles) {
    const [x, y] = g.at(t.col, t.row);
    const w = t.w * g.s + (t.w - 1) * g.gap, h = t.h * g.s + (t.h - 1) * g.gap;
    ctx.fillStyle = tileColor(t); ctx.fillRect(x, y, w, h);
    const L = logoRect(w, h, g.s, t.aspect, p.logos.size);
    const lh = L.h, lw = L.w;
    const img = new Image();
    img.src = await dataURL(t.src);
    await img.decode();
    const tint = document.createElement('canvas');
    tint.width = Math.ceil(lw * scale); tint.height = Math.ceil(lh * scale);
    const tc = tint.getContext('2d');
    tc.drawImage(img, 0, 0, tint.width, tint.height);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = logoColor(t); tc.fillRect(0, 0, tint.width, tint.height);
    ctx.drawImage(tint, x + L.x, y + L.y, lw, lh);
  }
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}
