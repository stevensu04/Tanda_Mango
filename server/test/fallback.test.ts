import { describe, it, expect } from 'vitest';
import { startServer, Bot, until, type TestServer } from './net';
import { playDemoRound, winnerAgreement, type DemoRun } from './scenario';

/** Claude unreachable, too slow, or switched off: the same round still completes with scripted lines. */
function checkScripted(run: DemoRun) {
  const s = run.screen;
  expect(s.snap!.phase).toBe('reveal');
  expect(run.phases.filter((p) => p !== 'lobby')).toEqual(['play', 'push', 'vote', 'reveal']);
  const caught = s.eventsOf('caught');
  expect(caught.length).toBeGreaterThanOrEqual(3);
  const results = s.events.filter((e) => e.kind === 'pass' || e.kind === 'flung') as unknown as { kind: string; id: string; line: string; wall: number }[];
  for (const c of caught.filter((c) => c.gt < 120 - 15 - 5 - 1)) {
    const r = results.find((e) => e.id === c.id && e.wall >= c.wall);
    expect(r, `catch of ${c.name} has an outcome`).toBeTruthy();
  }
  expect(results.length).toBeGreaterThanOrEqual(3);
  for (const r of results) {
    expect(r.line.length).toBeGreaterThan(0);
    expect(r.line.startsWith('(AI)'), `scripted line for every catch: ${r.line}`).toBe(false);
  }
  // commentary still appears
  expect(s.events.filter((e) => e.kind === 'say' && e.who === 'LIVE').length).toBeGreaterThanOrEqual(1);
  // the rule pick and finale still work
  expect(run.chosen).not.toBeNull();
  expect(s.snap!.rule).toBe(run.chosen);
  expect(winnerAgreement(run)).toBe(true);
  for (const p of run.phones) {
    expect(p.me!.mugshot, `${p.label} mugshot`).toBeTruthy();
    expect(p.me!.mugshot!.roast.length).toBeGreaterThan(0);
    expect(p.me!.mugshot!.title.length).toBeGreaterThan(0);
  }
  expect([...run.phones.map((p) => p.me!.rank)].sort()).toEqual([1, 2, 3, 4]);
}

async function withServer(opts: Parameters<typeof startServer>[0], fn: (s: TestServer) => Promise<void>) {
  const server = await startServer(opts);
  try { await fn(server); } finally { await server.close(); }
}

describe('Claude unavailable', () => {
  it.concurrent("MockVoice('down'): scripted lines, scripted commentary, mugshots delivered", async () => {
    await withServer({ speed: 4, voice: { mode: 'down' } }, async (server) => {
      const run = await playDemoRound(server);
      try {
        checkScripted(run);
        expect(server.voice.stats().calls).toBeGreaterThan(0);        // it did try
        expect(run.screen.snap!.ai).toBe('scripted');
        expect(run.screen.events.filter((e) => e.kind === 'say' && e.text.startsWith('(AI)')).length).toBe(0);
        expect(run.screen.snap!.reveal!.toast.startsWith('(AI)')).toBe(false);
      } finally { run.closeAll(); }
    });
  }, 70000);

  it.concurrent("MockVoice('slow'): the answers arrive after the challenge, so every catch uses its scripted line", async () => {
    await withServer({ speed: 4, voice: { mode: 'slow', slowMs: 6000 } }, async (server) => {
      const run = await playDemoRound(server);
      try {
        checkScripted(run);
        // nobody waited for Claude: the 5 s challenge (about 1.3 s of wall time) is shorter than the 6 s answer
        const c = run.screen.eventsOf('caught')[0];
        const r = run.screen.events.find((e) => (e.kind === 'pass' || e.kind === 'flung') && e.wall >= c.wall)!;
        expect(r.wall - c.wall).toBeLessThan(4000);
      } finally { run.closeAll(); }
    });
  }, 70000);

  it.concurrent('settings.ai = false from the admin socket: no Claude calls at all, scripted everything', async () => {
    await withServer({ speed: 4, voice: { mode: 'ok' } }, async (server) => {
      let admin: Bot | undefined;
      const run = await playDemoRound(server, {
        beforeStart: async (code) => {
          admin = await Bot.admin(server.url, code);
          admin.settings({ ai: false });
          await until(() => admin!.admin?.room?.settings.ai === false, 3000, 'admin state shows ai=false');
        },
      });
      try {
        checkScripted(run);
        expect(server.voice.stats().calls).toBe(0);
        expect(run.screen.snap!.ai).toBe('scripted');
        expect(run.screen.events.filter((e) => e.kind === 'say' && e.text.startsWith('(AI)')).length).toBe(0);
        expect(admin!.admin!.room!.settings.ai).toBe(false);
      } finally { run.closeAll(); admin?.close(); }
    });
  }, 70000);
});
