ALTER TABLE user_settings ADD COLUMN app_password_hash TEXT;
ALTER TABLE user_settings ADD COLUMN is_app_locked BOOLEAN DEFAULT 1;