// Data sphere: points scattered through a sphere, denser where a 3D noise field is high,
// so clusters gather in some places and thin out in others. The clusters belong to the
// sphere, so they turn with it
import { GIFEncoder, applyPalette } from 'gifenc';
import { mulberry32 } from './shared.js';

// Seeded 3D gradient noise, about -1..1
function noise3(rand) {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const G = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  return (x, y, z) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    const xf = x - X, yf = y - Y, zf = z - Z;
    const xi = X & 255, yi = Y & 255, zi = Z & 255;
    const g = (a, b, c) => {
      const h = G[perm[perm[perm[xi + a] + yi + b] + zi + c] % 12];
      return h[0] * (xf - a) + h[1] * (yf - b) + h[2] * (zf - c);
    };
    const u = fade(xf), v = fade(yf), w = fade(zf);
    return lerp(
      lerp(lerp(g(0, 0, 0), g(1, 0, 0), u), lerp(g(0, 1, 0), g(1, 1, 0), u), v),
      lerp(lerp(g(0, 0, 1), g(1, 0, 1), u), lerp(g(0, 1, 1), g(1, 1, 1), u), v), w) * 1.4;
  };
}

// The points, as a flat [x, y, z, ...] array inside the unit sphere, and each one's data
// type. depth: 0 keeps them on the skin, 1 fills the whole ball. Density only: the noise
// decides how likely a point is to land at a place; spread is the chance it lands where
// noise is low. Two layouts for the data types:
//  - 'own': each type has its own noise field, so the types cluster in their own places
//    (and overlap where two fields are both high), and gets its share of the count
//  - 'split': one shared cluster field places every point, and a second, smooth region field
//    is cut into bands, one per type, as wide as its share; a point takes the type of the
//    band it lands in, so the types tile the sphere like regions on a map
export function spherePoints({ seed, count, depth, scale, octaves, clustering, spread, shares = [1], layout = 'own', regionScale = 1.2 }) {
  if (layout === 'split') return splitPoints({ seed, count, depth, scale, octaves, clustering, spread, shares, regionScale });
  const rand = mulberry32(seed);
  const n3 = noise3(rand);
  const total = shares.reduce((a, b) => a + b, 0) || 1;
  const want = shares.map((sh) => Math.round((count * sh) / total));
  const offs = shares.map(() => [rand() * 100, rand() * 100, rand() * 100]);
  let off = offs[0];
  const density = (x, y, z) => {
    let sum = 0, amp = 1, norm = 0, f = scale;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n3(x * f + off[0], y * f + off[1], z * f + off[2]);
      norm += amp; amp *= 0.5; f *= 2;
    }
    const d = Math.min(1, Math.max(0, 0.5 + (sum / norm) * 0.9));
    return spread + (1 - spread) * Math.pow(d, clustering);
  };
  const inner = Math.pow(Math.max(0, 1 - Math.max(depth, 0.012)), 3);
  const sum = want.reduce((a, b) => a + b, 0);
  const out = new Float32Array(sum * 3), type = new Uint8Array(sum);
  let n = 0;
  want.forEach((m, ti) => {
    off = offs[ti];
    const end = n + m;
    for (let tries = 0; n < end && tries < m * 80; tries++) {
      // A uniform direction, and a radius uniform by volume through the shell
      let x, y, z, l;
      do { x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-6);
      const r = Math.cbrt(inner + (1 - inner) * rand()) / Math.sqrt(l);
      x *= r; y *= r; z *= r;
      if (rand() > density(x, y, z)) continue;
      out[n * 3] = x; out[n * 3 + 1] = y; out[n * 3 + 2] = z;
      type[n] = ti;
      n++;
    }
  });
  return { pts: out.subarray(0, n * 3), type: type.subarray(0, n) };
}

// The 'split' layout (see spherePoints)
function splitPoints({ seed, count, depth, scale, octaves, clustering, spread, shares, regionScale }) {
  const rand = mulberry32(seed);
  const n3 = noise3(rand);
  const off = [rand() * 100, rand() * 100, rand() * 100], roff = [rand() * 100, rand() * 100, rand() * 100];
  const field = (x, y, z, f0, oct, o) => {
    let sum = 0, amp = 1, norm = 0, f = f0;
    for (let k = 0; k < oct; k++) { sum += amp * n3(x * f + o[0], y * f + o[1], z * f + o[2]); norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  };
  const inner = Math.pow(Math.max(0, 1 - Math.max(depth, 0.012)), 3);
  const place = () => {
    let x, y, z, l;
    do { x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-6);
    const r = Math.cbrt(inner + (1 - inner) * rand()) / Math.sqrt(l);
    return [x * r, y * r, z * r];
  };
  // Band edges: the region field's values at each type's running share, measured over the
  // shell, so each type's band covers its share of the sphere. Two octaves keep edges smooth
  const region = (p) => field(p[0], p[1], p[2], regionScale, 2, roff);
  const sample = Array.from({ length: 3000 }, () => region(place())).sort((a, b) => a - b);
  const total = shares.reduce((a, b) => a + b, 0) || 1;
  let run = 0;
  const edges = shares.slice(0, -1).map((sh) => { run += sh; return sample[Math.min(sample.length - 1, Math.floor((run / total) * sample.length))]; });
  const out = new Float32Array(count * 3), type = new Uint8Array(count);
  let n = 0;
  for (let tries = 0; n < count && tries < count * 80; tries++) {
    const p = place();
    const d = Math.min(1, Math.max(0, 0.5 + field(p[0], p[1], p[2], scale, octaves, off) * 0.9));
    if (rand() > spread + (1 - spread) * Math.pow(d, clustering)) continue;
    const v = region(p);
    let t = 0;
    while (t < edges.length && v > edges[t]) t++;
    out.set(p, n * 3); type[n] = t; n++;
  }
  return { pts: out.subarray(0, n * 3), type: type.subarray(0, n) };
}

// Any CSS color (hex, rgb(), oklch() …) as [r, g, b], resolved by the browser
let probe;
const seen = new Map();
const hex = (color) => seen.get(color) ?? seen.set(color, resolve(color)).get(color);
const resolve = (color) => {
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  return [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)];
};

// Where labels point: the densest spots of the given types (all of them when none is
// given), at least `apart` radians from each other and from the `taken` spots of other
// labels. The seed picks among the densest few, so a new seed moves the labels without
// leaving the clusters
export function labelAnchors({ pts, type }, { count, seed, types, apart = 0.6, taken = [] }) {
  if (!count) return [];
  const G = 12, cells = new Map(), use = types?.length ? new Set(types) : null;
  for (let i = 0, j = 0; i < pts.length; i += 3, j++) {
    if (use && !use.has(type[j])) continue;
    const key = [0, 1, 2].map((a) => Math.min(G - 1, Math.floor((pts[i + a] + 1) / 2 * G))).join();
    const c = cells.get(key) ?? cells.set(key, [0, 0, 0, 0]).get(key);
    c[0] += pts[i]; c[1] += pts[i + 1]; c[2] += pts[i + 2]; c[3]++;
  }
  // Each cell's centre of mass, densest first; a seeded jitter shuffles near-equal cells
  const rand = mulberry32(seed);
  const spots = [...cells.values()].map(([x, y, z, n]) => ({ p: [x / n, y / n, z / n], w: n * (0.75 + rand() * 0.5) }))
    .sort((a, b) => b.w - a.w);
  const dir = (p) => { const l = Math.hypot(...p) || 1; return p.map((v) => v / l); };
  const away = (d, list) => list.every((o) => Math.acos(Math.max(-1, Math.min(1, o[0] * d[0] + o[1] * d[1] + o[2] * d[2]))) > apart);
  const others = taken.map(dir), out = [];
  for (const sp of spots) {
    const d = dir(sp.p);
    if (away(d, others) && away(d, out.map((o) => o.d))) out.push({ p: sp.p, d });
    if (out.length === count) break;
  }
  return out.map((o) => o.p);
}

// A label is a flag stuck into the sphere: a pole straight out from its spot, a shoulder
// running along the sphere's surface direction, and the text printed on that flag. All
// three are 3D, so they turn with the sphere: the text squashes when seen edge-on and reads
// mirrored at the back. Opacity follows how far round to the front the spot has turned.
// proj maps a turned 3D point to the screen; p is the spot, already turned. A label's own
// alpha and colors (from its data type) win over the shared ones in L
function drawLabel(ctx, item, proj, R, unit, L) {
  const { p, text, alpha = 1, color = L.color, textColor = L.textColor, boxColor = L.boxColor } = item;
  const l = Math.hypot(p[0], p[1], p[2]) || 1, n = p.map((v) => v / l);
  // The shoulder runs along the surface, to the right when the spot faces you
  let e = [n[2], 0, -n[0]];
  const el = Math.hypot(e[0], e[2]);
  e = el < 1e-3 ? [1, 0, 0] : e.map((v) => v / el);
  const B = n.map((v) => v * (1 + L.length)); // the pole's tip
  ctx.font = `500 ${L.size * unit}px ${L.font}`;
  const tw = ctx.measureText(text).width, pad = 5 * unit;
  // The text's box on the flag: sits just above the shoulder, text centred in it
  const bh = L.size * unit + 6 * unit, bw = tw + pad * 2, bottom = -2 * unit;
  const w = 1 / R; // world units per pixel at the sphere's middle
  const along = (q, d, k) => [q[0] + d[0] * k, q[1] + d[1] * k, q[2] + d[2] * k];
  const S = along(B, e, Math.max(L.shoulder * unit, bw) * w);
  const [dx, dy] = proj(p), [bx, by] = proj(B), [sx, sy] = proj(S);
  const t = (B[2] / (1 + L.length) + 1) / 2;
  ctx.globalAlpha = alpha * (L.minOpacity + (1 - L.minOpacity) * Math.pow(Math.min(1, Math.max(0, t)), 1.6));
  ctx.strokeStyle = ctx.fillStyle = color; // line and dot
  ctx.lineWidth = Math.max(1, 0.9 * unit);
  ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(bx, by); ctx.lineTo(sx, sy); ctx.stroke();
  ctx.beginPath(); ctx.arc(dx, dy, 2.2 * unit, 0, Math.PI * 2); ctx.fill();
  // The text's own axes on screen: along the shoulder, and up; a pixel of text is a
  // pixel of world at the middle, so it shrinks and squashes as the flag turns
  const [ax, ay] = proj(along(B, e, w)), [ux, uy] = proj(along(B, [0, 1, 0], w));
  ctx.save();
  ctx.setTransform(ax - bx, ay - by, bx - ux, by - uy, bx, by);
  if (L.box) {
    ctx.fillStyle = boxColor;
    ctx.beginPath(); ctx.roundRect(0, bottom - bh, bw, bh, 2 * unit); ctx.fill();
  }
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, pad, bottom - bh / 2);
  ctx.restore();
  ctx.globalAlpha = 1;
}

// How each type is drawn: its color and strength. Types not shown are dimmed (in faded
// color, or grey) when dimOthers is on, and left out when it is off
export function typeStyles({ colors, shown, dimOthers, dimAmount, dimStyle, grey = '#8A8A8F' }) {
  return colors.map((c, i) => shown[i] ? { color: c, alpha: 1 }
    : dimOthers ? { color: dimStyle === 'grey' ? grey : c, alpha: 1 - dimAmount } : null);
}

// One frame: the sphere turned by angle (radians) about the vertical, in light
// perspective; points toward the back fade by depthFade
export function drawSphere(ctx, w, h, { pts, type }, { angle, size, styles, background, depthFade, zoom, labels }) {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  const R = Math.min(w, h) * 0.38 * zoom, cx = w / 2, cy = h / 2, cam = 4;
  const unit = R / 228; // point size is in pixels for a 600px frame, and scales with the sphere
  const c = Math.cos(angle), s = Math.sin(angle);
  // Points sorted into a few brightness bins per type, so the fill changes only a few times
  // a frame. Dimmed types go first, so the shown ones sit on top
  const BINS = 8, bins = styles.map(() => Array.from({ length: BINS }, () => []));
  for (let i = 0, j = 0; i < pts.length; i += 3, j++) {
    if (!styles[type[j]]) continue;
    const x = pts[i] * c - pts[i + 2] * s, z = pts[i] * s + pts[i + 2] * c, y = pts[i + 1];
    const k = cam / (cam - z); // nearer points sit a little farther out
    const t = (z + 1) / 2; // 0 back, 1 front
    bins[type[j]][Math.min(BINS - 1, Math.floor((1 - depthFade * (1 - t)) * BINS))].push(cx + x * R * k, cy - y * R * k, k);
  }
  const order = styles.map((st, i) => i).filter((i) => styles[i]).sort((a, b) => styles[a].alpha - styles[b].alpha);
  for (const ti of order) {
    const [r, g, b] = hex(styles[ti].color);
    bins[ti].forEach((list, bi) => {
      ctx.fillStyle = `rgba(${r},${g},${b},${((bi + 1) / BINS) * styles[ti].alpha})`;
      for (let i = 0; i < list.length; i += 3) {
        const d = size * unit * list[i + 2];
        ctx.fillRect(list[i] - d / 2, list[i + 1] - d / 2, d, d);
      }
    });
  }
  // Labels turn with the sphere, the ones at the back first so the front ones sit on top
  if (labels?.items.length) {
    const proj = ([x, y, z]) => { const k = cam / (cam - z); return [cx + x * R * k, cy - y * R * k]; };
    const turned = labels.items.map((it) => ({ ...it, p: [it.p[0] * c - it.p[2] * s, it.p[1], it.p[0] * s + it.p[2] * c] }))
      .sort((a, b) => a.p[2] - b.p[2]);
    for (const l of turned) drawLabel(ctx, l, proj, R, unit, labels);
  }
}

// A seamless GIF: exactly one full turn, so the last frame leads straight into the first.
// Only each drawn color over the background ever shows, so the palette is those blends
export async function sphereGIF(cloud, look, { size, frames, seconds }, onProgress) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const a = hex(look.background);
  const inks = [...new Set([...look.styles.filter(Boolean).map((st) => st.color.toLowerCase()),
    ...(look.labels?.items.length ? [look.labels.color, look.labels.textColor, ...(look.labels.box ? [look.labels.boxColor] : [])] : [])])].map(hex);
  const steps = Math.max(2, Math.floor(255 / Math.max(1, inks.length)));
  const palette = [a, ...inks.flatMap((b) => Array.from({ length: steps }, (_, i) => a.map((v, k) => Math.round(v + (b[k] - v) * ((i + 1) / steps)))))].slice(0, 256);
  const gif = GIFEncoder();
  const delay = Math.round((seconds * 1000) / frames);
  for (let i = 0; i < frames; i++) {
    drawSphere(ctx, size, size, cloud, { ...look, angle: (i / frames) * Math.PI * 2 });
    const { data } = ctx.getImageData(0, 0, size, size);
    gif.writeFrame(applyPalette(data, palette), size, size, { palette, delay });
    onProgress?.(i + 1, frames);
    await new Promise((r) => setTimeout(r)); // let the page breathe between frames
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
