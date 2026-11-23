import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@edge\/(.*)$/, replacement: `${fileURLToPath(new URL('./functions/', import.meta.url))}$1` },
    ],
  },
  test: {
    environment: 'node',
    include: ['api/test/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
