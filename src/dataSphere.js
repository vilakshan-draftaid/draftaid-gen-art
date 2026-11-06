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

// The points, as a flat [x, y, z, ...] array inside the unit sphere.
// depth: 0 keeps them on the skin, 1 fills the whole ball. Density only: the noise decides
// how likely a point is to land at a place; spread is the chance it lands where noise is low
export function spherePoints({ seed, count, depth, scale, octaves, clustering, spread }) {
  const rand = mulberry32(seed);
  const n3 = noise3(rand);
  const off = [rand() * 100, rand() * 100, rand() * 100];
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
  const out = new Float32Array(count * 3);
  let n = 0;
  for (let tries = 0; n < count && tries < count * 80; tries++) {
    // A uniform direction, and a radius uniform by volume through the shell
    let x, y, z, l;
    do { x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-6);
    const r = Math.cbrt(inner + (1 - inner) * rand()) / Math.sqrt(l);
    x *= r; y *= r; z *= r;
    if (rand() > density(x, y, z)) continue;
    out[n * 3] = x; out[n * 3 + 1] = y; out[n * 3 + 2] = z;
    n++;
  }
  return out.subarray(0, n * 3);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// One frame: the sphere turned by angle (radians) about the vertical, in light
// perspective; points toward the back fade by depthFade
export function drawSphere(ctx, w, h, pts, { angle, size, color, background, depthFade, zoom }) {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  const R = Math.min(w, h) * 0.38 * zoom, cx = w / 2, cy = h / 2, cam = 4;
  const unit = R / 228; // point size is in pixels for a 600px frame, and scales with the sphere
  const c = Math.cos(angle), s = Math.sin(angle);
  const [r, g, b] = hex(color);
  // Points sorted into a few brightness bins, so the fill changes only a few times a frame
  const BINS = 8, bins = Array.from({ length: BINS }, () => []);
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i] * c - pts[i + 2] * s, z = pts[i] * s + pts[i + 2] * c, y = pts[i + 1];
    const k = cam / (cam - z); // nearer points sit a little farther out
    const t = (z + 1) / 2; // 0 back, 1 front
    bins[Math.min(BINS - 1, Math.floor((1 - depthFade * (1 - t)) * BINS))].push(cx + x * R * k, cy - y * R * k, k);
  }
  bins.forEach((list, bi) => {
    ctx.fillStyle = `rgba(${r},${g},${b},${(bi + 1) / BINS})`;
    for (let i = 0; i < list.length; i += 3) {
      const d = size * unit * list[i + 2];
      ctx.fillRect(list[i] - d / 2, list[i + 1] - d / 2, d, d);
    }
  });
}

// A seamless GIF: exactly one full turn, so the last frame leads straight into the first.
// Only the point color over the background ever shows, so the palette is that blend
export async function sphereGIF(pts, look, { size, frames, seconds }, onProgress) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const a = hex(look.background), b = hex(look.color);
  const palette = Array.from({ length: 64 }, (_, i) => a.map((v, k) => Math.round(v + (b[k] - v) * (i / 63))));
  const gif = GIFEncoder();
  const delay = Math.round((seconds * 1000) / frames);
  for (let i = 0; i < frames; i++) {
    drawSphere(ctx, size, size, pts, { ...look, angle: (i / frames) * Math.PI * 2 });
    const { data } = ctx.getImageData(0, 0, size, size);
    gif.writeFrame(applyPalette(data, palette), size, size, { palette, delay });
    onProgress?.(i + 1, frames);
    await new Promise((r) => setTimeout(r)); // let the page breathe between frames
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
