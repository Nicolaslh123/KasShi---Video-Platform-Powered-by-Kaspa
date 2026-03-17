-- First, remove any duplicates from track_likes keeping only the first
DELETE FROM track_likes WHERE id NOT IN (
  SELECT MIN(id) FROM track_likes GROUP BY track_id, COALESCE(wallet_address, ''), COALESCE(user_id, '')
);

-- Create unique index for track_likes
CREATE UNIQUE INDEX IF NOT EXISTS idx_track_likes_unique ON track_likes(track_id, COALESCE(wallet_address, ''), COALESCE(user_id, ''));

-- Remove any duplicates from playlist_tracks keeping only the first
DELETE FROM playlist_tracks WHERE id NOT IN (
  SELECT MIN(id) FROM playlist_tracks GROUP BY playlist_id, track_id
);

-- Create unique index for playlist_tracks
CREATE UNIQUE INDEX IF NOT EXISTS idx_playlist_tracks_unique ON playlist_tracks(playlist_id, track_id);