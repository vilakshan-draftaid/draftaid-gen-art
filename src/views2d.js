// Sample 2D CAD views of two parts (sheet 13 bracket, sheet 54 gusset), in part units, y down.
// Each view is a list of primitives: line, circle, arc (screen degrees), poly (optionally hatched).
const tang = (() => { // bracket upright tangent to the R19 boss from the base corners
  const a = Math.atan2(-48, 41) + Math.acos(19 / Math.hypot(41, 48));
  return { x: 19 * Math.cos(a), y: 19 * Math.sin(a), deg: (a * 180) / Math.PI };
})();

const bracketFront = {
  id: 'bracket-front', name: 'Bracket · Front', w: 82, h: 77,
  prims: [
    { t: 'poly', p: [[0, 67], [82, 67], [82, 77], [0, 77]], closed: true },
    { t: 'line', a: [82, 67, 41 + tang.x, 77 - (58 + tang.y)] },
    { t: 'line', a: [0, 67, 41 - tang.x, 77 - (58 + tang.y)] },
    { t: 'arc', c: [41, 19, 19, -tang.deg, -180 + tang.deg] },
    { t: 'circle', c: [41, 19, 11] },
    { t: 'poly', p: [[36, 67], [36, 37], [46, 37], [46, 67]] },
    ...[14, 68].flatMap((x) => [
      { t: 'line', a: [x - 5, 69, x - 5, 77], s: 'hid' }, { t: 'line', a: [x + 5, 69, x + 5, 77], s: 'hid' },
      { t: 'line', a: [x - 10, 69, x + 10, 69], s: 'hid' }, { t: 'line', a: [x, 64, x, 80], s: 'ctr' },
    ]),
    { t: 'line', a: [41, -4, 41, 81], s: 'ctr' }, { t: 'line', a: [25, 19, 57, 19], s: 'ctr' },
  ],
};
const bracketTop = {
  id: 'bracket-top', name: 'Bracket · Top', w: 82, h: 38,
  prims: [
    { t: 'line', a: [0, 0, 82, 0] }, { t: 'line', a: [82, 0, 82, 24] }, { t: 'arc', c: [68, 24, 14, 0, 90] },
    { t: 'line', a: [68, 38, 14, 38] }, { t: 'arc', c: [14, 24, 14, 90, 180] }, { t: 'line', a: [0, 24, 0, 0] },
    { t: 'line', a: [0, 12, 82, 12] }, { t: 'poly', p: [[36, 12], [36, 36], [46, 36], [46, 12]] },
    ...[14, 68].flatMap((x) => [{ t: 'circle', c: [x, 24, 5] }, { t: 'circle', c: [x, 24, 10] },
      { t: 'line', a: [x - 13, 24, x + 13, 24], s: 'ctr' }, { t: 'line', a: [x, 11, x, 37], s: 'ctr' }]),
    { t: 'line', a: [30, 0, 30, 12], s: 'hid' }, { t: 'line', a: [52, 0, 52, 12], s: 'hid' },
  ],
};
const bracketSection = {
  id: 'bracket-section', name: 'Bracket · Section A-A', w: 38, h: 77,
  prims: [
    { t: 'poly', p: [[0, 77], [38, 77], [38, 30], [26, 30], [26, 37], [2, 67], [0, 67]], closed: true, hatch: true },
    { t: 'poly', p: [[26, 8], [38, 8], [38, 0], [26, 0]], closed: true, hatch: true },
    { t: 'line', a: [26, 30, 26, 8] }, { t: 'line', a: [38, 30, 38, 8] },
    { t: 'line', a: [22, 19, 42, 19], s: 'ctr' },
  ],
};
const g = 0.6, W = 127 * g, t = 12.7 * g; // gusset drawn at 60% so both parts sit at a similar size
const gussetFront = {
  id: 'gusset-front', name: 'Gusset · Front', w: W, h: W,
  prims: [
    { t: 'poly', p: [[0, 0], [W, 0], [W, W], [0, W]], closed: true },
    { t: 'line', a: [t, 0, t, W - t] }, { t: 'line', a: [W - t, 0, W - t, W - t] }, { t: 'line', a: [0, W - t, W, W - t] },
    ...[38.1, 88.9].flatMap((x) => [{ t: 'circle', c: [x * g, 38.1 * g, 6.35 * g] },
      { t: 'line', a: [x * g - 6, 38.1 * g, x * g + 6, 38.1 * g], s: 'ctr' }, { t: 'line', a: [x * g, 38.1 * g - 6, x * g, 38.1 * g + 6], s: 'ctr' }]),
    { t: 'line', a: [W / 2, -3, W / 2, W + 3], s: 'ctr' },
  ],
};
const gussetSide = {
  id: 'gusset-side', name: 'Gusset · Section A-A', w: W, h: W,
  prims: [
    { t: 'poly', p: [[0, 0], [t, 0], [t, W - t], [W, W - t], [W, W], [0, W]], closed: true, hatch: true },
    { t: 'line', a: [t, 0, W, W - t] },
    { t: 'line', a: [-3, 38.1 * g, t + 3, 38.1 * g], s: 'ctr' }, { t: 'line', a: [101.6 * g, W - t - 3, 101.6 * g, W + 3], s: 'ctr' },
  ],
};
const gussetTop = {
  id: 'gusset-top', name: 'Gusset · Top', w: W, h: W,
  prims: [
    { t: 'poly', p: [[0, 0], [W, 0], [W, W], [0, W]], closed: true },
    { t: 'line', a: [0, t, W, t] }, { t: 'line', a: [t, t, t, W] }, { t: 'line', a: [W - t, t, W - t, W] },
    ...[38.1, 88.9].flatMap((x) => [{ t: 'circle', c: [x * g, 101.6 * g, 6.35 * g] },
      { t: 'line', a: [x * g - 6, 101.6 * g, x * g + 6, 101.6 * g], s: 'ctr' }]),
    { t: 'line', a: [W / 2, -3, W / 2, W + 3], s: 'ctr' },
  ],
};

export const VIEWS = [bracketFront, bracketTop, bracketSection, gussetFront, gussetSide, gussetTop];

const rad = (d) => (d * Math.PI) / 180;
export const PAD = 4; // units of padding around a view so strokes are never clipped

export function viewSVG(v, opts = {}) {
  const ink = opts.ink || '#111';
  const parts = [];
  let hatchUsed = false;
  for (const p of v.prims) {
    const cls = p.s || 'vis';
    if (p.t === 'line') parts.push(`<line class="${cls}" x1="${p.a[0]}" y1="${p.a[1]}" x2="${p.a[2]}" y2="${p.a[3]}"/>`);
    if (p.t === 'circle') parts.push(`<circle class="${cls}" cx="${p.c[0]}" cy="${p.c[1]}" r="${p.c[2]}"/>`);
    if (p.t === 'arc') {
      const [cx, cy, r, a0, a1] = p.c;
      const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
      const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
      const large = Math.abs(a1 - a0) > 180 ? 1 : 0, sweep = a1 > a0 ? 1 : 0;
      parts.push(`<path class="${cls}" d="M${x0},${y0} A${r},${r} 0 ${large} ${sweep} ${x1},${y1}"/>`);
    }
    if (p.t === 'poly') {
      const d = 'M' + p.p.map((q) => q.join(',')).join(' L') + (p.closed ? ' Z' : '');
      if (p.hatch) { hatchUsed = true; parts.push(`<path d="${d}" fill="url(#h-${v.id})" stroke="none"/>`); }
      parts.push(`<path class="${cls}" d="${d}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-PAD} ${-PAD} ${v.w + PAD * 2} ${v.h + PAD * 2}" width="100%" height="100%">
<defs>${hatchUsed ? `<pattern id="h-${v.id}" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3" stroke="${ink}" stroke-width="0.35"/></pattern>` : ''}
<style>.vis{fill:none;stroke:${ink};stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
.hid{fill:none;stroke:${ink};stroke-width:1.2;stroke-dasharray:6 4;vector-effect:non-scaling-stroke}
.ctr{fill:none;stroke:${ink};stroke-width:0.8;stroke-dasharray:16 4 3 4;vector-effect:non-scaling-stroke}</style></defs>
${parts.join('\n')}</svg>`;
}

// Points along every visible and hidden line, plus points filling hatched sections.
// Used to find which grid cells the drawing touches. Centre lines are construction only, so skipped.
const cache = new Map();
export function viewSamples(v) {
  if (cache.has(v.id)) return cache.get(v.id);
  const pts = [], step = 0.5;
  const seg = (x1, y1, x2, y2) => { const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step)); for (let i = 0; i <= n; i++) pts.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]); };
  const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  for (const p of v.prims) {
    if (p.s === 'ctr') continue;
    if (p.t === 'line') seg(...p.a);
    if (p.t === 'circle' || p.t === 'arc') {
      const [cx, cy, r] = p.c; const a0 = p.t === 'arc' ? p.c[3] : 0, a1 = p.t === 'arc' ? p.c[4] : 360;
      const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.PI * r) / 180 / step));
      for (let i = 0; i <= n; i++) { const a = rad(a0 + ((a1 - a0) * i) / n); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    }
    if (p.t === 'poly') {
      const q = p.closed ? [...p.p, p.p[0]] : p.p;
      for (let i = 0; i < q.length - 1; i++) seg(...q[i], ...q[i + 1]);
      if (p.hatch) {
        const xs = p.p.map((a) => a[0]), ys = p.p.map((a) => a[1]);
        for (let y = Math.min(...ys); y <= Math.max(...ys); y += 1) for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1) if (inPoly(x, y, p.p)) pts.push([x, y]);
      }
    }
  }
  cache.set(v.id, pts);
  return pts;
}
