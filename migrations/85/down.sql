DELETE FROM payment_processing_lock WHERE lock_key = 'review_payments';
DROP TABLE payment_processing_lock;
ALTER TABLE track_reviews DROP COLUMN payment_status;