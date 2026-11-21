/**
 * Sound acceptance: records what the projector's mixer actually outputs (a tap on the master bus,
 * so it is the real game sound, not a re-creation) and checks the controls.
 *
 *   npx tsx scripts/sound-check.ts      (about 2 minutes; needs ffmpeg on PATH for the analysis)
 *
 * Writes artifacts/sound/:
 *   test-sound.webm            the lobby Test sound preview (beat behind the door, hum, clasp + door, audition line)
 *   round-outside-turn-door.webm  a real round from the start until just after the first player gets in
 *   round-highlight.m4a        outside -> Gus turns (background ducks) -> door opens, cut from the round
 *   cues.json + levels.txt     event times and loudness/brightness per half second
 * Gus's TTS lines are not in the recordings: the browser speaks them outside the Web Audio graph.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';

process.env.BOUNCER_AI = process.env.BOUNCER_AI || 'mock';
process.env.OPEN_ROOMS = process.env.OPEN_ROOMS || '1'; // projectors may open rooms without the host console (test mode)
const PORT = 5184;
const BASE = `http://localhost:${PORT}`;
const OUT = 'artifacts/sound';
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); };

type Club = { me(): any; target(id: string): { x: number; y: number } | null };
const me = (p: Page) => p.evaluate(() => (window as unknown as { __club: Club }).__club.me());
const point = (p: Page, id: string) => p.evaluate((i) => (window as unknown as { __club: Club }).__club.target(i), id);

/** Decode a recording to mono 24 kHz PCM and measure each half second: loudness (dBFS) and brightness. */
function analyse(file: string): { t: number; db: number; bright: number; hi: number }[] {
  const raw = `${file}.raw`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '24000', '-f', 's16le', raw]);
  const b = readFileSync(raw);
  const n = b.length / 2, win = 12000, rows = [];
  for (let s = 0; s + win <= n; s += win) {
    let e = 0, d = 0, prev = 0;
    for (let i = s; i < s + win; i++) { const v = b.readInt16LE(i * 2) / 32768; e += v * v; d += (v - prev) * (v - prev); prev = v; }
    const rms = Math.sqrt(e / win);
    const hr = Math.sqrt(d / win);
    rows.push({ t: s / 24000, db: rms > 0 ? 20 * Math.log10(rms) : -120, bright: e > 0 ? Math.sqrt(d / e) : 0, hi: hr > 0 ? 20 * Math.log10(hr) : -120 });
  }
  return rows;
}

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: 'vite.config.ts', server: { port: PORT, strictPort: true, host: '127.0.0.1', hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'warn' });
  await server.listen();
  const browser = await chromium.launch();
  const errors: string[] = [];
  try {
    const screenCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const screen = await screenCtx.newPage();
    screen.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await screen.goto(`${BASE}/screen.html`);
    await screen.waitForFunction(() => /room=[A-Z]{4}/.test(location.search));
    const code = new URL(screen.url()).searchParams.get('room')!;
    const record = async (ms: number, file: string) => {
      const b64 = await screen.evaluate((m) => (window as any).__club.record(m), ms);
      writeFileSync(file, Buffer.from(b64, 'base64'));
    };
    const st = () => screen.evaluate(() => (window as any).__club.audio());
    check('fresh projector shows a visible sound button before any click', await screen.isVisible('#cv-resume'), await screen.textContent('#cv-resume') ?? '');

    // ---- 1. Test sound, recorded as it plays (labelled with the preview's own cue marks)
    await screen.click('#cv-test');
    const t0 = (await st()).now;
    await record(17_000, `${OUT}/test-sound.webm`);
    check('Test sound leaves the room in the lobby', (await screen.evaluate(() => (window as any).__club.snap().phase)) === 'lobby');
    const marks = ((await screen.evaluate(() => (window as any).__club.previewMarks())) as { what: string; at: number }[]).map((m) => ({ what: m.what, at: +(m.at - t0).toFixed(2) }));
    writeFileSync(`${OUT}/test-sound-cues.json`, JSON.stringify(marks, null, 2));
    console.log('  · Test sound cues:', marks.map((m) => `${m.at.toFixed(1)}s ${m.what}`).join(' | '));
    const ts = analyse(`${OUT}/test-sound.webm`);
    const avg = (rows: typeof ts, k: 'db' | 'bright' | 'hi') => rows.reduce((a, r) => a + r[k], 0) / Math.max(1, rows.length);
    const when = (w: string) => marks.find((m) => m.what.startsWith(w))?.at ?? -1;
    const tHum = when('Gus hums'), tDoor = when('clasp'), tShut = when('door shuts'), tLine = when('Gus:');
    const span = (a: number, b: number) => ts.filter((r) => r.t >= a && r.t + 0.5 <= b);
    const closed = span(0, Math.max(1, tHum - 0.2)), open = span(tDoor + 0.5, tShut), after = span(tLine + 3.2, 17);
    check('Test sound: door opens -> the same beat gets clearer and louder; shut -> muffled again', avg(open, 'hi') > avg(closed, 'hi') + 6 && avg(open, 'db') > avg(closed, 'db') + 4 && avg(after, 'hi') < avg(open, 'hi') - 6 && avg(after, 'db') < avg(open, 'db') - 4,
      `closed ${avg(closed, 'db').toFixed(1)} dB / highs ${avg(closed, 'hi').toFixed(1)} dB, open ${avg(open, 'db').toFixed(1)} / ${avg(open, 'hi').toFixed(1)}, shut again ${avg(after, 'db').toFixed(1)} / ${avg(after, 'hi').toFixed(1)}`);
    const humDb = Math.max(...span(tHum, tHum + 1.6).map((r) => r.db)), lineDb = Math.max(...span(tLine, tLine + 2.7).map((r) => r.db));
    check('Test sound: hum sits under Gus\'s spoken line', humDb < lineDb, `hum peak ${humDb.toFixed(1)} dB, line peak ${lineDb.toFixed(1)} dB, bed ${avg(closed, 'db').toFixed(1)} dB`);
    check('Test sound: all five moments inside the recording', tHum > 0 && tDoor > tHum && tLine > tDoor && tLine + 2.7 < 17, marks.map((m) => m.at).join(', '));
    writeFileSync(`${OUT}/levels-test-sound.txt`, ts.map((r) => {
      const here = marks.filter((m) => m.at >= r.t && m.at < r.t + 0.5).map((m) => m.what).join(', ');
      return `${r.t.toFixed(1)}s  ${r.db.toFixed(1)} dB  highs ${r.hi.toFixed(1)} dB  ${here}`;
    }).join('\n'));

    // ---- 2. volumes and mute (lobby: only the ambience and street are playing)
    const lobbyDb = async () => { await record(2000, `${OUT}/_probe.webm`); const r = analyse(`${OUT}/_probe.webm`); return avg(r, 'db'); };
    const base = await lobbyDb();
    await screen.click('#cv-mixbtn');
    await screen.fill('#cv-amb', '0');
    const ambOff = await lobbyDb();
    await screen.fill('#cv-amb', '80');
    await screen.check('#cv-mute');
    const muted = await lobbyDb();
    await screen.uncheck('#cv-mute');
    const back = await lobbyDb();
    check('Ambience slider at 0 silences the club', ambOff < base - 20, `${base.toFixed(1)} dB -> ${ambOff.toFixed(1)} dB`);
    check('Mute all silences everything; unmute brings it back', muted < base - 30 && back > base - 4, `muted ${muted.toFixed(1)} dB, back ${back.toFixed(1)} dB`);
    await screen.click('#cv-mixbtn');

    // ---- 3. a real round: 4 phones, host phone starts it, record outside -> turn -> first one in
    const phones: Page[] = [];
    for (let i = 0; i < 4; i++) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const p = await ctx.newPage();
      await p.goto(`${BASE}/play.html?room=${code}`);
      await p.waitForFunction(() => !!(window as any).__club?.target('joinBtn'));
      await p.fill('#nameInput', ['阿哲', 'WESLEY', '小林 JAY', 'TALL KEV'][i]);
      const pt = (await point(p, 'joinBtn'))!;
      await p.mouse.click(pt.x, pt.y);
      phones.push(p);
    }
    await sleep(800);
    const admin = await (await browser.newContext()).newPage();
    await admin.goto(`${BASE}/admin.html?room=${code}`);
    await admin.waitForFunction(() => !(document.getElementById('start') as HTMLButtonElement).disabled);
    const logStart = (await screen.evaluate(() => (window as any).__club.log())).length;
    await admin.click('#start');
    const recStart = Date.now();
    const roundRec = record(42_000, `${OUT}/round-outside-turn-door.webm`);
    const held = phones.map(() => false);
    let firstIn = 0;
    while (Date.now() - recStart < 42_000) {
      const ms = await Promise.all(phones.map((p) => me(p)));
      if (!firstIn && ms.some((m: any) => m?.role === 'lounge' || m?.role === 'owner-pick')) firstIn = Date.now();
      await Promise.all(phones.map(async (p, i) => {
        const m = ms[i];
        if (!m) return;
        if (m.role === 'sneak') {
          // stagger the bots so entries are spread out, and keep the last one outside (no early all-in vote)
          const late = Date.now() - recStart < i * 2500 || (i === 3 && m.x > 0.3);
          const safe = !late && (m.gus === 'back' || m.gus === 'sleep');
          const want = m.rule === 'moonwalk' ? !safe : safe;
          if (want !== held[i]) { const pt = await point(p, 'big'); if (pt) { await p.mouse.move(pt.x, pt.y); if (want) await p.mouse.down(); else await p.mouse.up(); held[i] = want; } }
        } else {
          if (held[i]) { await p.mouse.up(); held[i] = false; }
          if (m.role === 'caught') { const pt = await point(p, 'mash'); if (pt) await p.mouse.click(pt.x, pt.y); }
          if (m.role === 'owner-pick') { const pt = await point(p, 'rule0'); if (pt) await p.mouse.click(pt.x, pt.y); }
        }
      }));
      await sleep(60);
    }
    await roundRec;
    const st2 = await st();
    check('projector audio kept running after the host phone started the round', st2.state === 'running', st2.state);
    check('phones never load the club ambience engine', (await Promise.all(phones.map((p) => p.evaluate(() => (window as any).__club.audio === undefined)))).every(Boolean));
    const lg = (await screen.evaluate(() => (window as any).__club.log())).slice(logStart) as { kind: string; name?: string; clock: number }[];
    const cues = lg.filter((e) => ['tell', 'turn', 'caught', 'entered', 'hum', 'cute-shoes', 'pass', 'flung', 'nap', 'owner'].includes(e.kind)).map((e) => ({ at: +e.clock.toFixed(2), kind: e.kind, name: e.name }));
    writeFileSync(`${OUT}/cues.json`, JSON.stringify(cues, null, 2));
    const rr = analyse(`${OUT}/round-outside-turn-door.webm`);
    writeFileSync(`${OUT}/levels-round.txt`, rr.map((r) => {
      const here = cues.filter((c) => c.at >= r.t && c.at < r.t + 0.5).map((c) => c.kind + (c.name ? ` ${c.name}` : '')).join(', ');
      return `${r.t.toFixed(1)}s  ${r.db.toFixed(1)} dB  highs ${r.hi.toFixed(1)} dB  ${here}`;
    }).join('\n'));
    const turn = cues.find((c) => c.kind === 'turn' && c.at > 3);
    const entry = cues.find((c) => c.kind === 'entered');
    check('the round recording caught a Gus turn and a first entry', !!turn && !!entry, `turn ${turn?.at}s, first in ${entry?.at}s (${entry?.name})`);
    if (turn && entry) {
      const at = (x: number) => rr.filter((r) => r.t >= x && r.t < x + 1);
      const tell = cues.filter((c) => c.kind === 'tell' && c.at < turn.at).pop();
      const before = tell ? at(tell.at - 1.5) : at(turn.at - 2);
      check('background ducks while Gus turns', avg(at(turn.at), 'db') < avg(before, 'db') + 1, `before ${avg(before, 'db').toFixed(1)} dB, turning ${avg(at(turn.at), 'db').toFixed(1)} dB (turn cue on top)`);
      const closed = at(entry.at - 1.5), open = at(entry.at + 0.4);
      check('first entry: door opens, the beat gets louder and brighter', avg(open, 'hi') > avg(closed, 'hi') + 6 && avg(open, 'db') > avg(closed, 'db') + 3, `closed ${avg(closed, 'db').toFixed(1)} dB / highs ${avg(closed, 'hi').toFixed(1)} dB, open ${avg(open, 'db').toFixed(1)} / ${avg(open, 'hi').toFixed(1)}`);
      // the short contrast clip: 4 s up to and through a turn, then 5 s around the first entry
      const t0 = Math.max(0, (tell?.at ?? turn.at) - 2.5), e0 = Math.max(0, entry.at - 1.5);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${OUT}/round-outside-turn-door.webm`, '-filter_complex',
        `[0:a]atrim=${t0}:${t0 + 4.5},asetpts=N/SR/TB,afade=t=out:st=4.2:d=0.3[a];[0:a]atrim=${e0}:${e0 + 5.5},asetpts=N/SR/TB,afade=t=in:d=0.2[b];[a][b]concat=n=2:v=0:a=1[o]`,
        '-map', '[o]', '-c:a', 'aac', '-b:a', '160k', `${OUT}/round-highlight.m4a`]);
      for (const f of ['test-sound', 'round-outside-turn-door']) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${OUT}/${f}.webm`, '-c:a', 'aac', '-b:a', '160k', `${OUT}/${f}.m4a`]);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  check('no console errors on the projector', errors.length === 0, errors.slice(0, 3).join(' | '));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
