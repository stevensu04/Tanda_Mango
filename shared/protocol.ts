/**
 * The contract between the game server, the projector and the phones.
 * The server is the only source of truth: screens render what it sends.
 */

export type GusPhase = 'back' | 'tell' | 'watch' | 'sleep';
export type RoundPhase = 'lobby' | 'play' | 'push' | 'vote' | 'reveal';
export type PlayerState = 'outside' | 'caught' | 'lounge';
export type Rule = 'moonwalk' | null;

export const T = {
  ROUND: 90,             // seconds per round (demo length)
  PUSH: 10,              // finale part 1: rope push
  VOTE: 5,               // finale part 2: coup vote
  MICRO: 5,              // caught challenge length
  MICRO_PASS_TAPS: 18,   // taps needed in 5 s
  GRACE: 0.2,            // still holding this long into "watch" = caught
  TRACK_SECONDS: 18,     // holding non-stop, the rope is this far away
  OWNER_PICK: 12,        // owner console fuse
  NAP_AT: 35,            // nobody in by now -> Gus naps
  NAP_FOR: 4,
  ENTRY_POINTS: [100, 70, 50, 40, 30, 20, 10],
  RUSH_MULT: 1.5,
  TICK_HZ: 20,
  SNAP_HZ: 15,
};

// ---------- client -> server ----------
export type ClientMsg =
  | { t: 'hello'; role: 'screen' }
  | { t: 'hello'; role: 'phone'; token: string }
  | { t: 'join'; name: string; seed: number }
  | { t: 'press' }
  | { t: 'release' }
  | { t: 'tap' }
  | { t: 'rule'; rule: 'moonwalk' }
  | { t: 'start' }
  | { t: 'reset' };

// ---------- server -> projector ----------
export interface PubPlayer {
  id: string;
  name: string;
  seed: number;
  x: number;             // 0 start .. 1 rope
  state: PlayerState;
  moving: boolean;
  caught: boolean;
  entryOrder: number;    // 0 = not in yet
  score: number;
  voted: boolean;
}

export interface Reveal {
  winnerId: string | null;
  winnerName: string | null;
  prevOwnerName: string | null; // set when the crown changed hands in the vote
  ropeSnapped: boolean;
  ranking: { id: string; name: string; score: number }[];
  awards: { label: string; name: string; value: string }[];
}

export interface Snapshot {
  t: 'snap';
  phase: RoundPhase;
  timeLeft: number;
  gus: GusPhase;
  rule: Rule;
  ruleBy: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerPickLeft: number;
  players: PubPlayer[];
  push: { crowd: number; defend: number; outside: number; lounge: number } | null;
  ropeSnapped: boolean | null;
  vote: { cast: number; needed: number; eligible: number; successorName: string | null } | null;
  reveal: Reveal | null;
}

// ---------- server -> one phone ----------
export type PhoneRole = 'join' | 'sneak' | 'caught' | 'result' | 'owner-pick' | 'lounge' | 'break' | 'defend' | 'support' | 'defending' | 'outside-vote' | 'reveal' | 'lobby';

export interface Me {
  t: 'me';
  id: string | null;
  role: PhoneRole;
  phase: RoundPhase;
  timeLeft: number;
  gus: GusPhase;
  rule: Rule;
  ruleBy: string | null;
  name: string;
  seed: number;
  x: number;
  moving: boolean;
  needFreshPress: boolean;
  microLeft: number;
  microTaps: number;
  result: { pass: boolean; line: string } | null;
  isOwner: boolean;
  ownerName: string | null;
  ownerPickLeft: number;
  pushTaps: number;
  voted: boolean;
  vote: Snapshot['vote'];
  rank: number;
  total: number;
  score: number;
  reveal: Reveal | null;
}

/** One-off moments the projector animates (fling, entry, crown change). */
export type GameEvent =
  | { t: 'ev'; kind: 'caught'; id: string; name: string }
  | { t: 'ev'; kind: 'pass'; id: string; name: string }
  | { t: 'ev'; kind: 'flung'; id: string; name: string }
  | { t: 'ev'; kind: 'entered'; id: string; name: string; order: number }
  | { t: 'ev'; kind: 'owner'; id: string; name: string }
  | { t: 'ev'; kind: 'rule'; rule: 'moonwalk'; by: string }
  | { t: 'ev'; kind: 'tell' }
  | { t: 'ev'; kind: 'turn' }
  | { t: 'ev'; kind: 'rope'; snapped: boolean };

export type ServerMsg = Snapshot | Me | GameEvent;
