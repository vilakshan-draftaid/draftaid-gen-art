import { createElement, useEffect, useRef } from 'react';
import { PALETTES } from './shared.js';

// Palettes of 1 to 8 colors. Every slot (c1..c8) always exists in the config, so saved
// versions keep colors you removed; the panel only shows the first `colors` of them.
export const MAX_COLORS = 8;
// Starting values for slots past a palette's own colors
const EXTRA = ['#FF4400', '#0050FF', '#FFC8DC', '#FFD500', '#8A4FFF', '#00B3C7', '#26843F', '#7A7A7A'];

// Config for the slots plus the count and add/remove buttons; spread into a color folder
export function paletteSlots(defaults, prefix = 'c', withCount = true) {
  const slots = Object.fromEntries(Array.from({ length: MAX_COLORS }, (_, i) => [`${prefix}${i + 1}`, defaults[i] ?? EXTRA[i]]));
  if (!withCount) return slots;
  return {
    colors: [defaults.length, 1, MAX_COLORS, 1],
    addColor: { type: 'action', label: 'Add color' },
    removeColor: { type: 'action', label: 'Remove color' },
    ...slots,
  };
}

// Call from onAction: the add/remove buttons change the count
export function paletteAction(action, dial, folder = 'color') {
  const a = String(action);
  if (!dial || !/(addColor|removeColor)$/.test(a) || !a.startsWith(folder)) return;
  const n = dial.values[folder].colors;
  dial.setValue(`${folder}.colors`, Math.max(1, Math.min(MAX_COLORS, n + (a.endsWith('addColor') ? 1 : -1))));
}

// Hides the slots past the count (DialKit has no hidden controls, so a style does it)
export function PaletteRows({ count, prefixes = ['c'] }) {
  const rules = prefixes.flatMap((pfx) => Array.from({ length: MAX_COLORS - count }, (_, i) =>
    `.dialkit-color-host:has(input[aria-label="${pfx.toUpperCase()}${count + i + 1} color value"])`));
  return rules.length ? createElement('style', null, `${rules.join(',\n')} { display: none; }`) : null;
}

// Keeps the slots and the palette select in sync: picking a preset loads its colors and
// count; editing a color or the count switches to Custom (mount only records the palette).
// `count` lets a second palette follow the first one's count (Tetris strokes follow fills)
export function usePaletteSync(dial, { folder = 'color', prefix = 'c', palettes = PALETTES, count: fixed } = {}) {
  const v = dial.values[folder];
  const count = Math.max(1, Math.min(MAX_COLORS, fixed ?? v.colors ?? 4));
  const all = Array.from({ length: MAX_COLORS }, (_, i) => v[`${prefix}${i + 1}`]);
  const colors = all.slice(0, count);
  const prev = useRef(null);
  useEffect(() => {
    const preset = palettes[v.palette];
    if (v.palette !== prev.current) {
      const changed = prev.current !== null;
      prev.current = v.palette;
      if (changed && preset) {
        dial.setValues({ [folder]: { colors: preset.length, ...Object.fromEntries(preset.map((c, i) => [`${prefix}${i + 1}`, c])) } });
      }
      return;
    }
    const same = preset && preset.length === count && colors.every((c, i) => String(c).toLowerCase() === preset[i].toLowerCase());
    if (preset && !same) dial.setValue(`${folder}.palette`, 'custom');
  }, [v.palette, count, ...colors]);
  return colors;
}
