
ALTER TABLE notifications DROP COLUMN channel_id;
ALTER TABLE notifications DROP COLUMN video_id;
DROP INDEX idx_channel_links_channel;
DROP TABLE channel_links;
DROP INDEX idx_notification_subs_channel;
DROP INDEX idx_notification_subs_subscriber;
DROP TABLE channel_notification_subs;
