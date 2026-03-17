CREATE TABLE artist_followers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_wallet_address TEXT NOT NULL,
  artist_profile_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(follower_wallet_address, artist_profile_id)
);