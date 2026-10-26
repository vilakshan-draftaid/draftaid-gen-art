import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDialKitController } from 'dialkit';
import { ARTICLE, GDT, SYMBOL_PICK, PALETTES, hashSeed, mulberry32 } from './shared.js';

// Colors pulled from the screenshot of the current grid: 4 base hues plus their shades
const MINE = [
  '#5FD954', '#F65299', '#EAC732', '#6598FF',
  '#5FD954', '#F65299', '#EAC732', '#6598FF',
  '#35C464', '#66CD25', '#75B944', '#38D02A',
  '#D44C99', '#F32780', '#F25173', '#DB5F74',
  '#E4B900', '#E9A236', '#C8BF06', '#C2B35D',
  '#3F7FFF', '#6C79E7', '#3994DC', '#5E91DC',
];
const NAV = ['Product', 'How it works', 'Customers', 'Pricing', 'About'];

export default function HeroTab() {
  const ctrl = useRef(null);
  const [auto, setAuto] = useState(false);
  const dial = useDialKitController('Hero', {
    copy: {
      headline: { type: 'text', default: 'Drawings that look like your best drafter made them.' },
      subtext: { type: 'text', default: 'Draftaid learns your templates, views and dimension style, then turns 3D models into finished drawings.' },
      cta: { type: 'text', default: 'Book a demo' },
      clearBehindText: true,
    },
    dots: {
      spacing: [24, 12, 64, 1],
      size: [3, 1, 10, 0.5],
      color: '#0D0D0D',
    },
    squares: {
      seed: { type: 'text', default: 'draftaid', placeholder: 'Any word' },
      shuffle: { type: 'action', label: 'New seed' },
      autoShuffle: { type: 'action', label: auto ? 'Stop auto seed' : 'Auto seed' },
      every: [1.2, 0.1, 5, 0.05],
      density: [0.03, 0, 0.3, 0.005],
      size: [1, 0.4, 1.6, 0.01],
      flicker: true,
      flickerEvery: [0.35, 0.05, 2, 0.05],
    },
    symbols: {
      show: true,
      set: { type: 'select', options: [
        { value: 'article', label: 'Guide symbols' },
        { value: 'all', label: 'Guide + GD&T' },
      ], default: 'all' },
      use: { type: 'select', options: SYMBOL_PICK, default: 'mix' },
      size: [0.55, 0.2, 0.9, 0.01],
      weight: { type: 'select', options: ['400', '500', '700', '900'], default: '700' },
      ink: '#0D0D0D',
    },
    color: {
      palette: { type: 'select', options: [
        { value: 'mine', label: 'My palette' },
        { value: 'plot', label: 'Plot' },
        { value: 'draftaid', label: 'Draftaid' },
      ], default: 'mine' },
      ctaColor: '#EAC732',
      text: '#0D0D0D',
      background: '#FFFFFF',
    },
  }, {
    id: 'hero',
    persist: true,
    onAction: (a) => {
      const roll = () => ctrl.current?.setValue('squares.seed', Math.random().toString(36).slice(2, 8));
      if (a === 'shuffle') roll();
      if (a === 'autoShuffle') setAuto((on) => !on);
    },
  });
  ctrl.current = dial;
  const p = dial.values;
  const colors = p.color.palette === 'mine' ? MINE : PALETTES[p.color.palette];

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => ctrl.current?.setValue('squares.seed', Math.random().toString(36).slice(2, 8)), p.squares.every * 1000);
    return () => clearInterval(id);
  }, [auto, p.squares.every]);

  // Measure the hero and the text block so dots can clear around the copy
  const heroRef = useRef(null), copyRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0, clear: null });
  useLayoutEffect(() => {
    const measure = () => {
      const h = heroRef.current.getBoundingClientRect();
      const c = copyRef.current.getBoundingClientRect();
      setBox({ w: h.width, h: h.height, clear: { x0: c.left - h.left, y0: c.top - h.top, x1: c.right - h.left, y1: c.bottom - h.top } });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(heroRef.current); ro.observe(copyRef.current);
    return () => ro.disconnect();
  }, []);

  const S = p.dots.spacing;
  const cols = Math.max(1, Math.floor(box.w / S));
  const rows = Math.max(1, Math.floor(box.h / S));
  const ox = (box.w - (cols - 1) * S) / 2, oy = (box.h - (rows - 1) * S) / 2;

  const cells = useMemo(() => {
    const pad = S * 0.75, c = box.clear, out = [];
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const x = ox + k * S, y = oy + r * S;
      const hidden = p.copy.clearBehindText && c && x > c.x0 - pad && x < c.x1 + pad && y > c.y0 - pad && y < c.y1 + pad;
      if (!hidden) out.push({ x, y, i: r * cols + k });
    }
    return out;
  }, [cols, rows, ox, oy, S, box.clear, p.copy.clearBehindText]);

  // Seeded starting squares
  const seeded = useMemo(() => {
    const rand = mulberry32(hashSeed(p.squares.seed || ' '));
    const set = p.symbols.set === 'all' ? [...ARTICLE, ...GDT] : ARTICLE;
    const map = new Map();
    cells.forEach((cell) => {
      const on = rand() < p.squares.density;
      const color = rand(), sym = rand();
      if (on) map.set(cell.i, { color: Math.floor(color * 1e6), symbol: set[Math.floor(sym * set.length)] });
    });
    return map;
  }, [cells, p.squares.seed, p.squares.density, p.symbols.set]);

  // Flicker: swap one square at a time to keep the hero alive
  const [live, setLive] = useState(seeded);
  useEffect(() => setLive(seeded), [seeded]);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!p.squares.flicker || reduce || !cells.length) return;
    const set = p.symbols.set === 'all' ? [...ARTICLE, ...GDT] : ARTICLE;
    const id = setInterval(() => {
      setLive((prev) => {
        if (!prev.size) return prev;
        const next = new Map(prev);
        const keys = [...next.keys()];
        next.delete(keys[Math.floor(Math.random() * keys.length)]);
        let pick;
        for (let t = 0; t < 20; t++) { pick = cells[Math.floor(Math.random() * cells.length)].i; if (!next.has(pick)) break; }
        next.set(pick, { color: Math.floor(Math.random() * 1e6), symbol: set[Math.floor(Math.random() * set.length)] });
        return next;
      });
    }, p.squares.flickerEvery * 1000);
    return () => clearInterval(id);
  }, [p.squares.flicker, p.squares.flickerEvery, cells, p.symbols.set]);

  const sq = S * p.squares.size;

  return (
    <div className="hero-page" style={{ background: p.color.background, color: p.color.text }}>
      <header className="site-nav">
        <div className="brand brand-v1">
          <span className="brand-mark" aria-hidden="true">
            {[0, 1, 2, 3].map((k) => <i key={k} style={{ background: k === 2 ? 'transparent' : colors[k % colors.length] }} />)}
          </span>
          Draftaid
        </div>
        <nav aria-label="Main">
          <ul className="nav-links">
            {NAV.map((n) => <li key={n}><a href="#hero">{n}</a></li>)}
            <li><a href="#hero" className="nav-cta" style={{ background: p.color.ctaColor, color: p.symbols.ink }}>{p.copy.cta}</a></li>
          </ul>
        </nav>
      </header>
      <section className="hero" ref={heroRef} aria-label="Hero">
        <div className="hero-field" aria-hidden="true">
          {cells.map((c) => {
            const s = live.get(c.i);
            if (!s) return (
              <i key={c.i} className="hero-dot" style={{ left: c.x, top: c.y, width: p.dots.size, height: p.dots.size, background: p.dots.color }} />
            );
            return (
              <span key={c.i} className="hero-sq" style={{
                left: c.x, top: c.y, width: sq, height: sq,
                background: colors[s.color % colors.length],
                color: p.symbols.ink, fontWeight: p.symbols.weight, fontSize: sq * p.symbols.size,
              }}>
                {p.symbols.show && (p.symbols.use === 'mix' ? s.symbol : p.symbols.use)}
              </span>
            );
          })}
        </div>
        <div className="hero-copy" ref={copyRef}>
          <h1>{p.copy.headline}</h1>
          <p>{p.copy.subtext}</p>
        </div>
      </section>
    </div>
  );
}
