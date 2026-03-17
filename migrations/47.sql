ALTER TABLE external_wallet_users ADD COLUMN extra_password_hash TEXT;
ALTER TABLE external_wallet_users ADD COLUMN is_extra_password_enabled INTEGER DEFAULT 0;
ALTER TABLE external_wallet_users ADD COLUMN encrypted_password_mnemonic TEXT;
ALTER TABLE external_wallet_users ADD COLUMN require_password_on_login INTEGER DEFAULT 0;