// A real engineering drawing built from primitives: sheet 13 bracket, third-angle projection.
// Shows visible, hidden, center and phantom-free line types, dimensions with arrows, leaders,
// a section view with hatching, cutting plane, datum, GD&T frame and a title block.
export function sampleDrawingSVG() {
  const W = 1190, H = 842, S = 4.3; // sheet px, px per part-mm
  const out = [];
  const f = (n) => Math.round(n * 100) / 100;
  const push = (s) => out.push(s);
  const L = (x1, y1, x2, y2, c = 'vis') => push(`<line class="${c}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`);
  const P = (d, c = 'vis') => push(`<path class="${c}" d="${d}"/>`);
  const C = (cx, cy, r, c = 'vis') => push(`<circle class="${c}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`);
  const T = (x, y, s, o = {}) => push(`<text x="${f(x)}" y="${f(y)}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.rot ? ` transform="rotate(${o.rot} ${f(x)} ${f(y)})"` : ''}${o.size ? ` font-size="${o.size}"` : ''}${o.cls ? ` class="${o.cls}"` : ''}>${s}</text>`);
  const arrowLine = (x1, y1, x2, y2) => push(`<line class="thin" marker-start="url(#a)" marker-end="url(#a)" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`);
  const leader = (x1, y1, x2, y2, x3) => push(`<polyline class="thin" marker-start="url(#a)" fill="none" points="${f(x1)},${f(y1)} ${f(x2)},${f(y2)} ${f(x3)},${f(y2)}"/>`);
  // horizontal dimension between part points xa, xb (screen), measured at screen yDim, features at yFeat
  const dimH = (xa, xb, yFeat, yDim, label) => {
    const g = 6 * Math.sign(yDim - yFeat), e = 6 * Math.sign(yDim - yFeat);
    L(xa, yFeat + g, xa, yDim + e, 'thin'); L(xb, yFeat + g, xb, yDim + e, 'thin');
    arrowLine(xa, yDim, xb, yDim); T((xa + xb) / 2, yDim - 6, label, { anchor: 'middle' });
  };
  const dimV = (ya, yb, xFeat, xDim, label) => {
    const g = 6 * Math.sign(xDim - xFeat);
    L(xFeat + g, ya, xDim + g, ya, 'thin'); L(xFeat + g, yb, xDim + g, yb, 'thin');
    arrowLine(xDim, ya, xDim, yb); T(xDim - 6, (ya + yb) / 2, label, { anchor: 'middle', rot: -90 });
  };

  push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  push(`<defs>
<marker id="a" viewBox="0 0 12 6" refX="12" refY="3" markerWidth="12" markerHeight="6" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L12,3 L0,6 z" fill="#111"/></marker>
<pattern id="hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#111" stroke-width="0.8"/></pattern>
<style>
.vis{stroke:#111;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}
.thin{stroke:#111;stroke-width:0.7;fill:none}
.hid{stroke:#111;stroke-width:0.9;fill:none;stroke-dasharray:7 4}
.ctr{stroke:#111;stroke-width:0.6;fill:none;stroke-dasharray:22 4 3 4}
.cut{stroke:#111;stroke-width:1.4;fill:none;stroke-dasharray:24 5 4 5}
text{font-family:"Inter Tight","Noto Sans Math","Noto Sans Symbols 2",Arial,sans-serif;font-size:15px;fill:#111}
.small{font-size:11px}.big{font-size:20px;font-weight:600}
</style></defs>`);
  push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  // sheet border with zone ticks
  push(`<rect class="vis" x="24" y="24" width="${W - 48}" height="${H - 48}"/>`);
  for (let i = 1; i < 8; i++) { const x = 24 + (i * (W - 48)) / 8; L(x, 24, x, 34, 'thin'); L(x, H - 24, x, H - 34, 'thin'); }
  for (let i = 1; i < 6; i++) { const y = 24 + (i * (H - 48)) / 6; L(24, y, 34, y, 'thin'); L(W - 24, y, W - 34, y, 'thin'); }
  'ABCDEFGH'.split('').forEach((z, i) => T(24 + ((i + 0.5) * (W - 48)) / 8, 19, String(i + 1), { anchor: 'middle', cls: 'small' }));

  // ---------- FRONT VIEW (x: -41..41, y: 0..77) ----------
  const fx = 330, fy = 668; // screen origin of part (x=0, y=0)
  const X = (x) => fx + x * S, Y = (y) => fy - y * S;
  const a = Math.atan2(10 - 58, 41) + Math.acos(19 / Math.hypot(41, 48)); // tangent angle
  const tx = 19 * Math.cos(a), ty = 58 + 19 * Math.sin(a);
  P(`M${X(-41)},${Y(0)} H${X(41)} V${Y(10)} H${X(-41)} Z`);
  P(`M${X(41)},${Y(10)} L${X(tx)},${Y(ty)} A${19 * S},${19 * S} 0 0 0 ${X(-tx)},${Y(ty)} L${X(-41)},${Y(10)}`);
  C(X(0), Y(58), 11 * S);
  P(`M${X(-5)},${Y(10)} V${Y(40)} H${X(5)} V${Y(10)}`); // rib face
  for (const hx of [-27, 27]) { // counterbored holes, hidden
    L(X(hx - 5), Y(0), X(hx - 5), Y(8), 'hid'); L(X(hx + 5), Y(0), X(hx + 5), Y(8), 'hid');
    L(X(hx - 10), Y(8), X(hx + 10), Y(8), 'hid'); L(X(hx - 10), Y(8), X(hx - 10), Y(10), 'hid'); L(X(hx + 10), Y(8), X(hx + 10), Y(10), 'hid');
    L(X(hx), Y(-3), X(hx), Y(13), 'ctr');
  }
  L(X(0), Y(-6), X(0), Y(82), 'ctr'); L(X(-16), Y(58), X(16), Y(58), 'ctr');
  // dimensions
  dimH(X(-41), X(41), Y(0), Y(-17), '82');
  dimH(X(-27), X(27), Y(0), Y(-8.5), '54');
  dimV(Y(0), Y(58), X(-41), X(-57), '58');
  dimV(Y(0), Y(77), X(-41), X(-66), '(77)');
  dimV(Y(0), Y(10), X(41), X(50), '10');
  dimV(Y(10), Y(40), X(5), X(14), '30');
  const hx = X(0) + Math.cos(-0.7) * 11 * S, hy = Y(58) + Math.sin(-0.7) * 11 * S;
  leader(hx, hy, X(24), Y(80), X(40)); T(X(25), Y(81), 'Ø22 H7');
  const rx = X(0) + Math.cos(-2.35) * 19 * S, ry = Y(58) + Math.sin(-2.35) * 19 * S;
  leader(rx, ry, X(-26), Y(86), X(-36)); T(X(-35.5), Y(87), 'R19');
  // GD&T feature control frame for the bore
  const gx = X(24), gy = Y(78) + 8;
  push(`<g class="thin"><rect x="${f(gx)}" y="${f(gy)}" width="26" height="24"/><rect x="${f(gx + 26)}" y="${f(gy)}" width="52" height="24"/><rect x="${f(gx + 78)}" y="${f(gy)}" width="24" height="24"/></g>`);
  T(gx + 13, gy + 17, '⊥', { anchor: 'middle' }); T(gx + 52, gy + 17, '0.05', { anchor: 'middle' }); T(gx + 90, gy + 17, 'A', { anchor: 'middle' });
  // datum A on the base bottom
  const dx = X(-35), dy = Y(0);
  P(`M${dx - 7},${dy} L${dx + 7},${dy} L${dx},${dy + 11} Z`, 'thin'); push(`<path d="M${dx - 7},${dy} L${dx + 7},${dy} L${dx},${dy + 11} Z" fill="#111"/>`);
  L(dx, dy + 11, dx, dy + 30, 'thin'); push(`<rect class="thin" x="${dx - 11}" y="${dy + 30}" width="22" height="22"/>`); T(dx, dy + 46, 'A', { anchor: 'middle' });
  T(X(0), Y(-30), 'FRONT VIEW', { anchor: 'middle', cls: 'small' });

  // ---------- TOP VIEW (above front, third angle). z: 0 back .. 38 front ----------
  const ty0 = 92; const Z = (z) => ty0 + z * S;
  P(`M${X(-41)},${Z(0)} H${X(41)} V${Z(24)} A${14 * S},${14 * S} 0 0 1 ${X(27)},${Z(38)} H${X(-27)} A${14 * S},${14 * S} 0 0 1 ${X(-41)},${Z(24)} Z`);
  L(X(-41), Z(12), X(41), Z(12)); // upright front face edge
  P(`M${X(-5)},${Z(12)} V${Z(36)} H${X(5)} V${Z(12)}`); // rib
  L(X(-11), Z(0), X(-11), Z(12), 'hid'); L(X(11), Z(0), X(11), Z(12), 'hid'); // bore, hidden
  for (const hx2 of [-27, 27]) {
    C(X(hx2), Z(24), 5 * S); C(X(hx2), Z(24), 10 * S);
    L(X(hx2 - 13), Z(24), X(hx2 + 13), Z(24), 'ctr'); L(X(hx2), Z(11), X(hx2), Z(37), 'ctr');
  }
  L(X(0), Z(-6), X(0), Z(44), 'ctr');
  dimV(Z(0), Z(38), X(41), X(56), '38');
  dimV(Z(0), Z(12), X(-41), X(-52), '12');
  const cx2 = X(27) + Math.cos(-0.8) * 10 * S, cy2 = Z(24) + Math.sin(-0.8) * 10 * S;
  leader(cx2, cy2, X(45), Z(-8), X(62)); T(X(45.5), Z(-9.2), '2× Ø10 ⌴ Ø20 ↧ 2');
  const r14x = X(-27) + Math.cos(2.3) * 14 * S, r14y = Z(24) + Math.sin(2.3) * 14 * S;
  leader(r14x, r14y, X(-50), Z(46), X(-58)); T(X(-57.5), Z(44.8), '2× R14');
  // cutting plane A-A through x = 0
  L(X(0), Z(-12), X(0), Z(-4), 'cut'); L(X(0), Z(42), X(0), Z(50), 'cut');
  push(`<line class="thin" marker-end="url(#a)" x1="${f(X(0))}" y1="${f(Z(-12))}" x2="${f(X(-9))}" y2="${f(Z(-12))}"/>`);
  push(`<line class="thin" marker-end="url(#a)" x1="${f(X(0))}" y1="${f(Z(50))}" x2="${f(X(-9))}" y2="${f(Z(50))}"/>`);
  T(X(-11), Z(-10.5), 'A', { cls: 'big', anchor: 'end' }); T(X(-11), Z(52), 'A', { cls: 'big', anchor: 'end' });
  T(X(0), Z(46), 'TOP VIEW', { anchor: 'middle', cls: 'small' });

  // ---------- SECTION A-A (right of front). u = 38 - z, front at left ----------
  const sx = 610; const U = (u) => sx + u * S;
  const sec1 = `M${U(0)},${Y(0)} L${U(38)},${Y(0)} L${U(38)},${Y(47)} L${U(26)},${Y(47)} L${U(26)},${Y(40)} L${U(2)},${Y(10)} L${U(0)},${Y(10)} Z`;
  const sec2 = `M${U(26)},${Y(69)} L${U(38)},${Y(69)} L${U(38)},${Y(77)} L${U(26)},${Y(77)} Z`;
  push(`<path d="${sec1}" fill="url(#hatch)"/><path d="${sec2}" fill="url(#hatch)"/>`);
  P(sec1); P(sec2);
  L(U(26), Y(47), U(26), Y(69)); L(U(38), Y(47), U(38), Y(69)); // bore surface behind the cut
  L(U(23), Y(58), U(41), Y(58), 'ctr');
  dimH(U(0), U(38), Y(0), Y(-8.5), '38');
  dimH(U(26), U(38), Y(77), Y(84), '12');
  dimV(Y(47), Y(69), U(38), U(47), 'Ø22');
  T(U(19), Y(-30), 'SECTION A-A', { anchor: 'middle', cls: 'big' });

  // ---------- NOTES ----------
  const nx = 840, ny = 300;
  T(nx, ny, 'NOTES', { cls: 'big' });
  ['1. MATERIAL: AL 6061-T6.', '2. BREAK ALL SHARP EDGES 0.5 × 45°.', '3. UNLESS OTHERWISE SPECIFIED, TOLERANCES ±0.1.', '4. DIMENSIONS IN MILLIMETRES.']
    .forEach((n, i) => T(nx, ny + 26 + i * 22, n, { cls: 'small' }));

  // ---------- TITLE BLOCK ----------
  const bx = 820, by = 690, bw = W - 24 - bx, bh = H - 24 - by;
  push(`<g class="vis"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}"/></g>`);
  L(bx, by + 44, bx + bw, by + 44, 'thin'); L(bx, by + 88, bx + bw, by + 88, 'thin');
  L(bx + 110, by, bx + 110, by + 44, 'thin'); L(bx + 230, by + 44, bx + 230, by + bh, 'thin'); L(bx + 120, by + 88, bx + 120, by + bh, 'thin');
  T(bx + 10, by + 16, 'DRAFTED BY', { cls: 'small' }); T(bx + 10, by + 35, 'Draftaid');
  T(bx + 120, by + 16, 'TITLE', { cls: 'small' }); T(bx + 120, by + 36, 'BRACKET, PILLOW BLOCK', { size: 15 });
  T(bx + 10, by + 60, 'DWG NO.', { cls: 'small' }); T(bx + 10, by + 80, 'DA-0013');
  T(bx + 240, by + 60, 'REV', { cls: 'small' }); T(bx + 240, by + 80, 'A');
  T(bx + 10, by + 104, 'SCALE', { cls: 'small' }); T(bx + 10, by + 124, 'NTS');
  T(bx + 130, by + 104, 'SHEET', { cls: 'small' }); T(bx + 130, by + 124, '1 OF 1');
  // third-angle projection symbol
  const px0 = bx + 270, py0 = by + 118;
  C(px0, py0, 12, 'thin'); C(px0, py0, 5, 'thin');
  P(`M${px0 + 26},${py0 - 7} L${px0 + 50},${py0 - 13} L${px0 + 50},${py0 + 13} L${px0 + 26},${py0 + 7} Z`, 'thin');
  L(px0 - 16, py0, px0 + 56, py0, 'ctr');

  push('</svg>');
  return out.join('\n');
}
