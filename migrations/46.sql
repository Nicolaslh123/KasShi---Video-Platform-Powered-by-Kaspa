
-- Main referrals table
CREATE TABLE referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_channel_id INTEGER NOT NULL,
  referral_code TEXT NOT NULL UNIQUE,
  referred_channel_id INTEGER,
  referred_wallet_address TEXT,
  status TEXT DEFAULT 'pending',
  videos_uploaded_count INTEGER DEFAULT 0,
  unique_videos_watched INTEGER DEFAULT 0,
  unique_channels_watched INTEGER DEFAULT 0,
  account_created_at TIMESTAMP,
  requirements_met_at TIMESTAMP,
  referrer_payout_kas TEXT DEFAULT '100',
  referred_payout_kas TEXT DEFAULT '50',
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Track which videos referred user has watched (for 10 video requirement)
CREATE TABLE referral_watch_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referral_id INTEGER NOT NULL,
  video_id INTEGER NOT NULL,
  video_channel_id INTEGER NOT NULL,
  watch_duration_seconds INTEGER DEFAULT 0,
  is_qualified INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(referral_id, video_id)
);

-- Track video hashes to prevent duplicate uploads
CREATE TABLE referral_video_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referral_id INTEGER NOT NULL,
  video_id INTEGER NOT NULL,
  video_hash TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  is_qualified INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_referrals_code ON referrals(referral_code);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_channel_id);
CREATE INDEX idx_referrals_status ON referrals(status);
CREATE INDEX idx_referral_watch_referral ON referral_watch_progress(referral_id);
CREATE INDEX idx_referral_uploads_referral ON referral_video_uploads(referral_id);
CREATE INDEX idx_referral_uploads_hash ON referral_video_uploads(video_hash);
