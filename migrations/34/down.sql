UPDATE videos SET is_demo = 0;
UPDATE channels SET is_demo = 0;
ALTER TABLE videos DROP COLUMN is_demo;
ALTER TABLE channels DROP COLUMN is_demo;