-- Themes uploaded by artists
CREATE TABLE marketplace_themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_wallet_address TEXT,
  creator_user_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  preview_image_url TEXT,
  theme_data TEXT,
  is_approved INTEGER DEFAULT 0,
  is_rejected INTEGER DEFAULT 0,
  rejection_reason TEXT,
  price_kas TEXT DEFAULT '0',
  quantity_total INTEGER,
  quantity_sold INTEGER DEFAULT 0,
  has_particles INTEGER DEFAULT 0,
  particle_color TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Records of theme ownership
CREATE TABLE theme_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id INTEGER NOT NULL,
  buyer_wallet_address TEXT,
  buyer_user_id INTEGER,
  seller_wallet_address TEXT,
  purchase_price_kas TEXT NOT NULL,
  transaction_id TEXT,
  is_original INTEGER DEFAULT 1,
  listing_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Resale and auction listings
CREATE TABLE theme_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id INTEGER NOT NULL,
  purchase_id INTEGER NOT NULL,
  seller_wallet_address TEXT,
  seller_user_id INTEGER,
  price_kas TEXT,
  is_auction INTEGER DEFAULT 0,
  auction_min_bid_kas TEXT,
  auction_ends_at DATETIME,
  current_bid_kas TEXT,
  current_bidder_wallet TEXT,
  is_active INTEGER DEFAULT 1,
  is_sold INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bids on auction listings
CREATE TABLE theme_bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  bidder_wallet_address TEXT,
  bidder_user_id INTEGER,
  bid_amount_kas TEXT NOT NULL,
  transaction_id TEXT,
  is_winning INTEGER DEFAULT 0,
  is_refunded INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Which theme is applied to user's profile
CREATE TABLE applied_themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_profile_id INTEGER NOT NULL,
  wallet_address TEXT,
  theme_id INTEGER NOT NULL,
  purchase_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_themes_creator ON marketplace_themes(creator_wallet_address);
CREATE INDEX idx_themes_approved ON marketplace_themes(is_approved, is_active);
CREATE INDEX idx_purchases_buyer ON theme_purchases(buyer_wallet_address);
CREATE INDEX idx_purchases_theme ON theme_purchases(theme_id);
CREATE INDEX idx_listings_active ON theme_listings(is_active, is_sold);
CREATE INDEX idx_listings_auction ON theme_listings(is_auction, auction_ends_at);
CREATE INDEX idx_bids_listing ON theme_bids(listing_id);
CREATE INDEX idx_applied_profile ON applied_themes(music_profile_id);