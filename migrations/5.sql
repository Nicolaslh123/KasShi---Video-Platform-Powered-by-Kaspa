
CREATE TABLE deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deposit_id TEXT NOT NULL UNIQUE,
  user_id TEXT,
  stripe_session_id TEXT,
  amount_fiat TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount_kas TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deposits_user_id ON deposits(user_id);
CREATE INDEX idx_deposits_stripe_session ON deposits(stripe_session_id);
