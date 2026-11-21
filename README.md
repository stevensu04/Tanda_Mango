# Jailbreak the Bouncer

**Hold to sneak. Let go before Gus turns around.** Jailbreak the Bouncer is a hackathon party game designed for one shared screen and a room full of phones. The projector shows the entrance to Club Velvet, and each phone is a controller.

## Current status

As of 21 November 2026, the published main branch contains the design documents. A fresh clone has no playable round. Local work includes the TypeScript scaffold and pixel art for the characters and text.

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

### Other suggestions to try

- Make the sneak button easy to hold by touch while watching Gus on the projector. Give every genuine turn the same final visual cue.
- After a microgame, return the player to the street standing still. Let a fresh press resume movement so reading the result cannot trigger another catch.
- Try Moonwalk as the only VIP power in the first test. Show who activated it and the changed control on the projector. Watch whether the other players notice and react.

### Four-player playtest

Recruit four first-time players. Let them attempt one round with only the on-screen prompts. Record any moment the host has to explain a control. If everyone ends up on the same side of the rope, replay the finale with one owner, one lounge challenger and two outside players.

| Moment | What to record |
| --- | --- |
| First turn | How many players release on their own? Are they looking at Gus or searching their phone for a warning? |
| First catch | Does the caught player understand the five-second challenge and intentionally resume sneaking? Note any immediate repeat catch. |
| First owner power | Who notices Moonwalk before moving again? Can the other players identify who changed the rule? |
| Final rush and vote | Record the owner before the rush, who gets in, who votes and who receives the crown. Note any player tapping to push after voting has opened or trying to vote from outside. |
| Throne reveal | Before anyone discusses the result, ask each person “Who won, and why?” and “From your position, what could you do in the last ten seconds?” Compare all four answers with the events you recorded. |

Run the finale again with the opposite rope outcome. Revise the first cue or rule that players misunderstood, then retest that moment with fresh players.
