import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
export interface Config {
  root: string
  data: string
  origin: string
  passwordHash: string
  sessionSecret: string
  host: string
  port: number
  production: boolean
  trustProxy: boolean
}
export function configuration(): Config {
  const root = resolve(process.env.FANPHOTO_ROOT || '.')
  const envFile = process.env.FANPHOTO_ENV_FILE || resolve(root, '.env')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  return {
    root,
    data: resolve(process.env.FANPHOTO_DATA_DIR || resolve(root, 'data')),
    origin: new URL(process.env.APP_ORIGIN || 'http://localhost:5173').origin,
    passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
    sessionSecret: process.env.SESSION_SECRET || '',
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 8787),
    production: process.env.NODE_ENV === 'production',
    trustProxy: process.env.TRUST_LOCAL_PROXY === 'true',
  }
}
