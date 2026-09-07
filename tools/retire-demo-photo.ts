/**
 * Explicit one-photo fixture retirement, never a general purge.
 * Original downloaded bytes are verified and retained for recovery.
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { configuration } from '../apps/server/src/core/config'
import { createServices } from '../apps/server/src/services'
import { sha256 } from '../apps/server/src/modules/media/processor'

const [id, expectedName, confirmation] = process.argv.slice(2)
assert.equal(confirmation, '--confirmed-demo-replacement')
assert.match(expectedName, /^(landscape|portrait|square|panorama)-\d+\.jpg$/)
const services = await createServices(configuration())
try {
  const row = services.photos.row(id, true)
  assert.equal(row.source_name, expectedName)
  assert.equal(new URL(JSON.parse(row.attribution!).sourceUrl).hostname, 'commons.wikimedia.org')
  const original = await readFile(resolve('test-photo/commons-landscapes', expectedName))
  assert.equal(sha256(original), row.source_hash)
  await mkdir('artifacts/retired-demo', { recursive: true })
  await writeFile(resolve('artifacts/retired-demo', id + '.json'), JSON.stringify(row, null, 2), {
    flag: 'wx',
    mode: 0o600,
  })
  services.gallery.batch({ ids: [id], action: 'trash' })
  await services.gallery.purge(id)
  console.log(
    `Removed one excluded demo record: ${id}. Original ${expectedName} and its metadata are retained for recovery.`,
  )
} finally {
  services.db.close()
}
