
CREATE TABLE playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER,
  wallet_address TEXT,
  user_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  cover_art_url TEXT,
  is_public INTEGER DEFAULT 1,
  track_count INTEGER DEFAULT 0,
  play_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE playlist_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  track_id INTEGER NOT NULL,
  track_order INTEGER DEFAULT 0,
  added_by_wallet TEXT,
  added_by_user_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_playlists_channel ON playlists(channel_id);
CREATE INDEX idx_playlists_wallet ON playlists(wallet_address);
CREATE INDEX idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
CREATE INDEX idx_playlist_tracks_track ON playlist_tracks(track_id);
