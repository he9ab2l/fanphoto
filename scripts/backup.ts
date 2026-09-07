import { backup } from 'node:sqlite'
import { mkdir, cp, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { configuration } from '../apps/server/src/core/config'
import { Database } from '../apps/server/src/core/database'

const config = configuration()
const directory = resolve(config.data, 'backups', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(directory, { recursive: true, mode: 0o700 })
const db = new Database(resolve(config.data, 'library.sqlite'))
try {
  await backup(db.connection, resolve(directory, 'library.sqlite'))
  await cp(resolve(config.data, 'media'), resolve(directory, 'media'), {
    recursive: true,
    errorOnExist: true,
  })
  await writeFile(
    resolve(directory, 'manifest.json'),
    JSON.stringify(
      {
        version: 1,
        createdAt: new Date().toISOString(),
        photos: db.get<{ n: number }>('SELECT count(*) n FROM photos')!.n,
        assets: db.get<{ n: number }>('SELECT count(*) n FROM assets')!.n,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )
} finally {
  db.close()
}
console.log(`备份完成：${directory}。发布备份应在暂停写入后执行，以保证媒体与数据库一致。`)
