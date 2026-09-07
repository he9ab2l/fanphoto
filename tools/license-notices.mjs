import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const exec = promisify(execFile)
const { stdout } = await exec('pnpm', ['licenses', 'list', '--prod', '--json'], {
  maxBuffer: 8 * 1024 * 1024,
})
const packages = Object.values(JSON.parse(stdout)).flat()
const sections = [
  'FanPhoto third-party notices\n\nClient and server dependency notices. Backend-only codecs are not shipped to the browser.\n',
]
for (const pkg of packages.sort((a, b) => a.name.localeCompare(b.name))) {
  const root = pkg.paths[0]
  const files = (await readdir(root)).filter((name) =>
    /^(license|licence|copying|notice)([._-].*)?$/i.test(name),
  )
  const texts = []
  for (const file of files) {
    try {
      texts.push(await readFile(resolve(root, file), 'utf8'))
    } catch {
      /* a licence directory is not text */
    }
  }
  sections.push(
    `${pkg.name} ${pkg.versions.join(', ')}\nLicense: ${pkg.license}\n${pkg.author ? `Author: ${typeof pkg.author === 'string' ? pkg.author : JSON.stringify(pkg.author)}\n` : ''}${pkg.homepage || ''}\n\n${texts.join('\n\n') || 'See the package distribution and its license identifier above.'}`,
  )
}
sections.push(await readFile('apps/client/src/vendor/react-bits-license.txt', 'utf8'))
sections.push(
  'React Bits adaptations: Masonry, DomeGallery and GlassSurface, local source commit 0e69e73. Adapted for FanPhoto natural proportions, modular detail views, viewport culling, restrained curvature, and monochrome themes. Not distributed as a standalone component library.',
)
const directory = resolve('apps/client/public/licenses')
await mkdir(directory, { recursive: true })
await writeFile(
  resolve(directory, 'NOTICE.txt'),
  sections.join('\n\n----------------------------------------\n\n'),
)
console.log(`Bundled ${packages.length} dependency notices plus React Bits attribution`)
