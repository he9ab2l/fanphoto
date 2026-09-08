import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const origin = process.env.FANPHOTO_CAPTURE_ORIGIN || 'http://127.0.0.1:8788'
const output = resolve(process.env.FANPHOTO_CAPTURE_DIR || 'artifacts/ui-proof')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const records = []
try {
  for (const [width, height] of [
    [320, 780],
    [390, 844],
    [768, 1024],
    [1440, 1000],
    [1920, 1080],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      window.__fanphotoRafCount = 0
      const raf = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (callback) => {
        window.__fanphotoRafCount++
        return raf(callback)
      }
    })
    await page.goto(origin, { waitUntil: 'networkidle' })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (theme) =>
          localStorage.setItem('fanphoto.preferences', JSON.stringify({ theme, density: 2 })),
        theme,
      )
      for (const mode of ['flat', 'surround']) {
        await page.goto(`${origin}/?view=${mode}`, { waitUntil: 'networkidle' })
        await page.waitForSelector(
          mode === 'flat' ? '.photo-tile' : '.scene-tile[aria-hidden="false"]',
        )
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll('[data-testid="photo-card"] img')]
              .filter((image) => {
                const r = image.getBoundingClientRect()
                return (
                  r.width &&
                  r.height &&
                  r.right > 0 &&
                  r.left < innerWidth &&
                  r.bottom > 0 &&
                  r.top < innerHeight &&
                  getComputedStyle(image).visibility !== 'hidden'
                )
              })
              .every((image) => image.complete && image.naturalWidth > 0),
          undefined,
          { timeout: 15000 },
        )
        const result = await page.evaluate(() => {
          const rect = (node) => {
            const r = node.getBoundingClientRect()
            return {
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
            }
          }
          const intersect = (r) =>
            Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.x)) *
            Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.y))
          const cards = [...document.querySelectorAll('[data-testid="photo-card"]')]
          const visible = cards.filter(
            (node) => getComputedStyle(node).visibility !== 'hidden' && intersect(rect(node)) > 0,
          )
          const full = visible.filter((node) => {
            const r = rect(node)
            return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
          })
          const controls = [
            ...document.querySelectorAll(
              '.gallery-brand,.gallery-dock,.gallery-count,.explore-hint',
            ),
          ].map(rect)
          const dock = getComputedStyle(document.querySelector('.gallery-dock'))
          const tilt = full
            .filter((node) => node.classList.contains('scene-tile'))
            .map((node) => {
              const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform)
              return (
                (Math.max(
                  Math.acos(Math.min(1, Math.abs(matrix.m11))),
                  Math.acos(Math.min(1, Math.abs(matrix.m22))),
                ) *
                  180) /
                Math.PI
              )
            })
          const flatErrors = cards
            .filter((node) => node.classList.contains('photo-tile'))
            .map((node) => {
              const img = node.querySelector('img')
              return Math.abs(
                parseFloat(node.style.width) / parseFloat(node.style.height) -
                  Number(img.getAttribute('width')) / Number(img.getAttribute('height')),
              )
            })
          return {
            mode: document.querySelector('.gallery').dataset.viewMode,
            theme: document.documentElement.dataset.theme,
            overflow: document.documentElement.scrollWidth > innerWidth,
            visiblePhotos: visible.length,
            fullPhotos: full.length,
            controlsAreaFraction:
              controls.reduce((sum, r) => sum + intersect(r), 0) / (innerWidth * innerHeight),
            controlsInViewport: controls.every(
              (r) =>
                r.x >= -1 && r.y >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
            ),
            glass: {
              background: dock.backgroundColor,
              blur: dock.backdropFilter,
              border: dock.borderTopWidth,
              shadow: dock.boxShadow,
            },
            maxFullPhotoTilt: Math.max(0, ...tilt),
            maxFlatRatioError: Math.max(0, ...flatErrors),
            imagesContained: visible.every(
              (node) => getComputedStyle(node.querySelector('img')).objectFit === 'contain',
            ),
            rafCount: window.__fanphotoRafCount,
          }
        })
        await page.waitForTimeout(300)
        result.idleRafCalls =
          (await page.evaluate(() => window.__fanphotoRafCount)) - result.rafCount
        assert.equal(result.mode, mode)
        assert.equal(result.theme, theme)
        assert.equal(result.overflow, false)
        assert.ok(result.visiblePhotos >= 3)
        assert.ok(result.controlsAreaFraction < (width < 600 ? 0.12 : 0.06))
        assert.equal(result.controlsInViewport, true)
        assert.match(result.glass.blur, /blur\(/)
        assert.equal(result.imagesContained, true)
        assert.ok(result.maxFlatRatioError < 0.001)
        assert.ok(result.maxFullPhotoTilt < 40)
        assert.ok(result.idleRafCalls <= 2, 'Wall must not retain an idle animation loop')
        records.push({ width, height, ...result })
        console.log(
          `Verified ${width}px ${theme}/${mode}: ${result.visiblePhotos} photos, ${(result.controlsAreaFraction * 100).toFixed(1)}% controls`,
        )
      }
    }
    assert.deepEqual(errors, [])
    const cdp = await context.newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const document = await cdp.send('DOM.getDocument')
    const node = await cdp.send('DOM.querySelector', {
      nodeId: document.root.nodeId,
      selector: '.mode-option[data-checked] .mode-label',
    })
    const fonts = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: node.nodeId })
    records.push({ width, chineseFonts: fonts.fonts })
    assert.ok(
      fonts.fonts.some((font) => /CJK|Hei|Han|PingFang|Microsoft|Noto/.test(font.familyName)),
      'Chinese glyph font must be present',
    )
    await context.close()
  }
} finally {
  await browser.close()
}
await writeFile(resolve(output, 'layout-audit.json'), JSON.stringify(records, null, 2))
console.log(
  `All ${records.filter((record) => record.mode).length} viewport/theme/mode combinations verified`,
)
