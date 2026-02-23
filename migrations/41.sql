CREATE TABLE external_wallet_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL UNIQUE,
  public_key TEXT,
  auth_token TEXT NOT NULL,
  last_challenge TEXT,
  challenge_expires_at TIMESTAMP,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_external_wallet_users_address ON external_wallet_users(wallet_address);
CREATE INDEX idx_external_wallet_users_token ON external_wallet_users(auth_token);