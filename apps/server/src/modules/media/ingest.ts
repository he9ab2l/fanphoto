import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { uploadSchema, type Photo } from '@fanphoto/contracts'
import type { Database, SqlValue } from '../../core/database'
import type { ObjectStore } from '../../core/storage'
import { ApiError } from '../../core/errors'
import { SettingsService } from '../settings'
import { PhotoRepository } from '../gallery/repository'
import { processSource, sha256 } from './processor'
import { builtinModules, validateModules, type MediaModule } from './modules'

/** Sharp uses libvips' worker pool; limit simultaneous decodes and waiting RAM. */
export class IngestService {
  private active = false
  private waiting: (() => void)[] = []
  readonly modules: MediaModule[]
  constructor(
    readonly db: Database,
    readonly store: ObjectStore,
    readonly photos: PhotoRepository,
    readonly settings: SettingsService,
    modules = builtinModules,
  ) {
    this.modules = validateModules(modules)
  }
  private async acquire() {
    if (!this.active) {
      this.active = true
      return
    }
    if (this.waiting.length >= 2)
      throw new ApiError(503, 'PROCESSOR_BUSY', '处理队列繁忙，请稍后重试')
    await new Promise<void>((resolve) => this.waiting.push(resolve))
  }
  private release() {
    const next = this.waiting.shift()
    if (next) next()
    else this.active = false
  }
  async import(
    bytes: Uint8Array,
    filename: string,
    input: unknown,
  ): Promise<{ photo: Photo; duplicate: boolean }> {
    const options = uploadSchema.parse(input)
    const hash = sha256(bytes)
    const previous = this.db.get<{ source_hash: string }>(
      'SELECT source_hash FROM ingest_events WHERE client_id=? ORDER BY started_at DESC LIMIT 1',
      [options.clientId],
    )
    if (previous && previous.source_hash !== hash)
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', '同一上传标识不能用于不同文件')
    this.photos.validateAlbums(options.albumIds)
    await this.acquire()
    const id = randomUUID(),
      event = randomUUID(),
      now = Date.now()
    try {
      const currentAttempt = this.db.get<{ source_hash: string }>(
        'SELECT source_hash FROM ingest_events WHERE client_id=? ORDER BY started_at DESC LIMIT 1',
        [options.clientId],
      )
      if (currentAttempt && currentAttempt.source_hash !== hash)
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', '同一上传标识不能用于不同文件')
      const duplicate = this.db.get<{ id: string; deleted_at: number | null }>(
        'SELECT id,deleted_at FROM photos WHERE source_hash=?',
        [hash],
      )
      if (duplicate) {
        if (duplicate.deleted_at)
          throw new ApiError(409, 'PHOTO_IN_TRASH', '这张照片在回收站中，请先恢复')
        this.db.run("INSERT INTO ingest_events VALUES (?,?,?,?,'complete',NULL,?,?)", [
          event,
          options.clientId,
          hash,
          duplicate.id,
          now,
          now,
        ])
        return {
          photo: this.photos.full(this.photos.row(duplicate.id, true), true),
          duplicate: true,
        }
      }
      this.db.run(
        "INSERT INTO ingest_events(id,client_id,source_hash,status,started_at) VALUES (?,?,?,'processing',?)",
        [event, options.clientId, hash, now],
      )
      const prepared = await processSource(bytes)
      const settings = this.settings.get()
      const stripLocation = options.stripLocation || settings.stripLocationOnUpload
      const preserve = settings.keepOriginals && !stripLocation
      const extensions: { namespace: string; version: number; data: string }[] = []
      for (const module of this.modules) {
        const data = await module.prepare({
          photoId: id,
          preview: new Uint8Array(prepared.assets.find((asset) => asset.variant === 'sm')!.data),
          source: prepared.source,
          exif: Object.freeze({ ...prepared.exif }),
          hasAlpha: prepared.hasAlpha,
          colorSpace: prepared.colorSpace,
        })
        if (data !== null) {
          const serialized = JSON.stringify(data)
          if (Buffer.byteLength(serialized) > 32768)
            throw new ApiError(500, 'MODULE_DATA_LIMIT', '扩展元数据超过限制')
          extensions.push({
            namespace: module.namespace,
            version: module.version,
            data: serialized,
          })
        }
      }
      const assets = prepared.assets.map((asset) => ({
        ...asset,
        key: `${id}/${asset.variant}.webp`,
      }))
      for (const asset of assets) await this.store.put(asset.key, asset.data)
      const sourceKey = `${id}/source.${prepared.source.extension}`
      if (preserve) await this.store.put(sourceKey, bytes)
      this.db.transaction(() => {
        const row: Record<string, SqlValue> = {
          id,
          title:
            options.title ||
            basename(filename)
              .replace(/\.[^.]+$/, '')
              .slice(0, 160) ||
            '未命名照片',
          description: options.description,
          width: prepared.width,
          height: prepared.height,
          captured_at: prepared.takenAt,
          captured_local: prepared.capturedLocal,
          captured_offset: prepared.capturedOffset,
          latitude: stripLocation ? null : prepared.latitude,
          longitude: stripLocation ? null : prepared.longitude,
          location: stripLocation ? '' : options.location || prepared.location,
          exif: JSON.stringify(prepared.exif),
          analysis: JSON.stringify(prepared.analysis),
          thumb_hash: prepared.thumbHash,
          is_public: Number(options.isPublic),
          favorite: Number(options.favorite),
          source_hash: hash,
          source_name: basename(filename).slice(0, 240),
          source_mime: prepared.source.mime,
          source_width: prepared.source.width,
          source_height: prepared.source.height,
          source_bytes: bytes.byteLength,
          attribution: options.attribution ? JSON.stringify(options.attribution) : null,
          created_at: now,
          updated_at: now,
        }
        this.db.run(
          `INSERT INTO photos (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?')})`,
          Object.values(row),
        )
        for (const asset of assets)
          this.db.run('INSERT INTO assets VALUES (?,?,?,?,?,?,?,?)', [
            id,
            asset.variant,
            asset.key,
            asset.mime,
            asset.width,
            asset.height,
            asset.data.byteLength,
            asset.checksum,
          ])
        if (preserve)
          this.db.run('INSERT INTO assets VALUES (?,?,?,?,?,?,?,?)', [
            id,
            'source',
            sourceKey,
            prepared.source.mime,
            prepared.source.width,
            prepared.source.height,
            bytes.byteLength,
            hash,
          ])
        this.photos.setRelations(id, options.tags, options.albumIds)
        for (const extension of extensions)
          this.db.run('INSERT INTO extensions VALUES (?,?,?,?,?)', [
            id,
            extension.namespace,
            extension.version,
            extension.data,
            now,
          ])
        this.db.run(
          "UPDATE ingest_events SET photo_id=?,status='complete',finished_at=? WHERE id=?",
          [id, Date.now(), event],
        )
      })
      return { photo: this.photos.full(this.photos.row(id, true), true), duplicate: false }
    } catch (error) {
      await this.store.deletePhoto(id).catch(() => console.error('Orphan media cleanup needed', id))
      this.db.run(
        "UPDATE ingest_events SET status='failed',error_code=?,finished_at=? WHERE id=?",
        [error instanceof ApiError ? error.code : 'IMPORT_FAILED', Date.now(), event],
      )
      throw error
    } finally {
      this.release()
    }
  }
}
