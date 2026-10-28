import * as THREE from 'three';
import { mulberry32 } from './shared.js';

// 3D puzzle pieces: a cols x rows set of interlocking pieces, each extruded to its own
// height. Built Y-up with the board on the X-Z plane, one unit per piece.

// Seeded +1/-1 per shared edge, the same edge always gets the same knob direction
function edgeSign(rand) { return rand() < 0.5 ? 1 : -1; }

// Footprint of one piece as a Shape in (x, z). kind per side: 1 knob out, -1 notch in, 0 flat
function pieceShape(c, r, edges, { tab, depth, round }) {
  const x0 = c, z0 = r, a = (1 - tab) / 2, b = a + tab, d = depth;
  const s = new THREE.Shape();
  s.moveTo(x0, z0);
  // Each side runs along `along`; `out` points away from the piece
  const side = (fx, fz, ax, az, ox, oz, kind) => {
    const P = (t, n) => [fx + ax * t + ox * n, fz + az * t + oz * n];
    if (kind) {
      if (round) {
        // A circle the width of the tab, poking out `depth` past the edge. Where it would
        // float free of the edge, a short neck joins them
        const R = tab / 2, mid = 0.5, cd = d - R, n = R * 0.6;
        const [cx, cz] = P(mid, cd * kind);
        let from, to;
        if (cd < R) {
          const hc = Math.sqrt(R * R - cd * cd);
          from = P(mid - hc, 0); to = P(mid + hc, 0);
        } else {
          const m = (cd - Math.sqrt(R * R - n * n)) * kind;
          s.lineTo(...P(mid - n, 0));
          from = P(mid - n, m); to = P(mid + n, m);
        }
        s.lineTo(...from);
        const ang = ([x, z]) => Math.atan2(z - cz, x - cx);
        const a0 = ang(from), a1 = ang(to), far = ang(P(mid, (cd + R) * kind));
        // Go the long way round, through the far side of the circle
        const norm = (t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const ccwHasFar = norm(far - a0) < norm(a1 - a0);
        s.absarc(cx, cz, R, a0, a1, !ccwHasFar);
        if (cd >= R) s.lineTo(...P(mid + n, 0));
      } else {
        s.lineTo(...P(a, 0)); s.lineTo(...P(a, d * kind)); s.lineTo(...P(b, d * kind)); s.lineTo(...P(b, 0));
      }
    }
    s.lineTo(...P(1, 0));
  };
  // Clockwise when looking down at x right, z down
  side(x0, z0, 1, 0, 0, -1, edges.top);
  side(x0 + 1, z0, 0, 1, 1, 0, edges.right);
  side(x0 + 1, z0 + 1, -1, 0, 0, 1, edges.bottom);
  side(x0, z0 + 1, 0, -1, -1, 0, edges.left);
  return s;
}

// Pieces with their heights and colors; `accent` pieces are picked by the seed
export function isoPieces({ cols, rows, seed, height, variation, accent }) {
  const rand = mulberry32(seed);
  const h = Array.from({ length: cols - 1 }, () => Array.from({ length: rows }, () => edgeSign(rand)));
  const v = Array.from({ length: cols }, () => Array.from({ length: rows - 1 }, () => edgeSign(rand)));
  const order = Array.from({ length: cols * rows }, (_, i) => i).sort(() => rand() - 0.5);
  const accents = new Set(order.slice(0, accent));
  const pieces = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const lift = rand();
    pieces.push({
      c, r,
      height: Math.max(0.05, height * (1 + (lift - 0.5) * 2 * variation)),
      accent: accents.has(r * cols + c),
      edges: {
        top: r > 0 ? -v[c][r - 1] : 0,
        right: c < cols - 1 ? h[c][r] : 0,
        bottom: r < rows - 1 ? v[c][r] : 0,
        left: c > 0 ? -h[c - 1][r] : 0,
      },
    });
  }
  return pieces;
}

// Extruded geometry for one piece, standing on y = 0
export function pieceGeometry(piece, opts) {
  const g = new THREE.ExtrudeGeometry(pieceShape(piece.c, piece.r, piece.edges, opts), { depth: piece.height, bevelEnabled: false, curveSegments: 24 });
  g.rotateX(Math.PI / 2); // shape y becomes z, extrusion runs down
  g.translate(0, piece.height, 0);
  g.deleteAttribute('uv');
  return g;
}
