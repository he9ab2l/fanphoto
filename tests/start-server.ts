import { mkdtemp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { hashPassword, randomToken } from '../apps/api/src/crypto'
const directory = await mkdtemp(join(tmpdir(), 'fanphoto-e2e-'))
process.env.FANPHOTO_DATA_DIR = directory
process.env.FANPHOTO_ENV_FILE = join(directory, 'unused.env')
process.env.FANPHOTO_ROOT = resolve('.')
process.env.ADMIN_PASSWORD_HASH = await hashPassword('fanphoto-browser-test-only')
process.env.SESSION_SECRET = randomToken()
process.env.APP_ORIGIN = 'http://127.0.0.1:8791'
process.env.PORT = '8791'
process.env.HOST = '127.0.0.1'
process.env.NODE_ENV = 'test'
if (existsSync(resolve('artifacts/seed-media/manifest.json'))) await import('../scripts/seed')
await import('../apps/api/src/node')
