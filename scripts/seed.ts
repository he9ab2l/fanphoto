import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { LocalDatabase, LocalStore } from '../apps/api/src/local'
import { dataDirectory, rootDirectory } from '../apps/api/src/config'
import { digest } from '../apps/api/src/crypto'
const { values } = parseArgs({
  options: { source: { type: 'string', default: resolve(rootDirectory, 'artifacts/seed-media') } },
})
interface Seed {
  id: string
  clientId: string
  title: string
  sourceName: string
  width: number
  height: number
  album: number
  featured: boolean
  tags: string[]
  analysis: unknown
}
const source = resolve(values.source!),
  records = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8')) as Seed[]
const db = new LocalDatabase(resolve(dataDirectory, 'fanphoto.sqlite')),
  store = new LocalStore(resolve(dataDirectory, 'media'))
await db.migrate(resolve(rootDirectory, 'apps/api/migrations'))
if (
  (await db.prepare('SELECT count(*) AS n FROM photos WHERE is_demo=0').first<{ n: number }>())?.n
)
  throw new Error('Database already contains real uploads. Refusing to add demo data.')
const albums = ['沿途', '留白', '光的形状']
await db.batch(
  albums.map((title, index) =>
    db
      .prepare(
        'INSERT OR IGNORE INTO albums (id,title,description,created_at,updated_at) VALUES (?,?,?,?,?)',
      )
      .bind(`demo-album-${index}`, title, '仓库演示照片', Date.now(), Date.now()),
  ),
)
let added = 0
for (const record of records) {
  if (await db.prepare('SELECT id FROM photos WHERE client_id=?').bind(record.clientId).first())
    continue
  const keys = [
    `originals/${record.id}.webp`,
    ...['sm', 'md', 'lg'].map((variant) => `thumbs/${record.id}/${variant}.webp`),
  ]
  let total = 0,
    hash = ''
  const written: string[] = []
  try {
    for (const key of keys) {
      const buffer = await readFile(resolve(source, key)),
        bytes = new Uint8Array(buffer).buffer
      total += buffer.byteLength
      if (!hash) hash = await digest(bytes)
      await store.put(key, bytes)
      written.push(key)
    }
    const now = Date.now()
    await db.batch([
      db
        .prepare(
          'INSERT INTO photos (id,client_id,title,description,width,height,exif,tags,featured,published,analysis,bytes,content_hash,source_name,is_demo,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          record.id,
          record.clientId,
          record.title,
          '演示素材，来自仓库测试图片。无虚构 EXIF 或 GPS。',
          record.width,
          record.height,
          '{}',
          JSON.stringify(record.tags),
          Number(record.featured),
          1,
          JSON.stringify(record.analysis),
          total,
          hash,
          record.sourceName,
          1,
          now,
          now,
        ),
      db
        .prepare('INSERT INTO album_photos VALUES (?,?)')
        .bind(`demo-album-${record.album}`, record.id),
    ])
    added++
  } catch (error) {
    await store.delete(written)
    throw error
  }
}
db.close()
console.log(
  `Demo seed complete: ${added} added, ${records.length - added} already present. No fabricated location or camera metadata.`,
)
