CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  width INTEGER NOT NULL CHECK(width > 0),
  height INTEGER NOT NULL CHECK(height > 0),
  captured_at INTEGER,
  captured_local TEXT,
  captured_offset TEXT,
  latitude REAL,
  longitude REAL,
  location TEXT NOT NULL,
  exif TEXT NOT NULL CHECK(json_valid(exif)),
  analysis TEXT NOT NULL CHECK(json_valid(analysis)),
  thumb_hash TEXT,
  is_public INTEGER NOT NULL DEFAULT 1 CHECK(is_public IN (0,1)),
  favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
  deleted_at INTEGER,
  source_hash TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  source_mime TEXT NOT NULL,
  source_width INTEGER NOT NULL,
  source_height INTEGER NOT NULL,
  source_bytes INTEGER NOT NULL,
  attribution TEXT CHECK(attribution IS NULL OR json_valid(attribution)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK((latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX photos_browse ON photos(is_public, deleted_at, COALESCE(captured_at, created_at) DESC, id DESC);
CREATE INDEX photos_updated ON photos(updated_at DESC, id);
CREATE TABLE assets (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes >= 0),
  checksum TEXT NOT NULL,
  PRIMARY KEY(photo_id, variant)
);
CREATE TABLE tags (name TEXT PRIMARY KEY);
CREATE TABLE photo_tags (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  tag TEXT NOT NULL REFERENCES tags(name) ON DELETE CASCADE,
  PRIMARY KEY(photo_id, tag)
);
CREATE INDEX photo_tags_lookup ON photo_tags(tag, photo_id);
CREATE TABLE albums (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE album_photos (
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(album_id, photo_id)
);
CREATE INDEX album_photos_photo ON album_photos(photo_id);
CREATE TABLE extensions (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK(schema_version > 0),
  data TEXT NOT NULL CHECK(json_valid(data)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(photo_id, namespace)
);
CREATE TABLE ingest_events (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, source_hash TEXT NOT NULL,
  photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK(status IN ('processing','complete','failed')),
  error_code TEXT, started_at INTEGER NOT NULL, finished_at INTEGER
);
CREATE INDEX ingest_client ON ingest_events(client_id, started_at DESC);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, csrf_token TEXT NOT NULL, credential_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expire ON sessions(expires_at);
CREATE TABLE auth_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
