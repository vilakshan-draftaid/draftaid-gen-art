import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Vector snapshot: rebuilds what's on screen as SVG paths and text, so it pastes
// into Figma as editable layers. Part edges are creases, boundaries and
// silhouettes; hidden ones are dropped by testing against a depth map.

const CREASE = Math.cos(THREE.MathUtils.degToRad(20));
const DEPTH_SCALE = 2; // depth map resolution per CSS pixel
const EPS_MM = 1.5; // depth tolerance so edges don't hide behind their own faces

const depthMaterial = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }',
});

// Edge adjacency per geometry, built once
const adjacency = new WeakMap();
function edgesOf(geometry) {
  if (adjacency.has(geometry)) return adjacency.get(geometry);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geometry.getAttribute('position').clone());
  if (geometry.index) g.setIndex(geometry.index.clone());
  const m = mergeVertices(g, 1e-4);
  const pos = m.getAttribute('position'), idx = m.index.array;
  const verts = [];
  for (let i = 0; i < pos.count; i++) verts.push(new THREE.Vector3().fromBufferAttribute(pos, i));
  const normals = [], tris = [], map = new Map();
  const tri = new THREE.Triangle();
  for (let t = 0; t < idx.length / 3; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    tris.push([a, b, c]);
    normals.push(tri.set(verts[a], verts[b], verts[c]).getNormal(new THREE.Vector3()));
    for (const [i, j] of [[a, b], [b, c], [c, a]]) {
      const k = i < j ? `${i}_${j}` : `${j}_${i}`;
      const e = map.get(k);
      if (e) e.tris.push(t); else map.set(k, { i, j, tris: [t] });
    }
  }
  const edges = [...map.values()];
  const neighbors = tris.map(() => []);
  for (const e of edges) if (e.tris.length === 2) { neighbors[e.tris[0]].push(e.tris[1]); neighbors[e.tris[1]].push(e.tris[0]); }
  const out = { verts, normals, tris, neighbors, edges };
  adjacency.set(geometry, out);
  g.dispose(); m.dispose();
  return out;
}

function depthMap(renderer, scene, camera, w, h) {
  const W = Math.round(w * DEPTH_SCALE), H = Math.round(h * DEPTH_SCALE);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType });
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0xffffff, 1);
  renderer.clear();
  scene.overrideMaterial = depthMaterial;
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
  const buf = new Float32Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  const mm = 1 / (camera.far - camera.near);
  const at = (x, y) => buf[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4];
  // Visible if nothing is in front at this pixel. The tolerance grows with the
  // surface's slope so edges on steep, nearly edge-on faces don't flicker away.
  return (x, y, z) => {
    const px = Math.round(x * DEPTH_SCALE), py = H - 1 - Math.round(y * DEPTH_SCALE);
    const d = at(px, py);
    let slope = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = at(px + dx, py + dy);
      if (n < 1) slope = Math.max(slope, Math.abs(n - d));
    }
    return z <= d + EPS_MM * mm + Math.min(slope, 8 * mm);
  };
}

export function vectorSnapshot({ renderer, scene, camera, w, h, lead, edges, faces, transparent, background }) {
  scene.updateMatrixWorld();
  const visible = depthMap(renderer, scene, camera, w, h);
  const v = new THREE.Vector3();
  const toScreen = (p) => {
    v.copy(p).project(camera);
    return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h, v.z * 0.5 + 0.5];
  };
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const grow = (x, y, r = 0) => {
    box.x0 = Math.min(box.x0, x - r); box.y0 = Math.min(box.y0, y - r);
    box.x1 = Math.max(box.x1, x + r); box.y1 = Math.max(box.y1, y + r);
  };

  // Splits a 3D segment into its visible screen runs
  const visibleRuns = (a, b) => {
    const A = toScreen(a), B = toScreen(b);
    const n = Math.max(2, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 1.5));
    const runs = [];
    let start = null, prev = null;
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const P = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
      const on = visible(P[0], P[1], P[2]);
      if (on && !start) start = P;
      if (!on && start) { runs.push([start, prev]); start = null; }
      prev = P;
    }
    if (start) runs.push([start, prev]);
    return runs.filter(([p, q]) => p !== q);
  };

  // Part edges
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const segs = [];
  const nm = new THREE.Matrix3();
  lead.part.traverse((o) => {
    if (!o.isMesh) return;
    const { verts, normals, edges: list } = edgesOf(o.geometry);
    nm.getNormalMatrix(o.matrixWorld);
    const facing = normals.map((n) => n.clone().applyMatrix3(nm).dot(forward) < 0);
    const wa = new THREE.Vector3(), wb = new THREE.Vector3();
    for (const e of list) {
      // Where pieces meet flush, an edge carries two faces that continue flat: not a real edge
      if (e.tris.length > 2 && e.tris.some((a, i) => e.tris.some((b, j) => j > i && normals[a].dot(normals[b]) > 0.999))) continue;
      const [t0, t1] = e.tris;
      const keep = t1 === undefined
        || normals[t0].dot(normals[t1]) < CREASE
        || facing[t0] !== facing[t1];
      if (!keep) continue;
      if (t1 !== undefined && !facing[t0] && !facing[t1]) continue; // back crease
      wa.copy(verts[e.i]).applyMatrix4(o.matrixWorld);
      wb.copy(verts[e.j]).applyMatrix4(o.matrixWorld);
      for (const run of visibleRuns(wa, wb)) segs.push(run);
    }
  });

  const r = (n) => Math.round(n * 100) / 100;
  const hex = (c) => `#${c.getHexString()}`;
  const layers = [];
  if (faces) {
    const paths = solidFaces(lead, camera, renderer, w, h, toScreen, forward, faces.color).map((f) => {
      f.pts.forEach((p) => grow(p[0], p[1]));
      return `<path fill="${f.fill}" fill-rule="evenodd" d="${f.d}"/>`;
    });
    if (paths.length) layers.push(`<g id="Faces"${faces.opacity < 0.999 ? ` opacity="${r(faces.opacity)}"` : ''}>${paths.join('')}</g>`);
  }
  if (edges.visible && edges.opacity > 0.001) {
    const d = chain(segs).map((pts) => {
      pts.forEach((p) => grow(p[0], p[1]));
      return 'M' + pts.map((p) => `${r(p[0])} ${r(p[1])}`).join('L');
    });
    layers.push(`<g id="Edges" fill="none" stroke="${edges.color}" stroke-width="${r(edges.thickness * 1.25)}" stroke-linecap="round" stroke-linejoin="round"${edges.opacity < 1 ? ` stroke-opacity="${r(edges.opacity)}"` : ''}>`
      + `<path d="${d.join('')}"/></g>`);
  }

  // Dimensions, exactly as their materials show them
  const pxPerMm = (h / (camera.top - camera.bottom)) * camera.zoom;
  const dims = [];
  for (const [axis, set] of Object.entries(lead.anno.sets)) {
    if (set.opacity <= 0.01) continue;
    const parts = [];
    for (const o of set.group.children) {
      const mat = o.material, op = mat.opacity;
      const alpha = op < 0.999 ? ` opacity="${r(op)}"` : '';
      if (o.isLineSegments) {
        const pos = o.geometry.getAttribute('position');
        const a = new THREE.Vector3(), b = new THREE.Vector3();
        const dash = mat.isLineDashedMaterial;
        const lines = [];
        for (let i = 0; i < pos.count; i += 2) {
          a.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          b.fromBufferAttribute(pos, i + 1).applyMatrix4(o.matrixWorld);
          for (const [p, q] of visibleRuns(a, b)) {
            grow(p[0], p[1]); grow(q[0], q[1]);
            lines.push(dash ? [p, q] : `M${r(p[0])} ${r(p[1])}L${r(q[0])} ${r(q[1])}`);
          }
        }
        if (!lines.length) continue;
        if (dash) {
          const k = pxPerMm;
          parts.push(`<g fill="none" stroke="${hex(mat.color)}" stroke-dasharray="${r(mat.dashSize * k)} ${r(mat.gapSize * k)}"${alpha}>`
            + lines.map(([p, q]) => `<line x1="${r(p[0])}" y1="${r(p[1])}" x2="${r(q[0])}" y2="${r(q[1])}"/>`).join('') + '</g>');
        } else {
          parts.push(`<path fill="none" stroke="${hex(mat.color)}" d="${lines.join('')}"${alpha}/>`);
        }
      } else if (o.isMesh && o.userData.text) {
        o.getWorldPosition(a0);
        const [ox, oy, oz] = toScreen(a0);
        if (!visible(ox, oy, oz)) continue;
        const ex = toScreen(a1.set(1, 0, 0).applyMatrix4(o.matrixWorld));
        const ey = toScreen(a2.set(0, 1, 0).applyMatrix4(o.matrixWorld));
        const s = o.userData.size;
        grow(ox, oy, s * pxPerMm);
        parts.push(`<text transform="matrix(${r(ex[0] - ox)} ${r(ex[1] - oy)} ${r(ox - ey[0])} ${r(oy - ey[1])} ${r(ox)} ${r(oy)})" font-size="${r(s)}" dy="0.35em" fill="${hex(mat.color)}"${alpha}>${esc(o.userData.text)}</text>`);
      } else if (o.isMesh) {
        const pos = o.geometry.getAttribute('position');
        const tris = [];
        for (let i = 0; i < pos.count; i += 3) {
          const P = [0, 1, 2].map((k) => toScreen(a0.fromBufferAttribute(pos, i + k).applyMatrix4(o.matrixWorld)));
          const cx = (P[0][0] + P[1][0] + P[2][0]) / 3, cy = (P[0][1] + P[1][1] + P[2][1]) / 3, cz = (P[0][2] + P[1][2] + P[2][2]) / 3;
          if (!visible(cx, cy, cz)) continue;
          P.forEach((p) => grow(p[0], p[1]));
          tris.push('M' + P.map((p) => `${r(p[0])} ${r(p[1])}`).join('L') + 'Z');
        }
        if (tris.length) parts.push(`<path fill="${hex(mat.color)}" d="${tris.join('')}"${alpha}/>`);
      }
    }
    if (parts.length) dims.push(`<g id="${axis.toUpperCase()} dimensions">${parts.join('')}</g>`);
  }
  if (dims.length) {
    layers.push(`<g id="Dimensions" font-family="Switzer, 'Helvetica Neue', Arial, sans-serif" font-weight="500" text-anchor="middle">${dims.join('')}</g>`);
  }

  if (!isFinite(box.x0)) return null;
  const pad = 16;
  const x = r(box.x0 - pad), y = r(box.y0 - pad), W = r(box.x1 - box.x0 + pad * 2), H = r(box.y1 - box.y0 + pad * 2);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x} ${y} ${W} ${H}">`,
    transparent ? '' : `<rect x="${x}" y="${y}" width="${W}" height="${H}" fill="${background}"/>`,
    ...layers,
    '</svg>',
  ].join('\n');
}

const a0 = new THREE.Vector3(), a1 = new THREE.Vector3(), a2 = new THREE.Vector3();
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Joins segments that share endpoints into polylines
function chain(segs) {
  const key = (p) => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`;
  const ends = new Map();
  segs.forEach((s, i) => {
    for (const k of [key(s[0]), key(s[1])]) (ends.get(k) ?? ends.set(k, []).get(k)).push(i);
  });
  const used = new Uint8Array(segs.length);
  const next = (p) => (ends.get(key(p)) ?? []).find((i) => !used[i]);
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const pts = [segs[i][0], segs[i][1]];
    // extend forward, then backward
    for (let j = next(pts[pts.length - 1]); j !== undefined; j = next(pts[pts.length - 1])) {
      used[j] = 1;
      const s = segs[j];
      pts.push(key(s[0]) === key(pts[pts.length - 1]) ? s[1] : s[0]);
    }
    for (let j = next(pts[0]); j !== undefined; j = next(pts[0])) {
      used[j] = 1;
      const s = segs[j];
      pts.unshift(key(s[0]) === key(pts[0]) ? s[1] : s[0]);
    }
    out.push(pts);
  }
  return out;
}

// Visible faces as filled paths, far to near. Triangles are grouped into faces across
// smooth (non-crease) edges, and each face is shaded like the scene: hemisphere light
// plus the key light that rides with the camera (see Viewer.jsx).
const KEY = new THREE.Vector3(220, 320, 0);
const SKY = new THREE.Color(0xffffff), GROUND = new THREE.Color(0xa5a5a5);
function solidFaces(lead, camera, renderer, w, h, toScreen, forward, albedo) {
  const keyDir = KEY.clone().applyQuaternion(camera.quaternion).add(camera.position).normalize();
  const nm = new THREE.Matrix3(), n = new THREE.Vector3();
  const out = [];
  lead.part.traverse((o) => {
    if (!o.isMesh) return;
    const { verts, normals, tris, neighbors } = edgesOf(o.geometry);
    nm.getNormalMatrix(o.matrixWorld);
    const world = verts.map((v) => v.clone().applyMatrix4(o.matrixWorld));
    const screen = world.map((v) => toScreen(v));
    const wn = normals.map((v) => v.clone().applyMatrix3(nm).normalize());
    const front = wn.map((v) => v.dot(forward) < 0);
    const seen = new Uint8Array(tris.length);
    for (let t0 = 0; t0 < tris.length; t0++) {
      if (seen[t0] || !front[t0]) continue;
      // Flood fill one smooth, camera-facing face
      const group = [t0];
      seen[t0] = 1;
      for (let i = 0; i < group.length; i++) {
        for (const nb of neighbors[group[i]]) {
          if (seen[nb] || !front[nb] || normals[group[i]].dot(normals[nb]) < CREASE) continue;
          seen[nb] = 1;
          group.push(nb);
        }
      }
      // Average normal (for shading) and depth (tie-break when ordering)
      let depth = 0;
      n.set(0, 0, 0);
      for (const t of group) {
        const [A, B, C] = tris[t].map((k) => screen[k]);
        depth += (A[2] + B[2] + C[2]) / 3;
        const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]));
        n.addScaledVector(wn[t], area + 1e-6);
      }
      n.normalize();
      // Outline loops: edges used by only one triangle of the face
      const count = new Map();
      for (const t of group) {
        const [a, b, cc] = tris[t];
        for (const [i, j] of [[a, b], [b, cc], [cc, a]]) {
          const k = i < j ? `${i}_${j}` : `${j}_${i}`;
          const e = count.get(k);
          if (e) e.n++; else count.set(k, { i, j, n: 1 });
        }
      }
      const next = new Map();
      for (const e of count.values()) if (e.n === 1) {
        (next.get(e.i) ?? next.set(e.i, []).get(e.i)).push(e.j);
        (next.get(e.j) ?? next.set(e.j, []).get(e.j)).push(e.i);
      }
      const used = new Set(), pts = [];
      let d = '';
      for (const startV of next.keys()) {
        const loop = [startV];
        let prev = -1, cur = startV;
        for (;;) {
          const cand = (next.get(cur) || []).find((v) => v !== prev && !used.has(`${Math.min(cur, v)}_${Math.max(cur, v)}`));
          if (cand === undefined) break;
          used.add(`${Math.min(cur, cand)}_${Math.max(cur, cand)}`);
          prev = cur; cur = cand;
          if (cur === startV) break;
          loop.push(cur);
        }
        if (loop.length < 3) continue;
        const P = loop.map((k) => screen[k]);
        pts.push(...P);
        d += 'M' + P.map((p) => `${Math.round(p[0] * 100) / 100} ${Math.round(p[1] * 100) / 100}`).join('L') + 'Z';
      }
      if (!d) continue;
      // three's Lambert: albedo / PI x (hemisphere + key . n), in linear space
      const hemi = GROUND.clone().lerp(SKY, n.y * 0.5 + 0.5).multiplyScalar(1.1);
      const light = hemi.add(new THREE.Color(1.5 * Math.max(0, n.dot(keyDir)), 1.5 * Math.max(0, n.dot(keyDir)), 1.5 * Math.max(0, n.dot(keyDir))));
      const col = albedo.clone().multiply(light).multiplyScalar(1 / Math.PI);
      col.r = Math.min(1, col.r); col.g = Math.min(1, col.g); col.b = Math.min(1, col.b);
      out.push({
        d, pts, depth: depth / group.length, fill: `#${col.getHexString()}`,
        world: group.map((t) => tris[t].map((k) => world[k])), screen: group.map((t) => tris[t].map((k) => screen[k])),
      });
    }
  });
  return orderFaces(out, renderer, camera, w, h);
}

// Draw order from what actually covers what: render face ids with depth testing,
// then sample each face; wherever another face's id shows, that face goes on top.
// Faces with no visible pixel are dropped.
const idMaterial = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: 'attribute float faceId; varying float vId; void main() { vId = faceId; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying float vId; void main() { gl_FragColor = vec4(vId, 0.0, 0.0, 1.0); }',
});
function orderFaces(faces, renderer, camera, w, h) {
  const pos = [], ids = [];
  faces.forEach((f, i) => f.world.forEach((tri) => tri.forEach((v) => { pos.push(v.x, v.y, v.z); ids.push(i + 1); })));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('faceId', new THREE.Float32BufferAttribute(ids, 1));
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geo, idMaterial));
  const W = Math.round(w * DEPTH_SCALE), H = Math.round(h * DEPTH_SCALE);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType });
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, camera);
  const buf = new Float32Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose(); geo.dispose();
  const idAt = (x, y) => {
    const px = Math.round(x * DEPTH_SCALE), py = H - 1 - Math.round(y * DEPTH_SCALE);
    return px < 0 || py < 0 || px >= W || py >= H ? 0 : Math.round(buf[(py * W + px) * 4]);
  };

  // Sample each face's triangles every ~2px, a little inside so shared edges don't count
  const above = faces.map(() => new Set());
  const shown = faces.map(() => false);
  faces.forEach((f, i) => {
    for (const [A, B, C] of f.screen) {
      const span = Math.max(Math.hypot(B[0] - A[0], B[1] - A[1]), Math.hypot(C[0] - A[0], C[1] - A[1]), Math.hypot(C[0] - B[0], C[1] - B[1]));
      const n = Math.min(40, Math.max(2, Math.ceil(span / 2)));
      for (let a = 1; a < n; a++) for (let b = 1; a + b < n; b++) {
        const u = a / n, v = b / n, t = 1 - u - v;
        const id = idAt(A[0] * t + B[0] * u + C[0] * v, A[1] * t + B[1] * u + C[1] * v);
        if (id === i + 1) shown[i] = true;
        else if (id) above[i].add(id - 1);
      }
      // tiny triangles: test the centroid
      if (n <= 2 && idAt((A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3) === i + 1) shown[i] = true;
    }
  });

  // Topological sort: a face is drawn once every face it covers is drawn; ties and
  // cycles fall back to far-to-near
  const keep = faces.map((_, i) => i).filter((i) => shown[i]);
  const below = new Map(keep.map((i) => [i, new Set()]));
  for (const i of keep) for (const j of above[i]) if (below.has(j) && j !== i) below.get(j).add(i);
  const order = [], done = new Set();
  const byDepth = [...keep].sort((a, b) => faces[b].depth - faces[a].depth);
  while (order.length < keep.length) {
    const ready = byDepth.find((i) => !done.has(i) && [...below.get(i)].every((j) => done.has(j)))
      ?? byDepth.find((i) => !done.has(i));
    done.add(ready);
    order.push(ready);
  }
  return order.map((i) => faces[i]);
}
