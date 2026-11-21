# Gus's voice (Claude)

Claude writes the roasts, taunts, commentary and mugshots. **Gameplay never waits on it.** Every call has a hard 4-second timeout and returns `null` on any failure. The room then keeps the scripted line it already has (`server/ai/fallbacks.ts`).

## Setup

| Env var | Default | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | none | The only required variable. Without it the game runs on scripted lines and `/admin.html` shows a red banner |
| `BOUNCER_MODEL` | `claude-haiku-5-5` | `claude-sonnet-5-5` or `claude-opus-5-5` for sharper roasts, no code change |
| `BOUNCER_AI` | live | `mock` = instant tagged test lines (tests, E2E), `off` = scripted lines only |

## Calls

| Call | When | What it returns |
| --- | --- | --- |
| Round script (3 calls in parallel) | Round or solo level start | Opener, taunts, fake-out lines, turn lines, one announcement per chaos rule, NPC names |
| Catch roasts | The moment of a catch (batched per tick), generated **during** the 5 s challenge | A pass line and a fail line per caught player, so the result is instant either way |
| Commentary | Every 10 s of play | One ticker line, Gus's inner monologue for the HUD, and stat nudges (±0.2) that change his behaviour |
| Finale | At the buzzer (groups of 4 players in parallel) | Closing line and a mugshot receipt per player: title, roast, threat rating |

Answers carry the round number. A late answer from a previous round is dropped. A roast that arrives after the challenge ended is not used.

## Request shape

`client.messages.parse` with structured output (`output_config.format: zodOutputFormat(schema)`), `effort: 'low'`, and `thinking: {type: 'disabled'}` on Haiku only (Sonnet/Opus 5.5 reject it). The system prompt is frozen per call type and cached. Event data, including player names, goes in the user message as JSON and is explicitly marked as data. Output is validated again with zod, then cleaned: ALL CAPS, only characters the bitmap font has, at most 16 words / 90 characters, plus a banned-word filter. Any failure leaves the scripted line in place.

Tone rules in every prompt: PG-13, roast the move (the sneaking, the dancing, the bribe), never identity, appearance, body, age, ethnicity, gender, religion, disability, or anyone's family.

## Cost and checks

- `npm run eval:bouncer`: 20 fixed scenarios against the real API (round script, single/triple catch, repeat offender, statue-freezer, owner rule, finale, solo guard persona, two prompt-injection names). It checks JSON validity, length, a guardrail word list and latency. Last run on Haiku 5.5: 27/27 calls valid, p50 1.3 s, p95 2.7 s, **$0.005** for the whole eval.
- A round costs roughly 15–30 calls at about $0.0002 each. The host page (`/admin.html`) shows live calls, fallbacks, tokens, cost and latency.
- Tests never call the API (`MockVoice`).
