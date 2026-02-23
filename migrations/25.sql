
-- Channel notification subscriptions (bell button)
CREATE TABLE channel_notification_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_channel_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subscriber_channel_id, channel_id)
);

CREATE INDEX idx_notification_subs_subscriber ON channel_notification_subs(subscriber_channel_id);
CREATE INDEX idx_notification_subs_channel ON channel_notification_subs(channel_id);

-- Channel links (external links creators add)
CREATE TABLE channel_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_channel_links_channel ON channel_links(channel_id);

-- Add video_id to notifications for linking to uploaded videos
ALTER TABLE notifications ADD COLUMN video_id INTEGER;
ALTER TABLE notifications ADD COLUMN channel_id INTEGER;
