import { test } from 'node:test'
import assert from 'node:assert/strict'
import { replaceFanPhoto } from '../deploy/caddy-config.mjs'

test('Caddy cleanup replaces only the FanPhoto block and removes the old public media cache override', () => {
  const input = `{\n\tauto_https disable_redirects\n}\n:443 {\n\ttls /cert /key\n\t@other host other.example\n\thandle @other {\n\t\treverse_proxy 127.0.0.1:9000\n\t}\n\t@fanphoto host test.heabl.xyz\n\thandle @fanphoto {\n\t\theader /media/* {\n\t\t\tCache-Control "public, max-age=86400"\n\t\t}\n\t\treverse_proxy 127.0.0.1:8787 {\n\t\t\theader_up X-Forwarded-Host {host}\n\t\t}\n\t}\n}\n`
  const result = replaceFanPhoto(input)
  assert.match(result.text, /@fanphoto host test.heabl.xyz/)
  assert.doesNotMatch(result.text, /public, max-age/)
  assert.match(result.text, /handle @other {\n\t\treverse_proxy 127.0.0.1:9000\n\t}/)
  assert.equal(replaceFanPhoto(result.text).preservedHash, result.preservedHash)
  assert.throws(() => replaceFanPhoto(':443 { }'), /exactly one/)
})
