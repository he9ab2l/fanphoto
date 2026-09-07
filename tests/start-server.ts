import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { passwordHash, token } from '../apps/server/src/core/security'
import { configuration } from '../apps/server/src/core/config'
import { createServices } from '../apps/server/src/services'
import { fixture, testPassword } from './helpers'

const directory = await mkdtemp(join(tmpdir(), 'fanphoto-browser-'))
process.once('exit', () => rmSync(directory, { recursive: true, force: true }))
process.env.FANPHOTO_ROOT = resolve('.')
process.env.FANPHOTO_DATA_DIR = directory
process.env.FANPHOTO_ENV_FILE = join(directory, 'unused.env')
process.env.ADMIN_PASSWORD_HASH = await passwordHash(testPassword)
process.env.SESSION_SECRET = token()
process.env.APP_ORIGIN = 'http://127.0.0.1:8791'
process.env.HOST = '127.0.0.1'
process.env.PORT = '8791'
process.env.NODE_ENV = 'test'
const services = await createServices(configuration())
for (let index = 0; index < 32; index++) {
  const shapes = [
    [1000 + index, 700],
    [650, 1000 + index],
    [800 + index, 800 + index],
    [2200 + index, 550],
  ]
  const [width, height] = shapes[index % 4]
  await services.ingest.import(await fixture(width, height), `synthetic-${index}.jpg`, {
    clientId: crypto.randomUUID(),
    title: `测试风景 ${String(index + 1).padStart(2, '0')}`,
    tags: ['测试素材'],
    description: '自动化测试合成照片，不用于真实展示图库。',
  })
}
services.db.close()
await mkdir('artifacts', { recursive: true })
await writeFile('artifacts/browser-upload-desktop.jpg', await fixture(1601, 1001))
await writeFile('artifacts/browser-upload-mobile.jpg', await fixture(1602, 1002))
await import('../apps/server/src/index')
