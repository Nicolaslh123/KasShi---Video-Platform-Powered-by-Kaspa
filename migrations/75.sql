-- Create track_likes table if it doesn't exist
CREATE TABLE IF NOT EXISTS track_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL,
  wallet_address TEXT,
  user_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Now create the unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_track_likes_unique ON track_likes(track_id, wallet_address) WHERE wallet_address IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_track_likes_user_unique ON track_likes(track_id, user_id) WHERE user_id IS NOT NULL;

-- Admin update
UPDATE user_wallets SET is_admin = 1 WHERE id = 1;