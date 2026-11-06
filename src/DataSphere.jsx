import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialKitController } from 'dialkit';
import { hashSeed } from './shared.js';
import { spherePoints, drawSphere, sphereGIF } from './dataSphere.js';
import { copyPNG } from './exportGrid.js';

// A turning sphere of data points: a noise field decides where they cluster and where
// they thin out. Exports one full turn as a seamless GIF
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
      spread: [0.04, 0, 1, 0.01],
    },
    motion: {
      playing: true,
      speed: [14, 0, 90, 1],
    },
    look: {
      pointColor: '#FFFFFF',
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
      if (key === 'saveGif' || key === 'copyPng' || key === 'savePng') exportRef.current?.(key);
    },
  });
  ctrl.current = dial;
  const p = dial.values;

  const pts = useMemo(() => spherePoints({
    seed: hashSeed(p.seed || ' '), count: p.points.count, depth: p.points.depth,
    scale: p.clusters.scale, octaves: p.clusters.octaves, clustering: p.clusters.clustering, spread: p.clusters.spread,
  }), [p.seed, p.points.count, p.points.depth, p.clusters.scale, p.clusters.octaves, p.clusters.clustering, p.clusters.spread]);

  const look = { size: p.points.size, color: p.look.pointColor, background: p.look.background, depthFade: p.look.depthFade, zoom: p.look.zoom };
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
      <canvas ref={canvasRef} role="img" aria-label="A turning sphere of data points, gathered in clusters in some places and spread thin in others" />
      <p className="reel-toast" role="status" aria-live="polite">{status}</p>
    </main>
  );
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
