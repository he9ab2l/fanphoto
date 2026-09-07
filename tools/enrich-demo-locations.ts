import { readFile } from 'node:fs/promises'
import { configuration } from '../apps/server/src/core/config'
import { createServices } from '../apps/server/src/services'
import { extractMetadata } from '../apps/server/src/modules/media/metadata'
import { sha256 } from '../apps/server/src/modules/media/processor'
import type { AssetRow, PhotoRow } from '../apps/server/src/modules/gallery/repository'

// Initial fixture enrichment only. Never overwrite a supplied location or
// restore metadata for an upload that intentionally discarded its source.
if (!process.argv.includes('--initial-demo-only'))
  throw new Error('Explicit --initial-demo-only flag required')
const manifest = JSON.parse(await readFile('test-photo/commons-landscapes/manifest.json', 'utf8'))
const known = new Set(manifest.photos.map((photo: { sha256: string }) => photo.sha256))
const services = await createServices(configuration())
let updated = 0
try {
  for (const row of services.db.all<PhotoRow>("SELECT * FROM photos WHERE location=''")) {
    if (!known.has(row.source_hash)) continue
    const source = services.db.get<AssetRow>(
      "SELECT * FROM assets WHERE photo_id=? AND variant='source'",
      [row.id],
    )
    if (!source) continue
    const bytes = await readFile(services.store.path(source.storage_key))
    if (sha256(bytes) !== row.source_hash) throw new Error(`Original hash mismatch: ${row.id}`)
    const metadata = await extractMetadata(bytes)
    if (!metadata.location) continue
    services.db.run(
      "UPDATE photos SET location=?,updated_at=? WHERE id=? AND location='' AND source_hash=?",
      [metadata.location, Date.now(), row.id, row.source_hash],
    )
    updated++
  }
  console.log(
    `Enriched ${updated} empty locations from verified original IPTC/XMP; no geocoding or invented values.`,
  )
} finally {
  services.db.close()
}
