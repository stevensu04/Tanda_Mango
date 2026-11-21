import type { ClientMsg, ServerMsg } from '../../shared/protocol';

/** Reconnecting socket to the game server. Every (re)connect re-sends `hello`. */
export function connect(hello: () => ClientMsg, onMsg: (m: ServerMsg) => void, onStatus: (up: boolean) => void = () => {}) {
  let ws: WebSocket | null = null;
  let up = false;
  let retry: number | null = null;
  const open = () => {
    retry = null;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { up = true; onStatus(true); ws!.send(JSON.stringify(hello())); };
    ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch { /* ignore */ } };
    ws.onclose = () => { up = false; onStatus(false); retry = window.setTimeout(open, 800); };
  };
  open();
  return {
    send(m: ClientMsg) { if (ws && up) ws.send(JSON.stringify(m)); },
    get up() { return up; },
    /** Refresh: drop this socket and say hello again at once (same room, same phone token). */
    resync() {
      if (retry !== null) { clearTimeout(retry); retry = null; }
      const old = ws;
      if (old) { old.onclose = null; old.onmessage = null; try { old.close(); } catch { /* ignore */ } }
      up = false; onStatus(false);
      open();
    },
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
