import { DatabaseSync } from 'node:sqlite'
import { mkdir, readFile, readdir, stat, unlink, writeFile, rename } from 'node:fs/promises'
import { createReadStream, mkdirSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import type { BlobStore, SqlDatabase, SqlStatement, SqlValue, SqlResult } from './types'

class Statement implements SqlStatement {
  constructor(
    readonly db: DatabaseSync,
    readonly sql: string,
    readonly values: SqlValue[] = [],
  ) {}
  bind(...values: SqlValue[]) {
    return new Statement(this.db, this.sql, values)
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.values) as T) || null
  }
  async all<T>(): Promise<SqlResult<T>> {
    return {
      results: this.db.prepare(this.sql).all(...this.values) as T[],
      success: true,
      meta: {},
    }
  }
  execute(): SqlResult {
    const query = this.db.prepare(this.sql)
    // `StatementSync#columns()` is not available in every supported Node 22
    // minor. The local adapter only executes read statements through this
    // method in tests/batches, so classify them from the SQL verb instead of
    // depending on the optional introspection API.
    if (/^\s*(SELECT|WITH|PRAGMA|VALUES)\b/i.test(this.sql))
      return { results: query.all(...this.values), success: true, meta: {} }
    const result = query.run(...this.values)
    return { results: [], success: true, meta: { changes: Number(result.changes) } }
  }
  async run() {
    return this.execute()
  }
}
export class LocalDatabase implements SqlDatabase {
  readonly native: DatabaseSync
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.native = new DatabaseSync(path)
    this.native.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
  }
  prepare(sql: string) {
    return new Statement(this.native, sql)
  }
  async batch(statements: SqlStatement[]) {
    this.native.exec('BEGIN IMMEDIATE')
    try {
      const results = statements.map((s) => (s as Statement).execute())
      this.native.exec('COMMIT')
      return results
    } catch (error) {
      this.native.exec('ROLLBACK')
      throw error
    }
  }
  async migrate(directory: string) {
    this.native.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)')
    for (const name of (await readdir(directory)).filter((v) => /^\d+.*\.sql$/.test(v)).sort()) {
      if (this.native.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(name))
        continue
      const sql = await readFile(resolve(directory, name), 'utf8')
      this.native.exec('BEGIN IMMEDIATE')
      try {
        this.native.exec(sql)
        this.native.prepare('INSERT INTO schema_migrations VALUES (?)').run(name)
        this.native.exec('COMMIT')
      } catch (error) {
        this.native.exec('ROLLBACK')
        throw error
      }
    }
  }
  close() {
    this.native.close()
  }
}
export class LocalStore implements BlobStore {
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
  }
  path(key: string) {
    if (
      !/^(originals\/[\w-]+\.webp|thumbs\/[\w-]+\/(sm|md|lg)\.webp|videos\/[\w-]+\.(mov|mp4))$/.test(
        key,
      )
    )
      throw new Error('Invalid storage key')
    const target = resolve(this.directory, key)
    if (!target.startsWith(resolve(this.directory) + sep)) throw new Error('Invalid storage path')
    return target
  }
  async put(key: string, bytes: ArrayBuffer) {
    const target = this.path(key)
    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    const temp = `${target}.${crypto.randomUUID()}.tmp`
    try {
      await writeFile(temp, new Uint8Array(bytes), { mode: 0o600, flag: 'wx' })
      await rename(temp, target)
    } finally {
      await unlink(temp).catch(() => {})
    }
  }
  async get(key: string) {
    const target = this.path(key)
    try {
      const meta = await stat(target)
      return {
        body: Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>,
        size: meta.size,
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  }
  async delete(keys: string[]) {
    for (const key of keys)
      await unlink(this.path(key)).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== 'ENOENT') throw e
      })
  }
}
