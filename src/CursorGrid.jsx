import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDialKitController } from 'dialkit';
import { ARTICLE, GDT, SYMBOL_PICK, hashSeed, mulberry32 } from './shared.js';
import { VIEWS, PAD, viewSVG, viewSamples } from './views2d.js';

// Look of the Symbol grid tab (its saved dials), so this grid starts out matching it
function readSymbolGrid() {
  let v = {};
  try { v = JSON.parse(localStorage.getItem('dialkit:symbol-grid') || '{}').values || {}; } catch {}
  const g = (k, d) => v[k] ?? d;
  return {
    colors: [g('color.c1', '#3E8EDE'), g('color.c2', '#F5C518'), g('color.c3', '#3DBE5A'), g('color.c4', '#8FD694')],
    ink: g('symbols.ink', '#0A0A0A'), background: g('color.background', '#FFFFFF'),
    circleSize: g('empty.circleSize', 0.8), circleColor: g('empty.circleColor', 'palette'), single: g('empty.single', '#3DBE5A'),
    set: g('symbols.set', 'article'), size: g('symbols.size', 0.5), weight: g('symbols.weight', '700'),
  };
}

const memory = { placed: [] }; // placed views survive tab switches
const VIEW_BY_ID = Object.fromEntries(VIEWS.map((v) => [v.id, v]));
const MODES = [
  { value: 'place', label: 'Snap' },
  { value: 'placeSquares', label: 'Snap + squares' },
  { value: 'pixelate', label: 'Pixelate' },
];

export default function CursorGrid() {
  const actions = useRef({});
  const dial = useDialKitController('Cursor grid', {
    matchSymbolGrid: true,
    seed: { type: 'text', default: 'draftaid', placeholder: 'Any word' },
    grid: {
      cellSize: [56, 20, 140, 1],
      gap: [0, 0, 16, 1],
    },
    cursor: {
      radius: [1.6, 0.5, 6, 0.1],
      shape: { type: 'select', options: [
        { value: 'round', label: 'Round' }, { value: 'square', label: 'Square' }, { value: 'diamond', label: 'Diamond' },
      ], default: 'round' },
    },
    trail: {
      on: false,
      length: [0.6, 0.1, 4, 0.05],
    },
    views: {
      panel: true,
      onDrop: { type: 'select', options: MODES, default: 'place' },
      scale: [0.7, 0.3, 2.5, 0.05],
      plate: true,
      ink: '#111111',
      undo: { type: 'action', label: 'Undo last drop' },
      clear: { type: 'action', label: 'Clear all drops' },
    },
    symbols: {
      show: true,
      set: { type: 'select', options: [{ value: 'article', label: 'Guide symbols' }, { value: 'all', label: 'Guide + GD&T' }], default: 'article' },
      use: { type: 'select', options: SYMBOL_PICK, default: 'mix' },
      size: [0.5, 0.2, 0.9, 0.01],
      weight: { type: 'select', options: ['400', '700', '900'], default: '700' },
      ink: '#0A0A0A',
    },
    circles: {
      size: [0.8, 0.1, 1, 0.01],
      color: { type: 'select', options: [{ value: 'palette', label: 'From palette' }, { value: 'single', label: 'Single color' }], default: 'palette' },
      single: '#3DBE5A',
    },
    color: { c1: '#3E8EDE', c2: '#F5C518', c3: '#3DBE5A', c4: '#8FD694', background: '#FFFFFF' },
  }, { id: 'cursor-grid', persist: true, onAction: (a) => (actions.current[a] || actions.current[a.split('.').pop()])?.() });
  const p = dial.values;

  const [sg] = useState(readSymbolGrid);
  const m = p.matchSymbolGrid;
  const look = {
    colors: m ? sg.colors : [p.color.c1, p.color.c2, p.color.c3, p.color.c4],
    ink: m ? sg.ink : p.symbols.ink,
    background: m ? sg.background : p.color.background,
    circleSize: m ? sg.circleSize : p.circles.size,
    circleColor: m ? sg.circleColor : p.circles.color,
    single: m ? sg.single : p.circles.single,
    set: m ? sg.set : p.symbols.set,
    size: m ? sg.size : p.symbols.size,
    weight: m ? sg.weight : p.symbols.weight,
  };

  // ---------- grid geometry ----------
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  const S = p.grid.cellSize, G = p.grid.gap, pitch = S + G;
  const cols = Math.max(1, Math.floor((box.w + G) / pitch));
  const rows = Math.max(1, Math.floor((box.h + G) / pitch));
  const ox = (box.w - (cols * pitch - G)) / 2, oy = (box.h - (rows * pitch - G)) / 2;
  const k = S * p.views.scale * (10 / 82); // px per drawing unit: the bracket front is about 10 cells wide

  const cells = useMemo(() => {
    const rand = mulberry32(hashSeed(p.seed || ' '));
    const set = look.set === 'all' ? [...ARTICLE, ...GDT] : ARTICLE;
    return Array.from({ length: cols * rows }, () => ({ color: Math.floor(rand() * 4), symbol: set[Math.floor(rand() * set.length)] }));
  }, [p.seed, cols, rows, look.set]);

  // cells a view's lines touch when its origin sits at grid cell (col, row)
  const cellsFor = useCallback((view, col, row) => {
    const out = new Set();
    for (const [ux, uy] of viewSamples(view)) {
      const px = col * pitch + ux * k, py = row * pitch + uy * k;
      const c = Math.floor(px / pitch), r = Math.floor(py / pitch);
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      if (px - c * pitch > S || py - r * pitch > S) continue; // in the gap
      out.add(r * cols + c);
    }
    return out;
  }, [pitch, k, cols, rows, S]);

  // ---------- cursor + trail ----------
  const [cur, setCur] = useState(null);
  const trail = useRef(new Map());
  const [now, setNow] = useState(0);
  const raf = useRef(0), pending = useRef(null);
  const toGrid = (clientX, clientY) => {
    const b = ref.current.getBoundingClientRect();
    return { x: (clientX - b.left - ox) / pitch, y: (clientY - b.top - oy) / pitch };
  };
  const r = p.cursor.radius;
  const near = (col, row, c) => {
    const dx = col + S / pitch / 2 - c.x, dy = row + S / pitch / 2 - c.y;
    if (p.cursor.shape === 'square') return Math.max(Math.abs(dx), Math.abs(dy)) <= r;
    if (p.cursor.shape === 'diamond') return Math.abs(dx) + Math.abs(dy) <= r;
    return Math.hypot(dx, dy) <= r;
  };
  const hoverSet = useMemo(() => {
    const s = new Set();
    if (!cur) return s;
    const c0 = Math.max(0, Math.floor(cur.x - r - 1)), c1 = Math.min(cols - 1, Math.ceil(cur.x + r + 1));
    const r0 = Math.max(0, Math.floor(cur.y - r - 1)), r1 = Math.min(rows - 1, Math.ceil(cur.y + r + 1));
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) if (near(col, row, cur)) s.add(row * cols + col);
    return s;
  }, [cur, r, cols, rows, p.cursor.shape, S, pitch]);
  useEffect(() => {
    if (!p.trail.on) { trail.current.clear(); return; }
    const t = performance.now();
    hoverSet.forEach((i) => trail.current.set(i, t));
  }, [hoverSet, p.trail.on]);
  useEffect(() => { // tick while a trail is decaying
    if (!p.trail.on) return;
    let id;
    const loop = () => {
      const t = performance.now(), life = p.trail.length * 1000;
      for (const [i, ts] of trail.current) if (t - ts > life) trail.current.delete(i);
      setNow(t);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [p.trail.on, p.trail.length]);

  // ---------- placed views + dragging ----------
  const [placed, setPlaced] = useState(memory.placed);
  useEffect(() => { memory.placed = placed; }, [placed]);
  const [drag, setDrag] = useState(null); // { view, gx, gy, x, y, over, col, row }
  const panelRef = useRef(null);

  const snapFor = (view, clientX, clientY, gx, gy) => {
    const b = ref.current.getBoundingClientRect();
    const over = clientX >= b.left && clientX <= b.right && clientY >= b.top && clientY <= b.bottom;
    const col = Math.round((clientX - gx - b.left - ox) / pitch), row = Math.round((clientY - gy - b.top - oy) / pitch);
    return { over, col, row };
  };
  const startDrag = (view, e, grab) => {
    e.preventDefault();
    const gx = grab ? grab.x : (view.w * k) / 2, gy = grab ? grab.y : (view.h * k) / 2;
    setCur(null);
    setDrag({ view, gx, gy, x: e.clientX, y: e.clientY, ...snapFor(view, e.clientX, e.clientY, gx, gy) });
  };
  useEffect(() => {
    if (!drag) return;
    const move = (e) => setDrag((d) => d && ({ ...d, x: e.clientX, y: e.clientY, ...snapFor(d.view, e.clientX, e.clientY, d.gx, d.gy) }));
    const up = (e) => {
      setDrag((d) => {
        if (!d) return null;
        const s = snapFor(d.view, e.clientX, e.clientY, d.gx, d.gy);
        const pr = panelRef.current?.getBoundingClientRect();
        const onPanel = pr && e.clientX >= pr.left && e.clientX <= pr.right && e.clientY >= pr.top && e.clientY <= pr.bottom;
        if (s.over && !onPanel) setPlaced((list) => [...list, { id: Date.now() + Math.random(), viewId: d.view.id, col: s.col, row: s.row, mode: p.views.onDrop }]);
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [!!drag, pitch, ox, oy, k, p.views.onDrop]);

  actions.current = {
    undo: () => setPlaced((l) => l.slice(0, -1)),
    clear: () => setPlaced([]),
  };

  // ---------- which cells are squares ----------
  const placedSquares = useMemo(() => {
    const s = new Set();
    for (const pl of placed) if (pl.mode !== 'place') cellsFor(VIEW_BY_ID[pl.viewId], pl.col, pl.row).forEach((i) => s.add(i));
    return s;
  }, [placed, cellsFor]);
  const dropZone = useMemo(() => (drag?.over ? cellsFor(drag.view, drag.col, drag.row) : new Set()), [drag, cellsFor]);
  const life = p.trail.length * 1000;
  const isSquare = (i) => hoverSet.has(i) || dropZone.has(i) || placedSquares.has(i)
    || (p.trail.on && trail.current.has(i) && now - trail.current.get(i) <= life);

  const onMove = (e) => {
    if (drag) return;
    pending.current = toGrid(e.clientX, e.clientY);
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; setCur(pending.current); });
  };
  const onLeave = () => { pending.current = null; cancelAnimationFrame(raf.current); raf.current = 0; setCur(null); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const svgCache = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, viewSVG(v, { ink: p.views.ink })])), [p.views.ink]);
  const viewBoxStyle = (v, left, top) => ({ left: left - PAD * k, top: top - PAD * k, width: (v.w + PAD * 2) * k, height: (v.h + PAD * 2) * k });

  return (
    <div className="cg-wrap" style={{ background: look.background }}>
      {p.views.panel && (
        <aside className="cg-panel" ref={panelRef} aria-label="Sample 2D views">
          <h2>2D views</h2>
          <p>Drag onto the grid</p>
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className="cg-card" onPointerDown={(e) => startDrag(v, e)} aria-label={`Drag ${v.name}`}>
              <span className="cg-thumb" dangerouslySetInnerHTML={{ __html: svgCache[v.id] }} />
              <span className="cg-label">{v.name}</span>
            </button>
          ))}
        </aside>
      )}
      <main
        ref={ref}
        className="cg-stage"
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={onLeave} onPointerCancel={onLeave}
        aria-label="Interactive symbol grid: move the pointer over the circles to reveal symbols, drop 2D views onto it"
      >
        <div className="cg-grid" aria-hidden="true" style={{ left: ox, top: oy, gridTemplateColumns: `repeat(${cols}, ${S}px)`, gap: G }}>
          {cells.map((c, i) => {
            const on = isSquare(i);
            const fill = look.colors[c.color];
            return (
              <div key={i} className="cg-cell" style={{ width: S, height: S, background: on ? fill : 'transparent' }}>
                {on
                  ? p.symbols.show && <span style={{ color: look.ink, fontWeight: look.weight, fontSize: S * look.size }}>{p.symbols.use === 'mix' ? c.symbol : p.symbols.use}</span>
                  : <i className="dot" style={{ width: `${look.circleSize * 100}%`, height: `${look.circleSize * 100}%`, background: look.circleColor === 'single' ? look.single : fill }} />}
              </div>
            );
          })}
        </div>
        {placed.filter((pl) => pl.mode !== 'pixelate').map((pl) => {
          const v = VIEW_BY_ID[pl.viewId];
          const left = ox + pl.col * pitch, top = oy + pl.row * pitch;
          return (
            <div key={pl.id} className={`cg-placed ${pl.mode === 'place' && p.views.plate ? 'plate' : ''}`}
              style={{ ...viewBoxStyle(v, left, top), '--plate': look.background }}
              onPointerDown={(e) => {
                const b = e.currentTarget.getBoundingClientRect();
                setPlaced((l) => l.filter((x) => x.id !== pl.id));
                startDrag(v, e, { x: e.clientX - b.left - PAD * k, y: e.clientY - b.top - PAD * k });
              }}
              dangerouslySetInnerHTML={{ __html: svgCache[v.id] }} title={`${v.name}: drag to move`} />
          );
        })}
      </main>
      {drag && (() => {
        const b = ref.current.getBoundingClientRect();
        const left = drag.over ? b.left + ox + drag.col * pitch : drag.x - drag.gx;
        const top = drag.over ? b.top + oy + drag.row * pitch : drag.y - drag.gy;
        return <div className="cg-ghost" style={viewBoxStyle(drag.view, left, top)} dangerouslySetInnerHTML={{ __html: svgCache[drag.view.id] }} aria-hidden="true" />;
      })()}
    </div>
  );
}
