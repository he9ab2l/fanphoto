/**
 * Download freely licensed Commons featured landscapes, preserving original
 * bytes and attribution. No EXIF is created or copied into an image.
 *
 * node tools/download-landscapes.mjs
 * Generated originals and the evidence manifest stay in gitignored test-photo/.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, stat, rename, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const exec = promisify(execFile)
const directory = resolve('test-photo/commons-landscapes')
const cachePath = resolve(directory, 'catalog.json')
const manifestPath = resolve(directory, 'manifest.json')
const quotas = { landscape: 26, portrait: 14, square: 12, panorama: 18 }
const agent =
  'FanPhoto-TestGallery/2.0 (personal open-source photo gallery; Wikimedia Commons attribution preserved)'

function plain(value = '') {
  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

function group(width, height) {
  const ratio = width / height
  if (ratio < 0.85) return 'portrait'
  if (ratio >= 0.92 && ratio <= 1.08) return 'square'
  if (ratio >= 2.4) return 'panorama'
  if (ratio > 1.15) return 'landscape'
  return null
}

function candidate(page) {
  const info = page.imageinfo?.[0]
  if (!info || !/\.jpe?g(?:\?|$)/i.test(info.url)) return null
  if (info.size > 40 * 1024 * 1024 || info.width * info.height > 80_000_000) return null
  if (Math.max(info.width, info.height) < 2400 || Math.min(info.width, info.height) < 1000)
    return null
  const bucket = group(info.width, info.height)
  if (!bucket) return null
  const ext = info.extmetadata || {}
  const license = plain(ext.LicenseShortName?.value)
  if (!/^(CC BY|CC0|Public domain)/i.test(license)) return null
  const metadata = Object.fromEntries((info.metadata || []).map((item) => [item.name, item.value]))
  const keys = [
    'Make',
    'Model',
    'DateTimeOriginal',
    'ExposureTime',
    'FNumber',
    'ISOSpeedRatings',
    'FocalLength',
  ]
  const fields = keys.filter((key) => metadata[key] !== undefined)
  // Prefer genuine camera-bearing originals; do not invent absent fields.
  if (!metadata.Model || fields.length < 4) return null
  const lens = metadata.LensModel || metadata.Lens
  const sourceUrl = new URL(info.url)
  sourceUrl.search = ''
  return {
    commonsId: page.pageid,
    title:
      plain(ext.ObjectName?.value) || page.title.replace(/^File:/, '').replace(/\.jpe?g$/i, ''),
    description: plain(ext.ImageDescription?.value).slice(0, 2400),
    file: `${bucket}-${page.pageid}.jpg`,
    group: bucket,
    width: info.width,
    height: info.height,
    bytes: info.size,
    url: sourceUrl.href,
    sourcePage: info.descriptionurl,
    author: plain(ext.Artist?.value) || plain(ext.Credit?.value),
    license,
    licenseUrl: ext.LicenseUrl?.value || '',
    metadataFields: [...fields, ...(lens ? ['Lens'] : [])],
    score: fields.length + (lens ? 2 : 0) + (metadata.GPSLatitude !== undefined ? 1 : 0),
    evidence: { metadata, extmetadata: ext },
  }
}

async function json(url) {
  const { stdout } = await exec(
    'curl',
    [
      '-fLsS',
      '--max-time',
      '45',
      '--retry',
      '2',
      '--retry-delay',
      '2',
      '--retry-max-time',
      '90',
      '-A',
      agent,
      url,
    ],
    { maxBuffer: 20 * 1024 * 1024, timeout: 120_000 },
  )
  return JSON.parse(stdout)
}

await mkdir(directory, { recursive: true })
let catalog
try {
  catalog = JSON.parse(await readFile(cachePath, 'utf8'))
} catch {
  catalog = []
}

if (!catalog.length) {
  const seen = new Map(catalog.map((item) => [item.commonsId, item]))
  let continuation
  for (let page = 0; page < 18; page++) {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: 'Category:Featured pictures of landscapes',
      gcmtype: 'file',
      gcmlimit: '50',
      prop: 'imageinfo',
      iiprop: 'url|size|extmetadata|metadata',
      format: 'json',
      ...(continuation || {}),
    })
    const response = await json(`https://commons.wikimedia.org/w/api.php?${params}`)
    if (response.error) throw new Error(response.error.info)
    for (const item of Object.values(response.query?.pages || {})) {
      const entry = candidate(item)
      if (entry) seen.set(entry.commonsId, entry)
    }
    catalog = [...seen.values()]
    await writeFile(cachePath, JSON.stringify(catalog, null, 2))
    console.log(
      'Catalog',
      page + 1,
      Object.fromEntries(
        Object.keys(quotas).map((key) => [key, catalog.filter((p) => p.group === key).length]),
      ),
    )
    if (
      Object.entries(quotas).every(
        ([key, count]) => catalog.filter((p) => p.group === key).length >= count * 2,
      )
    )
      break
    continuation = response.continue
    if (!continuation) break
  }
}

if (catalog.filter((p) => p.group === 'square').length < quotas.square * 2) {
  const seen = new Map(catalog.map((item) => [item.commonsId, item]))
  const searches = [
    'landscape filewidth:3000 fileheight:3000',
    'landscape filewidth:4000 fileheight:4000',
    'mountain filewidth:>2400 fileheight:>2400 "square"',
    'sunset filewidth:>2400 fileheight:>2400 "square"',
    'forest filewidth:>2400 fileheight:>2400 "square"',
    'waterfall filewidth:>2400 fileheight:>2400 "square"',
    'landscape filewidth:>2400 fileheight:>2400 Hasselblad',
  ]
  for (const query of searches) {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: '6',
      gsrlimit: '50',
      prop: 'imageinfo',
      iiprop: 'url|size|extmetadata|metadata',
      format: 'json',
    })
    const response = await json(`https://commons.wikimedia.org/w/api.php?${params}`)
    for (const page of Object.values(response.query?.pages || {})) {
      const item = candidate(page)
      if (item && item.group === 'square') seen.set(item.commonsId, item)
    }
    catalog = [...seen.values()]
    await writeFile(cachePath, JSON.stringify(catalog, null, 2))
    console.log('Square originals found:', catalog.filter((p) => p.group === 'square').length)
  }
  for (const category of ['Featured pictures of waterfalls', 'Featured pictures of lakes']) {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: `Category:${category}`,
      gcmtype: 'file',
      gcmlimit: '50',
      prop: 'imageinfo',
      iiprop: 'url|size|extmetadata|metadata',
      format: 'json',
    })
    const response = await json(`https://commons.wikimedia.org/w/api.php?${params}`)
    for (const page of Object.values(response.query?.pages || {})) {
      const item = candidate(page)
      if (item) seen.set(item.commonsId, item)
    }
    catalog = [...seen.values()]
    await writeFile(cachePath, JSON.stringify(catalog, null, 2))
  }
}

const selected = []
// Incremental: keep already-downloaded originals and only fetch missing quota.
let downloaded = new Set()
try {
  const existingManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  downloaded = new Set(existingManifest.photos.map((photo) => photo.commonsId))
  selected.push(...existingManifest.photos)
} catch {}
// Curated scenery titles, not the birds/product shots that full-text "landscape"
// searches can also return. Their unmodified originals still need byte checks.
const squareScenery = [
  163913490, 74740142, 30697623, 105247326, 122593232, 195972085, 195972087, 84886509, 85063306,
  148879898, 148879900, 171380820,
]
const groupOptions = (bucket) =>
  catalog
    .filter((p) => p.group === bucket && !downloaded.has(p.commonsId))
    .sort((a, b) =>
      bucket === 'square'
        ? (() => {
            const ia = squareScenery.indexOf(a.commonsId)
            const ib = squareScenery.indexOf(b.commonsId)
            if (ia !== -1 && ib !== -1) return ia - ib
            if (ia !== -1) return -1
            if (ib !== -1) return 1
            return b.score - a.score || a.bytes - b.bytes
          })()
        : b.score - a.score || a.bytes - b.bytes,
    )
for (const [bucket, quota] of Object.entries(quotas)) {
  const wanted = quota - selected.filter((p) => p.group === bucket).length
  const options = groupOptions(bucket)
  let count = 0
  const authors = new Map()
  for (const item of options) {
    if (count >= wanted) break
    // Older albums may repeat an author; cap each author across a bucket.
    if (bucket !== 'square' && (authors.get(item.author) || 0) >= 3) continue
    const target = resolve(directory, item.file)
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      const existing = await stat(target).catch(() => null)
      if (existing?.size !== item.bytes) {
        const temporary = `${target}.part`
        let fetched = false
        let lastError = ''
        for (let attempt = 0; attempt < 6 && !fetched; attempt++) {
          try {
            // No --retry: on this environment curl's retry path swallows the
            // exit code (429 fails with exit 0 and no file), so let each HTTP
            // failure surface as a non-zero exit and back off here instead.
            await exec(
              'curl',
              [
                '-fLsS',
                '--max-time',
                '90',
                '-A',
                agent,
                item.url,
                '-o',
                temporary,
              ],
              { maxBuffer: 1024 * 1024, timeout: 120_000 },
            )
            const size = (await stat(temporary)).size
            if (size !== item.bytes) throw new Error(`Original size mismatch: ${size} != ${item.bytes}`)
            fetched = true
          } catch (error) {
            const message = String(error?.message || error)
            if (!/429|too many|retry later|temporarily|ENOENT/i.test(message)) throw error
            lastError = message
            const wait = 20 * 2 ** attempt + Math.floor(Math.random() * 10)
            console.error(
              `Rate limited/transient (${message.slice(0, 60)}), retrying ${item.commonsId} in ${wait}s (attempt ${attempt + 1}/6)`,
            )
            await new Promise((resolve) => setTimeout(resolve, wait * 1000))
          }
        }
        if (!fetched) throw new Error(`Download failed after retries: ${lastError}`)
        await rename(temporary, target)
      }
      const bytes = await readFile(target)
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Not a JPEG original')
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      selected.push({ ...item, sha256 })
      count++
      authors.set(item.author, (authors.get(item.author) || 0) + 1)
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            source: 'Wikimedia Commons / Featured pictures of landscapes',
            downloadedAt: new Date().toISOString(),
            originalBytesPreserved: true,
            syntheticExif: false,
            quotas,
            photos: selected,
          },
          null,
          2,
        ),
      )
      console.log(
        `Downloaded ${bucket} ${count}/${wanted}: ${item.title} (${item.width}×${item.height}, EXIF ${item.metadataFields.length})`,
      )
    } catch (error) {
      console.error(`Skipped ${item.commonsId}: ${error.message}`)
    }
  }
  if (count < wanted) console.error(`Missing ${bucket}: ${count}/${wanted}`)
}

const counts = Object.fromEntries(
  Object.keys(quotas).map((key) => [key, selected.filter((p) => p.group === key).length]),
)
console.log('Originals downloaded:', selected.length, counts)
if (!Object.entries(quotas).every(([key, count]) => counts[key] >= count)) process.exitCode = 1
