
-- Payment transactions for the video platform
CREATE TABLE video_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL UNIQUE,
  from_channel_id INTEGER NOT NULL,
  to_channel_id INTEGER NOT NULL,
  video_id INTEGER,
  comment_id INTEGER,
  payment_type TEXT NOT NULL,
  amount_kas TEXT NOT NULL,
  platform_fee TEXT NOT NULL,
  creator_amount TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_video_payments_from ON video_payments(from_channel_id);
CREATE INDEX idx_video_payments_to ON video_payments(to_channel_id);
CREATE INDEX idx_video_payments_video ON video_payments(video_id);
CREATE INDEX idx_video_payments_type ON video_payments(payment_type);
