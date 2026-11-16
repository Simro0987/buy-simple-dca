// Bundles the API + the 32 original Deno edge functions into api/dist (ESM, code-split).
import { build } from 'esbuild';
import { cpSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, ['api/scripts/gen-functions.mjs'], { stdio: 'inherit' });
rmSync('api/dist', { recursive: true, force: true });

/** Deno-style URL/npm: specifiers used by the edge functions -> local npm packages. */
const denoImports = {
  name: 'deno-imports',
  setup(b) {
    b.onResolve({ filter: /^(https:\/\/esm\.sh\/|npm:)@supabase\/supabase-js/ }, async (args) => {
      const sub = args.path.includes('/cors') ? '@supabase/supabase-js/cors' : '@supabase/supabase-js';
      return b.resolve(sub, { kind: args.kind, resolveDir: process.cwd() });
    });
    b.onResolve({ filter: /^(https?:|npm:|jsr:)/ }, (args) => ({ errors: [{ text: `unsupported remote import ${args.path}` }] }));
  },
};

await build({
  entryPoints: { api: 'api/src/main.ts' },
  outdir: 'api/dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  minify: false,
  external: ['pg-native', 'cloudflare:sockets'],
  alias: { '@edge': './supabase/functions' },
  plugins: [denoImports],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
cpSync('api/migrations', 'api/dist/migrations', { recursive: true });
console.log('api bundle -> api/dist');
