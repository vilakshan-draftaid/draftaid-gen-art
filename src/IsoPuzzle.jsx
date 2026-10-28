import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useDialKitController } from 'dialkit';

import { hashSeed } from './shared.js';
import { isoPieces, pieceGeometry } from './isoPuzzle.js';
import { vectorSnapshot } from './axis/vector.js';
import { copySVG, copyPNG } from './exportGrid.js';
import { LOGOS } from './integrations.js';

// Brand colors for a supported integration's piece
const BRAND = { inventor: '#DBAE03', solidworks: '#E2231A', onshape: '#00A6E0', creo: '#68BF4B', catia: '#005386', solidEdge: '#E5004C', siemensNx: '#009999', fusion360: '#F68C1F' };
const DEFAULT_PLACEMENTS = JSON.stringify(Object.fromEntries(LOGOS.slice(0, 6).map((l, i) => [i, l.id])));
// Logo textures, loaded once and shared
const textures = new Map();
function logoTexture(src, onLoad) {
  if (!textures.has(src)) {
    const t = new THREE.TextureLoader().load(src, onLoad);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    textures.set(src, t);
  }
  return textures.get(src);
}

// Isometric 3D puzzle pieces, fine lines and flat faces in three looks:
// Line only (white faces), Tonal mono (one hue, a shade per face direction) and
// Mono + accent (grey pieces with a few in the accent hue)
const ISO_ELEVATION = Math.atan(1 / Math.SQRT2); // true isometric

// Top, left and right face colors from one base color
function shades(hex, look) {
  const c = new THREE.Color(hex), hsl = {};
  c.getHSL(hsl);
  // Greys stay grey: only colors that already have a hue get richer as they darken
  const at = (ds, dl) => `#${new THREE.Color().setHSL(hsl.h, hsl.s < 0.03 ? hsl.s : Math.min(1, hsl.s + ds), Math.max(0, Math.min(1, hsl.l + dl))).getHexString()}`;
  if (look === 'line') return [hex, at(0, -0.04), at(0, -0.09)];
  return [hex, at(0.04, -0.1), at(0.1, -0.2)];
}

export default function IsoPuzzle() {
  const ctrl = useRef(null);
  const [status, setStatus] = useState('');
  const exportRef = useRef(null);
  const dial = useDialKitController('Iso puzzle', {
    seed: { type: 'text', default: 'draftaid', placeholder: 'Any word' },
    shuffle: { type: 'action', label: 'New seed' },
    exportSvg: { type: 'action', label: 'Copy SVG' },
    exportPng: { type: 'action', label: 'Copy PNG' },
    pieces: {
      columns: [3, 1, 8, 1],
      rows: [2, 1, 8, 1],
      tabShape: { type: 'select', options: [
        { value: 'square', label: 'Square' },
        { value: 'round', label: 'Round' },
      ], default: 'square' },
      tabWidth: [0.3, 0.1, 0.5, 0.01],
      tabDepth: [0.2, 0.05, 0.35, 0.01],
      height: [0.6, 0.05, 3, 0.01],
      heightVariation: [0.5, 0, 1, 0.01],
    },
    look: {
      style: { type: 'select', options: [
        { value: 'line', label: 'Line only' },
        { value: 'tonal', label: 'Tonal mono' },
        { value: 'accent', label: 'Mono + accent' },
      ], default: 'line' },
      lines: true,
      lineColor: '#1A1A1A',
      lineWidth: [1, 0.5, 3, 0.1],
      faceColor: '#FFFFFF',
      tonalColor: '#F6B9A2',
      accentColor: '#6E3BF5',
      accentPieces: [1, 0, 16, 1],
      background: '#FFFFFF',
    },
    // CAD logos on the pieces: pick one in Place Logo, then click a piece
    logos: {
      placeLogo: { type: 'select', options: [...LOGOS.map((l) => ({ value: l.id, label: l.label })), { value: 'none', label: 'Clear a piece' }], default: 'inventor' },
      placements: { type: 'text', default: DEFAULT_PLACEMENTS },
      size: [0.6, 0.2, 0.9, 0.01],
      supportedLogo: '#FFFFFF',
      comingSoonPiece: '#C8C8C8',
      comingSoonLogo: '#FFFFFF',
    },
    // Supported integrations get their brand color; the rest are greyed out
    supported: Object.fromEntries(LOGOS.map((l) => [l.id, l.available])),
    brandColors: { ...BRAND },
    view: {
      turn: [45, 0, 360, 1],
      zoom: [1, 0.4, 2.5, 0.01],
    },
  }, {
    id: 'iso-puzzle',
    persist: true,
    onAction: (a) => {
      const key = String(a).split('.').pop();
      if (key === 'shuffle') ctrl.current?.setValue('seed', Math.random().toString(36).slice(2, 8));
      if (key === 'exportSvg' || key === 'exportPng') exportRef.current?.(key === 'exportSvg' ? 'svg' : 'png');
    },
  });
  ctrl.current = dial;
  const p = dial.values;

  const hostRef = useRef(null);
  const three = useRef(null);

  // Renderer, camera and scene, made once
  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    hostRef.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const part = new THREE.Group();
    scene.add(part);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    three.current = { renderer, scene, part, camera, size: [1, 1], fit: 1 };
    const ro = new ResizeObserver(() => {
      const w = hostRef.current.clientWidth, h = hostRef.current.clientHeight;
      three.current.size = [w, h];
      renderer.setSize(w, h);
      three.current.draw?.();
    });
    ro.observe(hostRef.current);
    return () => { ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); };
  }, []);

  // Rebuild the pieces and redraw whenever a setting changes
  useEffect(() => {
    const T = three.current;
    if (!T) return;
    const { part } = T;
    part.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    part.clear();

    const look = p.look.style;
    const base = look === 'tonal' ? p.look.tonalColor : look === 'accent' ? '#E6E6E6' : p.look.faceColor;
    const mono = shades(base, look === 'line' ? 'line' : 'tonal');
    const accent = shades(p.look.accentColor, 'tonal');
    const pieces = isoPieces({
      cols: p.pieces.columns, rows: p.pieces.rows, seed: hashSeed(p.seed || ' '),
      height: p.pieces.height, variation: p.pieces.heightVariation, accent: look === 'accent' ? p.look.accentPieces : 0,
    });
    const opts = { tab: p.pieces.tabWidth, depth: p.pieces.tabDepth, round: p.pieces.tabShape === 'round' };
    let placements = {};
    try { placements = JSON.parse(p.logos.placements || '{}'); } catch { /* keep none */ }

    // Face color from the normal as seen by the camera: up faces, then left or right
    const right = new THREE.Vector3();
    const pickShade = (set, n) => {
      if (n.y > 0.5) return set[0];
      return n.dot(right) < 0 ? set[1] : set[2];
    };
    pieces.forEach((pc, index) => {
      const g = pieceGeometry(pc, opts);
      const logo = LOGOS.find((l) => l.id === placements[index]);
      const on = logo && p.supported?.[logo.id];
      // A logo's piece: its brand color when supported, greyed out when coming soon
      const set = logo ? shades(on ? p.brandColors?.[logo.id] ?? BRAND[logo.id] : p.logos.comingSoonPiece, 'tonal') : pc.accent ? accent : mono;
      const mat = new THREE.ShaderMaterial({
        uniforms: { top: { value: new THREE.Color(set[0]) }, left: { value: new THREE.Color(set[1]) }, right: { value: new THREE.Color(set[2]) }, rightDir: { value: right } },
        vertexShader: 'varying vec3 vN; void main() { vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 left; uniform vec3 right; uniform vec3 rightDir; varying vec3 vN; void main() { vec3 n = normalize(vN); vec3 c = n.y > 0.5 ? top : (dot(n, rightDir) < 0.0 ? left : right); gl_FragColor = vec4(c, 1.0);\n#include <colorspace_fragment>\n}',
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.userData.shade = (n) => pickShade(set, n);
      mesh.userData.index = index;
      part.add(mesh);
      if (p.look.lines) {
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), new THREE.LineBasicMaterial({ color: p.look.lineColor }));
        lines.userData.isLine = true;
        part.add(lines);
      }
      if (logo) {
        // Flat on the top face, reading along the X edge; fits the piece with room for its tabs
        let w = p.logos.size, h = w / logo.aspect;
        if (h > 0.5) { h = 0.5; w = h * logo.aspect; }
        const plane = new THREE.PlaneGeometry(w, h);
        plane.rotateX(-Math.PI / 2);
        plane.translate(pc.c + 0.5, pc.height + 0.002, pc.r + 0.5);
        const lm = new THREE.MeshBasicMaterial({
          map: logoTexture(logo.src, () => T.draw?.()), color: on ? p.logos.supportedLogo : p.logos.comingSoonLogo,
          transparent: true, depthWrite: false, alphaTest: 0.05,
        });
        const lp = new THREE.Mesh(plane, lm);
        lp.userData.isLine = true; // not part of the solid, so the SVG faces skip it
        lp.userData.logo = { logo, color: lm.color.getStyle(), w, h };
        part.add(lp);
      }
    });

    // Pieces are built 1 unit wide; drawn at 100 so they're mm-sized like the Axis view
    // parts, which the SVG export's depth tolerance expects
    part.scale.setScalar(100);
    part.position.set(0, 0, 0);
    part.updateMatrixWorld();
    // Center the board and frame it from the iso angle
    const box = new THREE.Box3().setFromObject(part);
    const center = box.getCenter(new THREE.Vector3());
    part.position.sub(new THREE.Vector3(center.x, 0, center.z));
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const az = THREE.MathUtils.degToRad(p.view.turn);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(ISO_ELEVATION), Math.sin(ISO_ELEVATION), Math.cos(az) * Math.cos(ISO_ELEVATION));
    T.camera.position.copy(dir.multiplyScalar(radius * 4)).add(new THREE.Vector3(0, center.y * 0.5, 0));
    T.camera.lookAt(0, center.y * 0.5, 0);
    T.camera.updateMatrixWorld();
    right.set(1, 0, 0).applyQuaternion(T.camera.quaternion);
    T.fit = radius * 1.15 / p.view.zoom;
    T.camera.near = 0.01; T.camera.far = radius * 10;

    T.draw = () => {
      const [w, h] = T.size, aspect = w / Math.max(1, h);
      const half = T.fit;
      Object.assign(T.camera, aspect >= 1 ? { left: -half * aspect, right: half * aspect, top: half, bottom: -half } : { left: -half, right: half, top: half / aspect, bottom: -half / aspect });
      T.camera.updateProjectionMatrix();
      T.renderer.setClearColor(0x000000, 0);
      T.renderer.render(T.scene, T.camera);
    };
    T.draw();
  }, [JSON.stringify(p.pieces), JSON.stringify(p.look), JSON.stringify(p.view), JSON.stringify(p.logos), JSON.stringify(p.supported), JSON.stringify(p.brandColors), p.seed]);

  // Click a piece to put the chosen logo on it (a logo lives on one piece at a time)
  const onClick = (e) => {
    const T = three.current;
    if (!T) return;
    const box = T.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1), T.camera);
    const hit = ray.intersectObjects(T.part.children.filter((o) => o.userData.index !== undefined))[0];
    if (!hit) return;
    let placements = {};
    try { placements = JSON.parse(p.logos.placements || '{}'); } catch { /* start fresh */ }
    const id = p.logos.placeLogo, index = hit.object.userData.index;
    for (const k of Object.keys(placements)) if (placements[k] === id) delete placements[k];
    if (id === 'none') delete placements[index]; else placements[index] = id;
    dial.setValue('logos.placements', JSON.stringify(placements));
  };

  exportRef.current = async (kind) => {
    const T = three.current;
    if (!T) return;
    const name = `iso-puzzle-${p.seed || 'seed'}.${kind}`;
    let job;
    if (kind === 'png') {
      T.draw();
      job = copyPNG(cropPNG(T.renderer.domElement), name);
    } else {
      const [w, h] = T.size;
      let svg = vectorSnapshot({
        renderer: T.renderer, scene: T.scene, camera: T.camera, w, h,
        lead: { part: { traverse: (fn) => T.part.traverse((o) => { if (!o.userData.isLine) fn(o); }) }, anno: { sets: {} } },
        faces: { color: new THREE.Color('#ffffff'), opacity: 1 },
        edges: { visible: p.look.lines, color: p.look.lineColor, thickness: p.look.lineWidth, opacity: 1 },
        transparent: true,
      });
      if (svg) svg = svg.replace(/<\/svg>\s*$/, `${await logosSVG(T, w, h)}</svg>`);
      T.draw();
      job = svg ? copySVG(svg, name) : 'Nothing to copy';
    }
    Promise.resolve(job).then((m) => { setStatus(m); setTimeout(() => setStatus(''), 2600); });
  };

  return (
    <main className="iso-stage" style={{ background: p.look.background }}>
      <div ref={hostRef} className="iso-host" role="img" aria-label="Isometric 3D puzzle pieces connecting together, with CAD logos on them" onClick={onClick} />
      <p className="reel-toast" role="status" aria-live="polite">{status}</p>
    </main>
  );
}

// Transparent PNG cropped to the pieces
function cropPNG(canvas, pad = 24) {
  const w = canvas.width, h = canvas.height;
  const read = document.createElement('canvas');
  read.width = w; read.height = h;
  const rc = read.getContext('2d');
  rc.drawImage(canvas, 0, 0);
  const data = rc.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return Promise.resolve(null);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(read, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return new Promise((res) => out.toBlob(res, 'image/png'));
}

// Logos for the SVG: each top-face plane becomes its artwork masking a color, mapped onto
// the plane's screen corners with one affine transform (the camera is orthographic)
async function logosSVG(T, w, h) {
  const out = ['<g id="Logos">'];
  const v = new THREE.Vector3();
  const screen = (x, y, z, m) => { v.set(x, y, z).applyMatrix4(m).project(T.camera); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]; };
  let k = 0;
  for (const o of T.part.children) {
    const info = o.userData.logo;
    if (!info) continue;
    const pos = o.geometry.getAttribute('position');
    // PlaneGeometry corners: 0 top-left, 1 top-right, 2 bottom-left
    const [p0, p1, p2] = [0, 1, 2].map((i) => screen(pos.getX(i), pos.getY(i), pos.getZ(i), o.matrixWorld));
    const m = [p1[0] - p0[0], p1[1] - p0[1], p2[0] - p0[0], p2[1] - p0[1], p0[0], p0[1]].map((n) => Math.round(n * 1000) / 1000);
    const href = await toDataURL(info.logo.src);
    const id = `logo-${k++}`;
    out.push(`<g id="${info.logo.label}" transform="matrix(${m.join(' ')})">`,
      `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1" height="1" style="mask-type:alpha"><image width="1" height="1" preserveAspectRatio="none" href="${href}"/></mask>`,
      `<rect width="1" height="1" fill="${info.color}" mask="url(#${id})"/></g>`);
  }
  out.push('</g>');
  return out.join('\n');
}
async function toDataURL(src) {
  if (src.startsWith('data:')) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
}
