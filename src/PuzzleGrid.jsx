import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialKitController } from 'dialkit';

import { ARTICLE, GDT, FONT, hashSeed } from './shared.js';
import { usePaletteSync, paletteSlots, paletteAction, PaletteRows, MAX_COLORS } from './usePaletteSync.js';
import { NOISE_TYPES, makeNoise, fbm } from './noise.js';
import { LOGOS, logoRect } from './integrations.js';
import { pieceEdges, piecePath, puzzleCells } from './puzzle.js';
import { copySVG, copyPNG } from './exportGrid.js';

// Hard-edged puzzle pieces on the grid. Click or drag over squares to add or remove
// pieces (on an empty grid, or on a noise cluster base), then drag CAD logos in from
// the tray and place them on top.
const parse = (json) => { try { return JSON.parse(json || '{}'); } catch { return {}; } };

export default function PuzzleGrid() {
  const ctrl = useRef(null);
  const [status, setStatus] = useState('');
  const exportRef = useRef(null);
  const dial = useDialKitController('Puzzle', {
    seed: { type: 'text', default: 'draftaid', placeholder: 'Any word' },
    shuffle: { type: 'action', label: 'New seed' },
    exportSvg: { type: 'action', label: 'Copy SVG' },
    exportPng: { type: 'action', label: 'Copy PNG' },
    showSymbols: false,
    grid: {
      columns: [14, 4, 30, 1],
      rows: [10, 4, 24, 1],
      cellSize: [64, 24, 140, 1],
    },
    pieces: {
      // Manual starts empty; Noise starts from clusters. Your clicks are edits on top
      startFrom: { type: 'select', options: [
        { value: 'manual', label: 'Manual' },
        { value: 'noise', label: 'Noise' },
      ], default: 'noise' },
      fill: [0.4, 0, 1, 0.01],
      // How many grid squares one piece spans each way
      scale: { type: 'select', options: [
        { value: '1', label: '1x' },
        { value: '2', label: '2x' },
        { value: '3', label: '3x' },
      ], default: '1' },
      tabWidth: [0.32, 0.1, 0.6, 0.01],
      tabDepth: [0.16, 0.04, 0.3, 0.01],
      outline: [2, 0, 8, 0.5],
      outlineColor: '#FFFFFF',
      // Clicking the board either adds and removes pieces, or recolors them with the brush
      tool: { type: 'select', options: [
        { value: 'add', label: 'Add / remove' },
        { value: 'recolor', label: 'Recolor' },
      ], default: 'add' },
      brushColor: { type: 'select', options: Array.from({ length: MAX_COLORS }, (_, i) => ({ value: `c${i + 1}`, label: `C${i + 1}` })), default: 'c1' },
      edits: { type: 'text', default: '{}' },
      recolors: { type: 'text', default: '{}' },
      resetEdits: { type: 'action', label: 'Reset edits' },
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
      tileRows: [1, 1, 4, 1],
      tileBackground: true,
      availableTile: '#00E8AD',
      availableLogo: '#000000',
      comingSoonTile: '#0A0A0A',
      comingSoonLogo: '#FFFFFF',
      placed: { type: 'text', default: '{}' },
      clearLogos: { type: 'action', label: 'Clear logos' },
    },
    symbols: {
      set: { type: 'select', options: [
        { value: 'article', label: 'Guide symbols' },
        { value: 'all', label: 'Guide + GD&T' },
      ], default: 'article' },
      size: [0.45, 0.2, 0.9, 0.01],
      weight: { type: 'select', options: ['400', '700', '900'], default: '700' },
      ink: '#0A0A0A',
    },
    empty: {
      style: { type: 'select', options: [
        { value: 'blank', label: 'Blank' },
        { value: 'circles', label: 'Circles' },
      ], default: 'circles' },
      circleSize: [0.8, 0.1, 1, 0.01],
      circleColor: '#F4F4F4',
    },
    color: {
      palette: { type: 'select', options: [
        { value: 'plot', label: 'Plot' },
        { value: 'draftaid', label: 'Draftaid' },
        { value: 'draftaidDark', label: 'Draftaid Dark' },
        { value: 'custom', label: 'Custom' },
      ], default: 'draftaid' },
      ...paletteSlots(['#C6FFE6', '#4DFFC6', '#00E8AD', '#009878']),
      background: '#FFFFFF',
    },
  }, {
    id: 'puzzle-grid',
    persist: true,
    onAction: (a) => {
      paletteAction(a, ctrl.current);
      const key = String(a).split('.').pop();
      if (key === 'shuffle') ctrl.current?.setValue('seed', Math.random().toString(36).slice(2, 8));
      if (key === 'resetEdits') ctrl.current?.setValues({ pieces: { edits: '{}', recolors: '{}' } });
      if (key === 'clearLogos') ctrl.current?.setValue('logos.placed', '{}');
      if (key === 'exportSvg' || key === 'exportPng') exportRef.current?.(key === 'exportSvg' ? 'svg' : 'png');
    },
  });
  ctrl.current = dial;
  const p = dial.values;
  const colors = usePaletteSync(dial);
  const { columns, rows, cellSize: s } = p.grid;
  const W = columns * s, H = rows * s;
  const seed = hashSeed((p.seed || ' ') + '#noise');
  // Pieces sit on a coarser grid of k x k squares; edits are kept per scale ("2:c,r")
  const k = Number(p.pieces.scale) || 1, S = s * k;
  const pc = Math.max(1, Math.floor(columns / k)), pr = Math.max(1, Math.floor(rows / k));
  const allEdits = useMemo(() => parse(p.pieces.edits), [p.pieces.edits]);
  const forScale = (all) => Object.fromEntries(Object.entries(all)
    .filter(([key]) => (key.includes(':') ? key.split(':')[0] === String(k) : k === 1))
    .map(([key, v]) => [key.includes(':') ? key.split(':')[1] : key, v]));
  const edits = useMemo(() => forScale(allEdits), [allEdits, k]);
  // Recolors: piece "c,r" -> palette slot index, painted with the brush
  const allRecolors = useMemo(() => parse(p.pieces.recolors), [p.pieces.recolors]);
  const recolors = useMemo(() => forScale(allRecolors), [allRecolors, k]);
  const placed = useMemo(() => parse(p.logos.placed), [p.logos.placed]);

  // Strokes being painted right now, merged with the saved edits
  const [paint, setPaint] = useState(null);
  const liveEdits = paint?.tool === 'add' ? { ...edits, ...paint.cells } : edits;
  const liveRecolors = paint?.tool === 'recolor' ? { ...recolors, ...paint.cells } : recolors;
  const symbolSet = p.symbols.set === 'all' ? [...ARTICLE, ...GDT] : ARTICLE;
  const cells = useMemo(() => puzzleCells({
    columns: pc, rows: pr, unit: k, base: p.pieces.startFrom, fill: p.pieces.fill, noise: p.noise, seed,
    edits: liveEdits, colorCount: colors.length, symbols: symbolSet,
  }), [pc, pr, k, p.pieces.startFrom, p.pieces.fill, p.noise.type, p.noise.scale, p.noise.octaves, p.noise.contrast, seed, JSON.stringify(liveEdits), colors.length, p.symbols.set]);
  const has = (c, r) => c >= 0 && r >= 0 && c < pc && r < pr && cells[r * pc + c].on;
  const pieces = cells.filter((x) => x.on).map((x) => ({
    ...x,
    // A brushed slot wins, unless the palette no longer has that many colors
    color: liveRecolors[`${x.c},${x.r}`] < colors.length ? liveRecolors[`${x.c},${x.r}`] : x.color,
    d: piecePath(x.c, x.r, S, pieceEdges(has, seed, x.c, x.r), p.pieces.tabWidth, p.pieces.tabDepth) }));
  // Grid squares no piece covers get the circles
  const empties = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    if (!has(Math.floor(c / k), Math.floor(r / k)) || c >= pc * k || r >= pr * k) empties.push({ c, r });
  }

  // Logos placed on the grid, plus the one being dragged
  const [drag, setDrag] = useState(null);
  const livePlaced = drag?.rect ? { ...placed, [drag.id]: drag.rect } : placed;
  const tiles = LOGOS.filter((l) => livePlaced[l.id]).map((l) => {
    const t = livePlaced[l.id];
    const w = Math.max(1, Math.min(columns, t.w)), h = Math.max(1, Math.min(rows, t.h));
    return { ...l, w, h, col: Math.max(0, Math.min(columns - w, t.col)), row: Math.max(0, Math.min(rows - h, t.row)) };
  });
  const autoWidth = (l, h) => Math.min(columns, Math.max(2, Math.ceil(l.aspect * p.logos.size * h + (1 - p.logos.size))));

  // Live picture of the noise map for the panel
  useEffect(() => {
    const noise = makeNoise(p.noise.type, seed);
    const MW = 240, MH = Math.max(40, Math.min(240, Math.round((MW * rows) / columns)));
    const cv = document.createElement('canvas');
    cv.width = MW; cv.height = MH;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(MW, MH);
    const vals = new Float32Array(MW * MH);
    let lo = Infinity, hi = -Infinity;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const n = fbm(noise, (x / MW) * columns * p.noise.scale, (y / MH) * rows * p.noise.scale, p.noise.octaves);
      vals[y * MW + x] = n; lo = Math.min(lo, n); hi = Math.max(hi, n);
    }
    for (let i = 0; i < vals.length; i++) {
      const g = Math.round(((vals[i] - lo) / (hi - lo || 1)) * 255);
      img.data.set([g, g, g, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    dial.setValue('noise.noiseMap', cv.toDataURL('image/png'));
    // Also when the map is empty: the first run can land before the panel is ready
  }, [seed, columns, rows, p.noise.type, p.noise.scale, p.noise.octaves, !p.noise.noiseMap]);

  // Screen point to grid square (null when off the board)
  const svgRef = useRef(null);
  const toCell = (x, y) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    const c = Math.floor(q.x / s), r = Math.floor(q.y / s);
    return c >= 0 && r >= 0 && c < columns && r < rows ? { c, r } : null;
  };

  // Paint: the first square decides add or remove, then every square you pass gets the same
  const toPiece = (x, y) => {
    const q = toCell(x, y);
    if (!q) return null;
    const c = Math.floor(q.c / k), r = Math.floor(q.r / k);
    return c < pc && r < pr ? { c, r } : null;
  };
  // Recolor: every piece you pass takes the brush color; empty squares are skipped
  const startPaint = (e) => {
    const at = toPiece(e.clientX, e.clientY);
    if (!at) return;
    const tool = p.pieces.tool === 'recolor' ? 'recolor' : 'add';
    if (tool === 'recolor' && !has(at.c, at.r)) return;
    e.preventDefault();
    const value = tool === 'recolor' ? Number(String(p.pieces.brushColor).slice(1)) - 1 : !has(at.c, at.r);
    const stroke = { [`${at.c},${at.r}`]: value };
    setPaint({ tool, cells: { ...stroke } });
    const move = (ev) => {
      const q = toPiece(ev.clientX, ev.clientY);
      if (!q || stroke[`${q.c},${q.r}`] === value || (tool === 'recolor' && !has(q.c, q.r))) return;
      stroke[`${q.c},${q.r}`] = value;
      setPaint({ tool, cells: { ...stroke } });
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      setPaint(null);
      const keyed = Object.fromEntries(Object.entries(stroke).map(([key, v]) => [k === 1 ? key : `${k}:${key}`, v]));
      if (tool === 'recolor') dial.setValue('pieces.recolors', JSON.stringify({ ...allRecolors, ...keyed }));
      else dial.setValue('pieces.edits', JSON.stringify({ ...allEdits, ...keyed }));
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };

  // Logos: drag from the tray onto the grid, move or resize them there, drag one off the grid to remove it
  const dragLogo = (e, logo, mode) => {
    e.preventDefault(); e.stopPropagation();
    const current = placed[logo.id];
    const h0 = current?.h ?? p.logos.tileRows, w0 = current?.w ?? autoWidth(logo, h0);
    const start = toCell(e.clientX, e.clientY), x0 = e.clientX, y0 = e.clientY;
    const pitch = svgRef.current.getBoundingClientRect().width / columns;
    let rect = current ?? null;
    const move = (ev) => {
      const at = toCell(ev.clientX, ev.clientY);
      if (mode === 'resize') {
        const dc = Math.round((ev.clientX - x0) / pitch), dr = Math.round((ev.clientY - y0) / pitch);
        rect = { ...current, w: Math.max(1, Math.min(columns - current.col, current.w + dc)), h: Math.max(1, Math.min(rows - current.row, current.h + dr)) };
      } else if (!at) {
        rect = null; // off the board: drop here to remove it
      } else if (current && start) {
        rect = { ...current, col: current.col + at.c - start.c, row: current.row + at.r - start.r };
      } else {
        rect = { col: at.c - Math.floor(w0 / 2), row: at.r, w: w0, h: h0 }; // from the tray, centered on the pointer
      }
      setDrag({ id: logo.id, rect, x: ev.clientX, y: ev.clientY });
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      setDrag(null);
      const next = { ...placed };
      if (rect) next[logo.id] = { ...rect, col: Math.max(0, Math.min(columns - rect.w, rect.col)), row: Math.max(0, Math.min(rows - rect.h, rect.row)) };
      else delete next[logo.id];
      dial.setValue('logos.placed', JSON.stringify(next));
    };
    setDrag({ id: logo.id, rect, x: e.clientX, y: e.clientY });
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };

  const tileColor = (t) => (t.available ? p.logos.availableTile : p.logos.comingSoonTile);
  const logoColor = (t) => (t.available ? p.logos.availableLogo : p.logos.comingSoonLogo);
  const circles = p.empty.style === 'circles';
  const board = { p, s, S, W, H, empties, pieces, tiles, colors, circles, tileColor, logoColor };

  exportRef.current = async (kind) => {
    const name = `puzzle-${p.seed || 'seed'}.${kind}`;
    const job = kind === 'svg' ? copySVG(await boardSVG(board), name) : copyPNG(boardPNG(board), name);
    Promise.resolve(job).then((m) => { setStatus(m); setTimeout(() => setStatus(''), 2600); });
  };

  return (
    <main className="stage puzzle-stage" style={{ background: p.color.background }}>
      <PaletteRows count={colors.length} />
      <svg
        ref={svgRef}
        className="puzzle-board"
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: W }}
        onPointerDown={startPaint}
        role="img"
        aria-label="Puzzle pieces on a grid with CAD software logos placed on top"
      >
        <defs>
          {tiles.map((t) => {
            const L = logoRect(t.w * s, t.h * s, s, t.aspect, p.logos.size);
            return (
              <mask key={t.id} id={`pz-${t.id}`} maskUnits="userSpaceOnUse" x={t.col * s + L.x} y={t.row * s + L.y} width={L.w} height={L.h} style={{ maskType: 'alpha' }}>
                <image href={t.src} x={t.col * s + L.x} y={t.row * s + L.y} width={L.w} height={L.h} preserveAspectRatio="none" />
              </mask>
            );
          })}
        </defs>
        {circles && empties.map((x) => (
          <circle key={`e${x.c}-${x.r}`} cx={x.c * s + s / 2} cy={x.r * s + s / 2} r={(s / 2) * p.empty.circleSize} fill={p.empty.circleColor} />
        ))}
        {pieces.map((x) => (
          <path key={`p${x.c}-${x.r}`} d={x.d} fill={colors[x.color]} stroke={p.pieces.outline > 0 ? p.pieces.outlineColor : 'none'} strokeWidth={p.pieces.outline} strokeLinejoin="miter" />
        ))}
        {p.showSymbols && pieces.map((x) => (
          <text key={`t${x.c}-${x.r}`} x={x.c * S + S / 2} y={x.r * S + S / 2} fill={p.symbols.ink} fontFamily={FONT} fontWeight={p.symbols.weight} fontSize={S * p.symbols.size} textAnchor="middle" dominantBaseline="central" pointerEvents="none">{x.symbol}</text>
        ))}
        {tiles.map((t) => {
          const L = logoRect(t.w * s, t.h * s, s, t.aspect, p.logos.size);
          return (
            <g key={t.id} className="puzzle-logo" data-dragging={drag?.id === t.id || undefined} onPointerDown={(e) => dragLogo(e, t, 'move')}>
              <title>{`${t.label}${t.available ? '' : ' (coming soon)'}. Drag to move, drag the corner to resize, drag off the grid to remove`}</title>
              <rect x={t.col * s} y={t.row * s} width={t.w * s} height={t.h * s} fill={p.logos.tileBackground ? tileColor(t) : 'transparent'} />
              <rect x={t.col * s + L.x} y={t.row * s + L.y} width={L.w} height={L.h} fill={logoColor(t)} mask={`url(#pz-${t.id})`} />
              <rect className="puzzle-resize" x={(t.col + t.w) * s - 14} y={(t.row + t.h) * s - 14} width={14} height={14} onPointerDown={(e) => dragLogo(e, t, 'resize')} />
            </g>
          );
        })}
      </svg>

      <div className="logo-tray" aria-label="Logos: drag onto the grid">
        {LOGOS.map((l) => (
          <button
            key={l.id}
            type="button"
            className="logo-chip"
            aria-pressed={!!placed[l.id]}
            title={`${l.label}${l.available ? '' : ' (coming soon)'}: drag onto the grid`}
            onPointerDown={(e) => dragLogo(e, l, 'move')}
            style={{ background: tileColor(l) }}
          >
            <i style={{ background: logoColor(l), WebkitMask: `url("${l.src}") center / contain no-repeat`, mask: `url("${l.src}") center / contain no-repeat`, aspectRatio: l.aspect }} />
          </button>
        ))}
      </div>
      {drag && !drag.rect && (
        <div className="logo-ghost" style={{ left: drag.x, top: drag.y, background: tileColor(LOGOS.find((l) => l.id === drag.id)) }} />
      )}
      <p className="reel-toast" role="status" aria-live="polite">{status}</p>
    </main>
  );
}

const r2 = (n) => Math.round(n * 100) / 100;
const dataURL = async (src) => {
  if (src.startsWith('data:')) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
};

// Editable SVG: pieces as paths, logos as their artwork masking a color
async function boardSVG(B) {
  const { p, s, S, W, H, empties, pieces, tiles, colors, circles, tileColor, logoColor } = B;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${p.color.background}"/>`,
  ];
  if (circles) {
    out.push('<g id="Circles">');
    for (const x of empties) out.push(`<circle cx="${r2(x.c * s + s / 2)}" cy="${r2(x.r * s + s / 2)}" r="${r2((s / 2) * p.empty.circleSize)}" fill="${p.empty.circleColor}"/>`);
    out.push('</g>');
  }
  const stroke = p.pieces.outline > 0 ? ` stroke="${p.pieces.outlineColor}" stroke-width="${p.pieces.outline}"` : '';
  out.push(`<g id="Pieces"${stroke}>`);
  for (const x of pieces) out.push(`<path d="${x.d}" fill="${colors[x.color]}"/>`);
  out.push('</g>');
  if (p.showSymbols) {
    out.push(`<g id="Symbols" font-family='${FONT.replace(/"/g, '')}' font-weight="${p.symbols.weight}" font-size="${r2(S * p.symbols.size)}" fill="${p.symbols.ink}" text-anchor="middle" dominant-baseline="central">`);
    for (const x of pieces) out.push(`<text x="${r2(x.c * S + S / 2)}" y="${r2(x.r * S + S / 2)}">${x.symbol.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`);
    out.push('</g>');
  }
  out.push('<g id="Logos">');
  for (const t of tiles) {
    const L = logoRect(t.w * s, t.h * s, s, t.aspect, p.logos.size);
    const x = t.col * s, y = t.row * s, lx = x + L.x, ly = y + L.y;
    const href = await dataURL(t.src);
    out.push(`<g id="${t.label}${t.available ? '' : ' (coming soon)'}">`);
    if (p.logos.tileBackground) out.push(`<rect x="${x}" y="${y}" width="${t.w * s}" height="${t.h * s}" fill="${tileColor(t)}"/>`);
    out.push(`<mask id="m-${t.id}" maskUnits="userSpaceOnUse" x="${r2(lx)}" y="${r2(ly)}" width="${r2(L.w)}" height="${r2(L.h)}" style="mask-type:alpha"><image x="${r2(lx)}" y="${r2(ly)}" width="${r2(L.w)}" height="${r2(L.h)}" href="${href}" xlink:href="${href}"/></mask>`,
      `<rect x="${r2(lx)}" y="${r2(ly)}" width="${r2(L.w)}" height="${r2(L.h)}" fill="${logoColor(t)}" mask="url(#m-${t.id})"/>`, '</g>');
  }
  out.push('</g></svg>');
  return out.join('\n');
}

// Transparent PNG at 2x
async function boardPNG(B, scale = 2) {
  const { p, s, S, W, H, empties, pieces, tiles, colors, circles, tileColor, logoColor } = B;
  await document.fonts.ready;
  const cv = document.createElement('canvas');
  cv.width = W * scale; cv.height = H * scale;
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  if (circles) {
    ctx.fillStyle = p.empty.circleColor;
    for (const x of empties) { ctx.beginPath(); ctx.arc(x.c * s + s / 2, x.r * s + s / 2, (s / 2) * p.empty.circleSize, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.lineJoin = 'miter';
  for (const x of pieces) {
    const path = new Path2D(x.d);
    ctx.fillStyle = colors[x.color]; ctx.fill(path);
    if (p.pieces.outline > 0) { ctx.strokeStyle = p.pieces.outlineColor; ctx.lineWidth = p.pieces.outline; ctx.stroke(path); }
  }
  if (p.showSymbols) {
    ctx.fillStyle = p.symbols.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${p.symbols.weight} ${S * p.symbols.size}px ${FONT}`;
    for (const x of pieces) ctx.fillText(x.symbol, x.c * S + S / 2, x.r * S + S / 2);
  }
  for (const t of tiles) {
    const x = t.col * s, y = t.row * s;
    if (p.logos.tileBackground) { ctx.fillStyle = tileColor(t); ctx.fillRect(x, y, t.w * s, t.h * s); }
    const L = logoRect(t.w * s, t.h * s, s, t.aspect, p.logos.size);
    const img = new Image();
    img.src = await dataURL(t.src);
    await img.decode();
    const tint = document.createElement('canvas');
    tint.width = Math.ceil(L.w * scale); tint.height = Math.ceil(L.h * scale);
    const tc = tint.getContext('2d');
    tc.drawImage(img, 0, 0, tint.width, tint.height);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = logoColor(t); tc.fillRect(0, 0, tint.width, tint.height);
    ctx.drawImage(tint, x + L.x, y + L.y, L.w, L.h);
  }
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}
