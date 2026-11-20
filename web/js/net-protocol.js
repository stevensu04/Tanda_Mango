// Wire format shared by the game server (server/) and the browser adapter (net-transport.js).
// Socket.IO, one event (MSG) in both directions, every message is an object with a `t` field.
//
// Client → server
//   player : hello {playerId?} · join {room: 0-3, character} · input {dir: -1|0|1} · hold · cover
//   guard  : watch {room: 0-3} · beam {origin, direction, exposing}   (≈15 Hz while playing)
//   admin  : start · reset · mode {mode: 'auto'|'manual'}
// Server → client
//   welcome {you:{id,character}, room, design, name}           player only
//   rooms   {rooms:[{id, design, name}]}                         every gallery instance
//   roster  {room, design, players:[{id, character, bot}]}        order = snapshot order
//   snap    {room, now, phase, endsAt, rt, ch, rc, ca, li, en, p:[tuple], ev:[events]}   10 Hz
//   me      {rank, of}                                            player only, 4 Hz
//   guard   {room, design, catches}                               where the human guard is
//   result  {room, podium:[ids]}                                  when a round ends
//   error   {reason}

export const MSG = 'm';
export const PROTOCOL_VERSION = 1;
export const TICK_HZ = 20;
export const SNAP_HZ = 10;
export const BEAM_HZ = 15;
export const HOLD_TIMEOUT = 0.75; // seconds without `hold` before a held button counts as released

const HIDDEN = 1;
const ESCAPED = 2;
const COVER_TARGET = 4;
const r100 = (v) => Math.round((v ?? 0) * 100);

/** Player → compact array (≈ 30 bytes of JSON). */
export function encodePlayer(p) {
  return [
    r100(p.x),
    p.dir || 0,
    (p.hidden ? HIDDEN : 0) | (p.escapedAt !== null && p.escapedAt !== undefined ? ESCAPED : 0) | (p.coverTarget ? COVER_TARGET : 0),
    r100(p.saved),
    p.caught || 0,
    p.coverId === undefined ? -1 : p.coverId,
    r100(p.coverProgress),
    p.coverSide || 0,
    r100(p.coverEntryX),
    r100(p.exposure),
    r100(p.freeze),
    p.escapedAt === null || p.escapedAt === undefined ? -1 : r100(p.escapedAt),
  ];
}

/** Compact array → the same fields the scene reads, written onto `into`. Positions go to `_tx` / `_tc` for smoothing. */
export function decodePlayer(a, into) {
  into._tx = a[0] / 100;
  into.dir = a[1];
  into.hidden = !!(a[2] & HIDDEN);
  into.coverTarget = a[2] & COVER_TARGET ? 1 : 0;
  into.saved = a[3] / 100;
  into.caught = a[4];
  if (a[5] < 0) {
    delete into.coverId;
    into.coverProgress = 0;
    into._tc = 0;
  } else {
    if (into.coverId !== a[5]) into.coverProgress = a[6] / 100;
    into.coverId = a[5];
    into._tc = a[6] / 100;
  }
  into.coverSide = a[7];
  into.coverEntryX = a[8] / 100;
  into.exposure = a[9] / 100;
  into.freeze = a[10] / 100;
  into.escapedAt = a[11] < 0 ? null : a[11] / 100;
  return into;
}

export function encodeLight(l) {
  return l ? [l.beam ? 1 : 0, r100(l.age), l.gap, l.judged ? 1 : 0] : 0;
}

export function decodeLight(a) {
  return a ? { beam: !!a[0], age: a[1] / 100, gap: a[2], judged: !!a[3] } : null;
}
