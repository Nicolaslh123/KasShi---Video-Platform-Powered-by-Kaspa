CREATE INDEX IF NOT EXISTS idx_track_reviews_track_id ON track_reviews(track_id);
CREATE INDEX IF NOT EXISTS idx_track_likes_wallet_user ON track_likes(wallet_address, user_id);
CREATE INDEX IF NOT EXISTS idx_track_likes_track_id ON track_likes(track_id);
CREATE INDEX IF NOT EXISTS idx_track_plays_wallet_user ON track_plays(wallet_address, user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_music_profile ON tracks(music_profile_id);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);