import { useEffect, useRef } from 'react';
import { PALETTES } from './shared.js';

// Keeps c1..c4 and the palette select in sync:
// picking a preset loads its colors, editing a color switches to Custom.
export function usePaletteSync(dial) {
  const { palette, c1, c2, c3, c4 } = dial.values.color;
  const prev = useRef(null);
  useEffect(() => {
    const preset = PALETTES[palette];
    if (palette !== prev.current) {
      // Mount only records the palette, so saved colors aren't overwritten on load
      const changed = prev.current !== null;
      prev.current = palette;
      if (changed && preset) dial.setValues({ color: { c1: preset[0], c2: preset[1], c3: preset[2], c4: preset[3] } });
      return;
    }
    const same = preset && [c1, c2, c3, c4].every((c, i) => c.toLowerCase() === preset[i].toLowerCase());
    if (preset && !same) dial.setValue('color.palette', 'custom');
  }, [palette, c1, c2, c3, c4]);
  return [c1, c2, c3, c4];
}
