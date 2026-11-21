/**
 * Club Velvet's sound, projector only: "standing outside a club, hearing the dance floor through the door".
 *
 * Everything here is synthesised in code (original, no samples) except Gus's audition line, a WAV the
 * team generated for this game (see web/public/audio/SOURCES.md). Phones never run this file: they keep
 * their own short chip cues for personal feedback.
 *
 *   music (one scheduler, never restarts) -> door filter -> amb group
 *   street layer (murmur, footsteps, cloth, stanchion clinks) ----> amb group (ducked when Gus turns)
 *   Gus: hum + audition WAV -------------------------------------> gus group
 *   door/clasp/sting -------------------------------------------> alert group
 *
 * The hook is three hummable notes, re-fa-mi (D4 F4 E4), over a 118 BPM four-on-the-floor beat.
 * Gus hums the same three notes (lower, closed mouth) so the room recognises the song when the door opens.
 */
import { audio, audioRunning, out } from './pix/sfx';

const BPM = 118;
const BEAT = 60 / BPM;
const SIX = BEAT / 4;                    // one 16th
const CLOSED_HZ = 300;                   // behind the door (two stages, 24 dB/oct): kick, bass and a hint of the hook
const OPEN_HZ = 11000;
const AJAR_HZ = 1300;                    // Disco Mode: somebody propped the door

export type Scene = 'street' | 'vote' | 'quiet';
interface Mix { kick: number; clap: number; hat: number; bass: number; lead: number }
const SCENES: Record<Scene, Mix> = {
  street: { kick: 1, clap: 0.8, hat: 0.7, bass: 0.9, lead: 1 },
  vote: { kick: 0.45, clap: 0, hat: 0, bass: 0.25, lead: 0 },    // leave room for talk
  quiet: { kick: 0, clap: 0, hat: 0, bass: 0, lead: 0 },
};

// D minor-ish loop, 4 bars: roots of Dm, Bb, F, C
const ROOTS = [73.42, 58.27, 87.31, 65.41];
const HOOK = [{ f: 293.66, at: 0, len: 0.5 }, { f: 349.23, at: 0.5, len: 0.5 }, { f: 329.63, at: 1, len: 1.5 }]; // in beats

let started = false;
let scene: Scene = 'street';
let mix: Mix = { ...SCENES.street };
let step = 0;                            // 16th counter since start
let nextAt = 0;
let timer: number | null = null;
let musicIn: GainNode, door: BiquadFilterNode, door2: BiquadFilterNode, musicOut: GainNode, ambDuck: GainNode, streetIn: GainNode, voiceDuck: GainNode;
const SHUT_GAIN = 0.3, OPEN_GAIN = 1.0;  // a wall takes everything down, highs most: the open door is ~10 dB louder and much brighter
/** Move both door filter stages together. */
function doorTo(hz: number, at: number, ramp: 'exp' | 'set' | 'target', tc = 0.3) {
  for (const f of [door, door2]) {
    if (ramp === 'exp') f.frequency.exponentialRampToValueAtTime(hz, at);
    else if (ramp === 'set') f.frequency.setValueAtTime(hz, at);
    else f.frequency.setTargetAtTime(hz, at, tc);
  }
}
let doorBase = CLOSED_HZ;
let doorOpenUntil = 0;
let ducked = false;
let nextStreet = 0;
let noiseBuf: AudioBuffer | null = null;
let wav: AudioBuffer | null = null;
let wavLoading: Promise<void> | null = null;
let gusVoiceUntil = 0;                   // audio-clock time Gus's hum/WAV ends: TTS waits for it
let humStop: (() => void) | null = null;
const HUM_PEAK = 0.11;                   // ~13 dB under the first version: humming to himself, under his speaking voice
let lastHumAt = 0;                       // audio-clock time the last hum starts (for the preview's cue marks)
export const humStartedAt = () => lastHumAt;
const live = new Set<AudioScheduledSourceNode>(); // one-shots, so a preview Stop can cut them

const ctx = () => audio()!;
const now = () => ctx().currentTime;

function track<T extends AudioScheduledSourceNode>(n: T): T {
  live.add(n);
  n.addEventListener('ended', () => live.delete(n));
  return n;
}

function noise(): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const a = ctx();
  const len = a.sampleRate * 2;
  noiseBuf = a.createBuffer(1, len, a.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** Start the club (idempotent). Needs an unlocked AudioContext. */
export function startClub() {
  const a = audio();
  if (!a || started) return;
  started = true;
  musicIn = a.createGain();
  door = a.createBiquadFilter();
  door.type = 'lowpass';
  door.frequency.value = CLOSED_HZ;
  door.Q.value = 0.9;
  door2 = a.createBiquadFilter();
  door2.type = 'lowpass';
  door2.frequency.value = CLOSED_HZ;
  door2.Q.value = 0.6;
  musicOut = a.createGain();
  musicOut.gain.value = SHUT_GAIN;
  ambDuck = a.createGain();
  voiceDuck = a.createGain();
  streetIn = a.createGain();
  streetIn.gain.value = 1;
  musicIn.connect(door).connect(door2).connect(musicOut).connect(ambDuck);
  streetIn.connect(ambDuck);
  ambDuck.connect(voiceDuck).connect(out('amb'));
  startMurmur();
  nextAt = a.currentTime + 0.1;
  nextStreet = a.currentTime + 1.5;
  timer = window.setInterval(pump, 25);
}
export const clubStarted = () => started;

function pump() {
  const a = audio();
  if (!a || a.state !== 'running') return;
  while (nextAt < a.currentTime + 0.15) { playStep(step, nextAt); step++; nextAt += SIX; }
  if (a.currentTime > nextStreet) { streetEvent(nextStreet); nextStreet = a.currentTime + 1.2 + Math.random() * 4.5; }
  if (doorOpenUntil && a.currentTime > doorOpenUntil) { doorOpenUntil = 0; closeDoor(); }
}

// ---------- the band ----------
function playStep(i: number, t: number) {
  const s16 = i % 16, beat = Math.floor(s16 / 4), bar = Math.floor(i / 16);
  if (s16 % 4 === 0 && mix.kick) kick(t, mix.kick);
  if ((beat === 1 || beat === 3) && s16 % 4 === 0 && mix.clap) clap(t, mix.clap);
  if (s16 % 4 === 2 && mix.hat) hat(t, mix.hat);
  if (s16 % 2 === 0 && mix.bass) bass(t, ROOTS[bar % 4] * (s16 % 4 === 2 ? 2 : 1), mix.bass);
  // the hook every other bar, on beat 1
  if (s16 === 0 && bar % 2 === 0 && mix.lead) for (const n of HOOK) lead(t + n.at * BEAT, n.f, n.len * BEAT, mix.lead);
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function kick(t: number, v: number) {
  const a = ctx(), o = a.createOscillator(), g = a.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  env(g, t, 0.9 * v, 0.003, 0.32);
  o.connect(g).connect(musicIn);
  o.start(t); o.stop(t + 0.4);
}
function clap(t: number, v: number) {
  const a = ctx(), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
  env(g, t, 0.5 * v, 0.002, 0.16);
  s.connect(f).connect(g).connect(musicIn);
  s.start(t, Math.random()); s.stop(t + 0.2);
}
function hat(t: number, v: number) {
  const a = ctx(), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise(); f.type = 'highpass'; f.frequency.value = 7000;
  env(g, t, 0.24 * v, 0.001, 0.045);
  s.connect(f).connect(g).connect(musicIn);
  s.start(t, Math.random()); s.stop(t + 0.07);
}
function bass(t: number, hz: number, v: number) {
  const a = ctx(), o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
  o.type = 'sawtooth'; o.frequency.value = hz;
  f.type = 'lowpass'; f.frequency.value = 420;
  env(g, t, 0.28 * v, 0.005, SIX * 1.6);
  o.connect(f).connect(g).connect(musicIn);
  o.start(t); o.stop(t + SIX * 2);
}
function lead(t: number, hz: number, len: number, v: number) {
  const a = ctx(), o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain();
  o.type = 'square'; o.frequency.value = hz;
  o2.type = 'triangle'; o2.frequency.value = hz * 2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.24 * v, t + 0.01);
  g.gain.setValueAtTime(0.18 * v, t + len * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g); o2.connect(g); g.connect(musicIn);
  o.start(t); o2.start(t); o.stop(t + len + 0.02); o2.stop(t + len + 0.02);
}

// ---------- the street: low murmur plus sparse, irregular one-shots (no loop seam to hear) ----------
function startMurmur() {
  const a = ctx(), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
  s.buffer = noise(); s.loop = true;
  s.loopEnd = 2; s.playbackRate.value = 0.37; // slowed noise -> darker, less hiss
  f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.6;
  g.gain.value = 0.05;
  lfo.frequency.value = 0.13; lg.gain.value = 0.02;
  lfo.connect(lg).connect(g.gain);
  s.connect(f).connect(g).connect(streetIn);
  s.start(); lfo.start();
}
function streetEvent(t: number) {
  const r = Math.random();
  if (r < 0.55) footsteps(t, 2 + Math.floor(Math.random() * 3));
  else if (r < 0.8) cloth(t);
  else clink(t, 0.5);
}
function panned(p: number): StereoPannerNode {
  const n = ctx().createStereoPanner();
  n.pan.value = p;
  n.connect(streetIn);
  return n;
}
function footsteps(t: number, n: number) {
  const a = ctx(), pan = panned(Math.random() * 1.6 - 0.8), gap = 0.42 + Math.random() * 0.12, v = 0.25 + Math.random() * 0.2;
  for (let i = 0; i < n; i++) {
    const at = t + i * gap + Math.random() * 0.03;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noise(); f.type = 'lowpass'; f.frequency.value = 700 + Math.random() * 500;
    env(g, at, v * (0.8 + Math.random() * 0.4), 0.002, 0.07);
    s.connect(f).connect(g).connect(pan);
    s.start(at, Math.random()); s.stop(at + 0.1);
  }
}
function cloth(t: number) {
  const a = ctx(), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 1.2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.12);
  g.gain.linearRampToValueAtTime(0.0001, t + 0.35);
  s.connect(f).connect(g).connect(panned(Math.random() * 1.4 - 0.7));
  s.start(t, Math.random()); s.stop(t + 0.4);
}
/** Metal stanchion / rope clasp: a few inharmonic partials. dest: street (ambient) or alert (the real clasp). */
function clink(t: number, v: number, dest?: AudioNode) {
  const a = ctx(), g = a.createGain();
  g.gain.value = v;
  g.connect(dest ?? panned(Math.random() * 1.2 - 0.6));
  for (const [hz, d, amp] of [[2150, 0.35, 0.12], [3240, 0.22, 0.08], [4710, 0.15, 0.06], [6020, 0.08, 0.04]]) {
    const o = track(a.createOscillator()), e = a.createGain();
    o.frequency.value = hz * (0.98 + Math.random() * 0.04);
    env(e, t, amp, 0.001, d);
    o.connect(e).connect(g);
    o.start(t); o.stop(t + d + 0.05);
  }
}

// ---------- scenes and the door ----------
export function setScene(s: Scene) {
  if (!started) { scene = s; mix = { ...SCENES[s] }; return; }
  scene = s;
  mix = { ...SCENES[s] };
}
export const currentScene = () => scene;

/** Disco Mode props the door open a crack; otherwise it is shut. */
export function setAjar(on: boolean) {
  doorBase = on ? AJAR_HZ : CLOSED_HZ;
  if (started && !doorOpenUntil) doorTo(doorBase, now(), 'target');
}

/**
 * Someone got in: the rope clasp clicks, the door swings open and the SAME beat becomes clear,
 * then the door shuts and it is muffled again. The beat never restarts.
 */
export function doorOpen(secs: number, big = true) {
  const a = audio();
  if (!a || !started) return;
  const t = a.currentTime + 0.02;
  if (doorOpenUntil > t) {
    // already open (several got in at once): the clasp clicks again, the door just stays open longer
    clink(t, 0.5, out('alert'));
    doorOpenUntil = Math.max(doorOpenUntil, t + secs);
    return;
  }
  clink(t, big ? 1 : 0.7, out('alert'));                         // the clasp
  // latch + hinge creak
  const s = track(a.createBufferSource()), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise(); f.type = 'bandpass'; f.frequency.setValueAtTime(900, t + 0.12); f.frequency.linearRampToValueAtTime(500, t + 0.5); f.Q.value = 6;
  env(g, t + 0.12, big ? 0.22 : 0.14, 0.04, 0.4);
  s.connect(f).connect(g).connect(out('alert'));
  s.start(t + 0.12, Math.random()); s.stop(t + 0.7);
  for (const f of [door, door2]) { f.frequency.cancelScheduledValues(t); f.frequency.setValueAtTime(f.frequency.value, t + 0.18); }
  doorTo(OPEN_HZ, t + 0.3, 'exp');
  musicOut.gain.cancelScheduledValues(t);
  musicOut.gain.setValueAtTime(musicOut.gain.value, t + 0.18);
  musicOut.gain.linearRampToValueAtTime(big ? OPEN_GAIN : OPEN_GAIN * 0.85, t + 0.3);
  doorOpenUntil = t + 0.3 + secs;
}
function closeDoor() {
  const a = ctx(), t = a.currentTime;
  for (const f of [door, door2]) { f.frequency.cancelScheduledValues(t); f.frequency.setValueAtTime(Math.max(f.frequency.value, doorBase), t); }
  doorTo(doorBase, t + 0.45, 'exp');
  musicOut.gain.cancelScheduledValues(t);
  musicOut.gain.setValueAtTime(musicOut.gain.value, t);
  musicOut.gain.linearRampToValueAtTime(SHUT_GAIN, t + 0.45);
  // the door thuds shut
  const o = track(a.createOscillator()), g = a.createGain();
  o.frequency.setValueAtTime(90, t + 0.4); o.frequency.exponentialRampToValueAtTime(50, t + 0.55);
  env(g, t + 0.4, 0.35, 0.004, 0.2);
  o.connect(g).connect(out('alert'));
  o.start(t + 0.4); o.stop(t + 0.7);
}

/** Gus is about to turn: pull the background down so the turn cue cuts through. */
export function duck(on: boolean) {
  if (!started || on === ducked) return;
  ducked = on;
  const t = now();
  ambDuck.gain.cancelScheduledValues(t);
  ambDuck.gain.setValueAtTime(ambDuck.gain.value, t);
  ambDuck.gain.linearRampToValueAtTime(on ? 0.22 : 1, t + (on ? 0.06 : 0.7));
}

/** Short reveal sting: room for the winner's name and the cheering right after. */
export function sting() {
  const a = audio();
  if (!a || !started) return;
  const t = a.currentTime + 0.02;
  [293.66, 369.99, 440, 587.33].forEach((hz, i) => {
    const o = track(a.createOscillator()), g = a.createGain();
    o.type = i % 2 ? 'triangle' : 'square'; o.frequency.value = hz;
    env(g, t + i * 0.06, 0.09, 0.005, 0.9);
    o.connect(g).connect(out('alert'));
    o.start(t + i * 0.06); o.stop(t + 1.1);
  });
  const s = track(a.createBufferSource()), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise(); f.type = 'highpass'; f.frequency.value = 4000;
  env(g, t + 0.18, 0.12, 0.003, 1.1);
  s.connect(f).connect(g).connect(out('alert'));
  s.start(t + 0.18); s.stop(t + 1.4);
}

// ---------- Gus ----------
/** Next bar where the hook plays (even bars), on the music clock: Gus hums along with the song behind the door. */
function nextBar(min = 0.15): number {
  const a = ctx();
  let k = Math.ceil(step / 16) * 16;                      // next bar line not yet scheduled
  let t = nextAt + (k - step) * SIX;
  while (t < a.currentTime + min || (k / 16) % 2 !== 0) { k += 16; t += SIX * 16; }
  return t;
}

/**
 * Gus hums the hook with his mouth closed ("mm-mm-mmm"), an octave down; the last note comes half a
 * beat late and stops short, as if he noticed someone watching. Returns its length in seconds.
 */
export function hum(onBeat = true): number {
  const a = audio();
  if (!a || !started) return 0;
  stopHum();
  const t0 = onBeat ? nextBar() : a.currentTime + 0.05;
  lastHumAt = t0;
  if (humTake) return playHumTake(t0);
  const notes = [{ f: 146.83, at: 0, len: 0.42 }, { f: 174.61, at: 0.5, len: 0.42 }, { f: 164.81, at: 1.5, len: 0.55, cut: true }];
  const bus = a.createGain();
  bus.gain.value = 1;
  // closed-mouth voice: buzzy source, nasal formants, no bright edge
  const f1 = a.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.value = 650; f1.Q.value = 1.1;
  const f2 = a.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 260; f2.gain.value = 9; f2.Q.value = 1.4;
  const f3 = a.createBiquadFilter(); f3.type = 'peaking'; f3.frequency.value = 2500; f3.gain.value = -12;
  bus.connect(f1).connect(f2).connect(f3).connect(out('gus'));
  const oscs: OscillatorNode[] = [];
  for (const n of notes) {
    const t = t0 + n.at * BEAT, len = n.len * BEAT * 1.6;
    const o = track(a.createOscillator()), sub = track(a.createOscillator()), vib = track(a.createOscillator()), vg = a.createGain(), g = a.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(n.f * 0.97, t); o.frequency.linearRampToValueAtTime(n.f, t + 0.06); // scoop up into the note
    sub.type = 'sine'; sub.frequency.value = n.f;
    vib.frequency.value = 5.2; vg.gain.value = n.f * 0.006;
    vib.connect(vg); vg.connect(o.frequency); vg.connect(sub.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(HUM_PEAK, t + 0.07);            // "m" onset, soft
    if (n.cut) {
      g.gain.setValueAtTime(HUM_PEAK, t + len * 0.45);
      g.gain.linearRampToValueAtTime(0.0001, t + len * 0.55);      // ...and he stops
      o.frequency.linearRampToValueAtTime(n.f * 0.94, t + len * 0.55);
    } else {
      g.gain.setValueAtTime(HUM_PEAK * 0.84, t + len * 0.7);
      g.gain.linearRampToValueAtTime(0.0001, t + len);
    }
    o.connect(g); sub.connect(g); g.connect(bus);
    for (const x of [o, sub, vib]) { x.start(t); x.stop(t + len + 0.05); oscs.push(x); }
  }
  const end = t0 + 1.5 * BEAT + 0.55 * BEAT * 1.6 * 0.55;
  gusVoiceUntil = Math.max(gusVoiceUntil, end);
  underGus(t0, end - t0);
  humStop = () => { const t = a.currentTime; bus.gain.setTargetAtTime(0, t, 0.02); oscs.forEach((o) => { try { o.stop(t + 0.1); } catch { /* done */ } }); gusVoiceUntil = t; };
  return end - a.currentTime;
}
export function stopHum() {
  if (!humStop) return;
  humStop(); humStop = null;
  const t = now();
  voiceDuck.gain.cancelScheduledValues(t); voiceDuck.gain.setTargetAtTime(1, t, 0.15); // the club comes back up
}

// ---------- a real hum take (drop-in) ----------
/**
 * When an actor's hum is recorded (see docs/GUS-HUM-RECORDING.md), put it at web/public/audio/gus-hum.wav
 * and set HUM_FILE to its name. HUM_ONSET is where the first "mm" starts in the file, in seconds: the
 * take is shifted so that note lands on the bar, in time with the song behind the door. Until then
 * (HUM_FILE = null, nothing is fetched) Gus hums with the synthesised voice above: a stand-in.
 */
const HUM_FILE: string | null = null;
const HUM_ONSET = 0.0;
let humTake: AudioBuffer | null = null;
export const humIsRecorded = () => !!humTake;
export function loadHum(): Promise<void> {
  const a = audio();
  if (!a || !HUM_FILE || humTake) return Promise.resolve();
  return fetch(`${import.meta.env.BASE_URL}audio/${HUM_FILE}`).then((r) => r.arrayBuffer()).then((b) => a.decodeAudioData(b)).then((buf) => { humTake = buf; }).catch(() => { /* keep the stand-in */ });
}
function playHumTake(t0: number): number {
  const a = ctx();
  const s = track(a.createBufferSource()), g = a.createGain();
  s.buffer = humTake;
  s.connect(g).connect(out('gus'));
  const start = Math.max(a.currentTime + 0.02, t0 - HUM_ONSET);
  s.start(start);
  gusVoiceUntil = Math.max(gusVoiceUntil, start + humTake!.duration);
  underGus(start, humTake!.duration);
  humStop = () => { const t = a.currentTime; g.gain.setTargetAtTime(0, t, 0.03); try { s.stop(t + 0.15); } catch { /* done */ } gusVoiceUntil = t; };
  return start + humTake!.duration - a.currentTime;
}

/** Load Gus's audition line (Grady, "I saw that... Cute shoes, though."). */
export function loadAudition(): Promise<void> {
  const a = audio();
  if (!a) return Promise.resolve();
  if (wav) return Promise.resolve();
  wavLoading ??= fetch(`${import.meta.env.BASE_URL}audio/gus-audition-grady.wav`)
    .then((r) => r.arrayBuffer()).then((b) => a.decodeAudioData(b)).then((buf) => { wav = buf; })
    .catch(() => { wavLoading = null; });
  return wavLoading;
}
/** Play the audition line now. Returns its length (0 if not loaded or Gus is mid-line). */
export function audition(force = false): number {
  const a = audio();
  if (!a || !wav || (!force && a.currentTime < gusVoiceUntil)) return 0;
  const s = track(a.createBufferSource()), g = a.createGain();
  s.buffer = wav;
  g.gain.value = 1.8;                        // the take averages -23 dB: +5 dB keeps its peaks under -1.5 dBFS
  s.connect(g).connect(out('gus'));
  const t = a.currentTime + 0.05;
  s.start(t);
  gusVoiceUntil = t + wav.duration;
  underGus(t, wav.duration);
  return wav.duration;
}
/** Pull the club bed down ~4.4 dB while Gus hums or talks, so he is heard over it. */
function underGus(t: number, secs: number) {
  if (!started) return;
  voiceDuck.gain.cancelScheduledValues(t - 0.05);
  voiceDuck.gain.setValueAtTime(voiceDuck.gain.value, t - 0.05);
  voiceDuck.gain.linearRampToValueAtTime(0.6, t + 0.05);
  voiceDuck.gain.setValueAtTime(0.6, t + secs);
  voiceDuck.gain.linearRampToValueAtTime(1, t + secs + 0.4);
}

/** Seconds until Gus's hum/WAV is done (the TTS voice waits for this). */
export function gusBusyFor(): number {
  const a = audio();
  return a ? Math.max(0, gusVoiceUntil - a.currentTime) : 0;
}

/** Cut every one-shot in flight (preview Stop). The beat and the street keep going. */
export function stopOneShots() {
  stopHum();
  for (const n of live) { try { n.stop(); } catch { /* not started */ } }
  live.clear();
  gusVoiceUntil = 0;
  if (started) {
    doorOpenUntil = 0;
    const t = now();
    for (const f of [door, door2]) f.frequency.cancelScheduledValues(t);
    doorTo(doorBase, t, 'set');
    musicOut.gain.cancelScheduledValues(t); musicOut.gain.setValueAtTime(SHUT_GAIN, t);
    voiceDuck.gain.cancelScheduledValues(t); voiceDuck.gain.setValueAtTime(1, t);
    ambDuck.gain.cancelScheduledValues(t); ambDuck.gain.setValueAtTime(1, t); ducked = false;
  }
}

export const isRunning = audioRunning;
export const _debug = () => ({ now: audio()?.currentTime ?? 0, hum: humTake ? 'recorded' : 'synth stand-in', oneShots: live.size, started, scene, ducked, door: started ? Math.round(door.frequency.value) : 0, door2: started ? Math.round(door2.frequency.value) : 0, gusBusy: gusBusyFor(), timer: timer !== null });
