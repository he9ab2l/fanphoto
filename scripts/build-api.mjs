import { build } from 'esbuild'
await build({
  entryPoints: ['apps/api/src/node.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outfile: 'apps/api/dist/server.mjs',
})
