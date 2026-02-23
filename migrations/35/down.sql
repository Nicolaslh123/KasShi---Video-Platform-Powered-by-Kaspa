
DROP INDEX idx_pending_balances_channel;
DROP TABLE pending_balances;
DROP INDEX idx_settlement_items_micropayment;
DROP INDEX idx_settlement_items_batch;
DROP TABLE settlement_items;
DROP INDEX idx_settlement_batches_status;
DROP INDEX idx_settlement_batches_merkle;
DROP TABLE settlement_batches;
DROP INDEX idx_pending_micropayments_action_hash;
DROP INDEX idx_pending_micropayments_sender;
DROP INDEX idx_pending_micropayments_recipient;
DROP TABLE pending_micropayments;
