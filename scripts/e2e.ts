/**
 * Browser end-to-end: 1 projector + 4 phone pages in headless Chromium play a full 2-minute round
 * against the real dev server (Vite + game) with a mocked Claude. Phones are driven only through
 * their canvas (pointer events on the real buttons). Then one phone plays the solo gauntlet.
 *
 *   npm run e2e                       (GAME_SPEED=3 by default: the 120 s round takes ~40 s)
 *
 * Fails on any console error / page error on any page, or if the round doesn't reach every
 * moment the demo needs (catch + challenge, owner rule, finale, reveal, mugshots on every phone).
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

process.env.BOUNCER_AI = process.env.BOUNCER_AI || 'mock';
process.env.OPEN_ROOMS = process.env.OPEN_ROOMS || '1'; // projectors may open rooms without the host console (test mode)
process.env.GAME_SPEED = process.env.GAME_SPEED || '3';
const SPEED = Number(process.env.GAME_SPEED);
const PORT = 5181;
const BASE = `http://localhost:${PORT}`;
const SHOTS = '/tmp/e2e-shots';
mkdirSync(SHOTS, { recursive: true });

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chromiumPath(): string | undefined {
  const root = join(homedir(), '.cache/ms-playwright');
  if (!existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()) {
    for (const sub of readdirSync(join(root, dir))) {
      const p = join(root, dir, sub, 'chrome-headless-shell');
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

async function launch(): Promise<Browser> {
  try { return await chromium.launch(); } catch { return chromium.launch({ executablePath: chromiumPath() }); }
}

const errors: string[] = [];
function watch(page: Page, label: string) {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${label} console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
}

type MeLite = { role: string; gus: string; rule: string | null; id: string | null; needFreshPress: boolean; mugshot: unknown; reveal: { winnerId: string | null } | null; ruleChoices: string[]; rank: number };
const meOf = (p: Page) => p.evaluate(() => (window as unknown as { __club: { me(): unknown } }).__club.me()) as Promise<MeLite | null>;
async function point(p: Page, id: string) {
  return p.evaluate((i) => (window as unknown as { __club: { target(id: string): { x: number; y: number } | null } }).__club.target(i), id);
}
async function tapOn(p: Page, id: string) {
  const pt = await point(p, id);
  if (!pt) return false;
  await p.mouse.move(pt.x, pt.y);
  await p.mouse.down();
  await p.mouse.up();
  return true;
}

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: 'vite.config.ts', server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' });
  await server.listen();
  const browser = await launch();
  try {
    // ---------- projector ----------
    const screenCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const screen = await screenCtx.newPage();
    watch(screen, 'screen');
    await screen.goto(`${BASE}/screen.html`);
    await screen.waitForFunction(() => /room=[A-Z]{4}/.test(location.search), null, { timeout: 15000 });
    const code = new URL(screen.url()).searchParams.get('room')!;
    check('projector created a room', /^[A-Z]{4}$/.test(code), code);
    const snap = () => screen.evaluate(() => (window as unknown as { __club: { snap(): unknown } }).__club.snap()) as Promise<{ phase: string; players: { name: string }[]; rule: string | null; reveal: { winnerId: string | null } | null } | null>;

    // ---------- four phones ----------
    const names = ['ANNA', 'BEN', 'CLEO', 'DAVE'];
    const phones: Page[] = [];
    for (let i = 0; i < 4; i++) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const p = await ctx.newPage();
      watch(p, `phone${i + 1}`);
      await p.goto(`${BASE}/play.html?room=${code}`);
      await p.waitForFunction(() => !!(window as unknown as { __club?: { me(): unknown } }).__club?.me(), null, { timeout: 15000 });
      for (let k = 0; k < 20 && !(await point(p, 'joinBtn')); k++) await sleep(100);
      await tapOn(p, 'joinBtn');
      await p.waitForFunction(() => (window as unknown as { __club: { me(): { role: string } } }).__club.me()?.role === 'lobby', null, { timeout: 10000 });
      phones.push(p);
      void names;
    }
    await sleep(300);
    const lobby = await snap();
    check('projector lobby shows the 4 phones', lobby?.players.length === 4, `${lobby?.players.length}`);
    await screen.screenshot({ path: `${SHOTS}/1-lobby.png` });
    await phones[0].screenshot({ path: `${SHOTS}/1-phone-lobby.png` });

    // ---------- the round ----------
    await screen.keyboard.press('s');
    await screen.waitForFunction(() => (window as unknown as { __club: { snap(): { phase: string } } }).__club.snap()?.phase === 'play', null, { timeout: 5000 });
    const started = Date.now();
    const seen: Set<string>[] = phones.map(() => new Set());
    const holding = phones.map(() => false);
    const shot = new Set<string>();
    let firstInGameSecs = -1;
    let lastTap = phones.map(() => 0);

    while (Date.now() - started < (120 / SPEED + 20) * 1000) {
      const s = await snap();
      if (s?.phase === 'reveal') break;
      await Promise.all(phones.map(async (p, i) => {
        const me = await meOf(p);
        if (!me) return;
        seen[i].add(me.role);
        if (!shot.has(me.role)) { shot.add(me.role); await p.screenshot({ path: `${SHOTS}/2-phone-${me.role}.png` }); }
        const reckless = i === 3;
        const setHold = async (on: boolean) => {
          if (on === holding[i]) return;
          const pt = await point(p, 'big');
          if (!pt) return;
          await p.mouse.move(pt.x, pt.y);
          if (on) await p.mouse.down(); else await p.mouse.up();
          holding[i] = on;
        };
        switch (me.role) {
          case 'sneak': {
            const safe = me.gus === 'back' || me.gus === 'sleep';
            const want = reckless || safe;
            let hold = me.rule === 'moonwalk' ? !want : want;
            if (me.needFreshPress && holding[i]) { await setHold(false); return; }
            if (me.needFreshPress) hold = true;
            await setHold(hold);
            return;
          }
          case 'caught': case 'break': case 'defend':
            if (holding[i]) await setHold(false);
            // reckless DAVE taps slowly (usually flung), the others mash
            if (Date.now() - lastTap[i] > (reckless ? 450 : 90) / SPEED * 1) { lastTap[i] = Date.now(); await tapOn(p, 'mash'); }
            return;
          case 'owner-pick':
            await tapOn(p, 'rule0');
            return;
          case 'support':
            await tapOn(p, 'big');
            return;
          default:
            if (holding[i]) await setHold(false);
        }
      }));
      if (firstInGameSecs < 0 && seen.some((x) => x.has('lounge') || x.has('owner-pick'))) {
        firstInGameSecs = ((Date.now() - started) / 1000) * SPEED;
      }
      const sp = await snap();
      if (sp && !shot.has(`screen-${sp.phase}-${sp.rule}`)) { shot.add(`screen-${sp.phase}-${sp.rule}`); await screen.screenshot({ path: `${SHOTS}/2-screen-${sp.phase}-${sp.rule ?? 'none'}.png` }); }
      await sleep(40);
    }
    lastTap = [];
    await screen.waitForFunction(() => (window as unknown as { __club: { snap(): { phase: string } } }).__club.snap()?.phase === 'reveal', null, { timeout: 20000 });
    await sleep(1500);
    const end = await snap();
    await screen.screenshot({ path: `${SHOTS}/3-reveal.png` });
    const mes = await Promise.all(phones.map(meOf));
    for (let i = 0; i < 4; i++) await phones[i].screenshot({ path: `${SHOTS}/3-phone${i + 1}-reveal.png` });
    await sleep(3500 / 1);
    for (let i = 0; i < 4; i++) await phones[i].screenshot({ path: `${SHOTS}/3-phone${i + 1}-mugshot.png` });

    const all = seen.reduce((a, b) => new Set([...a, ...b]), new Set<string>());
    check('someone got in (owner console or lounge reached on a phone)', all.has('owner-pick') || all.has('lounge'), [...all].join(','));
    check('first admission within 35 game-seconds (approx., from phone polling)', firstInGameSecs > 0 && firstInGameSecs <= 37, `${firstInGameSecs.toFixed(1)} s`);
    check('a phone went through a Prove It challenge', all.has('caught'), '');
    check('a chaos rule went live', !!end && (await snap())?.rule !== null || [...shot].some((k) => /screen-play-(lights|glasses|moonwalk|disco)/.test(k)), [...shot].filter((k) => k.startsWith('screen')).join(' '));
    check('finale ran on phones (break/defend)', all.has('break') || all.has('defend'));
    check('projector reached the reveal', end?.phase === 'reveal');
    check('every phone shows the same VIP as the projector', mes.every((m) => m?.reveal?.winnerId === end?.reveal?.winnerId));
    check('every phone got its mugshot', mes.every((m) => !!m?.mugshot));
    check('phone ranks are distinct', new Set(mes.map((m) => m?.rank)).size === 4, mes.map((m) => m?.rank).join(','));

    // ---------- solo gauntlet on one phone (no room code) ----------
    const soloCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const solo = await soloCtx.newPage();
    watch(solo, 'solo');
    await solo.goto(`${BASE}/play.html`);
    await solo.waitForFunction(() => !!(window as unknown as { __club?: { me(): unknown } }).__club?.me(), null, { timeout: 15000 });
    for (let k = 0; k < 20 && !(await point(solo, 'joinBtn')); k++) await sleep(100);
    await tapOn(solo, 'joinBtn');
    await solo.waitForFunction(() => (window as unknown as { __club: { me(): { role: string } } }).__club.me()?.role === 'solo-menu', null, { timeout: 10000 });
    await solo.screenshot({ path: `${SHOTS}/4-solo-menu.png` });
    await tapOn(solo, 'lvl0');
    let soloHold = false;
    const soloSeen = new Set<string>();
    const soloStart = Date.now();
    let soloTap = 0;
    while (Date.now() - soloStart < 150_000) {
      const me = await meOf(solo);
      if (!me) { await sleep(40); continue; }
      if (!soloSeen.has(me.role)) { soloSeen.add(me.role); await solo.screenshot({ path: `${SHOTS}/4-solo-${me.role}.png` }); }
      if (me.role === 'solo-done') break;
      const setHold = async (on: boolean) => {
        if (on === soloHold) return;
        const pt = await point(solo, 'big');
        if (!pt) return;
        await solo.mouse.move(pt.x, pt.y);
        if (on) await solo.mouse.down(); else await solo.mouse.up();
        soloHold = on;
      };
      if (me.role === 'sneak') {
        if (me.needFreshPress && soloHold) await setHold(false);
        else await setHold(me.gus === 'back' || me.gus === 'sleep' || me.needFreshPress);
      } else {
        if (soloHold) await setHold(false);
        if (me.role === 'caught' && Date.now() - soloTap > 90 / SPEED) { soloTap = Date.now(); await tapOn(solo, 'mash'); }
      }
      await sleep(30);
    }
    const sm = await meOf(solo) as (MeLite & { solo: { beaten: boolean; cleared: boolean[] } | null; mugshot: { rankLine: string } | null }) | null;
    check('solo: all three doors cleared on one phone', !!sm?.solo?.beaten, JSON.stringify(sm?.solo?.cleared ?? sm?.solo));
    check('solo: BOUNCER BEATEN mugshot', sm?.mugshot?.rankLine === 'BOUNCER BEATEN');
    await sleep(1500);
    await solo.screenshot({ path: `${SHOTS}/4-solo-done.png` });

    check('no console errors or warnings on any page', errors.length === 0, errors.slice(0, 5).join(' | '));
  } finally {
    await browser.close();
    await server.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${SHOTS}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
