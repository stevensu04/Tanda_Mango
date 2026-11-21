import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Room } from './game/room';
import { Director } from './director';
import { T, type ClientMsg, type ServerMsg, type AdminState, type AiStats } from '../shared/protocol';
import type { Voice } from './ai/types';

/**
 * The game transport: every client opens one WebSocket on /ws and says hello.
 *  - screen (projector): creates or re-opens a room; gets snapshots + events at 15 Hz
 *  - phone: joins a room by code (?room=ABCD), or plays the solo gauntlet with no code
 *  - admin: host controls for one room
 * Attached to Vite's HTTP server in dev (server/plugin.ts) and to a plain one in server/main.ts.
 */

export type GameVoice = Voice & { stats(): AiStats; setEnabled(on: boolean): void };

interface Client {
  role: 'screen' | 'phone' | 'admin' | null;
  ip: string;
  host: boolean;          // admin socket logged in with the host PIN
  screenOk: boolean;      // projector may start/reset (open/test mode only)
  room: Room | null;
  token: string;
  id: string | null;
  pingN: number;
  pingAt: number;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_IDLE_MS = 30 * 60_000;
const SOLO_IDLE_MS = 10 * 60_000;

export interface GameServer {
  rooms: Map<string, Room>;
  solos: Map<string, Room>;
  voice: GameVoice;
  close(): void;
  tickMs: { last: number; max: number; avg: number };
}

// ---------- host access ----------
// Each room has the password its creator chose. A host socket is unlocked for exactly one room.
// Open mode (tests, old scripts): no passwords, any projector may create rooms and use S/R.
const MAX_FAILS = 5;
const LOCK_MS = 60_000;
const TOKEN_MS = 12 * 3600_000;

export function attachGame(http: HttpServer, opts: { voice: GameVoice; speed?: number; log?: boolean; open?: boolean }): GameServer {
  const open = opts.open ?? (process.env.OPEN_ROOMS === '1' || !!process.env.VITEST);
  const hostTokens = new Map<string, { code: string; exp: number }>();
  const fails = new Map<string, { n: number; until: number }>(); // per IP
  const passwords = new WeakMap<Room, { salt: Buffer; hash: Buffer }>();
  const hashPw = (pw: string, salt: Buffer) => scryptSync(pw, salt, 32);
  const tokenFor = (code: string) => { const t = randomBytes(18).toString('base64url'); hostTokens.set(t, { code, exp: Date.now() + TOKEN_MS }); return t; };
  const tokenOk = (t: unknown, code: string) => { const e = typeof t === 'string' ? hostTokens.get(t) : undefined; return !!e && e.code === code && e.exp > Date.now(); };
  const speed = opts.speed ?? 1;
  const voice = opts.voice;
  const director = new Director(voice);
  const rooms = new Map<string, Room>();
  const solos = new Map<string, Room>();      // phone token -> its own solo run
  const lastSeen = new Map<Room, number>();
  const clients = new Map<WebSocket, Client>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  http.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) return; // leave Vite's HMR socket alone
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const send = (ws: WebSocket, m: ServerMsg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

  function newCode(): string {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
  }
  const cleanCode = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

  function soloFor(token: string): Room {
    let r = solos.get(token);
    if (!r) { r = new Room(`SOLO`, { mode: 'solo' }); solos.set(token, r); }
    return r;
  }

  function noRoom(code: string) {
    const m = new Room('----').me(null);
    return { ...m, role: 'no-room' as const, code };
  }

  wss.on('connection', (ws, req: IncomingMessage) => {
    const c: Client = { role: null, ip: req?.socket?.remoteAddress ?? '?', host: open, screenOk: open, room: null, token: '', id: null, pingN: 0, pingAt: 0 };
    clients.set(ws, c);
    ws.on('message', (raw) => {
      let m: ClientMsg;
      try { m = JSON.parse(String(raw)); } catch { return; }
      if (!m || typeof m !== 'object') return;
      try { handle(ws, c, m); } catch (e) { console.error('[game] bad message', m.t, e); }
    });
    ws.on('close', () => {
      clients.delete(ws);
      if (c.room && c.id) {
        const still = [...clients.values()].some((o) => o.room === c.room && o.id === c.id);
        if (!still) c.room.setConnected(c.id, false);
        c.room.dropDisconnected();
      }
    });
  });

  function handle(ws: WebSocket, c: Client, m: ClientMsg) {
    if (m.t === 'hello') {
      c.role = m.role;
      if (m.role === 'screen') {
        const want = cleanCode(m.room);
        let room = want.length === 4 ? rooms.get(want) : undefined;
        if (!open && !room) {
          // rooms are only made on the host dashboard: a projector without a valid code just waits
          c.room = null;
          send(ws, { t: 'denied', reason: want.length === 4 ? 'no-room' : 'waiting' });
          return;
        }
        if (!room) { room = new Room(want.length === 4 ? want : newCode()); rooms.set(room.code, room); }
        c.room = room;
        send(ws, { t: 'room', code: room.code, control: open });
        return;
      }
      if (m.role === 'admin') {
        const code = cleanCode(m.room);
        const room = rooms.get(code);
        c.host = open || (!!room && tokenOk(m.token, code));
        c.room = c.host ? room ?? null : null;
        if (!c.host) send(ws, { t: 'auth', ok: false, code: code || undefined, exists: !!room });
        else send(ws, adminState(c));
        return;
      }
      c.token = String(m.token ?? '').slice(0, 64) || `anon-${Math.random()}`;
      const code = cleanCode(m.room);
      if (code) {
        const room = rooms.get(code);
        if (!room) { c.room = null; send(ws, noRoom(code)); return; }
        c.room = room;
      } else {
        c.room = soloFor(c.token);
      }
      c.id = c.room.idForToken(c.token);
      if (c.id) { c.room.setConnected(c.id, true); if (typeof m.motion === 'boolean') c.room.setMotion(c.id, m.motion); }
      send(ws, c.room.me(c.id));
      return;
    }
    if (c.role === 'admin' && m.t === 'create') {
      const pw = String(m.password ?? '');
      if (!pw.trim()) { send(ws, { t: 'auth', ok: false, error: 'CHOOSE A PASSWORD' }); return; }
      const room = new Room(newCode());
      rooms.set(room.code, room);
      lastSeen.set(room, Date.now());
      const salt = randomBytes(16);
      passwords.set(room, { salt, hash: hashPw(pw.slice(0, 200), salt) });
      c.host = true; c.room = room;
      send(ws, { t: 'auth', ok: true, code: room.code, exists: true, token: tokenFor(room.code) });
      send(ws, adminState(c));
      return;
    }
    if (c.role === 'admin' && m.t === 'unlock') {
      const now = Date.now();
      const code = cleanCode(m.room);
      const f = fails.get(c.ip) ?? { n: 0, until: 0 };
      if (f.until > now) { send(ws, { t: 'auth', ok: false, code, error: 'TOO MANY TRIES', retryIn: Math.ceil((f.until - now) / 1000) }); return; }
      const room = rooms.get(code);
      const rec = room ? passwords.get(room) : undefined;
      const good = !!rec && timingSafeEqual(hashPw(String(m.password ?? '').slice(0, 200), rec.salt), rec.hash);
      if (good && room) {
        fails.delete(c.ip);
        c.host = true; c.room = room;
        send(ws, { t: 'auth', ok: true, code, exists: true, token: tokenFor(code) });
        send(ws, adminState(c));
      } else {
        f.n++;
        if (f.n >= MAX_FAILS) f.until = now + LOCK_MS * Math.min(8, 2 ** (f.n - MAX_FAILS));
        fails.set(c.ip, f);
        send(ws, { t: 'auth', ok: false, code, exists: !!room, error: f.until > now ? 'TOO MANY TRIES' : room ? 'WRONG PASSWORD' : 'NO SUCH ROOM', retryIn: f.until > now ? Math.ceil((f.until - now) / 1000) : undefined });
      }
      return;
    }
    const room = c.room;
    if (!room) return;
    if (c.role === 'screen' || c.role === 'admin') {
      // only the room's unlocked host may run it (projectors only in open/test mode)
      const allowed = c.role === 'admin' ? c.host : c.screenOk;
      if (!allowed) return;
      if (m.t === 'start') room.start();
      else if (m.t === 'reset') room.reset();
      else if (c.role === 'admin' && m.t === 'kick') room.kick(String(m.id));
      else if (c.role === 'admin' && m.t === 'settings' && m.settings && typeof m.settings === 'object') room.updateSettings(m.settings);
      return;
    }
    if (c.role !== 'phone') return;
    if (m.t === 'join') {
      c.id = room.join(c.token, String(m.name ?? ''), Number(m.seed) || 0);
      send(ws, room.me(c.id));
      return;
    }
    if (!c.id) return;
    switch (m.t) {
      case 'press': room.press(c.id); break;
      case 'release': room.release(c.id); break;
      case 'tap': room.tap(c.id); break;
      case 'vote': if (m.choice === 'crown' || m.choice === 'keep') room.vote(c.id, m.choice); break;
      case 'shake': room.shake(c.id, Number(m.e)); break;
      case 'caps': room.setMotion(c.id, !!m.motion); break;
      case 'rule': room.pickRule(c.id, m.rule); break;
      case 'power': room.usePower(c.id, m.power); break;
      case 'pong': if (m.n === c.pingN && c.pingAt) room.setLatency(c.id, (Date.now() - c.pingAt) / 1000); break;
      case 'solo':
        if (m.op === 'start') room.soloStart(Number(m.level));
        else if (m.op === 'menu') room.soloMenu();
        break;
    }
  }

  function adminState(c: Client): AdminState {
    const counts = new Map<Room, number>();
    for (const o of clients.values()) if (o.role === 'screen' && o.room) counts.set(o.room, (counts.get(o.room) ?? 0) + 1);
    const r = c.room;
    return {
      t: 'admin',
      // other rooms stay private: an unlocked host only ever sees its own
      rooms: [...rooms.values()].filter((x) => open || x === r).map((x) => ({ code: x.code, phase: x.phase, humans: x.humans.length, screens: counts.get(x) ?? 0 })),
      room: r ? {
        code: r.code, phase: r.phase, timeLeft: r.timeLeft, settings: r.settings,
        players: [...r.players.values()].map((p) => ({ id: p.id, name: p.name, npc: p.npc, connected: p.connected, state: p.state, score: p.score, x: p.x })),
      } : null,
      ai: voice.stats(),
    };
  }

  // ---------- the clock ----------
  const tickMs = { last: 0, max: 0, avg: 0 };
  let last = Date.now();
  let snapAcc = 0;
  let adminAcc = 0;
  let pingAcc = 0;
  let pingN = 0;
  const timer = setInterval(() => {
    const t0 = performance.now();
    const now = Date.now();
    const dt = Math.min(0.1, (now - last) / 1000) * speed;
    last = now;
    snapAcc += dt / speed; adminAcc += dt / speed; pingAcc += dt / speed;

    const live = new Set<Room>();
    for (const c of clients.values()) if (c.room) live.add(c.room);
    for (const room of [...rooms.values(), ...solos.values()]) {
      if (live.has(room)) lastSeen.set(room, now);
      room.tick(dt);
      director.pump(room);
      const evs = room.drainEvents();
      if (evs.length) for (const [ws, c] of clients) if (c.room === room && c.role === 'screen') for (const e of evs) send(ws, e);
    }
    if (snapAcc >= 1 / T.SNAP_HZ) {
      // carry the remainder: 20 Hz ticks then give a steady 15 Hz (resetting to 0 would give 10 Hz)
      snapAcc = Math.min(snapAcc - 1 / T.SNAP_HZ, 1 / T.SNAP_HZ);
      const snaps = new Map<Room, ServerMsg>();
      for (const [ws, c] of clients) {
        if (!c.room) continue;
        if (c.role === 'screen') {
          let s = snaps.get(c.room);
          if (!s) { s = c.room.snapshot(); snaps.set(c.room, s); }
          send(ws, s);
        } else if (c.role === 'phone') send(ws, c.room.me(c.id));
      }
    }
    if (adminAcc >= 0.5) {
      adminAcc = 0;
      for (const [ws, c] of clients) if (c.role === 'admin' && c.host) send(ws, adminState(c));
    }
    if (pingAcc >= 2) {
      pingAcc = 0;
      pingN++;
      for (const [ws, c] of clients) if (c.role === 'phone' && c.id) { c.pingN = pingN; c.pingAt = now; send(ws, { t: 'ping', n: pingN }); }
    }
    // forget rooms nobody has looked at for a while
    for (const [code, room] of rooms) if (now - (lastSeen.get(room) ?? now) > ROOM_IDLE_MS && !live.has(room)) rooms.delete(code);
    for (const [tok, room] of solos) {
      if (!lastSeen.has(room)) lastSeen.set(room, now);
      if (now - lastSeen.get(room)! > SOLO_IDLE_MS && !live.has(room)) solos.delete(tok);
    }
    const ms = performance.now() - t0;
    tickMs.last = ms;
    tickMs.max = Math.max(tickMs.max, ms);
    tickMs.avg = tickMs.avg * 0.95 + ms * 0.05;
  }, 1000 / T.TICK_HZ);

  const close = () => { clearInterval(timer); for (const ws of clients.keys()) ws.terminate(); wss.close(); };
  http.on('close', close);
  if (opts.log !== false) {
    const s = voice.stats();
    if (!open) console.log('[game] host dashboard: /admin.html (each room has its own password)');
    if (!s.keyPresent) console.warn('\n[game] ANTHROPIC_API_KEY is not set: Gus will use scripted lines only. Copy .env.example to .env and add your key.\n');
    else console.log(`[game] Claude voice: ${s.model}${s.enabled ? '' : ' (disabled: scripted lines only)'}`);
  }
  return { rooms, solos, voice, close, tickMs };
}
