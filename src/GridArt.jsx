import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ARTICLE, GDT, hashSeed, mulberry32 } from './shared.js';

// Symbol grid that fills its box, driven by one preset
export default function GridArt({ preset, colors, unit = 1, className = '', style }) {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Same cell size and gap as the Symbol grid, scaled to the card, filling the whole area
  const cell = Math.max(6, preset.cellSize * unit);
  const gap = preset.gap * unit;
  const cols = size.w ? Math.ceil((size.w + gap) / (cell + gap)) : 0;
  const rows = size.h ? Math.ceil((size.h + gap) / (cell + gap)) : 0;

  const cells = useMemo(() => {
    const rand = mulberry32(hashSeed(preset.seed));
    const set = preset.set === 'all' ? [...ARTICLE, ...GDT] : ARTICLE;
    return Array.from({ length: cols * rows }, () => ({
      filled: rand() < preset.fill,
      color: Math.floor(rand() * 4),
      symbol: set[Math.floor(rand() * set.length)],
      dx: rand() * 2 - 1,
      dy: rand() * 2 - 1,
    }));
  }, [preset, cols, rows]);

  return (
    <div ref={ref} className={`art ${className}`} style={{ background: colors.background, ...style }} aria-hidden="true">
      <div className="art-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap }}>
        {cells.map((c, i) => (
          <div key={i} className="art-cell" style={{
            width: cell, height: cell,
            background: c.filled ? colors.fills[c.color] : 'transparent',
            transform: c.filled && preset.jitter ? `translate(${c.dx * preset.jitter * cell}px, ${c.dy * preset.jitter * cell}px)` : undefined,
            color: colors.ink, fontWeight: preset.weight, fontSize: cell * preset.size,
          }}>
            {!c.filled && preset.emptyStyle === 'circles' && (
              <i className="dot" style={{
                width: `${preset.circleSize * 100}%`, height: `${preset.circleSize * 100}%`,
                background: preset.circleColor === 'single' ? colors.single : colors.fills[c.color],
              }} />
            )}
            {(c.filled || preset.onEmpty) && cell >= 8 && <span>{preset.use === 'mix' ? c.symbol : preset.use}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
