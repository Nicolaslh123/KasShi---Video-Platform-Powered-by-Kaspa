
CREATE TABLE albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cover_art_url TEXT,
  genre TEXT,
  release_date DATE,
  price_kas TEXT DEFAULT '0',
  play_count INTEGER DEFAULT 0,
  is_published INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_albums_channel ON albums(channel_id);
CREATE INDEX idx_albums_genre ON albums(genre);
CREATE INDEX idx_albums_release_date ON albums(release_date);
