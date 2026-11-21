import type { GusParams } from '../../shared/constants';
import type { GusPhase } from '../../shared/protocol';

export type GusChange = 'tell' | 'fakeout' | 'turn' | 'back' | null;

const range = (r: [number, number], rand: () => number) => r[0] + (r[1] - r[0]) * rand();

/** The bouncer's turn cycle: BACK -> TELL -> (fake-out -> BACK) | WATCH -> BACK. */
export class Gus {
  phase: GusPhase = 'back';
  left = 3.5;
  watchT = 0;          // seconds into the current WATCH
  extraWatch = 0;      // Snitch: added to the next WATCH

  reset(left = 3.5) {
    this.phase = 'back';
    this.left = left;
    this.watchT = 0;
    this.extraWatch = 0;
  }

  nap(secs: number) {
    this.phase = 'sleep';
    this.left = secs;
  }

  /** Distract: his back stays turned a bit longer. A tell in progress is called off. */
  distract(secs: number): boolean {
    if (this.phase === 'back' || this.phase === 'sleep') { this.left += secs; return true; }
    if (this.phase === 'tell') { this.phase = 'back'; this.left = secs; return true; }
    return false;
  }

  step(dt: number, p: GusParams, rand: () => number): GusChange {
    this.left -= dt;
    if (this.phase === 'watch') this.watchT += dt;
    if (this.left > 0) return null;
    switch (this.phase) {
      case 'back':
      case 'sleep':
        this.phase = 'tell';
        this.left = range(p.tell, rand);
        return 'tell';
      case 'tell':
        if (rand() < p.fakeout) {
          this.phase = 'back';
          this.left = range(p.back, rand) * 0.6;
          return 'fakeout';
        }
        this.phase = 'watch';
        this.left = range(p.watch, rand) + this.extraWatch;
        this.extraWatch = 0;
        this.watchT = 0;
        return 'turn';
      case 'watch':
        this.phase = 'back';
        this.left = range(p.back, rand);
        return 'back';
    }
  }
}
