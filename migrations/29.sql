
CREATE TABLE watch_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  video_id INTEGER NOT NULL,
  progress_seconds INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, video_id)
);

CREATE INDEX idx_watch_progress_channel ON watch_progress(channel_id);
CREATE INDEX idx_watch_progress_video ON watch_progress(video_id);
