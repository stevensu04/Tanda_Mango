/**
 * Host flow with per-room passwords, secure mode, two independent browsers.
 *   host browser:   creates room A (password A) and room B (password B), opens A's projector, starts A,
 *                   reloads A's dashboard mid-round and unlocks it again
 *   player browser: knows A's public code: joins on two phones, watches A's projector, opens
 *                   admin.html?room=A, tries B's password on A, sends control messages by hand
 * Finally a projector with no code must not create a room.
 *
 *   npx tsx scripts/host-flow.ts
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';

process.env.BOUNCER_AI = 'mock';
process.env.OPEN_ROOMS = '0';
const PORT = 5187;
const BASE = `http://localhost:${PORT}`;
const OUT = 'artifacts/host-flow';
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); };

function frames(page: Page) {
  const got: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => { if (typeof f.payload === 'string') got.push(f.payload); }));
  return got;
}
const raw = (page: Page, hello: object, msgs: object[]) => page.evaluate(async ([h, ms]) => {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  const seen: string[] = [];
  ws.onmessage = (e) => seen.push(String(e.data).slice(0, 140));
  await new Promise((r) => { ws.onopen = r; });
  ws.send(JSON.stringify(h));
  for (const m of ms as object[]) { ws.send(JSON.stringify(m)); await new Promise((r) => setTimeout(r, 80)); }
  await new Promise((r) => setTimeout(r, 600));
  ws.close();
  return seen;
}, [hello, msgs] as const);

async function createRoom(page: Page, pw: string): Promise<string> {
  await page.goto(`${BASE}/admin.html`);
  await page.waitForSelector('#landing:not(.hide)');
  await page.click('#goCreate');
  await page.fill('#newpw', pw);
  await page.click('.showpw[data-for=newpw]');
  const shown = await page.getAttribute('#newpw', 'type');
  await page.click('.showpw[data-for=newpw]');
  await page.click('#createform button[type=submit]');
  await page.waitForSelector('#roomui:not(.hide)');
  check(`Show/Hide toggles the password field (${pw})`, shown === 'text' && (await page.getAttribute('#newpw', 'type')) === 'password');
  return (await page.textContent('#rcode'))!.trim();
}

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: 'vite.config.ts', server: { port: PORT, strictPort: true, host: '127.0.0.1', hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'warn' });
  await server.listen();
  const hostBrowser = await chromium.launch();
  const playerBrowser = await chromium.launch();
  try {
    const hctx = await hostBrowser.newContext({ viewport: { width: 1100, height: 900 } });
    const adminA = await hctx.newPage();
    const aFrames = frames(adminA);
    await adminA.goto(`${BASE}/admin.html`);
    await adminA.waitForSelector('#landing:not(.hide)');
    check('admin landing shows Create a game / Return to my game, no room data', await adminA.isVisible('#goCreate') && await adminA.isVisible('#goReturn') && !aFrames.some((f) => f.includes('"t":"admin"')));
    await adminA.screenshot({ path: `${OUT}/1-landing.png` });
    const A = await createRoom(adminA, 'velvet A');
    const projHref = (await adminA.getAttribute('#openproj', 'href'))!;
    const phoneHref = (await adminA.getAttribute('#lphone', 'href'))!;
    check('dashboard: code, player QR, Open projector, Start round', /^[A-Z]{4}$/.test(A) && await adminA.isVisible('#qr') && await adminA.isVisible('#openproj') && await adminA.isVisible('#start'), `room ${A}`);
    check('projector and player links carry only the public code', projHref.endsWith(`/screen.html?room=${A}`) && phoneHref.endsWith(`/play.html?room=${A}`), `${projHref.replace(BASE, '')} | ${phoneHref.replace(/^https?:\/\/[^/]+/, '')}`);
    check('admin URL keeps the room code', new URL(adminA.url()).searchParams.get('room') === A);
    await adminA.screenshot({ path: `${OUT}/2-dashboard-A.png` });
    const adminB = await hctx.newPage();
    const B = await createRoom(adminB, 'banana B');
    check('room B is a different room', B !== A, `A ${A}, B ${B}`);

    const [proj] = await Promise.all([hctx.waitForEvent('page'), adminA.click('#openproj')]);
    await proj.waitForFunction(() => (window as any).__club?.snap()?.phase === 'lobby', null, { timeout: 10000 });

    // ---------- the player browser ----------
    const pctx = await playerBrowser.newContext({ viewport: { width: 1100, height: 900 } });
    const watchA = await pctx.newPage();
    await watchA.goto(`${BASE}/screen.html?room=${A}`);
    await watchA.waitForFunction(() => (window as any).__club?.snap()?.phase === 'lobby', null, { timeout: 10000 });
    check('a fresh browser with A\'s code can watch A on a projector page', true);
    await watchA.keyboard.press('s');
    await sleep(800);
    check('...but its S key does not start A', (await proj.evaluate(() => (window as any).__club.snap().phase)) === 'lobby');
    const phones: Page[] = [];
    for (const name of ['JAY', 'WESLEY']) {
      const ph = await (await playerBrowser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
      await ph.goto(`${BASE}/play.html?room=${A}`);
      await ph.waitForFunction(() => !!(window as any).__club?.target('joinBtn'));
      await ph.fill('#nameInput', name);
      const pt = await ph.evaluate(() => (window as any).__club.target('joinBtn'));
      await ph.mouse.click(pt.x, pt.y);
      await ph.waitForFunction(() => (window as any).__club.me()?.role === 'lobby');
      phones.push(ph);
    }
    check('two phones joined A with the public code', true);
    const spy = await pctx.newPage();
    const spyFrames = frames(spy);
    await spy.goto(`${BASE}/admin.html?room=${A}`);
    await spy.waitForSelector('#return:not(.hide)');
    check('admin.html?room=A in the player browser: "Welcome back", password only', (await spy.textContent('#welcome')) === `Welcome back to ${A}` && await spy.isHidden('#coderow') && await spy.isHidden('#roomui'));
    await spy.fill('#retpw', 'banana B');
    await spy.click('#returnform button[type=submit]');
    await spy.waitForFunction(() => document.getElementById('returnerr')!.textContent!.length > 0);
    check('B\'s password on A keeps the dashboard locked', await spy.isHidden('#roomui'), await spy.textContent('#returnerr') ?? '');
    check('the player browser never received host data (players, cost)', !spyFrames.some((f) => f.includes('"t":"admin"') || f.includes('"usd"')));
    await spy.screenshot({ path: `${OUT}/3-player-locked.png` });
    const before = await proj.evaluate(() => (window as any).__club.snap());
    const r1 = await raw(spy, { t: 'hello', role: 'admin', room: A, token: 'guess' }, [{ t: 'start' }, { t: 'settings', settings: { roundSecs: 90 } }, { t: 'kick', id: 'p1' }, { t: 'reset' }]);
    const r2 = await raw(spy, { t: 'hello', role: 'screen', room: A }, [{ t: 'start' }, { t: 'reset' }]);
    await sleep(400);
    const after = await proj.evaluate(() => (window as any).__club.snap());
    check('hand-sent start/settings/kick/reset from the player browser do nothing', after.phase === 'lobby' && after.roundSecs === before.roundSecs && after.players.length === before.players.length && !r1.some((m) => m.includes('"t":"admin"')),
      `phase ${after.phase}, round ${after.roundSecs}s, ${after.players.length} players; replies ${[...r1, ...r2].map((m) => m.slice(0, 30)).join(' | ')}`);

    // ---------- host starts A, reloads the dashboard mid-round ----------
    await adminA.waitForFunction(() => document.getElementById('pcount')!.textContent === '2');
    await adminA.click('#start');
    await proj.waitForFunction(() => (window as any).__club.snap().phase === 'play', null, { timeout: 5000 });
    await sleep(4000);
    const s1 = await proj.evaluate(() => (window as any).__club.snap());
    await adminA.reload();
    await adminA.waitForSelector('#return:not(.hide)');
    check('A\'s dashboard reload asks for the password ("Welcome back")', (await adminA.textContent('#welcome')) === `Welcome back to ${A}`);
    await adminA.screenshot({ path: `${OUT}/4-welcome-back.png` });
    await adminA.fill('#retpw', 'velvet A');
    await adminA.click('#returnform button[type=submit]');
    await adminA.waitForSelector('#roomui:not(.hide)');
    await sleep(800);
    const s2 = await proj.evaluate(() => (window as any).__club.snap());
    check('unlocking resumes the same round: players, phase and timer intact', (await adminA.textContent('#rcode'))!.trim() === A && (await adminA.textContent('#phase')) === 'PLAY' && s2.phase === 'play' && s2.timeLeft < s1.timeLeft && (await adminA.textContent('#pcount')) === '2',
      `${s1.timeLeft.toFixed(1)}s -> ${s2.timeLeft.toFixed(1)}s, dashboard ${await adminA.textContent('#phase')} ${await adminA.textContent('#time')}, joined ${await adminA.textContent('#pcount')}`);
    await adminA.screenshot({ path: `${OUT}/5-dashboard-mid-round.png` });
    await proj.click('#cv-refresh');
    await proj.waitForFunction(() => !!(window as any).__club?.snap(), null, { timeout: 10000 });
    await sleep(1000);
    const s3 = await proj.evaluate(() => (window as any).__club.snap());
    check('projector Refresh: same round carries on', new URL(proj.url()).searchParams.get('room') === A && s3.phase === 'play' && s3.timeLeft < s2.timeLeft, `${s2.timeLeft.toFixed(1)}s -> ${s3.timeLeft.toFixed(1)}s`);
    const roles = await Promise.all(phones.map((p) => p.evaluate(() => (window as any).__club.me().role)));
    check('phones are still in the round', roles.every((r) => r === 'sneak' || r === 'caught' || r === 'result'), roles.join(','));

    // ---------- a projector with no code ----------
    const bare = await pctx.newPage();
    const bareFrames = frames(bare);
    await bare.goto(`${BASE}/screen.html`);
    await sleep(1500);
    check('projector without a code waits, shows a room-code field and creates no room', await bare.isVisible('#roomInput') && bareFrames.some((f) => f.includes('"denied"') && f.includes('waiting')) && !bareFrames.some((f) => f.includes('"t":"room"')) && !new URL(bare.url()).searchParams.get('room'));
    await bare.screenshot({ path: `${OUT}/6-projector-waiting.png` });
    await bare.fill('#roomInput', A.toLowerCase());
    await bare.press('#roomInput', 'Enter');
    await bare.waitForFunction(() => (window as any).__club?.snap()?.phase === 'play', null, { timeout: 10000 });
    check('typing A\'s code into it shows room A', new URL(bare.url()).searchParams.get('room') === A);
  } finally {
    await hostBrowser.close();
    await playerBrowser.close();
    await server.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
