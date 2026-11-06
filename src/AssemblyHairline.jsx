import { useEffect, useRef, useState } from 'react';
import { useDialKitController } from 'dialkit';
import { mount } from './hairline/engine.js';
import { cable } from './hairline/cable.js';
import { valve } from './hairline/valve.js';
import { copySVG, copyPNG } from './exportGrid.js';

const MODELS = { cable, valve };

// Assemblies as Hairline figures: isometric, one hairline stroke in four greys, the chosen
// part group on the bright edge. Explode takes them apart; drag sideways to turn them
export default function AssemblyHairline() {
  const [status, setStatus] = useState('');
  const exportRef = useRef(null);
  // The highlight list follows the model, so the panel's config is rebuilt when it changes
  const [modelId, setModelId] = useState('cable');
  const model = MODELS[modelId] ?? cable;
  const dial = useDialKitController('Assembly', {
    model: { type: 'select', options: Object.entries(MODELS).map(([value, m]) => ({ value, label: m.name })), default: 'cable' },
    exportSvg: { type: 'action', label: 'Copy SVG' },
    exportPng: { type: 'action', label: 'Copy PNG' },
    saveSvg: { type: 'action', label: 'Save SVG' },
    savePng: { type: 'action', label: 'Save PNG' },
    explode: [0.3, 0, 1, 0.01],
    highlight: { type: 'select', options: [{ value: 'none', label: 'None' }, ...model.groups], default: model.rest },
    // Drag the drawing sideways to turn it about its upright axis
    turn: [45, 0, 360, 1],
    look: {
      theme: { type: 'select', options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ], default: 'light' },
      stroke: [0.9, 0.5, 2, 0.05],
    },
  }, {
    id: 'iso-assembly',
    persist: true,
    onAction: (a) => {
      const key = String(a).split('.').pop();
      if (key === 'exportSvg' || key === 'exportPng') exportRef.current?.(key === 'exportSvg' ? 'svg' : 'png');
      if (key === 'saveSvg' || key === 'savePng') exportRef.current?.(key === 'saveSvg' ? 'svg' : 'png', true);
    },
  });
  const p = dial.values;
  useEffect(() => { if (p.model && p.model !== modelId) setModelId(p.model); }, [p.model]);
  // A part group the other model doesn't have falls back to that model's own
  const part = p.highlight === 'none' || model.groups.some((g) => g.value === p.highlight) ? p.highlight : model.rest;

  const stageRef = useRef(null);
  const svgRef = useRef(null);
  const fig = useRef(null);
  useEffect(() => {
    fig.current = mount(model, { stage: stageRef.current, svg: svgRef.current }, { explode: p.explode, part, turn: p.turn });
    return () => fig.current?.destroy();
  }, [model]);
  useEffect(() => { fig.current?.set(p.explode); }, [p.explode]);
  useEffect(() => { fig.current?.highlight(part); }, [part]);
  useEffect(() => { fig.current?.turn(p.turn); }, [p.turn]);

  // Drag sideways to turn: half a degree per pixel, wrapping round
  const onPointerDown = (e) => {
    e.preventDefault();
    const x0 = e.clientX, t0 = p.turn;
    const move = (ev) => dial.setValue('turn', Math.round((((t0 - (ev.clientX - x0) * 0.5) % 360) + 360) % 360));
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };

  exportRef.current = async (kind, save = false) => {
    const svg = inlineSVG(svgRef.current);
    const name = `assembly-${modelId}.${kind}`;
    let job;
    if (kind === 'svg') job = save ? download(new Blob([svg], { type: 'image/svg+xml' }), name) : copySVG(svg, name);
    else {
      const blob = toPNG(svg);
      job = save ? blob.then((b) => download(b, name)) : copyPNG(blob, name);
    }
    Promise.resolve(job).then((m) => { setStatus(m); setTimeout(() => setStatus(''), 2600); });
  };

  const dark = p.look.theme === 'dark';
  return (
    <main className="hairline-tab" style={{ background: dark ? '#08090a' : '#ffffff' }}>
      <div ref={stageRef} className="hairline-stage" data-hairline="" data-hairline-theme={p.look.theme}
           style={{ '--hairline-stroke': p.look.stroke, colorScheme: p.look.theme }}
           onPointerDown={onPointerDown}
           role="img" aria-label={`${model.name} assembly in hairline isometric, drag sideways to turn it`}>
        <svg ref={svgRef} viewBox="0 0 400 320" aria-hidden="true" />
      </div>
      <p className="reel-toast" role="status" aria-live="polite">{status}</p>
    </main>
  );
}

// The drawing styles itself with classes; a copy carries the resolved stroke and fill on
// every path so it reads the same in Figma
function inlineSVG(svg) {
  const out = svg.cloneNode(true);
  const src = svg.querySelectorAll('path'), dst = out.querySelectorAll('path');
  src.forEach((el, i) => {
    const cs = getComputedStyle(el), d = dst[i];
    if (!el.getAttribute('d')) { d.remove(); return; }
    d.removeAttribute('class');
    d.setAttribute('fill', cs.fill === 'none' ? 'none' : cs.fill);
    d.setAttribute('stroke', cs.stroke);
    d.setAttribute('stroke-width', parseFloat(cs.strokeWidth) || 0.9);
    d.setAttribute('stroke-linejoin', 'round');
    d.setAttribute('stroke-linecap', 'round');
  });
  // Crop to the drawing, with a little room
  const b = svg.getBBox(), pad = 6;
  out.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`);
  out.setAttribute('width', Math.round(b.width + pad * 2));
  out.setAttribute('height', Math.round(b.height + pad * 2));
  out.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  out.removeAttribute('aria-hidden');
  return new XMLSerializer().serializeToString(out);
}

// Transparent PNG at 4x, from the inlined SVG
function toPNG(svg, scale = 4) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width * scale; c.height = img.height * scale;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(resolve, 'image/png');
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function download(blob, name) {
  if (!blob) return 'Nothing to save';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return `Saved ${name}`;
}
