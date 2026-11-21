# Protocol

The TypeScript source of truth is [`shared/protocol.ts`](../shared/protocol.ts); tunables live in [`shared/constants.ts`](../shared/constants.ts). This page explains how the pieces fit.

## Transport

One WebSocket per client on `/ws` (same origin as the pages), JSON messages, max 4 KB per client message. The server is authoritative and ticks at **20 Hz**. Clients send only intents.

> The plan named Socket.IO. The linked Phase 1 build already used plain `ws` on Vite's HTTP server, the reconnect logic is ~20 lines, and Socket.IO's extras (rooms, acks, long-polling) were not needed. Kept `ws`.

| Client | Hello | Then receives |
| --- | --- | --- |
| Projector `/screen.html?room=ABCD` | `{t:'hello', role:'screen', room?}` | `{t:'room', code}`, then `snap` at 15 Hz and every `ev` |
| Phone `/play.html?room=ABCD` | `{t:'hello', role:'phone', token, room, motion?}` | `me` at 15 Hz, `ping` every 2 s |
| Phone `/play.html` (no room) | `{t:'hello', role:'phone', token}` | its own **solo gauntlet** run |
| Host `/admin.html?room=ABCD` | `{t:'hello', role:'admin', room?}` | `admin` state at 2 Hz |

- A projector with no code gets a new 4-letter code. A projector that reconnects with a code re-opens that room (or re-creates it with the same code after a server restart).
- Phones keep a token in `localStorage`. Reconnecting with the same token keeps the player's id, name, avatar and position.
- A phone with an unknown room code gets `me.role = 'no-room'`.
- Every reconnect re-sends `hello` (see `web/src/net.ts`).

## Phone intents

`join {name, seed}` · `caps {motion}` · `press` / `release` (hold to sneak) · `tap` (Mash, rope push; during the vote a tap counts as CROWN) · `vote {choice: 'crown'|'keep'}` (one per player, final; ignored for the first 0.4 s of the vote) · `shake {e}` (0..1 energy per ~100 ms, max 14/s) · `rule {rule}` (owner) · `power {power}` (lounge) · `pong {n}` · `solo {op:'start', level}` / `solo {op:'menu'}`.

Projector and host: `start`, `reset`. Host only: `kick {id}`, `settings {roundSecs?, difficulty?, npcs?, ai?}`.

## Round flow (party)

```
lobby ─start─► play (Gus: back → tell → [fake-out] → watch → back …)
                │ caught → 5 s challenge (Mash or Shake) → pass: keep spot +step | fail: flung to start
                │ first through the rope = owner → picks 1 of 3 rules in 12 s (auto-pick on timeout)
                │ nobody in by 35 s → Gus naps 4 s
                │ everyone connected is in → skip the rope: vote opens at once for 5 s ("EVERYONE'S IN")
                ▼ roundSecs − 15
              push (10 s: outside taps to break the rope, lounge taps to hold it)
                ▼ roundSecs − 5
              vote (5 s: lounge members except the owner pick CROWN or KEEP; strict majority of
                    those eligible; the earliest-entered CROWN voter takes the crown)
                ▼ roundSecs
              reveal (one VIP, ranking crown-first, awards, mugshots) ─start─► play / ─reset─► lobby
```

The phone's `role` field is all a phone needs to pick its screen. `server/game/room.ts` → `role()` is the mapping.

## Fairness

- You are caught only if you are still moving more than `GRACE` (200 ms) plus your latency into a look. Latency is half the measured ping round trip, smoothed and capped at 250 ms.
- After any challenge the old hold is ignored until a fresh press (`needFreshPress`).
- More than 20 taps in one second triggers **NICE TRY, NERD**: 5 s with input ignored.

## Claude

Rooms queue jobs (`script` at round start, `roast` per catch, `finale` at the buzzer); `server/director.ts` runs them in the background and hands answers back with the round number, so late answers from an old round are dropped. Commentary is requested every 10 s of play. Every line has a scripted fallback in `server/ai/fallbacks.ts`, so the game never waits. See [AI.md](./AI.md).
