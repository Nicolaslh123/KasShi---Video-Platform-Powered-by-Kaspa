DROP INDEX idx_playlists_slug;
DROP INDEX idx_albums_slug;
ALTER TABLE playlists DROP COLUMN slug;
ALTER TABLE albums DROP COLUMN slug;