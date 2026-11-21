import { tagText, cleanName, cells, cutCells, NAME_CELLS, NICKNAMES } from '../../shared/text';
import { C } from './pix/palette';
import { Screen, rect, dither, frame, textBox, meter, blit, disc, sprite } from './pix/pix';
import { drawText, drawTextCentered, textWidth, wrap } from './pix/font';
import { lookFromSeed, playerSprite, gusSprite, icon, type PlayerLook, type PlayerFrame } from './pix/sprites';
import { sfx, unlock } from './pix/sfx';
import { devbar } from './devbar';
import { CHAOS, POWERS, MUGSHOT, SOLO, LINES } from './mock';
import { connect, phoneToken } from './net';
import { buzz, haptic } from './haptics';
import { createSensors } from './sensors';
import { T, RULES, POWERS as POWER_DEFS, type Me, type Mugshot, type PhoneRole, type ServerMsg, type GusPhase } from '../../shared/protocol';

// Linked to the room server by default. ?preview (or ?state=) keeps the offline design preview.
const params = new URLSearchParams(location.search);
const LIVE = !params.has('preview') && !params.has('state');

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
let ctx = scr.ctx;   // swapped for an offscreen canvas while the mugshot PNG is rendered

// ---------- player ----------
let seed = Math.floor(Math.random() * 1e6);
let look: PlayerLook = lookFromSeed(seed);
// ---------- your name: a real <input> laid over the canvas box, so phones get their own keyboard and IME ----------
const NAME_KEY = 'club-velvet-name';
const randomNick = (not = '') => { let n = not; while (n === not) n = NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)]; return n; };
let suggested = randomNick();          // shown as the placeholder; used when the box is left blank
const savedName = (() => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } })();
let myName = cleanName(savedName) || suggested;
let composing = false;                 // the phone keyboard is mid-word (Gboard underlines it): don't rewrite the box yet
let tooLongAt = -9;                    // when we last cut the name back to 12 cells (shows the red hint)
let nameShown = false;                 // drawJoin laid the box out this frame
const nameInput = document.createElement('input');
nameInput.id = 'nameInput';
nameInput.type = 'text';
nameInput.autocomplete = 'off';
nameInput.spellcheck = false;
nameInput.enterKeyHint = 'go';
nameInput.setAttribute('autocapitalize', 'characters');
nameInput.setAttribute('autocorrect', 'off');
nameInput.setAttribute('aria-label', 'Your name');
nameInput.value = savedName ? myName : suggested;
nameInput.placeholder = suggested;
nameInput.style.cssText = `position:fixed;display:none;z-index:5;box-sizing:border-box;margin:0;padding:0 4px;border:0;outline:0;
  background:${C.PAPER};color:${C.INK};transform:translateZ(0);-webkit-transform:translateZ(0);will-change:transform;text-align:center;text-transform:uppercase;font-family:ClubPixelCJK,monospace;
  caret-color:${C.VELVET};-webkit-user-select:text;user-select:text;-webkit-font-smoothing:none;font-smooth:never;border-radius:0;`;
document.body.appendChild(nameInput);
/**
 * Read the name from the box. Always updates myName, even while the keyboard is mid-word (phone
 * keyboards hold English words "in progress" until space or blur, and tapping the canvas doesn't
 * blur). Only cuts an over-long name back to 12 letters when the keyboard isn't mid-word.
 */
function fitName() {
  if (!composing && cells(nameInput.value.trim()) > NAME_CELLS) { nameInput.value = cutCells(nameInput.value.trimStart(), NAME_CELLS); tooLongAt = t; }
  myName = cleanName(nameInput.value) || suggested;
}
nameInput.addEventListener('compositionstart', () => { composing = true; });
nameInput.addEventListener('compositionend', () => { composing = false; fitName(); });
nameInput.addEventListener('input', fitName);
nameInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  nameInput.blur();
  if (LIVE && net?.up && (!me || !me.id)) sendJoin();
});
nameInput.addEventListener('blur', fitName);
// iPhone Safari stops repainting a see-through box over the 60fps canvas until blur, so the box is
// opaque and on its own layer (translateZ). It is also left alone while focused: iOS scrolls the page
// when the keyboard opens, and moving/resizing a focused box every frame also stops it repainting.
function placeNameInput(x: number, y: number, w: number, h: number) {
  nameShown = true;
  if (nameInput.dataset.box && document.activeElement === nameInput) return;
  const r = scr.canvas.getBoundingClientRect();
  const k = r.width / scr.w;
  const px = (n: number) => `${Math.round(n)}px`;
  const box = { left: px(r.left + x * k), top: px(r.top + y * k), width: px(w * k), height: px(h * k), fontSize: px(10 * k), lineHeight: px(h * k) };
  const css = Object.values(box).join(';');
  if (nameInput.dataset.box !== css) {
    nameInput.dataset.box = css;
    Object.assign(nameInput.style, box);
    nameInput.style.display = 'block';
  }
}
function syncNameInput() {
  if (!nameShown && nameInput.style.display !== 'none') {
    if (document.activeElement === nameInput) nameInput.blur();
    nameInput.style.display = 'none';
    nameInput.dataset.box = '';
  }
  nameShown = false;
}
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

const bar = LIVE ? null : devbar(STATES, (id) => go(id as S), { collapsed: true });

function go(s: S) {
  state = s; st = 0; bar?.mark(s);
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
function streetWindow(h: number, gusPhase: 'back' | 'tell' | 'watch' | 'sleep', frameMe: PlayerFrame, x01: number, beam: number | null = null, inBeam = false) {
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
  // me (Lights Out: the window plots the whole street so the beam has a readable width)
  const vwTop = Math.ceil(iw / 2);
  const spriteX = (v: number) => (beam != null ? Math.round(v * (vwTop - 20)) : 2 + Math.round(v * (vwTop - 56)));
  if (beam != null) {
    // the street goes dark except the beam; Gus keeps his flashlight, so he is drawn on top
    const span = vw - 20, half = Math.max(2, Math.round(T.BEAM_HALF * span));
    const bl = Math.max(0, Math.round(8 + beam * span - half)), br = Math.min(vw, Math.round(8 + beam * span + half));
    rect(ctx, 0, 0, Math.max(0, bl - 2), vh, C.INK);
    dither(ctx, Math.max(0, bl - 2), 0, Math.min(2, bl), vh, C.INK);
    rect(ctx, br + 2, 0, Math.max(0, vw - br - 2), vh, C.INK);
    dither(ctx, br, 0, 2, vh, C.INK);
    dither(ctx, bl, 0, br - bl, vh, inBeam ? C.ALERT : C.LAMP, 1);
  }
  // gus
  blit(ctx, gusSprite(gusPhase, gusPhase === 'watch' ? C.ALERT : gusPhase === 'tell' ? C.LAMP : C.INK), vw - 36, ground - 27);
  if (gusPhase === 'tell' || gusPhase === 'watch') blit(ctx, icon.bang(gusPhase === 'watch' ? C.ALERT : C.LAMP), vw - 28, ground - 39 + (Math.floor(t * 12) % 2));
  if (gusPhase === 'watch') {
    ctx.fillStyle = C.ALERT;
    for (let y = 0; y < ground; y += 2) for (let x = (y >> 1) % 4; x < vw - 38; x += 4) ctx.fillRect(x, y, 1, 1);
  }
  blit(ctx, playerSprite(look, frameMe), spriteX(x01), ground - 15);
  ctx.restore();
  if (inBeam && Math.floor(t * 8) % 2) { rect(ctx, 2, y0, W - 4, 2, C.ALERT); rect(ctx, 2, y0 + h - 2, W - 4, 2, C.ALERT); }
  // name tag at 1x so the type stays crisp
  const tagX = ix + spriteX(x01) * 2 + 2;
  const tagY = iy + (Math.ceil(ih / 2) - 8 - 15) * 2 - 12;
  const myTag = me?.tag ?? 0;
  rect(ctx, tagX, tagY, textWidth('YOU') + 4, 9, C.INK);
  drawText(ctx, 'YOU', tagX + 2, tagY + 1, C.SAFE);
  if (myTag) badge(myTag, tagX + textWidth('YOU') + 5, tagY - 1);
  return y0 + h;
}

/** The player number badge: same number on this phone, above your avatar on the projector and in the results. */
function badgeW(n: number, scale = 1) { return textWidth(tagText(n), scale) + 3 * scale + 1; }
function badge(n: number, x: number, y: number, scale = 1) {
  if (!n) return 0;
  const w = badgeW(n, scale), h = 7 * scale + 3;
  rect(ctx, x, y, w, h, C.INK);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, C.LAMP);
  drawText(ctx, tagText(n), x + 2 * scale, y + 2, C.INK, scale);
  return w;
}
/** Badge + name centred on cx. */
function badgeName(n: number, name: string, cx: number, y: number, color: string) {
  const bw = n ? badgeW(n) + 3 : 0;
  const x = Math.round(cx - (bw + textWidth(name)) / 2);
  if (n) badge(n, x, y - 2);
  drawText(ctx, name, x + bw, y, color);
}

function statusLine(y: number, text: string, color: string) {
  rect(ctx, 0, y, W, 12, C.INK);
  drawTextCentered(ctx, text, W / 2, y + 3, color);
}

/** The giant arcade button. Returns its centre for hit testing. */
let lastBig = '';   // the big button's words this frame (read by the browser test hook)
function bigButton(cx: number, cy: number, r: number, top: string, bottom: string, color: string, ink: string = C.INK) {
  lastBig = `${top} ${bottom}`;
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

function progressBar(y: number, label = 'LINE') {
  drawText(ctx, label, 6, y + 1, C.STONE_HI);
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
  // your name: typed or rerolled with NEW; the box is a real input on top of the canvas
  drawText(ctx, 'YOUR NAME', 10, ay + 88, C.STONE_HI);
  const focused = document.activeElement === nameInput;
  frame(ctx, 8, ay + 97, W - 52, 22, C.PAPER, focused ? C.VELVET : C.INK);
  placeNameInput(9, ay + 98, W - 54, 20);
  button('name', 'NEW', W - 40, ay + 99, 32, 18, C.LAMP);
  const long = t - tooLongAt < 3;
  drawTextCentered(ctx, long ? 'TOO LONG: MAX 12 LETTERS' : 'MAX 12 LETTERS', W / 2, ay + 123, long ? C.ALERT : C.STONE);
  // motion permission
  const my = ay + 134;
  if (!LIVE) {
    const label = motionOK ? 'SHAKING: ON' : motionAsked ? 'NO SENSOR: MASH' : 'TAP TO ENABLE SHAKING';
    button('motion', label, 8, my, W - 16, 20, motionOK ? C.SAFE : C.PAPER);
  }
  // join
  const by = Math.max(my + 30, scr.h - 70);
  bigButtonRect('joinBtn', LIVE && joinSentAt >= 0 && t - joinSentAt < 2 ? 'JOINING...' : LIVE && !roomCode ? 'PLAY SOLO' : 'GET IN LINE', by);
  if (LIVE && !netUp) drawTextCentered(ctx, 'LOOKING FOR THE CLUB...', W / 2, by - 12, C.STONE_HI);
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
  if (!LIVE && st > 2.6 && curtain < 0) go('sneak');
}

function drawNerd(left = Math.max(0, 5 - st)) {
  const strobe = Math.floor(t * 8) % 2;
  rect(ctx, 0, 0, W, scr.h, strobe ? C.ALERT : C.VELVET);
  frame(ctx, 10, 40, W - 20, 92, C.PAPER, C.ALERT);
  drawTextCentered(ctx, 'NICE TRY,', W / 2, 54, C.ALERT, 2);
  drawTextCentered(ctx, 'NERD', W / 2, 74, C.ALERT, 3);
  drawTextCentered(ctx, `${LIVE ? T.NERD_TAPS : 25} TAPS A SECOND?`, W / 2, 104, C.INK);
  drawTextCentered(ctx, 'SIT OUT', W / 2, 114, C.INK);
  drawTextCentered(ctx, `${Math.ceil(left)}`, W / 2, 150, C.PAPER, 4);
  if (!LIVE && left <= 0) go('sneak');
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

const RECEIPT_X = 12, RECEIPT_W = W - 24, RECEIPT_H = 240;

/** The personal mugshot receipt, drawn with its top edge at y. Used on the phone and for the PNG export. */
function drawReceipt(mug: Mugshot, lk: PlayerLook, y: number) {
  const x = RECEIPT_X, w = RECEIPT_W, h = RECEIPT_H;
  rect(ctx, x, y, w, h, C.PAPER);
  for (let i = 0; i < w; i += 4) { rect(ctx, x + i, y - 2, 2, 2, C.PAPER); rect(ctx, x + i + 2, y + h, 2, 2, C.PAPER); }
  drawTextCentered(ctx, 'CLUB VELVET', W / 2, y + 8, C.VELVET);
  drawTextCentered(ctx, `RECEIPT #${String(1000 + (Math.abs(mug.seed | 0) % 9000))}`, W / 2, y + 18, C.STONE);
  // lineup wall
  const lx = x + 10, ly = y + 30, lw = w - 20;
  rect(ctx, lx, ly, lw, 60, C.STONE_HI);
  for (let i = 0; i < 6; i++) { rect(ctx, lx, ly + 6 + i * 9, lw, 1, C.STONE); drawText(ctx, `${6 - i}`, lx + 2, ly + 2 + i * 9, C.STONE); }
  blit(ctx, playerSprite(lk, 'stand'), W / 2 - 24, ly + 6, false, 3);
  const pw = textWidth(mug.name) + 8;
  rect(ctx, Math.round(W / 2 - pw / 2), ly + 50, pw, 9, C.INK);
  drawTextCentered(ctx, mug.name, W / 2, ly + 51, C.PAPER);
  const rows: [string, string][] = [['TIMES CAUGHT', `${mug.caught}`], ['BEST MOVES', `${mug.bestMicro}%`], ['DISTANCE', mug.distance]];
  let ry = y + 100;
  for (const [k, v] of rows) {
    drawText(ctx, k, x + 8, ry, C.INK);
    for (let dx = x + 8 + textWidth(k) + 4; dx < x + w - 10 - textWidth(v) - 2; dx += 3) rect(ctx, dx, ry + 6, 1, 1, C.STONE);
    drawText(ctx, v, x + w - 8 - textWidth(v), ry, C.INK);
    ry += 11;
  }
  rect(ctx, x + 8, ry + 2, w - 16, 1, C.INK);
  drawText(ctx, 'TITLE:', x + 8, ry + 8, C.STONE);
  const title = wrap(mug.title, 20).slice(0, 2);
  title.forEach((l, i) => drawText(ctx, l, x + 8, ry + 17 + i * 9, C.INK));
  let qy = ry + 19 + title.length * 9;
  const roast = wrap(`"${mug.roast}"`, 20);
  const maxLines = title.length > 1 ? 3 : 4;
  const shown = roast.slice(0, maxLines);
  if (roast.length > maxLines) shown[maxLines - 1] = shown[maxLines - 1].slice(0, 17) + '...';
  shown.forEach((l, i) => drawText(ctx, l, x + 8, qy + i * 9, C.VELVET));
  qy = y + 196;
  rect(ctx, x + 8, qy, w - 16, 11, C.INK);
  drawTextCentered(ctx, mug.rankLine, W / 2, qy + 2, C.LAMP);
  frame(ctx, x + 14, qy + 17, w - 28, 18, C.PAPER, C.ALERT);
  drawTextCentered(ctx, `THREAT: ${mug.threat}`, W / 2, qy + 23, C.ALERT);
}

function drawMugshot() {
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  drawReceipt({ name: MUGSHOT.name, seed: 412, caught: MUGSHOT.caught, passes: 1, bestMicro: MUGSHOT.bestDance, distance: MUGSHOT.distance, roast: MUGSHOT.roast, title: MUGSHOT.title, threat: MUGSHOT.threat as Mugshot['threat'], rankLine: '#3 OF 7' }, look, 8);
  if (Math.floor(t * 2) % 2) drawTextCentered(ctx, 'SCREENSHOT ME', W / 2, RECEIPT_H + 24, C.STONE_HI);
}

/** Renders the receipt at 4x (hard pixels) and downloads it as a PNG. */
function saveMugshot(mug: Mugshot, lk: PlayerLook) {
  const pad = 8, h = RECEIPT_H + pad * 2 + 2;
  const off = document.createElement('canvas');
  off.width = W; off.height = h;
  const octx = off.getContext('2d')!;
  octx.imageSmoothingEnabled = false;
  const live = ctx;
  ctx = octx;
  try { rect(ctx, 0, 0, W, h, C.NIGHT); drawReceipt(mug, lk, pad); } finally { ctx = live; }
  const big = document.createElement('canvas');
  big.width = W * 4; big.height = h * 4;
  const bctx = big.getContext('2d')!;
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(off, 0, 0, big.width, big.height);
  big.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'club-velvet-mugshot.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, 'image/png');
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
  holdPtr = -1;
  e.preventDefault();
  try { host.setPointerCapture(e.pointerId); } catch { /* synthetic or already-lifted pointer */ }
  let { x, y } = scr.toLogical(e.clientX, e.clientY);
  if (state === 'flip') { x = W - x; y = scr.h - y; }
  const id = pick(x, y);
  if (LIVE) { if (liveDown(id, x, y)) { if (holding) holdPtr = e.pointerId; return; } }
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
    case 'name': suggested = randomNick(myName); nameInput.value = suggested; nameInput.placeholder = suggested; myName = suggested; tooLongAt = -9; sfx.blip(); break;
    case 'motion': void askMotion(); break;
    case 'captcha': if (!captchaDone) { captchaDone = true; st = 0; sfx.pass(); } break;
    case 'solo0': level = SOLO[0].name; wipeTo('sneak'); break;
    default:
      if (id?.startsWith('rule') && picked < 0) { picked = Number(id.slice(4)); pickedAt = st; sfx.vip(); buzz(30); }
      if (id?.startsWith('power')) { const i = Number(id.slice(5)); if (cooldowns[i] <= 0) { cooldowns[i] = POWERS[i].cooldown; sfx.coin(); buzz(20); } }
  }
});
let holdPtr = -1;   // the finger that owns the HOLD button: other fingers lifting must not release it
const release = (cancel = false) => {
  if (LIVE) { liveUp(cancel); return; }
  if (holding && state === 'join') { holding = false; wipeTo('sneak'); return; }
  holding = false;
};
const onUp = (e: PointerEvent, cancel: boolean) => {
  if (LIVE && holdPtr >= 0 && e.pointerId !== holdPtr) return;
  holdPtr = -1;
  release(cancel);
};
host.addEventListener('pointerup', (e) => onUp(e, false));
host.addEventListener('pointercancel', (e) => onUp(e, true));
host.addEventListener('contextmenu', (e) => e.preventDefault());

// =====================================================================
// LIVE: every screen below renders what the room server says (Me).
// Nothing here is simulated locally except sparkle (coins, sfx, curtain).
// =====================================================================
let me: Me | null = null;
// read-only hook for the browser end-to-end test (scripts/e2e.ts): where is a button, what does the server say
(window as unknown as { __club: unknown }).__club = {
  me: () => me,
  name: () => myName,
  button: () => lastBig,
  target(id: string) {
    const h = hits.find((x) => x.id === id);
    if (!h) return null;
    const r = scr.canvas.getBoundingClientRect();
    return { x: r.left + ((h.x + h.w / 2) / scr.w) * r.width, y: r.top + ((h.y + h.h / 2) / scr.h) * r.height };
  },
};
let netUp = false;
let everUp = false;
let role: PhoneRole = 'join';
let roleSince = 0;
let lastGus: GusPhase = 'back';
let pressSent = false;
let joinArmed = false;
let joinSentAt = -1;
let ruleSent = false;
let rulePicked = -1;
let revealMug = false;       // reveal / solo-done: false = result card, true = mugshot receipt
let revealTouched = false;   // the player tapped, so stop auto-flipping
let savedAt = -99;
let wasInBeam = false;
let shakeVis = 0;            // last shake energy, for the sprite jitter
let lastShakeSend = 0;
let sayN = -1;
let sayAt = 0;
let noticeN = -1;

/** ?room=ABCD joins that room; no room param is the solo gauntlet. */
const roomCode = (params.get('room') ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

const sensors = LIVE ? createSensors(() => net?.send({ t: 'caps', motion: true })) : null;
const net = LIVE
  ? connect(
    () => ({ t: 'hello', role: 'phone', token: phoneToken(), ...(roomCode ? { room: roomCode } : {}), motion: sensors?.ok ?? false }),
    onServer,
    (up) => { netUp = up; everUp ||= up; },
  )
  : null;

function curtainFx() { if (curtain < 0) { curtain = 0; curtainNext = state; } }

function onServer(m: ServerMsg) {
  if (m.t === 'ping') { net?.send({ t: 'pong', n: m.n }); return; }
  if (m.t !== 'me') return;
  me = m;
  if (m.id) {
    myName = m.name;
    if (m.seed !== seed) { seed = m.seed; look = lookFromSeed(seed); }
  }
  if (m.role !== role) {
    const from = role;
    role = m.role; roleSince = t; st = 0;
    holding = false; micro.taps = 0; coins = [];
    revealMug = false; revealTouched = false;
    onRoleChange(from, m);
  }
  if (m.notice && m.notice.n !== noticeN) {
    noticeN = m.notice.n;
    if (m.notice.tone === 'bad') { sfx.fling(); buzz([60, 40, 60]); } else sfx.coin();
  }
  if (m.role === 'sneak' && m.gus !== lastGus) {
    if (m.gus === 'tell') { sfx.tell(); haptic.tell(); }
    if (m.gus === 'watch') { sfx.turn(); haptic.turn(); }
  }
  lastGus = m.gus;
}

function onRoleChange(from: PhoneRole, m: Me) {
  if (m.role === 'caught') { sfx.caught(); haptic.caught(); curtainFx(); }
  if (m.role === 'result') { if (m.result?.pass) { sfx.pass(); haptic.pass(); } else { sfx.fling(); haptic.fling(); } }
  if (m.role === 'owner-pick') { ruleSent = false; rulePicked = -1; sfx.vip(); haptic.vip(); curtainFx(); }
  if (m.role === 'lounge' && from === 'sneak') { sfx.vip(); haptic.vip(); }
  if (m.role === 'break' || m.role === 'defend') buzz([120, 60, 120]);
  if (m.role === 'support' || m.role === 'defending') { sfx.tell(); buzz(80); }
  if (m.role === 'nerd') sfx.nerd();
  if (m.role === 'solo-clear') { sfx.pass(); haptic.pass(); curtainFx(); }
  if (m.role === 'solo-done') { sfx.vip(); haptic.vip(); curtainFx(); }
  if (m.role === 'reveal') { if (m.reveal?.winnerId === m.id) { sfx.vip(); buzz([80, 40, 80, 40, 200]); } else sfx.blip(true); curtainFx(); }
}

function liveDown(id: string | null, x: number, y: number): boolean {
  if (!net) return false;
  const m = me;
  switch (id) {
    case 'joinBtn': holding = true; joinArmed = true; return true;
    case 'refresh': resync(); return true;
    case 'big':
      holding = true; sfx.blip();
      if (role === 'sneak') { net.send({ t: 'press' }); pressSent = true; }
      return true;
    case 'crown': case 'keep':
      if (role === 'support' && !m?.vote?.choice && t - roleSince >= 0.5) { net.send({ t: 'vote', choice: id }); sfx.vip(); haptic.tap(); }
      return true;
    case 'mash':
      holding = true; micro.taps++;
      net.send({ t: 'tap' });
      coins.push({ x: x - 3, y: y - 3, vy: -120 - Math.random() * 60, life: 0.8 });
      if (role === 'caught') sfx.coin(); else sfx.tap();
      haptic.tap();
      return true;
    case 'soloGo': location.href = 'play.html'; return true;
    case 'retype': location.href = `./?room=${encodeURIComponent(m?.code ?? roomCode)}`; return true;
    case 'menu': net.send({ t: 'solo', op: 'menu' }); sfx.blip(); return true;
    case 'again': net.send({ t: 'solo', op: 'start', level: 0 }); sfx.vip(); return true;
    case 'save': if (m?.mugshot) { saveMugshot(m.mugshot, look); savedAt = t; sfx.pass(); } return true;
    case 'toggle': revealMug = !revealMug; revealTouched = true; sfx.blip(); return true;
    default:
      if (id?.startsWith('rule')) {
        const i = Number(id.slice(4)), rule = m?.ruleChoices[i];
        if (rule && !ruleSent) { net.send({ t: 'rule', rule }); ruleSent = true; rulePicked = i; sfx.vip(); haptic.vip(); }
        return true;
      }
      if (id?.startsWith('power')) {
        const pw = m?.powers[Number(id.slice(5))];
        if (pw && pw.cd <= 0) { net.send({ t: 'power', power: pw.power }); sfx.coin(); buzz(20); }
        return true;
      }
      if (id?.startsWith('lvl')) {
        const i = Number(id.slice(3));
        if (m?.solo && i <= m.solo.unlocked) { net.send({ t: 'solo', op: 'start', level: i }); sfx.vip(); haptic.tap(); }
        return true;
      }
  }
  return false;
}

function sendJoin() {
  void sensors?.request();
  if (document.activeElement === nameInput) nameInput.blur(); // finish any half-typed word first
  composing = false;
  fitName();
  try { if (cleanName(nameInput.value)) localStorage.setItem(NAME_KEY, nameInput.value.trim()); } catch { /* private mode */ }
  net!.send({ t: 'join', name: myName, seed });
  if (sensors?.ok) net!.send({ t: 'caps', motion: true });
  joinSentAt = t; sfx.vip();
}

function liveUp(cancel = false) {
  if (joinArmed) {
    joinArmed = false;
    if (!cancel && net?.up) {
      // pointerup is a user gesture: iOS shows its motion permission prompt here
      sendJoin();
    }
  }
  if (pressSent) { net?.send({ t: 'release' }); pressSent = false; }
  holding = false;
}

const secs = (s: number) => `${Math.max(0, Math.ceil(s))}`;
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const lastCall = (m: Me) => secs(m.timeLeft - T.PUSH - T.VOTE);

function drawLive(dt: number) {
  const shaking = !!me && role === 'caught' && me.micro === 'shake';
  if (performance.now() - lastShakeSend >= 100) {
    lastShakeSend = performance.now();
    const e = sensors?.drain() ?? 0;
    shakeVis = Math.max(e, shakeVis * 0.6);
    if (shaking && sensors?.ok) net?.send({ t: 'shake', e });
  }
  if (me?.role === 'no-room') drawNoRoom(me);
  else if (!me || !me.id || role === 'join') drawJoin();
  else switch (role) {
    case 'lobby': drawLiveLobby(); break;
    case 'sneak': drawLiveSneak(); break;
    case 'caught': drawLiveCaught(dt); break;
    case 'result': resultLine = me.result?.line ?? ''; drawResult(!!me.result?.pass); soloMenuButton(false); break;
    case 'nerd': drawNerd(me.nerdLeft); soloMenuButton(false); break;
    case 'owner-pick': drawLiveOwnerPick(); break;
    case 'lounge': drawLiveLounge(); break;
    case 'break': drawLivePush(false, dt); break;
    case 'defend': drawLivePush(true, dt); break;
    case 'support': drawLiveSupport(); break;
    case 'defending': drawLiveDefending(); break;
    case 'outside-vote': drawLiveOutsideVote(); break;
    case 'reveal': drawLiveReveal(); break;
    case 'solo-menu': drawLiveSoloMenu(); break;
    case 'solo-clear': drawLiveSoloClear(); break;
    case 'solo-done': drawLiveSoloDone(); break;
  }
  if (!netUp && everUp) {
    rect(ctx, 0, 0, W, 12, C.ALERT);
    drawTextCentered(ctx, 'RECONNECTING...', W / 2, 3, C.PAPER);
  }
  // ↻ Refresh: re-sync this phone (same room, same player). Not on the mash screens, where the whole
  // screen is the tap target.
  if (roomCode && me?.id && me.role !== 'no-room' && role !== 'caught' && role !== 'break' && role !== 'defend') refreshButton();
}

/** Old QR or dead link: retyping the code (on the home page, prefilled) is the way in; solo is the fallback. */
function drawNoRoom(m: Me) {
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  dither(ctx, 0, 0, W, 72, C.VELVET);
  drawTextCentered(ctx, 'ROOM', W / 2, 16, C.PAPER, 2);
  drawTextCentered(ctx, m.code ?? roomCode, W / 2, 38, C.LAMP, 4);
  drawTextCentered(ctx, 'IS CLOSED', W / 2, 84, C.PAPER, 2);
  drawTextCentered(ctx, 'OLD QR OR A TYPO?', W / 2, 106, C.STONE_HI);
  drawTextCentered(ctx, 'CHECK THE BIG SCREEN', W / 2, 116, C.STONE_HI);
  // primary: two lines of big type, since one line won't fit 160 px
  const py = Math.max(134, Math.min(scr.h - 110, 160)), ph = 48;
  rect(ctx, 8, py + 4, W - 16, ph, C.INK);
  frame(ctx, 8, py, W - 16, ph, C.NEON, C.INK);
  drawTextCentered(ctx, 'RE-ENTER', W / 2, py + 9, C.INK, 2);
  drawTextCentered(ctx, 'ROOM CODE', W / 2, py + 26, C.INK, 2);
  hit('retype', 8, py, W - 16, ph + 4);
  button('soloGo', 'PLAY SOLO', 8, py + ph + 18, W - 16, 22, C.PAPER);
}

/** Small corner button during any solo level. `top` puts it top-left (the stare-down keeps its bottom for tapping). */
function soloMenuButton(top: boolean) {
  if (!me?.solo) return;
  const w = 44, h = 18;
  const x = top ? 4 : W - w - 4, y = top ? 4 : scr.h - h - 4;
  frame(ctx, x, y, w, h, C.PAPER, C.INK);
  drawTextCentered(ctx, 'MENU', x + w / 2, y + 6, C.INK);
  hit('menu', x - 2, y - 2, w + 4, h + 4);
}

/** Gus's latest line in a short box. */
function clip(text: string, cols: number, lines: number) {
  const ls = wrap(text, cols);
  if (ls.length <= lines) return text;
  const keep = ls.slice(0, lines);
  keep[lines - 1] = keep[lines - 1].slice(0, cols - 3) + '...';
  return keep.join(' ');
}
function sayStrip(y: number, h: number) {
  const s = me?.say;
  if (!s) return;
  if (s.n !== sayN) { sayN = s.n; sayAt = t; }
  textBox(ctx, 4, y, W - 8, h, clip(s.text, Math.floor((W - 22) / 6), Math.floor((h - 10) / 10)), (t - sayAt) * 40, t, s.who === 'LIVE' ? 'LIVE' : 'GUS', false);
}

function avatarCard(y: number, frameMe: PlayerFrame) {
  frame(ctx, 30, y, 100, 76, C.ASPHALT, C.PAPER);
  dither(ctx, 36, y + 54, 88, 8, C.ASPHALT_HI);
  blit(ctx, playerSprite(look, frameMe), 48, y + 4, false, 4);
  frame(ctx, 8, y + 82, W - 16, 20);
  drawTextCentered(ctx, myName, W / 2, y + 89, C.INK);
}

function drawLiveLobby() {
  const m = me!;
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  drawTextCentered(ctx, "YOU'RE", W / 2, 14, C.LAMP, 2);
  drawTextCentered(ctx, 'IN LINE', W / 2, 32, C.LAMP, 2);
  avatarCard(58, Math.floor(t * 2) % 6 === 0 ? 'cheer' : 'stand');
  let y = 172;
  if (m.tag) {
    drawText(ctx, 'YOU ARE', 22, y + 7, C.PAPER, 2);
    badge(m.tag, 110, y, 3);
    y += 34;
  }
  drawTextCentered(ctx, `${m.total} ${m.total === 1 ? 'PERSON' : 'PEOPLE'} IN LINE`, W / 2, y, C.SAFE);
  drawTextCentered(ctx, m.tag ? `FIND YOUR ${tagText(m.tag)} ON` : 'FIND YOUR NAME ON', W / 2, y + 16, C.STONE_HI);
  drawTextCentered(ctx, 'THE BIG SCREEN', W / 2, y + 26, C.STONE_HI);
  if (Math.floor(t * 2) % 2) drawTextCentered(ctx, 'WAITING FOR THE HOST', W / 2, Math.max(y + 44, scr.h - 16), C.PAPER);
}

const STRIP_H = 20;
/** The rule-specific banner under the progress bar. null = nothing to say. */
function ruleStrip(m: Me, inBeam: boolean): { lines: string[]; fill: string; ink: string } | null {
  switch (m.rule) {
    case 'moonwalk': {
      const by = `${m.ruleBy ?? 'THE DOOR'} PICKED MOONWALK`;
      return { lines: [by.length <= 26 ? by : 'MOONWALK PICKED'], fill: C.NEON, ink: C.INK };
    }
    case 'lights':
      if (m.beam == null) return null;
      return inBeam
        ? { lines: ["YOU'RE IN THE BEAM"], fill: Math.floor(t * 8) % 2 ? C.ALERT : C.PAPER, ink: Math.floor(t * 8) % 2 ? C.PAPER : C.ALERT }
        : { lines: ['DARK: KEEP MOVING'], fill: C.ASPHALT_HI, ink: C.LAMP };
    case 'glasses': return { lines: ['NEW GLASSES:', 'SHORT WARNINGS'], fill: C.LAMP, ink: C.INK };
    case 'disco': return { lines: ['DISCO: FAST TURNS'], fill: C.VELVET, ink: C.PAPER };
    default: return null;
  }
}

function drawLiveSneak() {
  const m = me!;
  const moon = m.rule === 'moonwalk';
  const lights = m.rule === 'lights' && m.beam != null;
  const inBeam = lights && Math.abs(m.x - m.beam!) < T.BEAM_HALF;
  if (inBeam && !wasInBeam) buzz(30);
  wasInBeam = inBeam;
  const lv = m.solo ? m.solo.levels[m.solo.level] : null;
  const telling = m.gus === 'tell', napping = m.gus === 'sleep';
  // Lights Out: Gus only sees the beam, so outside it a watching Gus is no danger
  const watching = m.gus === 'watch' && (!lights || inBeam);
  const bg = watching ? (Math.floor(t * 6) % 2 ? C.ALERT : C.VELVET) : telling ? C.LAMP_LO : C.NIGHT;
  rect(ctx, 0, 0, W, scr.h, bg);
  if (m.rule === 'disco' && !watching && !telling) {
    const beat = Math.floor(t * 4);
    dither(ctx, 0, 0, W, scr.h, beat % 2 ? C.VELVET : C.ASPHALT_HI, beat);
  }
  progress = m.x;
  const fr: PlayerFrame = watching && m.moving ? 'caught' : m.moving ? (Math.floor(t * 8) % 2 ? 'sneakA' : 'sneakB') : 'freeze';
  const wy = streetWindow(Math.round(scr.h * 0.36), m.gus, fr, m.x, lights ? m.beam : null, inBeam);
  const status = watching ? (moon ? "HE'S LOOKING. HOLD ON!" : "HE'S LOOKING. FREEZE!")
    : telling ? 'HE MIGHT TURN...'
    : m.needFreshPress && moon ? 'TOUCH TO START AGAIN'
    : napping ? 'GUS IS NAPPING. GO!'
    : m.gus === 'watch' ? "DARK: HE CAN'T SEE YOU"
    : moon ? 'MOONWALK: LET GO TO MOVE'
    : lv ? `${lv.name}: ${lv.guard}`
    : 'GUS IS ON HIS PHONE';
  statusLine(wy + 4, status, watching ? C.ALERT : telling ? C.LAMP : moon ? C.NEON : C.SAFE);
  progressBar(wy + 20, m.solo ? `${m.solo.level + 1}/${m.solo.levels.length}` : 'LINE');
  let top = wy + 34;
  const strip = ruleStrip(m, inBeam);
  if (strip) {
    rect(ctx, 0, top, W, STRIP_H, strip.fill);
    const y0 = top + Math.round((STRIP_H - (strip.lines.length * 9 - 2)) / 2);
    strip.lines.forEach((l, i) => drawTextCentered(ctx, l, W / 2, y0 + i * 9, strip.ink));
    top += STRIP_H + 2;
  }
  const bottom = scr.h - 24;
  const cy = Math.round(top + 2 + (bottom - top - 4) / 2);
  const color = watching ? C.PAPER : telling ? C.LAMP : moon ? C.NEON : C.SAFE;
  if (moon) {
    // Moonwalk under a held thumb: the first thing to read is LET GO. Once moving, the job is HOLD TO FREEZE.
    const danger = watching || telling;
    if (m.needFreshPress) bigButton(W / 2, cy, 46, 'TAP', 'THEN LET GO', color);
    else if (holding && !danger) bigButton(W / 2, cy, 46, 'LET GO', 'TO MOVE', C.SAFE);
    else bigButton(W / 2, cy, 46, 'HOLD', danger ? "DON'T LET GO" : 'TO FREEZE', color);
  } else bigButton(W / 2, cy, 46, watching ? 'FREEZE' : 'HOLD', watching ? "DON'T MOVE" : 'TO SNEAK', color);
  // Gus's last line, only when the screen is tall enough not to crowd the button
  if (bottom - (cy + 50) >= 40) sayStrip(cy + 52 + Math.floor((bottom - cy - 52 - 36) / 2), 36);
  if (m.solo) {
    drawText(ctx, `CAUGHT ${m.solo.catches}  ${fmtTime(m.solo.time)}`, 6, scr.h - 14, watching ? C.PAPER : C.STONE_HI);
    soloMenuButton(false);
  } else if (!noticePlate(m)) drawTextCentered(ctx, `LAST CALL IN ${lastCall(m)}S`, W / 2, scr.h - 12, watching ? C.PAPER : C.STONE_HI);
}

/** Someone's Lounge power, named, in the bottom strip (never over the HOLD button). */
function noticePlate(m: Me): boolean {
  const n = m.notice;
  if (!n) return false;
  const lines = wrap(n.text, 25).slice(0, 2);
  const h = 22, y = scr.h - h - 1;
  const fill = n.tone === 'bad' ? C.ALERT : n.tone === 'good' ? C.SAFE : C.PAPER;
  rect(ctx, 2, y, W - 4, h, C.INK);
  rect(ctx, 3, y + 1, W - 6, h - 2, Math.floor(t * 6) % 2 && n.tone === 'bad' ? C.PAPER : fill);
  const y0 = y + (lines.length === 1 ? 7 : 2);
  lines.forEach((l, i) => drawTextCentered(ctx, l, W / 2, y0 + i * 10, C.INK));
  return true;
}

/** Your number, top-right, on screens that don't show the street. */
const REFRESH_ICON = sprite('refresh', ['..kkkk.k.', '.k....kk.', 'k....kkk.', 'k........', 'k.......k', 'k.......k', '.k.....k.', '..kkkkk..', '.........'], { k: C.PAPER });
let syncedAt = -9;
function refreshButton() {
  const x = 3, y = 3, w = 15, h = 15;
  rect(ctx, x, y, w, h, C.INK);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, t - syncedAt < 1.2 ? C.SAFE : C.ASPHALT);
  blit(ctx, REFRESH_ICON, x + 3, y + 3);
  if (t - syncedAt < 1.5) drawText(ctx, 'SYNCED', x + w + 3, y + 4, C.SAFE);
  hit('refresh', x - 3, y - 3, w + 6, h + 6);
}
/** Re-sync this phone with the server: drop any held press, reconnect, and draw whatever the server says now. */
function resync() {
  if (pressSent) { net?.send({ t: 'release' }); pressSent = false; }
  holding = false; holdPtr = -1; joinArmed = false;
  syncedAt = t;
  sfx.blip();
  net?.resync();
}

function cornerBadge() {
  const n = me?.tag ?? 0;
  if (n) badge(n, W - badgeW(n) - 3, 3);
}

function drawLiveCaught(dt: number) {
  const m = me!;
  if (m.micro === 'shake') drawLiveShake(m);
  else drawLiveMash(m, dt);
  soloMenuButton(true);
}

function drawLiveMash(m: Me, dt: number) {
  stareHeader('BRIBE ME. FASTER.');
  const y = 110;
  drawTextCentered(ctx, 'MASH!', W / 2, y, C.LAMP, 3);
  const cy = y + 60;
  disc(ctx, W / 2, cy + 3, 40, C.INK);
  disc(ctx, W / 2, cy + (holding ? 3 : 0), 40, C.INK);
  disc(ctx, W / 2, cy + (holding ? 3 : 0), 37, C.LAMP);
  blit(ctx, icon.coin(), W / 2 - 9, cy - 9 + (holding ? 3 : 0), false, 3);
  hit('mash', 0, 104, W, scr.h - 104);
  for (const c of coins) { c.y += c.vy * dt; c.vy += 260 * dt; c.life -= dt; blit(ctx, icon.coin(), c.x, c.y); }
  coins = coins.filter((c) => c.life > 0);
  const v = Math.min(1, m.microTaps / T.MICRO_PASS_TAPS);
  meter(ctx, 12, cy + 50, W - 24, 12, v, v >= 1 ? C.SAFE : C.LAMP, 10);
  drawText(ctx, `${m.microTaps}/${T.MICRO_PASS_TAPS} TAPS`, 12, cy + 65, v >= 1 ? C.SAFE : C.LAMP);
  const left = m.microLeft;
  drawTextCentered(ctx, secs(left), W / 2, Math.min(scr.h - 30, cy + 80), left < 2 ? C.ALERT : C.PAPER, 3);
}

function drawLiveShake(m: Me) {
  stareHeader('YOU. DANCE FOR ME.');
  hit('mash', 0, 0, W, scr.h);   // taps anywhere count too: the no-sensor fallback
  const y = 112;
  drawTextCentered(ctx, 'SHAKE!', W / 2, y, C.SAFE, 3);
  const dx = Math.round(Math.sin(t * 40) * Math.max(shakeVis, holding ? 0.4 : 0) * 6);
  blit(ctx, playerSprite(look, Math.floor(t * 10) % 2 ? 'cheer' : 'stand'), 56 + dx, y + 30, false, 3);
  const v = m.microScore;
  meter(ctx, 12, y + 86, W - 24, 12, v, v >= 1 ? C.SAFE : C.LAMP, 10);
  drawText(ctx, 'NERVE', 12, y + 101, C.STONE_HI);
  drawText(ctx, 'PASS', W - 12 - textWidth('PASS'), y + 101, C.SAFE);
  const left = m.microLeft;
  drawTextCentered(ctx, secs(left), W / 2, y + 116, left < 2 ? C.ALERT : C.PAPER, 3);
  const noSensor = !sensors?.ok;
  drawTextCentered(ctx, 'NO SENSOR? TAP!', W / 2, y + 144, noSensor && Math.floor(t * 3) % 2 ? C.PAPER : C.STONE_HI);
}

function drawLiveOwnerPick() {
  const m = me!;
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  dither(ctx, 0, 0, W, 50, C.LAMP_LO);
  drawTextCentered(ctx, 'YOU RUN', W / 2, 8, C.LAMP, 2);
  drawTextCentered(ctx, 'THE DOOR', W / 2, 26, C.LAMP, 2);
  const left = m.ownerPickLeft;
  const fw = Math.round((W - 24) * Math.min(1, left / T.OWNER_PICK));
  rect(ctx, 12, 54, W - 24, 3, C.ASPHALT);
  rect(ctx, 12, 54, fw, 3, C.PAPER);
  if (left > 0) { rect(ctx, 12 + fw - 1, 52 + (Math.floor(t * 12) % 2), 3, 3, C.LAMP); rect(ctx, 12 + fw, 51 - (Math.floor(t * 9) % 2), 1, 1, C.ALERT); }
  drawText(ctx, `${secs(left)}S`, W - 26, 60, C.STONE_HI);
  drawText(ctx, 'PICK A RULE:', 12, 64, C.PAPER);
  const choices = m.ruleChoices.slice(0, 3);
  const rowH = Math.max(46, Math.min(62, Math.floor((scr.h - 78 - 36) / Math.max(1, choices.length)) - 6));
  choices.forEach((rule, i) => {
    const y = 78 + i * (rowH + 6);
    const sel = rulePicked === i;
    const def = RULES[rule];
    frame(ctx, 8, y, W - 16, rowH, sel ? C.LAMP : ruleSent ? C.STONE_HI : C.PAPER);
    if (sel || (!ruleSent && Math.floor(t * 2) % 3 === i)) drawText(ctx, '>', 13, y + 9, C.INK);
    drawText(ctx, def.name, 22, y + 9, C.INK);
    def.blurb.forEach((l, j) => drawText(ctx, l, 14, y + 22 + j * 10, sel ? C.INK : C.VELVET));
    if (!ruleSent) hit(`rule${i}`, 8, y, W - 16, rowH);
  });
  const by = 78 + choices.length * (rowH + 6) + 2;
  if (ruleSent) drawTextCentered(ctx, 'RULE SENT', W / 2, by + 4, C.SAFE);
  else {
    frame(ctx, 14, by, W - 28, 18, C.NIGHT, C.PAPER);
    drawTextCentered(ctx, 'NO PICK = RANDOM', W / 2, by + 6, C.STONE_HI);
  }
}

const CROWN = (scale: number, x: number, y: number) => blit(ctx, sprite('pw3', POWER_ICONS[3], { k: C.INK, y: C.LAMP, w: C.PAPER }), x, y, false, scale);

function drawLiveLounge() {
  const m = me!;
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  dither(ctx, 0, 0, W, 36, Math.floor(t * 4) % 2 ? C.NEON : C.VELVET, Math.floor(t * 4));
  drawTextCentered(ctx, 'VIP LOUNGE', W / 2, 5, C.LAMP, 2);
  const line = m.isOwner ? 'YOU RUN THE DOOR' : `THE DOOR: ${m.ownerName ?? '?'}`;
  drawTextCentered(ctx, line, W / 2, 24, C.PAPER);
  if (m.isOwner) CROWN(1, Math.round(W / 2 - textWidth(line) / 2 - 11), 23);
  // the three powers: big rows, cooldown from the server
  m.powers.slice(0, 3).forEach((pw, i) => {
    const def = POWER_DEFS[pw.power];
    const y = 40 + i * 44, w = W - 16, h = 40, ready = pw.cd <= 0;
    // whose side the button is on: red = against the runners, mint = for them, velvet = for Gus
    const side = pw.power === 'distract' ? C.SAFE : pw.power === 'banana' ? C.ALERT : C.VELVET;
    frame(ctx, 8, y, w, h, ready ? C.PAPER : C.STONE);
    rect(ctx, 11, y + 3, 4, h - 7, side);
    blit(ctx, sprite(`pw${i}`, POWER_ICONS[i], { k: C.INK, y: C.LAMP, w: C.PAPER }), 18, y + 12, false, 2);
    rect(ctx, 37, y + 4, textWidth(def.who) + 4, 10, ready ? side : C.ASPHALT);
    drawText(ctx, def.who, 39, y + 5, ready && pw.power !== 'distract' ? C.PAPER : C.INK);
    drawText(ctx, def.name, 39, y + 17, C.INK);
    drawText(ctx, def.blurb, 39, y + 27, ready ? C.ASPHALT : C.ASPHALT_HI);
    if (!ready) {
      const max = T.POWER_COOLDOWN[pw.power] ?? 10;
      const dw = Math.round((w - 8) * Math.min(1, pw.cd / max));
      dither(ctx, 12 + (w - 8) - dw, y + 4, dw, h - 8, C.INK);
      rect(ctx, W - 40, y + 11, 24, 18, C.INK);
      drawTextCentered(ctx, secs(pw.cd), W - 28, y + 14, C.PAPER, 2);
    }
    hit(`power${i}`, 8, y, w, h);
  });
  const y = 174;
  frame(ctx, 8, y, W - 16, 32, C.PAPER);
  if (m.rule) {
    drawTextCentered(ctx, `RULE: ${RULES[m.rule].name}`, W / 2, y + 8, C.VELVET);
    drawTextCentered(ctx, RULES[m.rule].banner, W / 2, y + 19, C.INK);
  } else {
    drawTextCentered(ctx, 'NO RULE YET', W / 2, y + 8, C.STONE);
    drawTextCentered(ctx, `${m.ownerName ?? 'THE DOOR'} IS PICKING`.slice(0, 24), W / 2, y + 19, C.INK);
  }
  drawTextCentered(ctx, `SCORE ${m.score}`, W / 2, y + 40, C.LAMP);
  drawTextCentered(ctx, `LAST CALL IN ${lastCall(m)}S`, W / 2, y + 51, C.STONE_HI);
  const sy = y + 64, room = scr.h - 26 - sy;
  if (room >= 36 && m.say) sayStrip(sy, Math.min(40, room));
  else if (room >= 30) wrap('AT LAST CALL THE LOUNGE VOTES ON THE CROWN', 24)
    .forEach((l, i) => drawTextCentered(ctx, l, W / 2, sy + 4 + i * 9, C.STONE));
  noticePlate(m);
  cornerBadge();
}

function drawLivePush(defend: boolean, dt: number) {
  const m = me!;
  const team = defend ? C.LAMP : C.SAFE;
  rect(ctx, 0, 0, W, scr.h, holding ? C.PAPER : team);
  dither(ctx, 0, 0, W, scr.h, C.INK, Math.floor(t * 6));
  rect(ctx, 0, 10, W, 20, C.INK);
  drawTextCentered(ctx, defend ? 'TEAM LOUNGE' : 'TEAM CROWD', W / 2, 14, team, 2);
  rect(ctx, 20, 33, W - 40, 13, C.INK);
  drawTextCentered(ctx, defend ? 'HOLD THE ROPE' : 'BREAK THE ROPE', W / 2, 36, C.PAPER);
  frame(ctx, 14, 56, W - 28, 80, team, C.INK);
  drawTextCentered(ctx, 'TAP!', W / 2, 78 + (holding ? 1 : 0), C.INK, 4);
  rect(ctx, 14, 144, W - 28, 70, C.INK);
  drawTextCentered(ctx, `${m.pushTaps} TAPS`, W / 2, 150, C.PAPER, 2);
  drawTextCentered(ctx, defend ? 'KEEP THEM OUT' : 'RUSH THE DOOR', W / 2, 172, team);
  drawTextCentered(ctx, secs(m.timeLeft - T.VOTE), W / 2, 186, C.PAPER, 3);
  for (const c of coins) { c.y += c.vy * dt; c.vy += 260 * dt; c.life -= dt; blit(ctx, icon.star(), c.x, c.y); }
  coins = coins.filter((c) => c.life > 0);
  hit('mash', 0, 0, W, scr.h);
  cornerBadge();
}

/** Tally + what happens if it passes right now. Returns the y below it. */
function voteBlock(y: number): number {
  const v = me!.vote;
  if (!v) return y;
  if (v.eligible === 0) { drawTextCentered(ctx, 'NOBODY CAN VOTE', W / 2, y, C.STONE_HI); return y + 12; }
  meter(ctx, 12, y, W - 24, 10, v.needed ? Math.min(1, v.cast / v.needed) : 0, v.cast >= v.needed ? C.SAFE : C.NEON, Math.max(1, v.needed));
  drawTextCentered(ctx, `CROWN ${v.cast} OF ${v.needed} NEEDED`, W / 2, y + 14, v.cast >= v.needed ? C.SAFE : C.PAPER);
  drawTextCentered(ctx, `KEEP ${v.kept}  -  ${v.eligible} CAN VOTE`, W / 2, y + 24, C.STONE_HI);
  if (v.successorName) {
    drawTextCentered(ctx, 'IF IT PASSES NOW:', W / 2, y + 38, C.STONE_HI);
    badgeName(v.successorTag, v.successorName, W / 2, y + 48, C.LAMP);
  }
  return y + 60;
}

/** The last vote: two cards that say exactly whom each tap seats. */
function drawLiveSupport() {
  const m = me!;
  const v = m.vote;
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  dither(ctx, 0, 0, W, 40, C.VELVET);
  drawTextCentered(ctx, m.allIn ? "EVERYONE'S IN" : 'LAST CALL', W / 2, 3, C.PAPER);
  drawTextCentered(ctx, 'WHO GETS', W / 2, 13, C.LAMP, 2);
  drawTextCentered(ctx, 'THE CROWN?', W / 2, 30, C.LAMP, 1);
  cornerBadge();
  const ready = t - roleSince >= 0.5;
  const choice = v?.choice ?? null;
  const cardW = W - 16;
  // CROWN card
  let y = 46;
  const crownName = choice === 'crown' ? v?.successorName : v?.ifCrownName;
  const crownTag = choice === 'crown' ? v?.successorTag ?? 0 : v?.ifCrownTag ?? 0;
  const crownMe = !!v && (choice === 'crown' ? v.successorId : v.ifCrownId) === m.id;
  const dimCrown = choice === 'keep' || !ready;
  frame(ctx, 8, y + (choice === 'crown' ? 2 : 0), cardW, 70, dimCrown ? C.STONE : choice === 'crown' ? C.SAFE : C.NEON, C.INK);
  drawText(ctx, 'CROWN', 16, y + 7, C.INK, 2);
  if (choice === 'crown') drawText(ctx, 'YOUR VOTE', W - 16 - textWidth('YOUR VOTE'), y + 11, C.INK);
  if (crownName) {
    if (crownMe) drawText(ctx, 'YOU', 16, y + 28, C.INK, 2);
    else {
      const bw = crownTag ? badge(crownTag, 16, y + 27) + 3 : 0;
      drawText(ctx, crownName, 16 + bw, y + 29, C.INK);
    }
    drawText(ctx, choice === 'crown' ? 'NEXT VIP IF IT PASSES' : 'TAKES THE SEAT', 16, y + 46, C.INK);
    drawText(ctx, choice === 'crown' ? '' : 'IF THE COUP PASSES', 16, y + 56, C.ASPHALT);
  } else drawText(ctx, 'NOT AVAILABLE', 16, y + 29, C.INK);
  if (!choice && ready) hit('crown', 8, y, cardW, 70);
  // KEEP card
  y = 122;
  const dimKeep = choice === 'crown' || !ready;
  frame(ctx, 8, y + (choice === 'keep' ? 2 : 0), cardW, 52, dimKeep ? C.STONE : choice === 'keep' ? C.SAFE : C.LAMP, C.INK);
  drawText(ctx, 'KEEP', 16, y + 7, C.INK, 2);
  if (choice === 'keep') drawText(ctx, 'YOUR VOTE', W - 16 - textWidth('YOUR VOTE'), y + 11, C.INK);
  const own = m.ownerName ?? '?';
  const ownTag = m.ownerTag;
  const bw = ownTag ? badge(ownTag, 16, y + 27) + 3 : 0;
  drawText(ctx, own, 16 + bw, y + 29, C.INK);
  drawText(ctx, 'STAYS VIP', 16, y + 40, C.ASPHALT);
  if (!choice && ready) hit('keep', 8, y, cardW, 52);
  if (!ready) drawTextCentered(ctx, 'LIFT YOUR THUMB...', W / 2, 178 + 4, C.PAPER);
  else if (!choice) drawTextCentered(ctx, 'ONE TAP. NO TAKE-BACKS.', W / 2, 182, C.STONE_HI);
  else drawTextCentered(ctx, 'VOTE LOCKED IN', W / 2, 182, C.SAFE);
  voteBlock(196);
  drawTextCentered(ctx, secs(m.timeLeft), W / 2, scr.h - 26, C.PAPER, 2);
}

function drawLiveDefending() {
  const m = me!;
  rect(ctx, 0, 0, W, scr.h, Math.floor(t * 3) % 2 ? C.NIGHT : C.BRICK);
  drawTextCentered(ctx, m.allIn ? "EVERYONE'S IN" : 'LAST CALL', W / 2, 5, C.PAPER);
  drawTextCentered(ctx, 'THEY WANT', W / 2, 16, C.LAMP, 2);
  drawTextCentered(ctx, 'YOUR CROWN', W / 2, 34, C.LAMP, 2);
  cornerBadge();
  CROWN(4, W / 2 - 16, 56);
  blit(ctx, playerSprite(look, 'freeze'), W / 2 - 24, 86, false, 3);
  if (Math.floor(t * 3) % 2) blit(ctx, icon.sweat(), W / 2 + 26, 84);
  const y = voteBlock(144);
  drawTextCentered(ctx, 'NOTHING TO DO BUT SWEAT', W / 2, y + 6, C.STONE_HI);
  drawTextCentered(ctx, secs(m.timeLeft), W / 2, scr.h - 26, C.PAPER, 2);
}

function drawLiveOutsideVote() {
  const m = me!;
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  drawTextCentered(ctx, 'OUTSIDE', W / 2, 20, C.STONE_HI, 2);
  drawTextCentered(ctx, 'THE LOUNGE', W / 2, 38, C.STONE_HI, 2);
  cornerBadge();
  blit(ctx, playerSprite(look, 'stand'), W / 2 - 24, 60, false, 3);
  drawTextCentered(ctx, 'THE LOUNGE IS VOTING', W / 2, 114, C.PAPER);
  drawTextCentered(ctx, `ON ${m.ownerName ?? 'THE'}'S CROWN`, W / 2, 124, C.PAPER);
  voteBlock(140);
  drawTextCentered(ctx, 'WATCH THE BIG SCREEN', W / 2, 206, C.LAMP);
  drawTextCentered(ctx, secs(m.timeLeft), W / 2, scr.h - 26, C.PAPER, 2);
}

// ---------- reveal, mugshot, solo ----------
/** The mugshot receipt with its buttons. `again` adds PLAY AGAIN (solo). */
function drawMugView(m: Me, again: boolean) {
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  hit('toggle', 0, 0, W, scr.h);
  drawReceipt(m.mugshot!, look, 6);
  const by = Math.min(6 + RECEIPT_H + 10, scr.h - 32);
  const saved = t - savedAt < 2;
  if (again) {
    button('save', saved ? 'SAVED' : 'SAVE', 8, by, 52, 26, saved ? C.SAFE : C.LAMP);
    button('again', 'PLAY AGAIN', 66, by, 86, 26, C.NEON);
  } else button('save', saved ? 'SAVED' : 'SAVE PNG', 8, by, W - 16, 26, saved ? C.SAFE : C.LAMP);
  if (by + 36 <= scr.h) drawTextCentered(ctx, 'TAP ELSEWHERE: BACK', W / 2, by + 32, C.STONE_HI);
}

function drawLiveReveal() {
  const m = me!;
  if (m.mugshot && !revealTouched && st > 3) revealMug = true;
  if (m.mugshot && revealMug) { drawMugView(m, false); return; }
  const r = m.reveal;
  const win = !!r && r.winnerId === m.id;
  if (win) {
    rect(ctx, 0, 0, W, scr.h, C.NIGHT);
    dither(ctx, 0, 0, W, scr.h, Math.floor(t * 8) % 2 ? C.LAMP : C.LAMP_LO, Math.floor(t * 8));
    frame(ctx, 8, 16, W - 16, 196, C.PAPER, C.INK);
    drawTextCentered(ctx, "YOU'RE", W / 2, 26, C.VELVET, 2);
    drawTextCentered(ctx, "TONIGHT'S", W / 2, 44, C.VELVET, 2);
    drawTextCentered(ctx, 'VIP', W / 2, 62, C.VELVET, 2);
    CROWN(3, W / 2 - 12, 82);
    blit(ctx, playerSprite(look, Math.floor(t * 4) % 2 ? 'cheer' : 'stand'), W / 2 - 24, 104, false, 3);
    let y = 160;
    if (r?.prevOwnerName) {
      drawTextCentered(ctx, 'YOU TOOK THE CROWN FROM', W / 2, y, C.INK);
      badgeName(r.prevOwnerTag, r.prevOwnerName, W / 2, y + 11, C.INK);
      y += 26;
    }
    drawTextCentered(ctx, `#1 OF ${m.total}  SCORE ${m.score}`, W / 2, y, C.STONE);
    badge(m.tag, W / 2 - badgeW(m.tag) / 2, 104 - 12);
  } else {
    rect(ctx, 0, 0, W, scr.h, C.NIGHT);
    drawTextCentered(ctx, 'YOU FINISHED', W / 2, 16, C.STONE_HI);
    drawTextCentered(ctx, `#${m.rank} OF ${m.total}`, W / 2, 30, C.PAPER, 3);
    blit(ctx, playerSprite(look, 'stand'), W / 2 - 24, 60, false, 3);
    drawTextCentered(ctx, `SCORE ${m.score}`, W / 2, 114, C.LAMP);
    frame(ctx, 8, 130, W - 16, r?.prevOwnerName ? 58 : 38, C.PAPER);
    drawTextCentered(ctx, "TONIGHT'S VIP:", W / 2, 138, C.STONE);
    if (r?.winnerName) badgeName(r.winnerTag, r.winnerName, W / 2, 150, C.VELVET);
    else drawTextCentered(ctx, 'NOBODY', W / 2, 150, C.VELVET);
    if (r?.prevOwnerName) {
      const mine = r.prevOwnerName === m.name;
      drawTextCentered(ctx, mine ? 'TOOK YOUR CROWN' : 'TOOK THE CROWN FROM', W / 2, 164, mine ? C.ALERT : C.INK);
      if (mine) drawTextCentered(ctx, 'AT THE BUZZER', W / 2, 174, C.INK);
      else badgeName(r.prevOwnerTag, r.prevOwnerName, W / 2, 175, C.INK);
    }
    badge(m.tag, W / 2 + 28, 60);
  }
  rect(ctx, 0, scr.h - 20, W, 20, C.INK);
  if (m.mugshot) {
    hit('toggle', 0, 0, W, scr.h);
    drawTextCentered(ctx, Math.floor(t * 2) % 2 ? 'TAP FOR MY MUGSHOT' : 'WATCH THE BIG SCREEN', W / 2, scr.h - 14, C.PAPER);
  } else drawTextCentered(ctx, 'WATCH THE BIG SCREEN', W / 2, scr.h - 14, C.PAPER);
}

function drawCheck(x: number, y: number) {
  rect(ctx, x, y, 11, 11, C.INK);
  for (const [px, py] of [[2, 5], [3, 6], [4, 7], [5, 6], [6, 5], [7, 4], [8, 3]]) rect(ctx, x + px, y + py - 1, 1, 2, C.SAFE);
}

function drawLiveSoloMenu() {
  const sv = me!.solo!;
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  drawTextCentered(ctx, 'SOLO NIGHT', W / 2, 12, C.NEON, 2);
  drawTextCentered(ctx, 'NOBODY ELSE HERE. 3 DOORS.', W / 2, 32, C.STONE_HI);
  sv.levels.forEach((lv, i) => {
    const y = 50 + i * 64;
    const locked = i > sv.unlocked;
    frame(ctx, 8, y, W - 16, 58, locked ? C.STONE : C.PAPER);
    drawText(ctx, `${i + 1}. ${lv.name}`, 16, y + 9, locked ? C.ASPHALT : C.INK);
    drawText(ctx, `DOOR: ${lv.guard}`, 16, y + 21, locked ? C.ASPHALT : C.VELVET);
    wrap(lv.note, 22).slice(0, 2).forEach((l, j) => drawText(ctx, l, 16, y + 33 + j * 9, locked ? C.ASPHALT : C.STONE));
    if (locked) drawText(ctx, 'LOCKED', W - 58, y + 9, C.ASPHALT);
    else {
      if (lv.cleared) drawCheck(W - 28, y + 8);
      else if (Math.floor(t * 2) % 2) drawText(ctx, '>', W - 24, y + 9, C.INK);
      hit(`lvl${i}`, 8, y, W - 16, 58);
    }
  });
  const by = 50 + sv.levels.length * 64 + 2;
  if (sv.catches > 0 || sv.time > 0) drawTextCentered(ctx, `CAUGHT ${sv.catches}  TIME ${fmtTime(sv.time)}`, W / 2, Math.min(by, scr.h - 14), C.STONE_HI);
}

function drawLiveSoloClear() {
  const sv = me!.solo!;
  const lv = sv.levels[sv.level], next = sv.levels[sv.level + 1];
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  dither(ctx, 0, 0, W, scr.h, Math.floor(t * 6) % 2 ? C.ASPHALT : C.ASPHALT_HI, Math.floor(t * 6));
  frame(ctx, 8, 36, W - 16, 150, C.PAPER, C.INK);
  drawTextCentered(ctx, 'DOOR', W / 2, 50, C.VELVET, 3);
  drawTextCentered(ctx, 'CLEARED', W / 2, 74, C.VELVET, 3);
  blit(ctx, playerSprite(look, Math.floor(t * 4) % 2 ? 'cheer' : 'stand'), W / 2 - 24, 100, false, 3);
  drawTextCentered(ctx, `${lv.name} IS DONE`, W / 2, 152, C.INK);
  if (next) {
    drawTextCentered(ctx, 'NEXT DOOR:', W / 2, 166, C.STONE);
    drawTextCentered(ctx, `${next.name}: ${next.guard}`.slice(0, 24), W / 2, 176, C.VELVET);
  }
}

function drawLiveSoloDone() {
  const m = me!;
  const sv = m.solo!;
  if (m.mugshot && !revealTouched && st > 4) revealMug = true;
  if (m.mugshot && revealMug) { drawMugView(m, true); return; }
  rect(ctx, 0, 0, W, scr.h, C.NIGHT);
  dither(ctx, 0, 0, W, scr.h, Math.floor(t * 8) % 2 ? C.LAMP : C.LAMP_LO, Math.floor(t * 8));
  frame(ctx, 8, 14, W - 16, 150, C.PAPER, C.ALERT);
  drawTextCentered(ctx, 'BOUNCER', W / 2, 26, C.ALERT, 3);
  drawTextCentered(ctx, 'BEATEN', W / 2, 50, C.ALERT, 3);
  blit(ctx, playerSprite(look, Math.floor(t * 4) % 2 ? 'cheer' : 'stand'), W / 2 - 24, 78, false, 3);
  drawTextCentered(ctx, `TIME ${fmtTime(sv.time)}`, W / 2, 130, C.INK, 2);
  drawTextCentered(ctx, `${sv.catches} ${sv.catches === 1 ? 'CATCH' : 'CATCHES'}`, W / 2, 150, C.VELVET);
  if (m.mugshot) {
    hit('toggle', 0, 0, W, scr.h);
    rect(ctx, 0, 172, W, 14, C.INK);
    if (Math.floor(t * 2) % 2) drawTextCentered(ctx, 'TAP FOR MY MUGSHOT', W / 2, 176, C.PAPER);
  }
  bigButtonRect('again', 'PLAY AGAIN', Math.max(190, Math.min(scr.h - 50, 196)));
}

// ---------- loop ----------
let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; t += dt; st += dt;
  scr.fitWidth(host, W);
  hits = [];
  if (LIVE) drawLive(dt);
  else switch (state) {
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
  syncNameInput();
  requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { holdPtr = -1; release(true); } });
addEventListener('blur', () => { holdPtr = -1; if (LIVE) release(true); });
go((params.get('state') as S) || 'join');
requestAnimationFrame(loop);
