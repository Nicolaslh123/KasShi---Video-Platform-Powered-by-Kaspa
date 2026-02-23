CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL UNIQUE,
  sender_address TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  recipient_domain TEXT,
  amount_kas TEXT NOT NULL,
  amount_fiat TEXT,
  currency TEXT NOT NULL DEFAULT 'KAS',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_sender ON transactions(sender_address);
CREATE INDEX idx_transactions_recipient ON transactions(recipient_address);

ALTER TABLE user_wallets ADD COLUMN public_key TEXT;