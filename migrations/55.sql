
CREATE TABLE tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  album_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  audio_url TEXT,
  bunny_audio_id TEXT,
  bunny_status TEXT,
  cover_art_url TEXT,
  duration_seconds INTEGER,
  track_number INTEGER,
  genre TEXT,
  lyrics TEXT,
  price_kas TEXT DEFAULT '0',
  play_count INTEGER DEFAULT 0,
  is_explicit INTEGER DEFAULT 0,
  is_published INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tracks_channel ON tracks(channel_id);
CREATE INDEX idx_tracks_album ON tracks(album_id);
CREATE INDEX idx_tracks_genre ON tracks(genre);
