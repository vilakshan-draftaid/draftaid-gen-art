import inventor from './assets/logos/inventor.svg';
import solidworks from './assets/logos/solidworks.png';
import onshape from './assets/logos/onshape.png';
import creo from './assets/logos/creo.png';
import catia from './assets/logos/catia.png';
import solidEdge from './assets/logos/solid-edge.png';
import siemensNx from './assets/logos/siemens-nx.png';
import fusion360 from './assets/logos/fusion-360.png';
import { makeNoise, fbm } from './noise.js';
import { mulberry32 } from './shared.js';

// CAD integrations, white logos used as masks so any color can fill them.
// aspect = width / height of the artwork
export const LOGOS = [
  { id: 'inventor', label: 'Autodesk Inventor', src: inventor, aspect: 142 / 35.14, available: true },
  { id: 'solidworks', label: 'SolidWorks', src: solidworks, aspect: 640 / 133, available: true },
  { id: 'onshape', label: 'Onshape', src: onshape, aspect: 640 / 143, available: false },
  { id: 'creo', label: 'Creo', src: creo, aspect: 533 / 180, available: false },
  { id: 'catia', label: 'CATIA', src: catia, aspect: 562 / 147, available: false },
  { id: 'solidEdge', label: 'Solid Edge', src: solidEdge, aspect: 640 / 202, available: false },
  { id: 'siemensNx', label: 'Siemens NX', src: siemensNx, aspect: 640 / 226, available: false },
  { id: 'fusion360', label: 'Autodesk Fusion 360', src: fusion360, aspect: 640 / 147, available: false },
];

// Noise decides where squares collect; logos take the densest spots, available ones first.
// `pins` holds tiles the user moved or resized ({ id: { col, row, w, h } }); they may cover
// squares or other logos. Auto spots ignore pins and squares come from the noise alone, so
// moving one logo never shifts anything else; tiles simply sit on top.
export function integrationsLayout({ columns, rows, fill, logos, logoSize, tileRows = 1, pins = {}, noise: nz, seed, colorByNoise = false, colorCount = 4 }) {
  const noise = makeNoise(nz.type, seed);
  const jitter = mulberry32(seed ^ 0x9e3779b9);
  const v = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    v.push(fbm(noise, (c + 0.5) * nz.scale, (r + 0.5) * nz.scale, nz.octaves) + (jitter() - 0.5) * (1 - nz.contrast));
  }

  const taken = new Uint8Array(columns * rows); // tiles plus a clear ring, for auto placement
  const claim = (t) => {
    for (let rr = t.row - 1; rr <= t.row + t.h; rr++) for (let cc = t.col - 1; cc <= t.col + t.w; cc++) {
      if (rr >= 0 && rr < rows && cc >= 0 && cc < columns) taken[rr * columns + cc] = 1;
    }
  };
  const tiles = [];
  const order = [...logos.filter((l) => l.available), ...logos.filter((l) => !l.available)];
  for (const logo of order) {
    // Wide enough for the logo at this size plus a margin
    const h = Math.min(rows, tileRows);
    const w = Math.min(columns, Math.max(2, Math.ceil(logo.aspect * logoSize * h + (1 - logoSize))));
    let best = null;
    for (let r = 0; r + h <= rows; r++) for (let c = 0; c + w <= columns; c++) {
      let ok = true, sum = 0;
      for (let rr = r; rr < r + h && ok; rr++) for (let cc = c; cc < c + w && ok; cc++) { ok = !taken[rr * columns + cc]; sum += v[rr * columns + cc]; }
      if (!ok) continue;
      const sc = sum / (w * h) + jitter() * 0.02;
      if (!best || sc > best.sc) best = { r, c, sc };
    }
    const t = best ? { ...logo, w, h, col: best.c, row: best.r, pinned: false } : { ...logo, w, h, col: 0, row: 0, pinned: false };
    claim(t);
    const pin = pins[logo.id];
    if (pin) {
      const pw = Math.max(1, Math.min(columns, pin.w)), ph = Math.max(1, Math.min(rows, pin.h));
      Object.assign(t, { w: pw, h: ph, col: Math.max(0, Math.min(columns - pw, pin.col)), row: Math.max(0, Math.min(rows - ph, pin.row)), pinned: true });
    }
    if (best || pin) tiles.push(t);
  }

  // Plain squares: the top `fill` share of the noise
  const sorted = v.map((n, i) => [n, i]).sort((a, b) => b[0] - a[0]);
  const top = sorted.slice(0, Math.round(fill * sorted.length));
  const filled = new Set(top.map(([, i]) => i));
  // By noise: one equal band of the filled squares per color, C1 in the densest centers
  const band = new Map(top.map(([, i], k) => [i, Math.min(colorCount - 1, Math.floor((k / top.length) * colorCount))]));
  const covered = new Set();
  for (const t of tiles) for (let rr = t.row; rr < t.row + t.h; rr++) for (let cc = t.col; cc < t.col + t.w; cc++) covered.add(rr * columns + cc);
  const pick = mulberry32(seed ^ 0x51ed270b);
  const squares = [], empties = [];
  for (let i = 0; i < columns * rows; i++) {
    const roll = Math.floor(pick() * colorCount);
    const color = colorByNoise && band.has(i) ? band.get(i) : roll;
    if (covered.has(i)) continue; // hidden under a logo tile
    (filled.has(i) ? squares : empties).push({ col: i % columns, row: Math.floor(i / columns), color });
  }
  return { tiles, squares, empties };
}

// Where the logo sits inside its tile (px): `logoSize` of the tile height, shrunk to fit its width
export function logoRect(W, H, s, aspect, logoSize) {
  let lh = H * logoSize, lw = lh * aspect;
  const maxW = W - s * (1 - logoSize);
  if (lw > maxW) { lw = maxW; lh = lw / aspect; }
  return { x: (W - lw) / 2, y: (H - lh) / 2, w: lw, h: lh };
}
