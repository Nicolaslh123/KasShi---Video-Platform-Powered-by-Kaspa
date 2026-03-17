
ALTER TABLE albums ADD COLUMN music_profile_id INTEGER;
ALTER TABLE tracks ADD COLUMN music_profile_id INTEGER;
ALTER TABLE podcasts ADD COLUMN music_profile_id INTEGER;

CREATE INDEX idx_albums_music_profile ON albums(music_profile_id);
CREATE INDEX idx_tracks_music_profile ON tracks(music_profile_id);
CREATE INDEX idx_podcasts_music_profile ON podcasts(music_profile_id);
