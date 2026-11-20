import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../game.js';
import { decodePlayer } from '../../web/js/net-protocol.js';

function setup(opts = {}) {
  let now = 1_000_000;
  const sent = [];
  const out = {
    room: (id, msg) => sent.push({ to: `room:${id}`, msg }),
    player: (id, msg) => sent.push({ to: `player:${id}`, msg }),
    all: (msg) => sent.push({ to: 'all', msg }),
  };
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const game = new Game(out, { now: () => now, rand, lobbyMs: 1000, resultsMs: 1000, ...opts });
  const run = (ms) => {
    for (let t = 0; t < ms; t += 50) {
      now += 50;
      game.step();
    }
  };
  const seat = (id) => game.seats.get(id);
  return { game, sent, run, seat, clock: () => now };
}

/** Join and connect a player, then run into the round. */
function playing(opts) {
  const s = setup(opts);
  const id = s.game.join(0, 'fox');
  s.game.welcome(id);
  s.run(1000 + 3000 + 100); // lobby + countdown
  assert.equal(s.game.phase, 'play');
  return { ...s, id };
}

test('players pick a gallery; ghosts top it up to 12; real players come first', () => {
  const { game } = setup();
  const a = game.join(0, 'fox');
  const b = game.join(0, 'bear');
  const c = game.join(2, 'rabbit');
  assert.equal(game.instanceOf(a), game.instanceOf(b));
  assert.notEqual(game.instanceOf(a), game.instanceOf(c));
  const room = game.instances[0].room;
  assert.equal(room.players.length, 12);
  assert.deepEqual(room.players.slice(0, 2).map((p) => p.id), [a, b]);
  assert.ok(room.players.slice(2).every((p) => p.bot));
});

test('a full gallery opens an overflow copy with the same cabinet rules', () => {
  const { game } = setup({ roomMax: 3 });
  for (let i = 0; i < 3; i++) game.join(3, 'fox');
  const extra = game.join(3, 'fox');
  const inst = game.instances.find((i) => i.id === game.instanceOf(extra));
  assert.equal(inst.design, 3);
  assert.equal(inst.name, 'The Sculpture Court · B');
  assert.equal(inst.room.id, 3); // Wesley's rules key cabinet entrances off room.id
});

test('auto mode: lobby waits for someone, then countdown → play → results after 45 s → lobby', () => {
  const { game, run } = setup();
  run(3000);
  assert.equal(game.phase, 'lobby');
  game.welcome(game.join(1, 'fox'));
  run(1100);
  assert.equal(game.phase, 'countdown');
  run(3000);
  assert.equal(game.phase, 'play');
  run(45_100);
  assert.equal(game.phase, 'results');
  run(1100);
  assert.equal(game.phase, 'lobby');
});

test('auto mode: a judge alone on the guard page also starts rounds', () => {
  const { game, run } = setup();
  run(3000);
  assert.equal(game.phase, 'lobby');
  game.guardConnected();
  run(1100);
  assert.equal(game.phase, 'countdown');
});

test('manual mode waits for the admin', () => {
  const { game, run } = setup({ mode: 'manual' });
  game.welcome(game.join(0, 'fox'));
  run(20_000);
  assert.equal(game.phase, 'lobby');
  game.admin({ t: 'start' });
  assert.equal(game.phase, 'countdown');
});

test('holding RUN without keep-alives stops after 0.75 s', () => {
  const { game, run, seat, id } = playing();
  game.input(id, 1);
  run(500);
  assert.equal(seat(id).p.dir, 1);
  run(400);
  assert.equal(seat(id).p.dir, 0);
});

test('keep-alives keep you running and passing a frame saves', () => {
  const { game, run, seat, id } = playing();
  game.input(id, 1);
  for (let i = 0; i < 8; i++) {
    run(200);
    game.hold(id);
  }
  assert.ok(seat(id).p.x > 1.2);
  assert.equal(seat(id).p.saved, 1);
});

test('the human guard catches with a held beam and a clear line of sight; catches are counted', () => {
  const { game, run, seat, id } = playing();
  game.guardConnected();
  const p = seat(id).p;
  p.x = 2.2; // in the lit floor between frames 1 and 4 (not safe)
  p.saved = 1;
  const target = { x: p.x * 3.2, y: 1.1, z: 0.65 };
  const origin = { x: target.x - 6, y: 1.6, z: 0.65 };
  const len = Math.hypot(6, -0.5, 0);
  const beam = { origin, direction: { x: 6 / len, y: -0.5 / len, z: 0 }, exposing: true };
  for (let i = 0; i < 30 && p.caught === 0; i++) {
    game.beam(beam);
    run(50);
  }
  assert.equal(p.caught, 1);
  assert.equal(p.x, 1); // back to the saved frame
  assert.equal(game.guard.catches, 1);
});

test('a beam that jumps faster than walking speed is clamped', () => {
  const { game } = playing();
  game.guardConnected();
  const dir = { x: 1, y: 0, z: 0 };
  game.beam({ origin: { x: 5, y: 1.6, z: 0.5 }, direction: dir, exposing: false });
  game.beam({ origin: { x: 40, y: 1.6, z: 0.5 }, direction: dir, exposing: false });
  assert.ok(game.guard.pos.x < 7, `clamped to ${game.guard.pos.x}`);
});

test('cover works through the server for a specific player', () => {
  const { game, seat, id } = playing();
  seat(id).p.x = 2.65; // next to the first cabinet (route 2.7)
  game.cover(id);
  assert.equal(seat(id).p.coverId, 0);
});

test('results name only real players', () => {
  const { sent, run } = playing();
  run(46_000);
  const results = sent.filter((s) => s.msg.t === 'result').map((s) => s.msg);
  assert.equal(results.length, 4);
  for (const r of results) for (const id of r.podium) assert.ok(!id.includes('-b'), `bot ${id} on a podium`);
});

test('reconnect: a known id is welcomed back into the same gallery', () => {
  const { game, sent, id } = playing();
  game.disconnect(id);
  sent.length = 0;
  game.welcome(id);
  const w = sent.find((s) => s.msg.t === 'welcome');
  assert.equal(w.msg.room, game.instanceOf(id));
});

test('snapshots round-trip through the shared wire format', () => {
  const { game, sent, run, seat, id } = playing();
  game.input(id, 1);
  run(300);
  const snap = sent.filter((s) => s.msg.t === 'snap' && s.msg.room === game.instanceOf(id)).at(-1).msg;
  const decoded = decodePlayer(snap.p[0], {});
  assert.ok(Math.abs(decoded._tx - seat(id).p.x) < 0.06);
  assert.equal(decoded.escapedAt, null);
});
