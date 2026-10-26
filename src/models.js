import * as THREE from 'three';

const extrude = (shape, depth) =>
  new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
const hole = (x, y, r) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, Math.PI * 2, true); return p; };

// Slab lying flat: shape drawn in (x, depth-from-back), extruded upward by t
function flat(shape, t) {
  const g = extrude(shape, t);
  g.rotateX(Math.PI / 2);
  g.translate(0, t, 0);
  return g;
}
// Plate standing on the x axis: shape drawn in (depth-from-back, y), extruded across x
function side(shape, t, x0) {
  const g = extrude(shape, t);
  g.rotateY(-Math.PI / 2);
  g.translate(x0 + t, 0, 0);
  return g;
}

// Drawing 13: pillow block bracket
function bracket() {
  const base = new THREE.Shape();
  base.moveTo(-41, 0); base.lineTo(41, 0); base.lineTo(41, 24);
  base.absarc(27, 24, 14, 0, Math.PI / 2, false);
  base.lineTo(-27, 38);
  base.absarc(-27, 24, 14, Math.PI / 2, Math.PI, false);
  base.closePath();
  base.holes.push(hole(-27, 24, 5), hole(27, 24, 5));

  // upright with tangent lines into the R19 boss
  const cx = 0, cy = 58, r = 19, px = 41, py = 10;
  const d = Math.hypot(px - cx, py - cy);
  const a = Math.atan2(py - cy, px - cx) + Math.acos(r / d);
  const up = new THREE.Shape();
  up.moveTo(-41, 10); up.lineTo(41, 10);
  up.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  up.absarc(cx, cy, r, a, Math.PI - a, false);
  up.closePath();
  up.holes.push(hole(0, 58, 11));
  const upright = extrude(up, 12);

  const rib = new THREE.Shape();
  rib.moveTo(12, 10); rib.lineTo(36, 10); rib.lineTo(12, 40); rib.closePath();

  return [flat(base, 10), upright, side(rib, 10, -5)];
}

// Drawing 54: angle gusset
function gusset() {
  const W = 127, t = 12.7, h = W / 2;
  const base = new THREE.Shape();
  base.moveTo(-h, 0); base.lineTo(h, 0); base.lineTo(h, W); base.lineTo(-h, W); base.closePath();
  base.holes.push(hole(-25.4, 101.6, 6.35), hole(25.4, 101.6, 6.35));

  const wall = new THREE.Shape();
  wall.moveTo(-h, 0); wall.lineTo(h, 0); wall.lineTo(h, W); wall.lineTo(-h, W); wall.closePath();
  wall.holes.push(hole(-25.4, 88.9, 6.35), hole(25.4, 88.9, 6.35));

  const tri = new THREE.Shape();
  tri.moveTo(0, 0); tri.lineTo(W, 0); tri.lineTo(W, t); tri.lineTo(0, W); tri.closePath();

  return [flat(base, t), extrude(wall, t), side(tri, t, -h), side(tri, t, h - t)];
}

export function buildModel(name) {
  const geos = name === 'gusset' ? gusset() : bracket();
  const merged = new THREE.Group();
  const mat = new THREE.MeshNormalMaterial({ flatShading: true, side: THREE.DoubleSide });
  geos.forEach((g) => merged.add(new THREE.Mesh(g, mat)));
  const box = new THREE.Box3().setFromObject(merged);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const k = 1.5 / Math.max(s.x, s.y, s.z);
  merged.children.forEach((m) => { m.geometry.translate(-c.x, -c.y, -c.z); m.geometry.scale(k, k, k); });
  return merged;
}
