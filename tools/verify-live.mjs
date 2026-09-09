import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

const origin = process.env.FANPHOTO_LIVE_ORIGIN || 'https://test.heabl.xyz'
assert.equal(new URL(origin).hostname, 'test.heabl.xyz', 'This verifier is scoped to the user-provided test site')
const credentials = await readFile('/home/ubuntu/fanphoto-next/admin-credentials.txt', 'utf8')
const password = /^密码：(.+)$/m.exec(credentials)?.[1]
assert.ok(password)
const report = { origin, checkedAt: new Date().toISOString() }
const request = (path, options = {}) => fetch(origin + path, { ...options, signal: AbortSignal.timeout(30000) })
const health = await (await request('/api/health')).json()
assert.equal(health.version, '1.0.0')
assert.equal(health.ok, true)
report.health = health
assert.equal((await request('/api/photos')).status, 404)
assert.equal((await request('/api/admin/stats')).status, 401)
for (const path of ['/', '/studio', '/favicon.svg']) {
  const response = await request(path)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('x-frame-options'), 'DENY')
  assert.match(response.headers.get('content-security-policy') || '', /script-src 'self'/)
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/)
  await response.body?.cancel()
}
report.securityHeaders = true
const catalog = await (await request('/api/photos?limit=80')).json()
assert.equal(catalog.page.total, 70)
assert.equal(catalog.items.length, 70)
const urls = catalog.items.flatMap((photo) => Object.values(photo.assets).map((asset) => asset.url))
let verified = 0
const pending = [...urls]
await Promise.all(Array.from({ length: 4 }, async () => {
  while (pending.length) {
    const url = pending.shift()
    const response = await request(url, { method: 'HEAD' })
    assert.equal(response.status, 200, url)
    assert.match(response.headers.get('content-type') || '', /image\/webp/)
    assert.match(response.headers.get('cache-control') || '', /private/)
    assert.ok(Number(response.headers.get('content-length')) > 0)
    verified++
  }
}))
report.publicPhotos = 70
report.verifiedPublicVariants = verified
const login = await request('/api/session', {
  method: 'POST', headers: { 'content-type': 'application/json', origin },
  body: JSON.stringify({ password }),
})
assert.equal(login.status, 200)
const cookieHeader = login.headers.get('set-cookie')
assert.match(cookieHeader, /HttpOnly/)
assert.match(cookieHeader, /Secure/)
assert.match(cookieHeader, /SameSite=Lax/i)
const session = await login.json()
const headers = { cookie: cookieHeader.split(';')[0], origin, 'x-csrf-token': session.csrfToken }
const json = (data) => ({ headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(data) })
report.secureSession = true
assert.equal((await request('/api/admin/albums', {
  method: 'POST', ...json({ title: 'must-not-create' }),
  headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': '' },
})).status, 403)
report.csrfEnforced = true
let temporary
try {
  const bytes = await readFile('artifacts/browser-upload-desktop.jpg')
  const title = `验收临时素材 ${randomUUID()}`
  const form = new FormData()
  form.set('file', new File([bytes], 'fanphoto-live-check.jpg', { type: 'image/jpeg' }))
  form.set('options', JSON.stringify({ clientId: randomUUID(), title, isPublic: false }))
  const upload = await request('/api/admin/uploads', { method: 'POST', headers, body: form })
  assert.equal(upload.status, 201)
  const data = await upload.json()
  assert.equal(data.duplicate, false)
  assert.equal(data.photo.title, title)
  assert.equal(data.photo.file.name, 'fanphoto-live-check.jpg')
  temporary = data.photo
  assert.equal((await request(temporary.assets.sm.url)).status, 404)
  const source = await request(`/api/admin/photos/${temporary.id}/source`, { headers })
  assert.equal(source.status, 200)
  const originalHash = createHash('sha256').update(bytes).digest('hex')
  assert.equal(createHash('sha256').update(Buffer.from(await source.arrayBuffer())).digest('hex'), originalHash)
  const edit = {
    title, description: '自动化验收的临时合成素材，验证完即移除。',
    location: '', tags: [], albumIds: [], favorite: false, isPublic: true,
  }
  assert.equal((await request(`/api/admin/photos/${temporary.id}`, { method: 'PATCH', ...json(edit) })).status, 200)
  const visible = await request(temporary.assets.sm.url)
  assert.equal(visible.status, 200)
  assert.match(visible.headers.get('cache-control') || '', /private/)
  await visible.body.cancel()
  assert.equal((await request(`/api/admin/photos/${temporary.id}`, { method: 'PATCH', ...json({ ...edit, isPublic: false }) })).status, 200)
  assert.equal((await request(temporary.assets.sm.url)).status, 404)
  report.rawUploadRoundtrip = true
  report.visibilityRevocation = true
} finally {
  if (temporary) {
    assert.equal((await request(`/api/admin/photos/${temporary.id}`, { method: 'DELETE', headers })).status, 200)
    assert.equal((await request(`/api/admin/photos/${temporary.id}/permanent`, { method: 'DELETE', headers })).status, 200)
    report.temporaryFixtureRemoved = true
  }
  await request('/api/session', { method: 'DELETE', headers })
}
assert.equal((await (await request('/api/photos?limit=1')).json()).page.total, 70)
await mkdir('artifacts/live-verification', { recursive: true })
await writeFile(resolve('artifacts/live-verification/report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
