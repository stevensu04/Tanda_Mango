/**
 * In-house 5x7 caps font in a 6x8 cell. Hand-drawn; no stock pixel font.
 * Special glyphs: '>' = menu cursor, '~' = "more text" arrow, '@' = heart, '*' = sparkle.
 */
const G: Record<string, string> = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.',
  J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '####.|....#|....#|.###.|....#|....#|####.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|....#|####.',
  '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
  '.': '.....|.....|.....|.....|.....|.##..|.##..',
  ',': '.....|.....|.....|.....|.##..|..#..|.#...',
  '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  "'": '..#..|..#..|.#...|.....|.....|.....|.....',
  '"': '.#.#.|.#.#.|.....|.....|.....|.....|.....',
  '-': '.....|.....|.....|.###.|.....|.....|.....',
  ':': '.....|.##..|.##..|.....|.##..|.##..|.....',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  $: '..#..|.####|#.#..|.###.|..#.#|####.|..#..',
  '%': '##...|##..#|...#.|..#..|.#...|#..##|...##',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#',
  '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.',
  ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
  '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.',
  '=': '.....|.....|#####|.....|#####|.....|.....',
  '_': '.....|.....|.....|.....|.....|.....|#####',
  '>': '.#...|.##..|.###.|.####|.###.|.##..|.#...',
  '<': '...#.|..##.|.###.|####.|.###.|..##.|...#.',
  '~': '.....|.....|#####|.###.|..#..|.....|.....',
  '@': '.....|.#.#.|#####|#####|.###.|..#..|.....',
  '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
};

export const CELL_W = 6;
export const CELL_H = 8;

const glyphCache = new Map<string, HTMLCanvasElement>();

function glyph(ch: string, color: string): HTMLCanvasElement {
  const key = ch + color;
  let c = glyphCache.get(key);
  if (c) return c;
  const rows = (G[ch] ?? G['?']).split('|');
  c = document.createElement('canvas');
  c.width = 5;
  c.height = 7;
  const x = c.getContext('2d')!;
  x.fillStyle = color;
  rows.forEach((r, y) => [...r].forEach((p, i) => { if (p === '#') x.fillRect(i, y, 1, 1); }));
  glyphCache.set(key, c);
  return c;
}

export function textWidth(s: string, scale = 1) {
  return s.length * CELL_W * scale - scale;
}

/** Draw one line. (x, y) is the top-left of the first cell. */
export function drawText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1) {
  const str = s.toUpperCase();
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === ' ') continue;
    ctx.drawImage(glyph(ch, color), Math.round(x + i * CELL_W * scale), Math.round(y), 5 * scale, 7 * scale);
  }
}

/** Text with a 1 px hard outline: signage and labels over busy art. */
export function drawTextOutlined(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, outline: string, scale = 1) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    drawText(ctx, s, x + dx * scale, y + dy * scale, outline, scale);
  }
  drawText(ctx, s, x, y, color, scale);
}

export function drawTextCentered(ctx: CanvasRenderingContext2D, s: string, cx: number, y: number, color: string, scale = 1, outline?: string) {
  const x = Math.round(cx - textWidth(s, scale) / 2);
  if (outline) drawTextOutlined(ctx, s, x, y, color, outline, scale);
  else drawText(ctx, s, x, y, color, scale);
}

/** Greedy word wrap to a column count. */
export function wrap(s: string, cols: number): string[] {
  const out: string[] = [];
  for (const para of s.toUpperCase().split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (!line) line = word;
      else if ((line + ' ' + word).length <= cols) line += ' ' + word;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}
