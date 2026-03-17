
DROP INDEX idx_podcasts_music_profile;
DROP INDEX idx_tracks_music_profile;
DROP INDEX idx_albums_music_profile;

ALTER TABLE podcasts DROP COLUMN music_profile_id;
ALTER TABLE tracks DROP COLUMN music_profile_id;
ALTER TABLE albums DROP COLUMN music_profile_id;
