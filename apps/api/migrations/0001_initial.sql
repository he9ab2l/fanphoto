CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', width INTEGER NOT NULL CHECK(width > 0),
  height INTEGER NOT NULL CHECK(height > 0), taken_at INTEGER, latitude REAL, longitude REAL,
  location TEXT NOT NULL DEFAULT '', exif TEXT NOT NULL DEFAULT '{}', tags TEXT NOT NULL DEFAULT '[]',
  featured INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 1, deleted_at INTEGER,
  thumb_hash TEXT, analysis TEXT, video_mime TEXT, bytes INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL, source_name TEXT NOT NULL DEFAULT '', is_demo INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_browse ON photos(published, deleted_at, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_photos_taken ON photos(COALESCE(taken_at, created_at) DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_photos_location ON photos(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  cover_id TEXT REFERENCES photos(id) ON DELETE SET NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS album_photos (
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE, PRIMARY KEY(album_id, photo_id)
);
CREATE INDEX IF NOT EXISTS idx_album_photos_photo ON album_photos(photo_id);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, csrf_token TEXT NOT NULL, credential_version TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
