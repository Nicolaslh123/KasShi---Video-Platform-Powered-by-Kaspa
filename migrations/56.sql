
CREATE TABLE podcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cover_art_url TEXT,
  category TEXT,
  is_explicit INTEGER DEFAULT 0,
  is_video_podcast INTEGER DEFAULT 0,
  price_kas TEXT DEFAULT '0',
  subscriber_count INTEGER DEFAULT 0,
  is_published INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_podcasts_channel ON podcasts(channel_id);
CREATE INDEX idx_podcasts_category ON podcasts(category);
