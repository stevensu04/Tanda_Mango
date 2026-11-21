/**
 * The contract between the game server, the projector, the phones and the host page.
 * The server is the only source of truth: screens render what it sends.
 * Transport: one WebSocket per client on /ws, JSON messages. See docs/PROTOCOL.md.
 */
export { T, SOLO_LEVELS } from './constants';

export type GusPhase = 'back' | 'tell' | 'watch' | 'sleep';
export type RoundPhase = 'lobby' | 'play' | 'push' | 'vote' | 'reveal';
export type PlayerState = 'outside' | 'caught' | 'lounge';
export type Rule = 'moonwalk' | 'lights' | 'glasses' | 'disco';
export type Micro = 'mash' | 'shake';
export type Power = 'banana' | 'distract' | 'snitch';

export const RULE_IDS: Rule[] = ['lights', 'glasses', 'moonwalk', 'disco'];
export const RULES: Record<Rule, { name: string; blurb: string[]; banner: string }> = {
  lights: { name: 'LIGHTS OUT', blurb: ['THE STREET GOES DARK.', 'ONLY HIS BEAM SEES YOU.'], banner: 'STAY OUT OF THE BEAM' },
  glasses: { name: 'NEW GLASSES', blurb: ['GUS SEES BETTER.', 'SHORTER WARNINGS.'], banner: 'SHORTER WARNINGS' },
  moonwalk: { name: 'MOONWALK', blurb: ['EVERYONE OUTSIDE:', 'LET GO TO MOVE.'], banner: 'RELEASE TO MOVE' },
  disco: { name: 'DISCO MODE', blurb: ['THE MUSIC KICKS IN.', 'GUS TURNS FASTER.'], banner: 'FASTER TURNS' },
};
export const POWER_IDS: Power[] = ['banana', 'distract', 'snitch'];
/** `who` says whom the power works for, so the button reads as a choice of side. */
export const POWERS: Record<Power, { name: string; blurb: string; who: string }> = {
  banana: { name: 'BANANA', blurb: 'RANDOM RUNNER SLIPS', who: 'TRIP A RUNNER' },
  distract: { name: 'DISTRACT', blurb: 'GUS LOOKS AWAY +1S', who: 'HELP THE RUNNERS' },
  snitch: { name: 'SNITCH', blurb: 'HIS NEXT LOOK +1S', who: 'HELP GUS' },
};

export type VoteChoice = 'crown' | 'keep';

export interface Settings {
  roundSecs: number;       // 90 or 120
  difficulty: number;      // 0.6 (easy) .. 1.4 (hard); scales Gus timings
  npcs: boolean;           // fill small rooms with NPCs
  ai: boolean;             // false = scripted lines only (also the automatic fallback)
}

// ---------- client -> server ----------
export type ClientMsg =
  | { t: 'hello'; role: 'screen'; room?: string; key?: string }
  | { t: 'hello'; role: 'phone'; token: string; room?: string; motion?: boolean }
  | { t: 'hello'; role: 'admin'; room?: string; token?: string }
  | { t: 'create'; password: string }
  | { t: 'unlock'; room: string; password: string }
  | { t: 'join'; name: string; seed: number }
  | { t: 'caps'; motion: boolean }
  | { t: 'press' }
  | { t: 'release' }
  | { t: 'tap' }
  | { t: 'vote'; choice: VoteChoice }    // coup vote; a plain tap during the vote still means 'crown'
  | { t: 'shake'; e: number }            // 0..1 shake energy for the last ~100 ms
  | { t: 'rule'; rule: Rule }
  | { t: 'power'; power: Power }
  | { t: 'pong'; n: number }
  | { t: 'solo'; op: 'start'; level: number }
  | { t: 'solo'; op: 'menu' }
  | { t: 'start' }
  | { t: 'reset' }
  | { t: 'kick'; id: string }
  | { t: 'settings'; settings: Partial<Settings> };

// ---------- server -> projector ----------
export interface PubPlayer {
  id: string;
  tag: number;           // short stable player number (1..), shown on the phone, the avatar and the results; 0 = NPC
  name: string;
  seed: number;
  x: number;             // 0 start .. 1 rope
  state: PlayerState;
  moving: boolean;
  caught: boolean;
  micro: Micro | null;   // while caught
  microScore: number;    // 0..1 progress in the challenge
  microLeft: number;
  entryOrder: number;    // 0 = not in yet
  score: number;
  voted: boolean;
  kept: boolean;         // chose KEEP in the coup vote
  npc: boolean;
  nerd: boolean;         // sitting out a NICE TRY, NERD timeout
  connected: boolean;
}

export interface Hud { ego: number; paranoia: number; boredom: number; suspicion: number; mono: string }

export interface VoteState {
  cast: number;                 // CROWN votes
  kept: number;                 // KEEP votes
  needed: number;               // strict majority of eligible
  eligible: number;
  successorId: string | null;   // who takes the seat if it passes now: the earliest-entered CROWN voter
  successorName: string | null;
  successorTag: number;
}

export interface Reveal {
  winnerId: string | null;
  winnerName: string | null;
  winnerTag: number;
  prevOwnerName: string | null; // set when the crown changed hands in the vote
  prevOwnerTag: number;
  ownerBeforeVote: string | null; // who held the crown when the vote opened
  ropeSnapped: boolean;
  allIn: boolean;               // the vote opened early because nobody was left outside
  vote: { cast: number; kept: number; needed: number; eligible: number } | null;
  ranking: { id: string; tag: number; name: string; score: number }[];
  awards: { label: string; name: string; value: string }[];
  toast: string;                // Gus's closing line (scripted first, Claude's when it lands)
}

export interface Say { text: string; who: 'GUS' | 'LIVE'; n: number }

export interface Snapshot {
  t: 'snap';
  code: string;
  phase: RoundPhase;
  timeLeft: number;
  roundSecs: number;
  gus: GusPhase;
  rule: Rule | null;
  ruleBy: string | null;
  beam: number | null;   // Lights Out: beam centre 0..1 on the street
  ownerId: string | null;
  ownerName: string | null;
  ownerPickLeft: number;
  players: PubPlayer[];
  push: { crowd: number; defend: number; outside: number; lounge: number } | null;
  ropeSnapped: boolean | null;
  allIn: boolean;        // everyone got in before the rush: straight to the vote
  vote: VoteState | null;
  reveal: Reveal | null;
  hud: Hud;
  say: Say | null;       // the line currently in Gus's text box
  ai: 'live' | 'scripted';
}

// ---------- server -> one phone ----------
export type PhoneRole =
  | 'join' | 'lobby' | 'sneak' | 'caught' | 'result' | 'nerd'
  | 'owner-pick' | 'lounge'
  | 'break' | 'defend' | 'support' | 'defending' | 'outside-vote'
  | 'reveal'
  | 'no-room'
  | 'solo-menu' | 'solo-clear' | 'solo-done';

export interface Mugshot {
  name: string;
  seed: number;
  caught: number;
  passes: number;
  bestMicro: number;     // best challenge score, 0..100
  distance: string;      // e.g. "41 FT"
  roast: string;         // harshest line Gus said to you
  title: string;         // e.g. "PROFESSIONAL STATUE"
  threat: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  rankLine: string;      // "#3 OF 7" or "TONIGHT'S VIP" or "BOUNCER BEATEN"
}

export interface SoloView {
  level: number;                  // current / last level index
  unlocked: number;               // highest playable level index
  levels: { name: string; guard: string; note: string; cleared: boolean }[];
  catches: number;
  time: number;                   // seconds spent in levels so far
  beaten: boolean;
}

/** A named, per-phone result of someone's Lounge power ("NOT A COP TRIPPED YOU"). */
export interface Notice { text: string; tone: 'good' | 'bad' | 'info'; n: number }

/** This phone's view of the coup vote. */
export interface MyVote extends VoteState {
  choice: VoteChoice | null;
  ifCrownId: string | null;     // who would take the seat if this phone voted CROWN (now)
  ifCrownName: string | null;
  ifCrownTag: number;
}

export interface Me {
  t: 'me';
  code: string | null;
  id: string | null;
  tag: number;
  role: PhoneRole;
  phase: RoundPhase;
  timeLeft: number;
  gus: GusPhase;
  rule: Rule | null;
  ruleBy: string | null;
  beam: number | null;
  name: string;
  seed: number;
  x: number;
  moving: boolean;
  needFreshPress: boolean;
  micro: Micro | null;
  microLeft: number;
  microTaps: number;
  microScore: number;
  result: { pass: boolean; line: string } | null;
  nerdLeft: number;
  isOwner: boolean;
  ownerName: string | null;
  ownerTag: number;
  ownerPickLeft: number;
  ruleChoices: Rule[];
  powers: { power: Power; cd: number }[];
  pushTaps: number;
  voted: boolean;
  vote: MyVote | null;
  allIn: boolean;
  notice: Notice | null;
  rank: number;
  total: number;
  score: number;
  reveal: Reveal | null;
  mugshot: Mugshot | null;
  solo: SoloView | null;
  say: Say | null;
}

/** One-off moments the projector animates. `say` carries every line Gus speaks. */
export type GameEvent =
  | { t: 'ev'; kind: 'caught'; id: string; name: string; micro: Micro }
  | { t: 'ev'; kind: 'pass'; id: string; name: string; line: string }
  | { t: 'ev'; kind: 'flung'; id: string; name: string; line: string }
  | { t: 'ev'; kind: 'entered'; id: string; name: string; order: number }
  | { t: 'ev'; kind: 'owner'; id: string; name: string }
  | { t: 'ev'; kind: 'rule'; rule: Rule; by: string }
  | { t: 'ev'; kind: 'tell' }
  | { t: 'ev'; kind: 'fakeout' }
  | { t: 'ev'; kind: 'turn' }
  | { t: 'ev'; kind: 'nap' }
  | { t: 'ev'; kind: 'nerd'; id: string; name: string }
  | { t: 'ev'; kind: 'power'; power: Power; by: string; byId: string; byTag: number; target: string | null; targetId: string | null; targetTag: number }
  | { t: 'ev'; kind: 'rope'; snapped: boolean }
  | { t: 'ev'; kind: 'allin' }
  | { t: 'ev'; kind: 'say'; text: string; who: 'GUS' | 'LIVE'; speak: boolean };

export interface AiStats {
  enabled: boolean;        // admin switch
  keyPresent: boolean;
  model: string;
  calls: number;
  ok: number;
  fallbacks: number;       // timeouts, errors, refusals, invalid output
  inTokens: number;
  outTokens: number;
  usd: number;
  p50ms: number;
  p95ms: number;
  lastError: string | null;
}

export interface AdminState {
  t: 'admin';
  rooms: { code: string; phase: RoundPhase; humans: number; screens: number }[];
  room: {
    code: string;
    phase: RoundPhase;
    timeLeft: number;
    settings: Settings;
    players: { id: string; name: string; npc: boolean; connected: boolean; state: PlayerState; score: number; x: number }[];
  } | null;
  ai: AiStats;
}

export type ServerMsg =
  | Snapshot
  | Me
  | GameEvent
  | AdminState
  | { t: 'room'; code: string; control?: boolean }
  | { t: 'ping'; n: number }
  /** host login result; token is kept by the admin page and sent in its hello */
  | { t: 'auth'; ok: boolean; code?: string; exists?: boolean; token?: string; error?: string; retryIn?: number }
  | { t: 'created'; code: string }
  /** a projector without the room's key (or for a room that is gone) */
  | { t: 'denied'; reason: 'no-room' | 'waiting' };
