import * as THREE from 'three';
import { BOX_PAD } from './annotations.js';

// Drafting grids on the three back walls of the glass box. Each wall sits on
// the far side of the part from the camera and fades as it turns edge-on.
const AXES = ['x', 'y', 'z'];
const MAJOR_EVERY = 5;

function niceStep(size) {
  const raw = size / 12;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw);
}

// Lines in a plane spanned by u and v, centred on the origin
function planeLines(u, v, half, step) {
  const minor = [], major = [];
  const n = Math.ceil(half / step);
  for (let i = -n; i <= n; i++) {
    const out = i % MAJOR_EVERY === 0 ? major : minor;
    const o = i * step;
    out.push(...u.clone().multiplyScalar(o).addScaledVector(v, -half).toArray(),
      ...u.clone().multiplyScalar(o).addScaledVector(v, half).toArray(),
      ...v.clone().multiplyScalar(o).addScaledVector(u, -half).toArray(),
      ...v.clone().multiplyScalar(o).addScaledVector(u, half).toArray());
  }
  return { minor, major };
}

export function buildGrid(bbox, radius) {
  const size = bbox.getSize(new THREE.Vector3());
  const step = niceStep(Math.max(size.x, size.y, size.z));
  const half = radius * 8;
  const group = new THREE.Group();
  const walls = {};
  const basis = {
    x: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
    y: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
    z: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
  };
  for (const k of AXES) {
    const { minor, major } = planeLines(...basis[k], half, step);
    const wall = new THREE.Group();
    const mats = [];
    for (const [pts, weight] of [[minor, 0.45], [major, 1]]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const m = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false });
      m.userData.weight = weight;
      mats.push(m);
      wall.add(new THREE.LineSegments(g, m));
    }
    group.add(wall);
    walls[k] = { wall, mats, offset: size[k] / 2 + BOX_PAD * 1.5 };
  }
  return { group, walls };
}

// back = unit vector from the part toward the camera
export function updateGrid(grid, back, color, opacity) {
  for (const k of AXES) {
    const w = grid.walls[k];
    const facing = THREE.MathUtils.smoothstep(Math.abs(back[k]), 0.15, 0.5);
    const o = opacity * facing;
    w.wall.visible = o > 0.001;
    w.wall.position[k] = -Math.sign(back[k] || 1) * w.offset;
    w.mats.forEach((m) => { m.color.set(color); m.opacity = o * m.userData.weight; });
  }
}

export function disposeGrid(group) {
  group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
}
