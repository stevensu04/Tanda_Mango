# Jailbreak the Bouncer

**Hold to sneak. Let go before Gus turns around.** Jailbreak the Bouncer is a hackathon party game designed for one shared screen and a room full of phones. The projector shows the entrance to Club Velvet, and each phone is a controller.

## Phase 2 status · 21 November 2026

Phase 2 is built on localhost and its [definition of done (§3.8)](./plan.md#38-definition-of-done-phase-2) is met in automated runs. Real phones, the venue network and the room's speakers have not been tested yet; those checks are listed below.

| §3.8 criterion | Evidence |
| --- | --- |
| Fresh clone → `cp .env.example .env` → add key → `npm i && npm run dev` | Done from a clean copy of the tracked files, with the key only in `.env`. Every page loaded, and Claude answered. |
| Scripted 2-minute demo: first entry ≤ 35 s, a chaos rule live, ≥ 3 catches with roasts, finale, mugshots | `server/test/demo.test.ts` (real sockets, mocked Claude) and `npm run e2e` (1 projector + 4 phone pages in Chromium). The e2e run saw first entry at about 28 game-seconds. One `npm run sim` round with real Claude (Haiku 5.5) passed 19/19 checks; all 14 Claude calls answered in about 1.6–3 s with no fallbacks. |
| Solo completes all three levels on one phone | `npm run e2e` clears Dive Bar → Rooftop → Area 51 in a browser and ends on **BOUNCER BEATEN**. Also covered by `server/test/flow.test.ts`. |
| Plays on with Claude unreachable | `server/test/fallback.test.ts`: full rounds with Claude down, Claude slower than the timeout, and Claude switched off on the host page. Every catch still gets a scripted line, and commentary and mugshots still arrive. |
| All tests green, no console errors | `npm test`: 94 tests. `npm run e2e`: 14/14 checks, with no console errors or warnings on the projector or any phone. |

**Also verified:** a 100-phone load round (`npm run load`) passed. Phones got 15 Hz, the projector median was 15 Hz, a tick took 1.9 ms on average, memory stayed flat and there were 0 socket errors. The Claude eval (`npm run eval:bouncer`) passed with 27/27 valid answers, p95 2.7 s, for $0.005.

### What is in the build

- **Rooms:** the projector creates a 4-letter room and its QR code opens `play.html?room=CODE`. Refreshing the projector re-opens the same room. Reconnecting phones keep their spot.
- **Core loop:** hold to sneak and freeze when Gus looks, with a 200 ms grace window plus a latency allowance per phone. Gus starts sleepy and naps at 35 s if nobody is in.
- **Prove It challenge:** **Shake** on phones with motion sensors, **Mash** otherwise. Taps always count, so the fallback is built in.
- **VIP Owner:** picks 1 of 3 random chaos rules in 12 s: **Lights Out, New Glasses, Moonwalk, Disco**. All four are live on the server, the projector and the phones.
- **Lounge powers:** Banana, Distract and Snitch, each with a cooldown.
- **NICE TRY, NERD:** more than 20 taps a second ignores your input for 5 s.
- **Gus's brain HUD:** Ego, Paranoia, Boredom and Suspicion actually change his timing.
- **NPC fill:** NPCs fill rooms with fewer than 4 people. They never get in and are not ranked.
- **Finale and reveal:** a 10 s rope push, then a 5 s coup vote, then one VIP crowned. Ranking puts the crown holder first. Every phone gets a personal mugshot receipt, which can be saved as a PNG.
- **Claude as Gus** ([docs/AI.md](./docs/AI.md)): round script, catch roasts written during the 5-second challenge, commentary every 10 s and mugshot receipts. The sharpest lines are spoken on the projector by text-to-speech. Every line has a scripted fallback, so the game never waits.
- **Solo gauntlet:** open `play.html` with no code. Dive Bar (sleepy), Rooftop (fake-outs), Area 51 (searchlight).
- **Host page** `/admin.html?room=CODE`:
  - start and reset;
  - kick players;
  - round length 90 or 120 s;
  - a difficulty slider;
  - NPC on/off;
  - a **Claude lines** switch, which is also how to rehearse "Claude unreachable";
  - a live Claude cost and latency meter.

**Not built (Tier B/C, outside §3.8):**
- the Freeze! and Dodge the Flashlight challenges;
- phone sabotage (dodging button, upside-down screen, fake CAPTCHA);
- the mid-round coup meter (the finale vote does that job);
- Strike a Pose and Forge a VIP Pass, which need Claude Vision;
- the Alleyway raccoon.

**Deviation from the plan:** the transport is plain WebSockets, not Socket.IO. The linked build already used them; see [docs/PROTOCOL.md](./docs/PROTOCOL.md).

### Running a round

```bash
cp .env.example .env     # add ANTHROPIC_API_KEY (without it Gus uses scripted lines)
npm install
npm run dev              # or: npm run dev:https  (self-signed HTTPS so iPhones allow shake)
```

1. On the projector laptop, open `http://localhost:5173/screen.html`. It creates a room, shows **ROOM ABCD** and a QR code pointing at the laptop's LAN address. If the QR shows the wrong address (VPN, WSL, several network cards), restart with `LAN_HOST=192.168.x.y npm run dev`.
2. Phones scan the QR code, pick a look and a name, then tap **Get in line**.
3. Open `/admin.html?room=ABCD` on the host's phone or laptop. Press **Start** there, or press **S** on the projector (**R** resets to the lobby and **M** mutes Gus's voice).
4. Run `npm run sim` to check a round without phones. It creates its own room, or joins yours with `-- --room ABCD`.

**Notes:**
- Without HTTPS, iPhones block motion sensors, so they get Mash. Android Chrome also needs HTTPS for sensors.
- Design previews are still available at `screen.html?preview` and `play.html?preview`.
- **Don't edit `server/` during a playtest.** Vite restarts the server and the room is lost.
- `npm run build && npm start` serves the production build plus the game on port 8080. That is the Phase 3 starting point.

| Command | What it checks |
| --- | --- |
| `npm test` | Engine unit tests, Claude client tests (no network) and real-socket round tests with mocked Claude |
| `npm run e2e` | Browser run with 1 projector and 4 phones, plus solo, with mocked Claude. Screenshots go to `/tmp/e2e-shots` |
| `npm run load` | 100 simulated phones through a full round |
| `npm run eval:bouncer` | About 20 real Claude calls checking validity, length, tone, latency and cost. Costs about half a cent |

### Still to check with people and devices (P0 from the previous review)

1. **Real phones.** Use four phones on the venue Wi-Fi with iOS Safari and Android Chrome. Lock one phone and reopen it, refresh one mid-round, and start a second round. Record every moment the host has to step in.
2. **Shake on iPhone.** Run it under `npm run dev:https`. Accept the certificate warning once, then the motion prompt on **Get in line**. Check that Shake passes at roughly the intended rate (about 60%).
3. **The two cues from the browser playtest.** Count how many players let go unprompted when Moonwalk starts. Ask every player "who won?" at the reveal.
4. **Sound.** Check the projector's text-to-speech voice and the tell sting through the room's speakers. Some browsers only speak after a click on the page.
5. **Round length.** The default is now **120 s**, Jonathan's demo script. The previous review suggested starting the physical playtest at **90 s**; switch it on the host page. Record time to first entry, number of catches and time spent under the owner's rule.

## Latest linked playtest

On 21 November 2026, one projector and four independent Chrome phone sessions completed a round in the same room on the local development build. The networking changes were uncommitted at the time of testing.

| Check | Observed result |
| --- | --- |
| Four names | Each join added one player. The projector showed **004 PEOPLE** and listed **DJ OYSTER**, **TOTALLY 21**, **TOTALLY 21 2** and **THE INTERN**. The numeric suffix distinguished two phones that chose the same name. |
| Moonwalk handoff | **DJ OYSTER** activated Moonwalk while all three outside phones were holding Sneak. All three displayed **MOONWALK: LET GO TO MOVE** and **HOLD TO FREEZE**. The projector simultaneously displayed **RELEASE TO MOVE**. Whether new players release without coaching still needs a human playtest. |
| One VIP on five screens | **TOTALLY 21** took the crown from **DJ OYSTER**. The projector named TOTALLY 21 as VIP. Only that player’s phone showed **YOU’RE TONIGHT’S VIP**. The other three named the same winner and showed their own ranks of second, third and fourth. |

### Design suggestions from this round

- **Lead with LET GO.** When Moonwalk starts while a player’s thumb is down, make **LET GO** the largest cue in the button. Once they release and their avatar moves, switch the button to **HOLD TO FREEZE**. In the tested version, **HOLD** was the largest word at the moment the player needed to release.
- **Give #1 one meaning on the results screen.** The ranking showed TOTALLY 21 first with 70 points and DJ OYSTER second with 100. The adjacent first-entry award also labelled DJ OYSTER **#1**. Label the award **FIRST THROUGH THE DOOR — DJ OYSTER** and explain that the crown holder ranks first.

**Changed in the local build. Re-test both with first-time players.** Under Moonwalk, a held thumb now reads **LET GO / TO MOVE** during safe moments. Once released, the button reads **HOLD / TO FREEZE**, and during Gus's warning and look it reads **HOLD / DON'T LET GO**. On the projector results, the ranking header now reads **RANKING: CROWN FIRST** and the crown appears beside the winner's name. The first-entry award is now **FIRST THROUGH THE DOOR** with no number.

## Earlier Phase 1 preview walkthrough

The Phase 1 prototype includes interactive phone and projector pages. The table records a 21 November 2026 browser walkthrough in Chrome at a 390 × 844 phone viewport, with the projector open separately. The two pages ran their own previews. Physical phone sensors and four-player comprehension still need testing.

| Flow | What worked on the phone | What the projector showed |
| --- | --- | --- |
| **Catch and recover · playable from Join** | Tapped **Get in line**, held Sneak through Gus’s turn, entered the five-second **Mash!** challenge automatically, and tapped through to **You pass**. | The separately selected catch preview showed **Caught! Dave** against the red sweep. The phone catch did not trigger that spotlight. |
| **Moonwalk · Owner preview** | Selected Owner in the dev menu and tapped **Moonwalk**. The card turned gold and Gus confirmed **Rule set: Moonwalk**. The card describes the effect as **Controls flip**. | The separately selected projector preview displayed **Moonwalk**. The ordinary sneaker view still read **Hold to sneak**. The owner selection did not update the other screens’ instructions or demonstrate reversed movement. |
| **Rush and crown · separate previews** | Five taps in Mosh produced **5 pushes**. In the Lounge preview, tapping the crown started a 15-second cooldown. | The rush preview showed the crowd meter and **Rope snapped!**. The results preview led with **First in**. The phone inputs did not establish who took the throne. |

### Connection check and four-phone acceptance test

**Checked at `4c279b0`.** The projector QR opened the phone page. The lobby populated itself from a timed mock crowd, each phone handled its own controls, and the projector read a fixed results list. A linked four-phone round was therefore still unverified at this revision.

**Repeatable acceptance test.** Open one projector and have four independent phone sessions join through its QR. Choose four distinct names. Run all three checks in the same round using the player controls.

| Check | Action and pass condition |
| --- | --- |
| Lobby identity | Join one phone at a time. After each join, the projector adds that phone’s chosen name exactly once and increments the human player count by one. At the fourth join, all four names are visible and the human count is four. Any NPCs are labelled separately. |
| Moonwalk handoff | Let one player become owner while the three outside players hold Sneak. Activate Moonwalk once on the owner’s phone. The projector names the owner and shows **Release to move**. All three outside phones immediately show **Release to move** and relabel the held control **Hold to freeze**. During a safe movement phase, verify on each phone that holding stops its avatar and releasing moves it. In a first-time player session, record how many of the three release before Gus turns without a spoken hint. |
| One VIP at the buzzer | Have a different player take the seat before time expires. Record the final owner’s name. The projector reveals that player on the throne, and all four result screens identify the same VIP. Only the winner sees **You’re Tonight’s VIP**. Each of the other three phones shows its own finishing rank. The proposed five-second vote below is one way to test a transfer. |

## Jonathan’s planned gameplay

1. **Join the room.** Scan the QR code on the projector to use your phone browser as a controller.
2. **Sneak past Gus.** Hold the button to move while his back is turned. Release when he gives a warning. Sometimes he fakes the turn.
3. **Prove it.** If he catches you, you get five seconds to shake or tap your way through a challenge while everyone else keeps moving. Pass to keep your progress. Fail and Gus sends you back to the start.
4. **Take over Club Velvet.** The first player through the rope becomes VIP Owner and picks a rule such as Lights Out or Moonwalk. Players in the lounge can later challenge the owner in a coup.
5. **Rush the rope.** In the final 15 seconds, players outside mash or shake to break through while the lounge players help Gus hold the line. The outcome affects scores.

### How the winner is decided

The plan gives players points for entry order and microgame results, with a live top-five ranking. At the buzzer, the player holding the VIP Owner seat is crowned **Tonight’s VIP** in a throne reveal. Other players see their finishing rank on their phones. The plan also defines a smaller demo version that keeps the crown and throne reveal.

### Multiplayer and solo plans

Live rooms, QR joining and host controls are planned alongside a three-stage solo gauntlet from the Dive Bar to Area 51. Claude is planned to supply roasts, commentary and rule announcements. The game is designed to keep running with scripted lines if the service is unavailable.

See the [build plan, section A](./plan.md#a-current-game-design-source-of-truth) for the current game design and delivery phases.

## Suggestions for the first playtest

These are proposed experiments. Jonathan’s agreed rules are described above and in sections A.4, A.6 and A.10 of the build plan.

### A playable rule for the final 15 seconds

**Jonathan’s plan.** Players outside push against the rope while lounge players defend it. A successful crowd rush admits everyone outside and multiplies their scores by 1.5. A lounge coup can depose the owner, the next entrant takes the vacant seat, and whoever holds it at the buzzer wins the crown. The plan leaves the order of simultaneous entrants and a last-second coup open.

**Proposed ruling for one test round.** Keep the existing crown visible on the projector beside the timer. Give each phone one action at a time.

| Time left | What players can do |
| --- | --- |
| 15–6 seconds | Run the crowd push. Outside players tap to break the rope. Lounge players tap to defend it. Show which side is ahead. |
| 5–1 seconds | Resolve the rope. If it breaks, admit the crowd. Open one final coup to everyone now in the lounge except the owner. Each challenger can tap once to support it. A strict majority of eligible challengers must support the coup. Show votes needed and the name of the successor. |
| Buzzer | If the coup succeeds, crown the first supporter to have entered the lounge. For simultaneous rush entrants, use their distance toward the rope before the rush, then original join order to break a tie. If the vote falls short or nobody challenges, the current owner keeps the seat. Close input and reveal the winner. |

This experiment gives a late entrant a route to the throne and reserves five seconds of the rush for the vote. The succession rule during that vote is a proposed change to Jonathan’s next-entrant rule. For a fair first test, show the prospective successor as votes arrive so players can see whom their tap would help.

### Phone and projector design notes for Claude

**Jonathan’s rules.** Moonwalk reverses the sneak controls. A catch starts a five-second challenge for that player while the room keeps playing. The player holding the owner seat at the buzzer is Tonight’s VIP.

**Four-player playtest proposals.** The paired displays below are suggested treatments. The five-second vote uses the experimental finale above. Use the players’ actual names in place of Priya and Dave.

| Moment | Phone | Projector |
| --- | --- | --- |
| Moonwalk starts | Keep the control under the same thumb. Change its label to **Hold to freeze** and show the avatar move on release. Restore the ordinary label when the rule ends. | Show **Priya picked Moonwalk** and **Release to move** together the instant the rule changes. Keep Gus and his turn cue visible while the announcement is up. |
| Gus catches Dave | Only Dave gets the challenge. Show one action, such as **Tap to bribe**, with its meter and five-second countdown. On return, show the result and wait for a fresh press to resume. Other phones keep their street controls. | Keep the red sweep and Gus’s turn pose. Put **Dave — caught** on a solid nameplate pointing to his avatar so the name stays legible over the patterned street. |
| Crowd rush | Outside players see **Break the rope**. Lounge players see **Defend the rope**. Keep each action in the same thumb position. | Show the crowd and defenders on opposite ends of the meter, with time left and the current crown holder visible. Announce whether the rope held before changing screens. |
| Experimental final vote | An eligible challenger sees **Support coup** and gets one tap. Require a lift and a fresh tap after the rush. Confirm the vote. The owner sees **Defending your crown** and any player still outside sees **Outside the lounge**. | Replace the rush meter with the owner’s name, votes cast and needed, and seconds left. As support arrives, show who would take the seat under the proposed succession rule. |
| Buzzer | Give the winner **You’re Tonight’s VIP** and everyone else their personal finishing rank. | Reveal the crowned player on the throne first. If ownership changed, name both players, e.g. **Dave took the crown from Priya**. Show fastest entry and other side awards after the reveal. |

For the first run, offer Moonwalk as the sole VIP power. Use the same final visual cue on every genuine turn and keep the phone control large enough to hold while looking up. Hide the projector’s development toolbar during the session so it cannot cover the timer or crown.

### Four-player playtest

Recruit four first-time players. Let them attempt one round with only the on-screen prompts. Record any moment the host has to explain a control. If everyone ends up on the same side of the rope, replay the finale with one owner, one lounge challenger and two outside players.

| Moment | What to record |
| --- | --- |
| First turn | How many players release on their own? Are they looking at Gus or searching their phone for a warning? |
| First catch | Does the caught player understand the five-second challenge and intentionally resume sneaking? Note any immediate repeat catch. |
| First owner power | Who notices Moonwalk before moving again? Can the other players identify who changed the rule? |
| Final rush and vote | Record the owner before the rush, who gets in, who votes and who receives the crown. Note any player tapping to push after voting has opened or trying to vote from outside. |
| Throne reveal | Before anyone discusses the result, ask each person “Who won, and why?” and “From your position, what could you do in the last ten seconds?” Compare all four answers with the events you recorded. |

Include one run where the first entrant loses the throne. Ask each player whom their last tap helped before revealing the input record. Run the finale again with the opposite rope outcome. Revise the first cue or rule that players misunderstood, then retest that moment with fresh players.
