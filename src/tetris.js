// Tetris layouts: a stack built by really dropping pieces, plus a few caught
// mid-fall above it. `fallen` (0..1) rewinds the drops: the last pieces to land
// lift back off the stack and hover above where they land.

const BASE = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};

// Every distinct rotation of each piece, cells as [col, row] from the top-left
const normalize = (cells) => {
  const x0 = Math.min(...cells.map((c) => c[0])), y0 = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - x0, y - y0]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
export const PIECES = Object.values(BASE).map((cells) => {
  const turns = [];
  let c = cells;
  for (let k = 0; k < 4; k++) {
    const n = normalize(c);
    if (!turns.some((t) => JSON.stringify(t) === JSON.stringify(n))) turns.push(n);
    c = c.map(([x, y]) => [-y, x]);
  }
  return turns;
});

export function tetrisLayout({ columns, rows, height, falling, fallen = 1, colors, rand }) {
  const board = Array.from({ length: rows }, () => Array(columns).fill(null));
  const fits = (cells, x, y) => cells.every(([dx, dy]) => {
    const c = x + dx, r = y + dy;
    return c >= 0 && c < columns && r >= 0 && r < rows && !board[r][c];
  });
  const pick = () => {
    const turns = PIECES[Math.floor(rand() * PIECES.length)];
    return turns[Math.floor(rand() * turns.length)];
  };
  let last = -1;
  const color = () => {
    let c = Math.floor(rand() * colors);
    if (colors > 1 && c === last) c = (c + 1) % colors; // neighbours differ more often
    return (last = c);
  };

  // How good a landing is, the way a player judges it: low, flat, few holes
  const score = (cells, x, y) => {
    const filled = new Set(cells.map(([dx, dy]) => `${x + dx},${y + dy}`));
    const at = (c, r) => board[r][c] || filled.has(`${c},${r}`);
    let holes = 0, height = 0, bump = 0, prev = null;
    for (let c = 0; c < columns; c++) {
      let top = rows;
      for (let r = 0; r < rows; r++) if (at(c, r)) { top = r; break; }
      for (let r = top + 1; r < rows; r++) if (!at(c, r)) holes++;
      height = Math.max(height, rows - top);
      if (prev !== null) bump += Math.abs(top - prev);
      prev = top;
    }
    return -height - holes * 3 - bump * 0.4 + rand() * 2.5; // the random part keeps it human
  };

  // Stack: pieces keep dropping until it is `height` rows tall; each takes the best
  // landing of every turn and column
  const stackHeight = () => {
    const top = board.findIndex((row) => row.some(Boolean));
    return top === -1 ? 0 : rows - top;
  };
  // No line clears, so the drops can be rewound
  const drops = [];
  for (let n = 0; n < 500 && stackHeight() < Math.min(height, rows - 2); n++) {
    const turns = PIECES[Math.floor(rand() * PIECES.length)];
    let best = null;
    for (const cells of turns) {
      const w = Math.max(...cells.map((c) => c[0])) + 1;
      for (let x = 0; x + w <= columns; x++) {
        if (!fits(cells, x, 0)) continue;
        let y = 0;
        while (fits(cells, x, y + 1)) y++;
        const s = score(cells, x, y);
        if (!best || s > best.s) best = { cells, x, y, s };
      }
    }
    if (!best) break;
    const c = color();
    drops.push({ ...best, color: c, piece: n });
    for (const [dx, dy] of best.cells) board[best.y + dy][best.x + dx] = { color: c, piece: n };
  }

  // Rewind: keep the first drops on the stack, lift the rest back into the air
  const landed = Math.round(drops.length * fallen);
  for (const d of drops.slice(landed)) for (const [dx, dy] of d.cells) board[d.y + dy][d.x + dx] = null;

  const top = board.findIndex((row) => row.some(Boolean));
  const ceiling = top === -1 ? rows : top - 2;
  const clear = (cells, x, y) => cells.every(([dx, dy]) => {
    for (let r = y + dy - 1; r <= y + dy + 1; r++) for (let c = x + dx - 1; c <= x + dx + 1; c++) {
      if (r >= 0 && r < rows && c >= 0 && c < columns && board[r][c]) return false;
    }
    return true;
  });
  // Lifted pieces in drop order: each rises from its landing spot until it is clear of
  // everything below it, so the next to land sits lowest. Past the top, it hasn't entered yet
  drops.slice(landed).forEach((d, j) => {
    let y = d.y - 1 - (j % 3 === 2 ? 1 : 0);
    while (y >= 0 && !clear(d.cells, d.x, y)) y--;
    if (y < 0) return;
    for (const [dx, dy] of d.cells) board[y + dy][d.x + dx] = { color: d.color, piece: d.piece };
  });

  // Pieces mid-fall: somewhere above the stack, a clear square away from everything
  const stack = drops.length;
  for (let n = 0, tries = 0; n < falling && tries < falling * 40; tries++) {
    const cells = pick();
    const w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
    if (ceiling - h < 0) break;
    const x = Math.floor(rand() * (columns - w + 1)), y = Math.floor(rand() * (ceiling - h + 1));
    if (!clear(cells, x, y)) continue;
    const c = color();
    for (const [dx, dy] of cells) board[y + dy][x + dx] = { color: c, piece: stack + n };
    n++;
  }

  const squares = [];
  board.forEach((row, r) => row.forEach((cell, c) => { if (cell) squares.push({ col: c, row: r, ...cell }); }));
  return squares;
}
