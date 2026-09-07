import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { fixture } from './helpers'
import { processSource } from '../apps/server/src/modules/media/processor'
import { captureDate } from '../apps/server/src/modules/media/metadata'
import { FileStore } from '../apps/server/src/core/storage'

test('EXIF orientation becomes natural image dimensions and is removed from public derivatives', async () => {
  const photo = await processSource(await fixture(1200, 800, 6))
  assert.equal(photo.width, 800)
  assert.equal(photo.height, 1200)
  assert.equal(photo.source.width, 800)
  assert.equal(photo.source.height, 1200)
  for (const asset of photo.assets) {
    const metadata = await sharp(asset.data).metadata()
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.orientation, undefined)
    assert.ok(Math.abs(asset.width / asset.height - 2 / 3) < 0.003)
  }
})
test('PNG transparency, TIFF, WebP and AVIF decode into proportional clean variants', async () => {
  for (const format of ['png', 'tiff', 'webp', 'avif'] as const) {
    const bytes = await sharp({
      create: {
        width: 360,
        height: 240,
        channels: 4,
        background: { r: 120, g: 100, b: 80, alpha: 0.4 },
      },
    })
      .toFormat(format)
      .toBuffer()
    const result = await processSource(bytes)
    assert.equal(result.width, 360)
    assert.equal(result.height, 240)
    assert.equal(result.assets.length, 4)
    assert.equal(result.analysis.histogram.length, 64)
    assert.ok(result.thumbHash.length > 10)
    if (format === 'png')
      assert.equal((await sharp(result.assets[0].data).metadata()).hasAlpha, true)
  }
})
test('capture dates preserve unknown timezone instead of inventing camera facts', () => {
  assert.deepEqual(captureDate('not recorded', null), {
    takenAt: null,
    capturedLocal: null,
    capturedOffset: null,
  })
  assert.equal(captureDate('2024:05:06 07:08:09', null).capturedOffset, null)
  assert.equal(captureDate('2024:02:31 07:08:09', null).capturedLocal, null)
  assert.equal(
    captureDate('2024:05:06 07:08:09', '+08:00').takenAt,
    Date.parse('2024-05-05T23:08:09Z'),
  )
})
test('storage rejects traversal, arbitrary variants and user filenames', () => {
  const store = new FileStore('/tmp/fanphoto-storage-guard-only')
  for (const key of [
    '../secret',
    '/etc/passwd',
    `${crypto.randomUUID()}/../../secret`,
    `${crypto.randomUUID()}/evil.svg`,
  ])
    assert.throws(() => store.path(key))
})
