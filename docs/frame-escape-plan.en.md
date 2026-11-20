# FRAME / ESCAPE | Hackathon Game Plan

> Theme: Brought to Life | Version: v3 (Fri 2026-11-20, late night) | All numbers are starting values, to be tuned through playtesting.
>
> v3 = v2 plus the plan review ([PLAN_REVIEW.en.md](PLAN_REVIEW.en.md)). Task split: [TASKS.en.md](TASKS.en.md). Original Chinese v2: [frame-escape-plan.md](frame-escape-plan.md).

## What changed

**v1 → v2**: split players into galleries, top 3 per gallery, guard uses charges, the light covers a whole segment of floor, 1 s freeze when caught, 0.15 s judging grace, round shortened to 45 s, three parallel corridors replaced by one corridor per gallery, one bot guard per gallery plus a roaming human guard.

**v2 → v3** (from the plan review; to confirm as a team):

- The guard is **scored by catches** instead of winning or losing a gallery (the v2 win condition was practically unreachable).
- Long segments lengthened from **2.5 to 3.0**, so crossing one is a real gamble.
- Progress **saves automatically whenever you pass a frame** (v2 only saved when you stopped — an unwritten rule).
- **Snapping** into frames, **client-side prediction** for your own character, keep-alive stop relaxed to **750 ms**.
- **Round lifecycle** defined: admin starts rounds for the demo, auto-loop otherwise.
- **Bots excluded** from rankings and the Hall of Fame.
- Reconnect, a seating-area fallback, key-protected guard and admin pages.
- Simulation targets revised; timeline, cut list and team split added.

## One-liner

You're a painting in an art museum that has come to life. You have 45 seconds to slip out of your frame, dodge the guard's searchlight and escape before the doors close. Around 200 people play at once on their own phones, split into about ten galleries; each gallery races for the top 3, and the top 3 portraits end up in the Hall of Fame on the big screen.

For the audience: **"Red Light, Green Light in an art museum."** Everyone's played it; no rules to teach.

## 1. Competition requirements (from the organisers' slides)

- **"Brought to Life" criteria**: judges open it from a link on their own phones; a multiplayer game / tool / toy the crowd can play together; works end to end. Slides, screenshots, recordings, forms that save to who-knows-where, or anything only our team can run don't count.
- **Judging**: creativity and imagination, completeness and polish, interactivity, technical ingenuity (solving a hard problem cleverly, not complexity for its own sake), live presentation (getting the room hyped).
- **Format**: 2 slides per team, ~2 min pitch, ~2 min for the whole room to play; judges will personally try every project.
- **Deadline**: the slides say post the link in #showcase before Saturday [4:30pm] (the brackets suggest it's TBC). **To confirm**: the deadline, and whether we can keep updating the same URL afterwards.
- **Network**: the auditorium has its own Wi-Fi that everyone will be on; the organisers ask us to test before the demo.

## 2. Design goals

1. **Joining is the first fun moment**: scan, tap your seating area, and your portrait blinks and steps out of its frame. No typing a name, no permission pop-ups, no rules to listen to.
2. **One-line rules**: hold to run, let go to stop; stop in a frame and you're a painting; yellow light means hide.
3. **Escaping is easy; top 3 is hard**: the difficulty comes from players' own greed, not from the light.
4. **A human guard brings real unpredictability**: even we can't guess how a round will play out.
5. **A reason to look up**: galleries map to seating areas, so your rivals are sitting next to you; whichever area the human guard walks into groans.

## 3. Scale and galleries

- About 200 people expected. 15–25 per gallery (target 20), so about 10 galleries.
- **Gallery assignment**: on joining, tap "where are you sitting" (an auditorium seating map); same area = same gallery; more than 25 in one area splits it into galleries A and B. Galleries get museum names (e.g. Renaissance Hall, Impressionist Hall, Modern Wing).
  - The area list lives in a config file, since we don't have the seating map yet.
  - There's a **"Not sure"** option, and assignment prioritises balanced gallery sizes over exact areas.
- **One corridor per gallery**: the original three parallel corridors are dropped in favour of galleries.
- **Bot fill**: any gallery with fewer than 12 players is topped up with bots, drawn as semi-transparent "ghost visitors", so a judge opening it alone later still has opponents.
  - Bots play at newbie strength and **don't count toward rankings or the Hall of Fame**.
- **Joining mid-round**: you start at the spawn frame and can still place.
- **Reconnect**: your player id is stored in `localStorage`; reconnecting restores the same character at the same position.

## 4. Screens

### 4.1 Player phone

- **Top**: gallery name, your rank among human players (e.g. "4th of 20"), countdown.
- **Middle**: a mini-map of your gallery's corridor: frames, safe zones, yellow / white light, exit, and other players as small dots (offset slightly up or down so they don't stack). You're enlarged and outlined. Guard charge shown alongside.
- **Bottom**: two big buttons, ◀ back and ▶ forward. Hold to move, let go to stop.
- **Feedback**:
  - Passing a frame: a quick "Saved" cue.
  - Becoming a portrait: the frame lights up.
  - Caught: full-screen red flash (people nearby can see it), "Caught! Keep running".
  - Escaped: gold screen, "Escaped! #X".
  - Time's up while still inside: "Exit closed — didn't escape".
  - Human guard enters your gallery: "⚠️ The human guard is here".

### 4.2 Guard control screen (phone)

- The current gallery's corridor with every player's position, charges, and buttons to switch gallery.
- Tap a segment to lock on: yellow first, then the white flash.
- Your catch count for this round.
- (Optional) Cancel the yellow = fake alarm.
- Opened via `/guard?key=…` so the audience can't get in.

### 4.3 Projector (shared monitor)

- **Main view**: the gallery the human guard is in, enlarged.
- **Side**: small windows for the other galleries (a line plus dots).
- Live top 3 per gallery, global countdown, total escapes, total catches.
- Normally just dots; names pop up only when someone is caught or escapes.
- **At the end**: the Hall of Fame — each gallery's top 3 portraits hung on the wall one by one — plus the human guard's catch count.

### 4.4 Characters and animation

- Names are "colour + animal" (e.g. Blue Fox), unique across the venue; the portrait is a same-coloured animal painting in a gold frame.
- Running: a round head, a body and two legs. The legs swing in opposite directions while moving and the body bobs slightly, about 0.35 s per cycle; the legs stop when you stop.
- Stopping in a frame switches you to your portrait; when caught, a brief red flash, then back to your saved frame.

## 5. Player rules

- Hold forward or back to move; let go to stop.
- Every frame has a safe zone, marked on the floor. The safe zone is never lit, so anyone standing in it is safe. Judging uses the centre point under the character's feet.
- **Passing through a frame's safe zone saves your progress** to that frame. The spawn frame is your first save. Any number of players can share a frame.
- Stop in a safe zone and you become a portrait and the frame lights up. Frames are where you wait out the light.
- Let go within 0.4 of a frame and you slide into it automatically (snapping), so latency doesn't leave you stranded just outside.
- When you see yellow: not in the segment yet → wait; just ran in → back out; nearly at the other end → sprint for it; already a portrait → wait for the white flash, then go.
- Cross the exit line and you've escaped, ranked by time.
- Caught by the white flash: back to your last saved frame, frozen for 1 s (red flash), then you can run again.
- **Winning**: the 3 fastest human players out of each gallery are the winners; everyone else who gets out has "escaped"; anyone still inside at 45 s "didn't escape".

## 6. Guard rules

- Each time, the guard picks one segment of corridor floor (between two frames, excluding the safe zones); the whole segment is lit.
- Yellow for 1 s, then the white flash, judged once: anyone whose centre is in the lit area is caught. Other segments, safe zones and escaped players are safe.
- **Charges**: store up to 2, regain 1 every 2.5 s, each light costs 1; only one light at a time. Players can see the charge, so "Guard's out of charge — go!" is a decision point.
- (Optional) **Fake alarm**: cancel the yellow; the charge is still spent.
- **Guard score**: the guard doesn't win or lose a gallery; it scores catches. The projector shows catches per gallery and the human guard's total ("The judge caught 37 visitors").
- **Bot guard**: one per gallery. Targets the segment where the most players will be stuck in one second's time, picks at random 20% of the time; a bit weaker than a human.
- **Roaming human guard**: a judge takes over one gallery at a time and can switch freely (or auto-switch every 15 s). First stop: the gallery where the judges are sitting.

## 7. Numbers (starting values)

Lengths are in "seconds of running": characters move 1 unit per second.

| Item | v1 | v2 | v3 (current) |
|---|---|---|---|
| Round length | 60 s | 45 s | 45 s |
| Corridor | Short segments 1, long 2 | 8 segments: 1, 2.5, 1, 2, 1, 2.5, 1.5, 2.5 (14 s non-stop) | 8 segments: **1, 3, 1, 2, 1, 3, 1.5, 3** (15.5 s non-stop, last segment is long) |
| Frame positions | — | 0, 1, 3.5, 4.5, 6.5, 7.5, 10, 11.5; exit 14 | **0, 1, 4, 5, 7, 8, 11, 12.5; exit 15.5** |
| Safe zone | TBD | ±0.25 around each frame | ±0.25, plus **snapping within 0.4** |
| Light width | Half a frame gap | Whole segment floor | Whole segment floor |
| Yellow light | 1 s | 1 s | 1 s |
| Guard pacing | Fixed 3 s cooldown | 2 charges, +1 every 2.5 s | 2 charges, +1 every 2.5 s |
| Saving | — | When you stop as a portrait | **When you pass a frame** |
| Caught | Back to previous frame | Back to previous frame + 1 s freeze | Back to last saved frame + 1 s freeze |
| Judging grace | None | 0.15 s (screen flashes at 1.0 s, server judges at 1.15 s) | 0.15 s |
| Keep-alive stop | — | 500 ms | **750 ms** |
| Winning | Escape = win | Top 3 per gallery | Top 3 human players per gallery |
| Guard | — | Holds the gallery if > half are kept in | **Scored by catches** |
| Players per gallery | TBD | 20 (15–25), bots top up to at least 12 | Same; **bots excluded from rankings** |

## 8. Why we changed

### v1 → v2

v1 had a zero-risk strategy: **hide in a frame and wait for the white flash before running.**

- After a flash there were at least 4 s with no flash (3 s cooldown + 1 s yellow). A segment only takes 1–2 s to run, so running right after a flash always made it.
- The lit area was half a frame gap, so from anywhere inside you were at most 0.5 s from the edge, and a 1 s yellow was always escapable. Only distracted players or bad latency got caught.
- Being caught only cost 1–2 s, and 60 s was far longer than needed to run the corridor, so nearly everyone escaped.

After v2:

- Racing for the top 3 turns "wait for a safe moment" into a losing strategy; to win you have to take risks.
- Charges let the guard fire back to back, so there's no fixed safe window.
- Lighting the whole segment means getting lit mid-way through a long segment is inescapable, so crossing one is a gamble; short segments are still escapable.
- The 1 s freeze means being caught costs you several places.
- Judging grace removes unfair catches caused by network latency.

### v2 → v3

- **The guard couldn't win.** A player has about 0.75 s to get out (1.15 s of yellow plus grace, minus ~0.3 s reaction and ~0.1 s network). With 2.5-long segments, only a 0.5-wide band in the middle of each long segment was inescapable — about 1.5 s of a 14 s run — and with 31 s of slack a player had to be caught 9+ times to fail. "Keep more than half inside" was out of reach, and it contradicted goal 3 anyway.
  → The guard is scored by catches; long segments are 3.0, making the inescapable band 1.0 each (about 3 s of a 15.5 s run).
- **Saving had an unwritten rule.** The lit area already excludes safe zones, so being a portrait never affected judging; its only effect was updating your respawn point. Players who never let go kept the spawn frame as their respawn point and got sent back to the start.
  → Save on passing a frame.
- **Latency made players overshoot.** The safe zone is only ±0.25 (half a second of running), but players see themselves 0.1–0.2 s behind the server and the release packet takes another 0.05–0.2 s, so they could stop 0.15–0.4 past the frame.
  → Snapping, client-side prediction, 750 ms keep-alive.
- **Gaps filled**: who starts a round, whether bots can place, reconnects, the unknown seating map, protecting the guard page.

## 9. Fairness and latency

- **Input**: send press / release events, plus a keep-alive every 200 ms while the button is held. If the server hears nothing for 750 ms it stops the character, so a late "release" packet can't carry you into the flash. (v2's 500 ms would make people stutter on congested Wi-Fi.)
- **Your own character**: client-side prediction from your own input, reconciled with the server; other players are interpolated.
- **Snapping**: letting go within 0.4 of a frame slides you into its safe zone.
- **Judging**: server-authoritative with 0.15 s grace, or shrink the judging area slightly. Don't judge on "position before the flash" — that's worse for players escaping the yellow zone.
- **Touch**: `touch-action: none`, `user-select: none`, `-webkit-touch-callout: none`; use pointer events and handle `pointercancel` (e.g. when a notification pops up) by sending a stop.
- **Screen**: request a Screen Wake Lock after joining so the phone doesn't lock while waiting for the round.
- **Reconnect**: player id in `localStorage`; the server restores the character.

## 10. Technical architecture

- **Stack**: TypeScript everywhere. Server: Node + Socket.IO (falls back to polling automatically if WebSocket is blocked). Frontend: Vite + Canvas 2D.
- **Server**: a single long-running process (not serverless); every gallery is an in-memory partition. One Fly.io or Railway service serves both Socket.IO and the built frontend, so there's one domain and one URL for the QR code.
- **Game logic**: a standalone pure-logic module — `step(room, inputs, dtMs)` returns the new state plus events — shared by the server, bots, simulator and the frontend's mock data. The server is authoritative.
- **Update rate**: the server ticks 20 times a second; each gallery pushes 10 position snapshots a second to its phones (coordinates as small integers); the projector receives every gallery. Projector and phones both interpolate.
- **Map**: one coordinate axis. Frames, safe zones, lit areas and the exit use fixed coordinates, and rendering and judging share one config (`shared/map.ts`).
- **URLs**: `/` players, `/guard?key=…` human guard, `/screen` projector, `/admin?key=…` us.
- **Round lifecycle**: the admin page starts rounds manually for the demo. With no admin, the server auto-loops: lobby 10 s → 45 s round → results 10 s → repeat, so a judge trying it alone just works.
- **Messages** (full types in [TASKS.en.md](TASKS.en.md)):
  - Phone → server: `hello {playerId?}`, `join {section}`, `input {dir: -1 | 0 | 1}` (only on change), `hold` (every 200 ms while held).
  - Guard → server: `target {room, gap}`, `switch {room}`, (optional) `cancel {room}`.
  - Admin → server: `start`, `reset`, `mode {auto | manual}`.
  - Server → phone: `welcome`, `snapshot {phase, light, charges, players}` (10 a second), `roster`, events `yellow / flash / saved / escaped / guard / end`, personal status `{rank, status}`.
- **Network**: 200 WebSockets will arrive from the same public IP, so check the host or CDN won't block that; Socket.IO's polling fallback covers WebSocket being blocked.

## 11. Tuning difficulty with bots (recommended)

- Build a simulator: three player-bot types (conservative: only moves when safe; greedy: always pushes forward, dodges only when in the yellow zone; newbie: 0.4–0.7 s reaction, occasional misjudgements) plus the bot guard, and run 1,000 rounds per parameter set.
- Targets:
  1. Conservative bots make up less than 15% of the top 3. Otherwise it's still too easy.
  2. Greedy bots make up at least 45% of the top 3 and are caught 1.5+ times on average. Otherwise the guard is too weak.
  3. At least 70% of newbie bots escape. Otherwise first-timers get crushed. (v2 said 50–70%; since escaping is meant to be easy, only the lower bound matters.)
  4. The bot guard catches each player 1–2 times per round on average, so everyone feels the threat. (Replaces v2's "keep 30–50% inside", which these rules can't reach.)
- Point the same bots at real Socket.IO connections and you have a 200-player stress test.
- No time to simulate? Check these four targets against real playtests; playtest results decide the numbers.

## 12. Demo flow

- **Slide 1** (during the pitch): the one-liner plus a big QR code. People scan, pick their seating area and watch their portrait step out of its frame while we talk.
- **Slide 2**: switch to the live monitor.
- **0:00–0:45**: round one, all galleries at once; a judge is the human guard, starting in the judges' gallery.
- **0:45–1:00**: the Hall of Fame — each gallery's top 3 portraits hung on the wall — and the judge's catch count.
- **1:00–1:45** (only if there's time): a final with the 30 top-3 players in one gallery and a judge as guard, or just another round.
- **Pitch lines**:
  - "Red Light, Green Light in an art museum."
  - "Two hundred paintings, ten galleries, one guard."
  - "We had bots play a thousand rounds to tune the difficulty." (Only if we actually ran the simulator.)
- **Fallback**: if multiple galleries aren't ready, demo one gallery with bot fill.

## 13. Timeline and team split

Backend owns `shared/`, `sim/`, `server/` and deployment; frontend owns everything under `web/` plus art. The only interface between them is `shared/map.ts` and `shared/protocol.ts`. Details: [TASKS.en.md](TASKS.en.md).

| Time | Milestone | Done means |
|---|---|---|
| Fri 23:45 | Contract agreed | `shared/map.ts` and `shared/protocol.ts` on `main`; both sides can import them |
| Sat 02:00 | Integration 1 | Two phones plus projector on the live URL: forward / back, becoming a portrait, yellow / white light, caught and sent back. Server built for multiple galleries from the start; guard already on charges |
| 02:00–08:00 | Sleep | — |
| 11:00 | Bots | Bot guard and fill bots running on the live URL; simulator if there's capacity |
| 12:30 | Integration 2 | One full round: join (seating area) → 45 s countdown → exit → ranks → guard score → phone mini-map → projector windows → Hall of Fame |
| 14:30 | Testing | 200-bot stress test; venue Wi-Fi test in the auditorium; playtest with 9 people + 1 guard (one gallery topped up to 20 with bots). Can first-timers find their character, react to yellow, and read results and ranks at a glance? |
| 16:00 | Feature freeze | Bug fixes only |
| 16:30 | Submit | Link posted in #showcase (deadline TBC) |
| 16:30–19:00 | Polish and rehearse | If the URL can still be updated, keep fixing details; rehearse scanning, starting, dodging yellow, the guard switching galleries, the Hall of Fame |

**Cut list** — if behind, cut from the top:

1. Simulator (use playtests plus the math in §8)
2. Fake alarm, the final, frame capacity (max 2 per frame), escaped players holding the door — already optional
3. Seating areas (auto-balance galleries instead)
4. Projector windows for other galleries (list each gallery's top 3 instead)
5. Human guard auto-switching (manual only)
6. Multiple galleries (one gallery plus bots)

**Never cut**: phone controls feel, yellow / white light judging, bot fill, deployment, the Hall of Fame.

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Still too easy | Tune long-segment length, charges and freeze time from simulation or playtests |
| Too hard, newbies crushed | Hold the "at least 70% of newbies escape" target; lengthen the grace or shorten long segments |
| Unfair catches from latency | Judging grace, keep-alive stop, shrink the judging area |
| Stopping just outside a frame | Snapping plus client-side prediction |
| Players don't know they've saved | "Saved" cue when passing a frame |
| Can't find your own character | Phone mini-map with you enlarged and outlined; others offset vertically |
| Venue Wi-Fi can't cope | Small packets, 200-bot stress test, on-site test, polling fallback |
| Wi-Fi drops players | Reconnect via the `localStorage` player id |
| A judge tries it alone later | Bot fill plus auto-loop rounds |
| Bots in the Hall of Fame | Bots excluded from rankings |
| Audience opens the guard page | Key in the URL |
| Late joiners | Join at the spawn frame |
| iOS long-press selection pop-up | Touch CSS plus pointer events |
| Not enough time (~17 h left, including sleep) | Cut list, two integration checkpoints |
| Deadline | Ask the organisers tonight |

## 15. Open decisions

- The link deadline, and whether the URL can be updated afterwards.
- How auditorium seating maps to galleries (need the seating map).
- Gallery names, and the colour and animal lists for player names (at least 200 unique combos).
- Who plays the human guard (suggest asking a judge).
- Whether to do the final.
- **Confirm the v3 changes as a team**: guard scored by catches, 3.0 long segments, saving on passing a frame.
- Final numbers (pending playtests or simulation).
