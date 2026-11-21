import type { Micro, Rule } from '../../shared/protocol';

/**
 * Scripted lines. The game never waits on Claude: every moment has a line here,
 * and Claude's lines replace them only when they arrive in time.
 * Style: ALL CAPS, short, deadpan, specific. Roast the move, never the person.
 */

export interface RoundScript {
  taunts: string[];      // during a tell
  fakeouts: string[];    // when a tell turns out to be nothing
  turns: string[];       // when he turns and nobody is caught
  opener: string;        // doors open
  ruleLines: Record<Rule, string>;
  npcNames: string[];
}

export const FALLBACK_SCRIPT: RoundScript = {
  taunts: [
    'DID SOMEBODY... MOVE?',
    'I CAN HEAR YOUR SHOES SQUEAKING.',
    'SOMEONE SMELLS LIKE FAKE ID.',
    'I HAVE EYES IN THE BACK OF MY HEAD. ALMOST.',
    'WHO IS BREATHING SO LOUD?',
    'FUNNY. THE LINE LOOKS SHORTER.',
  ],
  fakeouts: [
    '...NAH. THOUGHT I HEARD A RAT.',
    '...FALSE ALARM. IT WAS THE CAT.',
    '...NEVER MIND. NEW TEXT.',
    '...HM. CARRY ON. I MEAN, DON\'T.',
  ],
  turns: [
    'NOBODY. MOVE. A. MUSCLE.',
    'STATUES. GOOD. I LIKE STATUES.',
    'I SEE YOU. I SEE ALL OF YOU.',
  ],
  opener: 'DOORS ARE OPEN. HOLD TO SNEAK. FREEZE WHEN I LOOK.',
  ruleLines: {
    lights: 'LIGHTS OUT. I FOUND A FLASHLIGHT. STAY OUT OF THE BEAM.',
    glasses: 'NEW GLASSES. I SEE EVERYTHING NOW. SHORTER WARNINGS.',
    moonwalk: 'MOONWALK. LET GO TO MOVE. HOLD TO FREEZE.',
    disco: 'DISCO MODE. I CANNOT HELP MYSELF. FASTER TURNS.',
  },
  npcNames: ['BARRY', 'KEV FROM IT', 'MYSTERY DAN', 'AUNTIE VAL', 'LIL SOCKS', 'DOUG'],
};

const PASS = [
  '...FINE. KEEP WALKING.',
  'THAT WAS ALMOST DANCING. GO ON.',
  'I SAW NOTHING. MOVE.',
  'OK. THAT WAS A LITTLE BIT GOOD.',
  'RESPECT. BARELY. KEEP GOING.',
];
const FAIL_MASH = [
  'WAS THAT A BRIBE OR A SNEEZE? OUT.',
  'THREE COINS AND A BUTTON. BACK OF THE LINE.',
  'MY NAN TIPS BETTER THAN THAT. START AGAIN.',
  'YOU CALL THAT MONEY? WALK.',
];
const FAIL_SHAKE = [
  'MY NAN SHAKES HARDER AT BINGO. BACK OF THE LINE.',
  'THAT WAS NOT DANCING. THAT WAS A SHIVER.',
  'NOPE. START AGAIN, LEGEND.',
  'I HAVE SEEN LIVELIER FRIDGES. OUT.',
];
const REPEAT = [
  '{N}, AGAIN? DO YOU WANT TO BE HERE?',
  '{N}. THIRD TIME. I AM STARTING A FILE.',
  '{N}, I KNOW YOUR SHOES BY NOW.',
];

export const ASK: Record<Micro, string[]> = {
  shake: ['{N}. DANCE FOR ME.', '{N}. YOU MOVED. SO MOVE. DANCE.', 'YOU. {N}. SHOW ME YOUR MOVES.'],
  mash: ['{N}. BRIBE ME. FASTER.', '{N}. I SAW THAT. PAY UP.', 'YOU. {N}. EMPTY YOUR POCKETS.'],
};

export const LINES = {
  lobby: 'CLUB VELVET IS OPEN. SCAN THE CODE AND GET IN LINE. NO PUSHING.',
  nap: '...ZZZ. (GUS FELL ASLEEP. GO GO GO!)',
  firstIn: '{N} IS IN FIRST. {N} RUNS THE DOOR NOW. PICK A RULE.',
  entered: '{N} IS IN. NUMBER {K}.',
  push: 'LAST CALL! OUTSIDE: BREAK THE ROPE. LOUNGE: HOLD IT.',
  ropeSnapped: 'THE ROPE IS GONE. EVERYBODY IN. LOUNGE: VOTE ON THE CROWN.',
  ropeHeld: 'ROPE HELD. NOW THE LOUNGE VOTES ON THE CROWN.',
  nerd: 'NICE TRY, NERD. {N} SITS OUT FIVE SECONDS.',
  banana: '{B} THREW A BANANA. {N} SLIPPED.',
  bananaMiss: '{B} THREW A BANANA AT NOBODY.',
  distract: '{B} DISTRACTED GUS. GO GO GO.',
  snitch: '{B} SNITCHED. GUS WILL LOOK LONGER.',
  noWinner: 'NOBODY GOT IN. GUS WINS AGAIN.',
  kept: '{N} KEPT THE CROWN. TONIGHT\'S VIP.',
  allIn: 'EVERYONE\'S IN. TIME TO VOTE.',
  took: '{N} TOOK THE CROWN FROM {P}. LONG LIVE {N}.',
  soloClear: '{L} CLEARED. NEXT DOOR.',
  soloBeaten: 'AREA 51 BREACHED. BOUNCER BEATEN.',
};

export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w)\}/g, (_, k) => String(v[k] ?? ''));

export function pickLine<X>(list: X[], rand: () => number): X {
  return list[Math.floor(rand() * list.length) % list.length];
}

/** Scripted result line for a challenge: remembers repeat offenders. */
export function fallbackRoast(name: string, micro: Micro, pass: boolean, timesCaught: number, rand: () => number): string {
  if (!pass && timesCaught >= 3 && rand() < 0.6) return fill(pickLine(REPEAT, rand), { N: name });
  if (pass) return pickLine(PASS, rand);
  return pickLine(micro === 'shake' ? FAIL_SHAKE : FAIL_MASH, rand);
}

export interface RaceState {
  leader: string | null;
  leaderX: number;
  mostCaught: { name: string; n: number } | null;
  statue: { name: string; secs: number } | null;
  owner: string | null;
  rule: Rule | null;
  inLounge: number;
  outside: number;
  timeLeft: number;
}

/** Scripted commentary from the race state (used when Claude is slow or off). */
export function fallbackCommentary(s: RaceState, rand: () => number): { line: string; mono: string } {
  const opts: { line: string; mono: string }[] = [];
  if (s.statue && s.statue.secs >= 12) opts.push({ line: `${s.statue.name} HAS BEEN A STATUE FOR ${Math.floor(s.statue.secs)} SECONDS. SUSPICIOUS.`, mono: 'IS THAT ONE EVEN REAL?' });
  if (s.mostCaught && s.mostCaught.n >= 2) opts.push({ line: `${s.mostCaught.name} HAS BEEN CAUGHT ${s.mostCaught.n} TIMES. UNDETERRED.`, mono: `I KNOW ${s.mostCaught.name}'S SHOES NOW.` });
  if (s.leader && s.leaderX > 0.5) opts.push({ line: `${s.leader} IS ${Math.round((1 - s.leaderX) * 60)} FEET FROM THE ROPE. GUS HAS NOT NOTICED.`, mono: 'SOMETHING FEELS CLOSER.' });
  if (s.owner && s.rule) opts.push({ line: `${s.owner} RUNS THE DOOR. THE LINE IS NOT HAPPY.`, mono: 'I TAKE ORDERS FROM A GUEST NOW?' });
  if (s.inLounge === 0 && s.timeLeft > 0) opts.push({ line: 'NOBODY IS IN YET. GUS IS UNDEFEATED.', mono: 'TOO EASY. TOO EASY.' });
  opts.push({ line: `${s.outside} PEOPLE STILL OUTSIDE. GUS IS COUNTING.`, mono: 'IF ONE MORE GUY SAYS HE KNOWS THE DJ...' });
  return pickLine(opts, rand);
}
