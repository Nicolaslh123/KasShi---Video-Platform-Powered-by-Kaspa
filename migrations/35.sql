
CREATE TABLE pending_micropayments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_channel_id INTEGER NOT NULL,
  recipient_channel_id INTEGER,
  recipient_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  amount_sompi TEXT NOT NULL,
  video_id INTEGER,
  comment_id INTEGER,
  action_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pending_micropayments_recipient ON pending_micropayments(recipient_channel_id, recipient_type);
CREATE INDEX idx_pending_micropayments_sender ON pending_micropayments(sender_channel_id);
CREATE INDEX idx_pending_micropayments_action_hash ON pending_micropayments(action_hash);

CREATE TABLE settlement_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merkle_root TEXT NOT NULL,
  transaction_id TEXT,
  total_amount_sompi TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  settled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_settlement_batches_merkle ON settlement_batches(merkle_root);
CREATE INDEX idx_settlement_batches_status ON settlement_batches(status);

CREATE TABLE settlement_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  micropayment_id INTEGER NOT NULL,
  leaf_index INTEGER NOT NULL,
  merkle_proof TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_settlement_items_batch ON settlement_items(batch_id);
CREATE INDEX idx_settlement_items_micropayment ON settlement_items(micropayment_id);

CREATE TABLE pending_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL UNIQUE,
  balance_sompi TEXT DEFAULT '0',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pending_balances_channel ON pending_balances(channel_id);
