import { test } from 'node:test'
import assert from 'node:assert/strict'
import { masonry, project, sceneTiles, modulo } from '../apps/client/src/gallery/geometry'
import type { PhotoSummary } from '../packages/contracts/src'

const ratios = [1.5, 2 / 3, 1, 4, 8, 0.4]
const sampleAsset = (id: number, size: string) => ({
  url: `/${id}/${size}`,
  width: 800,
  height: 600,
  bytes: 1,
})
const photos: PhotoSummary[] = Array.from({ length: 36 }, (_, i) => ({
  id: `photo-${i}`,
  title: `Geometry ${i}`,
  width: 1200 * ratios[i % ratios.length],
  height: 1200,
  capturedAt: null,
  capturedLocal: null,
  capturedOffset: null,
  location: '',
  tags: [],
  favorite: false,
  thumbHash: null,
  assets: {
    sm: sampleAsset(i, 'sm'),
    md: sampleAsset(i, 'md'),
    lg: sampleAsset(i, 'lg'),
    original: sampleAsset(i, 'original'),
  },
}))
test('masonry preserves every aspect ratio and prevents overlaps at all responsive densities', () => {
  for (const width of [320, 390, 768, 1440, 1920])
    for (const density of [1, 2, 3]) {
      const { tiles, height } = masonry(photos, width, density)
      assert.equal(tiles.length, photos.length)
      assert.ok(height > 0)
      for (const tile of tiles) {
        assert.ok(Math.abs(tile.width / tile.height - tile.photo.width / tile.photo.height) < 1e-8)
        assert.ok(tile.x >= 0 && tile.x + tile.width <= width + 0.001)
        assert.ok(tile.y >= 0 && tile.y + tile.height <= height + 0.001)
        for (const other of tiles)
          if (tile.key !== other.key) {
            const overlapX =
              Math.min(tile.x + tile.width, other.x + other.width) - Math.max(tile.x, other.x)
            const overlapY =
              Math.min(tile.y + tile.height, other.y + other.height) - Math.max(tile.y, other.y)
            assert.ok(overlapX <= 0.001 || overlapY <= 0.001, `Overlap ${tile.key}/${other.key}`)
          }
      }
    }
})
test('cylinder has one curvature axis; sphere adds a stronger second axis without bending image geometry', () => {
  const size = { width: 1440, height: 900 }
  const cylinder = project(500, 260, size, 'cylinder'),
    sphere = project(500, 260, size, 'sphere')
  assert.equal(cylinder.rotateX, 0)
  assert.equal(cylinder.y, 260)
  assert.ok(sphere.rotateX > 0)
  assert.ok(sphere.z > cylinder.z)
  assert.ok(Math.abs(sphere.rotateY) < 30)
  assert.ok(Math.abs(sphere.rotateX) < 30)
  assert.deepEqual(project(0, 0, size, 'sphere'), { x: 0, y: 0, z: 0, rotateX: 0, rotateY: -0 })
})
test('infinite surfaces cover large positive and negative exploration with unique, proportional tiles', () => {
  for (const x of [-100000, -1000, 0, 1000, 100000])
    for (const y of [-50000, 0, 50000]) {
      const tiles = sceneTiles(photos, { width: 390, height: 844 }, { x, y })
      assert.ok(tiles.length > 8 && tiles.length < 400)
      assert.equal(new Set(tiles.map((tile) => tile.key)).size, tiles.length)
      for (const tile of tiles) {
        assert.ok(Number.isFinite(tile.x) && Number.isFinite(tile.y))
        assert.ok(Math.abs(tile.width / tile.height - tile.photo.width / tile.photo.height) < 1e-8)
      }
    }
  assert.equal(modulo(-1, 32), 31)
})
