// Shared by the Hairline assemblies: the kernel, plus solids lying along x or y.
// The kernel only stands solids straight up, so these are built the way rule 09
// builds a tapered solid: the hull of the two end rings, one crease on the near end
import kernel from './kernel.js?raw';

// The kernel is used unchanged: it defines HL, which we take out of it
export const HL = new Function(`${kernel}\nreturn HL;`)();
const { proj, facing, run, hull, poly, open, circ } = HL;

// A closed outline in a plane, as kernel ring samples with outward normals
export function toRing(pts) {
  let area = 0;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; });
  const s = area > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
    const du = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(du, dv) || 1;
    return { u: p[0], v: p[1], nu: (s * dv) / l, nv: (-s * du) / l };
  });
}
export const inset = (ring, b) => ring.map((q) => ({ ...q, u: q.u - q.nu * b, v: q.v - q.nv * b }));

// Projection helpers for one camera. V points from the drawing toward the viewer
export function tools(C) {
  const P = proj(C), front = facing(C);
  const zf = Math.sqrt(1 - C.k * C.k), V = [Math.sin(C.az) * zf, Math.cos(C.az) * zf, C.k];
  const onX = (ring, x, dz = 0) => ring.map((q) => P(x, q.u, q.v + dz));
  const onY = (ring, y) => ring.map((q) => P(q.u, y, q.v));
  const frontX = (q) => q.nu * V[1] + q.nv * V[2] >= -1e-6;
  const frontY = (q) => q.nu * V[0] + q.nv * V[2] >= -1e-6;
  return {
    P, front, V, onX,
    depth: (x, y, z) => x * V[0] + y * V[1] + z * V[2],
    // Lying along x: ring in y-z, from x0 to x1; the crease goes on whichever end faces the viewer
    xSolid: (ring, inner, x0, x1, dz = 0) => ({
      sil: poly(hull(onX(ring, x0, dz).concat(onX(ring, x1, dz)))),
      crease: open(onX(run(inner, frontX), V[0] >= 0 ? x1 : x0, dz)),
    }),
    // Lying along y: ring in x-z, from y0 to y1
    ySolid: (ring, inner, y0, y1) => ({
      sil: poly(hull(onY(ring, y0).concat(onY(ring, y1)))),
      crease: open(onY(run(inner, frontY), V[1] >= 0 ? y1 : y0)),
    }),
    // A ring on a face that looks along x, centred at (y, z)
    ringX: (x, y, z, r, n = 40) => poly(circ(r, n).map((q) => P(x, y + q.u, z + q.v))),
    // A ring or outline lying on a top face at height z
    onTop: (ring, z, dx = 0, dy = 0) => poly(ring.map((q) => P(q.u + dx, q.v + dy, z))),
  };
}

