import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { compress } from 'hono/compress'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { idSchema, MAX_UPLOAD_BYTES, variants } from '@fanphoto/contracts'
import { ApiError, notFound } from './core/errors'
import { acceptedEncodings, matchesEtag } from './core/http-cache'
import type { HttpEnv } from './modules/auth'
import type { Services } from './services'

const jsonBody = async (request: { json: () => Promise<unknown> }) => {
  try {
    return await request.json()
  } catch {
    throw new ApiError(400, 'INVALID_JSON', '请求内容不是有效 JSON')
  }
}
export function createApp(services: Services) {
  const { db, store, photos, gallery, settings, auth, ingest, config } = services
  const app = new Hono<HttpEnv>()
  app.use('*', async (c, next) => {
    // Apply to the finalized response, including raw static/media Responses.
    // Headers prepared before next() can be bypassed by a standalone Response.
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    c.header('X-Frame-Options', 'DENY')
    c.header('X-Robots-Tag', 'noindex, nofollow')
    c.header('X-Request-Id', randomUUID())
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    )
    if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store')
    else if (c.req.path.startsWith('/media/') && c.res.status >= 400)
      c.header('Cache-Control', 'private, no-store')
  })
  app.use('/api/*', async (c, next) =>
    bodyLimit({
      maxSize: c.req.path === '/api/v1/admin/uploads' ? MAX_UPLOAD_BYTES : 256 * 1024,
      onError: (context) =>
        context.json({ error: { code: 'BODY_LIMIT', message: '上传内容超出大小限制' } }, 413),
    })(c, next),
  )

  const api = new Hono<HttpEnv>()
  api.use('*', compress({ threshold: 1024, contentTypeFilter: /^application\/json/ }))
  api.get('/health', (c) => {
    db.get('SELECT 1')
    return c.json({ ok: true, version: '2.0.0', apiVersion: 1, storage: 'sqlite-files' })
  })
  api.get('/site', (c) => c.json(settings.publicInfo()))
  api.get('/photos', (c) => c.json(photos.list(c.req.query(), false)))
  api.get('/photos/:id', (c) =>
    c.json(photos.detail(idSchema.parse(c.req.param('id')), c.req.query())),
  )
  api.get('/albums', (c) => c.json({ items: photos.albums() }))
  api.get('/session', (c) => c.json(auth.info(c)))
  api.post('/session', async (c) => {
    const { password } = z
      .object({ password: z.string().min(1).max(256) })
      .strict()
      .parse(await jsonBody(c.req))
    return c.json(await auth.login(c, password))
  })
  api.delete('/session', auth.guard, (c) => {
    auth.logout(c)
    return c.json({ ok: true })
  })

  api.use('/admin/*', auth.guard)
  api.get('/admin/stats', (c) => c.json(gallery.stats()))
  api.get('/admin/photos', (c) => c.json(photos.list(c.req.query(), true)))
  api.get('/admin/photos/:id', (c) => {
    const id = idSchema.parse(c.req.param('id'))
    return c.json({
      ...photos.detail(id, c.req.query(), true),
      extensions: db
        .all<{ namespace: string; schema_version: number; data: string }>(
          'SELECT namespace,schema_version,data FROM extensions WHERE photo_id=?',
          [id],
        )
        .map((extension) => ({
          namespace: extension.namespace,
          version: extension.schema_version,
          data: JSON.parse(extension.data),
        })),
    })
  })
  api.patch('/admin/photos/:id', async (c) =>
    c.json({ photo: gallery.edit(idSchema.parse(c.req.param('id')), await jsonBody(c.req)) }),
  )
  api.post('/admin/photos/actions', async (c) => c.json(gallery.batch(await jsonBody(c.req))))
  api.delete('/admin/photos/:id', (c) =>
    c.json(gallery.batch({ ids: [idSchema.parse(c.req.param('id'))], action: 'trash' })),
  )
  api.delete('/admin/photos/:id/permanent', async (c) => {
    await gallery.purge(idSchema.parse(c.req.param('id')))
    return c.json({ ok: true })
  })
  api.post('/admin/uploads', async (c) => {
    let form
    try {
      form = await c.req.formData()
    } catch {
      throw new ApiError(400, 'INVALID_UPLOAD', '请以文件表单上传原图')
    }
    const file = form.get('file')
    if (!(file instanceof File)) throw new ApiError(400, 'FILE_REQUIRED', '请选择原始照片文件')
    let options
    try {
      options = JSON.parse(String(form.get('options') || '{}'))
    } catch {
      throw new ApiError(400, 'INVALID_OPTIONS', '上传选项无效')
    }
    const result = await ingest.import(new Uint8Array(await file.arrayBuffer()), file.name, options)
    return c.json(result, result.duplicate ? 200 : 201)
  })
  api.get('/admin/albums', (c) => c.json({ items: photos.albums(true) }))
  api.post('/admin/albums', async (c) =>
    c.json({ album: gallery.saveAlbum(await jsonBody(c.req)) }, 201),
  )
  api.patch('/admin/albums/:id', async (c) =>
    c.json({ album: gallery.saveAlbum(await jsonBody(c.req), idSchema.parse(c.req.param('id'))) }),
  )
  api.delete('/admin/albums/:id', (c) => {
    gallery.deleteAlbum(idSchema.parse(c.req.param('id')))
    return c.json({ ok: true })
  })
  api.get('/admin/settings', (c) => c.json({ settings: settings.get() }))
  api.patch('/admin/settings', async (c) =>
    c.json({ settings: settings.save(await jsonBody(c.req)) }),
  )
  api.get('/admin/modules', (c) =>
    c.json({
      items: ingest.modules.map((module) => ({
        namespace: module.namespace,
        version: module.version,
      })),
    }),
  )
  api.get('/admin/imports', (c) =>
    c.json({
      items: db.all(
        'SELECT id,photo_id,status,error_code,started_at,finished_at FROM ingest_events ORDER BY started_at DESC LIMIT 100',
      ),
    }),
  )
  api.get('/admin/export', (c) => {
    c.header('Content-Disposition', 'attachment; filename="fanphoto-catalog.json"')
    return c.json({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      settings: settings.get(),
      photos: db.all('SELECT * FROM photos'),
      assets: db.all('SELECT * FROM assets'),
      tags: db.all('SELECT * FROM photo_tags'),
      albums: db.all('SELECT * FROM albums'),
      albumPhotos: db.all('SELECT * FROM album_photos'),
      extensions: db.all('SELECT * FROM extensions'),
    })
  })
  api.get('/admin/photos/:id/source', async (c) => {
    const asset = photos.asset(idSchema.parse(c.req.param('id')), 'source', true)
    const object = await store.get(asset.storage_key)
    if (!object) return notFound()
    if (c.req.method === 'HEAD') await object.body.cancel()
    return new Response(c.req.method === 'HEAD' ? null : object.body, {
      headers: {
        'Content-Type': asset.mime,
        'Content-Length': String(object.size),
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${asset.photo_id}"; filename*=UTF-8''${encodeURIComponent(asset.source_name)}`,
      },
    })
  })
  api.get('/photos/:id/download', async (c) => {
    const admin = !!auth.current(c)
    if (!admin && !settings.get().allowDownloads)
      throw new ApiError(403, 'DOWNLOAD_DISABLED', '作者未开放下载')
    const asset = photos.asset(idSchema.parse(c.req.param('id')), 'original', admin)
    const object = await store.get(asset.storage_key)
    if (!object) return notFound()
    if (c.req.method === 'HEAD') await object.body.cancel()
    return new Response(c.req.method === 'HEAD' ? null : object.body, {
      headers: {
        'Content-Type': asset.mime,
        'Content-Length': String(object.size),
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${asset.photo_id}.webp"; filename*=UTF-8''${encodeURIComponent(asset.title + '.webp')}`,
      },
    })
  })
  app.route('/api/v1', api)
  app.get('/media/photos/:id/:variant', async (c) => {
    const admin = !!auth.current(c)
    const id = idSchema.parse(c.req.param('id'))
    const variant = c.req.param('variant')
    if (!(variants as readonly string[]).includes(variant)) return notFound()
    const asset = photos.asset(id, variant, admin)
    if (variant === 'original' && !admin && !settings.get().allowDownloads)
      throw new ApiError(403, 'DOWNLOAD_DISABLED', '作者未开放完整尺寸下载')
    const headers = {
      'Content-Type': asset.mime,
      'Cache-Control': 'private, no-cache',
      ETag: `"${asset.checksum}"`,
      'X-Content-Type-Options': 'nosniff',
    }
    if (matchesEtag(c.req.header('if-none-match'), headers.ETag))
      return new Response(null, { status: 304, headers })
    const object = await store.get(asset.storage_key)
    if (!object) return notFound()
    if (c.req.method === 'HEAD') await object.body.cancel()
    return new Response(c.req.method === 'HEAD' ? null : object.body, {
      headers: { ...headers, 'Content-Length': String(object.size) },
    })
  })
  const assetRoot = resolve(config.root, 'apps/client/dist')
  const mime: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
  }
  app.notFound(async (c) => {
    if (
      c.req.path.startsWith('/api') ||
      c.req.path.startsWith('/media') ||
      !['GET', 'HEAD'].includes(c.req.method)
    )
      return c.json({ error: { code: 'NOT_FOUND', message: '页面或接口不存在' } }, 404)
    let path
    try {
      path = resolve(assetRoot, '.' + decodeURIComponent(c.req.path))
    } catch {
      throw new ApiError(400, 'INVALID_PATH', '路径无效')
    }
    if (!path.startsWith(assetRoot + sep) && path !== assetRoot) return notFound()
    const file = await stat(path).catch(() => null)
    if (!file?.isFile()) {
      if (extname(path)) return notFound()
      path = resolve(assetRoot, 'index.html')
    }
    try {
      const contentType = mime[extname(path)] || 'application/octet-stream'
      let representation = path
      let encoding: 'br' | 'gzip' | undefined
      if (/\.(?:html|js|css|svg|json|txt)$/.test(path)) {
        for (const candidate of acceptedEncodings(c.req.header('accept-encoding'))) {
          const compressed = `${path}.${candidate === 'gzip' ? 'gz' : 'br'}`
          if ((await stat(compressed).catch(() => null))?.isFile()) {
            representation = compressed
            encoding = candidate
            break
          }
        }
      }
      const entry = await stat(representation)
      const etag = `W/"${entry.size.toString(16)}-${entry.mtimeMs.toString(16)}-${encoding || 'identity'}"`
      const headers = {
        'Content-Type': contentType,
        'Cache-Control': c.req.path.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
        Vary: 'Accept-Encoding',
        ETag: etag,
        ...(encoding ? { 'Content-Encoding': encoding } : {}),
      }
      if (matchesEtag(c.req.header('if-none-match'), etag))
        return new Response(null, { status: 304, headers })
      const contents = c.req.method === 'HEAD' ? null : await readFile(representation)
      return new Response(contents, {
        headers: { ...headers, 'Content-Length': String(entry.size) },
      })
    } catch {
      throw new ApiError(503, 'CLIENT_NOT_BUILT', '请先构建客户端')
    }
  })
  app.onError((error, c) => {
    if (error instanceof z.ZodError)
      return c.json(
        {
          error: {
            code: 'VALIDATION',
            message: error.issues
              .slice(0, 3)
              .map((item) => item.message)
              .join('；'),
          },
        },
        400,
      )
    if (error instanceof ApiError) {
      if (error.code === 'PROCESSOR_BUSY') c.header('Retry-After', '5')
      return c.json({ error: { code: error.code, message: error.message } }, error.status)
    }
    console.error('Request failed:', error.name, error.message)
    return c.json({ error: { code: 'INTERNAL', message: '操作未完成，请重试' } }, 500)
  })
  return app
}
