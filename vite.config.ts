import { defineConfig, type PluginOption } from 'vite';
import { resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { gamePlugin } from './server/plugin';

// Phones can't open "localhost", so the lobby QR code needs the laptop's LAN address.
function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
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
