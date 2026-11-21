import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts (whose root is web/ and which boots the game server).
export default defineConfig({
  test: {
    root: '.',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});
