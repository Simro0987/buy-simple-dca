// Bundles the API + the server functions (api/functions, ex-Deno edge functions) into api/dist.
import { build } from 'esbuild';
import { cpSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, ['api/scripts/gen-functions.mjs'], { stdio: 'inherit' });
rmSync('api/dist', { recursive: true, force: true });

/** Remote (Deno-style) imports are not allowed: everything must be a local, reviewed file. */
const noRemoteImports = {
  name: 'no-remote-imports',
  setup(b) {
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
  alias: { '@edge': './api/functions' },
  plugins: [noRemoteImports],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
cpSync('api/migrations', 'api/dist/migrations', { recursive: true });
console.log('api bundle -> api/dist');
