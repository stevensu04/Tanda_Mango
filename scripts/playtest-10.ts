/**
 * Ten-player linked playtest: 1 projector + 10 independent phone browser contexts (separate storage,
 * like ten real phones) against a real dev server with mocked Gus lines. Phones are driven only through
 * their canvas: pointer events on the real buttons, nothing sent over the socket by hand.
 *
 *   npx tsx scripts/playtest-10.ts            (real time: two rounds take about 4 minutes)
 *
 * Round A: everyone sneaks carefully. When the last runner gets in, the vote should open at once.
 *          Later entrants vote CROWN first, three vote KEEP, then the second entrant joins the coup:
 *          every card should switch to the second entrant, who takes the crown from the first entrant
 *          (the top scorer), so the top scorer and the VIP differ.
 * Round B: three slowpokes stay outside, so the normal rope rush happens. A Lounge player casts Banana,
 *          Distract and Snitch; the vote mostly says KEEP and the owner holds the crown.
 * Also: three phones pick NOT A COP, one phone reloads and one drops off the network mid-round.
 *
 * Writes screenshots and a JSON summary to artifacts/playtest10/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

process.env.BOUNCER_AI = process.env.BOUNCER_AI || 'mock';
process.env.OPEN_ROOMS = process.env.OPEN_ROOMS || '1'; // projectors may open rooms without the host console (test mode)
process.env.GAME_SPEED = process.env.GAME_SPEED || '1';
const PORT = 5182;
const BASE = `http://localhost:${PORT}`;
const OUT = 'artifacts/playtest10';
mkdirSync(OUT, { recursive: true });

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log('  ·', ...a);

type Club = { me(): any; name(): string; button(): string; target(id: string): { x: number; y: number } | null };
type ScreenClub = { snap(): any; log(): { kind: string; name?: string; clock: number; phase: string }[] };
const me = (p: Page) => p.evaluate(() => (window as unknown as { __club: Club }).__club.me());
const bigLabel = (p: Page) => p.evaluate(() => (window as unknown as { __club: Club }).__club.button());
const point = (p: Page, id: string) => p.evaluate((i) => (window as unknown as { __club: Club }).__club.target(i), id);

const errors: string[] = [];
function watch(page: Page, label: string) {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${label} console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
}

const NAMES = ['NOT A COP', 'NOT A COP', 'NOT A COP', 'DJ OYSTER', 'TOTALLY 21', 'TALL KEV', 'MRS. STEALTH', 'THE INTERN', 'BOUNCY', 'VIP-ISH'];
const SLOWPOKES = new Set([7, 8, 9]); // THE INTERN, BOUNCY, VIP-ISH stay outside in round B

interface Phone { i: number; page: Page; ctx: BrowserContext; holding: boolean; lastTap: number; voteAt: number; voteChoice: 'crown' | 'keep' | null; voted: boolean; label: string }

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
    const screen = await screenCtx.newPage();
    watch(screen, 'screen');
    await screen.goto(`${BASE}/screen.html`);
    await screen.waitForFunction(() => /room=[A-Z]{4}/.test(location.search), null, { timeout: 15000 });
    const code = new URL(screen.url()).searchParams.get('room')!;
    const snap = () => screen.evaluate(() => (window as unknown as { __club: ScreenClub }).__club.snap());
    const evlog = () => screen.evaluate(() => (window as unknown as { __club: ScreenClub }).__club.log());
    const shotScreen = (name: string) => screen.screenshot({ path: `${OUT}/${name}.png` });

    // ---------- ten phones join through the join screen ----------
    const phones: Phone[] = [];
    for (let i = 0; i < NAMES.length; i++) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      watch(page, `phone${i + 1}`);
      await page.goto(`${BASE}/play.html?room=${code}`);
      await page.waitForFunction(() => !!(window as unknown as { __club?: Club }).__club?.target('joinBtn'), null, { timeout: 15000 });
      const ph: Phone = { i, page, ctx, holding: false, lastTap: 0, voteAt: 0, voteChoice: null, voted: false, label: NAMES[i] };
      // reroll the name with the NEW button until it reads what this player wants
      await page.fill('#nameInput', NAMES[i]);
      await tap(ph, 'joinBtn');
      await page.waitForFunction(() => (window as unknown as { __club: Club }).__club.me()?.role === 'lobby', null, { timeout: 10000 });
      phones.push(ph);
    }
    await sleep(500);
    const lob = await snap();
    const lobbyNames = lob.players.map((p: any) => `${p.tag}:${p.name}`);
    log('lobby', lobbyNames.join('  '));
    check('lobby lists all 10 phones with numbers 1..10', lob.players.length === 10 && lob.players.map((p: any) => p.tag).sort((a: number, b: number) => a - b).join() === '1,2,3,4,5,6,7,8,9,10', lobbyNames.join(', '));
    const cops = lob.players.filter((p: any) => p.name === 'NOT A COP');
    check('three NOT A COPs keep their name and are told apart by number', cops.length === 3 && new Set(cops.map((p: any) => p.tag)).size === 3, cops.map((p: any) => p.tag).join(','));
    const mes0 = await Promise.all(phones.map((p) => me(p.page)));
    check('each phone shows the same number the projector lists', mes0.every((m: any) => lob.players.find((p: any) => p.id === m.id)?.tag === m.tag));
    await shotScreen('A1-lobby-10');
    await phones[1].page.screenshot({ path: `${OUT}/A1-phone-NOT-A-COP-2-lobby.png` });
    await phones[2].page.screenshot({ path: `${OUT}/A1-phone-NOT-A-COP-3-lobby.png` });

    // ================================================================ one round
    async function playRound(tag: 'A' | 'B') {
      for (const ph of phones) { ph.voted = false; ph.voteChoice = null; ph.voteAt = 0; ph.holding = false; }
      await screen.keyboard.press('s');
      await screen.waitForFunction(() => (window as unknown as { __club: ScreenClub }).__club.snap()?.phase === 'play', null, { timeout: 5000 });
      const out: Record<string, any> = { round: tag };
      const logStart = (await evlog()).length;
      const shots = new Set<string>();
      let lastPhase = 'play';
      let moonChecked = false;
      let reconnectDone = tag !== 'A';
      let powersAt = -1;
      const powerShots: string[] = [];
      let voteOpenedAt = 0;
      let voteShot = 0;
      const started = Date.now();
      while (Date.now() - started < 200_000) {
        const s = await snap();
        if (!s) { await sleep(50); continue; }
        if (s.phase !== lastPhase) {
          log(`round ${tag}: ${lastPhase} -> ${s.phase} at ${s.phase === 'vote' ? `vote (${s.allIn ? 'everyone in' : 'after the rush'})` : (s.roundSecs - s.timeLeft).toFixed(1) + ' s'}`);
          if (s.phase === 'vote') voteOpenedAt = Date.now();
          lastPhase = s.phase;
        }
        if (s.phase === 'reveal') break;
        const clock = s.roundSecs - s.timeLeft;
        const lounge = s.players.filter((p: any) => p.state === 'lounge').sort((a: any, b: any) => a.entryOrder - b.entryOrder);
        const mes = await Promise.all(phones.map((p) => me(p.page)));

        // ---- Moonwalk: the moment the rule lands, held thumbs must read LET GO
        if (!moonChecked && s.rule) {
          moonChecked = true;
          out.rule = s.rule;
          if (s.rule === 'moonwalk') {
            await sleep(120);
            const rows = await Promise.all(phones.map(async (ph, i) => ({ i, name: mes[i]?.name, role: mes[i]?.role, holding: ph.holding, gus: mes[i]?.gus, label: await bigLabel(ph.page) })));
            const outside = rows.filter((r) => r.role === 'sneak');
            const held = outside.filter((r) => r.holding && r.gus !== 'tell' && r.gus !== 'watch');
            out.moonwalk = rows;
            if (held.length || tag === 'A') check(`round ${tag}: Moonwalk: every held outside thumb reads LET GO`, held.length > 0 && held.every((r) => r.label.startsWith('LET GO')), held.map((r) => `${r.name}: ${r.label}`).join(' | ') || 'nobody holding');
            else log(`round ${tag}: Moonwalk landed while nobody outside was holding (Gus was looking)`);
            const heldIdx = held[0]?.i;
            if (heldIdx !== undefined) await phones[heldIdx].page.screenshot({ path: `${OUT}/${tag}2-moonwalk-phone-let-go.png` });
            await shotScreen(`${tag}2-moonwalk-projector`);
          }
        }

        // ---- reconnect checks (round A): one phone reloads, one drops off the network for 2 s
        if (!reconnectDone && clock > 14) {
          reconnectDone = true;
          const ph = phones[1];
          const before = mes[1];
          await ph.page.reload();
          ph.holding = false;
          await ph.page.waitForFunction(() => !!(window as unknown as { __club: Club }).__club.me()?.id, null, { timeout: 10000 });
          const after = await me(ph.page);
          check('reload: the second NOT A COP keeps name, number and place', after.name === before.name && after.tag === before.tag && Math.abs(after.x - before.x) < 0.08, `${before.tag} ${before.name} x=${before.x.toFixed(2)} -> ${after.tag} ${after.name} x=${after.x.toFixed(2)}`);
          const ph3 = phones[2];
          const b3 = mes[2];
          await ph3.ctx.setOffline(true);
          await sleep(2000);
          await ph3.ctx.setOffline(false);
          ph3.holding = false;
          await ph3.page.waitForFunction((n) => { const m = (window as unknown as { __club: Club }).__club.me(); return !!m && m.name === n; }, b3.name, { timeout: 10000 });
          await sleep(1200);
          const a3 = await me(ph3.page);
          const sp = await snap();
          check('network drop: the third NOT A COP comes back as the same player', a3.name === b3.name && a3.tag === b3.tag && sp.players.find((p: any) => p.id === a3.id)?.connected === true, `${b3.tag} ${b3.name} -> ${a3.tag} ${a3.name}`);
          continue;
        }

        // ---- Lounge powers (round B): banana, then distract, then snitch, all from one Lounge phone
        if (tag === 'B' && s.phase === 'play' && s.rule && lounge.length >= 2) {
          const caster = phones.find((ph, i) => mes[i]?.id === lounge[1]?.id && mes[i]?.role === 'lounge');
          const runnersOut = mes.filter((m: any) => m?.role === 'sneak' && m.x > 0.08).length;
          if (caster && powersAt < 0 && runnersOut > 0) powersAt = Date.now();
          if (caster && powersAt > 0) {
            const due = [0, 4500, 9000].map((d, k) => ({ k, at: powersAt + d })).find((x) => !powerShots[x.k] && Date.now() >= x.at);
            if (due) {
              const k = due.k;
              const power = ['banana', 'distract', 'snitch'][k];
              await tap(caster, `power${k}`);
              await sleep(250);
              const lg = await evlog();
              const ev = lg.filter((e) => e.kind === 'power').pop();
              const cm = await me(caster.page);
              out[`power_${power}_event`] = ev ?? null;
              // who got hit: the phone whose notice names the caster
              const after = await Promise.all(phones.map((p) => me(p.page)));
              const victimIdx = after.findIndex((m: any) => m?.notice && m.id !== cm.id && m.notice.text.startsWith(cm.name));
              const row = {
                power,
                caster: `${cm.tag} ${cm.name}`,
                casterSees: cm.notice?.text ?? null,
                affected: victimIdx >= 0 ? `${after[victimIdx].tag} ${after[victimIdx].name}` : null,
                affectedSees: victimIdx >= 0 ? after[victimIdx].notice.text : null,
                runnersNotified: after.filter((m: any) => m?.notice && m.id !== cm.id).length,
              };
              out[`power_${power}`] = row;
              log(`round B power ${power}:`, JSON.stringify(row));
              await shotScreen(`B3-power-${power}-projector`);
              await caster.page.screenshot({ path: `${OUT}/B3-power-${power}-caster.png` });
              if (victimIdx >= 0) await phones[victimIdx].page.screenshot({ path: `${OUT}/B3-power-${power}-affected.png` });
              powerShots[k] = power;
            }
          }
        }

        // ---- votes: decide each lounge phone's choice once, from entry order
        if (s.phase === 'vote' && !phones.some((p) => p.voteAt)) {
          const order = lounge.map((p: any) => p.id);
          const ownerId = s.ownerId;
          for (const ph of phones) {
            const m = mes[ph.i];
            const k = order.indexOf(m?.id);
            if (k < 0 || m.id === ownerId) continue;
            if (tag === 'A') {
              // later entrants back the coup first, entrants 3-5 keep, entrant 2 joins the coup last
              if (k === 1) { ph.voteChoice = 'crown'; ph.voteAt = Date.now() + 2600; }
              else if (k >= 2 && k <= 4) { ph.voteChoice = 'keep'; ph.voteAt = Date.now() + 1300; }
              else { ph.voteChoice = 'crown'; ph.voteAt = Date.now() + 900 + (k - 5) * 120; }
            } else {
              // two challengers back the coup, everyone else keeps the owner
              ph.voteChoice = k <= 2 ? 'crown' : 'keep';
              ph.voteAt = Date.now() + 900 + k * 150;
            }
          }
          out.voteOrder = lounge.map((p: any) => `${p.entryOrder}:${p.tag} ${p.name} (${p.score})`);
          // the card BEFORE anyone votes, from the last entrant's phone
          const lastIn = phones.find((ph) => mes[ph.i]?.id === order[order.length - 1]);
          if (lastIn) { await sleep(600); await lastIn.page.screenshot({ path: `${OUT}/${tag}4-vote-card-before.png` }); }
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
            case 'owner-pick': {
              const k = m.ruleChoices.indexOf('moonwalk');
              await tap(ph, `rule${k >= 0 ? k : 0}`);
              return;
            }
            case 'support':
              if (ph.voteChoice && !ph.voted && Date.now() >= ph.voteAt) { ph.voted = await tap(ph, ph.voteChoice); }
              return;
            default:
              if (ph.holding) await setHold(ph, false);
          }
        }));

        // vote screenshots: projector + a voter's card after the second entrant joins the coup
        if (s.phase === 'vote' && voteOpenedAt && Date.now() - voteOpenedAt > 3300 && !shots.has('vote')) {
          shots.add('vote');
          voteShot = Date.now();
          await shotScreen(`${tag}4-vote-projector`);
          const voter = phones.find((ph) => ph.voteChoice === 'keep') ?? phones.find((ph) => ph.voteChoice);
          if (voter) await voter.page.screenshot({ path: `${OUT}/${tag}4-vote-card-after.png` });
          out.voteMid = s.vote;
        }
        await sleep(30);
      }
      void voteShot;
      // ---------- reveal ----------
      await screen.waitForFunction(() => (window as unknown as { __club: ScreenClub }).__club.snap()?.phase === 'reveal', null, { timeout: 20000 });
      await sleep(900);
      await shotScreen(`${tag}5-reveal-1-crown`);
      const end = await snap();
      const mes = await Promise.all(phones.map((p) => me(p.page)));
      const winner = phones[mes.findIndex((m: any) => m.id === end.reveal.winnerId)];
      if (winner) await winner.page.screenshot({ path: `${OUT}/${tag}5-phone-winner.png` });
      const loser = phones[mes.findIndex((m: any) => m.reveal?.ownerBeforeVote === m.name && m.id !== end.reveal.winnerId)];
      if (loser) await loser.page.screenshot({ path: `${OUT}/${tag}5-phone-former-owner.png` });
      await sleep(4200);
      await shotScreen(`${tag}5-reveal-2-scores`);
      const lg = (await evlog()).slice(logStart);
      const r = end.reveal;
      const top = r.ranking.slice().sort((a: any, b: any) => b.score - a.score)[0];
      out.winner = `${r.winnerTag} ${r.winnerName}`;
      out.prevOwner = r.prevOwnerName ? `${r.prevOwnerTag} ${r.prevOwnerName}` : null;
      out.ownerBeforeVote = r.ownerBeforeVote;
      out.vote = r.vote;
      out.allIn = r.allIn;
      out.ropeSnapped = r.ropeSnapped;
      out.ranking = r.ranking.map((x: any, i: number) => `#${i + 1} ${x.tag} ${x.name} ${x.score}`);
      out.topScorer = `${top.tag} ${top.name} ${top.score}`;
      const entered = lg.filter((e) => e.kind === 'entered');
      out.entries = entered.map((e) => `${e.name}@${e.clock.toFixed(1)}`);
      const allin = lg.find((e) => e.kind === 'allin');
      const rope = lg.find((e) => e.kind === 'rope');
      out.allInAt = allin ? allin.clock : null;
      out.lastEntryAt = entered.length ? entered[entered.length - 1].clock : null;
      out.ropeAt = rope ? rope.clock : null;
      const agree = mes.every((m: any) => m.reveal?.winnerId === r.winnerId);
      out.screensAgree = agree;
      out.phoneRanks = mes.map((m: any) => `${m.tag} ${m.name}: #${m.rank}${m.reveal?.winnerId === m.id ? ' VIP' : ''}`);
      out.mugshots = mes.filter((m: any) => !!m.mugshot).length;
      return out;
    }

    // ---------------- round A ----------------
    const A = await playRound('A');
    summary.A = A;
    check('A: the vote opened because everyone got in (no rope contest)', A.allIn === true && A.ropeAt === null);
    check('A: vote opened in the same moment as the last entry', A.allInAt !== null && A.lastEntryAt !== null && A.allInAt - A.lastEntryAt <= 0.1, `last in ${A.lastEntryAt?.toFixed?.(1)} s, vote ${A.allInAt?.toFixed?.(1)} s`);
    check('A: the coup passed and the crown changed hands', !!A.prevOwner && A.vote && A.vote.cast >= A.vote.needed, JSON.stringify(A.vote));
    check('A: the VIP is not the top scorer', A.winner !== A.topScorer.split(' ').slice(0, -1).join(' '), `VIP ${A.winner}, top ${A.topScorer}`);
    check('A: 11 screens agree on the VIP', A.screensAgree === true);
    check('A: every phone has a mugshot', A.mugshots === 10);

    // ---------------- round B ----------------
    await screen.keyboard.press('r');
    await screen.waitForFunction(() => (window as unknown as { __club: ScreenClub }).__club.snap()?.phase === 'lobby', null, { timeout: 5000 });
    await sleep(800);
    const B = await playRound('B');
    summary.B = B;
    check('B: players were still outside, so the rope rush ran', B.allIn === false && B.ropeAt !== null);
    check('B: the owner kept the crown', !B.prevOwner && B.vote && B.vote.cast < B.vote.needed, JSON.stringify(B.vote));
    check('B: 11 screens agree on the VIP', B.screensAgree === true);
    for (const pw of ['banana', 'distract', 'snitch']) {
      const row = B[`power_${pw}`];
      check(`B: ${pw} was cast and named on the caster's phone`, !!row?.casterSees, row ? `${row.caster}: ${row.casterSees}` : 'not cast');
    }
    check('B: banana victim told who tripped them', !!B.power_banana?.affectedSees, B.power_banana ? `${B.power_banana.affected}: ${B.power_banana.affectedSees}` : '');
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
