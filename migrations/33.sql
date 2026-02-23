ALTER TABLE reports ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE reports ADD COLUMN reviewed_at TIMESTAMP;
ALTER TABLE reports ADD COLUMN action_taken TEXT;