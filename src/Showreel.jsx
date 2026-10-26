import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDialKitController } from 'dialkit';
import GridArt from './GridArt.jsx';
import DrawingArt from './DrawingArt.jsx';
import { loadCurrentDrawing } from './DrawingTab.jsx';
import { VIEWS, viewSamples } from './views2d.js';
import { ARTICLE, GDT, hashSeed, mulberry32, FONT } from './shared.js';

const KEY = 'dialkit:symbol-grid';
// Symbol grid tab's saved look, used as-is
function readGrid() {
  let v = {};
  try { v = JSON.parse(localStorage.getItem(KEY) || '{}').values || {}; } catch {}
  const g = (k, d) => (v[k] ?? d);
  return {
    preset: {
      seed: g('seed', 'draftaid'), cellSize: g('grid.cellSize', 84), gap: g('grid.gap', 0),
      fill: g('grid.fill', 0.45), jitter: g('grid.jitter', 0), set: g('symbols.set', 'article'),
      use: g('symbols.use', 'mix'), size: g('symbols.size', 0.5), weight: g('symbols.weight', '700'),
      onEmpty: g('symbols.onEmpty', false), emptyStyle: g('empty.style', 'circles'),
      circleSize: g('empty.circleSize', 0.8), circleColor: g('empty.circleColor', 'palette'),
    },
    colors: {
      fills: [g('color.c1', '#C6FFE6'), g('color.c2', '#4DFFC6'), g('color.c3', '#00E8AD'), g('color.c4', '#009878')],
      ink: g('symbols.ink', '#0A0A0A'), single: g('empty.single', '#EDEDED'), background: g('color.background', '#FFFFFF'),
    },
  };
}

const BG2 = [{ value: 'drawing', label: 'Drawing window' }, { value: 'grid', label: 'Symbol grid' }];
const BG3 = [...BG2, { value: 'solid', label: 'Solid color' }];
const CARDS = ['hero', 'feature', 'quote', 'ui', 'sequence', 'learning'];

export default function Showreel() {
  const actions = useRef({});
  const dial = useDialKitController('Showreel', {
    backgrounds: {
      hero: { type: 'select', options: BG2, default: 'drawing' },
      feature: { type: 'select', options: BG2, default: 'grid' },
      quote: { type: 'select', options: BG2, default: 'grid' },
      ui: { type: 'select', options: BG3, default: 'drawing' },
      uiSolid: '#00382F',
      sequence: { type: 'select', options: BG2, default: 'grid' },
      learning: { type: 'select', options: BG2, default: 'grid' },
      allDrawing: { type: 'action', label: 'All drawing window' },
      allGrid: { type: 'action', label: 'All symbol grid' },
    },
    drawing: {
      zoom: [2.4, 0.3, 8, 0.05],
      invertOnDark: true,
    },
    grid: {
      scale: [0.45, 0.15, 1, 0.01],
      pixelShape: { type: 'select', options: VIEWS.map((v) => ({ value: v.id, label: v.name })), default: 'bracket-section' },
    },
    colors: {
      accent: '#25FFC0',
      sequenceBackdrop: '#00E8AD',
      learningBackdrop: '#EDEDED',
    },
  }, { id: 'showreel-2', persist: true, onAction: (a) => (actions.current[a] || actions.current[a.split('.').pop()])?.() });
  const ctrl = useRef(dial); ctrl.current = dial;
  const v = dial.values;
  actions.current = {
    allDrawing: () => ctrl.current.setValues({ backgrounds: Object.fromEntries(CARDS.map((c) => [c, 'drawing'])) }),
    allGrid: () => ctrl.current.setValues({ backgrounds: Object.fromEntries(CARDS.map((c) => [c, 'grid'])) }),
  };

  const [grid] = useState(readGrid);
  const [drawing, setDrawing] = useState(null);
  useEffect(() => { loadCurrentDrawing().then(setDrawing); }, []);

  // grid cells scale with the card width
  const stageRef = useRef(null);
  const [unit, setUnit] = useState(0.45);
  useLayoutEffect(() => {
    const el = stageRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setUnit(v.grid.scale * (e.contentRect.width / 440)));
    ro.observe(el); return () => ro.disconnect();
  }, [v.grid.scale]);

  const c = grid.colors;
  const bg = (kind, opts = {}) => {
    if (kind === 'solid') return <div className="fill" style={{ position: 'absolute', inset: 0, background: v.backgrounds.uiSolid }} />;
    if (kind === 'drawing') return <DrawingArt drawing={drawing} zoom={v.drawing.zoom} invert={opts.dark && v.drawing.invertOnDark} className="fill" />;
    return <GridArt preset={{ ...grid.preset, seed: `${grid.preset.seed}-${opts.n || 0}` }} colors={c} unit={unit} className="fill" />;
  };

  const cards = [
    { key: 'hero', name: 'Split hero', render: () => (
      <div className="lay sr-hero">
        <div className="sr-hero-art">{bg(v.backgrounds.hero, { dark: true, n: 1 })}</div>
        <div className="sr-hero-copy">
          <i className="sr-icon" style={{ background: v.colors.accent }}>⌖</i>
          <h3><span>Draftaid automates drawings</span> in an instant</h3>
          <p>Draftaid plugs into your CAD environment and covers the full downstream workflow, from drawing generation and part search to DFM, cost analysis, and release.</p>
          <div className="sr-btns"><span className="btn-w">Get started</span><span className="btn-d">Read more</span></div>
        </div>
      </div>
    ) },
    { key: 'feature', name: 'Feature card', render: () => (
      <div className="lay sr-feature">
        <div className="sr-feature-card">
          <div className="sr-feature-art">{bg(v.backgrounds.feature, { dark: true, n: 2 })}</div>
          <div className="sr-feature-copy">
            <h3>Isolated Architecture</h3>
            <p>Lorem ipsum dolor sit amet consectetur adipiscing elit est maxime repellendus.</p>
            <div className="sr-btns"><span className="btn-w">Get started</span><span className="btn-d">Read more</span></div>
          </div>
        </div>
      </div>
    ) },
    { key: 'quote', name: 'Quote card', render: () => (
      <div className="lay sr-quote">
        <div className="sr-quote-card">
          {bg(v.backgrounds.quote, { n: 3 })}
          <div className="sr-quote-inner">
            <b className="sr-wordmark">MANDERS AUTOMATION</b>
            <blockquote>“Draftaid runs inside SolidWorks, so my team never leaves the tool. Parts come in, drawings go back out, and nothing sits in a second system. That was the whole reason we didn’t have to change how we work.”</blockquote>
          </div>
        </div>
      </div>
    ) },
    { key: 'ui', name: 'Feature UI window', render: () => (
      <div className="lay sr-ui">
        {bg(v.backgrounds.ui, { n: 4 })}
        <div className="sr-window" role="img" aria-label="Placeholder UI window">
          <div className="sr-bar"><i /><i /><i /><span className="sk" style={{ width: '28%' }} /></div>
          <div className="sr-body">
            <aside>{[70, 52, 60, 44, 58].map((w, i) => <span key={i} className="sk" style={{ width: `${w}%` }} />)}</aside>
            <section>
              <span className="sk sk-title" />
              <div className="sk-block">Your UI here</div>
              <span className="sk" style={{ width: '80%' }} /><span className="sk" style={{ width: '64%' }} />
              <span className="sk-btn" style={{ background: v.colors.accent }} />
            </section>
          </div>
        </div>
      </div>
    ) },
    { key: 'sequence', name: 'Pixel shape pair', render: () => (
      <div className="lay sr-seq" style={{ background: v.colors.sequenceBackdrop }}>
        <div className="sr-seq-a">
          <h3><mark style={{ background: v.colors.accent }}>Automate</mark> your 2D drawings</h3>
          <div className="sr-seq-art">{v.backgrounds.sequence === 'drawing' ? bg('drawing', {}) : <PixelShape viewId={v.grid.pixelShape} cols={11} rows={10} colors={c.fills} seed={grid.preset.seed} />}</div>
          <p>Templates, views, dimensions and datums, in the way your team already draws.</p>
        </div>
        <div className="sr-seq-b">
          <h3>Drawings in your style, made simple</h3>
          <p>Draftaid turns 3D models into finished 2D drawings inside your CAD tool.</p>
          <span className="sr-cta" style={{ background: c.fills[3] }}>Book a demo →</span>
          <div className="sr-seq-art2">{v.backgrounds.sequence === 'drawing' ? bg('drawing', {}) : <PixelShape viewId="gusset-side" cols={8} rows={6} colors={c.fills} seed={`${grid.preset.seed}-b`} fade />}</div>
        </div>
      </div>
    ) },
    { key: 'learning', name: 'Learning pair', render: () => (
      <div className="lay sr-learn" style={{ background: v.colors.learningBackdrop }}>
        <div className="sr-learn-a">
          <h3>Learns your drafting standards</h3>
          <div className="sr-learn-art">{v.backgrounds.learning === 'drawing' ? bg('drawing', {}) : <Radial colors={c.fills} ink={c.ink} seed={grid.preset.seed} />}</div>
          <div className="sr-learn-box">
            <b>To draw the way your team does, Draftaid learns from your past drawings.</b>
            <small><i style={{ background: c.fills[3] }} />Templates, view selection, dimension style, breaks and datums, learned from your own drawings.</small>
          </div>
        </div>
        <div className="sr-learn-b">
          {['tl', 'tr', 'bl', 'br'].map((k) => <i key={k} className={`plus ${k}`} style={{ background: c.fills[2] }}>+</i>)}
          <div className="sr-learn-art2">{v.backgrounds.learning === 'drawing' ? bg('drawing', {}) : <Radial colors={c.fills} ink={c.ink} seed={`${grid.preset.seed}-2`} />}</div>
          <h3>Draftaid is learning</h3>
          <p>Every drawing your team reviews makes the next one closer to how you draw.</p>
        </div>
      </div>
    ) },
  ];

  return (
    <main className="reel" style={{ fontFamily: FONT }}>
      <div className="reel-grid">
        {cards.map((card, i) => (
          <article key={card.key} className="reel-card">
            <div className="reel-stage" ref={i === 0 ? stageRef : undefined}>{card.render()}</div>
            <footer><div><h2>{card.name}</h2><p>{v.backgrounds[card.key] === 'drawing' ? 'Drawing window' : v.backgrounds[card.key] === 'solid' ? 'Solid color' : 'Symbol grid'}</p></div></footer>
          </article>
        ))}
      </div>
    </main>
  );
}

// A 2D view rebuilt from colored squares on a light checker grid, joined by small bridges
function PixelShape({ viewId, cols, rows, colors, seed, fade = false }) {
  const shape = useMemo(() => {
    const view = VIEWS.find((x) => x.id === viewId) || VIEWS[0];
    const k = Math.min((cols - 2) / view.w, (rows - 2) / view.h);
    const ox = (cols - view.w * k) / 2, oy = (rows - view.h * k) / 2;
    const on = new Set();
    for (const [x, y] of viewSamples(view)) {
      const cc = Math.floor(ox + x * k), rr = Math.floor(oy + y * k);
      if (cc >= 0 && rr >= 0 && cc < cols && rr < rows) on.add(rr * cols + cc);
    }
    const rand = mulberry32(hashSeed(String(seed)));
    const col = new Map([...on].map((i) => [i, colors[Math.floor(rand() * 4)]]));
    return { on, col };
  }, [viewId, cols, rows, colors, seed]);
  const cells = [], bridges = [];
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const i = r * cols + q;
    if (shape.on.has(i)) {
      cells.push(<rect key={i} x={q + 0.06} y={r + 0.06} width={0.88} height={0.88} rx={0.12} fill={shape.col.get(i)} />);
      if (shape.on.has(i + 1) && q < cols - 1) bridges.push(<rect key={`h${i}`} x={q + 0.8} y={r + 0.38} width={0.4} height={0.24} fill={shape.col.get(i)} />);
      if (shape.on.has(i + cols)) bridges.push(<rect key={`v${i}`} x={q + 0.38} y={r + 0.8} width={0.24} height={0.4} fill={shape.col.get(i)} />);
    } else if ((r + q) % 2 === 0 || (fade && r >= rows - 2)) {
      cells.push(<rect key={i} x={q + 0.1} y={r + 0.1} width={0.8} height={0.8} rx={0.1} fill="#E6E6E6" />);
    }
  }
  return <svg viewBox={`0 0 ${cols} ${rows}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">{bridges}{cells}</svg>;
}

// Six learned traits radiating from one part: each spoke's angle comes from the seed
function Radial({ colors, ink, seed }) {
  const parts = useMemo(() => {
    const rand = mulberry32(hashSeed(String(seed)));
    const syms = [...ARTICLE, ...GDT];
    return Array.from({ length: 6 }, (_, i) => ({
      a: ((i * 60 + (rand() * 30 - 15) - 90) * Math.PI) / 180,
      s1: syms[Math.floor(rand() * syms.length)], s2: syms[Math.floor(rand() * syms.length)],
    }));
  }, [seed]);
  const C = 100;
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true" style={{ fontFamily: FONT }}>
      {parts.map((p, i) => <line key={`l${i}`} x1={C} y1={C} x2={C + Math.cos(p.a) * 76} y2={C + Math.sin(p.a) * 76} stroke={colors[2]} strokeWidth="4" strokeLinecap="round" />)}
      {parts.map((p, i) => {
        const mx = C + Math.cos(p.a) * 46, my = C + Math.sin(p.a) * 46, ex = C + Math.cos(p.a) * 80, ey = C + Math.sin(p.a) * 80;
        return (
          <g key={`n${i}`}>
            <rect x={mx - 10} y={my - 10} width="20" height="20" rx="4" fill={colors[1]} />
            <text x={mx} y={my + 0.5} fontSize="11" fontWeight="700" textAnchor="middle" dominantBaseline="central" fill={ink}>{p.s1}</text>
            <circle cx={ex} cy={ey} r="15" fill={colors[0]} />
            <text x={ex} y={ey + 0.5} fontSize="11" fontWeight="700" textAnchor="middle" dominantBaseline="central" fill={ink}>{p.s2}</text>
          </g>
        );
      })}
      <rect x={C - 24} y={C - 24} width="48" height="48" rx="9" fill={colors[3]} />
      <text x={C} y={C + 1} fontSize="24" fontWeight="700" textAnchor="middle" dominantBaseline="central" fill={ink}>⌖</text>
    </svg>
  );
}
