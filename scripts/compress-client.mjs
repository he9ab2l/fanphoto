import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { brotliCompress, gzip, constants } from 'node:zlib'

const br = promisify(brotliCompress),
  gz = promisify(gzip)
export async function compressClient(directory = 'apps/client/dist') {
  let count = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      count += await compressClient(path)
      continue
    }
    if (!entry.isFile() || !/\.(?:js|css|html|svg|json|txt)$/.test(entry.name)) continue
    const source = await readFile(path)
    if (source.length < 512) continue
    const outputs = await Promise.all([
      br(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }),
      gz(source, { level: 9 }),
    ])
    for (const [index, suffix] of ['br', 'gz'].entries())
      if (outputs[index].length < source.length)
        await writeFile(`${path}.${suffix}`, outputs[index])
    count++
  }
  return count
}
