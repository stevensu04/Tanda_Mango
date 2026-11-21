import { describe, it, expect, afterAll } from 'vitest';
import { startServer, type TestServer } from './net';
import { playDemoRound, winnerAgreement, type DemoRun } from './scenario';
import { T } from '../../shared/constants';

/** Plan §3.8 bullet 2: the scripted two-minute demo, over real sockets, with Claude mocked "ok". */
describe('demo rehearsal (MockVoice ok)', () => {
  let server: TestServer;
  let run: DemoRun;
  const R = 120;

  afterAll(async () => { run?.closeAll(); await server?.close(); });

  it('plays a full 120 s round at 4x', async () => {
    server = await startServer({ speed: 4 });
    run = await playDemoRound(server);
    expect(run.screen.snap!.phase).toBe('reveal');
  }, 70000);

  it('first admission within 35 game-seconds, by the careful player', () => {
    expect(run.firstEntryGt).not.toBeNull();
    expect(run.firstEntryGt!).toBeLessThanOrEqual(35);
    const owner = run.screen.eventsOf('owner')[0];
    expect(owner?.name).toBe('ANNA');
    const entered = run.screen.eventsOf('entered');
    expect(entered[0].name).toBe('ANNA');
    expect(entered[0].order).toBe(1);
    // BEN and CLEO get in later
    expect(entered.map((e) => e.name)).toEqual(expect.arrayContaining(['BEN', 'CLEO']));
    expect(entered.find((e) => e.name === 'BEN')!.gt).toBeGreaterThan(entered[0].gt);
    expect(entered.find((e) => e.name === 'CLEO')!.gt).toBeGreaterThan(entered[0].gt);
  });

  it("the owner's rule pick is live on the projector and on every phone", () => {
    expect(run.choices.length).toBe(3);
    expect(run.chosen).not.toBeNull();
    expect(run.choices).toContain(run.chosen);
    const ev = run.screen.eventsOf('rule');
    expect(ev.length).toBe(1);
    expect(ev[0].rule).toBe(run.chosen);
    expect(ev[0].by).toBe('ANNA');
    expect(run.ruleSeenOnSnap).toBe(true);
    expect([...run.rulePhones].sort()).toEqual(run.phones.map((p) => p.label).sort());
    expect(run.screen.snap!.rule).toBe(run.chosen);
    expect(run.screen.snap!.ruleBy).toBe('ANNA');
  });

  it('DAVE is caught at least 3 times; each catch ends in a pass/flung event with a line, some written by the AI', () => {
    const caught = run.screen.eventsOf('caught');
    const daveCaught = caught.filter((e) => e.name === 'DAVE');
    expect(daveCaught.length).toBeGreaterThanOrEqual(3);
    expect(caught.length).toBeGreaterThanOrEqual(3);
    const results = run.screen.events.filter((e) => e.kind === 'pass' || e.kind === 'flung') as ((typeof run.screen.events)[number] & { id: string; line: string })[];
    // every catch that had time to finish (the finale push cancels one still in progress)
    for (const c of caught.filter((c) => c.gt < R - T.PUSH - T.VOTE - T.MICRO - 1)) {
      const r = results.find((e) => e.id === c.id && e.wall >= c.wall);
      expect(r, `catch of ${c.name} at ${c.gt.toFixed(1)}s has an outcome`).toBeTruthy();
      expect(r!.line.length).toBeGreaterThan(0);
    }
    expect(results.some((r) => r.kind === 'pass' && r.name === 'DAVE')).toBe(true);
    expect(results.some((r) => r.kind === 'flung' && r.name === 'DAVE')).toBe(true);
    const lines = results.map((r) => r.line);
    expect(lines.every((l) => l.length > 0)).toBe(true);
    // the roast is generated during the 5 s challenge, so it is ready when the challenge ends
    expect(lines.filter((l) => l.startsWith('(AI)')).length).toBeGreaterThanOrEqual(1);
    expect(lines.filter((l) => l.startsWith('(AI)')).length).toBe(lines.length);
  });

  it('commentary and the AI flag: LIVE says appear and the snapshot reports ai = live', () => {
    const live = run.screen.events.filter((e) => e.kind === 'say' && e.who === 'LIVE');
    expect(live.length).toBeGreaterThanOrEqual(3);
    expect(run.aiFlagsMid.length).toBeGreaterThan(0);
    expect(run.aiFlagsMid.every((f) => f === 'live')).toBe(true);
  });

  it('runs the finale: push, then vote, with a rope event', () => {
    expect(run.phases.filter((p) => p !== 'lobby')).toEqual(['play', 'push', 'vote', 'reveal']);
    const rope = run.screen.eventsOf('rope');
    expect(rope.length).toBe(1);
    // rope lands at the push/vote boundary: R - VOTE
    expect(rope[0].gt).toBeGreaterThanOrEqual(R - T.VOTE - 1);
    expect(rope[0].gt).toBeLessThanOrEqual(R - T.VOTE + 1);
    expect(run.screen.snap!.ropeSnapped).toBe(rope[0].snapped);
  });

  it('reveal: exactly one winner every phone agrees on, distinct ranks, every phone has a mugshot', () => {
    const rev = run.screen.snap!.reveal!;
    expect(rev).toBeTruthy();
    expect(rev.winnerId).toBeTruthy();
    expect(winnerAgreement(run)).toBe(true);
    expect(rev.ranking.length).toBe(4);
    expect(rev.ranking[0].id).toBe(rev.winnerId);
    const ranks = run.phones.map((p) => p.me!.rank);
    expect([...ranks].sort()).toEqual([1, 2, 3, 4]);
    expect(run.phones.filter((p) => p.me!.rank === 1).length).toBe(1);
    expect(run.phones.find((p) => p.me!.rank === 1)!.me!.id).toBe(rev.winnerId);
    for (const p of run.phones) {
      expect(rev.ranking[p.me!.rank - 1].id).toBe(p.me!.id);
      expect(p.me!.role).toBe('reveal');
      const m = p.me!.mugshot;
      expect(m, `${p.label} mugshot`).toBeTruthy();
      expect(m!.name).toBe(p.me!.name);
      expect(m!.rankLine.length).toBeGreaterThan(0);
    }
    expect(run.phones.filter((p) => p.me!.mugshot!.rankLine === "TONIGHT'S VIP").length).toBe(1);
    // the mock finale landed: closing toast and receipts are AI-written
    expect(rev.toast.startsWith('(AI)')).toBe(true);
    expect(run.phones.every((p) => p.me!.mugshot!.roast.startsWith('(AI)'))).toBe(true);
    // DAVE was caught a lot
    expect(run.dave.me!.mugshot!.caught).toBeGreaterThanOrEqual(3);
  });

  it('game time is measured from snap.timeLeft, not wall clock', () => {
    // 120 game-seconds at 4x took roughly 30 s of wall time
    const first = run.screen.events.find((e) => e.kind === 'say')!;
    const rope = run.screen.eventsOf('rope')[0];
    const wallSecs = (rope.wall - first.wall) / 1000;
    expect(wallSecs).toBeLessThan(40);
    expect(rope.gt).toBeGreaterThan(100);
  });
});
