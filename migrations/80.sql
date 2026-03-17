ALTER TABLE albums ADD COLUMN slug TEXT;
ALTER TABLE playlists ADD COLUMN slug TEXT;
CREATE INDEX idx_albums_slug ON albums(slug);
CREATE INDEX idx_playlists_slug ON playlists(slug);