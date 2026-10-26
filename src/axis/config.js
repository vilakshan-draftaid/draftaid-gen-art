// Camera views. dir = where the camera sits relative to the part, up = screen up.
export const VIEWS = {
  'None (isometric)': { dir: [1, 1, 1], up: [0, 1, 0], label: 'Isometric', tab: 'Iso' },
  X: { dir: [1, 0, 0], up: [0, 1, 0], label: 'X axis', tab: 'X' },
  Y: { dir: [0, 1, 0], up: [0, 0, -1], label: 'Y axis', tab: 'Y' },
  Z: { dir: [0, 0, 1], up: [0, 1, 0], label: 'Z axis', tab: 'Z' },
};

// Transition spring. Hardcoded for now, ready to move into DialKit later.
export const SPRING = { type: 'spring', visualDuration: 0.9, bounce: 0 };

export const COLORS = {
  background: '#fafafa',
  surface: '#e6e6e6',
};

// Light and dark defaults. Switching theme swaps any value still on the other theme's default.
export const THEMES = {
  light: { background: '#fafafa', edges: '#292929', surface: '#e6e6e6', grid: '#d6d6d6' },
  dark: { background: '#141414', edges: '#f5f5f5', surface: '#2b2b2b', grid: '#3a3a3a' },
};

// Drag rotation sensitivity (radians per pixel)
export const DRAG = { speed: 0.008 };
