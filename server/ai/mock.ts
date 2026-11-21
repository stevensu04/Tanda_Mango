import type { AiStats, Rule } from '../../shared/protocol';
import type { RaceState, RoundScript } from './fallbacks';
import type { CatchContext, CommentaryResult, FinaleContext, FinaleResult, Persona, Roast, Voice } from './types';
import { safeName } from './client';

/**
 * Deterministic stand-in for ClaudeVoice (tests / E2E). Every line starts with "(AI)" so a test
 * can tell Claude lines from scripted fallbacks.
 *   mode 'ok'   resolves after `delayMs` (default 0)
 *   mode 'down' resolves null (Claude unreachable)
 *   mode 'slow' resolves a valid result after `slowMs` (default 6000): the caller must already
 *               have fallen back by then.
 */
export type MockMode = 'ok' | 'down' | 'slow';

export interface MockVoiceOptions { mode?: MockMode; delayMs?: number; slowMs?: number }

const RULES: Rule[] = ['lights', 'glasses', 'moonwalk', 'disco'];

export class MockVoice implements Voice {
  mode: MockMode;
  delayMs: number;
  slowMs: number;
  private enabled = true;
  private s = { calls: 0, ok: 0, fallbacks: 0 };
  private lat: number[] = [];

  constructor(opts: MockVoiceOptions = {}) {
    this.mode = opts.mode ?? 'ok';
    this.delayMs = opts.delayMs ?? 0;
    this.slowMs = opts.slowMs ?? 6000;
  }

  setMode(mode: MockMode) { this.mode = mode; }
  setEnabled(on: boolean) { this.enabled = on; }

  stats(): AiStats {
    const sorted = [...this.lat].sort((a, b) => a - b);
    const p = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] : 0);
    return {
      enabled: this.enabled, keyPresent: true, model: 'mock',
      calls: this.s.calls, ok: this.s.ok, fallbacks: this.s.fallbacks,
      inTokens: 0, outTokens: 0, usd: 0,
      p50ms: p(0.5), p95ms: p(0.95),
      lastError: this.s.fallbacks ? 'mock: down' : null,
    };
  }

  roundScript(persona: Persona, playerNames: string[]): Promise<RoundScript | null> {
    const first = playerNames[0] ? safeName(playerNames[0]) : 'YOU';
    const g = safeName(persona.guard);
    return this.run(() => ({
      opener: `(AI) ${g} SAYS: DOORS OPEN. HOLD TO SNEAK. FREEZE WHEN I LOOK.`,
      taunts: [1, 2, 3, 4, 5, 6].map((i) => (i === 1 ? `(AI) I SEE YOU, ${first}.` : `(AI) TAUNT ${i}.`)),
      fakeouts: [1, 2, 3, 4].map((i) => `(AI) ...FAKEOUT ${i}.`),
      turns: [1, 2, 3].map((i) => `(AI) TURN ${i}. NOBODY MOVE.`),
      ruleLines: Object.fromEntries(RULES.map((r) => [r, `(AI) RULE ${r.toUpperCase()}.`])) as Record<Rule, string>,
      npcNames: ['AI BARRY', 'AI KEV', 'AI DAN', 'AI VAL', 'AI SOCKS', 'AI DOUG'],
    }));
  }

  catchRoasts(_persona: Persona, catches: CatchContext[]): Promise<Roast[] | null> {
    return this.run(() => catches.map((c) => {
      const n = safeName(c.name);
      const again = c.timesCaught >= 2 ? ` AGAIN (${c.timesCaught}X)` : '';
      return {
        playerId: c.playerId,
        passLine: `(AI) NICE MOVES, ${n}.`,
        failLine: c.micro === 'shake' ? `(AI) WEAK DANCE, ${n}${again}. OUT.` : `(AI) CHEAP BRIBE, ${n}${again}. OUT.`,
      };
    }));
  }

  commentary(_persona: Persona, state: RaceState): Promise<CommentaryResult | null> {
    return this.run(() => ({
      line: `(AI) ${state.outside} OUTSIDE. ${state.inLounge} IN.`,
      mono: '(AI) HMM.',
      deltas: { ego: 0.05, paranoia: 0.05, boredom: -0.05, suspicion: 0 },
    }));
  }

  finale(_persona: Persona, ctx: FinaleContext): Promise<FinaleResult | null> {
    return this.run(() => ({
      closing: ctx.winner ? `(AI) ${safeName(ctx.winner)} WINS. GO HOME.` : '(AI) NOBODY WINS. GO HOME.',
      receipts: ctx.players.map((p) => ({
        playerId: p.playerId,
        title: p.entered ? 'AI GOT IN' : 'AI STATUE',
        roast: `(AI) ${safeName(p.name)}: CAUGHT ${p.caught} TIMES.`,
        threat: p.firstIn ? 'EXTREME' as const : p.entered ? 'HIGH' as const : p.maxDistance > 0.5 ? 'MEDIUM' as const : 'LOW' as const,
      })),
    }));
  }

  private async run<T>(make: () => T): Promise<T | null> {
    if (!this.enabled) return null;
    this.s.calls++;
    if (this.mode === 'down') { this.s.fallbacks++; return null; }
    const wait = this.mode === 'slow' ? this.slowMs : this.delayMs;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.s.ok++;
    this.lat.push(wait);
    return make();
  }
}
