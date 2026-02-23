ALTER TABLE channels ADD COLUMN is_demo INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN is_demo INTEGER DEFAULT 0;

UPDATE channels SET is_demo = 1 WHERE wallet_address LIKE 'kaspa:demo%';
UPDATE videos SET is_demo = 1 WHERE channel_id IN (SELECT id FROM channels WHERE is_demo = 1);