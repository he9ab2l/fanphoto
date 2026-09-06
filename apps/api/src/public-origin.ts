import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
/** Only a local operator/tunnel wrapper may write this file; never derived from request headers. */
export function developmentOrigin(directory: string, fallback: string) {
  let current = fallback, checkedAt = 0
  return async () => {
    if (Date.now() - checkedAt < 1000) return current
    checkedAt = Date.now()
    try {
      const value = (await readFile(resolve(directory, 'public-origin'), 'utf8')).trim()
      if (value.length > 512) return current
      const url = new URL(value)
      if (url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) current = url.origin
    } catch { /* A fixed APP_ORIGIN remains valid when no temporary ingress is configured. */ }
    return current
  }
}
