import { C } from './pix/palette';
import { Screen, rect, textBox, meter, blit } from './pix/pix';
import { drawText } from './pix/font';
import { HEADS, lookFromSeed, playerSprite, gusSprite, icon, drawPlayer, type PlayerFrame, type GusPose } from './pix/sprites';
import { drawStreet, drawRope, drawGus, drawCat, L } from './pix/scene';

const W = 336, H = 616;
const host = document.getElementById('sheet')!;
host.style.width = '100vw';
host.style.height = `${(H / W) * 100}vw`;
const scr = new Screen(host, W, H);
const ctx = scr.ctx;

function label(s: string, x: number, y: number) {
  drawText(ctx, s, x, y, C.STONE_HI);
}

function draw(t: number) {
  scr.fitFixed(host);
  rect(ctx, 0, 0, W, H, C.NIGHT);
  drawText(ctx, 'CLUB VELVET', 8, 8, C.NEON, 2);
  label('REFERENCE SHEET / PHASE 1', 150, 12);

  // palette
  label('PALETTE', 8, 30);
  Object.entries(C).forEach(([name, hex], i) => {
    const x = 8 + (i % 8) * 40, y = 40 + Math.floor(i / 8) * 22;
    rect(ctx, x, y, 38, 12, C.INK);
    rect(ctx, x + 1, y + 1, 36, 10, hex);
    drawText(ctx, name.slice(0, 6), x, y + 13, C.STONE_HI);
  });

  // font
  label('TYPE', 8, 90);
  drawText(ctx, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789', 8, 100, C.PAPER);
  drawText(ctx, '.,!?\'"-:/$%+&()#=  > ~ @ *', 8, 110, C.PAPER);

  // heads x palettes
  label('PLAYERS: 8 HEADS X PALETTE SWAPS', 8, 126);
  HEADS.forEach((h, i) => {
    for (let v = 0; v < 3; v++) {
      const look = { ...lookFromSeed(i * 31 + v * 7 + 3), head: i };
      blit(ctx, playerSprite(look, 'stand'), 8 + i * 40, 136 + v * 18);
      blit(ctx, playerSprite({ ...look, shades: v === 2 ? 2 : 0 }, v === 1 ? 'stepA' : 'stand'), 24 + i * 40, 136 + v * 18, false);
    }
    drawText(ctx, h.name.slice(0, 6), 6 + i * 40, 192, C.STONE_HI);
  });

  // frames
  label('FRAMES (8 FPS)', 8, 206);
  const frames: PlayerFrame[] = ['stepA', 'stepB', 'sneakA', 'sneakB', 'freeze', 'caught', 'cheer', 'stand'];
  const anim = Math.floor(t * 8) % 2;
  frames.forEach((f, i) => {
    const look = lookFromSeed(11);
    blit(ctx, playerSprite(look, f), 8 + i * 40, 216, false, 2);
    drawText(ctx, f.slice(0, 6), 6 + i * 40, 252, C.STONE_HI);
  });
  label('LIVE:', 8, 266);
  blit(ctx, playerSprite(lookFromSeed(5), anim ? 'sneakA' : 'sneakB'), 40, 262, false, 2);
  blit(ctx, playerSprite(lookFromSeed(9), anim ? 'stepA' : 'stepB'), 80, 262, false, 2);
  blit(ctx, playerSprite(lookFromSeed(2), 'freeze'), 120, 262, false, 2);
  blit(ctx, icon.sweat(), 142, 262 + (anim ? 0 : 1));
  blit(ctx, playerSprite(lookFromSeed(4), anim ? 'caught' : 'stand'), 160, 262, false, 2);

  // gus
  label('GUS THE BOUNCER (24X28)', 8, 302);
  const poses: GusPose[] = ['back', 'tell', 'watch', 'point', 'sleep', 'dance', 'flattered'];
  poses.forEach((p, i) => {
    drawGus(ctx, p, t, 22 + i * 46, 352);
    drawText(ctx, p.slice(0, 6), 6 + i * 46, 356, C.STONE_HI);
  });
  blit(ctx, gusSprite('watch', C.ALERT), 270, 296, false, 2);

  // icons
  label('ICONS', 8, 372);
  [icon.bang(C.LAMP), icon.bang(C.ALERT), icon.question(), icon.sweat(), icon.puff(), icon.coin(), icon.note(), icon.heart(), icon.star(), icon.cat(false)].forEach((img, i) => {
    blit(ctx, img, 8 + i * 16, 382);
  });

  // ui
  textBox(ctx, 172, 372, 156, 34, 'GUS IS SCROLLING HIS PHONE. MOVE.', Math.floor(t * 30) % 60, t, 'GUS');
  meter(ctx, 172, 412, 100, 9, (Math.sin(t * 2) + 1) / 2, C.SAFE, 10);
  drawText(ctx, 'NERVE', 278, 413, C.PAPER);

  // the street
  label('PROJECTOR 320X180 @ 1X (X6 ON 1080P)', 8, 418);
  ctx.save();
  ctx.translate(8, 428);
  drawStreet(ctx, t, { lounge: 1 });
  drawCat(ctx, t);
  const crowd = 18;
  const list = Array.from({ length: crowd }, (_, i) => ({ i, lane: L.LANES[i % 5], x: L.START_X + ((i * 53) % 190) }));
  list.sort((a, b) => a.lane - b.lane).forEach((p) => {
    drawPlayer(ctx, lookFromSeed(p.i + 20), anim ? 'sneakA' : 'sneakB', p.x + Math.floor(t * 6) % 4, p.lane);
  });
  drawGus(ctx, 'back', t);
  drawRope(ctx, t);
  textBox(ctx, 2, L.TEXT_Y + 1, L.W - 4, 33, 'DID SOMEBODY... MOVE?', 40, t, 'GUS');
  ctx.restore();
}

let last = performance.now();
let t = 0;
function loop(now: number) {
  t += (now - last) / 1000;
  last = now;
  draw(t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
addEventListener('resize', () => scr.fitFixed(host));
