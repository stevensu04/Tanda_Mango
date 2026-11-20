// 200 fake phones over real Socket.IO connections.
//   npm run loadtest                                  # 200 players → http://localhost:3000 for 70 s
//   npm run loadtest -- https://your-app.example 200 90
import { io } from 'socket.io-client';
import { MSG } from '../../web/js/net-protocol.js';

const url = process.argv[2] ?? 'http://localhost:3000';
const count = Number(process.argv[3] ?? 200);
const seconds = Number(process.argv[4] ?? 70);
const CHARACTERS = ['fox', 'rabbit', 'bear'];
const stats = { connected: 0, welcomed: 0, drops: 0, errors: 0, msgs: 0, bytes: 0, gapSum: 0, gapN: 0, gapMax: 0, escaped: 0, caught: 0 };
const sockets = [];

function phone(i) {
  const s = io(url, { auth: { role: 'player' }, forceNew: true });
  sockets.push(s);
  let me = null;
  let dir = 0;
  let last = 0;
  let pauseUntil = 0;
  const send = (m) => s.emit(MSG, m);
  const press = (d) => {
    if (d !== dir) send({ t: 'input', dir: (dir = d) });
  };
  s.on('connect', () => {
    stats.connected++;
    send({ t: 'hello', playerId: me ?? undefined });
    send({ t: 'join', room: i % 4, character: CHARACTERS[i % 3] });
  });
  s.on('disconnect', () => {
    stats.connected--;
    stats.drops++;
  });
  s.on('connect_error', () => stats.errors++);
  s.on(MSG, (m) => {
    stats.msgs++;
    stats.bytes += JSON.stringify(m).length;
    if (m.t === 'welcome') {
      if (!me) stats.welcomed++;
      me = m.you.id;
    } else if (m.t === 'snap') {
      const now = Date.now();
      if (last) {
        const gap = now - last;
        stats.gapSum += gap;
        stats.gapN++;
        stats.gapMax = Math.max(stats.gapMax, gap);
      }
      last = now;
      for (const e of m.ev) {
        if (e.playerId !== me) continue;
        if (e.type === 'caught') {
          stats.caught++;
          pauseUntil = now + 1500;
        }
        if (e.type === 'escaped') stats.escaped++;
      }
      if (m.phase !== 'play') return press(0);
      if (now < pauseUntil) return press(0);
      if (Math.random() < 0.03) {
        pauseUntil = now + 300 + Math.random() * 900; // hesitate (releases snap into frames)
        return press(0);
      }
      if (Math.random() < 0.01) send({ t: 'cover' });
      press(1);
    }
  });
  setInterval(() => {
    if (dir) send({ t: 'hold' });
  }, 200);
}

console.log(`Connecting ${count} players to ${url} for ${seconds}s…`);
for (let i = 0; i < count; i++) setTimeout(() => phone(i), i * 15);

const started = Date.now();
let lastMsgs = 0;
let lastBytes = 0;
const timer = setInterval(async () => {
  const elapsed = Math.round((Date.now() - started) / 1000);
  let server = '';
  try {
    const s = await (await fetch(`${url}/stats`)).json();
    server = `${s.phase} · ${s.galleries.map((g) => `${g.name.replace('The ', '')} ${g.people}`).join(', ')}`;
  } catch {
    server = '/stats unavailable';
  }
  const rate = Math.round((stats.msgs - lastMsgs) / 5);
  const kbps = Math.round((stats.bytes - lastBytes) / 5 / 1024);
  lastMsgs = stats.msgs;
  lastBytes = stats.bytes;
  const avg = stats.gapN ? Math.round(stats.gapSum / stats.gapN) : 0;
  console.log(
    `[${elapsed}s] ${stats.connected}/${count} connected · ${rate} msg/s · ${kbps} KB/s to all phones · snapshot gap avg ${avg}ms max ${stats.gapMax}ms · escaped ${stats.escaped} · caught ${stats.caught} · drops ${stats.drops} · errors ${stats.errors} · ${server}`,
  );
  Object.assign(stats, { gapSum: 0, gapN: 0, gapMax: 0 });
  if (elapsed >= seconds) {
    clearInterval(timer);
    console.log(`Done: ${stats.msgs} messages, ${(stats.bytes / 1048576).toFixed(1)} MB, ${stats.drops} drops, ${stats.errors} errors.`);
    sockets.forEach((s) => s.close());
    process.exit(stats.drops || stats.errors ? 1 : 0);
  }
}, 5000);
