import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { configuration } from '../apps/server/src/core/config'
import { createServices } from '../apps/server/src/services'
import { sha256 } from '../apps/server/src/modules/media/processor'
import { extractMetadata } from '../apps/server/src/modules/media/metadata'
import type { PhotoRow, AssetRow } from '../apps/server/src/modules/gallery/repository'

const config = configuration(),
  services = await createServices(config)
const output = resolve('artifacts/photo-audit')
await mkdir(output, { recursive: true })
const rows = services.db.all<PhotoRow>('SELECT * FROM photos ORDER BY created_at')
const reports = []
const contact = []
try {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const source = services.db.get<AssetRow>(
      "SELECT * FROM assets WHERE photo_id=? AND variant='source'",
      [row.id],
    )!
    const bytes = await readFile(services.store.path(source.storage_key))
    const metadata = await extractMetadata(bytes)
    const saved = JSON.parse(row.exif)
    const variants = services.db.all<AssetRow>('SELECT * FROM assets WHERE photo_id=?', [row.id])
    const assetChecks = []
    for (const asset of variants) {
      const contents = await readFile(services.store.path(asset.storage_key))
      const image = await sharp(contents).metadata()
      assetChecks.push({
        variant: asset.variant,
        checksum: sha256(contents) === asset.checksum,
        width: image.autoOrient.width,
        height: image.autoOrient.height,
        metadataStripped: asset.variant === 'source' || !image.exif,
      })
    }
    reports.push({
      id: row.id,
      title: row.title,
      sourceHashMatches: sha256(bytes) === row.source_hash,
      dimensions: [source.width, source.height],
      bytes: source.bytes,
      aspect: source.width / source.height,
      metadataFields: Object.keys(saved),
      model: saved.model || null,
      lens: saved.lens || null,
      capturedLocal: row.captured_local,
      capturedOffset: row.captured_offset,
      gps: row.latitude !== null,
      hasAttribution: !!row.attribution,
      metadataMatchesSource: JSON.stringify(metadata.exif) === JSON.stringify(saved),
      extractedLocation: metadata.location,
      storedLocation: row.location,
      assets: assetChecks,
    })
    const thumbnail = await sharp(bytes)
      .rotate()
      .resize(240, 180, { fit: 'contain', background: '#181818' })
      .png()
      .toBuffer()
    contact.push({ input: thumbnail, left: (i % 4) * 250 + 5, top: Math.floor(i / 4) * 190 + 5 })
  }
  await sharp({
    create: {
      width: 1000,
      height: Math.ceil(rows.length / 4) * 190,
      channels: 3,
      background: '#181818',
    },
  })
    .composite(contact)
    .jpeg({ quality: 88 })
    .toFile(resolve(output, 'contact-sheet.jpg'))
  await writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2))
  const coverage = Object.fromEntries(
    ['model', 'lens', 'iso', 'aperture', 'exposureTime', 'focalLength'].map((key) => [
      key,
      reports.filter((photo) => photo.metadataFields.includes(key)).length,
    ]),
  )
  console.log(
    JSON.stringify(
      {
        photos: reports.length,
        coverage,
        capturedTime: reports.filter((photo) => photo.capturedLocal).length,
        gps: reports.filter((photo) => photo.gps).length,
        allHashesMatch: reports.every(
          (photo) => photo.sourceHashMatches && photo.assets.every((asset) => asset.checksum),
        ),
        allMetadataMatches: reports.every((photo) => photo.metadataMatchesSource),
        allDerivativesStripped: reports.every((photo) =>
          photo.assets.every((asset) => asset.metadataStripped),
        ),
        locationDifferences: reports
          .filter(
            (photo) => photo.extractedLocation && photo.extractedLocation !== photo.storedLocation,
          )
          .map((photo) => ({ id: photo.id, location: photo.extractedLocation })),
      },
      null,
      2,
    ),
  )
} finally {
  services.db.close()
}
