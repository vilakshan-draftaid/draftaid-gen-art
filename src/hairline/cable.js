// The cable support assembly (drawing "Cable Support (19)"): a body with a base plate,
// two rounded uprights and two gussets; a grooved roller between the uprights; a pin
// through all three. Exploding slides the pin out, then lifts the roller out of the clevis
import { HL, toRing, inset } from './solids.js';

const { rings, prism, rrect, circ, fillet, clamp, lerp } = HL;

// Sizes in mm, from the drawing. x along the base and the pin, y across, z up
const BASE = { x: 87, y: 23, t: 14, holes: [[-75, -12], [-75, 12], [75, -12], [75, 12]] };
const AXIS = 46;
const UP = { r: 23, inner: 16, outer: 35 };
const ROLLER = { R: 28, groove: 20, flange: 7, half: 14, hub: 13 };
const PIN = { r: 7, half: 35 };
const LIFT = 92, SLIDE = 105;
const UPZ = [BASE.t, AXIS + UP.r];

const uR = (() => {
  const pts = [[-UP.r, BASE.t], [UP.r, BASE.t]];
  for (let k = 0; k <= 24; k++) { const a = (Math.PI * k) / 24; pts.push([UP.r * Math.cos(a), AXIS + UP.r * Math.sin(a)]); }
  return toRing(pts);
})();
const uI = inset(uR, 1.6);
const gR = (dir) => toRing(fillet([[UP.outer * dir, BASE.t], [(UP.outer + 38) * dir, BASE.t], [UP.outer * dir, BASE.t + 30]], [0.5, 2, 2]));
const gussets = [gR(-1), gR(1)];
const [foot, footI] = rings(-BASE.x, -BASE.y, BASE.x, BASE.y, 4, 1.6);
const hole = circ(5, 32);
const fl = circ(ROLLER.R, 72), flI = inset(fl, 1.6), core = circ(ROLLER.groove, 72), coreI = inset(core, 1.2);
const pinR = circ(PIN.r, 48), pinI = inset(pinR, 1.2);
const X = [1, 0, 0], NX = [-1, 0, 0], UPN = [0, 0, 1];

export const cable = {
  name: 'Cable support',
  groups: [{ value: 'body', label: 'Body' }, { value: 'roller', label: 'Roller' }, { value: 'pin', label: 'Pin' }],
  rest: 'roller',
  bounds: [-BASE.x, PIN.half + SLIDE, -ROLLER.R, ROLLER.R, 0, AXIS + LIFT + ROLLER.R],
  pieces(t, T) {
    // The pin leaves first, then the roller lifts once the pin has cleared it
    const dx = lerp(0, SLIDE, clamp(t / 0.6, 0, 1)), dz = lerp(0, LIFT, clamp((t - 0.35) / 0.65, 0, 1));
    const out = [];
    out.push({ key: 'base', owner: 'body', ...prism(T.P, T.front, foot, footI, 0, BASE.t),
      marks: BASE.holes.map(([x, y]) => ({ d: T.onTop(hole, BASE.t, x, y), n: UPN })),
      box: [-BASE.x, BASE.x, -BASE.y, BASE.y, 0, BASE.t] });
    gussets.forEach((ring, i) => {
      const s = i ? 1 : -1;
      out.push({ key: `gusset${i}`, owner: 'body', ...T.ySolid(ring, inset(ring, 1.2), -4, 4),
        box: [s < 0 ? -UP.outer - 38 : UP.outer, s < 0 ? -UP.outer : UP.outer + 38, -4, 4, BASE.t, BASE.t + 30] });
    });
    // Uprights, with the pin hole on both faces
    for (const [key, a, b] of [['upFar', -UP.outer, -UP.inner], ['upNear', UP.inner, UP.outer]]) {
      out.push({ key, owner: 'body', ...T.xSolid(uR, uI, a, b),
        marks: [{ d: T.ringX(b, 0, AXIS, PIN.r), n: X }, { d: T.ringX(a, 0, AXIS, PIN.r), n: NX }],
        box: [a, b, -UP.r, UP.r, ...UPZ] });
    }
    // Pin: only the parts outside the uprights can show
    const a = -PIN.half + dx, b = PIN.half + dx;
    const segs = [[a, Math.min(b, -UP.outer)], [Math.max(a, -UP.inner), Math.min(b, UP.inner)], [Math.max(a, UP.outer), b]];
    segs.forEach(([s0, s1], i) => {
      const on = s1 > s0 + 0.01;
      out.push({ key: `pin${i}`, owner: 'pin', ...(on ? T.xSolid(pinR, pinI, s0, s1, AXIS) : { sil: '' }),
        box: [s0, s1, -PIN.r, PIN.r, AXIS - PIN.r, AXIS + PIN.r] });
    });
    // Roller: far flange, grooved core, near flange; hub and bore on both outer faces
    const z = AXIS + dz, h = ROLLER.half, f = ROLLER.flange;
    const disc = (key, ring, inner, r, x0, x1, marks = []) => out.push({ key, owner: 'roller',
      ...T.xSolid(ring, inner, x0, x1, z), marks, box: [x0, x1, -r, r, z - r, z + r] });
    const face = (x, n) => [{ d: T.ringX(x, 0, z, ROLLER.hub), n }, { d: T.ringX(x, 0, z, PIN.r), n }];
    disc('flFar', fl, flI, ROLLER.R, -h, -h + f, face(-h, NX));
    disc('core', core, coreI, ROLLER.groove, -h + f, h - f);
    disc('flNear', fl, flI, ROLLER.R, h - f, h, face(h, X));
    return out;
  },
};
