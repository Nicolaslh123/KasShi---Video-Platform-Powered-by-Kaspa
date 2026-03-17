-- Add cached rating columns to tracks table
ALTER TABLE tracks ADD COLUMN cached_avg_rating REAL;
ALTER TABLE tracks ADD COLUMN cached_review_count INTEGER DEFAULT 0;

-- Update existing tracks with calculated values
UPDATE tracks SET 
  cached_avg_rating = (SELECT AVG(rating) FROM track_reviews WHERE track_id = tracks.id),
  cached_review_count = (SELECT COUNT(*) FROM track_reviews WHERE track_id = tracks.id);