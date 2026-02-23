
ALTER TABLE videos DROP COLUMN is_members_only;
DROP INDEX idx_channel_memberships_unique;
DROP INDEX idx_channel_memberships_channel;
DROP INDEX idx_channel_memberships_member;
DROP TABLE channel_memberships;
DROP INDEX idx_membership_tiers_channel;
DROP TABLE membership_tiers;
