
DROP INDEX IF EXISTS idx_pending_balances_user_id;
ALTER TABLE pending_balances DROP COLUMN user_id;
ALTER TABLE pending_micropayments DROP COLUMN sender_user_id;
