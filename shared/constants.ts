/**
 * Every gameplay tunable lives here. Times are seconds, distances are 0..1 of the street
 * (0 = start line, 1 = the rope). The admin difficulty slider scales the Gus timings at runtime.
 */

export const T = {
  ROUND: 120,              // default round length (admin can pick 90)
  ROUND_CHOICES: [90, 120],
  PUSH: 10,                // finale part 1: rope push
  VOTE: 5,                 // finale part 2: coup vote
  VOTE_LIFT: 0.4,          // taps this soon after the rush are leftovers, not votes

  TICK_HZ: 20,
  SNAP_HZ: 15,

  TRACK_SECONDS: 18,       // holding non-stop, the rope is this far away
  GRACE: 0.2,              // still moving this long into "watch" = caught
  MAX_LATENCY: 0.25,       // extra grace for slow phones (half the measured round trip, capped)

  MICRO: 5,                // caught challenge length
  MICRO_MIN: 3,            // a passed challenge can end early, but never before this
  MICRO_PASS_TAPS: 18,     // Mash: taps needed in 5 s
  SHAKE_PASS: 22,          // Shake: summed energy needed (phone sends 0..1 every 100 ms)
  SHAKE_MAX_RATE: 14,      // shake samples per second we accept
  MICRO_SHAKE_SHARE: 0.6,  // with motion sensors, this share of catches are Shake
  PASS_BONUS: 0.04,        // passing a challenge: a small step forward
  RESULT_SHOW: 2.5,        // result card on the phone

  OWNER_PICK: 12,          // owner console fuse
  NAP_AT: 35,              // nobody in by now -> Gus naps
  NAP_FOR: 4,
  SLEEPY_UNTIL: 25,        // sleepy Gus before this, sharp after

  ENTRY_POINTS: [100, 70, 50, 40, 30, 20, 10],
  PASS_POINTS: 10,
  FLING_POINTS: -10,
  RUSH_MULT: 1.5,

  NERD_TAPS: 20,           // more taps than this in one second = NICE TRY, NERD
  NERD_FOR: 5,

  BEAM_HALF: 0.12,         // Lights Out: half-width of the flashlight on the street
  BEAM_SPEED: 0.9,

  NPC_MIN: 4,              // fewer humans than this: NPCs fill the street
  NPC_MAX_X: 0.9,          // NPCs never get in

  COMMENTARY_EVERY: 10,

  POWER_COOLDOWN: { banana: 8, distract: 10, snitch: 10 } as Record<string, number>,
  BANANA_SLIP: 0.1,
  DISTRACT_FOR: 1,
  SNITCH_EXTRA: 1,
};

/** Gus's cycle timings: [min, max] seconds. */
export interface GusParams {
  back: [number, number];
  tell: [number, number];
  watch: [number, number];
  fakeout: number;          // chance a tell is a fake-out
}

export const GUS_SLEEPY: GusParams = { back: [3, 4.5], tell: [0.8, 0.8], watch: [1.4, 1.4], fakeout: 0 };
export const GUS_SHARP: GusParams = { back: [1.5, 4], tell: [0.55, 0.55], watch: [1.4, 2.5], fakeout: 0.25 };

/** Solo gauntlet: three doors, each with its own guard. */
export const SOLO_LEVELS = [
  { name: 'DIVE BAR', guard: 'SLEEPY SAL', note: 'HE IS MOSTLY ASLEEP', track: 12, gus: { back: [3.5, 5], tell: [1, 1], watch: [1.2, 1.2], fakeout: 0 } as GusParams, lights: false },
  { name: 'ROOFTOP', guard: 'GUS', note: 'FAKE-OUTS. WATCH THE HEAD', track: 14, gus: { back: [1.6, 3.4], tell: [0.6, 0.6], watch: [1.4, 2.2], fakeout: 0.3 } as GusParams, lights: false },
  { name: 'AREA 51', guard: 'AGENT NULL', note: 'SEARCHLIGHT. NO MERCY', track: 16, gus: { back: [1.2, 2.8], tell: [0.45, 0.45], watch: [1.6, 2.4], fakeout: 0.4 } as GusParams, lights: true },
];
