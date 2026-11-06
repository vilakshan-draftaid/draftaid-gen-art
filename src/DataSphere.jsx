import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialKitController } from 'dialkit';
import { hashSeed, FONT } from './shared.js';
import { spherePoints, drawSphere, sphereGIF, typeStyles, labelAnchors } from './dataSphere.js';
import { copyPNG } from './exportGrid.js';

// Data types: 1 to 8, each with its own color, share of the points and clusters
const MAX_TYPES = 8;
const TYPE_COLORS = ['#00E8AD', '#FF4400', '#0050FF', '#FFD500', '#FFC8DC', '#8A4FFF', '#00B3C7', '#FFFFFF'];
const typeSlots = Object.fromEntries(TYPE_COLORS.map((color, i) => [`type${i + 1}`, {
  show: true,
  color,
  share: [1, 0, 5, 0.1],
  // This type's labels, one per line: they point at this type's densest clusters
  labels: { type: 'text', default: '', placeholder: 'One label per line' },
}]));

// A turning sphere of data points: a noise field per data type decides where its points
// cluster and where they thin out. Show picks the types to feature; the rest dim or hide.
// Exports one full turn as a seamless GIF
export default function DataSphere() {
  const ctrl = useRef(null);
  const exportRef = useRef(null);
  const [status, setStatus] = useState('');
  const dial = useDialKitController('Data sphere', {
    seed: { type: 'text', default: 'draftaid', placeholder: 'Any word' },
    shuffle: { type: 'action', label: 'New seed' },
    saveGif: { type: 'action', label: 'Save GIF' },
    copyPng: { type: 'action', label: 'Copy PNG' },
    savePng: { type: 'action', label: 'Save PNG' },
    points: {
      count: [22000, 1000, 60000, 500],
      // 0 keeps the points on the skin, 1 fills the whole ball
      depth: [0.2, 0, 1, 0.01],
      size: [1.1, 0.5, 5, 0.1],
    },
    // Where the points gather: the noise sets how likely a point is to land at each place
    clusters: {
      scale: [1.4, 0.3, 6, 0.05],
      octaves: [3, 1, 6, 1],
      clustering: [4, 0, 8, 0.1],
      spread: [0.025, 0, 0.1, 0.001],
    },
    // Every type slot always exists, so saved versions keep removed types; the panel shows the first `count`
    types: {
      count: [4, 1, MAX_TYPES, 1],
      // Own maps: each type clusters on its own noise. One map, split: one region map cut
      // into bands, one per type, so each place on the sphere belongs to one type
      layout: { type: 'select', options: [
        { value: 'own', label: 'Own maps' },
        { value: 'split', label: 'One map, split' },
      ], default: 'own' },
      regionScale: [1.2, 0.3, 6, 0.05],
      addType: { type: 'action', label: 'Add type' },
      removeType: { type: 'action', label: 'Remove type' },
      ...typeSlots,
    },
    // Types with Show off: dimmed when Dim Others is on, hidden when it's off
    highlight: {
      dimOthers: false,
      dimAmount: [0.8, 0, 1, 0.01],
      dimStyle: { type: 'select', options: [
        { value: 'color', label: 'Faded colors' },
        { value: 'grey', label: 'Grey' },
      ], default: 'color' },
    },
    // Callouts. Each type's own labels (in its Type folder) point at its clusters and follow
    // its Show and dimming; Text here holds labels for no one type, on the densest spots of
    // the shown types
    labels: {
      show: true,
      text: { type: 'text', default: 'Cluster A\nCluster B\nCluster C\nCluster D', placeholder: 'One label per line' },
      newSpots: { type: 'action', label: 'New spots' },
      // Which dense spots they take; New spots rolls it
      seed: { type: 'text', default: 'labels', placeholder: 'Any word' },
      // Color is the leader line and dot; the text and its box have their own
      color: '#FFFFFF',
      textColor: '#FFFFFF',
      box: false,
      boxColor: '#000000',
      // A type's labels can take its color, part by part
      lineInTypeColor: false,
      textInTypeColor: false,
      boxInTypeColor: false,
      size: [12, 6, 28, 0.5],
      length: [0.18, 0, 0.6, 0.01],
      shoulder: [40, 0, 160, 1],
      // How faint a label gets at the back of the sphere
      backOpacity: [0.12, 0, 1, 0.01],
    },
    motion: {
      playing: true,
      speed: [14, 0, 90, 1],
    },
    look: {
      background: '#000000',
      depthFade: [0.55, 0, 1, 0.01],
      zoom: [0.8, 0.4, 1.4, 0.01],
    },
    gif: {
      size: { type: 'select', options: ['400', '600', '800', '1080'], default: '600' },
      frames: [72, 12, 180, 1],
      seconds: [6, 1, 20, 0.5],
    },
  }, {
    id: 'data-sphere',
    persist: true,
    onAction: (a) => {
      const key = String(a).split('.').pop();
      if (key === 'shuffle') ctrl.current?.setValue('seed', Math.random().toString(36).slice(2, 8));
      if (key === 'newSpots') ctrl.current?.setValue('labels.seed', Math.random().toString(36).slice(2, 8));
      if (key === 'addType' || key === 'removeType') {
        const n = ctrl.current.values.types.count;
        ctrl.current.setValue('types.count', Math.max(1, Math.min(MAX_TYPES, n + (key === 'addType' ? 1 : -1))));
      }
      if (key === 'saveGif' || key === 'copyPng' || key === 'savePng') exportRef.current?.(key);
    },
  });
  ctrl.current = dial;
  const p = dial.values;

  const count = Math.max(1, Math.min(MAX_TYPES, p.types.count));
  const types = Array.from({ length: count }, (_, i) => p.types[`type${i + 1}`]);
  const shares = types.map((t) => t.share);
  const pts = useMemo(() => spherePoints({
    seed: hashSeed(p.seed || ' '), count: p.points.count, depth: p.points.depth, shares,
    layout: p.types.layout, regionScale: p.types.regionScale,
    scale: p.clusters.scale, octaves: p.clusters.octaves, clustering: p.clusters.clustering, spread: p.clusters.spread,
  }), [p.seed, p.points.count, p.points.depth, p.clusters.scale, p.clusters.octaves, p.clusters.clustering, p.clusters.spread, shares.join(), p.types.layout, p.types.regionScale]);

  const styles = typeStyles({
    colors: types.map((t) => t.color), shown: types.map((t) => t.show),
    dimOthers: p.highlight.dimOthers, dimAmount: p.highlight.dimAmount, dimStyle: p.highlight.dimStyle,
  });
  // Labels point at the shown types' clusters (all types' when none is shown)
  const lines = (t) => (t || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const texts = lines(p.labels.text);
  const typeTexts = types.map((t) => lines(t.labels));
  const shownIds = types.map((t, i) => (t.show ? i : -1)).filter((i) => i >= 0);
  // Each type's labels take spots in its own clusters first, then the general ones keep
  // clear of them
  const anchors = useMemo(() => {
    const seed = (k) => hashSeed(`${p.seed}|${p.labels.seed}|${k}`), taken = [];
    const own = typeTexts.map((list, i) => {
      const at = labelAnchors(pts, { count: list.length, seed: seed(i), types: [i], taken });
      taken.push(...at);
      return at;
    });
    return { own, general: labelAnchors(pts, { count: texts.length, seed: seed('all'), types: shownIds, taken }) };
  }, [pts, texts.length, typeTexts.map((l) => l.length).join(), p.seed, p.labels.seed, shownIds.join()]);
  // A type's labels follow its points: hidden with them, dimmed with them
  const L = p.labels;
  const typeItems = typeTexts.flatMap((list, i) => {
    const st = styles[i];
    if (!st) return [];
    return list.map((text, k) => ({
      text, p: anchors.own[i]?.[k], alpha: st.alpha,
      ...(L.lineInTypeColor && { color: st.color }),
      ...(L.textInTypeColor && { textColor: st.color }),
      ...(L.boxInTypeColor && { boxColor: st.color }),
    })).filter((it) => it.p);
  });
  const labels = L.show ? {
    items: [...anchors.general.map((pt, i) => ({ text: texts[i], p: pt })), ...typeItems],
    color: p.labels.color, textColor: p.labels.textColor, box: p.labels.box, boxColor: p.labels.boxColor, size: p.labels.size, length: p.labels.length, shoulder: p.labels.shoulder,
    minOpacity: p.labels.backOpacity, font: FONT,
  } : null;
  const look = { size: p.points.size, styles, background: p.look.background, depthFade: p.look.depthFade, zoom: p.look.zoom, labels };
  const live = useRef({});
  live.current = { pts, look, playing: p.motion.playing, speed: p.motion.speed };

  // Draws every frame while playing, and on any change while paused
  const canvasRef = useRef(null);
  const angle = useRef(0);
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas.getContext('2d');
    let raf = 0, prev = performance.now();
    const frame = (now) => {
      const L = live.current, dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (L.playing) angle.current = (angle.current + (L.speed * Math.PI / 180) * dt) % (Math.PI * 2);
      const dpr = Math.min(2, devicePixelRatio), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      drawSphere(ctx, w, h, L.pts, { ...L.look, angle: angle.current });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const busy = useRef(false);
  exportRef.current = async (key) => {
    const name = `data-sphere-${p.seed || 'seed'}`;
    const note = (m) => { setStatus(m); setTimeout(() => setStatus(''), 2600); };
    if (key === 'saveGif') {
      if (busy.current) return;
      busy.current = true;
      try {
        const blob = await sphereGIF(pts, look, { size: Number(p.gif.size), frames: p.gif.frames, seconds: p.gif.seconds },
          (i, n) => setStatus(`Making GIF ${i}/${n}`));
        note(download(blob, `${name}.gif`));
      } finally { busy.current = false; }
      return;
    }
    // A square frame at the GIF's size, at the angle on screen now
    const size = Number(p.gif.size), c = document.createElement('canvas');
    c.width = c.height = size;
    drawSphere(c.getContext('2d'), size, size, pts, { ...look, angle: angle.current });
    const blob = new Promise((r) => c.toBlob(r, 'image/png'));
    note(await (key === 'savePng' ? blob.then((b) => download(b, `${name}.png`)) : copyPNG(blob, `${name}.png`)));
  };

  return (
    <main className="sphere-stage" style={{ background: p.look.background }}>
      <TypeRows count={count} />
      <canvas ref={canvasRef} role="img" aria-label="A turning sphere of data points, gathered in clusters in some places and spread thin in others" />
      <p className="reel-toast" role="status" aria-live="polite">{status}</p>
    </main>
  );
}

// Hides the type folders past the count (DialKit has no hidden controls, so a style does it)
function TypeRows({ count }) {
  const rules = Array.from({ length: MAX_TYPES - count }, (_, i) =>
    `.dialkit-folder:has(> .dialkit-folder-header [aria-label="Type${count + i + 1}"])`);
  return rules.length ? <style>{`${rules.join(',\n')} { display: none; }`}</style> : null;
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
