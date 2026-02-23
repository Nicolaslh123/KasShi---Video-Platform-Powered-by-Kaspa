UPDATE user_wallets SET is_admin = 0 WHERE user_id = '019c1067-18fc-7a56-8b7b-269a909fd20d';

ALTER TABLE user_wallets DROP COLUMN is_admin;