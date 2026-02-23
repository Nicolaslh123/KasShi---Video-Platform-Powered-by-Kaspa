
ALTER TABLE pending_micropayments ADD COLUMN sender_user_id TEXT;
ALTER TABLE pending_balances ADD COLUMN user_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_balances_user_id ON pending_balances(user_id) WHERE user_id IS NOT NULL;
