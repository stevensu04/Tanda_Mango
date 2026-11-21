import { T, GUS_SLEEPY, GUS_SHARP, SOLO_LEVELS, type GusParams } from '../../shared/constants';
import {
  RULE_IDS, POWER_IDS,
  type RoundPhase, type PlayerState, type Rule, type Micro, type Power, type Settings,
  type Snapshot, type Me, type GameEvent, type PubPlayer, type Reveal, type PhoneRole, type Hud, type Say,
  type Mugshot, type SoloView,
} from '../../shared/protocol';
import { Gus } from './gus';
import { FALLBACK_SCRIPT, LINES, ASK, fill, pickLine, fallbackRoast, type RoundScript, type RaceState } from '../ai/fallbacks';
import type { CatchContext, FinaleContext, FinaleResult, MugshotContext, Persona, Roast } from '../ai/types';

/**
 * Authoritative game state for one room. Pure logic: no sockets, no timers, no network.
 * The transport calls tick(dt) at T.TICK_HZ and forwards messages to the methods below.
 * Claude work is requested through drainJobs() and answered through setScript/setRoasts/...
 */

export interface Player {
  id: string;
  token: string;
  name: string;
  seed: number;
  joinOrder: number;
  npc: boolean;
  x: number;
  state: PlayerState;
  holding: boolean;
  needFreshPress: boolean;  // after a challenge: ignore the old hold until a new press
  moving: boolean;
  micro: Micro;
  caughtFor: number;
  microTaps: number;
  microEnergy: number;
  catchNo: number;
  result: { pass: boolean; line: string } | null;
  resultLeft: number;
  nerdLeft: number;
  entryOrder: number;       // 1 = first in, 0 = outside
  score: number;
  rushed: boolean;          // came in when the rope snapped
  pushTaps: number;
  voted: boolean;
  tapWindow: number;
  shakeWindow: number;
  connected: boolean;
  motion: boolean;          // phone has working motion sensors
  latency: number;          // one-way estimate, seconds
  powerCd: Record<Power, number>;
  stats: { caught: number; passes: number; flung: number; bestMicro: number; maxX: number; stillFor: number; lines: string[] };
  brain: { want: boolean; next: number; greed: number };
}

export type AiJob =
  | { kind: 'script'; round: number; persona: Persona; names: string[] }
  | { kind: 'roast'; round: number; persona: Persona; ctx: CatchContext; catchNo: number }
  | { kind: 'finale'; round: number; persona: Persona; ctx: FinaleContext };

export const DEFAULT_SETTINGS: Settings = { roundSecs: T.ROUND, difficulty: 1, npcs: true, ai: true };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class Room {
  readonly code: string;
  readonly mode: 'party' | 'solo';
  settings: Settings;
  players = new Map<string, Player>();
  phase: RoundPhase = 'lobby';
  round = 0;               // increments per start(); stale AI answers are ignored
  clock = 0;               // seconds since round (or solo level) start
  gus = new Gus();
  private napDone = false;
  rule: Rule | null = null;
  ruleBy: string | null = null;
  ruleChoices: Rule[] = [];
  ownerId: string | null = null;
  ownerPickLeft = 0;
  private entries = 0;
  private joins = 0;
  private push = { crowd: 0, defend: 0 };
  ropeSnapped: boolean | null = null;
  private ownerBeforeVote: string | null = null;
  private voteStart = 0;
  reveal: Reveal | null = null;
  hud: Hud = { ego: 0.5, paranoia: 0.3, boredom: 0.4, suspicion: 0.1, mono: 'IF ONE MORE GUY SAYS HE KNOWS THE DJ...' };
  script: RoundScript = FALLBACK_SCRIPT;
  aiLive = false;          // set by the director: is Claude answering?
  private roasts = new Map<string, Roast>();
  private mugshots = new Map<string, Mugshot>();
  private sayState: Say | null = null;
  private sayN = 0;
  private events: GameEvent[] = [];
  private jobs: AiJob[] = [];
  private secAcc = 0;
  private rankCache = new Map<string, number>();
  private tauntI = 0;
  solo: { level: number; unlocked: number; cleared: boolean[]; catches: number; time: number; beaten: boolean; active: boolean; clearLeft: number } | null = null;
  private rand: () => number;

  constructor(code: string, opts: { mode?: 'party' | 'solo'; rand?: () => number; settings?: Partial<Settings> } = {}) {
    this.code = code;
    this.mode = opts.mode ?? 'party';
    this.rand = opts.rand ?? Math.random;
    this.settings = { ...DEFAULT_SETTINGS, ...opts.settings };
    if (this.mode === 'solo') {
      this.solo = { level: 0, unlocked: 0, cleared: [false, false, false], catches: 0, time: 0, beaten: false, active: false, clearLeft: 0 };
    }
    this.say(LINES.lobby);
  }

  // =================================================================== membership
  idForToken(token: string): string | null {
    for (const p of this.players.values()) if (p.token === token) return p.id;
    return null;
  }

  get humans(): Player[] { return [...this.players.values()].filter((p) => !p.npc); }

  join(token: string, name: string, seed: number): string {
    const existing = this.idForToken(token);
    if (existing) {
      const p = this.players.get(existing)!;
      if (this.phase === 'lobby' || this.mode === 'solo') {
        p.name = this.uniqueName(cleanName(name), existing);
        p.seed = seed | 0;
      }
      p.connected = true;
      return existing;
    }
    if (this.mode === 'solo' && this.players.size > 0) {
      // one phone per solo run: a second join from the same socket's token is handled above
      const only = [...this.players.values()][0];
      return only.id;
    }
    const id = `p${++this.joins}`;
    const p = this.newPlayer(id, token, this.uniqueName(cleanName(name), id), seed | 0, false);
    // joining mid-round: you start at the back of the line
    if (this.phase !== 'lobby' && this.phase !== 'reveal') p.needFreshPress = true;
    this.players.set(id, p);
    return id;
  }

  private newPlayer(id: string, token: string, name: string, seed: number, npc: boolean): Player {
    return {
      id, token, name, seed, joinOrder: this.joins, npc,
      x: 0, state: 'outside', holding: false, needFreshPress: true, moving: false,
      micro: 'mash', caughtFor: 0, microTaps: 0, microEnergy: 0, catchNo: 0,
      result: null, resultLeft: 0, nerdLeft: 0,
      entryOrder: 0, score: 0, rushed: false, pushTaps: 0, voted: false,
      tapWindow: 0, shakeWindow: 0, connected: true, motion: false, latency: 0,
      powerCd: { banana: 0, distract: 0, snitch: 0 },
      stats: { caught: 0, passes: 0, flung: 0, bestMicro: 0, maxX: 0, stillFor: 0, lines: [] },
      brain: { want: false, next: 0, greed: 0.3 + this.rand() * 0.5 },
    };
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

  setMotion(id: string, motion: boolean) {
    const p = this.players.get(id);
    if (p) p.motion = !!motion;
  }

  setLatency(id: string, rttSecs: number) {
    const p = this.players.get(id);
    if (!p || !(rttSecs >= 0)) return;
    const oneWay = Math.min(T.MAX_LATENCY, rttSecs / 2);
    p.latency = p.latency ? p.latency * 0.7 + oneWay * 0.3 : oneWay;
  }

  kick(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (this.ownerId === id) {
      const next = [...this.players.values()].filter((q) => q.state === 'lounge').sort((a, b) => a.entryOrder - b.entryOrder)[0];
      this.ownerId = next?.id ?? null;
    }
  }

  // =================================================================== host
  start() {
    if (this.mode === 'solo') return;
    if (this.phase !== 'lobby' && this.phase !== 'reveal') return;
    this.dropDisconnected(true);
    for (const [id, p] of this.players) if (p.npc) this.players.delete(id);
    this.round++;
    this.phase = 'play';
    this.clock = 0;
    this.gus.reset(3.5);
    this.napDone = false;
    this.rule = null; this.ruleBy = null; this.ruleChoices = [];
    this.ownerId = null; this.ownerPickLeft = 0;
    this.entries = 0;
    this.push = { crowd: 0, defend: 0 };
    this.ropeSnapped = null;
    this.ownerBeforeVote = null;
    this.reveal = null;
    this.roasts.clear();
    this.mugshots.clear();
    this.script = FALLBACK_SCRIPT;
    this.hud = { ego: 0.5, paranoia: 0.3, boredom: 0.4, suspicion: 0.1, mono: 'NEW NIGHT. SAME FAKE IDS.' };
    for (const p of this.players.values()) this.resetPlayer(p);
    if (this.settings.npcs) this.fillNpcs();
    this.jobs.push({ kind: 'script', round: this.round, persona: this.persona(), names: this.humans.map((p) => p.name) });
    this.say(this.script.opener, 'GUS', true);
  }

  private resetPlayer(p: Player) {
    Object.assign(p, {
      x: 0, state: 'outside', holding: false, needFreshPress: true, moving: false, caughtFor: 0, microTaps: 0, microEnergy: 0,
      result: null, resultLeft: 0, nerdLeft: 0, entryOrder: 0, score: 0, rushed: false, pushTaps: 0, voted: false, catchNo: 0,
      powerCd: { banana: 0, distract: 0, snitch: 0 },
      stats: { caught: 0, passes: 0, flung: 0, bestMicro: 0, maxX: 0, stillFor: 0, lines: [] },
    });
  }

  private fillNpcs() {
    const need = T.NPC_MIN - this.humans.length;
    const names = this.script.npcNames.length ? this.script.npcNames : FALLBACK_SCRIPT.npcNames;
    for (let i = 0; i < need; i++) {
      const id = `n${++this.joins}`;
      const name = this.uniqueName(`${cleanName(names[i % names.length]).slice(0, 8)}`, id);
      const p = this.newPlayer(id, `npc-${id}`, name, Math.floor(this.rand() * 1e6), true);
      p.needFreshPress = false;
      this.players.set(id, p);
    }
  }

  reset() {
    if (this.mode === 'solo') return;
    for (const [id, p] of this.players) if (p.npc) this.players.delete(id);
    this.round++;
    this.phase = 'lobby';
    this.clock = 0;
    this.gus.reset();
    this.rule = null; this.ruleBy = null; this.ruleChoices = [];
    this.ownerId = null; this.ownerPickLeft = 0;
    this.reveal = null;
    this.ropeSnapped = null;
    for (const p of this.players.values()) this.resetPlayer(p);
    this.dropDisconnected();
    this.say(LINES.lobby);
  }

  updateSettings(s: Partial<Settings>) {
    // round length only changes between rounds
    const between = this.phase === 'lobby' || this.phase === 'reveal';
    if (between && typeof s.roundSecs === 'number' && (T.ROUND_CHOICES as number[]).includes(s.roundSecs)) this.settings.roundSecs = s.roundSecs;
    if (typeof s.difficulty === 'number') this.settings.difficulty = Math.max(0.6, Math.min(1.4, s.difficulty));
    if (typeof s.npcs === 'boolean') this.settings.npcs = s.npcs;
    if (typeof s.ai === 'boolean') this.settings.ai = s.ai;
  }

  /** Lobby only (or forced at start): forget players whose phones are gone. */
  dropDisconnected(force = false) {
    if (this.phase !== 'lobby' && !force) return;
    for (const [id, p] of this.players) if (!p.connected && !p.npc) this.players.delete(id);
  }

  // =================================================================== solo gauntlet
  soloStart(level: number) {
    const s = this.solo;
    if (!s || !Number.isInteger(level) || level < 0 || level > s.unlocked || level >= SOLO_LEVELS.length) return;
    const p = this.players.values().next().value as Player | undefined;
    if (!p) return;
    if (level === 0 && s.beaten) { s.cleared = [false, false, false]; s.unlocked = 0; s.beaten = false; s.catches = 0; s.time = 0; }
    this.round++;
    s.level = level; s.active = true; s.clearLeft = 0;
    this.phase = 'play';
    this.clock = 0;
    this.gus.reset(2.5);
    this.rule = SOLO_LEVELS[level].lights ? 'lights' : null;
    p.x = 0; p.state = 'outside'; p.holding = false; p.needFreshPress = true; p.moving = false; p.result = null; p.resultLeft = 0; p.nerdLeft = 0;
    this.roasts.clear();
    this.say(`${SOLO_LEVELS[level].name}. THE DOOR: ${SOLO_LEVELS[level].guard}. ${SOLO_LEVELS[level].note}.`, 'GUS', true);
    this.jobs.push({ kind: 'script', round: this.round, persona: this.persona(), names: [p.name] });
  }

  soloMenu() {
    if (!this.solo) return;
    this.solo.active = false;
    this.solo.clearLeft = 0;
    this.phase = 'lobby';
  }

  private soloCleared(p: Player) {
    const s = this.solo!;
    s.cleared[s.level] = true;
    s.unlocked = Math.max(s.unlocked, Math.min(SOLO_LEVELS.length - 1, s.level + 1));
    p.state = 'outside';
    p.moving = false;
    this.events.push({ t: 'ev', kind: 'entered', id: p.id, name: p.name, order: s.level + 1 });
    if (s.level === SOLO_LEVELS.length - 1) {
      s.beaten = true;
      s.active = false;
      this.phase = 'reveal';
      this.say(LINES.soloBeaten, 'GUS', true);
      this.mugshots.set(p.id, this.fallbackMugshot(p, 1, 1, false));
      this.jobs.push({ kind: 'finale', round: this.round, persona: this.persona(), ctx: { winner: p.name, prevOwner: null, ropeSnapped: false, players: [this.mugshotContext(p, 1, 1, false)] } });
    } else {
      s.clearLeft = 3;
      this.say(fill(LINES.soloClear, { L: SOLO_LEVELS[s.level].name }), 'GUS', true);
    }
  }

  // =================================================================== player input
  press(id: string) {
    const p = this.players.get(id);
    if (!p || p.nerdLeft > 0) return;
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
    p.tapWindow++;
    if (p.tapWindow > T.NERD_TAPS && !p.npc && p.nerdLeft <= 0) { this.nerd(p); return; }
    if (p.nerdLeft > 0) return;
    if (p.state === 'caught') { p.microTaps++; return; }
    if (this.phase === 'push') {
      p.pushTaps++;
      if (p.state === 'lounge') this.push.defend++; else this.push.crowd++;
      return;
    }
    // a vote needs a lift and a fresh tap: taps in the first moments after the rush are leftovers
    if (this.phase === 'vote' && this.clock >= this.voteStart + T.VOTE_LIFT && !p.voted && this.eligibleVoters().includes(p)) p.voted = true;
  }

  shake(id: string, e: number) {
    const p = this.players.get(id);
    if (!p || p.state !== 'caught' || p.micro !== 'shake' || p.nerdLeft > 0) return;
    if (++p.shakeWindow > T.SHAKE_MAX_RATE) return;
    p.microEnergy += clamp01(Number(e) || 0);
  }

  private nerd(p: Player) {
    p.nerdLeft = T.NERD_FOR;
    p.holding = false;
    p.moving = false;
    this.events.push({ t: 'ev', kind: 'nerd', id: p.id, name: p.name });
    this.say(fill(LINES.nerd, { N: p.name }), 'GUS', true);
  }

  pickRule(id: string, rule: Rule) {
    if (id !== this.ownerId || this.rule || !this.ruleChoices.includes(rule)) return;
    this.setRule(rule, id);
  }

  private setRule(rule: Rule, by: string) {
    this.rule = rule;
    this.ruleBy = this.players.get(by)?.name ?? null;
    this.ownerPickLeft = 0;
    if (rule === 'glasses') this.hud.paranoia = Math.min(1, this.hud.paranoia + 0.3);
    this.events.push({ t: 'ev', kind: 'rule', rule, by: this.ruleBy ?? '' });
    this.say(`${this.ruleBy ?? 'THE OWNER'} PICKED ${this.script.ruleLines[rule] ?? FALLBACK_SCRIPT.ruleLines[rule]}`, 'GUS', true);
  }

  usePower(id: string, power: Power) {
    const p = this.players.get(id);
    if (!p || p.state !== 'lounge' || this.phase !== 'play' || !POWER_IDS.includes(power) || p.powerCd[power] > 0) return;
    p.powerCd[power] = T.POWER_COOLDOWN[power];
    let target: Player | null = null;
    if (power === 'banana') {
      const outs = [...this.players.values()].filter((q) => q.state === 'outside' && q.x > 0.05);
      target = outs.length ? outs[Math.floor(this.rand() * outs.length)] : null;
      if (target) target.x = Math.max(0, target.x - T.BANANA_SLIP);
      this.say(fill(target ? LINES.banana : LINES.bananaMiss, { B: p.name, N: target?.name ?? '' }));
    } else if (power === 'distract') {
      this.gus.distract(T.DISTRACT_FOR);
      this.hud.boredom = Math.min(1, this.hud.boredom + 0.1);
      this.say(fill(LINES.distract, { B: p.name }));
    } else {
      this.gus.extraWatch = Math.min(2, this.gus.extraWatch + T.SNITCH_EXTRA);
      this.hud.suspicion = Math.min(1, this.hud.suspicion + 0.2);
      this.say(fill(LINES.snitch, { B: p.name }));
    }
    this.events.push({ t: 'ev', kind: 'power', power, by: p.name, target: target?.name ?? null, targetId: target?.id ?? null });
  }

  // =================================================================== AI answers
  setScript(round: number, s: RoundScript) {
    if (round !== this.round) return;
    this.script = s;
    // NPCs already on the street take the generated names
    const npcs = [...this.players.values()].filter((p) => p.npc);
    npcs.forEach((p, i) => { if (s.npcNames[i]) p.name = this.uniqueName(cleanName(s.npcNames[i]).slice(0, 8), p.id); });
  }

  setRoasts(round: number, catchNos: Map<string, number>, roasts: Roast[]) {
    if (round !== this.round) return;
    for (const r of roasts) {
      const n = catchNos.get(r.playerId);
      if (n !== undefined) this.roasts.set(`${r.playerId}:${n}`, r);
    }
  }

  sayLive(round: number, line: string, mono: string, deltas?: Partial<Record<'ego' | 'paranoia' | 'boredom' | 'suspicion', number>>) {
    if (round !== this.round || this.phase !== 'play') return;
    this.say(line, 'LIVE');
    if (mono) this.hud.mono = mono;
    for (const k of ['ego', 'paranoia', 'boredom', 'suspicion'] as const) {
      const d = deltas?.[k];
      if (typeof d === 'number' && isFinite(d)) this.hud[k] = clamp01(this.hud[k] + Math.max(-0.2, Math.min(0.2, d)));
    }
  }

  setFinale(round: number, r: FinaleResult) {
    if (round !== this.round || this.phase !== 'reveal') return;
    for (const rc of r.receipts) {
      const m = this.mugshots.get(rc.playerId);
      if (!m) continue;
      if (rc.title) m.title = rc.title;
      if (rc.roast) m.roast = rc.roast;
      // the crown holder (or a beaten bouncer) is always EXTREME, whatever the receipt writer says
      if (m.threat !== 'EXTREME' && ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'].includes(rc.threat)) m.threat = rc.threat;
    }
    if (r.closing && this.reveal) {
      this.reveal.toast = r.closing;
      this.say(r.closing, 'GUS', true);
    }
  }

  drainJobs(): AiJob[] {
    const j = this.jobs;
    this.jobs = [];
    return j;
  }

  persona(): Persona {
    if (this.solo) { const l = SOLO_LEVELS[this.solo.level]; return { guard: l.guard, venue: l.name }; }
    return { guard: 'GUS', venue: 'CLUB VELVET' };
  }

  /** What the commentator sees. */
  raceState(): RaceState {
    const hs = this.humans;
    const out = hs.filter((p) => p.state !== 'lounge');
    const leader = out.slice().sort((a, b) => b.x - a.x)[0];
    const caught = hs.slice().sort((a, b) => b.stats.caught - a.stats.caught)[0];
    const statue = out.slice().sort((a, b) => b.stats.stillFor - a.stats.stillFor)[0];
    return {
      leader: leader?.name ?? null,
      leaderX: leader?.x ?? 0,
      mostCaught: caught && caught.stats.caught ? { name: caught.name, n: caught.stats.caught } : null,
      statue: statue ? { name: statue.name, secs: statue.stats.stillFor } : null,
      owner: this.ownerId ? this.players.get(this.ownerId)?.name ?? null : null,
      rule: this.rule,
      inLounge: hs.length - out.length,
      outside: out.length,
      timeLeft: this.timeLeft,
    };
  }

  // =================================================================== simulation
  get timeLeft() { return this.mode === 'solo' ? 0 : Math.max(0, this.settings.roundSecs - this.clock); }

  beamAt(): number | null {
    if (this.rule !== 'lights') return null;
    return 0.5 + 0.45 * Math.sin(this.clock * T.BEAM_SPEED);
  }

  private trackSecs() { return this.solo ? SOLO_LEVELS[this.solo.level].track : T.TRACK_SECONDS; }

  private gusParams(): GusParams {
    if (this.solo) return SOLO_LEVELS[this.solo.level].gus;
    const base = this.clock < T.SLEEPY_UNTIL && !this.ownerId ? GUS_SLEEPY : GUS_SHARP;
    let back: [number, number] = [...base.back];
    let tell: [number, number] = [...base.tell];
    let watch: [number, number] = [...base.watch];
    let fakeout = base.fakeout;
    if (this.rule === 'glasses') { tell = [Math.max(0.3, tell[0] * 0.6), Math.max(0.3, tell[1] * 0.6)]; fakeout += 0.2; }
    if (this.rule === 'disco') { back = [back[0] * 0.55, back[1] * 0.55]; watch = [watch[0] * 0.65, watch[1] * 0.65]; }
    // the brain drives him: bored = looks away longer, suspicious = turns sooner, paranoid = more fake-outs
    const b = this.hud.boredom * 0.8 - this.hud.suspicion * 0.6;
    back = [Math.max(0.8, back[0] + b), Math.max(1, back[1] + b)];
    fakeout += this.hud.paranoia * 0.15;
    const d = this.settings.difficulty;
    back = [back[0] / d, back[1] / d];
    tell = [Math.max(0.3, tell[0] / d), Math.max(0.3, tell[1] / d)];
    fakeout = Math.min(0.6, base.fakeout === 0 && this.clock < T.SLEEPY_UNTIL ? 0 : fakeout * d);
    return { back, tell, watch, fakeout };
  }

  tick(dt: number) {
    this.secAcc += dt;
    if (this.secAcc >= 1) { this.secAcc = 0; for (const p of this.players.values()) { p.tapWindow = 0; p.shakeWindow = 0; } }

    if (this.solo) return this.tickSolo(dt);
    if (this.phase === 'lobby' || this.phase === 'reveal') return;
    this.clock += dt;

    const R = this.settings.roundSecs;
    if (this.phase === 'play' && this.clock >= R - T.PUSH - T.VOTE) this.beginPush();
    if (this.phase === 'push' && this.clock >= R - T.VOTE) this.beginVote();
    if (this.phase === 'vote' && this.clock >= R) { this.finish(); return; }

    if (this.phase === 'play') this.stepGus(dt);

    if (this.ownerPickLeft > 0) {
      this.ownerPickLeft -= dt;
      if (this.ownerPickLeft <= 0 && !this.rule && this.ownerId) {
        this.setRule(this.ruleChoices[Math.floor(this.rand() * this.ruleChoices.length)] ?? 'moonwalk', this.ownerId);
      }
    }

    for (const p of this.players.values()) {
      if (p.npc) this.npcThink(p, dt);
      this.stepPlayer(p, dt);
    }
    this.stepHud(dt);
    this.updateRanks();
  }

  private tickSolo(dt: number) {
    const s = this.solo!;
    if (s.clearLeft > 0) {
      s.clearLeft -= dt;
      if (s.clearLeft <= 0) this.soloStart(s.level + 1);
      return;
    }
    if (!s.active) return;
    this.clock += dt;
    s.time += dt;
    this.stepGus(dt);
    for (const p of this.players.values()) this.stepPlayer(p, dt);
  }

  private stepGus(dt: number) {
    // nobody in by 35 s: he naps so the leaders can get through
    if (!this.solo && !this.napDone && !this.ownerId && this.clock >= T.NAP_AT && this.gus.phase === 'back') {
      this.gus.nap(T.NAP_FOR);
      this.napDone = true;
      this.events.push({ t: 'ev', kind: 'nap' });
      this.say(LINES.nap, 'GUS', true);
    }
    const change = this.gus.step(dt, this.gusParams(), this.rand);
    if (!change) return;
    if (change === 'tell') {
      this.events.push({ t: 'ev', kind: 'tell' });
      if (this.rand() < 0.4) this.say(this.script.taunts[this.tauntI++ % this.script.taunts.length]);
    } else if (change === 'fakeout') {
      this.events.push({ t: 'ev', kind: 'fakeout' });
      this.hud.paranoia = Math.min(1, this.hud.paranoia + 0.05);
      this.say(pickLine(this.script.fakeouts, this.rand));
    } else if (change === 'turn') {
      this.events.push({ t: 'ev', kind: 'turn' });
    }
  }

  private stepPlayer(p: Player, dt: number) {
    if (p.resultLeft > 0) { p.resultLeft -= dt; if (p.resultLeft <= 0) p.result = null; }
    for (const k of POWER_IDS) if (p.powerCd[k] > 0) p.powerCd[k] = Math.max(0, p.powerCd[k] - dt);
    if (p.nerdLeft > 0) p.nerdLeft = Math.max(0, p.nerdLeft - dt);
    if (p.state === 'caught') {
      p.caughtFor += dt;
      const sc = this.microScore(p);
      if (p.caughtFor >= T.MICRO || (sc >= 1 && p.caughtFor >= T.MICRO_MIN)) this.endChallenge(p);
      return;
    }
    if (p.state !== 'outside' || this.phase !== 'play' || p.nerdLeft > 0) { p.moving = false; return; }
    // Moonwalk flips the control: release to move, hold to freeze
    const input = p.needFreshPress ? false : this.rule === 'moonwalk' ? !p.holding : p.holding;
    p.moving = input && p.connected;
    if (!p.moving) { p.stats.stillFor += dt; return; }
    p.stats.stillFor = 0;
    if (this.gus.phase === 'watch') {
      const beam = this.beamAt();
      const inBeam = beam === null || Math.abs(p.x - beam) < T.BEAM_HALF;
      if (inBeam) {
        if (this.gus.watchT > T.GRACE + p.latency) this.catchPlayer(p);
        return; // inside the grace window: frozen in place, not caught yet
      }
    }
    p.x = Math.min(1, p.x + dt / this.trackSecs());
    if (p.npc) p.x = Math.min(p.x, T.NPC_MAX_X);
    p.stats.maxX = Math.max(p.stats.maxX, p.x);
    if (p.x >= 1) {
      if (this.solo) this.soloCleared(p);
      else this.admit(p, false);
    }
  }

  private npcThink(p: Player, dt: number) {
    const b = p.brain;
    if (p.state === 'caught') {
      // NPCs mash at a hopeless-to-decent rate: about half get flung
      b.next -= dt;
      if (b.next <= 0) { p.microTaps++; b.next = 1 / (2.4 + b.greed * 3); }
      return;
    }
    if (this.phase === 'push') {
      b.next -= dt;
      if (b.next <= 0) { this.tap(p.id); b.next = 0.25 + this.rand() * 0.3; }
      return;
    }
    if (p.state !== 'outside' || this.phase !== 'play') return;
    b.next -= dt;
    if (b.next <= 0) {
      b.next = 0.3 + this.rand() * 0.5;
      const g = this.gus.phase;
      if (p.x >= T.NPC_MAX_X - 0.02) b.want = true;           // so close! (walks straight into his look)
      else if (g === 'back' || g === 'sleep') b.want = this.rand() < 0.55 + b.greed * 0.4;
      else if (g === 'tell') b.want = b.want && this.rand() < b.greed * 0.5;
      // in watch they keep doing whatever they were doing: that is how NPCs get caught
    }
    const hold = this.rule === 'moonwalk' ? !b.want : b.want;
    p.holding = hold;
  }

  microScore(p: Player): number {
    const taps = p.microTaps / T.MICRO_PASS_TAPS;
    return clamp01(p.micro === 'shake' ? p.microEnergy / T.SHAKE_PASS + taps : taps);
  }

  private catchPlayer(p: Player) {
    p.state = 'caught';
    p.caughtFor = 0;
    p.micro = !p.npc && p.motion && this.rand() < T.MICRO_SHAKE_SHARE ? 'shake' : 'mash';
    p.microTaps = 0;
    p.microEnergy = 0;
    p.moving = false;
    p.holding = false;
    p.catchNo++;
    p.stats.caught++;
    p.result = null;
    if (this.solo) this.solo.catches++;
    this.hud.boredom = Math.max(0, this.hud.boredom - 0.25);
    this.events.push({ t: 'ev', kind: 'caught', id: p.id, name: p.name, micro: p.micro });
    this.say(fill(pickLine(ASK[p.micro], this.rand), { N: p.name }), 'GUS', false);
    this.jobs.push({
      kind: 'roast', round: this.round, persona: this.persona(), catchNo: p.catchNo,
      ctx: { playerId: p.id, name: p.name, micro: p.micro, timesCaught: p.stats.caught, distance: p.x, rule: this.rule },
    });
  }

  private endChallenge(p: Player) {
    const score = this.microScore(p);
    const pass = score >= 1;
    p.stats.bestMicro = Math.max(p.stats.bestMicro, Math.round(score * 100));
    p.state = 'outside';
    p.needFreshPress = true;
    p.holding = false;
    if (pass) {
      p.score += T.PASS_POINTS; p.stats.passes++;
      p.x = Math.min(this.solo || !p.npc ? 0.97 : T.NPC_MAX_X, p.x + T.PASS_BONUS);
      this.hud.ego = Math.min(1, this.hud.ego + 0.15);
    } else {
      p.score += T.FLING_POINTS; p.stats.flung++; p.x = 0;
    }
    const ai = this.roasts.get(`${p.id}:${p.catchNo}`);
    const line = ai ? (pass ? ai.passLine : ai.failLine) : fallbackRoast(p.name, p.micro, pass, p.stats.caught, this.rand);
    p.stats.lines.push(line);
    p.result = { pass, line };
    p.resultLeft = T.RESULT_SHOW;
    this.events.push({ t: 'ev', kind: pass ? 'pass' : 'flung', id: p.id, name: p.name, line });
    this.say(pass ? line : `${p.name}: ${line}`, 'GUS', true);
  }

  private admit(p: Player, rushed: boolean) {
    if (p.npc) return;
    p.state = 'lounge';
    p.x = 1;
    p.moving = false;
    p.holding = false;
    p.rushed = rushed;
    p.entryOrder = ++this.entries;
    p.score += T.ENTRY_POINTS[Math.min(p.entryOrder - 1, T.ENTRY_POINTS.length - 1)];
    this.hud.ego = Math.max(0, this.hud.ego - 0.1);
    this.events.push({ t: 'ev', kind: 'entered', id: p.id, name: p.name, order: p.entryOrder });
    if (!this.ownerId) {
      this.ownerId = p.id;
      this.ownerPickLeft = T.OWNER_PICK;
      const pool = RULE_IDS.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      this.ruleChoices = pool.slice(0, 3);
      this.events.push({ t: 'ev', kind: 'owner', id: p.id, name: p.name });
      this.say(fill(LINES.firstIn, { N: p.name }), 'GUS', true);
    } else if (!rushed) {
      this.say(fill(LINES.entered, { N: p.name, K: p.entryOrder }));
    }
  }

  private beginPush() {
    this.phase = 'push';
    this.gus.phase = 'watch';
    for (const p of this.players.values()) {
      if (p.state === 'caught') { p.state = 'outside'; p.caughtFor = 0; }
      p.pushTaps = 0;
      p.holding = false;
      p.needFreshPress = true;
      p.result = null;
    }
    this.say(LINES.push, 'GUS', true);
  }

  private beginVote() {
    const outside = [...this.players.values()].filter((p) => p.state !== 'lounge' && (p.connected || p.npc));
    const lounge = [...this.players.values()].filter((p) => p.state === 'lounge' && p.connected);
    // per-head comparison so 3 outsiders vs 1 defender is fair; Gus counts as one defender
    const crowd = this.push.crowd / Math.max(1, outside.length);
    const defend = this.push.defend / (lounge.length + 1);
    this.ropeSnapped = outside.some((p) => !p.npc) && crowd > defend;
    if (this.ropeSnapped) {
      // simultaneous entrants: furthest along first, then original join order
      outside.filter((p) => !p.npc).sort((a, b) => b.x - a.x || a.joinOrder - b.joinOrder).forEach((p) => this.admit(p, true));
    }
    this.events.push({ t: 'ev', kind: 'rope', snapped: !!this.ropeSnapped });
    this.say(this.ropeSnapped ? LINES.ropeSnapped : LINES.ropeHeld, 'GUS', true);
    this.phase = 'vote';
    this.voteStart = this.clock;
    this.ownerBeforeVote = this.ownerId;
    for (const p of this.players.values()) p.voted = false;
  }

  eligibleVoters(): Player[] {
    if (this.phase !== 'vote') return [];
    return [...this.players.values()].filter((p) => p.state === 'lounge' && p.id !== this.ownerId && p.connected && !p.npc);
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
    const hs = this.humans;
    const ranked = hs.slice()
      .sort((a, b) => (b.id === winner?.id ? 1 : 0) - (a.id === winner?.id ? 1 : 0) || b.score - a.score || a.joinOrder - b.joinOrder);
    const ranking = ranked.map((p) => ({ id: p.id, name: p.name, score: p.score }));
    const first = hs.find((p) => p.entryOrder === 1);
    const mostCaught = hs.slice().sort((a, b) => b.stats.caught - a.stats.caught)[0];
    const bestMicro = hs.slice().sort((a, b) => b.stats.bestMicro - a.stats.bestMicro)[0];
    const awards: Reveal['awards'] = [];
    if (first) awards.push({ label: 'FIRST THROUGH THE DOOR', name: first.name, value: '' }); // never '#1': that is the final rank
    if (mostCaught && mostCaught.stats.caught > 0) awards.push({ label: 'MOST CAUGHT', name: mostCaught.name, value: `${mostCaught.stats.caught}X` });
    if (bestMicro && bestMicro.stats.bestMicro > 0) awards.push({ label: 'BEST MOVES', name: bestMicro.name, value: `${bestMicro.stats.bestMicro}%` });
    const toast = !winner ? LINES.noWinner : prevOwnerName ? fill(LINES.took, { N: winner.name, P: prevOwnerName }) : fill(LINES.kept, { N: winner.name });
    this.reveal = {
      winnerId: winner?.id ?? null,
      winnerName: winner?.name ?? null,
      prevOwnerName,
      ropeSnapped: !!this.ropeSnapped,
      ranking,
      awards,
      toast,
    };
    this.phase = 'reveal';
    this.rankCache.clear();
    ranked.forEach((p, i) => this.rankCache.set(p.id, i + 1));
    const ctxs: MugshotContext[] = [];
    ranked.forEach((p, i) => {
      const vip = p.id === winner?.id;
      this.mugshots.set(p.id, this.fallbackMugshot(p, i + 1, ranked.length, vip));
      ctxs.push(this.mugshotContext(p, i + 1, ranked.length, vip));
    });
    this.say(toast, 'GUS', true);
    if (ctxs.length) this.jobs.push({ kind: 'finale', round: this.round, persona: this.persona(), ctx: { winner: winner?.name ?? null, prevOwner: prevOwnerName, ropeSnapped: !!this.ropeSnapped, players: ctxs } });
  }

  private mugshotContext(p: Player, rank: number, total: number, vip: boolean): MugshotContext {
    return {
      playerId: p.id, name: p.name, rank, total, vip,
      caught: p.stats.caught, passes: p.stats.passes, flung: p.stats.flung,
      entered: p.state === 'lounge' || !!this.solo?.beaten, firstIn: p.entryOrder === 1,
      maxDistance: p.stats.maxX, lines: p.stats.lines.slice(-4),
    };
  }

  fallbackMugshot(p: Player, rank: number, total: number, vip: boolean): Mugshot {
    const s = p.stats;
    const inside = p.state === 'lounge' || !!this.solo?.beaten;
    const title = this.solo?.beaten ? 'BOUNCER BEATER'
      : vip ? "TONIGHT'S VIP"
      : p.entryOrder === 1 ? 'FIRST THROUGH THE DOOR'
      : s.caught >= 3 ? 'REPEAT OFFENDER'
      : s.flung >= 2 ? 'FREQUENT FLYER'
      : s.passes >= 2 ? 'SMOOTH OPERATOR'
      : !inside && s.maxX < 0.3 ? 'PROFESSIONAL STATUE'
      : inside ? 'GOT IN, SOMEHOW' : 'ORDINARY SNEAK';
    const roast = s.lines.filter((l) => l.length > 0).sort((a, b) => b.length - a.length)[0] ?? (inside ? 'I DID NOT EVEN SEE YOU GO IN. RUDE.' : 'GUS DID NOT EVEN NOTICE YOU.');
    const threat: Mugshot['threat'] = vip || this.solo?.beaten ? 'EXTREME' : inside ? 'HIGH' : s.maxX > 0.6 ? 'MEDIUM' : 'LOW';
    return {
      name: p.name, seed: p.seed, caught: s.caught, passes: s.passes, bestMicro: s.bestMicro,
      distance: inside ? 'ALL THE WAY' : `${Math.round(s.maxX * 60)} FT`,
      roast, title, threat,
      rankLine: this.solo ? (this.solo.beaten ? 'BOUNCER BEATEN' : `LEVEL ${this.solo.level + 1}`) : vip ? "TONIGHT'S VIP" : `#${rank} OF ${total}`,
    };
  }

  private stepHud(dt: number) {
    const outs = this.humans.filter((p) => p.state === 'outside');
    const movers = outs.filter((p) => p.moving).length;
    const target = outs.length ? movers / outs.length : 0;
    const h = this.hud;
    h.suspicion += (target - h.suspicion) * Math.min(1, dt * 0.8);
    h.boredom = clamp01(h.boredom + dt * 0.02);
    h.ego += (0.5 - h.ego) * dt * 0.03;
    h.paranoia += ((this.rule === 'glasses' ? 0.6 : 0.3) - h.paranoia) * dt * 0.03;
  }

  private updateRanks() {
    // live rank: owner first, then score (same order the reveal uses)
    const hs = this.humans.sort((a, b) => (b.id === this.ownerId ? 1 : 0) - (a.id === this.ownerId ? 1 : 0) || b.score - a.score || a.joinOrder - b.joinOrder);
    this.rankCache.clear();
    hs.forEach((p, i) => this.rankCache.set(p.id, i + 1));
  }

  // =================================================================== views
  private say(text: string, who: 'GUS' | 'LIVE' = 'GUS', speak = false) {
    this.sayState = { text, who, n: ++this.sayN };
    this.events.push({ t: 'ev', kind: 'say', text, who, speak });
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private pub(p: Player): PubPlayer {
    return {
      id: p.id, name: p.name, seed: p.seed, x: p.x, state: p.state, moving: p.moving, caught: p.state === 'caught',
      micro: p.state === 'caught' ? p.micro : null, microScore: p.state === 'caught' ? this.microScore(p) : 0,
      microLeft: p.state === 'caught' ? Math.max(0, T.MICRO - p.caughtFor) : 0,
      entryOrder: p.entryOrder, score: p.score, voted: p.voted, npc: p.npc, nerd: p.nerdLeft > 0, connected: p.connected,
    };
  }

  snapshot(): Snapshot {
    const all = [...this.players.values()];
    const outside = all.filter((p) => p.state !== 'lounge').length;
    const lounge = all.length - outside;
    return {
      t: 'snap',
      code: this.code,
      phase: this.phase,
      timeLeft: this.timeLeft,
      roundSecs: this.settings.roundSecs,
      gus: this.gus.phase,
      rule: this.rule,
      ruleBy: this.ruleBy,
      beam: this.beamAt(),
      ownerId: this.ownerId,
      ownerName: this.ownerId ? this.players.get(this.ownerId)?.name ?? null : null,
      ownerPickLeft: Math.max(0, this.ownerPickLeft),
      players: all.filter((p) => p.connected || p.npc || this.phase !== 'lobby').map((p) => this.pub(p)),
      push: this.phase === 'push' ? { ...this.push, outside, lounge } : null,
      ropeSnapped: this.ropeSnapped,
      vote: this.phase === 'vote' ? this.voteState() : null,
      reveal: this.reveal,
      hud: this.hud,
      say: this.sayState,
      ai: this.aiLive && this.settings.ai ? 'live' : 'scripted',
    };
  }

  private role(p: Player | undefined): PhoneRole {
    if (!p) return 'join';
    if (this.solo) {
      const s = this.solo;
      if (s.beaten && !s.active) return 'solo-done';
      if (s.clearLeft > 0) return 'solo-clear';
      if (!s.active) return 'solo-menu';
      if (p.state === 'caught') return 'caught';
      if (p.nerdLeft > 0) return 'nerd';
      if (p.result) return 'result';
      return 'sneak';
    }
    if (this.phase === 'lobby') return 'lobby';
    if (this.phase === 'reveal') return 'reveal';
    if (this.phase === 'push') return p.state === 'lounge' ? 'defend' : 'break';
    if (this.phase === 'vote') return p.state !== 'lounge' ? 'outside-vote' : p.id === this.ownerId ? 'defending' : 'support';
    if (p.state === 'caught') return 'caught';
    if (p.nerdLeft > 0) return 'nerd';
    if (p.result) return 'result';
    if (p.state === 'lounge') return p.id === this.ownerId && !this.rule && this.ownerPickLeft > 0 ? 'owner-pick' : 'lounge';
    return 'sneak';
  }

  private soloView(): SoloView | null {
    const s = this.solo;
    if (!s) return null;
    return {
      level: s.level, unlocked: s.unlocked,
      levels: SOLO_LEVELS.map((l, i) => ({ name: l.name, guard: l.guard, note: l.note, cleared: s.cleared[i] })),
      catches: s.catches, time: s.time, beaten: s.beaten,
    };
  }

  me(id: string | null): Me {
    const p = id ? this.players.get(id) : undefined;
    const humans = this.solo ? 1 : this.humans.length;
    return {
      t: 'me',
      code: this.mode === 'party' ? this.code : null,
      id: p?.id ?? null,
      role: this.role(p),
      phase: this.phase,
      timeLeft: this.timeLeft,
      gus: this.gus.phase,
      rule: this.rule,
      ruleBy: this.ruleBy,
      beam: this.beamAt(),
      name: p?.name ?? '',
      seed: p?.seed ?? 0,
      x: p?.x ?? 0,
      moving: p?.moving ?? false,
      needFreshPress: p?.needFreshPress ?? false,
      micro: p?.state === 'caught' ? p.micro : null,
      microLeft: p?.state === 'caught' ? Math.max(0, T.MICRO - p.caughtFor) : 0,
      microTaps: p?.microTaps ?? 0,
      microScore: p?.state === 'caught' ? this.microScore(p) : 0,
      result: p?.result ?? null,
      nerdLeft: p?.nerdLeft ?? 0,
      isOwner: !!p && p.id === this.ownerId,
      ownerName: this.ownerId ? this.players.get(this.ownerId)?.name ?? null : null,
      ownerPickLeft: Math.max(0, this.ownerPickLeft),
      ruleChoices: this.ruleChoices,
      powers: p ? POWER_IDS.map((k) => ({ power: k, cd: p.powerCd[k] })) : [],
      pushTaps: p?.pushTaps ?? 0,
      voted: p?.voted ?? false,
      vote: this.phase === 'vote' ? this.voteState() : null,
      rank: p ? this.rankCache.get(p.id) ?? humans : 0,
      total: humans,
      score: p?.score ?? 0,
      reveal: this.reveal,
      mugshot: p ? this.mugshots.get(p.id) ?? null : null,
      solo: this.soloView(),
      say: this.sayState,
    };
  }
}

export function cleanName(s: string): string {
  const up = String(s ?? '').toUpperCase().replace(/[^A-Z0-9 .'!?-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  return up || 'GUEST';
}
