/**
 * Host start paths after Test sound: one projector + two joined phones per run, real UI only.
 *
 *   npx tsx scripts/host-start.ts
 *
 * Paths (each in a fresh room):
 *   1 baseline        fresh lobby, press S
 *   2 test-then-S x3  mouse-click Test sound, let it finish, press S straight away (no other click)
 *   3 test-click-S    Test sound, let it finish, click the canvas, press S
 *   4 stop-then-S     Test sound, Stop halfway, press S
 *     mid-preview-S   Test sound, press S 3.5 s in (preview still playing): nothing may spill into the round
 *   5 host-page       Test sound, then START on the host page
 * For each: focused element before the key, whether the page got the S, whether a start was sent,
 * lobby -> play, both phones on the street, and whether any preview sound fired after the round began.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';

process.env.BOUNCER_AI = process.env.BOUNCER_AI || 'mock';
process.env.OPEN_ROOMS = process.env.OPEN_ROOMS || '1'; // projectors may open rooms without the host console (test mode)
const PORT = 5185;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = { path: string; focusBefore: string; keyReceived: boolean; startSent: boolean; phase: string; phones: string[]; ok: boolean; previewAfterStart: string };

async function run(browser: Browser, path: string): Promise<Row> {
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const screen = await sctx.newPage();
  await screen.goto(`${BASE}/screen.html`);
  await screen.waitForFunction(() => /room=[A-Z]{4}/.test(location.search));
  const code = new URL(screen.url()).searchParams.get('room')!;
  const phones = [];
  for (const name of ['NOT A COP', 'JAY']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/play.html?room=${code}`);
    await p.waitForFunction(() => !!(window as any).__club?.target('joinBtn'));
    await p.fill('#nameInput', name);
    const pt = await p.evaluate(() => (window as any).__club.target('joinBtn'));
    await p.mouse.click(pt.x, pt.y);
    await p.waitForFunction(() => (window as any).__club.me()?.role === 'lobby');
    phones.push(p);
  }
  const C = <T>(fn: string) => screen.evaluate((f) => (window as any).__club[f](), fn) as Promise<T>;
  const previewDone = () => screen.waitForFunction(() => document.getElementById('cv-test')!.textContent!.includes('Test sound'), null, { timeout: 20000 });

  if (path.startsWith('test') || path === 'stop-then-S' || path === 'mid-preview-S' || path === 'host-page') {
    const box = (await screen.locator('#cv-test').boundingBox())!;
    await screen.mouse.click(box.x + box.width / 2, box.y + box.height / 2);   // a real mouse click
    if (path === 'stop-then-S') { await sleep(3000); await screen.click('#cv-stop'); await sleep(200); }
    else if (path === 'mid-preview-S') { await sleep(3500); }   // S while Gus is humming / before the door
    else { await sleep(500); await previewDone(); }
    if (path === 'test-click-S') { await screen.mouse.click(640, 300); await sleep(100); }
  }
  const focusBefore = await C<string>('focus');
  const keysBefore = (await C<any[]>('keys')).length;
  const logBefore = (await C<any[]>('log')).length;
  if (path === 'host-page') {
    const admin = await (await browser.newContext()).newPage();
    await admin.goto(`${BASE}/admin.html?room=${code}`);
    await admin.waitForFunction(() => !(document.getElementById('start') as HTMLButtonElement).disabled);
    await admin.click('#start');
  } else {
    await screen.keyboard.press('s');
  }
  await sleep(1500);
  const keys = (await C<any[]>('keys')).slice(keysBefore);
  const snap = await C<any>('snap');
  const roles = await Promise.all(phones.map((p) => p.evaluate(() => (window as any).__club.me()?.role)));
  // any preview leftovers (hum/door/audition) firing into the real round over the next 8 s?
  const a0 = await C<any>('audio');
  let leak = '';
  for (let i = 0; i < 16; i++) {
    const a = await C<any>('audio');
    if (a.gusBusy > 0 && !(await C<any[]>('log')).slice(logBefore).some((e: any) => e.kind === 'hum' || e.kind === 'cute-shoes')) leak = `Gus sound with no game cue (gusBusy ${a.gusBusy.toFixed(2)})`;
    if (a.door > 2000 && !(await C<any[]>('log')).slice(logBefore).some((e: any) => e.kind === 'entered' || e.kind === 'rope')) leak = `door opened with nobody entering (${a.door} Hz)`;
    await sleep(500);
  }
  void a0;
  const row: Row = {
    path,
    focusBefore,
    keyReceived: path === 'host-page' ? true : keys.length > 0,
    startSent: path === 'host-page' ? true : keys.some((k) => k.startSent),
    phase: snap.phase,
    phones: roles,
    ok: snap.phase === 'play' && roles.every((r) => r === 'sneak'),
    previewAfterStart: leak || 'none',
  };
  await sctx.close();
  return row;
}

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: 'vite.config.ts', server: { port: PORT, strictPort: true, host: '127.0.0.1', hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'warn' });
  await server.listen();
  const browser = await chromium.launch();
  const rows: Row[] = [];
  try {
    for (const path of ['baseline-S', 'test-then-S #1', 'test-then-S #2', 'test-then-S #3', 'test-click-S', 'stop-then-S', 'mid-preview-S', 'host-page']) {
      const r = await run(browser, path.replace(/ #\d/, ''));
      r.path = path;
      rows.push(r);
      console.log(`${r.ok ? 'PASS' : 'FAIL'} ${path.padEnd(15)} focus=${r.focusBefore.padEnd(16)} key=${r.keyReceived ? 'yes' : 'NO '} start=${r.startSent ? 'yes' : 'NO '} phase=${r.phase.padEnd(6)} phones=${r.phones.join(',')} leftovers=${r.previewAfterStart}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(`artifacts/host-start-${process.env.TAG ?? 'run'}.json`, JSON.stringify(rows, null, 2));
  const ok = rows.filter((r) => r.ok).length;
  console.log(`\n${ok}/${rows.length} paths started the round`);
  process.exit(ok === rows.length ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
