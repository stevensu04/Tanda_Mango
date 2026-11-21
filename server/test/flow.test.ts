import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startServer, Bot, drive, carefulMove, recklessMove, mashHard, until, sleep, type TestServer } from './net';

let server: TestServer;
const bots: Bot[] = [];
const track = <B extends Bot>(b: B): B => { bots.push(b); return b; };
const screenOf = async (room?: string) => track(await Bot.screen(server.url, room));

beforeEach(async () => { server = await startServer({ speed: 8 }); });
afterEach(async () => { for (const b of bots.splice(0)) b.terminate(); await server.close(); });

/** A room code from a fresh projector socket. */
async function newRoom() {
  const screen = await screenOf();
  await until(() => screen.code, 2000, 'room code');
  return { screen, code: screen.code! };
}
async function phoneIn(code: string, name: string) {
  const p = track(await Bot.phone(server.url, `flow-${name.toLowerCase()}`, code));
  p.join(name, 7);
  await until(() => p.me?.id, 2000, `${name} joined`);
  return p;
}

describe('rooms', () => {
  it('a bad room code gets role no-room, and the phone is not attached to anything', async () => {
    const p = track(await Bot.phone(server.url, 'lost-phone', 'ZZZZ'));
    await until(() => p.me, 2000, 'me');
    expect(p.me!.role).toBe('no-room');
    expect(p.me!.code).toBe('ZZZZ');
    expect(p.me!.id).toBeNull();
    p.join('GHOST');
    await sleep(300);
    expect(p.me!.role).toBe('no-room');
    expect(server.game.rooms.has('ZZZZ')).toBe(false);
    expect(server.game.solos.size).toBe(0);
    // junk codes too
    const q = track(await Bot.phone(server.url, 'lost-phone-2', 'ab'));
    await until(() => q.me, 2000, 'me');
    expect(q.me!.role).toBe('no-room');
  });

  it('screen creates a room; lobby lists joined phones; two rooms do not mix', async () => {
    const a = await newRoom();
    const b = await newRoom();
    expect(a.code).not.toBe(b.code);
    const pa = await phoneIn(a.code, 'AAA');
    await phoneIn(b.code, 'BBB');
    await until(() => a.screen.snap?.players.length === 1 && b.screen.snap?.players.length === 1, 2000, 'lobbies');
    expect(a.screen.snap!.players.map((p) => p.name)).toEqual(['AAA']);
    expect(b.screen.snap!.players.map((p) => p.name)).toEqual(['BBB']);
    expect(pa.me!.role).toBe('lobby');
    expect(pa.me!.code).toBe(a.code);
  });
});

describe('reconnect', () => {
  it('a phone that drops mid-round and returns with its token keeps its id, position and place in the round', async () => {
    const { screen, code } = await newRoom();
    const anna = await phoneIn(code, 'ANNA');
    await phoneIn(code, 'BEN');
    let frozen = false;
    drive(anna, { wantMove: (me) => !frozen && carefulMove(me) });
    screen.start();
    await until(() => anna.me!.role === 'sneak' && anna.me!.phase === 'play' && anna.me!.x > 0.08, 20000, 'ANNA has walked a bit');
    frozen = true;
    await until(() => !anna.me!.moving && !anna.holding, 3000, 'ANNA stops');
    await sleep(400);
    const before = anna.me!;
    const id = before.id!;
    anna.terminate();
    const room = server.game.rooms.get(code)!;
    await until(() => room.players.get(id)?.connected === false, 2000, 'server notices the drop');
    await until(() => screen.snap!.players.find((p) => p.id === id)?.connected === false, 2000, 'projector shows ANNA offline');

    anna.me = null;
    await anna.open();
    await until(() => anna.me, 2000, 'me after reconnect');
    expect(anna.me!.id).toBe(id);
    expect(anna.me!.x).toBeCloseTo(before.x, 6);
    expect(anna.me!.phase).toBe('play');
    expect(anna.me!.role).toBe('sneak');
    expect(anna.me!.name).toBe('ANNA');
    expect(room.players.get(id)!.connected).toBe(true);
    // still in the round: she can keep walking
    frozen = false;
    await until(() => anna.me!.x > before.x + 0.02, 15000, 'ANNA walks on after reconnecting');
    expect(room.players.size).toBeGreaterThanOrEqual(2);
  }, 40000);
});

describe('rounds', () => {
  it('a second round from the reveal works and resets scores', async () => {
    const { screen, code } = await newRoom();
    const admin = track(await Bot.admin(server.url, code));
    admin.settings({ roundSecs: 90 });
    const dave = await phoneIn(code, 'DAVE');
    // reckless and never taps: caught, flung, -10 each time
    drive(dave, { wantMove: recklessMove });
    const ben = await phoneIn(code, 'BEN');
    void ben;
    await until(() => admin.admin?.room?.settings.roundSecs === 90, 2000, 'admin settings applied');
    screen.start();
    await until(() => screen.snap?.phase === 'reveal', 30000, 'first reveal');
    await sleep(200);
    expect(screen.snap!.roundSecs).toBe(90);
    expect(screen.eventsOf('flung').length).toBeGreaterThan(0);
    // (with nobody defending, the rope snaps and DAVE rushes in, so his score need not be negative)
    expect(dave.me!.score).not.toBe(0);
    expect(dave.me!.mugshot).toBeTruthy();
    const r1 = screen.snap!.reveal!;
    expect(r1.ranking.find((r) => r.name === 'DAVE')!.score).toBe(dave.me!.score);

    screen.start();
    await until(() => screen.snap?.phase === 'play', 2000, 'second round');
    await sleep(150);
    expect(screen.snap!.timeLeft).toBeGreaterThan(80);
    expect(screen.snap!.reveal).toBeNull();
    expect(screen.snap!.ropeSnapped).toBeNull();
    expect(screen.snap!.players.filter((p) => !p.npc).every((p) => p.entryOrder === 0)).toBe(true);
    expect(dave.me!.mugshot).toBeNull();
    expect(dave.me!.reveal).toBeNull();
    expect(dave.me!.phase).toBe('play');
    expect(Math.abs(dave.me!.score)).toBeLessThanOrEqual(10);   // reset, then at most the new round's first fling
    await until(() => screen.snap?.phase === 'reveal', 30000, 'second reveal');
    expect(screen.snap!.reveal).toBeTruthy();
    expect(dave.me!.mugshot).toBeTruthy();
    // and `reset` returns everyone to the lobby with zeroed scores
    screen.reset();
    await until(() => screen.snap?.phase === 'lobby', 2000, 'lobby');
    await until(() => dave.me?.role === 'lobby', 2000, 'phone in lobby');
    expect(dave.me!.score).toBe(0);
  }, 60000);

  it('one human + NPCs: NPCs fill the street (npc: true) and are never ranked', async () => {
    const { screen, code } = await newRoom();
    const admin = track(await Bot.admin(server.url, code));
    admin.settings({ roundSecs: 90 });
    const solo = await phoneIn(code, 'LONELY');
    await until(() => admin.admin?.room?.settings.roundSecs === 90, 2000, 'settings');
    expect(screen.snap!.players.filter((p) => p.npc).length).toBe(0);   // none in the lobby
    screen.start();
    await until(() => screen.snap?.phase === 'play', 2000, 'play');
    await until(() => (screen.snap?.players.filter((p) => p.npc).length ?? 0) >= 3, 2000, 'NPCs on the street');
    const npcs = screen.snap!.players.filter((p) => p.npc);
    expect(npcs.length).toBe(3);                                         // NPC_MIN 4 - 1 human
    expect(screen.snap!.players.filter((p) => !p.npc).length).toBe(1);
    expect(npcs.every((p) => p.name.length > 0 && p.connected)).toBe(true);
    // NPCs actually move
    await until(() => screen.snap!.players.some((p) => p.npc && p.x > 0.05), 15000, 'an NPC walks');
    expect(screen.snap!.players.filter((p) => p.npc).every((p) => p.x <= 0.9 && p.entryOrder === 0)).toBe(true);
    await until(() => screen.snap?.phase === 'reveal', 30000, 'reveal');
    await sleep(200);
    const rev = screen.snap!.reveal!;
    expect(rev.ranking.length).toBe(1);
    expect(rev.ranking[0].name).toBe('LONELY');
    const npcIds = new Set(screen.snap!.players.filter((p) => p.npc).map((p) => p.id));
    expect(npcIds.size).toBe(3);
    expect(rev.ranking.some((r) => npcIds.has(r.id))).toBe(false);
    expect(rev.awards.every((a) => a.name === 'LONELY')).toBe(true);
    expect(solo.me!.total).toBe(1);
    expect(solo.me!.mugshot).toBeTruthy();
    expect(solo.me!.rank).toBe(1);
  }, 60000);
});

describe('admin', () => {
  it('kick removes a player from the room, the projector and the admin view', async () => {
    const { screen, code } = await newRoom();
    const admin = track(await Bot.admin(server.url, code));
    const anna = await phoneIn(code, 'ANNA');
    const ben = await phoneIn(code, 'BEN');
    await phoneIn(code, 'CLEO');
    await until(() => screen.snap?.players.length === 3 && admin.admin?.room?.players.length === 3, 3000, 'three players');
    expect(admin.admin!.rooms.find((r) => r.code === code)).toMatchObject({ humans: 3, screens: 1 });
    admin.kick(ben.me!.id!);
    await until(() => screen.snap!.players.length === 2 && admin.admin!.room!.players.length === 2, 3000, 'BEN gone');
    expect(screen.snap!.players.map((p) => p.name).sort()).toEqual(['ANNA', 'CLEO']);
    await until(() => ben.me!.role === 'join', 2000, 'BEN is told');
    expect(ben.me!.id).toBeNull();
    expect(anna.me!.role).toBe('lobby');
    expect(anna.me!.total).toBe(2);
    // BEN can rejoin afresh
    ben.join('BEN', 7);
    await until(() => ben.me!.id, 2000, 'BEN rejoined');
    await until(() => screen.snap!.players.length === 3, 2000, 'BEN back on the projector');
  });

  it('a phone cannot start the round or kick anyone', async () => {
    const { screen, code } = await newRoom();
    const anna = await phoneIn(code, 'ANNA');
    const ben = await phoneIn(code, 'BEN');
    anna.start();
    anna.kick(ben.me!.id!);
    anna.settings({ ai: false });
    await sleep(400);
    expect(screen.snap!.phase).toBe('lobby');
    expect(screen.snap!.players.length).toBe(2);
    expect(server.game.rooms.get(code)!.settings.ai).toBe(true);
  });
});

describe('solo gauntlet', () => {
  /** Holds while Gus's back is turned, releases otherwise, mashes when caught. */
  async function soloBot(token: string, name: string) {
    const b = track(await Bot.phone(server.url, token));
    drive(b, { wantMove: carefulMove, onCaught: mashHard });
    b.join(name, 3);
    await until(() => b.me?.role === 'solo-menu', 2000, 'solo menu');
    return b;
  }

  it('a phone with no room gets its own run and can clear all three levels', async () => {
    const s = track(await Bot.screen(server.url));            // an unrelated projector does not matter
    void s;
    const b = await soloBot('solo-1', 'LONE WOLF');
    expect(b.me!.code).toBeNull();
    expect(b.me!.solo!.levels.length).toBe(3);
    expect(b.me!.solo!.unlocked).toBe(0);
    expect(server.game.solos.size).toBe(1);
    b.solo(0);
    await until(() => b.me!.role !== 'solo-menu', 2000, 'level 1 starts');
    await until(() => b.me!.role === 'solo-done', 80000, 'gauntlet beaten');
    expect(b.roles.has('solo-clear')).toBe(true);
    expect(b.me!.solo!.beaten).toBe(true);
    expect(b.me!.solo!.levels.map((l) => l.cleared)).toEqual([true, true, true]);
    expect(b.me!.mugshot).toBeTruthy();
    expect(b.me!.mugshot!.rankLine).toBe('BOUNCER BEATEN');
    expect(b.me!.mugshot!.name).toBe('LONE WOLF');
    expect(b.me!.solo!.time).toBeGreaterThan(20);
  }, 90000);

  it('two solo phones do not share state', async () => {
    const a = await soloBot('solo-a', 'AAA');
    const b = track(await Bot.phone(server.url, 'solo-b'));
    b.join('BBB', 4);                                           // never presses anything
    await until(() => b.me?.role === 'solo-menu', 2000, 'B in menu');
    expect(server.game.solos.size).toBe(2);
    a.solo(0);
    await until(() => a.me!.x > 0.15, 30000, 'A walks');
    expect(a.me!.role === 'sneak' || a.me!.role === 'caught' || a.me!.role === 'result').toBe(true);
    expect(b.me!.role).toBe('solo-menu');
    expect(b.me!.x).toBe(0);
    expect(b.me!.name).toBe('BBB');
    expect(a.me!.name).toBe('AAA');
    b.solo(0);
    await until(() => b.me!.role === 'sneak', 2000, 'B starts its own run');
    const ax = a.me!.x;
    expect(b.me!.x).toBeLessThan(ax + 0.001);
    expect(b.me!.solo!.catches).toBe(0);
    // B idles: A's progress never moves B
    await sleep(800);
    expect(b.me!.x).toBe(0);
    // the solo room never leaks into party rooms
    expect(server.game.rooms.size).toBe(0);
    expect(a.me!.t).toBe('me');
  }, 60000);

  it('a solo phone cannot jump to a locked level', async () => {
    const b = track(await Bot.phone(server.url, 'solo-lock'));
    b.join('LOCK', 1);
    await until(() => b.me?.role === 'solo-menu', 2000, 'menu');
    b.solo(2);
    await sleep(300);
    expect(b.me!.role).toBe('solo-menu');
    expect(b.me!.solo!.unlocked).toBe(0);
  });
});
