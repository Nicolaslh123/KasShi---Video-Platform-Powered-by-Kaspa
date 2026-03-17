
CREATE TABLE music_follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_profile_id INTEGER NOT NULL,
  following_profile_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(follower_profile_id, following_profile_id)
);

CREATE INDEX idx_music_follows_follower ON music_follows(follower_profile_id);
CREATE INDEX idx_music_follows_following ON music_follows(following_profile_id);

ALTER TABLE music_profiles ADD COLUMN banner_url TEXT;
ALTER TABLE music_profiles ADD COLUMN follower_count INTEGER DEFAULT 0;
ALTER TABLE music_profiles ADD COLUMN following_count INTEGER DEFAULT 0;
