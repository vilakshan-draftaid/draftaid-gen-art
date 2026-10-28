import * as THREE from 'three';

// One closed mesh for a flat part with stepped holes: counterbores, countersinks,
// chamfers and blind holes, no stacked pieces (so the SVG export has no seam lines).
// Built in local (u, v, w): the outline lies in u-v, thickness runs 0..t along w.
// Each hole is { x, y, profile: [[r, w], ...] } from w = 0 (back) to w = t (front);
// r = 0 at an end means the hole is closed on that side.

const N = 40; // segments around each hole
const SEG = 48; // curve segments on the outline

const ring = (x, y, r) => Array.from({ length: N }, (_, k) => {
  const a = (k / N) * Math.PI * 2;
  return [x + r * Math.cos(a), y + r * Math.sin(a)];
});

export function plate(outline, holes, t, { basis = new THREE.Matrix4(), warp } = {}) {
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);

  // Caps: the outline with each hole at that face's radius
  for (const [w, front] of [[t, true], [0, false]]) {
    const shape = new THREE.Shape(outline.getPoints(SEG));
    for (const h of holes) {
      const r = (front ? h.profile[h.profile.length - 1] : h.profile[0])[0];
      if (r > 0) shape.holes.push(new THREE.Path(ring(h.x, h.y, r).map(([x, y]) => new THREE.Vector2(x, y))));
    }
    const g = new THREE.ShapeGeometry(shape, SEG).toNonIndexed();
    const p = g.getAttribute('position').array;
    for (let i = 0; i < p.length; i += 9) {
      const a = [p[i], p[i + 1], w], b = [p[i + 3], p[i + 4], w], c = [p[i + 6], p[i + 7], w];
      front ? tri(a, b, c) : tri(a, c, b);
    }
    g.dispose();
  }

  // Outer wall, counterclockwise so it faces out
  let pts = outline.getPoints(SEG).filter((p, i, all) => i === 0 || p.distanceTo(all[i - 1]) > 1e-6);
  if (pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  if (THREE.ShapeUtils.isClockWise(pts)) pts = pts.reverse();
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    tri([p.x, p.y, 0], [q.x, q.y, 0], [q.x, q.y, t]);
    tri([p.x, p.y, 0], [q.x, q.y, t], [p.x, p.y, t]);
  });

  // Hole walls: each profile segment revolved, facing into the hole
  for (const h of holes) {
    for (let s = 0; s < h.profile.length - 1; s++) {
      const [r0, w0] = h.profile[s], [r1, w1] = h.profile[s + 1];
      const A = ring(h.x, h.y, r0), B = ring(h.x, h.y, r1);
      for (let k = 0; k < N; k++) {
        const k1 = (k + 1) % N;
        const a0 = [...A[k], w0], a1 = [...A[k1], w0], b0 = [...B[k], w1], b1 = [...B[k1], w1];
        tri(a0, b0, b1);
        tri(a0, b1, a1);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.applyMatrix4(basis);
  if (warp) {
    const p = g.getAttribute('position'), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { warp(v.fromBufferAttribute(p, i)); p.setXYZ(i, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  return g;
}

// Hole profiles, back (w = 0) to front (w = t)
export const thru = (d, t) => [[d / 2, 0], [d / 2, t]];
export const cboreFront = (d, D, depth, t) => [[d / 2, 0], [d / 2, t - depth], [D / 2, t - depth], [D / 2, t]];
export const cboreBack = (d, D, depth, t) => [[D / 2, 0], [D / 2, depth], [d / 2, depth], [d / 2, t]];
// 90° countersink: the cone is as deep as it is wide on each side
export const cskFront = (d, D, t) => [[d / 2, 0], [d / 2, t - (D - d) / 2], [D / 2, t]];
export const cskBack = (d, D, t) => [[D / 2, 0], [d / 2, (D - d) / 2], [d / 2, t]];
export const chamferFront = (d, c, t) => [[d / 2, 0], [d / 2, t - c], [d / 2 + c, t]];
export const chamferBack = (d, c, t) => [[d / 2 + c, 0], [d / 2, c], [d / 2, t]];

// A turned part: profile [[r, x], ...] revolved around the X axis, one flat-shaded band per
// segment so steps and chamfers stay crisp. Start and end the profile at r = 0 to close it.
export function turned(profile, { y = 0, z = 0, segments = 64 } = {}) {
  const pos = [];
  const P = (r, x, a) => [x, y + r * Math.cos(a), z + r * Math.sin(a)];
  for (let s = 0; s < profile.length - 1; s++) {
    const [r0, x0] = profile[s], [r1, x1] = profile[s + 1];
    for (let k = 0; k < segments; k++) {
      const a = (k / segments) * Math.PI * 2, b = ((k + 1) / segments) * Math.PI * 2;
      const A = P(r0, x0, a), B = P(r1, x1, a), C = P(r1, x1, b), D = P(r0, x0, b);
      pos.push(...A, ...C, ...B, ...A, ...D, ...C);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
