/** Phone vibration patterns. Every call is safe when the API is missing (iOS Safari, desktop). */
export function buzz(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* blocked before a user gesture */ }
}

export const haptic = {
  tell: () => buzz(60),
  turn: () => buzz([90, 40, 90]),
  caught: () => buzz([200, 60, 200]),
  pass: () => buzz([30, 30, 30]),
  fling: () => buzz(300),
  vip: () => buzz([60, 40, 120]),
  tap: () => buzz(10),
};
