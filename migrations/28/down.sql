ALTER TABLE comments DROP COLUMN dislike_count;
DROP INDEX idx_comment_interactions_channel;
DROP INDEX idx_comment_interactions_comment;
DROP TABLE comment_interactions;