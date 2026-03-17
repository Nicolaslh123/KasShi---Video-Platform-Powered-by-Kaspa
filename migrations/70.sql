CREATE UNIQUE INDEX idx_episode_plays_episode_wallet ON episode_plays(episode_id, wallet_address);
CREATE UNIQUE INDEX idx_track_plays_track_wallet ON track_plays(track_id, wallet_address);