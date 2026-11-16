import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['agent-runner/test/**/*.test.ts'],
  },
});
