import { resolve } from 'node:path'
import type { Config } from './core/config'
import { Database } from './core/database'
import { FileStore } from './core/storage'
import { AuthService } from './modules/auth'
import { SettingsService } from './modules/settings'
import { PhotoRepository } from './modules/gallery/repository'
import { GalleryService } from './modules/gallery/service'
import { IngestService } from './modules/media/ingest'
import type { MediaModule } from './modules/media/modules'

export async function createServices(config: Config, modules?: MediaModule[]) {
  const db = new Database(resolve(config.data, 'library.sqlite'))
  await db.migrate(resolve(config.root, 'apps/server/migrations'))
  const store = new FileStore(resolve(config.data, 'media'))
  const settings = new SettingsService(db)
  const photos = new PhotoRepository(db, () => settings.get())
  return {
    config,
    db,
    store,
    settings,
    photos,
    auth: new AuthService(db, config),
    gallery: new GalleryService(db, store, photos),
    ingest: new IngestService(db, store, photos, settings, modules),
  }
}
export type Services = Awaited<ReturnType<typeof createServices>>
