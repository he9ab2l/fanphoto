import { createReadStream } from 'node:fs'
import { mkdir, writeFile, rename, unlink, stat, rm } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { idSchema } from '@fanphoto/contracts'

export interface ObjectStore {
  put(key: string, bytes: Uint8Array): Promise<void>
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>
  deletePhoto(id: string): Promise<void>
  delete(key: string): Promise<void>
}
export class FileStore implements ObjectStore {
  constructor(readonly root: string) {}
  path(key: string) {
    const [id, filename, extra] = key.split('/')
    if (
      !idSchema.safeParse(id).success ||
      extra !== undefined ||
      !/^(source\.(jpg|png|webp|avif|heic|tiff)|(original|sm|md|lg)\.webp)$/.test(filename || '')
    )
      throw new Error('Invalid media storage key')
    const path = resolve(this.root, id, filename)
    if (!path.startsWith(resolve(this.root) + sep)) throw new Error('Invalid media storage path')
    return path
  }
  async put(key: string, bytes: Uint8Array) {
    const path = this.path(key)
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    const temporary = path + '.' + randomUUID() + '.tmp'
    try {
      await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' })
      await rename(temporary, path)
    } finally {
      await unlink(temporary).catch(() => {})
    }
  }
  async get(key: string) {
    const path = this.path(key)
    const entry = await stat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return null
    })
    if (!entry) return null
    return {
      body: Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>,
      size: entry.size,
    }
  }
  async deletePhoto(id: string) {
    idSchema.parse(id)
    await rm(resolve(this.root, id), { recursive: true, force: true })
  }
  async delete(key: string) {
    await unlink(this.path(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}
