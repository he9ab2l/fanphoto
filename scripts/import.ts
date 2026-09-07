import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve, sep } from 'node:path'
import { configuration } from '../apps/server/src/core/config'
import { createServices } from '../apps/server/src/services'
import type { Attribution } from '../packages/contracts/src'

const args = process.argv.slice(2)
const at = args.indexOf('--directory')
const directory = resolve(at >= 0 ? args[at + 1] : 'test-photo/commons-landscapes')
interface Entry {
  file: string
  title?: string
  description?: string
  group?: string
  author?: string
  sourcePage?: string
  license?: string
  licenseUrl?: string
  sha256?: string
}
let entries: Entry[]
try {
  entries = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8')).photos
} catch {
  entries = (await readdir(directory, { withFileTypes: true }))
    .filter(
      (entry) => entry.isFile() && /\.(jpe?g|png|webp|avif|heic|heif|tiff?)$/i.test(entry.name),
    )
    .map((entry) => ({ file: entry.name }))
}
const services = await createServices(configuration())
let imported = 0,
  duplicated = 0,
  failed = 0
try {
  for (const entry of entries) {
    try {
      const path = resolve(directory, entry.file)
      if (!path.startsWith(directory + sep)) throw new Error('文件路径越界')
      const bytes = await readFile(path)
      if (entry.sha256) {
        const { sha256 } = await import('../apps/server/src/modules/media/processor')
        if (sha256(bytes) !== entry.sha256) throw new Error('原文件校验和不匹配')
      }
      const attribution: Attribution | null = entry.sourcePage
        ? {
            author: entry.author || '',
            sourceUrl: entry.sourcePage,
            license: entry.license || '',
            licenseUrl: entry.licenseUrl || '',
          }
        : null
      const groups: Record<string, string> = {
        landscape: '横幅',
        portrait: '竖幅',
        square: '方图',
        panorama: '全景',
      }
      const result = await services.ingest.import(bytes, entry.file, {
        clientId: randomUUID(),
        title: entry.title?.slice(0, 160),
        description: entry.description || '',
        tags: entry.group ? ['风景', groups[entry.group]] : [],
        attribution,
      })
      if (result.duplicate) duplicated++
      else imported++
      console.log(
        `${result.duplicate ? '已存在' : '已导入'} ${result.photo.id} ${result.photo.title}`,
      )
    } catch (error) {
      failed++
      console.error(`导入失败 ${entry.file}: ${(error as Error).message}`)
    }
  }
} finally {
  services.db.close()
}
console.log(JSON.stringify({ imported, duplicated, failed }))
if (failed) process.exitCode = 1
