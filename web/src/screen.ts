import QRCode from 'qrcode';
import { C } from './pix/palette';
import { Screen, rect, dither, frame, textBox, meter, blit, nameTab, sprite } from './pix/pix';
import { drawText, drawTextCentered, drawTextOutlined, textWidth } from './pix/font';
import { lookFromSeed, drawPlayer, icon, gusSprite, type PlayerLook, type PlayerFrame, type GusPose } from './pix/sprites';
import { drawStreet, drawRope, drawGus, drawSightline, drawDarkness, drawCat, L } from './pix/scene';
import { sfx, unlock } from './pix/sfx';
import { devbar } from './devbar';
import { NAMES, LINES, HUD, TICKER, RESULTS, CHAOS } from './mock';
import { connect } from './net';
import type { Snapshot, PubPlayer, RoundPhase, ServerMsg } from '../../shared/protocol';

// Linked to the room server by default. ?preview (or ?state=) keeps the offline design preview with its mock crowd.
const params = new URLSearchParams(location.search);
const LIVE = !params.has('preview') && !params.has('state');

type S = 'auto' | 'lobby' | 'back' | 'tell' | 'fakeout' | 'watch' | 'proveit' | 'fling' | 'pass' | 'vip' | 'lightsout' | 'disco' | 'moonwalk' | 'hud' | 'finale' | 'nerd' | 'end';

const STATES: { key: string; id: S; label: string }[] = [
  { key: 'A', id: 'auto', label: 'AUTO PLAY' },
  { key: '1', id: 'lobby', label: 'LOBBY' },
  { key: '2', id: 'back', label: 'BACK TURNED' },
  { key: '3', id: 'tell', label: 'TELL' },
  { key: '4', id: 'fakeout', label: 'FAKE-OUT' },
  { key: '5', id: 'watch', label: 'WATCH+CAUGHT' },
  { key: '6', id: 'proveit', label: 'PROVE IT' },
  { key: '7', id: 'fling', label: 'FLING' },
  { key: '8', id: 'pass', label: 'PASS' },
  { key: '9', id: 'vip', label: 'VIP OWNER' },
  { key: '0', id: 'lightsout', label: 'LIGHTS OUT' },
  { key: 'Q', id: 'disco', label: 'DISCO' },
  { key: 'W', id: 'moonwalk', label: 'MOONWALK' },
  { key: 'E', id: 'hud', label: 'GUS BRAIN' },
  { key: 'R', id: 'finale', label: 'FINALE' },
  { key: 'T', id: 'nerd', label: 'NERD' },
  { key: 'Y', id: 'end', label: 'END' },
];

const host = document.getElementById('stage')!;
const scr = new Screen(host, L.W, L.H);
const ctx = scr.ctx;

interface P { id: number; name: string; look: PlayerLook; x: number; lane: number; walking: boolean; next: number; gone: boolean; visibleAt: number }
const crowd: P[] = NAMES.map((name, id) => ({
  id, name, look: lookFromSeed(id + 20),
  x: L.START_X + ((id * 37) % 170), lane: L.LANES[id % L.LANES.length],
  walking: false, next: 0, gone: false, visibleAt: 0,
}));
const DAVE = crowd[1];
const PRIYA = crowd[2];
const NERD = crowd[7];

let state: S = 'auto';
let st = 0;          // seconds in state
let t = 0;           // global clock
let line = '';
let shown = 0;
let shake = 0;
let flash = 0;
let flashColor: string = C.PAPER;
const auto = { phase: 'back' as 'back' | 'tell' | 'watch' | 'fakeout', left: 3, caught: null as P | null, flingT: -1, vipT: -1, vipName: '' };

function say(s: string) { if (s !== line) { line = s; shown = 0; } }

function resetCrowd() {
  crowd.forEach((p, i) => {
    p.x = L.START_X + ((i * 37) % 170);
    p.lane = L.LANES[i % L.LANES.length];
    p.walking = false; p.gone = false; p.visibleAt = 0;
  });
}

function enter(s: S) {
  state = s; st = 0;
  resetCrowd();
  bar?.mark(s);
  switch (s) {
    case 'auto': auto.phase = 'back'; auto.left = 3; auto.caught = null; auto.flingT = -1; auto.vipT = -1; say(LINES.back); break;
    case 'lobby': crowd.forEach((p, i) => { p.x = L.START_X + 6 + ((i * 29) % 70); p.visibleAt = 0.6 + i * 0.7; }); say(LINES.lobby); break;
    case 'back': say(LINES.back); break;
    case 'tell': say(LINES.tell); sfx.tell(); break;
    case 'fakeout': say(LINES.tell); sfx.tell(); break;
    case 'watch': DAVE.x = 150; DAVE.lane = L.LANES[2]; say(LINES.caught); sfx.turn(); shake = 0.2; flashRed(); break;
    case 'proveit': DAVE.x = 150; DAVE.lane = L.LANES[2]; say(LINES.proveit); break;
    case 'fling': DAVE.x = 150; DAVE.lane = L.LANES[2]; say(LINES.fling); sfx.fling(); shake = 0.25; break;
    case 'pass': DAVE.x = 150; DAVE.lane = L.LANES[2]; say(LINES.pass); sfx.pass(); break;
    case 'vip': PRIYA.x = L.ROPE_X - 10; PRIYA.lane = L.LANES[0]; say(LINES.vip); break;
    case 'lightsout': say(LINES.lightsout); break;
    case 'disco': say(LINES.disco); break;
    case 'moonwalk': say(LINES.moonwalk); break;
    case 'hud': say(LINES.hud); break;
    case 'finale': say(LINES.finale); break;
    case 'nerd': NERD.x = 120; NERD.lane = L.LANES[1]; say(LINES.nerd); sfx.nerd(); break;
    case 'end': say(LINES.end); break;
  }
}

function flashRed() { flash = 0.5; flashColor = C.ALERT; }

const bar = LIVE ? null : devbar(STATES, (id) => enter(id as S));

// ---------- QR ----------
const joinUrl = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? __LAN_ORIGIN__ : location.origin) + '/play.html';
const qr = QRCode.create(joinUrl, { errorCorrectionLevel: 'M' }).modules;

function drawQR(x: number, y: number, m: number) {
  const n = qr.size;
  rect(ctx, x - 2 * m, y - 2 * m, (n + 4) * m, (n + 4) * m, C.PAPER);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.data[r * n + c]) rect(ctx, x + c * m, y + r * m, m, m, C.INK);
  }
}

// ---------- crowd simulation (mock) ----------
function stepCrowd(dt: number, moving: boolean, speed = 14) {
  for (const p of crowd) {
    if (p.gone) continue;
    if (moving) {
      p.next -= dt;
      if (p.next <= 0) { p.walking = Math.random() < 0.6; p.next = 0.4 + Math.random() * 1.2; }
      if (p.walking) p.x += speed * dt * (0.7 + (p.id % 5) * 0.12);
      if (p.x > L.ROPE_X - 8) { p.x = L.START_X; }
    } else p.walking = false;
  }
}

function frameFor(p: P, walkingFrames: [PlayerFrame, PlayerFrame] = ['sneakA', 'sneakB']): PlayerFrame {
  if (!p.walking) return 'freeze';
  return Math.floor(t * 8 + p.id) % 2 ? walkingFrames[0] : walkingFrames[1];
}

function drawCrowd(fn: (p: P) => { frame: PlayerFrame; flip?: boolean; dx?: number; dy?: number; hide?: boolean }) {
  const list = crowd.filter((p) => !p.gone).sort((a, b) => a.lane - b.lane || a.x - b.x);
  for (const p of list) {
    const d = fn(p);
    if (d.hide) continue;
    drawPlayer(ctx, p.look, d.frame, p.x + (d.dx ?? 0), p.lane + (d.dy ?? 0), d.flip);
  }
}

function tag(p: P, color: string = C.PAPER) {
  const w = textWidth(p.name) + 4;
  const x = Math.round(p.x - w / 2), y = p.lane - 27;
  rect(ctx, x, y, w, 9, C.INK);
  drawText(ctx, p.name, x + 2, y + 1, color);
}

function spotlight(p: P, color: string) {
  // hard-edged spotlight pool, checker edge
  const cx = Math.round(p.x), cy = p.lane - 1;
  for (let y = -5; y <= 3; y++) {
    const half = Math.round(Math.sqrt(1 - ((y + 1) / 5) ** 2) * 16);
    for (let x = -half; x <= half; x++) if (Math.abs(x) < half - 2 || (x + y) & 1) rect(ctx, cx + x, cy + y, 1, 1, color);
  }
}

function banner(text: string, sub: string | null, fill: string = C.PAPER, ink: string = C.INK, y = 58) {
  const w = Math.max(textWidth(text, 2), sub ? textWidth(sub) : 0) + 24;
  const x = Math.round((L.W - w) / 2);
  frame(ctx, x, y, w, sub ? 36 : 26, fill, ink);
  drawTextCentered(ctx, text, L.W / 2, y + 7, ink, 2);
  if (sub) drawTextCentered(ctx, sub, L.W / 2, y + 25, ink);
}

function vipList(names: string[], rule?: string) {
  const h = 18 + names.length * 9 + (rule ? 20 : 0);
  frame(ctx, 4, 4, 86, h, C.NIGHT, C.LAMP);
  drawText(ctx, 'VIP LIST', 11, 9, C.LAMP);
  names.forEach((n, i) => {
    blit(ctx, icon.star(), 10, 19 + i * 9);
    drawText(ctx, n.slice(0, 10), 19, 19 + i * 9, i === 0 ? C.LAMP : C.PAPER);
  });
  if (rule) { drawText(ctx, 'RULE:', 10, 19 + names.length * 9 + 2, C.STONE_HI); drawText(ctx, rule, 10, 19 + names.length * 9 + 11, C.NEON); }
}

function curtainEdge(alpha: number) {
  // red alarm strobe around the play area
  if (alpha <= 0) return;
  const c = Math.floor(t * 12) % 2 ? C.ALERT : C.VELVET;
  rect(ctx, 0, 0, L.W, 3, c);
  rect(ctx, 0, L.TEXT_Y - 3, L.W, 3, c);
  rect(ctx, 0, 0, 3, L.TEXT_Y, c);
  rect(ctx, L.W - 3, 0, 3, L.TEXT_Y, c);
}

// ---------- per-state draw ----------
function draw(dt: number) {
  scr.fitFixed(host);
  const sx = shake > 0 ? (Math.floor(t * 40) % 2 ? 2 : -2) : 0;
  shake = Math.max(0, shake - dt);
  ctx.save();
  ctx.translate(sx, 0);

  const disco = state === 'disco';
  const lounge = state === 'vip' && st > 2 ? 1 : state === 'auto' && auto.vipT >= 0 ? 1 : state === 'finale' && st > 6 ? 1 : 0;
  drawStreet(ctx, t, { disco, lounge });
  drawCat(ctx, t);

  let gus: GusPose = 'back';
  let ropeOpen = false;

  switch (state) {
    case 'lobby': {
      gus = 'watch';
      drawCrowd((p) => {
        if (st < p.visibleAt) return { frame: 'stand', hide: true };
        if (st < p.visibleAt + 0.25) blit(ctx, icon.puff(), p.x - 4, p.lane - 12);
        return { frame: Math.floor(t * 2 + p.id) % 5 === 0 ? 'cheer' : 'stand' };
      });
      break;
    }
    case 'back': case 'hud': {
      stepCrowd(dt, true);
      drawCrowd((p) => ({ frame: frameFor(p) }));
      break;
    }
    case 'tell': case 'fakeout': {
      const resolved = state === 'fakeout' && st > 0.9;
      gus = resolved ? 'back' : 'tell';
      if (state === 'fakeout' && st > 0.9) say(LINES.fakeout);
      stepCrowd(dt, true);
      drawCrowd((p) => ({ frame: !resolved && p.id % 2 ? 'freeze' : frameFor(p) }));
      if (state === 'fakeout' && st > 0.9 && st < 1.6) drawText(ctx, '...NAH', L.GUS_X + 10, L.GUS_FEET - 40, C.PAPER);
      break;
    }
    case 'watch': {
      gus = st < 0.6 ? 'watch' : 'point';
      drawSightline(ctx, t);
      spotlight(DAVE, C.ALERT);
      drawCrowd((p) => ({ frame: p === DAVE ? 'caught' : 'freeze' }));
      tag(DAVE, C.ALERT);
      drawText(ctx, 'CAUGHT!', DAVE.x - 20, DAVE.lane - 38 + (Math.floor(t * 8) % 2), C.ALERT);
      break;
    }
    case 'proveit': {
      gus = 'watch';
      spotlight(DAVE, C.LAMP);
      drawCrowd((p) => p === DAVE ? { frame: Math.floor(t * 8) % 2 ? 'cheer' : 'stand', dy: -(Math.floor(t * 8) % 2) } : { frame: 'freeze' });
      stareDown(DAVE, 'DANCE!', Math.min(1, st / 4) * (0.8 + Math.sin(t * 9) * 0.2), Math.max(0, 5 - Math.floor(st)));
      break;
    }
    case 'fling': {
      gus = 'point';
      const u = Math.min(1, st / 1.3);
      const fx = 150 - 230 * u, fy = -Math.round(Math.sin(u * Math.PI) * 70);
      if (st < 0.35) blit(ctx, icon.puff(), 146, DAVE.lane - 14);
      drawCrowd((p) => p === DAVE ? { frame: 'caught', dx: fx - 150, dy: fy, flip: Math.floor(t * 8) % 2 === 0, hide: u >= 1 } : { frame: 'freeze' });
      break;
    }
    case 'pass': {
      gus = 'watch';
      const stepped = st > 0.8 ? Math.min(8, (st - 0.8) * 16) : 0;
      drawCrowd((p) => p === DAVE ? { frame: st > 0.8 && st < 1.3 ? (Math.floor(t * 8) % 2 ? 'stepA' : 'stepB') : 'stand', dx: stepped } : { frame: 'freeze' });
      if (st < 0.8) blit(ctx, icon.sweat(), DAVE.x + 6, DAVE.lane - 18);
      tag(DAVE, C.SAFE);
      break;
    }
    case 'vip': {
      gus = st < 2 ? 'flattered' : 'back';
      ropeOpen = st > 0.4 && st < 2.2;
      const u = Math.max(0, Math.min(1, (st - 0.6) / 1.4));
      drawCrowd((p) => {
        if (p !== PRIYA) return { frame: 'freeze' };
        if (st > 2) return { frame: 'stand', hide: true };
        return { frame: u > 0 ? (Math.floor(t * 8) % 2 ? 'stepA' : 'stepB') : 'cheer', dx: u * 64, dy: -u * (PRIYA.lane - 66) };
      });
      if (st > 2 && st < 2.15) { flash = 0.4; flashColor = C.LAMP; sfx.vip(); }
      if (st > 2.3) {
        vipList(['PRIYA'], st > 3.5 ? 'LIGHTS OUT' : undefined);
        if (st < 4.5) banner('NEW OWNER', 'PRIYA RUNS THE DOOR', C.LAMP, C.INK);
      }
      break;
    }
    case 'lightsout': {
      gus = 'watch';
      stepCrowd(dt, true, 10);
      drawCrowd((p) => ({ frame: frameFor(p) }));
      break;
    }
    case 'disco': {
      gus = 'dance';
      stepCrowd(dt, true, 18);
      drawCrowd((p) => ({ frame: Math.floor(t * 4 + p.id) % 2 ? 'cheer' : 'stand', dy: -(Math.floor(t * 4 + p.id) % 2) }));
      for (let i = 0; i < 4; i++) blit(ctx, icon.note(i % 2 ? C.SAFE : C.NEON), 40 + i * 52 + Math.round(Math.sin(t * 2 + i) * 6), 70 - ((t * 20 + i * 15) % 40));
      vipList(['PRIYA'], 'DISCO');
      break;
    }
    case 'moonwalk': {
      stepCrowd(dt, true, 10);
      drawCrowd((p) => ({ frame: p.walking ? (Math.floor(t * 6 + p.id) % 2 ? 'stepA' : 'stepB') : 'freeze', flip: p.walking }));
      vipList(['PRIYA'], 'MOONWALK');
      break;
    }
    case 'finale': {
      gus = st > 6 ? 'sleep' : 'point';
      const win = st > 6;
      if (win) say(LINES.finaleWin);
      ropeOpen = win;
      drawCrowd((p) => {
        if (!win) return { frame: Math.floor(t * 10 + p.id) % 2 ? 'cheer' : 'stand' };
        const run = Math.min(1, (st - 6 - (p.id % 8) * 0.15) / 1.2);
        if (run >= 1) return { frame: 'stand', hide: true };
        return { frame: Math.floor(t * 10) % 2 ? 'stepA' : 'stepB', dx: Math.max(0, run) * (L.DOOR.x + 16 - p.x), dy: Math.max(0, run) * (66 - p.lane) };
      });
      break;
    }
    case 'nerd': {
      stepCrowd(dt, true);
      drawCrowd((p) => ({ frame: p === NERD ? 'caught' : frameFor(p) }));
      if (Math.floor(t * 8) % 2) {
        ctx.strokeStyle = C.ALERT;
        rect(ctx, NERD.x - 11, NERD.lane - 20, 22, 1, C.ALERT); rect(ctx, NERD.x - 11, NERD.lane + 2, 22, 1, C.ALERT);
        rect(ctx, NERD.x - 11, NERD.lane - 20, 1, 22, C.ALERT); rect(ctx, NERD.x + 10, NERD.lane - 20, 1, 23, C.ALERT);
      }
      tag(NERD, C.ALERT);
      break;
    }
    case 'end': {
      drawCrowd((p) => ({ frame: 'stand' }));
      gus = 'sleep';
      break;
    }
    case 'auto': gus = drawAuto(dt); ropeOpen = auto.vipT >= 0 && auto.vipT < 1; break;
  }

  drawGus(ctx, gus, t);
  drawRope(ctx, t, ropeOpen);

  // overlays above the world
  if (state === 'lightsout') {
    drawDarkness(ctx, t);
    vipList(['PRIYA'], 'LIGHTS OUT');
  }
  if (state === 'lobby') lobbyPanel();
  if (state === 'hud') brainHud();
  if (state === 'finale') finaleMeter();
  if (state === 'nerd') { curtainEdge(1); if (Math.floor(st * 4) % 4 !== 3) banner('NICE TRY, NERD', 'RAVI SITS OUT 5 SECONDS', C.ALERT, C.INK, 30); }
  if (state === 'moonwalk' && Math.floor(t * 2) % 2) drawTextOutlined(ctx, '<< MOONWALK >>', 120, 70, C.NEON, C.INK);
  if (state === 'end') endPanel();
  if (state === 'watch' && st < 0.4) curtainEdge(1);

  ctx.restore();

  // text box: Gus's voice, always on screen
  const prev = Math.floor(shown);
  shown = Math.min(line.length, shown + dt * 30);
  if (Math.floor(shown) !== prev && Math.floor(shown) % 2 === 0 && line[Math.floor(shown)] !== ' ') sfx.blip(true);
  const ticker = state === 'hud' ? TICKER[Math.floor(st / 4) % TICKER.length] : line;
  textBox(ctx, 2, L.TEXT_Y + 1, L.W - 4, 33, ticker, state === 'hud' ? ticker.length : shown, t, state === 'hud' ? 'LIVE' : 'GUS');

  // full-screen flash (catch = red, VIP = gold): 50% checker, never alpha
  if (flash > 0) {
    dither(ctx, 0, 0, L.W, L.H, flashColor, Math.floor(t * 30));
    flash -= dt;
  }
}

function stareDown(p: P, ask: string, value: number, count: number) {
  const w = 104, h = 52;
  const x = Math.max(4, Math.min(L.W - w - 4, Math.round(p.x - w / 2))), y = p.lane - 78;
  frame(ctx, x, y, w, h);
  nameTab(ctx, 'STARE-DOWN', x + 6, y, C.ALERT, C.PAPER);
  // Gus's head, cropped from his sprite at 2x
  ctx.drawImage(gusSprite('watch', C.ALERT), 0, 0, 24, 9, x + 4, y + 7, 48, 18);
  drawText(ctx, `${p.name}:`, x + 52, y + 9, C.INK);
  drawText(ctx, ask, x + 52, y + 19, C.ALERT);
  meter(ctx, x + 7, y + 30, 70, 9, value, value > 0.6 ? C.SAFE : C.LAMP, 8);
  drawText(ctx, `${count}`, x + 86, y + 31, C.INK, 1);
  drawText(ctx, 'NERVE', x + 7, y + 41, C.STONE);
}

function lobbyPanel() {
  const m = 2;
  const size = (qr.size + 4) * m;
  const x = 156, y = 40;
  frame(ctx, x - 8, y - 2, size + 16, size + 30);
  drawQR(x + 2 * m, y + 4 + 2 * m, m);
  drawTextCentered(ctx, 'SCAN TO GET', x + size / 2, y + size + 5, C.INK);
  drawTextCentered(ctx, 'IN LINE', x + size / 2, y + size + 14, C.INK);
  const n = crowd.filter((p) => st >= p.visibleAt).length;
  frame(ctx, 4, 4, 84, 26, C.NIGHT, C.SAFE);
  drawText(ctx, 'IN LINE', 11, 10, C.SAFE);
  drawText(ctx, `${String(n).padStart(3, '0')} PEOPLE`, 11, 19, C.PAPER);
}

function brainHud() {
  frame(ctx, 4, 4, 128, 70, C.NIGHT, C.PAPER);
  drawText(ctx, "GUS'S BRAIN", 11, 9, C.PAPER);
  const rows: [string, number, string][] = [
    ['EGO', HUD.ego + Math.sin(t) * 0.04, C.LAMP],
    ['PARANOIA', HUD.paranoia + Math.sin(t * 1.3) * 0.05, C.ALERT],
    ['BOREDOM', HUD.boredom, C.STONE_HI],
    ['SUSPECT', HUD.suspicion + Math.max(0, Math.sin(t * 0.7)) * 0.2, C.NEON],
  ];
  rows.forEach(([name, v, c], i) => {
    drawText(ctx, name, 11, 20 + i * 11, C.STONE_HI);
    meter(ctx, 64, 19 + i * 11, 62, 9, v, c, 10);
  });
  // thought bubble next to Gus
  const tx = 150, ty = 4;
  frame(ctx, tx, ty, 112, 30, C.PAPER);
  drawText(ctx, 'IF ONE MORE GUY', tx + 7, ty + 7, C.INK);
  drawText(ctx, 'SAYS HE KNOWS', tx + 7, ty + 16, C.INK);
  for (const [dx, dy] of [[94, 34], [100, 40]]) rect(ctx, tx + dx, ty + dy, 3, 3, C.PAPER);
}

function finaleMeter() {
  const crowdSide = st > 6 ? 1 : Math.min(0.95, 0.35 + st * 0.1 + Math.sin(t * 7) * 0.05);
  frame(ctx, 16, 4, L.W - 32, 34, C.NIGHT, C.PAPER);
  drawText(ctx, 'CROWD', 24, 10, C.SAFE);
  drawText(ctx, 'GUS', L.W - 45, 10, C.ALERT);
  drawTextCentered(ctx, st > 6 ? 'ROPE SNAPPED!' : 'MOSH PIT RUSH', L.W / 2, 10, C.PAPER);
  const x = 24, w = L.W - 48;
  rect(ctx, x, 21, w, 11, C.INK);
  rect(ctx, x + 1, 22, w - 2, 9, C.ALERT);
  rect(ctx, x + 1, 22, Math.round((w - 2) * crowdSide), 9, C.SAFE);
  rect(ctx, x + 1, 22, Math.round((w - 2) * crowdSide), 1, C.PAPER);
  rect(ctx, x + Math.round((w - 2) * crowdSide), 19, 2, 15, C.PAPER);
}

function endPanel() {
  dither(ctx, 0, 0, L.W, L.TEXT_Y, C.INK);
  const w = 200, x = (L.W - w) / 2, y = 12;
  frame(ctx, x, y, w, 124);
  drawTextCentered(ctx, 'LAST CALL', L.W / 2, y + 8, C.VELVET, 2);
  RESULTS.forEach((r, i) => {
    const yy = y + 32 + i * 18;
    const look = crowd.find((p) => p.name === r.name)?.look ?? lookFromSeed(i);
    drawPlayer(ctx, look, 'stand', x + 18, yy + 13);
    drawText(ctx, r.label, x + 30, yy, C.STONE);
    drawText(ctx, r.name, x + 30, yy + 8, C.INK);
    drawText(ctx, r.value, x + w - 12 - textWidth(r.value), yy + 4, C.VELVET);
  });
  if (Math.floor(t * 2) % 2) drawTextCentered(ctx, 'MUGSHOTS SENT TO YOUR PHONES', L.W / 2, y + 112, C.INK);
}

/** A playable-looking loop with the real cycle timing, so the room can watch it run. */
function drawAuto(dt: number): GusPose {
  auto.left -= dt;
  if (auto.left <= 0) {
    switch (auto.phase) {
      case 'back': auto.phase = Math.random() < 0.25 ? 'fakeout' : 'tell'; auto.left = 0.6; say(LINES.tell); sfx.tell(); break;
      case 'fakeout': auto.phase = 'back'; auto.left = 2 + Math.random() * 2; say(LINES.fakeout); break;
      case 'tell': {
        auto.phase = 'watch'; auto.left = 1.6; sfx.turn(); shake = 0.15;
        const movers = crowd.filter((p) => p.walking && !p.gone);
        auto.caught = movers.length ? movers[Math.floor(Math.random() * movers.length)] : null;
        if (auto.caught) { say(`${auto.caught.name}. I SAW THAT. BACK OF THE LINE.`); flashRed(); sfx.caught(); auto.flingT = 0; } else say(LINES.watch);
        break;
      }
      case 'watch': auto.phase = 'back'; auto.left = 2.2 + Math.random() * 2; say(LINES.back); break;
    }
  }
  const moving = auto.phase === 'back' || auto.phase === 'fakeout';
  // in the tell, most people freeze, a few greedy ones keep going
  for (const p of crowd) {
    if (p.gone) continue;
    if (moving) {
      p.next -= dt;
      if (p.next <= 0) { p.walking = Math.random() < 0.65; p.next = 0.3 + Math.random() * 1; }
    } else if (auto.phase === 'tell') {
      if (p.walking && Math.random() < dt * 4) p.walking = false;
    } else if (p !== auto.caught) p.walking = false;
    if (p.walking && p !== auto.caught) p.x += 16 * dt * (0.7 + (p.id % 5) * 0.12);
    if (p.x > L.ROPE_X - 8 && auto.vipT < 0) {
      auto.vipT = 0; auto.vipName = p.name; flash = 0.4; flashColor = C.LAMP; sfx.vip();
      say(`${p.name} IS IN. ${p.name}, YOU RUN THE DOOR NOW.`);
      p.x = L.START_X;
    } else if (p.x > L.ROPE_X - 8) p.x = L.START_X;
  }
  if (auto.vipT >= 0) auto.vipT += dt;
  let flingDx = 0, flingDy = 0, flingHide = false;
  if (auto.caught && auto.flingT >= 0) {
    auto.flingT += dt;
    const u = Math.min(1, auto.flingT / 1.2);
    flingDx = (L.START_X - auto.caught.x) * u;
    flingDy = -Math.round(Math.sin(u * Math.PI) * 50);
    if (u >= 1) { auto.caught.x = L.START_X; auto.caught.walking = false; auto.caught = null; auto.flingT = -1; flingHide = true; }
  }
  drawCrowd((p) => {
    if (p === auto.caught) return { frame: 'caught', dx: flingDx, dy: flingDy, flip: Math.floor(t * 8) % 2 === 0, hide: flingHide };
    return { frame: auto.phase === 'watch' ? 'freeze' : frameFor(p) };
  });
  if (auto.phase === 'watch') drawSightline(ctx, t);
  if (auto.vipT >= 0) vipList([auto.vipName], CHAOS[0].name);
  return auto.phase === 'back' ? 'back' : auto.phase === 'fakeout' ? 'tell' : auto.phase === 'tell' ? 'tell' : 'watch';
}

// =====================================================================
// LIVE: the projector draws only what the room server reports.
// No mock crowd, no NPCs: every body on the street is a joined phone.
// =====================================================================
interface LP { look: PlayerLook; seed: number; x: number; flingT: number; flingFrom: number; enterT: number; seenAt: number }
const lp = new Map<string, LP>();
let snap: Snapshot | null = null;
let netUp = false;
let lastPhase: RoundPhase | null = null;
let pointT = 0;
let bannerMsg: { text: string; sub: string | null; fill: string; until: number } | null = null;
const LIVE_LANES = [98, 112, 126, 140];

const net = LIVE ? connect(() => ({ t: 'hello', role: 'screen' }), onServer, (up) => { netUp = up; }) : null;

function liveLane(i: number) { return LIVE_LANES[i % LIVE_LANES.length] - Math.floor(i / LIVE_LANES.length) * 6; }
function toPx(x01: number) { return L.START_X + x01 * (L.ROPE_X - 10 - L.START_X); }
function showBanner(text: string, sub: string | null, fill: string, secs: number) { bannerMsg = { text, sub, fill, until: t + secs }; }

function vis(p: PubPlayer): LP {
  let v = lp.get(p.id);
  if (!v || v.seed !== p.seed) {
    v = { look: lookFromSeed(p.seed), seed: p.seed, x: toPx(p.x), flingT: -1, flingFrom: 0, enterT: -1, seenAt: t };
    lp.set(p.id, v);
  }
  return v;
}

function onServer(m: ServerMsg) {
  if (m.t === 'snap') {
    snap = m;
    if (m.phase !== lastPhase) onPhase(lastPhase, m);
    lastPhase = m.phase;
    for (const id of [...lp.keys()]) if (!m.players.some((p) => p.id === id)) lp.delete(id);
    return;
  }
  if (m.t !== 'ev') return;
  switch (m.kind) {
    case 'tell': sfx.tell(); break;
    case 'turn': sfx.turn(); shake = 0.12; break;
    case 'caught': say(`${m.name}. I SAW THAT. BRIBE ME.`); sfx.caught(); flashRed(); shake = 0.2; pointT = 0.8; break;
    case 'flung': {
      const v = lp.get(m.id);
      if (v) { v.flingT = 0; v.flingFrom = v.x; }
      say(`${m.name}: BACK OF THE LINE.`); sfx.fling(); shake = 0.25;
      break;
    }
    case 'pass': say(`...FINE, ${m.name}. KEEP WALKING.`); sfx.pass(); break;
    case 'entered': {
      const v = lp.get(m.id);
      if (v) v.enterT = 0;
      flash = 0.4; flashColor = C.LAMP; sfx.vip();
      if (m.order > 1) say(`${m.name} IS IN. NUMBER ${m.order}.`);
      break;
    }
    case 'owner': say(`${m.name} IS IN FIRST. ${m.name}, YOU RUN THE DOOR NOW.`); showBanner('NEW OWNER', `${m.name} RUNS THE DOOR`, C.LAMP, 3.5); break;
    case 'rule': say(`${m.by} PICKED MOONWALK. LET GO TO MOVE. HOLD TO FREEZE.`); showBanner('MOONWALK!', 'RELEASE TO MOVE', C.NEON, 5); sfx.vip(); break;
    case 'rope':
      if (m.snapped) { say('THE ROPE IS GONE. EVERYBODY IN. NOW VOTE.'); showBanner('ROPE SNAPPED!', 'EVERYONE RUSHES IN  X1.5', C.SAFE, 2.5); flash = 0.4; flashColor = C.SAFE; shake = 0.3; sfx.fling(); }
      else { say('ROPE HELD. NOW THE LOUNGE VOTES ON THE CROWN.'); showBanner('ROPE HELD', 'THE LINE STAYS OUT', C.LAMP, 2.5); }
      break;
  }
}

function onPhase(from: RoundPhase | null, m: Snapshot) {
  switch (m.phase) {
    case 'lobby': bannerMsg = null; say('CLUB VELVET IS OPEN. SCAN THE CODE AND GET IN LINE. NO PUSHING.'); break;
    case 'play': say('DOORS ARE OPEN. HOLD TO SNEAK. FREEZE WHEN I LOOK.'); sfx.turn(); break;
    case 'push': say('LAST CALL! OUTSIDE: BREAK THE ROPE. LOUNGE: HOLD IT.'); sfx.nerd(); shake = 0.2; break;
    case 'vote': break; // the rope event speaks
    case 'reveal': {
      const r = m.reveal;
      flash = 0.6; flashColor = C.LAMP; sfx.vip();
      if (!r?.winnerName) say('NOBODY GOT IN. GUS WINS AGAIN.');
      else if (r.prevOwnerName) say(`${r.winnerName} TOOK THE CROWN FROM ${r.prevOwnerName}. LONG LIVE ${r.winnerName}.`);
      else say(`${r.winnerName} KEPT THE CROWN. TONIGHT'S VIP.`);
      break;
    }
  }
  void from;
}

function liveTag(text: string, x: number, lane: number, color: string, plate: string = C.INK, suffix?: [string, string]) {
  const w = textWidth(text) + 4 + (suffix ? textWidth(suffix[0]) + 6 : 0);
  let tx = Math.round(x + 9);
  if (tx + w > L.ROPE_X - 2) tx = Math.round(x - 9 - w);
  const ty = lane - 13;
  rect(ctx, tx, ty, w, 9, plate);
  drawText(ctx, text, tx + 2, ty + 1, color);
  if (suffix) drawText(ctx, suffix[0], tx + 4 + textWidth(text) + 4, ty + 1, suffix[1]);
}

function drawLiveScreen(dt: number) {
  scr.fitFixed(host);
  const s = snap;
  const sx = shake > 0 ? (Math.floor(t * 40) % 2 ? 2 : -2) : 0;
  shake = Math.max(0, shake - dt);
  pointT = Math.max(0, pointT - dt);
  ctx.save();
  ctx.translate(sx, 0);

  const players = s?.players ?? [];
  const phase = s?.phase ?? 'lobby';
  const lounge = players.filter((p) => p.state === 'lounge').sort((a, b) => a.entryOrder - b.entryOrder);
  const entering = players.some((p) => (lp.get(p.id)?.enterT ?? -1) >= 0);
  drawStreet(ctx, t, { lounge: lounge.length ? 1 : 0 });
  drawCat(ctx, t);

  let gus: GusPose = 'back';
  if (phase === 'lobby') gus = 'watch';
  else if (phase === 'play') gus = pointT > 0 ? 'point' : s!.gus === 'sleep' ? 'sleep' : s!.gus;
  else if (phase === 'push') gus = 'point';
  else if (phase === 'vote') gus = s!.ropeSnapped ? 'sleep' : 'watch';
  else gus = s?.reveal?.winnerName ? 'flattered' : 'dance';
  if (phase === 'play' && s!.gus === 'watch') drawSightline(ctx, t);

  // bodies on the street, back lanes first
  const order = players.map((p, i) => ({ p, i, lane: liveLane(i) })).sort((a, b) => a.lane - b.lane);
  const moon = s?.rule === 'moonwalk';
  for (const { p, lane } of order) {
    const v = vis(p);
    if (phase === 'lobby') {
      v.x = L.START_X + 4 + (players.indexOf(p) % 3) * 22 + Math.floor(players.indexOf(p) / 3) * 8;
      if (t - v.seenAt < 0.3) blit(ctx, icon.puff(), v.x - 4, lane - 12);
      drawPlayer(ctx, v.look, Math.floor(t * 2 + players.indexOf(p)) % 5 === 0 ? 'cheer' : 'stand', v.x, lane);
      liveTag(p.name, v.x, lane, C.PAPER);
      continue;
    }
    if (p.state === 'lounge') {
      if (v.enterT >= 0) {
        // stepping through the rope towards the door
        v.enterT += dt;
        const u = Math.min(1, v.enterT / 1.1);
        drawPlayer(ctx, v.look, Math.floor(t * 8) % 2 ? 'stepA' : 'stepB', L.ROPE_X - 6 + u * 40, lane + (66 - lane) * u);
        if (u >= 1) v.enterT = -1;
      }
      continue;
    }
    if (v.flingT >= 0) {
      v.flingT += dt;
      const u = Math.min(1, v.flingT / 1.2);
      const fx = v.flingFrom + (L.START_X - v.flingFrom) * u;
      drawPlayer(ctx, v.look, 'caught', fx, lane - Math.round(Math.sin(u * Math.PI) * 50), Math.floor(t * 8) % 2 === 0);
      if (u >= 1) { v.flingT = -1; v.x = L.START_X; }
      continue;
    }
    v.x += (toPx(p.x) - v.x) * Math.min(1, dt * 10);
    if (p.caught) {
      spotlight({ x: v.x, lane } as P, C.ALERT);
      drawPlayer(ctx, v.look, Math.floor(t * 8) % 2 ? 'cheer' : 'caught', v.x, lane);
      liveTag(p.name, v.x, lane, C.PAPER, C.ALERT, ['CAUGHT', C.INK]);
      continue;
    }
    let fr: PlayerFrame = 'freeze';
    if (phase === 'push') fr = Math.floor(t * 10 + players.indexOf(p)) % 2 ? 'cheer' : 'stand';
    else if (p.moving) fr = moon ? (Math.floor(t * 6) % 2 ? 'stepA' : 'stepB') : (Math.floor(t * 8 + players.indexOf(p)) % 2 ? 'sneakA' : 'sneakB');
    drawPlayer(ctx, v.look, fr, v.x + (phase === 'push' ? (Math.floor(t * 12) % 2) : 0), lane, moon && p.moving);
    liveTag(p.name, v.x, lane, p.moving ? C.SAFE : C.PAPER);
  }

  drawGus(ctx, gus, t);
  drawRope(ctx, t, entering || !!s?.ropeSnapped && phase !== 'lobby');

  // ---------- overlays ----------
  if (phase === 'lobby') liveLobbyPanel(players);
  else if (phase !== 'reveal') {
    liveVipPanel(lounge, s!);
    liveClock(s!);
  }
  if (phase === 'play' && moon && (!bannerMsg || t > bannerMsg.until) && Math.floor(t * 2) % 2) drawTextOutlined(ctx, '<< RELEASE TO MOVE >>', 112, 70, C.NEON, C.INK);
  if (phase === 'push') livePushMeter(s!);
  if (phase === 'vote') liveVotePanel(s!);
  if (bannerMsg && t < bannerMsg.until && phase !== 'reveal') banner(bannerMsg.text, bannerMsg.sub, bannerMsg.fill, C.INK, phase === 'push' ? 44 : 30);
  if (phase === 'reveal') liveReveal(s!);
  if (!netUp) { rect(ctx, L.W - 70, L.TEXT_Y - 12, 68, 10, C.ALERT); drawText(ctx, 'NO SERVER', L.W - 66, L.TEXT_Y - 11, C.PAPER); }

  ctx.restore();

  const prev = Math.floor(shown);
  shown = Math.min(line.length, shown + dt * 30);
  if (Math.floor(shown) !== prev && Math.floor(shown) % 2 === 0 && line[Math.floor(shown)] !== ' ') sfx.blip(true);
  textBox(ctx, 2, L.TEXT_Y + 1, L.W - 4, 33, line, shown, t, 'GUS');
  if (flash > 0) { dither(ctx, 0, 0, L.W, L.H, flashColor, Math.floor(t * 30)); flash -= dt; }
}

function liveLobbyPanel(players: PubPlayer[]) {
  const m = 2;
  const size = (qr.size + 4) * m;
  const x = 156, y = 40;
  frame(ctx, x - 8, y - 2, size + 16, size + 30);
  drawQR(x + 2 * m, y + 4 + 2 * m, m);
  drawTextCentered(ctx, 'SCAN TO GET', x + size / 2, y + size + 5, C.INK);
  drawTextCentered(ctx, 'IN LINE', x + size / 2, y + size + 14, C.INK);
  const n = players.length;
  const shownNames = players.slice(0, 5);
  const h = 26 + (shownNames.length ? shownNames.length * 9 + 2 : 0) + (n > 5 ? 9 : 0);
  frame(ctx, 4, 4, 92, h, C.NIGHT, C.SAFE);
  drawText(ctx, 'IN LINE', 11, 10, C.SAFE);
  drawText(ctx, `${String(n).padStart(3, '0')} ${n === 1 ? 'PERSON' : 'PEOPLE'}`, 11, 19, C.PAPER);
  shownNames.forEach((p, i) => { drawText(ctx, `${i + 1}`, 11, 30 + i * 9, C.STONE_HI); drawText(ctx, p.name, 21, 30 + i * 9, C.PAPER); });
  if (n > 5) drawText(ctx, `+${n - 5} MORE`, 21, 30 + 5 * 9, C.STONE_HI);
  if (n > 0 && Math.floor(t * 2) % 2) drawTextOutlined(ctx, 'HOST: PRESS S TO START', 100, 6, C.LAMP, C.INK);
}

function liveVipPanel(lounge: PubPlayer[], s: Snapshot) {
  const rows = Math.max(1, lounge.length);
  const h = 18 + rows * 9 + (s.rule ? 20 : 0);
  frame(ctx, 4, 4, 90, h, C.NIGHT, C.LAMP);
  drawText(ctx, 'VIP LIST', 11, 9, C.LAMP);
  if (!lounge.length) drawText(ctx, 'NOBODY YET', 11, 19, C.STONE_HI);
  lounge.forEach((p, i) => {
    const owner = p.id === s.ownerId;
    if (owner) blit(ctx, sprite('crown1', CROWN_ICON, { k: C.INK, y: C.LAMP, w: C.PAPER }), 9, 19 + i * 9);
    else blit(ctx, icon.star(), 10, 19 + i * 9);
    drawText(ctx, p.name, 20, 19 + i * 9, owner ? C.LAMP : C.PAPER);
  });
  if (s.rule) {
    const ry = 19 + rows * 9 + 2;
    drawText(ctx, 'RULE:', 10, ry, C.STONE_HI);
    drawText(ctx, 'MOONWALK', 10, ry + 9, C.NEON);
  }
}

function liveClock(s: Snapshot) {
  const label = s.phase === 'play' ? 'LAST CALL' : s.phase === 'push' ? 'ROPE' : 'VOTE';
  const left = s.phase === 'play' ? s.timeLeft - 15 : s.phase === 'push' ? s.timeLeft - 5 : s.timeLeft;
  frame(ctx, L.W - 70, 2, 66, 21, C.NIGHT, left <= 5 ? C.ALERT : C.PAPER);
  drawText(ctx, label, L.W - 64, 6, C.STONE_HI);
  drawText(ctx, `${Math.max(0, Math.ceil(left))}S`, L.W - 64, 14, left <= 5 ? C.ALERT : C.PAPER);
}

function livePushMeter(s: Snapshot) {
  const p = s.push;
  if (!p) return;
  const c = p.crowd / Math.max(1, p.outside);
  const d = p.defend / (p.lounge + 1);
  const crowdSide = c + d > 0 ? c / (c + d) : 0.5;
  const x0 = 102, w0 = 136;
  frame(ctx, x0 - 8, 4, w0 + 16, 34, C.NIGHT, C.PAPER);
  drawText(ctx, `CROWD ${p.outside}`, x0, 10, C.SAFE);
  const right = `LOUNGE ${p.lounge}+GUS`;
  drawText(ctx, right, x0 + w0 - textWidth(right), 10, C.LAMP);
  rect(ctx, x0, 21, w0, 11, C.INK);
  rect(ctx, x0 + 1, 22, w0 - 2, 9, C.LAMP);
  rect(ctx, x0 + 1, 22, Math.round((w0 - 2) * crowdSide), 9, C.SAFE);
  rect(ctx, x0 + Math.round((w0 - 2) * crowdSide), 19, 2, 15, C.PAPER);
}

function liveVotePanel(s: Snapshot) {
  const v = s.vote;
  if (!v) return;
  const w = 144, x = 100, y = 4;
  frame(ctx, x, y, w, 58, C.PAPER, C.INK);
  nameTab(ctx, 'COUP VOTE', x + 6, y, C.VELVET, C.PAPER);
  drawText(ctx, `${s.ownerName ?? '?'}'S CROWN`, x + 8, y + 10, C.INK);
  if (v.eligible === 0) {
    drawText(ctx, 'NOBODY CAN VOTE.', x + 8, y + 22, C.STONE);
    drawText(ctx, 'THE CROWN IS SAFE.', x + 8, y + 31, C.STONE);
    return;
  }
  meter(ctx, x + 8, y + 21, w - 16, 9, Math.min(1, v.cast / v.needed), v.cast >= v.needed ? C.SAFE : C.NEON, v.needed);
  drawText(ctx, `${v.cast} OF ${v.needed} VOTES`, x + 8, y + 33, C.INK);
  if (v.successorName) drawText(ctx, `NEXT: ${v.successorName}`, x + 8, y + 42, C.VELVET);
}

function liveReveal(s: Snapshot) {
  const r = s.reveal;
  dither(ctx, 0, 0, L.W, L.TEXT_Y, C.INK);
  const w = 288, x = (L.W - w) / 2, y = 4;
  frame(ctx, x, y, w, 136);
  drawTextCentered(ctx, "TONIGHT'S VIP", L.W / 2, y + 7, C.VELVET, 2);
  if (r?.winnerId && r.winnerName) {
    const v = lp.get(r.winnerId);
    blit(ctx, sprite('crown2', CROWN_ICON, { k: C.INK, y: C.LAMP, w: C.PAPER }), L.W / 2 - textWidth(r.winnerName, 2) / 2 - 22, y + 26, false, 2);
    drawTextCentered(ctx, r.winnerName, L.W / 2, y + 28, C.INK, 2);
    if (v) drawPlayer(ctx, v.look, Math.floor(t * 4) % 2 ? 'cheer' : 'stand', L.W / 2 + textWidth(r.winnerName, 2) / 2 + 14, y + 44);
    drawTextCentered(ctx, r.prevOwnerName ? `TOOK THE CROWN FROM ${r.prevOwnerName}` : r.ropeSnapped ? 'KEPT THE CROWN THROUGH THE RUSH' : 'KEPT THE CROWN', L.W / 2, y + 46, r.prevOwnerName ? C.ALERT : C.STONE);
  } else {
    drawTextCentered(ctx, 'NOBODY. GUS WINS.', L.W / 2, y + 28, C.INK, 2);
  }
  rect(ctx, x + 8, y + 58, w - 16, 1, C.INK);
  drawText(ctx, 'RANKING: CROWN FIRST', x + 10, y + 63, C.STONE);
  (r?.ranking ?? []).slice(0, 7).forEach((row, i) => {
    const yy = y + 74 + i * 9;
    const c = i === 0 ? C.VELVET : C.INK;
    drawText(ctx, `#${i + 1}`, x + 10, yy, c);
    drawText(ctx, row.name, x + 28, yy, c);
    if (r?.winnerId === row.id) blit(ctx, sprite('crown1', CROWN_ICON, { k: C.INK, y: C.LAMP, w: C.PAPER }), x + 30 + textWidth(row.name), yy);
    const sc = `${row.score}`;
    drawText(ctx, sc, x + 136 - textWidth(sc), yy, c);
  });
  drawText(ctx, 'AWARDS', x + 148, y + 63, C.STONE);
  (r?.awards ?? []).forEach((a, i) => {
    const yy = y + 74 + i * 17;
    drawText(ctx, a.label, x + 148, yy, C.STONE);
    drawText(ctx, a.value ? `${a.name} ${a.value}` : a.name, x + 148, yy + 9, C.INK);
  });
  if (Math.floor(t * 2) % 2) drawTextCentered(ctx, 'HOST: R FOR A NEW NIGHT', L.W / 2, y + 127, C.STONE);
}

const CROWN_ICON = ['k..kk..k', 'kk.kk.kk', 'kykyykyk', 'kyyyyyyk', 'kyyyyyyk', 'kkkkkkkk', '........', '........'];

addEventListener('keydown', (e) => {
  if (!LIVE || !net) return;
  const k = e.key.toLowerCase();
  if (k === 's' && (!snap || snap.phase === 'lobby' || snap.phase === 'reveal')) net.send({ t: 'start' });
  if (k === 'r') { net.send({ t: 'reset' }); lp.clear(); }
});

// ---------- loop ----------
let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt; st += dt;
  if (LIVE) drawLiveScreen(dt); else draw(dt);
  requestAnimationFrame(loop);
}
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);
addEventListener('resize', () => scr.fitFixed(host));
if (LIVE) say('CLUB VELVET IS OPEN. SCAN THE CODE AND GET IN LINE. NO PUSHING.');
else enter(params.get('state') as S || 'auto');
requestAnimationFrame(loop);
