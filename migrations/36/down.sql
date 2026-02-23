
ALTER TABLE channel_memberships DROP COLUMN auto_renew;
ALTER TABLE channel_memberships DROP COLUMN next_billing_at;
ALTER TABLE channel_memberships DROP COLUMN cancelled_at;
ALTER TABLE channel_memberships DROP COLUMN is_cancelled;
