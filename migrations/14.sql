
-- Channels table (creator profiles)
CREATE TABLE channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  description TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  subscriber_count INTEGER DEFAULT 0,
  total_kas_earned TEXT DEFAULT '0',
  is_verified INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_channels_handle ON channels(handle);
CREATE INDEX idx_channels_wallet ON channels(wallet_address);
