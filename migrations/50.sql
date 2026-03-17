-- Set default price of 0.11 KAS for all videos without a price
UPDATE videos SET price_kas = '0.11' WHERE price_kas IS NULL OR price_kas = '' OR price_kas = '0';