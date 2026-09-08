import { build } from 'esbuild'
import { compressClient } from './compress-client.mjs'
console.log(`Prepared Brotli/gzip for ${await compressClient()} client files`)
await build({
  entryPoints: ['apps/server/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['sharp', 'heic-convert'],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  outfile: 'apps/server/dist/server.mjs',
})
