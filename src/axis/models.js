import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { plate, thru, cboreFront, cboreBack, cskFront, cskBack, chamferFront, chamferBack } from './plate.js';

// All dimensions in mm, taken from the reference drawings. Y is up.
const SEG = 48;
const { PI } = Math;

const opts = (depth) => ({ depth, bevelEnabled: false, curveSegments: SEG });

// Shape (u = x, v = z) extruded upward from y0 to y1
function extrudeY(shape, y0, y1) {
  const g = new THREE.ExtrudeGeometry(shape, opts(y1 - y0));
  g.rotateX(PI / 2);
  g.translate(0, y1, 0);
  return g;
}
// Shape (u = z, v = y) extruded along x from x0 to x1
function extrudeX(shape, x0, x1) {
  const g = new THREE.ExtrudeGeometry(shape, opts(x1 - x0));
  g.rotateY(-PI / 2);
  g.translate(x1, 0, 0);
  return g;
}
// Shape (u = x, v = y) extruded along z from z0 to z1
function extrudeZ(shape, z0, z1) {
  const g = new THREE.ExtrudeGeometry(shape, opts(z1 - z0));
  g.translate(0, 0, z0);
  return g;
}

const poly = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));

// Rectangle with per-corner radii [x0y0, x1y0, x1y1, x0y1]
function rrect(x0, y0, x1, y1, r = 0) {
  const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
  const s = new THREE.Shape();
  s.moveTo(x0 + a, y0);
  s.lineTo(x1 - b, y0);
  if (b) s.absarc(x1 - b, y0 + b, b, -PI / 2, 0, false);
  s.lineTo(x1, y1 - c);
  if (c) s.absarc(x1 - c, y1 - c, c, 0, PI / 2, false);
  s.lineTo(x0 + d, y1);
  if (d) s.absarc(x0 + d, y1 - d, d, PI / 2, PI, false);
  s.lineTo(x0, y0 + a);
  if (a) s.absarc(x0 + a, y0 + a, a, PI, PI * 1.5, false);
  return s;
}

function hole(shape, cx, cy, r) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, PI * 2, true);
  shape.holes.push(p);
  return shape;
}

// Dimension helpers. view = which axis view shows it, axis = what it measures,
// at = where the dimension line sits along the other in-plane axis (mm).
const lin = (view, axis, a, b, at, text) => ({ type: 'linear', view, axis, a, b, at, text });
const leader = (view, c, r, angle, text, o = {}) => ({ type: 'leader', view, c, r, angle, text, ...o });
const cross = (view, c, r) => ({ type: 'cross', view, c, r });
const center = (view, a, b) => ({ type: 'center', view, a, b });
const hidden = (view, a, b) => ({ type: 'hidden', view, a, b });

// Drawing 54: gusseted angle bracket
function gussetBracket() {
  const L = 127, T = 12.7, R = 6.35, C = L / 2;
  const plate = poly([[0, 0], [L, 0], [L, T], [T, L], [0, L]]);

  const base = rrect(T, T, L, L - T);
  hole(base, 101.6, C - 25.4, R);
  hole(base, 101.6, C + 25.4, R);

  const wall = rrect(T, 0, L - T, L);
  hole(wall, C - 25.4, 88.9, R);
  hole(wall, C + 25.4, 88.9, R);

  const parts = [
    extrudeZ(plate, 0, T),
    extrudeZ(plate, L - T, L),
    extrudeY(base, 0, T),
    extrudeX(wall, 0, T),
  ];

  const dims = [
    // Y: top view
    lin('y', 'x', [0, 0, L], [L, 0, L], L + 30, '127'),
    lin('y', 'x', [0, 0, L], [101.6, 0, C + 25.4], L + 16, '101.6'),
    lin('y', 'z', [L, 0, 0], [L, 0, L], L + 30, '127'),
    lin('y', 'z', [L, 0, 0], [L, 0, T], L + 16, '12.7'),
    lin('y', 'z', [L, 0, L - T], [L, 0, L], L + 16, '12.7'),
    cross('y', [101.6, 0, C - 25.4], R),
    cross('y', [101.6, 0, C + 25.4], R),
    // X: front view
    lin('x', 'z', [0, 88.9, C - 25.4], [0, 88.9, C], L + 14, '25.4'),
    lin('x', 'z', [0, 88.9, C], [0, 88.9, C + 25.4], L + 14, '25.4'),
    lin('x', 'y', [0, 0, 0], [0, 88.9, C - 25.4], -16, '88.9'),
    center('x', [0, -8, C], [0, L + 8, C]),
    cross('x', [0, 88.9, C - 25.4], R),
    cross('x', [0, 88.9, C + 25.4], R),
    // Z: side view (section A-A)
    lin('z', 'x', [0, L, 0], [T, L, 0], L + 14, '12.7'),
    lin('z', 'y', [0, 88.9 - R, 0], [0, 88.9 + R, 0], -14, 'Ø12.7'),
    lin('z', 'y', [L, 0, 0], [L, T, 0], L + 14, '12.7'),
    lin('z', 'x', [101.6 - R, 0, 0], [101.6 + R, 0, 0], -14, 'Ø12.7'),
    hidden('z', [0, 88.9 - R, 0], [T, 88.9 - R, 0]),
    hidden('z', [0, 88.9 + R, 0], [T, 88.9 + R, 0]),
    hidden('z', [101.6 - R, 0, 0], [101.6 - R, T, 0]),
    hidden('z', [101.6 + R, 0, 0], [101.6 + R, T, 0]),
    center('z', [-6, 88.9, 0], [T + 6, 88.9, 0]),
    center('z', [101.6, -6, 0], [101.6, T + 6, 0]),
  ];

  return { parts, dims };
}

// Slotted L-block
function slottedBlock() {
  const base = rrect(0, 0, 80, 50);
  hole(base, 30, 25, 15);

  const upright = poly([
    [5, 15], [45, 15], [45, 50], [35, 50],
    [35, 40], [15, 40], [15, 50], [5, 50],
  ]);

  const parts = [extrudeY(base, 0, 15), extrudeX(upright, 65, 80)];

  const dims = [
    // Z: front view
    lin('z', 'x', [65, 50, 0], [80, 50, 0], 64, '15'),
    lin('z', 'y', [80, 40, 0], [80, 50, 0], 94, '10'),
    lin('z', 'y', [80, 0, 0], [80, 50, 0], 108, '50'),
    lin('z', 'y', [0, 0, 0], [0, 15, 0], -14, '15'),
    hidden('z', [15, 0, 0], [15, 15, 0]),
    hidden('z', [45, 0, 0], [45, 15, 0]),
    hidden('z', [65, 40, 0], [80, 40, 0]),
    center('z', [30, -6, 0], [30, 21, 0]),
    // Y: top view
    lin('y', 'x', [30, 0, 25], [80, 0, 0], -14, '50'),
    lin('y', 'x', [0, 0, 50], [80, 0, 50], 64, '80'),
    lin('y', 'z', [0, 0, 0], [0, 0, 50], -14, '50'),
    lin('y', 'z', [80, 0, 15], [80, 0, 35], 94, '20'),
    lin('y', 'z', [80, 0, 5], [80, 0, 45], 108, '40'),
    leader('y', [30, 0, 25], 15, 135, 'Ø30'),
    cross('y', [30, 0, 25], 15),
    // X: no dimensions in the drawing
  ];

  return { parts, dims };
}

// Drawing 30: pillow block
function pillowBlock() {
  const holes = (s) => { hole(s, 90, 10, 4); hole(s, 90, 40, 4); return s; };

  // Base, split around the 5 x 5 groove on the underside
  const top = holes(rrect(0, 0, 100, 50, 10));
  const left = rrect(0, 0, 15, 50, [10, 0, 0, 10]);
  const right = holes(rrect(20, 0, 100, 50, [0, 10, 10, 0]));

  // Upright profile with R10 top corners and R3 root fillets
  const up = new THREE.Shape();
  up.moveTo(0, 15);
  up.lineTo(50, 15);
  up.absarc(50, 18, 3, -PI / 2, -PI, true);
  up.lineTo(47, 60);
  up.absarc(37, 60, 10, 0, PI / 2, false);
  up.lineTo(13, 70);
  up.absarc(13, 60, 10, PI / 2, PI, false);
  up.lineTo(3, 18);
  up.absarc(0, 18, 3, 0, -PI / 2, true);
  hole(up, 25, 55, 10);

  const x0 = 37.8, x1 = 37.8 + 24.51;

  const filletL = new THREE.Shape();
  filletL.moveTo(x0 - 3, 15);
  filletL.lineTo(x0, 15);
  filletL.lineTo(x0, 18);
  filletL.absarc(x0 - 3, 18, 3, 0, -PI / 2, true);

  const filletR = new THREE.Shape();
  filletR.moveTo(x1, 15);
  filletR.lineTo(x1 + 3, 15);
  filletR.absarc(x1 + 3, 18, 3, -PI / 2, -PI, true);

  const parts = [
    extrudeY(top, 5, 15),
    extrudeY(left, 0, 5),
    extrudeY(right, 0, 5),
    extrudeX(up, x0, x1),
    extrudeZ(filletL, 3, 47),
    extrudeZ(filletR, 3, 47),
  ];

  const dims = [
    // Y: top view
    lin('y', 'z', [90, 0, 10], [90, 0, 40], 114, '30'),
    lin('y', 'z', [100, 0, 0], [100, 0, 50], 128, '50'),
    lin('y', 'x', [0, 0, 50], [100, 0, 50], 78, '100'),
    lin('y', 'x', [90, 0, 40], [100, 0, 50], 64, '10'),
    leader('y', [10, 0, 10], 10, 135, '4-R10'),
    leader('y', [90, 0, 10], 4, 45, '2-Ø8', { len: 22 }),
    cross('y', [90, 0, 10], 4),
    cross('y', [90, 0, 40], 4),
    // Z: front view
    lin('z', 'x', [0, 15, 0], [x0, 70, 0], 84, '37.8'),
    lin('z', 'x', [x0, 70, 0], [x1, 70, 0], 84, '24.51'),
    lin('z', 'y', [x1, 45, 0], [x1, 65, 0], 78, 'Ø20'),
    lin('z', 'y', [0, 0, 0], [0, 5, 0], -14, '5'),
    lin('z', 'x', [0, 0, 0], [15, 0, 0], -14, '15'),
    lin('z', 'x', [15, 0, 0], [20, 0, 0], -14, '5'),
    leader('z', [x1 + 3, 18, 0], 3, 45, '2-R3', { start: 225 }),
    hidden('z', [x0, 45, 0], [x1, 45, 0]),
    hidden('z', [x0, 65, 0], [x1, 65, 0]),
    center('z', [x0 - 4, 55, 0], [x1 + 4, 55, 0]),
    // X: right view
    lin('x', 'z', [0, 60, 3], [0, 60, 47], 84, '44'),
    leader('x', [0, 60, 13], 10, 45, '2-R10'),
    leader('x', [0, 18, 50], 3, 135, '2-R3', { start: 315 }),
    lin('x', 'y', [0, 15, 0], [0, 55, 25], -16, '40'),
    lin('x', 'y', [0, 0, 0], [0, 15, 0], -16, '15'),
    lin('x', 'y', [0, 0, 0], [0, 70, 3], -30, '70'),
    center('x', [0, -6, 25], [0, 76, 25]),
    cross('x', [0, 55, 25], 10),
  ];

  return { parts, dims };
}

const rad = (deg) => (deg * PI) / 180;
const polar = (cx, cy, r, deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];

// Drawing 2180-560-05: camera bracket. Ø136 ring and Ø93 flange joined by a 48 neck, 8 thick.
// Front is +Z; the Ø11 counterbores open to the front, the Ø8 counterbores and countersinks to the back.
function cameraBracket() {
  const T = 8, LO = -125;
  const a = (x, y) => Math.atan2(y, x);
  const s = new THREE.Shape();
  s.moveTo(12.5, Math.sqrt(68 ** 2 - 12.5 ** 2));
  s.absarc(0, 0, 68, a(12.5, Math.sqrt(68 ** 2 - 12.5 ** 2)), a(26.44, -62.65), true);
  s.absarc(28, -66.33, 4, a(-1.56, 3.68), PI, false); // R4 neck fillets
  s.lineTo(24, -82.97);
  s.absarc(28, -82.97, 4, PI, a(-2.22, -3.33) + 2 * PI, false);
  s.absarc(0, LO, 46.5, a(25.78, 38.7), a(-25.78, 38.7), true);
  s.absarc(-28, -82.97, 4, a(2.22, -3.33), 0, false);
  s.lineTo(-24, -66.33);
  s.absarc(-28, -66.33, 4, 0, a(1.56, 3.68), false);
  s.absarc(0, 0, 68, a(-26.44, -62.65) + 2 * PI, a(-12.5, Math.sqrt(68 ** 2 - 12.5 ** 2)), true);
  s.lineTo(-12.5, 64); // 25 wide notch, R4 corners
  s.absarc(-8.5, 64, 4, PI, PI * 1.5, false);
  s.lineTo(8.5, 60);
  s.absarc(8.5, 64, 4, PI * 1.5, PI * 2, false);
  s.lineTo(12.5, Math.sqrt(68 ** 2 - 12.5 ** 2));

  const holes = [
    { x: 0, y: 0, profile: thru(70, T) },
    { x: -15, y: 42.43, profile: cboreFront(6.6, 11, 6.2, T) },
    { x: 15, y: 42.43, profile: cboreFront(6.6, 11, 6.2, T) },
    ...[20.5, 39.5].flatMap((d) => [0, 120, 240].map((k) => {
      const [x, y] = polar(0, 0, 60.85, d + k);
      return { x, y, profile: cboreBack(4.5, 8, 4.2, T) };
    })),
    ...[0, 1, 2, 3, 4, 5].map((k) => {
      const [x, y] = polar(0, LO, 40, 90 + k * 60);
      return { x, y, profile: cboreFront(6.6, 11, 6.2, T) };
    }),
    { x: -16, y: LO + 28, profile: chamferBack(6, 0.5, T) },
    { x: 16, y: LO - 28, profile: chamferBack(6, 0.5, T) },
    { x: 16, y: LO + 28, profile: cskBack(8.5, 17.3, T) },
    { x: -16, y: LO - 28, profile: cskBack(8.5, 17.3, T) },
    { x: -40, y: LO, profile: chamferFront(5, 0.5, T) },
    { x: 40, y: LO, profile: chamferFront(5, 0.5, T) },
  ];

  const dims = [
    // Z: front view
    leader('z', [0, 0, T], 68, 40, 'Ø136'),
    leader('z', [0, 0, T], 35, 210, 'Ø70', { start: 210, len: 40 }),
    leader('z', [0, LO, T], 46.5, 220, 'Ø93'),
    lin('z', 'x', [-24, -74, T], [24, -74, T], -74, '48'),
    lin('z', 'y', [0, 60, T], [0, 0, T], 84, '60'),
    lin('z', 'y', [0, 0, T], [0, LO, T], 84, '125'),
    lin('z', 'x', [-40, LO, T], [40, LO, T], LO - 60, '80 ±0,02'),
    lin('z', 'x', [-12.5, 60, T], [12.5, 60, T], 80, '25'),
    leader('z', [-8.5, 64, T], 4, 135, 'R4 (6x)', { start: 225 }),
    center('z', [0, -74, T], [0, 74, T]),
    center('z', [-74, 0, T], [74, 0, T]),
    cross('z', [0, LO, T], 4),
    // X: side view
    lin('x', 'z', [0, 68, 0], [0, 68, T], 82, '8'),
    center('x', [0, -8, 4], [0, 8, 4]),
    // Y: top view
    lin('y', 'x', [-68, 68, T], [68, 68, T], T + 16, '136'),
    lin('y', 'z', [68, 68, 0], [68, 68, T], 82, '8'),
  ];
  return { parts: [plate(s, holes, T)], dims };
}

// Drawing 2180-560-07: IS3800 bracket. Ø93 flange on a 48 wide arm, 200 long, 8 thick.
function is3800Bracket() {
  const T = 8;
  const a = (x, y) => Math.atan2(y, x);
  const s = new THREE.Shape();
  s.moveTo(-25.78, -38.7);
  s.absarc(0, 0, 46.5, a(-25.78, -38.7), a(25.78, -38.7), true);
  s.absarc(28, -42.03, 4, a(-2.22, 3.33), PI, false); // R4 (2x)
  s.lineTo(24, -151.5);
  s.lineTo(22, -153.5);
  s.lineTo(-22, -153.5);
  s.lineTo(-24, -151.5);
  s.lineTo(-24, -42.03);
  s.absarc(-28, -42.03, 4, 0, a(2.22, 3.33), false);

  const holes = [
    ...[0, 1, 2, 3, 4, 5].map((k) => {
      const [x, y] = polar(0, 0, 40, 90 + k * 60);
      return { x, y, profile: cboreFront(6.6, 11, 6, T) };
    }),
    { x: -16, y: 28, profile: chamferBack(6, 0.5, T) },
    { x: 16, y: -28, profile: chamferBack(6, 0.5, T) },
    { x: 16, y: 28, profile: cskBack(8.5, 17.3, T) },
    { x: -16, y: -28, profile: cskBack(8.5, 17.3, T) },
    { x: -40, y: 0, profile: thru(5, T) },
    { x: 40, y: 0, profile: thru(5, T) },
    ...[-90, -148.5].flatMap((y) => [-19.25, 19.25].map((x) => ({ x, y, profile: cboreFront(3.5, 6.5, 3.4, T) }))),
  ];

  const dims = [
    // Z: front view
    leader('z', [0, 0, T], 46.5, 135, 'Ø93'),
    lin('z', 'y', [0, 46.5, T], [24, -153.5, T], 64, '200'),
    lin('z', 'y', [0, 0, T], [24, -153.5, T], 46, '153,5'),
    lin('z', 'y', [0, 0, T], [-19.25, -90, T], -58, '90'),
    lin('z', 'y', [-19.25, -90, T], [-19.25, -148.5, T], -40, '58,5'),
    lin('z', 'x', [-19.25, -90, T], [19.25, -90, T], -110, '38,5'),
    lin('z', 'x', [-24, -153.5, T], [24, -153.5, T], -168, '48'),
    lin('z', 'x', [-40, 0, T], [40, 0, T], 58, '80'),
    leader('z', [28, -42.03, T], 4, 30, 'R4 (2x)', { start: 150 }),
    center('z', [0, -54, T], [0, 54, T]),
    center('z', [-54, 0, T], [54, 0, T]),
    // X: side view
    lin('x', 'z', [0, 46.5, 0], [0, 46.5, T], 60, '8'),
    // Y: top view
    lin('y', 'x', [-46.5, 46.5, T], [46.5, 46.5, T], T + 16, 'Ø93'),
    lin('y', 'z', [46.5, 46.5, 0], [46.5, 46.5, T], 60, '8'),
  ];
  return { parts: [plate(s, holes, T)], dims };
}

// Drawing 2180-100-08: mini cylinder mount. A 4 thick front plate with two
// countersunk holes, and a block behind it cut at 20° with two M3 tapped holes on top.
function cylinderMount() {
  const W = 28.5, H = 30, D = 20, P = 4, TAN = Math.tan(rad(20));
  // Extra corners where the block meets the plate, so the two share edges
  const front = new THREE.Shape([
    new THREE.Vector2(2, 0), new THREE.Vector2(7 + H * TAN, 0), new THREE.Vector2(W, 0), new THREE.Vector2(W, H),
    new THREE.Vector2(7, H), new THREE.Vector2(0, H), new THREE.Vector2(0, 2 / TAN),
  ]);
  const plateGeo = plate(front, [
    { x: 5.7, y: H - 8.09, profile: cskFront(4.5, 9.4, P) },
    { x: 11.85, y: H - 25, profile: cskFront(4.5, 9.4, P) },
  ], P, { basis: new THREE.Matrix4().makeTranslation(0, 0, D - P) });

  // Block built along Y (u = x, v = -z), then its left face is slanted 20°
  const block = new THREE.Shape([
    new THREE.Vector2(7, -(D - P)), new THREE.Vector2(W, -(D - P)), new THREE.Vector2(W, 0), new THREE.Vector2(7, 0),
  ]);
  const m3 = [[0, H - 8.8 - 0.75], [1.25, H - 8.8], [1.25, H - 6], [1.5, H - 6], [1.5, H]]; // drill 8,8, thread 6
  const blockGeo = plate(block, [{ x: 16, y: -3.25, profile: m3 }, { x: 16, y: -10.25, profile: m3 }], H, {
    basis: new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)),
    warp: (v) => { if (Math.abs(v.x - 7) < 1e-4) v.x = 7 + (H - v.y) * TAN; },
  });

  const dims = [
    // Z: front view
    lin('z', 'x', [0, H, D], [W, H, D], H + 14, '28,5'),
    lin('z', 'x', [0, H, D], [5.7, H - 8.09, D], H + 6, '5,7'),
    lin('z', 'y', [W, 0, D], [W, H, D], W + 12, '30'),
    lin('z', 'y', [0, H, D], [11.85, 5, D], -12, '25'),
    lin('z', 'x', [0, 0, D], [11.85, 5, D], -8, '11,85'),
    leader('z', [11.85, 5, D], 4.7, 30, 'Ø4,5 (2x)'),
    cross('z', [5.7, H - 8.09, D], 2.25),
    cross('z', [11.85, 5, D], 2.25),
    // X: side view
    lin('x', 'z', [W, 0, 0], [W, 0, D], -8, '20'),
    lin('x', 'z', [W, H, D - P], [W, H, D], H + 8, '4'),
    // Y: top view
    lin('y', 'x', [0, H, D], [16, H, 10.25], D + 8, '16'),
    lin('y', 'z', [W, H, 0], [16, H, 3.25], W + 8, '3,25'),
    lin('y', 'z', [W, H, 0], [16, H, 10.25], W + 18, '10,25'),
    leader('y', [16, H, 3.25], 1.5, 135, 'M3x0.5 (2x)'),
    cross('y', [16, H, 3.25], 1.5),
    cross('y', [16, H, 10.25], 1.5),
  ];
  return { parts: [mergeGeometries([plateGeo, blockGeo])], dims };
}

export const MODELS = {
  'Gusset bracket': gussetBracket,
  'Slotted L-block': slottedBlock,
  'Pillow block': pillowBlock,
  'Camera bracket': cameraBracket,
  'IS3800 bracket': is3800Bracket,
  'Cylinder mount': cylinderMount,
};

export function buildModel(name, material) {
  const { parts, dims } = MODELS[name]();
  const group = new THREE.Group();
  parts.forEach((g) => group.add(new THREE.Mesh(g, material)));

  const bbox = new THREE.Box3().setFromObject(group);
  const center = bbox.getCenter(new THREE.Vector3());
  group.position.sub(center);
  const radius = bbox.getBoundingSphere(new THREE.Sphere()).radius;
  return { group, dims, bbox, center, radius };
}

export function disposeModel(group) {
  group.traverse((o) => o.geometry && o.geometry.dispose());
}
