CREATE TABLE track_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL,
  reviewer_wallet_address TEXT NOT NULL,
  reviewer_user_id TEXT,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL,
  reward_kas TEXT NOT NULL,
  transaction_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_track_reviews_track_id ON track_reviews(track_id);
CREATE INDEX idx_track_reviews_reviewer_wallet ON track_reviews(reviewer_wallet_address);
CREATE INDEX idx_track_reviews_created_at ON track_reviews(created_at);