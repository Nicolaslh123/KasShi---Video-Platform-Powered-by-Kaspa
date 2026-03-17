CREATE INDEX IF NOT EXISTS idx_track_likes_wallet ON track_likes(wallet_address);
CREATE INDEX IF NOT EXISTS idx_track_likes_user ON track_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_track_likes_track ON track_likes(track_id);