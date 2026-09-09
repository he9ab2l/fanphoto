import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { SessionInfo } from '@fanphoto/contracts'
import type { Database } from '../core/database'
import type { Config } from '../core/config'
import { ApiError } from '../core/errors'
import { constantEqual, digest, token, verifyPassword } from '../core/security'

interface SessionRecord {
  token_hash: string
  csrf_token: string
  expires_at: number
}
export type HttpEnv = {
  Bindings: { clientIp?: string }
  Variables: { session: SessionRecord | null }
}
export class AuthService {
  readonly cookie: string
  constructor(
    readonly db: Database,
    readonly config: Config,
  ) {
    this.cookie = config.origin.startsWith('https:') ? '__Host-fanphoto' : 'fanphoto'
  }
  checkOrigin(c: Context<HttpEnv>) {
    const origin = c.req.header('origin')
    const dev =
      !this.config.production &&
      ['http://localhost:5173', 'http://127.0.0.1:5173'].includes(origin || '')
    if (
      (origin && origin !== this.config.origin && !dev) ||
      c.req.header('sec-fetch-site') === 'cross-site'
    )
      throw new ApiError(403, 'ORIGIN', '不允许跨站操作')
  }
  current(c: Context<HttpEnv>) {
    const cached = c.get('session')
    if (cached !== undefined) return cached
    const credential = getCookie(c, this.cookie)
    const found =
      credential && /^[a-f0-9]{64}$/.test(credential)
        ? this.db.get<SessionRecord>(
            'SELECT * FROM sessions WHERE token_hash=? AND expires_at>? AND credential_version=?',
            [
              digest(credential),
              Date.now(),
              digest(this.config.passwordHash + this.config.sessionSecret),
            ],
          ) || null
        : null
    c.set('session', found)
    return found
  }
  info(c: Context<HttpEnv>): SessionInfo {
    const session = this.current(c)
    return session
      ? {
          authenticated: true,
          csrfToken: session.csrf_token,
          expiresAt: new Date(session.expires_at).toISOString(),
        }
      : { authenticated: false }
  }
  guard: MiddlewareHandler<HttpEnv> = async (c, next) => {
    const session = this.current(c)
    if (!session) throw new ApiError(401, 'UNAUTHORIZED', '请先登录工作室')
    if (!['GET', 'HEAD'].includes(c.req.method)) {
      this.checkOrigin(c)
      if (!constantEqual(session.csrf_token, c.req.header('x-csrf-token') || ''))
        throw new ApiError(403, 'CSRF', '会话校验失败，请刷新页面')
    }
    await next()
  }
  async login(c: Context<HttpEnv>, password: string) {
    this.checkOrigin(c)
    if (!this.config.passwordHash || this.config.sessionSecret.length < 32)
      throw new ApiError(503, 'SETUP_REQUIRED', '请先在服务器运行 pnpm setup')
    const now = Date.now(),
      key = digest(this.config.sessionSecret + (c.env?.clientIp || 'unknown'))
    this.db.run('DELETE FROM auth_attempts WHERE expires_at<?', [now])
    this.db.run(
      'INSERT INTO auth_attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1',
      [key, now + 900000],
    )
    if (
      this.db.get<{ attempts: number }>('SELECT attempts FROM auth_attempts WHERE key=?', [key])!
        .attempts > 8
    ) {
      c.header('Retry-After', '900')
      throw new ApiError(429, 'RATE_LIMIT', '尝试过于频繁，请 15 分钟后重试')
    }
    if (!(await verifyPassword(password, this.config.passwordHash)))
      throw new ApiError(401, 'INVALID_PASSWORD', '密码不正确')
    const credential = token(),
      csrf = token(),
      expires = now + 7 * 86400000
    this.db.transaction(() => {
      this.db.run('DELETE FROM auth_attempts WHERE key=?', [key])
      this.db.run('DELETE FROM sessions WHERE expires_at<?', [now])
      this.db.run('INSERT INTO sessions VALUES (?,?,?,?)', [
        digest(credential),
        csrf,
        digest(this.config.passwordHash + this.config.sessionSecret),
        expires,
      ])
    })
    setCookie(c, this.cookie, credential, {
      httpOnly: true,
      secure: this.config.origin.startsWith('https:'),
      sameSite: 'Lax',
      path: '/',
      maxAge: 7 * 86400,
    })
    return { authenticated: true, csrfToken: csrf, expiresAt: new Date(expires).toISOString() }
  }
  logout(c: Context<HttpEnv>) {
    this.db.run('DELETE FROM sessions WHERE token_hash=?', [this.current(c)!.token_hash])
    deleteCookie(c, this.cookie, { path: '/', secure: this.config.origin.startsWith('https:') })
  }
}
