-- Add payment queue status to track_reviews
ALTER TABLE track_reviews ADD COLUMN payment_status TEXT DEFAULT 'pending';

-- Create a simple lock table for payment processing
CREATE TABLE payment_processing_lock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lock_key TEXT NOT NULL UNIQUE,
  locked_at DATETIME,
  locked_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert the single lock row for review payments
INSERT INTO payment_processing_lock (lock_key, locked_at, locked_by) VALUES ('review_payments', NULL, NULL);