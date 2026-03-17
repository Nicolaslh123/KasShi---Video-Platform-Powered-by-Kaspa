
ALTER TABLE music_profiles DROP COLUMN following_count;
ALTER TABLE music_profiles DROP COLUMN follower_count;
ALTER TABLE music_profiles DROP COLUMN banner_url;

DROP INDEX idx_music_follows_following;
DROP INDEX idx_music_follows_follower;
DROP TABLE music_follows;
