// The refrigerator valve fixture (drawing "Assembly, Refrigerator Valve"), main parts only:
// a slipper plate, two brackets, the slider between them, and the screw shaft with its
// handle. Exploding lifts the bracket off the screw, backs the shaft and handle out along
// it, then lifts the slider and bracket1 off the plate, as the drawing's exploded view does
import { HL, inset } from './solids.js';

const { rings, prism, rrect, circ, clamp, lerp } = HL;

const PLATE = { x: 55, y: 28, t: 10 };
const AXIS = 27; // screw height
const B1 = [-55, -38, -28, 28, PLATE.t, 50]; // bracket1, the fixed end
const SL = [-34, -2, -20, 20, PLATE.t, 40]; // slider
const BR = [18, 34, -28, 28, PLATE.t, 54]; // bracket, the screw goes through it
const SHAFT = { r: 4.5, x0: -2, x1: 52, collar: [8, 12, 6.5] };
const HANDLE = { neck: [52, 58, 8], knob: [58, 72, 17] };
const SLIDE = 70, LIFT = { bracket1: 40, slider: 72, bracket: 44 };

const box = (b, r = 2, bev = 1.4) => rings(b[0], b[2], b[1], b[3], r, bev);
const [plate, plateI] = box([-PLATE.x, PLATE.x, -PLATE.y, PLATE.y], 3, 1.6);
const holeTop = circ(3.5, 28);
const slot = (x0, x1, y0, y1) => rrect(x0, y0, x1, y1, (y1 - y0) / 2, 6);
const cyl = (r) => { const ring = circ(r, 56); return [ring, inset(ring, Math.min(1.2, r * 0.2))]; };
const [shaftR, shaftI] = cyl(SHAFT.r), [collarR, collarI] = cyl(SHAFT.collar[2]);
const [neckR, neckI] = cyl(HANDLE.neck[2]), [knobR, knobI] = cyl(HANDLE.knob[2]);
const X = [1, 0, 0], NX = [-1, 0, 0], UPN = [0, 0, 1];

export const valve = {
  name: 'Refrigerator valve',
  groups: [{ value: 'body', label: 'Body' }, { value: 'slider', label: 'Slider' }, { value: 'shaft', label: 'Shaft + handle' }],
  rest: 'shaft',
  bounds: [-PLATE.x, HANDLE.knob[1] + SLIDE, -PLATE.y, PLATE.y, 0, SL[5] + LIFT.slider],
  pieces(t, T) {
    const ease = (a, b) => clamp((t - a) / (b - a), 0, 1);
    const z3 = lerp(0, LIFT.bracket, ease(0, 0.4)), dx = lerp(0, SLIDE, ease(0.25, 0.7));
    const z1 = lerp(0, LIFT.bracket1, ease(0.5, 1)), z2 = lerp(0, LIFT.slider, ease(0.45, 1));
    const out = [];
    // A block standing on the plate, lifted by dz
    const block = (key, owner, b, dz, marks = []) => {
      const [r, ri] = box(b);
      out.push({ key, owner, ...prism(T.P, T.front, r, ri, b[4] + dz, b[5] + dz), marks, box: [b[0], b[1], b[2], b[3], b[4] + dz, b[5] + dz] });
    };
    // Slipper plate: the slider's slot and four screw holes on top
    out.push({ key: 'plate', owner: 'body', ...prism(T.P, T.front, plate, plateI, 0, PLATE.t), marks: [
      { d: T.onTop(slot(-12, 12, -4, 4), PLATE.t), n: UPN },
      ...[[-45, -18], [-45, 18], [45, -18], [45, 18]].map(([x, y]) => ({ d: T.onTop(holeTop, PLATE.t, x, y), n: UPN })),
    ], box: [-PLATE.x, PLATE.x, -PLATE.y, PLATE.y, 0, PLATE.t] });
    // Bracket1: a channel across its top for the part it holds
    block('bracket1', 'body', B1, z1, [{ d: T.onTop(slot(-51, -42, -10, 10), B1[5] + z1), n: UPN }]);
    // Slider: a guide slot on top, the screw's seat on its face
    block('slider', 'slider', SL, z2, [
      { d: T.onTop(slot(-28, -8, -3.5, 3.5), SL[5] + z2), n: UPN },
      { d: T.ringX(SL[1], 0, AXIS + z2, SHAFT.r + 1.5), n: X },
    ]);
    // Bracket: the screw's hole on both faces
    block('bracket', 'body', BR, z3, [
      { d: T.ringX(BR[1], 0, AXIS + z3, SHAFT.r + 1), n: X },
      { d: T.ringX(BR[0], 0, AXIS + z3, SHAFT.r + 1), n: NX },
    ]);
    // Shaft: only the parts outside the bracket can show; the collar sits between
    const bar = (key, owner, ring, inner, r, x0, x1, marks = []) => {
      const on = x1 > x0 + 0.01;
      out.push({ key, owner, ...(on ? T.xSolid(ring, inner, x0, x1, AXIS) : { sil: '' }), marks: on ? marks : [],
        box: [x0, x1, -r, r, AXIS - r, AXIS + r] });
    };
    const a = SHAFT.x0 + dx, b = SHAFT.x1 + dx;
    // Once the bracket has lifted clear, nothing hides the shaft
    const [h0, h1] = BR[4] + z3 > AXIS + SHAFT.collar[2] ? [b, b] : [BR[0], BR[1]];
    const c0 = SHAFT.collar[0] + dx, c1 = SHAFT.collar[1] + dx;
    bar('shaftIn', 'shaft', shaftR, shaftI, SHAFT.r, a, Math.min(c0, h0));
    bar('collar', 'shaft', collarR, collarI, SHAFT.collar[2], c0, c1);
    bar('shaftMid', 'shaft', shaftR, shaftI, SHAFT.r, Math.max(c1, a), Math.min(b, h0));
    bar('shaftOut', 'shaft', shaftR, shaftI, SHAFT.r, Math.max(a, c1, h1), b);
    // Handle: a neck and a round knob with a dished face
    bar('neck', 'shaft', neckR, neckI, HANDLE.neck[2], HANDLE.neck[0] + dx, HANDLE.neck[1] + dx);
    bar('knob', 'shaft', knobR, knobI, HANDLE.knob[2], HANDLE.knob[0] + dx, HANDLE.knob[1] + dx, [
      { d: T.ringX(HANDLE.knob[1] + dx, 0, AXIS, HANDLE.knob[2] - 5), n: X },
      { d: T.ringX(HANDLE.knob[0] + dx, 0, AXIS, HANDLE.knob[2] - 5), n: NX },
    ]);
    return out;
  },
};
