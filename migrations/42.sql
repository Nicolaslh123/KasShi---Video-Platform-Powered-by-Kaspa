ALTER TABLE external_wallet_users ADD COLUMN internal_wallet_address TEXT;
ALTER TABLE external_wallet_users ADD COLUMN internal_public_key TEXT;
ALTER TABLE external_wallet_users ADD COLUMN encrypted_internal_private_key TEXT;
ALTER TABLE external_wallet_users ADD COLUMN encrypted_internal_mnemonic TEXT;
ALTER TABLE external_wallet_users ADD COLUMN demo_balance TEXT DEFAULT '0';