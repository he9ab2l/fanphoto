import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync, gunzipSync, brotliCompressSync, brotliDecompressSync } from 'node:zlib'
import { harness, fixture, testPassword } from './helpers'
import { sha256 } from '../apps/server/src/modules/media/processor'
import { builtinModules } from '../apps/server/src/modules/media/modules'
import { createApp } from '../apps/server/src/app'

test('security headers survive standalone HTML, media and download responses', async () => {
  const h = await harness()
  try {
    const root = resolve(h.directory, 'static')
    await mkdir(resolve(root, 'apps/client/dist'), { recursive: true })
    const html = '<!doctype html><title>Fixture</title>'
    await writeFile(resolve(root, 'apps/client/dist/index.html'), html)
    await writeFile(resolve(root, 'apps/client/dist/index.html.gz'), gzipSync(html))
    await writeFile(resolve(root, 'apps/client/dist/index.html.br'), brotliCompressSync(html))
    const app = createApp({ ...h, config: { ...h.config, root } })
    for (const method of ['GET', 'HEAD']) {
      const response = await app.request(
        'https://fanphoto.test/',
        { method },
        { clientIp: '127.0.0.1' },
      )
      assert.equal(response.status, 200)
      assert.match(response.headers.get('content-security-policy') || '', /script-src 'self'/)
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(response.headers.get('x-frame-options'), 'DENY')
      assert.match(response.headers.get('x-robots-tag') || '', /noindex/)
    }
    for (const encoding of ['gzip', 'br']) {
      const response = await app.request(
        'https://fanphoto.test/',
        { headers: { 'accept-encoding': encoding } },
        { clientIp: '127.0.0.1' },
      )
      assert.equal(response.headers.get('content-encoding'), encoding)
      assert.match(response.headers.get('vary') || '', /Accept-Encoding/)
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      const compressed = Buffer.from(await response.arrayBuffer())
      assert.equal(
        (encoding === 'gzip'
          ? gunzipSync(compressed)
          : brotliDecompressSync(compressed)
        ).toString(),
        html,
      )
      const unchanged = await app.request(
        'https://fanphoto.test/',
        {
          headers: { 'accept-encoding': encoding, 'if-none-match': response.headers.get('etag')! },
        },
        { clientIp: '127.0.0.1' },
      )
      assert.equal(unchanged.status, 304)
    }
    await h.login()
    const photo = (await h.upload(await fixture(420, 310))).photo
    for (const path of [photo.assets.sm.url, `/api/v1/photos/${photo.id}/download`]) {
      const response = await h.request(path)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(response.headers.get('x-frame-options'), 'DENY')
      await response.body?.cancel()
    }
  } finally {
    await h.close()
  }
})

test('fresh v1 contract, no old API compatibility or anonymous admin access', async () => {
  const h = await harness()
  try {
    assert.equal((await h.request('/api/health')).status, 404)
    assert.equal((await h.request('/api/photos')).status, 404)
    assert.equal((await h.request('/api/v1/health')).status, 200)
    assert.equal((await h.request('/api/v1/admin/photos')).status, 401)
    const publicSite = await (await h.request('/api/v1/site')).json()
    assert.equal(publicSite.counts.photos, 0)
    assert.equal(publicSite.site.keepOriginals, undefined)
    assert.equal((await (await h.request('/api/v1/session')).json()).authenticated, false)
  } finally {
    await h.close()
  }
})
test('secure session, CSRF, foreign origins, logout and persisted login rate limits', async () => {
  const h = await harness()
  try {
    const login = await h.login()
    assert.equal(login.status, 200)
    assert.match(login.headers.get('set-cookie')!, /HttpOnly/)
    assert.match(login.headers.get('set-cookie')!, /Secure/)
    assert.match(login.headers.get('set-cookie')!, /__Host-fanphoto-v2=/)
    assert.equal(
      (
        await h.request('/api/v1/admin/albums', 'POST', { title: 'Album' }, true, {
          'x-csrf-token': '',
        })
      ).status,
      403,
    )
    assert.equal(
      (
        await h.request('/api/v1/admin/albums', 'POST', { title: 'Album' }, true, {
          origin: 'https://other.test',
        })
      ).status,
      403,
    )
    assert.equal((await h.request('/api/v1/session', 'DELETE')).status, 200)
    assert.equal((await h.request('/api/v1/admin/stats')).status, 401)
    for (let i = 0; i < 8; i++)
      assert.equal(
        (await h.request('/api/v1/session', 'POST', { password: 'incorrect' }, false)).status,
        401,
      )
    assert.equal(
      (await h.request('/api/v1/session', 'POST', { password: testPassword }, false)).status,
      429,
    )
  } finally {
    await h.close()
  }
})
test('raw server import retains >2048px original, real EXIF, multiple sizes and exact source bytes', async () => {
  const h = await harness()
  try {
    await h.login()
    const bytes = await fixture(3100, 2100)
    const result = await h.upload(bytes, { title: 'Synthetic metadata fixture', tags: ['测试'] })
    const photo = result.photo
    assert.equal(photo.width, 3100)
    assert.equal(photo.file.width, 3100)
    assert.equal(photo.file.originalAvailable, true)
    assert.equal(photo.exif.model, 'Synthetic Camera')
    assert.equal(photo.exif.lens, 'Synthetic 35mm')
    assert.equal(photo.exif.iso, 200)
    assert.equal(photo.exif.aperture, 8)
    assert.equal(photo.exif.exposureTime, 1 / 125)
    assert.equal(photo.capturedLocal, '2024-05-06T07:08:09')
    assert.equal(photo.capturedOffset, '+08:00')
    assert.equal(photo.latitude, 30.25)
    assert.equal(photo.longitude, 120.5)
    assert.equal(photo.assets.sm.width, 400)
    assert.equal(photo.assets.md.width, 800)
    assert.equal(photo.assets.lg.width, 1600)
    const raw = await h.request(`/api/v1/admin/photos/${photo.id}/source`)
    assert.equal(sha256(new Uint8Array(await raw.arrayBuffer())), sha256(bytes))
    assert.equal(
      (await h.request(`/api/v1/admin/photos/${photo.id}/source`, 'GET', undefined, false)).status,
      401,
    )
    assert.equal(
      (await h.request(`/media/photos/${photo.id}/source`, 'GET', undefined, false)).status,
      404,
    )
    const publicPhoto = (
      await (await h.request(`/api/v1/photos/${photo.id}`, 'GET', undefined, false)).json()
    ).photo
    assert.equal(publicPhoto.file.name, null)
    assert.equal(publicPhoto.file.originalAvailable, false)
    assert.equal(publicPhoto.exif.GPSLatitude, undefined)
    assert.equal(publicPhoto.exif.SerialNumber, undefined)
  } finally {
    await h.close()
  }
})
test('content deduplication, concurrent retries and client-key conflicts', async () => {
  const h = await harness()
  try {
    await h.login()
    const bytes = await fixture(500, 300),
      clientId = crypto.randomUUID()
    const [a, b] = await Promise.all([h.upload(bytes, { clientId }), h.upload(bytes, { clientId })])
    assert.equal(a.photo.id, b.photo.id)
    assert.equal(h.db.get<{ n: number }>('SELECT count(*) n FROM photos')!.n, 1)
    const anotherClient = crypto.randomUUID()
    await h.upload(bytes, { clientId: anotherClient })
    const different = await fixture(501, 300)
    assert.equal(
      (await h.request('/api/v1/admin/uploads', 'POST', h.form(different, { clientId }))).status,
      409,
    )
    assert.equal(
      (
        await h.request(
          '/api/v1/admin/uploads',
          'POST',
          h.form(different, { clientId: anotherClient }),
        )
      ).status,
      409,
    )
  } finally {
    await h.close()
  }
})
test('stable pagination, search escaping, orientation, filters and context-aware neighbors', async () => {
  const h = await harness()
  try {
    await h.login()
    const a = (
      await h.upload(await fixture(1200, 800), { title: 'Sea 100%', tags: ['海'], favorite: true })
    ).photo
    await h.upload(await fixture(600, 1000), { title: 'Forest' })
    await h.upload(await fixture(700, 700), { title: 'Square' })
    await h.upload(await fixture(2400, 500), { title: 'Panorama' })
    const first = await (await h.request('/api/v1/photos?limit=2')).json()
    const compressed = await h.request('/api/v1/photos?limit=2', 'GET', undefined, false, {
      'accept-encoding': 'gzip',
    })
    assert.equal(compressed.headers.get('content-encoding'), 'gzip')
    assert.equal(compressed.headers.get('cache-control'), 'no-store')
    assert.deepEqual(
      JSON.parse(gunzipSync(Buffer.from(await compressed.arrayBuffer())).toString()).items,
      first.items,
    )
    const second = await (
      await h.request(`/api/v1/photos?limit=2&cursor=${first.page.nextCursor}`)
    ).json()
    assert.equal(
      new Set([...first.items, ...second.items].map((p: { id: string }) => p.id)).size,
      4,
    )
    assert.equal(second.page.nextCursor, null)
    assert.equal((await (await h.request('/api/v1/photos?q=%25')).json()).page.total, 1)
    for (const shape of ['landscape', 'portrait', 'square', 'panorama'])
      assert.equal(
        (await (await h.request(`/api/v1/photos?orientation=${shape}`)).json()).page.total,
        1,
      )
    assert.equal(
      (await h.request(`/api/v1/photos?tag=changed&cursor=${first.page.nextCursor}`)).status,
      400,
    )
    const detail = await (
      await h.request(`/api/v1/photos/${a.id}?tag=${encodeURIComponent('海')}`)
    ).json()
    assert.deepEqual(detail.neighbors, { previous: null, next: null })
    assert.equal((await h.request('/api/v1/photos?limit=100000')).status, 400)
  } finally {
    await h.close()
  }
})
test('album management, edit, batch visibility, recycle bin, purge and media cache authorization', async () => {
  const h = await harness()
  try {
    await h.login()
    const album = (
      await (await h.request('/api/v1/admin/albums', 'POST', { title: '旅行' })).json()
    ).album
    const photo = (await h.upload(await fixture(), { albumIds: [album.id], tags: ['old'] })).photo
    assert.equal((await (await h.request('/api/v1/albums')).json()).items[0].count, 1)
    const media = await h.request(photo.assets.sm.url, 'GET', undefined, false)
    assert.equal(media.status, 200)
    assert.match(media.headers.get('cache-control')!, /private/)
    const etag = media.headers.get('etag')!
    assert.equal(
      (await h.request(photo.assets.sm.url, 'GET', undefined, false, { 'if-none-match': etag }))
        .status,
      304,
    )
    const edit = {
      title: 'Edited',
      description: '',
      location: '',
      tags: ['new'],
      albumIds: [],
      isPublic: false,
      favorite: true,
    }
    assert.equal((await h.request(`/api/v1/admin/photos/${photo.id}`, 'PATCH', edit)).status, 200)
    assert.equal(
      (await h.request(photo.assets.sm.url, 'GET', undefined, false, { 'if-none-match': etag }))
        .status,
      404,
    )
    assert.equal((await h.request(photo.assets.sm.url)).status, 200)
    assert.equal(
      (await h.request(`/api/v1/admin/photos/${photo.id}/permanent`, 'DELETE')).status,
      409,
    )
    await h.request(`/api/v1/admin/photos/${photo.id}`, 'DELETE')
    assert.equal((await (await h.request('/api/v1/admin/stats')).json()).trash, 1)
    await h.request('/api/v1/admin/photos/actions', 'POST', { ids: [photo.id], action: 'restore' })
    assert.equal((await (await h.request('/api/v1/admin/stats')).json()).trash, 0)
    await h.request(`/api/v1/admin/photos/${photo.id}`, 'DELETE')
    assert.equal(
      (await h.request(`/api/v1/admin/photos/${photo.id}/permanent`, 'DELETE')).status,
      200,
    )
    assert.equal(h.db.get<{ n: number }>('SELECT count(*) n FROM assets')!.n, 0)
    assert.equal((await h.request(`/api/v1/admin/albums/${album.id}`, 'DELETE')).status, 200)
  } finally {
    await h.close()
  }
})
test('location privacy and downloads policy; stripping location never archives an unstripped original', async () => {
  const h = await harness()
  try {
    await h.login()
    const p = (await h.upload(await fixture(), { location: 'SECRET_PLACE' })).photo
    h.settings.save({ ...h.settings.get(), showLocation: false, allowDownloads: false })
    const detail = await (await h.request(`/api/v1/photos/${p.id}`, 'GET', undefined, false)).json()
    assert.equal(detail.photo.location, '')
    assert.equal(detail.photo.latitude, null)
    assert.equal((await (await h.request('/api/v1/photos?q=SECRET_PLACE')).json()).page.total, 0)
    assert.equal(
      (await h.request(`/api/v1/photos/${p.id}/download`, 'GET', undefined, false)).status,
      403,
    )
    const stripped = (
      await h.upload(await fixture(601, 801), { stripLocation: true, location: 'SECRET' })
    ).photo
    assert.equal(stripped.latitude, null)
    assert.equal(stripped.location, '')
    assert.equal(stripped.file.originalAvailable, false)
  } finally {
    await h.close()
  }
})
test('malformed files, forged client metadata, bad albums and storage failures do not leave photos', async () => {
  const h = await harness()
  try {
    await h.login()
    assert.equal(
      (await h.request('/api/v1/admin/uploads', 'POST', h.form(new TextEncoder().encode('<svg/>'))))
        .status,
      415,
    )
    const bytes = await fixture()
    assert.equal(
      (
        await h.request(
          '/api/v1/admin/uploads',
          'POST',
          h.form(bytes, { exif: { model: 'forged' } }),
        )
      ).status,
      400,
    )
    assert.equal(
      (
        await h.request(
          '/api/v1/admin/uploads',
          'POST',
          h.form(bytes, { albumIds: [crypto.randomUUID()] }),
        )
      ).status,
      400,
    )
    const put = h.store.put.bind(h.store)
    let count = 0
    h.store.put = async (key, data) => {
      if (++count > 2) throw new Error('synthetic disk failure')
      return put(key, data)
    }
    assert.equal((await h.request('/api/v1/admin/uploads', 'POST', h.form(bytes))).status, 500)
    assert.equal(h.db.get<{ n: number }>('SELECT count(*) n FROM photos')!.n, 0)
    assert.deepEqual(await readdir(resolve(h.directory, 'media')), [])
  } finally {
    await h.close()
  }
})
test('namespaced processing modules persist private extension data without public leakage', async () => {
  const h = await harness([
    ...builtinModules,
    {
      namespace: 'test.annotation',
      version: 1,
      prepare: async () => ({ privateNote: 'internal-only' }),
    },
  ])
  try {
    await h.login()
    const photo = (await h.upload(await fixture())).photo
    const admin = await (await h.request(`/api/v1/admin/photos/${photo.id}`)).json()
    assert.equal(
      admin.extensions.find((item: { namespace: string }) => item.namespace === 'test.annotation')
        .data.privateNote,
      'internal-only',
    )
    assert.doesNotMatch(
      await (await h.request(`/api/v1/photos/${photo.id}`, 'GET', undefined, false)).text(),
      /internal-only/,
    )
  } finally {
    await h.close()
  }
})
