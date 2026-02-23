/// <reference types="@cloudflare/workers-types" />

interface Env {
  // D1 Database
  DB: D1Database;
  
  // R2 Bucket
  R2_BUCKET: R2Bucket;
  
  // Mocha Auth (injected automatically)
  MOCHA_USERS_SERVICE_API_URL: string;
  MOCHA_USERS_SERVICE_API_KEY: string;
  
  // CoinGecko API for exchange rates
  COINGECKO_API_KEY?: string;
  
  // MoonPay for fiat↔crypto conversions
  MOONPAY_API_KEY?: string;
  
  // Stripe for bank/card payouts
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  
  // PayPal for PayPal payouts
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  
  // Admin user ID - only this user can be admin (set via secret)
  ADMIN_USER_ID?: string;
  
  // OpenAI API for AI subtitle generation
  OPENAI_API_KEY?: string;
}
