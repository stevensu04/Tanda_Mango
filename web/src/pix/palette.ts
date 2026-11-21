/** "Velvet Night" — the only colours allowed on screen. See docs/DESIGN.md §3. */
export const C = {
  INK: '#0e0a1a',
  NIGHT: '#1d1633',
  ASPHALT: '#2e2350',
  ASPHALT_HI: '#463a6e',
  STONE: '#6f6596',
  STONE_HI: '#a69cc9',
  PAPER: '#f4ecd6',
  BRICK: '#5a1f33',
  BRICK_HI: '#8a3346',
  VELVET: '#c4304f',
  NEON: '#ff4f9a',
  LAMP: '#ffd25e',
  LAMP_LO: '#d97a2b',
  SAFE: '#5ff0c8',
  ALERT: '#ff4a3d',
  SHADE: '#3a2b20',
} as const;
export type ColorName = keyof typeof C;

/** Per-player ramps: [base, shade]. Kept few and saturated so palette swaps read at 16 px. */
export const SKIN: [string, string][] = [
  ['#ffd7b0', '#e3a27a'],
  ['#e8b48a', '#c07f57'],
  ['#c98a5c', '#9a5f3a'],
  ['#9a6440', '#6e4228'],
  ['#6e4428', '#4a2c1a'],
  ['#f7c9a0', '#d18f6a'],
];
export const HAIR: [string, string][] = [
  ['#2a1a14', '#140c0a'],
  ['#6b3a1c', '#432210'],
  ['#f0c850', '#c08a2a'],
  ['#ff6fae', '#c43c7c'],
  ['#5ff0c8', '#2fa88a'],
  ['#eae4f4', '#a69cc9'],
];
export const TOPS: [string, string][] = [
  ['#ff4f9a', '#b32a66'],
  ['#5ff0c8', '#2fa88a'],
  ['#ffd25e', '#d97a2b'],
  ['#8fe34a', '#4f9a24'],
  ['#ff8a3d', '#b8521c'],
  ['#9c6bff', '#5f3cb8'],
  ['#f4ecd6', '#a69cc9'],
  ['#4fa8ff', '#2a5fb8'],
];
export const PANTS: [string, string][] = [
  ['#2e2350', '#1d1633'],
  ['#3a2b20', '#241a12'],
  ['#463a6e', '#2e2350'],
  ['#1f3b5a', '#132538'],
];
