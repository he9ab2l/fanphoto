import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { createServices } from '../apps/server/src/services'
import { createApp } from '../apps/server/src/app'
import { passwordHash } from '../apps/server/src/core/security'
import type { MediaModule } from '../apps/server/src/modules/media/modules'

export const testPassword = 'fanphoto-test-password-only'
const hash = passwordHash(testPassword)
export async function fixture(width = 1200, height = 800, orientation = 1) {
  return sharp({ create: { width, height, channels: 3, background: { r: 81, g: 132, b: 151 } } })
    .jpeg({ quality: 90 })
    .withMetadata({ orientation })
    .withExifMerge({
      IFD0: { Make: 'Fixture Lab', Model: 'Synthetic Camera', Artist: 'Automated Test' },
      IFD2: {
        DateTimeOriginal: '2024:05:06 07:08:09',
        OffsetTimeOriginal: '+08:00',
        LensModel: 'Synthetic 35mm',
        FNumber: '8/1',
        ExposureTime: '1/125',
        ISOSpeedRatings: '200',
        FocalLength: '35/1',
      },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '30/1 15/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '120/1 30/1 0/1',
      },
    })
    .toBuffer()
}
export async function harness(modules?: MediaModule[]) {
  const directory = await mkdtemp(join(tmpdir(), 'fanphoto-test-'))
  const services = await createServices(
    {
      root: resolve('.'),
      data: directory,
      origin: 'https://fanphoto.test',
      passwordHash: await hash,
      sessionSecret: 'test-secret-only-longer-than-thirty-two-characters',
      host: '127.0.0.1',
      port: 8791,
      production: true,
      trustProxy: false,
    },
    modules,
  )
  const app = createApp(services)
  let cookie = '',
    csrf = ''
  const request = (
    path: string,
    method = 'GET',
    data?: unknown,
    auth = true,
    extra: Record<string, string> = {},
  ) => {
    const headers: Record<string, string> = { origin: services.config.origin, ...extra }
    if (auth && cookie) {
      headers.cookie = cookie
      if (!('x-csrf-token' in headers)) headers['x-csrf-token'] = csrf
    }
    let body: BodyInit | undefined
    if (data instanceof FormData) body = data
    else if (data !== undefined) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(data)
    }
    return app.request(
      services.config.origin + path,
      { method, headers, body },
      { clientIp: '127.0.0.1' },
    )
  }
  const login = async () => {
    const response = await request('/api/v1/session', 'POST', { password: testPassword }, false)
    const session = await response.clone().json()
    cookie = response.headers.get('set-cookie')?.split(';')[0] || ''
    csrf = session.csrfToken
    return response
  }
  const form = (bytes: Uint8Array, options: Record<string, unknown> = {}) => {
    const form = new FormData()
    form.set(
      'file',
      new File([new Uint8Array(bytes)], 'synthetic-fixture.jpg', { type: 'image/jpeg' }),
    )
    form.set('options', JSON.stringify({ clientId: crypto.randomUUID(), ...options }))
    return form
  }
  const upload = async (bytes: Uint8Array, options: Record<string, unknown> = {}) => {
    const response = await request('/api/v1/admin/uploads', 'POST', form(bytes, options))
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  }
  const close = async () => {
    services.db.close()
    await rm(directory, { recursive: true, force: true })
  }
  return { ...services, app, directory, request, login, form, upload, close }
}
