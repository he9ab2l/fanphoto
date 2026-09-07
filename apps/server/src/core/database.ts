import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export type SqlValue = string | number | null
export class Database {
  readonly connection: DatabaseSync
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.connection = new DatabaseSync(path)
    this.connection.exec(
      'PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;',
    )
  }
  get<T>(sql: string, values: SqlValue[] = []): T | undefined {
    return this.connection.prepare(sql).get(...values) as T | undefined
  }
  all<T>(sql: string, values: SqlValue[] = []): T[] {
    return this.connection.prepare(sql).all(...values) as T[]
  }
  run(sql: string, values: SqlValue[] = []) {
    return this.connection.prepare(sql).run(...values)
  }
  transaction<T>(operation: () => T): T {
    this.connection.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.connection.exec('COMMIT')
      return result
    } catch (error) {
      this.connection.exec('ROLLBACK')
      throw error
    }
  }
  async migrate(directory: string) {
    this.connection.exec(
      'CREATE TABLE IF NOT EXISTS schema_versions (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)',
    )
    for (const name of (await readdir(directory))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort()) {
      const sql = await readFile(resolve(directory, name), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const existing = this.get<{ checksum: string }>(
        'SELECT checksum FROM schema_versions WHERE name=?',
        [name],
      )
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`Applied migration changed: ${name}`)
        continue
      }
      this.transaction(() => {
        this.connection.exec(sql)
        this.run('INSERT INTO schema_versions VALUES (?,?,?)', [name, checksum, Date.now()])
      })
    }
  }
  close() {
    this.connection.close()
  }
}
