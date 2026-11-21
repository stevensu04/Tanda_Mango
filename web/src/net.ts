import type { ClientMsg, ServerMsg } from '../../shared/protocol';

/** Reconnecting socket to the game server. Every (re)connect re-sends `hello`. */
export function connect(hello: () => ClientMsg, onMsg: (m: ServerMsg) => void, onStatus: (up: boolean) => void = () => {}) {
  let ws: WebSocket | null = null;
  let up = false;
  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { up = true; onStatus(true); ws!.send(JSON.stringify(hello())); };
    ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch { /* ignore */ } };
    ws.onclose = () => { up = false; onStatus(false); setTimeout(open, 800); };
  };
  open();
  return {
    send(m: ClientMsg) { if (ws && up) ws.send(JSON.stringify(m)); },
    get up() { return up; },
  };
}

/** Stable per-phone identity so a refresh or a dropped connection keeps your spot. */
export function phoneToken(): string {
  const key = 'club-velvet-token';
  let tok = localStorage.getItem(key);
  if (!tok) {
    tok = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(key, tok);
  }
  return tok;
}
