import { mulberry32 } from './shared.js';

// Seeded 2D noise. Every type returns roughly 0..1; fbm layers octaves of it.
export const NOISE_TYPES = [
  { value: 'perlin', label: 'Perlin' },
  { value: 'simplex', label: 'Simplex' },
  { value: 'value', label: 'Value' },
  { value: 'cellular', label: 'Cellular' },
];

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

export function makeNoise(type, seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const hash = (x, y) => perm[(perm[x & 255] + y) & 511];
  const grad = (h, x, y) => {
    const a = (h / 256) * Math.PI * 2;
    return Math.cos(a) * x + Math.sin(a) * y;
  };

  if (type === 'value') {
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), u = fade(x - xi), v = fade(y - yi);
      const n = (a, b) => hash(xi + a, yi + b) / 255;
      return lerp(lerp(n(0, 0), n(1, 0), u), lerp(n(0, 1), n(1, 1), u), v);
    };
  }
  if (type === 'simplex') {
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    return (x, y) => {
      const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s);
      const t = (i + j) * G2, x0 = x - (i - t), y0 = y - (j - t);
      const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
      const corners = [[x0, y0, 0, 0], [x0 - i1 + G2, y0 - j1 + G2, i1, j1], [x0 - 1 + 2 * G2, y0 - 1 + 2 * G2, 1, 1]];
      let n = 0;
      for (const [cx, cy, di, dj] of corners) {
        const r = 0.5 - cx * cx - cy * cy;
        if (r > 0) n += r ** 4 * grad(hash(i + di, j + dj), cx, cy);
      }
      return 0.5 + n * 35;
    };
  }
  if (type === 'cellular') {
    // Distance to the nearest scattered point (Worley F1)
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      let d = Infinity;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const h = hash(xi + a, yi + b), h2 = hash(xi + a + 57, yi + b + 113);
        const px = xi + a + h / 255, py = yi + b + h2 / 255;
        d = Math.min(d, Math.hypot(px - x, py - y));
      }
      return 1 - Math.min(1, d);
    };
  }
  // Perlin
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = fade(xf), v = fade(yf);
    const g = (a, b) => grad(hash(xi + a, yi + b), xf - a, yf - b);
    return 0.5 + lerp(lerp(g(0, 0), g(1, 0), u), lerp(g(0, 1), g(1, 1), u), v) * 0.7;
  };
}

// Octaves of noise, each twice as fine and half as strong
export function fbm(noise, x, y, octaves) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * freq + o * 17.3, y * freq + o * 9.1) * amp;
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}
