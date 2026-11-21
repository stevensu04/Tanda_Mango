# Recording Gus's hum

**Status: still needed.** The build plays a synthesised stand-in hum (`web/src/club-audio.ts`, `hum()`). A real, licensed human take replaces only the hum; the beat, the door, and the audition line "I saw that… Cute shoes, though." stay as they are.

## The moment

Gus has been standing at the door a long time. The club's song leaks through the door behind him, and without thinking he hums along with its hook. Then he notices someone might be listening and stops. The take should sound relaxed and private, not performed. Don't make it cute and don't laugh.

## What to hum

- The club hook's three notes, contour **re – fa – mi** (in the game: D – F – E). Pick whatever octave sits comfortably in the actor's voice; the game's version is D3 F3 E3.
- Keep the mouth **closed** ("mm – mm – mmm"), at a soft, speaking-level volume.
- Timing at **118 BPM** (one beat ≈ 0.51 s):
  - "mm" on beat 1, short (about 0.3 s)
  - "mm" on the "and" of 1, short
  - the last "mmm" comes **half a beat late** (on the "and" of 2 rather than on 2), then fades out gently and stops, as if he caught himself
- The whole thing lasts about 1.5–2 s. Play a 118 BPM click or the game's Test sound in headphones so the take lines up with the song.

## Takes

Record at least two:
1. **Absent-minded:** he's barely aware he's humming.
2. **Caught:** the same, but the last note stops a little sooner, as if he just noticed someone listening.

Pick the more natural one. Keep the other as a spare.

## Format and delivery

- Dry voice only: no music, no reverb, no processing beyond light noise removal. A quiet room and a phone held about 20 cm away is fine.
- WAV, mono, 44.1 or 48 kHz, 16- or 24-bit. Trim to about 0.1 s before the first "mm". Peaks around −6 dBFS.
- Get written permission from the performer for use in this game (and say whether that covers public showings). Add their name, the date and the terms to `docs/ASSETS.md`.

## Dropping it in

1. Save the file as `web/public/audio/gus-hum.wav`.
2. In `web/src/club-audio.ts`, set `HUM_FILE = 'gus-hum.wav'`, and set `HUM_ONSET` to the time in seconds where the first "mm" starts in the file. The game shifts the take so that note lands on the bar.
3. Click Test sound on the projector and listen: muffled beat → hum → clasp and door → audition line.
