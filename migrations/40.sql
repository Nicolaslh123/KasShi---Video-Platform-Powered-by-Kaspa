
ALTER TABLE video_views ADD COLUMN user_id TEXT;
CREATE UNIQUE INDEX idx_video_views_user_video ON video_views(user_id, video_id) WHERE user_id IS NOT NULL;
