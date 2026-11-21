/**
 * Load test: 1 projector + N phone bots (default 100) play one full round in one room.
 *
 *   npm run load                                  in-process server, speed 1, MockVoice ok (full 120 s round)
 *   npm run load -- --speed 4                     quick run (30 s)
 *   npm run load -- --secs 20                     stop measuring after 20 s of wall time
 *   npm run load -- --phones 60
 *   npm run load -- --url ws://host:5173/ws --room ABCD   point at a running server (a screen for that room is opened)
 *
 * Reports server tick duration, tick rate, snapshot rate at the projector, `me` cadence on phones, bandwidth to the
 * projector, memory, and socket errors. Exit code 1 if the projector gets < 12 snapshots/s or the tick averages > 10 ms.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { attachGame, type GameServer } from '../server/rooms';
import { MockVoice } from '../server/ai/mock';
import { T } from '../shared/constants';
import type { ClientMsg, Me, Snapshot } from '../shared/protocol';

const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const PHONES = Number(opt('--phones') ?? 100);
const SPEED = Number(opt('--speed') ?? 1);
const SECS = opt('--secs') ? Number(opt('--secs')) : null;
const REMOTE_URL = opt('--url');
const REMOTE_ROOM = opt('--room')?.toUpperCase();
if (REMOTE_URL && !REMOTE_ROOM) { console.error('--url needs --room CODE'); process.exit(2); }

const mb = (n: number) => (n / 1048576).toFixed(1);
const rss = () => process.memoryUsage().rss;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const t0 = Date.now();
const stamp = () => `[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}]`;
const log = (...a: unknown[]) => console.log(stamp(), ...a);

// ---------------------------------------------------------------- server
let url: string;
let game: GameServer | null = null;
let closeServer: () => Promise<void> = async () => {};
const tickDur = { n: 0, sum: 0, max: 0, count: 0 };   // measured around every tick callback
const rssStart = rss();
if (REMOTE_URL) {
  url = REMOTE_URL;
} else {
  const http = createServer();
  // count ticks and time them by wrapping the 20 Hz interval attachGame registers
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
    if (ms !== 1000 / T.TICK_HZ) return realSetInterval(fn, ms, ...rest);
    return realSetInterval((...a: unknown[]) => {
      const s = performance.now();
      fn(...a);
      const d = performance.now() - s;
      tickDur.count++; tickDur.sum += d; if (d > tickDur.max) tickDur.max = d;
    }, ms, ...rest);
  }) as typeof setInterval;
  game = attachGame(http, { voice: new MockVoice({ mode: 'ok' }), speed: SPEED, log: false });
  globalThis.setInterval = realSetInterval;
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`;
  closeServer = () => new Promise<void>((res) => { game!.close(); http.close(() => res()); http.closeAllConnections?.(); });
}
log(`target ${url}  (${REMOTE_URL ? 'remote' : `in-process, speed ${SPEED}`}), ${PHONES} phones`);

// ---------------------------------------------------------------- clients
let socketErrors = 0;
const errorSamples: string[] = [];
const onErr = (who: string) => (e: Error) => { socketErrors++; if (errorSamples.length < 5) errorSamples.push(`${who}: ${e.message}`); };

function rawOpen(hello: ClientMsg, who: string, onMsg: (raw: WebSocket.RawData, ws: WebSocket) => void): Promise<WebSocket> {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    ws.on('error', (e) => { onErr(who)(e); rej(e); });
    ws.on('message', (raw) => onMsg(raw, ws));
    ws.on('open', () => { ws.send(JSON.stringify(hello)); res(ws); });
  });
}

// projector
let clockFirst: { left: number; wall: number } | null = null;
let roundStarted = false;
let clockLast: { left: number; wall: number } | null = null;
const screen = {
  code: '' as string, snap: null as Snapshot | null, snaps: 0, bytes: 0, phases: [] as string[],
  perSec: [] as number[], bytesPerSec: [] as number[], secSnaps: 0, secBytes: 0, lastSnapAt: 0, maxGap: 0, events: 0,
};
const sws = await rawOpen({ t: 'hello', role: 'screen', room: REMOTE_ROOM }, 'screen', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === 'room') screen.code = m.code;
  else if (m.t === 'snap') {
    const now = performance.now();
    if (screen.lastSnapAt) screen.maxGap = Math.max(screen.maxGap, now - screen.lastSnapAt);
    screen.lastSnapAt = now;
    screen.snap = m; screen.snaps++; screen.secSnaps++;
    if (m.phase === 'play' && !clockFirst && roundStarted) clockFirst = { left: m.timeLeft, wall: Date.now() };
    if (m.phase === 'play' || m.phase === 'push' || m.phase === 'vote') clockLast = { left: m.timeLeft, wall: Date.now() };
    if (screen.phases[screen.phases.length - 1] !== m.phase) { screen.phases.push(m.phase); log(`phase -> ${m.phase}`); }
  } else if (m.t === 'ev') screen.events++;
  screen.bytes += (raw as Buffer).length;
  screen.secBytes += (raw as Buffer).length;
});
while (!screen.code) await sleep(10);
log(`room ${screen.code}`);

// phones: hold/release at random, mash when caught, push/vote in the finale
class Phone {
  ws!: WebSocket;
  me: Me | null = null;
  holding = false;
  nextFlip = 0;
  lastMeAt = 0;
  meGaps = 0; meSum = 0; meMax = 0;
  lastTap = 0;
  roleSince = 0; role = '';
  voted = false;
  constructor(public i: number) {}
  send(m: ClientMsg) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  async start() {
    this.ws = await rawOpen({ t: 'hello', role: 'phone', token: `load-${this.i}`, room: screen.code }, `phone ${this.i}`, (raw, ws) => {
      const m = JSON.parse(String(raw));
      if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', n: m.n }));
      else if (m.t === 'me') this.onMe(m as Me);
    });
    this.send({ t: 'join', name: `BOT${String(this.i).padStart(3, '0')}`, seed: this.i });
  }
  onMe(me: Me) {
    const now = performance.now();
    if (this.lastMeAt && me.phase !== 'lobby') { const g = now - this.lastMeAt; this.meGaps++; this.meSum += g; if (g > this.meMax) this.meMax = g; }
    this.lastMeAt = now;
    this.me = me;
    if (me.role !== this.role) { this.role = me.role; this.roleSince = now; this.voted = false; if (me.role !== 'sneak') this.holding = false; }
    const ms = now;
    switch (me.role) {
      case 'sneak':
        if (me.needFreshPress) { this.send({ t: 'press' }); this.holding = true; this.nextFlip = ms + 300 + Math.random() * 1000; break; }
        if (ms >= this.nextFlip) {
          this.nextFlip = ms + 300 + Math.random() * 1200;
          // wanders more when Gus's back is turned, but sometimes does the wrong thing
          const want = Math.random() < (me.gus === 'back' || me.gus === 'sleep' ? 0.7 : 0.3);
          const hold = me.rule === 'moonwalk' ? !want : want;
          if (hold !== this.holding) { this.holding = hold; this.send({ t: hold ? 'press' : 'release' }); }
        }
        break;
      case 'caught': this.mash(ms, 110 / SPEED); break;
      case 'defend': this.mash(ms, 220 / SPEED); break;
      case 'break': this.mash(ms, 280 / SPEED); break;
      case 'support': if (!this.voted && ms - this.roleSince > 600 / SPEED) { this.voted = true; this.send({ t: 'tap' }); } break;
      case 'owner-pick': if (ms - this.roleSince > 400 && me.ruleChoices.length) this.send({ t: 'rule', rule: me.ruleChoices[0] }); break;
    }
  }
  mash(ms: number, gap: number) { if (ms - this.lastTap >= gap) { this.lastTap = ms; this.send({ t: 'tap' }); } }
}

const phones = Array.from({ length: PHONES }, (_, i) => new Phone(i + 1));
await Promise.all(phones.map((p) => p.start()));
const deadline = Date.now() + 15000;
while ((screen.snap?.players.length ?? 0) < PHONES && Date.now() < deadline) await sleep(50);
log(`${screen.snap?.players.length ?? 0}/${PHONES} phones in the lobby`);
if ((screen.snap?.players.length ?? 0) < PHONES) { console.error('FAIL: not every phone could join'); process.exit(1); }

// ---------------------------------------------------------------- measure
const samples: { tickAvg: number; rss: number; heap: number }[] = [];
const startMeasure = Date.now();
let lastSecAt = startMeasure;
const sampler = setInterval(() => {
  const now = Date.now();
  const el = (now - lastSecAt) / 1000;
  lastSecAt = now;
  screen.perSec.push(screen.secSnaps / el); screen.bytesPerSec.push(screen.secBytes / el);
  screen.secSnaps = 0; screen.secBytes = 0;
  if (argv.includes('--trace')) log(`trace timeLeft ${screen.snap?.timeLeft.toFixed(2)} gus ${screen.snap?.gus} snaps/s ${screen.perSec[screen.perSec.length - 1].toFixed(1)}`);
  samples.push({ tickAvg: game?.tickMs.avg ?? 0, rss: rss(), heap: process.memoryUsage().heapUsed });
}, 1000);
if (game) game.tickMs.max = 0;
tickDur.count = 0; tickDur.sum = 0; tickDur.max = 0;
const tickCount0 = tickDur.count;
const rssAtRoundStart = rss();

const roundWall = ((screen.snap?.roundSecs ?? T.ROUND) / SPEED) * 1000;
const limit = Date.now() + (SECS !== null ? SECS * 1000 : roundWall + 60000);
roundStarted = true;
sws.send(JSON.stringify({ t: 'start' }));
log('round started');
while (screen.snap?.phase !== 'reveal' && Date.now() < limit) await sleep(100);
const finished = screen.snap?.phase === 'reveal';
const wallSecs = (Date.now() - startMeasure) / 1000;
if (finished) await sleep(1500);   // reveal + mugshots go out
clearInterval(sampler);

// ---------------------------------------------------------------- report
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a: number[]) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
const snapRate = screen.snaps / wallSecs;
const minSnap = Math.min(...screen.perSec.slice(1, -1).concat(screen.perSec.length < 3 ? screen.perSec : []));
const meGaps = phones.reduce((s, p) => s + p.meGaps, 0);
const meMean = phones.reduce((s, p) => s + p.meSum, 0) / Math.max(1, meGaps);
const meMax = Math.max(...phones.map((p) => p.meMax));
const meRate = 1000 / meMean;
const tickAvgSampled = avg(samples.map((s) => s.tickAvg));
const rssEnd = rss();
const rssSamples = samples.map((s) => s.rss);
const third = Math.max(1, Math.floor(rssSamples.length / 3));
const rssEarly = avg(rssSamples.slice(third, third * 2)); // after warm-up
const rssLate = avg(rssSamples.slice(-third));

console.log('\n================ LOAD TEST REPORT ================');
console.log(`target            ${REMOTE_URL ? url : `in-process, speed ${SPEED}`}   phones ${PHONES}   round ${screen.snap?.roundSecs ?? '?'} s game time`);
console.log(`wall time         ${wallSecs.toFixed(1)} s   round ${finished ? 'COMPLETED' : 'cut off at --secs'}   phases ${screen.phases.join(' > ')}`);
if (game) {
  console.log(`tick duration     avg ${tickAvgSampled.toFixed(3)} ms (tickMs.avg sampled each second)   max ${game.tickMs.max.toFixed(2)} ms (tickMs.max)`);
  console.log(`                  measured around every tick: avg ${(tickDur.sum / Math.max(1, tickDur.count)).toFixed(3)} ms   max ${tickDur.max.toFixed(2)} ms   over ${tickDur.count} ticks`);
  console.log(`server tick rate  ${((tickDur.count - tickCount0) / wallSecs).toFixed(2)} Hz   (target ${T.TICK_HZ})`);
} else {
  console.log('tick duration     n/a (remote server)');
}
const cf = clockFirst as { left: number; wall: number } | null, cl = clockLast as { left: number; wall: number } | null;
if (cf && cl && cl.wall > cf.wall) console.log(`game clock        ${((cf.left - cl.left) / ((cl.wall - cf.wall) / 1000)).toFixed(3)} game-s per wall-s (should be ${SPEED})`);
console.log(`screen snapshots  ${snapRate.toFixed(2)} Hz avg   median second ${median(screen.perSec).toFixed(1)} Hz   slowest second ${isFinite(minSnap) ? minSnap.toFixed(1) : 'n/a'} Hz   longest gap ${screen.maxGap.toFixed(0)} ms   (target ${T.SNAP_HZ} Hz)`);
console.log(`phone me          mean interval ${meMean.toFixed(1)} ms (${meRate.toFixed(1)} Hz)   max interval ${meMax.toFixed(0)} ms   over ${meGaps} messages`);
console.log(`screen bandwidth  ${mb(avg(screen.bytesPerSec))} MB/s avg (${(avg(screen.bytesPerSec) / 1024).toFixed(0)} KB/s), peak ${(Math.max(...screen.bytesPerSec) / 1024).toFixed(0)} KB/s; avg snapshot ${(screen.bytes / Math.max(1, screen.snaps) / 1024).toFixed(1)} KB; ${screen.events} events`);
console.log(`memory (RSS)      start ${mb(rssStart)} MB   round start ${mb(rssAtRoundStart)} MB   end ${mb(rssEnd)} MB   mid-round mean ${mb(rssEarly)} MB -> late mean ${mb(rssLate)} MB`);
console.log(`                  heap used start->end: ${mb(samples[0]?.heap ?? 0)} -> ${mb(samples[samples.length - 1]?.heap ?? 0)} MB   ${REMOTE_URL ? '(this is the load generator, not the server)' : '(server and bots share this process)'}`);
console.log(`socket errors     ${socketErrors}${errorSamples.length ? `   e.g. ${errorSamples.join(' | ')}` : ''}`);
const final = screen.snap?.reveal;
if (final) console.log(`outcome           winner ${final.winnerName ?? 'nobody'}   rope ${final.ropeSnapped ? 'snapped' : 'held'}   ${final.ranking.length} ranked`);

const fails: string[] = [];
if (snapRate < 12) fails.push(`screen snapshot rate ${snapRate.toFixed(2)} Hz < 12 Hz`);
if (game && tickAvgSampled > 10) fails.push(`tick avg ${tickAvgSampled.toFixed(2)} ms > 10 ms`);
if (socketErrors) fails.push(`${socketErrors} socket errors`);
if (SECS === null && !finished) fails.push('round did not reach the reveal');
console.log(fails.length ? `\nRESULT: FAIL\n  - ${fails.join('\n  - ')}` : '\nRESULT: PASS');

for (const p of phones) p.ws.close();
sws.close();
await closeServer();
process.exit(fails.length ? 1 : 0);
