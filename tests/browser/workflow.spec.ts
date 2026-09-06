import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
const login = async (page: Page) => {
  await page.goto('/admin/login')
  await page.getByLabel('管理员密码').fill('fanphoto-browser-test-only')
  await page.getByRole('button', { name: '进入', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
}
test('creator workflow: upload, album, editing, privacy, trash and public viewing', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const title = `Browser ${info.project.name}`,
    albumTitle = `Collection ${info.project.name}`
  await login(page)
  await page.goto('/admin/albums')
  await page.getByRole('button', { name: '新建相册', exact: true }).click()
  await page.getByLabel('名称', { exact: true }).fill(albumTitle)
  await page.getByRole('button', { name: '保存相册', exact: true }).click()
  await expect(page.getByRole('heading', { name: albumTitle })).toBeVisible()
  await page.goto('/admin/upload')
  await page.getByRole('combobox', { name: '相册', exact: true }).selectOption({ label: albumTitle })
  const uploaded = page.waitForResponse(
    (r) => r.url().endsWith('/api/photos/upload') && r.request().method() === 'POST',
  )
  await page
    .getByLabel('选择上传照片', { exact: true })
    .setInputFiles({
      name: `${title}.jpg`,
      mimeType: 'image/jpeg',
      buffer: await readFile('test-photo/scenic/photo-001.jpg'),
    })
  const response = await uploaded
  expect(response.status(), await response.text()).toBe(201)
  const photo = (await response.json()).photo
  await expect(page.locator('.upload-row.done')).toHaveCount(1)
  await page.goto(`/admin/photos?edit=${photo.id}`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('标题', { exact: true }).fill(`${title} edited`)
  await page.getByLabel('描述', { exact: true }).fill('Browser verified photograph')
  await page.getByLabel('标签', { exact: true }).fill('browser, verified')
  await page.getByLabel('纬度', { exact: true }).fill('35.2')
  await page.getByLabel('经度', { exact: true }).fill('110.4')
  await page.getByLabel('地点', { exact: true }).fill('Test location')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto(`/?q=${encodeURIComponent(title)}`)
  await expect(page.locator('.photo-card')).toHaveCount(1)
  await page.locator('.photo-card a').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.viewer-image.loaded')).toBeVisible()
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await expect(page.locator('.zoom-label')).toHaveText('150%')
  await page.getByRole('button', { name: '重置缩放', exact: true }).click()
  if (!(await page.locator('.photo-info').isVisible()))
    await page.getByRole('button', { name: '照片信息', exact: true }).click()
  await expect(page.locator('.photo-info')).toContainText('Browser verified photograph')
  await expect(page.getByRole('img', { name: '亮度直方图' })).toBeVisible()
  await page.screenshot({ path: `artifacts/${info.project.name}-viewer.png` })
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto('/albums')
  await page.getByRole('heading', { name: albumTitle }).click()
  await expect(page.locator('.photo-card')).toHaveCount(1)
  await page.goto('/map')
  await expect(page.getByRole('button', { name: new RegExp(`${title} edited`) })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(`${title} edited`) }).click()
  await expect(page.locator('.map-preview')).toBeVisible()
  await page.goto('/admin/settings')
  await page.getByRole('switch', { name: '公开拍摄位置', exact: false }).uncheck()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('设置已保存', { exact: true })).toBeVisible()
  const hidden = await page.request.get(`/api/photos/${photo.id}`)
  expect((await hidden.json()).photo.latitude).toBeNull()
  await page.getByRole('switch', { name: '公开拍摄位置', exact: false }).check()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.goto('/admin/photos')
  await page.getByLabel('搜索照片库').fill(title)
  await expect(page.locator('.manage-photo')).toHaveCount(1)
  await page.getByRole('checkbox', { name: `选择 ${title} edited` }).check()
  await page.getByRole('button', { name: '移入回收站', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '移入回收站', exact: true }).click()
  await expect(page.locator('.manage-photo')).toHaveCount(0)
  expect((await page.request.get(`/api/photos/${photo.id}`)).status()).toBe(404)
  await page.goto('/admin/trash')
  await page.getByLabel('搜索照片库').fill(title)
  await page.getByRole('checkbox', { name: `选择 ${title} edited` }).check()
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await expect(page.locator('.manage-photo')).toHaveCount(0)
  expect((await page.request.get(`/api/photos/${photo.id}`)).status()).toBe(200)
  await page.goto('/admin')
  await page.screenshot({ path: `artifacts/${info.project.name}-studio.png`, fullPage: true })
  expect(errors).toEqual([])
})
test('gallery and canvas are responsive, keyboard-accessible and error-free', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('.photo-card').first()).toBeVisible()
  await expect(page.locator('.photo-card img').first()).toHaveJSProperty('complete', true)
  expect(
    await page
      .locator('.photo-card img')
      .first()
      .evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true)
  await page.screenshot({ path: `artifacts/${info.project.name}-gallery.png`, fullPage: false })
  await page.getByRole('link', { name: '无限照片墙', exact: true }).click()
  await expect(page.locator('.wall-tile').first()).toBeVisible()
  const start = await page
    .locator('.wall-tile')
    .first()
    .evaluate((node) => node.style.transform)
  await page.locator('.wall-stage').focus()
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(() =>
      page
        .locator('.wall-tile')
        .first()
        .evaluate((node) => node.style.transform),
    )
    .not.toBe(start)
  await page.getByRole('button', { name: '聚光效果', exact: true }).click()
  await expect(page.locator('.wall-shade')).toHaveClass(/enabled/)
  await page.getByRole('button', { name: '放大照片墙', exact: true }).click()
  await expect(page.locator('.wall-controls .zoom-label')).toHaveText('115%')
  await page.getByRole('button', { name: '重置照片墙', exact: true }).click()
  await expect(page.locator('.wall-controls .zoom-label')).toHaveText('100%')
  await page.screenshot({ path: `artifacts/${info.project.name}-wall.png` })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true)
  await page.goto('/about')
  await expect(page.locator('.about-card')).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true)
  expect(errors).toEqual([])
})
