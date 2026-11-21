import { C } from './palette';
import { rect, dither, dither25, blit } from './pix';
import { drawText, textWidth } from './font';
import { gusSprite, icon, type GusPose } from './sprites';

/** Projector layout in logical pixels (320x180). */
export const L = {
  W: 320,
  H: 180,
  SIDEWALK: 64,
  CURB: 80,
  STREET_TOP: 82,
  STREET_BOTTOM: 143,
  LANES: [96, 108, 120, 132, 141],
  START_X: 34,
  ROPE_X: 232,
  GUS_X: 252,
  GUS_FEET: 82,
  DOOR: { x: 268, y: 26, w: 32, h: 38 },
  TEXT_Y: 145,
};

const SIGN = 'CLUB VELVET';

/** The street outside the club. Pure drawing; state comes in through `o`. */
export function drawStreet(ctx: CanvasRenderingContext2D, t: number, o: { ropeOpen?: boolean; disco?: boolean; lounge?: number } = {}) {
  // sky
  rect(ctx, 0, 0, L.W, 10, C.NIGHT);
  for (const [x, y] of [[20, 3], [64, 6], [118, 2], [171, 5], [222, 3], [309, 6]]) {
    if (Math.floor(t * 1.5 + x) % 7 !== 0) rect(ctx, x, y, 1, 1, C.STONE_HI);
  }
  // building: cornice + brick
  rect(ctx, 0, 10, L.W, 3, C.INK);
  rect(ctx, 0, 13, L.W, 2, C.BRICK);
  rect(ctx, 0, 15, L.W, L.SIDEWALK - 15, C.BRICK_HI);
  for (let y = 15; y < L.SIDEWALK; y += 4) {
    rect(ctx, 0, y + 3, L.W, 1, C.BRICK);
    const off = ((y - 15) / 4) % 2 ? 4 : 0;
    for (let x = off; x < L.W; x += 8) rect(ctx, x, y, 1, 3, C.BRICK);
  }
  // windows with warm light and dithered curtains
  for (const wx of [10, 38]) {
    rect(ctx, wx - 1, 25, 20, 22, C.INK);
    rect(ctx, wx, 26, 18, 20, C.LAMP);
    dither(ctx, wx, 26, 18, 20, C.LAMP_LO);
    rect(ctx, wx, 26, 18, 3, C.VELVET);
    rect(ctx, wx + 8, 26, 2, 20, C.INK);
    rect(ctx, wx - 2, 46, 22, 2, C.STONE);
  }
  // neon sign (one letter flickers, like every real one)
  const sx = 102, sy = 22;
  const flick = Math.floor(t * 8) % 23 < 2 || Math.floor(t * 8) % 41 === 0;
  rect(ctx, sx - 6, sy - 5, textWidth(SIGN, 2) + 12, 24, C.INK);
  rect(ctx, sx - 5, sy - 4, textWidth(SIGN, 2) + 10, 22, C.NIGHT);
  for (let i = 0; i < SIGN.length; i++) {
    const ch = SIGN[i];
    const off = flick && i === 8;
    const x = sx + i * 12;
    if (!off) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawText(ctx, ch, x + dx, sy + dy, C.VELVET, 2);
    }
    drawText(ctx, ch, x, sy, off ? C.BRICK : C.NEON, 2);
  }
  drawText(ctx, 'MEMBERS ONLY', sx + 30, sy + 21, C.STONE_HI);

  // door
  const d = L.DOOR;
  rect(ctx, d.x - 3, d.y - 3, d.w + 6, d.h + 3, C.INK);
  rect(ctx, d.x - 2, d.y - 2, d.w + 4, 2, C.NEON);
  rect(ctx, d.x, d.y, d.w, d.h, C.NIGHT);
  if (o.lounge) {
    // light spilling out when someone is inside
    dither(ctx, d.x, d.y, d.w, d.h, Math.floor(t * 4) % 2 ? C.NEON : C.VELVET, Math.floor(t * 8));
  } else {
    rect(ctx, d.x + d.w / 2 - 1, d.y, 2, d.h, C.INK);
    rect(ctx, d.x + d.w / 2 - 5, d.y + 18, 2, 4, C.LAMP);
    rect(ctx, d.x + d.w / 2 + 3, d.y + 18, 2, 4, C.LAMP);
  }
  // mirror ball when the disco rule is on
  if (o.disco) {
    const bx = d.x + d.w / 2, by = d.y - 12;
    rect(ctx, bx, 11, 1, by - 11, C.STONE_HI);
    rect(ctx, bx - 3, by, 7, 7, C.STONE_HI);
    rect(ctx, bx - 2, by + 1, 5, 5, C.PAPER);
    if (Math.floor(t * 8) % 2) rect(ctx, bx - 1, by + 2, 1, 1, C.NEON); else rect(ctx, bx + 1, by + 3, 1, 1, C.SAFE);
  }

  // sidewalk
  rect(ctx, 0, L.SIDEWALK, L.W, L.CURB - L.SIDEWALK, C.STONE);
  rect(ctx, 0, L.SIDEWALK, L.W, 1, C.INK);
  for (let x = 0; x < L.W; x += 16) rect(ctx, x, L.SIDEWALK + 1, 1, L.CURB - L.SIDEWALK - 1, C.ASPHALT_HI);
  rect(ctx, 0, L.SIDEWALK + 8, L.W, 1, C.ASPHALT_HI);
  dither25(ctx, 0, L.SIDEWALK + 1, L.W, 7, C.STONE_HI);
  // curb
  rect(ctx, 0, L.CURB, L.W, 2, C.ASPHALT_HI);
  rect(ctx, 0, L.CURB + 1, L.W, 1, C.INK);

  // street
  const sh = L.STREET_BOTTOM - L.STREET_TOP + 1;
  if (o.disco) {
    // palette-cycled dance floor
    const cols = [C.NEON, C.ASPHALT, C.SAFE, C.ASPHALT_HI, C.LAMP, C.ASPHALT];
    const step = Math.floor(t * 8);
    for (let y = 0; y < sh; y += 8) for (let x = 0; x < L.W; x += 16) {
      rect(ctx, x, L.STREET_TOP + y, 16, Math.min(8, sh - y), cols[(x / 16 + y / 8 + step) % cols.length]);
    }
    dither(ctx, 0, L.STREET_TOP, L.W, sh, C.ASPHALT);
  } else {
    rect(ctx, 0, L.STREET_TOP, L.W, sh, C.ASPHALT);
    for (let x = 6; x < L.W; x += 24) rect(ctx, x, 114, 12, 2, C.ASPHALT_HI);
    // street lamp pool + puddle reflecting the sign
    dither25(ctx, 44, L.STREET_TOP, 48, 30, C.ASPHALT_HI);
    rect(ctx, 172, 124, 26, 6, C.NIGHT);
    rect(ctx, 174, 123, 22, 1, C.NIGHT);
    dither(ctx, 175, 125, 20, 4, Math.floor(t * 3) % 2 ? C.NEON : C.VELVET, Math.floor(t * 3));
    // litter
    rect(ctx, 60, 137, 3, 2, C.PAPER); rect(ctx, 61, 136, 1, 1, C.STONE_HI);
    rect(ctx, 214, 100, 2, 2, C.LAMP_LO);
  }
  // start line in the alley
  for (let y = L.STREET_TOP; y <= L.STREET_BOTTOM; y += 4) rect(ctx, L.START_X - 10, y, 2, 2, C.PAPER);

  // wall lamp (bracket, cage, warm pool on the pavement)
  rect(ctx, 62, 30, 8, 2, C.INK);
  rect(ctx, 64, 32, 6, 8, C.INK);
  rect(ctx, 65, 33, 4, 6, C.LAMP);
  rect(ctx, 66, 33, 1, 6, C.PAPER);
  dither(ctx, 58, 40, 18, 4, C.LAMP);
  dither25(ctx, 44, L.SIDEWALK + 1, 48, 15, C.LAMP);

  // alley dumpster
  rect(ctx, 2, 52, 26, 22, C.INK);
  rect(ctx, 3, 53, 24, 20, C.SHADE);
  rect(ctx, 3, 53, 24, 3, '#4a3a2a');
  rect(ctx, 6, 60, 18, 1, C.INK);
}

/** Velvet rope + stanchions. Drawn after players so the rope overlaps feet. */
export function drawRope(ctx: CanvasRenderingContext2D, t: number, open = false) {
  const x1 = L.ROPE_X, x2 = L.ROPE_X + 60, top = 66;
  for (const x of [x1, x2]) {
    rect(ctx, x - 2, top + 13, 6, 3, C.INK);
    rect(ctx, x - 1, top + 14, 4, 1, C.LAMP_LO);
    rect(ctx, x, top, 2, 14, C.LAMP);
    rect(ctx, x + 1, top, 1, 14, C.LAMP_LO);
    rect(ctx, x - 1, top - 2, 4, 3, C.LAMP);
  }
  if (open) {
    // unclipped: rope hangs down from the right post
    for (let i = 0; i < 12; i++) rect(ctx, x2 - 1 + (i > 8 ? -1 : 0), top + 1 + i, 2, 1, C.VELVET);
    return;
  }
  const sway = Math.round(Math.sin(t * 1.2));
  for (let x = x1 + 2; x < x2; x++) {
    const u = (x - x1) / (x2 - x1);
    const y = top + 1 + Math.round(Math.sin(u * Math.PI) * (5 + sway));
    rect(ctx, x, y, 1, 2, C.VELVET);
    rect(ctx, x, y + 2, 1, 1, C.INK);
  }
}

export function drawGus(ctx: CanvasRenderingContext2D, pose: GusPose, t: number, x = L.GUS_X, feetY = L.GUS_FEET) {
  const lens = pose === 'watch' || pose === 'point' ? C.ALERT : pose === 'tell' ? C.LAMP : C.INK;
  const bob = pose === 'dance' ? (Math.floor(t * 8) % 2) * -2 : pose === 'back' ? (Math.floor(t * 2) % 2) * -1 : 0;
  const flip = pose === 'dance' && Math.floor(t * 4) % 2 === 1;
  blit(ctx, gusSprite(pose, lens), x - 12, feetY - 28 + bob, flip);
  if (pose === 'tell') {
    const pop = Math.floor(t * 30) % 3 === 0 ? -1 : 0;
    blit(ctx, icon.bang(C.LAMP), x - 4, feetY - 42 + pop);
  }
  if (pose === 'watch' || pose === 'point') blit(ctx, icon.bang(C.ALERT), x - 4, feetY - 42);
  if (pose === 'sleep') {
    const z = Math.floor(t * 2) % 3;
    for (let i = 0; i <= z; i++) drawText(ctx, 'Z', x + 8 + i * 5, feetY - 32 - i * 6, C.PAPER);
  }
  if (pose === 'flattered') blit(ctx, icon.heart(), x + 9, feetY - 36 + (Math.floor(t * 4) % 2));
}

/** Watching: sparse red checker over the street + a sweeping scan line. */
export function drawSightline(ctx: CanvasRenderingContext2D, t: number) {
  const top = L.STREET_TOP, h = L.STREET_BOTTOM - top + 1;
  ctx.fillStyle = C.ALERT;
  const ph = Math.floor(t * 10) % 2;
  for (let y = top; y < top + h; y += 2) {
    for (let x = ((y >> 1) + ph) % 4; x < L.ROPE_X - 4; x += 4) ctx.fillRect(x, y, 1, 1);
  }
  const sx = Math.round(((Math.sin(t * 3) + 1) / 2) * (L.ROPE_X - 20));
  rect(ctx, sx, top, 2, h, C.ALERT);
  dither(ctx, sx - 4, top, 4, h, C.ALERT);
  dither(ctx, sx + 2, top, 4, h, C.ALERT);
}

/**
 * Lights Out: all dark except a flashlight band from Gus.
 * `target` = beam centre in px (default: a slow sweep for the preview). `half` = half width in px.
 * `danger` tints the beam ALERT (dither) while Gus is watching. Returns the beam centre x.
 */
export function drawDarkness(ctx: CanvasRenderingContext2D, t: number, target = 30 + ((Math.sin(t * 0.9) + 1) / 2) * (L.ROPE_X - 60), half = 26, danger = false) {
  const gx = L.GUS_X, gy = 62;
  const ph = Math.floor(t * 10) % 2;
  for (let y = 0; y < L.TEXT_Y; y++) {
    ctx.fillStyle = C.INK;
    if (y < L.STREET_TOP - 4) {
      // keep the sign + door faintly visible
      for (let x = (y & 1); x < L.W; x += 2) ctx.fillRect(x, y, 1, 1);
      continue;
    }
    // the beam leaves Gus and is straight above the street, so it matches the server's band
    const u = Math.max(0, Math.min(1, (y - gy) / (L.STREET_TOP + 10 - gy)));
    const cx = gx + (target - gx) * u;
    const hw = 6 + u * (half - 6);
    const a = Math.round(cx - hw), b = Math.round(cx + hw);
    ctx.fillRect(0, y, Math.max(0, a - 3), 1);
    ctx.fillRect(b + 3, y, Math.max(0, L.W - b - 3), 1);
    for (let x = a - 3; x < a; x++) if ((x + y) & 1) ctx.fillRect(x, y, 1, 1);
    for (let x = b + 1; x < b + 3; x++) if ((x + y) & 1) ctx.fillRect(x, y, 1, 1);
    if (danger && y >= L.STREET_TOP) {
      ctx.fillStyle = C.ALERT;
      for (let x = Math.max(0, a); x <= b; x++) if (((x >> 1) + y + ph) % 4 === 0 && (x & 1) === 0) ctx.fillRect(x, y, 1, 1);
    }
  }
  return target;
}

/** The alley cat: watches whoever moved last. */
export function drawCat(ctx: CanvasRenderingContext2D, t: number) {
  const blink = Math.floor(t * 2) % 9 === 0;
  blit(ctx, icon.cat(blink), 12, 44);
}
