// Player front door (index.html). Only this page uses this file.
// Backdrop: the existing Club Velvet street + Gus, cropped to the rope and door.
// Join: check the code with the room server first, so a wrong code stays here to be fixed.
import { C } from './pix/palette';
import { drawStreet, drawRope, drawGus } from './pix/scene';
import type { GusPose } from './pix/sprites';

// ---------- backdrop ----------
const CROP = { x: 92, y: 0, w: 224, h: 112 };
const art = document.getElementById('art') as HTMLCanvasElement;
const actx = art.getContext('2d')!;
art.width = CROP.w; art.height = CROP.h;
const street = document.createElement('canvas');
street.width = 320; street.height = 180;
const sctx = street.getContext('2d')!;
actx.imageSmoothingEnabled = false; sctx.imageSmoothingEnabled = false;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

function paint(t: number) {
  // Gus mostly faces the door, turns round for a beat every few seconds (the whole game in one loop).
  const k = t % 5;
  const pose: GusPose = still ? 'back' : k > 4.1 ? 'watch' : k > 3.7 ? 'tell' : 'back';
  sctx.fillStyle = C.NIGHT; sctx.fillRect(0, 0, 320, 180);
  drawStreet(sctx, t);
  drawGus(sctx, pose, t);
  drawRope(sctx, t);
  actx.drawImage(street, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
}
paint(0);
if (!still) {
  let last = 0;
  const loop = (ms: number) => {
    if (ms - last > 120) { last = ms; paint(ms / 1000); }   // ~8 fps: pixel-art pace, cheap on phones
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------- room code form ----------
const form = document.getElementById('join') as HTMLFormElement;
const input = document.getElementById('code') as HTMLInputElement;
const hint = document.getElementById('hint') as HTMLParagraphElement;
const btn = document.getElementById('go') as HTMLButtonElement;
const BTN = btn.textContent ?? 'Join room';
const KEY = 'club-velvet-last-code';
const HINT = hint.textContent ?? '';

/** Room codes are 4 letters. Takes "abcd", " AB-CD ", or a pasted play link. */
function clean(raw: string): string {
  const fromLink = raw.match(/[?&]room=([a-z]{4})/i);
  if (fromLink) return fromLink[1].toUpperCase();
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

function say(msg: string, bad = true) {
  hint.textContent = msg;
  hint.classList.toggle('bad', bad && !!msg);
  input.setAttribute('aria-invalid', bad && msg ? 'true' : 'false');
}

function busy(on: boolean) {
  btn.disabled = on;
  btn.textContent = on ? 'Checking…' : BTN;
}

input.addEventListener('input', () => {
  const raw = input.value;
  const v = clean(raw);
  if (v !== raw) {
    // Rewriting the value (lowercase -> caps) would throw the caret to the end; keep it where the player is fixing a letter.
    const at = Math.min(v.length, clean(raw.slice(0, input.selectionStart ?? raw.length)).length);
    input.value = v;
    input.setSelectionRange(at, at);
  }
  if (hint.textContent !== HINT) say(HINT, false);
});

// Keyboard up: iOS covers the page instead of shrinking it, so fold the backdrop away
// (.kb) whenever the visible area is much shorter than the page, and keep the button in view.
const vv = window.visualViewport;
function fitKeyboard() {
  if (!vv) return;
  const kb = vv.height < window.innerHeight - 120;
  if (kb !== document.body.classList.contains('kb')) document.body.classList.toggle('kb', kb);
  if (kb && document.activeElement === input) btn.scrollIntoView({ block: 'nearest' });
}
vv?.addEventListener('resize', fitKeyboard);
input.addEventListener('focus', () => setTimeout(fitKeyboard, 300));

/** Ask the room server whether the room exists. Uses a throwaway token, so it never joins anyone.
 *  Resolves true/false, or null when the server can't be asked (then play.html handles it). */
function roomExists(code: string): Promise<boolean | null> {
  return new Promise((resolve) => {
    let done = false;
    let ws: WebSocket;
    const finish = (v: boolean | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      resolve(v);
    };
    const timer = window.setTimeout(() => finish(null), 2500);
    try {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    } catch { finish(null); return; }
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', role: 'phone', token: `probe-${Math.random().toString(36).slice(2)}`, room: code }));
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m && typeof m === 'object' && 'role' in m) finish(m.role !== 'no-room');
      } catch { /* ignore */ }
    };
    ws.onerror = () => finish(null);
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = clean(input.value);
  input.value = code;
  if (code.length === 0) { say('Type the 4-letter code from the big screen.'); input.focus(); return; }
  if (code.length < 4) { say(`Room codes have 4 letters. ${4 - code.length} more.`); input.focus(); return; }
  sessionStorage.setItem(KEY, code);
  busy(true);
  const ok = await roomExists(code);
  if (ok === false) {
    busy(false);
    say(`No room ${code} right now. Check the big screen and try again.`);
    input.focus();
    input.select();
    return;
  }
  location.href = `play.html?room=${code}`;
});

// Arriving with a code (/?room=ABCD) or coming back with the browser's back button.
const pre = clean(new URLSearchParams(location.search).get('room') ?? '') || sessionStorage.getItem(KEY) || '';
if (pre) {
  input.value = pre;
  say('Check the letters against the big screen, then join.', false);
}
window.addEventListener('pageshow', () => busy(false));   // back-forward cache keeps the old "Checking…"
