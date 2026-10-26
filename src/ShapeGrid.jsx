import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useDialKitController } from 'dialkit';
import { usePaletteSync } from './usePaletteSync.js';
import { ARTICLE, GDT, SYMBOL_PICK, hashSeed, mulberry32, FONT } from './shared.js';
import { buildModel } from './models.js';

const LIGHT = new THREE.Vector3(0.45, 0.75, 0.5).normalize();

export default function ShapeGrid() {
  const dial = useDialKitController('Pixel shape', {
    shape: { type: 'select', options: [
      { value: 'bracket', label: 'Drawing 13 bracket' },
      { value: 'gusset', label: 'Drawing 54 gusset' },
    ], default: 'bracket' },
    pixels: {
      pixelSize: [16, 3, 80, 1],
      canvasSize: [640, 240, 1200, 10],
      gap: [0, 0, 6, 0.5],
      zoom: [1, 0.4, 2.5, 0.01],
    },
    motion: {
      rotate: true,
      speed: [0.4, -2, 2, 0.01],
      angle: [35, 0, 360, 1],
      tilt: [25, -90, 90, 1],
    },
    symbols: {
      show: true,
      seed: { type: 'text', default: 'draftaid', placeholder: 'Any word' },
      set: { type: 'select', options: [
        { value: 'article', label: 'Guide symbols' },
        { value: 'all', label: 'Guide + GD&T' },
      ], default: 'article' },
      use: { type: 'select', options: SYMBOL_PICK, default: 'mix' },
      size: [0.55, 0.2, 0.9, 0.01],
      weight: { type: 'select', options: ['400', '700', '900'], default: '700' },
      ink: '#0A0A0A',
    },
    empty: {
      style: { type: 'select', options: [
        { value: 'blank', label: 'Blank' },
        { value: 'circles', label: 'Circles' },
      ], default: 'blank' },
      circleSize: [0.35, 0.1, 1, 0.01],
      circleColor: '#3DBE5A',
    },
    color: {
      palette: { type: 'select', options: [
        { value: 'plot', label: 'Plot' },
        { value: 'draftaid', label: 'Draftaid' },
        { value: 'custom', label: 'Custom' },
      ], default: 'plot' },
      c1: '#3E8EDE', c2: '#F5C518', c3: '#3DBE5A', c4: '#8FD694',
      background: '#FFFFFF',
    },
  }, { id: 'pixel-shape', persist: true });

  const p = dial.values;
  const palette = usePaletteSync(dial);
  const live = useRef(p);
  live.current = { ...p, colors: palette };
  const canvasRef = useRef(null);

  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    cam.position.set(0, 0, 5);
    const pivot = new THREE.Group();
    scene.add(pivot);
    const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });

    let model = null, modelName = '', buf = new Uint8Array(4), res = 0;
    let symbols = [], symKey = '';
    let spin = 0, last = performance.now(), raf = 0;
    const n = new THREE.Vector3();
    const ctx = canvasRef.current.getContext('2d');

    const frame = (now) => {
      const v = live.current;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (v.motion.rotate && !reduce) spin += dt * v.motion.speed;

      if (v.shape !== modelName) {
        if (model) { pivot.remove(model); model.children.forEach((m) => m.geometry.dispose()); }
        model = buildModel(v.shape); modelName = v.shape; pivot.add(model);
      }

      const size = Math.min(v.pixels.canvasSize, window.innerWidth - 32, window.innerHeight - 96);
      const nextRes = Math.max(4, Math.floor(size / v.pixels.pixelSize));
      if (nextRes !== res) { res = nextRes; rt.setSize(res, res); buf = new Uint8Array(res * res * 4); }
      const cell = size / res;

      const key = `${v.symbols.seed}|${v.symbols.set}|${res}`;
      if (key !== symKey) {
        const rand = mulberry32(hashSeed(v.symbols.seed || ' '));
        const set = v.symbols.set === 'all' ? [...ARTICLE, ...GDT] : ARTICLE;
        symbols = Array.from({ length: res * res }, () => set[Math.floor(rand() * set.length)]);
        symKey = key;
      }

      pivot.rotation.set(THREE.MathUtils.degToRad(v.motion.tilt), THREE.MathUtils.degToRad(v.motion.angle) + spin, 0);
      cam.zoom = v.pixels.zoom; cam.updateProjectionMatrix();
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, res, res, buf);
      renderer.setRenderTarget(null);

      const dpr = window.devicePixelRatio || 1;
      const cv = canvasRef.current;
      if (cv.width !== Math.round(size * dpr)) {
        cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
        cv.style.width = `${size}px`; cv.style.height = `${size}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = v.color.background;
      ctx.fillRect(0, 0, size, size);

      const colors = v.colors;
      const g = v.pixels.gap, inner = Math.max(0.5, cell - g);
      const showText = v.symbols.show && inner >= 9;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${v.symbols.weight} ${inner * v.symbols.size}px ${FONT}`;

      for (let row = 0; row < res; row++) {
        for (let col = 0; col < res; col++) {
          const i = ((res - 1 - row) * res + col) * 4; // GL rows start at the bottom
          const x = col * cell + g / 2, y = row * cell + g / 2;
          if (buf[i + 3] < 128) {
            if (v.empty.style === 'circles') {
              ctx.fillStyle = v.empty.circleColor;
              ctx.beginPath();
              ctx.arc(x + inner / 2, y + inner / 2, (inner / 2) * v.empty.circleSize, 0, Math.PI * 2);
              ctx.fill();
            }
            continue;
          }
          n.set(buf[i] / 127.5 - 1, buf[i + 1] / 127.5 - 1, buf[i + 2] / 127.5 - 1).normalize();
          const shade = Math.max(0, n.dot(LIGHT));
          ctx.fillStyle = colors[Math.min(3, Math.floor(shade * 4))];
          ctx.fillRect(x, y, inner, inner);
          if (showText) {
            ctx.fillStyle = v.symbols.ink;
            ctx.fillText(v.symbols.use === 'mix' ? symbols[row * res + col] : v.symbols.use, x + inner / 2, y + inner / 2 + inner * 0.03);
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      rt.dispose(); renderer.dispose();
      if (model) model.children.forEach((m) => m.geometry.dispose());
    };
  }, []);

  return (
    <main className="stage" style={{ background: p.color.background }}>
      <canvas ref={canvasRef} role="img" aria-label="Rotating CAD part drawn as a grid of symbol pixels" />
    </main>
  );
}
