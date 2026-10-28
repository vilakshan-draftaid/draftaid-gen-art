import { makeNoise, fbm } from './noise.js';
import { mulberry32 } from './shared.js';

// Hard-edged jigsaw pieces on a grid: every square can hold a piece, and wherever two
// pieces touch, the shared edge gets a square tab (a knob on one, the matching notch on
// the other). Edges with no neighbour stay flat.

// Seeded +1/-1 per shared edge, so a layout keeps its tabs as pieces come and go
function edgeSign(seed, c, r, horizontal) {
  let h = (seed ^ Math.imul(c + 1, 73856093) ^ Math.imul(r + 1, 19349663) ^ (horizontal ? 83492791 : 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return (h ^ (h >>> 13)) & 1 ? 1 : -1;
}

// Edge types for the piece at (c, r): 1 = knob out, -1 = notch in, 0 = flat
export function pieceEdges(has, seed, c, r) {
  const h = (cc, rr) => has(cc, rr);
  if (!h(c, r)) return null;
  return {
    top: h(c, r - 1) ? -edgeSign(seed, c, r - 1, false) : 0,
    right: h(c + 1, r) ? edgeSign(seed, c, r, true) : 0,
    bottom: h(c, r + 1) ? edgeSign(seed, c, r, false) : 0,
    left: h(c - 1, r) ? -edgeSign(seed, c - 1, r, true) : 0,
  };
}

// Outline of one piece in grid px, clockwise from the top-left corner.
// tab = tab width and depth = how far it sticks out, both as a share of the square
export function piecePath(c, r, s, edges, tab, depth) {
  const x0 = c * s, y0 = r * s, a = (s * (1 - tab)) / 2, b = a + s * tab, d = s * depth;
  const pts = [[x0, y0]];
  // Each side: walk to the tab, step out (or in), across, back, then on to the corner
  const side = (from, along, normal, kind) => {
    const P = (t, n) => [from[0] + along[0] * t + normal[0] * n, from[1] + along[1] * t + normal[1] * n];
    if (kind) pts.push(P(a, 0), P(a, d * kind), P(b, d * kind), P(b, 0));
    pts.push(P(s, 0));
  };
  side([x0, y0], [1, 0], [0, -1], edges.top);
  side([x0 + s, y0], [0, 1], [1, 0], edges.right);
  side([x0 + s, y0 + s], [-1, 0], [0, 1], edges.bottom);
  side([x0, y0 + s], [0, -1], [-1, 0], edges.left);
  pts.pop(); // back at the start
  return 'M' + pts.map(([x, y]) => `${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`).join('L') + 'Z';
}

// Which spots hold pieces: a noise base (or none), then your edits on top.
// columns/rows count pieces; `unit` is how many grid squares one piece spans
export function puzzleCells({ columns, rows, unit = 1, base, fill, noise: nz, seed, edits, colorCount, symbols }) {
  const on = new Uint8Array(columns * rows);
  if (base === 'noise') {
    const noise = makeNoise(nz.type, seed);
    const jitter = mulberry32(seed ^ 0x9e3779b9);
    const v = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
      v.push([fbm(noise, (c + 0.5) * unit * nz.scale, (r + 0.5) * unit * nz.scale, nz.octaves) + (jitter() - 0.5) * (1 - nz.contrast), r * columns + c]);
    }
    v.sort((x, y) => y[0] - x[0]).slice(0, Math.round(fill * v.length)).forEach(([, i]) => { on[i] = 1; });
  }
  for (const [key, val] of Object.entries(edits)) {
    const [c, r] = key.split(',').map(Number);
    if (c >= 0 && c < columns && r >= 0 && r < rows) on[r * columns + c] = val ? 1 : 0;
  }
  const pick = mulberry32(seed ^ 0x51ed270b);
  const cells = [];
  for (let i = 0; i < columns * rows; i++) {
    const color = Math.floor(pick() * colorCount), symbol = symbols[Math.floor(pick() * symbols.length)];
    cells.push({ c: i % columns, r: Math.floor(i / columns), on: !!on[i], color, symbol });
  }
  return cells;
}
