
CREATE TABLE music_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_type TEXT NOT NULL,
  content_id INTEGER NOT NULL,
  wallet_address TEXT,
  user_id TEXT,
  amount_kas TEXT NOT NULL,
  transaction_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_music_purchases_type ON music_purchases(content_type, content_id);
CREATE INDEX idx_music_purchases_wallet ON music_purchases(wallet_address);
