ALTER TABLE user_wallets ADD COLUMN is_admin INTEGER DEFAULT 0;

UPDATE user_wallets SET is_admin = 1 WHERE user_id = '019c1067-18fc-7a56-8b7b-269a909fd20d';