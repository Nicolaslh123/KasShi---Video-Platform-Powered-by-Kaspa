
ALTER TABLE channel_memberships ADD COLUMN is_cancelled INTEGER DEFAULT 0;
ALTER TABLE channel_memberships ADD COLUMN cancelled_at TIMESTAMP;
ALTER TABLE channel_memberships ADD COLUMN next_billing_at TIMESTAMP;
ALTER TABLE channel_memberships ADD COLUMN auto_renew INTEGER DEFAULT 1;
