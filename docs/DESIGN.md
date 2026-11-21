# CLUB VELVET — Design (Phase 1)

> Supersedes plan.md §0 "Art style" and §2.3. Direction agreed 2026-11-21: **a late-90s handheld RPG**, not neon cartoon SVG, not low-poly 3D.
> This is a genre, not a copy: every character, tile, font glyph and screen layout here is original. No creatures, no balls, no borrowed UI.

---

## 1. Why this genre (the design reason, not just the look)

Our game *is* a handheld-RPG mechanic. Everyone in the room already knows these rules from childhood, so the genre teaches the game for us:

| Genre convention everyone knows | What it becomes in our game |
|---|---|
| Walk past a guard; if he turns and a **"!"** pops over his head, he has spotted you | The whole core loop. Back turned = sneak. "!" = the tell. Facing you = freeze or get caught |
| Being spotted triggers a **screen transition into a face-off** | Caught → velvet-curtain wipe → **STARE-DOWN** screen → 5-second microgame |
| **Text box** with typewriter text, blip sound and a ▼ prompt | Every roast, taunt and announcement. Gus "speaks" in a box, the room reads along |
| **Menu with a ▶ cursor** | Owner Console: three chaos rules, one tap |
| **Same sprite, different palette** for every townsperson | Every player's avatar: one body, a palette + hair swap. Instantly readable and cheap |
| **Dark cave**: you only see what your light shows | Lights Out chaos rule: only the flashlight band is visible |
| **Palette cycling** (water, lava) | Disco chaos rule: the dance-floor tiles cycle colours |
| **Trainer card** | End-of-round MUGSHOT CARD, made to be screenshotted |

The pitch writes itself: *"Remember sneaking past guards in handheld RPGs? Now 100 of you do it at once, and the guard is an AI who roasts you."*

## 2. Rules that keep it from looking AI-made

AI-made game UI is recognisable: soft gradients, glows, blur, rounded cards, emoji, a stock pixel font at a non-integer size, everything centred and floating. We ban all of it.

1. **One pixel grid.** The projector is a **320×180** logical screen; the phone is **160 px wide**. Everything is drawn into that grid and scaled up by a **whole number** (×6 on a 1080p projector). No sub-pixel positions, no sprite rotation, no smooth scaling. Portraits may be drawn at exactly 2×.
2. **One 16-colour palette** (§3). No gradients. Shading = two tones plus a 50% checker dither.
3. **No blur, glow or alpha.** Neon "glow" is a 1 px lighter ring plus a 2-frame flicker. Transparency is faked with checker dither.
4. **Sprites animate at 8 fps** with 2–4 hand-drawn frames. UI moves in whole steps. No easing curves. Transitions are wipes and flashes; fades step through 4 palette levels.
5. **Our own bitmap font** (5×7 glyphs in a 6×8 cell, ALL CAPS). Text appears letter by letter at ~30 chars/s with a square-wave blip. Long text waits for ▼.
6. **No emoji, no icon sets.** Every icon is hand-placed pixels on an 8×8 grid.
7. **Specific, deadpan copy.** "GUS IS SCROLLING HIS PHONE." beats "The bouncer is distracted!" Lines are short, caps, no exclamation spam.
8. **Life in the details**: a stray cat on the dumpster that looks at whoever is moving, one letter of the sign that flickers, a puddle reflecting the neon, litter, Gus cracking his neck when idle.

## 3. Palette — "Velvet Night" (16 colours)

| # | Name | Hex | Use |
|---|---|---|---|
| 0 | INK | `#0e0a1a` | outlines, text on paper, darkest shadow |
| 1 | NIGHT | `#1d1633` | sky, deep shadow, box shadow |
| 2 | ASPHALT | `#2e2350` | street |
| 3 | ASPHALT_HI | `#463a6e` | street marks, curb top |
| 4 | STONE | `#6f6596` | sidewalk |
| 5 | STONE_HI | `#a69cc9` | sidewalk highlight, dim text |
| 6 | PAPER | `#f4ecd6` | text boxes, light text, highlights |
| 7 | BRICK | `#5a1f33` | club wall shade |
| 8 | BRICK_HI | `#8a3346` | club wall |
| 9 | VELVET | `#c4304f` | rope, curtains |
| 10 | NEON | `#ff4f9a` | the club sign, the one loud accent |
| 11 | LAMP | `#ffd25e` | streetlight, VIP gold, money |
| 12 | LAMP_LO | `#d97a2b` | gold shade, warm shadow |
| 13 | SAFE | `#5ff0c8` | "move now" (back turned), pass |
| 14 | ALERT | `#ff4a3d` | "!", watching, caught |
| 15 | SHADE | `#3a2b20` | wood, dumpster, dark skin shade |

Skin, hair and clothes for players come from small per-player ramps (§5). **Meaning of colour is fixed:** SAFE mint = go, ALERT red = danger, LAMP gold = VIP. Readable from the back row.

## 4. Type

- **Font:** in-house 5×7 caps, 6×8 cell, drawn in code (`web/src/pix/font.ts`). On the projector one glyph pixel = 6 screen pixels, so text is 48 px tall at 1080p.
- **Sizes:** 1× for dialog and HUD, 2× for banners ("CAUGHT!"), 3× only for the title.
- **Text box:** PAPER fill, 2 px INK double border with notched corners, INK text, ▼ blinking at 2 Hz at the bottom right. The speaker's name sits on the top border in a tab.

## 5. Characters

**Players (overworld, 16×16).** One body template, facing right (towards the door), plus a front pose.
- Frames: `walk A`, `walk B` (sneak: crouched, arms forward), `freeze` (mid-step + sweat drop), `front` (idle / caught with hands up), `cheer`.
- Variety: 6 hair styles × 6 hair colours × 8 tops × 6 skin tones = 1,728 looks from one sprite. Seeded by player id, so the phone and projector agree.
- Name tag: 1× text above the sprite, only for spotlighted players (the crowd would be unreadable otherwise).

**GUS the bouncer (overworld, 24×32)**, about twice a player's height so he reads as the boss.
- `back`: faces the door, his back towards the crowd. SECURITY print visible, phone glow by his head. **= safe.**
- `tell`: back sprite with his head turned to the side + gold "!" bubble. **= warning.**
- `watch`: faces the crowd, red lenses, red checker sightline band across the street. **= danger.**
- `point`, `sleep` (Zz bubble), `dance` (disco), `flattered`.
- **Portrait (48×48, drawn at 2× = 96×96 on the stare-down)** with 3 expressions: deadpan, suspicious, smug.

## 6. Screens

### Projector (320×180, 20×11 tiles of 16 px)
```
┌────────────────────────────────────────┐ rows 0-3  CLUB VELVET facade: brick, windows, neon sign, door + rope (right)
│ ▓▓ CLUB VELVET ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ [DOOR] VIP│
│ sidewalk ─────────────────── GUS  ║    │ row 4     sidewalk / curb
│ START  ☺ ☺  ☺   ☺ ☺ ☺   ☺  ☺ →  ║rope│ rows 5-8  the street: players creep right in 4 lanes
│ alley  ☺  ☺ ☺   ☺    ☺   ☺     ║    │
├────────────────────────────────────────┤
│ GUS: DID SOMEBODY... MOVE?          ▼  │ rows 9-10 text box (always there, it's Gus's voice)
└────────────────────────────────────────┘
```
- Top-right corner: **VIP LIST** box with the owner's name and the chaos rule.
- Up to three **STARE-DOWN insets** (small boxes) float over the street for caught players; the room keeps playing.
- Lobby: the same street, empty, with a big QR in a text box and "SCAN TO GET IN LINE".

### Phone (160 px wide, as tall as the phone allows)
- Top half: **the game screen** — a little window into the street (your sprite + Gus), with a status line.
- Bottom half: **one big pixel button**. HOLD TO SNEAK is a 96 px round button in PAPER/INK that turns ALERT red when Gus turns.
- Caught: velvet-curtain wipe, then the STARE-DOWN: Gus's portrait, your sprite, a text box, and the microgame meter (NERVE).
- Owner Console: a text box menu with ▶, three rows, a 12-second fuse drawn as a burning pixel line.

## 7. Motion and sound catalogue

| Name | Frames / time | Notes |
|---|---|---|
| sprite walk | 2 frames @ 8 fps | sneak walk |
| tell "!" | pop 2 frames, hold 600 ms | sting: two-note square blip, high |
| turn to watch | 1 frame swap + 2 px screen shake | low thud |
| caught | 3 white/red flashes @ 15 fps, then curtain wipe 400 ms | 3-note falling jingle |
| fling | arc in 8 fps steps, sprite flips every frame, "POOF" smoke 3 frames | whoosh = noise burst |
| text | 30 chars/s, blip every 2nd char | pitch per speaker (Gus low) |
| VIP entry | rope drops 2 frames, gold flash, sprite struts in | 4-note up arpeggio |
| disco | floor palette cycles every 125 ms | |

## 8. Out of scope for Phase 1
Real networking, Claude calls, scoring. Everything is local mock data with a dev bar (keys 1–9) to jump between states.
