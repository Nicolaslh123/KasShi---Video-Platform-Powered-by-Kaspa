
-- Comments table
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  parent_id INTEGER,
  content TEXT NOT NULL,
  like_count INTEGER DEFAULT 0,
  kas_earned TEXT DEFAULT '0',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_video ON comments(video_id);
CREATE INDEX idx_comments_channel ON comments(channel_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
