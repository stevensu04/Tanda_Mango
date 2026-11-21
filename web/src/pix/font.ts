/**
 * In-house 5x7 caps font in a 6x8 cell. Hand-drawn; no stock pixel font.
 * Special glyphs: '>' = menu cursor, '~' = "more text" arrow, '@' = heart, '*' = sparkle.
 */
import { isWide, cells } from '../../../shared/text';
export { isWide, cells };

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

// ---------- wide glyphs: Chinese (and other CJK) names and lines ----------
// The 5x7 caps font only knows A-Z, 0-9 and some punctuation. Anything CJK is drawn per character
// with Fusion Pixel 10px (zh_TW forms, SIL OFL 1.1, see /fonts/fusion-pixel-OFL.txt), snapped to hard
// pixels so it sits in the same chunky style. A wide glyph takes two cells (12 px).
const WIDE_FAMILY = 'ClubPixelCJK';
const wideCache = new Map<string, HTMLCanvasElement>();
let wideReady = false;
if (typeof document !== 'undefined' && typeof FontFace !== 'undefined') {
  const face = new FontFace(WIDE_FAMILY, `url(${import.meta.env.BASE_URL}fonts/fusion-pixel-10px-zh_tw.woff2)`);
  face.load().then((f) => { document.fonts.add(f); wideReady = true; wideCache.clear(); }).catch(() => { /* keep the system fallback */ });
}
export const wideFontReady = () => wideReady;

function wideGlyph(ch: string, color: string): HTMLCanvasElement {
  const key = ch + color;
  let c = wideCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 12;
  c.height = 12;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.font = wideReady ? `10px ${WIDE_FAMILY}` : '10px "PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", "Microsoft JhengHei", sans-serif';
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#000';
  // Fusion Pixel 10px: ascent 9 px, so the baseline at 10 puts the glyph on rows 1..10
  x.fillText(ch, 1, 10);
  const img = x.getImageData(0, 0, 12, 12);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= 110 ? 255 : 0;
  x.putImageData(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, 12, 12);
  if (wideReady) wideCache.set(key, c);
  return c;
}

/** The 5x7 glyph for a character, folding accents (E for É); null if it has none. */
function narrowKey(ch: string): string | null {
  const u = ch.toUpperCase();
  if (G[u]) return u;
  const n = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return n.length === 1 && G[n] ? n : null;
}


export function textWidth(s: string, scale = 1) {
  const n = cells(s);
  return n ? n * CELL_W * scale - scale : 0;
}

/** Draw one line. (x, y) is the top-left of the first cell. Wide glyphs stand 2 px taller than caps. */
export function drawText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1) {
  let col = 0;
  for (const ch of s) {
    if (isWide(ch)) {
      // rows 1..10 of the wide glyph: cap height 7 sits on rows 0..6, so lift it 3 px and let it hang 1 below
      ctx.drawImage(wideGlyph(ch, color), Math.round(x + col * CELL_W * scale - scale), Math.round(y - 3 * scale), 12 * scale, 12 * scale);
      col += 2;
      continue;
    }
    if (ch !== ' ') {
      const k = narrowKey(ch) ?? '?';
      ctx.drawImage(glyph(k, color), Math.round(x + col * CELL_W * scale), Math.round(y), 5 * scale, 7 * scale);
    }
    col++;
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

/** Greedy word wrap to a column count (wide characters take two columns and may break anywhere). */
export function wrap(s: string, cols: number): string[] {
  const out: string[] = [];
  for (const para of s.toUpperCase().split('\n')) {
    let line = '';
    const push = (word: string) => {
      if (!line) line = word;
      else if (cells(line) + 1 + cells(word) <= cols) line += ' ' + word;
      else { out.push(line); line = word; }
    };
    for (const word of para.split(' ')) {
      if (cells(word) <= cols || ![...word].some(isWide)) { push(word); continue; }
      // a long run of Chinese: fill the current line character by character
      let chunk = '';
      for (const ch of word) {
        if (cells(chunk + ch) > cols) { push(chunk); chunk = ''; }
        chunk += ch;
      }
      if (chunk) push(chunk);
    }
    out.push(line);
  }
  return out;
}
