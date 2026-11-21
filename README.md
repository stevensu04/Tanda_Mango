# Jailbreak the Bouncer

**Hold to sneak. Let go before Gus turns around.** A party game for one big screen and a room full of phones. The projector shows the entrance to Club Velvet. Every phone is a controller, so there is nothing to install. Claude plays Gus the bouncer and roasts you when you get caught.

## What you need

- **Node.js 22 or newer** and npm
- A laptop connected to a projector or TV
- Phones on the **same Wi-Fi** as the laptop
- An **Anthropic API key** (optional: without one, Gus uses scripted lines)

## Get started

```bash
git clone https://github.com/stevensu04/Tanda_Mango.git
cd Tanda_Mango
cp .env.example .env        # then open .env and paste your key after ANTHROPIC_API_KEY=
npm install
npm run dev
```

The terminal prints the local and network addresses. Keep it running.

## Run a round

1. **Projector:** on the laptop, open **http://localhost:5173/screen.html** and make it full screen. It creates a room and shows **ROOM ABCD** with a QR code.
2. **Phones:** scan the QR code. Pick a look and a name, then tap **Get in line**. Players appear on the projector as they join.
3. **Host controls (optional):** open **http://localhost:5173/admin.html?room=ABCD**, using your room code, in another tab or on the host's phone. From there you can start and reset rounds, set the round length, change the difficulty, kick players, turn NPCs or Claude's lines on and off, and see what Claude has cost so far.
4. **Start:** press **Start** on the host page, or press **S** on the projector.

Projector keys: **S** start · **R** back to the lobby · **M** mute Gus's voice.

## How the game works

### The basics

- **Hold** the big button to sneak towards the door. **Let go** when Gus turns around. You get a warning first: he twitches and a **!** pops up.
- If you're still moving 0.2 s after he starts looking, you're **caught**. Slow phones get a little extra time.
- Holding without a break, the walk from the start line to the rope takes about **18 seconds**. With Gus turning around, it's more like 25–35 seconds.
- Sometimes Gus fakes the turn and looks away again.

### Getting caught: the 5-second challenge

- Your phone flips to a challenge. **Mash:** tap 18 times. **Shake:** shake your phone hard (phones with motion sensors only). Tapping always counts too.
- **Pass:** you keep your spot and get a small step forward (+10 points).
- **Fail:** you're flung back to the start (−10 points).
- Everyone else keeps playing while you're in the challenge.
- Tapping more than 20 times a second gets a **NICE TRY, NERD** stamp and 5 seconds with your input ignored.

### Getting in and running the door

- **The first player through the rope becomes VIP Owner.** They get 12 seconds to pick one of three chaos rules for everyone still outside. If they don't pick, one is chosen at random.
  - **Lights Out:** the street goes dark and you're only caught if Gus's flashlight is on you.
  - **New Glasses:** shorter warnings and more fake-outs.
  - **Moonwalk:** controls flip. Let go to move, hold to freeze.
  - **Disco Mode:** Gus turns around faster.
- Players in the lounge get powers, each with a cooldown:
  - **Banana:** trips a random player outside back a few steps (8 s).
  - **Distract:** Gus looks away for 1 second longer (10 s).
  - **Snitch:** Gus's next look lasts 1 second longer (10 s).
- **Entry points:** 100 for the first in, then 70, 50, 40, 30, 20, 10 for the next ones.

### Timeline of a round (default 2 minutes)

| Time | What happens |
| --- | --- |
| 0:00 | Doors open. For the first 25 s Gus is **sleepy**: long turns away, slow warnings, no fake-outs. |
| ~0:25–0:35 | Usually the first player gets in. **If nobody is in by 0:35, Gus naps for 4 seconds** so the leaders can rush the rope. |
| 0:25 onwards | Gus gets sharper: shorter breaks, faster warnings and some fake-outs. The owner's rule is in force. |
| 1:45 | **Rope rush (10 s):** players outside tap to break the rope; the lounge taps to hold it. If the rope breaks, everyone outside gets in and their score is ×1.5. |
| 1:55 | **Coup vote (5 s):** lounge players (not the owner) tap once to vote. A majority hands the crown to the earliest-entered voter. |
| 2:00 | **Reveal:** the crown holder is **Tonight's VIP**. Everyone sees their rank, and a mugshot receipt arrives on every phone. |

A 90-second round (set it on the host page) works the same way; the rush starts at 1:15.

### Small rooms, and playing alone

- **Fewer than 4 players:** NPCs join the street to show everyone how it works. They get caught a lot, never get in and aren't ranked.
- **Solo:** open **http://localhost:5173/play.html** with no room code to play the solo gauntlet, three doors in a row:
  - **Dive Bar:** a sleepy guard.
  - **Rooftop:** fake-outs.
  - **Area 51:** a searchlight.

  A full run takes about **1–2 minutes** and ends with a **BOUNCER BEATEN** stamp, your time and how often you were caught.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Phones can't open the QR link | Make sure the phones are on the same Wi-Fi as the laptop (not guest Wi-Fi) and that the laptop's firewall allows port 5173. |
| The QR code shows the wrong address (VPN, WSL, several network adapters) | Restart with your Wi-Fi address: `LAN_HOST=192.168.1.20 npm run dev` |
| Shaking doesn't work; phones always get the tapping challenge | Phones only allow motion sensors over HTTPS. Run `npm run dev:https` and accept the certificate warning once on each phone. Tapping always works as a fallback. |
| Gus keeps repeating the same scripted lines | Check `ANTHROPIC_API_KEY` in `.env` and restart. The host page shows a red banner when the key is missing. |
| No voice on the projector | Click once anywhere on the projector page (browsers need a click before playing sound) and check that it isn't muted (**M**). |
| The room vanished mid-game | Editing files in `server/` restarts the dev server. Don't edit code during a game. |

## Optional settings (`.env`)

| Variable | Default | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | none | Turns on Claude as Gus (with the default Haiku model, well under 1 cent per round) |
| `BOUNCER_MODEL` | `claude-haiku-5-5` | Use `claude-sonnet-5-5` or `claude-opus-5-5` for sharper roasts, at a higher cost |
| `PORT` | `5173` (dev), `8080` (`npm start`) | Server port |
| `LAN_HOST` | auto-detected | The address the QR code sends phones to |

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the game locally (projector, phones, host page) |
| `npm run dev:https` | Same, over HTTPS so phones can use shake |
| `npm run build` then `npm start` | Production build served on port 8080 |
| `npm test` | Run the test suite (no API calls) |
| `npm run e2e` | Browser test: 1 projector and 4 phones play a full round, then a solo run |
| `npm run sim` | Four bot phones play a round against a running `npm run dev` |
| `npm run load` | 100 simulated phones play a full round |
| `npm run eval:bouncer` | Checks Claude's lines against about 20 scenarios (real API, about half a cent) |

## Ten-player linked playtest

One projector and ten independent Chrome phone sessions played a 120-second round on build `3520a6e` with simulated player inputs and mocked Gus dialogue. The room was recreated after the first rule draw omitted Moonwalk.

**NOT A COP 2 won the crown with 70 points.** NOT A COP entered first at 27 seconds and earned 100 points. At the final vote, all nine eligible challengers backed the coup. Five votes were enough to depose the owner. Among those who voted for the coup, NOT A COP 2 had entered earliest and therefore inherited the crown. The projector and all ten phones agreed on the winner. The former owner finished second.

**Moonwalk reached all nine outside players.** When NOT A COP selected it, all nine were holding Sneak. Each phone’s main button changed to **LET GO / TO MOVE**, and the projector displayed **RELEASE TO MOVE**. A first-time human playtest is still needed to measure how many people release without coaching.

### Who benefits from a Lounge power?

Any admitted player can use these powers. The owner activated all three in this round.

| Power | Who it affects | What happened in the round |
| --- | --- | --- |
| Banana | Hinders one randomly selected runner outside. A hit moves them back by 10% of the course. | NOT A COP hit DJ OYSTER. |
| Distract | Helps the runners outside by distracting Gus for one second. | The owner triggered the distraction while players were approaching the rope. |
| Snitch | Helps Gus by extending his next watch by one second. Runners outside must stay frozen longer. | The owner triggered it after Distract. The effect applied to the next watch. |

### Improvements to try with ten people

- **Help each player find their avatar.** The phone marked the player with **YOU**, but the lobby list showed five names and **+5 MORE**. Several avatars had overlapping labels, including NOT A COP, NOT A COP 2 and NOT A COP 3. Try two columns of five and a short player number shared by phone, avatar and results. Ask each player to point out their avatar before the host starts.
- **Skip the empty-street wait.** Nine players had entered by 46 seconds and the tenth by 72. The scheduled rush began at 105 seconds, leaving 33 seconds with nobody outside to target, followed by a rope contest with nobody attacking. Try opening the crown vote as soon as everyone is inside.
- **Show whom a vote helps before the tap.** Nine people voted for a coup that crowned just one of them. Show the projected successor for that player’s vote on their phone, for example **CROWN NOT A COP 2**, alongside **KEEP NOT A COP**. Update the candidate if an earlier entrant joins the coup. Ask each player whom their tap would put on the throne.
- **Show the outcome of interference.** Label the actions **Trip a runner**, **Help the runners** and **Help Gus**. After a banana hit, tell the sender **You tripped DJ OYSTER** and tell the target **NOT A COP tripped you**.

## More detail

- [plan.md](./plan.md): game design and build plan
- [docs/DESIGN.md](./docs/DESIGN.md): art style, palette and sprites
- [docs/PROTOCOL.md](./docs/PROTOCOL.md): how the projector, phones and server talk to each other
- [docs/AI.md](./docs/AI.md): how Claude plays Gus, and what it costs
