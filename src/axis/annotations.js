import * as THREE from 'three';

// Drafting-style dimensions laid out on the faces of a glass box around the part.
// Each dim is authored in part coordinates (mm) and projected onto its view's face.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const AXIS = { x: V(1, 0, 0), y: V(0, 1, 0), z: V(0, 0, 1) };
const IN_PLANE = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] };

// Screen basis of each axis view (matches the camera views in config.js)
export const VIEW_BASIS = {
  x: { right: V(0, 0, -1), up: V(0, 1, 0), normal: V(1, 0, 0) },
  y: { right: V(1, 0, 0), up: V(0, 0, -1), normal: V(0, 1, 0) },
  z: { right: V(1, 0, 0), up: V(0, 1, 0), normal: V(0, 0, 1) },
};

export const BOX_PAD = 40;

const BASE = { text: 4.2, arrow: 3.2, arrowW: 1.1, gap: 1.5, over: 2, textGap: 1.4, leader: 18, shoulder: 6 };
const S = { ...BASE };
// Scale drafting sizes with the part so labels read the same on every model;
// parts under 60mm shrink them too
function setScale(size) {
  const f = Math.max(size / 90, Math.min(1, size / 60));
  for (const k in BASE) S[k] = BASE[k] * f;
}
const FONT_PX = 64;
const FONT = `500 ${FONT_PX}px Switzer, 'Helvetica Neue', Arial, sans-serif`;
const COLORS = { line: '#434343', text: '#292929', center: '#a5a5a5', box: '#d6d6d6' };

const measureCtx = document.createElement('canvas').getContext('2d');
function textWidth(text) {
  measureCtx.font = FONT;
  return (measureCtx.measureText(text).width / FONT_PX) * S.text;
}

function makeLabel(text, material, size = 1) {
  const pad = 8;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = FONT;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = Math.ceil(FONT_PX * 1.3);
  canvas.width = w;
  canvas.height = h;
  ctx.font = FONT;
  ctx.fillStyle = '#ffffff'; // tinted by the material color
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + FONT_PX * 0.04);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = material.clone();
  mat.map = tex;
  mat.color.set(COLORS.text);
  const scale = (S.text * size) / FONT_PX;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * scale, h * scale), mat);
  mesh.userData = { text, size: S.text * size }; // for the vector snapshot
  return mesh;
}

// depthOf(d): how far along the view's normal each dimension's plane sits.
// surfaceAt(u, v): the part's surface depth under a point of the view, or null
// mid: the part's centre (part coordinates), so dimension lines know which way is "out"
function buildSet(view, dims, depthOf, surfaceAt = () => null, far = false, mid = V()) {
  const B = VIEW_BASIS[view];
  // segs / tris / labels hold the callout being tried; finished ones move to `kept`
  let segs = [], tris = [], labels = [], frames = [];
  const csegs = [], hsegs = [];
  const kept = { segs: [], tris: [], labels: [], frames: [] };
  // Points are stored as (u, v, depth) so every dimension can lie on its own plane
  let cur = 0;
  const add = (arr, ...uv) => { for (let i = 0; i < uv.length; i += 2) arr.push(uv[i], uv[i + 1], cur); };

  const proj = (p) => {
    const v = V(...p);
    return [v.dot(B.right), v.dot(B.up)];
  };
  const arrow = (tu, tv, du, dv) => {
    const bu = tu - du * S.arrow, bv = tv - dv * S.arrow;
    const nu = -dv * S.arrowW, nv = du * S.arrowW;
    add(tris, tu, tv, bu + nu, bv + nv, bu - nu, bv - nv);
  };
  // Filled dot, for a leader that lands on a surface rather than an edge
  const dot = (cu, cv) => {
    const r = S.arrowW * 1.3, n = 12;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, b = ((k + 1) / n) * Math.PI * 2;
      add(tris, cu, cv, cu + r * Math.cos(a), cv + r * Math.sin(a), cu + r * Math.cos(b), cv + r * Math.sin(b));
    }
  };

  const label = (text, u, v, rot = 0, size = 1, depth = cur) => labels.push({ text, u, v, rot, size, depth });
  // Front-most surface under some view points, lifted just proud of it; never behind `from`
  const lift = (from, pts) => {
    const near = pts.map(([u, v]) => surfaceAt(u, v)).filter((h) => h !== null)
      .map((h) => (far ? h - S.gap * 0.5 : h + S.gap * 0.5));
    return far ? Math.min(from, ...near) : Math.max(from, ...near);
  };
  const line = (arr, a, b, da = cur, db = da) => arr.push(a[0], a[1], da, b[0], b[1], db);

  // A dimension's text with its tolerance: ±tol inline, stacked +/- or limits small on the
  // right, a box around a basic dimension. Returns its width and a draw(center, rot)
  const SMALL = 0.62;
  const dimText = (d) => {
    const main = d.tol?.pm ? `${d.text} ±${d.tol.pm}` : d.text;
    const stack = d.tol?.plus !== undefined ? [d.tol.plus, d.tol.minus] : d.limits ?? null;
    const tw = textWidth(main);
    const sw = stack ? Math.max(...stack.map(textWidth)) * SMALL : 0;
    const gap = stack ? S.gap * 0.6 : 0;
    const pad = d.basic ? S.gap * 0.8 : 0;
    const width = tw + gap + sw + pad * 2;
    const draw = (cu, cv, rot) => {
      const al = [Math.cos(rot), Math.sin(rot)], up = [-Math.sin(rot), Math.cos(rot)];
      const at = (x, y) => [cu + al[0] * x + up[0] * y, cv + al[1] * x + up[1] * y];
      const mx = -width / 2 + pad + tw / 2;
      label(main, ...at(mx, 0), rot);
      if (stack) {
        const sx = -width / 2 + pad + tw + gap + sw / 2;
        label(stack[0], ...at(sx, S.text * 0.3), rot, SMALL);
        label(stack[1], ...at(sx, -S.text * 0.3), rot, SMALL);
      }
      if (d.basic) {
        const hx = tw / 2 + pad, hy = S.text * 0.75;
        const c = [at(mx - hx, -hy), at(mx + hx, -hy), at(mx + hx, hy), at(mx - hx, hy)];
        for (let i = 0; i < 4; i++) line(segs, c[i], c[(i + 1) % 4]);
      }
    };
    return { width, draw };
  };

  // Leader from a feature: tip on the feature (arrow, or dot on a surface), out along
  // `angle`, then a short shoulder. Returns the shoulder end, side and the lifted depth
  const leaderFrom = (d, extra = () => []) => {
    const [cu, cv] = proj(d.c);
    const a = (d.angle * Math.PI) / 180;
    const s0 = ((d.start ?? d.angle) * Math.PI) / 180;
    const du = Math.cos(a), dv = Math.sin(a);
    const p0 = [cu + (d.r ?? 0) * Math.cos(s0), cv + (d.r ?? 0) * Math.sin(s0)];
    const len = d.len ?? S.leader;
    const p1 = [p0[0] + du * len, p0[1] + dv * len];
    const side = Math.sign(du) || 1;
    const p2 = [p1[0] + side * S.shoulder, p1[1]];
    if (d.dot) dot(p0[0], p0[1]); else arrow(p0[0], p0[1], -du, -dv);
    // The tip stays on its surface; the rest climbs to whatever surface is front-most under
    // the text (a note from a pocket floor rises to the top face)
    const top = lift(cur, [p1, p2, ...extra(p2, side)]);
    line(segs, p0, p1, cur, top);
    line(segs, p1, p2, top);
    return { p2, side, top };
  };

  const emit = (d) => {
    if (d.type === 'linear') {
      const pa = proj(d.a), pb = proj(d.b);
      const ax = AXIS[d.axis];
      const perp = AXIS[IN_PLANE[view].find((k) => k !== d.axis)];
      const T = dimText(d);
      const tw = T.width;
      const horizontal = Math.abs(ax.dot(B.right)) > 0.5;

      if (horizontal) {
        const vAt = d.at * perp.dot(B.up);
        for (const [u, v] of [pa, pb]) {
          const s = Math.sign(vAt - v) || 1;
          add(segs, u, v + s * S.gap, u, vAt + s * S.over);
        }
        const u1 = Math.min(pa[0], pb[0]), u2 = Math.max(pa[0], pb[0]);
        const ty = vAt + S.textGap + S.text / 2 + (d.basic ? S.text * 0.2 : 0);
        if (u2 - u1 > tw + 3 * S.arrow) {
          add(segs, u1, vAt, u2, vAt);
          arrow(u1, vAt, -1, 0);
          arrow(u2, vAt, 1, 0);
          T.draw((u1 + u2) / 2, ty, 0);
        } else {
          const ext = S.arrow * 2.5;
          add(segs, u1 - ext, vAt, u2 + ext, vAt);
          arrow(u1, vAt, 1, 0);
          arrow(u2, vAt, -1, 0);
          T.draw(u2 + ext + S.gap + tw / 2, ty, 0);
        }
      } else {
        const uAt = d.at * perp.dot(B.right);
        for (const [u, v] of [pa, pb]) {
          const s = Math.sign(uAt - u) || 1;
          add(segs, u + s * S.gap, v, uAt + s * S.over, v);
        }
        const v1 = Math.min(pa[1], pb[1]), v2 = Math.max(pa[1], pb[1]);
        const tx = uAt - S.textGap - S.text / 2 - (d.basic ? S.text * 0.2 : 0);
        if (v2 - v1 > tw + 3 * S.arrow) {
          add(segs, uAt, v1, uAt, v2);
          arrow(uAt, v1, 0, -1);
          arrow(uAt, v2, 0, 1);
          T.draw(tx, (v1 + v2) / 2, Math.PI / 2);
        } else {
          const ext = S.arrow * 2.5;
          add(segs, uAt, v1 - ext, uAt, v2 + ext);
          arrow(uAt, v1, 0, 1);
          arrow(uAt, v2, 0, -1);
          T.draw(tx, v2 + ext + S.gap + tw / 2, Math.PI / 2);
        }
      }
    } else if (d.type === 'leader') {
      const T = dimText(d);
      const { p2, side, top } = leaderFrom(d, (p, sd) => [[p[0] + sd * (S.gap + T.width), p[1]]]);
      const save = cur; cur = top;
      T.draw(p2[0] + side * (S.gap + T.width / 2), p2[1], 0);
      cur = save;
    } else if (d.type === 'fcf') {
      // Feature control frame: [symbol, tolerance, datum, ...] in boxed cells
      const h = S.text * 1.7, padX = S.gap * 0.9;
      const widths = d.cells.map((c, i) => Math.max(h, textWidth(c) * (i === 0 ? 1.15 : 1) + padX * 2));
      const W = widths.reduce((a, b) => a + b, 0);
      const { p2, side, top } = leaderFrom(d, (p, sd) => [[p[0] + sd * W, p[1]], [p[0] + sd * W / 2, p[1] + h / 2]]);
      const x0 = side > 0 ? p2[0] : p2[0] - W, y0 = p2[1] - h / 2;
      const save = cur; cur = top;
      const rect = (ax, ay, bx, by) => {
        line(segs, [ax, ay], [bx, ay]); line(segs, [bx, ay], [bx, by]);
        line(segs, [bx, by], [ax, by]); line(segs, [ax, by], [ax, ay]);
      };
      rect(x0, y0, x0 + W, y0 + h);
      frames.push([x0, y0, x0 + W, y0 + h]);
      let x = x0;
      d.cells.forEach((c, i) => {
        if (i) line(segs, [x, y0], [x, y0 + h]);
        label(c, x + widths[i] / 2, y0 + h / 2, 0, i === 0 ? 1.15 : 1);
        x += widths[i];
      });
      cur = save;
    } else if (d.type === 'datum') {
      // Datum feature symbol: filled triangle on the feature, a line, the letter in a box
      const [cu, cv] = proj(d.c);
      const a = (d.angle * Math.PI) / 180, du = Math.cos(a), dv = Math.sin(a);
      const len = d.len ?? S.leader * 0.7, tb = S.arrow * 1.1, h = S.text * 1.6;
      const apex = [cu + du * tb, cv + dv * tb];
      const bw = S.arrowW * 2.4;
      add(tris, cu - dv * bw, cv + du * bw, cu + dv * bw, cv - du * bw, apex[0], apex[1]);
      const p1 = [cu + du * len, cv + dv * len];
      const c = [p1[0] + du * h / 2, p1[1] + dv * h / 2];
      const top = lift(cur, [p1, c]);
      line(segs, apex, p1, cur, top);
      const save = cur; cur = top;
      const r = h / 2;
      frames.push([c[0] - r, c[1] - r, c[0] + r, c[1] + r]);
      line(segs, [c[0] - r, c[1] - r], [c[0] + r, c[1] - r]); line(segs, [c[0] + r, c[1] - r], [c[0] + r, c[1] + r]);
      line(segs, [c[0] + r, c[1] + r], [c[0] - r, c[1] + r]); line(segs, [c[0] - r, c[1] + r], [c[0] - r, c[1] - r]);
      label(d.letter, c[0], c[1], 0, 1.05);
      cur = save;
    } else if (d.type === 'cross') {
      const [u, v] = proj(d.c);
      const e = d.r + 4;
      add(csegs, u - e, v, u + e, v, u, v - e, u, v + e);
    } else if (d.type === 'center' || d.type === 'hidden') {
      const pa = proj(d.a), pb = proj(d.b);
      add(d.type === 'center' ? csegs : hsegs, ...pa, ...pb);
    }
  };

  // Overlap avoidance, per view: every callout is tried at its authored spot, then at
  // alternatives (dimension lines step further out; leaders, frames and datums lengthen
  // and swing), and the first spot clear of everything already placed is kept
  const pad = S.gap * 0.6;
  const boxOf = (l) => {
    const w = textWidth(l.text) * l.size + pad * 2, h = S.text * l.size * 1.2 + pad;
    const vertical = Math.abs(Math.sin(l.rot)) > 0.5;
    const [bw, bh] = vertical ? [h, w] : [w, h];
    return [l.u - bw / 2, l.v - bh / 2, l.u + bw / 2, l.v + bh / 2];
  };
  const segsOf = (arr) => {
    const out = [];
    for (let i = 0; i + 5 < arr.length; i += 6) out.push([arr[i], arr[i + 1], arr[i + 3], arr[i + 4]]);
    return out;
  };
  const boxesHit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const segHitsBox = ([x1, y1, x2, y2], [l, t, r, b]) => {
    // Clip the segment to the box (Liang-Barsky); any part left inside means a hit
    let u0 = 0, u1 = 1;
    const dx = x2 - x1, dy = y2 - y1;
    for (const [p, q] of [[-dx, x1 - l], [dx, r - x1], [-dy, y1 - t], [dy, b - y1]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const u = q / p;
      if (p < 0) { if (u > u1) return false; if (u > u0) u0 = u; } else { if (u < u0) return false; if (u < u1) u1 = u; }
    }
    return u1 - u0 > 0.02;
  };
  const grow = ([l, t, r, b]) => [l - pad, t - pad, r + pad, b + pad];
  // A frame's own outline lines don't count against it, only against other callouts
  const clashes = () => {
    const mine = [...labels.map(boxOf), ...frames.map(grow)], lines = segsOf(segs);
    const theirs = [...kept.labels.map(boxOf), ...kept.frames.map(grow)], theirLines = segsOf(kept.segs);
    let n = 0;
    for (const a of mine) {
      for (const b of theirs) if (boxesHit(a, b)) n += 3;
      for (const sg of theirLines) if (segHitsBox(sg, a)) n += 1;
    }
    for (const sg of lines) for (const b of theirs) if (segHitsBox(sg, b)) n += 1;
    return n;
  };
  const options = (d) => {
    if (d.type === 'linear') {
      const perp = IN_PLANE[view].find((k) => k !== d.axis);
      const out = Math.sign(d.at - mid[perp]) || 1;
      return Array.from({ length: 7 }, (_, k) => ({ ...d, at: d.at + out * k * S.text * 2.4 }));
    }
    if (d.type === 'leader' || d.type === 'fcf' || d.type === 'datum') {
      const base = d.len ?? (d.type === 'datum' ? S.leader * 0.7 : S.leader);
      const tries = [];
      for (const off of [0, 15, -15, 30, -30, 45, -45, 60, -60, 90, -90, 135, -135, 180]) {
        for (const f of [1, 1.5, 2.1, 2.8]) tries.push({ cost: Math.abs(off) / 15 + (f - 1) * 2, d: { ...d, angle: d.angle + off, len: base * f } });
      }
      return tries.sort((a, b) => a.cost - b.cost).map((t) => t.d);
    }
    return [d];
  };
  // Linear dimensions first, shortest span nearest the part (drafting convention), then the rest
  const span = (d) => (d.type === 'linear' ? V(...d.a).sub(V(...d.b)).length() : Infinity);
  const order = [...dims].sort((a, b) => (a.type === 'linear') === (b.type === 'linear') ? span(a) - span(b) : a.type === 'linear' ? -1 : 1);
  for (const d of order) {
    cur = depthOf(d);
    let best = null;
    for (const o of options(d)) {
      segs = []; tris = []; labels = []; frames = [];
      emit(o);
      const n = clashes();
      if (!best || n < best.n) best = { n, segs, tris, labels, frames };
      if (n === 0) break;
    }
    kept.segs.push(...best.segs); kept.tris.push(...best.tris); kept.labels.push(...best.labels); kept.frames.push(...best.frames);
  }
  segs = kept.segs; tris = kept.tris; labels = kept.labels;

  const to3 = (u, v, w) => B.right.clone().multiplyScalar(u)
    .addScaledVector(B.up, v)
    .addScaledVector(B.normal, w);

  const flat = (arr) => {
    const out = [];
    for (let i = 0; i < arr.length; i += 3) out.push(...to3(arr[i], arr[i + 1], arr[i + 2]).toArray());
    return new THREE.Float32BufferAttribute(out, 3);
  };

  const mats = {
    line: new THREE.LineBasicMaterial({ color: COLORS.line, transparent: true }),
    center: new THREE.LineDashedMaterial({ color: COLORS.center, dashSize: 7, gapSize: 2, transparent: true }),
    hidden: new THREE.LineDashedMaterial({ color: COLORS.line, dashSize: 2.5, gapSize: 1.5, transparent: true }),
    fill: new THREE.MeshBasicMaterial({ color: COLORS.line, side: THREE.DoubleSide, transparent: true }),
    label: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  };

  const group = new THREE.Group();
  const addLines = (arr, mat) => {
    if (!arr.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', flat(arr));
    const l = new THREE.LineSegments(g, mat);
    if (mat.isLineDashedMaterial) l.computeLineDistances();
    group.add(l);
  };
  addLines(segs, mats.line);
  addLines(csegs, mats.center);
  addLines(hsegs, mats.hidden);
  if (tris.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', flat(tris));
    group.add(new THREE.Mesh(g, mats.fill));
  }

  const labelMeshes = labels.map((l) => {
    const m = makeLabel(l.text, mats.label, l.size ?? 1);
    const r = B.right.clone().multiplyScalar(Math.cos(l.rot)).addScaledVector(B.up, Math.sin(l.rot));
    const u = B.right.clone().multiplyScalar(-Math.sin(l.rot)).addScaledVector(B.up, Math.cos(l.rot));
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, B.normal));
    m.position.copy(to3(l.u, l.v, l.depth)).addScaledVector(B.normal, 0.05);
    group.add(m);
    return m;
  });

  const labelMats = labelMeshes.map((m) => m.material);
  const materials = [mats.line, mats.center, mats.hidden, mats.fill, ...labelMats];
  const ink = [mats.line, mats.hidden, mats.fill, ...labelMats];
  return { group, materials, ink, faint: [mats.center], labels: labelMeshes, normal: B.normal, opacity: -1, flipped: false };
}

export function setOpacity(set, o) {
  if (Math.abs(set.opacity - o) < 0.001) return;
  set.opacity = o;
  set.group.visible = o > 0.001;
  set.materials.forEach((m) => { m.opacity = o; });
}

// Recolor all drafting lines and labels; center and box lines sit between color and background
const _faint = new THREE.Color();
export function setAnnotationColor(anno, color, background) {
  const bg = new THREE.Color(background);
  const c = new THREE.Color(color);
  for (const set of Object.values(anno.sets)) {
    set.ink.forEach((m) => m.color.copy(c));
    set.faint.forEach((m) => m.color.copy(_faint.copy(bg).lerp(c, 0.45)));
  }
  anno.box.materials[0].color.copy(_faint.copy(bg).lerp(c, 0.2));
}

// spread scales how far dimensions sit from the part: the face each view's set lies on,
// how far linear dimension lines stand off the part, and leader lengths
function spreadDims(dims, bbox, spread) {
  if (spread === 1) return dims;
  return dims.map((d) => {
    if (d.type === 'leader' || d.type === 'fcf') return { ...d, len: (d.len ?? S.leader) * spread };
    if (d.type === 'datum') return { ...d, len: (d.len ?? S.leader * 0.7) * spread };
    if (d.type !== 'linear') return d;
    const perp = IN_PLANE[d.view].find((k) => k !== d.axis);
    const lo = bbox.min[perp], hi = bbox.max[perp];
    const at = d.at > hi ? hi + (d.at - hi) * spread : d.at < lo ? lo + (d.at - lo) * spread : d.at;
    return { ...d, at };
  });
}

// placement 'features' lays each dimension on the part's front-most surface under the
// feature it measures, just proud of it (found by casting rays along the view axis into
// `part`); 'glass' puts each view's dimensions on a glass box face around the part.
// mirror flips both to the part's far side, for a mirrored iso camera
export function buildAnnotations(dims, bbox, spread = 1, mirror = {}, placement = 'features', part = null) {
  const dim = bbox.getSize(V());
  setScale(Math.max(dim.x, dim.y, dim.z));
  const root = new THREE.Group();
  const sets = {};
  const spreadOut = spreadDims(dims, bbox, spread);
  const AXIS_INDEX = { x: 0, y: 1, z: 2 };
  for (const view of ['x', 'y', 'z']) {
    const far = !!mirror?.[view], k = AXIS_INDEX[view];
    const glass = far ? bbox.min[view] - BOX_PAD * spread : bbox.max[view] + BOX_PAD * spread;
    const proud = S.gap * 0.5; // off the surface, so it never sinks into the face it sits on
    const surface = surfaceAlong(part, view, far, bbox);
    const depthOf = placement === 'glass' || !part ? () => glass : (d) => {
      const hits = [d.a, d.b, d.c].filter(Boolean).map(surface).filter((h) => h !== null);
      if (!hits.length) return far ? bbox.min[view] - proud : bbox.max[view] + proud;
      return far ? Math.min(...hits) - proud : Math.max(...hits) + proud;
    };
    const surfaceAt = placement === 'glass' || !part ? undefined : (u, v) => {
      const B = VIEW_BASIS[view];
      const pt = B.right.clone().multiplyScalar(u).addScaledVector(B.up, v);
      return surface(pt.toArray());
    };
    sets[view] = buildSet(view, spreadOut.filter((d) => d.view === view), depthOf, surfaceAt, far, bbox.getCenter(V()));
    root.add(sets[view].group);
  }

  // Glass box outline
  const size = bbox.getSize(V()).addScalar(BOX_PAD * 2);
  const boxMat = new THREE.LineBasicMaterial({ color: COLORS.box, transparent: true });
  const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)), boxMat);
  box.position.copy(bbox.getCenter(V()));
  root.add(box);
  const boxSet = { group: box, materials: [boxMat], opacity: -1 };

  return { group: root, sets, box: boxSet, radius: bbox.clone().expandByScalar(BOX_PAD).getBoundingSphere(new THREE.Sphere()).radius };
}

// Depth of the part's surface seen along the view axis at a point (part coordinates), or
// null when the ray misses. Points often sit on an edge, so a few rays around it are tried
// and the nearest surface wins
const ray = new THREE.Raycaster();
function surfaceAlong(part, view, far, bbox) {
  if (!part) return () => null;
  part.updateMatrixWorld(true);
  const k = { x: 0, y: 1, z: 2 }[view];
  const dir = V(0, 0, 0); dir.setComponent(k, far ? 1 : -1);
  const start = (far ? bbox.min[view] : bbox.max[view]) + (far ? -1 : 1) * 1000;
  const offsets = [[0, 0], [0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]];
  const [i, j] = [0, 1, 2].filter((n) => n !== k);
  return (p) => {
    let best = null;
    for (const [oi, oj] of offsets) {
      const o = V(...p);
      o.setComponent(i, p[i] + oi); o.setComponent(j, p[j] + oj); o.setComponent(k, start);
      o.add(part.position); // rays run in world space; the part is offset to centre it
      ray.set(o, dir);
      const hit = ray.intersectObject(part, true)[0];
      if (!hit) continue;
      const d = hit.point.getComponent(k) - part.position.getComponent(k);
      if (best === null || (far ? d < best : d > best)) best = d;
    }
    return best;
  };
}

export function disposeAnnotations(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
}
