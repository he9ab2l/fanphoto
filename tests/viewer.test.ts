import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fitPhoto,
  viewerLayout,
  VIEWER,
  type InfoState,
} from '../apps/client/src/gallery/viewer-layout'
import { imageAsset, retryImageUrl } from '../apps/client/src/lib/image-loading'
import { glassDisplacementPixels, withinGlassBudget } from '../apps/client/src/ui/glass-map'
import type { PhotoSummary } from '../packages/contracts/src'

test('viewer preserves every photo ratio and reserves independent mobile sheet space', () => {
  for (const width of [360, 390, 430, 768, 1024, 1280, 1440])
    for (const aspect of [0.4, 2 / 3, 1, 1.5, 3, 4, 8])
      for (const info of ['collapsed', 'partial', 'full'] as InfoState[]) {
        const layout = viewerLayout({ width, height: 844 }, aspect, info)
        const photo = layout.photo
        assert.ok(Math.abs(photo.width / photo.height - aspect) < 1e-8)
        assert.ok(photo.x >= 0 && photo.x + photo.width <= layout.stageWidth + 1e-6)
        assert.ok(photo.y >= 0 && photo.y + photo.height <= layout.stageHeight + 1e-6)
        if (width <= VIEWER.breakpoint && info !== 'collapsed') {
          assert.ok(layout.stageHeight < layout.shellHeight)
          assert.ok(layout.sheet.full < layout.shellHeight * 0.81)
        }
      }
})

test('desktop info toggles never change shell geometry and release all sidebar width', () => {
  for (const width of [1024, 1280, 1440])
    for (const aspect of [2 / 3, 1, 1.5, 4, 8]) {
      const viewport = { width, height: 900 }
      const open = viewerLayout(viewport, aspect, 'full')
      const closed = viewerLayout(viewport, aspect, 'collapsed')
      assert.equal(open.shellHeight, closed.shellHeight)
      assert.equal(open.shellWidth, closed.shellWidth)
      assert.equal(closed.stageWidth - open.stageWidth, VIEWER.infoWidth)
      assert.ok(closed.photo.width >= open.photo.width)
    }
})

test('photo fit handles empty metadata safely', () => {
  const fit = fitPhoto(Number.NaN, 320, 200)
  assert.deepEqual(fit, { width: 200, height: 200 })
})

test('changing photo ratio keeps the desktop information and close controls in place', () => {
  const viewport = { width: 1440, height: 900 }
  const heights = [0.6, 1, 1.5, 3.3, 8].map(
    (ratio) => viewerLayout(viewport, ratio, 'full').shellHeight,
  )
  assert.equal(new Set(heights).size, 1)
})

const photo = {
  width: 6000,
  height: 4000,
  assets: Object.fromEntries(
    [
      ['sm', 400],
      ['md', 800],
      ['lg', 1600],
      ['original', 6000],
    ].map(([variant, width]) => [
      variant,
      {
        url: `/media/${variant}?v=abc`,
        width: Number(width),
        height: Number(width) / 1.5,
        bytes: 1,
      },
    ]),
  ),
} as PhotoSummary

test('responsive image selection bounds wall transfer and never uses original downloads', () => {
  assert.equal(imageAsset(photo, 180, 120, 3, true).url, '/media/sm?v=abc')
  assert.equal(imageAsset(photo, 300, 200, 3, true).url, '/media/md?v=abc')
  assert.equal(imageAsset(photo, 1200, 800, 3).url, '/media/lg?v=abc')
  assert.equal(imageAsset(photo, 390, 844, 2).url, '/media/md?v=abc')
  assert.equal(imageAsset(photo, 390, 844, 1).url, '/media/sm?v=abc')
})

test('only an explicit retry changes an image URL', () => {
  assert.equal(retryImageUrl('/media/lg?v=abc', 0), '/media/lg?v=abc')
  assert.equal(retryImageUrl('/media/lg?v=abc', 1), '/media/lg?v=abc&retry=1')
  assert.equal(retryImageUrl('/media/lg', 1), '/media/lg?retry=1')
})

test('liquid glass map is deterministic, neutral in the center, and limited to small surfaces', () => {
  const map = glassDisplacementPixels(300, 56, 28)
  assert.deepEqual(map, glassDisplacementPixels(300, 56, 28))
  const center = (28 * 300 + 150) * 4
  assert.equal(map.pixels[center], 128)
  assert.equal(map.pixels[center + 1], 128)
  assert.ok(withinGlassBudget(400, 60))
  assert.equal(withinGlassBudget(1440, 900), false)
  assert.equal(withinGlassBudget(320, 640), false)
  assert.equal(withinGlassBudget(0, 0), false)
})
