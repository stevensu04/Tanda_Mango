import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { attachGame, type GameServer } from '../rooms';
import { MockVoice, type MockVoiceOptions } from '../ai/mock';
import type { ClientMsg, GameEvent, Me, Snapshot, AdminState, Rule, Power, ServerMsg } from '../../shared/protocol';

/** Network-level test helpers: a real http+ws server on port 0 and bots speaking the real protocol. */

export interface TestServer {
  http: Server;
  game: GameServer;
  voice: MockVoice;
  url: string;
  speed: number;
  close(): Promise<void>;
}

export async function startServer(opts: { speed?: number; voice?: MockVoiceOptions } = {}): Promise<TestServer> {
  const http = createServer();
  const speed = opts.speed ?? 4;
  const voice = new MockVoice(opts.voice);
  const game = attachGame(http, { voice, speed, log: false });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  const port = (http.address() as AddressInfo).port;
  return {
    http, game, voice, speed, url: `ws://127.0.0.1:${port}/ws`,
    close: () => new Promise<void>((res) => { game.close(); http.close(() => res()); http.closeAllConnections?.(); }),
  };
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Poll until cond() is truthy; throws a descriptive error on timeout. */
export async function until(cond: () => unknown, timeoutMs = 5000, what = 'condition'): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timeout (${timeoutMs} ms) waiting for ${what}`);
    await sleep(10);
  }
}

export type TimedEvent = GameEvent & { gt: number; wall: number };

/** Game seconds since round start, from a snapshot or me. */
export const gameTime = (s: { timeLeft: number; roundSecs?: number } | null | undefined, roundSecs = 120) =>
  s ? (s.roundSecs ?? roundSecs) - s.timeLeft : 0;

export class Bot {
  ws!: WebSocket;
  me: Me | null = null;
  snap: Snapshot | null = null;
  admin: AdminState | null = null;
  code: string | null = null;
  events: TimedEvent[] = [];
  meLog: Me[] = [];                 // every `me` received (only kept when keepLog)
  snapCount = 0;
  pings = 0;
  errors: Error[] = [];
  closed = false;
  holding = false;
  keepLog = false;
  roles = new Set<string>();       // every phone role seen
  roundSecs = 120;
  private handlers: { me: ((m: Me, b: Bot) => void)[]; snap: ((s: Snapshot, b: Bot) => void)[]; ev: ((e: TimedEvent, b: Bot) => void)[] } = { me: [], snap: [], ev: [] };

  constructor(public url: string, public hello: ClientMsg, public label = '') {}

  static async connect(url: string, hello: ClientMsg, label = ''): Promise<Bot> {
    const b = new Bot(url, hello, label);
    await b.open();
    return b;
  }
  static screen(url: string, room?: string) { return Bot.connect(url, { t: 'hello', role: 'screen', room }, 'screen'); }
  static phone(url: string, token: string, room?: string, motion = false) { return Bot.connect(url, { t: 'hello', role: 'phone', token, room, motion }, token); }
  static admin(url: string, room: string) { return Bot.connect(url, { t: 'hello', role: 'admin', room }, 'admin'); }

  /** (Re)open the socket and send hello. Resolves once hello is sent. */
  open(): Promise<void> {
    this.closed = false;
    this.holding = false;
    return new Promise((res, rej) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.on('error', (e) => { this.errors.push(e); rej(e); });
      ws.on('close', () => { this.closed = true; });
      ws.on('message', (raw) => this.onMessage(JSON.parse(String(raw))));
      ws.on('open', () => { ws.send(JSON.stringify(this.hello)); res(); });
    });
  }

  private onMessage(m: ServerMsg) {
    switch (m.t) {
      case 'me': this.me = m; this.roles.add(m.role); if (this.keepLog) this.meLog.push(m); for (const h of this.handlers.me) h(m, this); break;
      case 'snap': this.snap = m; this.snapCount++; this.roundSecs = m.roundSecs; for (const h of this.handlers.snap) h(m, this); break;
      case 'ev': {
        const e = { ...m, gt: gameTime(this.snap, this.roundSecs), wall: Date.now() } as TimedEvent;
        this.events.push(e); for (const h of this.handlers.ev) h(e, this); break;
      }
      case 'room': this.code = m.code; break;
      case 'admin': this.admin = m; break;
      case 'ping': this.pings++; this.send({ t: 'pong', n: m.n }); break;
    }
  }

  onMe(h: (m: Me, b: Bot) => void) { this.handlers.me.push(h); return this; }
  onSnap(h: (s: Snapshot, b: Bot) => void) { this.handlers.snap.push(h); return this; }
  onEvent(h: (e: TimedEvent, b: Bot) => void) { this.handlers.ev.push(h); return this; }

  send(m: ClientMsg) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  join(name: string, seed = 1) { this.send({ t: 'join', name, seed }); }
  press() { this.holding = true; this.send({ t: 'press' }); }
  release() { this.holding = false; this.send({ t: 'release' }); }
  setHold(on: boolean) { if (on !== this.holding) (on ? this.press() : this.release()); }
  tap(n = 1) { for (let i = 0; i < n; i++) this.send({ t: 'tap' }); }
  shake(e = 1) { this.send({ t: 'shake', e }); }
  rule(rule: Rule) { this.send({ t: 'rule', rule }); }
  power(power: Power) { this.send({ t: 'power', power }); }
  solo(level: number) { this.send({ t: 'solo', op: 'start', level }); }
  soloMenu() { this.send({ t: 'solo', op: 'menu' }); }
  start() { this.send({ t: 'start' }); }
  reset() { this.send({ t: 'reset' }); }
  kick(id: string) { this.send({ t: 'kick', id }); }
  settings(s: Partial<import('../../shared/protocol').Settings>) { this.send({ t: 'settings', settings: s }); }

  eventsOf<K extends GameEvent['kind']>(kind: K): (Extract<GameEvent, { kind: K }> & { gt: number; wall: number })[] {
    return this.events.filter((e) => e.kind === kind) as never;
  }

  close() { try { this.ws.close(); } catch { /* ignore */ } }
  terminate() { try { this.ws.terminate(); } catch { /* ignore */ } }
}

// ------------------------------------------------------------------ behaviours

/**
 * Generic sneaking logic on every `me`. `wantMove(me)` says whether the bot wants to walk right now;
 * the bot translates that into hold/release for the active rule (Moonwalk inverts the control).
 * `onCaught(me, bot)` is called on every `me` while caught.
 */
export function drive(bot: Bot, o: { wantMove: (me: Me) => boolean; onCaught?: (me: Me, bot: Bot) => void; extra?: (me: Me, bot: Bot) => void }) {
  bot.onMe((me) => {
    if (!me.id) return;
    o.extra?.(me, bot);
    if (me.role === 'caught') { bot.holding = false; o.onCaught?.(me, bot); return; }
    if (me.role !== 'sneak') { bot.holding = false; return; }
    if (me.needFreshPress) { bot.press(); return; }
    const move = o.wantMove(me);
    bot.setHold(me.rule === 'moonwalk' ? !move : move);
  });
}

/** Moves only while Gus has his back turned; lets go the moment he starts to turn. */
export const carefulMove = (me: Me) => me.gus === 'back' || me.gus === 'sleep';
export const recklessMove = () => true;
/** Mash hard (3 taps per 15 Hz tick): passes a 5 s challenge. */
export const mashHard = (_m: Me, b: Bot) => b.tap(3);
