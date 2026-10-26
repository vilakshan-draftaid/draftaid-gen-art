import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialKitController } from 'dialkit';

import { ARTICLE, GDT, SYMBOL_PICK, hashSeed, mulberry32 } from './shared.js';
import { usePaletteSync } from './usePaletteSync.js';
import { layoutGrid, toSVG, toPNG, copySVG, copyPNG } from './exportGrid.js';

export default function SymbolGrid() {
  const ctrl = useRef(null);
  const [auto, setAuto] = useState(false);
  const [status, setStatus] = useState('');
  const exportRef = useRef(null);
  const dial = useDialKitController('Symbol grid', {
    seed: { type: 'text', default: 'draftaid', placeholder: 'Any word' },
    shuffle: { type: 'action', label: 'New seed' },
    autoShuffle: { type: 'action', label: auto ? 'Stop auto seed' : 'Auto seed' },
    every: [0.6, 0.1, 3, 0.05],
    exportSvg: { type: 'action', label: 'Copy SVG' },
    exportPng: { type: 'action', label: 'Copy PNG' },
    grid: {
      columns: [8, 2, 24, 1],
      rows: [5, 2, 16, 1],
      cellSize: [84, 24, 180, 1],
      gap: [0, 0, 24, 1],
      fill: [0.45, 0, 1, 0.01],
      jitter: [0, 0, 0.5, 0.01],
    },
    symbols: {
      set: { type: 'select', options: [
        { value: 'article', label: 'Guide symbols' },
        { value: 'all', label: 'Guide + GD&T' },
      ], default: 'article' },
      use: { type: 'select', options: SYMBOL_PICK, default: 'mix' },
      size: [0.5, 0.2, 0.9, 0.01],
      weight: { type: 'select', options: ['400', '700', '900'], default: '700' },
      ink: '#0A0A0A',
      onEmpty: false,
    },
    // On/off per symbol; the random mix only draws from the ones left on
    pickSymbols: Object.fromEntries([...ARTICLE, ...GDT].map((s) => [s, true])),
    empty: {
      style: { type: 'select', options: [
        { value: 'blank', label: 'Blank' },
        { value: 'circles', label: 'Circles' },
      ], default: 'blank' },
      circleSize: [0.8, 0.1, 1, 0.01],
      circleColor: { type: 'select', options: [
        { value: 'palette', label: 'From palette' },
        { value: 'single', label: 'Single color' },
      ], default: 'palette' },
      single: '#3DBE5A',
    },
    color: {
      palette: { type: 'select', options: [
        { value: 'plot', label: 'Plot' },
        { value: 'draftaid', label: 'Draftaid' },
        { value: 'custom', label: 'Custom' },
      ], default: 'plot' },
      c1: '#3E8EDE', c2: '#F5C518', c3: '#3DBE5A', c4: '#8FD694',
      background: '#FFFFFF',
    },
  }, {
    id: 'symbol-grid',
    persist: true,
    onAction: (a) => {
      if (a === 'shuffle') ctrl.current?.setValue('seed', Math.random().toString(36).slice(2, 8));
      if (a === 'autoShuffle') setAuto((on) => !on);
      if (a === 'exportSvg' || a === 'exportPng') exportRef.current?.(a === 'exportSvg' ? 'svg' : 'png');
    },
  });
  ctrl.current = dial;
  const p = dial.values;

  // Keeps pressing "New seed" every `every` seconds while on
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      ctrl.current?.setValue('seed', Math.random().toString(36).slice(2, 8));
    }, p.every * 1000);
    return () => clearInterval(id);
  }, [auto, p.every]);

  const colors = usePaletteSync(dial);

  const cells = useMemo(() => {
    const rand = mulberry32(hashSeed(p.seed || ' '));
    const full = p.symbols.set === 'all' ? [...ARTICLE, ...GDT] : ARTICLE;
    const picked = full.filter((s) => p.pickSymbols?.[s] !== false);
    const set = picked.length ? picked : full;
    const out = [];
    for (let i = 0; i < p.grid.columns * p.grid.rows; i++) {
      const filled = rand() < p.grid.fill;
      out.push({
        filled,
        color: Math.floor(rand() * 4),
        symbol: set[Math.floor(rand() * set.length)],
        dx: rand() * 2 - 1,
        dy: rand() * 2 - 1,
      });
    }
    return out;
  }, [p.seed, p.grid.columns, p.grid.rows, p.grid.fill, p.symbols.set, JSON.stringify(p.pickSymbols)]);

  const { columns, rows, cellSize, gap, jitter } = p.grid;
  const cell = `min(${cellSize}px, calc((100vw - 32px - ${gap * (columns - 1)}px) / ${columns}))`;

  exportRef.current = (kind) => {
    const L = layoutGrid(p, cells, colors);
    const name = `symbol-grid-${p.seed || 'seed'}.${kind}`;
    const job = kind === 'svg' ? copySVG(toSVG(L), name) : copyPNG(toPNG(L, 2), name);
    Promise.resolve(job).then((m) => { setStatus(m); setTimeout(() => setStatus(''), 2600); });
  };


  return (
    <main className="stage" style={{ background: p.color.background }}>
      <div
        className="grid"
        role="img"
        aria-label="Grid of engineering drawing symbols on colored squares"
        style={{ '--cell': cell, gridTemplateColumns: `repeat(${columns}, var(--cell))`, gap }}
      >
        {cells.map((c, i) => {
          const show = c.filled || p.symbols.onEmpty;
          const shift = c.filled ? `translate(calc(${c.dx * jitter} * var(--cell)), calc(${c.dy * jitter} * var(--cell)))` : 'none';
          return (
            <div
              key={i}
              className="cell"
              style={{
                background: c.filled ? colors[c.color] : 'transparent',
                transform: shift,
                color: p.symbols.ink,
                fontWeight: p.symbols.weight,
                fontSize: `calc(var(--cell) * ${p.symbols.size})`,
              }}
            >
              {!c.filled && p.empty.style === 'circles' && (
                <i
                  className="dot"
                  style={{
                    width: `${p.empty.circleSize * 100}%`,
                    height: `${p.empty.circleSize * 100}%`,
                    background: p.empty.circleColor === 'single' ? p.empty.single : colors[c.color],
                  }}
                />
              )}
              {show && <span>{p.symbols.use === 'mix' ? c.symbol : p.symbols.use}</span>}
            </div>
          );
        })}
      </div>
      <p className="reel-toast" role="status" aria-live="polite">{status}</p>
    </main>
  );
}
