import { test, expect, type Page } from '@playwright/test'

async function centeredTile(page: Page) {
  const index = await page.locator('.scene-tile').evaluateAll((elements) => {
    let best = -1,
      distance = Infinity
    elements.forEach((element, index) => {
      const rect = element.getBoundingClientRect()
      if (
        getComputedStyle(element).visibility !== 'visible' ||
        rect.width < 40 ||
        rect.x < 0 ||
        rect.y < 75 ||
        rect.right > innerWidth ||
        rect.bottom > innerHeight - 95
      )
        return
      const next = Math.hypot(
        rect.x + rect.width / 2 - innerWidth / 2,
        rect.y + rect.height / 2 - innerHeight / 2,
      )
      if (next < distance) {
        distance = next
        best = index
      }
    })
    return best
  })
  expect(index).toBeGreaterThanOrEqual(0)
  return page.locator('.scene-tile').nth(index)
}
test('natural proportions, panorama spans and real next-page loading', async ({ page }) => {
  const pages: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/photos?')) pages.push(request.url())
  })
  const total = (await (await page.request.get('/api/v1/photos?limit=1')).json()).page.total
  await page.goto('/')
  await expect.poll(() => page.locator('.photo-tile').count()).toBeGreaterThanOrEqual(24)
  const boxes = await page.locator('.photo-tile').evaluateAll((tiles) =>
    tiles.map((tile) => {
      const image = tile.querySelector('img')!
      return {
        width: parseFloat((tile as HTMLElement).style.width),
        height: parseFloat((tile as HTMLElement).style.height),
        original: Number(image.getAttribute('width')) / Number(image.getAttribute('height')),
        fit: getComputedStyle(image).objectFit,
      }
    }),
  )
  for (const box of boxes) {
    expect(Math.abs(box.width / box.height - box.original)).toBeLessThan(0.001)
    expect(box.fit).toBe('contain')
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect(page.locator('.photo-tile')).toHaveCount(total)
  expect(pages.some((url) => url.includes('cursor='))).toBe(true)
  const ids = await page
    .locator('.photo-tile')
    .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-photo-id')))
  expect(new Set(ids).size).toBe(total)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('three wall modes, dragging, wheel looping, detail background and collapse', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  for (const [label, mode] of [
    ['圆柱模式', 'cylinder'],
    ['球面模式', 'sphere'],
  ] as const) {
    await page.getByRole('radio', { name: label, exact: true }).click()
    await expect(page.locator('.gallery')).toHaveAttribute('data-view-mode', mode)
    await expect(page.getByTestId('immersive-wall')).toBeVisible()
    const tile = await centeredTile(page)
    const before = await tile.getAttribute('style')
    const viewport = page.viewportSize()!
    await page.mouse.move(viewport.width / 2, viewport.height / 2)
    await page.mouse.down()
    await page.mouse.move(viewport.width / 2 + 100, viewport.height / 2 + 70, { steps: 12 })
    await page.mouse.up()
    await expect.poll(() => tile.getAttribute('style')).not.toBe(before)
    await page.mouse.wheel(0, 20000)
    await expect
      .poll(async () => page.locator('.scene-tile[aria-hidden="false"]').count())
      .toBeGreaterThan(3)
  }
  const target = await centeredTile(page)
  if (info.project.name === 'mobile') await target.tap()
  else await target.click()
  await expect(page.getByTestId('photo-detail')).toBeVisible()
  await expect(page.getByRole('complementary', { name: '照片元数据' })).toBeVisible()
  await expect(page.getByText('Synthetic Camera', { exact: true })).toBeVisible()
  await expect(page.getByTestId('immersive-wall')).toBeVisible()
  const imageArea = page.getByTestId('detail-image-area')
  const initial = await imageArea.boundingBox()
  const meta = await page.locator('.detail-info').boundingBox()
  if (info.project.name === 'desktop')
    expect(initial!.x + initial!.width).toBeLessThanOrEqual(meta!.x + 1)
  else expect(initial!.y + initial!.height).toBeLessThanOrEqual(meta!.y + 1)
  await page.getByRole('button', { name: '收起照片信息' }).click()
  await expect(page.locator('.detail-info')).toHaveCount(0)
  await expect
    .poll(async () => {
      const next = await imageArea.boundingBox()
      return info.project.name === 'desktop' ? next!.width : next!.height
    })
    .toBeGreaterThan((info.project.name === 'desktop' ? initial!.width : initial!.height) + 40)
  await page.getByRole('button', { name: '展开照片信息' }).click()
  await expect(page.locator('.detail-info')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('photo-detail')).toHaveCount(0)
  expect(errors).toEqual([])
})
test('flat detail restores focus and cannot tab out of its dialog', async ({ page }) => {
  await page.goto('/')
  const trigger = page.locator('.photo-tile').first()
  await trigger.click()
  await expect(page.getByTestId('photo-detail')).toBeVisible()
  await expect(page.getByRole('button', { name: '关闭照片详情' })).toBeFocused()
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab')
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
      .toBe(true)
  }
  await page.getByRole('button', { name: '关闭照片详情' }).click()
  await expect(page.getByTestId('photo-detail')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
test('filters and system/light/dark themes persist without horizontal overflow', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: '显示设置' }).click()
  await page.getByRole('radio', { name: '明亮', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: '显示设置' }).click()
  await page.getByRole('radio', { name: '深色', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '筛选照片' }).click()
  await page.getByRole('combobox', { name: '照片比例', exact: true }).click()
  await page.getByRole('option', { name: '竖幅', exact: true }).click()
  await expect(page.locator('.photo-tile')).toHaveCount(8)
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索照片', exact: true }).fill('不会出现的标题')
  await expect(page.getByText('这里还没有照片', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await expect.poll(() => page.locator('.photo-tile').count()).toBeGreaterThanOrEqual(24)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('reduced motion keeps all modes usable; mobile touch pans the surface', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?view=sphere')
  await expect(page.getByTestId('immersive-wall')).toBeVisible()
  const tile = await centeredTile(page),
    before = await tile.getAttribute('style')
  if (info.project.name === 'mobile') {
    const session = await page.context().newCDPSession(page)
    const x = 190,
      y = 350
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= 8; i++)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + i * 12, y: y + i * 6 }],
      })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await session.detach()
  } else {
    await page.getByTestId('immersive-wall').focus()
    await page.keyboard.press('ArrowDown')
  }
  await expect.poll(() => tile.getAttribute('style')).not.toBe(before)
  const stable = await tile.getAttribute('style')
  await page.waitForTimeout(350)
  expect(await tile.getAttribute('style')).toBe(stable)
  await page.getByRole('radio', { name: '平铺模式', exact: true }).click()
  await expect(page.locator('.photo-grid')).toBeVisible()
})
