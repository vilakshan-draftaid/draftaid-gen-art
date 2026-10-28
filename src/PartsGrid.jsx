import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialKitController } from 'dialkit';
import { hashSeed, mulberry32 } from './shared.js';
import { usePaletteSync, paletteSlots, paletteAction, PaletteRows, MAX_COLORS } from './usePaletteSync.js';
import { copySVG, copyPNG } from './exportGrid.js';
import { PARTS } from './partsData.js';

const hexRgb = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255); };
const SLOT = Array.from({ length: MAX_COLORS }, (_, i) => ({ value: `c${i + 1}`, label: `C${i + 1}` }));

export default function PartsGrid() {
  const ctrl = useRef(null);
  const svgRef = useRef(null);
  const [auto, setAuto] = useState(false);
  const [status, setStatus] = useState('');
  const dial = useDialKitController('Shape grid', {
    seed: { type: 'text', default: 'draftaid', placeholder: 'Any word' },
    shuffle: { type: 'action', label: 'New seed' },
    autoShuffle: { type: 'action', label: auto ? 'Stop auto seed' : 'Auto seed' },
    every: [0.8, 0.1, 3, 0.05],
    copySvg: { type: 'action', label: 'Copy SVG' },
    copyPng: { type: 'action', label: 'Copy PNG' },
    grid: {
      columns: [10, 2, 30, 1],
      rows: [7, 2, 20, 1],
      cellSize: [72, 24, 180, 1],
      gap: [0, 0, 24, 1],
      fill: [0.55, 0, 1, 0.01],
    },
    big: {
      count: [2, 0, 10, 1],
      size: [3, 2, 8, 1],
      use: { type: 'select', options: [
        { value: 'both', label: 'Both plates' }, { value: '0', label: 'Plate A' }, { value: '1', label: 'Plate B' },
      ], default: 'both' },
      padding: [0.04, 0, 0.3, 0.01],
    },
    parts: {
      look: { type: 'select', options: [
        { value: 'photo', label: 'Photo render' }, { value: 'silhouette', label: 'Flat silhouette' }, { value: 'duotone', label: 'Duotone' },
      ], default: 'photo' },
      padding: [0.1, 0, 0.4, 0.01],
      rotate: false,
      silhouetteColor: { type: 'select', options: [{ value: 'ink', label: 'Ink' }, { value: 'palette', label: 'From palette' }], default: 'ink' },
      ink: '#0A0A0A',
      duoShadow: { type: 'select', options: [...SLOT, { value: 'ink', label: 'Ink' }], default: 'c4' },
      duoLight: { type: 'select', options: [...SLOT, { value: 'white', label: 'White' }], default: 'c1' },
      duoContrast: [2, 1, 4, 0.05],
    },
    empty: {
      style: { type: 'select', options: [{ value: 'blank', label: 'Blank' }, { value: 'circles', label: 'Circles' }], default: 'circles' },
      circleSize: [0.8, 0.1, 1, 0.01],
      circleColor: { type: 'select', options: [{ value: 'palette', label: 'From palette' }, { value: 'single', label: 'Single color' }], default: 'single' },
      single: '#EDEDED',
    },
    color: {
      palette: { type: 'select', options: [
        { value: 'plot', label: 'Plot' }, { value: 'draftaid', label: 'Draftaid' }, { value: 'draftaidDark', label: 'Draftaid Dark' }, { value: 'custom', label: 'Custom' },
      ], default: 'draftaid' },
      ...paletteSlots(['#C6FFE6', '#4DFFC6', '#00E8AD', '#009878']),
      background: '#FFFFFF',
    },
  }, {
    id: 'shape-grid', persist: true,
    onAction: (a) => {
      paletteAction(a, ctrl.current);
      const key = a.split('.').pop();
      if (key === 'shuffle') ctrl.current?.setValue('seed', Math.random().toString(36).slice(2, 8));
      if (key === 'autoShuffle') setAuto((on) => !on);
      if (key === 'copySvg' || key === 'copyPng') exportRef.current?.(key);
    },
  });
  ctrl.current = dial;
  const p = dial.values;
  const colors = usePaletteSync(dial);
  const exportRef = useRef(null);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => ctrl.current?.setValue('seed', Math.random().toString(36).slice(2, 8)), p.every * 1000);
    return () => clearInterval(id);
  }, [auto, p.every]);

  const { columns: cols, rows, cellSize: S, gap: G, fill } = p.grid;
  const pitch = S + G, W = cols * S + (cols - 1) * G, H = rows * S + (rows - 1) * G;

  // Seeded layout: big plates claim N×N blocks first, then every free cell draws 4 numbers in a fixed order
  const layout = useMemo(() => {
    const rand = mulberry32(hashSeed(p.seed || ' '));
    const N = Math.min(p.big.size, cols, rows);
    const taken = new Uint8Array(cols * rows);
    const bigs = [];
    const pool = p.big.use === 'both' ? [0, 1] : [Number(p.big.use)];
    for (let b = 0; b < p.big.count; b++) {
      for (let tries = 0; tries < 60; tries++) {
        const c = Math.floor(rand() * (cols - N + 1)), r = Math.floor(rand() * (rows - N + 1));
        let free = true;
        for (let y = r; y < r + N && free; y++) for (let x = c; x < c + N; x++) if (taken[y * cols + x]) { free = false; break; }
        if (!free) continue;
        for (let y = r; y < r + N; y++) for (let x = c; x < c + N; x++) taken[y * cols + x] = 1;
        bigs.push({ c, r, n: N, img: pool[b % pool.length], color: Math.floor(rand() * colors.length), rot: Math.floor(rand() * 4) });
        break;
      }
    }
    const cells = [];
    for (let i = 0; i < cols * rows; i++) {
      const filled = rand() < fill, part = Math.floor(rand() * PARTS.small.length), color = Math.floor(rand() * colors.length), rot = Math.floor(rand() * 4);
      if (taken[i]) continue;
      cells.push({ c: i % cols, r: Math.floor(i / cols), filled, part, color, rot });
    }
    return { bigs, cells };
  }, [p.seed, cols, rows, fill, p.big.count, p.big.size, p.big.use, colors.length]);

  // Slots past the count still keep their color, so a duotone pick never goes blank
  const slot = (s) => (s === 'ink' ? p.parts.ink : s === 'white' ? '#FFFFFF' : p.color[s] ?? colors[0]);
  const [dr, dg, db] = hexRgb(slot(p.parts.duoShadow));
  const [lr, lg, lb] = hexRgb(slot(p.parts.duoLight));
  const look = p.parts.look;
  const filterFor = (color) => (look === 'duotone' ? 'url(#sg-duo)' : look === 'silhouette' ? `url(#sg-sil-${p.parts.silhouetteColor === 'palette' ? color : 'ink'})` : undefined);

  const partImage = (img, x, y, box, pad, rot, color, key) => {
    const inset = box * pad, size = box - inset * 2;
    const k = Math.min(size / img.w, size / img.h), w = img.w * k, h = img.h * k;
    const cx = x + box / 2, cy = y + box / 2;
    return (
      <image key={key} href={img.src} x={cx - w / 2} y={cy - h / 2} width={w} height={h}
        filter={filterFor(color)} transform={p.parts.rotate && rot ? `rotate(${rot * 90} ${cx} ${cy})` : undefined} />
    );
  };

  exportRef.current = (key) => {
    const el = svgRef.current; if (!el) return;
    const svg = new XMLSerializer().serializeToString(el);
    const name = `shape-grid-${p.seed || 'seed'}`;
    const job = key === 'copySvg' ? copySVG(svg, `${name}.svg`) : copyPNG(new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
        const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, W * 2, H * 2); cv.toBlob(res, 'image/png');
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }), `${name}.png`);
    Promise.resolve(job).then((m) => { setStatus(m); setTimeout(() => setStatus(''), 2600); });
  };

  return (
    <main className="stage" style={{ background: p.color.background }}>
      <PaletteRows count={colors.length} />
      <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="sg-svg" role="img" aria-label="Grid of machined parts">
        <defs>
          <filter id="sg-duo" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0" />
            {/* the renders are mostly light grey, so stretch around 0.7 before mapping to two colors */}
            <feComponentTransfer>
              <feFuncR type="linear" slope={p.parts.duoContrast} intercept={0.5 - p.parts.duoContrast * 0.7} />
              <feFuncG type="linear" slope={p.parts.duoContrast} intercept={0.5 - p.parts.duoContrast * 0.7} />
              <feFuncB type="linear" slope={p.parts.duoContrast} intercept={0.5 - p.parts.duoContrast * 0.7} />
            </feComponentTransfer>
            <feComponentTransfer>
              <feFuncR type="table" tableValues={`${dr} ${lr}`} />
              <feFuncG type="table" tableValues={`${dg} ${lg}`} />
              <feFuncB type="table" tableValues={`${db} ${lb}`} />
            </feComponentTransfer>
          </filter>
          {['ink', ...colors.keys()].map((k) => (
            <filter key={k} id={`sg-sil-${k}`} colorInterpolationFilters="sRGB">
              <feFlood floodColor={k === 'ink' ? p.parts.ink : colors[k]} />
              <feComposite in2="SourceAlpha" operator="in" />
            </filter>
          ))}
        </defs>
        <rect width={W} height={H} fill={p.color.background} />
        {layout.cells.map((cell, i) => {
          const x = cell.c * pitch, y = cell.r * pitch;
          if (cell.filled) return partImage(PARTS.small[cell.part], x, y, S, p.parts.padding, cell.rot, cell.color, i);
          if (p.empty.style !== 'circles') return null;
          return <circle key={i} cx={x + S / 2} cy={y + S / 2} r={(S / 2) * p.empty.circleSize} fill={p.empty.circleColor === 'single' ? p.empty.single : colors[cell.color]} />;
        })}
        {layout.bigs.map((b, i) => {
          const box = b.n * S + (b.n - 1) * G;
          return partImage(PARTS.big[b.img], b.c * pitch, b.r * pitch, box, p.big.padding, b.rot, b.color, `b${i}`);
        })}
      </svg>
      <p className="reel-toast" role="status" aria-live="polite">{status}</p>
    </main>
  );
}
