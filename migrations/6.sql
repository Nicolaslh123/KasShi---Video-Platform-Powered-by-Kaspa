
ALTER TABLE user_wallets ADD COLUMN kaspay_username TEXT;
CREATE UNIQUE INDEX idx_user_wallets_kaspay_username ON user_wallets(kaspay_username) WHERE kaspay_username IS NOT NULL;
