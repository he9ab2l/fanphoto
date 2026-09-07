import { test } from 'node:test'
import assert from 'node:assert/strict'
import { masonry, project, sceneTiles, modulo, DEFAULT_JUSTIFY_OPTIONS } from '../apps/client/src/gallery/geometry'
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

// ---- justified wall V2.1 feature tests ----

const makePhotos = (ratios: number[]): PhotoSummary[] =>
  ratios.map((ratio, i) => ({
    id: `batch-${i}`,
    title: `Batch ${i}`,
    width: 1200 * ratio,
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

/** 同一行（y 相等）的 tiles 的右缘。 */
const rowRightEdges = (tiles: ReturnType<typeof masonry>['tiles']) => {
  const rows = new Map<number, number>()
  for (const tile of tiles) {
    const right = tile.x + tile.width
    rows.set(tile.y, Math.max(rows.get(tile.y) ?? 0, right))
  }
  return [...rows.values()]
}

test('every row including the last fills the container exactly (rectangular wall)', () => {
  const source = makePhotos(Array(10).fill(1.5))
  for (const density of [1, 2, 3]) {
    const { tiles, height } = masonry(source, 1440, density)
    assert.equal(tiles.length, source.length)
    assert.ok(height > 0)
    const rows = new Map<number, number>()
    for (const tile of tiles) rows.set(tile.y, Math.max(rows.get(tile.y) ?? 0, tile.x + tile.width))
    for (const [y, right] of rows) assert.ok(Math.abs(right - 1440) < 1e-6, `row ${y} should be flush, got ${right}`)
  }
})

test('sparse tail is split into flush rows instead of leaving a hole', () => {
  // 5 张（1.5×4 + 2/3）：整体 390px 宽一行填充，无尾部空缺
  const { tiles } = masonry(makePhotos([1.5, 1.5, 1.5, 1.5, 2 / 3]), 1440, 2)
  const lastY = Math.max(...tiles.map((tile) => tile.y))
  const lastRight = Math.max(...tiles.filter((tile) => tile.y === lastY).map((tile) => tile.x + tile.width))
  assert.ok(Math.abs(lastRight - 1440) < 1e-6, `last row should be flush, got ${lastRight}`)
})

test('single photo fills the wall instead of leaving empty space', () => {
  const { tiles } = masonry(makePhotos([1.5]), 1440, 2)
  assert.equal(tiles.length, 1)
  assert.ok(Math.abs(tiles[0].x + tiles[0].width - 1440) < 1e-6, 'flush to the container')
  assert.ok(tiles[0].height > DEFAULT_JUSTIFY_OPTIONS[2].targetRowHeight * 2, 'enlarged to fill')
})

test('pathological ultra-tall tail falls back to bounded special rows, never a giant strip', () => {
  const opts = DEFAULT_JUSTIFY_OPTIONS[2]
  const cap = opts.targetRowHeight * opts.tailRowHeightCap
  // 0.15 竖长条：任何满行划分都会突破 cap → 回退 special（高度受限）
  const { tiles } = masonry(makePhotos([0.15, 0.15]), 1440, 2)
  assert.equal(tiles.length, 2)
  for (const tile of tiles) {
    assert.ok(tile.height <= opts.specialMaxHeight + 1e-6, 'bounded special height')
    assert.ok(tile.height < cap, 'never blows past the tail cap')
    assert.ok(tile.x + tile.width <= 1440 + 1e-6)
  }
})

test('extreme tall/wide tails: tall is bounded, wide spans the wall flush', () => {
  // [0.2, 8]：0.2 填满会突破 cap → special（高受限居中）；8 全景单张 fill 合法 → 满宽平铺
  const opts = DEFAULT_JUSTIFY_OPTIONS[2]
  const { tiles } = masonry(makePhotos([0.2, 8]), 1440, 2)
  assert.equal(tiles.length, 2)
  const tall = tiles[0]
  assert.equal(tall.height, opts.specialMaxHeight)
  assert.equal(tall.width, opts.specialMaxHeight * 0.2)
  assert.ok(tall.x > 0 && tall.x + tall.width < 1440, 'centered')
  const wide = tiles[1]
  assert.ok(Math.abs(wide.x + wide.width - 1440) < 1e-6, 'full-span panorama, no hole')
  assert.ok(Math.abs(wide.width / wide.height - 8) < 1e-8)
})

test('extreme tail still keeps the wall rectangular and never crushes peers', () => {
  const opts = DEFAULT_JUSTIFY_OPTIONS[2]
  const cap = opts.targetRowHeight * opts.tailRowHeightCap
  const { tiles } = masonry(makePhotos([8, 0.4, 0.2]), 1440, 2)
  assert.equal(tiles.length, 3)
  // 8 全景独占一行铺满；0.4/0.2 双竖条收官行铺满（矩形优先）
  for (const tile of tiles) {
    assert.ok(tile.x + tile.width <= 1440 + 1e-6)
    assert.ok(tile.height <= cap + 1e-6, 'respects the tail row-height cap')
    const ratio = tile.photo.width / tile.photo.height
    if (ratio >= opts.extremeWide || ratio <= opts.extremeTall) {
      assert.ok(tile.width >= opts.soft.min - 1e-6, 'extreme figure is never paper-thin')
    }
  }
  // 全部行满行宽（底部平齐、整体矩形）
  const rows = new Map<number, number>()
  for (const tile of tiles) rows.set(tile.y, Math.max(rows.get(tile.y) ?? 0, tile.x + tile.width))
  for (const right of rows.values()) assert.ok(Math.abs(right - 1440) < 1e-6, `row right edge ${right}`)
})

test('extreme photo never crushes peers, whether sharing a row or spanning its own', () => {
  const { tiles } = masonry(makePhotos([8, 1.5, 1.5, 1.5, 1.5]), 1440, 2)
  assert.equal(tiles.length, 5)
  const opts = DEFAULT_JUSTIFY_OPTIONS[2]
  for (const tile of tiles) {
    const ratio = tile.photo.width / tile.photo.height
    assert.ok(Math.abs(tile.width / tile.height - ratio) < 1e-8, 'proportions kept')
    if (ratio < opts.extremeWide && ratio > opts.extremeTall) {
      assert.ok(tile.width >= opts.soft.min - 1e-6, `peer ${tile.photo.id} crushed to ${tile.width}`)
    }
    assert.ok(tile.x + tile.width <= 1440 + 1e-6, 'in bounds')
  }
})

test('extreme-tall tail is height-bounded and never paper-thin', () => {
  const opts = DEFAULT_JUSTIFY_OPTIONS[2]
  const { tiles } = masonry(makePhotos([0.2, 1.5, 1.5, 1.5]), 1440, 2)
  assert.equal(tiles.length, 4)
  const tall = tiles[0]
  // 0.2 与 1.5×3 共行极差 7.5× 超上限 → 单独受限展示（special），宽度保持可读
  assert.ok(tall.height <= opts.specialMaxHeight + 1e-6, 'bounded')
  assert.ok(tall.width >= opts.soft.min - 1e-6, 'not crushed')
})

test('single square photo fills the wall flush (no special row, no hole)', () => {
  const { tiles } = masonry(makePhotos([1]), 1440, 2)
  assert.equal(tiles.length, 1)
  assert.ok(Math.abs(tiles[0].x + tiles[0].width - 1440) < 1e-6)
  assert.equal(tiles[0].height, 1440) // 1:1 填满容器宽
})
