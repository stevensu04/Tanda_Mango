# Jailbreak the Bouncer

**Hold to sneak. Let go before Gus turns around.** Jailbreak the Bouncer is a hackathon party game designed for one shared screen and a room full of phones. The projector shows the entrance to Club Velvet, and each phone is a controller.

## Current status

The Phase 1 prototype includes interactive phone and projector pages. The table records a 21 November 2026 browser walkthrough in Chrome at a 390 × 844 phone viewport, with the projector open separately. The two pages ran their own previews. Physical phone sensors and four-player comprehension still need testing.

| Flow | What worked on the phone | What the projector showed |
| --- | --- | --- |
| **Catch and recover · playable from Join** | Tapped **Get in line**, held Sneak through Gus’s turn, entered the five-second **Mash!** challenge automatically, and tapped through to **You pass**. | The separately selected catch preview showed **Caught! Dave** against the red sweep. The phone catch did not trigger that spotlight. |
| **Moonwalk · Owner preview** | Selected Owner in the dev menu and tapped **Moonwalk**. The card turned gold and Gus confirmed **Rule set: Moonwalk**. The card describes the effect as **Controls flip**. | The separately selected projector preview displayed **Moonwalk**. The ordinary sneaker view still read **Hold to sneak**. The owner selection did not update the other screens’ instructions or demonstrate reversed movement. |
| **Rush and crown · separate previews** | Five taps in Mosh produced **5 pushes**. In the Lounge preview, tapping the crown started a 15-second cooldown. | The rush preview showed the crowd meter and **Rope snapped!**. The results preview led with **First in**. The phone inputs did not establish who took the throne. |

**Next linked playtest.** When an owner activates Moonwalk, show **Release to move** on the projector and **Hold to freeze** under each outside player’s thumb. For the finale, Jonathan’s rule awards the crown to whoever holds the seat at the buzzer. Test a round where the first entrant loses the seat and check that both screens identify the same final owner. The five-second coup vote below is a proposed experiment.

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
