import { NICKNAMES } from '../../shared/text';
import { describe, it, expect } from 'vitest';
import { Room, type Player } from './room';
import { Gus } from './gus';
import { T, GUS_SLEEPY, GUS_SHARP, SOLO_LEVELS } from '../../shared/constants';
import type { GameEvent } from '../../shared/protocol';

const DT = 1 / T.TICK_HZ;

/** Deterministic PRNG so every run plays the same night. */
function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function mkRoom(opts: { npcs?: boolean; seed?: number; roundSecs?: number } = {}) {
  return new Room('TEST', { rand: seeded(opts.seed ?? 7), settings: { npcs: opts.npcs ?? false, roundSecs: opts.roundSecs ?? 120 } });
}

type Bot = (room: Room, p: Player) => void;
/** Plays safe: moves while his back is turned, lets go at the first sign of a turn. */
const careful: Bot = (room, p) => {
  const safe = room.gus.phase === 'back' || room.gus.phase === 'sleep';
  const wantMove = safe && p.state === 'outside';
  const hold = room.rule === 'moonwalk' ? !wantMove : wantMove;
  if (hold && !p.holding) room.press(p.id);
  else if (!hold && p.holding) room.release(p.id);
  if (p.needFreshPress && room.rule === 'moonwalk') { room.press(p.id); }
};
const idle: Bot = () => {};

function run(room: Room, secs: number, bots: Record<string, Bot> = {}, onEvent?: (e: GameEvent) => void) {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(secs / DT); i++) {
    for (const [id, bot] of Object.entries(bots)) { const p = room.players.get(id); if (p) bot(room, p); }
    room.tick(DT);
    for (const e of room.drainEvents()) { events.push(e); onEvent?.(e); }
  }
  return events;
}
const kinds = (evs: GameEvent[], k: GameEvent['kind']) => evs.filter((e) => e.kind === k);

describe('Gus cycle', () => {
  it('runs back -> tell -> watch -> back with the sleepy timings and no fake-outs', () => {
    const g = new Gus();
    const rand = seeded(3);
    const seen: string[] = [];
    let t = 0;
    let tellAt = -1, watchAt = -1, backAt = -1;
    while (t < 12) {
      const c = g.step(DT, GUS_SLEEPY, rand);
      t += DT;
      if (c) seen.push(c);
      if (c === 'tell' && tellAt < 0) tellAt = t;
      if (c === 'turn' && watchAt < 0) watchAt = t;
      if (c === 'back' && backAt < 0) backAt = t;
    }
    expect(tellAt).toBeCloseTo(3.5, 1);
    expect(watchAt - tellAt).toBeCloseTo(0.8, 1);
    expect(backAt - watchAt).toBeCloseTo(1.4, 1);
    expect(seen).not.toContain('fakeout');
  });

  it('fakes out about as often as the sharp setting says', () => {
    const g = new Gus();
    const rand = seeded(11);
    let tells = 0, fakes = 0;
    for (let i = 0; i < 20000; i++) {
      const c = g.step(DT, GUS_SHARP, rand);
      if (c === 'turn') tells++;
      if (c === 'fakeout') { tells++; fakes++; }
    }
    expect(fakes / tells).toBeGreaterThan(0.18);
    expect(fakes / tells).toBeLessThan(0.32);
  });

  it('distract and snitch change the next phases', () => {
    const g = new Gus();
    g.reset(1);
    expect(g.distract(1)).toBe(true);
    expect(g.left).toBeCloseTo(2);
    g.extraWatch = 1;
    const rand = () => 0.99; // no fake-out
    while (g.phase !== 'watch') g.step(DT, GUS_SLEEPY, rand);
    expect(g.left).toBeGreaterThan(GUS_SLEEPY.watch[0] + 0.9);
    expect(g.distract(1)).toBe(false); // too late once he is looking
  });
});

describe('catching (fair)', () => {
  function caughtRoom() {
    const r = mkRoom();
    const id = r.join('t1', 'DAVE', 1);
    r.start();
    r.press(id);
    // walk until his first look starts
    while (r.gus.phase !== 'watch') { r.tick(DT); r.drainEvents(); }
    return { r, id };
  }

  it('is not caught inside the 200 ms grace window', () => {
    const { r, id } = caughtRoom();
    run(r, 0.15);
    r.release(id);
    run(r, 2);
    expect(r.players.get(id)!.stats.caught).toBe(0);
  });

  it('is caught when still moving after the grace window', () => {
    const { r, id } = caughtRoom();
    const evs = run(r, 0.4);
    expect(r.players.get(id)!.state).toBe('caught');
    expect(kinds(evs, 'caught')).toHaveLength(1);
  });

  it('gives slow phones extra grace (capped)', () => {
    const r = mkRoom();
    const id = r.join('t1', 'DAVE', 1);
    r.setLatency(id, 0.3); // 150 ms one way
    r.start();
    r.press(id);
    while (r.gus.phase !== 'watch') { r.tick(DT); r.drainEvents(); }
    run(r, 0.3);
    expect(r.players.get(id)!.state).toBe('outside');
    run(r, 0.2);
    expect(r.players.get(id)!.state).toBe('caught');
  });

  it('does not move anyone during the grace window', () => {
    const { r, id } = caughtRoom();
    const x = r.players.get(id)!.x;
    run(r, 0.1);
    expect(r.players.get(id)!.x).toBe(x);
  });
});

describe('Prove It microgames', () => {
  it('Mash: enough taps passes, keeps the spot and gains a step', () => {
    const r = mkRoom();
    const id = r.join('t1', 'DAVE', 1);
    r.start();
    r.press(id);
    let evs: GameEvent[] = [];
    while (r.players.get(id)!.state !== 'caught') { r.tick(DT); evs = evs.concat(r.drainEvents()); }
    const p = r.players.get(id)!;
    const x = p.x;
    expect(p.micro).toBe('mash');
    for (let i = 0; i < T.MICRO_PASS_TAPS; i++) { r.tap(id); if (i % 4 === 3) run(r, 0.25); }
    let resultRole = '';
    evs = run(r, T.MICRO, {}, (e) => { if (e.kind === 'pass') resultRole = r.me(id).role; });
    expect(p.state).toBe('outside');
    expect(p.x).toBeCloseTo(x + T.PASS_BONUS, 5);
    expect(p.score).toBe(T.PASS_POINTS);
    expect(kinds(evs, 'pass')).toHaveLength(1);
    expect(p.needFreshPress).toBe(true);
    expect(resultRole).toBe('result');
  });

  it('Mash: too few taps flings you back to the start with a roast', () => {
    const r = mkRoom();
    const id = r.join('t1', 'DAVE', 1);
    r.start();
    r.press(id);
    while (r.players.get(id)!.state !== 'caught') { r.tick(DT); r.drainEvents(); }
    for (let i = 0; i < 5; i++) r.tap(id);
    let resultRole = '';
    const evs = run(r, T.MICRO + 0.1, {}, (e) => { if (e.kind === 'flung') resultRole = r.me(id).role; });
    const p = r.players.get(id)!;
    expect(resultRole).toBe('result');
    expect(p.x).toBe(0);
    expect(p.score).toBe(T.FLING_POINTS);
    const fl = kinds(evs, 'flung')[0] as Extract<GameEvent, { kind: 'flung' }>;
    expect(fl.line.length).toBeGreaterThan(5);
    expect(r.me(id).result?.line).toBe(fl.line);
  });

  it('uses Claude\'s pre-written line when it arrived during the challenge', () => {
    const r = mkRoom();
    const id = r.join('t1', 'DAVE', 1);
    r.start();
    r.drainJobs();
    r.press(id);
    while (r.players.get(id)!.state !== 'caught') { r.tick(DT); r.drainEvents(); }
    const job = r.drainJobs().find((j) => j.kind === 'roast')!;
    expect(job).toBeTruthy();
    if (job.kind !== 'roast') throw new Error();
    expect(job.ctx.name).toBe('DAVE');
    r.setRoasts(job.round, new Map([[id, job.catchNo]]), [{ playerId: id, passLine: 'AI PASS', failLine: 'AI FAIL' }]);
    const evs = run(r, T.MICRO + 0.1);
    expect((kinds(evs, 'flung')[0] as Extract<GameEvent, { kind: 'flung' }>).line).toBe('AI FAIL');
  });

  it('ignores a roast from an earlier round', () => {
    const r = mkRoom();
    const id = r.join('t1', 'DAVE', 1);
    r.start();
    r.setRoasts(r.round - 1, new Map([[id, 1]]), [{ playerId: id, passLine: 'OLD', failLine: 'OLD' }]);
    r.press(id);
    while (r.players.get(id)!.state !== 'caught') { r.tick(DT); r.drainEvents(); }
    const evs = run(r, T.MICRO + 0.1);
    expect((kinds(evs, 'flung')[0] as Extract<GameEvent, { kind: 'flung' }>).line).not.toBe('OLD');
  });

  it('Shake: phones with motion sensors get Shake; energy passes; taps still count as a fallback', () => {
    let sawShake = false;
    for (let seed = 1; seed < 12 && !sawShake; seed++) {
      const r = mkRoom({ seed });
      const id = r.join('t1', 'DAVE', 1);
      r.setMotion(id, true);
      r.start();
      r.press(id);
      while (r.players.get(id)!.state !== 'caught') { r.tick(DT); r.drainEvents(); }
      const p = r.players.get(id)!;
      if (p.micro !== 'shake') continue;
      sawShake = true;
      expect(r.me(id).micro).toBe('shake');
      // 14 samples/s max are accepted: flooding does not help
      for (let i = 0; i < 100; i++) r.shake(id, 1);
      expect(p.microEnergy).toBeLessThanOrEqual(T.SHAKE_MAX_RATE);
      // steady shaking over 3 s passes
      for (let s = 0; s < 30; s++) { r.shake(id, 0.9); run(r, 0.1); }
      expect(p.stats.passes + (p.state === 'caught' ? 0 : 0)).toBeGreaterThanOrEqual(0);
      run(r, 2.5);
      expect(p.stats.passes).toBe(1);
    }
    expect(sawShake).toBe(true);
  });

  it('phones without motion sensors always get Mash', () => {
    for (let seed = 1; seed < 8; seed++) {
      const r = mkRoom({ seed });
      const id = r.join('t1', 'DAVE', 1);
      r.start();
      r.press(id);
      while (r.players.get(id)!.state !== 'caught') { r.tick(DT); r.drainEvents(); }
      expect(r.players.get(id)!.micro).toBe('mash');
    }
  });

  it('a catch never pauses anyone else', () => {
    const r = mkRoom();
    const a = r.join('a', 'ANNA', 1), b = r.join('b', 'BEN', 2);
    r.start();
    r.press(b);
    while (r.players.get(b)!.state !== 'caught') { run(r, DT, { [a]: careful }); }
    const xa = r.players.get(a)!.x;
    run(r, 4, { [a]: careful });
    expect(r.players.get(a)!.x).toBeGreaterThan(xa);
  });
});

describe('VIP owner and chaos rules', () => {
  function ownerRoom() {
    const r = mkRoom();
    const a = r.join('a', 'ANNA', 1), b = r.join('b', 'BEN', 2);
    r.start();
    const evs = run(r, 40, { [a]: careful });
    return { r, a, b, evs };
  }

  it('the first player through the rope becomes owner, within 35 s, and gets 3 of the 4 rules', () => {
    const { r, a, evs } = ownerRoom();
    const owner = kinds(evs, 'owner')[0] as Extract<GameEvent, { kind: 'owner' }>;
    expect(owner.id).toBe(a);
    const firstIn = evs.findIndex((e) => e.kind === 'entered');
    expect(firstIn).toBeGreaterThanOrEqual(0);
    expect(r.ruleChoices).toHaveLength(3);
    expect(new Set(r.ruleChoices).size).toBe(3);
  });

  it('first admission happens by 35 s for a careful player (sleepy start)', () => {
    const r = mkRoom();
    const a = r.join('a', 'ANNA', 1);
    r.start();
    let at = -1;
    run(r, 40, { [a]: careful }, (e) => { if (e.kind === 'entered' && at < 0) at = r.clock; });
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(35);
  });

  it('auto-picks one of the offered rules if the owner does not tap in 12 s', () => {
    const r = mkRoom();
    const a = r.join('a', 'ANNA', 1);
    r.join('z', 'ZED', 9); // stays outside, so the round doesn't jump to the all-in vote
    r.start();
    let ownerAt = -1;
    run(r, 40, { [a]: careful }, (e) => { if (e.kind === 'owner') ownerAt = r.clock; });
    expect(r.rule).not.toBeNull();
    expect(r.ruleChoices).toContain(r.rule);
    expect(ownerAt).toBeGreaterThan(0);
  });

  it('only the owner can pick, only from the offered rules, only once', () => {
    const r = mkRoom();
    const a = r.join('a', 'ANNA', 1), b = r.join('b', 'BEN', 2);
    r.start();
    while (!r.ownerId) run(r, DT, { [a]: careful });
    const offered = r.ruleChoices;
    const notOffered = (['lights', 'glasses', 'moonwalk', 'disco'] as const).find((x) => !offered.includes(x))!;
    r.pickRule(b, offered[0]);
    expect(r.rule).toBeNull();
    r.pickRule(a, notOffered);
    expect(r.rule).toBeNull();
    expect(r.me(a).role).toBe('owner-pick');
    r.pickRule(a, offered[1]);
    expect(r.rule).toBe(offered[1]);
    r.pickRule(a, offered[0]);
    expect(r.rule).toBe(offered[1]);
    expect(r.me(a).role).toBe('lounge');
  });

  it('Moonwalk: releasing moves, holding freezes', () => {
    const r = mkRoom();
    const b = r.join('b', 'BEN', 2);
    r.start();
    r.rule = 'moonwalk';
    r.press(b); // fresh press after start
    r.gus.reset(5);
    run(r, 1);
    expect(r.players.get(b)!.x).toBe(0);
    r.release(b);
    run(r, 1);
    expect(r.players.get(b)!.x).toBeGreaterThan(0);
  });

  it('Lights Out: only players inside the beam get caught', () => {
    const r = mkRoom();
    const a = r.join('a', 'ANNA', 1);
    r.start();
    r.rule = 'lights';
    const p = r.players.get(a)!;
    r.press(a);
    // stand far from the beam and keep moving through a whole look
    while (r.gus.phase !== 'watch') { r.tick(DT); r.drainEvents(); }
    const beam = r.beamAt()!;
    p.x = beam > 0.5 ? 0.05 : 0.95 - 0.1; // far side
    run(r, 0.5);
    if (Math.abs(p.x - r.beamAt()!) >= T.BEAM_HALF) expect(p.state).toBe('outside');
    // now stand in the beam
    while (r.gus.phase !== 'watch') { r.tick(DT); r.drainEvents(); }
    p.x = r.beamAt()!;
    run(r, 0.5);
    expect(p.state).toBe('caught');
  });

  it('New Glasses shortens the warning; Disco shortens the turns', () => {
    const r = mkRoom();
    r.join('a', 'ANNA', 1);
    r.start();
    r.clock = 60;
    r.ownerId = 'x';
    const base = (r as unknown as { gusParams(): { tell: number[]; back: number[] } }).gusParams();
    r.rule = 'glasses';
    const g = (r as unknown as { gusParams(): { tell: number[]; back: number[] } }).gusParams();
    expect(g.tell[0]).toBeLessThan(base.tell[0]);
    r.rule = 'disco';
    const d = (r as unknown as { gusParams(): { tell: number[]; back: number[] } }).gusParams();
    expect(d.back[1]).toBeLessThan(base.back[1]);
  });
});

describe('the 35-second nap', () => {
  it('Gus naps once at 35 s if nobody is in yet', () => {
    const r = mkRoom();
    r.join('a', 'ANNA', 1);
    r.start();
    const evs = run(r, 45);
    expect(kinds(evs, 'nap')).toHaveLength(1);
  });

  it('no nap once somebody is in', () => {
    const r = mkRoom();
    const a = r.join('a', 'ANNA', 1);
    r.start();
    const evs = run(r, 45, { [a]: careful });
    expect(kinds(evs, 'owner')).toHaveLength(1);
    const ownerIdx = evs.findIndex((e) => e.kind === 'owner');
    const napIdx = evs.findIndex((e) => e.kind === 'nap');
    expect(napIdx === -1 || napIdx < ownerIdx).toBe(true);
  });
});

describe('finale, crown and results', () => {
  it('rush -> vote -> one VIP; a coup hands the crown to the earliest supporter', () => {
    const r = mkRoom({ roundSecs: 90 });
    const a = r.join('a', 'ANNA', 1), b = r.join('b', 'BEN', 2), c = r.join('c', 'CLEO', 3), d = r.join('d', 'DAVE', 4);
    r.start();
    const bots = { [a]: careful, [b]: careful, [c]: careful, [d]: idle };
    run(r, 90 - T.PUSH - T.VOTE - 0.5, bots);
    expect(r.players.get(a)!.state).toBe('lounge');
    expect(r.ownerId).toBe(a);
    run(r, 1);
    expect(r.phase).toBe('push');
    expect(r.me(d).role).toBe('break');
    expect(r.me(b).role).toBe('defend');
    for (let i = 0; i < 8; i++) { r.tap(b); r.tap(c); run(r, 0.5); }
    while (r.phase === 'push') run(r, DT);
    expect(r.phase).toBe('vote');
    expect(r.ropeSnapped).toBe(false);
    expect(r.me(a).role).toBe('defending');
    expect(r.me(d).role).toBe('outside-vote');
    run(r, 0.6);
    // the later entrant votes first; the earliest supporter still takes the seat
    const later = r.players.get(b)!.entryOrder > r.players.get(c)!.entryOrder ? b : c;
    const earlier = later === b ? c : b;
    r.tap(later); r.tap(earlier);
    run(r, T.VOTE);
    expect(r.phase).toBe('reveal');
    const rev = r.reveal!;
    expect(rev.winnerId).toBe(earlier);
    expect(rev.prevOwnerName).toBe('ANNA');
    expect(rev.ranking[0].id).toBe(earlier);
    expect(rev.awards.find((x) => x.label === 'FIRST THROUGH THE DOOR')?.name).toBe('ANNA');
    // every phone has its own distinct rank and a mugshot
    const ranks = [a, b, c, d].map((id) => r.me(id).rank);
    expect(new Set(ranks).size).toBe(4);
    for (const id of [a, b, c, d]) {
      const m = r.me(id).mugshot!;
      expect(m).toBeTruthy();
      expect(m.rankLine.length).toBeGreaterThan(0);
    }
    expect(r.me(earlier).mugshot!.rankLine).toBe("TONIGHT'S VIP");
    expect(r.drainJobs().some((j) => j.kind === 'finale')).toBe(true);
  });

  it('a snapped rope admits the crowd and multiplies their score', () => {
    const r = mkRoom({ roundSecs: 90 });
    const a = r.join('a', 'ANNA', 1), d = r.join('d', 'DAVE', 4);
    r.start();
    run(r, 90 - T.PUSH - T.VOTE + 0.1, { [a]: careful });
    expect(r.phase).toBe('push');
    for (let i = 0; i < 30; i++) { r.tap(d); run(r, 0.3); }
    run(r, T.PUSH);
    expect(r.ropeSnapped).toBe(true);
    expect(r.players.get(d)!.state).toBe('lounge');
    run(r, T.VOTE + 0.2);
    expect(r.players.get(d)!.score).toBe(Math.round(T.ENTRY_POINTS[1] * T.RUSH_MULT));
  });

  it('votes right after the rush do not count (lift and tap again)', () => {
    const r = mkRoom({ roundSecs: 90 });
    const a = r.join('a', 'ANNA', 1), b = r.join('b', 'BEN', 2);
    r.join('z', 'ZED', 9); // stays outside: the normal rush, then the vote
    r.start();
    run(r, 90 - T.VOTE + 0.05, { [a]: careful, [b]: careful });
    expect(r.phase).toBe('vote');
    r.tap(b);
    expect(r.players.get(b)!.voted).toBe(false);
  });
});

describe('everyone in: straight to the vote', () => {
  it('the last runner through the rope opens a full vote countdown at once; no rope contest', () => {
    const r = mkRoom({ roundSecs: 120 });
    const ids = ['ANNA', 'BEN', 'CLEO'].map((n, i) => r.join(n.toLowerCase(), n, i + 1));
    r.start();
    const bots = Object.fromEntries(ids.map((id) => [id, careful]));
    const evs: GameEvent[] = [];
    let lastInAt = -1, voteAt = -1;
    while (r.phase === 'play' && r.clock < 110) {
      for (const e of run(r, DT, bots)) { evs.push(e); if (e.kind === 'entered') lastInAt = r.clock; }
    }
    voteAt = r.clock;
    expect(r.phase).toBe('vote');
    expect(voteAt).toBeLessThan(120 - T.PUSH - T.VOTE);  // well before the scheduled rush
    expect(voteAt - lastInAt).toBeLessThanOrEqual(DT + 1e-9);
    expect(kinds(evs, 'allin')).toHaveLength(1);
    expect(kinds(evs, 'rope')).toHaveLength(0);
    expect(r.snapshot().allIn).toBe(true);
    expect(r.snapshot().ropeSnapped).toBeNull();
    expect(r.timeLeft).toBeCloseTo(T.VOTE, 1);
    expect(evs.some((e) => e.kind === 'say' && /EVERYONE'S IN\. TIME TO VOTE/.test(e.text))).toBe(true);
    const more = run(r, T.VOTE - 0.2);
    expect(r.phase).toBe('vote');
    run(r, 0.3);
    expect(r.phase).toBe('reveal');
    expect(r.reveal!.allIn).toBe(true);
    expect(kinds(more, 'allin')).toHaveLength(0);
  });

  it('a last runner who arrives on the push boundary gets one vote, one reveal, never two', () => {
    for (const offset of [-2 * DT, -DT, 0, DT, 2 * DT]) {
      const r = mkRoom({ roundSecs: 90 });
      const a = r.join('a', 'ANNA', 1), b = r.join('b', 'BEN', 2);
      r.start();
      // ANNA gets in early; BEN is parked so he reaches the rope right around the push switch
      run(r, 40, { [a]: careful });
      const pushAt = 90 - T.PUSH - T.VOTE;
      const p = r.players.get(b)!;
      p.state = 'outside'; p.needFreshPress = false;
      r.press(b);
      while (r.clock < pushAt + offset - DT * 1.5) { p.x = 0.5; r.tick(DT); r.drainEvents(); }
      p.x = 1 - 0.5 * DT / T.TRACK_SECONDS; // one tick from the rope
      const evs: GameEvent[] = [];
      const phases: string[] = [];
      for (let i = 0; i < Math.round(30 / DT) && r.phase !== 'reveal'; i++) {
        r.tick(DT);
        evs.push(...r.drainEvents());
        if (phases[phases.length - 1] !== r.phase) phases.push(r.phase);
      }
      expect(r.phase).toBe('reveal');
      const opens = kinds(evs, 'allin').length + kinds(evs, 'rope').length;
      expect(opens).toBe(1);
      expect(phases.filter((x) => x === 'vote')).toHaveLength(1);
      expect(phases.filter((x) => x === 'reveal')).toHaveLength(1);
      // either he got in (all-in vote) or the push caught him first (normal rush)
      expect(['vote', 'push']).toContain(phases[0] === 'play' ? phases[1] : phases[0]);
    }
  });
});

describe('the coup vote card', () => {
  function toVote() {
    const r = mkRoom({ roundSecs: 120 });
    const ids = ['ANNA', 'BEN', 'CLEO', 'DAVE', 'EVE'].map((n, i) => r.join(n.toLowerCase(), n, i + 1));
    r.start();
    const bots = Object.fromEntries(ids.map((id) => [id, careful]));
    while (r.phase === 'play' || r.phase === 'push') run(r, DT, bots);
    expect(r.phase).toBe('vote');
    run(r, T.VOTE_LIFT + 0.05);
    const byOrder = ids.map((id) => r.players.get(id)!).sort((x, y) => x.entryOrder - y.entryOrder);
    return { r, byOrder };
  }

  it('shows each voter whom a CROWN tap would seat, and updates when an earlier entrant joins in', () => {
    const { r, byOrder } = toVote();
    const [owner, second, third, fourth, fifth] = byOrder;
    expect(r.ownerId).toBe(owner.id);
    expect(r.me(owner.id).role).toBe('defending');
    expect(r.me(owner.id).vote!.ifCrownId).toBeNull();
    // nobody has voted: a CROWN tap seats yourself
    expect(r.me(fourth.id).vote!.ifCrownId).toBe(fourth.id);
    r.vote(fifth.id, 'crown');
    expect(r.me(fourth.id).vote!.ifCrownId).toBe(fourth.id);
    expect(r.me(third.id).vote!.ifCrownName).toBe(third.name);
    r.vote(fourth.id, 'crown');
    expect(r.snapshot().vote!.successorId).toBe(fourth.id);
    // the second entrant joins the coup: every card now names them
    r.vote(second.id, 'crown');
    expect(r.snapshot().vote!.successorName).toBe(second.name);
    expect(r.me(third.id).vote!.ifCrownName).toBe(second.name);
    expect(r.me(fifth.id).vote!.successorName).toBe(second.name);
    expect(r.me(fifth.id).vote!.choice).toBe('crown');
    // strict majority of 4 eligible = 3: the coup passes, the earliest supporter is crowned
    expect(r.snapshot().vote!.needed).toBe(3);
    run(r, T.VOTE);
    expect(r.reveal!.winnerId).toBe(second.id);
    expect(r.reveal!.prevOwnerName).toBe(owner.name);
    expect(r.reveal!.vote).toEqual({ cast: 3, kept: 0, needed: 3, eligible: 4 });
  });

  it('KEEP is a real choice: it is counted, it is final, and it does not help the coup', () => {
    const { r, byOrder } = toVote();
    const [owner, second, third, fourth] = byOrder;
    r.vote(second.id, 'keep');
    r.vote(second.id, 'crown'); // too late: one choice
    expect(r.players.get(second.id)!.voted).toBe(false);
    expect(r.me(second.id).vote!.choice).toBe('keep');
    expect(r.me(second.id).vote!.ifCrownId).toBeNull();
    r.vote(third.id, 'crown'); r.vote(fourth.id, 'crown');
    expect(r.snapshot().vote).toMatchObject({ cast: 2, kept: 1, needed: 3 });
    run(r, T.VOTE);
    expect(r.reveal!.winnerId).toBe(owner.id);
    expect(r.reveal!.prevOwnerName).toBeNull();
    expect(r.reveal!.ownerBeforeVote).toBe(owner.name);
  });
});

describe('player numbers', () => {
  it('ten phones get 1..10, same names stay and are told apart by number, numbers survive a reconnect and are reused after a leave', () => {
    const r = mkRoom();
    const ids = Array.from({ length: 10 }, (_, i) => r.join(`t${i}`, i < 3 ? 'NOT A COP' : `P${i}`, i));
    expect(ids.map((id) => r.players.get(id)!.tag)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ids.slice(0, 3).map((id) => r.players.get(id)!.name)).toEqual(['NOT A COP', 'NOT A COP', 'NOT A COP']);
    r.start();
    r.setConnected(ids[1], false);
    expect(r.join('t1', 'WHATEVER', 99)).toBe(ids[1]);
    expect(r.me(ids[1]).tag).toBe(2);
    expect(r.me(ids[1]).name).toBe('NOT A COP');
    expect(r.snapshot().players.find((p) => p.id === ids[1])!.tag).toBe(2);
    r.reset();
    r.setConnected(ids[4], false);
    r.dropDisconnected();
    const n = r.join('new', 'NEWBIE', 5);
    expect(r.players.get(n)!.tag).toBe(5);
  });
});

describe('lounge powers name who they hit', () => {
  it('banana: the thrower and the runner each get a named notice; distract and snitch tell the runners', () => {
    const r = mkRoom();
    const a = r.join('a', 'ANNA', 1), b = r.join('b', 'BEN', 2);
    r.start();
    while (!r.ownerId) run(r, DT, { [a]: careful });
    r.players.get(b)!.x = 0.5;
    const evs: GameEvent[] = [];
    r.usePower(a, 'banana'); evs.push(...r.drainEvents());
    expect(r.me(a).notice!.text).toBe('YOU TRIPPED 02 BEN');
    expect(r.me(b).notice!.text).toBe('01 ANNA TRIPPED YOU');
    expect(r.me(b).notice!.tone).toBe('bad');
    const pe = evs.find((e) => e.kind === 'power');
    expect(pe).toMatchObject({ power: 'banana', by: 'ANNA', target: 'BEN', targetId: b, targetTag: 2, byTag: 1 });
    r.usePower(a, 'distract');
    expect(r.me(b).notice!.text).toBe('01 ANNA DISTRACTED GUS: +1S');
    r.usePower(a, 'snitch');
    expect(r.me(b).notice!.text).toBe('01 ANNA SNITCHED: NEXT LOOK +1S');
    expect(r.me(a).notice!.text).toMatch(/YOU SNITCHED/);
    run(r, 3.1);
    expect(r.me(b).notice).toBeNull();
  });
});

describe('NICE TRY, NERD', () => {
  it('an inhuman tap rate sits you out for 5 seconds', () => {
    const r = mkRoom();
    const a = r.join('a', 'ANNA', 1);
    r.start();
    r.press(a);
    while (r.players.get(a)!.state !== 'caught') { r.tick(DT); r.drainEvents(); }
    for (let i = 0; i < T.NERD_TAPS + 1; i++) r.tap(a);
    const evs = r.drainEvents();
    expect(kinds(evs, 'nerd')).toHaveLength(1);
    const p = r.players.get(a)!;
    expect(p.nerdLeft).toBeGreaterThan(4.9);
    const taps = p.microTaps;
    r.tap(a);
    expect(p.microTaps).toBe(taps);
    run(r, T.MICRO);
    expect(r.me(a).role).toBe('nerd');
    r.press(a);
    expect(p.holding).toBe(false);
    run(r, T.NERD_FOR);
    expect(r.me(a).role).not.toBe('nerd');
  });
});

describe('NPCs', () => {
  it('fill a small room up to 4, never get in, and are left out of the results', () => {
    const r = mkRoom({ npcs: true, roundSecs: 90 });
    const a = r.join('a', 'ANNA', 1);
    r.start();
    const npcs = [...r.players.values()].filter((p) => p.npc);
    expect(npcs).toHaveLength(3);
    const evs = run(r, 90.5, { [a]: careful });
    expect(npcs.every((p) => p.state !== 'lounge')).toBe(true);
    expect(kinds(evs, 'caught').some((e) => npcs.some((n) => n.id === (e as { id: string }).id))).toBe(true);
    expect(r.reveal!.ranking.map((x) => x.id)).toEqual([a]);
    expect(r.me(a).total).toBe(1);
  });

  it('do not appear when 4 humans are playing, and leave on reset', () => {
    const r = mkRoom({ npcs: true });
    ['a', 'b', 'c', 'd'].forEach((t, i) => r.join(t, `P${i}`, i));
    r.start();
    expect([...r.players.values()].some((p) => p.npc)).toBe(false);
    const r2 = mkRoom({ npcs: true });
    r2.join('a', 'A', 1);
    r2.start();
    r2.reset();
    expect([...r2.players.values()].some((p) => p.npc)).toBe(false);
  });
});

describe('Lounge powers', () => {
  it('banana trips someone outside; cooldown blocks spam', () => {
    const r = mkRoom();
    const a = r.join('a', 'ANNA', 1), b = r.join('b', 'BEN', 2);
    r.start();
    while (r.players.get(a)!.state !== 'lounge') run(r, DT, { [a]: careful });
    const pb = r.players.get(b)!;
    pb.x = 0.5;
    r.usePower(a, 'banana');
    expect(pb.x).toBeCloseTo(0.5 - T.BANANA_SLIP);
    r.usePower(a, 'banana');
    expect(pb.x).toBeCloseTo(0.5 - T.BANANA_SLIP);
    expect(r.me(a).powers.find((x) => x.power === 'banana')!.cd).toBeGreaterThan(7);
  });

  it('players outside cannot use powers', () => {
    const r = mkRoom();
    const a = r.join('a', 'ANNA', 1);
    r.start();
    const left = r.gus.left;
    r.usePower(a, 'distract');
    expect(r.gus.left).toBe(left);
  });
});

describe('reconnects and membership', () => {
  it('a returning phone keeps its id, name and position', () => {
    const r = mkRoom();
    const a = r.join('tok', 'ANNA', 1);
    r.start();
    r.press(a);
    run(r, 2);
    const x = r.players.get(a)!.x;
    r.setConnected(a, false);
    run(r, 1);
    expect(r.players.get(a)!.x).toBe(x);
    expect(r.idForToken('tok')).toBe(a);
    expect(r.join('tok', 'SOMEONE ELSE', 9)).toBe(a);
    expect(r.players.get(a)!.name).toBe('ANNA');
  });

  it('cleans names to English only, keeps duplicates, and falls back to a nickname', () => {
    const r = mkRoom();
    const a = r.join('a', 'totally <21>', 1);
    const b = r.join('b', 'TOTALLY 21', 2);
    expect(r.players.get(a)!.name).toBe('TOTALLY 21');
    expect(r.players.get(b)!.name).toBe('TOTALLY 21');
    expect(r.players.get(r.join('z1', 'jay', 4))!.name).toBe('JAY');
    expect(r.players.get(r.join('z2', '  小林 Jay ', 5))!.name).toBe('JAY'); // non-English characters are dropped
    expect(r.players.get(r.join('z3', 'Wesley', 6))!.name).toBe('WESLEY');
    expect(r.players.get(r.join('z4', 'Zoë 🎉', 7))!.name).toBe('ZOE');
    expect(NICKNAMES).toContain(r.players.get(r.join('z5', '阿哲', 8))!.name); // nothing English left: a nickname
    expect(r.players.get(r.join('z6', 'ABCDEFGHIJKLMNOP', 9))!.name).toBe('ABCDEFGHIJKL');
    const blank = r.players.get(r.join('c', ' \u3000  ', 3))!.name;
    expect(NICKNAMES).toContain(blank);
  });

  it('a second round starts clean', () => {
    const r = mkRoom({ roundSecs: 90 });
    const a = r.join('a', 'ANNA', 1);
    r.start();
    run(r, 91, { [a]: careful });
    expect(r.phase).toBe('reveal');
    r.start();
    expect(r.phase).toBe('play');
    const p = r.players.get(a)!;
    expect(p.x).toBe(0);
    expect(p.score).toBe(0);
    expect(r.ownerId).toBeNull();
    expect(r.reveal).toBeNull();
  });
});

describe('solo gauntlet', () => {
  it('a careful player clears all three doors and beats the bouncer', () => {
    const r = new Room('SOLO', { mode: 'solo', rand: seeded(5) });
    const id = r.join('tok', 'SOLO SAM', 3);
    expect(r.me(id).role).toBe('solo-menu');
    r.soloStart(1);
    expect(r.solo!.active).toBe(false); // locked
    r.soloStart(0);
    expect(r.me(id).role).toBe('sneak');
    const seen: string[] = [];
    // in Area 51 the careful bot also freezes through the searchlight
    for (let i = 0; i < 20 * 240 && !r.solo!.beaten; i++) {
      const p = r.players.get(id)!;
      careful(r, p);
      if (p.state === 'caught') for (let k = 0; k < 2; k++) r.tap(id);
      r.tick(DT);
      for (const e of r.drainEvents()) if (e.kind === 'entered') seen.push(SOLO_LEVELS[e.order - 1].name);
      if (r.me(id).role === 'solo-clear') seen.push('clear');
    }
    expect(r.solo!.beaten).toBe(true);
    expect(r.solo!.cleared).toEqual([true, true, true]);
    expect(seen.filter((s) => s !== 'clear')).toEqual(['DIVE BAR', 'ROOFTOP', 'AREA 51']);
    expect(r.me(id).role).toBe('solo-done');
    const m = r.me(id).mugshot!;
    expect(m.rankLine).toBe('BOUNCER BEATEN');
    expect(r.me(id).solo!.time).toBeGreaterThan(20);
  });

  it('catches in solo still trigger a challenge and count', () => {
    const r = new Room('SOLO', { mode: 'solo', rand: seeded(5) });
    const id = r.join('tok', 'SOLO SAM', 3);
    r.soloStart(0);
    r.press(id);
    const evs = run(r, 12);
    expect(kinds(evs, 'caught').length).toBeGreaterThan(0);
    expect(r.solo!.catches).toBeGreaterThan(0);
  });
});

describe('AI jobs', () => {
  it('a round asks for a script, each catch for a roast, the buzzer for mugshots', () => {
    const r = mkRoom({ roundSecs: 90 });
    const a = r.join('a', 'ANNA', 1);
    r.start();
    const jobs = r.drainJobs();
    expect(jobs.map((j) => j.kind)).toEqual(['script']);
    r.press(a);
    run(r, 8);
    expect(r.drainJobs().some((j) => j.kind === 'roast')).toBe(true);
    run(r, 90);
    expect(r.drainJobs().some((j) => j.kind === 'finale')).toBe(true);
  });

  it('commentary updates the HUD within limits and is ignored outside play', () => {
    const r = mkRoom();
    r.join('a', 'ANNA', 1);
    r.start();
    const ego = r.hud.ego;
    r.sayLive(r.round, 'HELLO', 'MONO', { ego: 5 });
    expect(r.hud.ego).toBeCloseTo(Math.min(1, ego + 0.2));
    expect(r.snapshot().say!.who).toBe('LIVE');
    r.reset();
    r.sayLive(r.round, 'LATE', 'X');
    expect(r.snapshot().say!.text).not.toBe('LATE');
  });
});
