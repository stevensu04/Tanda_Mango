// The authoritative multiplayer game. It runs Wesley's rules from web/js unchanged (tick, cover, beam
// exposure, venue collision), adds many real players per gallery, bot fill, a shared round clock,
// the roaming human guard and reconnects, and decides what is sent to whom.
import { CONFIG as C, ROOMS } from '../web/js/config.js';
import { tick, nearestFrame, rankHumans } from '../web/js/rehearsal.js';
import { requestCover } from '../web/js/cover.js';
import { inVenue, LIGHT_RULES } from '../web/js/venue.js';
import { SNAP_HZ, TICK_HZ, HOLD_TIMEOUT, encodePlayer, encodeLight } from '../web/js/net-protocol.js';

const ROOM_MIN = 12; // galleries are topped up with ghost visitors to this size
const CHARACTERS = ['fox', 'rabbit', 'bear'];
const COUNTDOWN_MS = 3000;
const FORGET_AFTER_MS = 60_000;
const BEAM_STALE_MS = 400;

/**
 * @typedef {{ room(id: string, msg: object): void, player(id: string, msg: object): void, all(msg: object): void }} Transport
 * @typedef {{ mode?: 'auto'|'manual', lobbyMs?: number, resultsMs?: number, roomMax?: number, now?: () => number, rand?: () => number }} Options
 */
export class Game {
  /** @param {Transport} out @param {Options} opts */
  constructor(out, opts = {}) {
    this.out = out;
    this.mode = opts.mode ?? 'auto';
    this.lobbyMs = opts.lobbyMs ?? 10_000;
    this.resultsMs = opts.resultsMs ?? 10_000;
    this.roomMax = opts.roomMax ?? 25;
    this.now = opts.now ?? Date.now;
    this.rand = opts.rand ?? Math.random;
    this.phase = 'lobby';
    this.phaseEndsAt = 0; // 0 = waiting (for a player in auto mode, for the admin in manual mode)
    this.roundStart = 0;
    /** @type {{id: string, design: number, name: string, room: any, pending: object[]}[]} */
    this.instances = ROOMS.map((_, design) => this.makeInstance(design, 0));
    /** @type {Map<string, {p: any, inst: any, connected: boolean, lastSeen: number, lastHold: number}>} */
    this.seats = new Map();
    this.guard = { sockets: 0, inst: null, beam: null, beamAt: 0, pos: null, posAt: 0, catches: 0 };
    this.seq = 0;
    this.nextSnap = 0;
    this.nextMe = 0;
  }

  start() {
    this.timer = setInterval(() => this.step(), 1000 / TICK_HZ);
  }

  stop() {
    clearInterval(this.timer);
  }

  // ───────────── players ─────────────

  has(id) {
    return this.seats.has(id);
  }

  instanceOf(id) {
    return this.seats.get(id)?.inst.id;
  }

  /** Join (or move to) a gallery. Returns the player id; call welcome() once the connection is bound. */
  join(design, character, existingId) {
    design = Number.isInteger(design) && design >= 0 && design < ROOMS.length ? design : 0;
    character = CHARACTERS.includes(character) ? character : 'fox';
    let seat = existingId ? this.seats.get(existingId) : undefined;
    if (seat && seat.inst.design === design) return seat.p.id;
    if (seat) this.removeFromRoom(seat);
    const inst = this.pickInstance(design);
    const id = seat?.p.id ?? `p${(++this.seq).toString(36)}${Math.floor(this.rand() * 1e8).toString(36)}`;
    const p = this.makeHuman(id, character, design);
    // Late joiners start at the spawn frame; real players go before the ghosts.
    const firstBot = inst.room.players.findIndex((q) => q.bot);
    inst.room.players.splice(firstBot < 0 ? inst.room.players.length : firstBot, 0, p);
    seat = { p, inst, connected: false, lastSeen: this.now(), lastHold: 0 };
    this.seats.set(id, seat);
    if (this.phase !== 'play') this.fillBots(inst);
    this.sendRoster(inst);
    return id;
  }

  welcome(id) {
    const seat = this.seats.get(id);
    if (!seat) return;
    seat.connected = true;
    seat.lastSeen = this.now();
    const { inst, p } = seat;
    this.out.player(id, { t: 'welcome', you: { id, character: p.character }, room: inst.id, design: inst.design, name: inst.name });
    this.out.player(id, this.rosterMsg(inst));
    this.out.player(id, this.guardMsg());
    this.out.player(id, this.snapMsg(inst, this.now(), []));
  }

  disconnect(id) {
    const seat = this.seats.get(id);
    if (!seat) return;
    seat.connected = false;
    seat.lastSeen = this.now();
    this.setPlayerInput(seat, 0);
  }

  input(id, dir) {
    const seat = this.seats.get(id);
    if (!seat || ![-1, 0, 1].includes(dir)) return;
    seat.lastHold = this.now();
    if (this.phase === 'play') this.setPlayerInput(seat, dir);
  }

  hold(id) {
    const seat = this.seats.get(id);
    if (seat) seat.lastHold = this.now();
  }

  cover(id) {
    const seat = this.seats.get(id);
    if (seat && this.phase === 'play' && !seat.inst.room.ended) requestCover(seat.p);
  }

  /** Wesley's setInput, for one specific player rather than "the" human. */
  setPlayerInput(seat, dir) {
    const { p, inst } = seat;
    if (p.escapedAt !== null || inst.room.ended) return;
    p.dir = Math.sign(dir);
    if (dir && p.coverId !== undefined) p.coverTarget = 0;
    if (!dir && p.freeze <= 0) {
      const f = nearestFrame(p.x);
      if (Math.abs(f - p.x) <= C.snapRadius) {
        p.x = f;
        p.saved = f;
      }
    }
  }

  // ───────────── observers, guard, admin ─────────────

  observerInit() {
    const now = this.now();
    return [this.roomsMsg(), ...this.instances.map((i) => this.rosterMsg(i)), ...this.instances.map((i) => this.snapMsg(i, now, [])), this.guardMsg()];
  }

  guardConnected() {
    this.guard.sockets++;
    if (!this.guard.inst) this.guard.inst = this.instances[0];
    this.out.all(this.guardMsg());
  }

  guardDisconnected() {
    this.guard.sockets = Math.max(0, this.guard.sockets - 1);
    if (!this.guard.sockets) {
      Object.assign(this.guard, { inst: null, beam: null, pos: null });
      this.out.all(this.guardMsg());
    }
  }

  watch(design) {
    if (!this.guard.sockets) return;
    const inst = this.instances.find((i) => i.design === design);
    if (!inst) return;
    Object.assign(this.guard, { inst, beam: null, pos: null });
    this.out.all(this.guardMsg());
  }

  /**
   * The guard's flashlight. The client proposes origin/direction; the server only accepts an origin that
   * moved no faster than walking speed and sits inside the venue, normalises the direction, and then
   * Wesley's updateExposure decides catches with its own line-of-sight test.
   */
  beam(b) {
    if (!this.guard.sockets || !b || typeof b !== 'object') return;
    const o = b.origin;
    const d = b.direction;
    const nums = [o?.x, o?.y, o?.z, d?.x, d?.y, d?.z];
    if (!nums.every(Number.isFinite)) return;
    const len = Math.hypot(d.x, d.y, d.z);
    if (len < 1e-6) return;
    const now = this.now();
    let { x, z } = o;
    const g = this.guard;
    if (g.pos) {
      const dt = Math.max(0.02, (now - g.posAt) / 1000);
      const max = LIGHT_RULES.speed * 1.5 * dt + 0.6; // walking speed + lens offset/jitter allowance
      const dist = Math.hypot(x - g.pos.x, z - g.pos.z);
      if (dist > max) {
        x = g.pos.x + ((x - g.pos.x) / dist) * max;
        z = g.pos.z + ((z - g.pos.z) / dist) * max;
      }
    }
    if (!inVenue(x, z, 0)) {
      if (!g.pos) return; // never accept a first position inside a wall
      ({ x, z } = g.pos); // the lens poked into a wall: keep the last good position
    }
    g.pos = { x, z };
    g.posAt = now;
    g.beam = {
      origin: { x, y: Math.max(0.8, Math.min(2.2, o.y)), z },
      direction: { x: d.x / len, y: d.y / len, z: d.z / len },
      exposing: !!b.exposing,
    };
    g.beamAt = now;
  }

  admin(m) {
    const now = this.now();
    if (m?.t === 'start' && this.phase === 'lobby') this.setPhase('countdown', now + COUNTDOWN_MS);
    else if (m?.t === 'reset') this.toLobby(now);
    else if (m?.t === 'mode' && (m.mode === 'auto' || m.mode === 'manual')) {
      this.mode = m.mode;
      if (this.phase === 'lobby') this.setPhase('lobby', this.lobbyDeadline(now));
    }
  }

  stats() {
    return {
      phase: this.phase,
      mode: this.mode,
      endsInMs: this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.now()) : null,
      galleries: this.instances.map((i) => ({
        id: i.id,
        name: i.name,
        people: i.room.players.filter((p) => !p.bot).length,
        ghosts: i.room.players.filter((p) => p.bot).length,
        t: Number(i.room.t.toFixed(1)),
        catches: i.room.catches,
      })),
      connected: [...this.seats.values()].filter((s) => s.connected).length,
      guard: this.guard.sockets ? { gallery: this.guard.inst?.id, catches: this.guard.catches } : null,
    };
  }

  // ───────────── the loop ─────────────

  step() {
    const now = this.now();
    this.lifecycle(now);
    if (this.phase === 'play') {
      const dt = 1 / TICK_HZ;
      for (const inst of this.instances) {
        const room = inst.room;
        if (room.ended) continue;
        for (const seat of this.seats.values()) {
          if (seat.inst === inst && seat.p.dir && now - seat.lastHold > HOLD_TIMEOUT * 1000) this.setPlayerInput(seat, 0);
        }
        const watched = this.guard.sockets > 0 && this.guard.inst === inst;
        const beam = watched && now - this.guard.beamAt < BEAM_STALE_MS ? this.guard.beam : null;
        tick(room, dt, { autoGuard: !watched, beam });
        if (room.events.length) {
          inst.pending.push(...room.events);
          if (watched) {
            const caught = room.events.filter((e) => e.type === 'caught').length;
            if (caught) {
              this.guard.catches += caught;
              this.out.all(this.guardMsg());
            }
          }
        }
      }
      if (this.instances.every((i) => i.room.ended)) this.endRound(now);
    }
    if (now >= this.nextSnap) {
      this.nextSnap = now + 1000 / SNAP_HZ;
      for (const inst of this.instances) {
        this.out.room(inst.id, this.snapMsg(inst, now, inst.pending));
        inst.pending = [];
      }
    }
    if (now >= this.nextMe) {
      this.nextMe = now + 250;
      for (const [id, seat] of this.seats) {
        if (!seat.connected) continue;
        const ranked = rankHumans(seat.inst.room.players);
        this.out.player(id, { t: 'me', rank: ranked.indexOf(seat.p) + 1, of: ranked.length });
      }
    }
  }

  lifecycle(now) {
    if (this.phase === 'lobby' && !this.phaseEndsAt) {
      const deadline = this.lobbyDeadline(now);
      if (deadline) this.setPhase('lobby', deadline);
    }
    if (!this.phaseEndsAt || now < this.phaseEndsAt) return;
    if (this.phase === 'lobby') this.setPhase('countdown', now + COUNTDOWN_MS);
    else if (this.phase === 'countdown') {
      this.roundStart = now;
      this.setPhase('play', now + C.duration * 1000);
    } else if (this.phase === 'results') this.toLobby(now);
    // 'play' ends when every gallery's own 45 s clock runs out (endRound).
  }

  /** Auto mode loops once anyone is here to play: a connected player, or a judge on the guard page alone. */
  lobbyDeadline(now) {
    if (this.mode === 'manual') return 0;
    const someone = this.guard.sockets > 0 || [...this.seats.values()].some((s) => s.connected);
    return someone ? now + this.lobbyMs : 0;
  }

  endRound(now) {
    for (const inst of this.instances) {
      const podium = rankHumans(inst.room.players)
        .filter((p) => p.escapedAt !== null)
        .slice(0, 3)
        .map((p) => p.id);
      this.out.room(inst.id, { t: 'result', room: inst.id, podium });
    }
    this.setPhase('results', now + this.resultsMs);
  }

  toLobby(now) {
    for (const [id, seat] of this.seats) {
      if (!seat.connected && now - seat.lastSeen > FORGET_AFTER_MS) {
        this.removeFromRoom(seat);
        this.seats.delete(id);
      }
    }
    // Overflow galleries nobody is in any more are closed; the four main galleries always stay.
    const before = this.instances.length;
    this.instances = this.instances.filter((i, n) => n < ROOMS.length || i.room.players.some((p) => !p.bot));
    if (this.instances.length !== before) this.out.all(this.roomsMsg());
    if (this.guard.inst && !this.instances.includes(this.guard.inst)) this.guard.inst = this.instances[0];
    for (const inst of this.instances) {
      const humans = inst.room.players.filter((p) => !p.bot);
      inst.room = this.makeRoom(inst.design);
      for (const old of humans) {
        const fresh = this.makeHuman(old.id, old.character, inst.design);
        inst.room.players.push(fresh);
        const seat = this.seats.get(old.id);
        if (seat) seat.p = fresh;
      }
      this.fillBots(inst);
      inst.pending = [];
      this.sendRoster(inst);
    }
    this.guard.catches = 0;
    this.out.all(this.guardMsg());
    this.setPhase('lobby', this.lobbyDeadline(now));
  }

  setPhase(phase, endsAt) {
    this.phase = phase;
    this.phaseEndsAt = endsAt;
    const now = this.now();
    for (const inst of this.instances) this.out.room(inst.id, this.snapMsg(inst, now, []));
  }

  // ───────────── galleries ─────────────

  makeRoom(design) {
    // Same shape as Wesley's makeRoom; room.id is the gallery design (cabinet rules, patrol timing).
    return { id: design, t: 0, charges: C.maxCharges, recharge: 0, light: null, catches: 0, nextLight: 3.1, ended: false, events: [], players: [] };
  }

  makeInstance(design, n) {
    const inst = {
      id: n ? `g${design}${String.fromCharCode(97 + n)}` : `g${design}`,
      design,
      name: n ? `${ROOMS[design]} · ${String.fromCharCode(65 + n)}` : ROOMS[design],
      room: this.makeRoom(design),
      pending: [],
    };
    this.fillBots(inst);
    return inst;
  }

  pickInstance(design) {
    const humans = (i) => i.room.players.filter((p) => !p.bot).length;
    const open = this.instances.find((i) => i.design === design && humans(i) < this.roomMax);
    if (open) return open;
    const n = this.instances.filter((i) => i.design === design).length;
    const inst = this.makeInstance(design, n);
    if (this.phase === 'play') inst.room.t = (this.now() - this.roundStart) / 1000; // keep the shared clock
    this.instances.push(inst);
    this.out.all(this.roomsMsg());
    return inst;
  }

  makeHuman(id, character, design) {
    return { roomId: design, id, character, bot: false, x: 0, saved: 0, dir: 0, freeze: 0, escapedAt: null, caught: 0, hidden: true, delay: 0.15 };
  }

  fillBots(inst) {
    const players = inst.room.players;
    const humans = players.filter((p) => !p.bot);
    const bots = players.filter((p) => p.bot);
    const want = Math.max(0, ROOM_MIN - humans.length);
    while (bots.length > want) bots.pop();
    while (bots.length < want) {
      const i = humans.length + bots.length;
      bots.push({ roomId: inst.design, id: `${inst.id}-b${i}`, character: CHARACTERS[i % 3], bot: true, x: 0, saved: 0, dir: 0, freeze: 0, escapedAt: null, caught: 0, hidden: true, delay: 0.15 + (i % 5) * 0.12 });
    }
    inst.room.players = [...humans, ...bots];
  }

  removeFromRoom(seat) {
    const players = seat.inst.room.players;
    const i = players.indexOf(seat.p);
    if (i >= 0) players.splice(i, 1);
    if (this.phase !== 'play') this.fillBots(seat.inst);
    this.sendRoster(seat.inst);
  }

  // ───────────── messages ─────────────

  sendRoster(inst) {
    this.out.room(inst.id, this.rosterMsg(inst));
  }

  roomsMsg() {
    return { t: 'rooms', rooms: this.instances.map((i) => ({ id: i.id, design: i.design, name: i.name })) };
  }

  rosterMsg(inst) {
    return { t: 'roster', room: inst.id, design: inst.design, players: inst.room.players.map((p) => ({ id: p.id, character: p.character, bot: p.bot })) };
  }

  guardMsg() {
    const inst = this.guard.sockets ? this.guard.inst : null;
    return { t: 'guard', room: inst?.id ?? null, design: inst?.design ?? null, catches: this.guard.catches };
  }

  snapMsg(inst, now, events) {
    const r = inst.room;
    return {
      t: 'snap',
      room: inst.id,
      now,
      phase: this.phase,
      endsAt: this.phaseEndsAt,
      rt: Math.round(r.t * 100) / 100,
      ch: Math.round(r.charges * 100) / 100,
      rc: Math.round(r.recharge * 100) / 100,
      ca: r.catches,
      li: encodeLight(r.light),
      en: r.ended ? 1 : 0,
      p: r.players.map(encodePlayer),
      ev: events,
    };
  }
}
