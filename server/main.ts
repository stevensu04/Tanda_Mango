import 'dotenv/config';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { attachGame } from './rooms';
import { createVoice } from './ai/index';

/**
 * Production-style server: serves the Vite build (npm run build) and the game socket on one port.
 * Dev uses `npm run dev` instead (Vite + the same game server via server/plugin.ts).
 */
const PORT = Number(process.env.PORT) || 8080;
const ROOT = resolve(process.env.STATIC_DIR || 'build/web');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/index.html';
  // pretty routes: /screen, /play, /admin
  if (!extname(path)) path += '.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});

attachGame(http, { voice: createVoice() });
http.listen(PORT, () => console.log(`[game] listening on http://localhost:${PORT}  (projector: /screen.html, host: /admin.html)`));
