
ALTER TABLE external_wallet_users ADD COLUMN totp_secret TEXT;
ALTER TABLE external_wallet_users ADD COLUMN is_totp_enabled INTEGER DEFAULT 0;
ALTER TABLE external_wallet_users ADD COLUMN has_viewed_mnemonic INTEGER DEFAULT 0;
