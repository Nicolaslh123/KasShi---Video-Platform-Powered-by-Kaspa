UPDATE music_profiles 
SET user_id = (
  SELECT uw.user_id 
  FROM user_wallets uw 
  WHERE uw.wallet_address = music_profiles.wallet_address
)
WHERE user_id IS NULL 
AND wallet_address IN (SELECT wallet_address FROM user_wallets);