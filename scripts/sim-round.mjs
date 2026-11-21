// Four scripted phones + one projector socket play a full linked round against the dev server.
// Scenario: ANNA gets in first and picks a rule from her console (MOONWALK if offered), BEN and CLEO follow,
// DAVE stays outside (caught once, passes the challenge, then stands still). At the vote BEN and CLEO back the
// coup, so ANNA loses the crown to whichever of them got in first.
// Checks that the projector and every phone agree on the lobby, the rule, and the winner. Runs in real time (~2 min).
//
//   npm run dev                       (in another terminal)
//   node scripts/sim-round.mjs [ws://localhost:5173/ws] [--room CODE] [--allow-extra] [--speed N]
// Without --room the script opens its own room and prints its code. With --room CODE the bots join that room, so
// real phones and the projector (http://localhost:5173/screen.html?room=CODE) can watch the same round.
// --allow-extra: real phones may join the same round; the bots still run the scenario.
// --speed N: the server runs with GAME_SPEED=N (faster than real time); the bots scale their pacing to match.
import WebSocket from 'ws';

const args = process.argv.slice(2);
const flagVal = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const URL = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--room' && args[i - 1] !== '--speed') || 'ws://localhost:5173/ws';
const ROOM = flagVal('--room')?.toUpperCase();
const SPEED = Number(flagVal('--speed') ?? 1) || 1;
const EXTRA = args.includes('--allow-extra') || !!ROOM;
const HOST = new globalThis.URL(URL.replace(/^ws/, 'http')).host;
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const log = (...a) => console.log(`[${now().toFixed(1).padStart(5)}]`, ...a);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); log(ok ? 'PASS' : 'FAIL', name, detail); };

function open(hello) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(URL);
    ws.on('error', rej);
    ws.on('open', () => { ws.send(JSON.stringify(hello)); res(ws); });
  });
}

// ---------- projector ----------
const screen = { snap: null, events: [], code: null };
let sws;
try { sws = await open({ t: 'hello', role: 'screen', room: ROOM }); } catch (e) {
  console.error(`cannot connect to ${URL}: ${e.message}\nStart the server first: npm run dev`);
  process.exit(2);
}
sws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === 'room') screen.code = m.code;
  if (m.t === 'snap') screen.snap = m;
  if (m.t === 'ev') { screen.events.push({ ...m, at: now() }); if (!['tell', 'turn', 'fakeout', 'say'].includes(m.kind)) log('event', m.kind, m.name ?? m.by ?? (m.snapped !== undefined ? `snapped=${m.snapped}` : '')); }
});
await new Promise((res) => { const iv = setInterval(() => { if (screen.code) { clearInterval(iv); res(); } }, 20); });
const CODE = screen.code;
log(`room ${CODE}`);
log(`projector: http://${HOST}/screen.html?room=${CODE}`);
log(`phones:    http://${HOST}/play.html?room=${CODE}`);
await new Promise((r) => setTimeout(r, 300));
if (screen.snap && screen.snap.phase !== 'lobby') { sws.send(JSON.stringify({ t: 'reset' })); await new Promise((r) => setTimeout(r, 300)); }

// ---------- phones ----------
const plan = [
  { name: 'ANNA', seed: 11, startAt: 0 },
  { name: 'BEN', seed: 22, startAt: 2.5 },
  { name: 'CLEO', seed: 33, startAt: 5 },
  { name: 'DAVE', seed: 44, startAt: 0, outsider: true },
];
const runTag = Date.now().toString(36);
const bots = [];
for (const p of plan) {
  const ws = await open({ t: 'hello', role: 'phone', token: `sim-${runTag}-${p.name.toLowerCase()}`, room: CODE });
  const bot = { ...p, ws, me: null, holding: false, lastTap: 0, taps: 0, roleSince: 0, role: null, caughtOnce: false, passedOnce: false, moonTest: null, voted: false, ruled: false };
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.t === 'ping') { ws.send(JSON.stringify({ t: 'pong', n: m.n })); return; }
    if (m.t !== 'me') return;
    if (m.role !== bot.role) { bot.role = m.role; bot.roleSince = now(); bot.taps = 0; if (m.role !== 'sneak') bot.holding = false; }
    bot.me = m;
    drive(bot);
  });
  ws.send(JSON.stringify({ t: 'join', name: p.name, seed: p.seed }));
  bots.push(bot);
}
const send = (b, m) => b.ws.send(JSON.stringify(m));
const hold = (b, on) => { if (on !== b.holding) { b.holding = on; send(b, { t: on ? 'press' : 'release' }); } };
const tapEvery = (b, gap, max) => { if (b.taps < max * SPEED && now() - b.lastTap >= gap / SPEED) { b.lastTap = now(); b.taps++; for (let i = 0; i < Math.ceil(SPEED); i++) send(b, { t: 'tap' }); } };
let roundStart = Infinity;

// "move" = the bot wants to walk; Moonwalk inverts the control (hold = freeze).
function steer(b, me, move) {
  if (me.needFreshPress) { send(b, { t: 'press' }); b.holding = true; return; }
  hold(b, me.rule === 'moonwalk' ? !move : move);
}

function drive(b) {
  const me = b.me;
  if (!me.id) return;
  switch (me.role) {
    case 'sneak': {
      const safe = me.gus === 'back' || me.gus === 'sleep';
      if (b.outsider) {
        if (!b.passedOnce && !b.caughtOnce) return steer(b, me, true);   // walk into his look: get caught
        if (!b.passedOnce) return steer(b, me, true);
        return steer(b, me, false);                                       // then stand still, outside
      }
      if ((now() - roundStart) * SPEED < b.startAt) return steer(b, me, false);
      return steer(b, me, safe);
    }
    case 'caught': b.caughtOnce = true; b.holding = false; tapEvery(b, 0.12, 30); return;
    case 'result': if (b.caughtOnce && me.result?.pass) b.passedOnce = true; return;
    case 'owner-pick':
      if (!b.ruled && now() - b.roleSince > 1) {
        b.ruled = true;
        const rule = me.ruleChoices.includes('moonwalk') ? 'moonwalk' : me.ruleChoices[0];
        send(b, { t: 'rule', rule });
      }
      return;
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

  await until(() => screen.events.some((e) => e.kind === 'rule'), 95 / SPEED, 'owner picked a rule');
  const ruleEv = screen.events.find((e) => e.kind === 'rule');
  const owner = screen.events.find((e) => e.kind === 'owner');
  const firstIn = (screen.events.find((e) => e.kind === 'entered') || {});
  check('first entrant becomes the owner', owner?.name === 'ANNA', owner?.name);
  check('first admission within 35 s (when the guard naps)', (firstIn.at - roundStart) * SPEED <= 40, `${((firstIn.at - roundStart) * SPEED).toFixed(1)} game-s`);
  check('projector: rule event names the owner', ruleEv.by === 'ANNA');
  check('owner chose from her own choices', byName('ANNA').me.ruleChoices.includes(ruleEv.rule), `${ruleEv.rule} of ${byName('ANNA').me.ruleChoices.join('/')}`);
  await new Promise((r) => setTimeout(r, 400));
  check(`projector snapshot: rule = ${ruleEv.rule}`, screen.snap.rule === ruleEv.rule && screen.snap.ruleBy === 'ANNA');
  check('all four phones: same rule, picked by ANNA', bots.every((b) => b.me.rule === ruleEv.rule && b.me.ruleBy === 'ANNA'));
  check('owner phone left the pick screen', byName('ANNA').me.role === 'lounge');

  await until(() => screen.events.some((e) => e.kind === 'caught' && e.name === 'DAVE') && screen.events.some((e) => e.kind === 'pass' && e.name === 'DAVE'), 100 / SPEED, 'DAVE caught and passed');
  const pass = screen.events.find((e) => e.kind === 'pass' && e.name === 'DAVE');
  check('DAVE: was caught and passed the challenge, with a line from Gus', !!pass && pass.line.length > 0, pass?.line);

  await until(() => screen.snap.phase === 'push', 110 / SPEED, 'push');
  const entered = screen.events.filter((e) => e.kind === 'entered').map((e) => `${e.order}:${e.name}`).join(' ');
  check('BEN and CLEO got in after ANNA', /1:ANNA/.test(entered) && /BEN/.test(entered) && /CLEO/.test(entered), entered);
  check('push roles: lounge defends, DAVE breaks', ['ANNA', 'BEN', 'CLEO'].every((n) => byName(n).me.role === 'defend') && byName('DAVE').me.role === 'break');

  await until(() => screen.snap.phase === 'vote', 15, 'vote');
  await new Promise((r) => setTimeout(r, 300));
  check('rope held (lounge out-tapped the crowd per head)', screen.snap.ropeSnapped === false);
  check('vote roles: ANNA defending, BEN/CLEO support, DAVE outside', byName('ANNA').me.role === 'defending' && byName('BEN').me.role === 'support' && byName('CLEO').me.role === 'support' && byName('DAVE').me.role === 'outside-vote');

  await until(() => screen.snap.phase === 'reveal', 10, 'reveal');
  await new Promise((r) => setTimeout(r, 400));
  const r = screen.snap.reveal;
  log('reveal', JSON.stringify({ winner: r.winnerName, from: r.prevOwnerName, ranking: r.ranking.map((x) => `${x.name}:${x.score}`) }));
  const successor = screen.events.filter((e) => e.kind === 'entered' && ['BEN', 'CLEO'].includes(e.name)).sort((a, b) => a.order - b.order)[0]?.name;
  check(`projector: ${successor} (first of the supporters in) took the crown from ANNA`, r.winnerName === successor && r.prevOwnerName === 'ANNA', `${r.winnerName} from ${r.prevOwnerName}`);
  check('all phones show the same winner as the projector', bots.every((b) => b.me.reveal?.winnerId === r.winnerId));
  const ranks = bots.map((b) => `${b.name}#${b.me.rank}`).join(' ');
  check(`only ${successor} is ranked #1`, byName(successor).me.rank === 1 && bots.filter((b) => b.me.rank === 1).length === 1, ranks);
  check('phone ranks are distinct and match the projector order', new Set(bots.map((b) => b.me.rank)).size === 4 && bots.every((b) => r.ranking[b.me.rank - 1]?.id === b.me.id), ranks);
  check('every phone has a mugshot', bots.every((b) => b.me.mugshot && b.me.mugshot.name === b.name));
} catch (e) {
  check(String(e.message), false);
}

const failed = results.filter((x) => !x.ok).length;
log(`${failed ? 'FAIL' : 'PASS'}: ${results.length - failed}/${results.length} checks passed`);
for (const b of bots) b.ws.close();
sws.close();
setTimeout(() => process.exit(failed ? 1 : 0), 200);
