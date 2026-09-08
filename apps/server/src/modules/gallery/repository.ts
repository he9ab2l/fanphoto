import {
  listSchema,
  variants,
  type Photo,
  type PhotoSummary,
  type PhotoPage,
  type ListOptions,
  type Album,
  type SiteSettings,
  type AdminPhotoPage,
} from '@fanphoto/contracts'
import { Database, type SqlValue } from '../../core/database'
import { ApiError, notFound } from '../../core/errors'
import { digest } from '../../core/security'

export interface PhotoRow {
  id: string
  title: string
  description: string
  width: number
  height: number
  captured_at: number | null
  captured_local: string | null
  captured_offset: string | null
  latitude: number | null
  longitude: number | null
  location: string
  exif: string
  analysis: string
  thumb_hash: string | null
  is_public: number
  favorite: number
  deleted_at: number | null
  source_hash: string
  source_name: string
  source_mime: string
  source_width: number
  source_height: number
  source_bytes: number
  attribution: string | null
  created_at: number
  updated_at: number
  tags_json: string
  albums_json: string
  assets_json: string
}
export interface AssetRow {
  photo_id: string
  variant: string
  storage_key: string
  mime: string
  width: number
  height: number
  bytes: number
  checksum: string
}
type AssetInfo = Pick<AssetRow, 'variant' | 'width' | 'height' | 'bytes' | 'checksum'>
type SummaryRow = Pick<
  PhotoRow,
  | 'id'
  | 'title'
  | 'width'
  | 'height'
  | 'captured_at'
  | 'captured_local'
  | 'captured_offset'
  | 'location'
  | 'favorite'
  | 'thumb_hash'
  | 'created_at'
  | 'tags_json'
  | 'assets_json'
>
const summarySelect = `p.id,p.title,p.width,p.height,p.captured_at,p.captured_local,p.captured_offset,
  p.location,p.favorite,p.thumb_hash,p.created_at,
  (SELECT json_group_array(tag) FROM photo_tags WHERE photo_id=p.id) tags_json,
  (SELECT json_group_array(json_object('variant',variant,'width',width,'height',height,'bytes',bytes,'checksum',checksum))
   FROM assets WHERE photo_id=p.id AND variant!='source') assets_json`
export const photoSelect = `p.*,
  (SELECT json_group_array(tag) FROM photo_tags WHERE photo_id=p.id) tags_json,
  (SELECT json_group_array(album_id) FROM album_photos WHERE photo_id=p.id) albums_json,
  (SELECT json_group_array(json_object('variant',variant,'width',width,'height',height,'bytes',bytes,'checksum',checksum))
   FROM assets WHERE photo_id=p.id) assets_json`
const time = 'COALESCE(p.captured_at,p.created_at)'
const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString())

export class PhotoRepository {
  constructor(
    readonly db: Database,
    readonly settings: () => SiteSettings,
  ) {}
  row(id: string, admin = false): PhotoRow {
    const row = this.db.get<PhotoRow>(
      `SELECT ${photoSelect} FROM photos p WHERE p.id=? ${admin ? '' : 'AND p.is_public=1 AND p.deleted_at IS NULL'}`,
      [id],
    )
    if (!row) return notFound()
    return row
  }
  /** Media requests do not need EXIF, analysis or JSON relationship subqueries.
   * Visibility is still checked in this query, before any conditional 304. */
  asset(id: string, variant: string, admin = false) {
    const asset = this.db.get<AssetRow & { title: string; source_name: string }>(
      `SELECT a.*,p.title,p.source_name FROM assets a JOIN photos p ON p.id=a.photo_id
       WHERE p.id=? AND a.variant=? ${admin ? '' : 'AND p.is_public=1 AND p.deleted_at IS NULL'}`,
      [id, variant],
    )
    if (!asset) return notFound()
    return asset
  }
  private serializeSummary(
    row: SummaryRow,
    showLocation: boolean,
    assets: AssetInfo[] = JSON.parse(row.assets_json),
  ): PhotoSummary {
    return {
      id: row.id,
      title: row.title,
      width: row.width,
      height: row.height,
      capturedAt: row.captured_offset ? iso(row.captured_at) : null,
      capturedLocal: row.captured_local,
      capturedOffset: row.captured_offset,
      location: showLocation ? row.location : '',
      tags: JSON.parse(row.tags_json),
      favorite: !!row.favorite,
      thumbHash: row.thumb_hash,
      assets: Object.fromEntries(
        variants.map((variant) => {
          const asset = assets.find((asset) => asset.variant === variant)
          if (!asset) throw new ApiError(500, 'MISSING_ASSET', '照片派生文件记录不完整')
          return [
            variant,
            {
              url: `/media/photos/${row.id}/${variant}?v=${asset.checksum.slice(0, 16)}`,
              width: asset.width,
              height: asset.height,
              bytes: asset.bytes,
            },
          ]
        }),
      ) as PhotoSummary['assets'],
    }
  }
  summary(
    row: SummaryRow,
    admin = false,
    showLocation = admin || this.settings().showLocation,
  ): PhotoSummary {
    return this.serializeSummary(row, showLocation)
  }
  full(row: PhotoRow, admin = false, show = admin || this.settings().showLocation): Photo {
    const assets = JSON.parse(row.assets_json) as AssetInfo[]
    return {
      ...this.serializeSummary(row, show, assets),
      description: row.description,
      latitude: show ? row.latitude : null,
      longitude: show ? row.longitude : null,
      exif: JSON.parse(row.exif),
      analysis: JSON.parse(row.analysis),
      attribution: row.attribution ? JSON.parse(row.attribution) : null,
      albumIds: JSON.parse(row.albums_json),
      createdAt: iso(row.created_at)!,
      updatedAt: iso(row.updated_at)!,
      isPublic: !!row.is_public,
      deletedAt: iso(row.deleted_at),
      file: {
        name: admin ? row.source_name : null,
        mime: row.source_mime,
        bytes: row.source_bytes,
        width: row.source_width,
        height: row.source_height,
        originalAvailable: admin && assets.some((asset) => asset.variant === 'source'),
      },
    }
  }
  filters(query: Record<string, string>, admin: boolean) {
    const options = listSchema.parse(query)
    const where = [
      admin && options.status === 'trash' ? 'p.deleted_at IS NOT NULL' : 'p.deleted_at IS NULL',
    ]
    const values: SqlValue[] = []
    if (!admin || options.status === 'public') where.push('p.is_public=1')
    else if (options.status === 'private') where.push('p.is_public=0')
    if (options.q) {
      const pattern = `%${options.q.replace(/[\\%_]/g, '\\$&')}%`
      const location = admin || this.settings().showLocation
      where.push(`(p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\'
        OR json_extract(p.exif,'$.model') LIKE ? ESCAPE '\\'
        ${location ? "OR p.location LIKE ? ESCAPE '\\'" : ''}
        OR EXISTS(SELECT 1 FROM photo_tags WHERE photo_id=p.id AND tag LIKE ? ESCAPE '\\'))`)
      values.push(pattern, pattern, pattern, ...(location ? [pattern] : []), pattern)
    }
    if (options.tag) {
      where.push('EXISTS(SELECT 1 FROM photo_tags WHERE photo_id=p.id AND tag=?)')
      values.push(options.tag)
    }
    if (options.album) {
      where.push('EXISTS(SELECT 1 FROM album_photos WHERE photo_id=p.id AND album_id=?)')
      values.push(options.album)
    }
    if (options.favorite) {
      where.push('p.favorite=?')
      values.push(Number(options.favorite === 'true'))
    }
    const shapes = {
      all: '',
      portrait: 'p.width*1.0/p.height<0.85',
      square: 'p.width*1.0/p.height BETWEEN 0.92 AND 1.08',
      landscape: 'p.width*1.0/p.height>1.15 AND p.width*1.0/p.height<2.4',
      panorama: 'p.width*1.0/p.height>=2.4',
    }
    if (shapes[options.orientation]) where.push(`(${shapes[options.orientation]})`)
    return { options, where, values }
  }
  list(query: Record<string, string>, admin: false): PhotoPage
  list(query: Record<string, string>, admin: true): AdminPhotoPage
  list(query: Record<string, string>, admin = false): PhotoPage | AdminPhotoPage {
    const { options, where, values } = this.filters(query, admin)
    const total = this.db.get<{ n: number }>(
      `SELECT count(*) n FROM photos p WHERE ${where.join(' AND ')}`,
      values,
    )!.n
    const fingerprint = this.fingerprint(options, admin)
    const asc = options.sort === 'oldest'
    if (options.cursor) {
      try {
        const cursor = JSON.parse(Buffer.from(options.cursor, 'base64url').toString())
        if (
          cursor.k !== fingerprint ||
          !Number.isFinite(cursor.t) ||
          !/^[a-f0-9-]{36}$/.test(cursor.id)
        )
          throw new Error('cursor')
        where.push(`(${time},p.id) ${asc ? '>' : '<'} (?,?)`)
        values.push(cursor.t, cursor.id)
      } catch {
        throw new ApiError(400, 'INVALID_CURSOR', '分页位置与筛选不匹配，请重新加载')
      }
    }
    const rows = this.db.all<SummaryRow | PhotoRow>(
      `SELECT ${admin ? photoSelect : summarySelect} FROM photos p WHERE ${where.join(' AND ')}
      ORDER BY ${time} ${asc ? 'ASC' : 'DESC'},p.id ${asc ? 'ASC' : 'DESC'} LIMIT ?`,
      [...values, options.limit + 1],
    )
    const items = rows.slice(0, options.limit)
    const last = items.at(-1)
    const showLocation = admin || this.settings().showLocation
    return {
      items: items.map((row) =>
        admin && 'description' in row
          ? this.full(row, true, showLocation)
          : this.summary(row, admin, showLocation),
      ),
      page: {
        total,
        limit: options.limit,
        nextCursor:
          rows.length > options.limit && last
            ? Buffer.from(
                JSON.stringify({
                  t: last.captured_at ?? last.created_at,
                  id: last.id,
                  k: fingerprint,
                }),
              ).toString('base64url')
            : null,
      },
    }
  }
  fingerprint(options: ListOptions, admin: boolean) {
    return digest(
      JSON.stringify([
        admin,
        options.q,
        options.tag,
        options.album,
        options.orientation,
        options.favorite,
        options.sort,
        options.status,
      ]),
    ).slice(0, 16)
  }
  detail(id: string, query: Record<string, string> = {}, admin = false) {
    const row = this.row(id, admin)
    const { options, where, values } = this.filters(query, admin)
    const asc = options.sort === 'oldest'
    const neighbor = (previous: boolean) => {
      const greater = previous !== asc
      return (
        this.db.get<{ id: string }>(
          `SELECT p.id FROM photos p WHERE ${where.join(' AND ')} AND (${time},p.id) ${greater ? '>' : '<'} (?,?)
        ORDER BY ${time} ${greater ? 'ASC' : 'DESC'},p.id ${greater ? 'ASC' : 'DESC'} LIMIT 1`,
          [...values, row.captured_at ?? row.created_at, id],
        )?.id || null
      )
    }
    return {
      photo: this.full(row, admin),
      neighbors: { previous: neighbor(true), next: neighbor(false) },
    }
  }
  validateAlbums(ids: string[]) {
    const unique = [...new Set(ids)]
    if (!unique.length) return
    const count = this.db.get<{ n: number }>(
      `SELECT count(*) n FROM albums WHERE id IN (${unique.map(() => '?')})`,
      unique,
    )!.n
    if (count !== unique.length) throw new ApiError(400, 'INVALID_ALBUM', '所选相册已不存在')
  }
  setRelations(id: string, tags: string[], albums: string[]) {
    this.db.run('DELETE FROM photo_tags WHERE photo_id=?', [id])
    this.db.run('DELETE FROM album_photos WHERE photo_id=?', [id])
    for (const tag of tags) {
      this.db.run('INSERT OR IGNORE INTO tags VALUES (?)', [tag])
      this.db.run('INSERT INTO photo_tags VALUES (?,?)', [id, tag])
    }
    for (const album of new Set(albums))
      this.db.run('INSERT INTO album_photos(album_id,photo_id) VALUES (?,?)', [album, id])
  }
  albums(admin = false): Album[] {
    const condition = `p.deleted_at IS NULL${admin ? '' : ' AND p.is_public=1'}`
    const albums = this.db.all<{
      id: string
      title: string
      description: string
      count: number
      cover_id: string | null
    }>(
      `WITH ranked AS (
        SELECT ap.album_id,p.id,COUNT(*) OVER(PARTITION BY ap.album_id) count,
          ROW_NUMBER() OVER(PARTITION BY ap.album_id ORDER BY p.favorite DESC,ap.position,p.created_at DESC,p.id DESC) rank
        FROM album_photos ap JOIN photos p ON p.id=ap.photo_id WHERE ${condition}
      )
      SELECT a.id,a.title,a.description,COALESCE(r.count,0) count,r.id cover_id
      FROM albums a LEFT JOIN ranked r ON r.album_id=a.id AND r.rank=1
      ${admin ? '' : 'WHERE r.count>0'} ORDER BY a.created_at DESC,a.id`,
    )
    const ids = [...new Set(albums.flatMap((album) => (album.cover_id ? [album.cover_id] : [])))]
    const covers = new Map(
      (ids.length
        ? this.db.all<SummaryRow>(
            `SELECT ${summarySelect} FROM photos p WHERE p.id IN (${ids.map(() => '?')}) AND ${condition}`,
            ids,
          )
        : []
      ).map((row) => [row.id, row]),
    )
    const showLocation = admin || this.settings().showLocation
    return albums.map(({ cover_id, ...album }) => ({
      ...album,
      cover:
        cover_id && covers.has(cover_id)
          ? this.summary(covers.get(cover_id)!, admin, showLocation)
          : null,
    }))
  }
}
