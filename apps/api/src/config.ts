import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
export const rootDirectory = resolve(
  process.env.FANPHOTO_ROOT || fileURLToPath(new URL('../../../', import.meta.url)),
)
const envPath = process.env.FANPHOTO_ENV_FILE || resolve(rootDirectory, '.env')
if (existsSync(envPath)) process.loadEnvFile(envPath)
export const dataDirectory = resolve(
  process.env.FANPHOTO_DATA_DIR || resolve(rootDirectory, 'data'),
)
