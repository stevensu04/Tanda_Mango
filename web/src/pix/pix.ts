import { C } from './palette';
import { drawText, wrap, CELL_W } from './font';

/**
 * A logical low-res canvas shown at a whole-number scale of *device* pixels,
 * so every fat pixel is exactly k×k real pixels. Never blurry, never uneven.
 */
export class Screen {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  scale = 1;

  constructor(host: HTMLElement, w: number, h: number) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.style.imageRendering = 'pixelated';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize(w, h);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Fixed logical size, letterboxed into the host at the largest whole scale. */
  fitFixed(host: HTMLElement) {
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.floor(Math.min((host.clientWidth * dpr) / this.w, (host.clientHeight * dpr) / this.h)));
    this.scale = k / dpr;
    this.canvas.style.width = `${(this.w * k) / dpr}px`;
    this.canvas.style.height = `${(this.h * k) / dpr}px`;
  }

  /** Fixed logical width, height grows to fill the host (phones). */
  fitWidth(host: HTMLElement, w: number) {
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.floor((host.clientWidth * dpr) / w));
    const h = Math.floor((host.clientHeight * dpr) / k);
    if (h !== this.h || w !== this.w) this.resize(w, h);
    this.scale = k / dpr;
    this.canvas.style.width = `${(w * k) / dpr}px`;
    this.canvas.style.height = `${(h * k) / dpr}px`;
  }

  /** Client (CSS px) → logical pixel coordinates. */
  toLogical(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * this.w, y: ((clientY - r.top) / r.height) * this.h };
  }
}

// ---------- primitives (all integer, all palette) ----------

export function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** 50% checkerboard: our only "transparency". phase flips the pattern. */
export function dither(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, phase = 0) {
  ctx.fillStyle = color;
  x = Math.round(x); y = Math.round(y);
  for (let j = 0; j < h; j++) {
    for (let i = (j + phase + x + y) & 1; i < w; i += 2) ctx.fillRect(x + i, y + j, 1, 1);
  }
}

/** 25% sparse dither (lighter tint). */
export function dither25(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  for (let j = 0; j < h; j += 2) {
    for (let i = (j / 2) % 2 ? 1 : 0; i < w; i += 2) ctx.fillRect(x + i * 1, y + j, 1, 1);
  }
}

// ---------- sprites from text grids ----------

export type Grid = string[];
const spriteCache = new Map<string, HTMLCanvasElement>();

/** Build a sprite from rows of characters. '.' is transparent; every other char maps through `map`. */
export function sprite(key: string, rows: Grid, map: Record<string, string>, w = rows[0].length): HTMLCanvasElement {
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = w;
  c.height = rows.length;
  const x = c.getContext('2d')!;
  rows.forEach((row, j) => {
    for (let i = 0; i < w; i++) {
      const ch = row[i] ?? '.';
      if (ch === '.' || ch === ' ') continue;
      const col = map[ch];
      if (!col) continue;
      x.fillStyle = col;
      x.fillRect(i, j, 1, 1);
    }
  });
  spriteCache.set(key, c);
  return c;
}

export function blit(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, flip = false, scale = 1) {
  x = Math.round(x); y = Math.round(y);
  if (!flip) { ctx.drawImage(img, x, y, img.width * scale, img.height * scale); return; }
  ctx.save();
  ctx.translate(x + img.width * scale, y);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0, img.width * scale, img.height * scale);
  ctx.restore();
}

// ---------- UI chrome ----------

/**
 * The text-box frame: PAPER fill, double INK rule, notched corners, 1px NIGHT drop shadow.
 * Every UI panel in the game is this one frame.
 */
export function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string = C.PAPER, ink: string = C.INK) {
  x = Math.round(x); y = Math.round(y);
  rect(ctx, x + 2, y + h, w - 2, 2, C.NIGHT);          // hard shadow
  rect(ctx, x + w, y + 2, 2, h, C.NIGHT);
  rect(ctx, x + 1, y, w - 2, h, ink);                  // outer rule (notched corners)
  rect(ctx, x, y + 1, w, h - 2, ink);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, fill);
  rect(ctx, x + 3, y + 3, w - 6, 1, ink);              // inner rule
  rect(ctx, x + 3, y + h - 4, w - 6, 1, ink);
  rect(ctx, x + 3, y + 3, 1, h - 6, ink);
  rect(ctx, x + w - 4, y + 3, 1, h - 6, ink);
}

/** Speaker tab that sits on the top border of a text box. */
export function nameTab(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, fill: string = C.INK, ink: string = C.PAPER) {
  const w = name.length * CELL_W + 7;
  rect(ctx, x, y - 5, w, 11, fill);
  rect(ctx, x + 1, y - 6, w - 2, 1, fill);
  drawText(ctx, name, x + 4, y - 3, ink);
}

/**
 * Dialog box with typewriter reveal. `shown` = number of characters revealed so far.
 * Returns true when the whole text is visible.
 */
export function textBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, text: string, shown: number, t: number, speaker?: string, more = true): boolean {
  frame(ctx, x, y, w, h);
  const cols = Math.floor((w - 14) / CELL_W);
  const lines = wrap(text, cols);
  let left = Math.floor(shown);
  const maxLines = Math.floor((h - 10) / 10);
  lines.slice(0, maxLines).forEach((line, i) => {
    if (left <= 0) return;
    drawText(ctx, line.slice(0, left), x + 7, y + 7 + i * 10, C.INK);
    left -= line.length + 1;
  });
  const done = shown >= text.length;
  if (done && more && Math.floor(t * 2) % 2 === 0) drawText(ctx, '~', x + w - 12, y + h - 11, C.INK);
  if (speaker) nameTab(ctx, speaker, x + 8, y);
  return done;
}

/** Horizontal meter: INK frame, chunky segments. */
export function meter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, value: number, color: string, segments = 0) {
  rect(ctx, x, y, w, h, C.INK);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, C.NIGHT);
  const inner = w - 4;
  let fillW = Math.round(inner * Math.max(0, Math.min(1, value)));
  if (segments > 0) {
    const seg = inner / segments;
    fillW = Math.round(Math.floor((value * segments) + 1e-6) * seg);
  }
  rect(ctx, x + 2, y + 2, fillW, h - 4, color);
  rect(ctx, x + 2, y + 2, fillW, 1, C.PAPER);
  if (segments > 0) for (let i = 1; i < segments; i++) rect(ctx, x + 2 + Math.round((inner / segments) * i), y + 2, 1, h - 4, C.NIGHT);
}

/** A circle of fat pixels (for the big phone button). */
export function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y) + 0.5);
    ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2, 1);
  }
}
