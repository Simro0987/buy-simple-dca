import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@edge\/(.*)$/, replacement: `${fileURLToPath(new URL('../supabase/functions/', import.meta.url))}$1` },
      { find: /^npm:@supabase\/supabase-js@[^/]+\/cors$/, replacement: '@supabase/supabase-js/cors' },
      { find: /^(https:\/\/esm\.sh\/|npm:)@supabase\/supabase-js@[\d.]+$/, replacement: '@supabase/supabase-js' },
    ],
  },
  test: {
    environment: 'node',
    include: ['api/test/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
