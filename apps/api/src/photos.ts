import type { Hono } from 'hono'
import {
  idSchema,
  uploadSchema,
  photoEditSchema,
  batchSchema,
  variants,
  variantSizes,
  MAX_VIDEO_BYTES,
} from '@fanphoto/shared'
import { ApiError, readJson, notFound } from './errors'
import { requireAdmin, session } from './auth'
import { digest, randomToken } from './crypto'
import { webpSize, videoMime, sanitizeVideo } from './images'
import {
  getPhoto,
  listPhotos,
  photoRow,
  siteSettings,
  validateAlbums,
  photoSelect,
  serializePhoto,
  visible,
  objectKeys,
} from './repository'
import type { ApiEnv, PhotoRow } from './types'

export function photoRoutes(app: Hono<ApiEnv>) {
  app.get('/api/photos', async (c) => {
    c.header('Cache-Control', 'private, max-age=30, stale-while-revalidate=120')
    return c.json(await listPhotos(c.env, c.req.query()))
  })
  app.get('/api/admin/photos', requireAdmin, async (c) =>
    c.json(await listPhotos(c.env, c.req.query(), true)),
  )
  app.get('/api/photos/map', async (c) => {
    const site = await siteSettings(c.env)
    if (!site.showLocation) return c.json({ photos: [], enabled: false })
    const rows = await c.env.DB.prepare(
      `SELECT ${photoSelect} FROM photos p WHERE ${visible} AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY created_at DESC LIMIT 5000`,
    ).all<PhotoRow>()
    return c.json({ photos: rows.results.map((r) => serializePhoto(r, site)), enabled: true })
  })
  app.post('/api/photos/upload', requireAdmin, async (c) => {
    let form: FormData
    try {
      form = await c.req.formData()
    } catch {
      throw new ApiError(400, 'INVALID_FORM', '上传内容无效')
    }
    let raw: unknown
    try {
      raw = JSON.parse(String(form.get('meta')))
    } catch {
      throw new ApiError(400, 'INVALID_META', '图片信息无效')
    }
    const meta = uploadSchema.parse(raw)
    const existing = await c.env.DB.prepare('SELECT id FROM photos WHERE client_id=?')
      .bind(meta.clientId)
      .first<{ id: string }>()
    if (existing)
      return c.json({ photo: await getPhoto(c.env, existing.id, true), duplicate: true })
    await validateAlbums(c.env, meta.albumIds)
    const files: { key: string; data: ArrayBuffer; mime: string }[] = []
    const id = randomToken(12)
    for (const variant of variants) {
      const file = form.get(variant)
      if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024)
        throw new ApiError(400, 'INVALID_FILE', `缺少或超出大小限制的 ${variant} 图片`)
      const data = await file.arrayBuffer(),
        size = webpSize(data)
      if (Math.max(size.width, size.height) > variantSizes[variant])
        throw new ApiError(400, 'IMAGE_DIMENSIONS', '图片尺寸超出限制')
      if (variant === 'original' && (size.width !== meta.width || size.height !== meta.height))
        throw new ApiError(400, 'IMAGE_DIMENSIONS', '图片尺寸与元数据不一致')
      const aspect = size.width / size.height,
        expected = meta.width / meta.height
      if (Math.abs(aspect - expected) > 2 / Math.min(size.height, meta.height))
        throw new ApiError(400, 'IMAGE_DIMENSIONS', '缩略图比例不一致')
      files.push({
        key: variant === 'original' ? `originals/${id}.webp` : `thumbs/${id}/${variant}.webp`,
        data,
        mime: 'image/webp',
      })
    }
    let videoType: string | null = null
    const video = form.get('video')
    if (video instanceof File && video.size) {
      if (video.size > MAX_VIDEO_BYTES)
        throw new ApiError(413, 'VIDEO_TOO_LARGE', '实况片段不能超过 12 MB')
      const data = sanitizeVideo(await video.arrayBuffer())
      videoType = videoMime(data)
      files.push({
        key: `videos/${id}.${videoType === 'video/quicktime' ? 'mov' : 'mp4'}`,
        data,
        mime: videoType,
      })
    }
    const settings = await siteSettings(c.env),
      erase = settings.eraseLocationOnUpload || meta.eraseLocation
    const now = Date.now(),
      written: string[] = []
    try {
      for (const file of files) {
        await c.env.STORE.put(file.key, file.data, file.mime)
        written.push(file.key)
      }
      await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO photos (id,client_id,title,description,width,height,taken_at,latitude,longitude,location,exif,tags,featured,published,thumb_hash,analysis,video_mime,bytes,content_hash,source_name,created_at,updated_at) VALUES (${Array(22).fill('?').join(',')})`,
        ).bind(
          id,
          meta.clientId,
          meta.title,
          meta.description,
          meta.width,
          meta.height,
          meta.takenAt ? Date.parse(meta.takenAt) : null,
          erase ? null : meta.latitude,
          erase ? null : meta.longitude,
          erase ? '' : meta.location,
          JSON.stringify(meta.exif),
          JSON.stringify(meta.tags),
          Number(meta.featured),
          Number(meta.published),
          meta.thumbHash,
          meta.analysis ? JSON.stringify(meta.analysis) : null,
          videoType,
          files.reduce((sum, f) => sum + f.data.byteLength, 0),
          await digest(files[0].data),
          meta.sourceName,
          now,
          now,
        ),
        ...[...new Set(meta.albumIds)].map((album) =>
          c.env.DB.prepare('INSERT INTO album_photos VALUES (?,?)').bind(album, id),
        ),
      ])
    } catch (error) {
      await c.env.STORE.delete(written).catch(() =>
        console.error('Upload rollback needs storage cleanup', id),
      )
      const duplicate = await c.env.DB.prepare('SELECT id FROM photos WHERE client_id=?')
        .bind(meta.clientId)
        .first<{ id: string }>()
      if (duplicate)
        return c.json({ photo: await getPhoto(c.env, duplicate.id, true), duplicate: true })
      throw error
    }
    return c.json({ photo: await getPhoto(c.env, id, true), duplicate: false }, 201)
  })
  app.post('/api/photos/batch', requireAdmin, async (c) => {
    const body = await readJson(c, batchSchema),
      now = Date.now(),
      place = body.ids.map(() => '?').join(',')
    const count = await c.env.DB.prepare(`SELECT count(*) AS n FROM photos WHERE id IN (${place})`)
      .bind(...body.ids)
      .first<{ n: number }>()
    if (count?.n !== body.ids.length)
      throw new ApiError(404, 'NOT_FOUND', '部分照片已不存在，请刷新')
    if (body.action === 'add-to-album') {
      if (!body.albumId) throw new ApiError(400, 'INVALID_ALBUM', '请选择相册')
      await validateAlbums(c.env, [body.albumId])
      await c.env.DB.batch(
        body.ids.map((id) =>
          c.env.DB.prepare('INSERT OR IGNORE INTO album_photos VALUES (?,?)').bind(
            body.albumId!,
            id,
          ),
        ),
      )
    } else {
      const changes = {
        trash: 'deleted_at=?',
        restore: 'deleted_at=NULL',
        publish: 'published=1',
        unpublish: 'published=0',
        feature: 'featured=1',
        unfeature: 'featured=0',
      }
      await c.env.DB.prepare(
        `UPDATE photos SET ${changes[body.action]},updated_at=? WHERE id IN (${place})`,
      )
        .bind(...(body.action === 'trash' ? [now] : []), now, ...body.ids)
        .run()
    }
    return c.json({ ok: true, count: body.ids.length })
  })
  app.get('/api/photos/:id', async (c) => {
    const id = idSchema.parse(c.req.param('id')),
      row = await photoRow(c.env, id)
    const time = row.taken_at || row.created_at
    const neighbor = async (op: string, order: string) =>
      (
        await c.env.DB.prepare(
          `SELECT id FROM photos p WHERE ${visible} AND (COALESCE(taken_at,created_at),id) ${op} (?,?) ORDER BY COALESCE(taken_at,created_at) ${order},id ${order} LIMIT 1`,
        )
          .bind(time, id)
          .first<{ id: string }>()
      )?.id || null
    return c.json({
      photo: serializePhoto(row, await siteSettings(c.env)),
      previousId: await neighbor('>', 'ASC'),
      nextId: await neighbor('<', 'DESC'),
    })
  })
  app.patch('/api/photos/:id', requireAdmin, async (c) => {
    const id = idSchema.parse(c.req.param('id')),
      body = await readJson(c, photoEditSchema)
    await photoRow(c.env, id, true)
    await validateAlbums(c.env, body.albumIds)
    await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE photos SET title=?,description=?,taken_at=?,latitude=?,longitude=?,location=?,tags=?,featured=?,published=?,updated_at=? WHERE id=?',
      ).bind(
        body.title,
        body.description,
        body.takenAt ? Date.parse(body.takenAt) : null,
        body.latitude,
        body.longitude,
        body.location,
        JSON.stringify(body.tags),
        Number(body.featured),
        Number(body.published),
        Date.now(),
        id,
      ),
      c.env.DB.prepare('DELETE FROM album_photos WHERE photo_id=?').bind(id),
      ...[...new Set(body.albumIds)].map((album) =>
        c.env.DB.prepare('INSERT INTO album_photos VALUES (?,?)').bind(album, id),
      ),
    ])
    return c.json({ photo: await getPhoto(c.env, id, true) })
  })
  app.delete('/api/photos/:id', requireAdmin, async (c) => {
    const id = idSchema.parse(c.req.param('id')),
      row = await photoRow(c.env, id, true)
    if (c.req.query('permanent') === 'true') {
      if (!row.deleted_at) throw new ApiError(409, 'NOT_TRASHED', '请先将照片移入回收站')
      await c.env.STORE.delete(objectKeys(row))
      await c.env.DB.prepare('DELETE FROM photos WHERE id=?').bind(id).run()
    } else
      await c.env.DB.prepare('UPDATE photos SET deleted_at=?,updated_at=? WHERE id=?')
        .bind(Date.now(), Date.now(), id)
        .run()
    return c.json({ ok: true })
  })
  app.get('/api/photos/:id/download', async (c) => {
    const admin = !!(await session(c)),
      site = await siteSettings(c.env)
    if (!site.allowDownload && !admin)
      throw new ApiError(403, 'DOWNLOAD_DISABLED', '作者未开放下载')
    const row = await photoRow(c.env, idSchema.parse(c.req.param('id')), admin)
    const object = await c.env.STORE.get(`originals/${row.id}.webp`)
    if (!object) return notFound()
    return new Response(object.body, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${row.id}.webp"; filename*=UTF-8''${encodeURIComponent(row.title + '.webp')}`,
      },
    })
  })
  app.get('/media/:id/:variant', async (c) => {
    const admin = !!(await session(c)),
      row = await photoRow(c.env, idSchema.parse(c.req.param('id')), admin)
    const variant = c.req.param('variant')
    let key: string,
      mime = 'image/webp'
    if (variant === 'live' && row.video_mime) {
      mime = row.video_mime
      key = `videos/${row.id}.${mime === 'video/quicktime' ? 'mov' : 'mp4'}`
    } else {
      if (!['original.webp', 'sm.webp', 'md.webp', 'lg.webp'].includes(variant)) return notFound()
      key = variant === 'original.webp' ? `originals/${row.id}.webp` : `thumbs/${row.id}/${variant}`
    }
    const etag = `"${row.content_hash}-${variant}"`
    const headers: Record<string, string> = {
      'Content-Type': mime,
      'Cache-Control': 'private, no-cache',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
    }
    if (c.req.header('if-none-match') === etag) return new Response(null, { status: 304, headers })
    const object = await c.env.STORE.get(key)
    if (!object) return notFound()
    headers['Content-Length'] = String(object.size)
    if (variant === 'live') {
      headers['Accept-Ranges'] = 'bytes'
      const range = c.req.header('range')
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        const start = match?.[1]
          ? Number(match[1])
          : Math.max(0, object.size - Number(match?.[2] || 0))
        const end =
          match?.[1] && match?.[2] ? Math.min(Number(match[2]), object.size - 1) : object.size - 1
        if (!match || start > end || start >= object.size) {
          await object.body.cancel()
          return new Response(null, {
            status: 416,
            headers: {
              ...headers,
              'Content-Range': `bytes */${object.size}`,
              'Content-Length': '0',
            },
          })
        }
        const bytes = await new Response(object.body).arrayBuffer()
        headers['Content-Range'] = `bytes ${start}-${end}/${object.size}`
        headers['Content-Length'] = String(end - start + 1)
        return new Response(bytes.slice(start, end + 1), { status: 206, headers })
      }
    }
    return new Response(object.body, { headers })
  })
}
