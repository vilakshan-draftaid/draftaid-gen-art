import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDialKitController } from 'dialkit';
import { sampleDrawingSVG } from './sampleDrawing.js';
import { copySVG, copyPNG } from './exportGrid.js';

// ---------- source storage: survives tab switches (memory) and reloads (IndexedDB) ----------
const memory = { src: null, view: { u: 0.5, v: 0.5 } };
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open('drawing-window', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function idbSet(key, val) {
  try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(val, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch {}
}
async function idbGet(key) {
  try { const db = await idb(); return await new Promise((res) => { const g = db.transaction('kv').objectStore('kv').get(key); g.onsuccess = () => res(g.result); g.onerror = () => res(undefined); }); } catch { return undefined; }
}

function sampleSource() {
  const svg = sampleDrawingSVG();
  return { name: 'Sample: DA-0013 bracket', kind: 'svg', svgText: svg, url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), w: 1190, h: 842, pages: 1, page: 1 };
}
const loadImage = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
const readAs = (file, how) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r[how](file); });

async function renderPdf(bytes, pageNum) {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  globalThis.pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs'); // run pdf.js on the main thread
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const n = Math.min(Math.max(1, pageNum), doc.numPages);
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(6, 4000 / Math.max(base.width, base.height));
  const vp = page.getViewport({ scale });
  const cv = document.createElement('canvas');
  cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return { url: cv.toDataURL('image/png'), w: cv.width, h: cv.height, pages: doc.numPages, page: n };
}

const ASPECTS = [
  { value: '16:9', label: '16:9' }, { value: '4:3', label: '4:3' }, { value: '3:2', label: '3:2' },
  { value: '1:1', label: '1:1' }, { value: '4:5', label: '4:5' }, { value: '3:4', label: '3:4' },
  { value: '2:3', label: '2:3' }, { value: '9:16', label: '9:16' }, { value: '21:9', label: '21:9' },
  { value: '1.91:1', label: '1.91:1 (link preview)' }, { value: 'custom', label: 'Custom' },
];

export default function DrawingTab() {
  const ctrl = useRef(null);
  const fileRef = useRef(null);
  const [src, setSrc] = useState(memory.src);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState(memory.view);
  const actions = useRef({});

  const dial = useDialKitController('Drawing window', {
    drawing: {
      upload: { type: 'action', label: 'Upload drawing' },
      sample: { type: 'action', label: 'Use sample drawing' },
      page: [1, 1, Math.max(2, src?.pages || 1), 1],
    },
    window: {
      aspect: { type: 'select', options: ASPECTS, default: '16:9' },
      customW: [4, 1, 32, 1],
      customH: [5, 1, 32, 1],
      size: [0.82, 0.3, 0.96, 0.01],
      radius: [0, 0, 48, 1],
      border: true,
      borderColor: '#0D0D0D',
    },
    view: {
      zoom: [1, 0.2, 12, 0.01],
      rotate: { type: 'select', options: ['0', '90', '180', '270'], default: '0' },
      fit: { type: 'action', label: 'Fit drawing in window' },
      center: { type: 'action', label: 'Center drawing' },
    },
    outside: {
      blur: [10, 0, 40, 1],
      dim: [0.45, 0, 0.95, 0.01],
      tint: '#FFFFFF',
      stage: '#E9E9E6',
    },
    export: {
      size: { type: 'select', options: ['1080', '1600', '2048', '4096'], default: '2048' },
      paper: '#FFFFFF',
      png: { type: 'action', label: 'Copy PNG' },
      svg: { type: 'action', label: 'Copy SVG (vector drawings)' },
    },
  }, {
    id: 'drawing-window', persist: true,
    onAction: (a) => actions.current[a]?.(),
  });
  ctrl.current = dial;
  const p = dial.values;

  // first load: memory, then IndexedDB, then the sample drawing
  useEffect(() => {
    if (memory.src) return;
    idbGet('current').then((saved) => {
      const s = saved?.url ? saved : sampleSource();
      memory.src = s; setSrc(s);
      if (saved?.view) { memory.view = saved.view; setView(saved.view); }
    });
  }, []);
  useEffect(() => { memory.view = view; }, [view]);
  useEffect(() => {
    if (!src) return;
    const t = setTimeout(() => idbSet('current', { ...src, view }), 400);
    return () => clearTimeout(t);
  }, [src, view]);

  const slug = (n) => (n || 'drawing').replace(/^Sample:\s*/, '').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'drawing';
  const flash = (m) => { setStatus(m); setTimeout(() => setStatus(''), 2600); };

  const useSource = useCallback((s) => {
    memory.src = s; setSrc(s); setView({ u: 0.5, v: 0.5 });
    ctrl.current?.setValue('view.zoom', 1); lastZoom.current = 1;
  }, []);

  const openFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (isPdf) {
        setBusy('Rendering PDF…');
        const bytes = await readAs(file, 'readAsArrayBuffer');
        const r = await renderPdf(bytes, 1);
        useSource({ name: file.name, kind: 'pdf', pdf: bytes, ...r });
        ctrl.current?.setValue('drawing.page', 1);
      } else if (file.type.startsWith('image/') || /\.(svg|png|jpe?g|webp|gif)$/i.test(file.name)) {
        setBusy('Loading drawing…');
        const url = await readAs(file, 'readAsDataURL');
        const img = await loadImage(url);
        const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
        const svgText = isSvg ? await readAs(file, 'readAsText') : null;
        useSource({ name: file.name, kind: isSvg ? 'svg' : 'image', svgText, url, w: img.naturalWidth || 1200, h: img.naturalHeight || 800, pages: 1, page: 1 });
      } else {
        flash('Use a PDF, SVG, PNG or JPG. Export DWG/DXF to PDF first.');
      }
    } catch {
      flash('Couldn’t open that file');
    } finally { setBusy(''); }
  }, [useSource]);

  // PDF page changes
  useEffect(() => {
    if (src?.kind !== 'pdf' || !src.pdf || p.drawing.page === src.page) return;
    const want = Math.min(p.drawing.page, src.pages);
    if (want === src.page) return;
    setBusy('Rendering page…');
    renderPdf(src.pdf, want).then((r) => { const s = { ...src, ...r }; memory.src = s; setSrc(s); }).finally(() => setBusy(''));
  }, [p.drawing.page, src]);

  // ---------- geometry ----------
  const stageRef = useRef(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(stageRef.current); return () => ro.disconnect();
  }, []);
  const [aw, ah] = p.window.aspect === 'custom' ? [p.window.customW, p.window.customH] : p.window.aspect.split(':').map(Number);
  const ratio = aw / (ah || 1);
  const usableH = Math.max(100, stage.h - 80); // keep clear of the tab bar
  const maxW = stage.w * p.window.size, maxH = usableH * p.window.size;
  const ww = Math.max(40, Math.min(maxW, maxH * ratio)), wh = ww / ratio;
  const wx = (stage.w - ww) / 2, wy = (usableH - wh) / 2 + 8;
  const rot = Number(p.view.rotate);
  const iw = src?.w || 1, ih = src?.h || 1;
  const rw = rot % 180 ? ih : iw, rh = rot % 180 ? iw : ih;
  const fitK = Math.min(ww / rw, wh / rh);
  const k = fitK * p.view.zoom;
  const cx = view.u * ww, cy = view.v * wh;
  const tf = (ox, oy) => `translate(${ox + cx}px, ${oy + cy}px) rotate(${rot}deg) scale(${k}) translate(${-iw / 2}px, ${-ih / 2}px)`;

  // zoom about a point (window coords); keeps the dial and the view in step
  const lastZoom = useRef(p.view.zoom);
  const zoomTo = useCallback((z, px, py) => {
    const zz = Math.min(12, Math.max(0.2, z));
    const r = zz / lastZoom.current;
    setView((v) => ({ u: (px + (v.u * ww - px) * r) / ww, v: (py + (v.v * wh - py) * r) / wh }));
    lastZoom.current = zz;
    ctrl.current?.setValue('view.zoom', Math.round(zz * 100) / 100);
  }, [ww, wh]);
  useEffect(() => { // slider moved: zoom about the window centre
    if (Math.abs(p.view.zoom - lastZoom.current) < 0.005) return;
    const r = p.view.zoom / lastZoom.current;
    setView((v) => ({ u: 0.5 + (v.u - 0.5) * r, v: 0.5 + (v.v - 0.5) * r }));
    lastZoom.current = p.view.zoom;
  }, [p.view.zoom]);

  // drag to move
  const drag = useRef(null);
  const onDown = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, u: view.u, v: view.v };
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    setView({ u: d.u + (e.clientX - d.x) / ww, v: d.v + (e.clientY - d.y) / wh });
  };
  const onUp = () => { drag.current = null; };
  // wheel / trackpad zoom
  useEffect(() => {
    const el = stageRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const b = el.getBoundingClientRect();
      zoomTo(lastZoom.current * Math.exp(-e.deltaY * 0.0015), e.clientX - b.left - wx, e.clientY - b.top - wy);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo, wx, wy]);
  const onKey = (e) => {
    const step = e.shiftKey ? 40 : 10;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); const [dx, dy] = moves[e.key]; setView((v) => ({ u: v.u + dx / ww, v: v.v + dy / wh })); }
    if (e.key === '+' || e.key === '=') zoomTo(lastZoom.current * 1.2, ww / 2, wh / 2);
    if (e.key === '-') zoomTo(lastZoom.current / 1.2, ww / 2, wh / 2);
  };

  // ---------- export ----------
  const exportPng = () => {
    if (!src) return;
    const N = Number(p.export.size), f = N / Math.max(ww, wh);
    const make = async () => {
      const cv = document.createElement('canvas');
      cv.width = Math.round(ww * f); cv.height = Math.round(wh * f);
      const ctx = cv.getContext('2d');
      if (p.window.radius) { ctx.beginPath(); ctx.roundRect(0, 0, cv.width, cv.height, p.window.radius * f); ctx.clip(); }
      ctx.fillStyle = p.export.paper; ctx.fillRect(0, 0, cv.width, cv.height);
      const img = await loadImage(src.url);
      ctx.translate(cx * f, cy * f); ctx.rotate((rot * Math.PI) / 180); ctx.scale(k * f, k * f);
      ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
      return new Promise((r) => cv.toBlob(r, 'image/png'));
    };
    copyPNG(make(), `${slug(src.name)}-${p.window.aspect.replace(':', 'x')}.png`).then(flash);
  };
  const exportSvg = () => {
    if (src?.kind !== 'svg' || !src.svgText) { flash('SVG export needs an SVG drawing. Use PNG for PDFs and images.'); return; }
    const inner = src.svgText.replace(/<\?xml[^>]*>/, '').replace(/<!DOCTYPE[^>]*>/i, '')
      .replace(/<svg\b/, `<svg width="${iw}" height="${ih}"`);
    const r = (n) => Math.round(n * 1000) / 1000;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r(ww)}" height="${r(wh)}" viewBox="0 0 ${r(ww)} ${r(wh)}">
<defs><clipPath id="win"><rect width="${r(ww)}" height="${r(wh)}" rx="${p.window.radius}"/></clipPath></defs>
<g clip-path="url(#win)"><rect width="${r(ww)}" height="${r(wh)}" fill="${p.export.paper}"/>
<g transform="translate(${r(cx)} ${r(cy)}) rotate(${rot}) scale(${r(k)}) translate(${-iw / 2} ${-ih / 2})">${inner}</g></g></svg>`;
    copySVG(svg, `${slug(src.name)}-${p.window.aspect.replace(':', 'x')}.svg`).then(flash);
  };

  actions.current = {
    'drawing.upload': () => fileRef.current?.click(),
    'drawing.sample': () => useSource(sampleSource()),
    'view.fit': () => { setView({ u: 0.5, v: 0.5 }); lastZoom.current = 1; ctrl.current?.setValue('view.zoom', 1); },
    'view.center': () => setView({ u: 0.5, v: 0.5 }),
    'export.png': exportPng,
    'export.svg': exportSvg,
  };
  // some DialKit versions report folder actions by key only
  ['upload', 'sample', 'fit', 'center', 'png', 'svg'].forEach((key) => {
    const full = Object.keys(actions.current).find((a) => a.endsWith('.' + key));
    actions.current[key] = actions.current[full];
  });

  const onDrop = (e) => { e.preventDefault(); openFile(e.dataTransfer.files?.[0]); };

  return (
    <main
      ref={stageRef}
      className="dw-stage"
      style={{ background: p.outside.stage }}
      tabIndex={0}
      aria-label="Drawing window. Drag to move the drawing, scroll or use plus and minus to zoom, arrow keys to nudge."
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onKeyDown={onKey}
      onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
    >
      <input ref={fileRef} type="file" hidden accept=".pdf,.svg,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
        onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = ''; }} />
      {src && (
        <>
          <div className="dw-outer" style={{ filter: p.outside.blur ? `blur(${p.outside.blur}px)` : undefined }} aria-hidden="true">
            <img src={src.url} alt="" draggable={false} style={{ width: iw, height: ih, transform: tf(wx, wy) }} />
          </div>
          <div className="dw-dim" style={{ background: p.outside.tint, opacity: p.outside.dim }} aria-hidden="true" />
          <div className="dw-window" style={{
            left: wx, top: wy, width: ww, height: wh, borderRadius: p.window.radius,
            background: p.export.paper,
            boxShadow: p.window.border ? `0 0 0 1px ${p.window.borderColor}` : 'none',
          }}>
            <img src={src.url} alt={src.name} draggable={false} style={{ width: iw, height: ih, transform: tf(0, 0) }} />
          </div>
        </>
      )}
      <div className="dw-info">
        <b>{src?.name || 'No drawing'}</b>
        {src?.kind === 'pdf' && <span>Page {src.page} of {src.pages}</span>}
        <span>{Math.round(ww)} × {Math.round(wh)} · drag to move · scroll to zoom · drop a file to load</span>
      </div>
      {busy && <div className="dw-busy" role="status">{busy}</div>}
      <p className="reel-toast" role="status" aria-live="polite">{status}</p>
    </main>
  );
}

// The drawing currently loaded in this tab, plus its framing, for use on other tabs
export async function loadCurrentDrawing() {
  let src = memory.src, view = memory.view;
  if (!src) {
    const saved = await idbGet('current');
    if (saved?.url) { src = saved; view = saved.view || view; } else src = sampleSource();
  }
  let v = {};
  try { v = JSON.parse(localStorage.getItem('dialkit:drawing-window') || '{}').values || {}; } catch {}
  return { src, view, zoom: v['view.zoom'] ?? 1, rotate: Number(v['view.rotate'] ?? 0) };
}
