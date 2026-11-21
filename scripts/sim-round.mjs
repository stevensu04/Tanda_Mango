// Four scripted phones + one projector socket play a full linked round against the dev server.
// Scenario: ANNA gets in first and picks MOONWALK, BEN and CLEO follow, DAVE stays outside
// (caught once, passes). At the vote BEN and CLEO back the coup, so ANNA loses the crown to BEN.
// Checks that the projector and every phone agree on the lobby, the rule, and the winner.
//
//   npm run dev            (in another terminal)
//   node scripts/sim-round.mjs [ws://localhost:5173/ws] [--allow-extra]
// --allow-extra: real phones may join the same round (to eyeball their screens); the bots still run the scenario.
import WebSocket from 'ws';

const args = process.argv.slice(2);
const URL = args.find((a) => !a.startsWith('--')) || 'ws://localhost:5173/ws';
const EXTRA = args.includes('--allow-extra');
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const log = (...a) => console.log(`[${now().toFixed(1).padStart(5)}]`, ...a);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); log(ok ? 'PASS' : 'FAIL', name, detail); };

function open(hello) {
  return new Promise((res) => {
    const ws = new WebSocket(URL);
    ws.on('open', () => { ws.send(JSON.stringify(hello)); res(ws); });
  });
}

// ---------- projector ----------
const screen = { snap: null, events: [] };
const sws = await open({ t: 'hello', role: 'screen' });
sws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === 'snap') screen.snap = m;
  if (m.t === 'ev') { screen.events.push(m); if (!['tell', 'turn'].includes(m.kind)) log('event', m.kind, m.name ?? m.by ?? (m.snapped !== undefined ? `snapped=${m.snapped}` : '')); }
});
sws.send(JSON.stringify({ t: 'reset' }));
await new Promise((r) => setTimeout(r, 300));

// ---------- phones ----------
const plan = [
  { name: 'ANNA', seed: 11, startAt: 0 },
  { name: 'BEN', seed: 22, startAt: 2.5 },
  { name: 'CLEO', seed: 33, startAt: 5 },
  { name: 'DAVE', seed: 44, startAt: 0, outsider: true },
];
const bots = [];
for (const p of plan) {
  const ws = await open({ t: 'hello', role: 'phone', token: `sim-${p.name.toLowerCase()}` });
  const bot = { ...p, ws, me: null, holding: false, lastTap: 0, taps: 0, roleSince: 0, role: null, caughtOnce: false, moonTest: null, voted: false };
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.t !== 'me') return;
    if (m.role !== bot.role) { bot.role = m.role; bot.roleSince = now(); bot.taps = 0; }
    bot.me = m;
    drive(bot);
  });
  ws.send(JSON.stringify({ t: 'join', name: p.name, seed: p.seed }));
  bots.push(bot);
}
const send = (b, m) => b.ws.send(JSON.stringify(m));
const hold = (b, on) => { if (on !== b.holding) { b.holding = on; send(b, { t: on ? 'press' : 'release' }); } };
const tapEvery = (b, gap, max) => { if (b.taps < max && now() - b.lastTap >= gap) { b.lastTap = now(); b.taps++; send(b, { t: 'tap' }); } };
let roundStart = Infinity;

function drive(b) {
  const me = b.me;
  if (!me.id) return;
  switch (me.role) {
    case 'sneak': {
      const danger = me.gus === 'tell' || me.gus === 'watch';
      const moon = me.rule === 'moonwalk';
      if (me.needFreshPress && b.holding) hold(b, false);
      if (b.outsider) {
        if (!b.caughtOnce) { hold(b, true); return; }            // walk straight through his look: get caught
        if (!moon) { hold(b, false); return; }                   // normal rule: stand still
        // moonwalk: holding = frozen. Once, during a safe moment, let go to prove the reversed control.
        if (!b.moonTest && me.gus === 'back' && !me.needFreshPress && b.holding) b.moonTest = { at: now(), x0: me.x, sawMoving: false };
        if (b.moonTest && !b.moonTest.done) {
          if (danger) { b.moonTest = null; hold(b, true); return; }      // he turned: freeze, retry next safe window
          if (me.moving) b.moonTest.sawMoving = true;
          if (now() - b.moonTest.at < 0.6) { hold(b, false); return; }
          b.moonTest.done = true; b.moonTest.x1 = me.x;
          check('moonwalk: releasing moves an outside player', b.moonTest.sawMoving && b.moonTest.x1 > b.moonTest.x0, `x ${b.moonTest.x0.toFixed(3)} -> ${b.moonTest.x1.toFixed(3)}`);
        }
        if (me.needFreshPress) { send(b, { t: 'press' }); b.holding = true; return; }
        hold(b, true);
        return;
      }
      if (now() - roundStart < b.startAt) { hold(b, moon); return; }
      if (moon) {
        if (me.needFreshPress) { send(b, { t: 'press' }); b.holding = true; return; }
        hold(b, danger);                                          // freeze = hold, move = let go
      } else hold(b, !danger);
      return;
    }
    case 'caught': b.caughtOnce = true; b.holding = false; tapEvery(b, 0.12, 22); return;
    case 'owner-pick': if (now() - b.roleSince > 1) { if (!b.ruled) { b.ruled = true; send(b, { t: 'rule', rule: 'moonwalk' }); } } return;
    case 'defend': tapEvery(b, 0.4, 20); return;
    case 'break': tapEvery(b, 0.9, 8); return;
    case 'support': if (!b.voted && now() - b.roleSince > 1) { b.voted = true; send(b, { t: 'tap' }); } return;
    default: if (b.holding) hold(b, false);
  }
}

// ---------- script ----------
const until = (cond, secs, what) => new Promise((res, rej) => {
  const end = Date.now() + secs * 1000;
  const iv = setInterval(() => {
    if (cond()) { clearInterval(iv); res(); } else if (Date.now() > end) { clearInterval(iv); rej(new Error(`timeout: ${what}`)); }
  }, 50);
});
const byName = (n) => bots.find((b) => b.name === n);

try {
  const sims = () => (screen.snap?.players ?? []).filter((p) => ['ANNA', 'BEN', 'CLEO', 'DAVE'].includes(p.name));
  await until(() => screen.snap?.phase === 'lobby' && sims().length === 4 && (EXTRA || screen.snap.players.length === 4), 5, 'lobby shows the 4 bots');
  const lobbyNames = screen.snap.players.map((p) => p.name).sort().join(',');
  if (EXTRA) log('lobby', lobbyNames);
  else check('lobby: projector lists exactly the 4 joined phones', lobbyNames === 'ANNA,BEN,CLEO,DAVE', lobbyNames);
  const total = screen.snap.players.length;
  check('lobby: every phone is in line with the real head count', bots.every((b) => b.me?.role === 'lobby' && b.me.total === total), `${total}`);

  sws.send(JSON.stringify({ t: 'start' }));
  roundStart = now();
  log('round started');

  await until(() => screen.events.some((e) => e.kind === 'rule'), 75, 'moonwalk picked');
  const ruleEv = screen.events.find((e) => e.kind === 'rule');
  const owner = screen.events.find((e) => e.kind === 'owner');
  check('first entrant becomes the owner', owner?.name === 'ANNA', owner?.name);
  check('projector: rule event names the owner', ruleEv.by === 'ANNA');
  await new Promise((r) => setTimeout(r, 300));
  check('projector snapshot: rule = moonwalk', screen.snap.rule === 'moonwalk');
  check('all phones: rule = moonwalk', bots.every((b) => b.me.rule === 'moonwalk' && b.me.ruleBy === 'ANNA'));
  check('owner phone left the pick screen', byName('ANNA').me.role === 'lounge');
  check('DAVE: was caught once and passed', screen.events.some((e) => e.kind === 'caught' && e.name === 'DAVE') && screen.events.some((e) => e.kind === 'pass' && e.name === 'DAVE'));

  await until(() => screen.snap.phase === 'push', 80, 'push');
  const entered = screen.events.filter((e) => e.kind === 'entered').map((e) => `${e.order}:${e.name}`).join(' ');
  check('BEN and CLEO got in after ANNA', /1:ANNA/.test(entered) && /BEN/.test(entered) && /CLEO/.test(entered), entered);
  check('push roles: lounge defends, DAVE breaks', ['ANNA', 'BEN', 'CLEO'].every((n) => byName(n).me.role === 'defend') && byName('DAVE').me.role === 'break');

  await until(() => screen.snap.phase === 'vote', 15, 'vote');
  await new Promise((r) => setTimeout(r, 200));
  check('rope held (lounge out-tapped the crowd per head)', screen.snap.ropeSnapped === false);
  check('vote roles: ANNA defending, BEN/CLEO support, DAVE outside', byName('ANNA').me.role === 'defending' && byName('BEN').me.role === 'support' && byName('CLEO').me.role === 'support' && byName('DAVE').me.role === 'outside-vote');

  await until(() => screen.snap.phase === 'reveal', 10, 'reveal');
  await new Promise((r) => setTimeout(r, 300));
  const r = screen.snap.reveal;
  log('reveal', JSON.stringify({ winner: r.winnerName, from: r.prevOwnerName, ranking: r.ranking.map((x) => `${x.name}:${x.score}`) }));
  check('projector: BEN took the crown from ANNA', r.winnerName === 'BEN' && r.prevOwnerName === 'ANNA');
  check('all phones show the same winner as the projector', bots.every((b) => b.me.reveal?.winnerId === r.winnerId));
  const ranks = bots.map((b) => `${b.name}#${b.me.rank}`).join(' ');
  check('only BEN is ranked #1', byName('BEN').me.rank === 1 && bots.filter((b) => b.me.rank === 1).length === 1, ranks);
  check('phone ranks are distinct and match the projector order', new Set(bots.map((b) => b.me.rank)).size === 4 && bots.every((b) => r.ranking[b.me.rank - 1]?.id === b.me.id), ranks);
  if (!byName('DAVE').moonTest?.done) check('moonwalk: release test ran on an outside phone', false);
} catch (e) {
  check(String(e.message), false);
}

const failed = results.filter((x) => !x.ok).length;
log(`${results.length - failed}/${results.length} checks passed`);
for (const b of bots) b.ws.close();
sws.close();
setTimeout(() => process.exit(failed ? 1 : 0), 200);
