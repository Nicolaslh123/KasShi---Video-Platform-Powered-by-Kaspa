
CREATE TABLE music_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  bio TEXT,
  avatar_url TEXT,
  genre TEXT,
  website_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_music_profiles_wallet ON music_profiles(wallet_address);
CREATE INDEX idx_music_profiles_handle ON music_profiles(handle);
