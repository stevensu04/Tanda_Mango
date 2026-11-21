import { T } from '../shared/constants';
import type { Room, AiJob } from './game/room';
import { fallbackCommentary } from './ai/fallbacks';
import type { Voice } from './ai/types';

/**
 * Connects rooms to Claude. Rooms queue jobs (round script, catch roasts, finale);
 * the director runs them in the background and hands answers back. Nothing here blocks a tick.
 */
export class Director {
  private nextComment = new WeakMap<Room, { round: number; at: number }>();
  private busyComment = new WeakSet<Room>();
  private healthy = true;

  constructor(private voice: Voice, private rand: () => number = Math.random) {}

  pump(room: Room) {
    room.aiLive = this.healthy;
    const jobs = room.drainJobs();
    const roasts = jobs.filter((j): j is Extract<AiJob, { kind: 'roast' }> => j.kind === 'roast');
    if (room.settings.ai) {
      for (const j of jobs) {
        if (j.kind === 'script') void this.track(this.voice.roundScript(j.persona, j.names)).then((s) => s && room.setScript(j.round, s));
        if (j.kind === 'finale') void this.track(this.voice.finale(j.persona, j.ctx)).then((r) => r && room.setFinale(j.round, r));
      }
      // catches from the same tick share one call
      if (roasts.length) {
        const nos = new Map(roasts.map((j) => [j.ctx.playerId, j.catchNo]));
        const round = roasts[0].round;
        void this.track(this.voice.catchRoasts(roasts[0].persona, roasts.map((j) => j.ctx))).then((r) => r && room.setRoasts(round, nos, r));
      }
    }
    this.commentary(room);
  }

  private commentary(room: Room) {
    if (room.mode !== 'party' || room.phase !== 'play') return;
    let n = this.nextComment.get(room);
    if (!n || n.round !== room.round) { n = { round: room.round, at: T.COMMENTARY_EVERY }; this.nextComment.set(room, n); }
    if (room.clock < n.at || this.busyComment.has(room)) return;
    n.at = room.clock + T.COMMENTARY_EVERY;
    const state = room.raceState();
    const round = room.round;
    if (!room.settings.ai) {
      const f = fallbackCommentary(state, this.rand);
      room.sayLive(round, f.line, f.mono);
      return;
    }
    this.busyComment.add(room);
    void this.track(this.voice.commentary(room.persona(), state)).then((r) => {
      this.busyComment.delete(room);
      if (r) room.sayLive(round, r.line, r.mono, r.deltas);
      else { const f = fallbackCommentary(state, this.rand); room.sayLive(round, f.line, f.mono); }
    });
  }

  private track<X>(p: Promise<X | null>): Promise<X | null> {
    return p.then((x) => { this.healthy = x !== null; return x; }, () => { this.healthy = false; return null; });
  }
}
