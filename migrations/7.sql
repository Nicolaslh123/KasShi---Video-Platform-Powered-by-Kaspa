
ALTER TABLE user_settings ADD COLUMN notifications_payments BOOLEAN DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN notifications_deposits BOOLEAN DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN notifications_marketing BOOLEAN DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN require_confirm_large BOOLEAN DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN large_payment_threshold TEXT DEFAULT '100';
ALTER TABLE user_settings ADD COLUMN hide_balance BOOLEAN DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN compact_mode BOOLEAN DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN show_kas_amounts BOOLEAN DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN default_currency_send TEXT DEFAULT 'USD';
ALTER TABLE user_settings ADD COLUMN auto_convert_to_kas BOOLEAN DEFAULT 1;
