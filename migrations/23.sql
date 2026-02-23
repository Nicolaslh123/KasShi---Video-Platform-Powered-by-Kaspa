ALTER TABLE user_wallets ADD COLUMN totp_secret TEXT;
ALTER TABLE user_wallets ADD COLUMN is_totp_enabled INTEGER DEFAULT 0;
ALTER TABLE user_wallets ADD COLUMN extra_password_hash TEXT;
ALTER TABLE user_wallets ADD COLUMN is_extra_password_enabled INTEGER DEFAULT 0;
ALTER TABLE user_wallets ADD COLUMN has_viewed_mnemonic INTEGER DEFAULT 0;