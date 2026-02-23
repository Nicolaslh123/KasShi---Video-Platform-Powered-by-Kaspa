CREATE TABLE comment_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  interaction_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(comment_id, channel_id)
);

CREATE INDEX idx_comment_interactions_comment ON comment_interactions(comment_id);
CREATE INDEX idx_comment_interactions_channel ON comment_interactions(channel_id);

ALTER TABLE comments ADD COLUMN dislike_count INTEGER DEFAULT 0;