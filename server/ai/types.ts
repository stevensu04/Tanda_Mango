import type { Micro, Rule } from '../../shared/protocol';
import type { RaceState, RoundScript } from './fallbacks';

/**
 * What the game asks Claude for. Every method resolves within ~4 s and resolves to null on
 * any failure (no key, timeout, refusal, invalid output) so the caller keeps the scripted line.
 */

export interface Persona {
  guard: string;          // "GUS", "SLEEPY SAL", "AGENT NULL"
  venue: string;          // "CLUB VELVET", "DIVE BAR", ...
}

export interface CatchContext {
  playerId: string;
  name: string;           // untrusted, max 12 chars
  micro: Micro;           // shake = "dance for me", mash = "bribe me"
  timesCaught: number;    // including this one
  distance: number;       // 0..1 along the street
  rule: Rule | null;
}

export interface Roast { playerId: string; passLine: string; failLine: string }

export interface CommentaryResult {
  line: string;
  mono: string;
  deltas: { ego: number; paranoia: number; boredom: number; suspicion: number };
}

export interface MugshotContext {
  playerId: string;
  name: string;
  rank: number;
  total: number;
  vip: boolean;
  caught: number;
  passes: number;
  flung: number;
  entered: boolean;
  firstIn: boolean;
  maxDistance: number;    // 0..1
  lines: string[];        // what Gus said to them this round
}

export interface FinaleContext {
  winner: string | null;
  prevOwner: string | null;
  ropeSnapped: boolean;
  players: MugshotContext[];
}

export interface FinaleResult {
  closing: string;
  receipts: { playerId: string; title: string; roast: string; threat: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' }[];
}

export interface Voice {
  roundScript(persona: Persona, playerNames: string[]): Promise<RoundScript | null>;
  catchRoasts(persona: Persona, catches: CatchContext[]): Promise<Roast[] | null>;
  commentary(persona: Persona, state: RaceState): Promise<CommentaryResult | null>;
  finale(persona: Persona, ctx: FinaleContext): Promise<FinaleResult | null>;
}
