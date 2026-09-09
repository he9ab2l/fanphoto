import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Opt in to an already running browser. This command never starts a browser
// (especially not a software-rendered browser on the deployment server).
const endpoint = process.env.FANPHOTO_CDP_ENDPOINT
if (!endpoint)
  throw new Error('Set FANPHOTO_CDP_ENDPOINT to a browser started on the development machine')
const origin = process.env.FANPHOTO_UI_ORIGIN || 'http://127.0.0.1:4173'
const mobileOnly = process.argv.includes('--mobile')
if (process.platform === 'android') {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve('artifacts/browser-cache')
  process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ||= 'debian12-arm64'
}
const { chromium } = await import('playwright-core')
const browser = await chromium.connectOverCDP(endpoint)
const output = resolve('artifacts/viewer')
const reportFile = `${output}/${mobileOnly ? 'mobile-report' : 'browser-report'}.json`
await mkdir(output, { recursive: true })
const response = await fetch(`${origin}/api/photos?limit=80`)
assert.ok(response.ok)
const { items } = await response.json()
const cases = [
  items.find((p) => p.width / p.height >= 3),
  items.find((p) => p.width / p.height < 0.85),
  items.find((p) => Math.abs(p.width / p.height - 1) < 0.05),
  items.find((p) => p.width / p.height > 1.3 && p.width / p.height < 2),
]
assert.ok(cases.every(Boolean), 'real panorama, portrait, square and landscape photos')
const rich = items.find((p) => p.id === '9014be86-0ab1-414e-abf6-3ee7ed1c3993') || cases[0]
const report = { origin, browser: browser.version(), layouts: [], interactions: [], errors: [] }
let context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
let page = await context.newPage()
page.setDefaultTimeout(15_000)
page.on('pageerror', (error) => report.errors.push(error.message))
await context.route('**/api/**', (route) =>
  ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort(),
)
const ready = async (id) => {
  await page.waitForFunction((photoId) => {
    const image = document.querySelector('[data-testid="detail-image"]')
    return image?.getAttribute('data-ready') === 'true' && image.currentSrc.includes(photoId)
  }, id)
}
const settle = () => page.waitForTimeout(230)
try {
  if (!mobileOnly) {
    for (const [index, width] of [360, 390, 430, 768, 1024, 1280, 1440].entries()) {
      await page.setViewportSize({ width, height: 900 })
      // Representative rendered cases; pure geometry tests cover the full matrix.
      for (const photo of [cases[index % cases.length]]) {
        report.current = { width, photo: photo.id }
        await page.goto(`${origin}/photo/${photo.id}`, { waitUntil: 'domcontentloaded' })
        await ready(photo.id)
        await settle()
        const bounds = await page.evaluate(() => {
          const rect = (selector) =>
            document.querySelector(selector).getBoundingClientRect().toJSON()
          return { stage: rect('.detail-stage'), photo: rect('[data-testid="detail-image"]') }
        })
        const { stage, photo: image } = bounds
        assert.ok(image.width > 0 && image.height > 0)
        assert.ok(
          Math.abs(image.width / image.height - photo.width / photo.height) < 0.01,
          'no stretching',
        )
        assert.ok(
          image.x >= stage.x - 2 &&
            image.right <= stage.right + 2 &&
            image.y >= stage.y - 2 &&
            image.bottom <= stage.bottom + 2,
          'photo stays inside its stage',
        )
        report.layouts.push({ width, photo: photo.id, ...bounds })
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${origin}/photo/${rich.id}`, { waitUntil: 'domcontentloaded' })
    await ready(rich.id)
    await settle()
    const image = await page.locator('[data-testid="detail-image"]').elementHandle()
    const source = await image.getAttribute('src')
    await page.locator('.detail-info-scroll').evaluate((node) => {
      node.scrollTop = 180
    })
    const scroll = await page.locator('.detail-info-scroll').evaluate((node) => node.scrollTop)
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: '收起照片信息', exact: true }).click()
      await page.getByRole('button', { name: '显示照片信息', exact: true }).click()
    }
    await settle()
    assert.ok(
      await image.evaluate(
        (node) => node === document.querySelector('[data-testid="detail-image"]'),
      ),
      'same image node across folds',
    )
    assert.equal(await image.getAttribute('src'), source)
    assert.equal(
      await page.locator('.detail-info-scroll').evaluate((node) => node.scrollTop),
      scroll,
    )
    assert.equal(
      await page
        .locator('.metadata-facts > div')
        .first()
        .evaluate((node) => getComputedStyle(node).display),
      'grid',
    )
    await page.getByRole('button', { name: '分享', exact: true }).click()
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      `${origin}/photo/${rich.id}`,
    )
    assert.match(
      await page.locator('.detail-download').getAttribute('href'),
      new RegExp(`/photos/${rich.id}/download$`),
    )
    await page.screenshot({ path: `${output}/desktop.png` })
    await page.keyboard.press('Escape')
    await page.waitForURL(`${origin}/`)
    assert.equal(await page.getByRole('radio').count(), 2)
    await page.getByRole('radio', { name: '环绕模式' }).click()
    const wall = page.getByTestId('immersive-wall')
    await wall.waitFor()
    await wall.focus()
    await page.keyboard.press('ArrowRight')
    await settle()
    assert.equal(await wall.getAttribute('data-curvature'), 'surround')
    await page.screenshot({ path: `${output}/surround.png` })
    report.interactions.push(
      'desktop folds preserve image and metadata scroll',
      'share and download',
      'Escape',
      'two modes and surround keyboard input',
    )
  }

  await context.close()
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  await context.route('**/api/**', (route) =>
    ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort(),
  )
  page = await context.newPage()
  page.setDefaultTimeout(15_000)
  page.on('pageerror', (error) => report.errors.push(error.message))
  await page.goto(`${origin}/photo/${rich.id}`, { waitUntil: 'domcontentloaded' })
  await ready(rich.id)
  await page.getByRole('button', { name: '查看照片信息', exact: true }).click()
  await settle()
  assert.equal(await page.getByTestId('photo-detail').getAttribute('data-info'), 'partial')
  const partial = await page.locator('.detail-sheet .detail-info-footer').boundingBox()
  assert.ok(partial.y >= 0 && partial.y + partial.height <= 845, 'partial sheet actions visible')
  await page.getByRole('button', { name: '展开完整照片信息', exact: true }).click()
  await settle()
  assert.equal(await page.getByTestId('photo-detail').getAttribute('data-info'), 'full')
  assert.ok(await page.locator('.detail-stage').evaluate((node) => node.inert))
  const url = page.url()
  await page.keyboard.press('ArrowRight')
  assert.equal(page.url(), url, 'sheet blocks unintended photo navigation')
  await page.screenshot({ path: `${output}/phone-full.png` })
  const handle = await page
    .getByRole('button', { name: '半展开照片信息', exact: true })
    .boundingBox()
  const beforeDrag = await page.locator('.detail-sheet').boundingBox()
  const touch = await context.newCDPSession(page)
  const x = Math.round(handle.x + handle.width / 2),
    y = Math.round(handle.y + handle.height / 2)
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (const offset of [20, 50, 90])
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + offset }],
    })
  const duringDrag = await page.locator('.detail-sheet').boundingBox()
  assert.ok(duringDrag.y > beforeDrag.y + 20, 'whole sheet follows the finger')
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await settle()
  if ((await page.getByTestId('photo-detail').getAttribute('data-info')) === 'collapsed') {
    await page.getByRole('button', { name: '查看照片信息', exact: true }).click()
    await settle()
  }
  await page.getByRole('button', { name: '收起照片信息', exact: true }).click()
  await settle()
  assert.equal(await page.getByTestId('photo-detail').getAttribute('data-info'), 'collapsed')
  await page.screenshot({ path: `${output}/phone.png` })
  await page.getByRole('button', { name: '关闭照片详情', exact: true }).click()
  await page.waitForURL(`${origin}/`)
  report.interactions.push(
    'mobile collapsed/partial/full',
    'fixed actions visible',
    'background interaction blocked',
    'touch drag moves the whole sheet',
    'close',
  )
  assert.deepEqual(report.errors, [])
  report.status = 'passed'
  await writeFile(reportFile, JSON.stringify(report, null, 2))
  console.log(
    JSON.stringify({
      layouts: report.layouts.length,
      interactions: report.interactions,
      errors: report.errors,
      output,
    }),
  )
} catch (error) {
  report.status = 'failed'
  report.failure = error.message
  throw error
} finally {
  await writeFile(reportFile, JSON.stringify(report, null, 2))
  await context.close()
  await browser.close()
}
