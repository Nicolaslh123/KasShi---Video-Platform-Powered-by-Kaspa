
ALTER TABLE transfer_requests RENAME COLUMN kas_amount TO amount_kas;
ALTER TABLE transfer_requests DROP COLUMN receive_amount;
ALTER TABLE transfer_requests DROP COLUMN fee_amount;
ALTER TABLE transfer_requests DROP COLUMN amount;
ALTER TABLE transfer_requests DROP COLUMN transfer_id;
