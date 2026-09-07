import { randomUUID } from 'node:crypto'
import { photoEditSchema, batchSchema, albumSchema, type LibraryStats } from '@fanphoto/contracts'
import type { Database } from '../../core/database'
import type { ObjectStore } from '../../core/storage'
import { ApiError, notFound } from '../../core/errors'
import { PhotoRepository } from './repository'

export class GalleryService {
  constructor(
    readonly db: Database,
    readonly store: ObjectStore,
    readonly photos: PhotoRepository,
  ) {}
  edit(id: string, input: unknown) {
    const data = photoEditSchema.parse(input)
    this.photos.row(id, true)
    this.photos.validateAlbums(data.albumIds)
    this.db.transaction(() => {
      this.db.run(
        'UPDATE photos SET title=?,description=?,location=?,is_public=?,favorite=?,updated_at=? WHERE id=?',
        [
          data.title,
          data.description,
          data.location,
          Number(data.isPublic),
          Number(data.favorite),
          Date.now(),
          id,
        ],
      )
      this.photos.setRelations(id, data.tags, data.albumIds)
    })
    return this.photos.full(this.photos.row(id, true), true)
  }
  batch(input: unknown) {
    const data = batchSchema.parse(input)
    const slots = data.ids.map(() => '?').join(',')
    const count = this.db.get<{ n: number }>(
      `SELECT count(*) n FROM photos WHERE id IN (${slots})`,
      data.ids,
    )!.n
    if (count !== data.ids.length) return notFound()
    if (data.action === 'add-to-album') {
      if (!data.albumId) throw new ApiError(400, 'ALBUM_REQUIRED', '请选择相册')
      this.photos.validateAlbums([data.albumId])
      this.db.transaction(() => {
        for (const id of data.ids)
          this.db.run('INSERT OR IGNORE INTO album_photos(album_id,photo_id) VALUES (?,?)', [
            data.albumId!,
            id,
          ])
      })
    } else {
      const changes = {
        trash: 'deleted_at=?',
        restore: 'deleted_at=NULL',
        publish: 'is_public=1',
        unpublish: 'is_public=0',
        favorite: 'favorite=1',
        unfavorite: 'favorite=0',
      }
      this.db.run(`UPDATE photos SET ${changes[data.action]},updated_at=? WHERE id IN (${slots})`, [
        ...(data.action === 'trash' ? [Date.now()] : []),
        Date.now(),
        ...data.ids,
      ])
    }
    return { count }
  }
  async purge(id: string) {
    const photo = this.photos.row(id, true)
    if (!photo.deleted_at) throw new ApiError(409, 'NOT_IN_TRASH', '请先将照片移入回收站')
    await this.store.deletePhoto(id)
    this.db.run('DELETE FROM photos WHERE id=?', [id])
  }
  saveAlbum(input: unknown, id?: string) {
    const data = albumSchema.parse(input),
      now = Date.now()
    if (id && !this.db.get('SELECT id FROM albums WHERE id=?', [id])) return notFound()
    const albumId = id || randomUUID()
    if (id)
      this.db.run('UPDATE albums SET title=?,description=?,updated_at=? WHERE id=?', [
        data.title,
        data.description,
        now,
        id,
      ])
    else
      this.db.run('INSERT INTO albums VALUES (?,?,?,?,?)', [
        albumId,
        data.title,
        data.description,
        now,
        now,
      ])
    return this.photos.albums(true).find((album) => album.id === albumId)!
  }
  deleteAlbum(id: string) {
    if (!this.db.run('DELETE FROM albums WHERE id=?', [id]).changes) return notFound()
  }
  stats(): LibraryStats {
    return {
      ...this.db.get<Omit<LibraryStats, 'albums'>>(`SELECT
        count(CASE WHEN deleted_at IS NULL THEN 1 END) total,
        count(CASE WHEN deleted_at IS NULL AND is_public=1 THEN 1 END) public,
        count(CASE WHEN deleted_at IS NULL AND is_public=0 THEN 1 END) private,
        count(deleted_at) trash,
        count(CASE WHEN deleted_at IS NULL AND favorite=1 THEN 1 END) favorites,
        coalesce((SELECT sum(bytes) FROM assets),0) bytes FROM photos`)!,
      albums: this.db.get<{ n: number }>('SELECT count(*) n FROM albums')!.n,
    }
  }
}
