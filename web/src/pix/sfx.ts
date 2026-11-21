/** Square-wave chip sounds. Browsers need one user gesture first: call unlock() on pointerdown. */
let ac: AudioContext | null = null;
let muted = false;

export function unlock() {
  if (!ac) ac = new AudioContext();
  if (ac.state === 'suspended') void ac.resume();
}
export function setMuted(m: boolean) { muted = m; }

function tone(freq: number, dur: number, when = 0, type: OscillatorType = 'square', vol = 0.06) {
  if (!ac || muted) return;
  const t0 = ac.currentTime + when;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(vol, t0);
  g.gain.setValueAtTime(0, t0 + dur); // hard stop, no fade: it's a chip
  o.connect(g).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.01);
}

function noise(dur: number, vol = 0.05) {
  if (!ac || muted) return;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < len; i++) { if (i % 8 === 0) v = Math.random() * 2 - 1; d[i] = v * (1 - i / len); }
  const s = ac.createBufferSource();
  const g = ac.createGain();
  g.gain.value = vol;
  s.buffer = buf;
  s.connect(g).connect(ac.destination);
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
  nerd: () => [0, 0.12, 0.24].forEach((w) => tone(220, 0.08, w, 'sawtooth', 0.05)),
};
