import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
test.afterEach(async ({ request }) => {
  // This suite's webServer always uses a new /tmp/fanphoto-browser-* database.
  // Cleanup runs even if an assertion fails, isolating desktop/mobile runs.
  const login = await request.post('/api/v1/session', {
    data: { password: 'fanphoto-test-password-only' },
  })
  expect(login.ok()).toBe(true)
  const session = await login.json()
  const headers = { 'x-csrf-token': session.csrfToken, origin: 'http://127.0.0.1:8791' }
  for (const status of ['all', 'trash']) {
    const result = await (
      await request.get(`/api/v1/admin/photos?limit=80&status=${status}`)
    ).json()
    for (const photo of result.items) {
      if (!/^browser-upload-(desktop|mobile)\.jpg$/.test(photo.file.name || '')) continue
      if (!photo.deletedAt)
        expect((await request.delete(`/api/v1/admin/photos/${photo.id}`, { headers })).ok()).toBe(
          true,
        )
      expect(
        (await request.delete(`/api/v1/admin/photos/${photo.id}/permanent`, { headers })).ok(),
      ).toBe(true)
    }
  }
  const albums = await (await request.get('/api/v1/admin/albums')).json()
  for (const album of albums.items)
    if (/^旅途 (desktop|mobile)$/.test(album.title))
      expect((await request.delete(`/api/v1/admin/albums/${album.id}`, { headers })).ok()).toBe(
        true,
      )
  await request.delete('/api/v1/session', { headers })
})
test('new studio end-to-end: auth, upload, edit, album, private/public, recycle, settings and logout', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/studio')
  await page.getByLabel('管理员密码').fill('fanphoto-test-password-only')
  await page.getByRole('button', { name: '进入工作室', exact: true }).click()
  await expect(page.getByRole('heading', { name: '照片库', exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: '工作室导航' })
    .getByRole('link', { name: '相册', exact: true })
    .click()
  await page.getByRole('button', { name: '新建相册', exact: true }).first().click()
  const albumTitle = `旅途 ${info.project.name}`
  await page.getByLabel('相册名称').fill(albumTitle)
  await page.getByRole('button', { name: '保存相册', exact: true }).click()
  await expect(page.getByRole('heading', { name: albumTitle, exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: '工作室导航' })
    .getByRole('link', { name: '导入', exact: true })
    .click()
  await page.getByRole('combobox', { name: '加入相册', exact: true }).click()
  await page.getByRole('option', { name: albumTitle, exact: true }).click()
  const uploadName = `browser-upload-${info.project.name}`
  await page.getByLabel('选择照片文件').setInputFiles(resolve(`artifacts/${uploadName}.jpg`))
  await expect(page.locator('[data-upload-state="done"]')).toHaveCount(1)
  await expect(page.getByText('导入完成', { exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: '工作室导航' })
    .getByRole('link', { name: '照片库', exact: true })
    .click()
  await page.getByRole('textbox', { name: '搜索照片库', exact: true }).fill(uploadName)
  await page.getByRole('button', { name: `编辑照片：${uploadName}`, exact: true }).click()
  const photoTitle = `风景存档 ${info.project.name}`
  await page.getByLabel('标题', { exact: true }).fill(photoTitle)
  const publicToggle = page.getByRole('dialog').getByRole('switch', { name: '公开', exact: true })
  await publicToggle.click()
  await expect(publicToggle).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('textbox', { name: '搜索照片库', exact: true }).fill(photoTitle)
  await expect(
    page.getByRole('button', { name: `编辑照片：${photoTitle}`, exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '选择照片', exact: true }).click()
  await page.getByRole('checkbox', { name: `选中 ${photoTitle}`, exact: true }).check()
  await page.getByRole('button', { name: '公开所选照片', exact: true }).click()
  await page.getByRole('button', { name: '选择照片', exact: true }).click()
  await page.getByRole('checkbox', { name: `选中 ${photoTitle}`, exact: true }).check()
  await page.getByRole('button', { name: '移入回收站', exact: true }).click()
  await page.getByRole('radio', { name: '回收站', exact: true }).click()
  await page.getByRole('button', { name: '选择照片', exact: true }).click()
  await page.getByRole('checkbox', { name: `选中 ${photoTitle}`, exact: true }).check()
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await page.getByRole('radio', { name: '全部', exact: true }).click()
  await page.getByRole('button', { name: '选择照片', exact: true }).click()
  await page.getByRole('checkbox', { name: `选中 ${photoTitle}`, exact: true }).check()
  await page.getByRole('button', { name: '移入回收站', exact: true }).click()
  await page.getByRole('radio', { name: '回收站', exact: true }).click()
  await page.getByRole('button', { name: '选择照片', exact: true }).click()
  await page.getByRole('checkbox', { name: `选中 ${photoTitle}`, exact: true }).check()
  await page.getByRole('button', { name: '永久删除', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '永久删除', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await page
    .getByRole('navigation', { name: '工作室导航' })
    .getByRole('link', { name: '设置', exact: true })
    .click()
  await page.getByLabel('站点名称').fill('FanPhoto')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(page.getByText('设置已保存', { exact: true })).toBeVisible()
  const exportResponse = await page.request.get('/api/v1/admin/export')
  expect(exportResponse.ok()).toBe(true)
  expect((await exportResponse.json()).schemaVersion).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '退出工作室', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工作室', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
