// FRAME / ESCAPE game server: one long-running process, every gallery in memory.
// Serves the built frontend (dist/, from `npm run build` at the repo root) and the Socket.IO game.
//
// Env: PORT (3000) · GUARD_KEY (guard) · ADMIN_KEY (admin) · MODE (auto|manual) · ROOM_MAX (25) · STATIC_DIR (../dist)
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Game } from './game.js';
import { MSG } from '../web/js/net-protocol.js';

const PORT = Number(process.env.PORT ?? 3000);
const GUARD_KEY = process.env.GUARD_KEY ?? 'guard';
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'admin';
const MODE = process.env.MODE === 'manual' ? 'manual' : 'auto';
const ROOM_MAX = Number(process.env.ROOM_MAX ?? 25);
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const STATIC_DIR = process.env.STATIC_DIR ?? (existsSync(here('../dist')) ? here('../dist') : here('../web'));
const ADMIN_HTML = here('./admin.html');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
};

function serveFile(res, file, cache = 'no-cache') {
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache });
  createReadStream(file).pipe(res);
}

let game;
const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') return void res.writeHead(200).end('ok');
  if (url.pathname === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    return void res.end(JSON.stringify(game.stats()));
  }
  if (url.pathname === '/admin' || url.pathname === '/admin/') return serveFile(res, ADMIN_HTML);
  if (req.method !== 'GET' && req.method !== 'HEAD') return void res.writeHead(405).end();
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return void res.writeHead(400).end();
  }
  if (path.split('/').some((part) => part.startsWith('.'))) return void res.writeHead(404).end('Not found');
  let file = normalize(join(STATIC_DIR, path));
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + sep)) return void res.writeHead(404).end('Not found');
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return void res.writeHead(404).end('Not found');
  // Models and vendor code are large and never change within a deploy.
  serveFile(res, file, /\.(glb|png|jpg|webp)$/.test(file) || file.includes(`${sep}vendor${sep}`) ? 'public, max-age=3600' : 'no-cache');
});

const io = new Server(http, { cors: { origin: true }, perMessageDeflate: false, pingInterval: 10_000, pingTimeout: 8_000 });

game = new Game(
  {
    room: (id, msg) => void io.to(`room:${id}`).to('observers').emit(MSG, msg),
    player: (id, msg) => void io.to(`player:${id}`).emit(MSG, msg),
    all: (msg) => void io.emit(MSG, msg),
  },
  { mode: MODE, roomMax: ROOM_MAX },
);
game.start();

io.on('connection', (socket) => {
  const { role, key } = socket.handshake.auth ?? {};
  const send = (m) => socket.emit(MSG, m);
  if ((role === 'guard' && key !== GUARD_KEY) || (role === 'admin' && key !== ADMIN_KEY)) {
    send({ t: 'error', reason: role === 'guard' ? 'guard-key' : 'admin-key' });
    return void socket.disconnect(true);
  }
  if (!['player', 'guard', 'screen', 'admin'].includes(role)) {
    send({ t: 'error', reason: 'role' });
    return void socket.disconnect(true);
  }
  if (role !== 'player') {
    socket.join('observers');
    for (const m of game.observerInit()) send(m);
    if (role === 'guard') game.guardConnected();
  }

  let playerId = null;
  let roomChannel = null;
  const bind = (id) => {
    if (playerId !== id) {
      if (playerId) socket.leave(`player:${playerId}`);
      playerId = id;
      socket.join(`player:${id}`);
    }
    const channel = `room:${game.instanceOf(id)}`;
    if (roomChannel !== channel) {
      if (roomChannel) socket.leave(roomChannel);
      roomChannel = channel;
      socket.join(channel);
    }
    game.welcome(id);
  };

  socket.on(MSG, (m) => {
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    if (role === 'player') {
      if (m.t === 'hello') {
        if (!playerId && typeof m.playerId === 'string' && game.has(m.playerId)) bind(m.playerId);
      } else if (m.t === 'join') bind(game.join(Number(m.room), String(m.character ?? ''), playerId ?? undefined));
      else if (!playerId) return;
      else if (m.t === 'input') game.input(playerId, m.dir);
      else if (m.t === 'hold') game.hold(playerId);
      else if (m.t === 'cover') game.cover(playerId);
    } else if (role === 'guard') {
      if (m.t === 'beam') game.beam(m);
      else if (m.t === 'watch') game.watch(Number(m.room));
    } else if (role === 'admin') {
      game.admin(m);
    }
  });

  socket.on('disconnect', () => {
    if (playerId) game.disconnect(playerId);
    if (role === 'guard') game.guardDisconnected();
  });
});

http.listen(PORT, () => console.log(`FRAME / ESCAPE game server on http://localhost:${PORT} · mode ${MODE} · serving ${STATIC_DIR}`));
