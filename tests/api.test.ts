import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { createApp } from '../apps/api/src/app'
import { LocalDatabase } from '../apps/api/src/local'
import { hashPassword } from '../apps/api/src/crypto'
import type { Bindings, BlobStore } from '../apps/api/src/types'

const password = 'test-only-correct-horse-battery'
let passwordHash: string
const databases: LocalDatabase[] = []
before(async () => {
  passwordHash = await hashPassword(password)
})
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})
class MemoryStore implements BlobStore {
  files = new Map<string, ArrayBuffer>()
  failAfter = Infinity
  writes = 0
  async put(key: string, data: ArrayBuffer) {
    if (++this.writes > this.failAfter) throw new Error('simulated storage failure')
    this.files.set(key, data)
  }
  async get(key: string) {
    const bytes = this.files.get(key)
    return bytes ? { body: new Blob([bytes]).stream(), size: bytes.byteLength } : null
  }
  async delete(keys: string[]) {
    keys.forEach((key) => this.files.delete(key))
  }
}
const webp = new Uint8Array(
  Buffer.from('UklGRiIAAABXRUJQVlA4TBYAAAAvB0ABAAdQy5IVuf8BgCD8b5uI6H8I', 'base64'),
)
async function harness() {
  const db = new LocalDatabase(':memory:')
  databases.push(db)
  await db.migrate(resolve('apps/api/migrations'))
  const store = new MemoryStore(),
    app = createApp()
  const env: Bindings = {
    DB: db,
    STORE: store,
    APP_ORIGIN: 'https://fanphoto.test',
    ADMIN_PASSWORD_HASH: passwordHash,
    SESSION_SECRET: 'test-secret-longer-than-thirty-two-characters',
    CLIENT_IP: '127.0.0.1',
    MODE: 'test',
  }
  let cookie = '',
    csrf = ''
  async function request(
    path: string,
    method = 'GET',
    data?: unknown,
    authenticated = true,
    extra: Record<string, string> = {},
  ) {
    const headers: Record<string, string> = { origin: env.APP_ORIGIN, ...extra }
    if (authenticated && cookie) {
      headers.cookie = cookie
      if (!('x-csrf-token' in headers)) headers['x-csrf-token'] = csrf
    }
    let body: BodyInit | undefined
    if (data instanceof FormData) body = data
    else if (data !== undefined) {
      body = JSON.stringify(data)
      headers['content-type'] = 'application/json'
    }
    return app.request(env.APP_ORIGIN + path, { method, headers, body }, env)
  }
  async function login() {
    const response = await request('/api/auth/login', 'POST', { password }, false)
    assert.equal(response.status, 200)
    const value = await response.json()
    csrf = value.csrfToken
    cookie = response.headers.get('set-cookie')!.split(';')[0]
    return response
  }
  function form(meta: Record<string, unknown> = {}, clientId: string = crypto.randomUUID()) {
    const form = new FormData()
    form.set(
      'meta',
      JSON.stringify({ clientId, title: 'A quiet frame', width: 8, height: 6, ...meta }),
    )
    for (const name of ['original', 'sm', 'md', 'lg'])
      form.set(name, new File([webp], `${name}.webp`, { type: 'image/webp' }))
    return form
  }
  async function upload(meta: Record<string, unknown> = {}, clientId?: string) {
    const response = await request('/api/photos/upload', 'POST', form(meta, clientId))
    assert.ok([200, 201].includes(response.status), await response.clone().text())
    return (await response.json()).photo
  }
  return { db, store, request, login, form, upload }
}
test('health, anonymous access, session cookie flags and logout revocation', async () => {
  const h = await harness()
  assert.equal((await h.request('/api/health')).status, 200)
  assert.equal((await h.request('/api/admin/stats')).status, 401)
  assert.equal((await (await h.request('/api/auth/me')).json()).authenticated, false)
  const response = await h.login(),
    cookie = response.headers.get('set-cookie')!
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Secure/)
  assert.match(cookie, /SameSite=Lax/)
  assert.equal((await h.request('/api/admin/stats')).status, 200)
  assert.equal((await h.request('/api/auth/logout', 'POST')).status, 200)
  assert.equal((await h.request('/api/admin/stats')).status, 401)
})
test('mutations reject missing CSRF and foreign origins', async () => {
  const h = await harness()
  await h.login()
  assert.equal(
    (await h.request('/api/albums', 'POST', { title: 'Private' }, true, { 'x-csrf-token': '' }))
      .status,
    403,
  )
  assert.equal(
    (
      await h.request('/api/albums', 'POST', { title: 'Private' }, true, {
        origin: 'https://evil.test',
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await h.request('/api/auth/login', 'POST', { password }, false, {
        origin: 'https://evil.test',
      })
    ).status,
    403,
  )
})
test('failed logins are persistently rate limited', async () => {
  const h = await harness()
  for (let i = 0; i < 8; i++)
    assert.equal(
      (await h.request('/api/auth/login', 'POST', { password: 'incorrect' }, false)).status,
      401,
    )
  assert.equal((await h.request('/api/auth/login', 'POST', { password }, false)).status, 429)
})
test('upload, EXIF allowlist, detail, media and stable idempotent retry', async () => {
  const h = await harness()
  await h.login()
  const client = crypto.randomUUID()
  const p = await h.upload({ exif: { model: 'Real camera', GPSLatitude: 42 } }, client)
  const retry = await h.upload({}, client)
  assert.equal(retry.id, p.id)
  assert.equal(h.store.files.size, 4)
  const detail = await (await h.request(`/api/photos/${p.id}`, 'GET', undefined, false)).json()
  assert.equal(detail.photo.exif.model, 'Real camera')
  assert.equal(detail.photo.exif.GPSLatitude, undefined)
  assert.equal((await h.request(p.urls.sm, 'GET', undefined, false)).status, 200)
  assert.equal(
    (await h.request(`/api/photos/${p.id}/download`, 'GET', undefined, false)).headers.get(
      'content-type',
    ),
    'image/webp',
  )
})
test('validates bytes, dimensions, JSON and album IDs before writing', async () => {
  const h = await harness()
  await h.login()
  const form = h.form()
  form.set('original', new File(['<script>alert(1)</script>'], 'fake.webp', { type: 'image/webp' }))
  assert.equal((await h.request('/api/photos/upload', 'POST', form)).status, 415)
  assert.equal((await h.request('/api/photos/upload', 'POST', h.form({ width: 10 }))).status, 400)
  assert.equal(
    (await h.request('/api/photos/upload', 'POST', h.form({ albumIds: ['missing-album'] }))).status,
    400,
  )
  assert.equal(
    (await h.request('/api/photos/upload', 'POST', h.form({ latitude: 999, longitude: 1 }))).status,
    400,
  )
  assert.equal(h.store.files.size, 0)
})
test('failed object writes roll back without creating database records', async () => {
  const h = await harness()
  await h.login()
  h.store.failAfter = 2
  assert.equal((await h.request('/api/photos/upload', 'POST', h.form())).status, 500)
  assert.equal(h.store.files.size, 0)
  assert.equal((await (await h.request('/api/photos')).json()).total, 0)
})
test('pagination, literal search, tags, featured and date sorting', async () => {
  const h = await harness()
  await h.login()
  await h.upload({
    title: 'Sea 100%',
    tags: ['海'],
    takenAt: '2020-01-01T00:00:00Z',
    featured: true,
  })
  await h.upload({ title: 'Forest', takenAt: '2021-01-01T00:00:00Z' })
  await h.upload({ title: 'Mountain', takenAt: '2022-01-01T00:00:00Z' })
  const first = await (await h.request('/api/photos?limit=2')).json()
  const second = await (
    await h.request(`/api/photos?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`)
  ).json()
  assert.equal(first.photos[0].title, 'Mountain')
  assert.equal(first.total, 3)
  assert.equal(second.photos.length, 1)
  assert.equal(
    new Set([...first.photos, ...second.photos].map((p: { id: string }) => p.id)).size,
    3,
  )
  assert.equal((await (await h.request('/api/photos?q=%25')).json()).total, 1)
  assert.equal((await (await h.request('/api/photos?featured=true')).json()).total, 1)
  assert.equal((await (await h.request('/api/photos?tag=%E6%B5%B7')).json()).total, 1)
  assert.equal((await h.request('/api/photos?cursor=invalid')).status, 400)
  assert.equal((await h.request('/api/photos?limit=999999')).status, 400)
})
test('album CRUD, editing membership, soft delete, restore and permanent deletion', async () => {
  const h = await harness()
  await h.login()
  const album = (await (await h.request('/api/albums', 'POST', { title: 'Journey' })).json()).album
  const p = await h.upload({ albumIds: [album.id] })
  assert.equal((await (await h.request('/api/albums')).json()).albums[0].photoCount, 1)
  assert.equal((await h.request(`/api/photos/${p.id}?permanent=true`, 'DELETE')).status, 409)
  assert.equal((await h.request(`/api/photos/${p.id}`, 'DELETE')).status, 200)
  assert.equal((await h.request(`/api/photos/${p.id}`, 'GET', undefined, false)).status, 404)
  assert.equal((await h.request(p.urls.sm, 'GET', undefined, false)).status, 404)
  assert.equal(
    (await h.request('/api/photos/batch', 'POST', { ids: [p.id], action: 'restore' })).status,
    200,
  )
  assert.equal((await h.request(p.urls.sm, 'GET', undefined, false)).status, 200)
  const edit = {
    title: 'Edited',
    description: '',
    takenAt: null,
    latitude: null,
    longitude: null,
    location: '',
    tags: ['edit'],
    albumIds: [],
    featured: true,
    published: false,
  }
  assert.equal((await h.request(`/api/photos/${p.id}`, 'PATCH', edit)).status, 200)
  assert.equal((await h.request(p.urls.sm, 'GET', undefined, false)).status, 404)
  assert.equal((await h.request(p.urls.sm)).status, 200)
  await h.request(`/api/photos/${p.id}`, 'DELETE')
  assert.equal((await h.request(`/api/photos/${p.id}?permanent=true`, 'DELETE')).status, 200)
  assert.equal(h.store.files.size, 0)
  assert.equal((await h.request(`/api/albums/${album.id}`, 'DELETE')).status, 200)
})
test('location hiding covers detail, map, search and physical erasure', async () => {
  const h = await harness()
  await h.login()
  const p = await h.upload({ latitude: 35, longitude: 110, location: 'SECRET_PLACE' })
  const site = (await (await h.request('/api/site')).json()).site
  await h.request('/api/settings', 'PATCH', { ...site, showLocation: false, allowDownload: false })
  assert.equal(
    (await (await h.request(`/api/photos/${p.id}`, 'GET', undefined, false)).json()).photo.latitude,
    null,
  )
  assert.equal(
    (await (await h.request('/api/photos?q=SECRET_PLACE', 'GET', undefined, false)).json()).total,
    0,
  )
  assert.equal((await (await h.request('/api/photos/map')).json()).enabled, false)
  assert.equal(
    (await h.request(`/api/photos/${p.id}/download`, 'GET', undefined, false)).status,
    403,
  )
  await h.request('/api/admin/privacy/erase-location', 'POST', { confirm: 'ERASE_LOCATION' })
  const row = await h.db
    .prepare('SELECT latitude,longitude,location FROM photos WHERE id=?')
    .bind(p.id)
    .first()
  assert.deepEqual({ ...row }, { latitude: null, longitude: null, location: '' })
})
test('metadata export excludes passwords and sessions, missing API routes remain JSON', async () => {
  const h = await harness()
  await h.login()
  await h.upload()
  const exported = await (await h.request('/api/admin/export')).text()
  assert.ok(exported.includes('photos'))
  assert.ok(!exported.includes(password))
  assert.ok(!exported.includes('csrf_token'))
  const response = await h.request('/api/does-not-exist')
  assert.equal(response.status, 404)
  assert.match(response.headers.get('content-type') || '', /application\/json/)
})
