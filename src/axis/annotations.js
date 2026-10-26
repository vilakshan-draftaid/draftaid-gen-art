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

function makeLabel(text, material) {
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
  const scale = S.text / FONT_PX;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * scale, h * scale), mat);
  mesh.userData = { text, size: S.text }; // for the vector snapshot
  return mesh;
}

function buildSet(view, dims, face) {
  const B = VIEW_BASIS[view];
  const segs = [], csegs = [], hsegs = [], tris = [], labels = [];

  const proj = (p) => {
    const v = V(...p);
    return [v.dot(B.right), v.dot(B.up)];
  };
  const arrow = (tu, tv, du, dv) => {
    const bu = tu - du * S.arrow, bv = tv - dv * S.arrow;
    const nu = -dv * S.arrowW, nv = du * S.arrowW;
    tris.push(tu, tv, bu + nu, bv + nv, bu - nu, bv - nv);
  };

  for (const d of dims) {
    if (d.type === 'linear') {
      const pa = proj(d.a), pb = proj(d.b);
      const ax = AXIS[d.axis];
      const perp = AXIS[IN_PLANE[view].find((k) => k !== d.axis)];
      const tw = textWidth(d.text);
      const horizontal = Math.abs(ax.dot(B.right)) > 0.5;

      if (horizontal) {
        const vAt = d.at * perp.dot(B.up);
        for (const [u, v] of [pa, pb]) {
          const s = Math.sign(vAt - v) || 1;
          segs.push(u, v + s * S.gap, u, vAt + s * S.over);
        }
        const u1 = Math.min(pa[0], pb[0]), u2 = Math.max(pa[0], pb[0]);
        const ty = vAt + S.textGap + S.text / 2;
        if (u2 - u1 > tw + 3 * S.arrow) {
          segs.push(u1, vAt, u2, vAt);
          arrow(u1, vAt, -1, 0);
          arrow(u2, vAt, 1, 0);
          labels.push({ text: d.text, u: (u1 + u2) / 2, v: ty, rot: 0 });
        } else {
          const ext = S.arrow * 2.5;
          segs.push(u1 - ext, vAt, u2 + ext, vAt);
          arrow(u1, vAt, 1, 0);
          arrow(u2, vAt, -1, 0);
          labels.push({ text: d.text, u: u2 + ext + S.gap + tw / 2, v: ty, rot: 0 });
        }
      } else {
        const uAt = d.at * perp.dot(B.right);
        for (const [u, v] of [pa, pb]) {
          const s = Math.sign(uAt - u) || 1;
          segs.push(u + s * S.gap, v, uAt + s * S.over, v);
        }
        const v1 = Math.min(pa[1], pb[1]), v2 = Math.max(pa[1], pb[1]);
        const tx = uAt - S.textGap - S.text / 2;
        if (v2 - v1 > tw + 3 * S.arrow) {
          segs.push(uAt, v1, uAt, v2);
          arrow(uAt, v1, 0, -1);
          arrow(uAt, v2, 0, 1);
          labels.push({ text: d.text, u: tx, v: (v1 + v2) / 2, rot: Math.PI / 2 });
        } else {
          const ext = S.arrow * 2.5;
          segs.push(uAt, v1 - ext, uAt, v2 + ext);
          arrow(uAt, v1, 0, 1);
          arrow(uAt, v2, 0, -1);
          labels.push({ text: d.text, u: tx, v: v2 + ext + S.gap + tw / 2, rot: Math.PI / 2 });
        }
      }
    } else if (d.type === 'leader') {
      const [cu, cv] = proj(d.c);
      const a = (d.angle * Math.PI) / 180;
      const s0 = (((d.start ?? d.angle) * Math.PI) / 180);
      const du = Math.cos(a), dv = Math.sin(a);
      const p0 = [cu + d.r * Math.cos(s0), cv + d.r * Math.sin(s0)];
      const len = d.len ?? S.leader;
      const p1 = [p0[0] + du * len, p0[1] + dv * len];
      const side = Math.sign(du) || 1;
      const p2 = [p1[0] + side * S.shoulder, p1[1]];
      segs.push(...p0, ...p1, ...p1, ...p2);
      arrow(p0[0], p0[1], -du, -dv);
      const tw = textWidth(d.text);
      labels.push({ text: d.text, u: p2[0] + side * (S.gap + tw / 2), v: p2[1], rot: 0 });
    } else if (d.type === 'cross') {
      const [u, v] = proj(d.c);
      const e = d.r + 4;
      csegs.push(u - e, v, u + e, v, u, v - e, u, v + e);
    } else if (d.type === 'center' || d.type === 'hidden') {
      const pa = proj(d.a), pb = proj(d.b);
      (d.type === 'center' ? csegs : hsegs).push(...pa, ...pb);
    }
  }

  const to3 = (u, v) => B.right.clone().multiplyScalar(u)
    .addScaledVector(B.up, v)
    .addScaledVector(B.normal, face);

  const flat = (arr) => {
    const out = [];
    for (let i = 0; i < arr.length; i += 2) out.push(...to3(arr[i], arr[i + 1]).toArray());
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
    const m = makeLabel(l.text, mats.label);
    const r = B.right.clone().multiplyScalar(Math.cos(l.rot)).addScaledVector(B.up, Math.sin(l.rot));
    const u = B.right.clone().multiplyScalar(-Math.sin(l.rot)).addScaledVector(B.up, Math.cos(l.rot));
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, B.normal));
    m.position.copy(to3(l.u, l.v)).addScaledVector(B.normal, 0.05);
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

export function buildAnnotations(dims, bbox) {
  const dim = bbox.getSize(V());
  setScale(Math.max(dim.x, dim.y, dim.z));
  const root = new THREE.Group();
  const sets = {};
  for (const view of ['x', 'y', 'z']) {
    const face = bbox.max[view] + BOX_PAD;
    sets[view] = buildSet(view, dims.filter((d) => d.view === view), face);
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

export function disposeAnnotations(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
}
