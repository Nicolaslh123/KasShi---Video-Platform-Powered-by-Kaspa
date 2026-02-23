ALTER TABLE user_wallets ADD COLUMN encrypted_password_mnemonic TEXT;
ALTER TABLE user_wallets ADD COLUMN require_password_on_login INTEGER DEFAULT 0;