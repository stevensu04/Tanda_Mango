import 'dotenv/config';
import type { Plugin } from 'vite';
import type { Server as HttpServer } from 'node:http';
import { attachGame } from './rooms';
import { createVoice } from './ai/index';

/**
 * Dev: the game server rides on Vite's own HTTP server, so `npm run dev` is the whole stack.
 * GAME_SPEED=4 runs the clock 4x (tests only).
 */
export function gamePlugin(): Plugin {
  return {
    name: 'club-velvet-game',
    configureServer(server) {
      if (!server.httpServer) return;
      const speed = Number(process.env.GAME_SPEED) || 1;
      attachGame(server.httpServer as HttpServer, { voice: createVoice(), speed });
    },
  };
}
