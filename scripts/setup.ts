import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { passwordHash } from '../apps/server/src/core/security'

const root = resolve(process.env.FANPHOTO_SETUP_DIR || '.')
await mkdir(root, { recursive: true, mode: 0o700 })
const password = randomBytes(21).toString('base64url')
const origin = process.env.APP_ORIGIN || 'http://localhost:5173'
new URL(origin)
const data = resolve(root, 'data')
const env =
  [
    `APP_ORIGIN=${origin}`,
    `ADMIN_PASSWORD_HASH=${await passwordHash(password)}`,
    `SESSION_SECRET=${randomBytes(32).toString('hex')}`,
    `FANPHOTO_DATA_DIR=${data}`,
    'HOST=127.0.0.1',
    'PORT=8787',
  ].join('\n') + '\n'
await writeFile(resolve(root, '.env'), env, { flag: 'wx', mode: 0o600 })
await writeFile(
  resolve(root, 'admin-credentials.txt'),
  `FanPhoto 工作室\n地址：${origin}/studio\n密码：${password}\n`,
  { flag: 'wx', mode: 0o600 },
)
await mkdir(data, { recursive: true, mode: 0o700 })
console.log('初始化完成。管理员密码保存在 admin-credentials.txt（0600），未输出到日志。')
