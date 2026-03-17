ALTER TABLE playlists ADD COLUMN cached_track_count INTEGER DEFAULT 0;

UPDATE playlists SET cached_track_count = (
  SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = playlists.id
);