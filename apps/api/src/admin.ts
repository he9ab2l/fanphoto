import type { Hono } from 'hono'
import { z } from 'zod'
import { albumSchema, idSchema, siteSchema } from '@fanphoto/shared'
import { requireAdmin } from './auth'
import { ApiError, readJson, notFound } from './errors'
import { randomToken } from './crypto'
import { listAlbums, listPhotos, siteSettings, visible, photoRow } from './repository'
import type { ApiEnv } from './types'

export function adminRoutes(app: Hono<ApiEnv>) {
  app.get('/api/site', async (c) => {
    const site = await siteSettings(c.env)
    const stats = await c.env.DB.prepare(
      `SELECT count(*) AS photos,count(DISTINCT CASE WHEN latitude IS NOT NULL THEN round(latitude,1)||','||round(longitude,1) END) AS locations FROM photos p WHERE ${visible}`,
    ).first<{ photos: number; locations: number }>()
    const albums = await c.env.DB.prepare('SELECT count(*) AS n FROM albums').first<{ n: number }>()
    const tags = (
      await c.env.DB.prepare(
        `SELECT value AS name,count(*) AS count FROM photos p,json_each(p.tags) WHERE ${visible} GROUP BY value ORDER BY count DESC,value LIMIT 40`,
      ).all<{ name: string; count: number }>()
    ).results
    return c.json({
      site,
      stats: {
        photos: stats?.photos || 0,
        albums: albums?.n || 0,
        locations: site.showLocation ? stats?.locations || 0 : 0,
      },
      tags,
    })
  })
  app.get('/api/settings', requireAdmin, async (c) => c.json({ site: await siteSettings(c.env) }))
  app.patch('/api/settings', requireAdmin, async (c) => {
    const site = await readJson(c, siteSchema)
    await c.env.DB.prepare(
      "INSERT INTO settings VALUES ('site',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
      .bind(JSON.stringify(site))
      .run()
    return c.json({ site })
  })
  app.get('/api/albums', async (c) => c.json({ albums: await listAlbums(c.env) }))
  app.get('/api/admin/albums', requireAdmin, async (c) =>
    c.json({ albums: await listAlbums(c.env, true) }),
  )
  app.get('/api/albums/:id', async (c) => {
    const id = idSchema.parse(c.req.param('id')),
      album = (await listAlbums(c.env)).find((a) => a.id === id)
    if (!album) return notFound()
    return c.json({ album })
  })
  app.post('/api/albums', requireAdmin, async (c) => {
    const body = await readJson(c, albumSchema),
      id = randomToken(12),
      now = Date.now()
    if (body.coverId) await photoRow(c.env, body.coverId, true)
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO albums VALUES (?,?,?,?,?,?)').bind(
        id,
        body.title,
        body.description,
        body.coverId,
        now,
        now,
      ),
      ...(body.coverId
        ? [c.env.DB.prepare('INSERT INTO album_photos VALUES (?,?)').bind(id, body.coverId)]
        : []),
    ])
    return c.json({ album: (await listAlbums(c.env, true)).find((a) => a.id === id) }, 201)
  })
  app.patch('/api/albums/:id', requireAdmin, async (c) => {
    const id = idSchema.parse(c.req.param('id')),
      body = await readJson(c, albumSchema)
    const found = await c.env.DB.prepare('SELECT id FROM albums WHERE id=?').bind(id).first()
    if (!found) return notFound()
    if (body.coverId) {
      const member = await c.env.DB.prepare(
        'SELECT photo_id FROM album_photos WHERE album_id=? AND photo_id=?',
      )
        .bind(id, body.coverId)
        .first()
      if (!member) throw new ApiError(400, 'INVALID_COVER', '封面需要属于这个相册')
    }
    await c.env.DB.prepare(
      'UPDATE albums SET title=?,description=?,cover_id=?,updated_at=? WHERE id=?',
    )
      .bind(body.title, body.description, body.coverId, Date.now(), id)
      .run()
    return c.json({ album: (await listAlbums(c.env, true)).find((a) => a.id === id) })
  })
  app.delete('/api/albums/:id', requireAdmin, async (c) => {
    const result = await c.env.DB.prepare('DELETE FROM albums WHERE id=?')
      .bind(idSchema.parse(c.req.param('id')))
      .run()
    if (!result.meta.changes) return notFound()
    return c.json({ ok: true })
  })
  app.get('/api/admin/stats', requireAdmin, async (c) => {
    const row = await c.env.DB.prepare(
      `SELECT count(CASE WHEN deleted_at IS NULL THEN 1 END) AS photos,count(CASE WHEN deleted_at IS NULL AND published=1 THEN 1 END) AS published,count(CASE WHEN deleted_at IS NULL AND featured=1 THEN 1 END) AS featured,count(deleted_at) AS trash,coalesce(sum(bytes),0) AS bytes FROM photos`,
    ).first<Record<string, number>>()
    const albums = await c.env.DB.prepare('SELECT count(*) AS n FROM albums').first<{ n: number }>()
    const months = (
      await c.env.DB.prepare(
        "SELECT strftime('%Y-%m',created_at/1000,'unixepoch') AS month,count(*) AS count FROM photos WHERE deleted_at IS NULL GROUP BY month ORDER BY month DESC LIMIT 6",
      ).all()
    ).results
    return c.json({
      ...row,
      albums: albums?.n || 0,
      months,
      recent: (await listPhotos(c.env, { limit: '8' }, true)).photos,
    })
  })
  app.post('/api/admin/privacy/erase-location', requireAdmin, async (c) => {
    await readJson(c, z.object({ confirm: z.literal('ERASE_LOCATION') }).strict())
    await c.env.DB.prepare(
      "UPDATE photos SET latitude=NULL,longitude=NULL,location='',updated_at=?",
    )
      .bind(Date.now())
      .run()
    return c.json({ ok: true })
  })
  app.get('/api/admin/export', requireAdmin, async (c) => {
    const [photos, albums, albumPhotos] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM photos').all(),
      c.env.DB.prepare('SELECT * FROM albums').all(),
      c.env.DB.prepare('SELECT * FROM album_photos').all(),
    ])
    c.header('Content-Disposition', 'attachment; filename="fanphoto-metadata.json"')
    return c.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      site: await siteSettings(c.env),
      photos: photos.results,
      albums: albums.results,
      albumPhotos: albumPhotos.results,
    })
  })
}
