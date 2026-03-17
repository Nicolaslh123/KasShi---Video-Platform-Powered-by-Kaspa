
CREATE TABLE chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER,
  episode_id INTEGER,
  title TEXT NOT NULL,
  start_time_seconds INTEGER NOT NULL,
  end_time_seconds INTEGER,
  description TEXT,
  image_url TEXT,
  chapter_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chapters_track ON chapters(track_id);
CREATE INDEX idx_chapters_episode ON chapters(episode_id);
