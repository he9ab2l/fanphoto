import { serve } from '@hono/node-server'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { createApp } from './app'
import { LocalDatabase, LocalStore } from './local'
import { rootDirectory, dataDirectory } from './config'
import type { Bindings } from './types'
import { developmentOrigin } from './public-origin'

const db = new LocalDatabase(resolve(dataDirectory, 'fanphoto.sqlite'))
await db.migrate(resolve(rootDirectory, 'apps/api/migrations'))
const assetRoot = resolve(rootDirectory, 'apps/web/dist')
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
const env: Bindings = {
  DB: db,
  STORE: new LocalStore(resolve(dataDirectory, 'media')),
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || '',
  SESSION_SECRET: process.env.SESSION_SECRET || '',
  APP_ORIGIN: process.env.APP_ORIGIN || 'http://localhost:5173',
  MODE: process.env.NODE_ENV || 'development',
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url)
      let filename: string
      try {
        filename = resolve(assetRoot, '.' + decodeURIComponent(url.pathname))
      } catch {
        return new Response('Bad path', { status: 400 })
      }
      if (filename !== assetRoot && !filename.startsWith(assetRoot + sep))
        return new Response('Not found', { status: 404 })
      let exists = await stat(filename)
        .then((s) => s.isFile())
        .catch(() => false)
      if (!exists && !extname(url.pathname)) {
        filename = resolve(assetRoot, 'index.html')
        exists = true
      }
      if (!exists) return new Response('Not found', { status: 404 })
      try {
        const body = await readFile(filename)
        return new Response(request.method === 'HEAD' ? null : body, {
          headers: {
            'Content-Type': mime[extname(filename)] || 'application/octet-stream',
            'Cache-Control': url.pathname.startsWith('/assets/')
              ? 'public, max-age=31536000, immutable'
              : 'no-cache',
          },
        })
      } catch {
        return new Response('Frontend not built. Run pnpm build.', { status: 503 })
      }
    },
  },
}
const app = createApp()
const currentOrigin = developmentOrigin(dataDirectory, env.APP_ORIGIN)
const port = Number(process.env.PORT || 8787)
const server = serve(
  {
    port,
    hostname: process.env.HOST || '127.0.0.1',
    fetch: async (request, incoming) => {
      const peer = incoming.incoming.socket.remoteAddress || 'unknown'
      const proxy =
        process.env.TRUST_LOCAL_PROXY === 'true' &&
        ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)
      const ip = proxy
        ? request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || peer
        : peer
      return app.fetch(request, { ...env, APP_ORIGIN: await currentOrigin(), CLIENT_IP: ip })
    },
  },
  () => console.log(`Fanphoto listening on ${process.env.HOST || '127.0.0.1'}:${port}`),
)
if ('requestTimeout' in server) server.requestTimeout = 120_000
if ('headersTimeout' in server) server.headersTimeout = 15_000
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      db.close()
      process.exit(0)
    }),
  )
