import { defineConfig, type PluginOption } from 'vite';
import { resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { gamePlugin } from './server/plugin';

// Phones can't open "localhost", so the lobby QR code needs the laptop's LAN address.
// Home/venue Wi-Fi ranges win over VPN/virtual adapters; LAN_HOST=192.168.1.20 overrides the guess.
function lanAddress(): string {
  if (process.env.LAN_HOST) return process.env.LAN_HOST;
  const all: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) if (net.family === 'IPv4' && !net.internal) all.push(net.address);
  }
  const rank = (a: string) => a.startsWith('192.168.') ? 0 : /^10\./.test(a) && a !== '10.255.255.254' ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a) ? 2 : 3;
  return all.sort((a, b) => rank(a) - rank(b))[0] ?? 'localhost';
}

const PORT = Number(process.env.PORT) || 5173;
// HTTPS=1 (npm run dev:https): self-signed certificate so iPhones allow motion sensors on the LAN.
const HTTPS = !!process.env.HTTPS;
const plugins: PluginOption[] = [gamePlugin()];
if (HTTPS) plugins.push(basicSsl());

export default defineConfig({
  root: 'web',
  appType: 'mpa',
  plugins,
  server: { host: true, port: PORT },
  define: {
    __LAN_ORIGIN__: JSON.stringify(`${HTTPS ? 'https' : 'http'}://${lanAddress()}:${PORT}`),
  },
  build: {
    outDir: '../build/web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'web/index.html'),
        screen: resolve(__dirname, 'web/screen.html'),
        play: resolve(__dirname, 'web/play.html'),
        admin: resolve(__dirname, 'web/admin.html'),
        reference: resolve(__dirname, 'web/reference.html'),
      },
    },
  },
});
