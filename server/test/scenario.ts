import { Bot, drive, carefulMove, recklessMove, mashHard, until, sleep, type TestServer } from './net';
import type { Me, Rule } from '../../shared/protocol';

/** The scripted party used by the demo rehearsal and the Claude-down variants. */
export interface DemoRun {
  screen: Bot;
  anna: Bot; ben: Bot; cleo: Bot; dave: Bot;
  phones: Bot[];
  phases: string[];                 // phases seen by the projector, in order
  firstEntryGt: number | null;      // game seconds at which the first player was seen inside
  chosen: Rule | null;              // what ANNA picked
  choices: Rule[];
  rulePhones: Set<string>;          // phones that saw ANNA's pick in their own `me`
  ruleSeenOnSnap: boolean;
  aiFlagsMid: string[];             // snapshot.ai samples during play
  closeAll(): void;
}

export async function playDemoRound(server: TestServer, opts: { roundSecs?: number; wallTimeoutMs?: number; beforeStart?: (code: string) => Promise<void> } = {}): Promise<DemoRun> {
  const R = opts.roundSecs ?? 120;
  const screen = await Bot.screen(server.url);
  await until(() => screen.code, 2000, 'room code');
  const code = screen.code!;
  const mk = (name: string) => Bot.phone(server.url, `demo-${name.toLowerCase()}`, code);
  const [anna, ben, cleo, dave] = await Promise.all(['ANNA', 'BEN', 'CLEO', 'DAVE'].map(mk));
  const phones = [anna, ben, cleo, dave];
  const names = ['ANNA', 'BEN', 'CLEO', 'DAVE'];
  phones.forEach((p, i) => p.join(names[i], 10 + i));
  await until(() => screen.snap?.players.length === 4, 3000, 'lobby shows 4');

  const run: DemoRun = {
    screen, anna, ben, cleo, dave, phones, phases: [], firstEntryGt: null, chosen: null, choices: [],
    rulePhones: new Set(), ruleSeenOnSnap: false, aiFlagsMid: [],
    closeAll: () => { screen.close(); phones.forEach((p) => p.close()); },
  };

  screen.onSnap((s) => {
    if (run.phases[run.phases.length - 1] !== s.phase) run.phases.push(s.phase);
    if (run.firstEntryGt === null && s.players.some((p) => p.entryOrder > 0)) run.firstEntryGt = R - s.timeLeft;
    if (s.phase === 'play' && s.timeLeft < R - 20 && run.aiFlagsMid.length < 5 && Math.random() < 0.05) run.aiFlagsMid.push(s.ai);
    if (s.rule && run.chosen && s.rule === run.chosen && s.ruleBy === 'ANNA') run.ruleSeenOnSnap = true;
  });

  // finale behaviour shared by everybody: per-role tap cadence
  const finale = (me: Me, b: Bot, st: { roleSince: number; role: string; voted: boolean }) => {
    if (me.role !== st.role) { st.role = me.role; st.roleSince = Date.now(); st.voted = false; }
    const age = Date.now() - st.roleSince;
    if (me.role === 'defend') b.tap(1);
    else if (me.role === 'break') b.tap(1);
    else if (me.role === 'support' && !st.voted && age > 250) { st.voted = true; b.tap(1); }
  };
  const fin = () => ({ roleSince: Date.now(), role: '', voted: false });

  // ANNA: careful, first in, owner picks a rule from her console
  const aSt = fin();
  drive(anna, { wantMove: carefulMove, extra: (me, b) => {
    finale(me, b, aSt);
    if (me.role === 'owner-pick' && !run.chosen) {
      run.choices = me.ruleChoices;
      run.chosen = me.ruleChoices.find((r) => r !== 'lights') ?? me.ruleChoices[0];
      b.rule(run.chosen);
    }
  } });
  // BEN and CLEO wait, then sneak carefully
  for (const [bot, startAt] of [[ben, 8], [cleo, 14]] as const) {
    const st = fin();
    drive(bot, { wantMove: (me) => 120 - me.timeLeft >= startAt && carefulMove(me), extra: (me, b) => finale(me, b, st) });
  }
  // DAVE: reckless. Odd catches are mashed through, even ones are failed.
  const dSt = fin();
  let catchNo = 0, wasCaught = false;
  drive(dave, {
    wantMove: recklessMove,
    onCaught: (me, b) => { if (catchNo % 2 === 1) mashHard(me, b); else if (me.microTaps < 2) b.tap(1); },
    extra: (me, b) => {
      finale(me, b, dSt);
      const c = me.role === 'caught';
      if (c && !wasCaught) catchNo++;
      wasCaught = c;
    },
  });

  phones.forEach((p) => p.onMe((me) => { if (run.chosen && me.rule === run.chosen && me.ruleBy === 'ANNA') run.rulePhones.add(p.label); }));

  await opts.beforeStart?.(code);
  screen.start();
  await until(() => screen.snap?.phase === 'play', 2000, 'round starts');
  await until(() => screen.snap?.phase === 'reveal', opts.wallTimeoutMs ?? 55000, 'reveal');
  // let the last `me` land on the phones, then sample rule agreement from a mid-round event log
  await sleep(500);
  return run;
}

export function winnerAgreement(run: DemoRun) {
  const rev = run.screen.snap!.reveal!;
  return run.phones.every((p) => p.me?.reveal?.winnerId === rev.winnerId);
}
