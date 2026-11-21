import { tagText } from '../../shared/text';
import QRCode from 'qrcode';
import { C } from './pix/palette';
import { Screen, rect, dither, frame, textBox, meter, blit, nameTab, sprite } from './pix/pix';
import { drawText, drawTextCentered, drawTextOutlined, textWidth, wrap } from './pix/font';
import { lookFromSeed, drawPlayer, icon, gusSprite, type PlayerLook, type PlayerFrame, type GusPose } from './pix/sprites';
import { drawStreet, drawRope, drawGus, drawSightline, drawDarkness, drawCat, L } from './pix/scene';
import { sfx, unlock, setMuted, getLevel, masterOut, audio } from './pix/sfx';
import { startClub, setScene, setAjar, doorOpen, duck, sting, hum, stopHum, audition, gusBusyFor, loadAudition, _debug as clubDebug } from './club-audio';
import { mountPanel, wakeAudio, testSound, stopPreview, previewMarks } from './sound-panel';
import { devbar } from './devbar';
import { NAMES, LINES, HUD, TICKER, RESULTS, CHAOS } from './mock';
import { connect } from './net';
import { T, RULES } from '../../shared/protocol';
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
const joinOrigin = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? __LAN_ORIGIN__ : location.origin;
const makeQR = (code: string) => QRCode.create(`${joinOrigin}/play.html${code ? `?room=${code}` : ''}`, { errorCorrectionLevel: 'M' }).modules;
let qr = makeQR(LIVE ? (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : '');
function buildQR() { qr = makeQR(roomCode); }

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
  rect(ctx, 0, 0, L.W, L.H, C.INK);
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
// Every body on the street is a phone (or a server NPC); every line Gus speaks comes from the server.
// =====================================================================
interface LP { look: PlayerLook; seed: number; x: number; flingT: number; flingFrom: number; enterT: number; seenAt: number; bananaT: number; slipT: number }
const lp = new Map<string, LP>();
let snap: Snapshot | null = null;
const evLog: { kind: string; name?: string; clock: number; phase: string }[] = [];
/** Host key presses the projector page actually received (for the start-path test). */
const keyLog: { key: string; phase: string | null; startSent: boolean; focus: string }[] = [];
const describeFocus = () => { const a = document.activeElement as HTMLElement | null; return a ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}` : 'none'; };
// read-only hook for the browser tests: the latest snapshot, and every game event with the round clock it arrived at
(window as unknown as { __club: unknown }).__club = {
  snap: () => snap,
  log: () => evLog,
  keys: () => keyLog,
  focus: () => describeFocus(),
  audio: () => ({ ...clubDebug(), state: audio()?.state ?? 'none' }),
  testSound: () => testSound(),
  previewMarks: () => previewMarks,
  stopPreview: () => stopPreview(),
  /** Record what the projector's mixer actually outputs (for the acceptance sound sample). */
  async record(ms: number): Promise<string> {
    const a = audio(), m = masterOut();
    if (!a || !m) return '';
    const dest = a.createMediaStreamDestination();
    m.connect(dest);
    const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise<void>((r) => { rec.onstop = () => r(); });
    rec.start();
    await new Promise((r) => setTimeout(r, ms));
    rec.stop();
    await done;
    m.disconnect(dest);
    const buf = new Uint8Array(await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
  },
};
let netUp = false;
let lastPhase: RoundPhase | null = null;
let pointT = 0;
let bannerMsg: { text: string; sub: string | null; fill: string; until: number } | null = null;
let gusText: { text: string; color: string; until: number } | null = null;
let roomCode = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
let lineWho = 'GUS';
let gotSayEvent = false;
let page = 0, pageShown = 0, pageWait = 0;
let muted = false;
const LIVE_LANES = [98, 112, 126, 140];
const BANANA = sprite('banana', ['....kk..', '...kyk..', '..kyyk..', '.kyyk...', 'kyyk....', 'kyyyk...', '.kyyyykk', '..kkkk..'], { k: C.INK, y: C.LAMP, w: C.PAPER });
const STARE_W = 100, STARE_H = 52, STARE_MAX = 3;
const stare = Array.from({ length: STARE_MAX }, () => ({ name: '', x: 0, lane: 0, micro: 'mash' as string | null, score: 0, left: 0, bx: 0 }));
let stareN = 0;
const flyers = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));
let bananaN = 0;
let revealAt = -1;
/** A named Lounge-power callout ("NOT A COP TRIPPED DJ OYSTER"), placed clear of Gus and his warning. */
let callout: { power: string; byTag: number; by: string; targetTag: number; target: string | null; until: number } | null = null;

let denied: 'no-room' | 'waiting' | null = null;
let canControl = true;   // projector keys S/R work only in open (test) mode; normally the host dashboard runs the room
const net = LIVE ? connect(() => (roomCode ? { t: 'hello', role: 'screen', room: roomCode } : { t: 'hello', role: 'screen' }), onServer, (up) => { netUp = up; }) : null;
// "Waiting for a room": a code field over the canvas
const codeBox = document.createElement('form');
codeBox.innerHTML = `<input id="roomInput" maxlength="4" placeholder="ROOM CODE" autocomplete="off" autocapitalize="characters" spellcheck="false"><button type="submit">Show room</button>`;
codeBox.style.cssText = 'position:fixed;left:50%;top:62%;transform:translateX(-50%);z-index:12;display:none;gap:8px;font:20px ClubPixelCJK,monospace';
for (const el of Array.from(codeBox.children) as HTMLElement[]) el.style.cssText = `font:inherit;text-transform:uppercase;padding:8px 12px;border:3px solid ${C.INK};background:${C.PAPER};color:${C.INK};border-radius:0`;
document.body.appendChild(codeBox);
codeBox.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = (document.getElementById('roomInput') as HTMLInputElement).value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (v.length === 4) { const u = new URL(location.href); u.searchParams.set('room', v); location.href = u.toString(); }
});

function liveLane(i: number) { return LIVE_LANES[i % LIVE_LANES.length] - Math.floor(i / LIVE_LANES.length) * 6; }
function toPx(x01: number) { return L.START_X + x01 * (L.ROPE_X - 10 - L.START_X); }
function showBanner(text: string, sub: string | null, fill: string, secs: number) { bannerMsg = { text, sub, fill, until: t + secs }; }

// ---------- Gus's voice: server lines in the box, deadpan TTS ----------
function sayLive(text: string, who: string) { line = text; lineWho = who; shown = 0; page = 0; pageShown = 0; pageWait = 0; }

const synth: SpeechSynthesis | null = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined' ? speechSynthesis : null;
let pending: string | null = null;
let utter: SpeechSynthesisUtterance | null = null;
function pickVoice(): SpeechSynthesisVoice | null {
  if (!synth) return null;
  const en = synth.getVoices().filter((v) => /^en/i.test(v.lang));
  return en.find((v) => /male|david|daniel|george|mark|alex|fred|guy|james|ryan|thomas/i.test(v.name) && !/female/i.test(v.name)) ?? en[0] ?? null;
}
function speakNext() {
  if (!synth || pending === null) return;
  const text = pending; pending = null;
  const u = new SpeechSynthesisUtterance(text.toLowerCase());
  u.pitch = 0.4; u.rate = 0.95; u.volume = Math.max(0, Math.min(1, getLevel('gus') * getLevel('master')));
  const v = pickVoice();
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
  u.onend = u.onerror = () => { if (utter === u) utter = null; speakNext(); };
  utter = u;
  try { synth.speak(u); } catch { utter = null; }
}
function speak(text: string) {
  if (!synth || muted) return;
  pending = text; // one slot: a newer line replaces an older pending one
  const busy = gusBusyFor(); // Gus is humming or saying his audition line: never talk over himself
  if (busy > 0) { setTimeout(() => { if (!utter && !synth.speaking) speakNext(); }, busy * 1000 + 150); return; }
  if (!utter && !synth.speaking) speakNext();
}
function setMute(m: boolean) {
  muted = m; setMuted(m);
  if (m) { pending = null; try { synth?.cancel(); } catch { /* ignore */ } utter = null; }
}

function vis(p: PubPlayer): LP {
  let v = lp.get(p.id);
  if (!v || v.seed !== p.seed) {
    v = { look: lookFromSeed(p.seed), seed: p.seed, x: toPx(p.x), flingT: -1, flingFrom: 0, enterT: -1, seenAt: t, bananaT: -1, slipT: -1 };
    lp.set(p.id, v);
  }
  return v;
}

function onServer(m: ServerMsg) {
  if (m.t === 'denied') { denied = m.reason; return; }
  if (m.t === 'room') {
    denied = null;
    canControl = m.control !== false;
    roomCode = m.code;
    const u = new URL(location.href);
    if (u.searchParams.get('room') !== m.code) { u.searchParams.set('room', m.code); history.replaceState(null, '', u.toString()); }
    buildQR();
    return;
  }
  if (m.t === 'snap') {
    snap = m;
    if (m.phase !== lastPhase) onPhase(lastPhase, m);
    lastPhase = m.phase;
    if (!gotSayEvent && m.say && m.say.text !== line) sayLive(m.say.text, m.say.who);
    for (const id of [...lp.keys()]) if (!m.players.some((p) => p.id === id)) lp.delete(id);
    return;
  }
  if (m.t !== 'ev') return;
  if (m.kind !== 'say' && snap) evLog.push({ kind: m.kind, name: 'name' in m ? m.name : 'by' in m ? m.by : undefined, clock: snap.phase === 'vote' ? -1 : snap.roundSecs - snap.timeLeft, phase: snap.phase });
  switch (m.kind) {
    case 'say': gotSayEvent = true; sayLive(m.text, m.who); if (m.speak) speak(m.text); break;
    case 'tell': stopHum(); duck(true); sfx.tell(); break;   // he noticed: the hum stops, the room drops
    case 'turn': duck(true); sfx.turn(); shake = 0.12; break;
    case 'fakeout': gusText = { text: '...NAH', color: C.PAPER, until: t + 0.8 }; break;
    case 'nap': showBanner('GUS FELL ASLEEP', 'GO GO GO', C.SAFE, 2.5); break;
    case 'caught': sfx.caught(); flashRed(); shake = 0.2; pointT = 0.8; break;
    case 'flung': {
      const v = lp.get(m.id);
      if (v) { v.flingT = 0; v.flingFrom = v.x; }
      sfx.fling(); shake = 0.25;
      maybeCuteShoes();
      break;
    }
    case 'pass': sfx.pass(); maybeCuteShoes(); break;
    case 'entered': {
      const v = lp.get(m.id);
      if (v) v.enterT = 0;
      flash = 0.4; flashColor = C.LAMP;
      // the clasp clicks, the door opens and the same beat comes through clear; the first one is the big moment
      if (m.order === 1) doorOpen(3, true); else doorOpen(1.2, false);
      break;
    }
    case 'owner': showBanner('NEW OWNER', `${m.name} RUNS THE DOOR`, C.LAMP, 3.5); break;
    case 'rule': showBanner(`${RULES[m.rule].name}!`, RULES[m.rule].banner, C.NEON, 5); sfx.vip(); break;
    case 'nerd': showBanner('NICE TRY, NERD', `${m.name} SITS OUT ${T.NERD_FOR}S`, C.ALERT, 2.5); sfx.nerd(); break;
    case 'power': {
      if (m.power === 'banana' && m.targetId) {
        const v = lp.get(m.targetId);
        if (v) { v.bananaT = 0; v.slipT = -1; }
      }
      callout = { power: m.power, byTag: m.byTag, by: m.by, targetTag: m.targetTag, target: m.target, until: t + 3 };
      break;
    }
    case 'allin': showBanner("EVERYONE'S IN", 'TIME TO VOTE', C.LAMP, 3); flash = 0.4; flashColor = C.LAMP; sfx.vip(); break;
    case 'rope':
      if (m.snapped) { showBanner('ROPE SNAPPED!', 'EVERYONE RUSHES IN  X1.5', C.SAFE, 2.5); flash = 0.4; flashColor = C.SAFE; shake = 0.3; sfx.fling(); doorOpen(3, true); }
      else showBanner('ROPE HELD', 'THE LINE STAYS OUT', C.LAMP, 2.5);
      break;
  }
}

function onPhase(from: RoundPhase | null, m: Snapshot) {
  // from === null: this screen just loaded (or was refreshed) mid-game. Pick the scene up where it is,
  // but never replay one-off moments (door, hum, crowning).
  const fresh = from === null;
  // a round is starting (or moving on): no preview timers or lobby hum may spill into it
  if (m.phase !== 'lobby') { stopPreview(); stopHum(); }
  if (m.phase === 'lobby' || m.phase === 'play') { hummedThisRound = fresh && m.phase === 'play'; shoesThisRound = false; lobbySince = t; }
  switch (m.phase) {
    case 'lobby': bannerMsg = null; gusText = null; callout = null; break;
    case 'play': if (!fresh) sfx.turn(); break;
    case 'push': if (!fresh) { sfx.nerd(); shake = 0.2; } break;
    case 'reveal':
      if (fresh) { revealAt = t - 60; break; } // straight to the scores
      flash = 0.6; flashColor = C.LAMP; sting(); revealAt = t; break;
  }
}

/** This screen has no room to show: rooms are created on the private host console. */
function drawDenied() {
  scr.fitFixed(host);
  rect(ctx, 0, 0, L.W, L.H, C.NIGHT);
  drawTextCentered(ctx, 'CLUB VELVET', L.W / 2, 40, C.NEON, 2);
  drawTextCentered(ctx, denied === 'no-room' ? `NO ROOM ${roomCode} RIGHT NOW` : 'WAITING FOR A ROOM', L.W / 2, 70, C.PAPER, denied === 'no-room' ? 1 : 2);
  drawTextCentered(ctx, 'HOST: CREATE A GAME ON /ADMIN.HTML,', L.W / 2, 92, C.STONE_HI);
  drawTextCentered(ctx, 'THEN CLICK OPEN PROJECTOR OR TYPE THE CODE', L.W / 2, 102, C.STONE_HI);
}

// ---------- the room's sound, following the game ----------
function logSound(kind: string) { if (snap) evLog.push({ kind, clock: snap.phase === 'vote' ? -1 : snap.roundSecs - snap.timeLeft, phase: snap.phase }); }
let hummedThisRound = false;
let shoesThisRound = false;
let lobbySince = 0;
let backSince = 0;
let lastGusPose = '';
/** "I saw that... Cute shoes, though." Only after a challenge ends, now and then, never over a line or a warning. */
function maybeCuteShoes() {
  if (shoesThisRound || !snap || snap.phase !== 'play' || snap.gus === 'tell' || snap.gus === 'watch') return;
  if (synth?.speaking || utter || Math.random() > 0.35) return;
  if (audition() > 0) { shoesThisRound = true; logSound('cute-shoes'); }
}
function soundDirector(s: Snapshot | null) {
  if (!s) return;
  const phase = s.phase;
  setScene(phase === 'vote' ? 'vote' : 'street');
  setAjar(phase === 'play' && s.rule === 'disco');
  const turning = phase === 'play' && (s.gus === 'tell' || s.gus === 'watch');
  duck(turning);
  if (s.gus !== lastGusPose) { lastGusPose = s.gus; if (s.gus === 'back') backSince = t; }
  // Gus hums the hook at most once a round, in a safe gap: no warning, banner, callout or line going
  const quiet = !synth?.speaking && !utter && (!bannerMsg || t > bannerMsg.until) && (!callout || t > callout.until);
  if (hummedThisRound || !quiet) return;
  const firstInYet = s.players.some((p) => p.state === 'lounge');
  const lobbyGap = phase === 'lobby' && t - lobbySince > 12 && s.players.some((p) => !p.npc);
  const playGap = phase === 'play' && !firstInYet && s.gus === 'back' && t - backSince > 0.8 && s.roundSecs - s.timeLeft > 6;
  if (lobbyGap || playGap) { hummedThisRound = true; hum(true); logSound('hum'); }
}

/** Player number badge: the same number the phone shows ("YOU ARE 7") and the results list. */
function badgeW(n: number) { return textWidth(tagText(n)) + 4; }
function badge(n: number, x: number, y: number) {
  if (!n) return 0;
  const w = badgeW(n);
  rect(ctx, x, y, w, 9, C.INK);
  rect(ctx, x + 1, y + 1, w - 2, 7, C.LAMP);
  drawText(ctx, tagText(n), x + 2, y + 1, C.INK);
  return w;
}
/** Badge then name; returns the width drawn. */
function badgeName(n: number, name: string, x: number, y: number, color: string) {
  const bw = n ? badge(n, x, y - 1) + 3 : 0;
  drawText(ctx, name, x + bw, y, color);
  return bw + textWidth(name);
}
function badgeNameW(n: number, name: string) { return (n ? badgeW(n) + 3 : 0) + textWidth(name); }

/** Street label: just the number above the head (ten names would pile up), NPCs get a grey NPC chip. */
function headBadge(p: PubPlayer, x: number, lane: number) {
  const y = lane - 26;
  if (p.npc) { const w = textWidth('NPC') + 4; rect(ctx, Math.round(x - w / 2), y, w, 9, C.INK); drawText(ctx, 'NPC', Math.round(x - w / 2) + 2, y + 1, C.STONE); return; }
  badge(p.tag, Math.round(x - badgeW(p.tag) / 2), y);
}

function liveTag(text: string, x: number, lane: number, color: string, plate: string = C.INK, suffix?: [string, string], tag = 0) {
  const bw = tag ? badgeW(tag) + 2 : 0;
  const w = bw + textWidth(text) + 4 + (suffix ? textWidth(suffix[0]) + 6 : 0);
  let tx = Math.round(x + 9);
  if (tx + w > L.ROPE_X - 2) tx = Math.round(x - 9 - w);
  const ty = lane - 13;
  rect(ctx, tx, ty, w, 9, plate);
  if (tag) badge(tag, tx, ty);
  drawText(ctx, text, tx + bw + 2, ty + 1, color);
  if (suffix) drawText(ctx, suffix[0], tx + bw + 4 + textWidth(text) + 4, ty + 1, suffix[1]);
}

function drawLiveScreen(dt: number) {
  codeBox.style.display = denied ? 'flex' : 'none';
  if (denied) { drawDenied(); return; }
  soundDirector(snap);
  scr.fitFixed(host);
  rect(ctx, 0, 0, L.W, L.H, C.INK); // clear: no flash or shake residue in the gaps
  const s = snap;
  const sx = shake > 0 ? (Math.floor(t * 40) % 2 ? 2 : -2) : 0;
  shake = Math.max(0, shake - dt);
  pointT = Math.max(0, pointT - dt);
  ctx.save();
  ctx.translate(sx, 0);

  const players = s?.players ?? [];
  const phase = s?.phase ?? 'lobby';
  const rule = phase === 'play' ? s?.rule ?? null : null;
  const lounge = players.filter((p) => p.state === 'lounge').sort((a, b) => a.entryOrder - b.entryOrder);
  const entering = players.some((p) => (lp.get(p.id)?.enterT ?? -1) >= 0);
  const disco = rule === 'disco';
  drawStreet(ctx, t, { lounge: lounge.length ? 1 : 0, disco });
  drawCat(ctx, t);

  // disco beat: 8th notes at 120 bpm while the rule is live
  // (Disco Mode props the club door ajar: see soundDirector)

  let gus: GusPose = 'back';
  if (phase === 'lobby') gus = 'watch';
  else if (phase === 'play') gus = pointT > 0 ? 'point' : s!.gus === 'sleep' ? 'sleep' : s!.gus === 'back' && disco ? 'dance' : s!.gus;
  else if (phase === 'push') gus = 'point';
  else if (phase === 'vote') gus = s!.ropeSnapped ? 'sleep' : 'watch';
  else gus = s?.reveal?.winnerName ? 'flattered' : 'dance';
  if (phase === 'play' && s!.gus === 'watch') drawSightline(ctx, t);

  // bodies on the street, back lanes first
  const order = players.map((p, i) => ({ p, i, lane: liveLane(i) })).sort((a, b) => a.lane - b.lane);
  const moon = rule === 'moonwalk';
  stareN = 0; bananaN = 0;
  for (const { p, i, lane } of order) {
    const v = vis(p);
    if (phase === 'lobby') {
      v.x = L.START_X + 4 + (i % 3) * 22 + Math.floor(i / 3) * 8;
      if (t - v.seenAt < 0.3) blit(ctx, icon.puff(), v.x - 4, lane - 12);
      drawPlayer(ctx, v.look, Math.floor(t * 2 + i) % 5 === 0 ? 'cheer' : 'stand', v.x, lane);
      headBadge(p, v.x, lane);
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
    // banana in flight, then a short slip
    let slipping = false;
    if (v.bananaT >= 0) {
      v.bananaT += dt;
      const u = Math.min(1, v.bananaT / 0.6);
      const bx = L.GUS_X - 6 + (v.x - 4 - (L.GUS_X - 6)) * u;
      const by = 56 + (lane - 14 - 56) * u - Math.round(Math.sin(u * Math.PI) * 30);
      if (bananaN < flyers.length) { const f = flyers[bananaN++]; f.x = Math.round(bx); f.y = by; }
      if (u >= 1) { v.bananaT = -1; v.slipT = 0; sfx.fling(); }
    }
    if (v.slipT >= 0) { v.slipT += dt; slipping = v.slipT < 0.8; if (!slipping) v.slipT = -1; }
    if (p.caught) {
      spotlight({ x: v.x, lane } as P, C.ALERT);
      drawPlayer(ctx, v.look, Math.floor(t * 8) % 2 ? 'cheer' : 'caught', v.x, lane);
      liveTag(p.name, v.x, lane, C.PAPER, C.ALERT, ['CAUGHT', C.INK], p.tag);
      if (stareN < STARE_MAX) {
        const e = stare[stareN++];
        e.name = p.name; e.x = v.x; e.lane = lane; e.micro = p.micro; e.score = p.microScore; e.left = p.microLeft;
      }
      continue;
    }
    const tagColor = p.npc ? C.STONE_HI : p.moving ? C.SAFE : C.PAPER;
    if (p.nerd || slipping) {
      drawPlayer(ctx, v.look, 'caught', v.x, lane);
      if (p.nerd && Math.floor(t * 8) % 2) {
        const bx = Math.round(v.x);
        rect(ctx, bx - 11, lane - 20, 22, 1, C.ALERT); rect(ctx, bx - 11, lane + 2, 22, 1, C.ALERT);
        rect(ctx, bx - 11, lane - 20, 1, 23, C.ALERT); rect(ctx, bx + 10, lane - 20, 1, 23, C.ALERT);
      }
      if (slipping && !p.npc) liveTag(p.name, v.x, lane, C.PAPER, C.ALERT, ['TRIPPED', C.LAMP], p.tag);
      else liveTag(p.name, v.x, lane, p.nerd ? C.ALERT : tagColor, C.INK, p.npc ? ['NPC', C.STONE] : undefined, p.tag);
      continue;
    }
    let fr: PlayerFrame = 'freeze';
    if (phase === 'push') fr = Math.floor(t * 10 + i) % 2 ? 'cheer' : 'stand';
    else if (p.moving) fr = moon ? (Math.floor(t * 6) % 2 ? 'stepA' : 'stepB') : (Math.floor(t * 8 + i) % 2 ? 'sneakA' : 'sneakB');
    drawPlayer(ctx, v.look, fr, v.x + (phase === 'push' ? (Math.floor(t * 12) % 2) : 0), lane, moon && p.moving);
    headBadge(p, v.x, lane);
    void tagColor;
  }

  drawGus(ctx, gus, t);
  drawGlasses(rule, gus);
  drawRope(ctx, t, entering || !!s?.ropeSnapped && phase !== 'lobby');

  // Lights Out: dark street, Gus's beam shows the way (and turns red when he is watching)
  if (rule === 'lights') {
    drawDarkness(ctx, t, toPx(s!.beam ?? 0.5), T.BEAM_HALF * (L.ROPE_X - 10 - L.START_X), s!.gus === 'watch');
    drawGus(ctx, gus, t);
    drawGlasses(rule, gus);
  }

  // ---------- overlays ----------
  for (let k = 0; k < stareN; k++) layoutStare(k);
  for (let k = 0; k < stareN; k++) drawStare(k);
  for (let k = 0; k < bananaN; k++) blit(ctx, BANANA, flyers[k].x, flyers[k].y, Math.floor(t * 8) % 2 === 0);
  if (phase === 'lobby') liveLobbyPanel(players);
  else if (phase !== 'reveal') {
    liveVipPanel(lounge, s!);
    liveClock(s!);
  }
  const calloutUp = !!callout && t < callout.until && phase === 'play';
  if (phase === 'play' && moon && !calloutUp && (!bannerMsg || t > bannerMsg.until) && Math.floor(t * 2) % 2) drawTextOutlined(ctx, '<< RELEASE TO MOVE >>', 112, 70, C.NEON, C.INK);
  if (phase === 'push') livePushMeter(s!);
  if (phase === 'vote') liveVotePanel(s!);
  // under a rule banner (y 30..66) the callout drops below it; it never covers Gus or his "!"
  if (calloutUp) drawCallout(!!bannerMsg && t < bannerMsg.until ? 70 : 60);
  if (gusText && t < gusText.until && phase !== 'reveal') {
    const x = Math.max(2, Math.min(L.W - 2 - textWidth(gusText.text), Math.round(L.GUS_X - textWidth(gusText.text) / 2)));
    drawTextOutlined(ctx, gusText.text, x, L.GUS_FEET - 51, gusText.color, C.INK);
  }
  if (bannerMsg && t < bannerMsg.until && phase !== 'reveal') banner(bannerMsg.text, bannerMsg.sub, bannerMsg.fill, C.INK, phase === 'push' ? 44 : 30);
  if (phase === 'reveal') liveReveal(s!);
  let tagY = L.TEXT_Y - 9;
  if (s?.ai === 'scripted') { const w = textWidth('SCRIPTED') + 4; rect(ctx, L.W - 2 - w, tagY, w, 9, C.INK); drawText(ctx, 'SCRIPTED', L.W - w, tagY + 1, C.STONE); tagY -= 10; }
  if (!netUp) { rect(ctx, L.W - 70, tagY, 68, 10, C.ALERT); drawText(ctx, 'NO SERVER', L.W - 66, tagY + 1, C.PAPER); }
  if (muted) { const w = textWidth('MUTED') + 4; rect(ctx, 2, L.TEXT_Y - 9, w, 9, C.INK); drawText(ctx, 'MUTED', 4, L.TEXT_Y - 8, C.STONE_HI); }

  ctx.restore();

  // Gus's text box (long lines page through two rows at a time) + the Bouncer Brain HUD
  const hudOn = (phase === 'play' || phase === 'push') && !!s;
  const boxW = hudOn ? L.W - 4 - 66 : L.W - 4;
  const cols = Math.floor((boxW - 14) / 6);
  const rows = wrap(line, cols);
  const pages = Math.max(1, Math.ceil(rows.length / 2));
  if (page >= pages) page = pages - 1;
  const text = rows.slice(page * 2, page * 2 + 2).join(' ');
  const prev = Math.floor(pageShown);
  pageShown = Math.min(text.length, pageShown + dt * 30);
  if (Math.floor(pageShown) !== prev && Math.floor(pageShown) % 2 === 0 && text[Math.floor(pageShown)] !== ' ') sfx.blip(true);
  if (pageShown >= text.length && page < pages - 1) {
    pageWait += dt;
    if (pageWait > 1.6) { page++; pageShown = 0; pageWait = 0; }
  }
  textBox(ctx, 2, L.TEXT_Y + 1, boxW, 33, text, pageShown, t, lineWho, page < pages - 1);
  if (hudOn) liveHud(s!.hud);
  if (flash > 0) { dither(ctx, 0, 0, L.W, L.H, flashColor, Math.floor(t * 30)); flash -= dt; }
}

function drawGlasses(rule: string | null, pose: GusPose) {
  if (rule !== 'glasses') return;
  const x = L.GUS_X - 12, y = L.GUS_FEET - 28;
  if (pose === 'watch' || pose === 'point') {
    rect(ctx, x + 6, y + 3, 12, 1, C.NEON); rect(ctx, x + 6, y + 5, 12, 1, C.NEON);
    rect(ctx, x + 5, y + 4, 1, 1, C.NEON); rect(ctx, x + 18, y + 4, 1, 1, C.NEON);
  } else if (pose === 'tell') {
    rect(ctx, x + 6, y + 5, 4, 1, C.NEON); rect(ctx, x + 5, y + 5, 1, 1, C.NEON);
  }
}

function liveHud(h: Snapshot['hud']) {
  const x = 256, y = L.TEXT_Y + 1, w = 62, hh = 33;
  rect(ctx, x + 2, y + hh, w - 2, 2, C.NIGHT); rect(ctx, x + w, y + 2, 2, hh, C.NIGHT);
  rect(ctx, x, y, w, hh, C.PAPER);
  rect(ctx, x + 1, y + 1, w - 2, hh - 2, C.NIGHT);
  const cells: [string, number, string][] = [['EGO', h.ego, C.LAMP], ['PAR', h.paranoia, C.ALERT], ['BOR', h.boredom, C.STONE_HI], ['SUS', h.suspicion, C.NEON]];
  for (let k = 0; k < 4; k++) {
    const cx = x + 4 + (k % 2) * 29, cy = y + 3 + Math.floor(k / 2) * 15;
    drawText(ctx, cells[k][0], cx, cy, C.STONE_HI);
    meter(ctx, cx, cy + 8, 26, 5, cells[k][1], cells[k][2]);
  }
}

/** Up to 3 stare-down insets, spread so they never overlap and always stay on screen. */
function layoutStare(k: number) {
  const e = stare[k];
  let x = Math.round(e.x - STARE_W / 2);
  if (k > 0) {
    // insets are drawn left-to-right in arrival order; push right of the previous one
    x = Math.max(x, stare[k - 1].bx + STARE_W + 3);
  }
  e.bx = x;
  if (k === stareN - 1) {
    // fit into the screen: clamp the last one and pull the others left as needed
    let right = L.W - 6;
    for (let j = stareN - 1; j >= 0; j--) {
      const s2 = stare[j];
      s2.bx = Math.min(s2.bx, right - STARE_W);
      right = s2.bx - 3;
    }
    if (stare[0].bx < 4) { let nx = 4; for (let j = 0; j < stareN; j++) { stare[j].bx = Math.max(stare[j].bx, nx); nx = stare[j].bx + STARE_W + 3; } }
  }
}

function drawStare(k: number) {
  const e = stare[k];
  const x = e.bx, y = 44, w = STARE_W;
  const value = e.score, safe = value >= 1;
  frame(ctx, x, y, w, STARE_H);
  nameTab(ctx, 'STARE-DOWN', x + 6, y, C.ALERT, C.PAPER);
  ctx.drawImage(gusSprite('watch', C.ALERT), 0, 0, 24, 9, x + 4, y + 7, 48, 18);
  drawText(ctx, `${e.name.slice(0, 7)}:`, x + 52, y + 9, C.INK);
  drawText(ctx, e.micro === 'shake' ? 'DANCE!' : 'BRIBE!', x + 52, y + 19, C.ALERT);
  meter(ctx, x + 7, y + 30, 66, 9, value, safe ? C.SAFE : value > 0.6 ? C.SAFE : C.LAMP, 8);
  drawText(ctx, `${Math.max(0, Math.ceil(e.left))}`, x + 80, y + 31, C.INK, 1);
  if (safe) drawText(ctx, 'SAFE', x + 7, y + 41, C.SAFE);
  else drawText(ctx, 'NERVE', x + 7, y + 41, C.STONE);
  // dotted pointer down to the player
  const px = Math.max(x + 6, Math.min(x + w - 6, Math.round(e.x)));
  for (let yy = y + STARE_H + 3; yy < e.lane - 22; yy += 3) rect(ctx, px, yy, 1, 1, C.ALERT);
}

function liveLobbyPanel(players: PubPlayer[]) {
  // QR on the right (Gus waits behind it until the doors open), the full line-up on the left
  const m = 2;
  const size = (qr.size + 4) * m;
  const w = Math.max(116, size + 12), x0 = L.W - w - 4, y0 = 4;
  const h = 4 + size + 3 + 9 + 3 + 16 + 7;
  frame(ctx, x0, y0, w, h);
  drawQR(x0 + Math.round((w - size) / 2) + 2 * m, y0 + 4 + 2 * m, m);
  drawTextCentered(ctx, 'SCAN TO GET IN LINE', x0 + w / 2, y0 + 4 + size + 3, C.INK);
  if (roomCode) drawTextCentered(ctx, `ROOM ${roomCode}`, x0 + w / 2, y0 + 4 + size + 15, C.VELVET, 2);
  else drawTextCentered(ctx, 'CONNECTING...', x0 + w / 2, y0 + 4 + size + 18, C.STONE);
  const humans = players.filter((p) => !p.npc);
  const n = humans.length;
  const rows = Math.max(1, Math.min(5, Math.ceil(n / 2)));
  const cols = n > 5 ? 2 : 1;
  const perCol = cols === 2 ? Math.ceil(n / 2) : n;
  const pw = cols === 2 ? 2 * 92 + 8 : 100;
  const ph = 24 + Math.max(1, cols === 2 ? perCol : rows) * 10 + 2;
  frame(ctx, 4, 4, pw, ph, C.NIGHT, C.SAFE);
  drawText(ctx, 'IN LINE', 11, 9, C.SAFE);
  drawText(ctx, `${String(n).padStart(3, '0')} ${n === 1 ? 'PERSON' : 'PEOPLE'}`, 56, 9, C.PAPER);
  humans.slice(0, 12).forEach((p, i) => {
    const col = cols === 2 ? Math.floor(i / perCol) : 0, row = cols === 2 ? i % perCol : i;
    badgeName(p.tag, p.name, 10 + col * 94, 22 + row * 10, C.PAPER);
  });
  if (n > 0 && Math.floor(t * 2) % 2) drawTextOutlined(ctx, canControl ? 'HOST: PRESS S TO START' : 'HOST: START ON THE DASHBOARD', 8, 4 + ph + 4, C.LAMP, C.INK);
}

function liveVipPanel(lounge: PubPlayer[], s: Snapshot) {
  // the owner by name; everyone else in the lounge as their number (ten names would cover the street)
  const owner = lounge.find((p) => p.id === s.ownerId);
  const rest = lounge.filter((p) => p !== owner);
  const perRow = 6;
  const chipRows = Math.ceil(rest.length / perRow);
  const h = 18 + (owner || !lounge.length ? 10 : 0) + chipRows * 11 + (s.rule ? 20 : 0);
  const w = Math.max(90, owner ? badgeNameW(owner.tag, owner.name) + 22 : 0);
  frame(ctx, 4, 4, w, h, C.NIGHT, C.LAMP);
  drawText(ctx, 'VIP LIST', 11, 9, C.LAMP);
  if (lounge.length) drawText(ctx, `${lounge.length}`, w - 4 - textWidth(`${lounge.length}`), 9, C.STONE_HI);
  let y = 19;
  if (!lounge.length) { drawText(ctx, 'NOBODY YET', 11, y, C.STONE_HI); y += 10; }
  if (owner) {
    blit(ctx, sprite('crown1', CROWN_ICON, { k: C.INK, y: C.LAMP, w: C.PAPER }), 9, y);
    badgeName(owner.tag, owner.name, 19, y, C.LAMP);
    y += 10;
  }
  rest.forEach((p, i) => badge(p.tag, 10 + (i % perRow) * 13, y + Math.floor(i / perRow) * 11));
  y += chipRows * 11;
  if (s.rule) {
    drawText(ctx, 'RULE:', 10, y + 1, C.STONE_HI);
    drawText(ctx, RULES[s.rule].name, 10, y + 10, C.NEON);
  }
}

/** Who used which Lounge power on whom. Sits on the sidewalk, left of Gus, so his "!" stays visible. */
function drawCallout(y: number) {
  const c = callout!;
  const fill = c.power === 'banana' ? C.ALERT : c.power === 'distract' ? C.SAFE : C.VELVET;
  const ink = c.power === 'distract' ? C.INK : C.PAPER;
  const verb = c.power === 'banana' ? (c.target ? ' TRIPPED ' : ' MISSED') : c.power === 'distract' ? ' DISTRACTED GUS' : ' SNITCHED TO GUS';
  const line2 = c.power === 'banana' ? (c.target ? 'BACK A FEW STEPS' : 'NOBODY TO TRIP') : c.power === 'distract' ? '+1S FOR THE RUNNERS' : 'HIS NEXT LOOK LASTS +1S';
  const w1 = badgeNameW(c.byTag, c.by) + textWidth(verb) + (c.power === 'banana' && c.target ? badgeNameW(c.targetTag, c.target) : 0);
  const w = Math.max(w1, textWidth(line2)) + 22;
  const x = Math.max(4, Math.min(L.GUS_X - 20 - w, Math.round(130 - w / 2)));
  rect(ctx, x + 2, y + 2, w, 22, C.INK);
  rect(ctx, x, y, w, 22, C.INK);
  rect(ctx, x + 1, y + 1, w - 2, 20, fill);
  if (c.power === 'banana') blit(ctx, BANANA, x + 4, y + 7);
  else blit(ctx, c.power === 'distract' ? icon.note(C.INK) : icon.bang(C.PAPER), x + 4, y + 7);
  let cx = x + 16;
  rect(ctx, x + 15, y + 2, w - 17, 10, C.INK);
  cx += badgeName(c.byTag, c.by, cx, y + 3, C.PAPER);
  drawText(ctx, verb, cx, y + 3, C.LAMP);
  cx += textWidth(verb);
  if (c.power === 'banana' && c.target) badgeName(c.targetTag, c.target, cx, y + 3, C.PAPER);
  drawText(ctx, line2, x + 16, y + 13, ink);
}

function liveClock(s: Snapshot) {
  const label = s.phase === 'play' ? 'LAST CALL' : s.phase === 'push' ? 'ROPE' : 'VOTE';
  const left = s.phase === 'play' ? s.timeLeft - (T.PUSH + T.VOTE) : s.phase === 'push' ? s.timeLeft - T.VOTE : s.timeLeft;
  frame(ctx, L.W - 70, 2, 66, 25, C.NIGHT, left <= 5 ? C.ALERT : C.PAPER);
  drawText(ctx, label, L.W - 64, 7, C.STONE_HI);
  drawText(ctx, `${Math.max(0, Math.ceil(left))}S`, L.W - 64, 15, left <= 5 ? C.ALERT : C.PAPER);
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
  const owner = s.players.find((p) => p.id === s.ownerId);
  const w = 148, x = 98, y = 4;
  frame(ctx, x, y, w, 70, C.PAPER, C.INK);
  nameTab(ctx, s.allIn ? "EVERYONE'S IN: VOTE" : 'COUP VOTE', x + 6, y, C.VELVET, C.PAPER);
  const ownW = badgeName(owner?.tag ?? 0, s.ownerName ?? '?', x + 8, y + 10, C.INK);
  drawText(ctx, "'S CROWN", x + 8 + ownW, y + 10, C.INK);
  if (v.eligible === 0) {
    drawText(ctx, 'NOBODY CAN VOTE.', x + 8, y + 24, C.STONE);
    drawText(ctx, 'THE CROWN IS SAFE.', x + 8, y + 33, C.STONE);
    return;
  }
  meter(ctx, x + 8, y + 21, w - 16, 9, Math.min(1, v.cast / v.needed), v.cast >= v.needed ? C.SAFE : C.NEON, v.needed);
  drawText(ctx, `CROWN ${v.cast} OF ${v.needed}`, x + 8, y + 33, v.cast >= v.needed ? C.SAFE : C.INK);
  const keep = `KEEP ${v.kept}`;
  drawText(ctx, keep, x + w - 8 - textWidth(keep), y + 33, C.STONE);
  if (v.successorName) {
    drawText(ctx, 'IF IT PASSES:', x + 8, y + 45, C.STONE);
    badgeName(v.successorTag, v.successorName, x + 8, y + 56, C.VELVET);
  } else drawText(ctx, `${v.eligible} CAN VOTE`, x + 8, y + 45, C.STONE);
}

function liveReveal(s: Snapshot) {
  const r = s.reveal;
  dither(ctx, 0, 0, L.W, L.TEXT_Y, C.INK);
  const w = 288, x = (L.W - w) / 2, y = 2;
  frame(ctx, x, y, w, 140);
  const crown = sprite('crown1', CROWN_ICON, { k: C.INK, y: C.LAMP, w: C.PAPER });
  const voteLine = r?.vote ? `CROWN ${r.vote.cast} OF ${r.vote.needed} NEEDED  KEEP ${r.vote.kept}` : r?.allIn ? 'EVERYONE GOT IN' : r?.ropeSnapped ? 'THE ROPE SNAPPED' : 'NOBODY COULD VOTE';
  // 1) the crown first: who took it from whom (or kept it), and the vote that did it
  if (revealAt < 0 || t - revealAt < 4.5) {
    drawTextCentered(ctx, "TONIGHT'S VIP", L.W / 2, y + 8, C.VELVET, 2);
    if (r?.winnerId && r.winnerName) {
      const v = lp.get(r.winnerId);
      const nw = textWidth(r.winnerName, 2) + (r.winnerTag ? badgeW(r.winnerTag) + 4 : 0);
      const nx = Math.round(L.W / 2 - nw / 2);
      blit(ctx, sprite('crown2', CROWN_ICON, { k: C.INK, y: C.LAMP, w: C.PAPER }), nx - 22, y + 32, false, 2);
      if (r.winnerTag) badge(r.winnerTag, nx, y + 35);
      drawText(ctx, r.winnerName, nx + (r.winnerTag ? badgeW(r.winnerTag) + 4 : 0), y + 34, C.INK, 2);
      if (v) drawPlayer(ctx, v.look, Math.floor(t * 4) % 2 ? 'cheer' : 'stand', nx + nw + 14, y + 52);
      if (r.prevOwnerName) {
        const lw = textWidth('TOOK THE CROWN FROM ') + badgeNameW(r.prevOwnerTag, r.prevOwnerName);
        const lx = Math.round(L.W / 2 - lw / 2);
        drawText(ctx, 'TOOK THE CROWN FROM ', lx, y + 64, C.ALERT);
        badgeName(r.prevOwnerTag, r.prevOwnerName, lx + textWidth('TOOK THE CROWN FROM '), y + 64, C.ALERT);
      } else drawTextCentered(ctx, r.ropeSnapped ? 'KEPT THE CROWN THROUGH THE RUSH' : 'KEPT THE CROWN', L.W / 2, y + 64, C.STONE);
    } else drawTextCentered(ctx, 'NOBODY. GUS WINS.', L.W / 2, y + 34, C.INK, 2);
    drawTextCentered(ctx, voteLine, L.W / 2, y + 80, C.INK);
    if (r?.vote) drawTextCentered(ctx, `${r.vote.eligible} COULD VOTE: STRICT MAJORITY`, L.W / 2, y + 90, C.STONE);
    drawTextCentered(ctx, 'SCORES NEXT...', L.W / 2, y + 120, Math.floor(t * 2) % 2 ? C.STONE : C.VELVET);
    return;
  }
  // 2) then scores and ranks (crown holder first), with everyone's number
  if (r?.winnerName) {
    blit(ctx, crown, x + 8, y + 5);
    const vw = badgeName(r.winnerTag, r.winnerName, x + 19, y + 5, C.VELVET);
    if (r.prevOwnerName) {
      drawText(ctx, ' TOOK IT FROM ', x + 19 + vw, y + 5, C.STONE);
      badgeName(r.prevOwnerTag, r.prevOwnerName, x + 19 + vw + textWidth(' TOOK IT FROM '), y + 5, C.INK);
    } else drawText(ctx, ' KEPT THE CROWN', x + 19 + vw, y + 5, C.STONE);
  } else drawText(ctx, 'NOBODY GOT THE CROWN', x + 10, y + 5, C.STONE);
  drawText(ctx, voteLine, x + 10, y + 16, C.STONE);
  rect(ctx, x + 8, y + 26, w - 16, 1, C.INK);
  drawText(ctx, 'RANKING: CROWN FIRST', x + 10, y + 30, C.STONE);
  (r?.ranking ?? []).slice(0, 10).forEach((row, i) => {
    const yy = y + 40 + i * 9;
    const c = i === 0 ? C.VELVET : C.INK;
    drawText(ctx, `#${i + 1}`, x + 10, yy, c);
    const nw = badgeName(row.tag, row.name, x + 28, yy, c);
    if (r?.winnerId === row.id) blit(ctx, crown, x + 30 + nw, yy);
    const sc = `${row.score}`;
    drawText(ctx, sc, x + 150 - textWidth(sc), yy, c);
  });
  drawText(ctx, 'AWARDS', x + 160, y + 30, C.STONE);
  (r?.awards ?? []).forEach((a, i) => {
    const yy = y + 40 + i * 19;
    drawText(ctx, a.label, x + 160, yy, C.STONE);
    drawText(ctx, a.value ? `${a.name} ${a.value}` : a.name, x + 160, yy + 9, C.INK);
  });
  if (Math.floor(t) % 2) drawTextCentered(ctx, 'MUGSHOTS SENT TO YOUR PHONES', L.W / 2 + 70, y + 128, C.VELVET);
  else drawTextCentered(ctx, 'HOST: R FOR A NEW NIGHT', L.W / 2 + 70, y + 128, C.STONE);
}

const CROWN_ICON = ['k..kk..k', 'kk.kk.kk', 'kykyykyk', 'kyyyyyyk', 'kyyyyyyk', 'kkkkkkkk', '........', '........'];

addEventListener('keydown', (e) => {
  if (!LIVE || !net) return;
  const k = e.key.toLowerCase();
  const canStart = canControl && k === 's' && (!snap || snap.phase === 'lobby' || snap.phase === 'reveal');
  if (k === 's') keyLog.push({ key: k, phase: snap?.phase ?? null, startSent: canStart, focus: describeFocus() });
  if (canStart) net.send({ t: 'start' });
  if (k === 'm') panel?.setMute(!muted);
  if (k === 'r' && canControl) { net.send({ t: 'reset' }); lp.clear(); }
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
addEventListener('pointerdown', () => { unlock(); if (LIVE) wakeAudio(); });
addEventListener('keydown', () => { unlock(); if (LIVE) wakeAudio(); });
const panel = LIVE ? mountPanel({
  inLobby: () => !snap || snap.phase === 'lobby' || snap.phase === 'reveal',
  showTurnTest: () => { showBanner('TURN ALERT TEST', 'GUS IS TURNING AROUND', C.ALERT, 1.8); gusText = { text: '!', color: C.ALERT, until: t + 1.5 }; },
  onMuteChange: (m) => setMute(m),
}) : null;
void startClub; void loadAudition;
addEventListener('resize', () => scr.fitFixed(host));
if (!LIVE) enter(params.get('state') as S || 'auto');
requestAnimationFrame(loop);
