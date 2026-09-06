import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { MAX_UPLOAD_BYTES } from '@fanphoto/shared'
import { ApiError } from './errors'
import { authRoutes } from './auth'
import { photoRoutes } from './photos'
import { adminRoutes } from './admin'
import type { ApiEnv } from './types'

export function createApp() {
  const app = new Hono<ApiEnv>()
  app.use('*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('X-Frame-Options', 'DENY')
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://*.basemaps.cartocdn.com; font-src 'self'; connect-src 'self' https://*.basemaps.cartocdn.com; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    )
    if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store')
    await next()
  })
  app.use('/api/*', async (c, next) =>
    bodyLimit({
      maxSize: c.req.path === '/api/photos/upload' ? MAX_UPLOAD_BYTES : 256 * 1024,
      onError: (context) =>
        context.json({ error: { code: 'TOO_LARGE', message: '请求超过大小限制' } }, 413),
    })(c, next),
  )
  app.get('/api/health', async (c) => {
    await c.env.DB.prepare('SELECT 1').first()
    return c.json({ ok: true, version: '1.0.0', storage: c.env.MODE || 'local' })
  })
  authRoutes(app)
  photoRoutes(app)
  adminRoutes(app)
  app.notFound(async (c) => {
    if (
      c.req.path.startsWith('/api') ||
      c.req.path.startsWith('/media') ||
      !c.env.ASSETS ||
      !['GET', 'HEAD'].includes(c.req.method)
    ) {
      return c.json({ error: { code: 'NOT_FOUND', message: '页面或接口不存在' } }, 404)
    }
    return c.env.ASSETS.fetch(c.req.raw)
  })
  app.onError((error, c) => {
    if (error instanceof z.ZodError)
      return c.json(
        {
          error: {
            code: 'VALIDATION',
            message: error.issues
              .map((e) => e.message)
              .slice(0, 3)
              .join('；'),
          },
        },
        400,
      )
    if (error instanceof ApiError)
      return c.json({ error: { code: error.code, message: error.message } }, error.status)
    console.error('API failure:', error.name, error.message)
    return c.json({ error: { code: 'INTERNAL', message: '操作未完成，请稍后重试' } }, 500)
  })
  return app
}
