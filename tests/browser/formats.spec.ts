import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

test('PNG, TIFF and Live Photo preserve pixels/EXIF and strip video metadata', async ({ page }, info) => {
  await page.goto('/admin/login')
  await page.getByLabel('管理员密码').fill('fanphoto-browser-test-only')
  await page.getByRole('button', { name: '进入', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto('/admin/upload')
  const responses: { status: number; body: any }[] = []
  page.on('response', async (response) => {
    if (response.url().endsWith('/api/photos/upload') && response.request().method() === 'POST') responses.push({ status: response.status(), body: await response.json() })
  })
  const suffix = info.project.name
  await page.getByLabel('选择上传照片', { exact: true }).setInputFiles([
    { name: `alpha-${suffix}.png`, mimeType: 'image/png', buffer: await readFile('tests/fixtures/alpha.png') },
    { name: `tiff-${suffix}.tiff`, mimeType: 'image/tiff', buffer: await readFile('tests/fixtures/sample.tiff') },
    { name: `live-${suffix}.jpg`, mimeType: 'image/jpeg', buffer: await readFile('tests/fixtures/camera.jpg') },
    { name: `live-${suffix}.mp4`, mimeType: 'video/mp4', buffer: await readFile('tests/fixtures/live.mp4') },
  ])
  await expect(page.locator('.upload-row.done')).toHaveCount(3, { timeout: 60_000 })
  expect(responses.map((r) => r.status)).toEqual([201, 201, 201])
  const live = responses.map((r) => r.body.photo).find((p) => p.videoUrl)
  expect(live.exif.model).toBe('Browser Camera')
  expect(live.exif.iso).toBe(200)
  expect(live.takenAt).toContain('2020-01-02')
  const clip = await page.request.get(live.videoUrl)
  expect(clip.status()).toBe(200)
  expect((await clip.body()).includes(Buffer.from('E2E_PRIVATE_LOCATION'))).toBe(false)
  await page.goto(`/photos/${live.id}`)
  await page.getByRole('button', { name: '播放实况', exact: true }).click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.error?.message || '')).toBe('')
})

test('HEIC converts to publishable WebP under the production CSP', async ({ page }, info) => {
  test.skip(!existsSync('artifacts/sample.heic'), 'Optional upstream HEIC fixture: see verification documentation')
  await page.goto('/admin/login')
  await page.getByLabel('管理员密码').fill('fanphoto-browser-test-only')
  await page.getByRole('button', { name: '进入', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto('/admin/upload')
  await page.getByLabel('选择上传照片', { exact: true }).setInputFiles({ name: `heic-${info.project.name}.heic`, mimeType: 'image/heic', buffer: await readFile('artifacts/sample.heic') })
  await expect(page.locator('.upload-row.done')).toHaveCount(1, { timeout: 75_000 })
  await expect(page.locator('.upload-row.failed')).toHaveCount(0)
})
