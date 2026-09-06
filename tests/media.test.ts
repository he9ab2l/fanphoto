import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeVideo, webpSize } from '../apps/api/src/images'
import { cleanCanvasWebp } from '../packages/shared/src/webp'
const atom = (type: string, value: Uint8Array) => {
  const bytes = new Uint8Array(8 + value.length)
  new DataView(bytes.buffer).setUint32(0, bytes.length)
  bytes.set(new TextEncoder().encode(type), 4)
  bytes.set(value, 8)
  return bytes
}
test('browser ICC/EXIF chunks are removed while retaining a decodable WebP frame', () => {
  const frame = new Uint8Array(Buffer.from('UklGRiIAAABXRUJQVlA4TBYAAAAvB0ABAAdQy5IVuf8BgCD8b5uI6H8I', 'base64'))
  const chunk = (type: string, body: Uint8Array) => { const bytes = new Uint8Array(8 + body.length + body.length % 2); bytes.set(new TextEncoder().encode(type)); new DataView(bytes.buffer).setUint32(4, body.length, true); bytes.set(body, 8); return bytes }
  const extended = new Uint8Array([0x28, 0, 0, 0, 7, 0, 0, 5, 0, 0])
  const parts = [chunk('VP8X', extended), chunk('ICCP', new TextEncoder().encode('profile')), chunk('EXIF', new TextEncoder().encode('private gps')), frame.slice(12)]
  const input = new Uint8Array(12 + parts.reduce((n, part) => n + part.length, 0)); input.set(frame.slice(0, 12)); new DataView(input.buffer).setUint32(4, input.length - 8, true)
  let offset = 12; for (const part of parts) { input.set(part, offset); offset += part.length }
  assert.throws(() => webpSize(input.buffer))
  const output = cleanCanvasWebp(input.buffer)
  assert.deepEqual(webpSize(output), { width: 8, height: 6 })
  assert.ok(!new TextDecoder().decode(output).includes('private gps'))
  assert.equal(new Uint8Array(output)[20], 0)
})
test('Live Photo metadata is scrubbed without changing media offsets', () => {
  const ftyp = atom('ftyp', new TextEncoder().encode('isom0000isom0000')),
    secret = new TextEncoder().encode('GPS SECRET +35.123+110.456'),
    moov = atom('moov', atom('udta', secret)),
    mdat = atom('mdat', new Uint8Array([1, 2, 3, 4]))
  const input = new Uint8Array(ftyp.length + moov.length + mdat.length)
  input.set(ftyp)
  input.set(moov, ftyp.length)
  input.set(mdat, ftyp.length + moov.length)
  const output = sanitizeVideo(input.buffer)
  assert.equal(output.byteLength, input.byteLength)
  assert.ok(!new TextDecoder().decode(output).includes('SECRET'))
  assert.deepEqual(new Uint8Array(output).slice(-4), new Uint8Array([1, 2, 3, 4]))
})
test('truncated video atoms and appended WebP payloads are rejected', () => {
  assert.throws(() =>
    sanitizeVideo(atom('ftyp', new TextEncoder().encode('isom0000isom0000')).buffer.slice(0, 15)),
  )
  const valid = new Uint8Array(
    Buffer.from('UklGRiIAAABXRUJQVlA4TBYAAAAvB0ABAAdQy5IVuf8BgCD8b5uI6H8I', 'base64'),
  )
  assert.deepEqual(webpSize(valid.buffer), { width: 8, height: 6 })
  const invalid = new Uint8Array(valid.length + 4)
  invalid.set(valid)
  invalid.set([1, 2, 3, 4], valid.length)
  assert.throws(() => webpSize(invalid.buffer))
})
