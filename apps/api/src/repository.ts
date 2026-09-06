import {
  defaultSite,
  variants,
  type Photo,
  type SiteSettings,
  type PhotoList,
  type Album,
} from '@fanphoto/shared'
import { z } from 'zod'
import type { Bindings, PhotoRow, SqlValue, AlbumRow } from './types'
import { ApiError, notFound } from './errors'

export const photoSelect = `p.*, (SELECT json_group_array(album_id) FROM album_photos WHERE photo_id=p.id) AS album_ids`
export const visible = 'p.published=1 AND p.deleted_at IS NULL'
export async function siteSettings(env: Bindings): Promise<SiteSettings> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='site'").first<{
    value: string
  }>()
  return { ...defaultSite, ...(row ? JSON.parse(row.value) : {}) }
}
export function serializePhoto(row: PhotoRow, site: SiteSettings, admin = false): Photo {
  const show = admin || site.showLocation
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    width: row.width,
    height: row.height,
    takenAt: row.taken_at ? new Date(row.taken_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    latitude: show ? row.latitude : null,
    longitude: show ? row.longitude : null,
    location: show ? row.location : '',
    exif: JSON.parse(row.exif),
    tags: JSON.parse(row.tags),
    albumIds: JSON.parse(row.album_ids || '[]'),
    featured: !!row.featured,
    published: !!row.published,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    thumbHash: row.thumb_hash,
    analysis: row.analysis ? JSON.parse(row.analysis) : null,
    urls: Object.fromEntries(
      variants.map((size) => [size, `/media/${row.id}/${size}.webp`]),
    ) as Photo['urls'],
    videoUrl: row.video_mime ? `/media/${row.id}/live` : null,
    bytes: row.bytes,
    sourceName: admin ? row.source_name : '',
    isDemo: !!row.is_demo,
  }
}
export async function photoRow(env: Bindings, id: string, admin = false) {
  const row = await env.DB.prepare(
    `SELECT ${photoSelect} FROM photos p WHERE p.id=? ${admin ? '' : `AND ${visible}`}`,
  )
    .bind(id)
    .first<PhotoRow>()
  if (!row) return notFound()
  return row
}
export async function getPhoto(env: Bindings, id: string, admin = false) {
  return serializePhoto(await photoRow(env, id, admin), await siteSettings(env), admin)
}
export const listSchema = z.object({
  q: z.string().max(160).default(''),
  tag: z.string().max(30).optional(),
  album: z.string().max(64).optional(),
  featured: z.enum(['true', 'false']).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  limit: z.coerce.number().int().min(1).max(60).default(36),
  cursor: z.string().max(256).optional(),
  state: z.enum(['active', 'trash']).default('active'),
  status: z.enum(['all', 'published', 'draft']).default('all'),
})
export async function listPhotos(
  env: Bindings,
  query: Record<string, string>,
  admin = false,
): Promise<PhotoList> {
  const params = listSchema.parse(query)
  const site = await siteSettings(env)
  const where = [
    admin
      ? params.state === 'trash'
        ? 'p.deleted_at IS NOT NULL'
        : 'p.deleted_at IS NULL'
      : visible,
  ]
  const values: SqlValue[] = []
  if (params.q.trim()) {
    where.push(
      `(p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\' ${admin || site.showLocation ? "OR p.location LIKE ? ESCAPE '\\'" : ''} OR EXISTS(SELECT 1 FROM json_each(p.tags) WHERE value LIKE ? ESCAPE '\\'))`,
    )
    const pattern = `%${params.q.trim().replace(/[\\%_]/g, '\\$&')}%`
    values.push(pattern, pattern, ...(admin || site.showLocation ? [pattern] : []), pattern)
  }
  if (params.tag) {
    where.push('EXISTS(SELECT 1 FROM json_each(p.tags) WHERE value=?)')
    values.push(params.tag)
  }
  if (params.album) {
    where.push('EXISTS(SELECT 1 FROM album_photos WHERE photo_id=p.id AND album_id=?)')
    values.push(params.album)
  }
  if (params.featured) {
    where.push('p.featured=?')
    values.push(Number(params.featured === 'true'))
  }
  if (admin && params.status !== 'all') {
    where.push('p.published=?')
    values.push(Number(params.status === 'published'))
  }
  const count = await env.DB.prepare(
    `SELECT count(*) AS n FROM photos p WHERE ${where.join(' AND ')}`,
  )
    .bind(...values)
    .first<{ n: number }>()
  const direction = params.sort === 'oldest' ? 'ASC' : 'DESC',
    comparison = params.sort === 'oldest' ? '>' : '<'
  if (params.cursor) {
    try {
      const cursor = z
        .object({ t: z.number().finite(), id: z.string().regex(/^[\w-]{8,64}$/), sort: z.string() })
        .parse(JSON.parse(atob(params.cursor)))
      if (cursor.sort !== params.sort) throw new Error('sort')
      where.push(`(COALESCE(p.taken_at,p.created_at),p.id) ${comparison} (?,?)`)
      values.push(cursor.t, cursor.id)
    } catch {
      throw new ApiError(400, 'INVALID_CURSOR', '分页位置已失效，请刷新列表')
    }
  }
  const rows = (
    await env.DB.prepare(
      `SELECT ${photoSelect} FROM photos p WHERE ${where.join(' AND ')} ORDER BY COALESCE(p.taken_at,p.created_at) ${direction},p.id ${direction} LIMIT ?`,
    )
      .bind(...values, params.limit + 1)
      .all<PhotoRow>()
  ).results
  const hasMore = rows.length > params.limit,
    result = rows.slice(0, params.limit),
    last = result.at(-1)
  return {
    photos: result.map((row) => serializePhoto(row, site, admin)),
    total: count?.n || 0,
    nextCursor:
      hasMore && last
        ? btoa(
            JSON.stringify({ t: last.taken_at || last.created_at, id: last.id, sort: params.sort }),
          )
        : null,
  }
}
export async function validateAlbums(env: Bindings, ids: string[]) {
  if (!ids.length) return
  const found = await env.DB.prepare(
    `SELECT count(*) AS n FROM albums WHERE id IN (${ids.map(() => '?').join(',')})`,
  )
    .bind(...ids)
    .first<{ n: number }>()
  if (found?.n !== new Set(ids).size) throw new ApiError(400, 'ALBUM_NOT_FOUND', '选择的相册不存在')
}
export async function listAlbums(env: Bindings, admin = false): Promise<Album[]> {
  const rows = (
    await env.DB.prepare('SELECT * FROM albums ORDER BY created_at DESC,id DESC').all<AlbumRow>()
  ).results
  const site = await siteSettings(env)
  return Promise.all(
    rows.map(async (album) => {
      const condition = admin ? 'p.deleted_at IS NULL' : visible
      const count = await env.DB.prepare(
        `SELECT count(*) AS n FROM photos p JOIN album_photos a ON a.photo_id=p.id WHERE a.album_id=? AND ${condition}`,
      )
        .bind(album.id)
        .first<{ n: number }>()
      const cover = await env.DB.prepare(
        `SELECT ${photoSelect} FROM photos p JOIN album_photos a ON a.photo_id=p.id WHERE a.album_id=? AND ${condition} ORDER BY (p.id=?) DESC,p.featured DESC,p.created_at DESC LIMIT 1`,
      )
        .bind(album.id, album.cover_id)
        .first<PhotoRow>()
      return {
        id: album.id,
        title: album.title,
        description: album.description,
        coverId: album.cover_id,
        cover: cover ? serializePhoto(cover, site, admin) : null,
        photoCount: count?.n || 0,
        createdAt: new Date(album.created_at).toISOString(),
      }
    }),
  )
}
export const objectKeys = (row: Pick<PhotoRow, 'id' | 'video_mime'>) => [
  `originals/${row.id}.webp`,
  ...['sm', 'md', 'lg'].map((size) => `thumbs/${row.id}/${size}.webp`),
  ...(row.video_mime
    ? [`videos/${row.id}.${row.video_mime === 'video/quicktime' ? 'mov' : 'mp4'}`]
    : []),
]
