export type SqlValue = string | number | null
export interface SqlResult<T = Record<string, unknown>> {
  results: T[]
  success: boolean
  meta: { changes?: number }
}
export interface SqlStatement {
  bind(...values: SqlValue[]): SqlStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<SqlResult<T>>
  run(): Promise<SqlResult>
}
export interface SqlDatabase {
  prepare(query: string): SqlStatement
  batch(statements: SqlStatement[]): Promise<SqlResult[]>
}
export interface StoredObject {
  body: ReadableStream<Uint8Array>
  size: number
}
export interface BlobStore {
  put(key: string, bytes: ArrayBuffer, contentType: string): Promise<void>
  get(key: string): Promise<StoredObject | null>
  delete(keys: string[]): Promise<void>
}
export interface Bindings {
  DB: SqlDatabase
  STORE: BlobStore
  ADMIN_PASSWORD_HASH: string
  SESSION_SECRET: string
  APP_ORIGIN: string
  CLIENT_IP?: string
  ASSETS?: { fetch(request: Request): Promise<Response> }
  MODE?: string
}
export interface Session {
  id: string
  csrf_token: string
  credential_version: string
  expires_at: number
}
export type ApiEnv = { Bindings: Bindings; Variables: { session: Session | null } }
export interface PhotoRow {
  id: string
  client_id: string
  title: string
  description: string
  width: number
  height: number
  taken_at: number | null
  latitude: number | null
  longitude: number | null
  location: string
  exif: string
  tags: string
  featured: number
  published: number
  deleted_at: number | null
  thumb_hash: string | null
  analysis: string | null
  video_mime: string | null
  bytes: number
  content_hash: string
  source_name: string
  is_demo: number
  created_at: number
  updated_at: number
  album_ids?: string
}
export interface AlbumRow {
  id: string
  title: string
  description: string
  cover_id: string | null
  created_at: number
  updated_at: number
}
