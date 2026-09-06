import type { Context, Hono, MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { ApiError, readJson } from './errors'
import { digest, equal, randomToken, verifyPassword } from './crypto'
import type { ApiEnv, Session } from './types'

const cookieName = (c: Context<ApiEnv>) =>
  c.env.APP_ORIGIN.startsWith('https:') ? '__Host-fanphoto' : 'fanphoto_session'
export function checkOrigin(c: Context<ApiEnv>) {
  const origin = c.req.header('origin')
  const localDev =
    c.env.MODE === 'development' &&
    ['http://localhost:5173', 'http://127.0.0.1:5173'].includes(origin || '')
  if (
    (origin && origin !== new URL(c.env.APP_ORIGIN).origin && !localDev) ||
    c.req.header('sec-fetch-site') === 'cross-site'
  ) {
    throw new ApiError(403, 'ORIGIN', '不允许跨站请求')
  }
}
export async function session(c: Context<ApiEnv>): Promise<Session | null> {
  const cached = c.get('session')
  if (cached !== undefined) return cached
  const token = getCookie(c, cookieName(c))
  let found: Session | null = null
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    found = await c.env.DB.prepare(
      'SELECT * FROM sessions WHERE id = ? AND expires_at > ? AND credential_version = ?',
    )
      .bind(
        await digest(token),
        Date.now(),
        await digest(c.env.ADMIN_PASSWORD_HASH + c.env.SESSION_SECRET),
      )
      .first<Session>()
  }
  c.set('session', found)
  return found
}
export const requireAdmin: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const current = await session(c)
  if (!current) throw new ApiError(401, 'UNAUTHORIZED', '请先登录')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    checkOrigin(c)
    if (!equal(current.csrf_token, c.req.header('x-csrf-token') || ''))
      throw new ApiError(403, 'CSRF', '会话校验失败，请刷新后重试')
  }
  await next()
}
export function authRoutes(app: Hono<ApiEnv>) {
  app.get('/api/auth/me', async (c) => {
    const current = await session(c)
    return c.json(
      current
        ? {
            authenticated: true,
            csrfToken: current.csrf_token,
            expiresAt: new Date(current.expires_at).toISOString(),
          }
        : { authenticated: false },
    )
  })
  app.post('/api/auth/login', async (c) => {
    checkOrigin(c)
    if (!c.env.ADMIN_PASSWORD_HASH || c.env.SESSION_SECRET.length < 32)
      throw new ApiError(503, 'NOT_CONFIGURED', '管理员尚未完成初始化')
    const { password } = await readJson(
      c,
      z.object({ password: z.string().min(1).max(256) }).strict(),
    )
    const key = await digest(`${c.env.SESSION_SECRET}:${c.env.CLIENT_IP || 'unknown'}`)
    const now = Date.now()
    await c.env.DB.prepare('DELETE FROM login_attempts WHERE expires_at < ?').bind(now).run()
    await c.env.DB.prepare(
      'INSERT INTO login_attempts (key, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1',
    )
      .bind(key, now + 15 * 60_000)
      .run()
    const attempts = await c.env.DB.prepare('SELECT attempts FROM login_attempts WHERE key = ?')
      .bind(key)
      .first<{ attempts: number }>()
    if ((attempts?.attempts || 0) > 8) {
      c.header('Retry-After', '900')
      throw new ApiError(429, 'RATE_LIMIT', '尝试过于频繁，请 15 分钟后再试')
    }
    if (!(await verifyPassword(password, c.env.ADMIN_PASSWORD_HASH)))
      throw new ApiError(401, 'INVALID_PASSWORD', '密码不正确')
    const token = randomToken()
    const csrfToken = randomToken()
    const expires = now + 7 * 24 * 60 * 60_000
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key),
      c.env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
      c.env.DB.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').bind(
        await digest(token),
        csrfToken,
        await digest(c.env.ADMIN_PASSWORD_HASH + c.env.SESSION_SECRET),
        expires,
      ),
    ])
    setCookie(c, cookieName(c), token, {
      httpOnly: true,
      secure: c.env.APP_ORIGIN.startsWith('https:'),
      sameSite: 'Lax',
      path: '/',
      maxAge: 7 * 86400,
    })
    return c.json({ authenticated: true, csrfToken, expiresAt: new Date(expires).toISOString() })
  })
  app.post('/api/auth/logout', requireAdmin, async (c) => {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(c.get('session')!.id).run()
    deleteCookie(c, cookieName(c), { path: '/', secure: c.env.APP_ORIGIN.startsWith('https:') })
    return c.json({ ok: true })
  })
}
