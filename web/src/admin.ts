import QRCode from 'qrcode';
import { connect } from './net';
import { T } from '../../shared/protocol';
import type { AdminState, Settings } from '../../shared/protocol';

const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
const clean = (s: string | null) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

let room = clean(new URLSearchParams(location.search).get('room'));
let st: AdminState | null = null;
// The dashboard unlocks one room with that room's password. The unlock lasts while this page is
// open (it survives a dropped connection); reloading the page asks for the password again.
let token = '';
let authed = false;
let roomExists = false;
type View = 'landing' | 'create' | 'return' | 'room';
function view(v: View) {
  for (const id of ['landing', 'create', 'return'] as const) $(id).classList.toggle('hide', v !== id);
  $('roomui').classList.toggle('hide', v !== 'room');
  if (v === 'return') {
    const known = !!room && roomExists;
    $('welcome').textContent = known ? `Welcome back to ${room}` : 'Return to my game';
    $('coderow').classList.toggle('hide', known);
    if (room && !($('retcode') as HTMLInputElement).value) ($('retcode') as HTMLInputElement).value = room;
    setTimeout(() => ($(known ? 'retpw' : 'retcode') as HTMLInputElement).focus(), 0);
  }
  if (v === 'create') setTimeout(() => ($('newpw') as HTMLInputElement).focus(), 0);
}
function setUrlRoom(code: string) {
  const u = new URL(location.href);
  if (code) u.searchParams.set('room', code); else u.searchParams.delete('room');
  history.replaceState(null, '', u);
}

const net = connect(
  () => ({ t: 'hello', role: 'admin', room: room || undefined, token: token || undefined }),
  (m) => {
    if (m.t === 'auth') {
      if (m.ok && m.token && m.code) {
        token = m.token; authed = true; room = m.code; setUrlRoom(room);
        for (const id of ['newpw', 'retpw']) ($(id) as HTMLInputElement).value = '';
        $('createerr').textContent = ''; $('returnerr').textContent = '';
      } else if (!m.ok) {
        authed = false; st = null;
        if (m.code !== undefined) roomExists = !!m.exists;
        const err = m.error ? `${m.error}${m.retryIn ? `: try again in ${m.retryIn} s` : ''}` : '';
        if (!$('create').classList.contains('hide')) { $('createerr').textContent = err; return; }
        $('returnerr').textContent = err;
        // a room code in the URL goes straight to "Welcome back"; otherwise the two choices
        if (err || (room && $('return').classList.contains('hide'))) view(room || err ? 'return' : 'landing');
        else if (!room) view('landing');
      }
      return;
    }
    if (m.t === 'admin') { authed = true; st = m; render(m); }
  },
  (up) => {
    const c = $('conn');
    c.textContent = up ? 'CONNECTED' : 'RECONNECTING…';
    c.classList.toggle('down', !up);
  },
);

/** Switch the dashboard to another room code (it then asks for that room's password). */
export function pickRoom(code: string) {
  room = clean(code);
  setUrlRoom(room);
  token = ''; authed = false; st = null;
  net.send({ t: 'hello', role: 'admin', room: room || undefined });
}

$('goCreate').addEventListener('click', () => view('create'));
$('goReturn').addEventListener('click', () => { room = ''; roomExists = false; view('return'); });
document.querySelectorAll<HTMLButtonElement>('button.back').forEach((b) => b.addEventListener('click', () => { room = ''; setUrlRoom(''); view('landing'); }));
document.querySelectorAll<HTMLButtonElement>('button.showpw').forEach((b) => b.addEventListener('click', () => {
  const i = $(b.dataset.for!) as HTMLInputElement;
  i.type = i.type === 'password' ? 'text' : 'password';
  b.textContent = i.type === 'password' ? 'Show' : 'Hide';
}));
$('createform').addEventListener('submit', (e) => {
  e.preventDefault();
  const pw = ($('newpw') as HTMLInputElement).value;
  if (!pw.trim()) { $('createerr').textContent = 'Choose a password first.'; return; }
  net.send({ t: 'create', password: pw });
});
$('returnform').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = room && roomExists ? room : clean(($('retcode') as HTMLInputElement).value);
  const pw = ($('retpw') as HTMLInputElement).value;
  if (!code || !pw) { $('returnerr').textContent = 'Enter the room code and its password.'; return; }
  room = code;
  net.send({ t: 'unlock', room: code, password: pw });
});
$('leave').addEventListener('click', () => { token = ''; authed = false; st = null; view(room ? 'return' : 'landing'); net.send({ t: 'hello', role: 'admin', room: room || undefined }); });

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const running = (p: string) => p === 'play' || p === 'push' || p === 'vote';
const set = (s: Partial<Settings>) => net.send({ t: 'settings', settings: s });
const diffName = (d: number) => (d < 0.8 ? 'EASY' : d < 1.0 ? 'GENTLE' : d < 1.2 ? 'NORMAL' : d < 1.35 ? 'HARD' : 'BRUTAL');

// round-length radios (static)
for (const n of T.ROUND_CHOICES) {
  const l = document.createElement('label');
  l.className = 'opt';
  l.innerHTML = `<input type="radio" name="len" value="${n}" /> ${n} s`;
  l.querySelector('input')!.addEventListener('change', () => set({ roundSecs: n }));
  $('lens').appendChild(l);
}
const diff = $<HTMLInputElement>('diff');
diff.addEventListener('input', () => { $('difflabel').textContent = `${diffName(+diff.value)} ${(+diff.value).toFixed(1)}`; });
diff.addEventListener('change', () => set({ difficulty: +diff.value }));
$<HTMLInputElement>('npcs').addEventListener('change', (e) => set({ npcs: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('ai').addEventListener('change', (e) => set({ ai: (e.target as HTMLInputElement).checked }));
$('start').addEventListener('click', () => net.send({ t: 'start' }));
$('reset').addEventListener('click', () => {
  if (!confirm(st?.room && running(st.room.phase) ? 'A round is running. Reset everyone to the lobby?' : 'Reset to the lobby?')) return;
  net.send({ t: 'reset' });
});
$('players').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button[data-kick]') as HTMLElement | null;
  if (!b) return;
  if (confirm(`Kick ${b.dataset.name}?`)) net.send({ t: 'kick', id: b.dataset.kick! });
});

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!); }
function active(el: Element) { return document.activeElement === el; }

let qrFor = '';
function render(s: AdminState) {
  if (!authed) return;
  // Claude panel
  const a = s.ai;
  $('nokey').classList.toggle('hide', a.keyPresent);
  const row = (k: string, v: string) => `<dt>${k}</dt><dd>${esc(v)}</dd>`;
  $('claude').innerHTML = [
    row('API key', a.keyPresent ? 'present' : 'MISSING'),
    row('model', a.model || '—'),
    row('lines enabled', a.enabled ? 'yes' : 'no (scripted)'),
    row('calls / ok / fallbacks', `${a.calls} / ${a.ok} / ${a.fallbacks}`),
    row('tokens in / out', `${a.inTokens} / ${a.outTokens}`),
    row('cost', `$${a.usd.toFixed(4)}`),
    row('latency p50 / p95', `${Math.round(a.p50ms)} / ${Math.round(a.p95ms)} ms`),
  ].join('');
  $('lasterr').textContent = a.lastError ? `LAST ERROR: ${a.lastError}` : '';

  const r = s.room;
  if (!r) { view('landing'); return; }
  view('room');

  $('rcode').textContent = r.code;
  $('phase').textContent = r.phase.toUpperCase();
  $('time').textContent = r.phase === 'lobby' ? '' : fmt(r.timeLeft);
  const between = r.phase === 'lobby' || r.phase === 'reveal';
  $<HTMLButtonElement>('start').disabled = !between;
  const origin = location.origin;
  // phones can't open "localhost": hand out the laptop's LAN address, like the projector QR does
  const phoneOrigin = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? __LAN_ORIGIN__ : origin;
  // projector and player links carry only the public code: control stays on this dashboard
  const ls = `${origin}/screen.html?room=${r.code}`;
  const lp = `${phoneOrigin}/play.html?room=${r.code}`;
  const as = $<HTMLAnchorElement>('openproj'); if (as.href !== ls) as.href = ls;
  const ap = $<HTMLAnchorElement>('lphone'); if (ap.href !== lp) { ap.href = lp; ap.textContent = lp; }
  if (qrFor !== lp) { qrFor = lp; void QRCode.toCanvas($<HTMLCanvasElement>('qr'), lp, { width: 132, margin: 0, errorCorrectionLevel: 'M' }); }
  const screens = s.rooms.find((x) => x.code === r.code)?.screens ?? 0;
  $('screens').textContent = screens ? `PROJECTOR CONNECTED (${screens})` : 'NO PROJECTOR YET';

  // settings (don't fight the user's hands)
  const cfg = r.settings;
  document.querySelectorAll<HTMLInputElement>('input[name=len]').forEach((i) => {
    i.checked = +i.value === cfg.roundSecs;
    i.disabled = !between;
  });
  $('lennote').classList.toggle('hide', between);
  if (!active(diff)) { diff.value = String(cfg.difficulty); $('difflabel').textContent = `${diffName(cfg.difficulty)} ${cfg.difficulty.toFixed(1)}`; }
  $<HTMLInputElement>('npcs').checked = cfg.npcs;
  $<HTMLInputElement>('ai').checked = cfg.ai;

  // players (keyed rows, updated in place so clicks are never lost to a rebuild)
  const tb = $('players');
  $('pcount').textContent = String(r.players.filter((p) => !p.npc).length);
  $('noplayers').classList.toggle('hide', r.players.length > 0);
  const seen = new Set<string>();
  for (const p of r.players) {
    seen.add(p.id);
    let tr = tb.querySelector<HTMLElement>(`tr[data-id="${CSS.escape(p.id)}"]`);
    if (!tr) {
      tr = document.createElement('tr');
      tr.dataset.id = p.id;
      tr.innerHTML = `<td><span class="dot"></span></td><td class="n"></td><td class="s"></td><td class="c"></td><td><div class="bar"><i></i></div></td><td class="k"></td>`;
      tb.appendChild(tr);
      if (!p.npc) {
        const b = document.createElement('button');
        b.className = 'warn'; b.textContent = 'KICK'; b.dataset.kick = p.id; b.dataset.name = p.name;
        tr.querySelector('.k')!.appendChild(b);
      }
    }
    tr.querySelector('.dot')!.classList.toggle('on', p.connected);
    tr.querySelector('.n')!.innerHTML = esc(p.name) + (p.npc ? ' <span class="tag">NPC</span>' : '');
    tr.querySelector('.s')!.textContent = p.state;
    tr.querySelector('.c')!.textContent = String(p.score);
    (tr.querySelector('.bar i') as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, p.x)) * 100)}%`;
    const kb = tr.querySelector<HTMLElement>('button');
    if (kb) kb.dataset.name = p.name;
  }
  tb.querySelectorAll<HTMLElement>('tr').forEach((tr) => { if (!seen.has(tr.dataset.id!)) tr.remove(); });
}
