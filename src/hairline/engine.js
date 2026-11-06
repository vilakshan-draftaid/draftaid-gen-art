// Runs a Hairline assembly: a model's pieces, drawn from any turn of the camera.
// A model gives its pieces for an explode t (0 assembled, 1 apart); each piece is a
// silhouette, a crease, marks on faces, and its box. Turning the camera changes which
// piece is in front, so the paint order is worked out from the boxes on every draw
import { HL, tools } from './solids.js';

const { Cam, fit, clamp, spring, stepS, mk, disposer, register, inject } = HL;

// a before b (a is farther) when their boxes are apart along an axis; null when they overlap
function farther(a, b, V) {
  const [ax0, ax1, ay0, ay1, az0, az1] = a.box, [bx0, bx1, by0, by1, bz0, bz1] = b.box, e = 0.01;
  if (az1 <= bz0 + e) return true; // the camera looks down, so lower is farther
  if (bz1 <= az0 + e) return false;
  if (ax1 <= bx0 + e) return V[0] >= 0;
  if (bx1 <= ax0 + e) return V[0] < 0;
  if (ay1 <= by0 + e) return V[1] >= 0;
  if (by1 <= ay0 + e) return V[1] < 0;
  return null;
}

// Back to front: every piece after the ones it must cover, centre depth breaking ties
function paintOrder(list, V) {
  const d = (p) => { const b = p.box; return ((b[0] + b[1]) * V[0] + (b[2] + b[3]) * V[1] + (b[4] + b[5]) * V[2]) / 2; };
  const n = list.length, behind = list.map(() => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const f = farther(list[i], list[j], V);
    if (f === true) behind[j].push(i);
    else if (f === false) behind[i].push(j);
  }
  const out = [], done = new Set(), left = new Set(list.map((_, i) => i));
  while (left.size) {
    // the nearest-to-back piece whose pieces behind are all drawn; a cycle falls back to depth
    let pick = -1;
    for (const i of left) if (behind[i].every((k) => done.has(k)) && (pick < 0 || d(list[i]) < d(list[pick]))) pick = i;
    if (pick < 0) for (const i of left) if (pick < 0 || d(list[i]) < d(list[pick])) pick = i;
    out.push(list[pick]); done.add(pick); left.delete(pick);
  }
  return out;
}

export function mount(model, { stage, svg }, { explode = 0.3, part = 'none', turn = 45 } = {}) {
  inject(document);
  const bag = disposer();
  const g = mk('g', {}, svg);
  const groups = new Map(); // piece key -> its group, made on first use
  let C, T, last = '';
  let hl = part;

  // The camera turns about the assembly's middle, at a scale that fits every turn and pose
  const [x0, x1, y0, y1, z0, z1] = model.bounds;
  const reach = Math.hypot(x1 - x0, y1 - y0);
  const S = Math.min(372 / reach, 290 / ((z1 - z0) * Math.sqrt(0.75) + reach * 0.5));
  const corners = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) corners.push([x, y, z]);
  const camera = (deg) => {
    C = Cam(deg, 0.5, S);
    // Centred on the box's middle, which stays put while the camera turns
    const m = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    fit(C, [m, m], 200, 166);
    T = tools(C);
  };
  camera(turn);

  const groupFor = (p) => {
    let s = groups.get(p.key);
    if (!s) {
      const sg = mk('g', {}, g);
      s = { g: sg, sil: mk('path', { class: 'sil' }, sg), cr: mk('path', { class: 'nf lo' }, sg), marks: [] };
      groups.set(p.key, s);
    }
    return s;
  };

  const sp = spring(clamp(explode, 0, 1));
  let drawnT = -1, dirty = true;
  const draw = () => {
    if (!dirty && Math.abs(sp.x - drawnT) < 1e-4) return;
    drawnT = sp.x; dirty = false;
    const pieces = model.pieces(sp.x, T);
    const seen = new Set();
    for (const p of pieces) {
      const s = groupFor(p);
      seen.add(p.key);
      s.g.style.display = p.sil ? '' : 'none';
      s.sil.setAttribute('d', p.sil || '');
      s.cr.setAttribute('d', p.crease || '');
      s.sil.classList.toggle('hi', p.owner === hl);
      // Marks show only on faces turned toward the camera
      const marks = (p.marks || []).filter((m) => !m.n || m.n[0] * T.V[0] + m.n[1] * T.V[1] + m.n[2] * T.V[2] > 0.02);
      while (s.marks.length < marks.length) s.marks.push(mk('path', { class: 'nf' }, s.g));
      s.marks.forEach((el, i) => el.setAttribute('d', marks[i]?.d ?? ''));
      s.owner = p.owner;
    }
    for (const [k, s] of groups) if (!seen.has(k)) s.g.style.display = 'none';
    // Reorder only when the order changes (rule 06: move the group, do not redraw)
    const order = paintOrder(pieces.filter((p) => p.sil), T.V);
    const sig = order.map((p) => p.key).join('|');
    if (sig !== last) { last = sig; for (const p of order) g.appendChild(groups.get(p.key).g); }
  };
  const B = register(stage, (dt) => { const moving = stepS(sp, dt); draw(); return moving; });
  bag.add(B.unregister);
  draw();

  bag.add(() => svg.replaceChildren());
  return {
    set: (v) => { sp.t = clamp(v, 0, 1); B.wake(); },
    turn: (deg) => { camera(deg); dirty = true; draw(); },
    highlight: (name) => { hl = name; for (const s of groups.values()) s.sil.classList.toggle('hi', s.owner === name); },
    destroy: bag.dispose,
  };
}
