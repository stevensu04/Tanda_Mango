# Backend — live multiplayer

The game server runs **Wesley's rules from `web/js` unchanged** (`tick`, cover, beam exposure, venue collision and line of sight) and adds what a live room needs: many real players per gallery, ghost top-up, one shared round clock, the roaming human guard, reconnects, and deciding what goes to whom. The client never decides a catch.

## Run it

```sh
npm ci && npm run build          # Wesley's frontend → dist/ (also copies three.js into web/vendor)
cd server && npm ci && npm start # http://localhost:3000
```

| Open | What |
|---|---|
| `http://localhost:3000` | Wesley's game, now live (the lobby and modes are unchanged) |
| `…/?key=guard` then **Play as the night guard** | The human guard. Without a valid key the guard button falls back to the local rehearsal |
| **Projection** from the lobby | The monitor, live |
| `…/admin?key=admin` | Start round / back to lobby / manual vs auto, live numbers |
| `/healthz`, `/stats` | Health and live numbers (JSON) |

Phones on the same Wi-Fi: `http://<this machine's LAN IP>:3000`. After changing anything in `web/`, run `npm run build` again (the server serves `dist/`). After changing rules in `web/js/*.js`, restart the server too: it imports those same files.

`scripts/serve.mjs` (port 5186) still works and still runs the local rehearsal, because it has no game server; add `?offline` to force local mode anywhere.

| Env | Default | |
|---|---|---|
| `PORT` | 3000 | |
| `GUARD_KEY` / `ADMIN_KEY` | `guard` / `admin` | **Change when deployed** |
| `MODE` | `auto` | `auto`: a round starts 10 s after someone joins and loops. `manual`: the lobby waits for Start on `/admin` (use for the live demo) |
| `ROOM_MAX` | 25 | Real players per gallery before an overflow copy ("The Renaissance Room · B") opens |

## Files

| File | Owner | What |
|---|---|---|
| `server/game.js` | backend | Galleries, joins, ghost top-up, lifecycle (lobby → countdown → play → results), per-player input and keep-alive, cover, guard beam validation, snapshots |
| `server/index.js` | backend | Socket.IO, keys, serves `dist/`, `/admin`, `/healthz`, `/stats` |
| `web/js/net-protocol.js` | backend | Message list and compact snapshot encoding, imported by both server and browser |
| `web/js/net-transport.js` | backend | `NetworkTransport`: drop-in for `RehearsalTransport` (same methods, same room render state) |
| `web/js/app.js` | Wesley | **Two small edits**: `createTransport(...)` instead of `new RehearsalTransport(...)`, and a `roster` listener that re-runs `route()` and `syncActors()` when the gallery's players change |

## How the guard works live

The guard's browser sends its beam (`origin`, `direction`, `exposing`) about 15×/s. The server accepts the origin only if it moved no faster than walking speed (plus lens jitter) and sits inside the venue, normalises the direction, and runs Wesley's `updateExposure` with its own line-of-sight test. Catches by the human guard are counted for the Hall of Fame line. Galleries without the human guard use Wesley's automatic patrol.

## Checked (21 Nov, local)

- `npm test` at the repo root: **33 pass** (Wesley's 21 + 12 server tests: galleries and overflow, lifecycle, manual mode, keep-alive, saving, beam catch with line of sight, beam speed clamp, cover, podiums without ghosts, reconnect, wire format).
- Load test, 200 real Socket.IO players for 70 s: **0 drops, 0 errors**, snapshots every ~102 ms (max 169 ms), 8 galleries of 25. About **2 MB/s total to all phones (~10 KB/s per phone)**: test this on the venue Wi-Fi.
- In the browser: Wesley's lobby → Renaissance Room live, reconnect after reload, running with the keyboard, no console errors.
- **Human guard, live** (`?key=guard`, drag controls, Space to expose): the server drains the battery from the guard's beam, CONTACT rose 13 → 83 %, the server recorded 2 catches by the guard and the guard HUD showed "2 CAUGHT". Guard tab reconnects by itself after a server restart. A judge alone on the guard page now starts the auto loop (before, rounds waited for a player).
- **Projection monitor, live**: all 4 galleries on the shared clock; escapes and catches match `/stats` exactly; switching the monitored gallery works; no console errors.
- Not yet checked: real phones on Wi-Fi, native pointer lock on the guard, Docker build (Docker Hub timed out locally).

## For Wesley — small frontend follow-ups

1. **Other real people show as ghosts on a player's screen.** In player mode only *you* have `bot:false` (so the existing `players.find(p => !p.bot)` still finds you); everyone else is `bot:true` with `human:true|false`. Style `human:true` players as solid characters when you have a moment.
2. **Results screen**: use `room.podium` (player ids from the server) instead of `rankHumans(room.players)`; your rank is `room.rank` / `room.of`.
3. **Waiting for the round**: `room.phase` is `lobby | countdown | play | results` and `room.startsIn` counts down in seconds. Inputs are ignored outside `play`, so a "Round starts in 7" overlay would help.
4. **"LOCAL REHEARSAL" label**: show LIVE when `transport.live` is true.
5. **Overflow galleries** ("· B") aren't in the 4-room monitor. Either raise `ROOM_MAX` (200 people ÷ 4 = 50 per gallery) or show them.
6. `transport.addEventListener('offline', …)` fires if the guard key is rejected and the page drops to the local rehearsal.
7. **After every round, everyone (players, guard, projector) lands on the results screen and must press Play again** to be in the next round; the guard must also take control again. For the live demo, consider going back to play automatically when `room.phase` turns `lobby`/`countdown` after results.

## Deploy

The root `Dockerfile` installs both, builds the frontend and runs `node server/index.js` on port 8080. Needs: always on (no sleeping free tier), WebSockets, **exactly one instance**.
- **Railway**: deploy from the GitHub repo (it finds the Dockerfile), set `GUARD_KEY`, `ADMIN_KEY`, `MODE=manual`, generate a domain.
- **Fly.io**: `fly launch` (internal port 8080), `auto_stop_machines = "off"`, `min_machines_running = 1`, `fly scale count 1`, `fly secrets set GUARD_KEY=… ADMIN_KEY=…`, `fly deploy`.

Then: `cd server && npm run loadtest -- https://your-domain 200 90`, and again on the venue Wi-Fi.
