/**
 * Motion sensing for Shake. `request()` must be called inside a user gesture (iOS asks for permission there).
 * A phone counts as having sensors only once a real sample with numbers arrives; plain-http LAN phones
 * usually never get one, and they play Mash instead.
 */
const NOISE = 0.35;       // per-sample jerk below this is hand tremor
const FULL = 40;          // summed jerk over ~100 ms that counts as "hard shaking"

export interface Sensors {
  readonly ok: boolean;
  request(): Promise<boolean>;
  /** Shake energy since the last call, 0..1 (hard shaking ~ 1, a resting phone ~ 0). */
  drain(): number;
}

export function createSensors(onFirstSample: () => void): Sensors {
  let ok = false;
  let attached = false;
  let acc = 0;
  let last: [number, number, number] | null = null;
  let waiters: ((v: boolean) => void)[] = [];

  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity ?? e.acceleration;
    if (!a || typeof a.x !== 'number' || typeof a.y !== 'number' || typeof a.z !== 'number') return;
    if (!ok) { ok = true; onFirstSample(); waiters.forEach((w) => w(true)); waiters = []; }
    if (last) acc += Math.max(0, Math.hypot(a.x - last[0], a.y - last[1], a.z - last[2]) - NOISE);
    last = [a.x, a.y, a.z];
  };
  const attach = () => {
    if (attached || typeof window === 'undefined') return;
    attached = true;
    window.addEventListener('devicemotion', onMotion);
  };

  const DME = (typeof DeviceMotionEvent === 'undefined' ? undefined : DeviceMotionEvent) as unknown as { requestPermission?: () => Promise<string> } | undefined;
  // Android and desktop need no permission: listen from the start so the first sample can reach the server early.
  if (DME && typeof DME.requestPermission !== 'function') attach();

  return {
    get ok() { return ok; },
    async request() {
      if (ok) return true;
      if (!DME) return false;
      try {
        if (typeof DME.requestPermission === 'function') {
          const r = await DME.requestPermission();
          if (r !== 'granted') return false;
        }
      } catch { return false; }
      attach();
      if (ok) return true;
      return new Promise<boolean>((resolve) => {
        waiters.push(resolve);
        setTimeout(() => { waiters = waiters.filter((w) => w !== resolve); resolve(ok); }, 1500);
      });
    },
    drain() {
      const e = Math.max(0, Math.min(1, acc / FULL));
      acc = 0;
      return e;
    },
  };
}
