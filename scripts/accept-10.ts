/**
 * Acceptance run: 1 projector + 10 independent phone contexts + 1 host (admin) phone, real dev server,
 * mocked Gus lines, everything driven through the real UI (canvas buttons, the name <input>, the
 * projector's HTML sound strip, the host page's START button).
 *
 *   npx tsx scripts/accept-10.ts        (about 5 minutes)
 *
 * Covers: Chinese/English names (two 阿哲), IME Enter, over-long names, Test sound before the round,
 * starting from the host phone, phone ↻ Refresh mid-walk (7th player), Refresh after voting (vote
 * counted once), projector ↻ Refresh near the end (same room keeps counting down), a coup where the
 * first entrant loses the throne, a round where the owner keeps it, three Lounge powers by name,
 * and all 11 screens agreeing on the VIP. Writes artifacts/accept10/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

process.env.BOUNCER_AI = process.env.BOUNCER_AI || 'mock';
process.env.OPEN_ROOMS = process.env.OPEN_ROOMS || '1'; // projectors may open rooms without the host console (test mode)
process.env.GAME_SPEED = process.env.GAME_SPEED || '1';
const PORT = 5183;
const BASE = `http://localhost:${PORT}`;
const OUT = 'artifacts/accept10';
mkdirSync(OUT, { recursive: true });

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log('  ·', ...a);

type Club = { me(): any; name(): string; button(): string; target(id: string): { x: number; y: number } | null; audio?: unknown };
type ScreenClub = { snap(): any; log(): { kind: string; name?: string; clock: number; phase: string }[]; audio(): any };
const me = (p: Page) => p.evaluate(() => (window as unknown as { __club: Club }).__club.me());
const point = (p: Page, id: string) => p.evaluate((i) => (window as unknown as { __club: Club }).__club.target(i), id);

const errors: string[] = [];
function watch(page: Page, label: string) {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${label} console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
}

const NAMES = ['阿哲', '阿哲', 'Wesley', '小林 Jay', 'NOT A COP', 'DJ OYSTER', '舞池小霸王', 'TALL KEV', 'MRS. STEALTH', 'THE INTERN'];
const SHOWN = ['阿哲', '阿哲', 'WESLEY', '小林 JAY', 'NOT A COP', 'DJ OYSTER', '舞池小霸王', 'TALL KEV', 'MRS. STEALTH', 'THE INTERN'];
const SEVENTH = 6;                       // refreshes mid-walk in round A
const SLOWPOKES = new Set([7, 8, 9]);    // stay outside in round B

interface Phone { i: number; page: Page; ctx: BrowserContext; holding: boolean; lastTap: number; voteAt: number; voteChoice: 'crown' | 'keep' | null; voted: boolean; frozenUntil: number }

async function tap(ph: Phone, id: string) {
  const pt = await point(ph.page, id);
  if (!pt) return false;
  await ph.page.mouse.move(pt.x, pt.y);
  await ph.page.mouse.down();
  await ph.page.mouse.up();
  return true;
}
async function setHold(ph: Phone, on: boolean) {
  if (on === ph.holding) return;
  const pt = await point(ph.page, 'big');
  if (!pt) return;
  await ph.page.mouse.move(pt.x, pt.y);
  if (on) await ph.page.mouse.down(); else await ph.page.mouse.up();
  ph.holding = on;
}

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: 'vite.config.ts', server: { port: PORT, strictPort: true, host: '127.0.0.1', hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'warn' });
  await server.listen();
  const browser: Browser = await chromium.launch();
  const summary: Record<string, unknown> = {};
  try {
    const screenCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    let screen = await screenCtx.newPage();
    watch(screen, 'screen');
    await screen.goto(`${BASE}/screen.html`);
    await screen.waitForFunction(() => /room=[A-Z]{4}/.test(location.search), null, { timeout: 15000 });
    const code = new URL(screen.url()).searchParams.get('room')!;
    const snap = () => screen.evaluate(() => (window as unknown as { __club: ScreenClub }).__club.snap());
    const evlog = () => screen.evaluate(() => (window as unknown as { __club: ScreenClub }).__club.log());
    const audioState = () => screen.evaluate(() => (window as unknown as { __club: ScreenClub }).__club.audio());
    const shotScreen = (name: string) => screen.screenshot({ path: `${OUT}/${name}.png` });

    // ---------- ten phones type their names and join ----------
    const phones: Phone[] = [];
    for (let i = 0; i < NAMES.length; i++) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      watch(page, `phone${i + 1}`);
      await page.goto(`${BASE}/play.html?room=${code}`);
      await page.waitForFunction(() => !!(window as unknown as { __club?: Club }).__club?.target('joinBtn'), null, { timeout: 15000 });
      const ph: Phone = { i, page, ctx, holding: false, lastTap: 0, voteAt: 0, voteChoice: null, voted: false, frozenUntil: 0 };
      if (i === 3) {
        // over-long name gets cut to 12 cells with a hint; an IME Enter (keyCode 229) must not join
        await page.fill('#nameInput', '一二三四五六七八九');
        await sleep(150);
        const cut = await page.inputValue('#nameInput');
        await page.screenshot({ path: `${OUT}/0-phone-name-too-long.png` });
        check('over-long Chinese name is cut to 6 characters with a hint', cut === '一二三四五六', cut);
        await page.fill('#nameInput', NAMES[i]);
        await page.focus('#nameInput');
        await page.evaluate(() => document.getElementById('nameInput')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true })));
        await sleep(400);
        check('IME Enter (composition) does not join', !(await me(page))?.id);
        await page.focus('#nameInput');
        await page.keyboard.press('Enter');              // a real Enter joins
      } else if (i === 4) {
        await page.fill('#nameInput', '   ');           // blank: falls back to the placeholder nickname
        await tap(ph, 'joinBtn');
      } else {
        await page.fill('#nameInput', NAMES[i]);
        await tap(ph, 'joinBtn');
      }
      await page.waitForFunction(() => (window as unknown as { __club: Club }).__club.me()?.role === 'lobby', null, { timeout: 10000 });
      phones.push(ph);
    }
    await sleep(600);
    const lob = await snap();
    const blankName = (await me(phones[4].page)).name;
    SHOWN[4] = blankName;
    log('lobby', lob.players.map((p: any) => `${String(p.tag).padStart(2, '0')} ${p.name}`).join(' | '));
    check('lobby lists all 10 phones with numbers 01..10', lob.players.length === 10 && lob.players.map((p: any) => p.tag).sort((a: number, b: number) => a - b).join() === '1,2,3,4,5,6,7,8,9,10');
    check('names arrive as typed (Chinese kept, Latin in caps)', SHOWN.every((n, i) => i === 4 || lob.players.some((p: any) => p.name === n)), SHOWN.join(', '));
    check('a blank name falls back to a nickname', !!blankName && blankName.trim().length > 0, blankName);
    const azhe = lob.players.filter((p: any) => p.name === '阿哲');
    check('two 阿哲 keep the same name and get different numbers', azhe.length === 2 && azhe[0].tag !== azhe[1].tag, azhe.map((p: any) => String(p.tag).padStart(2, '0')).join(' vs '));
    await shotScreen('1-lobby-10-projector');
    await phones[0].page.screenshot({ path: `${OUT}/1-phone-azhe-A.png` });
    await phones[1].page.screenshot({ path: `${OUT}/1-phone-azhe-B.png` });
    await phones[3].page.screenshot({ path: `${OUT}/1-phone-xiaolin.png` });
    check('phones never load the club ambience engine', (await Promise.all(phones.map((p) => p.page.evaluate(() => (window as unknown as { __club: Club }).__club.audio === undefined)))).every(Boolean));

    // ---------- projector: Test sound (a real click), then the host phone starts the round ----------
    await screen.click('#cv-test');
    await sleep(1500);
    const a1 = await audioState();
    check('Test sound unlocks the projector audio', a1.state === 'running' && a1.started, JSON.stringify(a1));
    await sleep(2200);                                                // the hum is now scheduled
    const one = (await audioState()).oneShots;
    await screen.click('#cv-test'); await screen.click('#cv-test');   // mashing replays, never stacks
    await sleep(3700);
    const three = (await audioState()).oneShots;
    await screen.click('#cv-stop');
    await sleep(200);
    const a3 = await audioState();
    check('Test sound repeated clicks restart instead of stacking; Stop cuts it', three <= one + 6 && a3.oneShots === 0 && a3.gusBusy === 0, `one press ${one} live one-shots, three presses ${three}, after Stop ${a3.oneShots}`);
    check('Test sound did not start a round', (await snap()).phase === 'lobby');

    const adminCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const admin = await adminCtx.newPage();
    watch(admin, 'host');
    await admin.goto(`${BASE}/admin.html?room=${code}`);

    // ================================================================ one round
    async function playRound(tag: 'A' | 'B') {
      for (const ph of phones) { ph.voted = false; ph.voteChoice = null; ph.voteAt = 0; ph.holding = false; ph.frozenUntil = 0; }
      await admin.waitForFunction(() => !(document.getElementById('start') as HTMLButtonElement).disabled, null, { timeout: 10000 });
      await admin.click('#start');
      await screen.waitForFunction(() => (window as unknown as { __club: ScreenClub }).__club.snap()?.phase === 'play', null, { timeout: 5000 });
      const out: Record<string, any> = { round: tag };
      let logStart = (await evlog()).length;
      let lastPhase = 'play';
      let refreshDone = tag !== 'A';
      let voteRefreshDone = tag !== 'A';
      let screenRefreshDone = tag !== 'B';
      let powersAt = -1;
      const powerDone: boolean[] = [];
      let voteOpenedAt = 0;
      let voteShot = false;
      if (tag === 'A') { const a = await audioState(); check('projector audio still running after the host phone started the round', a.state === 'running', a.state); }
      const started = Date.now();
      while (Date.now() - started < 200_000) {
        const s = await snap();
        if (!s) { await sleep(50); continue; }
        if (s.phase !== lastPhase) {
          log(`round ${tag}: ${lastPhase} -> ${s.phase}${s.phase === 'vote' ? ` (${s.allIn ? 'everyone in' : 'after the rush'})` : ''} at ${(s.roundSecs - s.timeLeft).toFixed(1)} s`);
          if (s.phase === 'vote') voteOpenedAt = Date.now();
          lastPhase = s.phase;
        }
        if (s.phase === 'reveal') break;
        const lounge = s.players.filter((p: any) => p.state === 'lounge').sort((a: any, b: any) => a.entryOrder - b.entryOrder);
        const mes = await Promise.all(phones.map((p) => me(p.page)));

        // ---- the 7th player taps ↻ Refresh halfway up the street
        if (!refreshDone && mes[SEVENTH]?.role === 'sneak' && mes[SEVENTH].x > 0.35) {
          refreshDone = true;
          const ph = phones[SEVENTH];
          const before = mes[SEVENTH];
          const othersBefore = mes.map((m: any) => m?.x ?? 0);
          await setHold(ph, false);
          await tap(ph, 'refresh');
          await sleep(150);
          await phones[SEVENTH].page.screenshot({ path: `${OUT}/2-phone-7-refresh.png` });
          await ph.page.waitForFunction(() => (window as unknown as { __club: Club }).__club.me()?.id, null, { timeout: 5000 });
          await sleep(2500);
          const after = await me(ph.page);
          const sp = await snap();
          const othersAfter = await Promise.all(phones.map((p) => me(p.page)));
          const moved = othersAfter.filter((m: any, k: number) => k !== SEVENTH && (m.x > othersBefore[k] + 0.005 || m.role !== 'sneak')).length;
          check('7th player Refresh: still 10 players, same number and name', sp.players.length === 10 && after.tag === before.tag && after.name === before.name && after.id === before.id, `${before.tag} ${before.name} -> ${after.tag} ${after.name}`);
          check('7th player Refresh: position carries on (no jump back)', after.x >= before.x - 0.02, `x ${before.x.toFixed(3)} -> ${after.x.toFixed(3)}`);
          check('7th player Refresh: the other nine kept playing', moved >= 7, `${moved}/9 moved on or got in`);
          out.refresh7 = { room: code, before: { id: before.id, tag: before.tag, name: before.name, x: +before.x.toFixed(3), score: before.score, role: before.role }, after: { id: after.id, tag: after.tag, name: after.name, x: +after.x.toFixed(3), score: after.score, role: after.role }, phase: sp.phase, players: sp.players.length, othersMoved: moved };
          continue;
        }

        // ---- projector ↻ Refresh shortly before the end (round B)
        if (!screenRefreshDone && s.phase === 'play' && s.timeLeft < 24) {
          screenRefreshDone = true;
          const before = s;
          await screen.click('#cv-refresh');
          await screen.waitForFunction(() => !!(window as unknown as { __club?: ScreenClub }).__club?.snap(), null, { timeout: 10000 });
          await sleep(1200);
          const after = await snap();
          const url = screen.url();
          check('projector Refresh: same room, same 10 players, clock keeps counting down', url.includes(`room=${code}`) && after.players.length === 10 && after.timeLeft < before.timeLeft && after.ownerId === before.ownerId, `${code}: ${before.timeLeft.toFixed(1)}s -> ${after.timeLeft.toFixed(1)}s, owner ${after.ownerId === before.ownerId ? 'same' : 'CHANGED'}`);
          const st = await audioState();
          const resumeVisible = await screen.isVisible('#cv-resume');
          check('projector Refresh: a visible Resume sound appears when the browser wants a click', st.state === 'running' || resumeVisible, `audio ${st.state}, button ${resumeVisible ? 'shown' : 'hidden'}: ${await screen.textContent('#cv-resume')}`);
          await shotScreen('4-projector-after-refresh');
          logStart = 0;                                   // the reloaded page keeps a fresh event log
          if (resumeVisible) { await screen.click('#cv-resume'); await sleep(300); }
          check('projector Refresh: sound resumes', (await audioState()).state === 'running');
          // the music picks up the current scene; nothing from before (preview, entries, door, hum) replays
          const samples = [];
          for (let k = 0; k < 8; k++) { samples.push(await audioState()); await sleep(400); }
          const sp = await snap();
          const doorShut = samples.every((x: any) => x.door <= 1400), gusQuiet = samples.every((x: any) => x.gusBusy === 0);
          const sceneOk = samples.every((x: any) => x.scene === (sp.phase === 'vote' ? 'vote' : 'street'));
          const replays = (await evlog()).filter((e: any) => ['hum', 'cute-shoes', 'entered'].includes(e.kind)).length;
          check('Resume sound: back to the current scene, no replayed door/hum/line', doorShut && gusQuiet && sceneOk && replays === 0,
            `phase ${sp.phase}, scene ${samples[0].scene}, door max ${Math.max(...samples.map((x: any) => x.door))} Hz, gus busy max ${Math.max(...samples.map((x: any) => x.gusBusy)).toFixed(2)} s, replays ${replays}`);
          out.screenRefresh = { code, before: { phase: before.phase, timeLeft: +before.timeLeft.toFixed(1), players: before.players.length, owner: before.ownerId }, after: { phase: sp.phase, timeLeft: +sp.timeLeft.toFixed(1), players: sp.players.length, owner: sp.ownerId } };
          continue;
        }

        // ---- Lounge powers (round B)
        if (tag === 'B' && s.phase === 'play' && s.rule && lounge.length >= 2) {
          const caster = phones.find((ph, i) => mes[i]?.id === lounge[1]?.id && mes[i]?.role === 'lounge');
          const runnersOut = mes.filter((m: any) => m?.role === 'sneak' && m.x > 0.08).length;
          if (caster && powersAt < 0 && runnersOut > 0) powersAt = Date.now();
          if (caster && powersAt > 0) {
            const due = [0, 4500, 9000].map((d, k) => ({ k, at: powersAt + d })).find((x) => !powerDone[x.k] && Date.now() >= x.at);
            if (due) {
              const k = due.k, power = ['banana', 'distract', 'snitch'][k];
              await tap(caster, `power${k}`);
              await sleep(250);
              const cm = await me(caster.page);
              const after = await Promise.all(phones.map((p) => me(p.page)));
              const prefix = `${String(cm.tag).padStart(2, '0')} ${cm.name}`;
              const vi = after.findIndex((m: any) => m?.notice && m.id !== cm.id && m.notice.text.startsWith(prefix));
              out[`power_${power}`] = { caster: prefix, casterSees: cm.notice?.text ?? null, affected: vi >= 0 ? `${String(after[vi].tag).padStart(2, '0')} ${after[vi].name}` : null, affectedSees: vi >= 0 ? after[vi].notice.text : null };
              log(`power ${power}:`, JSON.stringify(out[`power_${power}`]));
              await shotScreen(`3-power-${power}-projector`);
              await caster.page.screenshot({ path: `${OUT}/3-power-${power}-caster.png` });
              if (vi >= 0) await phones[vi].page.screenshot({ path: `${OUT}/3-power-${power}-affected.png` });
              powerDone[k] = true;
            }
          }
        }

        // ---- votes
        if (s.phase === 'vote' && !phones.some((p) => p.voteAt)) {
          const order = lounge.map((p: any) => p.id);
          for (const ph of phones) {
            const m = mes[ph.i];
            const k = order.indexOf(m?.id);
            if (k < 0 || m.id === s.ownerId) continue;
            if (tag === 'A') {
              if (k === 1) { ph.voteChoice = 'crown'; ph.voteAt = Date.now() + 2600; }
              else if (k >= 2 && k <= 4) { ph.voteChoice = 'keep'; ph.voteAt = Date.now() + 1300; }
              else { ph.voteChoice = 'crown'; ph.voteAt = Date.now() + 800 + (k - 5) * 100; }
            } else { ph.voteChoice = k <= 2 ? 'crown' : 'keep'; ph.voteAt = Date.now() + 900 + k * 150; }
          }
          out.voteOrder = lounge.map((p: any) => `${p.entryOrder}:${String(p.tag).padStart(2, '0')} ${p.name} (${p.score})`);
        }
        // ---- a voter refreshes and taps again: the vote must count once
        if (!voteRefreshDone && s.phase === 'vote') {
          const vi = phones.findIndex((ph) => ph.voted && ph.voteChoice === 'crown');
          if (vi >= 0) {
            voteRefreshDone = true;
            const ph = phones[vi];
            const castBefore = (await snap()).vote.cast;
            await tap(ph, 'refresh');
            await ph.page.waitForFunction(() => (window as unknown as { __club: Club }).__club.me()?.vote?.choice, null, { timeout: 5000 });
            await tap(ph, 'crown');
            await sleep(400);
            const m = await me(ph.page);
            const sv = await snap();
            // other voters may have voted meanwhile: compare against the phones' own count
            const tapped = phones.filter((p) => p.voted && p.voteChoice === 'crown').length;
            check('a voter who refreshes and taps again is counted once', m.vote.choice === 'crown' && sv.vote.cast === tapped, `cast ${castBefore} -> ${sv.vote.cast}, crown voters ${tapped}`);
            await ph.page.screenshot({ path: `${OUT}/2-phone-vote-after-refresh.png` });
          }
        }

        await Promise.all(phones.map(async (ph, i) => {
          const m = mes[i];
          if (!m) return;
          switch (m.role) {
            case 'sneak': {
              const slow = tag === 'B' && SLOWPOKES.has(i);
              const safe = m.gus === 'back' || m.gus === 'sleep';
              const want = safe && (!slow || m.x < 0.3);
              let hold = m.rule === 'moonwalk' ? !want : want;
              if (m.needFreshPress && ph.holding) { await setHold(ph, false); return; }
              if (m.needFreshPress) hold = true;
              await setHold(ph, hold);
              return;
            }
            case 'caught': case 'break': case 'defend': {
              if (ph.holding) await setHold(ph, false);
              const gap = m.role === 'caught' ? 110 : m.role === 'defend' ? 160 : 380;
              if (Date.now() - ph.lastTap > gap) { ph.lastTap = Date.now(); await tap(ph, 'mash'); }
              return;
            }
            case 'owner-pick': { const k = m.ruleChoices.indexOf('moonwalk'); await tap(ph, `rule${k >= 0 ? k : 0}`); return; }
            case 'support':
              if (ph.voteChoice && !ph.voted && Date.now() >= ph.voteAt) ph.voted = await tap(ph, ph.voteChoice);
              return;
            default:
              if (ph.holding) await setHold(ph, false);
          }
        }));

        if (s.phase === 'vote' && voteOpenedAt && Date.now() - voteOpenedAt > 3300 && !voteShot) {
          voteShot = true;
          await shotScreen(`${tag}-vote-projector`);
          const voter = phones.find((ph) => ph.voteChoice === 'crown' && ph.voted);
          if (voter) await voter.page.screenshot({ path: `${OUT}/${tag}-vote-phone.png` });
        }
        await sleep(30);
      }
      await screen.waitForFunction(() => (window as unknown as { __club: ScreenClub }).__club.snap()?.phase === 'reveal', null, { timeout: 20000 });
      await sleep(900);
      await shotScreen(`${tag}-reveal-1-crown`);
      const end = await snap();
      const mes = await Promise.all(phones.map((p) => me(p.page)));
      const wi = mes.findIndex((m: any) => m.id === end.reveal.winnerId);
      if (wi >= 0) await phones[wi].page.screenshot({ path: `${OUT}/${tag}-phone-winner.png` });
      await sleep(4200);
      await shotScreen(`${tag}-reveal-2-scores`);
      const lg = (await evlog()).slice(logStart);
      const r = end.reveal;
      const top = r.ranking.slice().sort((a: any, b: any) => b.score - a.score)[0];
      const entered = lg.filter((e) => e.kind === 'entered');
      Object.assign(out, {
        winner: `${String(r.winnerTag).padStart(2, '0')} ${r.winnerName}`,
        prevOwner: r.prevOwnerName ? `${String(r.prevOwnerTag).padStart(2, '0')} ${r.prevOwnerName}` : null,
        vote: r.vote, allIn: r.allIn,
        topScorer: `${String(top.tag).padStart(2, '0')} ${top.name} ${top.score}`,
        ranking: r.ranking.map((x: any, i: number) => `#${i + 1} ${String(x.tag).padStart(2, '0')} ${x.name} ${x.score}`),
        lastEntryAt: entered.length ? entered[entered.length - 1].clock : null,
        allInAt: lg.find((e) => e.kind === 'allin')?.clock ?? null,
        ropeAt: lg.find((e) => e.kind === 'rope')?.clock ?? null,
        screensAgree: mes.every((m: any) => m.reveal?.winnerId === r.winnerId),
        mugshots: mes.filter((m: any) => !!m.mugshot).length,
        mugshotNames: mes.map((m: any) => m.mugshot?.name ?? null),
      });
      return out;
    }

    const A = await playRound('A');
    summary.A = A;
    check('A: everyone in -> straight to the vote', A.allIn === true && A.ropeAt === null && A.allInAt !== null && A.allInAt - A.lastEntryAt <= 0.1, `last in ${A.lastEntryAt?.toFixed(1)}s, vote ${A.allInAt?.toFixed(1)}s`);
    check('A: the first entrant lost the throne (coup passed)', !!A.prevOwner && A.vote.cast >= A.vote.needed, `${A.prevOwner} -> ${A.winner}, ${JSON.stringify(A.vote)}`);
    check('A: 11 screens agree on the VIP', A.screensAgree);
    check('A: every phone got its mugshot, names as typed', A.mugshots === 10, A.mugshotNames.join(', '));
    await phones[0].page.screenshot({ path: `${OUT}/A-phone-azhe-result.png` });

    await screen.keyboard.press('r');
    await screen.waitForFunction(() => (window as unknown as { __club: ScreenClub }).__club.snap()?.phase === 'lobby', null, { timeout: 5000 });
    await sleep(800);
    const B = await playRound('B');
    summary.B = B;
    check('B: people outside -> normal rope rush', B.allIn === false && B.ropeAt !== null);
    check('B: the owner kept the crown', !B.prevOwner && B.vote.cast < B.vote.needed, JSON.stringify(B.vote));
    check('B: 11 screens agree on the VIP (after the projector refresh)', B.screensAgree);
    for (const pw of ['banana', 'distract', 'snitch']) check(`B: ${pw} names who did it`, !!B[`power_${pw}`]?.casterSees, JSON.stringify(B[`power_${pw}`] ?? null));
  } finally {
    summary.results = results;
    summary.errors = errors;
    writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
    await browser.close();
    await server.close();
  }
  check('no console errors or warnings on any page', errors.length === 0, errors.slice(0, 5).join(' | '));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
