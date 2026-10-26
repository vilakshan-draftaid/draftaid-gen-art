import { FONT } from './shared.js';

// Dimension callouts written the way the reference drawings write them (comma decimals).
// A callout is a list of runs: { t } plain, { t, small } raised tolerance,
// { stack: [top, bottom] } stacked limits, { t, over } text under a bar (surface finish).
export const NUMBER_STYLES = ['sizes', 'tolerances', 'angles', 'chamfers', 'threads', 'references', 'surfaceFinish', 'plainNumbers'];

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
const comma = (n) => String(n).replace('.', ',');
// Realistic dimension: mostly whole mm, sometimes one or two decimals
function dim(rand, lo, hi) {
  const v = lo + rand() * (hi - lo);
  const r = rand();
  return comma(r < 0.55 ? Math.round(v) : r < 0.85 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
}
const count = (rand) => pick(rand, ['2x', '2x', '3x', '4x', '6x', '8x']);

const MAKERS = {
  sizes: (rand) => {
    const dia = rand() < 0.6;
    const t = dia ? `Ø${dim(rand, 3, 140)}` : `R${pick(rand, ['0,5', '1', '2', '3', '4', '5', '6', '8', '10', '12', '20'])}`;
    return rand() < 0.45 ? [{ t }, { t: `(${count(rand)})` }] : [{ t }];
  },
  tolerances: (rand) => {
    const n = Math.round(4 + rand() * 120);
    const kind = rand();
    if (kind < 0.4) return [{ t: `${n} ±${pick(rand, ['0,01', '0,02', '0,05', '0,1', '0,2'])}` }];
    const fit = pick(rand, ['H7', 'H7', 'H6', 'H8']);
    const up = pick(rand, ['0,012', '0,015', '0,018', '0,021', '0,025']);
    const lead = [{ t: `Ø${n} ${fit}` }];
    if (kind < 0.75) return [...lead, { stack: [`${n},${up.slice(2)}`, String(n)] }];
    return [...lead, { stack: [`+${up}`, '-0'] }];
  },
  angles: (rand) => {
    if (rand() < 0.4) {
      const k = pick(rand, [3, 4, 5, 6, 8, 12]);
      return [{ t: `${k}x${comma(Math.round((3600 / k)) / 10)}°` }];
    }
    return [{ t: `${rand() < 0.5 ? pick(rand, ['30', '45', '60', '90', '120']) : dim(rand, 5, 80)}°` }];
  },
  chamfers: (rand) => [{ t: `${pick(rand, ['0,3', '0,5', '0,5', '1', '1,5', '2'])}x45°` }],
  threads: (rand) => {
    // Thread pitch keeps the period, as in M3x0.5
    const [d, pitch] = pick(rand, [[3, '0.5'], [4, '0.7'], [5, '0.8'], [6, '1'], [8, '1.25'], [10, '1.5'], [12, '1.75']]);
    const t = rand() < 0.5 ? `M${d}x${pitch}` : `M${d}`;
    return rand() < 0.5 ? [{ t }, { t: `(${count(rand)})` }] : [{ t }];
  },
  references: (rand) => [{ t: `(${rand() < 0.4 ? 'Ø' : ''}${dim(rand, 10, 250)})` }],
  surfaceFinish: (rand) => [{ t: '√' }, { t: `Ra ${pick(rand, ['0,4', '0,8', '1,6', '3,2', '6,3', '12,5'])}`, over: true }],
  plainNumbers: (rand) => [{ t: dim(rand, 2, 240) }],
};

export function makeCallout(rand, styles) {
  return MAKERS[pick(rand, styles)](rand);
}

// Positions each run in em, centered on 0, so the grid, SVG and PNG all draw the same thing
const SMALL = 0.62, STACK = 0.55, GAP = 0.22;
const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
function measure(t, weight) {
  ctx.font = `${weight} 100px ${FONT}`;
  return ctx.measureText(t).width / 100;
}
export function placeCallout(runs, weight) {
  const pieces = [];
  let x = 0;
  runs.forEach((r, i) => {
    if (i) x += r.t === '√' || runs[i - 1].t === '√' || r.stack || r.small ? GAP / 2 : GAP;
    if (r.stack) {
      const w = Math.max(...r.stack.map((t) => measure(t, weight) * STACK));
      pieces.push({ t: r.stack[0], x, y: -0.3, size: STACK }, { t: r.stack[1], x, y: 0.32, size: STACK });
      x += w;
      return;
    }
    const size = r.small ? SMALL : 1;
    const w = measure(r.t, weight) * size;
    pieces.push({ t: r.t, x, y: r.small ? 0.08 : 0, size, over: r.over ? { x1: x - 0.12, x2: x + w + 0.08, y: -0.62 } : null });
    x += w;
  });
  const half = x / 2;
  for (const p of pieces) {
    p.x -= half;
    if (p.over) { p.over.x1 -= half; p.over.x2 -= half; }
  }
  return { width: x, pieces };
}
