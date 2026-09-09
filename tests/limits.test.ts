import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { harness, fixture } from './helpers'
import { processSource } from '../apps/server/src/modules/media/processor'
import { builtinModules, validateModules } from '../apps/server/src/modules/media/modules'
import { Database } from '../apps/server/src/core/database'
import { ApiError } from '../apps/server/src/core/errors'

test('file-size and pixel bombs are rejected before image decoding', async () => {
  await assert.rejects(
    processSource(new Uint8Array(50 * 1024 ** 2 + 1)),
    (error: unknown) => error instanceof ApiError && error.status === 413,
  )
  const jpeg = Buffer.from(await fixture(100, 100))
  let patched = false
  for (let i = 0; i < jpeg.length - 10; i++) {
    if (jpeg[i] === 0xff && [0xc0, 0xc1, 0xc2].includes(jpeg[i + 1])) {
      jpeg.writeUInt16BE(50000, i + 5)
      jpeg.writeUInt16BE(50000, i + 7)
      patched = true
      break
    }
  }
  assert.equal(patched, true)
  await assert.rejects(
    processSource(jpeg),
    (error: unknown) => error instanceof ApiError && error.status === 413,
  )
})
test('unknown timezone stays unknown in public API and full-size media honors download permission', async () => {
  const h = await harness()
  try {
    await h.login()
    const bytes = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#777777' },
    })
      .jpeg()
      .withExif({ IFD0: { Make: 'Test only' }, IFD2: { DateTimeOriginal: '2024:01:02 03:04:05' } })
      .toBuffer()
    const photo = (await h.upload(bytes)).photo
    const data = await (await h.request(`/api/photos/${photo.id}`, 'GET', undefined, false)).json()
    assert.equal(data.photo.capturedAt, null)
    assert.equal(data.photo.capturedOffset, null)
    assert.equal(data.photo.capturedLocal, '2024-01-02T03:04:05')
    h.settings.save({ ...h.settings.get(), allowDownloads: false })
    assert.equal((await h.request(photo.assets.original.url, 'GET', undefined, false)).status, 403)
    assert.equal((await h.request(photo.assets.lg.url, 'GET', undefined, false)).status, 200)
    assert.equal((await h.request(photo.assets.original.url)).status, 200)
  } finally {
    await h.close()
  }
})
test('decode queue is bounded, rejects overload and safely drains identical retries', async () => {
  let entered!: () => void, release!: () => void
  const ready = new Promise<void>((resolve) => {
    entered = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const h = await harness([
    ...builtinModules,
    {
      namespace: 'test.gate',
      version: 1,
      async prepare() {
        entered()
        await gate
        return null
      },
    },
  ])
  try {
    const bytes = await fixture(401, 301)
    const start = () => h.ingest.import(bytes, 'test-queue.jpg', { clientId: crypto.randomUUID() })
    const first = start()
    await ready
    const second = start(),
      third = start()
    await assert.rejects(
      start(),
      (error: unknown) => error instanceof ApiError && error.code === 'PROCESSOR_BUSY',
    )
    release()
    const results = await Promise.all([first, second, third])
    assert.equal(new Set(results.map((result) => result.photo.id)).size, 1)
  } finally {
    release()
    await h.close()
  }
})
test('applied migrations and module namespaces have enforceable version boundaries', async () => {
  assert.throws(
    () => validateModules([...builtinModules, ...builtinModules]),
    /Invalid media module/,
  )
  const directory = await mkdtemp(join(tmpdir(), 'fanphoto-migration-'))
  const db = new Database(':memory:')
  try {
    const file = join(directory, '001_test.sql')
    await writeFile(file, 'CREATE TABLE example(id TEXT PRIMARY KEY);')
    await db.migrate(directory)
    await db.migrate(directory)
    await writeFile(file, 'CREATE TABLE changed(id TEXT PRIMARY KEY);')
    await assert.rejects(db.migrate(directory), /Applied migration changed/)
  } finally {
    db.close()
    await rm(directory, { recursive: true, force: true })
  }
})
