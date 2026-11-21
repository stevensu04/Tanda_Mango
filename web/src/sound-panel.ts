/**
 * The projector's small control strip (bottom-left, out of the game art):
 *   ▶ TEST SOUND / ■ STOP   ! TEST TURN ALERT   ♪ MIX (ambience, Gus voice, game alerts, mute)   ↻ REFRESH
 * plus a big "RESUME SOUND" button whenever the browser has not let us play yet (fresh load, refresh).
 * Nothing here talks to the server: testing sound never starts a round or changes the room.
 */
import { C } from './pix/palette';
import { audio, unlock, audioRunning, setLevel, getLevel, setMuted, isMuted, sfx, type Group } from './pix/sfx';
import { startClub, loadAudition, loadHum, humStartedAt, hum, doorOpen, audition, duck, stopOneShots, setScene } from './club-audio';

const KEY = 'club-velvet-mix';
type Saved = { amb: number; gus: number; alert: number; muted: boolean };
const DEFAULTS: Saved = { amb: 0.8, gus: 1, alert: 0.8, muted: false };

export interface PanelHooks {
  inLobby(): boolean;
  /** visual cue on the big screen for the turn-alert test */
  showTurnTest(): void;
  onMuteChange(m: boolean): void;
}

let timers: number[] = [];
/** Where the last preview put each moment, on the audio clock (the sound check labels its recording with these). */
export const previewMarks: { what: string; at: number }[] = [];
const mark = (what: string, at = audio()?.currentTime ?? 0) => previewMarks.push({ what, at });
let previewing = false;
let previewEnds = 0;

function load(): Saved {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
function save(s: Saved) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } }

/** Unlock audio from a click and get the club running. */
export function wakeAudio() {
  unlock();
  startClub();
  void loadAudition();
  void loadHum();
}

function clearPreview() {
  for (const id of timers) clearTimeout(id);
  timers = [];
  previewing = false;
}

/** Stop the preview: cuts its one-shots; the club itself keeps playing behind the door. */
export function stopPreview() {
  clearPreview();
  stopOneShots();
}

/**
 * Muffled beat -> Gus hums the three notes -> clasp + door opens on the same beat -> door shuts ->
 * Gus's audition line. Pressing it again restarts instead of stacking.
 */
export async function testSound(): Promise<number> {
  wakeAudio();
  stopPreview();
  previewing = true;
  setScene('street');
  await Promise.all([loadAudition(), loadHum()]);
  const at = (secs: number, fn: () => void) => timers.push(window.setTimeout(fn, secs * 1000));
  previewMarks.length = 0;
  mark('preview: beat behind the door');
  const humIn = 1.8;
  at(humIn, () => {
    const len = hum(true);                                  // waits for the next hook bar
    mark('Gus hums', humStartedAt());
    at(len + 0.5, () => {
      doorOpen(1.8, true);
      mark('clasp + door opens');
      mark('door shuts', (audio()?.currentTime ?? 0) + 2.1);
      at(3.0, () => { audition(true); mark('Gus: "I saw that... Cute shoes, though."'); at(3.0, () => { previewing = false; }); });
    });
  });
  previewEnds = performance.now() + 14_000;
  return 14;
}

/** Gus's turn alert alone, with the background ducked, for a volume check from the back of the room. */
export function testTurn(showCue: () => void) {
  wakeAudio();
  duck(true);
  sfx.tell();
  showCue();
  timers.push(window.setTimeout(() => sfx.turn(), 600));
  timers.push(window.setTimeout(() => duck(false), 1900));
}

export function mountPanel(h: PanelHooks) {
  const saved = load();
  let wasRefreshed = false;
  try { wasRefreshed = sessionStorage.getItem('club-velvet-refreshed') === '1'; sessionStorage.removeItem('club-velvet-refreshed'); } catch { /* ignore */ }
  for (const g of ['amb', 'gus', 'alert'] as Group[]) setLevel(g, saved[g]);
  setMuted(saved.muted);
  h.onMuteChange(saved.muted);

  const css = document.createElement('style');
  css.textContent = `
  #cv-panel{position:fixed;left:8px;bottom:8px;z-index:10;display:flex;gap:6px;align-items:flex-end;font:16px ClubPixelCJK,monospace;opacity:.55;transition:opacity .15s}
  #cv-panel:hover,#cv-panel.open,#cv-panel.lobby{opacity:1}
  #cv-panel button{font:inherit;text-transform:uppercase;background:${C.PAPER};color:${C.INK};border:2px solid ${C.INK};box-shadow:2px 2px 0 ${C.INK};padding:4px 8px;cursor:pointer;border-radius:0}
  #cv-panel button:active{transform:translate(2px,2px);box-shadow:none}
  #cv-panel button.hot{background:${C.LAMP}}
  #cv-panel .hide{display:none}
  #cv-mix{position:absolute;left:0;bottom:40px;background:${C.PAPER};color:${C.INK};border:2px solid ${C.INK};box-shadow:3px 3px 0 ${C.INK};padding:8px 10px;width:250px}
  #cv-mix label{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:4px 0;text-transform:uppercase}
  #cv-mix input[type=range]{width:120px;accent-color:${C.VELVET}}
  #cv-resume{position:fixed;left:50%;bottom:18%;transform:translateX(-50%);z-index:11;font:24px ClubPixelCJK,monospace;text-transform:uppercase;
    background:${C.LAMP};color:${C.INK};border:3px solid ${C.INK};box-shadow:4px 4px 0 ${C.INK};padding:10px 18px;cursor:pointer;border-radius:0}
  `;
  document.head.appendChild(css);

  const el = document.createElement('div');
  el.id = 'cv-panel';
  el.innerHTML = `
    <button id="cv-test" tabindex="-1" class="hot" title="Unlock audio and play a short preview with the real game sounds">▶ Test sound</button>
    <button id="cv-stop" tabindex="-1" class="hide">■ Stop</button>
    <button id="cv-turn" tabindex="-1" title="Play Gus's turn alert alone">! Test turn alert</button>
    <button id="cv-mixbtn" tabindex="-1" title="Volumes">♪ Mix</button>
    <button id="cv-refresh" tabindex="-1" title="Reload this screen. The room, players and clock carry on.">↻ Refresh</button>
    <div id="cv-mix" class="hide">
      <label>Ambience <input id="cv-amb" type="range" min="0" max="100"></label>
      <label>Gus voice <input id="cv-gus" type="range" min="0" max="100"></label>
      <label>Game alerts <input id="cv-alert" type="range" min="0" max="100"></label>
      <label>Mute all <input id="cv-mute" type="checkbox"></label>
    </div>`;
  document.body.appendChild(el);
  const resume = document.createElement('button');
  resume.id = 'cv-resume';
  resume.textContent = '🔈 Resume sound';
  resume.className = 'hide';
  document.body.appendChild(resume);

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const test = $('cv-test'), stop = $('cv-stop'), turn = $('cv-turn'), mixBtn = $('cv-mixbtn'), mix = $('cv-mix'), refresh = $('cv-refresh');
  // Clicks on the strip must not leave keyboard focus on it: the host's S / R / M keys are read on the
  // page, and a focused button would also replay on Space/Enter. (Swallowing keydown here was the bug
  // behind "Test sound, then S does nothing".)
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) b.blur(); });
  resume.addEventListener('click', () => resume.blur());

  test.onclick = () => { void testSound(); };
  stop.onclick = () => stopPreview();
  turn.onclick = () => testTurn(h.showTurnTest);
  mixBtn.onclick = () => { mix.classList.toggle('hide'); el.classList.toggle('open', !mix.classList.contains('hide')); };
  refresh.onclick = () => { try { sessionStorage.setItem('club-velvet-refreshed', '1'); } catch { /* ignore */ } location.reload(); };
  resume.onclick = () => wakeAudio();
  for (const g of ['amb', 'gus', 'alert'] as Group[]) {
    const input = $<HTMLInputElement>(`cv-${g}`);
    input.value = String(Math.round(getLevel(g) * 100));
    input.oninput = () => { setLevel(g, Number(input.value) / 100); const s = load(); s[g] = Number(input.value) / 100; save(s); };
  }
  const mute = $<HTMLInputElement>('cv-mute');
  mute.checked = isMuted();
  mute.onchange = () => setMute(mute.checked);
  function setMute(m: boolean) { setMuted(m); mute.checked = m; h.onMuteChange(m); const s = load(); s.muted = m; save(s); }

  // keep the strip in step with the game each frame
  const tick = () => {
    const lobby = h.inLobby();
    el.classList.toggle('lobby', lobby);
    test.classList.toggle('hide', !lobby);
    turn.classList.toggle('hide', !lobby);
    stop.classList.toggle('hide', !previewing || performance.now() > previewEnds);
    test.textContent = previewing ? '↺ Replay' : '▶ Test sound';
    resume.classList.toggle('hide', audioRunning());
    resume.textContent = wasRefreshed ? '🔈 Resume sound' : '🔈 Click for sound';
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { setMute, isPreviewing: () => previewing };
}
