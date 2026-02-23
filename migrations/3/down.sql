ALTER TABLE user_wallets DROP COLUMN public_key;
DROP INDEX idx_transactions_recipient;
DROP INDEX idx_transactions_sender;
DROP TABLE transactions;