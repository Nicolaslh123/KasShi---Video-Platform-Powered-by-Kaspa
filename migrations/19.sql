
-- Subscriptions table
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_channel_id INTEGER NOT NULL,
  subscribed_to_channel_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_subscriptions_unique ON subscriptions(subscriber_channel_id, subscribed_to_channel_id);
CREATE INDEX idx_subscriptions_subscriber ON subscriptions(subscriber_channel_id);
CREATE INDEX idx_subscriptions_channel ON subscriptions(subscribed_to_channel_id);
