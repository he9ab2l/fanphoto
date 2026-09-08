import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acceptedEncodings, matchesEtag } from '../apps/server/src/core/http-cache'

test('compressed representations respect quality and explicit exclusions', () => {
  assert.deepEqual(acceptedEncodings('gzip, br'), ['br', 'gzip'])
  assert.deepEqual(acceptedEncodings('gzip;q=1, br;q=0.5'), ['gzip', 'br'])
  assert.deepEqual(acceptedEncodings('gzip;q=0, br;q=0'), [])
  assert.deepEqual(acceptedEncodings('identity;q=1, gzip;q=0.5'), [])
  assert.deepEqual(acceptedEncodings(), [])
})
test('conditional GET supports weak and multiple entity tags', () => {
  assert.ok(matchesEtag('"other", W/"photo"', '"photo"'))
  assert.ok(matchesEtag('*', '"photo"'))
  assert.equal(matchesEtag('"other"', '"photo"'), false)
})
