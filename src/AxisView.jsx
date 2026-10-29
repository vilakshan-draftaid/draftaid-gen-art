import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useDialKitController } from 'dialkit';
import Viewer from './axis/Viewer.jsx';
import { MODELS } from './axis/models.js';
import { VIEWS, THEMES } from './axis/config.js';
import { hashSeed, mulberry32 } from './shared.js';
import { copyPNG, copySVG } from './exportGrid.js';

// Viewer from the 3D model to CAD drawing animator, without the timeline
const MODEL_NAMES = Object.keys(MODELS);
const VIEW_NAMES = Object.keys(VIEWS);
// Screen axes: X tips top to bottom, Y turns left to right, Z spins in the screen plane
const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
// Dials that follow the theme: path -> THEMES key
const THEMED = [['background', 'background'], ['edges.color', 'edges'], ['material.color', 'surface'], ['grid.color', 'grid']];

// Seeded turn in camera space: up to 180° either way about one screen axis, or all three
function turnFor(seed, axis) {
  const rand = mulberry32(hashSeed(seed || ' '));
  const q = new THREE.Quaternion();
  for (const k of AXES[axis] ? [axis] : ['X', 'Y', 'Z']) {
    const deg = (rand() < 0.5 ? -1 : 1) * (15 + rand() * 165); // at least 15° so every seed visibly moves
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...AXES[k]), THREE.MathUtils.degToRad(deg)));
  }
  return q.toArray();
}

let turnCount = 0;

export default function AxisView() {
  const [view, setView] = useState(VIEW_NAMES[0]);
  const [snapToken, setSnapToken] = useState(0);
  const [dark, setDark] = useState(false);
  const [turn, setTurn] = useState(null);
  const [viewKey, setViewKey] = useState(0);
  const [status, setStatus] = useState('');
  const ctrl = useRef(null);
  const viewerApi = useRef(null);
  const exportRef = useRef(null);

  const dials = useDialKitController('Axis view', {
    model: { type: 'select', options: MODEL_NAMES, default: MODEL_NAMES[0] },
    darkMode: false,
    background: THEMES.light.background,
    snapBack: { type: 'action', label: 'Snap back to view' },
    zoom: [1, 0.5, 3, 0.01],
    rotation: {
      seed: { type: 'text', default: 'draftaid', placeholder: 'Any word' },
      newSeed: { type: 'action', label: 'New seed' },
      axis: { type: 'select', options: ['X', 'Y', 'Z', 'Random'], default: 'Random' },
      // Iso from the other side of each axis: X from the left, Y from below, Z from the back
      mirrorX: false,
      mirrorY: false,
      mirrorZ: false,
    },
    snapshot: {
      copyPng: { type: 'action', label: 'Copy PNG' },
      copySvg: { type: 'action', label: 'Copy SVG' },
      solidFill: false,
    },
    dimensions: {
      showInIsometric: false,
      // At features: each dimension sits on the surface it measures, close to the part.
      // Glass box: each view's dimensions sit on a box face around the part
      placement: { type: 'select', options: [
        { value: 'features', label: 'At features' },
        { value: 'glass', label: 'Glass box' },
      ], default: 'features' },
      // 1 is the drawing's own spacing; lower pulls dimensions in, higher pushes them out
      distance: [1, 0.2, 3, 0.01],
      // The drafting look: no edges, no material, dimensions in every view. Your own
      // edge, material and iso settings come back when it's off
      dimensionsOnly: false,
    },
    edges: { visible: true, color: THEMES.light.edges, thickness: [1, 0.5, 3, 0.1], opacity: [1, 0, 1, 0.01] },
    material: { color: THEMES.light.surface, opacity: [1, 0, 1, 0.01] },
    grid: { visible: false, color: THEMES.light.grid, opacity: [1, 0, 1, 0.01] },
  }, {
    onAction: (action) => {
      const a = String(action);
      if (a.includes('snapBack')) setSnapToken((n) => n + 1);
      if (a.includes('newSeed')) ctrl.current?.setValue('rotation.seed', Math.random().toString(36).slice(2, 8));
      if (a.includes('copyPng')) exportRef.current?.('png');
      if (a.includes('copySvg')) exportRef.current?.('svg');
    },
  });
  ctrl.current = dials;
  const p = dials.values;

  // Each new seed resets to the selected view, then turns; the view buttons straighten it again
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setTurn({ id: ++turnCount, q: turnFor(p.rotation.seed, p.rotation.axis) });
  }, [p.rotation.seed]);

  // Dark mode swaps any color still on the other theme's default
  useEffect(() => {
    if (p.darkMode === dark) return;
    const from = THEMES[dark ? 'dark' : 'light'], to = THEMES[p.darkMode ? 'dark' : 'light'];
    for (const [path, k] of THEMED) {
      const v = path.split('.').reduce((o, s) => o[s], p);
      if (String(v).toLowerCase() === from[k]) dials.setValue(path, to[k]);
    }
    setDark(p.darkMode);
  }, [p.darkMode]);

  exportRef.current = (kind) => {
    const api = viewerApi.current;
    if (!api) return;
    const name = `axis-view-${p.model.toLowerCase().replace(/\W+/g, '-')}.${kind}`;
    let job;
    if (kind === 'svg') {
      const svg = api.svg(p.snapshot.solidFill);
      job = svg ? copySVG(svg, name) : 'Nothing to copy';
    } else {
      const blob = api.png(2);
      job = blob ? copyPNG(blob, name) : 'Nothing to copy';
    }
    Promise.resolve(job).then((m) => { setStatus(m); setTimeout(() => setStatus(''), 2600); });
  };

  return (
    <div className="axis-view" style={{ background: p.background }} data-dark={dark || undefined}>
      <Viewer
        modelSlots={[{ name: p.model, surface: 1, lines: 1 }]}
        leadModel={p.model}
        frameModel={p.model}
        viewMix={{ from: view, to: view, t: 1 }}
        viewKey={viewKey}
        turn={turn}
        zoom={p.zoom}
        edges={p.dimensions.dimensionsOnly ? { ...p.edges, visible: false } : p.edges}
        dimsInIso={p.dimensions.dimensionsOnly || p.dimensions.showInIsometric}
        dimSpread={p.dimensions.distance}
        dimPlacement={p.dimensions.placement}
        isoMirror={{ x: p.rotation.mirrorX, y: p.rotation.mirrorY, z: p.rotation.mirrorZ }}
        surface={p.dimensions.dimensionsOnly ? { ...p.material, opacity: 0 } : p.material}
        grid={p.grid}
        background={p.background}
        snapToken={snapToken}
        apiRef={viewerApi}
      />
      <nav className="axis-tabs" aria-label="Camera view">
        {VIEW_NAMES.map((n) => (
          <button key={n} aria-pressed={n === view} onClick={() => { setView(n); setViewKey((k) => k + 1); setTurn(null); }}>{VIEWS[n].tab}</button>
        ))}
      </nav>
      <p className="reel-toast" role="status" aria-live="polite">{status}</p>
    </div>
  );
}
