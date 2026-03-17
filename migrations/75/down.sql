UPDATE user_wallets SET is_admin = 0 WHERE id = 1;
DROP INDEX IF EXISTS idx_track_likes_user_unique;
DROP INDEX IF EXISTS idx_track_likes_unique;
DROP TABLE IF EXISTS track_likes;