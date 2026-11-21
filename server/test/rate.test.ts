import { describe, it, expect, afterAll } from 'vitest';
import { startServer, Bot, until, sleep, type TestServer } from './net';
import { T } from '../../shared/constants';

/** Plan §3.7 load criteria in miniature: the projector gets ~SNAP_HZ snapshots/s and phones get ~SNAP_HZ `me`/s. */
describe('transport cadence (speed 1)', () => {
  let server: TestServer;
  afterAll(async () => { await server?.close(); });

  it(`screen snapshots and phone me arrive at about ${T.SNAP_HZ} Hz`, async () => {
    server = await startServer({ speed: 1 });
    const screen = await Bot.screen(server.url);
    await until(() => screen.code, 2000, 'room');
    const phone = await Bot.phone(server.url, 'rate-phone', screen.code!);
    phone.join('RATE');
    await until(() => phone.me?.id, 2000, 'joined');
    await sleep(300);
    const s0 = screen.snapCount;
    let m0 = 0;
    phone.onMe(() => { m0++; });
    const t0 = Date.now();
    await sleep(4000);
    const secs = (Date.now() - t0) / 1000;
    const snapHz = (screen.snapCount - s0) / secs;
    const meHz = m0 / secs;
    expect(snapHz).toBeGreaterThan(T.SNAP_HZ * 0.9);
    expect(snapHz).toBeLessThan(T.SNAP_HZ * 1.1);
    expect(meHz).toBeGreaterThan(T.SNAP_HZ * 0.9);
    screen.close(); phone.close();
  }, 15000);
});
