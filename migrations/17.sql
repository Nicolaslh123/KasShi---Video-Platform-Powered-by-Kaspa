
-- Video interactions (likes/dislikes)
CREATE TABLE video_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  interaction_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_video_interactions_unique ON video_interactions(video_id, channel_id);
CREATE INDEX idx_video_interactions_video ON video_interactions(video_id);
