CREATE INDEX IF NOT EXISTS idx_playlists_wallet_address ON playlists(wallet_address);
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlists_is_public ON playlists(is_public);