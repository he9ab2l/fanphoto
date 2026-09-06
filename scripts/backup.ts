import { backup } from 'node:sqlite'
import { mkdir, cp, chmod } from 'node:fs/promises'
import { resolve } from 'node:path'
import { LocalDatabase } from '../apps/api/src/local'
import { dataDirectory } from '../apps/api/src/config'
const destination = resolve(
  dataDirectory,
  'backups',
  new Date().toISOString().replace(/[:.]/g, '-'),
)
await mkdir(destination, { recursive: true, mode: 0o700 })
const db = new LocalDatabase(resolve(dataDirectory, 'fanphoto.sqlite'))
await backup(db.native, resolve(destination, 'fanphoto.sqlite'))
db.close()
await chmod(resolve(destination, 'fanphoto.sqlite'), 0o600)
await cp(resolve(dataDirectory, 'media'), resolve(destination, 'media'), {
  recursive: true,
  errorOnExist: true,
  force: false,
})
console.log(`Consistent database and media backup saved: ${destination}`)
