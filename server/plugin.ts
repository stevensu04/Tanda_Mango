import type { Plugin } from 'vite';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { Room } from './game';
import { T, type ClientMsg, type ServerMsg } from '../shared/protocol';

/**
 * One in-memory room served on /ws. Attached to Vite's own HTTP server in dev,
 * and reusable from a standalone Node server later (attachGame).
 */
export function attachGame(http: HttpServer) {
  const room = new Room();
  const wss = new WebSocketServer({ noServer: true });
  const screens = new Set<WebSocket>();
  const phones = new Map<WebSocket, { token: string; id: string | null }>();

  http.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) return; // leave Vite's HMR socket alone
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  const send = (ws: WebSocket, m: ServerMsg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let m: ClientMsg;
      try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.t === 'hello') {
        if (m.role === 'screen') { screens.add(ws); return; }
        const token = String(m.token).slice(0, 64);
        const id = room.idForToken(token);
        phones.set(ws, { token, id });
        if (id) room.setConnected(id, true);
        return;
      }
      if (screens.has(ws)) {
        if (m.t === 'start') room.start();
        if (m.t === 'reset') { room.reset(); room.dropDisconnected(); }
        return;
      }
      const ph = phones.get(ws);
      if (!ph) return;
      if (m.t === 'join') { ph.id = room.join(ph.token, m.name, m.seed); return; }
      if (!ph.id) return;
      switch (m.t) {
        case 'press': room.press(ph.id); break;
        case 'release': room.release(ph.id); break;
        case 'tap': room.tap(ph.id); break;
        case 'rule': room.pickRule(ph.id, m.rule); break;
      }
    });
    ws.on('close', () => {
      screens.delete(ws);
      const ph = phones.get(ws);
      if (ph?.id) room.setConnected(ph.id, false);
      phones.delete(ws);
      room.dropDisconnected();
    });
  });

  let last = Date.now();
  let snapAcc = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    room.tick(dt);
    for (const e of room.drainEvents()) for (const s of screens) send(s, e);
    snapAcc += dt;
    if (snapAcc >= 1 / T.SNAP_HZ) {
      snapAcc = 0;
      const snap = room.snapshot();
      for (const s of screens) send(s, snap);
      for (const [ws, ph] of phones) send(ws, room.me(ph.id));
    }
  }, 1000 / T.TICK_HZ);
  http.on('close', () => clearInterval(timer));
  return room;
}

export function gamePlugin(): Plugin {
  return {
    name: 'club-velvet-game',
    configureServer(server) {
      if (server.httpServer) attachGame(server.httpServer as HttpServer);
    },
  };
}
