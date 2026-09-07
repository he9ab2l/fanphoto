import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { processSource } from '../apps/server/src/modules/media/processor'
const input = await readFile('artifacts/format-fixtures/example.heic')
const result = await processSource(input)
assert.equal(result.source.mime, 'image/heic')
assert.equal(result.assets.length, 4)
assert.ok(result.width > 0 && result.height > 0)
console.log(
  JSON.stringify({
    format: result.source.mime,
    width: result.width,
    height: result.height,
    variants: result.assets.map((asset) => ({
      variant: asset.variant,
      width: asset.width,
      height: asset.height,
    })),
  }),
)
