/**
 * Square-wave chip sounds, plus the mixer every sound goes through. Browsers need one user gesture
 * first: call unlock() on pointerdown.
 *
 *   source -> group gain (amb | gus | alert) -> master -> speakers
 *
 * Phones only ever use the alert group at full volume. The projector sets the three group volumes
 * and the master mute from its sound panel (see web/src/club-audio.ts).
 */
let ac: AudioContext | null = null;
let muted = false;
export type Group = 'amb' | 'gus' | 'alert';
const level: Record<Group | 'master', number> = { amb: 1, gus: 1, alert: 1, master: 1 };
let master: GainNode | null = null;
const groups: Partial<Record<Group, GainNode>> = {};

export function unlock() {
  if (!ac) ac = new AudioContext();
  if (ac.state === 'suspended') void ac.resume();
}
/** The shared AudioContext (null until the first gesture). */
export const audio = () => ac;
/** True once the browser lets us play (after a gesture on this page load). */
export const audioRunning = () => !!ac && ac.state === 'running';

function masterNode(): GainNode {
  if (!master) { master = ac!.createGain(); master.gain.value = muted ? 0 : level.master; master.connect(ac!.destination); }
  return master;
}
/** Where a sound of this group should connect. */
export function out(g: Group): AudioNode {
  let n = groups[g];
  if (!n) { n = ac!.createGain(); n.gain.value = level[g]; n.connect(masterNode()); groups[g] = n; }
  return n;
}
/** The master output (recording taps here). */
export const masterOut = () => (ac ? masterNode() : null);
export function setLevel(g: Group | 'master', v: number) {
  level[g] = Math.max(0, Math.min(1, v));
  if (!ac) return;
  const node = g === 'master' ? master : groups[g];
  if (node) node.gain.setTargetAtTime(g === 'master' && muted ? 0 : level[g], ac.currentTime, 0.02);
}
export const getLevel = (g: Group | 'master') => level[g];
export function setMuted(m: boolean) {
  muted = m;
  if (ac && master) master.gain.setTargetAtTime(m ? 0 : level.master, ac.currentTime, 0.02);
}
export const isMuted = () => muted;

function tone(freq: number, dur: number, when = 0, type: OscillatorType = 'square', vol = 0.06) {
  if (!ac) return;
  const t0 = ac.currentTime + when;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(vol, t0);
  g.gain.setValueAtTime(0, t0 + dur); // hard stop, no fade: it's a chip
  o.connect(g).connect(out('alert'));
  o.start(t0);
  o.stop(t0 + dur + 0.01);
}

function noise(dur: number, vol = 0.05) {
  if (!ac) return;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < len; i++) { if (i % 8 === 0) v = Math.random() * 2 - 1; d[i] = v * (1 - i / len); }
  const s = ac.createBufferSource();
  const g = ac.createGain();
  g.gain.value = vol;
  s.buffer = buf;
  s.connect(g).connect(out('alert'));
  s.start();
}

export const sfx = {
  blip: (low = false) => tone(low ? 140 : 520, 0.025, 0, 'square', 0.035),
  tell: () => { tone(988, 0.06); tone(1319, 0.09, 0.07); },
  turn: () => { tone(98, 0.08, 0, 'triangle', 0.2); noise(0.05, 0.04); },
  caught: () => { tone(659, 0.08); tone(523, 0.08, 0.09); tone(392, 0.16, 0.18); },
  fling: () => noise(0.35, 0.06),
  pass: () => { tone(523, 0.06); tone(784, 0.1, 0.07); },
  vip: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.08, i * 0.08)),
  tap: () => tone(330 + Math.random() * 80, 0.02, 0, 'square', 0.03),
  coin: () => { tone(988, 0.04); tone(1568, 0.08, 0.04); },
  beat: (i: number) => { const bass = [110, 110, 147, 110, 131, 110, 165, 147][i % 8]; tone(bass, 0.1, 0, 'square', 0.05); if (i % 2) tone(1760, 0.015, 0, 'square', 0.02); },
  nerd: () => [0, 0.12, 0.24].forEach((w) => tone(220, 0.08, w, 'sawtooth', 0.05)),
};
