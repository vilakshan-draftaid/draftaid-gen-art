export const ARTICLE = ['Ø', '□', 'R', '⌴', '⌵', '↧', 'Ra', 'Rz', 'M8'];
export const GDT = ['⌖', '⊥', '∥', '⌒', '◎', '⏥', '○', '↗', '∠'];
export const PALETTES = {
  plot: ['#3E8EDE', '#F5C518', '#3DBE5A', '#8FD694'],
  // Draft Green 100, 300, 500, 700
  draftaid: ['#C6FFE6', '#4DFFC6', '#00E8AD', '#009878'],
  // Black with Draft Green 500, 700
  draftaidDark: ['#000000', '#000000', '#00E8AD', '#009878'],
};
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const FONT = '"Inter Tight", "Noto Sans Math", "Noto Sans Symbols 2", system-ui, sans-serif';
export const SYMBOL_PICK = [
  { value: 'mix', label: 'Random mix' },
  ...[...ARTICLE, ...GDT].map((s) => ({ value: s, label: s })),
];
