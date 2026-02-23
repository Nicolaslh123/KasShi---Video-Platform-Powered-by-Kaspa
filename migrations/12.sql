
ALTER TABLE transfer_requests ADD COLUMN transfer_id TEXT;
ALTER TABLE transfer_requests ADD COLUMN amount TEXT;
ALTER TABLE transfer_requests ADD COLUMN fee_amount TEXT;
ALTER TABLE transfer_requests ADD COLUMN receive_amount TEXT;
ALTER TABLE transfer_requests RENAME COLUMN amount_kas TO kas_amount;
