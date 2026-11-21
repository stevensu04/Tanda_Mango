import { T, type GusPhase, type RoundPhase, type PlayerState, type Rule, type Snapshot, type Me, type GameEvent, type PubPlayer, type Reveal, type PhoneRole } from '../shared/protocol';

/**
 * Authoritative game state for one room. Pure logic: no sockets, no timers.
 * The transport calls tick(dt) at T.TICK_HZ and forwards messages to the methods below.
 */

interface Player {
  id: string;
  token: string;
  name: string;
  seed: number;
  joinOrder: number;
  x: number;
  state: PlayerState;
  holding: boolean;
  needFreshPress: boolean;  // after a challenge: ignore the old hold until a new press
  moving: boolean;
  caughtLeft: number;
  microTaps: number;
  result: { pass: boolean; line: string } | null;
  resultLeft: number;
  entryOrder: number;       // 1 = first in, 0 = outside
  score: number;
  rushed: boolean;          // came in when the rope snapped
  pushTaps: number;
  voted: boolean;
  tapsThisSecond: number;
  connected: boolean;
  stats: { caught: number; passes: number; bestMicro: number };
}

const PASS_LINES = ['...FINE. KEEP WALKING.', 'THAT WAS ALMOST DANCING. GO ON.', 'I SAW NOTHING. MOVE.'];
const FAIL_LINES = ['MY NAN SHAKES HARDER AT BINGO. BACK OF THE LINE.', 'NOPE. START AGAIN, LEGEND.', 'WAS THAT A BRIBE OR A SNEEZE? OUT.'];

export class Room {
  players = new Map<string, Player>();
  phase: RoundPhase = 'lobby';
  clock = 0;               // seconds since round start
  gus: GusPhase = 'back';
  private gusLeft = 3.5;
  private watchT = 0;
  private napDone = false;
  rule: Rule = null;
  ruleBy: string | null = null;
  ownerId: string | null = null;
  ownerPickLeft = 0;
  private entries = 0;
  private joins = 0;
  private push = { crowd: 0, defend: 0 };
  ropeSnapped: boolean | null = null;
  private ownerBeforeVote: string | null = null;
  private voteStart = 0;
  reveal: Reveal | null = null;
  private events: GameEvent[] = [];
  private rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  // ---------- membership ----------
  /** Returns the player id for this token, creating nothing until join(). */
  idForToken(token: string): string | null {
    for (const p of this.players.values()) if (p.token === token) return p.id;
    return null;
  }

  join(token: string, name: string, seed: number): string {
    const existing = this.idForToken(token);
    if (existing) {
      const p = this.players.get(existing)!;
      p.name = this.uniqueName(cleanName(name), existing);
      p.seed = seed | 0;
      p.connected = true;
      return existing;
    }
    const id = `p${++this.joins}`;
    this.players.set(id, {
      id, token, name: this.uniqueName(cleanName(name), id), seed: seed | 0, joinOrder: this.joins,
      x: 0, state: 'outside', holding: false, needFreshPress: false, moving: false,
      caughtLeft: 0, microTaps: 0, result: null, resultLeft: 0,
      entryOrder: 0, score: 0, rushed: false, pushTaps: 0, voted: false, tapsThisSecond: 0,
      connected: true, stats: { caught: 0, passes: 0, bestMicro: 0 },
    });
    return id;
  }

  /** Two phones that rolled the same name get told apart on the projector. */
  private uniqueName(name: string, self: string): string {
    const taken = (n: string) => [...this.players.values()].some((p) => p.id !== self && p.name === n);
    let n = name;
    for (let i = 2; taken(n); i++) n = `${name.slice(0, 10)} ${i}`;
    return n;
  }

  setConnected(id: string, on: boolean) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = on;
    if (!on) p.holding = false;
  }

  // ---------- host ----------
  start() {
    this.phase = 'play';
    this.clock = 0;
    this.gus = 'back';
    this.gusLeft = 3.5;
    this.napDone = false;
    this.rule = null; this.ruleBy = null;
    this.ownerId = null; this.ownerPickLeft = 0;
    this.entries = 0;
    this.push = { crowd: 0, defend: 0 };
    this.ropeSnapped = null;
    this.ownerBeforeVote = null;
    this.reveal = null;
    for (const p of this.players.values()) {
      Object.assign(p, {
        x: 0, state: 'outside', holding: false, needFreshPress: true, moving: false, caughtLeft: 0, microTaps: 0,
        result: null, resultLeft: 0, entryOrder: 0, score: 0, rushed: false, pushTaps: 0, voted: false,
        stats: { caught: 0, passes: 0, bestMicro: 0 },
      });
    }
  }

  reset() {
    this.start();
    this.phase = 'lobby';
  }

  /** Lobby only: forget players whose phones are gone. */
  dropDisconnected() {
    if (this.phase !== 'lobby') return;
    for (const [id, p] of this.players) if (!p.connected) this.players.delete(id);
  }

  // ---------- player input ----------
  press(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.holding = true;
    p.needFreshPress = false;
  }

  release(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.holding = false;
  }

  tap(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.tapsThisSecond++;
    if (p.tapsThisSecond > 20) return; // inhuman rate: ignored (NERD stamp is Tier B)
    if (p.state === 'caught') { p.microTaps++; return; }
    if (this.phase === 'push') { p.pushTaps++; if (p.state === 'lounge') this.push.defend++; else this.push.crowd++; return; }
    // a vote needs a lift and a fresh tap: taps in the first 0.4 s after the rush are leftovers
    if (this.phase === 'vote' && this.clock >= this.voteStart + 0.4 && !p.voted && this.eligibleVoters().includes(p)) { p.voted = true; }
  }

  pickRule(id: string, rule: 'moonwalk') {
    if (id !== this.ownerId || this.rule) return;
    this.setRule(rule, id);
  }

  private setRule(rule: 'moonwalk', by: string) {
    this.rule = rule;
    this.ruleBy = this.players.get(by)?.name ?? null;
    this.ownerPickLeft = 0;
    this.events.push({ t: 'ev', kind: 'rule', rule, by: this.ruleBy ?? '' });
  }

  // ---------- simulation ----------
  get timeLeft() { return Math.max(0, T.ROUND - this.clock); }

  tick(dt: number) {
    if (this.phase === 'lobby' || this.phase === 'reveal') return;
    this.clock += dt;
    // anti-cheat window
    if (Math.floor(this.clock) !== Math.floor(this.clock - dt)) for (const p of this.players.values()) p.tapsThisSecond = 0;

    if (this.phase === 'play' && this.clock >= T.ROUND - T.PUSH - T.VOTE) this.beginPush();
    if (this.phase === 'push' && this.clock >= T.ROUND - T.VOTE) this.beginVote();
    if (this.phase === 'vote' && this.clock >= T.ROUND) { this.finish(); return; }

    if (this.phase === 'play') this.stepGus(dt);

    if (this.ownerPickLeft > 0) {
      this.ownerPickLeft -= dt;
      if (this.ownerPickLeft <= 0 && !this.rule && this.ownerId) this.setRule('moonwalk', this.ownerId);
    }

    for (const p of this.players.values()) {
      if (p.resultLeft > 0) { p.resultLeft -= dt; if (p.resultLeft <= 0) p.result = null; }
      if (p.state === 'caught') {
        p.caughtLeft -= dt;
        if (p.caughtLeft <= 0) this.endChallenge(p);
        continue;
      }
      if (p.state !== 'outside' || this.phase !== 'play') { p.moving = false; continue; }
      // Moonwalk flips the control: release to move, hold to freeze
      const input = p.needFreshPress ? false : this.rule === 'moonwalk' ? !p.holding : p.holding;
      p.moving = input && p.connected;
      if (!p.moving) continue;
      if (this.gus === 'watch') {
        if (this.watchT > T.GRACE) this.catchPlayer(p);
        continue;
      }
      p.x = Math.min(1, p.x + dt / T.TRACK_SECONDS);
      if (p.x >= 1) this.admit(p, false);
    }
  }

  private stepGus(dt: number) {
    // nobody in by 35 s: he naps so the leaders can get through
    if (!this.napDone && !this.ownerId && this.clock >= T.NAP_AT && this.gus === 'back') {
      this.gus = 'sleep'; this.gusLeft = T.NAP_FOR; this.napDone = true;
    }
    this.gusLeft -= dt;
    if (this.gus === 'watch') this.watchT += dt;
    if (this.gusLeft > 0) return;
    const early = this.clock < 25; // sleepy start, sharper later
    switch (this.gus) {
      case 'back': case 'sleep':
        this.gus = 'tell';
        this.gusLeft = early ? 0.8 : 0.55;
        this.events.push({ t: 'ev', kind: 'tell' });
        break;
      case 'tell':
        if (!early && this.rand() < 0.25) { // fake-out
          this.gus = 'back'; this.gusLeft = 1 + this.rand() * 1.5;
        } else {
          this.gus = 'watch'; this.gusLeft = early ? 1.4 : 1.4 + this.rand() * 1.1; this.watchT = 0;
          this.events.push({ t: 'ev', kind: 'turn' });
        }
        break;
      case 'watch':
        this.gus = 'back';
        this.gusLeft = early ? 3 + this.rand() * 1.5 : 1.5 + this.rand() * 2.5;
        break;
    }
  }

  private catchPlayer(p: Player) {
    p.state = 'caught';
    p.caughtLeft = T.MICRO;
    p.microTaps = 0;
    p.moving = false;
    p.stats.caught++;
    this.events.push({ t: 'ev', kind: 'caught', id: p.id, name: p.name });
  }

  private endChallenge(p: Player) {
    const pass = p.microTaps >= T.MICRO_PASS_TAPS;
    p.stats.bestMicro = Math.max(p.stats.bestMicro, p.microTaps);
    p.state = 'outside';
    p.needFreshPress = true;
    p.holding = false;
    if (pass) { p.score += 10; p.stats.passes++; } else { p.score -= 10; p.x = 0; }
    const lines = pass ? PASS_LINES : FAIL_LINES;
    p.result = { pass, line: lines[Math.floor(this.rand() * lines.length)] };
    p.resultLeft = 2.5;
    this.events.push({ t: 'ev', kind: pass ? 'pass' : 'flung', id: p.id, name: p.name });
  }

  private admit(p: Player, rushed: boolean) {
    p.state = 'lounge';
    p.x = 1;
    p.moving = false;
    p.rushed = rushed;
    p.entryOrder = ++this.entries;
    p.score += T.ENTRY_POINTS[Math.min(p.entryOrder - 1, T.ENTRY_POINTS.length - 1)];
    this.events.push({ t: 'ev', kind: 'entered', id: p.id, name: p.name, order: p.entryOrder });
    if (!this.ownerId) {
      this.ownerId = p.id;
      this.ownerPickLeft = T.OWNER_PICK;
      this.events.push({ t: 'ev', kind: 'owner', id: p.id, name: p.name });
    }
  }

  private beginPush() {
    this.phase = 'push';
    this.gus = 'watch';
    for (const p of this.players.values()) {
      if (p.state === 'caught') { p.state = 'outside'; p.caughtLeft = 0; }
      p.pushTaps = 0;
      p.holding = false;
      p.needFreshPress = true;
    }
  }

  private beginVote() {
    const outside = [...this.players.values()].filter((p) => p.state !== 'lounge' && p.connected);
    const lounge = [...this.players.values()].filter((p) => p.state === 'lounge' && p.connected);
    // per-head comparison so 3 outsiders vs 1 defender is fair; Gus counts as one defender
    const crowd = this.push.crowd / Math.max(1, outside.length);
    const defend = this.push.defend / (lounge.length + 1);
    this.ropeSnapped = outside.length > 0 && crowd > defend;
    if (this.ropeSnapped) {
      // simultaneous entrants: furthest along first, then original join order
      outside.sort((a, b) => b.x - a.x || a.joinOrder - b.joinOrder).forEach((p) => this.admit(p, true));
    }
    this.events.push({ t: 'ev', kind: 'rope', snapped: !!this.ropeSnapped });
    this.phase = 'vote';
    this.voteStart = this.clock;
    this.ownerBeforeVote = this.ownerId;
    for (const p of this.players.values()) p.voted = false;
  }

  eligibleVoters(): Player[] {
    if (this.phase !== 'vote') return [];
    return [...this.players.values()].filter((p) => p.state === 'lounge' && p.id !== this.ownerId && p.connected);
  }

  /** Who takes the seat if the coup succeeds: the earliest-entered supporter. */
  private successor(): Player | null {
    const sup = this.eligibleVoters().filter((p) => p.voted).sort((a, b) => a.entryOrder - b.entryOrder);
    return sup[0] ?? null;
  }

  private voteState() {
    const eligible = this.eligibleVoters();
    const cast = eligible.filter((p) => p.voted).length;
    const needed = Math.floor(eligible.length / 2) + 1; // strict majority
    return { cast, needed, eligible: eligible.length, successorName: this.successor()?.name ?? null };
  }

  private finish() {
    const v = this.voteState();
    const prev = this.ownerBeforeVote ? this.players.get(this.ownerBeforeVote) : null;
    let winner = this.ownerId ? this.players.get(this.ownerId) ?? null : null;
    let prevOwnerName: string | null = null;
    if (v.eligible > 0 && v.cast >= v.needed) {
      const s = this.successor();
      if (s) { winner = s; this.ownerId = s.id; prevOwnerName = prev?.name ?? null; }
    }
    for (const p of this.players.values()) if (p.rushed) p.score = Math.round(p.score * T.RUSH_MULT);
    const ranking = [...this.players.values()]
      .sort((a, b) => (b.id === winner?.id ? 1 : 0) - (a.id === winner?.id ? 1 : 0) || b.score - a.score || a.joinOrder - b.joinOrder)
      .map((p) => ({ id: p.id, name: p.name, score: p.score }));
    const all = [...this.players.values()];
    const first = all.find((p) => p.entryOrder === 1);
    const mostCaught = all.slice().sort((a, b) => b.stats.caught - a.stats.caught)[0];
    const bestMicro = all.slice().sort((a, b) => b.stats.bestMicro - a.stats.bestMicro)[0];
    const awards: Reveal['awards'] = [];
    if (first) awards.push({ label: 'FIRST THROUGH THE DOOR', name: first.name, value: '' }); // never '#1': that is the final rank
    if (mostCaught && mostCaught.stats.caught > 0) awards.push({ label: 'MOST CAUGHT', name: mostCaught.name, value: `${mostCaught.stats.caught}X` });
    if (bestMicro && bestMicro.stats.bestMicro > 0) awards.push({ label: 'FASTEST HANDS', name: bestMicro.name, value: `${bestMicro.stats.bestMicro} TAPS` });
    this.reveal = {
      winnerId: winner?.id ?? null,
      winnerName: winner?.name ?? null,
      prevOwnerName,
      ropeSnapped: !!this.ropeSnapped,
      ranking,
      awards,
    };
    this.phase = 'reveal';
  }

  // ---------- views ----------
  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private pub(p: Player): PubPlayer {
    return { id: p.id, name: p.name, seed: p.seed, x: p.x, state: p.state, moving: p.moving, caught: p.state === 'caught', entryOrder: p.entryOrder, score: p.score, voted: p.voted };
  }

  snapshot(): Snapshot {
    const outside = [...this.players.values()].filter((p) => p.state !== 'lounge').length;
    const lounge = this.players.size - outside;
    return {
      t: 'snap',
      phase: this.phase,
      timeLeft: this.timeLeft,
      gus: this.gus,
      rule: this.rule,
      ruleBy: this.ruleBy,
      ownerId: this.ownerId,
      ownerName: this.ownerId ? this.players.get(this.ownerId)?.name ?? null : null,
      ownerPickLeft: Math.max(0, this.ownerPickLeft),
      players: [...this.players.values()].filter((p) => p.connected || this.phase !== 'lobby').map((p) => this.pub(p)),
      push: this.phase === 'push' ? { ...this.push, outside, lounge } : null,
      ropeSnapped: this.ropeSnapped,
      vote: this.phase === 'vote' ? this.voteState() : null,
      reveal: this.reveal,
    };
  }

  me(id: string | null): Me {
    const p = id ? this.players.get(id) : undefined;
    const ranking = this.reveal?.ranking ?? [...this.players.values()].sort((a, b) => b.score - a.score).map((q) => ({ id: q.id }));
    const rank = p ? ranking.findIndex((r) => r.id === p.id) + 1 : 0;
    let role: PhoneRole = 'join';
    if (p) {
      if (this.phase === 'lobby') role = 'lobby';
      else if (this.phase === 'reveal') role = 'reveal';
      else if (this.phase === 'push') role = p.state === 'lounge' ? 'defend' : 'break';
      else if (this.phase === 'vote') role = p.state !== 'lounge' ? 'outside-vote' : p.id === this.ownerId ? 'defending' : 'support';
      else if (p.state === 'caught') role = 'caught';
      else if (p.result) role = 'result';
      else if (p.state === 'lounge') role = p.id === this.ownerId && !this.rule && this.ownerPickLeft > 0 ? 'owner-pick' : 'lounge';
      else role = 'sneak';
    }
    return {
      t: 'me',
      id: p?.id ?? null,
      role,
      phase: this.phase,
      timeLeft: this.timeLeft,
      gus: this.gus,
      rule: this.rule,
      ruleBy: this.ruleBy,
      name: p?.name ?? '',
      seed: p?.seed ?? 0,
      x: p?.x ?? 0,
      moving: p?.moving ?? false,
      needFreshPress: p?.needFreshPress ?? false,
      microLeft: p?.state === 'caught' ? Math.max(0, p.caughtLeft) : 0,
      microTaps: p?.microTaps ?? 0,
      result: p?.result ?? null,
      isOwner: !!p && p.id === this.ownerId,
      ownerName: this.ownerId ? this.players.get(this.ownerId)?.name ?? null : null,
      ownerPickLeft: Math.max(0, this.ownerPickLeft),
      pushTaps: p?.pushTaps ?? 0,
      voted: p?.voted ?? false,
      vote: this.phase === 'vote' ? this.voteState() : null,
      rank,
      total: this.players.size,
      score: p?.score ?? 0,
      reveal: this.reveal,
    };
  }
}

function cleanName(s: string): string {
  const up = String(s ?? '').toUpperCase().replace(/[^A-Z0-9 .'!?-]/g, '').trim().slice(0, 12);
  return up || 'GUEST';
}
