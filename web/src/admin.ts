import { connect } from './net';
import { T } from '../../shared/protocol';
import type { AdminState, Settings } from '../../shared/protocol';

const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
const clean = (s: string | null) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

let room = clean(new URLSearchParams(location.search).get('room'));
let st: AdminState | null = null;

const net = connect(
  () => ({ t: 'hello', role: 'admin', room: room || undefined }),
  (m) => { if (m.t === 'admin') { st = m; render(m); } },
  (up) => {
    const c = $('conn');
    c.textContent = up ? 'CONNECTED' : 'RECONNECTING…';
    c.classList.toggle('down', !up);
  },
);

function pickRoom(code: string) {
  room = clean(code);
  const u = new URL(location.href);
  if (room) u.searchParams.set('room', room); else u.searchParams.delete('room');
  history.replaceState(null, '', u);
  st = st && { ...st, room: null };
  if (st) render(st);
  // the server lets an admin re-attach by sending hello again on the same socket
  net.send({ t: 'hello', role: 'admin', room: room || undefined });
}

$('codeform').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = clean(($('code') as HTMLInputElement).value);
  if (v) pickRoom(v);
});

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
  if (st?.room && running(st.room.phase) && !confirm('A round is running. Reset to lobby?')) return;
  net.send({ t: 'reset' });
});
$('players').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button[data-kick]') as HTMLElement | null;
  if (!b) return;
  if (confirm(`Kick ${b.dataset.name}?`)) net.send({ t: 'kick', id: b.dataset.kick! });
});

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!); }
function active(el: Element) { return document.activeElement === el; }

function render(s: AdminState) {
  // room list
  const rl = $('rooms');
  const key = s.rooms.map((r) => `${r.code}${r.phase}${r.humans}${r.screens}`).join('|') + '#' + room;
  if (rl.dataset.key !== key) {
    rl.dataset.key = key;
    rl.innerHTML = s.rooms.length ? '' : '<span class="dim">No open rooms.</span>';
    for (const r of s.rooms) {
      const b = document.createElement('button');
      if (r.code === room) b.className = 'sel';
      b.textContent = `${r.code} · ${r.phase} · ${r.humans}P · ${r.screens} screen${r.screens === 1 ? '' : 's'}`;
      b.onclick = () => pickRoom(r.code);
      rl.appendChild(b);
    }
  }

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
  $('roomui').classList.toggle('hide', !r);
  $('noroom').classList.toggle('hide', !!r);
  if (!r) return;

  $('rcode').textContent = r.code;
  $('phase').textContent = r.phase.toUpperCase();
  $('time').textContent = r.phase === 'lobby' ? '' : fmt(r.timeLeft);
  const between = r.phase === 'lobby' || r.phase === 'reveal';
  $<HTMLButtonElement>('start').disabled = !between;
  const origin = location.origin;
  // phones can't open "localhost": hand out the laptop's LAN address, like the projector QR does
  const phoneOrigin = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? __LAN_ORIGIN__ : origin;
  const ls = `${origin}/screen.html?room=${r.code}`;
  const lp = `${phoneOrigin}/play.html?room=${r.code}`;
  const as = $<HTMLAnchorElement>('lscreen'); if (as.href !== ls) { as.href = ls; as.textContent = ls; }
  const ap = $<HTMLAnchorElement>('lphone'); if (ap.href !== lp) { ap.href = lp; ap.textContent = lp; }

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
