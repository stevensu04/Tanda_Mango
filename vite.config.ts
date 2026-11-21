import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
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

const PORT = 5173;

export default defineConfig({
  root: 'web',
  appType: 'mpa',
  plugins: [gamePlugin()],
  server: { host: true, port: PORT },
  define: {
    __LAN_ORIGIN__: JSON.stringify(`http://${lanAddress()}:${PORT}`),
  },
  build: {
    outDir: '../build/web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'web/index.html'),
        screen: resolve(__dirname, 'web/screen.html'),
        play: resolve(__dirname, 'web/play.html'),
        reference: resolve(__dirname, 'web/reference.html'),
      },
    },
  },
});
