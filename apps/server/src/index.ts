import { serve } from '@hono/node-server'
import { configuration } from './core/config'
import { createServices } from './services'
import { createApp } from './app'

const config = configuration()
const services = await createServices(config)
services.db.run(
  "UPDATE ingest_events SET status='failed',error_code='INTERRUPTED',finished_at=? WHERE status='processing'",
  [Date.now()],
)
const app = createApp(services)
const server = serve(
  {
    hostname: config.host,
    port: config.port,
    fetch(request, incoming) {
      const peer = incoming.incoming.socket.remoteAddress || 'unknown'
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)
      const clientIp =
        config.trustProxy && local
          ? request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || peer
          : peer
      return app.fetch(request, { clientIp })
    },
  },
  () => console.log(`FanPhoto listening on ${config.host}:${config.port}`),
)
if ('requestTimeout' in server) server.requestTimeout = 120_000
if ('headersTimeout' in server) server.headersTimeout = 15_000
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      services.db.close()
      process.exit(0)
    }),
  )
