
CREATE TABLE membership_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price_kas TEXT NOT NULL,
  description TEXT,
  benefits TEXT,
  duration_days INTEGER DEFAULT 30,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_membership_tiers_channel ON membership_tiers(channel_id);

CREATE TABLE channel_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_channel_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  tier_id INTEGER NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_active INTEGER DEFAULT 1,
  total_paid_kas TEXT DEFAULT '0',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_channel_memberships_member ON channel_memberships(member_channel_id);
CREATE INDEX idx_channel_memberships_channel ON channel_memberships(channel_id);
CREATE UNIQUE INDEX idx_channel_memberships_unique ON channel_memberships(member_channel_id, channel_id);

ALTER TABLE videos ADD COLUMN is_members_only INTEGER DEFAULT 0;
