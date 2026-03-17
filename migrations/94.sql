-- Fix platform wallet is_admin flag for review payments
UPDATE user_wallets SET is_admin = 1 WHERE id = 1;