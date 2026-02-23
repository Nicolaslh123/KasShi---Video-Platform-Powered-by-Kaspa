
CREATE TABLE transfer_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  amount_kas TEXT NOT NULL,
  amount_fiat TEXT NOT NULL,
  currency TEXT NOT NULL,
  destination_type TEXT NOT NULL,
  destination_details TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transfer_requests_user_id ON transfer_requests(user_id);
CREATE INDEX idx_transfer_requests_status ON transfer_requests(status);
