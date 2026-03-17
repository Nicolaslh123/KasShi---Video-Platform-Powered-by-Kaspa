
CREATE TABLE track_plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL,
  wallet_address TEXT,
  user_id TEXT,
  duration_played INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE episode_plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL,
  wallet_address TEXT,
  user_id TEXT,
  duration_played INTEGER DEFAULT 0,
  progress_seconds INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_track_plays_track ON track_plays(track_id);
CREATE INDEX idx_track_plays_wallet ON track_plays(wallet_address);
CREATE INDEX idx_episode_plays_episode ON episode_plays(episode_id);
CREATE INDEX idx_episode_plays_wallet ON episode_plays(wallet_address);
