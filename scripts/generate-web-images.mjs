import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

const root = join(import.meta.dirname, '..')
const srcDir = join(root, 'test-photo', 'scenic')
const outFile = join(root, 'apps', 'web', 'src', 'data', 'images.ts')
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'])

const files = readdirSync(srcDir)
  .filter((name) => EXTS.has(extname(name).toLowerCase()))
  .sort((a, b) => a.localeCompare(b, 'zh-CN'))

const items = files.map((name) => ({
  src: '/' + name,
  title: basename(name, extname(name)),
}))

const lines = [
  'export interface ImageItem { src: string; title: string }',
  '',
  'export const images: ImageItem[] = [',
  ...items.map((it) => `  { src: ${JSON.stringify(it.src)}, title: ${JSON.stringify(it.title)} },`),
  ']',
  '',
]

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, lines.join('\n'))
console.log('wrote images.ts with ' + items.length + ' images')
