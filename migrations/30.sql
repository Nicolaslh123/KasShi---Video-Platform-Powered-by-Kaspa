
CREATE TABLE video_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  progress_seconds INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  last_watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(video_id, channel_id)
);

CREATE INDEX idx_video_progress_channel ON video_progress(channel_id);
CREATE INDEX idx_video_progress_video ON video_progress(video_id);
