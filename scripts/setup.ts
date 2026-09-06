import { parseArgs } from 'node:util'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { hashPassword, randomToken } from '../apps/api/src/crypto'
const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: '.' },
    origin: { type: 'string', default: 'http://localhost:8787' },
  },
})
const directory = resolve(values.dir!),
  origin = new URL(values.origin!).origin
if (!/^https?:/.test(origin)) throw new Error('Expected an HTTP(S) origin')
await mkdir(directory, { recursive: true, mode: 0o700 })
const config = resolve(directory, '.env')
if (
  await access(config)
    .then(() => true)
    .catch(() => false)
)
  throw new Error('Config already exists; refusing to replace credentials')
const password = randomToken(16)
await writeFile(
  config,
  `APP_ORIGIN=${origin}\nADMIN_PASSWORD_HASH='${await hashPassword(password)}'\nSESSION_SECRET=${randomToken()}\nFANPHOTO_DATA_DIR=${resolve(directory, 'data')}\nHOST=127.0.0.1\nPORT=8787\n`,
  { mode: 0o600, flag: 'wx' },
)
await writeFile(
  resolve(directory, 'admin-credentials.txt'),
  `Fanphoto administrator\nURL: ${origin}/admin/login\nPassword: ${password}\n\nKeep this file private. Do not commit or paste it into logs.\n`,
  { mode: 0o600, flag: 'wx' },
)
console.log(
  `Configuration created: ${config}. Password saved privately to admin-credentials.txt (not printed).`,
)
