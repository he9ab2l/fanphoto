import {
  defaultSettings,
  settingsSchema,
  type SiteSettings,
  type SiteInfo,
} from '@fanphoto/contracts'
import type { Database } from '../core/database'

export class SettingsService {
  constructor(readonly db: Database) {}
  get(): SiteSettings {
    const row = this.db.get<{ value: string }>("SELECT value FROM settings WHERE key='site'")
    return row ? settingsSchema.parse(JSON.parse(row.value)) : { ...defaultSettings }
  }
  save(input: unknown) {
    const settings = settingsSchema.parse(input)
    this.db.run(
      "INSERT INTO settings VALUES ('site',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [JSON.stringify(settings)],
    )
    return settings
  }
  publicInfo(): SiteInfo {
    const { title, description, author, showLocation, allowDownloads } = this.get()
    return {
      site: { title, description, author, showLocation, allowDownloads },
      counts: {
        photos: this.db.get<{ n: number }>(
          'SELECT count(*) n FROM photos WHERE is_public=1 AND deleted_at IS NULL',
        )!.n,
        albums: this.db.get<{ n: number }>(
          'SELECT count(*) n FROM albums a WHERE EXISTS(SELECT 1 FROM album_photos ap JOIN photos p ON p.id=ap.photo_id WHERE ap.album_id=a.id AND p.is_public=1 AND p.deleted_at IS NULL)',
        )!.n,
      },
      tags: this.db.all<{ name: string; count: number }>(
        'SELECT pt.tag name,count(*) count FROM photo_tags pt JOIN photos p ON p.id=pt.photo_id WHERE p.is_public=1 AND p.deleted_at IS NULL GROUP BY pt.tag ORDER BY count DESC,pt.tag LIMIT 100',
      ),
    }
  }
}
