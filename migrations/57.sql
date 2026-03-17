
CREATE TABLE podcast_episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  podcast_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  audio_url TEXT,
  video_url TEXT,
  bunny_audio_id TEXT,
  bunny_video_id TEXT,
  bunny_status TEXT,
  cover_art_url TEXT,
  duration_seconds INTEGER,
  episode_number INTEGER,
  season_number INTEGER DEFAULT 1,
  is_explicit INTEGER DEFAULT 0,
  price_kas TEXT DEFAULT '0',
  play_count INTEGER DEFAULT 0,
  is_published INTEGER DEFAULT 0,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_episodes_podcast ON podcast_episodes(podcast_id);
CREATE INDEX idx_episodes_channel ON podcast_episodes(channel_id);
CREATE INDEX idx_episodes_published ON podcast_episodes(published_at);
