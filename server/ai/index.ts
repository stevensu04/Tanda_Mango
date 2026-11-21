import type { AiStats } from '../../shared/protocol';
import { ClaudeVoice } from './client';
import { MockVoice } from './mock';
import type { Voice } from './types';

export type VoiceWithStats = Voice & { stats(): AiStats; setEnabled(on: boolean): void };

/**
 * BOUNCER_AI=mock -> MockVoice (deterministic "(AI) ..." lines, no network)
 * BOUNCER_AI=off  -> ClaudeVoice, disabled (scripted lines only; admin can re-enable)
 * otherwise       -> ClaudeVoice (null on every call if ANTHROPIC_API_KEY is missing)
 */
export function createVoice(): VoiceWithStats {
  const mode = process.env.BOUNCER_AI;
  if (mode === 'mock') return new MockVoice();
  const v = new ClaudeVoice();
  if (mode === 'off') v.setEnabled(false);
  return v;
}

export { ClaudeVoice, MockVoice };
export type { Voice };
