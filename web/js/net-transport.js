// Live multiplayer transport. Drop-in for RehearsalTransport: same methods, same room render state,
// but the game server (server/) runs the rules and decides every catch.
//
// It is used automatically when the page is served by the game server (it serves /socket.io/).
// Served by scripts/serve.mjs, or with ?offline, the local RehearsalTransport is used instead.
// Guard mode needs ?key=… in the page URL; without a valid key it falls back to the local rehearsal.
import { RehearsalTransport } from './rehearsal.js';
import { CONFIG as C, ROOMS } from './config.js';
import { nearbyCover } from './cover.js';
import { BEAM_HZ, MSG, PROTOCOL_VERSION, decodeLight, decodePlayer } from './net-protocol.js';

const params = new URLSearchParams(location.search);
let io = null;
if (!params.has('offline')) {
  try {
    ({ io } = await import('/socket.io/socket.io.esm.min.js'));
  } catch {
    io = null; // static preview server: no game server here
  }
}
export const LIVE = !!io;
const ID_KEY = 'frame-escape.playerId';

/** Use this instead of `new RehearsalTransport(...)`. Explore mode always stays local. */
export function createTransport(character, mode, { explore = false } = {}) {
  return LIVE && !explore ? new NetworkTransport(character, mode) : new RehearsalTransport(character, mode);
}

function emptyRoom(design) {
  // The scene needs at least one player (it follows the leader with players.reduce), so a gallery starts
  // with one placeholder ghost until the server's roster arrives and replaces it.
  const placeholder = { id: `waiting-${design}`, character: 'fox', bot: true, human: false, roomId: design, x: 0, saved: 0, dir: 0, freeze: 0, escapedAt: null, caught: 0, hidden: true, coverProgress: 0, exposure: 0 };
  return { id: design, t: 0, charges: C.maxCharges, recharge: 0, light: null, catches: 0, ended: false, events: [], players: [placeholder], live: true, phase: 'lobby', startsIn: 0, podium: [], rank: 0, of: 0 };
}

/**
 * Events: 'roster' (players in the shown gallery changed — re-run gameView.syncActors),
 *         'offline' (guard key rejected or no server — now running the local rehearsal).
 * Extra room fields: live, phase ('lobby'|'countdown'|'play'|'results'), startsIn (s), podium (ids), rank, of.
 * Player mode: only you have bot:false; everyone else is bot:true with human:true/false for real people.
 */
export class NetworkTransport extends EventTarget {
  constructor(character, mode) {
    super();
    this.character = character;
    this.mode = mode;
    this.role = mode === 'player' ? 'player' : mode === 'guard' ? 'guard' : 'screen';
    this.rooms = ROOMS.map((_, i) => emptyRoom(i));
    this.room = 0;
    this.connected = false;
    this.me = null;
    this.myInstance = null;
    this.wantJoin = false;
    this.sawPlay = false;
    this.localDir = 0;
    this.shown = new Map(); // gallery instance id → index in this.rooms
    this.pending = ROOMS.map(() => []);
    this.offset = -Infinity;
    this.lastBeam = 0;
    this.fallback = null;
    this.socket = io({ auth: { role: this.role, key: params.get('key') ?? undefined, v: PROTOCOL_VERSION } });
    this.socket.on('connect', () => {
      this.connected = true;
      if (this.role !== 'player') return;
      let id;
      try {
        id = localStorage.getItem(ID_KEY) ?? undefined;
      } catch {}
      this.send({ t: 'hello', playerId: id });
      if (this.wantJoin) this.send({ t: 'join', room: this.room, character: this.character });
    });
    this.socket.on('disconnect', () => (this.connected = false));
    this.socket.on(MSG, (m) => this.onMessage(m));
  }

  // ───── RehearsalTransport interface ─────

  input(dir) {
    if (this.fallback) return this.fallback.input(dir);
    this.localDir = Math.sign(dir);
    const me = this.self();
    if (me && !this.localDir && me.freeze <= 0 && me.coverId === undefined) {
      const f = C.frames.reduce((a, b) => (Math.abs(b - me.x) < Math.abs(a - me.x) ? b : a), 0);
      if (Math.abs(f - me.x) <= C.snapRadius) me.x = f; // same snap the server applies, without waiting for it
    }
    this.send({ t: 'input', dir: this.localDir });
  }

  cover() {
    if (this.fallback) return this.fallback.cover();
    const me = this.self();
    const room = this.rooms[this.room];
    if (!me || room.phase !== 'play' || room.ended || me.freeze > 0 || me.escapedAt !== null) return false;
    if (me.coverId === undefined && !nearbyCover(me.x, this.room)) return false;
    this.send({ t: 'cover' });
    return true;
  }

  hold() {
    if (this.fallback) return this.fallback.hold();
    this.send({ t: 'hold' });
  }

  switchRoom(id) {
    if (this.fallback) return this.fallback.switchRoom(id);
    this.room = id;
    if (this.role === 'player') {
      this.wantJoin = true;
      this.send({ t: 'join', room: id, character: this.character });
    } else if (this.role === 'guard') this.send({ t: 'watch', room: id });
  }

  target() {
    return false; // the sector guard is local-only; the live guard uses the free-roam beam
  }

  update(dt, beam = null) {
    if (this.fallback) return this.fallback.update(dt, beam);
    if (this.role === 'guard' && beam && this.connected) {
      const now = performance.now();
      if (now - this.lastBeam >= 1000 / BEAM_HZ) {
        this.lastBeam = now;
        this.send({ t: 'beam', origin: beam.origin, direction: beam.direction, exposing: !!beam.exposing });
      }
    }
    for (const room of this.rooms) {
      if (room.phase === 'lobby' || room.phase === 'countdown') room.startsIn = Math.max(0, (room.endsAt - this.serverNow()) / 1000);
      for (const p of room.players) this.smooth(room, p, dt);
    }
    const room = this.rooms[this.room];
    room.events = this.pending[this.room];
    this.pending = ROOMS.map(() => []);
    return room;
  }

  close() {
    this.fallback?.close();
    this.socket.disconnect();
  }

  // ───── internals ─────

  send(m) {
    if (this.connected) this.socket.emit(MSG, m);
  }

  self() {
    return this.me ? this.rooms[this.room].players.find((p) => p.id === this.me) : undefined;
  }

  serverNow() {
    return Date.now() + (Number.isFinite(this.offset) ? this.offset : 0);
  }

  onMessage(m) {
    switch (m.t) {
      case 'welcome':
        this.me = m.you.id;
        this.myInstance = m.room;
        this.room = m.design;
        this.shown = new Map([[m.room, m.design]]);
        try {
          localStorage.setItem(ID_KEY, m.you.id);
        } catch {}
        for (const p of this.rooms[m.design].players) p.bot = p.id !== this.me;
        break;
      case 'rooms':
        if (this.role !== 'player') {
          this.shown = new Map();
          for (const r of m.rooms) if (![...this.shown.values()].includes(r.design)) this.shown.set(r.id, r.design);
        }
        break;
      case 'roster': {
        const i = this.shown.get(m.room);
        if (i === undefined) return;
        const room = this.rooms[i];
        const old = new Map(room.players.map((p) => [p.id, p]));
        room.players = m.players.map((r) => {
          const p = old.get(r.id) ?? { id: r.id, x: 0, _tx: 0, saved: 0, dir: 0, freeze: 0, escapedAt: null, caught: 0, hidden: true, coverProgress: 0, exposure: 0 };
          p.character = r.character;
          p.roomId = i;
          p.human = !r.bot;
          p.bot = this.role === 'player' ? r.id !== this.me : r.bot;
          return p;
        });
        this.dispatchEvent(new CustomEvent('roster', { detail: { room: i } }));
        break;
      }
      case 'snap': {
        const i = this.shown.get(m.room);
        if (i === undefined) return;
        this.offset = Math.max(this.offset, m.now - Date.now());
        const room = this.rooms[i];
        if (m.phase === 'play') this.sawPlay = true;
        if (m.phase === 'lobby' && room.phase !== 'lobby') room.podium = [];
        room.phase = m.phase;
        room.endsAt = m.endsAt;
        room.t = m.rt;
        room.charges = m.ch;
        room.recharge = m.rc;
        room.catches = m.ca;
        room.light = decodeLight(m.li);
        // Someone who joins during the results screen waits for the next round instead of seeing results.
        room.ended = (!!m.en || m.phase === 'results') && (this.role !== 'player' || this.sawPlay);
        const n = Math.min(m.p.length, room.players.length);
        for (let k = 0; k < n; k++) decodePlayer(m.p[k], room.players[k]);
        if (m.ev?.length) this.pending[i].push(...m.ev);
        break;
      }
      case 'me': {
        const room = this.rooms[this.room];
        room.rank = m.rank;
        room.of = m.of;
        break;
      }
      case 'guard':
        this.guardRoom = m.design;
        break;
      case 'result': {
        const i = this.shown.get(m.room);
        if (i !== undefined) this.rooms[i].podium = m.podium;
        break;
      }
      case 'error':
        if (m.reason === 'guard-key' || m.reason === 'role') this.goOffline(m.reason);
        break;
    }
  }

  goOffline(reason) {
    if (this.fallback) return;
    this.fallback = new RehearsalTransport(this.character, this.mode);
    this.fallback.switchRoom(this.room);
    this.rooms = this.fallback.rooms;
    this.dispatchEvent(new CustomEvent('offline', { detail: { reason } }));
  }

  /** Server positions arrive 10×/s: ease toward them. Your own runner is predicted locally. */
  smooth(room, p, dt) {
    if (p._tx === undefined) return;
    const k = 1 - Math.exp(-dt * 12);
    if (this.role === 'player' && p.id === this.me) {
      const free = room.phase === 'play' && !room.ended && p.freeze <= 0 && p.coverId === undefined && p.escapedAt === null;
      const err = p._tx - p.x;
      if (!free || Math.abs(err) > 0.8) p.x = free ? p._tx : p.x + err * k;
      else if (this.localDir) {
        p.x = Math.max(0, Math.min(C.exit, p.x + this.localDir * C.speed * dt));
        p.dir = this.localDir;
      } else p.x += err * (1 - Math.exp(-dt * 8));
      if (p.freeze > 0) p.x = p._tx;
    } else {
      const d = p._tx - p.x;
      p.x = Math.abs(d) > 1.5 ? p._tx : p.x + d * k;
    }
    if (p._tc !== undefined && p.coverId !== undefined) p.coverProgress += (p._tc - p.coverProgress) * k;
  }
}
