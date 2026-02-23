CREATE TABLE video_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  video_id INTEGER NOT NULL,
  watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_video_views_unique ON video_views(channel_id, video_id);
CREATE INDEX idx_video_views_channel ON video_views(channel_id);
CREATE INDEX idx_video_views_video ON video_views(video_id);