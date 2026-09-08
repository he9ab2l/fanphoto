import { chromium, devices } from 'playwright-core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = process.env.FANPHOTO_CAPTURE_ORIGIN || 'http://127.0.0.1:8788'
const output = resolve(process.env.FANPHOTO_CAPTURE_DIR || 'artifacts/ui-proof')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const reports = []
async function visibleImagesReady(page) {
  await page.waitForFunction(
    () =>
      [...document.images]
        .filter((image) => {
          const rect = image.getBoundingClientRect()
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < innerHeight &&
            rect.right > 0 &&
            rect.left < innerWidth &&
            getComputedStyle(image).visibility !== 'hidden'
          )
        })
        .every((image) => image.complete && image.naturalWidth > 0),
    { timeout: 15000 },
  )
  await page.evaluate(() => document.fonts.ready)
}
try {
  for (const [name, options] of [
    ['desktop', { viewport: { width: 1440, height: 1000 } }],
    ['mobile', { ...devices['iPhone 13'] }],
  ]) {
    const context = await browser.newContext({ ...options, locale: 'zh-CN' })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    page.setDefaultNavigationTimeout(20000)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto(origin, { waitUntil: 'networkidle' })
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        localStorage.setItem('fanphoto.preferences', JSON.stringify({ theme, density: 2 }))
      }, theme)
      for (const mode of ['flat', 'surround']) {
        await page.goto(`${origin}/?view=${mode}`, { waitUntil: 'networkidle' })
        await page.waitForSelector(
          mode === 'flat' ? '.photo-tile img' : '.scene-tile[aria-hidden="false"] img',
        )
        // Off-screen lazy images are deliberately not requested; awaiting their
        // decode() would never finish on a long mobile wall.
        await visibleImagesReady(page)
        await page.screenshot({ path: resolve(output, `${name}-${theme}-${mode}.png`) })
        console.log(`Captured ${name}/${theme}/${mode}`)
        reports.push({
          viewport: name,
          theme,
          renderedTheme: await page.locator('html').getAttribute('data-theme'),
          mode,
          overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          tiles: await page.locator('[data-testid="photo-card"]').count(),
        })
      }
    }
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
    await page.locator('.photo-tile').first().click()
    await page.waitForSelector('.detail-photo img.is-loaded')
    await page.screenshot({ path: resolve(output, `${name}-detail.png`) })
    await page.getByRole('button', { name: '收起照片信息' }).click()
    await page.waitForSelector('.detail-info', { state: 'detached' })
    await page.waitForTimeout(300)
    await page.screenshot({ path: resolve(output, `${name}-detail-collapsed.png`) })
    await page.getByRole('button', { name: '关闭照片详情' }).click()
    const credentials = process.env.FANPHOTO_CREDENTIALS_FILE
    if (credentials) {
      const contents = await readFile(credentials, 'utf8')
      const password = /^密码：(.+)$/m.exec(contents)?.[1]
      if (!password) throw new Error('Credentials file has no password')
      await page.goto(`${origin}/studio`, { waitUntil: 'networkidle' })
      await page.screenshot({ path: resolve(output, `${name}-login.png`) })
      try {
        await page.getByLabel('管理员密码').fill(password)
        await page.getByRole('button', { name: '进入工作室', exact: true }).click()
        await page.waitForSelector('.library-grid')
      } catch {
        throw new Error('Studio sign-in failed; credential values omitted')
      }
      for (const [route, filename] of [
        ['/studio', 'library'],
        ['/studio/upload', 'upload'],
        ['/studio/albums', 'albums'],
        ['/studio/settings', 'settings'],
      ]) {
        await page.goto(origin + route, { waitUntil: 'networkidle' })
        if (filename === 'library') {
          const height = await page.evaluate(() => document.documentElement.scrollHeight)
          for (let y = 0; y < height; y += page.viewportSize().height * 0.8) {
            await page.evaluate((y) => window.scrollTo(0, y), y)
            await visibleImagesReady(page)
          }
          await page.evaluate(() => window.scrollTo(0, 0))
        }
        await page.screenshot({
          path: resolve(output, `${name}-studio-${filename}.png`),
          fullPage: true,
        })
      }
    }
    reports.push({ viewport: name, errors })
    await writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2))
    await context.close()
  }
} finally {
  await browser.close()
}
await writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2))
console.log(JSON.stringify(reports))
