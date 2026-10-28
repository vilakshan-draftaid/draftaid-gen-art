import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialKitController } from 'dialkit';

import { ARTICLE, GDT, PALETTES, hashSeed, mulberry32 } from './shared.js';
import { tetrisLayout } from './tetris.js';
import { copySVG, copyPNG } from './exportGrid.js';
import { usePaletteSync, paletteSlots, paletteAction, PaletteRows } from './usePaletteSync.js';
import { squareGeom, boardSVG, boardPNG } from './tetrisDraw.js';

// Yellow, pink, orange, green, blue from the reference
const TETRIS = ['#FFD500', '#FFC8DC', '#FF4400', '#26843F', '#0050FF'];
const TETRIS_PALETTES = { tetris: TETRIS, ...PALETTES };
const PALETTE_OPTIONS = [
  { value: 'tetris', label: 'Tetris' },
  { value: 'plot', label: 'Plot' },
  { value: 'draftaid', label: 'Draftaid' },
  { value: 'draftaidDark', label: 'Draftaid Dark' },
  { value: 'custom', label: 'Custom' },
];

export default function TetrisGrid() {
  const ctrl = useRef(null);
  const [status, setStatus] = useState('');
  const exportRef = useRef(null);
  const dial = useDialKitController('Tetris', {
    seed: { type: 'text', default: 'draftaid', placeholder: 'Any word' },
    shuffle: { type: 'action', label: 'New seed' },
    exportSvg: { type: 'action', label: 'Copy SVG' },
    exportPng: { type: 'action', label: 'Copy PNG' },
    showSymbols: false,
    // How each piece square is drawn
    squares: {
      fill: true,
      cornerRadius: [0, 0, 0.5, 0.01],
    },
    stroke: {
      visible: false,
      width: [2, 0.5, 12, 0.5],
      style: { type: 'select', options: [
        { value: 'solid', label: 'Solid' },
        { value: 'dashed', label: 'Dashed' },
        { value: 'dotted', label: 'Dotted' },
      ], default: 'solid' },
      dashesPerSide: [3, 1, 12, 1],
      position: { type: 'select', options: [
        { value: 'inside', label: 'Inside' },
        { value: 'center', label: 'Center' },
        { value: 'outside', label: 'Outside' },
      ], default: 'inside' },
    },
    // Stroke colors by the same slot as each piece's fill
    strokeColor: {
      palette: { type: 'select', options: PALETTE_OPTIONS, default: 'tetris' },
      // One stroke per fill slot, so this follows the fill palette's count
      ...paletteSlots(TETRIS, 's', false),
    },
    board: {
      columns: [10, 4, 24, 1],
      rows: [14, 6, 30, 1],
      cellSize: [56, 16, 120, 1],
      gap: [16, 0, 40, 1],
    },
    pieces: {
      stackHeight: [5, 0, 24, 1],
      // 0 = every stack piece still falling, 1 = all landed
      fallingToFallen: [1, 0, 1, 0.01],
      falling: [3, 0, 8, 1],
    },
    // Squares no piece covers
    empty: {
      style: { type: 'select', options: [
        { value: 'blank', label: 'Blank' },
        { value: 'circles', label: 'Circles' },
      ], default: 'blank' },
      circleSize: [0.8, 0.1, 1, 0.01],
      circleColor: { type: 'select', options: [
        { value: 'single', label: 'Single color' },
        { value: 'palette', label: 'From palette' },
      ], default: 'single' },
      single: '#222222',
    },
    symbols: {
      set: { type: 'select', options: [
        { value: 'article', label: 'Guide symbols' },
        { value: 'all', label: 'Guide + GD&T' },
      ], default: 'article' },
      size: [0.5, 0.2, 0.9, 0.01],
      weight: { type: 'select', options: ['400', '700', '900'], default: '700' },
      ink: '#0A0A0A',
    },
    color: {
      palette: { type: 'select', options: PALETTE_OPTIONS, default: 'tetris' },
      ...paletteSlots(TETRIS),
      background: '#000000',
    },
  }, {
    id: 'tetris-grid',
    persist: true,
    onAction: (a) => {
      paletteAction(a, ctrl.current);
      if (a === 'shuffle') ctrl.current?.setValue('seed', Math.random().toString(36).slice(2, 8));
      if (a === 'exportSvg' || a === 'exportPng') exportRef.current?.(a === 'exportSvg' ? 'svg' : 'png');
    },
  });
  ctrl.current = dial;
  const p = dial.values;

  const colors = usePaletteSync(dial, { palettes: TETRIS_PALETTES });
  const strokes = usePaletteSync(dial, { folder: 'strokeColor', prefix: 's', palettes: TETRIS_PALETTES, count: colors.length });
  const look = {
    fill: p.squares.fill, radius: p.squares.cornerRadius,
    stroke: { visible: p.stroke.visible, width: p.stroke.width, style: p.stroke.style, dashes: p.stroke.dashesPerSide, position: p.stroke.position },
  };
  const geom = squareGeom(p.board.cellSize, look);

  const squares = useMemo(() => {
    const rand = mulberry32(hashSeed(p.seed || ' '));
    const set = p.symbols.set === 'all' ? [...ARTICLE, ...GDT] : ARTICLE;
    const symRand = mulberry32(hashSeed((p.seed || ' ') + '#symbols'));
    return tetrisLayout({
      columns: p.board.columns, rows: p.board.rows, height: p.pieces.stackHeight, falling: p.pieces.falling, fallen: p.pieces.fallingToFallen, colors: colors.length, rand,
    }).map((sq) => ({ ...sq, symbol: set[Math.floor(symRand() * set.length)] }));
  }, [p.seed, p.board.columns, p.board.rows, p.pieces.stackHeight, p.pieces.falling, p.pieces.fallingToFallen, p.symbols.set, colors.length]);

  const { columns, rows, cellSize, gap } = p.board;
  // Every square without a piece, each with its own palette color for circles
  const empties = useMemo(() => {
    const taken = new Set(squares.map((q) => `${q.col}-${q.row}`));
    const rand = mulberry32(hashSeed((p.seed || ' ') + '#circles'));
    const out = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const color = Math.floor(rand() * colors.length);
      if (!taken.has(`${col}-${row}`)) out.push({ col, row, color });
    }
    return out;
  }, [squares, columns, rows, p.seed, colors.length]);
  const circles = p.empty.style === 'circles';
  const circleFill = (e) => (p.empty.circleColor === 'single' ? p.empty.single : colors[e.color]);
  // Fits the whole board in the window, never larger than the cell size dial
  const cell = `min(${cellSize}px, calc((100vw - 32px - ${gap * (columns - 1)}px) / ${columns}), calc((100vh - 120px - ${gap * (rows - 1)}px) / ${rows}))`;

  exportRef.current = (kind) => {
    const s = cellSize;
    const B = {
      s, look,
      width: columns * s + (columns - 1) * gap,
      height: rows * s + (rows - 1) * gap,
      circles: circles ? empties.map((e) => ({ x: e.col * (s + gap), y: e.row * (s + gap), r: (s / 2) * p.empty.circleSize, fill: circleFill(e) })) : [],
      squares: squares.map((q) => ({
        x: q.col * (s + gap), y: q.row * (s + gap),
        fill: colors[q.color], stroke: strokes[q.color], text: p.showSymbols ? q.symbol : null,
      })),
      bg: p.color.background, ink: p.symbols.ink, weight: p.symbols.weight, fontSize: s * p.symbols.size,
    };
    const name = `tetris-${p.seed || 'seed'}.${kind}`;
    const job = kind === 'svg' ? copySVG(boardSVG(B), name) : copyPNG(boardPNG(B, 2), name);
    Promise.resolve(job).then((m) => { setStatus(m); setTimeout(() => setStatus(''), 2600); });
  };

  return (
    <main className="stage" style={{ background: p.color.background }}>
      <PaletteRows count={colors.length} prefixes={['c', 's']} />
      <div
        className="grid"
        role="img"
        aria-label="Tetris pieces stacked at the bottom with a few falling"
        style={{
          '--cell': cell,
          gridTemplateColumns: `repeat(${columns}, var(--cell))`,
          gridTemplateRows: `repeat(${rows}, var(--cell))`,
          gap,
        }}
      >
        {circles && empties.map((e) => (
          <div key={`${e.col}-${e.row}`} className="cell" style={{ gridColumn: e.col + 1, gridRow: e.row + 1 }}>
            <i
              className="dot"
              style={{ width: `${p.empty.circleSize * 100}%`, height: `${p.empty.circleSize * 100}%`, background: circleFill(e) }}
            />
          </div>
        ))}
        {squares.map((q) => (
          <div
            key={`${q.col}-${q.row}`}
            className="cell"
            style={{
              gridColumn: q.col + 1,
              gridRow: q.row + 1,
              color: p.symbols.ink,
              fontWeight: p.symbols.weight,
              fontSize: `calc(var(--cell) * ${p.symbols.size})`,
            }}
          >
            {/* Drawn at the nominal cell size, scaled to the real one */}
            <svg viewBox={`0 0 ${cellSize} ${cellSize}`} width="100%" height="100%" overflow="visible" aria-hidden="true">
              {geom.fill && <rect width={cellSize} height={cellSize} rx={geom.fill.rx} fill={colors[q.color]} />}
              {geom.stroke && (
                <rect
                  x={geom.stroke.x} y={geom.stroke.y} width={geom.stroke.w} height={geom.stroke.h} rx={geom.stroke.rx}
                  fill="none" stroke={strokes[q.color]} strokeWidth={geom.stroke.width} strokeLinecap={geom.stroke.cap}
                  strokeDasharray={geom.stroke.dash?.join(' ')} strokeDashoffset={geom.stroke.offset}
                />
              )}
            </svg>
            {p.showSymbols && <span>{q.symbol}</span>}
          </div>
        ))}
      </div>
      <p className="reel-toast" role="status" aria-live="polite">{status}</p>
    </main>
  );
}
