ALTER TABLE user_wallets DROP COLUMN has_viewed_mnemonic;
ALTER TABLE user_wallets DROP COLUMN is_extra_password_enabled;
ALTER TABLE user_wallets DROP COLUMN extra_password_hash;
ALTER TABLE user_wallets DROP COLUMN is_totp_enabled;
ALTER TABLE user_wallets DROP COLUMN totp_secret;