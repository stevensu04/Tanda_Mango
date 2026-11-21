import { C } from './pix/palette';
import { Screen, rect, dither, frame, textBox, meter, blit, disc, sprite } from './pix/pix';
import { drawText, drawTextCentered, textWidth, wrap } from './pix/font';
import { lookFromSeed, playerSprite, gusSprite, icon, type PlayerLook, type PlayerFrame } from './pix/sprites';
import { sfx, unlock } from './pix/sfx';
import { devbar } from './devbar';
import { CHAOS, POWERS, MUGSHOT, SOLO, DEFAULT_NAMES, LINES } from './mock';

type S = 'join' | 'sneak' | 'looking' | 'shake' | 'mash' | 'still' | 'pass' | 'flung' | 'nerd' | 'owner' | 'lounge' | 'mosh' | 'dodge' | 'flip' | 'captcha' | 'mugshot' | 'solo' | 'alley' | 'vip';

const STATES: { key: string; id: S; label: string }[] = [
  { key: '1', id: 'join', label: 'JOIN' },
  { key: '2', id: 'sneak', label: 'SNEAK' },
  { key: '3', id: 'looking', label: 'LOOKING' },
  { key: '4', id: 'shake', label: 'SHAKE' },
  { key: '5', id: 'mash', label: 'MASH' },
  { key: '6', id: 'still', label: 'FREEZE' },
  { key: '7', id: 'pass', label: 'PASS' },
  { key: '8', id: 'flung', label: 'FLUNG' },
  { key: '9', id: 'nerd', label: 'NERD' },
  { key: '0', id: 'owner', label: 'OWNER' },
  { key: 'Q', id: 'lounge', label: 'LOUNGE' },
  { key: 'W', id: 'mosh', label: 'MOSH' },
  { key: 'E', id: 'dodge', label: 'DODGE' },
  { key: 'R', id: 'flip', label: 'FLIP' },
  { key: 'T', id: 'captcha', label: 'CAPTCHA' },
  { key: 'Y', id: 'mugshot', label: 'MUGSHOT' },
  { key: 'U', id: 'solo', label: 'SOLO' },
  { key: 'I', id: 'alley', label: 'ALLEY' },
];

const W = 160;
const host = document.getElementById('phone')!;
const scr = new Screen(host, W, 300);
const ctx = scr.ctx;

// ---------- player ----------
let seed = Math.floor(Math.random() * 1e6);
let look: PlayerLook = lookFromSeed(seed);
let nameIdx = 0;
let myName = DEFAULT_NAMES[0];
let motionAsked = false;
let motionOK = false;

// ---------- state ----------
let state: S = 'join';
let st = 0;
let t = 0;
let curtain = -1;          // -1 idle, else 0..0.8 seconds into the wipe
let curtainNext: S = 'sneak';
let holding = false;
let progress = 0.22;
let level: string | null = null;
const cycle = { phase: 'back' as 'back' | 'tell' | 'watch', left: 2.5, watchT: 0 };
let micro = { score: 0, taps: 0, energy: 0, still: 1 };
let coins: { x: number; y: number; vy: number; life: number }[] = [];
let picked = -1;
let captchaDone = false;
let dodge = { x: 80, y: 0, moves: 0 };
let cooldowns = POWERS.map(() => 0);
let resultLine = '';

const bar = devbar(STATES, (id) => go(id as S), { collapsed: true });

function go(s: S) {
  state = s; st = 0; bar.mark(s);
  micro = { score: 0, taps: 0, energy: 0, still: 1 };
  coins = [];
  holding = false;
  picked = -1;
  captchaDone = false;
  host.style.transform = s === 'flip' ? 'rotate(180deg)' : '';
  if (s === 'looking') { cycle.phase = 'watch'; cycle.left = 99; }
  if (s === 'sneak' || s === 'dodge' || s === 'flip') { cycle.phase = 'back'; cycle.left = 2.5; }
  if (s === 'dodge') dodge = { x: 80, y: 0, moves: 0 };
  if (s === 'pass') resultLine = LINES.pass;
  if (s === 'flung') resultLine = LINES.fling;
  if (s === 'vip') sfx.vip();
}

/** Velvet-curtain wipe into the next state (the "encounter" transition). */
function wipeTo(s: S) { if (curtain < 0) { curtain = 0; curtainNext = s; } }

function buzz(p: number | number[]) { navigator.vibrate?.(p); }

// ---------- hit regions, rebuilt every frame ----------
type Hit = { x: number; y: number; w: number; h: number; id: string };
let hits: Hit[] = [];
function hit(id: string, x: number, y: number, w: number, h: number) { hits.push({ id, x, y, w, h }); }

function button(id: string, label: string, x: number, y: number, w: number, h: number, fill: string = C.PAPER, ink: string = C.INK, pressed = false) {
  frame(ctx, x, y + (pressed ? 1 : 0), w, h, fill, ink);
  drawTextCentered(ctx, label, x + w / 2, y + Math.round(h / 2) - 3 + (pressed ? 1 : 0), ink);
  hit(id, x, y, w, h);
}

// ---------- the little street window at the top ----------
function streetWindow(h: number, gusPhase: 'back' | 'tell' | 'watch' | 'sleep', frameMe: PlayerFrame, x01: number) {
  const y0 = 4;
  frame(ctx, 2, y0, W - 4, h, C.NIGHT, C.PAPER);
  const ix = 6, iy = y0 + 6, iw = W - 12, ih = h - 12;
  ctx.save();
  ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
  // the window is a 2x zoom on the street (the only place pixels double up)
  ctx.translate(ix, iy);
  ctx.scale(2, 2);
  const vw = Math.ceil(iw / 2), vh = Math.ceil(ih / 2);
  rect(ctx, 0, 0, vw, vh, C.BRICK_HI);
  for (let y = 0; y < vh; y += 4) {
    rect(ctx, 0, y + 3, vw, 1, C.BRICK);
    for (let x = (y / 4) % 2 ? 4 : 0; x < vw; x += 8) rect(ctx, x, y, 1, 3, C.BRICK);
  }
  const ground = vh - 8;
  rect(ctx, 0, ground, vw, 8, C.STONE);
  rect(ctx, 0, ground, vw, 1, C.INK);
  rect(ctx, vw - 14, ground - 26, 16, 26, C.INK);
  rect(ctx, vw - 13, ground - 25, 16, 25, C.NIGHT);
  rect(ctx, vw - 15, ground - 28, 18, 2, C.NEON);
  // gus
  blit(ctx, gusSprite(gusPhase, gusPhase === 'watch' ? C.ALERT : gusPhase === 'tell' ? C.LAMP : C.INK), vw - 36, ground - 27);
  if (gusPhase === 'tell' || gusPhase === 'watch') blit(ctx, icon.bang(gusPhase === 'watch' ? C.ALERT : C.LAMP), vw - 28, ground - 39 + (Math.floor(t * 12) % 2));
  if (gusPhase === 'watch') {
    ctx.fillStyle = C.ALERT;
    for (let y = 0; y < ground; y += 2) for (let x = (y >> 1) % 4; x < vw - 38; x += 4) ctx.fillRect(x, y, 1, 1);
  }
  // me
  const mx = 2 + Math.round(x01 * (vw - 56));
  blit(ctx, playerSprite(look, frameMe), mx, ground - 15);
  ctx.restore();
  // name tag at 1x so the type stays crisp
  const tagX = ix + (2 + Math.round(x01 * (Math.ceil(iw / 2) - 56))) * 2 + 2;
  const tagY = iy + (Math.ceil(ih / 2) - 8 - 15) * 2 - 12;
  rect(ctx, tagX, tagY, textWidth('YOU') + 4, 9, C.INK);
  drawText(ctx, 'YOU', tagX + 2, tagY + 1, C.SAFE);
  return y0 + h;
}

function statusLine(y: number, text: string, color: string) {
  rect(ctx, 0, y, W, 12, C.INK);
  drawTextCentered(ctx, text, W / 2, y + 3, color);
}

/** The giant arcade button. Returns its centre for hit testing. */
function bigButton(cx: number, cy: number, r: number, top: string, bottom: string, color: string, ink: string = C.INK) {
  const pressed = holding;
  disc(ctx, cx, cy + 4, r + 2, C.INK);            // base shadow
  disc(ctx, cx, cy + 3, r, C.SHADE);
  disc(ctx, cx, cy + (pressed ? 3 : 0), r, C.INK);
  disc(ctx, cx, cy + (pressed ? 3 : 0), r - 2, color);
  // highlight crescent (hard pixels)
  if (!pressed) { rect(ctx, cx - 31, cy - 14, 3, 10, C.PAPER); rect(ctx, cx - 28, cy - 24, 3, 8, C.PAPER); rect(ctx, cx - 23, cy - 31, 7, 3, C.PAPER); }
  const oy = pressed ? 3 : 0;
  drawTextCentered(ctx, top, cx, cy - 12 + oy, ink, 2);
  drawTextCentered(ctx, bottom, cx, cy + 7 + oy, ink, 1);
  hit('big', cx - r, cy - r, r * 2, r * 2 + 4);
}

function progressBar(y: number) {
  drawText(ctx, 'LINE', 6, y + 1, C.STONE_HI);
  meter(ctx, 32, y, W - 70, 9, progress, C.SAFE, 12);
  drawText(ctx, 'DOOR', W - 33, y + 1, C.LAMP);
}

// ---------- screens ----------
function drawJoin() {
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  drawTextCentered(ctx, 'CLUB', W / 2, 10, C.NEON, 2);
  drawTextCentered(ctx, 'VELVET', W / 2, 28, C.NEON, 2);
  drawTextCentered(ctx, 'TONIGHT: YOU SNEAK IN', W / 2, 48, C.STONE_HI);
  // avatar on a little spotlight
  const ay = 62;
  frame(ctx, 30, ay, 100, 84, C.ASPHALT, C.PAPER);
  dither(ctx, 36, ay + 54, 88, 8, C.ASPHALT_HI);
  blit(ctx, playerSprite(look, Math.floor(t * 2) % 6 === 0 ? 'cheer' : 'stand'), 48, ay + 4, false, 4);
  button('prevLook', '<', 4, ay + 30, 22, 22);
  button('nextLook', '>', W - 26, ay + 30, 22, 22);
  // name (rerolled, never typed)
  frame(ctx, 8, ay + 92, W - 16, 22);
  drawTextCentered(ctx, myName, W / 2 - 14, ay + 100, C.INK);
  button('name', 'NEW', W - 44, ay + 94, 34, 18, C.LAMP);
  // motion permission
  const my = ay + 122;
  const label = motionOK ? 'SHAKING: ON' : motionAsked ? 'NO SENSOR: MASH' : 'TAP TO ENABLE SHAKING';
  button('motion', label, 8, my, W - 16, 20, motionOK ? C.SAFE : C.PAPER);
  // join
  const by = Math.max(my + 30, scr.h - 70);
  bigButtonRect('joinBtn', 'GET IN LINE', by);
}

function bigButtonRect(id: string, label: string, y: number) {
  const h = 34;
  rect(ctx, 8, y + 4, W - 16, h, C.INK);
  frame(ctx, 8, y + (holding ? 3 : 0), W - 16, h, C.NEON, C.INK);
  drawTextCentered(ctx, label, W / 2, y + 10 + (holding ? 3 : 0), C.INK, 2);
  hit(id, 8, y, W - 16, h + 4);
}

function stepCycle(dt: number) {
  cycle.left -= dt;
  if (cycle.left <= 0) {
    if (cycle.phase === 'back') { cycle.phase = 'tell'; cycle.left = 0.6; sfx.tell(); buzz(60); }
    else if (cycle.phase === 'tell') { cycle.phase = 'watch'; cycle.left = 1.6; cycle.watchT = 0; sfx.turn(); buzz([90, 40, 90]); }
    else { cycle.phase = 'back'; cycle.left = 2 + Math.random() * 2; }
  }
  if (cycle.phase === 'watch') cycle.watchT += dt;
}

function drawSneak(dt: number) {
  if (state === 'sneak' || state === 'dodge' || state === 'flip') stepCycle(dt);
  const watching = cycle.phase === 'watch';
  const telling = cycle.phase === 'tell';
  // background tells you everything without reading: mint = go, gold = careful, red = freeze
  const bg = watching ? (Math.floor(t * 6) % 2 ? C.ALERT : C.VELVET) : telling ? C.LAMP_LO : C.NIGHT;
  rect(ctx, 0, 0, W, scr.h, bg);
  const moving = holding && !watching;
  if (moving && state !== 'looking') progress = Math.min(1, progress + dt * 0.05);
  const fr: PlayerFrame = watching && holding ? 'caught' : moving ? (Math.floor(t * 8) % 2 ? 'sneakA' : 'sneakB') : 'freeze';
  const wy = streetWindow(Math.round(scr.h * 0.36), cycle.phase, fr, progress);
  const status = watching ? "HE'S LOOKING. FREEZE!" : telling ? 'HE MIGHT TURN...' : level ? `${level}: GUS IS ON HIS PHONE` : 'GUS IS ON HIS PHONE';
  statusLine(wy + 4, status, watching ? C.ALERT : telling ? C.LAMP : C.SAFE);
  progressBar(wy + 20);

  const cy = Math.round(wy + 34 + (scr.h - wy - 34) / 2);
  let cx = W / 2;
  if (state === 'dodge') {
    cx = dodge.x;
    drawTextCentered(ctx, dodge.moves < 3 ? 'GUS MOVED YOUR BUTTON' : 'FINE. IT STAYS.', W / 2, scr.h - 12, C.PAPER);
  }
  if (state === 'flip') drawTextCentered(ctx, 'UPSIDE DOWN FOR 5S', W / 2, scr.h - 12, C.PAPER);
  const color = watching ? C.PAPER : telling ? C.LAMP : C.SAFE;
  bigButton(cx, cy, 46, watching ? 'FREEZE' : 'HOLD', watching ? 'DON\'T MOVE' : 'TO SNEAK', color);

  // caught: held too long into the watch (200 ms grace)
  if (watching && holding && cycle.watchT > 0.2 && state !== 'looking') {
    sfx.caught(); buzz([200, 60, 200]);
    holding = false;
    wipeTo(motionOK ? 'shake' : 'mash');
  }
  if (progress >= 1 && state === 'sneak') { progress = 0.2; wipeTo('vip'); }
}

function stareHeader(ask: string) {
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  dither(ctx, 0, 0, W, 72, C.VELVET);
  blit(ctx, gusSprite('watch', C.ALERT), W - 64, 6, false, 2);
  blit(ctx, playerSprite(look, 'caught'), 14, 34, false, 2);
  textBox(ctx, 2, 72, W - 4, 30, ask, Math.min(ask.length, st * 30), t, 'GUS', false);
}

function microRing(y: number) {
  const left = Math.max(0, 5 - st);
  drawTextCentered(ctx, `${Math.ceil(left)}`, W / 2, y, left < 2 ? C.ALERT : C.PAPER, 3);
  if (left <= 0 && curtain < 0) {
    const pass = micro.score >= 0.6;
    if (pass) sfx.pass(); else { sfx.fling(); progress = 0; }
    go(pass ? 'pass' : 'flung');
  }
}

function drawShake() {
  stareHeader('YOU. DANCE FOR ME.');
  micro.energy = Math.max(0, micro.energy - 0.008);
  micro.score = Math.min(1, micro.score + micro.energy * 0.02);
  const y = 112;
  drawTextCentered(ctx, 'SHAKE!', W / 2, y, C.SAFE, 3);
  const dx = Math.round(Math.sin(t * 40) * micro.energy * 6);
  blit(ctx, playerSprite(look, Math.floor(t * 10) % 2 ? 'cheer' : 'stand'), 56 + dx, y + 30, false, 3);
  meter(ctx, 12, y + 86, W - 24, 12, micro.score, micro.score > 0.6 ? C.SAFE : C.LAMP, 10);
  drawText(ctx, 'NERVE', 12, y + 101, C.STONE_HI);
  drawText(ctx, 'PASS', 12 + Math.round((W - 24) * 0.6) - 10, y + 101, C.SAFE);
  rect(ctx, 12 + Math.round((W - 24) * 0.6), y + 84, 1, 16, C.PAPER);
  if (!motionOK && st > 1) drawTextCentered(ctx, 'NO SENSOR? TAP TO MASH', W / 2, scr.h - 14, C.STONE_HI);
  hit('mash', 0, 0, W, scr.h);
  microRing(scr.h - 34);
}

function drawMash(dt: number) {
  stareHeader(state === 'alley' ? 'RACCOON: DIG ME SOMETHING WEIRD.' : 'BRIBE ME. FASTER.');
  micro.score = Math.min(1, micro.taps / 28);
  const y = 110;
  drawTextCentered(ctx, state === 'alley' ? 'DIG!' : 'MASH!', W / 2, y, C.LAMP, 3);
  const cy = y + 60;
  disc(ctx, W / 2, cy + 3, 40, C.INK);
  disc(ctx, W / 2, cy + (holding ? 3 : 0), 40, C.INK);
  disc(ctx, W / 2, cy + (holding ? 3 : 0), 37, C.LAMP);
  blit(ctx, icon.coin(), W / 2 - 9, cy - 9 + (holding ? 3 : 0), false, 3);
  hit('mash', 0, 104, W, scr.h - 104);
  for (const c of coins) {
    c.y += c.vy * dt; c.vy += 260 * dt; c.life -= dt;
    blit(ctx, icon.coin(), c.x, c.y);
  }
  coins = coins.filter((c) => c.life > 0);
  meter(ctx, 12, cy + 50, W - 24, 12, micro.score, micro.score > 0.6 ? C.SAFE : C.LAMP, 10);
  drawText(ctx, `$${micro.taps * 5}`, 12, cy + 65, C.LAMP);
  if (state !== 'alley') microRing(Math.min(scr.h - 30, cy + 80));
}

function drawStill() {
  stareHeader('FREEZE. LIKE A STATUE.');
  const y = 112;
  drawTextCentered(ctx, 'HOLD STILL', W / 2, y, C.SAFE, 2);
  blit(ctx, playerSprite(look, 'freeze'), 56, y + 26, false, 3);
  if (Math.floor(t * 3) % 2) blit(ctx, icon.sweat(), 104, y + 22);
  micro.score = micro.still;
  meter(ctx, 12, y + 86, W - 24, 12, micro.still, C.SAFE, 10);
  drawText(ctx, 'STILLNESS', 12, y + 101, C.STONE_HI);
  microRing(scr.h - 34);
}

function drawResult(pass: boolean) {
  rect(ctx, 0, 0, W, scr.h, pass ? C.NIGHT : C.BRICK);
  const y = 16;
  drawTextCentered(ctx, pass ? 'YOU PASS' : 'FLUNG!', W / 2, y, pass ? C.SAFE : C.PAPER, 3);
  if (pass) {
    blit(ctx, playerSprite(look, 'stand'), 56, y + 34, false, 3);
  } else {
    // tumbling sprite arcing off the card
    const u = Math.min(1, st / 1.2);
    blit(ctx, playerSprite(look, 'caught'), 56 - u * 40, y + 34 - Math.sin(u * Math.PI) * 30, Math.floor(t * 8) % 2 === 0, 3);
    if (st < 0.4) blit(ctx, icon.puff(), 70, y + 60, false, 2);
  }
  textBox(ctx, 4, y + 96, W - 8, 52, resultLine, st * 30, t, 'GUS');
  drawTextCentered(ctx, pass ? 'YOU KEEP YOUR SPOT' : 'BACK OF THE LINE', W / 2, y + 160, pass ? C.SAFE : C.LAMP);
  if (st > 2.6 && curtain < 0) go('sneak');
}

function drawNerd() {
  const strobe = Math.floor(t * 8) % 2;
  rect(ctx, 0, 0, W, scr.h, strobe ? C.ALERT : C.VELVET);
  const left = Math.max(0, 5 - st);
  frame(ctx, 10, 40, W - 20, 92, C.PAPER, C.ALERT);
  drawTextCentered(ctx, 'NICE TRY,', W / 2, 54, C.ALERT, 2);
  drawTextCentered(ctx, 'NERD', W / 2, 74, C.ALERT, 3);
  drawTextCentered(ctx, '25 TAPS A SECOND?', W / 2, 104, C.INK);
  drawTextCentered(ctx, 'SIT OUT', W / 2, 114, C.INK);
  drawTextCentered(ctx, `${Math.ceil(left)}`, W / 2, 150, C.PAPER, 4);
  if (left <= 0) go('sneak');
}

function drawOwner() {
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  dither(ctx, 0, 0, W, 50, C.LAMP_LO);
  drawTextCentered(ctx, 'YOU RUN', W / 2, 8, C.LAMP, 2);
  drawTextCentered(ctx, 'THE DOOR', W / 2, 26, C.LAMP, 2);
  // 12-second fuse: a burning line
  const left = Math.max(0, 12 - st);
  const fw = Math.round((W - 24) * (left / 12));
  rect(ctx, 12, 54, W - 24, 3, C.ASPHALT);
  rect(ctx, 12, 54, fw, 3, C.PAPER);
  if (left > 0) { rect(ctx, 12 + fw - 1, 52 + (Math.floor(t * 12) % 2), 3, 3, C.LAMP); rect(ctx, 12 + fw, 51 - (Math.floor(t * 9) % 2), 1, 1, C.ALERT); }
  drawText(ctx, `${Math.ceil(left)}S`, W - 26, 60, C.STONE_HI);
  drawText(ctx, 'PICK A RULE:', 12, 64, C.PAPER);
  const options = CHAOS.slice(0, 3);
  const rowH = Math.max(38, Math.min(64, Math.floor((scr.h - 76 - 52) / 3) - 6));
  options.forEach((o, i) => {
    const y = 76 + i * (rowH + 6);
    const sel = picked === i;
    frame(ctx, 8, y, W - 16, rowH, sel ? C.LAMP : C.PAPER);
    if (sel || (picked < 0 && Math.floor(t * 2) % 3 === i)) drawText(ctx, '>', 14, y + rowH / 2 - 8, C.INK);
    drawText(ctx, o.name, 24, y + rowH / 2 - 8, C.INK, 1);
    drawText(ctx, o.blurb, 24, y + rowH / 2 + 3, C.STONE);
    hit(`rule${i}`, 8, y, W - 16, rowH);
  });
  if (picked >= 0) {
    textBox(ctx, 4, scr.h - 44, W - 8, 40, `RULE SET: ${options[picked].name}. GUS IS NOT HAPPY.`, (st - pickedAt) * 30, t, 'GUS');
  } else if (left <= 0) { picked = 1; pickedAt = st; }
}
let pickedAt = 0;

const ICON_BANANA = ['....kk..', '...kyk..', '..kyyk..', '.kyyk...', 'kyyk....', 'kyyyk...', '.kyyyykk', '..kkkk..'];
const ICON_HORN = ['......kk', '....kkyk', 'kkkkyyyk', 'kwwyyyyk', 'kwwyyyyk', 'kkkkyyyk', '....kkyk', '......kk'];
const ICON_LIGHT = ['kkkk....', 'kwwkkkkk', 'kwwwwwwk', 'kwwwwwwk', 'kwwkkkkk', 'kkkk....', '........', '........'];
const ICON_CROWN = ['k..kk..k', 'kk.kk.kk', 'kykyykyk', 'kyyyyyyk', 'kyyyyyyk', 'kkkkkkkk', '........', '........'];
const POWER_ICONS = [ICON_BANANA, ICON_HORN, ICON_LIGHT, ICON_CROWN];

function drawLounge(dt: number) {
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  dither(ctx, 0, 0, W, 44, Math.floor(t * 4) % 2 ? C.NEON : C.VELVET, Math.floor(t * 4));
  drawTextCentered(ctx, 'VIP LOUNGE', W / 2, 10, C.LAMP, 2);
  drawTextCentered(ctx, 'MESS WITH THE LINE', W / 2, 30, C.PAPER);
  POWERS.forEach((p, i) => {
    cooldowns[i] = Math.max(0, cooldowns[i] - dt);
    const x = 8 + (i % 2) * 74, y = 56 + Math.floor(i / 2) * 78;
    const cd = cooldowns[i];
    frame(ctx, x, y, 70, 70, cd > 0 ? C.STONE : C.PAPER);
    blit(ctx, sprite(`pw${i}`, POWER_ICONS[i], { k: C.INK, y: C.LAMP, w: C.PAPER }), x + 23, y + 10, false, 3);
    drawTextCentered(ctx, p.name, x + 35, y + 40, C.INK);
    drawTextCentered(ctx, p.blurb.split(' ')[0], x + 35, y + 50, C.STONE);
    if (cd > 0) {
      dither(ctx, x + 4, y + 4, 62, Math.round(62 * (cd / p.cooldown)), C.INK);
      drawTextCentered(ctx, `${Math.ceil(cd)}`, x + 35, y + 26, C.PAPER, 2);
    }
    hit(`power${i}`, x, y, 70, 70);
  });
  progressBar(scr.h - 16);
}

function drawMosh() {
  const pulse = holding ? 1 : 0;
  rect(ctx, 0, 0, W, scr.h, pulse ? C.PAPER : C.SAFE);
  dither(ctx, 0, 0, W, scr.h, C.INK, Math.floor(t * 6));
  drawTextCentered(ctx, 'TEAM CROWD', W / 2, 20, C.SAFE, 2);
  frame(ctx, 14, 60, W - 28, 80, C.SAFE, C.INK);
  drawTextCentered(ctx, 'MASH!', W / 2, 82 + pulse, C.INK, 4);
  drawTextCentered(ctx, `${micro.taps} PUSHES`, W / 2, 158, C.PAPER);
  drawTextCentered(ctx, 'RUSH THE DOOR', W / 2, 172, C.PAPER);
  hit('mash', 0, 0, W, scr.h);
}

function drawCaptcha() {
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  frame(ctx, 6, 20, W - 12, 230);
  drawText(ctx, 'ARE YOU HUMAN?', 14, 28, C.INK);
  const lines = wrap('TAP ALL SQUARES CONTAINING DIGNITY', 22);
  lines.forEach((l, i) => drawText(ctx, l, 14, 42 + i * 9, C.VELVET));
  const icons = [icon.coin(), icon.sweat(), icon.note(), icon.puff(), icon.cat(false), icon.heart(), icon.star(), icon.question(), icon.bang()];
  icons.forEach((img, i) => {
    const x = 16 + (i % 3) * 44, y = 66 + Math.floor(i / 3) * 44;
    rect(ctx, x, y, 40, 40, C.INK);
    rect(ctx, x + 1, y + 1, 38, 38, C.STONE_HI);
    blit(ctx, img, x + 20 - img.width, y + 20 - img.height, false, 2);
    hit('captcha', x, y, 40, 40);
  });
  if (captchaDone) {
    textBox(ctx, 4, scr.h - 50, W - 8, 46, 'NONE FOUND. CORRECT. YOU ARE HUMAN.', st * 30, t, 'GUS');
    if (st > 2) go('sneak');
  }
}

function drawMugshot() {
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  const x = 12, y = 8, w = W - 24, h = Math.min(scr.h - 16, 270);
  rect(ctx, x, y, w, h, C.PAPER);
  for (let i = 0; i < w; i += 4) { rect(ctx, x + i, y - 2, 2, 2, C.PAPER); rect(ctx, x + i + 2, y + h, 2, 2, C.PAPER); }
  drawTextCentered(ctx, 'CLUB VELVET', W / 2, y + 8, C.VELVET);
  drawTextCentered(ctx, 'RECEIPT #0412', W / 2, y + 18, C.STONE);
  // lineup wall
  const lx = x + 10, ly = y + 30, lw = w - 20;
  rect(ctx, lx, ly, lw, 60, C.STONE_HI);
  for (let i = 0; i < 6; i++) { rect(ctx, lx, ly + 6 + i * 9, lw, 1, C.STONE); drawText(ctx, `${6 - i}`, lx + 2, ly + 2 + i * 9, C.STONE); }
  blit(ctx, playerSprite(look, 'stand'), W / 2 - 24, ly + 6, false, 3);
  rect(ctx, W / 2 - 22, ly + 50, 44, 9, C.INK);
  drawTextCentered(ctx, MUGSHOT.name, W / 2, ly + 51, C.PAPER);
  const rows: [string, string][] = [
    ['TIMES CAUGHT', `${MUGSHOT.caught}`], ['BEST DANCE', `${MUGSHOT.bestDance}`], ['DISTANCE', MUGSHOT.distance],
  ];
  let ry = ly + 70;
  for (const [k, v] of rows) {
    drawText(ctx, k, x + 8, ry, C.INK);
    for (let dx = x + 8 + textWidth(k) + 2; dx < x + w - 10 - textWidth(v) - 2; dx += 3) rect(ctx, dx, ry + 6, 1, 1, C.STONE);
    drawText(ctx, v, x + w - 8 - textWidth(v), ry, C.INK);
    ry += 11;
  }
  rect(ctx, x + 8, ry + 2, w - 16, 1, C.INK);
  drawText(ctx, 'TITLE:', x + 8, ry + 8, C.STONE);
  drawText(ctx, MUGSHOT.title, x + 8, ry + 17, C.INK);
  wrap(`"${MUGSHOT.roast}"`, 19).forEach((l, i) => drawText(ctx, l, x + 8, ry + 31 + i * 9, C.VELVET));
  // threat stamp
  frame(ctx, x + w - 60, ry + 54, 52, 24, C.PAPER, C.ALERT);
  drawTextCentered(ctx, 'THREAT', x + w - 34, ry + 59, C.ALERT);
  drawTextCentered(ctx, MUGSHOT.threat, x + w - 34, ry + 68, C.ALERT);
  if (Math.floor(t * 2) % 2) drawText(ctx, 'SCREENSHOT ME', x + 8, ry + 64, C.STONE);
}

function drawSolo() {
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  drawTextCentered(ctx, 'SOLO NIGHT', W / 2, 12, C.NEON, 2);
  drawTextCentered(ctx, 'NOBODY ELSE HERE. 3 DOORS.', W / 2, 32, C.STONE_HI);
  SOLO.forEach((lv, i) => {
    const y = 50 + i * 56;
    const locked = i > 0;
    frame(ctx, 8, y, W - 16, 50, locked ? C.STONE : C.PAPER);
    drawText(ctx, `${i + 1}. ${lv.name}`, 16, y + 9, C.INK);
    drawText(ctx, `DOOR: ${lv.guard}`, 16, y + 21, locked ? C.ASPHALT : C.VELVET);
    drawText(ctx, lv.note.slice(0, 21), 16, y + 33, C.ASPHALT);
    if (locked) drawText(ctx, 'LOCKED', W - 54, y + 9, C.ASPHALT);
    else if (Math.floor(t * 2) % 2) drawText(ctx, '>', W - 22, y + 9, C.INK);
    if (!locked) hit('solo0', 8, y, W - 16, 50);
  });
}

function drawAlley(dt: number) {
  drawMash(dt);
  // raccoon eyes peeking from the bin in the header
  rect(ctx, 6, 40, 34, 30, C.SHADE);
  rect(ctx, 6, 40, 34, 3, C.INK);
  if (Math.floor(t * 3) % 7 !== 0) { rect(ctx, 16, 48, 2, 2, C.LAMP); rect(ctx, 24, 48, 2, 2, C.LAMP); }
  if (micro.taps >= 28 && curtain < 0) { resultLine = 'A RUSTY KEY? WEIRD. GOOD. KITCHEN DOOR IS OPEN.'; go('pass'); }
}

function drawVip() {
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  dither(ctx, 0, 0, W, scr.h, Math.floor(t * 8) % 2 ? C.LAMP : C.LAMP_LO, Math.floor(t * 8));
  frame(ctx, 10, 50, W - 20, 120, C.PAPER, C.INK);
  drawTextCentered(ctx, "YOU'RE IN", W / 2, 62, C.VELVET, 2);
  blit(ctx, playerSprite(look, Math.floor(t * 4) % 2 ? 'cheer' : 'stand'), W / 2 - 24, 84, false, 3);
  drawTextCentered(ctx, 'FIRST ONE THROUGH', W / 2, 140, C.INK);
  drawTextCentered(ctx, 'YOU RUN THE DOOR NOW', W / 2, 150, C.INK);
  if (st > 2.4 && curtain < 0) wipeTo('owner');
}

function drawCurtain(dt: number) {
  if (curtain < 0) return;
  curtain += dt;
  const closing = curtain < 0.4;
  if (!closing && state !== curtainNext) go(curtainNext);
  // 4-step wipe: whole steps, never smooth
  const u = closing ? curtain / 0.4 : 1 - (curtain - 0.4) / 0.4;
  const steps = Math.ceil(Math.max(0, Math.min(1, u)) * 4) / 4;
  const half = Math.round((W / 2) * steps);
  for (const side of [0, 1]) {
    const x0 = side ? W - half : 0;
    rect(ctx, x0, 0, half, scr.h, C.VELVET);
    for (let x = x0 + (side ? 2 : 3); x < x0 + half; x += 6) rect(ctx, x, 0, 2, scr.h, C.BRICK_HI);
    for (let x = x0 + 1; x < x0 + half; x += 6) rect(ctx, x, 0, 1, scr.h, C.NEON);
    const edge = side ? x0 : x0 + half - 2;
    rect(ctx, edge, 0, 2, scr.h, C.LAMP);
  }
  if (curtain >= 0.8) curtain = -1;
}

// ---------- input ----------
function pick(x: number, y: number): string | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h.id;
  }
  return null;
}

const motionListener = (e: DeviceMotionEvent) => {
  const a = e.accelerationIncludingGravity ?? e.acceleration;
  if (!a || a.x == null) return;
  motionOK = true;
  const mag = Math.abs(a.x ?? 0) + Math.abs(a.y ?? 0) + Math.abs(a.z ?? 0);
  const jerk = Math.abs(mag - lastMag);
  lastMag = mag;
  if (state === 'shake' || state === 'mosh') micro.energy = Math.min(1, micro.energy + jerk / 60);
  if (state === 'still') micro.still = Math.max(0, Math.min(1, micro.still * 0.97 + (1 - Math.min(1, jerk / 4)) * 0.03));
};
let lastMag = 0;

async function askMotion() {
  motionAsked = true;
  const DME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
  try {
    if (typeof DME.requestPermission === 'function') {
      const r = await DME.requestPermission();
      if (r !== 'granted') return;
    }
    addEventListener('devicemotion', motionListener);
  } catch { /* plain http on iOS: no sensors, mash fallback */ }
}

host.addEventListener('pointerdown', (e) => {
  unlock();
  e.preventDefault();
  host.setPointerCapture(e.pointerId);
  let { x, y } = scr.toLogical(e.clientX, e.clientY);
  if (state === 'flip') { x = W - x; y = scr.h - y; }
  const id = pick(x, y);
  if (state === 'dodge' && id === 'big' && dodge.moves < 3) {
    dodge.moves++; dodge.x = dodge.x < 80 ? 112 : 48; sfx.blip(); return;
  }
  switch (id) {
    case 'big': case 'joinBtn': holding = true; if (id === 'big') sfx.blip(); break;
    case 'mash':
      holding = true;
      micro.taps++;
      if (state === 'shake') micro.energy = Math.min(1, micro.energy + 0.12);
      if (state === 'mash' || state === 'alley') { coins.push({ x: x - 3, y: y - 3, vy: -120 - Math.random() * 60, life: 0.8 }); sfx.coin(); } else sfx.tap();
      buzz(10);
      break;
    case 'prevLook': seed--; look = lookFromSeed(seed); sfx.blip(); break;
    case 'nextLook': seed++; look = lookFromSeed(seed); sfx.blip(); break;
    case 'name': nameIdx = (nameIdx + 1) % DEFAULT_NAMES.length; myName = DEFAULT_NAMES[nameIdx]; sfx.blip(); break;
    case 'motion': void askMotion(); break;
    case 'captcha': if (!captchaDone) { captchaDone = true; st = 0; sfx.pass(); } break;
    case 'solo0': level = SOLO[0].name; wipeTo('sneak'); break;
    default:
      if (id?.startsWith('rule') && picked < 0) { picked = Number(id.slice(4)); pickedAt = st; sfx.vip(); buzz(30); }
      if (id?.startsWith('power')) { const i = Number(id.slice(5)); if (cooldowns[i] <= 0) { cooldowns[i] = POWERS[i].cooldown; sfx.coin(); buzz(20); } }
  }
});
const release = () => {
  if (holding && state === 'join') { holding = false; wipeTo('sneak'); return; }
  holding = false;
};
host.addEventListener('pointerup', release);
host.addEventListener('pointercancel', release);
host.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- loop ----------
let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; t += dt; st += dt;
  scr.fitWidth(host, W);
  hits = [];
  switch (state) {
    case 'join': drawJoin(); break;
    case 'sneak': case 'looking': case 'dodge': case 'flip': drawSneak(dt); break;
    case 'shake': drawShake(); break;
    case 'mash': drawMash(dt); break;
    case 'still': drawStill(); break;
    case 'pass': drawResult(true); break;
    case 'flung': drawResult(false); break;
    case 'nerd': drawNerd(); break;
    case 'owner': drawOwner(); break;
    case 'lounge': drawLounge(dt); break;
    case 'mosh': drawMosh(); break;
    case 'captcha': drawCaptcha(); break;
    case 'mugshot': drawMugshot(); break;
    case 'solo': drawSolo(); break;
    case 'alley': drawAlley(dt); break;
    case 'vip': drawVip(); break;
  }
  if (state === 'flip' && st > 5) go('sneak');
  drawCurtain(dt);
  requestAnimationFrame(loop);
}
go((new URLSearchParams(location.search).get('state') as S) || 'join');
requestAnimationFrame(loop);
