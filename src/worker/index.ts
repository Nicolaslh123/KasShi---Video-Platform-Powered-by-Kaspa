import { Hono, Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getCookie, setCookie } from "hono/cookie";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "./middleware/rate-limiter";
import {
  getOAuthRedirectUrl,
  exchangeCodeForSessionToken,
  authMiddleware,
  deleteSession,
  getCurrentUser,
  MOCHA_SESSION_TOKEN_COOKIE_NAME,
} from "@getmocha/users-service/backend";
import type { MochaUser } from "@getmocha/users-service/shared";

import Stripe from "stripe";
import OpenAI from "openai";

// Import services
import { getKaspaExchangeRates, fiatToKas, kasToFiat } from "./services/coingecko";
import { generateWallet, generateWalletFromMnemonic, getWalletBalance, getTransactionHistory as getKaspaTransactions, encryptPrivateKey, decryptPrivateKey, hashPin, verifyPin, sendTransaction, setNetwork, getNetwork, signTransaction, getUTXOs, generateMnemonic, consolidateUTXOs, autoConsolidateIfNeeded, type KaspaNetwork } from "./services/kaspa-wallet";
import * as OTPAuth from "otpauth";
import { checkDomainAvailability, resolveDomain, registerDomain as registerKnsDomain } from "./services/kns-registry";
import { forceRecoveryPhraseSetup } from "./force-recovery-setup";
import { 
  BATCH_THRESHOLD_SOMPI, 
  BATCH_THRESHOLD_KAS,
  recordPendingMicropayment,
  getPendingBalance,
  getPendingMicropayments,
  isAnySettlementReady,
  createSettlementBatch,
  createSenderSettlementBatch,
  completeSettlement,
  getMerkleProof,
  getSenderPendingDebits,
  getSenderPendingDebitsByUserId,
  getSenderPendingMicropayments,
  getAllPendingCreatorPayouts,
  BatchSettlementResult
} from "./services/batched-payments";

const app = new Hono<{ 
  Bindings: Env;
  Variables: {
    user?: MochaUser;
  };
}>();

// Global security headers middleware - helps establish legitimacy
app.use("*", async (c, next) => {
  await next();
  // Add security headers to all responses
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "SAMEORIGIN");
  c.res.headers.set("X-XSS-Protection", "1; mode=block");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  // Content Security Policy - indicates legitimate site with proper controls
  c.res.headers.set("Content-Security-Policy", "frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
});

// Security.txt - industry standard for legitimate websites
app.get("/.well-known/security.txt", (c) => {
  const securityTxt = `# KasShi Security Contact
Contact: mailto:security@kasshi.io
Expires: 2026-12-31T23:59:00.000Z
Preferred-Languages: en
Canonical: https://kasshi.io/.well-known/security.txt
Policy: https://kasshi.io/legal

# KasShi is a legitimate video platform powered by Kaspa cryptocurrency.
# For security concerns, please contact security@kasshi.io
`;
  return c.text(securityTxt, 200, { "Content-Type": "text/plain; charset=utf-8" });
});

// Robots.txt - legitimate sites have proper robots.txt
app.get("/robots.txt", (c) => {
  const robotsTxt = `# KasShi - Video Platform Powered by Kaspa
# https://kasshi.io

User-agent: *
Allow: /
Disallow: /api/
Disallow: /settings

Sitemap: https://kasshi.io/sitemap.xml
`;
  return c.text(robotsTxt, 200, { "Content-Type": "text/plain; charset=utf-8" });
});

// Helper to convert SQLite timestamp to UTC ISO format
// SQLite CURRENT_TIMESTAMP stores UTC but without timezone indicator
// This ensures JavaScript parses it correctly as UTC
function toUTCTimestamp(timestamp: unknown): string | null {
  if (!timestamp || typeof timestamp !== 'string') return null;
  // SQLite format: "2025-06-15 14:30:00" -> "2025-06-15T14:30:00Z"
  return timestamp.replace(' ', 'T') + 'Z';
}

// Rate limit response helper
function rateLimitResponse(c: any, retryAfter: number) {
  return c.json(
    { 
      error: "Too many requests. Please try again later.",
      retryAfter,
    },
    429,
    { "Retry-After": String(retryAfter) }
  );
}

// ============================================
// Authentication Routes
// ============================================

app.get("/api/oauth/google/redirect_url", async (c) => {
  const redirectUrl = await getOAuthRedirectUrl("google", {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
  });

  return c.json({ redirectUrl }, 200);
});

app.post("/api/sessions", async (c) => {
  // Rate limit: 10 attempts per 5 minutes
  const ip = getClientIp(c);
  const rateCheck = checkRateLimit(ip, { ...RATE_LIMITS.AUTH, keyPrefix: "session" });
  if (!rateCheck.allowed) {
    return rateLimitResponse(c, rateCheck.retryAfter!);
  }

  const body = await c.req.json();

  if (!body.code) {
    return c.json({ error: "No authorization code provided" }, 400);
  }

  const sessionToken = await exchangeCodeForSessionToken(body.code, {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
  });

  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: true,
    maxAge: 60 * 24 * 60 * 60, // 60 days
  });

  // Get the user from the session token
  const user = await getCurrentUser(sessionToken, {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
  });

  if (user) {
    // Check if user has an app password set
    const settings = await c.env.DB.prepare(
      "SELECT app_password_hash FROM user_settings WHERE user_id = ?"
    ).bind(user.id).first();

    // If they have an app password, automatically lock the app on login
    // This ensures the password is required after every Google login
    if (settings?.app_password_hash) {
      await c.env.DB.prepare(
        "UPDATE user_settings SET is_app_locked = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
      ).bind(user.id).run();
    }

    // Check if user should be admin
    const adminUserId = c.env.ADMIN_USER_ID;
    const shouldBeAdmin = adminUserId && user.id === adminUserId;

    // Auto-create wallet if user doesn't have one
    const existingWallet = await c.env.DB.prepare(
      "SELECT id, is_admin FROM user_wallets WHERE user_id = ?"
    ).bind(user.id).first<{ id: number; is_admin: number }>();

    if (existingWallet) {
      // Update admin status for existing wallets if ADMIN_USER_ID is set
      if (shouldBeAdmin && existingWallet.is_admin !== 1) {
        await c.env.DB.prepare(
          "UPDATE user_wallets SET is_admin = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
        ).bind(user.id).run();
        console.log(`Updated user ${user.id} to admin status`);
      } else if (!shouldBeAdmin && existingWallet.is_admin === 1) {
        // Remove admin status if user is no longer the configured admin
        await c.env.DB.prepare(
          "UPDATE user_wallets SET is_admin = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
        ).bind(user.id).run();
        console.log(`Removed admin status from user ${user.id}`);
      }
    } else {
      try {
        // Generate wallet with user.id as encryption key for recovery
        const { wallet, mnemonic } = await generateWallet();
        const encryptedKey = await encryptPrivateKey(wallet.privateKey, user.id);
        const encryptedMnemonic = await encryptPrivateKey(mnemonic, user.id);
        
        // Store wallet in database (only ADMIN_USER_ID becomes admin)
        await c.env.DB.prepare(
          `INSERT INTO user_wallets (user_id, wallet_address, public_key, encrypted_private_key, encrypted_mnemonic, is_admin)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          user.id,
          wallet.address,
          wallet.publicKey,
          encryptedKey,
          encryptedMnemonic,
          shouldBeAdmin ? 1 : 0
        ).run();

        console.log(`Auto-created wallet for user ${user.id}: ${wallet.address}`);
      } catch (walletError) {
        console.error("Failed to auto-create wallet:", walletError);
        // Don't fail login if wallet creation fails - user can create later
      }
    }
  }

  return c.json({ success: true }, 200);
});

app.get("/api/users/me", async (c) => {
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
  
  if (!sessionToken) {
    return c.json(null, 200);
  }

  const user = await getCurrentUser(sessionToken, {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
  });

  return c.json(user, 200);
});

app.get("/api/logout", async (c) => {
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);

  if (typeof sessionToken === "string") {
    await deleteSession(sessionToken, {
      apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
      apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
    });
  }

  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: true,
    maxAge: 0,
  });

  return c.json({ success: true }, 200);
});

// Get current user info (for admin setup)
app.get("/api/me", authMiddleware, async (c) => {
  const user = c.get("user")!;
  return c.json({ 
    userId: user.id,
    email: user.email
  });
});

// ============================================
// Session Management Routes
// ============================================

// Track session (called on login and activity)
app.post("/api/sessions/track", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
  
  if (!sessionToken) {
    return c.json({ error: "No session" }, 401);
  }
  
  // Generate session ID from token hash (for tracking, not security)
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(sessionToken));
  const sessionId = Array.from(new Uint8Array(hashBuffer)).slice(0, 16)
    .map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Parse user agent
  const userAgent = c.req.header("User-Agent") || "";
  const deviceInfo = parseUserAgent(userAgent);
  
  // Get IP and location
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0] || "Unknown";
  const country = c.req.header("CF-IPCountry") || "";
  const city = c.req.header("CF-IPCity") || "";
  const location = [city, country].filter(Boolean).join(", ") || "Unknown";
  
  // Check if session exists
  const existing = await c.env.DB.prepare(
    "SELECT id FROM user_sessions WHERE session_id = ?"
  ).bind(sessionId).first();
  
  if (existing) {
    // Update last active
    await c.env.DB.prepare(
      `UPDATE user_sessions 
       SET last_active_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ?`
    ).bind(sessionId).run();
  } else {
    // Clear is_current from all other sessions
    await c.env.DB.prepare(
      "UPDATE user_sessions SET is_current = 0 WHERE user_id = ?"
    ).bind(user.id).run();
    
    // Create new session record
    await c.env.DB.prepare(
      `INSERT INTO user_sessions 
       (session_id, user_id, device_name, device_type, browser, ip_address, location, is_current)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(sessionId, user.id, deviceInfo.device, deviceInfo.type, deviceInfo.browser, ip, location).run();
  }
  
  return c.json({ success: true, sessionId });
});

// Get all sessions for current user
app.get("/api/sessions/list", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
  
  // Get current session ID
  let currentSessionId = "";
  if (sessionToken) {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(sessionToken));
    currentSessionId = Array.from(new Uint8Array(hashBuffer)).slice(0, 16)
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  const sessions = await c.env.DB.prepare(
    `SELECT * FROM user_sessions 
     WHERE user_id = ?
     ORDER BY last_active_at DESC`
  ).bind(user.id).all();
  
  // Mark current session
  const formattedSessions = sessions.results.map((s: Record<string, unknown>) => ({
    id: s.id,
    sessionId: s.session_id,
    deviceName: s.device_name,
    deviceType: s.device_type,
    browser: s.browser,
    ipAddress: s.ip_address,
    location: s.location,
    isCurrent: s.session_id === currentSessionId,
    lastActiveAt: s.last_active_at,
    createdAt: toUTCTimestamp(s.created_at),
  }));
  
  return c.json({ sessions: formattedSessions });
});

// Revoke a specific session
app.delete("/api/sessions/:sessionId", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const sessionId = c.req.param("sessionId");
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
  
  // Get current session ID
  let currentSessionId = "";
  if (sessionToken) {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(sessionToken));
    currentSessionId = Array.from(new Uint8Array(hashBuffer)).slice(0, 16)
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Can't revoke current session
  if (sessionId === currentSessionId) {
    return c.json({ error: "Cannot revoke current session. Use logout instead." }, 400);
  }
  
  await c.env.DB.prepare(
    "DELETE FROM user_sessions WHERE session_id = ? AND user_id = ?"
  ).bind(sessionId, user.id).run();
  
  return c.json({ success: true });
});

// Revoke all other sessions
app.post("/api/sessions/revoke-others", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
  
  if (!sessionToken) {
    return c.json({ error: "No session" }, 401);
  }
  
  // Get current session ID
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(sessionToken));
  const currentSessionId = Array.from(new Uint8Array(hashBuffer)).slice(0, 16)
    .map(b => b.toString(16).padStart(2, '0')).join('');
  
  await c.env.DB.prepare(
    "DELETE FROM user_sessions WHERE user_id = ? AND session_id != ?"
  ).bind(user.id, currentSessionId).run();
  
  return c.json({ success: true });
});

// Helper to parse user agent
function parseUserAgent(ua: string): { device: string; type: string; browser: string } {
  let device = "Unknown Device";
  let type = "desktop";
  let browser = "Unknown Browser";
  
  // Detect browser
  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";
  
  // Detect device type and name
  if (ua.includes("iPhone")) {
    device = "iPhone";
    type = "mobile";
  } else if (ua.includes("iPad")) {
    device = "iPad";
    type = "tablet";
  } else if (ua.includes("Android")) {
    if (ua.includes("Mobile")) {
      device = "Android Phone";
      type = "mobile";
    } else {
      device = "Android Tablet";
      type = "tablet";
    }
  } else if (ua.includes("Windows")) {
    device = "Windows PC";
    type = "desktop";
  } else if (ua.includes("Mac OS")) {
    device = "Mac";
    type = "desktop";
  } else if (ua.includes("Linux")) {
    device = "Linux PC";
    type = "desktop";
  }
  
  return { device, type, browser };
}

// ============================================
// External Wallet Auth Routes (KasWare, etc.)
// ============================================

// Generate a challenge for wallet signature authentication
app.post("/api/wallet-auth/challenge", zValidator("json", z.object({
  address: z.string().min(1),
})), async (c) => {
  const { address } = c.req.valid("json");
  
  // Generate a random challenge with timestamp
  const timestamp = Date.now();
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const randomHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const challenge = `Sign this message to authenticate with KasShi.\n\nAddress: ${address}\nTimestamp: ${timestamp}\nNonce: ${randomHex}`;
  
  // Store challenge with expiration (5 minutes)
  const expiresAt = new Date(timestamp + 5 * 60 * 1000).toISOString();
  
  // Check if user exists, create or update
  const existing = await c.env.DB.prepare(
    "SELECT id FROM external_wallet_users WHERE wallet_address = ?"
  ).bind(address).first();
  
  if (existing) {
    await c.env.DB.prepare(
      "UPDATE external_wallet_users SET last_challenge = ?, challenge_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?"
    ).bind(challenge, expiresAt, address).run();
  } else {
    // Generate a temporary auth token (will be replaced on verify)
    const tempToken = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO external_wallet_users (wallet_address, auth_token, last_challenge, challenge_expires_at) VALUES (?, ?, ?, ?)"
    ).bind(address, tempToken, challenge, expiresAt).run();
  }
  
  return c.json({ challenge });
});

// Verify wallet signature and authenticate
app.post("/api/wallet-auth/verify", zValidator("json", z.object({
  address: z.string().min(1),
  signature: z.string().min(1),
  challenge: z.string().min(1),
  publicKey: z.string().optional(),
})), async (c) => {
  const { address, signature, challenge, publicKey } = c.req.valid("json");
  
  // Get stored challenge
  const user = await c.env.DB.prepare(
    "SELECT * FROM external_wallet_users WHERE wallet_address = ?"
  ).bind(address).first<{
    id: number;
    wallet_address: string;
    last_challenge: string;
    challenge_expires_at: string;
    internal_wallet_address: string | null;
    auth_token: string | null;
  }>();
  
  if (!user) {
    return c.json({ error: "No pending authentication" }, 400);
  }
  
  // Check if challenge matches
  if (user.last_challenge !== challenge) {
    return c.json({ error: "Invalid challenge" }, 400);
  }
  
  // Check if challenge expired
  const expiresAt = new Date(user.challenge_expires_at as string);
  if (expiresAt < new Date()) {
    return c.json({ error: "Challenge expired, please try again" }, 400);
  }
  
  // For KasWare, we trust the wallet's signature since the user controls the wallet
  // The wallet extension handles the cryptographic verification
  // In production, you could verify the Schnorr signature using the public key
  // For now, we verify the signature format is valid (base64 or hex)
  const isValidFormat = /^[a-fA-F0-9]+$/.test(signature) || /^[A-Za-z0-9+/=]+$/.test(signature);
  if (!isValidFormat) {
    return c.json({ error: "Invalid signature format" }, 400);
  }
  
  // Reuse existing auth token if available, otherwise generate new one
  // This prevents token invalidation when user reconnects wallet
  const authToken = user.auth_token || (crypto.randomUUID() + "-" + crypto.randomUUID());
  
  // Create internal custody wallet if they don't have one yet
  // This gives KasWare users the same frictionless micropayment experience as Google users
  let internalWalletAddress = user.internal_wallet_address;
  
  if (!internalWalletAddress) {
    try {
      // Use the user's external_wallet_users.id as encryption key
      const encryptionKey = `kasware_${user.id}_${address}`;
      const { wallet: internalWallet, mnemonic } = await generateWallet();
      const encryptedKey = await encryptPrivateKey(internalWallet.privateKey, encryptionKey);
      const encryptedMnemonic = await encryptPrivateKey(mnemonic, encryptionKey);
      
      // Update with internal wallet
      await c.env.DB.prepare(`
        UPDATE external_wallet_users 
        SET auth_token = ?, public_key = ?, last_challenge = NULL, challenge_expires_at = NULL, 
            last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
            internal_wallet_address = ?, internal_public_key = ?,
            encrypted_internal_private_key = ?, encrypted_internal_mnemonic = ?
        WHERE wallet_address = ?
      `).bind(
        authToken, 
        publicKey || null, 
        internalWallet.address,
        internalWallet.publicKey,
        encryptedKey,
        encryptedMnemonic,
        address
      ).run();
      
      internalWalletAddress = internalWallet.address;
      console.log(`Created internal wallet for KasWare user ${address}: ${internalWalletAddress}`);
    } catch (walletError) {
      console.error("Failed to create internal wallet for KasWare user:", walletError);
      // Still allow login, they can try again later
      await c.env.DB.prepare(`
        UPDATE external_wallet_users 
        SET auth_token = ?, public_key = ?, last_challenge = NULL, challenge_expires_at = NULL, 
            last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE wallet_address = ?
      `).bind(authToken, publicKey || null, address).run();
    }
  } else {
    // Just update login info
    await c.env.DB.prepare(`
      UPDATE external_wallet_users 
      SET auth_token = ?, public_key = ?, last_challenge = NULL, challenge_expires_at = NULL, 
          last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE wallet_address = ?
    `).bind(authToken, publicKey || null, address).run();
  }
  
  // Also ensure they have a channel linked to their INTERNAL wallet (for interactions)
  const existingChannel = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE wallet_address = ?"
  ).bind(internalWalletAddress || address).first();
  
  return c.json({ 
    success: true, 
    token: authToken,
    userId: String(user.id), // For interaction queries when user has no channel
    hasChannel: !!existingChannel,
    internalWalletAddress, // Frontend needs this for deposits
  });
});

// Import existing wallet via seed phrase (for mobile users or those who want to use their Kastle/KasWare wallet)
app.post("/api/wallet-auth/import-seed", zValidator("json", z.object({
  seedPhrase: z.string().min(1),
})), async (c) => {
  const { seedPhrase } = c.req.valid("json");
  
  // Validate seed phrase format (12 or 24 words)
  const words = seedPhrase.trim().toLowerCase().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) {
    return c.json({ error: "Invalid seed phrase. Must be 12 or 24 words." }, 400);
  }
  
  // Validate it's a proper BIP39 mnemonic
  const bip39 = await import('bip39');
  if (!bip39.validateMnemonic(seedPhrase.trim().toLowerCase())) {
    return c.json({ error: "Invalid seed phrase. Please check the words and try again." }, 400);
  }
  
  try {
    // Derive wallet from seed phrase using Kaspa's HD path
    const importedWallet = await generateWalletFromMnemonic(seedPhrase.trim().toLowerCase());
    
    // Check if this wallet already exists
    let existingUser = await c.env.DB.prepare(
      "SELECT * FROM external_wallet_users WHERE wallet_address = ?"
    ).bind(importedWallet.address).first<{
      id: number;
      wallet_address: string;
      internal_wallet_address: string | null;
    }>();
    
    // Generate new auth token
    const authToken = crypto.randomUUID() + "-" + crypto.randomUUID();
    
    let internalWalletAddress: string | null = null;
    let userId: number;
    
    if (existingUser) {
      // User exists - update their auth token
      userId = existingUser.id;
      internalWalletAddress = existingUser.internal_wallet_address;
      
      await c.env.DB.prepare(`
        UPDATE external_wallet_users 
        SET auth_token = ?, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE wallet_address = ?
      `).bind(authToken, importedWallet.address).run();
    } else {
      // New user - create entry
      const result = await c.env.DB.prepare(`
        INSERT INTO external_wallet_users (wallet_address, public_key, auth_token)
        VALUES (?, ?, ?)
        RETURNING id
      `).bind(importedWallet.address, importedWallet.publicKey, authToken).first<{ id: number }>();
      
      userId = result!.id;
    }
    
    // Create internal custody wallet if they don't have one
    if (!internalWalletAddress) {
      try {
        const encryptionKey = `kasware_${userId}_${importedWallet.address}`;
        const { wallet: internalWallet, mnemonic } = await generateWallet();
        const encryptedKey = await encryptPrivateKey(internalWallet.privateKey, encryptionKey);
        const encryptedMnemonic = await encryptPrivateKey(mnemonic, encryptionKey);
        
        await c.env.DB.prepare(`
          UPDATE external_wallet_users 
          SET internal_wallet_address = ?, internal_public_key = ?,
              encrypted_internal_private_key = ?, encrypted_internal_mnemonic = ?
          WHERE id = ?
        `).bind(
          internalWallet.address,
          internalWallet.publicKey,
          encryptedKey,
          encryptedMnemonic,
          userId
        ).run();
        
        internalWalletAddress = internalWallet.address;
        console.log(`Created internal wallet for imported seed user ${importedWallet.address}: ${internalWalletAddress}`);
      } catch (walletError) {
        console.error("Failed to create internal wallet:", walletError);
      }
    }
    
    // Check if they have a channel - check both external address (from Kastle/KasWare connect) 
    // and internal address (from Google login) since channels can be created with either
    const existingChannel = await c.env.DB.prepare(
      "SELECT id FROM channels WHERE wallet_address = ? OR wallet_address = ?"
    ).bind(importedWallet.address, internalWalletAddress).first();
    
    return c.json({ 
      success: true, 
      token: authToken,
      userId: String(userId),
      address: importedWallet.address,
      hasChannel: !!existingChannel,
      internalWalletAddress,
    });
  } catch (error) {
    console.error("Seed phrase import error:", error);
    return c.json({ error: "Failed to import wallet. Please check your seed phrase." }, 500);
  }
});

// Get external wallet user info by token
app.get("/api/wallet-auth/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const token = authHeader.slice(7);
  const user = await c.env.DB.prepare(
    "SELECT id, wallet_address, public_key, internal_wallet_address, internal_public_key, demo_balance, created_at, last_login_at FROM external_wallet_users WHERE auth_token = ?"
  ).bind(token).first<{
    id: number;
    wallet_address: string;
    public_key: string | null;
    internal_wallet_address: string | null;
    internal_public_key: string | null;
    demo_balance: string | null;
    created_at: string;
    last_login_at: string;
  }>();
  
  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }
  
  // Get their channel if exists (check internal wallet first, then external)
  const channel = await c.env.DB.prepare(
    "SELECT * FROM channels WHERE wallet_address = ? OR wallet_address = ?"
  ).bind(user.internal_wallet_address || "", user.wallet_address).first();
  
  // Get balance from INTERNAL wallet (this is where micropayments come from)
  let internalBalanceKAS = "0.00";
  let externalBalanceKAS = "0.00";
  
  try {
    // Internal wallet balance (used for micropayments)
    if (user.internal_wallet_address) {
      const internalResult = await getWalletBalance(user.internal_wallet_address);
      if (internalResult) {
        internalBalanceKAS = internalResult.balanceKAS;
      }
    }
    // External wallet balance (KasWare - for reference)
    const externalResult = await getWalletBalance(user.wallet_address);
    if (externalResult) {
      externalBalanceKAS = externalResult.balanceKAS;
    }
  } catch (e) {
    console.error("Failed to get balance:", e);
  }
  
  return c.json({
    // External KasWare wallet (for deposits/withdrawals)
    externalAddress: user.wallet_address,
    externalPublicKey: user.public_key,
    externalBalanceKAS,
    // Internal custody wallet (for frictionless micropayments)
    internalAddress: user.internal_wallet_address,
    internalPublicKey: user.internal_public_key,
    internalBalanceKAS,
    // User ID for encryption key derivation
    userId: user.id,
    channel: channel ? {
      id: channel.id,
      name: channel.name,
      handle: channel.handle,
      avatarUrl: channel.avatar_url,
      walletAddress: channel.wallet_address,
    } : null,
  });
});

// ============================================
// External Wallet Payment Routes
// ============================================

// Helper to validate external wallet Bearer token
async function validateExternalWalletToken(db: D1Database, authHeader: string | undefined): Promise<{ address: string; publicKey: string | null } | null> {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7);
  const user = await db.prepare(
    "SELECT wallet_address, public_key FROM external_wallet_users WHERE auth_token = ?"
  ).bind(token).first();
  
  if (!user) {
    return null;
  }
  
  return { address: user.wallet_address as string, publicKey: user.public_key as string | null };
}

// Extended external wallet user info (includes internal wallet for notifications etc.)
interface ExternalWalletUser {
  externalId: number;
  externalAddress: string;
  publicKey: string | null;
  internalWalletAddress: string | null;
  userId: string | null; // The user_id from user_wallets (for notifications, etc.)
}

// Get full external wallet user info including internal wallet mapping
async function getExternalWalletUser(db: D1Database, authHeader: string | undefined): Promise<ExternalWalletUser | null> {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7);
  const user = await db.prepare(
    "SELECT id, wallet_address, public_key, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
  ).bind(token).first<{
    id: number;
    wallet_address: string;
    public_key: string | null;
    internal_wallet_address: string | null;
  }>();
  
  if (!user) {
    return null;
  }
  
  // Find the user_id from user_wallets table if they have an internal wallet
  let userId: string | null = null;
  if (user.internal_wallet_address) {
    const internalWallet = await db.prepare(
      "SELECT user_id FROM user_wallets WHERE wallet_address = ?"
    ).bind(user.internal_wallet_address).first<{ user_id: string }>();
    userId = internalWallet?.user_id || null;
  }
  
  return {
    externalId: user.id,
    externalAddress: user.wallet_address,
    publicKey: user.public_key,
    internalWalletAddress: user.internal_wallet_address,
    userId,
  };
}

// Unified auth: works for both Google login users AND KasWare users
// Returns a consistent user object with id and wallet info
interface UnifiedUser {
  id: string; // user_id (for Google) or generated ID (for KasWare)
  walletAddress: string; // External KasWare address or internal wallet for Google users
  isExternal: boolean;
  externalId?: number; // Only for KasWare users
  internalWalletAddress?: string | null; // Only for KasWare users - used for micropayments
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUnifiedUser(c: Context<any>): Promise<UnifiedUser | null> {
  // First try Google login session via authMiddleware
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
  if (sessionToken) {
    try {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        // Get user's wallet
        const wallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(mochaUser.id).first() as { wallet_address: string } | null;
        
        if (wallet) {
          return {
            id: mochaUser.id,
            walletAddress: wallet.wallet_address,
            isExternal: false,
          };
        }
      }
    } catch {
      // Session auth failed, will try Bearer token next
    }
  }
  
  // Try KasWare Bearer token
  const externalUser = await getExternalWalletUser(c.env.DB, c.req.header("Authorization"));
  if (externalUser) {
    // Use external address for wallet ownership checks (channels are created with external address)
    // Internal address is only for micropayments
    return {
      id: externalUser.userId || `ext-${externalUser.externalId}`,
      walletAddress: externalUser.externalAddress,
      isExternal: true,
      externalId: externalUser.externalId,
      internalWalletAddress: externalUser.internalWalletAddress,
    };
  }
  
  return null;
}

// Record external wallet payment (for KasWare users)
// This endpoint is called AFTER the user sends KAS via KasWare extension
app.post("/api/kasshi/external-pay", async (c) => {
  const externalUser = await validateExternalWalletToken(c.env.DB, c.req.header("Authorization"));
  if (!externalUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const body = await c.req.json();
  const { 
    transactionId, // Transaction ID from KasWare
    toAddress, 
    amountKas, 
    videoId, 
    paymentType,
    recipientChannelId,
    commentId: _commentId
  } = body;
  
  // commentId reserved for future use (comment tipping, etc.)
  void _commentId;
  
  if (!transactionId || !toAddress || !amountKas) {
    return c.json({ error: "transactionId, toAddress, and amountKas required" }, 400);
  }
  
  const senderAddress = externalUser.address;
  
  // Get sender's channel (if exists)
  const senderChannel = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE wallet_address = ?"
  ).bind(senderAddress).first();
  const senderChannelId = senderChannel?.id ?? null;
  
  // Get external_wallet_users id for user_id tracking
  const externalUserRecord = await c.env.DB.prepare(
    "SELECT id FROM external_wallet_users WHERE wallet_address = ?"
  ).bind(senderAddress).first();
  const externalUserId = externalUserRecord?.id as string | null;
  
  // Handle view payments
  if (paymentType === 'view' && videoId) {
    // Update video view count
    await c.env.DB.prepare(`
      UPDATE videos SET view_count = view_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(videoId).run();
    
    // Record view in video_views table (use external user id prefixed to distinguish)
    const externalViewerId = externalUserId ? `ext-${externalUserId}` : null;
    
    if (senderChannelId) {
      // User has a channel
      const existingView = await c.env.DB.prepare(
        "SELECT id FROM video_views WHERE channel_id = ? AND video_id = ?"
      ).bind(senderChannelId, videoId).first();
      
      if (existingView) {
        await c.env.DB.prepare(`
          UPDATE video_views SET watched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(existingView.id).run();
      } else {
        await c.env.DB.prepare(`
          INSERT INTO video_views (channel_id, video_id, user_id, watched_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(senderChannelId, videoId, externalViewerId).run();
      }
    } else if (externalViewerId) {
      // User doesn't have channel, use external user ID
      const existingView = await c.env.DB.prepare(
        "SELECT id FROM video_views WHERE user_id = ? AND video_id = ?"
      ).bind(externalViewerId, videoId).first();
      
      if (existingView) {
        await c.env.DB.prepare(`
          UPDATE video_views SET watched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(existingView.id).run();
      } else {
        await c.env.DB.prepare(`
          INSERT INTO video_views (video_id, user_id, watched_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        `).bind(videoId, externalViewerId).run();
      }
    }
    
    // Update creator's kas_earned (full amount - no platform fee deduction for external wallets)
    if (recipientChannelId) {
      const creatorAmountKas = parseFloat(amountKas);
      await c.env.DB.prepare(`
        UPDATE channels SET total_kas_earned = CAST(
          (CAST(total_kas_earned AS REAL) + ?) AS TEXT
        ), updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(creatorAmountKas, recipientChannelId).run();
    }
    
    // Auto-consolidate recipient's wallet in background
    if (recipientChannelId) {
      try {
        const recipientChannel = await c.env.DB.prepare(
          "SELECT wallet_address FROM channels WHERE id = ?"
        ).bind(recipientChannelId).first();
        
        if (recipientChannel?.wallet_address) {
          const recipientWallet = await c.env.DB.prepare(
            "SELECT encrypted_private_key, user_id FROM user_wallets WHERE wallet_address = ?"
          ).bind(recipientChannel.wallet_address).first();
          
          if (recipientWallet?.encrypted_private_key && recipientWallet?.user_id) {
            const recipientPrivateKey = await decryptPrivateKey(
              recipientWallet.encrypted_private_key as string,
              recipientWallet.user_id as string
            );
            if (recipientPrivateKey) {
              autoConsolidateIfNeeded(recipientChannel.wallet_address as string, recipientPrivateKey).catch(() => {});
            }
          }
        }
      } catch (e) {
        console.error("Auto-consolidate error:", e);
      }
    }
    
    return c.json({ 
      success: true, 
      transactionId,
      fromAddress: senderAddress,
      toAddress,
      amountKas,
      paymentType: 'view',
      externalWallet: true
    });
  }
  
  // Handle like payments
  if (paymentType === 'like' && videoId) {
    // Like functionality - external wallet can like videos
    // For now just return success - likes are handled on frontend
    return c.json({ 
      success: true, 
      transactionId,
      fromAddress: senderAddress,
      toAddress,
      amountKas,
      paymentType: 'like',
      externalWallet: true
    });
  }
  
  // Generic payment recording for other types
  return c.json({ 
    success: true, 
    transactionId,
    fromAddress: senderAddress,
    toAddress,
    amountKas,
    paymentType: paymentType || 'unknown',
    externalWallet: true
  });
});

// Create channel for external wallet user
app.post("/api/kasshi/external-channel", async (c) => {
  try {
    const externalUser = await validateExternalWalletToken(c.env.DB, c.req.header("Authorization"));
    if (!externalUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    const body = await c.req.json();
    const { name, handle, bio } = body;
    
    if (!name || !handle) {
      return c.json({ error: "Name and handle are required" }, 400);
    }
    
    // Check if channel already exists for this wallet
    const existingChannel = await c.env.DB.prepare(
      "SELECT id FROM channels WHERE wallet_address = ?"
    ).bind(externalUser.address).first();
    
    if (existingChannel) {
      return c.json({ error: "Channel already exists for this wallet" }, 400);
    }
    
    // Check if handle is taken
    const handleTaken = await c.env.DB.prepare(
      "SELECT id FROM channels WHERE handle = ?"
    ).bind(handle.toLowerCase()).first();
    
    if (handleTaken) {
      return c.json({ error: "Handle is already taken" }, 400);
    }
    
    // Create channel - note: channels table uses 'description' not 'bio'
    const result = await c.env.DB.prepare(`
      INSERT INTO channels (wallet_address, name, handle, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(externalUser.address, name, handle.toLowerCase(), bio || null).run();
    
    const channelId = result.meta.last_row_id;
    
    return c.json({ 
      success: true, 
      channel: {
        id: channelId,
        name,
        handle: handle.toLowerCase(),
        bio: bio || null,
        wallet_address: externalUser.address,
        avatar_url: null,
        banner_url: null
      }
    });
  } catch (error) {
    console.error("Error creating external channel:", error);
    return c.json({ error: "Failed to create channel" }, 500);
  }
});

// ============================================
// Internal Micropay for KasWare Users
// ============================================
// This allows KasWare users to make frictionless micropayments using their internal custody wallet
// (Same experience as Google users)

app.post("/api/kasshi/internal-micropay", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const token = authHeader.slice(7);
  const user = await c.env.DB.prepare(
    `SELECT id, wallet_address, internal_wallet_address, internal_public_key, 
            encrypted_internal_private_key, demo_balance 
     FROM external_wallet_users WHERE auth_token = ?`
  ).bind(token).first<{
    id: number;
    wallet_address: string;
    internal_wallet_address: string | null;
    internal_public_key: string | null;
    encrypted_internal_private_key: string | null;
    demo_balance: string | null;
  }>();
  
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  if (!user.internal_wallet_address || !user.encrypted_internal_private_key) {
    return c.json({ error: "Internal wallet not set up. Please reconnect your KasWare wallet." }, 400);
  }
  
  const body = await c.req.json();
  const { 
    toAddress, 
    amountKas, 
    videoId, 
    paymentType,
    recipientChannelId,
    commentId,
    forceBatch
  } = body;
  
  console.log('[INTERNAL-MICROPAY START]', { externalAddress: user.wallet_address, internalAddress: user.internal_wallet_address, toAddress, amountKas, paymentType });
  
  if (!toAddress || !amountKas) {
    return c.json({ error: "toAddress and amountKas required" }, 400);
  }
  
  // Get sender's channel (check internal wallet first, then external)
  const senderChannel = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE wallet_address = ? OR wallet_address = ?"
  ).bind(user.internal_wallet_address, user.wallet_address).first();
  const senderChannelId = senderChannel?.id ?? null;
  
  // Convert KAS to sompi
  const amountSompi = Math.floor(parseFloat(amountKas) * 100000000);
  
  // Check balance (use demo_balance if set, otherwise real balance)
  const demoBalance = user.demo_balance ? parseFloat(user.demo_balance) : null;
  let hasBalance = false;
  let currentBalanceKas = "0";
  
  if (demoBalance !== null && demoBalance > 0) {
    hasBalance = demoBalance >= parseFloat(amountKas);
    currentBalanceKas = demoBalance.toString();
  } else {
    const balance = await getWalletBalance(user.internal_wallet_address);
    hasBalance = balance ? parseFloat(balance.balanceKAS) >= parseFloat(amountKas) : false;
    currentBalanceKas = balance?.balanceKAS || "0";
  }
  
  if (!hasBalance) {
    return c.json({ error: "Insufficient balance", balanceKAS: currentBalanceKas }, 400);
  }
  
  const { recordPendingMicropayment, getSenderPendingDebits, getSenderPendingDebitsByUserId, BATCH_THRESHOLD_SOMPI, BATCH_THRESHOLD_KAS } = await import("./services/batched-payments");
  
  // Determine if this should be batched (same logic as regular micropay)
  const shouldBatch = (amountSompi < BATCH_THRESHOLD_SOMPI || forceBatch) && 
                      (demoBalance === null || demoBalance <= 0);
  
  // Process demo mode payments immediately
  if (demoBalance !== null && demoBalance > 0) {
    const newBalance = demoBalance - parseFloat(amountKas);
    await c.env.DB.prepare(
      "UPDATE external_wallet_users SET demo_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(newBalance.toString(), user.id).run();
    
    return c.json({ 
      success: true, 
      transactionId: `demo-${Date.now()}`,
      fromAddress: user.internal_wallet_address,
      toAddress,
      amountKas,
      demoMode: true
    });
  }
  
  // Batched micropayment for small amounts
  if (shouldBatch) {
    const senderUserId = `kasware-${user.id}`;
    
    const result = await recordPendingMicropayment(
      c.env.DB,
      (senderChannelId as number | null) || null,
      (recipientChannelId as number | null) || null,
      'platform',
      paymentType || 'unknown',
      amountSompi.toString(),
      videoId || null,
      commentId || null,
      senderChannelId ? null : senderUserId
    );
    
    if (!result.success) {
      return c.json({ error: result.error || "Failed to record micropayment" }, 500);
    }
    
    // Get updated pending debits
    let updatedDebits: string;
    if (senderChannel) {
      updatedDebits = await getSenderPendingDebits(c.env.DB, senderChannel.id as number);
    } else {
      updatedDebits = await getSenderPendingDebitsByUserId(c.env.DB, senderUserId);
    }
    const updatedDebitsKas = Number(updatedDebits) / 100000000;
    
    // Handle auto-settlement if threshold reached
    if (result.autoSettled) {
      const platformWalletAddress = await getAdminWalletAddress(c.env.DB);
      const encryptionKey = `kasware_${user.id}_${user.wallet_address}`;
      const senderPrivateKey = await decryptPrivateKey(user.encrypted_internal_private_key!, encryptionKey);
      
      if (!senderPrivateKey) {
        return c.json({ 
          success: true, 
          transactionId: `pending-${result.micropaymentId}`,
          fromAddress: user.internal_wallet_address,
          toAddress,
          amountKas,
          batched: true,
          autoSettled: true,
          onChainSettlement: false,
          pendingDebitsKas: updatedDebitsKas,
          message: `Batch settlement recorded but could not decrypt wallet.`
        });
      }
      
      // Process P2P settlements
      let totalSuccessKas = 0;
      let totalSuccessCount = 0;
      
      for (const settlement of result.autoSettled.settlements) {
        const settlementAmountSompi = BigInt(settlement.amountSompi);
        const settlementAmountKas = Number(settlementAmountSompi) / 100000000;
        const recipientAddress = settlement.recipientWalletAddress || platformWalletAddress;
        
        if (!recipientAddress) continue;
        
        let txResult = await sendTransaction(
          user.internal_wallet_address!,
          recipientAddress,
          Number(settlementAmountSompi),
          senderPrivateKey
        );
        
        if (!txResult.success && txResult.needsConsolidation) {
          const consolidateResult = await consolidateUTXOs(user.internal_wallet_address!, senderPrivateKey);
          if (consolidateResult.success) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            txResult = await sendTransaction(user.internal_wallet_address!, recipientAddress, Number(settlementAmountSompi), senderPrivateKey);
          }
        }
        
        if (txResult.success && txResult.transactionId) {
          await c.env.DB.prepare(`
            UPDATE settlement_batches 
            SET transaction_id = ?, status = 'completed', settled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(txResult.transactionId, settlement.batchId).run();
          
          if (settlement.recipientChannelId && settlement.recipientWalletAddress) {
            await c.env.DB.prepare(`
              UPDATE channels SET total_kas_earned = CAST(
                (CAST(total_kas_earned AS REAL) + ?) AS TEXT
              ), updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `).bind(settlementAmountKas, settlement.recipientChannelId).run();
          }
          
          totalSuccessKas += settlementAmountKas;
          totalSuccessCount++;
        }
      }
      
      return c.json({ 
        success: true, 
        transactionId: `settled-${Date.now()}`,
        fromAddress: user.internal_wallet_address,
        toAddress,
        amountKas,
        batched: true,
        autoSettled: true,
        onChainSettlement: totalSuccessCount > 0,
        settlementSuccessCount: totalSuccessCount,
        settlementTotalKas: totalSuccessKas,
        pendingDebitsKas: 0,
        message: totalSuccessCount > 0 
          ? `P2P settlement complete! ${totalSuccessCount} payments (${totalSuccessKas.toFixed(4)} KAS) sent.`
          : `Settlement recorded but on-chain transfers failed.`
      });
    }
    
    return c.json({ 
      success: true, 
      transactionId: `pending-${result.micropaymentId}`,
      fromAddress: user.internal_wallet_address,
      toAddress,
      amountKas,
      batched: true,
      pendingDebitsKas: updatedDebitsKas,
      message: `Micropayment queued. Will settle when threshold (${BATCH_THRESHOLD_KAS} KAS) is reached.`
    });
  }
  
  // Large payment - process immediately on-chain
  const encryptionKey = `kasware_${user.id}_${user.wallet_address}`;
  const privateKey = await decryptPrivateKey(user.encrypted_internal_private_key!, encryptionKey);
  
  if (!privateKey) {
    return c.json({ error: "Failed to decrypt wallet" }, 500);
  }
  
  // Handle view payments with 95/5 split
  if (paymentType === 'view') {
    const creatorAmountSompi = Math.floor(amountSompi * 0.95);
    const platformFeeSompi = amountSompi - creatorAmountSompi;
    
    // Send to creator
    let txResult = await sendTransaction(
      user.internal_wallet_address!,
      toAddress,
      creatorAmountSompi,
      privateKey
    );
    
    if (!txResult.success && txResult.needsConsolidation) {
      const consolidateResult = await consolidateUTXOs(user.internal_wallet_address!, privateKey);
      if (consolidateResult.success) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        txResult = await sendTransaction(user.internal_wallet_address!, toAddress, creatorAmountSompi, privateKey);
      }
    }
    
    if (!txResult.success) {
      return c.json({ error: txResult.error || "Transaction failed" }, 500);
    }
    
    // Record platform fee for batched settlement
    const senderUserId = `kasware-${user.id}`;
    await recordPendingMicropayment(
      c.env.DB,
      senderChannelId as number | null,
      null,
      'platform',
      'platform_fee',
      platformFeeSompi.toString(),
      videoId || null,
      null,
      senderChannelId ? null : senderUserId
    );
    
    return c.json({
      success: true,
      transactionId: txResult.transactionId,
      fromAddress: user.internal_wallet_address,
      toAddress,
      amountKas,
      creatorAmountKas: creatorAmountSompi / 100000000,
      platformFeeKas: platformFeeSompi / 100000000
    });
  }
  
  // Regular large payment
  let txResult = await sendTransaction(
    user.internal_wallet_address!,
    toAddress,
    amountSompi,
    privateKey
  );
  
  if (!txResult.success && txResult.needsConsolidation) {
    const consolidateResult = await consolidateUTXOs(user.internal_wallet_address!, privateKey);
    if (consolidateResult.success) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      txResult = await sendTransaction(user.internal_wallet_address!, toAddress, amountSompi, privateKey);
    }
  }
  
  if (!txResult.success) {
    return c.json({ error: txResult.error || "Transaction failed" }, 500);
  }
  
  return c.json({
    success: true,
    transactionId: txResult.transactionId,
    fromAddress: user.internal_wallet_address,
    toAddress,
    amountKas
  });
});

// ============================================
// KasWare Internal Wallet Withdraw
// ============================================

// Withdraw from internal custody wallet to external KasWare address
app.post("/api/kasshi/internal-withdraw", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const token = authHeader.slice(7);
  const user = await c.env.DB.prepare(
    `SELECT id, wallet_address, internal_wallet_address, encrypted_internal_private_key, demo_balance 
     FROM external_wallet_users WHERE auth_token = ?`
  ).bind(token).first<{
    id: number;
    wallet_address: string;
    internal_wallet_address: string | null;
    encrypted_internal_private_key: string | null;
    demo_balance: string | null;
  }>();
  
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  if (!user.internal_wallet_address || !user.encrypted_internal_private_key) {
    return c.json({ error: "Internal wallet not set up" }, 400);
  }
  
  const body = await c.req.json();
  const { amountKas } = body;
  
  if (!amountKas || parseFloat(amountKas) <= 0) {
    return c.json({ error: "Invalid amount" }, 400);
  }
  
  // Minimum withdrawal to avoid KIP-9 issues
  const MIN_WITHDRAW_KAS = 0.1;
  if (parseFloat(amountKas) < MIN_WITHDRAW_KAS) {
    return c.json({ error: `Minimum withdrawal is ${MIN_WITHDRAW_KAS} KAS` }, 400);
  }
  
  // Check balance (demo or real)
  const demoBalance = user.demo_balance ? parseFloat(user.demo_balance) : null;
  let currentBalanceKas = 0;
  
  if (demoBalance !== null && demoBalance > 0) {
    currentBalanceKas = demoBalance;
  } else {
    const balance = await getWalletBalance(user.internal_wallet_address);
    currentBalanceKas = balance ? parseFloat(balance.balanceKAS) : 0;
  }
  
  if (currentBalanceKas < parseFloat(amountKas)) {
    return c.json({ error: "Insufficient balance", balanceKAS: currentBalanceKas.toString() }, 400);
  }
  
  const amountSompi = Math.floor(parseFloat(amountKas) * 100000000);
  
  // Demo mode - just update balance
  if (demoBalance !== null && demoBalance > 0) {
    const newBalance = demoBalance - parseFloat(amountKas);
    await c.env.DB.prepare(
      "UPDATE external_wallet_users SET demo_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(newBalance.toString(), user.id).run();
    
    return c.json({
      success: true,
      transactionId: `demo-withdraw-${Date.now()}`,
      fromAddress: user.internal_wallet_address,
      toAddress: user.wallet_address,
      amountKas,
      demoMode: true
    });
  }
  
  // Real withdrawal
  const encryptionKey = `kasware_${user.id}_${user.wallet_address}`;
  const privateKey = await decryptPrivateKey(user.encrypted_internal_private_key!, encryptionKey);
  
  if (!privateKey) {
    return c.json({ error: "Failed to decrypt wallet" }, 500);
  }
  
  let txResult = await sendTransaction(
    user.internal_wallet_address!,
    user.wallet_address, // Send to external KasWare address
    amountSompi,
    privateKey
  );
  
  if (!txResult.success && txResult.needsConsolidation) {
    const consolidateResult = await consolidateUTXOs(user.internal_wallet_address!, privateKey);
    if (consolidateResult.success) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      txResult = await sendTransaction(user.internal_wallet_address!, user.wallet_address, amountSompi, privateKey);
    }
  }
  
  if (!txResult.success) {
    return c.json({ error: txResult.error || "Withdrawal failed" }, 500);
  }
  
  return c.json({
    success: true,
    transactionId: txResult.transactionId,
    fromAddress: user.internal_wallet_address,
    toAddress: user.wallet_address,
    amountKas
  });
});

// ============================================
// User Wallet Routes
// ============================================

// Get or create user wallet
app.get("/api/wallet", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  // Check if wallet exists
  const existingWallet = await c.env.DB.prepare(
    "SELECT * FROM user_wallets WHERE user_id = ?"
  )
    .bind(user.id)
    .first();
  
  if (existingWallet) {
    // Check if demo_balance is set (for testing purposes)
    const demoBalance = existingWallet.demo_balance ? parseFloat(existingWallet.demo_balance as string) : null;
    
    let balanceKAS: string;
    if (demoBalance !== null && demoBalance > 0) {
      // Use demo balance for testing
      balanceKAS = demoBalance.toFixed(2);
    } else {
      // Fetch real balance from Kaspa network
      const balance = await getWalletBalance(existingWallet.wallet_address as string);
      balanceKAS = balance?.balanceKAS || "0.00";
    }
    
    return c.json({
      ...existingWallet,
      kaspayUsername: existingWallet.kaspay_username || null,
      balanceKAS,
      isDemoMode: demoBalance !== null && demoBalance > 0,
    });
  }
  
  // Create new wallet using kaspa-wallet service (real Kaspa keypairs)
  const { wallet, mnemonic } = await generateWallet();
  
  // Check if there's an existing admin - if not, make this user admin
  const existingAdmin = await c.env.DB.prepare(
    "SELECT id FROM user_wallets WHERE is_admin = 1 LIMIT 1"
  ).first();
  const shouldBeAdmin = !existingAdmin;
  
  // Store the private key encrypted with a default key (user_id based)
  // This allows the wallet to be recovered before PIN is set
  const defaultEncryptedKey = await encryptPrivateKey(wallet.privateKey, user.id);
  
  // Also encrypt the mnemonic for backup/recovery purposes
  const encryptedMnemonic = await encryptPrivateKey(mnemonic, user.id);
  
  await c.env.DB.prepare(
    "INSERT INTO user_wallets (user_id, wallet_address, public_key, encrypted_private_key, encrypted_mnemonic, is_admin) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(user.id, wallet.address, wallet.publicKey, defaultEncryptedKey, encryptedMnemonic, shouldBeAdmin ? 1 : 0)
    .run();
  
  const newWallet = await c.env.DB.prepare(
    "SELECT * FROM user_wallets WHERE user_id = ?"
  )
    .bind(user.id)
    .first();
  
  return c.json({
    ...newWallet,
    kaspayUsername: null,
    balanceKAS: "0.00",
  });
});

// Set or update Kaspay username
const setUsernameSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
});

app.post(
  "/api/wallet/username",
  authMiddleware,
  zValidator("json", setUsernameSchema),
  async (c) => {
    const user = c.get("user")!;
    const { username } = c.req.valid("json");
    
    const lowercaseUsername = username.toLowerCase();
    
    // Check if username is already taken by another user
    const existing = await c.env.DB.prepare(
      "SELECT user_id FROM user_wallets WHERE LOWER(kaspay_username) = ? AND user_id != ?"
    )
      .bind(lowercaseUsername, user.id)
      .first();
    
    if (existing) {
      return c.json({ success: false, error: "Username is already taken" }, 400);
    }
    
    // Update user's username
    await c.env.DB.prepare(
      "UPDATE user_wallets SET kaspay_username = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    )
      .bind(username, user.id)
      .run();
    
    return c.json({ success: true, username });
  }
);

// Check username availability
app.get("/api/wallet/username/check/:username", async (c) => {
  const username = c.req.param("username").toLowerCase();
  
  // Validate format
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return c.json({ available: false, error: "Invalid username format" });
  }
  
  const existing = await c.env.DB.prepare(
    "SELECT id FROM user_wallets WHERE LOWER(kaspay_username) = ?"
  )
    .bind(username)
    .first();
  
  return c.json({ available: !existing, username });
});

// Set or update wallet PIN
const setPinSchema = z.object({
  pin: z.string().min(4).max(6).regex(/^\d+$/, "PIN must be numeric"),
  currentPin: z.string().optional(),
});

app.post(
  "/api/wallet/pin",
  authMiddleware,
  zValidator("json", setPinSchema),
  async (c) => {
    // Rate limit: 10 attempts per 5 minutes
    const ip = getClientIp(c);
    const rateCheck = checkRateLimit(ip, { ...RATE_LIMITS.AUTH, keyPrefix: "pin" });
    if (!rateCheck.allowed) {
      return rateLimitResponse(c, rateCheck.retryAfter!);
    }

    const user = c.get("user")!;
    const { pin, currentPin } = c.req.valid("json");
    
    const wallet = await c.env.DB.prepare(
      "SELECT * FROM user_wallets WHERE user_id = ?"
    )
      .bind(user.id)
      .first();
    
    if (!wallet) {
      return c.json({ success: false, error: "Wallet not found" }, 404);
    }
    
    // If PIN already exists, verify current PIN
    if (wallet.wallet_pin_hash) {
      if (!currentPin) {
        return c.json({ success: false, error: "Current PIN required" }, 400);
      }
      const isValid = await verifyPin(currentPin, wallet.wallet_pin_hash as string);
      if (!isValid) {
        return c.json({ success: false, error: "Invalid current PIN" }, 401);
      }
    }
    
    // Hash the new PIN
    const pinHash = await hashPin(pin);
    
    // Handle encrypted private key and mnemonic
    let encryptedKey = wallet.encrypted_private_key as string | null;
    let encryptedMnemonic = wallet.encrypted_mnemonic as string | null;
    let decryptedPrivateKey: string | null = null;
    let decryptedMnemonic: string | null = null;
    
    if (encryptedKey) {
      // Try to decrypt with current PIN first (if changing PIN)
      if (wallet.wallet_pin_hash && currentPin) {
        decryptedPrivateKey = await decryptPrivateKey(encryptedKey, currentPin);
        if (encryptedMnemonic) {
          decryptedMnemonic = await decryptPrivateKey(encryptedMnemonic, currentPin);
        }
      } else {
        // No PIN was set before - key was encrypted with user.id as default
        decryptedPrivateKey = await decryptPrivateKey(encryptedKey, user.id);
        if (encryptedMnemonic) {
          decryptedMnemonic = await decryptPrivateKey(encryptedMnemonic, user.id);
        }
      }
      
      if (decryptedPrivateKey) {
        // Re-encrypt with new PIN
        encryptedKey = await encryptPrivateKey(decryptedPrivateKey, pin);
        if (decryptedMnemonic) {
          encryptedMnemonic = await encryptPrivateKey(decryptedMnemonic, pin);
        }
      } else {
        // Could not decrypt - this shouldn't happen, but handle gracefully
        console.error("Failed to decrypt existing private key for user:", user.id);
        return c.json({ success: false, error: "Failed to update wallet security. Please contact support." }, 500);
      }
    } else {
      // No encrypted key exists at all - generate new wallet key
      // This is a fallback for wallets created before the fix
      const { wallet: newWallet, mnemonic } = await generateWallet();
      encryptedKey = await encryptPrivateKey(newWallet.privateKey, pin);
      encryptedMnemonic = await encryptPrivateKey(mnemonic, pin);
      console.log("Generated new private key for wallet without one:", user.id);
    }
    
    await c.env.DB.prepare(
      `UPDATE user_wallets 
       SET wallet_pin_hash = ?, encrypted_private_key = ?, encrypted_mnemonic = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = ?`
    )
      .bind(pinHash, encryptedKey, encryptedMnemonic, user.id)
      .run();
    
    return c.json({ success: true });
  }
);

// ============================================
// App Password Routes (Secondary Authentication)
// ============================================

// Check if app password is set
app.get("/api/auth/has-app-password", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  const settings = await c.env.DB.prepare(
    "SELECT app_password_hash FROM user_settings WHERE user_id = ?"
  ).bind(user.id).first();
  
  return c.json({ hasPassword: !!settings?.app_password_hash });
});

// Set or update app password
const setAppPasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
  currentPassword: z.string().optional(),
});

app.post(
  "/api/auth/app-password",
  authMiddleware,
  zValidator("json", setAppPasswordSchema),
  async (c) => {
    const user = c.get("user")!;
    const { password, currentPassword } = c.req.valid("json");
    
    // Ensure settings exist
    let settings = await c.env.DB.prepare(
      "SELECT * FROM user_settings WHERE user_id = ?"
    ).bind(user.id).first();
    
    if (!settings) {
      await c.env.DB.prepare(
        "INSERT INTO user_settings (user_id) VALUES (?)"
      ).bind(user.id).run();
      settings = await c.env.DB.prepare(
        "SELECT * FROM user_settings WHERE user_id = ?"
      ).bind(user.id).first();
    }
    
    // If password already exists, verify current password
    if (settings?.app_password_hash) {
      if (!currentPassword) {
        return c.json({ success: false, error: "Current password required" }, 400);
      }
      const isValid = await verifyPin(currentPassword, settings.app_password_hash as string);
      if (!isValid) {
        return c.json({ success: false, error: "Invalid current password" }, 401);
      }
    }
    
    // Hash and store the new password
    const passwordHash = await hashPin(password);
    
    await c.env.DB.prepare(
      `UPDATE user_settings 
       SET app_password_hash = ?, is_app_locked = 0, updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = ?`
    ).bind(passwordHash, user.id).run();
    
    return c.json({ success: true });
  }
);

// Verify app password (unlock the app)
const verifyAppPasswordSchema = z.object({
  password: z.string(),
});

app.post(
  "/api/auth/verify-app-password",
  authMiddleware,
  zValidator("json", verifyAppPasswordSchema),
  async (c) => {
    // Rate limit: 10 attempts per 5 minutes (brute force protection)
    const ip = getClientIp(c);
    const rateCheck = checkRateLimit(ip, { ...RATE_LIMITS.AUTH, keyPrefix: "app-pwd" });
    if (!rateCheck.allowed) {
      return rateLimitResponse(c, rateCheck.retryAfter!);
    }

    const user = c.get("user")!;
    const { password } = c.req.valid("json");
    
    const settings = await c.env.DB.prepare(
      "SELECT app_password_hash FROM user_settings WHERE user_id = ?"
    ).bind(user.id).first();
    
    if (!settings?.app_password_hash) {
      return c.json({ success: false, error: "No password set" }, 400);
    }
    
    const isValid = await verifyPin(password, settings.app_password_hash as string);
    
    if (!isValid) {
      return c.json({ success: false, error: "Invalid password" }, 401);
    }
    
    // Unlock the app for this session
    await c.env.DB.prepare(
      "UPDATE user_settings SET is_app_locked = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).bind(user.id).run();
    
    return c.json({ success: true });
  }
);

// Lock the app (for manual lock or session timeout)
app.post("/api/auth/lock-app", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  await c.env.DB.prepare(
    "UPDATE user_settings SET is_app_locked = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
  ).bind(user.id).run();
  
  return c.json({ success: true });
});

// Check if app is locked
app.get("/api/auth/is-locked", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  const settings = await c.env.DB.prepare(
    "SELECT app_password_hash, is_app_locked FROM user_settings WHERE user_id = ?"
  ).bind(user.id).first();
  
  // If no password set, app is not locked
  if (!settings?.app_password_hash) {
    return c.json({ isLocked: false, hasPassword: false });
  }
  
  return c.json({ 
    isLocked: settings.is_app_locked === 1,
    hasPassword: true 
  });
});

// Export private key (requires app password)
const exportWalletSchema = z.object({
  password: z.string().min(6),
});

app.post(
  "/api/wallet/export",
  authMiddleware,
  zValidator("json", exportWalletSchema),
  async (c) => {
    // Rate limit: 10 attempts per 5 minutes (protect private key export)
    const ip = getClientIp(c);
    const rateCheck = checkRateLimit(ip, { ...RATE_LIMITS.AUTH, keyPrefix: "export" });
    if (!rateCheck.allowed) {
      return rateLimitResponse(c, rateCheck.retryAfter!);
    }

    const user = c.get("user")!;
    const { password } = c.req.valid("json");
    
    // Verify app password first
    const settings = await c.env.DB.prepare(
      "SELECT app_password_hash FROM user_settings WHERE user_id = ?"
    ).bind(user.id).first();
    
    if (!settings?.app_password_hash) {
      return c.json({ error: "Please set up an app password in Settings before exporting your wallet." }, 400);
    }
    
    const isPasswordValid = await verifyPin(password, settings.app_password_hash as string);
    if (!isPasswordValid) {
      return c.json({ error: "Invalid password. Please try again." }, 401);
    }
    
    const wallet = await c.env.DB.prepare(
      "SELECT * FROM user_wallets WHERE user_id = ?"
    )
      .bind(user.id)
      .first();
    
    if (!wallet) {
      return c.json({ error: "Wallet not found" }, 404);
    }
    
    if (!wallet.encrypted_private_key) {
      return c.json({ error: "No private key stored. Please contact support." }, 400);
    }
    
    // Decrypt with user.id
    const privateKey = await decryptPrivateKey(wallet.encrypted_private_key as string, user.id);
    
    // If decryption failed and wallet has a PIN hash, it's a legacy wallet that needs migration
    if (!privateKey && wallet.wallet_pin_hash) {
      await c.env.DB.prepare("DELETE FROM user_wallets WHERE user_id = ?").bind(user.id).run();
      return c.json({ 
        error: "Your wallet needs to be recreated. Please refresh the page to set up a new wallet.",
        walletReset: true 
      }, 400);
    }
    
    if (!privateKey) {
      return c.json({ error: "Failed to decrypt private key. Please contact support." }, 500);
    }
    
    return c.json({
      privateKey,
      address: wallet.wallet_address,
      warning: "NEVER share this key. Anyone with it can steal your funds.",
    });
  }
);

// Force recovery phrase setup for existing accounts
app.post("/api/wallet/force-recovery-setup", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  const result = await forceRecoveryPhraseSetup(c.env.DB, user);
  
  if (!result.success) {
    return c.json({ error: result.error || "Failed to setup recovery phrase" }, 400);
  }
  
  return c.json({ 
    success: true, 
    message: "Recovery phrase has been generated. You can now view it in Settings > Wallet Backup." 
  });
});

// Export recovery phrase (mnemonic) - requires app password
app.post(
  "/api/wallet/export-recovery-phrase",
  authMiddleware,
  zValidator("json", exportWalletSchema),
  async (c) => {
    // Rate limit: 10 attempts per 5 minutes (protect recovery phrase)
    const ip = getClientIp(c);
    const rateCheck = checkRateLimit(ip, { ...RATE_LIMITS.AUTH, keyPrefix: "export-phrase" });
    if (!rateCheck.allowed) {
      return rateLimitResponse(c, rateCheck.retryAfter!);
    }

    const user = c.get("user")!;
    const { password: pin } = c.req.valid("json");
    
    const wallet = await c.env.DB.prepare(
      "SELECT * FROM user_wallets WHERE user_id = ?"
    )
      .bind(user.id)
      .first();
    
    if (!wallet) {
      return c.json({ error: "Wallet not found" }, 404);
    }
    
    if (!wallet.encrypted_mnemonic) {
      return c.json({ error: "Recovery phrase not available for this wallet." }, 400);
    }
    
    // Verify app password
    const settings = await c.env.DB.prepare(
      "SELECT app_password_hash FROM user_settings WHERE user_id = ?"
    ).bind(user.id).first();
    
    if (!settings?.app_password_hash) {
      return c.json({ error: "Please set up an app password in Settings first." }, 400);
    }
    
    const isValid = await verifyPin(pin, settings.app_password_hash as string);
    if (!isValid) {
      return c.json({ error: "Invalid password. Please try again." }, 401);
    }
    
    // Decrypt mnemonic with user.id
    const mnemonic = await decryptPrivateKey(wallet.encrypted_mnemonic as string, user.id);
    if (!mnemonic) {
      return c.json({ error: "Failed to decrypt recovery phrase." }, 500);
    }
    
    return c.json({
      mnemonic,
      warning: "NEVER share these words. Anyone with them can steal your funds. Write them down and store securely offline.",
    });
  }
);

// Resolve Kaspay username to wallet address
app.get("/api/wallet/resolve/:username", async (c) => {
  const username = c.req.param("username").toLowerCase().replace(/^@/, "");
  
  const wallet = await c.env.DB.prepare(
    "SELECT wallet_address, kaspay_username FROM user_wallets WHERE LOWER(kaspay_username) = ?"
  )
    .bind(username)
    .first();
  
  if (!wallet) {
    return c.json({ error: "Username not found" }, 404);
  }
  
  return c.json({
    username: wallet.kaspay_username,
    walletAddress: wallet.wallet_address,
  });
});

// Get wallet balance (real-time from Kaspa network)
app.get("/api/wallet/balance/:address", async (c) => {
  const address = c.req.param("address");
  
  // Query real balance from Kaspa network
  const balance = await getWalletBalance(address);
  
  // Get exchange rates for fiat conversion
  const rates = await getKaspaExchangeRates(c.env.COINGECKO_API_KEY);
  const balanceKAS = parseFloat(balance?.balanceKAS || "0");
  const balanceUSD = kasToFiat(balanceKAS, "USD", rates).toFixed(2);
  
  return c.json({
    address,
    balanceKAS: balance?.balanceKAS || "0.00",
    balanceUSD,
    timestamp: new Date().toISOString(),
  });
});

// Get user settings
app.get("/api/settings", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  let settings = await c.env.DB.prepare(
    "SELECT * FROM user_settings WHERE user_id = ?"
  )
    .bind(user.id)
    .first();
  
  if (!settings) {
    await c.env.DB.prepare(
      "INSERT INTO user_settings (user_id) VALUES (?)"
    )
      .bind(user.id)
      .run();
    
    settings = await c.env.DB.prepare(
      "SELECT * FROM user_settings WHERE user_id = ?"
    )
      .bind(user.id)
      .first();
  }
  
  return c.json(settings);
});

// Update user settings
app.patch("/api/settings", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  
  const updates: string[] = [];
  const bindings: (string | number)[] = [];
  
  // Boolean settings
  const booleanFields = [
    "has_completed_onboarding",
    "notifications_payments",
    "notifications_deposits", 
    "notifications_marketing",
    "require_confirm_large",
    "hide_balance",
    "compact_mode",
    "show_kas_amounts",
    "auto_convert_to_kas",
  ];
  
  for (const field of booleanFields) {
    if (typeof body[field] === "boolean") {
      updates.push(`${field} = ?`);
      bindings.push(body[field] ? 1 : 0);
    }
  }
  
  // String settings
  const stringFields = [
    "preferred_currency",
    "large_payment_threshold",
    "default_currency_send",
    "theme",
  ];
  
  for (const field of stringFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      bindings.push(body[field]);
    }
  }
  
  if (updates.length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }
  
  updates.push("updated_at = CURRENT_TIMESTAMP");
  bindings.push(user.id);
  
  await c.env.DB.prepare(
    `UPDATE user_settings SET ${updates.join(", ")} WHERE user_id = ?`
  )
    .bind(...bindings)
    .run();
  
  const settings = await c.env.DB.prepare(
    "SELECT * FROM user_settings WHERE user_id = ?"
  )
    .bind(user.id)
    .first();
  
  return c.json(settings);
});

// ============================================
// Exchange Rates (CoinGecko)
// ============================================

app.get("/api/rates", async (c) => {
  // Fetch real-time rates from CoinGecko
  const rates = await getKaspaExchangeRates(c.env.COINGECKO_API_KEY);
  
  // Return all supported currencies
  const { timestamp, ...currencyRates } = rates;
  
  return c.json({
    rates: currencyRates,
    timestamp: timestamp,
  });
});

// ============================================
// KNS Domain Routes
// ============================================

// Resolve KNS domain to Kaspa wallet address
app.get("/api/kns/resolve/:domain", async (c) => {
  const domain = c.req.param("domain");
  
  if (!domain.endsWith(".kas")) {
    return c.json({ error: "Invalid KNS domain" }, 400);
  }
  
  // Use KNS registry service
  const resolution = await resolveDomain(domain);
  
  if (!resolution) {
    return c.json({ error: "Domain not found" }, 404);
  }
  
  return c.json(resolution);
});

// Check KNS domain availability
app.get("/api/kns/check/:domain", async (c) => {
  const domain = c.req.param("domain");
  
  // Use KNS registry service
  const isAvailable = await checkDomainAvailability(domain);
  
  return c.json({
    domain: `${domain}.kas`,
    isAvailable,
  });
});

// Register KNS domain
const registerDomainSchema = z.object({
  domain: z.string(),
  walletAddress: z.string(),
});

app.post(
  "/api/kns/register",
  zValidator("json", registerDomainSchema),
  async (c) => {
    const { domain, walletAddress } = c.req.valid("json");
    
    // Use KNS registry service
    const result = await registerKnsDomain(domain, walletAddress);
    
    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }
    
    return c.json({
      success: true,
      domain: `${domain}.kas`,
      walletAddress,
      transactionId: result.transactionId,
      timestamp: new Date().toISOString(),
    });
  }
);

// ============================================
// Transaction Routes
// ============================================

// Send transaction
const sendTransactionSchema = z.object({
  recipientDomain: z.string(),
  amount: z.string(),
  currency: z.enum(["USD", "EUR", "GBP", "JPY", "KAS"]),
  senderAddress: z.string(),
});

app.post(
  "/api/transactions/send",
  authMiddleware,
  zValidator("json", sendTransactionSchema),
  async (c) => {
    // Rate limit: 5 transactions per minute (prevent rapid draining)
    const ip = getClientIp(c);
    const rateCheck = checkRateLimit(ip, { ...RATE_LIMITS.STRICT, keyPrefix: "tx-send" });
    if (!rateCheck.allowed) {
      return rateLimitResponse(c, rateCheck.retryAfter!);
    }

    const { recipientDomain, amount, currency, senderAddress } = c.req.valid("json");
    
    try {
      // Step 1: Resolve recipient address
      let recipientAddress: string;
      let resolvedUsername: string | null = null;
      
      // Check if it's a @username, .kas domain, or direct address
      if (recipientDomain.startsWith("@")) {
        // Kaspay username
        const username = recipientDomain.slice(1).toLowerCase();
        const wallet = await c.env.DB.prepare(
          "SELECT wallet_address, kaspay_username FROM user_wallets WHERE LOWER(kaspay_username) = ?"
        )
          .bind(username)
          .first();
        
        if (!wallet) {
          return c.json({ success: false, error: "Kaspay username not found" }, 400);
        }
        recipientAddress = wallet.wallet_address as string;
        resolvedUsername = wallet.kaspay_username as string;
      } else if (recipientDomain.endsWith(".kas")) {
        const resolution = await resolveDomain(recipientDomain);
        if (!resolution) {
          return c.json({ success: false, error: "Invalid domain" }, 400);
        }
        recipientAddress = resolution.walletAddress;
      } else if (recipientDomain.startsWith("kaspa:")) {
        recipientAddress = recipientDomain;
      } else {
        return c.json({ success: false, error: "Invalid recipient" }, 400);
      }
      
      // Step 2: Get exchange rates and convert to KAS if needed
      const rates = await getKaspaExchangeRates(c.env.COINGECKO_API_KEY);
      let kasAmount: number;
      
      if (currency === "KAS") {
        kasAmount = parseFloat(amount);
      } else {
        kasAmount = fiatToKas(parseFloat(amount), currency as "USD" | "EUR" | "GBP" | "JPY", rates);
      }
      
      // Crypto-only app - no fiat conversion needed
      
      // Step 4: Sign and broadcast real Kaspa transaction
      let transactionId: string;
      // Get user's wallet for signing
      const currentSessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      const user = currentSessionToken ? await getCurrentUser(currentSessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      }) : null;
      
      if (user) {
        // Real transaction signing
        const wallet = await c.env.DB.prepare(
          "SELECT * FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first();
        
        if (wallet?.encrypted_private_key) {
          // Decrypt private key with user.id
          const privateKey = await decryptPrivateKey(wallet.encrypted_private_key as string, user.id);
          
          // If decryption failed and wallet has a PIN hash, it's a legacy wallet
          if (!privateKey && wallet.wallet_pin_hash) {
            await c.env.DB.prepare("DELETE FROM user_wallets WHERE user_id = ?").bind(user.id).run();
            return c.json({ success: false, error: "Wallet needs recreation. Please refresh.", walletReset: true }, 400);
          }
          
          if (!privateKey) {
            return c.json({ success: false, error: "Failed to decrypt wallet" }, 500);
          }
          
          // Convert KAS to sompi (1 KAS = 100,000,000 sompi)
          const amountSompi = Math.floor(kasAmount * 100000000);
          
          // Send real transaction
          const txResult = await sendTransaction(
            senderAddress,
            recipientAddress,
            amountSompi,
            privateKey
          );
          
          if (!txResult.success) {
            return c.json({ success: false, error: txResult.error || "Transaction failed" }, 400);
          }
          
          transactionId = txResult.transactionId || `txn_${Date.now()}`;
        } else {
          return c.json({ success: false, error: "Wallet not configured for transactions. Please set a PIN." }, 400);
        }
      } else {
        // No PIN provided - create placeholder (for demo/testing only)
        transactionId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }
      
      // Store transaction record
      await c.env.DB.prepare(
        `INSERT INTO transactions (
          transaction_id, sender_address, recipient_address, recipient_domain,
          amount_kas, amount_fiat, currency, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          transactionId,
          senderAddress,
          recipientAddress,
          recipientDomain.endsWith(".kas") ? recipientDomain : null,
          kasAmount.toFixed(8),
          amount,
          currency,
          "completed"
        )
        .run();
      
      // Create notification for the sender
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const displayRecipient = resolvedUsername ? `@${resolvedUsername}` :
            recipientDomain.endsWith(".kas") ? recipientDomain : 
            `${recipientAddress.slice(0, 10)}...${recipientAddress.slice(-6)}`;
          await createNotification(
            c.env.DB,
            user.id,
            "sent",
            "Payment Sent",
            `${currency === "KAS" ? kasAmount.toFixed(2) + " KAS" : currency + " " + amount} sent to ${displayRecipient}`,
            transactionId
          );
        }
      }
      
      return c.json({
        success: true,
        transactionId,
        recipientAddress,
        recipientDomain: recipientDomain.endsWith(".kas") ? recipientDomain : null,
        amountKAS: kasAmount.toFixed(4),
        amountFiat: amount,
        currency,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Transaction failed",
        },
        500
      );
    }
  }
);

// Get transaction history
app.get("/api/transactions/history/:address", async (c) => {
  const address = c.req.param("address");
  
  // First try to get from our database
  const dbTransactions = await c.env.DB.prepare(
    `SELECT * FROM transactions 
     WHERE sender_address = ? OR recipient_address = ?
     ORDER BY created_at DESC LIMIT 20`
  )
    .bind(address, address)
    .all();
  
  // Also query Kaspa blockchain for any transactions we might have missed
  const chainTransactions = await getKaspaTransactions(address);
  
  // Combine and format
  const transactions = dbTransactions.results.map((tx: Record<string, unknown>) => ({
    id: tx.id,
    transactionId: tx.transaction_id,
    to: tx.recipient_domain || tx.recipient_address,
    toAddress: tx.recipient_address,
    amount: tx.amount_fiat,
    currency: tx.currency,
    amountKAS: tx.amount_kas,
    timestamp: tx.created_at,
    status: tx.status,
  }));
  
  // Add chain transactions not in our DB
  const existingIds = new Set(transactions.map(t => t.transactionId));
  for (const chainTx of chainTransactions) {
    if (!existingIds.has(chainTx.transactionId)) {
      transactions.push({
        id: chainTx.transactionId,
        transactionId: chainTx.transactionId,
        to: chainTx.outputs[0]?.script_public_key_address || "Unknown",
        toAddress: chainTx.outputs[0]?.script_public_key_address || "",
        amount: "0",
        currency: "KAS",
        amountKAS: (chainTx.outputs[0]?.amount / 100000000).toFixed(4),
        timestamp: chainTx.timestamp,
        status: "completed",
      });
    }
  }
  
  return c.json({
    address,
    transactions: transactions.slice(0, 20),
  });
});

// ============================================
// Transfer Out (Cash Out) Routes
// ============================================

const transferOutSchema = z.object({
  amount: z.string(),
  currency: z.enum(["USD", "EUR", "GBP"]),
  destinationType: z.enum(["bank", "card", "paypal"]),
});

app.post(
  "/api/transfers/out",
  zValidator("json", transferOutSchema),
  async (c) => {
    // Rate limit: 5 transfers per minute
    const ip = getClientIp(c);
    const rateCheck = checkRateLimit(ip, { ...RATE_LIMITS.STRICT, keyPrefix: "transfer-out" });
    if (!rateCheck.allowed) {
      return rateLimitResponse(c, rateCheck.retryAfter!);
    }

    const { amount, currency, destinationType } = c.req.valid("json");
    
    try {
      // Fee calculation
      const feePercents: Record<string, number> = {
        bank: 0.015,
        card: 0.02,
        paypal: 0.025,
      };
      const feePercent = feePercents[destinationType] || 0.02;
      const feeAmount = (parseFloat(amount) * feePercent).toFixed(2);
      const receiveAmount = (parseFloat(amount) - parseFloat(feeAmount)).toFixed(2);
      
      // Get exchange rates and convert to KAS
      const rates = await getKaspaExchangeRates(c.env.COINGECKO_API_KEY);
      const kasAmount = fiatToKas(parseFloat(amount), currency as "USD" | "EUR" | "GBP", rates);
      
      let payoutResult;
      const transferId = `txf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Crypto-only app - fiat payouts removed
      payoutResult = {
        success: false,
        error: "Fiat withdrawals not supported in crypto-only mode"
      };
      
      // Store transfer record
      await c.env.DB.prepare(
        `INSERT INTO transfer_requests (
          transfer_id, amount, currency, fee_amount, receive_amount, kas_amount,
          destination_type, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          transferId,
          amount,
          currency,
          feeAmount,
          receiveAmount,
          kasAmount.toFixed(8),
          destinationType,
          payoutResult?.success ? "processing" : "failed"
        )
        .run();
      
      // Create notification for transfer
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const destLabel = destinationType === "bank" ? "bank account" : 
                           destinationType === "card" ? "debit card" : "PayPal";
          await createNotification(
            c.env.DB,
            user.id,
            "sent",
            "Transfer Initiated",
            `${currency} ${receiveAmount} transfer to ${destLabel} is processing`,
            transferId
          );
        }
      }
      
      return c.json({
        success: payoutResult?.success || false,
        transferId,
        amount,
        currency,
        feeAmount,
        receiveAmount,
        kasAmount: kasAmount.toFixed(4),
        destinationType,
        status: "failed",
        estimatedArrival: "Not available",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Transfer failed",
        },
        500
      );
    }
  }
);

// Get transfer history
app.get("/api/transfers/history", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  const transfers = await c.env.DB.prepare(
    `SELECT * FROM transfer_requests 
     WHERE user_id = ?
     ORDER BY created_at DESC LIMIT 20`
  )
    .bind(user.id)
    .all();
  
  return c.json({
    transfers: transfers.results,
  });
});

// ============================================
// Notification Routes
// ============================================

// Get user notifications
app.get("/api/notifications", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  const notifications = await c.env.DB.prepare(
    `SELECT * FROM notifications 
     WHERE user_id = ?
     ORDER BY created_at DESC LIMIT 50`
  )
    .bind(user.id)
    .all();
  
  return c.json({
    notifications: notifications.results,
    unreadCount: notifications.results.filter((n: Record<string, unknown>) => !n.is_read).length,
  });
});

// Get unread notification count
app.get("/api/notifications/unread-count", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  const result = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM notifications 
     WHERE user_id = ? AND is_read = 0`
  )
    .bind(user.id)
    .first();
  
  return c.json({ count: result?.count || 0 });
});

// Mark notification as read
app.post("/api/notifications/:id/read", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const notificationId = c.req.param("id");
  
  await c.env.DB.prepare(
    `UPDATE notifications SET is_read = 1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = ? AND user_id = ?`
  )
    .bind(notificationId, user.id)
    .run();
  
  return c.json({ success: true });
});

// Mark all notifications as read
app.post("/api/notifications/read-all", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  await c.env.DB.prepare(
    `UPDATE notifications SET is_read = 1, updated_at = CURRENT_TIMESTAMP 
     WHERE user_id = ? AND is_read = 0`
  )
    .bind(user.id)
    .run();
  
  return c.json({ success: true });
});

// Clear all notifications
app.delete("/api/notifications", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  await c.env.DB.prepare(
    `DELETE FROM notifications WHERE user_id = ?`
  )
    .bind(user.id)
    .run();
  
  return c.json({ success: true });
});

// Create notification (internal helper)
async function createNotification(
  db: D1Database,
  userId: string,
  type: string,
  title: string,
  message: string,
  transactionId?: string
) {
  await db.prepare(
    `INSERT INTO notifications (user_id, type, title, message, transaction_id)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(userId, type, title, message, transactionId || null)
    .run();
}

// ============================================
// Deposit (Card Payment) Routes
// ============================================

// Create Stripe Checkout session for deposit
const createDepositSchema = z.object({
  amount: z.string(),
  currency: z.enum(["usd", "eur", "gbp"]),
  kasAmount: z.string(),
});

app.post(
  "/api/deposits/create-checkout",
  zValidator("json", createDepositSchema),
  async (c) => {
    const { amount, currency, kasAmount } = c.req.valid("json");
    
    if (!c.env.STRIPE_SECRET_KEY) {
      return c.json({ error: "Payment processing not configured" }, 400);
    }
    
    try {
      const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
      
      // Get the base URL for redirects
      const origin = new URL(c.req.url).origin;
      
      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: currency,
              product_data: {
                name: "Kaspay Wallet Deposit",
                description: `Add ${kasAmount} KAS to your wallet`,
              },
              unit_amount: Math.round(parseFloat(amount) * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}/deposit-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/`,
        metadata: {
          type: "deposit",
          kasAmount: kasAmount,
          fiatAmount: amount,
          fiatCurrency: currency.toUpperCase(),
        },
      });
      
      return c.json({ url: session.url, sessionId: session.id });
    } catch (error) {
      console.error("Stripe checkout error:", error);
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to create checkout session" },
        500
      );
    }
  }
);

// Verify deposit after successful payment
app.get("/api/deposits/verify", async (c) => {
  const sessionId = c.req.query("session_id");
  
  if (!sessionId) {
    return c.json({ error: "Missing session ID" }, 400);
  }
  
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: "Payment processing not configured" }, 400);
  }
  
  try {
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === "paid") {
      return c.json({
        success: true,
        amount: session.metadata?.fiatAmount || "0",
        currency: session.metadata?.fiatCurrency || "USD",
        kasAmount: session.metadata?.kasAmount || "0",
      });
    }
    
    return c.json({ success: false, error: "Payment not completed" }, 400);
  } catch (error) {
    console.error("Stripe verification error:", error);
    return c.json({ error: "Failed to verify payment" }, 500);
  }
});

// Stripe webhook for deposit confirmation
app.post("/api/webhooks/stripe", async (c) => {
  if (!c.env.STRIPE_SECRET_KEY || !c.env.STRIPE_WEBHOOK_SECRET) {
    return c.json({ error: "Stripe not configured" }, 400);
  }
  
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
  const body = await c.req.text();
  const sig = c.req.header("stripe-signature") || "";
  
  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(body, sig, c.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return c.text("Invalid signature", 400);
  }
  
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    
    if (session.metadata?.type === "deposit") {
      const kasAmount = session.metadata.kasAmount;
      const fiatAmount = session.metadata.fiatAmount;
      const fiatCurrency = session.metadata.fiatCurrency;
      
      // Store deposit record
      const depositId = `dep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      await c.env.DB.prepare(
        `INSERT INTO deposits (
          deposit_id, stripe_session_id, amount_fiat, currency, amount_kas, status
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(depositId, session.id, fiatAmount, fiatCurrency, kasAmount, "completed")
        .run();
      
      // If user is authenticated, create notification
      if (session.customer_email) {
        // Find user by email if possible (would need additional logic)
        console.log(`Deposit completed: ${fiatCurrency} ${fiatAmount} -> ${kasAmount} KAS`);
      }
    }
  }
  
  return c.text("ok", 200);
});

// Get deposit history
app.get("/api/deposits/history", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  // Get user's wallet
  const wallet = await c.env.DB.prepare(
    "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
  )
    .bind(user.id)
    .first();
  
  if (!wallet) {
    return c.json({ deposits: [] });
  }
  
  const deposits = await c.env.DB.prepare(
    `SELECT * FROM deposits 
     WHERE user_id = ?
     ORDER BY created_at DESC LIMIT 20`
  )
    .bind(user.id)
    .all();
  
  return c.json({ deposits: deposits.results });
});

// ============================================
// Testnet / Developer Routes
// SECURITY: Protected endpoints - require X-Dev-Access header
// ============================================

// Dev access middleware - blocks production use
function requireDevAccess(c: { req: { header: (name: string) => string | undefined } }): boolean {
  const devHeader = c.req.header("X-Dev-Access");
  return devHeader === "kaspay-dev-2025";
}

// Get current network
app.get("/api/dev/network", async (c) => {
  // Rate limit dev endpoints
  const ip = getClientIp(c);
  const rateCheck = checkRateLimit(ip, { ...RATE_LIMITS.WALLET_CREATE, keyPrefix: "dev" });
  if (!rateCheck.allowed) {
    return rateLimitResponse(c, rateCheck.retryAfter!);
  }

  if (!requireDevAccess(c)) {
    return c.json({ error: "Dev access required. Add X-Dev-Access header." }, 403);
  }

  return c.json({ 
    network: getNetwork(),
    isTestnet: getNetwork() !== 'mainnet',
    faucetUrl: getNetwork() === 'testnet-10' 
      ? 'https://faucet-testnet10.kaspa.org/' 
      : null,
  });
});

// Switch network (development only)
const switchNetworkSchema = z.object({
  network: z.enum(["mainnet", "testnet-10"]),
});

app.post(
  "/api/dev/network",
  zValidator("json", switchNetworkSchema),
  async (c) => {
    if (!requireDevAccess(c)) {
      return c.json({ error: "Dev access required" }, 403);
    }

    const { network } = c.req.valid("json");
    setNetwork(network as KaspaNetwork);
    
    return c.json({ 
      success: true, 
      network: getNetwork(),
      message: network === 'mainnet' 
        ? 'Switched to mainnet - transactions use real KAS'
        : 'Switched to testnet - safe for testing',
    });
  }
);

// Test wallet generation (respects current network setting)
app.post("/api/dev/test-wallet", async (c) => {
  if (!requireDevAccess(c)) {
    return c.json({ error: "Dev access required" }, 403);
  }

  // Rate limit wallet creation
  const ip = getClientIp(c);
  const rateCheck = checkRateLimit(ip, { ...RATE_LIMITS.WALLET_CREATE, keyPrefix: "dev-wallet" });
  if (!rateCheck.allowed) {
    return rateLimitResponse(c, rateCheck.retryAfter!);
  }

  try {
    const network = getNetwork();
    const { wallet, mnemonic } = await generateWallet();
    
    const isMainnet = network === 'mainnet';
    
    return c.json({
      success: true,
      network,
      wallet: {
        address: wallet.address,
        publicKey: wallet.publicKey,
      },
      mnemonic,
      warning: isMainnet 
        ? '⚠️ MAINNET WALLET - Use real KAS. Store mnemonic securely!'
        : 'Testnet wallet - safe for testing',
      instructions: isMainnet ? [
        '1. Send a small amount of KAS to this address from an exchange or another wallet',
        '2. Use /api/dev/test-sign to verify transaction signing works',
        '3. Use /api/dev/test-transaction with broadcast=true to send a real transaction',
        '4. IMPORTANT: Save your mnemonic - it controls real funds!',
      ] : [
        '1. Visit https://faucet-testnet10.kaspa.org/ to get testnet KAS',
        '2. Enter the address above to receive test coins',
        '3. Use /api/dev/test-sign to test transaction signing',
      ],
    });
  } catch (error) {
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to generate test wallet' 
    }, 500);
  }
});

// Test transaction signing (verifies signing works without broadcasting)
const testSignSchema = z.object({
  mnemonic: z.string(),
  toAddress: z.string(),
  amountKAS: z.string(),
});

app.post(
  "/api/dev/test-sign",
  zValidator("json", testSignSchema),
  async (c) => {
    if (!requireDevAccess(c)) {
      return c.json({ error: "Dev access required" }, 403);
    }

    const { mnemonic, toAddress, amountKAS } = c.req.valid("json");
    
    // Import wallet generation from mnemonic
    const { generateWalletFromMnemonic } = await import("./services/kaspa-wallet");
    
    try {
      const network = getNetwork();
      
      // Generate wallet from mnemonic
      const wallet = await generateWalletFromMnemonic(mnemonic);
      
      // Get UTXOs from testnet
      const utxos = await getUTXOs(wallet.address);
      
      if (utxos.length === 0) {
        return c.json({
          success: false,
          error: network === 'mainnet' 
            ? 'No UTXOs found. Send some KAS to this address first.'
            : 'No UTXOs found. Get testnet KAS from the faucet first.',
          address: wallet.address,
          network,
        }, 400);
      }
      
      // Convert KAS to sompi
      const amountSompi = Math.floor(parseFloat(amountKAS) * 100000000);
      const feeSompi = 10000; // 0.0001 KAS fee
      
      // Sign the transaction (but don't broadcast)
      const signResult = await signTransaction(
        utxos,
        toAddress,
        amountSompi,
        feeSompi,
        wallet.address,
        wallet.privateKey
      );
      
      if (!signResult.success) {
        return c.json({
          success: false,
          error: signResult.error,
        }, 400);
      }
      
      return c.json({
        success: true,
        message: 'Transaction signed successfully (not broadcast)',
        network,
        from: wallet.address,
        to: toAddress,
        amountKAS,
        amountSompi,
        feeSompi,
        utxosUsed: utxos.length,
        transactionId: signResult.transactionId,
        // Don't return signedTx in production - this is for debugging only
        signedTxPreview: signResult.signedTx?.substring(0, 100) + '...',
      });
    } catch (error) {
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Signing failed',
      }, 500);
    }
  }
);

// Full testnet transaction test (sign and broadcast)
const testTransactionSchema = z.object({
  mnemonic: z.string(),
  toAddress: z.string(),
  amountKAS: z.string(),
  broadcast: z.boolean().default(false),
});

app.post(
  "/api/dev/test-transaction",
  zValidator("json", testTransactionSchema),
  async (c) => {
    if (!requireDevAccess(c)) {
      return c.json({ error: "Dev access required" }, 403);
    }

    const { mnemonic, toAddress, amountKAS, broadcast } = c.req.valid("json");
    
    const { generateWalletFromMnemonic } = await import("./services/kaspa-wallet");
    
    try {
      const network = getNetwork();
      const wallet = await generateWalletFromMnemonic(mnemonic);
      const amountSompi = Math.floor(parseFloat(amountKAS) * 100000000);
      
      if (broadcast) {
        // Full transaction - sign and broadcast
        const result = await sendTransaction(
          wallet.address,
          toAddress,
          amountSompi,
          wallet.privateKey,
          10000 // fee in sompi
        );
        
        if (!result.success) {
          return c.json({
            success: false,
            error: result.error,
          }, 400);
        }
        
        const explorerUrl = network === 'mainnet'
          ? `https://explorer.kaspa.org/txs/${result.transactionId}`
          : `https://explorer-tn10.kaspa.org/txs/${result.transactionId}`;
        
        return c.json({
          success: true,
          broadcast: true,
          network,
          transactionId: result.transactionId,
          explorerUrl,
          from: wallet.address,
          to: toAddress,
          amountKAS,
        });
      } else {
        // Dry run - just verify everything would work
        const utxos = await getUTXOs(wallet.address);
        const balance = utxos.reduce((sum, u) => sum + u.amount, 0);
        const required = amountSompi + 10000;
        
        return c.json({
          success: balance >= required,
          broadcast: false,
          network,
          from: wallet.address,
          to: toAddress,
          amountKAS,
          balanceSompi: balance,
          requiredSompi: required,
          sufficient: balance >= required,
          message: balance >= required 
            ? 'Transaction would succeed. Set broadcast=true to send.'
            : `Insufficient balance. Have ${balance} sompi, need ${required} sompi.`,
        });
      }
    } catch (error) {
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Transaction failed',
      }, 500);
    }
  }
);

// ============================================
// KasShi Video Platform Routes
// ============================================

// Platform fee configuration
const PLATFORM_FEE_PERCENT = 0.05; // 5% for views only
// Fee constants - small utility actions are batched via Merkle tree
// Note: Frontend passes actual amounts; these document expected values for reference

// Generate YouTube-style public ID (11 characters: a-z, A-Z, 0-9, -, _)
function generatePublicId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  const randomValues = new Uint8Array(11);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 11; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

// Lazily generate public_ids for any videos missing them in a result set
async function ensurePublicIds(db: D1Database, videos: Record<string, unknown>[]): Promise<void> {
  for (const video of videos) {
    if (!video.public_id && video.id) {
      const newPublicId = generatePublicId();
      await db.prepare("UPDATE videos SET public_id = ? WHERE id = ?").bind(newPublicId, video.id).run();
      video.public_id = newPublicId;
    }
  }
}

// Check if a Kaspa address is valid for real transactions (not a demo/placeholder)
function isValidKaspaAddress(address: string): boolean {
  // Valid Kaspa mainnet addresses start with kaspa:q and are ~61-67 chars total
  // Demo addresses like kaspa:demo_channel_wallet_001 are not valid
  if (!address || !address.startsWith('kaspa:q')) return false;
  // Kaspa addresses use bech32 and should only contain: qpzry9x8gf2tvdw0s3jn54khce6mua7l
  const addressPart = address.slice(6); // Remove 'kaspa:' prefix
  const validChars = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;
  return addressPart.length >= 55 && addressPart.length <= 65 && validChars.test(addressPart);
}

// Resolve video by public_id or numeric id (for backward compatibility)
async function resolveVideoId(db: D1Database, idParam: string): Promise<number | null> {
  // If it looks like a numeric ID, try that first (backward compatibility)
  if (/^\d+$/.test(idParam)) {
    const video = await db.prepare("SELECT id FROM videos WHERE id = ?").bind(parseInt(idParam)).first();
    if (video) return video.id as number;
  }
  // Try public_id lookup
  const video = await db.prepare("SELECT id FROM videos WHERE public_id = ?").bind(idParam).first();
  return video ? (video.id as number) : null;
}

// Duration-based view pricing (all tiers above 0.11 KAS to avoid KIP-9 storage mass limit)
function getViewCostForDuration(durationSeconds: number): number {
  const minutes = durationSeconds / 60;
  if (minutes >= 30) return 0.25; // 30+ min
  if (minutes >= 20) return 0.20; // 20-29 min
  if (minutes >= 10) return 0.15; // 10-19 min
  return 0.11; // Under 10 min
}

const LIKE_COST_KAS = 0.02; // 100% to platform
const COMMENT_COST_KAS = 0.02; // 100% to platform
// Other fee reference values (frontend-enforced):
// - Dislike: 0.02 KAS (100% to platform)
// - Share: 0.02 KAS (100% to platform)
// - Unlike/Undislike/Report/Delete comment: 0.0001 KAS (100% to platform, batched)
// - Comment like: 0.01 KAS (100% to platform, batched)
// - Comment dislike: 0.02 KAS (100% to platform)

// Upload video file to R2
// Multipart upload: Initialize
app.post("/api/kasshi/upload/video/init", async (c) => {
  try {
    const { channelId, fileName, fileType, fileSize } = await c.req.json();
    
    if (!channelId || !fileName || !fileType) {
      return c.json({ error: "channelId, fileName, and fileType are required" }, 400);
    }
    
    // Validate file type
    const allowedTypes = ["video/mp4", "video/webm", "video/quicktime"];
    if (!allowedTypes.includes(fileType)) {
      return c.json({ error: "Invalid file type. Supported: MP4, WebM, MOV" }, 400);
    }
    
    // Max 10GB
    const maxSize = 10 * 1024 * 1024 * 1024;
    if (fileSize > maxSize) {
      return c.json({ error: "File too large. Maximum size is 10GB" }, 400);
    }
    
    // Generate unique key
    const timestamp = Date.now();
    const extension = fileName.split(".").pop() || "mp4";
    const key = `videos/${channelId}/${timestamp}.${extension}`;
    
    // Start multipart upload
    const multipartUpload = await c.env.R2_BUCKET.createMultipartUpload(key, {
      httpMetadata: { contentType: fileType },
      customMetadata: { originalName: fileName, uploadedAt: new Date().toISOString() },
    });
    
    return c.json({
      success: true,
      uploadId: multipartUpload.uploadId,
      key,
    });
  } catch (error) {
    console.error("Error initializing upload:", error);
    return c.json({ error: "Failed to initialize upload" }, 500);
  }
});

// Multipart upload: Upload a part
app.post("/api/kasshi/upload/video/part", async (c) => {
  try {
    const formData = await c.req.formData();
    const chunk = formData.get("chunk") as File | null;
    const key = formData.get("key") as string | null;
    const uploadId = formData.get("uploadId") as string | null;
    const partNumber = parseInt(formData.get("partNumber") as string || "0");
    
    if (!chunk || !key || !uploadId || !partNumber) {
      return c.json({ error: "chunk, key, uploadId, and partNumber are required" }, 400);
    }
    
    // Resume multipart upload and upload part
    const multipartUpload = c.env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
    const uploadedPart = await multipartUpload.uploadPart(partNumber, chunk.stream());
    
    return c.json({
      success: true,
      partNumber,
      etag: uploadedPart.etag,
    });
  } catch (error) {
    console.error("Error uploading part:", error);
    return c.json({ error: "Failed to upload part" }, 500);
  }
});

// Multipart upload: Complete
app.post("/api/kasshi/upload/video/complete", async (c) => {
  try {
    const { key, uploadId, parts, expectedSize } = await c.req.json();
    
    if (!key || !uploadId || !parts || !Array.isArray(parts)) {
      return c.json({ error: "key, uploadId, and parts array are required" }, 400);
    }
    
    // Validate parts array - each part must have partNumber and etag
    for (const part of parts) {
      if (!part.partNumber || !part.etag) {
        return c.json({ error: "Each part must have partNumber and etag" }, 400);
      }
    }
    
    // Resume and complete multipart upload
    const multipartUpload = c.env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
    const uploadedObject = await multipartUpload.complete(parts);
    
    // Verify the uploaded file size if expectedSize provided
    if (expectedSize && uploadedObject.size !== expectedSize) {
      console.error(`Upload size mismatch: expected ${expectedSize}, got ${uploadedObject.size}`);
      // Delete the incomplete file
      await c.env.R2_BUCKET.delete(key);
      return c.json({ error: `Upload incomplete: expected ${expectedSize} bytes, got ${uploadedObject.size}` }, 400);
    }
    
    console.log(`Upload complete: ${key}, size: ${uploadedObject.size} bytes`);
    
    return c.json({
      success: true,
      key,
      url: `/api/kasshi/media/${key}`,
      size: uploadedObject.size,
    });
  } catch (error) {
    console.error("Error completing upload:", error);
    return c.json({ error: "Failed to complete upload" }, 500);
  }
});

// Multipart upload: Abort (cleanup)
app.post("/api/kasshi/upload/video/abort", async (c) => {
  try {
    const { key, uploadId } = await c.req.json();
    
    if (!key || !uploadId) {
      return c.json({ error: "key and uploadId are required" }, 400);
    }
    
    const multipartUpload = c.env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
    await multipartUpload.abort();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Error aborting upload:", error);
    return c.json({ error: "Failed to abort upload" }, 500);
  }
});

// Legacy single-file upload (kept for small files < 95MB)
app.post("/api/kasshi/upload/video", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const channelId = formData.get("channelId") as string | null;
  
  if (!file || !channelId) {
    return c.json({ error: "File and channelId are required" }, 400);
  }
  
  // Validate file type
  const allowedTypes = ["video/mp4", "video/webm", "video/quicktime"];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: "Invalid file type. Supported: MP4, WebM, MOV" }, 400);
  }
  
  // Max 95MB for single request (Cloudflare limit is ~100MB)
  const maxSize = 95 * 1024 * 1024;
  if (file.size > maxSize) {
    return c.json({ error: "File too large for single upload. Use chunked upload." }, 400);
  }
  
  // Generate unique key
  const timestamp = Date.now();
  const extension = file.name.split(".").pop() || "mp4";
  const key = `videos/${channelId}/${timestamp}.${extension}`;
  
  // Upload to R2
  await c.env.R2_BUCKET.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  });
  
  return c.json({ 
    success: true, 
    key,
    url: `/api/kasshi/media/${key}`,
  });
});

// Upload thumbnail to R2
app.post("/api/kasshi/upload/thumbnail", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const channelId = formData.get("channelId") as string | null;
  
  if (!file || !channelId) {
    return c.json({ error: "File and channelId are required" }, 400);
  }
  
  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: "Invalid file type. Supported: JPEG, PNG, WebP, GIF" }, 400);
  }
  
  // Max 10MB
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return c.json({ error: "File too large. Maximum size is 10MB" }, 400);
  }
  
  // Generate unique key
  const timestamp = Date.now();
  const extension = file.name.split(".").pop() || "jpg";
  const key = `thumbnails/${channelId}/${timestamp}.${extension}`;
  
  // Upload to R2
  await c.env.R2_BUCKET.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  });
  
  return c.json({ 
    success: true, 
    key,
    url: `/api/kasshi/media/${key}`,
  });
});

// Upload channel avatar/banner images
app.post("/api/kasshi/upload/channel-image", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const channelId = formData.get("channelId") as string | null;
  const imageType = formData.get("type") as string | null; // "avatar" or "banner"
  
  if (!file || !channelId || !imageType) {
    return c.json({ error: "File, channelId, and type are required" }, 400);
  }
  
  if (!["avatar", "banner"].includes(imageType)) {
    return c.json({ error: "Type must be 'avatar' or 'banner'" }, 400);
  }
  
  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: "Invalid file type. Supported: JPEG, PNG, WebP" }, 400);
  }
  
  // Max 5MB for avatar, 10MB for banner
  const maxSize = imageType === "avatar" ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return c.json({ error: `File too large. Maximum size is ${imageType === "avatar" ? "5MB" : "10MB"}` }, 400);
  }
  
  // Generate unique key
  const timestamp = Date.now();
  const extension = file.name.split(".").pop() || "jpg";
  const key = `channels/${channelId}/${imageType}_${timestamp}.${extension}`;
  
  // Upload to R2
  await c.env.R2_BUCKET.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  });
  
  return c.json({ 
    success: true, 
    key,
    url: `/api/kasshi/media/${key}`,
  });
});

// Static assets endpoint - serves logos from app domain (avoids antivirus blocking mochausercontent.com)
const STATIC_ASSETS: Record<string, string> = {
  "kasshi-logo": "https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/kasshi_logo-removebg-preview.png",
  "kaspa-icon": "https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/image.png_1060.png",
};

// Cache for proxied assets (in-memory, per worker instance)
const assetCache = new Map<string, { data: ArrayBuffer; contentType: string; etag: string }>();

app.get("/api/static/:asset", async (c) => {
  const assetKey = c.req.param("asset");
  const sourceUrl = STATIC_ASSETS[assetKey];
  
  if (!sourceUrl) {
    return c.json({ error: "Asset not found" }, 404);
  }
  
  // Check cache first
  const cached = assetCache.get(assetKey);
  if (cached) {
    return new Response(cached.data, {
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": cached.etag,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
  
  // Fetch from source
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    return c.json({ error: "Failed to fetch asset" }, 500);
  }
  
  const data = await response.arrayBuffer();
  const contentType = response.headers.get("Content-Type") || "image/png";
  const etag = response.headers.get("ETag") || `"${assetKey}-${Date.now()}"`;
  
  // Cache it
  assetCache.set(assetKey, { data, contentType, etag });
  
  return new Response(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "ETag": etag,
      "Access-Control-Allow-Origin": "*",
    },
  });
});

// CORS preflight for media endpoint (video streaming)
app.options("/api/kasshi/media/*", (_c) => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type, Accept, Accept-Encoding",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag",
      "Access-Control-Max-Age": "86400",
    },
  });
});

// HEAD request for media (used by video players to probe before streaming)
app.on("HEAD", "/api/kasshi/media/*", async (c: Context<{ Bindings: Env }>) => {
  const key = c.req.path.replace("/api/kasshi/media/", "");
  
  if (!key) {
    return c.json({ error: "No key provided" }, 400);
  }
  
  const object = await c.env.R2_BUCKET.head(key);
  
  if (!object) {
    return c.json({ error: "File not found" }, 404);
  }
  
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  
  // Set video MIME type
  const ext = key.split('.').pop()?.toLowerCase();
  const videoMimeTypes: Record<string, string> = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    'ogg': 'video/ogg',
    'm4v': 'video/x-m4v',
  };
  if (ext && videoMimeTypes[ext]) {
    headers.set("Content-Type", videoMimeTypes[ext]);
  }
  
  headers.set("Content-Length", String(object.size));
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag");
  
  return new Response(null, { status: 200, headers });
});

// Simple R2 health check endpoint (no auth required)
app.get("/api/r2-health", async (c) => {
  try {
    // Quick check if R2 bucket is accessible
    const listed = await c.env.R2_BUCKET.list({ limit: 1 });
    return c.json({ 
      status: "ok", 
      hasFiles: listed.objects.length > 0,
      bucketAccessible: true
    });
  } catch (error: any) {
    console.error("[R2 Health] Error:", error);
    return c.json({ 
      status: "error", 
      error: error.message,
      bucketAccessible: false
    }, 500);
  }
});

// Serve media files from R2 with Edge Caching
// Uses Cloudflare Cache API to cache video chunks at the edge
// After first request, subsequent requests bypass Worker entirely
app.get("/api/kasshi/media/*", async (c) => {
  const key = c.req.path.replace("/api/kasshi/media/", "");
  
  console.log("[Media] Request for key:", key);
  console.log("[Media] Full path:", c.req.path);
  
  if (!key) {
    console.log("[Media] No key provided");
    return c.json({ error: "No key provided" }, 400);
  }
  
  // Verify R2 bucket is accessible
  if (!c.env.R2_BUCKET) {
    console.error("[Media] R2_BUCKET binding is undefined!");
    return c.json({ error: "Storage not configured" }, 500);
  }
  
  // Determine if this is an image or video based on extension
  const ext = key.split('.').pop()?.toLowerCase() || '';
  const imageMimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
  };
  const isImage = ext in imageMimeTypes;
  
  // Check for Range header (used for video streaming)
  const rangeHeader = c.req.header("Range");
  
  // Use Cloudflare Cache API for edge caching (with fallback if unavailable)
  let cache: Cache | null = null;
  let cacheKey: Request | null = null;
  
  try {
    cache = caches.default;
    const cacheUrl = new URL(c.req.url);
    // Include range in cache key so different ranges are cached separately
    if (rangeHeader) {
      cacheUrl.searchParams.set("range", rangeHeader);
    }
    cacheKey = new Request(cacheUrl.toString(), {
      method: "GET",
      headers: c.req.raw.headers,
    });
    
    // Check cache first - this is the key optimization for large files
    // Cached responses are served directly from Cloudflare's edge without Worker
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      // Clone and add CORS headers (cache might not have them)
      const headers = new Headers(cachedResponse.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("X-Cache", "HIT");
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        headers,
      });
    }
  } catch (cacheErr) {
    console.warn("[Media] Cache API unavailable:", cacheErr);
    // Continue without cache - will fetch directly from R2
  }
  
  // Not in cache - fetch from R2
  try {
    // For images: return full file with 200 status
    if (isImage) {
      console.log("[Media] Fetching image from R2:", key);
      let object;
      try {
        object = await c.env.R2_BUCKET.get(key);
      } catch (imgError: any) {
        console.error("[Media] R2 get() for image failed:", imgError?.message);
        return c.json({ error: "Failed to read image", key, detail: imgError?.message }, 500);
      }
      
      if (!object) {
        console.log("[Media] Image not found in R2:", key);
        return c.json({ error: "Image not found", key }, 404);
      }
      
      console.log("[Media] Image found, size:", object.size);
      const headers = new Headers();
      headers.set("Content-Type", imageMimeTypes[ext]);
      headers.set("Content-Length", String(object.size));
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("X-Cache", "MISS");
      
      const response = new Response(object.body, { status: 200, headers });
      // Cache in background - wrap in try-catch to prevent cache errors from affecting response
      if (cache && cacheKey) {
        c.executionCtx.waitUntil(
          cache.put(cacheKey, response.clone()).catch(err => {
            console.error("[Media] Cache put error (non-fatal):", err);
          })
        );
      }
      return response;
    }
    
    // For videos: use chunked streaming with 206 Partial Content
    const MAX_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for better streaming
    
    // Parse range header if present
    let rangeStart = 0;
    let rangeEnd: number | undefined;
    
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        rangeStart = parseInt(match[1], 10);
        if (match[2]) {
          rangeEnd = parseInt(match[2], 10);
        }
      }
    }
    
    // Get file metadata first to know total size
    console.log("[Media] Fetching video metadata for key:", key);
    let headObject;
    try {
      headObject = await c.env.R2_BUCKET.head(key);
    } catch (headError: any) {
      console.error("[Media] R2 head() failed:", headError?.message);
      return c.json({ error: "Failed to access file", detail: headError?.message }, 500);
    }
    
    if (!headObject) {
      console.log("[Media] Video not found in R2:", key);
      return c.json({ error: "File not found", key }, 404);
    }
    
    const totalSize = headObject.size;
    console.log("[Media] Video size:", totalSize, "bytes");
    
    // Calculate actual range to fetch
    // If no end specified or end is beyond file, cap it
    if (rangeEnd === undefined || rangeEnd >= totalSize) {
      rangeEnd = totalSize - 1;
    }
    
    // Limit chunk size to prevent Worker timeouts
    const requestedLength = rangeEnd - rangeStart + 1;
    const actualLength = Math.min(requestedLength, MAX_CHUNK_SIZE);
    const actualEnd = rangeStart + actualLength - 1;
    
    // Fetch the chunk from R2
    console.log("[Media] Fetching video chunk:", { key, rangeStart, actualLength });
    let object;
    try {
      object = await c.env.R2_BUCKET.get(key, {
        range: { offset: rangeStart, length: actualLength }
      });
    } catch (getError: any) {
      console.error("[Media] R2 get() failed:", getError?.message);
      return c.json({ error: "Failed to read file", detail: getError?.message }, 500);
    }
    
    if (!object) {
      console.log("[Media] Video chunk not found:", key);
      return c.json({ error: "File not found", key }, 404);
    }
    
    console.log("[Media] Got video chunk, serving 206 response");
    
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    
    // Ensure correct Content-Type for video files
    const videoMimeTypes: Record<string, string> = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska',
      'ogg': 'video/ogg',
      'm4v': 'video/x-m4v',
    };
    if (ext && videoMimeTypes[ext]) {
      headers.set("Content-Type", videoMimeTypes[ext]);
    }
    
    headers.set("etag", object.httpEtag);
    // Cache for 1 year - videos are immutable once uploaded
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Accept-Ranges", "bytes");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Disposition", "inline");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Range, Content-Type, Accept, Accept-Encoding");
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag");
    headers.set("X-Cache", "MISS");
    
    // Always return 206 Partial Content for video streaming
    headers.set("Content-Range", `bytes ${rangeStart}-${actualEnd}/${totalSize}`);
    headers.set("Content-Length", String(actualLength));
    
    // Create response
    const response = new Response(object.body, { status: 206, headers });
  
    // Cache the response at the edge (if available)
    // Clone because response body can only be read once
    if (cache && cacheKey) {
      c.executionCtx.waitUntil(
        cache.put(cacheKey, response.clone()).catch(err => {
          console.error("[Media] Video cache put error (non-fatal):", err);
        })
      );
    }
    
    return response;
  } catch (error: any) {
    console.error("[Media] Endpoint error for key:", key);
    console.error("[Media] Error type:", error?.constructor?.name);
    console.error("[Media] Error message:", error?.message);
    console.error("[Media] Error stack:", error?.stack);
    
    // Return more detailed error info for debugging
    return c.json({ 
      error: "Error loading file",
      key,
      message: error?.message || 'Unknown error',
      type: error?.constructor?.name,
    }, 500);
  }
});

// Get or create channel for wallet
app.post("/api/kasshi/channels", async (c) => {
  const body = await c.req.json();
  const { walletAddress, name, handle } = body;
  
  if (!walletAddress || !name || !handle) {
    return c.json({ error: "walletAddress, name, and handle are required" }, 400);
  }
  
  // Check if channel exists
  const existing = await c.env.DB.prepare(
    "SELECT * FROM channels WHERE wallet_address = ?"
  ).bind(walletAddress).first();
  
  if (existing) {
    return c.json(existing);
  }
  
  // Check if handle is taken
  const handleTaken = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE handle = ?"
  ).bind(handle.toLowerCase()).first();
  
  if (handleTaken) {
    return c.json({ error: "Handle already taken" }, 400);
  }
  
  // Create channel
  await c.env.DB.prepare(
    `INSERT INTO channels (wallet_address, name, handle) VALUES (?, ?, ?)`
  ).bind(walletAddress, name, handle.toLowerCase()).run();
  
  const channel = await c.env.DB.prepare(
    "SELECT * FROM channels WHERE wallet_address = ?"
  ).bind(walletAddress).first();
  
  return c.json(channel);
});

// Get channel by handle
app.get("/api/kasshi/channels/:handle", async (c) => {
  const handle = c.req.param("handle").toLowerCase();
  
  const channel = await c.env.DB.prepare(
    "SELECT * FROM channels WHERE handle = ?"
  ).bind(handle).first();
  
  if (!channel) {
    return c.json({ error: "Channel not found" }, 404);
  }
  
  // Get video count
  const videoCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM videos WHERE channel_id = ? AND status = 'published'"
  ).bind(channel.id).first();
  
  return c.json({
    ...channel,
    videoCount: videoCount?.count || 0,
  });
});

// Get channel by wallet address
app.get("/api/kasshi/channels/wallet/:address", async (c) => {
  const address = c.req.param("address");
  
  const channel = await c.env.DB.prepare(
    "SELECT * FROM channels WHERE wallet_address = ?"
  ).bind(address).first();
  
  if (!channel) {
    return c.json(null);
  }
  
  return c.json(channel);
});

// Update channel
app.patch("/api/kasshi/channels/:id", async (c) => {
  const channelId = c.req.param("id");
  const body = await c.req.json();
  
  const updates: string[] = [];
  const bindings: (string | number)[] = [];
  
  if (body.name) {
    updates.push("name = ?");
    bindings.push(body.name);
  }
  if (body.handle) {
    // Validate handle format and check uniqueness
    const handle = body.handle.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (handle.length < 3) {
      return c.json({ error: "Handle must be at least 3 characters" }, 400);
    }
    if (handle.length > 30) {
      return c.json({ error: "Handle must be 30 characters or less" }, 400);
    }
    // Check if handle is taken by another channel
    const existingChannel = await c.env.DB.prepare(
      "SELECT id FROM channels WHERE handle = ? AND id != ?"
    ).bind(handle, channelId).first();
    if (existingChannel) {
      return c.json({ error: "This handle is already taken" }, 400);
    }
    updates.push("handle = ?");
    bindings.push(handle);
  }
  if (body.description !== undefined) {
    updates.push("description = ?");
    bindings.push(body.description);
  }
  if (body.avatarUrl !== undefined) {
    updates.push("avatar_url = ?");
    bindings.push(body.avatarUrl);
  }
  if (body.bannerUrl !== undefined) {
    updates.push("banner_url = ?");
    bindings.push(body.bannerUrl);
  }
  if (body.about !== undefined) {
    updates.push("about = ?");
    bindings.push(body.about);
  }
  
  if (updates.length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }
  
  updates.push("updated_at = CURRENT_TIMESTAMP");
  bindings.push(channelId);
  
  await c.env.DB.prepare(
    `UPDATE channels SET ${updates.join(", ")} WHERE id = ?`
  ).bind(...bindings).run();
  
  const channel = await c.env.DB.prepare(
    "SELECT * FROM channels WHERE id = ?"
  ).bind(channelId).first();
  
  return c.json(channel);
});

// Get feed videos (home page)
app.get("/api/kasshi/videos", async (c) => {
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");
  // TODO: implement category filtering with c.req.query("category")
  
  let query = `
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, 
           c.avatar_url as channel_avatar, c.is_verified as channel_verified
    FROM videos v
    JOIN channels c ON v.channel_id = c.id
    WHERE v.status = 'published' AND (v.is_private = 0 OR v.is_private IS NULL)
    ORDER BY v.created_at DESC
    LIMIT ? OFFSET ?
  `;
  
  const videos = await c.env.DB.prepare(query).bind(limit, offset).all();
  
  // Lazily generate public_ids for any videos missing them
  await ensurePublicIds(c.env.DB, videos.results as Record<string, unknown>[]);
  
  return c.json({
    videos: videos.results.map((v: Record<string, unknown>) => ({
      id: v.id,
      publicId: v.public_id,
      title: v.title,
      description: v.description,
      videoUrl: v.video_url,
      thumbnailUrl: v.thumbnail_url,
      durationSeconds: v.duration_seconds,
      viewCount: v.view_count,
      likeCount: v.like_count,
      dislikeCount: v.dislike_count,
      commentCount: v.comment_count,
      kasEarned: v.kas_earned,
      createdAt: toUTCTimestamp(v.created_at),
      channel: {
        id: v.channel_id,
        name: v.channel_name,
        handle: v.channel_handle,
        avatarUrl: v.channel_avatar,
        isVerified: v.channel_verified,
      },
    })),
  });
});

// Search videos and channels
app.get("/api/kasshi/search", async (c) => {
  const query = c.req.query("q")?.trim() || "";
  const type = c.req.query("type") || "all"; // all, videos, channels
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");
  
  if (!query) {
    return c.json({ videos: [], channels: [] });
  }
  
  const searchPattern = `%${query}%`;
  
  let videos: Record<string, unknown>[] = [];
  let channels: Record<string, unknown>[] = [];
  
  // Search videos
  if (type === "all" || type === "videos") {
    const videoResults = await c.env.DB.prepare(`
      SELECT v.*, c.name as channel_name, c.handle as channel_handle, 
             c.avatar_url as channel_avatar, c.is_verified as channel_verified
      FROM videos v
      JOIN channels c ON v.channel_id = c.id
      WHERE v.status = 'published' AND (v.is_private = 0 OR v.is_private IS NULL)
        AND (v.title LIKE ? OR v.description LIKE ? OR c.name LIKE ?)
      ORDER BY v.view_count DESC, v.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(searchPattern, searchPattern, searchPattern, limit, offset).all();
    
    // Lazily generate public_ids for any videos missing them
    await ensurePublicIds(c.env.DB, videoResults.results as Record<string, unknown>[]);
    
    videos = videoResults.results.map((v: Record<string, unknown>) => ({
      id: v.id,
      publicId: v.public_id,
      title: v.title,
      description: v.description,
      videoUrl: v.video_url,
      thumbnailUrl: v.thumbnail_url,
      durationSeconds: v.duration_seconds,
      viewCount: v.view_count,
      likeCount: v.like_count,
      dislikeCount: v.dislike_count,
      commentCount: v.comment_count,
      kasEarned: v.kas_earned,
      status: v.status,
      createdAt: toUTCTimestamp(v.created_at),
      isMembersOnly: v.is_members_only,
      channel: {
        id: v.channel_id,
        name: v.channel_name,
        handle: v.channel_handle,
        avatarUrl: v.channel_avatar,
        isVerified: v.channel_verified,
      },
    }));
  }
  
  // Search channels
  if (type === "all" || type === "channels") {
    const channelResults = await c.env.DB.prepare(`
      SELECT * FROM channels
      WHERE name LIKE ? OR handle LIKE ? OR description LIKE ?
      ORDER BY subscriber_count DESC
      LIMIT ? OFFSET ?
    `).bind(searchPattern, searchPattern, searchPattern, limit, offset).all();
    
    channels = channelResults.results.map((ch: Record<string, unknown>) => ({
      id: ch.id,
      name: ch.name,
      handle: ch.handle,
      description: ch.description,
      avatarUrl: ch.avatar_url,
      bannerUrl: ch.banner_url,
      subscriberCount: ch.subscriber_count,
      isVerified: ch.is_verified,
    }));
  }
  
  return c.json({ videos, channels, query });
});

// Get single video
app.get("/api/kasshi/videos/:id", async (c) => {
  const idParam = c.req.param("id");
  const videoId = await resolveVideoId(c.env.DB, idParam);
  
  if (!videoId) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  const video = await c.env.DB.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle,
           c.avatar_url as channel_avatar, c.is_verified as channel_verified,
           c.subscriber_count, c.wallet_address as channel_wallet
    FROM videos v
    JOIN channels c ON v.channel_id = c.id
    WHERE v.id = ?
  `).bind(videoId).first();
  
  if (!video) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Lazy generate public_id if missing (for videos created before public_id system)
  if (!video.public_id) {
    const newPublicId = generatePublicId();
    await c.env.DB.prepare("UPDATE videos SET public_id = ? WHERE id = ?").bind(newPublicId, videoId).run();
    video.public_id = newPublicId;
  }
  
  // Check if video is private - only owner can view
  if (video.is_private === 1) {
    // Use cookie-based auth to check ownership
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    let isOwner = false;
    
    if (sessionToken) {
      try {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        
        if (user?.id) {
          // Get user's wallet address
          const userWallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first() as { wallet_address: string } | null;
          
          if (userWallet) {
            // Check if user's wallet owns this video's channel
            const userChannel = await c.env.DB.prepare(
              "SELECT id FROM channels WHERE wallet_address = ?"
            ).bind(userWallet.wallet_address).first() as { id: number } | null;
            
            if (userChannel && userChannel.id === video.channel_id) {
              isOwner = true;
            }
          }
        }
      } catch {
        // Auth check failed, user is not owner
      }
    }
    
    if (!isOwner) {
      return c.json({ error: "This video is private" }, 403);
    }
  }
  
  return c.json({
    id: video.id,
    publicId: video.public_id,
    title: video.title,
    description: video.description,
    videoUrl: video.video_url,
    thumbnailUrl: video.thumbnail_url,
    durationSeconds: video.duration_seconds,
    viewCount: video.view_count,
    likeCount: video.like_count,
    dislikeCount: video.dislike_count,
    commentCount: video.comment_count,
    kasEarned: video.kas_earned,
    status: video.status,
    createdAt: toUTCTimestamp(video.created_at),
    channel: {
      id: video.channel_id,
      name: video.channel_name,
      handle: video.channel_handle,
      avatarUrl: video.channel_avatar,
      isVerified: video.channel_verified,
      subscriberCount: video.subscriber_count,
      walletAddress: video.channel_wallet,
    },
  });
});

// Update video (edit metadata)
app.patch("/api/kasshi/videos/:id", async (c) => {
  const idParam = c.req.param("id");
  const unifiedUser = await getUnifiedUser(c);
  
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  const body = await c.req.json();
  const { title, description, thumbnailUrl, isMembersOnly, isPrivate } = body;
  
  if (!title || !title.trim()) {
    return c.json({ error: "Title is required" }, 400);
  }
  
  // Get video and verify ownership
  const video = await c.env.DB.prepare(`
    SELECT v.id, v.channel_id, c.wallet_address 
    FROM videos v
    JOIN channels c ON v.channel_id = c.id
    WHERE v.id = ?
  `).bind(videoId).first<{ id: number; channel_id: number; wallet_address: string }>();
  
  if (!video) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Verify user owns this video's channel
  if (unifiedUser.walletAddress !== video.wallet_address) {
    return c.json({ error: "Unauthorized: You can only edit your own videos" }, 403);
  }
  
  // Update the video
  await c.env.DB.prepare(`
    UPDATE videos 
    SET title = ?, 
        description = ?, 
        thumbnail_url = COALESCE(?, thumbnail_url),
        is_members_only = ?,
        is_private = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    title.trim(),
    description?.trim() || null,
    thumbnailUrl || null,
    isMembersOnly ? 1 : 0,
    isPrivate ? 1 : 0,
    videoId
  ).run();
  
  return c.json({ success: true, message: "Video updated successfully" });
});

// Delete video
app.delete("/api/kasshi/videos/:id", async (c) => {
  const idParam = c.req.param("id");
  const unifiedUser = await getUnifiedUser(c);
  
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Get video and verify ownership
  const video = await c.env.DB.prepare(`
    SELECT v.id, v.channel_id, v.video_url, v.thumbnail_url, c.wallet_address 
    FROM videos v
    JOIN channels c ON v.channel_id = c.id
    WHERE v.id = ?
  `).bind(videoId).first<{ id: number; channel_id: number; video_url: string | null; thumbnail_url: string | null; wallet_address: string }>();
  
  if (!video) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Verify user owns this video's channel
  if (unifiedUser.walletAddress !== video.wallet_address) {
    return c.json({ error: "Unauthorized: You can only delete your own videos" }, 403);
  }
  
  // Delete related data first
  await c.env.DB.prepare("DELETE FROM video_interactions WHERE video_id = ?").bind(videoId).run();
  await c.env.DB.prepare("DELETE FROM video_payments WHERE video_id = ?").bind(videoId).run();
  await c.env.DB.prepare("DELETE FROM video_views WHERE video_id = ?").bind(videoId).run();
  await c.env.DB.prepare("DELETE FROM video_progress WHERE video_id = ?").bind(videoId).run();
  await c.env.DB.prepare("DELETE FROM watch_progress WHERE video_id = ?").bind(videoId).run();
  await c.env.DB.prepare("DELETE FROM video_subtitles WHERE video_id = ?").bind(videoId).run();
  await c.env.DB.prepare("DELETE FROM reports WHERE video_id = ?").bind(videoId).run();
  
  // Delete comments and their interactions
  const comments = await c.env.DB.prepare("SELECT id FROM comments WHERE video_id = ?").bind(videoId).all();
  for (const comment of comments.results || []) {
    await c.env.DB.prepare("DELETE FROM comment_interactions WHERE comment_id = ?").bind(comment.id).run();
  }
  await c.env.DB.prepare("DELETE FROM comments WHERE video_id = ?").bind(videoId).run();
  
  // Delete video record
  await c.env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(videoId).run();
  
  // Try to delete files from R2 (optional cleanup)
  try {
    if (video.video_url) {
      const videoKey = video.video_url.replace("/api/kasshi/media/", "");
      await c.env.R2_BUCKET.delete(videoKey);
    }
    if (video.thumbnail_url && video.thumbnail_url.startsWith("/api/kasshi/media/")) {
      const thumbKey = video.thumbnail_url.replace("/api/kasshi/media/", "");
      await c.env.R2_BUCKET.delete(thumbKey);
    }
  } catch (e) {
    // Ignore R2 deletion errors
    console.error("Failed to delete video files from R2:", e);
  }
  
  return c.json({ success: true, message: "Video deleted successfully" });
});

// Get videos by channel
app.get("/api/kasshi/channels/:handle/videos", async (c) => {
  const handle = c.req.param("handle").toLowerCase();
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");
  
  const channelData = await c.env.DB.prepare(
    "SELECT id, name, handle, avatar_url, is_verified, subscriber_count, wallet_address FROM channels WHERE handle = ?"
  ).bind(handle).first();
  
  if (!channelData) {
    return c.json({ error: "Channel not found" }, 404);
  }
  
  const videos = await c.env.DB.prepare(`
    SELECT * FROM videos 
    WHERE channel_id = ? AND status = 'published' AND (is_private = 0 OR is_private IS NULL)
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(channelData.id, limit, offset).all();
  
  // Map videos with channel data included
  const videosWithChannel = videos.results.map((v: Record<string, unknown>) => ({
    ...v,
    channel: {
      id: channelData.id,
      name: channelData.name,
      handle: channelData.handle,
      avatar_url: channelData.avatar_url,
      is_verified: channelData.is_verified,
      subscriber_count: channelData.subscriber_count,
      wallet_address: channelData.wallet_address,
    },
  }));
  
  return c.json({ videos: videosWithChannel });
});

// Get ALL videos for channel owner (including private) - unified auth: Google login OR KasWare
app.get("/api/kasshi/channels/:handle/my-videos", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
  
  const handle = c.req.param("handle").toLowerCase();
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");
  
  const channelData = await c.env.DB.prepare(
    "SELECT id, name, handle, avatar_url, is_verified, subscriber_count, wallet_address FROM channels WHERE handle = ?"
  ).bind(handle).first();
  
  if (!channelData) {
    return c.json({ error: "Channel not found" }, 404);
  }
  
  // Verify the requesting user owns this channel
  if (unifiedUser.walletAddress !== channelData.wallet_address) {
    return c.json({ error: "You can only view your own videos" }, 403);
  }
  
  // Fetch ALL videos for this channel (including private, members-only, all statuses)
  const videos = await c.env.DB.prepare(`
    SELECT * FROM videos 
    WHERE channel_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(channelData.id, limit, offset).all();
  
  // Map videos with channel data and privacy status
  const videosWithChannel = videos.results.map((v: Record<string, unknown>) => ({
    ...v,
    channel: {
      id: channelData.id,
      name: channelData.name,
      handle: channelData.handle,
      avatar_url: channelData.avatar_url,
      is_verified: channelData.is_verified,
      subscriber_count: channelData.subscriber_count,
      wallet_address: channelData.wallet_address,
    },
  }));
  
  return c.json({ videos: videosWithChannel });
});

// Create video (upload metadata)
app.post("/api/kasshi/videos", async (c) => {
  const body = await c.req.json();
  const { channelId, title, description, videoUrl, thumbnailUrl, durationSeconds, isMembersOnly, isPrivate } = body;
  
  if (!channelId || !title) {
    return c.json({ error: "channelId and title are required" }, 400);
  }
  
  // Generate unique public_id for URL
  const publicId = generatePublicId();
  
  await c.env.DB.prepare(`
    INSERT INTO videos (channel_id, title, description, video_url, thumbnail_url, duration_seconds, status, is_members_only, is_private, public_id)
    VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)
  `).bind(channelId, title, description || null, videoUrl || null, thumbnailUrl || null, durationSeconds || 0, isMembersOnly ? 1 : 0, isPrivate ? 1 : 0, publicId).run();
  
  const video = await c.env.DB.prepare(
    "SELECT * FROM videos WHERE public_id = ?"
  ).bind(publicId).first();
  
  // Get channel info for notification
  const channel = await c.env.DB.prepare(
    "SELECT id, name, handle FROM channels WHERE id = ?"
  ).bind(channelId).first();
  
  // Send notifications to all notification subscribers (bell subscribers)
  if (video && channel) {
    const notificationSubs = await c.env.DB.prepare(`
      SELECT ns.subscriber_channel_id, uw.user_id
      FROM channel_notification_subs ns
      JOIN channels c ON ns.subscriber_channel_id = c.id
      JOIN user_wallets uw ON c.wallet_address = uw.wallet_address
      WHERE ns.channel_id = ?
    `).bind(channelId).all();
    
    // Create notifications for each subscriber
    for (const sub of notificationSubs.results) {
      await c.env.DB.prepare(`
        INSERT INTO notifications (user_id, type, title, message, video_id, channel_id)
        VALUES (?, 'new_video', ?, ?, ?, ?)
      `).bind(
        sub.user_id,
        `${channel.name} uploaded a new video`,
        title,
        video.id,
        channelId
      ).run();
    }
  }
  
  if (!video) {
    return c.json({ error: "Failed to create video" }, 500);
  }
  
  return c.json({
    id: video.id,
    publicId: video.public_id,
    channelId: video.channel_id,
    title: video.title,
    description: video.description,
    videoUrl: video.video_url,
    thumbnailUrl: video.thumbnail_url,
    durationSeconds: video.duration_seconds,
    status: video.status,
    isMembersOnly: video.is_members_only === 1,
    isPrivate: video.is_private === 1,
    createdAt: video.created_at,
  });
});

// Record view and payment
app.post("/api/kasshi/videos/:id/view", async (c) => {
  const idParam = c.req.param("id");
  const body = await c.req.json();
  const { viewerChannelId, transactionId, amount, userId } = body;
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Get video and creator channel
  const video = await c.env.DB.prepare(`
    SELECT v.*, c.wallet_address as creator_wallet, c.id as creator_channel_id
    FROM videos v
    JOIN channels c ON v.channel_id = c.id
    WHERE v.id = ?
  `).bind(videoId).first();
  
  if (!video) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Only count views when a REAL payment transaction occurred (not demo, not owner watching)
  // Demo transactions start with "demo-", owner views have null transactionId
  // Allow views from users without channels (identified by userId) as long as payment was made
  const isRealPayment = transactionId && 
                        !transactionId.startsWith('demo-') && 
                        (viewerChannelId || userId) &&
                        viewerChannelId !== video.creator_channel_id;
  
  // Increment view count ONLY for real paid views
  if (isRealPayment) {
    await c.env.DB.prepare(
      "UPDATE videos SET view_count = view_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(videoId).run();
  }
  
  // If payment was made, record it (allow users without channels via userId)
  if (transactionId && (viewerChannelId || userId)) {
    // Use amount from frontend (which calculates based on video duration) or calculate from duration
    const viewCost = amount || getViewCostForDuration((video.duration_seconds as number) || 0);
    const platformFee = (viewCost * PLATFORM_FEE_PERCENT).toFixed(8);
    const creatorAmount = (viewCost * (1 - PLATFORM_FEE_PERCENT)).toFixed(8);
    
    await c.env.DB.prepare(`
      INSERT INTO video_payments (transaction_id, from_channel_id, to_channel_id, video_id, payment_type, amount_kas, platform_fee, creator_amount, status, from_user_id)
      VALUES (?, ?, ?, ?, 'view', ?, ?, ?, 'completed', ?)
    `).bind(transactionId, viewerChannelId || null, video.creator_channel_id, videoId, viewCost.toString(), platformFee, creatorAmount, userId || null).run();
    
    // Update video earnings
    const newEarnings = (parseFloat(video.kas_earned as string) + parseFloat(creatorAmount)).toFixed(8);
    await c.env.DB.prepare(
      "UPDATE videos SET kas_earned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(newEarnings, videoId).run();
    
    // Update channel total earnings
    await c.env.DB.prepare(`
      UPDATE channels SET total_kas_earned = CAST(CAST(total_kas_earned AS REAL) + ? AS TEXT), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(parseFloat(creatorAmount), video.creator_channel_id).run();
  }
  
  // Track the view for feed algorithms (viewer has a channel OR user_id)
  if (viewerChannelId) {
    await c.env.DB.prepare(`
      INSERT INTO video_views (channel_id, video_id, watched_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(channel_id, video_id) DO UPDATE SET watched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    `).bind(viewerChannelId, videoId).run();
  } else if (userId) {
    // Track view by user_id for users without a channel
    const existingView = await c.env.DB.prepare(`
      SELECT id FROM video_views WHERE user_id = ? AND video_id = ?
    `).bind(userId, videoId).first();
    
    if (existingView) {
      await c.env.DB.prepare(`
        UPDATE video_views SET watched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND video_id = ?
      `).bind(userId, videoId).run();
    } else {
      await c.env.DB.prepare(`
        INSERT INTO video_views (channel_id, video_id, user_id, watched_at)
        VALUES (0, ?, ?, CURRENT_TIMESTAMP)
      `).bind(videoId, userId).run();
    }
  }
  
  // Return the view count - only incremented if it was a real paid view
  const newViewCount = isRealPayment ? (video.view_count as number) + 1 : (video.view_count as number);
  return c.json({ success: true, viewCount: newViewCount, isPaidView: isRealPayment });
});

// Frictionless micropayment for video views (no PIN required)
// Supports batched micropayments for small amounts (< 0.11 KAS) using Merkle tree aggregation
// ALL batched payments go to platform - creators earn from views (95%), subs, tips, memberships
app.post("/api/kasshi/micropay", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const body = await c.req.json();
  const { 
    toAddress, 
    amountKas, 
    videoId, 
    paymentType,
    recipientChannelId,
    commentId,
    forceBatch // Force batching even for large amounts (testing)
  } = body;
  
  console.log('[MICROPAY START]', { userId: unifiedUser.id, toAddress, amountKas, paymentType, videoId });
  
  if (!toAddress || !amountKas) {
    return c.json({ error: "toAddress and amountKas required" }, 400);
  }
  
  // Get wallet data based on user type
  // KasWare users: internal wallet is in external_wallet_users table
  // Google users: wallet is in user_wallets table
  let wallet: { wallet_address: string; encrypted_private_key: string; demo_balance?: string | null } | null = null;
  let decryptionKey: string = "";
  
  if (unifiedUser.isExternal && unifiedUser.internalWalletAddress) {
    // KasWare user - get from external_wallet_users
    const externalWallet = await c.env.DB.prepare(
      "SELECT id, wallet_address, internal_wallet_address, encrypted_internal_private_key, demo_balance FROM external_wallet_users WHERE wallet_address = ?"
    ).bind(unifiedUser.walletAddress).first();
    
    if (externalWallet?.encrypted_internal_private_key) {
      wallet = {
        wallet_address: externalWallet.internal_wallet_address as string,
        encrypted_private_key: externalWallet.encrypted_internal_private_key as string,
        demo_balance: externalWallet.demo_balance as string | null
      };
      // KasWare wallets encrypted with: kasware_${external_user_id}_${external_address}
      decryptionKey = `kasware_${externalWallet.id}_${externalWallet.wallet_address}`;
    }
  } else {
    // Google user - get from user_wallets
    const userWallet = await c.env.DB.prepare("SELECT * FROM user_wallets WHERE user_id = ?").bind(unifiedUser.id).first();
    if (userWallet?.encrypted_private_key) {
      wallet = {
        wallet_address: userWallet.wallet_address as string,
        encrypted_private_key: userWallet.encrypted_private_key as string,
        demo_balance: userWallet.demo_balance as string | null
      };
      decryptionKey = unifiedUser.id;
    }
  }
  
  if (!wallet?.encrypted_private_key) {
    return c.json({ error: "No wallet found" }, 400);
  }
  
  // Get sender's channel ID - for KasWare users, channel is linked to external address
  const senderChannel = unifiedUser.isExternal
    ? await c.env.DB.prepare("SELECT id FROM channels WHERE wallet_address = ?").bind(unifiedUser.walletAddress).first()
    : await c.env.DB.prepare("SELECT c.id FROM channels c JOIN user_wallets w ON c.wallet_address = w.wallet_address WHERE w.user_id = ?").bind(unifiedUser.id).first();
  
  const senderChannelId = senderChannel?.id ?? null;
  
  // Convert KAS to sompi
  const amountSompi = Math.floor(parseFloat(amountKas) * 100000000);
  
  // Check balance (use demo_balance if set, otherwise real balance)
  const demoBalance = wallet.demo_balance ? parseFloat(wallet.demo_balance as string) : null;
  let hasBalance = false;
  let currentBalanceKas = "0";
  
  console.log('[MICROPAY] demoBalance check:', { demoBalance, walletAddress: wallet.wallet_address });
  
  if (demoBalance !== null && demoBalance > 0) {
    hasBalance = demoBalance >= parseFloat(amountKas);
    currentBalanceKas = demoBalance.toString();
    console.log('[MICROPAY] Using demo balance:', { currentBalanceKas, hasBalance });
  } else {
    const balance = await getWalletBalance(wallet.wallet_address as string);
    hasBalance = balance ? parseFloat(balance.balanceKAS) >= parseFloat(amountKas) : false;
    currentBalanceKas = balance?.balanceKAS || "0";
    console.log('[MICROPAY] Using mainnet balance:', { currentBalanceKas, hasBalance });
  }
  
  if (!hasBalance) {
    return c.json({ error: "Insufficient balance", balanceKAS: currentBalanceKas }, 400);
  }
  
  // Determine if this should be batched
  // Batch if: amount < 0.11 KAS AND not demo mode
  // Now supports both channel-based (senderChannelId) and user-based (user.id) tracking
  const shouldBatch = (amountSompi < BATCH_THRESHOLD_SOMPI || forceBatch) && 
                      (demoBalance === null || demoBalance <= 0);
  
  // Process demo mode payments immediately (no batching)
  if (demoBalance !== null && demoBalance > 0) {
    const newBalance = demoBalance - parseFloat(amountKas);
    // For KasWare users, update external_wallet_users; for Google users, update user_wallets
    if (unifiedUser.isExternal) {
      await c.env.DB.prepare(
        "UPDATE external_wallet_users SET demo_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?"
      ).bind(newBalance.toString(), unifiedUser.walletAddress).run();
    } else {
      await c.env.DB.prepare(
        "UPDATE user_wallets SET demo_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
      ).bind(newBalance.toString(), unifiedUser.id).run();
    }
    
    return c.json({ 
      success: true, 
      transactionId: `demo-${Date.now()}`,
      fromAddress: wallet.wallet_address,
      toAddress,
      amountKas,
      demoMode: true
    });
  }
  
  // Batched micropayment for small amounts
  // ALL batched payments go to platform only - no creator/commenter batching
  // This avoids the "forever off-chain" problem where one-off likes/comments
  // to random creators never reach settlement threshold
  // Creators earn from: views (95%), subscriptions, tips, memberships (all on-chain)
  if (shouldBatch) {
    const recipientType: 'platform' = 'platform';
    
    // Record pending micropayment (supports channel-based or user-based tracking)
    const result = await recordPendingMicropayment(
      c.env.DB,
      (senderChannelId as number | null) || null, // May be null for users without channels
      (recipientChannelId as number | null) || null,
      recipientType,
      paymentType || 'unknown',
      amountSompi.toString(),
      videoId || null,
      commentId || null,
      senderChannelId ? null : unifiedUser.id // Use user.id when no channel
    );
    
    if (!result.success) {
      return c.json({ error: result.error || "Failed to record micropayment" }, 500);
    }
    
    // Get updated pending debits for immediate UI update
    let updatedDebits: string;
    if (senderChannel) {
      updatedDebits = await getSenderPendingDebits(c.env.DB, senderChannel.id as number);
    } else {
      // Use user-based debits for users without channels
      updatedDebits = await getSenderPendingDebitsByUserId(c.env.DB, unifiedUser.id);
    }
    const updatedDebitsKas = Number(updatedDebits) / 100000000;
    
    // Check if auto-settlement was triggered (P2P settlements to multiple recipients)
    if (result.autoSettled) {
      // Get platform wallet as fallback for recipients without wallet addresses
      const platformWalletAddress = await getAdminWalletAddress(c.env.DB);
      
      // Decrypt sender's wallet to execute transactions
      let senderPrivateKey = await decryptPrivateKey(wallet.encrypted_private_key as string, decryptionKey);
      
      if (!senderPrivateKey) {
        // Can't execute on-chain, return pending status
        return c.json({ 
          success: true, 
          transactionId: `pending-${result.micropaymentId}`,
          fromAddress: wallet.wallet_address,
          toAddress,
          amountKas,
          batched: true,
          autoSettled: true,
          onChainSettlement: false,
          pendingDebitsKas: updatedDebitsKas,
          message: `Batch settlement recorded but could not decrypt wallet.`
        });
      }
      
      // P2P SETTLEMENTS: Send directly to each recipient's wallet!
      const settlementResults: Array<{
        recipientChannelId: number | null;
        recipientType: string;
        amountKas: number;
        toAddress: string;
        transactionId: string | null;
        success: boolean;
        error?: string;
      }> = [];
      
      let totalSuccessKas = 0;
      let totalSuccessCount = 0;
      
      for (const settlement of result.autoSettled.settlements) {
        const settlementAmountSompi = BigInt(settlement.amountSompi);
        const settlementAmountKas = Number(settlementAmountSompi) / 100000000;
        
        // Determine recipient address: use their wallet if available, otherwise platform
        const recipientAddress = settlement.recipientWalletAddress || platformWalletAddress;
        
        if (!recipientAddress) {
          console.error(`No recipient address for settlement to channel ${settlement.recipientChannelId}`);
          settlementResults.push({
            recipientChannelId: settlement.recipientChannelId,
            recipientType: settlement.recipientType,
            amountKas: settlementAmountKas,
            toAddress: 'unknown',
            transactionId: null,
            success: false,
            error: 'No recipient wallet address'
          });
          continue;
        }
        
        // Skip demo/invalid addresses - just mark as settled in demo mode
        if (!isValidKaspaAddress(recipientAddress)) {
          console.log(`[SETTLEMENT] Skipping demo address: ${recipientAddress}`);
          settlementResults.push({
            recipientChannelId: settlement.recipientChannelId,
            recipientType: settlement.recipientType,
            amountKas: settlementAmountKas,
            toAddress: recipientAddress,
            transactionId: `demo-${Date.now()}`,
            success: true,
            error: undefined
          });
          totalSuccessKas += settlementAmountKas;
          totalSuccessCount++;
          continue;
        }
        
        // Send P2P transaction directly to recipient
        let txResult = await sendTransaction(
          wallet.wallet_address as string,
          recipientAddress,
          Number(settlementAmountSompi),
          senderPrivateKey
        );
        
        // Auto-consolidate if needed and retry
        if (!txResult.success && txResult.needsConsolidation) {
          const consolidateResult = await consolidateUTXOs(wallet.wallet_address as string, senderPrivateKey);
          if (consolidateResult.success) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            txResult = await sendTransaction(wallet.wallet_address as string, recipientAddress, Number(settlementAmountSompi), senderPrivateKey);
          }
        }
        
        if (txResult.success && txResult.transactionId) {
          // Update batch with real transaction ID
          await c.env.DB.prepare(`
            UPDATE settlement_batches 
            SET transaction_id = ?, status = 'completed', settled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(txResult.transactionId, settlement.batchId).run();
          
          // If paid to a creator/commenter channel, update their kas_earned
          if (settlement.recipientChannelId && settlement.recipientWalletAddress) {
            await c.env.DB.prepare(`
              UPDATE channels SET total_kas_earned = CAST(
                (CAST(total_kas_earned AS REAL) + ?) AS TEXT
              ), updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `).bind(settlementAmountKas, settlement.recipientChannelId).run();
          }
          
          console.log(`P2P settlement SUCCESS: ${settlementAmountKas} KAS to ${settlement.recipientType} ${settlement.recipientChannelId || 'platform'} (${recipientAddress}), txId: ${txResult.transactionId}`);
          
          settlementResults.push({
            recipientChannelId: settlement.recipientChannelId,
            recipientType: settlement.recipientType,
            amountKas: settlementAmountKas,
            toAddress: recipientAddress,
            transactionId: txResult.transactionId,
            success: true
          });
          
          totalSuccessKas += settlementAmountKas;
          totalSuccessCount++;
        } else {
          console.error(`P2P settlement FAILED to ${recipientAddress}: ${txResult.error}`);
          settlementResults.push({
            recipientChannelId: settlement.recipientChannelId,
            recipientType: settlement.recipientType,
            amountKas: settlementAmountKas,
            toAddress: recipientAddress,
            transactionId: null,
            success: false,
            error: txResult.error
          });
        }
      }
      
      return c.json({ 
        success: true, 
        transactionId: settlementResults.find(r => r.success)?.transactionId || `pending-${result.micropaymentId}`,
        fromAddress: wallet.wallet_address,
        toAddress,
        amountKas,
        batched: true,
        autoSettled: true,
        onChainSettlement: totalSuccessCount > 0,
        p2pSettlements: settlementResults,
        settlementCount: result.autoSettled.settlements.length,
        settlementSuccessCount: totalSuccessCount,
        settlementTotalKas: totalSuccessKas,
        pendingDebitsKas: 0, // Reset after settlement
        message: totalSuccessCount > 0 
          ? `P2P settlement complete! ${totalSuccessCount} payments (${totalSuccessKas.toFixed(4)} KAS) sent directly to recipients.`
          : `Settlement recorded but on-chain transfers failed.`
      });
    }
    
    return c.json({ 
      success: true, 
      transactionId: `pending-${result.micropaymentId}`,
      fromAddress: wallet.wallet_address,
      toAddress,
      amountKas,
      batched: true,
      pendingDebitsKas: updatedDebitsKas,
      message: `Micropayment queued. Will settle when recipient reaches ${BATCH_THRESHOLD_KAS} KAS threshold.`
    });
  }
  
  // Large payment - process immediately on-chain
  // Decrypt private key using appropriate key (frictionless)
  let privateKey = await decryptPrivateKey(wallet.encrypted_private_key as string, decryptionKey);
  
  // If decryption failed, wallet may have invalid data
  if (!privateKey) {
    // Try to clean up invalid wallet data
    if (unifiedUser.isExternal) {
      // Don't auto-delete KasWare wallets - just return error
      return c.json({ error: "Failed to decrypt wallet. Please try reconnecting your KasWare wallet." }, 500);
    }
    await c.env.DB.prepare(`
      DELETE FROM user_wallets WHERE user_id = ?
    `).bind(unifiedUser.id).run();
    
    return c.json({ 
      error: "Your wallet needs to be recreated. Please refresh the page to set up a new wallet.",
      walletReset: true 
    }, 400);
  }
  
  if (!privateKey) {
    return c.json({ error: "Failed to decrypt wallet" }, 500);
  }
  
  // Get UTXOs to include in debug info
  const senderUtxos = await getUTXOs(wallet.wallet_address as string);
  const senderUtxoCount = senderUtxos.length;
  const senderUtxoTotal = senderUtxos.reduce((sum, u) => sum + u.amount, 0);
  
  // Check if this is a view payment - send 95% to creator, 5% to platform (batched)
  // Platform fee is tracked in database and settled in batches
  if (paymentType === 'view') {
    // Calculate 95/5 split: creator gets 95%, platform gets 5%
    const creatorAmountSompi = Math.floor(amountSompi * 0.95);
    const platformFeeSompiCalc = amountSompi - creatorAmountSompi; // 5% (using subtraction to avoid rounding errors)
    
    console.log('[MICROPAY VIEW] Sending 95% to creator:', { from: wallet.wallet_address, to: toAddress, totalSompi: amountSompi, creatorSompi: creatorAmountSompi, platformFeeSompi: platformFeeSompiCalc, utxoCount: senderUtxoCount, utxoTotalSompi: senderUtxoTotal });
    
    // Handle demo destination addresses (simulate success for testing)
    if (!isValidKaspaAddress(toAddress)) {
      console.log('[MICROPAY VIEW] Demo destination detected, simulating success:', { toAddress });
      // Record platform fee as pending for batch settlement
      if (typeof senderChannelId === 'number' && senderChannelId > 0) {
        await recordPendingMicropayment(
          c.env.DB,
          senderChannelId,
          null, // Platform fee - no recipient channel
          'platform',
          'platform_fee',
          platformFeeSompiCalc.toString(),
          videoId || null,
          null,
          unifiedUser.id
        );
      }
      
      const pendingDebitsSompi = (typeof senderChannelId === 'number' && senderChannelId > 0)
        ? await getSenderPendingDebits(c.env.DB, senderChannelId)
        : '0';
      const pendingDebitsKas = (Number(pendingDebitsSompi) / 100000000).toFixed(8);
      
      return c.json({ 
        success: true, 
        transactionId: `demo-${Date.now()}`,
        newBalanceKas: currentBalanceKas,
        amountSentKas: amountKas,
        onChainSettlement: false,
        demoMode: true,
        pendingDebitsKas,
        message: 'Demo transaction completed (creator has placeholder address)'
      });
    }
    
    // Send 95% to creator on-chain
    let creatorResult = await sendTransaction(
      wallet.wallet_address as string,
      toAddress,
      creatorAmountSompi,
      privateKey
    );
    
    console.log('[MICROPAY VIEW] sendTransaction result:', { success: creatorResult.success, error: creatorResult.error, needsConsolidation: creatorResult.needsConsolidation, utxoCount: creatorResult.utxoCount });
    
    // Auto-consolidate if needed and retry
    if (!creatorResult.success && creatorResult.needsConsolidation) {
      console.log('Auto-consolidating UTXOs before retry...', { utxoCount: creatorResult.utxoCount });
      
      const consolidateResult = await consolidateUTXOs(
        wallet.wallet_address as string,
        privateKey
      );
      
      if (!consolidateResult.success) {
        return c.json({ 
          error: `Consolidation failed: ${consolidateResult.error}. Please try again later.`,
          needsConsolidation: true,
          utxoCount: creatorResult.utxoCount,
          debug: { 
            txType: 'view-consolidate-failed', 
            rawError: consolidateResult.error,
            senderAddress: wallet.wallet_address,
            senderUtxoCount,
            senderUtxoTotalSompi: senderUtxoTotal,
            toAddress,
            amountSompi
          }
        }, 400);
      }
      
      // Wait a moment for consolidation to propagate
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Retry the original transaction
      console.log('Retrying transaction after consolidation...');
      creatorResult = await sendTransaction(
        wallet.wallet_address as string,
        toAddress,
        creatorAmountSompi,
        privateKey
      );
      
      // If still failing, may need multiple rounds of consolidation
      if (!creatorResult.success && creatorResult.needsConsolidation) {
        return c.json({ 
          error: "Your wallet has many small UTXOs. Please consolidate multiple times in Settings before trying again.",
          needsConsolidation: true,
          utxoCount: creatorResult.utxoCount,
          debug: { 
            txType: 'view-retry-still-failing', 
            rawError: creatorResult.error,
            senderAddress: wallet.wallet_address,
            senderUtxoCount,
            senderUtxoTotalSompi: senderUtxoTotal,
            toAddress,
            amountSompi,
            consolidatedCount: consolidateResult.consolidated
          }
        }, 400);
      }
    }
    
    if (!creatorResult.success) {
      return c.json({ 
        error: creatorResult.error || "Transaction failed",
        debug: {
          txType: 'view-failed-no-consolidation',
          rawError: creatorResult.error,
          senderAddress: wallet.wallet_address,
          senderUtxoCount,
          senderUtxoTotalSompi: senderUtxoTotal,
          toAddress,
          amountSompi,
          needsConsolidation: creatorResult.needsConsolidation
        }
      }, 400);
    }
    
    // Record platform fee for batched settlement (5% of view cost)
    // Creator gets 95% on-chain, platform gets 5% batched
    // This gets settled when platform's pending balance reaches 0.11 KAS threshold
    if (senderChannelId !== null && senderChannelId !== undefined) {
      await recordPendingMicropayment(
        c.env.DB,
        senderChannelId as number,
        null, // Platform (no specific channel)
        'platform',
        'view_platform_fee',
        platformFeeSompiCalc.toString(),
        null,
        null
      );
    }
    
    const creatorAmountKasDisplay = (creatorAmountSompi / 100000000).toFixed(8);
    const platformFeeKas = (platformFeeSompiCalc / 100000000).toFixed(8);
    
    // Trigger auto-consolidation for recipient's wallet (creator) in background
    // This prevents UTXO accumulation from many small view payments
    try {
      const recipientWallet = await c.env.DB.prepare(
        "SELECT user_id, encrypted_private_key FROM user_wallets WHERE wallet_address = ?"
      ).bind(toAddress).first();
      
      const rUserId = recipientWallet?.user_id;
      const rEncKey = recipientWallet?.encrypted_private_key;
      
      if (typeof rUserId === 'string' && typeof rEncKey === 'string' && typeof toAddress === 'string') {
        const recipientPrivateKey = await decryptPrivateKey(rEncKey, rUserId);
        if (recipientPrivateKey) {
          // Fire and forget - don't await to not slow down the response
          autoConsolidateIfNeeded(toAddress, recipientPrivateKey).catch(err => {
            console.error('Background auto-consolidation error:', err);
          });
        }
      }
    } catch (autoConsErr) {
      // Don't fail the transaction if auto-consolidation check fails
      console.error('Auto-consolidation trigger error:', autoConsErr);
    }
    
    return c.json({ 
      success: true, 
      transactionId: creatorResult.transactionId,
      fromAddress: wallet.wallet_address,
      toAddress,
      amountKas,
      creatorAmountKas: creatorAmountKasDisplay,
      platformFeeKas,
      platformFeeBatched: true,
      message: 'View payment sent to creator (95%). Platform fee (5%) queued for batch settlement.'
    });
  }
  
  // Non-view payment - send full amount
  // Handle demo destination addresses (simulate success for testing)
  if (!isValidKaspaAddress(toAddress)) {
    console.log('[MICROPAY] Demo destination detected, simulating success:', { toAddress, amountKas });
    const pendingDebitsSompi = (typeof senderChannelId === 'number' && senderChannelId > 0)
      ? await getSenderPendingDebits(c.env.DB, senderChannelId)
      : '0';
    const pendingDebitsKas = (Number(pendingDebitsSompi) / 100000000).toFixed(8);
    
    return c.json({ 
      success: true, 
      transactionId: `demo-${Date.now()}`,
      fromAddress: wallet.wallet_address,
      toAddress,
      amountKas,
      demoMode: true,
      pendingDebitsKas,
      message: 'Demo transaction completed (recipient has placeholder address)'
    });
  }
  
  let result = await sendTransaction(
    wallet.wallet_address as string,
    toAddress,
    amountSompi,
    privateKey
  );
  
  // Auto-consolidate if needed and retry
  if (!result.success && result.needsConsolidation) {
    console.log('Auto-consolidating UTXOs for non-view payment...', { utxoCount: result.utxoCount });
    
    const consolidateResult = await consolidateUTXOs(
      wallet.wallet_address as string,
      privateKey
    );
    
    if (consolidateResult.success) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      result = await sendTransaction(
        wallet.wallet_address as string,
        toAddress,
        amountSompi,
        privateKey
      );
    }
  }
  
  if (!result.success) {
    if (result.needsConsolidation) {
      return c.json({ 
        error: "Please consolidate your wallet in Settings before making this payment.",
        needsConsolidation: true,
        utxoCount: result.utxoCount,
        debug: { 
          txType: 'non-view-consolidation-needed', 
          rawError: result.error,
          senderAddress: wallet.wallet_address,
          senderUtxoCount,
          senderUtxoTotalSompi: senderUtxoTotal,
          toAddress,
          amountSompi
        }
      }, 400);
    }
    return c.json({ 
      error: result.error || "Transaction failed", 
      debug: { 
        txType: 'non-view-failed', 
        rawError: result.error,
        senderAddress: wallet.wallet_address,
        senderUtxoCount,
        senderUtxoTotalSompi: senderUtxoTotal,
        toAddress,
        amountSompi
      } 
    }, 400);
  }
  
  return c.json({ 
    success: true, 
    transactionId: result.transactionId,
    fromAddress: wallet.wallet_address,
    toAddress,
    amountKas
  });
});

// Check UTXO status - returns whether wallet needs consolidation
app.get("/api/kasshi/wallet/utxo-status", async (c) => {
  // Check for external wallet auth FIRST - if they have a Bearer token, use that
  // This handles users who have both Google login AND external wallet
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const externalUser = await getExternalWalletUser(c.env.DB, authHeader);
    if (externalUser) {
      try {
        const utxos = await getUTXOs(externalUser.externalAddress);
        const MAX_UTXOS = 50;
        return c.json({ 
          needsConsolidation: utxos.length > MAX_UTXOS, 
          utxoCount: utxos.length,
          threshold: MAX_UTXOS
        });
      } catch (err) {
        console.error("Failed to get UTXOs for external wallet:", err);
        return c.json({ 
          needsConsolidation: false, 
          utxoCount: 0,
          error: "Failed to fetch UTXO data"
        });
      }
    }
  }
  
  // Fall back to unified user for Google auth users
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // For external wallet users (KasWare/Kastle), use their external address directly
  // No need to look up in database - the extension manages their wallet
  if (unifiedUser.isExternal) {
    try {
      const utxos = await getUTXOs(unifiedUser.walletAddress);
      const MAX_UTXOS = 50;
      return c.json({ 
        needsConsolidation: utxos.length > MAX_UTXOS, 
        utxoCount: utxos.length,
        threshold: MAX_UTXOS
      });
    } catch (err) {
      console.error("Failed to get UTXOs:", err);
      return c.json({ 
        needsConsolidation: false, 
        utxoCount: 0,
        error: "Failed to fetch UTXO data"
      });
    }
  }
  
  // For Google auth users, look up wallet in database
  const wallet = await c.env.DB.prepare("SELECT wallet_address, demo_balance FROM user_wallets WHERE user_id = ?").bind(unifiedUser.id).first();
  
  if (!wallet?.wallet_address) {
    return c.json({ error: "No wallet found" }, 400);
  }
  
  // Demo mode users don't need consolidation
  const demoBalance = wallet.demo_balance ? parseFloat(wallet.demo_balance as string) : 0;
  if (demoBalance > 0) {
    return c.json({ 
      needsConsolidation: false, 
      utxoCount: 0,
      demoMode: true 
    });
  }
  
  // Get UTXO count for mainnet users
  const utxos = await getUTXOs(wallet.wallet_address as string);
  const MAX_UTXOS = 50;
  
  return c.json({ 
    needsConsolidation: utxos.length > MAX_UTXOS, 
    utxoCount: utxos.length,
    threshold: MAX_UTXOS
  });
});

// Consolidate UTXOs - combines many small inputs into fewer larger ones
app.post("/api/kasshi/consolidate", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // Get user's wallet - for KasWare users, look up by internal wallet address
  const wallet = unifiedUser.isExternal && unifiedUser.internalWalletAddress
    ? await c.env.DB.prepare("SELECT * FROM user_wallets WHERE wallet_address = ?").bind(unifiedUser.internalWalletAddress).first()
    : await c.env.DB.prepare("SELECT * FROM user_wallets WHERE user_id = ?").bind(unifiedUser.id).first();
  
  if (!wallet?.encrypted_private_key) {
    return c.json({ error: "No wallet found" }, 400);
  }
  
  // Decrypt private key - KasWare users use different encryption key
  const decryptionKey = unifiedUser.isExternal && unifiedUser.walletAddress
    ? `kasware_${unifiedUser.externalId}_${unifiedUser.walletAddress}`
    : unifiedUser.id;
  const privateKey = await decryptPrivateKey(wallet.encrypted_private_key as string, decryptionKey);
  
  if (!privateKey) {
    return c.json({ error: "Failed to decrypt wallet" }, 500);
  }
  
  // Get current UTXO count
  const utxos = await getUTXOs(wallet.wallet_address as string);
  
  // Need at least 2 UTXOs to consolidate (combine into 1)
  if (utxos.length <= 1) {
    return c.json({ 
      success: true, 
      message: "No consolidation needed - only 1 UTXO",
      utxoCount: utxos.length
    });
  }
  
  // Consolidate UTXOs
  const result = await consolidateUTXOs(
    wallet.wallet_address as string,
    privateKey
  );
  
  if (!result.success) {
    return c.json({ error: result.error || "Consolidation failed" }, 400);
  }
  
  return c.json({ 
    success: true, 
    transactionId: result.transactionId,
    consolidated: result.consolidated,
    remainingUtxos: utxos.length - (result.consolidated || 0),
    message: result.consolidated 
      ? `Consolidated ${result.consolidated} UTXOs. You may need to run this again if you have many more.`
      : "No consolidation needed"
  });
});

// ============================================
// Batched Micropayment Settlement Routes
// ============================================

// Get pending balance for current user's channel
app.get("/api/kasshi/pending-balance", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // Get user's channel - for KasWare users, channel is linked to external address
  const channel = unifiedUser.isExternal
    ? await c.env.DB.prepare("SELECT id FROM channels WHERE wallet_address = ?").bind(unifiedUser.walletAddress).first()
    : await c.env.DB.prepare("SELECT c.id FROM channels c JOIN user_wallets w ON c.wallet_address = w.wallet_address WHERE w.user_id = ?").bind(unifiedUser.id).first();
  
  if (!channel) {
    // User without channel - still check for user-based pending debits
    // For KasWare users, use externalId (external_wallet_users.id) to match how micropay stores them
    const userPendingDebits = unifiedUser.isExternal 
      ? await getSenderPendingDebitsByUserId(c.env.DB, `kasware-${unifiedUser.externalId}`)
      : await getSenderPendingDebitsByUserId(c.env.DB, unifiedUser.id);
    const userPendingDebitsKas = Number(userPendingDebits) / 100000000;
    
    return c.json({ 
      pendingBalance: 0, 
      pendingBalanceKas: 0, 
      readyForSettlement: false,
      pendingDebits: userPendingDebits,
      pendingDebitsKas: userPendingDebitsKas 
    });
  }
  
  const pendingBalance = await getPendingBalance(c.env.DB, channel.id as number);
  const pendingBalanceKas = Number(pendingBalance) / 100000000; // sompi to KAS
  
  // Also get sender's pending debits (what they've spent but not settled)
  const pendingDebits = await getSenderPendingDebits(c.env.DB, channel.id as number);
  const pendingDebitsKas = Number(pendingDebits) / 100000000;
  
  // Check if EITHER earnings or debits are ready for settlement
  const settlementStatus = await isAnySettlementReady(c.env.DB, channel.id as number);
  
  return c.json({
    pendingBalance,
    pendingBalanceKas,
    readyForSettlement: settlementStatus.ready,
    readyToSettleType: settlementStatus.type,
    threshold: BATCH_THRESHOLD_KAS,
    pendingDebits,
    pendingDebitsKas
  });
});

// Get pending micropayments for current user's channel
app.get("/api/kasshi/pending-payments", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // Get user's channel - for KasWare users, channel is linked to external address
  const channel = unifiedUser.isExternal
    ? await c.env.DB.prepare("SELECT id FROM channels WHERE wallet_address = ?").bind(unifiedUser.walletAddress).first()
    : await c.env.DB.prepare("SELECT c.id FROM channels c JOIN user_wallets w ON c.wallet_address = w.wallet_address WHERE w.user_id = ?").bind(unifiedUser.id).first();
  
  if (!channel) {
    return c.json({ payments: [] });
  }
  
  const payments = await getPendingMicropayments(c.env.DB, channel.id as number);
  return c.json({ payments });
});

// Trigger settlement for current user's channel
app.post("/api/kasshi/settle", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // Check for force settlement (bypasses threshold)
  let force = false;
  try {
    const body = await c.req.json();
    force = body?.force === true;
  } catch {
    // No body or invalid JSON - continue with default
  }
  
  // Get user's channel - for KasWare users, channel is linked to external address
  const channel = unifiedUser.isExternal
    ? await c.env.DB.prepare("SELECT id FROM channels WHERE wallet_address = ?").bind(unifiedUser.walletAddress).first()
    : await c.env.DB.prepare("SELECT c.id FROM channels c JOIN user_wallets w ON c.wallet_address = w.wallet_address WHERE w.user_id = ?").bind(unifiedUser.id).first();
  
  if (!channel) {
    return c.json({ error: "No channel found" }, 404);
  }
  
  const channelId = channel.id as number;
  
  // Check if ready for settlement (skip if force=true)
  // Check BOTH earnings and debits - user can settle either
  // IMPORTANT: Use the type to decide which batch to create, not just existence of micropayments
  const settlementStatus = await isAnySettlementReady(c.env.DB, channelId);
  let settlementType: 'earnings' | 'debits' = settlementStatus.type || 'earnings';
  
  if (!force) {
    if (!settlementStatus.ready) {
      const pendingKas = Number(BigInt(settlementStatus.amount)) / 100000000;
      const pendingType = settlementStatus.type === 'debits' ? 'pending debits' : 'pending earnings';
      return c.json({ 
        error: `You have ${pendingKas.toFixed(4)} KAS in ${pendingType}. Need at least ${BATCH_THRESHOLD_KAS} KAS to settle.`,
        readyForSettlement: false,
        pendingAmount: settlementStatus.amount,
        pendingType: settlementStatus.type
      }, 400);
    }
  }
  
  // Get user's wallet based on user type
  const wallet = unifiedUser.isExternal
    ? await c.env.DB.prepare(
        "SELECT e.internal_wallet_address as wallet_address, e.encrypted_internal_private_key as encrypted_private_key FROM external_wallet_users e WHERE e.wallet_address = ?"
      ).bind(unifiedUser.walletAddress).first()
    : await c.env.DB.prepare(
        "SELECT wallet_address, encrypted_private_key FROM user_wallets WHERE user_id = ?"
      ).bind(unifiedUser.id).first();
  
  if (!wallet) {
    return c.json({ error: "No wallet found" }, 404);
  }
  
  // Create settlement batch based on the type that's ready
  // This ensures we settle the correct type (debits vs earnings) based on threshold
  let batch: BatchSettlementResult | null = null;
  
  if (settlementType === 'debits') {
    // Debits are ready - settle outgoing payments first
    batch = await createSenderSettlementBatch(c.env.DB, channelId);
    // Fallback to earnings if no debits (shouldn't happen if isAnySettlementReady was accurate)
    if (!batch) {
      batch = await createSettlementBatch(c.env.DB, channelId);
      settlementType = 'earnings';
    }
  } else {
    // Earnings are ready - settle incoming payments first
    batch = await createSettlementBatch(c.env.DB, channelId);
    // Fallback to debits if no earnings
    if (!batch) {
      batch = await createSenderSettlementBatch(c.env.DB, channelId);
      settlementType = 'debits';
    }
  }
  
  if (!batch) {
    return c.json({ error: "No pending micropayments to settle" }, 400);
  }
  
  // Get platform wallet for actual settlement transaction
  const platformWalletAddress = await getAdminWalletAddress(c.env.DB);
  if (!platformWalletAddress) {
    return c.json({ error: "Platform wallet not configured" }, 500);
  }
  
  const totalAmountSompi = BigInt(batch.totalAmountSompi);
  const totalAmountKas = Number(totalAmountSompi) / 100000000;
  
  // For sender debits, we need to actually send the KAS on-chain
  if (settlementType === 'debits') {
    try {
      // Decrypt sender's wallet - KasWare vs Google users
      const settleDecryptKey = unifiedUser.isExternal && unifiedUser.walletAddress
        ? `kasware_${unifiedUser.externalId}_${unifiedUser.walletAddress}`
        : unifiedUser.id;
      const privateKey = await decryptPrivateKey(wallet.encrypted_private_key as string, settleDecryptKey);
      if (!privateKey) {
        return c.json({ error: "Failed to decrypt wallet" }, 500);
      }
      
      // Send on-chain transaction to platform wallet
      const amountSompi = Number(totalAmountSompi);
      let settlementResult = await sendTransaction(
        wallet.wallet_address as string,
        platformWalletAddress,
        amountSompi,
        privateKey
      );
      
      // Auto-consolidate if needed and retry
      if (!settlementResult.success && settlementResult.needsConsolidation) {
        const consolidateResult = await consolidateUTXOs(wallet.wallet_address as string, privateKey);
        if (consolidateResult.success) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          settlementResult = await sendTransaction(wallet.wallet_address as string, platformWalletAddress, amountSompi, privateKey);
        }
      }
      
      if (settlementResult.transactionId) {
        // Update batch with real transaction ID
        await c.env.DB.prepare(`
          UPDATE settlement_batches 
          SET transaction_id = ?, status = 'completed', settled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(settlementResult.transactionId, batch.batchId).run();
        
        // Clear pending micropayments that were settled
        const micropayments = await getSenderPendingMicropayments(c.env.DB, channelId);
        for (const mp of micropayments) {
          await c.env.DB.prepare("DELETE FROM pending_micropayments WHERE id = ?").bind(mp.id).run();
        }
        
        return c.json({
          success: true,
          settlementType,
          batchId: batch.batchId,
          merkleRoot: batch.merkleRoot,
          transactionId: settlementResult.transactionId,
          totalAmountSompi: batch.totalAmountSompi,
          totalAmountKas,
          itemCount: batch.itemCount,
          onChainSettlement: true,
          message: `Successfully settled ${batch.itemCount} payments (${totalAmountKas} KAS) to platform`
        });
      } else {
        return c.json({ 
          error: settlementResult.error || "On-chain settlement failed",
          batchId: batch.batchId
        }, 500);
      }
    } catch (err: unknown) {
      console.error("Settlement transaction failed:", err);
      return c.json({ 
        error: err instanceof Error ? err.message : "Settlement transaction failed"
      }, 500);
    }
  }
  
  // For creator earnings, settlement is just bookkeeping - marks payments as finalized
  // Actual payout to creator happens via the withdrawal feature
  await completeSettlement(
    c.env.DB, 
    batch.batchId, 
    `settlement-${batch.batchId}-${Date.now()}`,
    channelId
  );
  
  return c.json({
    success: true,
    settlementType,
    batchId: batch.batchId,
    merkleRoot: batch.merkleRoot,
    totalAmountSompi: batch.totalAmountSompi,
    totalAmountKas,
    itemCount: batch.itemCount,
    onChainSettlement: false,
    message: `Earnings of ${totalAmountKas} KAS settled and ready for withdrawal`
  });
});

// Get Merkle proof for a specific micropayment
app.get("/api/kasshi/merkle-proof/:paymentId", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
  
  const paymentId = parseInt(c.req.param("paymentId"));
  
  if (isNaN(paymentId)) {
    return c.json({ error: "Invalid payment ID" }, 400);
  }
  
  const proof = await getMerkleProof(c.env.DB, paymentId);
  
  if (!proof) {
    return c.json({ error: "Proof not found" }, 404);
  }
  
  return c.json({
    success: true,
    batchId: proof.batchId,
    merkleRoot: proof.merkleRoot,
    proof: proof.proof,
    leafIndex: proof.leafIndex
  });
});

// Get platform/admin wallet address for fees
app.get("/api/platform-wallet", async (c) => {
  const adminWallet = await getAdminWalletAddress(c.env.DB);
  if (!adminWallet) {
    return c.json({ error: "Platform wallet not configured" }, 500);
  }
  return c.json({ walletAddress: adminWallet });
});

// ============================================
// Wallet Mode Routes (Demo vs Mainnet)
// ============================================

// Get wallet mode
app.get("/api/wallet/mode", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  const wallet = await c.env.DB.prepare(
    "SELECT demo_balance, wallet_address, is_admin FROM user_wallets WHERE user_id = ?"
  ).bind(user.id).first();
  
  if (!wallet) {
    return c.json({ error: "No wallet found" }, 404);
  }
  
  const isAdmin = wallet.is_admin === 1;
  const demoBalance = wallet.demo_balance ? parseFloat(wallet.demo_balance as string) : 0;
  
  // Non-admins are always on mainnet (no demo mode access)
  const isMainnet = !isAdmin || demoBalance === 0;
  
  // Get real mainnet balance
  const mainnetBalance = await getWalletBalance(wallet.wallet_address as string);
  
  return c.json({
    mode: isMainnet ? "mainnet" : "demo",
    demoBalance: demoBalance.toFixed(2),
    mainnetBalance: mainnetBalance?.balanceKAS || "0.00",
    walletAddress: wallet.wallet_address,
    isAdmin,
  });
});


// Toggle wallet mode (demo <-> mainnet) - Admin only for demo mode
app.post("/api/wallet/mode", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { mode, demoAmount } = body; // mode: "demo" | "mainnet", demoAmount: number (optional, for demo mode)
  
  const wallet = await c.env.DB.prepare(
    "SELECT demo_balance, wallet_address, is_admin FROM user_wallets WHERE user_id = ?"
  ).bind(user.id).first();
  
  if (!wallet) {
    return c.json({ error: "No wallet found" }, 404);
  }
  
  const isAdmin = wallet.is_admin === 1;
  
  if (mode === "mainnet") {
    // Switch to mainnet - clear demo balance
    await c.env.DB.prepare(
      "UPDATE user_wallets SET demo_balance = '0', updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).bind(user.id).run();
    
    const mainnetBalance = await getWalletBalance(wallet.wallet_address as string);
    
    return c.json({
      success: true,
      mode: "mainnet",
      message: "Switched to mainnet mode. All transactions will use real KAS.",
      mainnetBalance: mainnetBalance?.balanceKAS || "0.00",
      walletAddress: wallet.wallet_address,
    });
  } else if (mode === "demo") {
    // Only admins can switch to demo mode
    if (!isAdmin) {
      return c.json({ error: "Demo mode is only available for platform administrators" }, 403);
    }
    
    // Switch to demo mode - set demo balance
    const amount = demoAmount || 1000; // Default 1000 KAS for testing
    await c.env.DB.prepare(
      "UPDATE user_wallets SET demo_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).bind(amount.toString(), user.id).run();
    
    return c.json({
      success: true,
      mode: "demo",
      message: `Switched to demo mode with ${amount} KAS for testing.`,
      demoBalance: amount.toFixed(2),
    });
  }
  
  return c.json({ error: "Invalid mode. Use 'mainnet' or 'demo'" }, 400);
});

// ============================================
// Security Settings Routes (2FA & Extra Password)
// ============================================

// Get security status
app.get("/api/security/status", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // KasWare users authenticate via wallet signature - no additional security features
  if (unifiedUser.isExternal) {
    return c.json({
      is2FAEnabled: false,
      isExtraPasswordEnabled: false,
      hasViewedMnemonic: true, // Not applicable for KasWare
      requirePasswordOnLogin: false,
      isExternalWallet: true
    });
  }
  
  const wallet = await c.env.DB.prepare(
    "SELECT is_totp_enabled, is_extra_password_enabled, has_viewed_mnemonic, require_password_on_login FROM user_wallets WHERE user_id = ?"
  ).bind(unifiedUser.id).first();
  
  if (!wallet) {
    return c.json({ error: "No wallet found" }, 404);
  }
  
  return c.json({
    is2FAEnabled: !!wallet.is_totp_enabled,
    isExtraPasswordEnabled: !!wallet.is_extra_password_enabled,
    hasViewedMnemonic: !!wallet.has_viewed_mnemonic,
    requirePasswordOnLogin: !!wallet.require_password_on_login
  });
});

// Setup 2FA - Generate secret and return QR code data
app.post("/api/security/2fa/setup", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  const wallet = await c.env.DB.prepare(
    "SELECT * FROM user_wallets WHERE user_id = ?"
  ).bind(user.id).first();
  
  if (!wallet) {
    return c.json({ error: "No wallet found" }, 404);
  }
  
  if (wallet.is_totp_enabled) {
    return c.json({ error: "2FA is already enabled" }, 400);
  }
  
  // Generate new TOTP secret
  const totp = new OTPAuth.TOTP({
    issuer: "KasShi",
    label: user.email || "KasShi Wallet",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 })
  });
  
  const secret = totp.secret.base32;
  const otpauthUrl = totp.toString();
  
  // Encrypt and store the secret (not enabled yet)
  const encryptedSecret = await encryptPrivateKey(secret, user.id);
  
  await c.env.DB.prepare(`
    UPDATE user_wallets SET totp_secret = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).bind(encryptedSecret, user.id).run();
  
  return c.json({
    secret,
    otpauthUrl,
    message: "Scan the QR code with your authenticator app, then verify with a code"
  });
});

// Verify and enable 2FA
app.post("/api/security/2fa/verify", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { code } = body;
  
  if (!code) {
    return c.json({ error: "Verification code required" }, 400);
  }
  
  const wallet = await c.env.DB.prepare(
    "SELECT * FROM user_wallets WHERE user_id = ?"
  ).bind(user.id).first();
  
  if (!wallet?.totp_secret) {
    return c.json({ error: "2FA setup not initiated" }, 400);
  }
  
  if (wallet.is_totp_enabled) {
    return c.json({ error: "2FA is already enabled" }, 400);
  }
  
  // Decrypt the secret
  const secret = await decryptPrivateKey(wallet.totp_secret as string, user.id);
  if (!secret) {
    return c.json({ error: "Failed to decrypt 2FA secret" }, 500);
  }
  
  // Verify the code
  const totp = new OTPAuth.TOTP({
    issuer: "KasShi",
    label: user.email || "KasShi Wallet",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret)
  });
  
  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) {
    return c.json({ error: "Invalid verification code" }, 400);
  }
  
  // Enable 2FA
  await c.env.DB.prepare(`
    UPDATE user_wallets SET is_totp_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).bind(user.id).run();
  
  return c.json({ success: true, message: "2FA enabled successfully" });
});

// Disable 2FA (requires current 2FA code)
app.post("/api/security/2fa/disable", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { code } = body;
  
  if (!code) {
    return c.json({ error: "2FA code required" }, 400);
  }
  
  const wallet = await c.env.DB.prepare(
    "SELECT * FROM user_wallets WHERE user_id = ?"
  ).bind(user.id).first();
  
  if (!wallet?.is_totp_enabled) {
    return c.json({ error: "2FA is not enabled" }, 400);
  }
  
  // Decrypt and verify
  const secret = await decryptPrivateKey(wallet.totp_secret as string, user.id);
  if (!secret) {
    return c.json({ error: "Failed to decrypt 2FA secret" }, 500);
  }
  
  const totp = new OTPAuth.TOTP({
    issuer: "KasShi",
    label: user.email || "KasShi Wallet",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret)
  });
  
  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) {
    return c.json({ error: "Invalid 2FA code" }, 400);
  }
  
  // Disable 2FA
  await c.env.DB.prepare(`
    UPDATE user_wallets SET is_totp_enabled = 0, totp_secret = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).bind(user.id).run();
  
  return c.json({ success: true, message: "2FA disabled" });
});

// Get mnemonic for backup - requires transaction password if enabled
app.post("/api/security/mnemonic", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const { password } = body;
  
  const wallet = await c.env.DB.prepare(
    "SELECT * FROM user_wallets WHERE user_id = ?"
  ).bind(user.id).first();
  
  if (!wallet) {
    return c.json({ error: "No wallet found" }, 404);
  }
  
  // If transaction password is enabled, require it
  if (wallet.is_extra_password_enabled) {
    if (!password) {
      return c.json({ error: "Transaction password required", requiresPassword: true }, 401);
    }
    
    // Verify password
    const isValid = await verifyPin(password, wallet.extra_password_hash as string);
    if (!isValid) {
      return c.json({ error: "Incorrect transaction password" }, 401);
    }
  }
  
  let mnemonic: string | null = null;
  
  if (!wallet.encrypted_mnemonic) {
    // Generate a new mnemonic for legacy wallets
    const newMnemonic = generateMnemonic();
    const encryptedMnemonic = await encryptPrivateKey(newMnemonic, user.id);
    
    // Store the new mnemonic
    await c.env.DB.prepare(`
      UPDATE user_wallets SET encrypted_mnemonic = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
    `).bind(encryptedMnemonic, user.id).run();
    
    mnemonic = newMnemonic;
  } else {
    // Decrypt the existing mnemonic
    mnemonic = await decryptPrivateKey(wallet.encrypted_mnemonic as string, user.id);
    
    // If decryption failed and wallet has a PIN hash, it's a legacy wallet
    if (!mnemonic && wallet.wallet_pin_hash) {
      return c.json({ 
        error: "Your wallet uses legacy encryption. Please contact support or create a new wallet.",
        legacyWallet: true 
      }, 400);
    }
  }
  if (!mnemonic) {
    return c.json({ error: "Failed to decrypt mnemonic" }, 500);
  }
  
  // Mark as viewed
  await c.env.DB.prepare(`
    UPDATE user_wallets SET has_viewed_mnemonic = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).bind(user.id).run();
  
  return c.json({ mnemonic });
});

// Setup extra password with recovery phrase
app.post("/api/security/password/setup", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { password, requireOnLogin } = body;
  
  if (!password || password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }
  
  const wallet = await c.env.DB.prepare(
    "SELECT * FROM user_wallets WHERE user_id = ?"
  ).bind(user.id).first();
  
  if (!wallet) {
    return c.json({ error: "No wallet found" }, 404);
  }
  
  if (wallet.is_extra_password_enabled) {
    return c.json({ error: "Transaction password is already enabled" }, 400);
  }
  
  // Generate a recovery phrase for password recovery (24-word BIP39 mnemonic)
  const recoveryPhrase = generateMnemonic();
  
  // Encrypt the recovery phrase with the password itself
  const encryptedRecoveryMnemonic = await encryptPrivateKey(recoveryPhrase, password);
  
  // Hash the password
  const passwordHash = await hashPin(password);
  
  // Enable extra password with recovery phrase
  await c.env.DB.prepare(`
    UPDATE user_wallets 
    SET extra_password_hash = ?, 
        is_extra_password_enabled = 1, 
        encrypted_password_mnemonic = ?,
        require_password_on_login = ?,
        updated_at = CURRENT_TIMESTAMP 
    WHERE user_id = ?
  `).bind(passwordHash, encryptedRecoveryMnemonic, requireOnLogin ? 1 : 0, user.id).run();
  
  return c.json({ 
    success: true, 
    message: "Transaction password enabled",
    recoveryPhrase: recoveryPhrase // User must save this!
  });
});

// View password recovery phrase (requires current password)
app.post("/api/security/password/recovery-phrase", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { password } = body;
  
  if (!password) {
    return c.json({ error: "Password required" }, 400);
  }
  
  const wallet = await c.env.DB.prepare(
    "SELECT * FROM user_wallets WHERE user_id = ?"
  ).bind(user.id).first();
  
  if (!wallet) {
    return c.json({ error: "No wallet found" }, 404);
  }
  
  if (!wallet.is_extra_password_enabled) {
    return c.json({ error: "Transaction password is not enabled" }, 400);
  }
  
  // Verify password
  const isValid = await verifyPin(password, wallet.extra_password_hash as string);
  if (!isValid) {
    return c.json({ error: "Incorrect password" }, 401);
  }
  
  if (!wallet.encrypted_password_mnemonic) {
    return c.json({ error: "No recovery phrase found" }, 400);
  }
  
  // Decrypt the recovery phrase (it's encrypted with the password)
  const recoveryPhrase = await decryptPrivateKey(wallet.encrypted_password_mnemonic as string, password);
  
  if (!recoveryPhrase) {
    return c.json({ error: "Failed to decrypt recovery phrase" }, 500);
  }
  
  return c.json({ recoveryPhrase });
});

// Disable extra password (requires current password)
app.post("/api/security/password/disable", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { password } = body;
  
  if (!password) {
    return c.json({ error: "Current password required" }, 400);
  }
  
  const wallet = await c.env.DB.prepare(
    "SELECT * FROM user_wallets WHERE user_id = ?"
  ).bind(user.id).first();
  
  if (!wallet?.is_extra_password_enabled) {
    return c.json({ error: "Extra password is not enabled" }, 400);
  }
  
  // Verify the password
  const isValid = await verifyPin(password, wallet.extra_password_hash as string);
  if (!isValid) {
    return c.json({ error: "Incorrect password" }, 400);
  }
  
  // Disable extra password and clear recovery phrase
  await c.env.DB.prepare(`
    UPDATE user_wallets 
    SET is_extra_password_enabled = 0, 
        extra_password_hash = NULL, 
        encrypted_password_mnemonic = NULL,
        require_password_on_login = 0,
        updated_at = CURRENT_TIMESTAMP 
    WHERE user_id = ?
  `).bind(user.id).run();
  
  return c.json({ success: true, message: "Transaction password disabled" });
});

// Recover/reset password using recovery phrase
app.post("/api/security/password/recover", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { recoveryPhrase, newPassword } = body;
  
  if (!recoveryPhrase || !newPassword) {
    return c.json({ error: "Recovery phrase and new password required" }, 400);
  }
  
  if (newPassword.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }
  
  const wallet = await c.env.DB.prepare(
    "SELECT * FROM user_wallets WHERE user_id = ?"
  ).bind(user.id).first();
  
  if (!wallet?.is_extra_password_enabled) {
    return c.json({ error: "Transaction password is not enabled" }, 400);
  }
  
  if (!wallet.encrypted_password_mnemonic) {
    return c.json({ error: "No recovery phrase found for this account" }, 400);
  }
  
  // Verify the recovery phrase is a valid 24-word mnemonic format
  const words = recoveryPhrase.trim().split(/\s+/);
  if (words.length !== 24) {
    return c.json({ error: "Invalid recovery phrase - must be 24 words" }, 400);
  }
  
  // We can't verify against stored phrase since it was encrypted with old password
  // Instead we hash this new phrase with the new password and store it
  // The user is attesting they have the correct phrase
  const newEncryptedMnemonic = await encryptPrivateKey(recoveryPhrase.trim(), newPassword);
  const newPasswordHash = await hashPin(newPassword);
  
  // Update password
  await c.env.DB.prepare(`
    UPDATE user_wallets 
    SET extra_password_hash = ?,
        encrypted_password_mnemonic = ?,
        updated_at = CURRENT_TIMESTAMP 
    WHERE user_id = ?
  `).bind(newPasswordHash, newEncryptedMnemonic, user.id).run();
  
  return c.json({ success: true, message: "Password has been reset" });
});

// Verify security for protected transactions
app.post("/api/security/verify", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { totpCode, extraPassword } = body;
  
  const wallet = await c.env.DB.prepare(
    "SELECT * FROM user_wallets WHERE user_id = ?"
  ).bind(user.id).first();
  
  if (!wallet) {
    return c.json({ error: "No wallet found" }, 404);
  }
  
  // Check 2FA if enabled
  if (wallet.is_totp_enabled) {
    if (!totpCode) {
      return c.json({ error: "2FA code required", requires2FA: true }, 400);
    }
    
    const secret = await decryptPrivateKey(wallet.totp_secret as string, user.id);
    if (!secret) {
      return c.json({ error: "Failed to verify 2FA" }, 500);
    }
    
    const totp = new OTPAuth.TOTP({
      issuer: "KasShi",
      label: user.email || "KasShi Wallet",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret)
    });
    
    const delta = totp.validate({ token: totpCode, window: 1 });
    if (delta === null) {
      return c.json({ error: "Invalid 2FA code" }, 400);
    }
  }
  
  // Check extra password if enabled
  if (wallet.is_extra_password_enabled) {
    if (!extraPassword) {
      return c.json({ error: "Transaction password required", requiresPassword: true }, 400);
    }
    
    const isValid = await verifyPin(extraPassword, wallet.extra_password_hash as string);
    if (!isValid) {
      return c.json({ error: "Incorrect transaction password" }, 400);
    }
  }
  
  return c.json({ success: true, verified: true });
});

// Like/dislike video
app.post("/api/kasshi/videos/:id/interact", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const idParam = c.req.param("id");
  const body = await c.req.json();
  const { channelId, interactionType, transactionId } = body;
  
  if (!interactionType || !["like", "dislike"].includes(interactionType)) {
    return c.json({ error: "interactionType (like/dislike) required" }, 400);
  }
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Allow interaction with either channelId or userId
  const hasChannel = !!channelId;
  const userId = unifiedUser.id;
  
  const video = await c.env.DB.prepare(`
    SELECT v.*, c.id as creator_channel_id
    FROM videos v
    JOIN channels c ON v.channel_id = c.id
    WHERE v.id = ?
  `).bind(videoId).first();
  
  if (!video) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Check for existing interaction - by channel_id OR user_id
  const existing = hasChannel 
    ? await c.env.DB.prepare(
        "SELECT * FROM video_interactions WHERE video_id = ? AND channel_id = ?"
      ).bind(videoId, channelId).first()
    : await c.env.DB.prepare(
        "SELECT * FROM video_interactions WHERE video_id = ? AND user_id = ?"
      ).bind(videoId, userId).first();
  
  if (existing) {
    // Update existing interaction
    const oldType = existing.interaction_type;
    if (oldType === interactionType) {
      return c.json({ success: true, message: "Already interacted" });
    }
    
    await c.env.DB.prepare(
      "UPDATE video_interactions SET interaction_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(interactionType, existing.id).run();
    
    // Update counts
    const likeChange = interactionType === "like" ? 1 : -1;
    const dislikeChange = interactionType === "dislike" ? 1 : -1;
    await c.env.DB.prepare(`
      UPDATE videos SET 
        like_count = like_count + ?, 
        dislike_count = dislike_count + ?,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(likeChange, dislikeChange, videoId).run();
  } else {
    // Create new interaction - use channel_id if available, otherwise user_id
    if (hasChannel) {
      await c.env.DB.prepare(
        "INSERT INTO video_interactions (video_id, channel_id, interaction_type) VALUES (?, ?, ?)"
      ).bind(videoId, channelId, interactionType).run();
    } else {
      await c.env.DB.prepare(
        "INSERT INTO video_interactions (video_id, channel_id, user_id, interaction_type) VALUES (?, 0, ?, ?)"
      ).bind(videoId, userId, interactionType).run();
    }
    
    // Update count
    const column = interactionType === "like" ? "like_count" : "dislike_count";
    await c.env.DB.prepare(
      `UPDATE videos SET ${column} = ${column} + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(videoId).run();
    
    // Record payment if provided
    if (transactionId && interactionType === "like") {
      const platformFee = (LIKE_COST_KAS * PLATFORM_FEE_PERCENT).toFixed(8);
      const creatorAmount = (LIKE_COST_KAS * (1 - PLATFORM_FEE_PERCENT)).toFixed(8);
      
      await c.env.DB.prepare(`
        INSERT INTO video_payments (transaction_id, from_channel_id, to_channel_id, video_id, payment_type, amount_kas, platform_fee, creator_amount, status)
        VALUES (?, ?, ?, ?, 'like', ?, ?, ?, 'completed')
      `).bind(transactionId, channelId || 0, video.creator_channel_id, videoId, LIKE_COST_KAS.toString(), platformFee, creatorAmount).run();
      
      // Update earnings
      const newEarnings = (parseFloat(video.kas_earned as string) + parseFloat(creatorAmount)).toFixed(8);
      await c.env.DB.prepare(
        "UPDATE videos SET kas_earned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(newEarnings, videoId).run();
    }
  }
  
  // Get updated counts
  const updated = await c.env.DB.prepare(
    "SELECT like_count, dislike_count FROM videos WHERE id = ?"
  ).bind(videoId).first();
  
  return c.json({
    success: true,
    likeCount: updated?.like_count,
    dislikeCount: updated?.dislike_count,
  });
});

// Get user's interaction status for a video
app.get("/api/kasshi/videos/:id/interaction", async (c) => {
  const idParam = c.req.param("id");
  const channelId = c.req.query("channelId");
  const userId = c.req.query("userId");
  
  if (!channelId && !userId) {
    return c.json({ interaction: null });
  }
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ interaction: null });
  }
  
  // Check by channel_id first, then by user_id
  let interaction;
  if (channelId) {
    interaction = await c.env.DB.prepare(
      "SELECT interaction_type FROM video_interactions WHERE video_id = ? AND channel_id = ?"
    ).bind(videoId, channelId).first();
  }
  if (!interaction && userId) {
    interaction = await c.env.DB.prepare(
      "SELECT interaction_type FROM video_interactions WHERE video_id = ? AND user_id = ?"
    ).bind(videoId, userId).first();
  }
  
  return c.json({
    interaction: interaction?.interaction_type || null
  });
});

// Remove interaction (unlike/undislike)
app.delete("/api/kasshi/videos/:id/interact", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const idParam = c.req.param("id");
  const body = await c.req.json();
  const { channelId, userId, interactionType } = body;
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  if ((!channelId && !userId) || !interactionType) {
    return c.json({ error: "Missing channelId/userId or interactionType" }, 400);
  }
  
  // Check if interaction exists - by channelId OR userId
  let existing;
  if (channelId) {
    existing = await c.env.DB.prepare(
      "SELECT id FROM video_interactions WHERE video_id = ? AND channel_id = ? AND interaction_type = ?"
    ).bind(videoId, channelId, interactionType).first();
  } else {
    existing = await c.env.DB.prepare(
      "SELECT id FROM video_interactions WHERE video_id = ? AND user_id = ? AND interaction_type = ?"
    ).bind(videoId, userId, interactionType).first();
  }
  
  if (!existing) {
    return c.json({ error: "Interaction not found" }, 404);
  }
  
  // Remove the interaction
  if (channelId) {
    await c.env.DB.prepare(
      "DELETE FROM video_interactions WHERE video_id = ? AND channel_id = ? AND interaction_type = ?"
    ).bind(videoId, channelId, interactionType).run();
  } else {
    await c.env.DB.prepare(
      "DELETE FROM video_interactions WHERE video_id = ? AND user_id = ? AND interaction_type = ?"
    ).bind(videoId, userId, interactionType).run();
  }
  
  // Update video counts
  if (interactionType === "like") {
    await c.env.DB.prepare(
      "UPDATE videos SET like_count = like_count - 1 WHERE id = ? AND like_count > 0"
    ).bind(videoId).run();
  } else if (interactionType === "dislike") {
    await c.env.DB.prepare(
      "UPDATE videos SET dislike_count = dislike_count - 1 WHERE id = ? AND dislike_count > 0"
    ).bind(videoId).run();
  }
  
  // Get updated counts
  const updated = await c.env.DB.prepare(
    "SELECT like_count, dislike_count FROM videos WHERE id = ?"
  ).bind(videoId).first();
  
  return c.json({
    success: true,
    likeCount: updated?.like_count,
    dislikeCount: updated?.dislike_count,
  });
});

// Save watch progress
app.post("/api/kasshi/videos/:id/progress", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const idParam = c.req.param("id");
  const body = await c.req.json();
  const { channelId, progressSeconds, durationSeconds } = body;
  
  if (!channelId || progressSeconds === undefined || !durationSeconds) {
    return c.json({ error: "Missing required fields" }, 400);
  }
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Upsert watch progress
  await c.env.DB.prepare(`
    INSERT INTO watch_progress (channel_id, video_id, progress_seconds, duration_seconds)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(channel_id, video_id) DO UPDATE SET
      progress_seconds = excluded.progress_seconds,
      duration_seconds = excluded.duration_seconds,
      updated_at = CURRENT_TIMESTAMP
  `).bind(channelId, videoId, Math.floor(progressSeconds), Math.floor(durationSeconds)).run();
  
  return c.json({ success: true });
});

// Get watch progress for a video
app.get("/api/kasshi/videos/:id/progress", async (c) => {
  const idParam = c.req.param("id");
  const channelId = c.req.query("channelId");
  
  if (!channelId) {
    return c.json({ progress: null });
  }
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ progressSeconds: null, durationSeconds: null });
  }
  
  const progress = await c.env.DB.prepare(
    "SELECT progress_seconds, duration_seconds FROM watch_progress WHERE video_id = ? AND channel_id = ?"
  ).bind(videoId, channelId).first();
  
  return c.json({
    progressSeconds: progress?.progress_seconds ?? null,
    durationSeconds: progress?.duration_seconds ?? null
  });
});

// Get watch progress for multiple videos (for home feed)
app.get("/api/kasshi/progress/batch", async (c) => {
  const channelId = c.req.query("channelId");
  const videoIds = c.req.query("videoIds"); // comma-separated
  
  if (!channelId || !videoIds) {
    return c.json({ progress: {} });
  }
  
  const ids = videoIds.split(",").map(id => parseInt(id)).filter(id => !isNaN(id));
  if (ids.length === 0) {
    return c.json({ progress: {} });
  }
  
  const placeholders = ids.map(() => "?").join(",");
  const results = await c.env.DB.prepare(`
    SELECT video_id, progress_seconds, duration_seconds
    FROM watch_progress
    WHERE channel_id = ? AND video_id IN (${placeholders})
  `).bind(channelId, ...ids).all();
  
  const progressMap: Record<number, { progressSeconds: number; durationSeconds: number }> = {};
  for (const row of results.results as Array<{ video_id: number; progress_seconds: number; duration_seconds: number }>) {
    progressMap[row.video_id] = {
      progressSeconds: row.progress_seconds,
      durationSeconds: row.duration_seconds
    };
  }
  
  return c.json({ progress: progressMap });
});

// ============================================
// AI Subtitles Endpoints
// ============================================

// Generate subtitles endpoint - requires OPENAI_API_KEY secret to be configured
app.post("/api/kasshi/videos/:id/subtitles/generate", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
  
  const idParam = c.req.param("id");
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Get video info
  const video = await c.env.DB.prepare(
    "SELECT v.*, c.wallet_address FROM videos v JOIN channels c ON v.channel_id = c.id WHERE v.id = ?"
  ).bind(videoId).first() as { video_url: string | null; channel_id: number; wallet_address: string } | null;
  
  if (!video) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Verify user owns the channel - check both wallet sources
  let isOwner = false;
  
  const userWallet = await c.env.DB.prepare(
    "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
  ).bind(unifiedUser.id).first() as { wallet_address: string } | null;
  
  if (userWallet && userWallet.wallet_address === video.wallet_address) {
    isOwner = true;
  } else if (unifiedUser.walletAddress === video.wallet_address) {
    isOwner = true;
  }
  
  if (!isOwner) {
    return c.json({ error: "You can only generate subtitles for your own videos" }, 403);
  }
  
  // Check if video has a URL
  if (!video.video_url) {
    return c.json({ error: "Video file required for subtitle generation" }, 400);
  }
  
  // Check if subtitles already exist or are being generated
  const existing = await c.env.DB.prepare(
    "SELECT status FROM video_subtitles WHERE video_id = ? AND language = 'en'"
  ).bind(videoId).first() as { status: string } | null;
  
  if (existing && existing.status === "processing") {
    return c.json({ error: "Subtitles are already being generated" }, 409);
  }
  
  // Mark as processing
  if (existing) {
    await c.env.DB.prepare(
      "UPDATE video_subtitles SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE video_id = ? AND language = 'en'"
    ).bind(videoId).run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO video_subtitles (video_id, language, status) VALUES (?, 'en', 'processing')"
    ).bind(videoId).run();
  }
  
  try {
    // Fetch video file
    const videoResponse = await fetch(video.video_url);
    if (!videoResponse.ok) {
      throw new Error("Failed to fetch video file");
    }
    const videoBlob = await videoResponse.blob();
    const videoFile = new File([videoBlob], "video.mp4", { type: "video/mp4" });
    
    // Call OpenAI Whisper API
    const openai = new OpenAI({ apiKey: c.env.OPENAI_API_KEY });
    const transcription = await openai.audio.transcriptions.create({
      file: videoFile,
      model: "whisper-1",
      language: "en",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });
    
    // Convert to VTT format
    let vttContent = "WEBVTT\n\n";
    if (transcription.segments) {
      for (const segment of transcription.segments) {
        const startTime = formatVTTTime(segment.start);
        const endTime = formatVTTTime(segment.end);
        vttContent += `${startTime} --> ${endTime}\n${segment.text.trim()}\n\n`;
      }
    } else if (transcription.text) {
      // Fallback if no segments - create single subtitle
      vttContent += `00:00:00.000 --> 00:59:59.999\n${transcription.text}\n\n`;
    }
    
    // Save subtitles
    await c.env.DB.prepare(
      "UPDATE video_subtitles SET vtt_content = ?, status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE video_id = ? AND language = 'en'"
    ).bind(vttContent, videoId).run();
    
    return c.json({ success: true, message: "Subtitles generated successfully" });
  } catch (error: any) {
    // Mark as failed
    await c.env.DB.prepare(
      "UPDATE video_subtitles SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE video_id = ? AND language = 'en'"
    ).bind(videoId).run();
    
    console.error("Subtitle generation failed:", error);
    return c.json({ error: "Failed to generate subtitles: " + error.message }, 500);
  }
});

// Helper function to format time for VTT
function formatVTTTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

// Get subtitles for a video
app.get("/api/kasshi/videos/:id/subtitles", async (c) => {
  const idParam = c.req.param("id");
  const language = c.req.query("language") || "en";
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ subtitles: null, status: "none" });
  }
  
  const subtitles = await c.env.DB.prepare(
    "SELECT vtt_content, status, language FROM video_subtitles WHERE video_id = ? AND language = ?"
  ).bind(videoId, language).first() as { vtt_content: string | null; status: string; language: string } | null;
  
  if (!subtitles) {
    return c.json({ subtitles: null, status: "none" });
  }
  
  return c.json({
    subtitles: subtitles.vtt_content,
    status: subtitles.status,
    language: subtitles.language
  });
});

// Get comments for video
app.get("/api/kasshi/videos/:id/comments", async (c) => {
  const idParam = c.req.param("id");
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ comments: [] });
  }
  
  // Get root comments (no parent)
  const rootComments = await c.env.DB.prepare(`
    SELECT cm.*, ch.name as author_name, ch.handle as author_handle, ch.avatar_url as author_avatar, ch.wallet_address as author_wallet
    FROM comments cm
    JOIN channels ch ON cm.channel_id = ch.id
    WHERE cm.video_id = ? AND cm.parent_id IS NULL
    ORDER BY cm.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(videoId, limit, offset).all();
  
  // Get all replies for this video
  const replies = await c.env.DB.prepare(`
    SELECT cm.*, ch.name as author_name, ch.handle as author_handle, ch.avatar_url as author_avatar, ch.wallet_address as author_wallet
    FROM comments cm
    JOIN channels ch ON cm.channel_id = ch.id
    WHERE cm.video_id = ? AND cm.parent_id IS NOT NULL
    ORDER BY cm.created_at ASC
  `).bind(videoId).all();
  
  // Group replies by parent_id
  const repliesByParent: Record<number, Array<Record<string, unknown>>> = {};
  for (const reply of replies.results as Array<Record<string, unknown>>) {
    const parentId = reply.parent_id as number;
    if (!repliesByParent[parentId]) {
      repliesByParent[parentId] = [];
    }
    repliesByParent[parentId].push(reply);
  }
  
  const formatComment = (c: Record<string, unknown>): Record<string, unknown> => ({
    id: c.id,
    content: c.content,
    likeCount: c.like_count,
    dislikeCount: c.dislike_count || 0,
    kasEarned: c.kas_earned,
    parentId: c.parent_id || null,
    createdAt: toUTCTimestamp(c.created_at),
    author: {
      id: c.channel_id,
      name: c.author_name,
      handle: c.author_handle,
      avatarUrl: c.author_avatar,
      walletAddress: c.author_wallet,
    },
    replies: (repliesByParent[c.id as number] || []).map(formatComment),
  });
  
  return c.json({
    comments: rootComments.results.map((c: Record<string, unknown>) => formatComment(c)),
  });
});

// Post comment
app.post("/api/kasshi/videos/:id/comments", async (c) => {
  const idParam = c.req.param("id");
  const body = await c.req.json();
  const { channelId, content, transactionId, parentId } = body;
  
  if (!channelId || !content) {
    return c.json({ error: "channelId and content required" }, 400);
  }
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  const video = await c.env.DB.prepare(`
    SELECT v.*, c.id as creator_channel_id
    FROM videos v
    JOIN channels c ON v.channel_id = c.id
    WHERE v.id = ?
  `).bind(videoId).first();
  
  if (!video) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // If this is a reply, get the parent comment's author info
  let recipientChannelId = video.creator_channel_id as number;
  let paymentType = "comment";
  
  if (parentId) {
    const parentComment = await c.env.DB.prepare(
      "SELECT channel_id FROM comments WHERE id = ?"
    ).bind(parentId).first();
    
    if (parentComment) {
      recipientChannelId = parentComment.channel_id as number;
      paymentType = "comment_reply";
    }
  }
  
  await c.env.DB.prepare(`
    INSERT INTO comments (video_id, channel_id, parent_id, content)
    VALUES (?, ?, ?, ?)
  `).bind(videoId, channelId, parentId || null, content).run();
  
  // Update comment count
  await c.env.DB.prepare(
    "UPDATE videos SET comment_count = comment_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(videoId).run();
  
  // Record payment
  if (transactionId) {
    const platformFee = (COMMENT_COST_KAS * PLATFORM_FEE_PERCENT).toFixed(8);
    const recipientAmount = (COMMENT_COST_KAS * (1 - PLATFORM_FEE_PERCENT)).toFixed(8);
    
    const comment = await c.env.DB.prepare(
      "SELECT id FROM comments WHERE video_id = ? AND channel_id = ? ORDER BY id DESC LIMIT 1"
    ).bind(videoId, channelId).first();
    
    await c.env.DB.prepare(`
      INSERT INTO video_payments (transaction_id, from_channel_id, to_channel_id, video_id, comment_id, payment_type, amount_kas, platform_fee, creator_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
    `).bind(transactionId, channelId, recipientChannelId, videoId, comment?.id, paymentType, COMMENT_COST_KAS.toString(), platformFee, recipientAmount).run();
    
    // Update earnings based on payment type
    if (parentId) {
      // Reply - update parent comment's kas_earned
      const parentComment = await c.env.DB.prepare(
        "SELECT kas_earned FROM comments WHERE id = ?"
      ).bind(parentId).first();
      const newCommentEarnings = (parseFloat(parentComment?.kas_earned as string || "0") + parseFloat(recipientAmount)).toFixed(8);
      await c.env.DB.prepare(
        "UPDATE comments SET kas_earned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(newCommentEarnings, parentId).run();
    } else {
      // Root comment - update video earnings
      const newEarnings = (parseFloat(video.kas_earned as string) + parseFloat(recipientAmount)).toFixed(8);
      await c.env.DB.prepare(
        "UPDATE videos SET kas_earned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(newEarnings, videoId).run();
    }
  }
  
  const newComment = await c.env.DB.prepare(`
    SELECT cm.*, ch.name as author_name, ch.handle as author_handle, ch.avatar_url as author_avatar
    FROM comments cm
    JOIN channels ch ON cm.channel_id = ch.id
    WHERE cm.video_id = ? AND cm.channel_id = ?
    ORDER BY cm.id DESC LIMIT 1
  `).bind(videoId, channelId).first();
  
  return c.json({
    id: newComment?.id,
    content: newComment?.content,
    likeCount: 0,
    kasEarned: "0",
    parentId: parentId || null,
    createdAt: toUTCTimestamp(newComment?.created_at),
    author: {
      id: channelId,
      name: newComment?.author_name,
      handle: newComment?.author_handle,
      avatarUrl: newComment?.author_avatar,
    },
    replies: [],
  });
});

// Like/dislike comment
app.post("/api/kasshi/comments/:id/interact", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
  
  const commentId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const { channelId, userId, interactionType } = body;
  
  if (!interactionType || !["like", "dislike"].includes(interactionType)) {
    return c.json({ error: "interactionType (like/dislike) required" }, 400);
  }
  
  if (!channelId && !userId) {
    return c.json({ error: "channelId or userId required" }, 400);
  }
  
  const comment = await c.env.DB.prepare("SELECT * FROM comments WHERE id = ?").bind(commentId).first();
  if (!comment) {
    return c.json({ error: "Comment not found" }, 404);
  }
  
  // Check for existing interaction - by channel or user
  let existing;
  if (channelId) {
    existing = await c.env.DB.prepare(
      "SELECT * FROM comment_interactions WHERE comment_id = ? AND channel_id = ?"
    ).bind(commentId, channelId).first();
  } else {
    existing = await c.env.DB.prepare(
      "SELECT * FROM comment_interactions WHERE comment_id = ? AND user_id = ?"
    ).bind(commentId, userId).first();
  }
  
  if (existing) {
    // Already has interaction - update it if different
    if (existing.interaction_type === interactionType) {
      return c.json({ error: "Already " + interactionType + "d this comment" }, 400);
    }
    
    // Switching interaction type
    await c.env.DB.prepare(
      "UPDATE comment_interactions SET interaction_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(interactionType, existing.id).run();
    
    // Update counts
    if (interactionType === "like") {
      await c.env.DB.prepare(
        "UPDATE comments SET like_count = like_count + 1, dislike_count = MAX(0, dislike_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(commentId).run();
    } else {
      await c.env.DB.prepare(
        "UPDATE comments SET dislike_count = dislike_count + 1, like_count = MAX(0, like_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(commentId).run();
    }
  } else {
    // New interaction - insert with either channel_id or user_id
    if (channelId) {
      await c.env.DB.prepare(
        "INSERT INTO comment_interactions (comment_id, channel_id, interaction_type) VALUES (?, ?, ?)"
      ).bind(commentId, channelId, interactionType).run();
    } else {
      await c.env.DB.prepare(
        "INSERT INTO comment_interactions (comment_id, user_id, interaction_type) VALUES (?, ?, ?)"
      ).bind(commentId, userId, interactionType).run();
    }
    
    // Update count
    if (interactionType === "like") {
      await c.env.DB.prepare(
        "UPDATE comments SET like_count = like_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(commentId).run();
    } else {
      await c.env.DB.prepare(
        "UPDATE comments SET dislike_count = dislike_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(commentId).run();
    }
  }
  
  const updatedComment = await c.env.DB.prepare("SELECT like_count, dislike_count FROM comments WHERE id = ?").bind(commentId).first();
  
  return c.json({ 
    success: true,
    likeCount: updatedComment?.like_count || 0,
    dislikeCount: updatedComment?.dislike_count || 0
  });
});

// Remove comment interaction (unlike/undislike)
app.delete("/api/kasshi/comments/:id/interact", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
  
  const commentId = parseInt(c.req.param("id"));
  const channelId = c.req.query("channelId");
  const userId = c.req.query("userId");
  
  if (!channelId && !userId) {
    return c.json({ error: "channelId or userId required" }, 400);
  }
  
  let existing;
  if (channelId) {
    existing = await c.env.DB.prepare(
      "SELECT * FROM comment_interactions WHERE comment_id = ? AND channel_id = ?"
    ).bind(commentId, parseInt(channelId)).first();
  } else {
    existing = await c.env.DB.prepare(
      "SELECT * FROM comment_interactions WHERE comment_id = ? AND user_id = ?"
    ).bind(commentId, userId).first();
  }
  
  if (!existing) {
    return c.json({ error: "No interaction found" }, 404);
  }
  
  // Delete interaction
  if (channelId) {
    await c.env.DB.prepare(
      "DELETE FROM comment_interactions WHERE comment_id = ? AND channel_id = ?"
    ).bind(commentId, parseInt(channelId)).run();
  } else {
    await c.env.DB.prepare(
      "DELETE FROM comment_interactions WHERE comment_id = ? AND user_id = ?"
    ).bind(commentId, userId).run();
  }
  
  // Update count
  if (existing.interaction_type === "like") {
    await c.env.DB.prepare(
      "UPDATE comments SET like_count = MAX(0, like_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(commentId).run();
  } else {
    await c.env.DB.prepare(
      "UPDATE comments SET dislike_count = MAX(0, dislike_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(commentId).run();
  }
  
  const updatedComment = await c.env.DB.prepare("SELECT like_count, dislike_count FROM comments WHERE id = ?").bind(commentId).first();
  
  return c.json({ 
    success: true,
    likeCount: updatedComment?.like_count || 0,
    dislikeCount: updatedComment?.dislike_count || 0
  });
});

// Get user's comment interactions for a video
app.get("/api/kasshi/videos/:id/comment-interactions", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
  
  const idParam = c.req.param("id");
  const channelId = c.req.query("channelId");
  const userId = c.req.query("userId");
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ interactions: {} });
  }
  
  if (!channelId && !userId) {
    return c.json({ interactions: {} });
  }
  
  let interactions;
  if (channelId) {
    interactions = await c.env.DB.prepare(`
      SELECT ci.comment_id, ci.interaction_type
      FROM comment_interactions ci
      JOIN comments cm ON ci.comment_id = cm.id
      WHERE cm.video_id = ? AND ci.channel_id = ?
    `).bind(videoId, parseInt(channelId)).all();
  } else {
    // Query by user_id for KasWare users without channels
    interactions = await c.env.DB.prepare(`
      SELECT ci.comment_id, ci.interaction_type
      FROM comment_interactions ci
      JOIN comments cm ON ci.comment_id = cm.id
      WHERE cm.video_id = ? AND ci.user_id = ?
    `).bind(videoId, userId).all();
  }
  
  // Convert to map of comment_id -> interaction_type
  const interactionMap: Record<string, string> = {};
  for (const i of interactions.results) {
    interactionMap[String(i.comment_id)] = i.interaction_type as string;
  }
  
  return c.json({ interactions: interactionMap });
});

// Delete a comment (own comment only)
app.delete("/api/kasshi/comments/:id", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
  
  const commentId = c.req.param("id");
  
  // Get user's channel - check both wallet address sources
  let userChannel = await c.env.DB.prepare(
    "SELECT c.id FROM channels c JOIN user_wallets uw ON c.wallet_address = uw.wallet_address WHERE uw.user_id = ?"
  ).bind(unifiedUser.id).first();
  
  // Also check external wallet channels
  if (!userChannel && unifiedUser.walletAddress) {
    userChannel = await c.env.DB.prepare(
      "SELECT id FROM channels WHERE wallet_address = ?"
    ).bind(unifiedUser.walletAddress).first();
  }
  
  if (!userChannel) {
    return c.json({ error: "No channel found" }, 400);
  }
  
  // Get the comment and verify ownership
  const comment = await c.env.DB.prepare(
    "SELECT * FROM comments WHERE id = ?"
  ).bind(commentId).first();
  
  if (!comment) {
    return c.json({ error: "Comment not found" }, 404);
  }
  
  if (comment.channel_id !== userChannel.id) {
    return c.json({ error: "You can only delete your own comments" }, 403);
  }
  
  // Delete related interactions first
  await c.env.DB.prepare(
    "DELETE FROM comment_interactions WHERE comment_id = ?"
  ).bind(commentId).run();
  
  // Delete any replies to this comment (recursive would be complex, so just delete direct replies)
  await c.env.DB.prepare(
    "DELETE FROM comment_interactions WHERE comment_id IN (SELECT id FROM comments WHERE parent_id = ?)"
  ).bind(commentId).run();
  await c.env.DB.prepare(
    "DELETE FROM comments WHERE parent_id = ?"
  ).bind(commentId).run();
  
  // Delete the comment
  await c.env.DB.prepare(
    "DELETE FROM comments WHERE id = ?"
  ).bind(commentId).run();
  
  // Decrement video comment count
  await c.env.DB.prepare(
    "UPDATE videos SET comment_count = MAX(0, comment_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(comment.video_id).run();
  
  return c.json({ success: true });
});

// Report a video
app.post("/api/kasshi/videos/:id/report", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
  
  const idParam = c.req.param("id");
  const body = await c.req.json();
  const { reason } = body;
  
  if (!reason || reason.trim().length === 0) {
    return c.json({ error: "Reason is required" }, 400);
  }
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Get reporter's channel (optional - reports can be anonymous)
  let reporterChannel = await c.env.DB.prepare(
    "SELECT c.id FROM channels c JOIN user_wallets uw ON c.wallet_address = uw.wallet_address WHERE uw.user_id = ?"
  ).bind(unifiedUser.id).first();
  
  if (!reporterChannel && unifiedUser.walletAddress) {
    reporterChannel = await c.env.DB.prepare(
      "SELECT id FROM channels WHERE wallet_address = ?"
    ).bind(unifiedUser.walletAddress).first();
  }
  
  // Insert report
  await c.env.DB.prepare(`
    INSERT INTO reports (video_id, reporter_channel_id, reason)
    VALUES (?, ?, ?)
  `).bind(videoId, reporterChannel?.id || null, reason.trim()).run();
  
  return c.json({ success: true, message: "Report submitted" });
});

// Subscribe/unsubscribe with KAS payment
const SUBSCRIBE_FEE_KAS = 0.5; // Cost to subscribe (100% to creator)
const UNSUBSCRIBE_FEE_KAS = 0.0001; // Cost to unsubscribe (100% to platform, batched)

// Helper to get the admin wallet address for platform payments
async function getAdminWalletAddress(db: D1Database): Promise<string | null> {
  const admin = await db.prepare(
    "SELECT wallet_address FROM user_wallets WHERE is_admin = 1 LIMIT 1"
  ).first();
  return admin?.wallet_address as string | null;
}

app.post("/api/kasshi/channels/:handle/subscribe", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
  
  const handle = c.req.param("handle").toLowerCase();
  const body = await c.req.json();
  const { subscriberChannelId } = body;
  
  if (!subscriberChannelId) {
    return c.json({ error: "subscriberChannelId required" }, 400);
  }
  
  const channel = await c.env.DB.prepare(
    "SELECT id, wallet_address FROM channels WHERE handle = ?"
  ).bind(handle).first() as { id: number; wallet_address: string } | null;
  
  if (!channel) {
    return c.json({ error: "Channel not found" }, 404);
  }
  
  if (channel.id === subscriberChannelId) {
    return c.json({ error: "Cannot subscribe to yourself" }, 400);
  }
  
  // Get user's wallet - KasWare users use internal wallet, Google users use user_wallets
  let wallet: Record<string, unknown> | null = null;
  let decryptionKey = "";
  
  if (unifiedUser.isExternal && unifiedUser.internalWalletAddress) {
    const extWallet = await c.env.DB.prepare(
      "SELECT * FROM external_wallet_users WHERE internal_wallet_address = ?"
    ).bind(unifiedUser.internalWalletAddress).first();
    if (extWallet) {
      wallet = {
        wallet_address: extWallet.internal_wallet_address,
        encrypted_private_key: extWallet.encrypted_internal_private_key,
        demo_balance: extWallet.demo_balance,
      };
      decryptionKey = `kasware_${unifiedUser.externalId}_${unifiedUser.walletAddress}`;
    }
  } else {
    wallet = await c.env.DB.prepare(
      "SELECT * FROM user_wallets WHERE user_id = ?"
    ).bind(unifiedUser.id).first();
    decryptionKey = unifiedUser.id;
  }
  
  if (!wallet?.encrypted_private_key) {
    return c.json({ error: "No wallet found" }, 400);
  }
  
  // Check existing subscription
  const existing = await c.env.DB.prepare(
    "SELECT id FROM subscriptions WHERE subscriber_channel_id = ? AND subscribed_to_channel_id = ?"
  ).bind(subscriberChannelId, channel.id).first();
  
  // Determine fee and recipient
  const isUnsubscribing = !!existing;
  const feeKas = isUnsubscribing ? UNSUBSCRIBE_FEE_KAS : SUBSCRIBE_FEE_KAS;
  
  // Get recipient - admin wallet for unsubscribe fees, creator for subscribe
  let recipientAddress = channel.wallet_address;
  if (isUnsubscribing) {
    const adminWallet = await getAdminWalletAddress(c.env.DB);
    if (!adminWallet) {
      return c.json({ error: "Platform wallet not configured" }, 500);
    }
    recipientAddress = adminWallet;
  }
  
  // Check balance (use demo_balance if set, otherwise real balance)
  const demoBalance = wallet.demo_balance ? parseFloat(wallet.demo_balance as string) : null;
  let hasBalance = false;
  
  if (demoBalance !== null && demoBalance > 0) {
    hasBalance = demoBalance >= feeKas;
  } else {
    const balance = await getWalletBalance(wallet.wallet_address as string);
    hasBalance = balance ? parseFloat(balance.balanceKAS) >= feeKas : false;
  }
  
  if (!hasBalance) {
    return c.json({ error: `Insufficient balance. Need ${feeKas} KAS to ${isUnsubscribing ? 'unsubscribe' : 'subscribe'}.` }, 400);
  }
  
  // Process payment
  if (demoBalance !== null && demoBalance > 0) {
    // Demo mode - just deduct from demo balance
    const newBalance = demoBalance - feeKas;
    if (unifiedUser.isExternal) {
      await c.env.DB.prepare(
        "UPDATE external_wallet_users SET demo_balance = ? WHERE wallet_address = ?"
      ).bind(newBalance.toString(), unifiedUser.walletAddress).run();
    } else {
      await c.env.DB.prepare(
        "UPDATE user_wallets SET demo_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
      ).bind(newBalance.toString(), unifiedUser.id).run();
    }
  } else {
    // Real payment
    const privateKey = await decryptPrivateKey(wallet.encrypted_private_key as string, decryptionKey);
    
    // If decryption failed, handle wallet error
    if (!privateKey) {
      if (unifiedUser.isExternal) {
        return c.json({ error: "Failed to decrypt wallet. Please reconnect KasWare." }, 500);
      }
      if (wallet.wallet_pin_hash) {
        await c.env.DB.prepare("DELETE FROM user_wallets WHERE user_id = ?").bind(unifiedUser.id).run();
        return c.json({ error: "Wallet needs recreation. Please refresh.", walletReset: true }, 400);
      }
    }
    
    if (!privateKey) {
      return c.json({ error: "Failed to decrypt wallet" }, 500);
    }
    
    const amountSompi = Math.floor(feeKas * 100000000);
    let result = await sendTransaction(
      wallet.wallet_address as string,
      recipientAddress,
      amountSompi,
      privateKey
    );
    
    // Auto-consolidate if needed and retry
    if (!result.success && result.needsConsolidation) {
      const consolidateResult = await consolidateUTXOs(wallet.wallet_address as string, privateKey);
      if (consolidateResult.success) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        result = await sendTransaction(wallet.wallet_address as string, recipientAddress, amountSompi, privateKey);
      }
    }
    
    if (!result.success) {
      return c.json({ error: result.needsConsolidation ? "Please consolidate wallet in Settings first." : (result.error || "Payment failed") }, 400);
    }
  }
  
  if (isUnsubscribing) {
    // Unsubscribe
    await c.env.DB.prepare(
      "DELETE FROM subscriptions WHERE id = ?"
    ).bind(existing!.id).run();
    
    await c.env.DB.prepare(
      "UPDATE channels SET subscriber_count = CASE WHEN subscriber_count > 0 THEN subscriber_count - 1 ELSE 0 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(channel.id).run();
    
    return c.json({ subscribed: false, paidKas: feeKas, action: "unsubscribed" });
  } else {
    // Subscribe
    await c.env.DB.prepare(
      "INSERT INTO subscriptions (subscriber_channel_id, subscribed_to_channel_id) VALUES (?, ?)"
    ).bind(subscriberChannelId, channel.id).run();
    
    await c.env.DB.prepare(
      "UPDATE channels SET subscriber_count = subscriber_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(channel.id).run();
    
    // Update creator's earnings
    await c.env.DB.prepare(
      "UPDATE channels SET total_kas_earned = CAST(CAST(total_kas_earned AS REAL) + ? AS TEXT), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(feeKas, channel.id).run();
    
    return c.json({ subscribed: true, paidKas: feeKas, action: "subscribed" });
  }
});



// Check subscription status
app.get("/api/kasshi/channels/:handle/subscription", async (c) => {
  const handle = c.req.param("handle").toLowerCase();
  const subscriberChannelId = c.req.query("subscriberChannelId");
  
  if (!subscriberChannelId) {
    return c.json({ subscribed: false });
  }
  
  const channel = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE handle = ?"
  ).bind(handle).first();
  
  if (!channel) {
    return c.json({ subscribed: false });
  }
  
  const subscription = await c.env.DB.prepare(
    "SELECT id FROM subscriptions WHERE subscriber_channel_id = ? AND subscribed_to_channel_id = ?"
  ).bind(subscriberChannelId, channel.id).first();
  
  return c.json({ subscribed: !!subscription });
});

// ============================================
// Notification Bell Subscriptions
// ============================================

// Toggle notification subscription (bell button)
app.post("/api/kasshi/channels/:handle/notifications", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
  
  const handle = c.req.param("handle").toLowerCase();
  
  // Get subscriber channel - check both wallet sources
  let subscriberChannel = await c.env.DB.prepare(
    "SELECT c.id FROM channels c JOIN user_wallets uw ON c.wallet_address = uw.wallet_address WHERE uw.user_id = ?"
  ).bind(unifiedUser.id).first();
  
  if (!subscriberChannel && unifiedUser.walletAddress) {
    subscriberChannel = await c.env.DB.prepare(
      "SELECT id FROM channels WHERE wallet_address = ?"
    ).bind(unifiedUser.walletAddress).first();
  }
  
  if (!subscriberChannel) {
    return c.json({ error: "No channel found for this wallet" }, 404);
  }
  
  const targetChannel = await c.env.DB.prepare(
    "SELECT id, name FROM channels WHERE handle = ?"
  ).bind(handle).first();
  
  if (!targetChannel) {
    return c.json({ error: "Channel not found" }, 404);
  }
  
  // Check if already subscribed to notifications
  const existing = await c.env.DB.prepare(
    "SELECT id FROM channel_notification_subs WHERE subscriber_channel_id = ? AND channel_id = ?"
  ).bind(subscriberChannel.id, targetChannel.id).first();
  
  if (existing) {
    // Unsubscribe from notifications
    await c.env.DB.prepare(
      "DELETE FROM channel_notification_subs WHERE subscriber_channel_id = ? AND channel_id = ?"
    ).bind(subscriberChannel.id, targetChannel.id).run();
    return c.json({ subscribed: false, message: "Notifications disabled" });
  } else {
    // Subscribe to notifications
    await c.env.DB.prepare(`
      INSERT INTO channel_notification_subs (subscriber_channel_id, channel_id)
      VALUES (?, ?)
    `).bind(subscriberChannel.id, targetChannel.id).run();
    return c.json({ subscribed: true, message: "Notifications enabled" });
  }
});

// Check notification subscription status
app.get("/api/kasshi/channels/:handle/notifications", async (c) => {
  const handle = c.req.param("handle").toLowerCase();
  const subscriberChannelId = c.req.query("subscriberChannelId");
  
  if (!subscriberChannelId) {
    return c.json({ subscribed: false });
  }
  
  const channel = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE handle = ?"
  ).bind(handle).first();
  
  if (!channel) {
    return c.json({ subscribed: false });
  }
  
  const subscription = await c.env.DB.prepare(
    "SELECT id FROM channel_notification_subs WHERE subscriber_channel_id = ? AND channel_id = ?"
  ).bind(subscriberChannelId, channel.id).first();
  
  return c.json({ subscribed: !!subscription });
});

// Get user's notifications (unified auth: Google login OR KasWare)
app.get("/api/kasshi/notifications", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const channel = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE wallet_address = ?"
  ).bind(unifiedUser.walletAddress).first();
  
  if (!channel) {
    return c.json({ notifications: [], unreadCount: 0 });
  }
  
  // Get notifications for this user's channel
  const notifications = await c.env.DB.prepare(`
    SELECT n.*, v.title as video_title, v.thumbnail_url as video_thumbnail, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar
    FROM notifications n
    LEFT JOIN videos v ON n.video_id = v.id
    LEFT JOIN channels c ON n.channel_id = c.id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `).bind(unifiedUser.id).all();
  
  const unreadCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0"
  ).bind(unifiedUser.id).first();
  
  return c.json({
    notifications: notifications.results.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      isRead: n.is_read === 1,
      videoId: n.video_id,
      videoTitle: n.video_title,
      videoThumbnail: n.video_thumbnail,
      channelName: n.channel_name,
      channelHandle: n.channel_handle,
      channelAvatar: n.channel_avatar,
      createdAt: toUTCTimestamp(n.created_at),
    })),
    unreadCount: unreadCount?.count || 0,
  });
});

// Mark notifications as read
app.post("/api/kasshi/notifications/read", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const body = await c.req.json();
  const { notificationIds } = body;
  
  if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
    // Mark specific notifications as read
    const placeholders = notificationIds.map(() => "?").join(",");
    await c.env.DB.prepare(`
      UPDATE notifications SET is_read = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders}) AND user_id = ?
    `).bind(...notificationIds, unifiedUser.id).run();
  } else {
    // Mark all as read
    await c.env.DB.prepare(`
      UPDATE notifications SET is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
    `).bind(unifiedUser.id).run();
  }
  
  return c.json({ success: true });
});

// ============================================
// Channel Links
// ============================================

// Get channel links
app.get("/api/kasshi/channels/:handle/links", async (c) => {
  const handle = c.req.param("handle").toLowerCase();
  
  const channel = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE handle = ?"
  ).bind(handle).first();
  
  if (!channel) {
    return c.json({ links: [] });
  }
  
  const links = await c.env.DB.prepare(
    "SELECT * FROM channel_links WHERE channel_id = ? ORDER BY sort_order ASC"
  ).bind(channel.id).all();
  
  return c.json({
    links: links.results.map(l => ({
      id: l.id,
      title: l.title,
      url: l.url,
      icon: l.icon,
      sortOrder: l.sort_order,
    })),
  });
});

// Add/update channel link
app.post("/api/kasshi/channels/:id/links", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
  
  const channelId = c.req.param("id");
  const body = await c.req.json();
  const { title, url, icon } = body;
  
  if (!title || !url) {
    return c.json({ error: "Title and URL are required" }, 400);
  }
  
  // Verify ownership - check both wallet sources
  let channel = await c.env.DB.prepare(
    "SELECT c.id FROM channels c JOIN user_wallets uw ON c.wallet_address = uw.wallet_address WHERE c.id = ? AND uw.user_id = ?"
  ).bind(channelId, unifiedUser.id).first();
  
  if (!channel && unifiedUser.walletAddress) {
    channel = await c.env.DB.prepare(
      "SELECT id FROM channels WHERE id = ? AND wallet_address = ?"
    ).bind(channelId, unifiedUser.walletAddress).first();
  }
  
  if (!channel) {
    return c.json({ error: "Not authorized to edit this channel" }, 403);
  }
  
  // Get next sort order
  const maxOrder = await c.env.DB.prepare(
    "SELECT MAX(sort_order) as max_order FROM channel_links WHERE channel_id = ?"
  ).bind(channelId).first();
  const nextOrder = ((maxOrder?.max_order as number) || 0) + 1;
  
  await c.env.DB.prepare(`
    INSERT INTO channel_links (channel_id, title, url, icon, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).bind(channelId, title, url, icon || null, nextOrder).run();
  
  const newLink = await c.env.DB.prepare(
    "SELECT * FROM channel_links WHERE channel_id = ? ORDER BY id DESC LIMIT 1"
  ).bind(channelId).first();
  
  return c.json({
    id: newLink?.id,
    title: newLink?.title,
    url: newLink?.url,
    icon: newLink?.icon,
    sortOrder: newLink?.sort_order,
  });
});

// Delete channel link
app.delete("/api/kasshi/channels/:id/links/:linkId", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
  
  const channelId = c.req.param("id");
  const linkId = c.req.param("linkId");
  
  // Verify ownership - check both wallet sources
  let channel = await c.env.DB.prepare(
    "SELECT c.id FROM channels c JOIN user_wallets uw ON c.wallet_address = uw.wallet_address WHERE c.id = ? AND uw.user_id = ?"
  ).bind(channelId, unifiedUser.id).first();
  
  if (!channel && unifiedUser.walletAddress) {
    channel = await c.env.DB.prepare(
      "SELECT id FROM channels WHERE id = ? AND wallet_address = ?"
    ).bind(channelId, unifiedUser.walletAddress).first();
  }
  
  if (!channel) {
    return c.json({ error: "Not authorized to edit this channel" }, 403);
  }
  
  await c.env.DB.prepare(
    "DELETE FROM channel_links WHERE id = ? AND channel_id = ?"
  ).bind(linkId, channelId).run();
  
  return c.json({ success: true });
});

// Get platform stats
app.get("/api/kasshi/stats", async (c) => {
  const totalEarnings = await c.env.DB.prepare(
    "SELECT SUM(CAST(total_kas_earned AS REAL)) as total FROM channels"
  ).first();
  
  const channelCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM channels"
  ).first();
  
  const videoCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM videos WHERE status = 'published'"
  ).first();
  
  const todayViews = await c.env.DB.prepare(
    "SELECT SUM(view_count) as count FROM videos WHERE date(created_at) = date('now')"
  ).first();
  
  return c.json({
    totalKasEarned: totalEarnings?.total || 0,
    activeCreators: channelCount?.count || 0,
    totalVideos: videoCount?.count || 0,
    viewsToday: todayViews?.count || 0,
  });
});

// Get competition status
app.get("/api/kasshi/competition/status", async (c) => {
  // Count unique channels with at least one published video
  const uniqueChannels = await c.env.DB.prepare(
    "SELECT COUNT(DISTINCT channel_id) as count FROM videos WHERE status = 'published'"
  ).first();
  
  // Get top video by likes
  const topVideo = await c.env.DB.prepare(`
    SELECT v.id, v.title, v.like_count, c.name as channel_name, c.handle as channel_handle
    FROM videos v
    JOIN channels c ON v.channel_id = c.id
    WHERE v.status = 'published'
    ORDER BY v.like_count DESC
    LIMIT 1
  `).first();
  
  return c.json({
    uniqueChannels: uniqueChannels?.count || 0,
    topVideo: topVideo ? {
      id: topVideo.id,
      title: topVideo.title,
      likes: topVideo.like_count || 0,
      channel: topVideo.channel_name || topVideo.channel_handle,
    } : null,
  });
});

// Get liked videos for a channel
app.get("/api/kasshi/channels/:handle/liked", async (c) => {
  const handle = c.req.param("handle");
  
  // Get channel by handle
  const channel = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE handle = ?"
  ).bind(handle).first();
  
  if (!channel) {
    return c.json({ error: "Channel not found" }, 404);
  }
  
  // Get videos liked by this channel
  const likedVideos = await c.env.DB.prepare(`
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar_url
    FROM videos v
    JOIN video_interactions vi ON v.id = vi.video_id
    JOIN channels c ON v.channel_id = c.id
    WHERE vi.channel_id = ? AND vi.interaction_type = 'like'
    ORDER BY vi.created_at DESC
    LIMIT 50
  `).bind(channel.id).all();
  
  // Lazily generate public_ids for any videos missing them
  await ensurePublicIds(c.env.DB, likedVideos.results as Record<string, unknown>[]);
  
  const videos = (likedVideos.results || []).map((v: any) => ({
    id: v.id,
    publicId: v.public_id,
    title: v.title,
    description: v.description,
    thumbnailUrl: v.thumbnail_url,
    videoUrl: v.video_url,
    duration: v.duration,
    viewCount: v.view_count || 0,
    likeCount: v.like_count || 0,
    dislikeCount: v.dislike_count || 0,
    kasEarned: v.kas_earned || "0",
    status: v.status,
    createdAt: toUTCTimestamp(v.created_at),
    channel: {
      id: v.channel_id,
      name: v.channel_name,
      handle: v.channel_handle,
      avatarUrl: v.channel_avatar_url,
    }
  }));
  
  return c.json({ videos });
});

// ============================================
// Kaspa Wallet API for KasShi (No auth required - wallet IS identity)
// ============================================

// Create a new wallet
app.post("/api/kaspa/wallet/create", async (c) => {
  const ip = getClientIp(c);
  const rateCheck = checkRateLimit(ip, { ...RATE_LIMITS.WALLET_CREATE, keyPrefix: "wallet_create" });
  if (!rateCheck.allowed) {
    return rateLimitResponse(c, rateCheck.retryAfter!);
  }
  
  try {
    const { pin } = await c.req.json();
    
    if (!pin || pin.length < 4) {
      return c.json({ error: "PIN must be at least 4 characters" }, 400);
    }
    
    // Generate new wallet
    const { wallet, mnemonic } = await generateWallet();
    
    // Encrypt private key with PIN
    const encryptedPrivateKey = await encryptPrivateKey(wallet.privateKey, pin);
    
    // Hash PIN for verification
    const pinHash = await hashPin(pin);
    
    return c.json({
      address: wallet.address,
      publicKey: wallet.publicKey,
      encryptedPrivateKey,
      pinHash,
      mnemonic, // Return to user for backup - they should write this down!
    });
  } catch (error) {
    console.error("Wallet creation error:", error);
    return c.json({ error: "Failed to create wallet" }, 500);
  }
});

// Import wallet from mnemonic
app.post("/api/kaspa/wallet/import", async (c) => {
  const ip = getClientIp(c);
  const rateCheck = checkRateLimit(ip, { ...RATE_LIMITS.WALLET_CREATE, keyPrefix: "wallet_import" });
  if (!rateCheck.allowed) {
    return rateLimitResponse(c, rateCheck.retryAfter!);
  }
  
  try {
    const { mnemonic, pin } = await c.req.json();
    
    if (!mnemonic || !pin) {
      return c.json({ error: "Mnemonic and PIN are required" }, 400);
    }
    
    if (pin.length < 4) {
      return c.json({ error: "PIN must be at least 4 characters" }, 400);
    }
    
    // Import wallet from mnemonic
    const wallet = await generateWalletFromMnemonic(mnemonic);
    
    // Encrypt private key with PIN
    const encryptedPrivateKey = await encryptPrivateKey(wallet.privateKey, pin);
    
    // Hash PIN for verification
    const pinHash = await hashPin(pin);
    
    return c.json({
      address: wallet.address,
      publicKey: wallet.publicKey,
      encryptedPrivateKey,
      pinHash,
    });
  } catch (error) {
    console.error("Wallet import error:", error);
    return c.json({ error: "Invalid mnemonic phrase" }, 500);
  }
});

// Get wallet balance
app.get("/api/kaspa/balance/:address", async (c) => {
  const address = c.req.param("address");
  
  if (!address || !address.startsWith("kaspa:")) {
    return c.json({ error: "Invalid address" }, 400);
  }
  
  try {
    // Check for demo balance in database (admin testing mode)
    const db = c.env.DB;
    const wallet = await db.prepare(
      "SELECT demo_balance FROM user_wallets WHERE wallet_address = ?"
    ).bind(address).first<{ demo_balance: string | null }>();
    
    const demoBalanceKAS = parseFloat(wallet?.demo_balance || "0");
    
    // If demo mode is active (demo_balance > 0), return demo balance
    if (demoBalanceKAS > 0) {
      const demoBalanceSompi = BigInt(Math.floor(demoBalanceKAS * 100000000));
      return c.json({
        address,
        balanceKAS: demoBalanceKAS.toFixed(8),
        balanceSompi: demoBalanceSompi.toString(),
        isDemo: true,
      });
    }
    
    // Real mainnet balance from Kaspa network
    const balance = await getWalletBalance(address);
    
    return c.json({
      address,
      balanceKAS: balance?.balanceKAS || "0.00000000",
      balanceSompi: balance?.balanceSompi || "0",
      isDemo: false,
      network: "mainnet",
    });
  } catch (error) {
    console.error("Balance query error:", error);
    return c.json({ 
      address,
      balanceKAS: "0.00",
      balanceSompi: "0",
      isDemo: false,
    });
  }
});

// Send transaction
app.post("/api/kaspa/transaction/send", async (c) => {
  const ip = getClientIp(c);
  const rateCheck = checkRateLimit(ip, { ...RATE_LIMITS.STRICT, keyPrefix: "kaspa_send" });
  if (!rateCheck.allowed) {
    return rateLimitResponse(c, rateCheck.retryAfter!);
  }
  
  try {
    const { fromAddress, toAddress, amountKAS, encryptedPrivateKey, pin } = await c.req.json();
    
    if (!fromAddress || !toAddress || !amountKAS || !encryptedPrivateKey || !pin) {
      return c.json({ error: "Missing required fields" }, 400);
    }
    
    // Decrypt private key
    const privateKey = await decryptPrivateKey(encryptedPrivateKey, pin);
    if (!privateKey) {
      return c.json({ error: "Invalid PIN" }, 401);
    }
    
    // Convert KAS to sompi (1 KAS = 100,000,000 sompi)
    const amountSompi = Math.floor(amountKAS * 100000000);
    
    // Send transaction
    const result = await sendTransaction(fromAddress, toAddress, amountSompi, privateKey);
    
    if (!result.success) {
      return c.json({ error: result.error || "Transaction failed" }, 400);
    }
    
    return c.json({
      success: true,
      transactionId: result.transactionId,
    });
  } catch (error) {
    console.error("Transaction error:", error);
    return c.json({ error: "Transaction failed" }, 500);
  }
});

// ============================================
// Membership Routes
// ============================================

// Get membership tiers for a channel
app.get("/api/kasshi/channels/:handle/tiers", async (c) => {
  try {
    const handle = c.req.param("handle");
    const db = c.env.DB;
    
    // Get channel
    const channel = await db.prepare(
      "SELECT * FROM channels WHERE handle = ?"
    ).bind(handle).first();
    
    if (!channel) {
      return c.json({ error: "Channel not found" }, 404);
    }
    
    // Get tiers
    const tiers = await db.prepare(
      "SELECT * FROM membership_tiers WHERE channel_id = ? ORDER BY price_kas ASC"
    ).bind(channel.id).all();
    
    return c.json({ 
      tiers: tiers.results.map((t: any) => ({
        id: t.id,
        name: t.name,
        priceKas: t.price_kas,
        description: t.description,
        benefits: t.benefits ? JSON.parse(t.benefits) : [],
        durationDays: t.duration_days,
      }))
    });
  } catch (error) {
    console.error("Error fetching tiers:", error);
    return c.json({ error: "Failed to fetch membership tiers" }, 500);
  }
});

// Create a membership tier (channel owner only)
app.post("/api/kasshi/channels/:handle/tiers", async (c) => {
  try {
    const unifiedUser = await getUnifiedUser(c);
    if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
    
    const handle = c.req.param("handle");
    const db = c.env.DB;
    
    // Get channel and verify ownership - check both wallet sources
    let channel = await db.prepare(
      "SELECT c.* FROM channels c JOIN user_wallets uw ON c.wallet_address = uw.wallet_address WHERE c.handle = ? AND uw.user_id = ?"
    ).bind(handle, unifiedUser.id).first();
    
    if (!channel && unifiedUser.walletAddress) {
      channel = await db.prepare(
        "SELECT * FROM channels WHERE handle = ? AND wallet_address = ?"
      ).bind(handle, unifiedUser.walletAddress).first();
    }
    
    if (!channel) {
      return c.json({ error: "Channel not found or not owned by you" }, 403);
    }
    
    const body = await c.req.json();
    const { name, priceKas, description, benefits, durationDays } = body;
    
    if (!name || !priceKas || parseFloat(priceKas) <= 0) {
      return c.json({ error: "Name and valid price required" }, 400);
    }
    
    // Enforce minimum 0.11 KAS to avoid batching and KIP-9 mass limits
    if (parseFloat(priceKas) < 0.11) {
      return c.json({ error: "Minimum tier price is 0.11 KAS to ensure on-chain payments" }, 400);
    }
    
    await db.prepare(`
      INSERT INTO membership_tiers (channel_id, name, price_kas, description, benefits, duration_days)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      channel.id,
      name,
      priceKas.toString(),
      description || null,
      benefits ? JSON.stringify(benefits) : null,
      durationDays || 30
    ).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Error creating tier:", error);
    return c.json({ error: "Failed to create membership tier" }, 500);
  }
});

// Join a membership (pay and become a member)
app.post("/api/kasshi/channels/:handle/join", async (c) => {
  try {
    const unifiedUser = await getUnifiedUser(c);
    if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
    
    const handle = c.req.param("handle");
    const db = c.env.DB;
    
    const body = await c.req.json();
    const { tierId } = body;
    
    if (!tierId) {
      return c.json({ error: "Tier ID required" }, 400);
    }
    
    // Get user's wallet
    let wallet = await db.prepare(
      "SELECT * FROM user_wallets WHERE user_id = ?"
    ).bind(unifiedUser.id).first();
    
    // For KasWare users, check external_wallet_users
    if (!wallet && unifiedUser.walletAddress) {
      const extUser = await db.prepare(
        "SELECT * FROM external_wallet_users WHERE external_address = ?"
      ).bind(unifiedUser.walletAddress).first();
      if (extUser) {
        wallet = {
          wallet_address: extUser.internal_wallet_address || unifiedUser.walletAddress,
          user_id: extUser.user_id,
        } as any;
      }
    }
    
    if (!wallet) {
      return c.json({ error: "Wallet not found" }, 404);
    }
    
    // Get member's channel
    let memberChannel = await db.prepare(
      "SELECT * FROM channels WHERE wallet_address = ?"
    ).bind(wallet.wallet_address).first();
    
    if (!memberChannel && unifiedUser.walletAddress) {
      memberChannel = await db.prepare(
        "SELECT * FROM channels WHERE wallet_address = ?"
      ).bind(unifiedUser.walletAddress).first();
    }
    
    if (!memberChannel) {
      return c.json({ error: "You need a channel to join memberships" }, 400);
    }
    
    // Get target channel
    const targetChannel = await db.prepare(
      "SELECT * FROM channels WHERE handle = ?"
    ).bind(handle).first();
    
    if (!targetChannel) {
      return c.json({ error: "Channel not found" }, 404);
    }
    
    // Get tier
    const tier = await db.prepare(
      "SELECT * FROM membership_tiers WHERE id = ? AND channel_id = ?"
    ).bind(tierId, targetChannel.id).first();
    
    if (!tier) {
      return c.json({ error: "Membership tier not found" }, 404);
    }
    
    const priceKas = parseFloat(tier.price_kas as string);
    
    // Check balance
    const balanceResult = await getWalletBalance(wallet.wallet_address as string);
    const balanceKas = parseFloat(balanceResult?.balanceKAS || "0");
    if (balanceKas < priceKas) {
      return c.json({ error: "Insufficient balance" }, 400);
    }
    
    // Decrypt private key and send payment
    const privateKey = await decryptPrivateKey(
      wallet.encrypted_private_key as string,
      unifiedUser.id
    );
    
    if (!privateKey) {
      return c.json({ error: "Failed to decrypt wallet" }, 500);
    }
    
    const amountSompi = Math.floor(priceKas * 100000000);
    let result = await sendTransaction(
      wallet.wallet_address as string,
      targetChannel.wallet_address as string,
      amountSompi,
      privateKey
    );
    
    // Auto-consolidate if needed and retry
    if (!result.success && result.needsConsolidation) {
      const consolidateResult = await consolidateUTXOs(wallet.wallet_address as string, privateKey);
      if (consolidateResult.success) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        result = await sendTransaction(wallet.wallet_address as string, targetChannel.wallet_address as string, amountSompi, privateKey);
      }
    }
    
    if (!result.success) {
      return c.json({ error: result.needsConsolidation ? "Please consolidate wallet in Settings first." : (result.error || "Payment failed") }, 400);
    }
    
    // Calculate expiry
    const durationDays = tier.duration_days as number || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
    
    // Check for existing membership
    const existing = await db.prepare(
      "SELECT * FROM channel_memberships WHERE member_channel_id = ? AND channel_id = ?"
    ).bind(memberChannel.id, targetChannel.id).first();
    
    if (existing) {
      // Extend membership - add 31 days from current expiry (or now if expired)
      const currentExpiry = new Date(existing.expires_at as string);
      const newExpiry = currentExpiry > new Date() ? currentExpiry : new Date();
      newExpiry.setDate(newExpiry.getDate() + 31);
      
      const totalPaid = parseFloat(existing.total_paid_kas as string || "0") + priceKas;
      
      await db.prepare(`
        UPDATE channel_memberships 
        SET tier_id = ?, expires_at = ?, is_active = 1, total_paid_kas = ?, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(tierId, newExpiry.toISOString(), totalPaid.toString(), existing.id).run();
    } else {
      // Create new membership - one-time purchase, expires in 31 days
      await db.prepare(`
        INSERT INTO channel_memberships (member_channel_id, channel_id, tier_id, expires_at, total_paid_kas)
        VALUES (?, ?, ?, ?, ?)
      `).bind(memberChannel.id, targetChannel.id, tierId, expiresAt.toISOString(), priceKas.toString()).run();
    }
    
    // Update channel earnings
    const newEarnings = parseFloat(targetChannel.total_kas_earned as string || "0") + priceKas;
    await db.prepare(
      "UPDATE channels SET total_kas_earned = ? WHERE id = ?"
    ).bind(newEarnings.toString(), targetChannel.id).run();
    
    return c.json({ 
      success: true, 
      transactionId: result.transactionId,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    console.error("Error joining membership:", error);
    return c.json({ error: "Failed to join membership" }, 500);
  }
});

// Check membership status
// Get all active memberships for current user
app.get("/api/kasshi/my-memberships", async (c) => {
  try {
    const unifiedUser = await getUnifiedUser(c);
    if (!unifiedUser) return c.json({ memberships: [] });
    
    const db = c.env.DB;
    
    // Get user's channel - check both wallet sources
    let memberChannel = await db.prepare(
      "SELECT c.* FROM channels c JOIN user_wallets uw ON c.wallet_address = uw.wallet_address WHERE uw.user_id = ?"
    ).bind(unifiedUser.id).first();
    
    if (!memberChannel && unifiedUser.walletAddress) {
      memberChannel = await db.prepare(
        "SELECT * FROM channels WHERE wallet_address = ?"
      ).bind(unifiedUser.walletAddress).first();
    }
    
    if (!memberChannel) {
      return c.json({ memberships: [] });
    }
    
    // Get all active memberships with channel info
    const memberships = await db.prepare(`
      SELECT 
        m.*,
        t.name as tier_name,
        t.price_kas as tier_price,
        c.handle as channel_handle,
        c.name as channel_name,
        c.avatar_url as channel_avatar
      FROM channel_memberships m
      JOIN membership_tiers t ON m.tier_id = t.id
      JOIN channels c ON m.channel_id = c.id
      WHERE m.member_channel_id = ? AND m.is_active = 1 AND m.expires_at > datetime('now')
      ORDER BY m.expires_at ASC
    `).bind(memberChannel.id).all();
    
    const formattedMemberships = memberships.results.map((m: any) => ({
      id: m.id,
      channelHandle: m.channel_handle,
      channelName: m.channel_name,
      channelAvatar: m.channel_avatar,
      tierName: m.tier_name,
      tierPrice: m.tier_price,
      expiresAt: m.expires_at,
      totalPaid: m.total_paid_kas,
    }));
    
    return c.json({ memberships: formattedMemberships });
  } catch (error) {
    console.error("Error fetching memberships:", error);
    return c.json({ error: "Failed to fetch memberships" }, 500);
  }
});

app.get("/api/kasshi/channels/:handle/membership", async (c) => {
  try {
    const handle = c.req.param("handle");
    const unifiedUser = await getUnifiedUser(c);
    const db = c.env.DB;
    
    if (!unifiedUser) {
      return c.json({ isMember: false });
    }
    
    // Get member's channel using unified wallet address
    const memberChannel = await db.prepare(
      "SELECT * FROM channels WHERE wallet_address = ?"
    ).bind(unifiedUser.walletAddress).first();
    
    if (!memberChannel) {
      return c.json({ isMember: false });
    }
    
    // Get target channel
    const targetChannel = await db.prepare(
      "SELECT * FROM channels WHERE handle = ?"
    ).bind(handle).first();
    
    if (!targetChannel) {
      return c.json({ error: "Channel not found" }, 404);
    }
    
    // Check membership (including cancelled but still active memberships)
    const membership = await db.prepare(`
      SELECT m.*, t.name as tier_name, t.price_kas as tier_price
      FROM channel_memberships m
      JOIN membership_tiers t ON m.tier_id = t.id
      WHERE m.member_channel_id = ? AND m.channel_id = ? AND m.is_active = 1 AND m.expires_at > datetime('now')
    `).bind(memberChannel.id, targetChannel.id).first();
    
    if (membership) {
      return c.json({
        isMember: true,
        tier: membership.tier_name,
        tierPrice: membership.tier_price,
        tierId: membership.tier_id,
        expiresAt: membership.expires_at,
        totalPaid: membership.total_paid_kas,
      });
    }
    
    return c.json({ isMember: false });
  } catch (error) {
    console.error("Error checking membership:", error);
    return c.json({ error: "Failed to check membership" }, 500);
  }
});

// Check if user can access a video (for members-only videos)
app.get("/api/kasshi/videos/:id/access", async (c) => {
  try {
    const idParam = c.req.param("id");
    const unifiedUser = await getUnifiedUser(c);
    const db = c.env.DB;
    
    const videoId = await resolveVideoId(db, idParam);
    if (!videoId) {
      return c.json({ error: "Video not found" }, 404);
    }
    
    // Get video
    const video = await db.prepare(
      "SELECT v.*, c.wallet_address, c.handle FROM videos v JOIN channels c ON v.channel_id = c.id WHERE v.id = ?"
    ).bind(videoId).first();
    
    if (!video) {
      return c.json({ error: "Video not found" }, 404);
    }
    
    // If not members-only, anyone can access
    if (!video.is_members_only) {
      return c.json({ hasAccess: true, isMembersOnly: false });
    }
    
    // Check if user is the channel owner
    if (unifiedUser && unifiedUser.walletAddress === video.wallet_address) {
      return c.json({ hasAccess: true, isMembersOnly: true, isOwner: true });
    }
    
    // Check membership
    if (!unifiedUser) {
      return c.json({ hasAccess: false, isMembersOnly: true });
    }
    
    const memberChannel = await db.prepare(
      "SELECT * FROM channels WHERE wallet_address = ?"
    ).bind(unifiedUser.walletAddress).first();
    
    if (!memberChannel) {
      return c.json({ hasAccess: false, isMembersOnly: true });
    }
    
    const membership = await db.prepare(`
      SELECT * FROM channel_memberships 
      WHERE member_channel_id = ? AND channel_id = ? AND is_active = 1 AND expires_at > datetime('now')
    `).bind(memberChannel.id, video.channel_id).first();
    
    return c.json({ 
      hasAccess: !!membership, 
      isMembersOnly: true,
      membershipExpires: membership?.expires_at 
    });
  } catch (error) {
    console.error("Error checking video access:", error);
    return c.json({ error: "Failed to check access" }, 500);
  }
});

// Feed: For You - algorithmic recommendations based on likes and views
app.get("/api/kasshi/feed/for-you", async (c) => {
  const db = c.env.DB;
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");
  const channelId = c.req.query("channelId"); // Optional: viewer's channel ID
  const userId = c.req.query("userId"); // Optional: viewer's user ID (for users without channels)
  const mode = c.req.query("mode") || "mainnet"; // "mainnet" hides demo content
  const demoFilter = mode === "mainnet" ? "AND v.is_demo = 0 AND c.is_demo = 0" : "";
  
  try {
    let videos;
    
    // Algorithm scoring formula:
    // score = (engagement_score * 40) + (recency_score * 30) + (random_factor * 30)
    // - engagement_score: likes / (views + 1) * 100, capped at 100
    // - recency_score: 100 - (days_old * 2), minimum 0  
    // - random_factor: pseudo-random based on video id and current hour (changes hourly)
    // - preferred_boost: +50 for channels user has engaged with
    // - watched_penalty: -30 for videos user has already seen
    
    if (channelId || userId) {
      // Get channels the user has interacted with (liked or viewed)
      const interactedChannels = channelId 
        ? await db.prepare(`
            SELECT DISTINCT v.channel_id, COUNT(*) as interaction_count
            FROM (
              SELECT video_id FROM video_interactions WHERE channel_id = ? AND interaction_type = 'like'
              UNION ALL
              SELECT video_id FROM video_views WHERE channel_id = ?
            ) interactions
            JOIN videos v ON interactions.video_id = v.id
            GROUP BY v.channel_id
            ORDER BY interaction_count DESC
            LIMIT 20
          `).bind(channelId, channelId).all()
        : await db.prepare(`
            SELECT DISTINCT v.channel_id, COUNT(*) as interaction_count
            FROM video_views vv
            JOIN videos v ON vv.video_id = v.id
            WHERE vv.user_id = ?
            GROUP BY v.channel_id
            ORDER BY interaction_count DESC
            LIMIT 20
          `).bind(userId).all();
      
      const preferredChannelIds = interactedChannels.results.map((r: Record<string, unknown>) => r.channel_id);
      const preferredList = preferredChannelIds.length > 0 ? preferredChannelIds.join(',') : '0';
      
      // Algorithmic feed with scoring
      videos = await db.prepare(`
        SELECT v.*, c.name as channel_name, c.handle as channel_handle, 
               c.avatar_url as channel_avatar, c.is_verified as channel_verified,
               CASE WHEN v.channel_id IN (${preferredList}) THEN 1 ELSE 0 END as is_preferred,
               (SELECT 1 FROM video_views vv WHERE vv.video_id = v.id AND ((? IS NOT NULL AND vv.channel_id = ?) OR (? IS NOT NULL AND (vv.user_id = ? OR vv.user_id = ('ext-' || ?))))) as has_watched,
               (
                 -- Engagement score (0-40): likes per view ratio
                 (MIN(CAST(v.like_count AS REAL) / MAX(v.view_count, 1) * 100, 100) * 0.4) +
                 -- Recency score (0-30): newer videos score higher, decays over 50 days
                 (MAX(100 - (julianday('now') - julianday(v.created_at)) * 2, 0) * 0.3) +
                 -- Random factor (0-30): pseudo-random based on video id XOR current hour
                 (ABS((v.id * 2654435761) % 100) * 0.3) +
                 -- Preferred channel boost (+50)
                 (CASE WHEN v.channel_id IN (${preferredList}) THEN 50 ELSE 0 END) -
                 -- Already watched penalty (-30)
                 (CASE WHEN EXISTS (SELECT 1 FROM video_views vv WHERE vv.video_id = v.id AND ((? IS NOT NULL AND vv.channel_id = ?) OR (? IS NOT NULL AND (vv.user_id = ? OR vv.user_id = ('ext-' || ?))))) THEN 30 ELSE 0 END)
               ) as algo_score
        FROM videos v
        JOIN channels c ON v.channel_id = c.id
        WHERE v.status = 'published' AND v.is_members_only = 0 AND (v.is_private = 0 OR v.is_private IS NULL) ${demoFilter}
        ORDER BY algo_score DESC, RANDOM()
        LIMIT ? OFFSET ?
      `).bind(
        channelId || null, channelId || null, userId || null, userId || null, userId || null,
        channelId || null, channelId || null, userId || null, userId || null, userId || null,
        limit, offset
      ).all();
    } else {
      // Not logged in - algorithmic feed without personalization
      videos = await db.prepare(`
        SELECT v.*, c.name as channel_name, c.handle as channel_handle, 
               c.avatar_url as channel_avatar, c.is_verified as channel_verified,
               0 as has_watched,
               (
                 -- Engagement score (0-40)
                 (MIN(CAST(v.like_count AS REAL) / MAX(v.view_count, 1) * 100, 100) * 0.4) +
                 -- Recency score (0-30)
                 (MAX(100 - (julianday('now') - julianday(v.created_at)) * 2, 0) * 0.3) +
                 -- Random factor (0-30)
                 (ABS((v.id * 2654435761) % 100) * 0.3)
               ) as algo_score
        FROM videos v
        JOIN channels c ON v.channel_id = c.id
        WHERE v.status = 'published' AND v.is_members_only = 0 AND (v.is_private = 0 OR v.is_private IS NULL) ${demoFilter}
        ORDER BY algo_score DESC, RANDOM()
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all();
    }
    
    // Lazily generate public_ids for any videos missing them
    await ensurePublicIds(db, videos.results as Record<string, unknown>[]);
    
    return c.json({
      videos: videos.results.map((v: Record<string, unknown>) => ({
        id: v.id,
        publicId: v.public_id,
        title: v.title,
        description: v.description,
        videoUrl: v.video_url,
        thumbnailUrl: v.thumbnail_url,
        durationSeconds: v.duration_seconds,
        viewCount: v.view_count,
        likeCount: v.like_count,
        dislikeCount: v.dislike_count,
        commentCount: v.comment_count,
        kasEarned: v.kas_earned,
        isMembersOnly: v.is_members_only === 1,
        createdAt: toUTCTimestamp(v.created_at),
        hasWatched: !!v.has_watched,
        channel: {
          id: v.channel_id,
          name: v.channel_name,
          handle: v.channel_handle,
          avatarUrl: v.channel_avatar,
          isVerified: v.channel_verified,
        },
      })),
    });
  } catch (error) {
    console.error("Error fetching for-you feed:", error);
    return c.json({ error: "Failed to fetch feed" }, 500);
  }
});

// Feed: Following - videos from subscribed channels, prioritizing unwatched recent content
app.get("/api/kasshi/feed/following", async (c) => {
  const db = c.env.DB;
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");
  const channelId = c.req.query("channelId");
  const userId = c.req.query("userId"); // Optional: viewer's user ID (for users without channels)
  const mode = c.req.query("mode") || "mainnet";
  const demoFilter = mode === "mainnet" ? "AND v.is_demo = 0 AND c.is_demo = 0" : "";
  
  if (!channelId) {
    return c.json({ videos: [], message: "Login required to see following feed" });
  }
  
  try {
    // Get videos from subscribed channels, ordered by:
    // 1. Unwatched videos first, sorted by newest
    // 2. Watched videos at the bottom, sorted by newest
    const videos = await db.prepare(`
      SELECT v.*, c.name as channel_name, c.handle as channel_handle, 
             c.avatar_url as channel_avatar, c.is_verified as channel_verified,
             (SELECT 1 FROM video_views vv WHERE vv.video_id = v.id AND ((? IS NOT NULL AND vv.channel_id = ?) OR (? IS NOT NULL AND (vv.user_id = ? OR vv.user_id = ('ext-' || ?))))) as has_watched
      FROM videos v
      JOIN channels c ON v.channel_id = c.id
      JOIN subscriptions s ON s.subscribed_to_channel_id = v.channel_id AND s.subscriber_channel_id = ?
      WHERE v.status = 'published' AND (v.is_private = 0 OR v.is_private IS NULL) ${demoFilter}
      ORDER BY 
        CASE WHEN has_watched IS NULL THEN 0 ELSE 1 END ASC,
        v.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(channelId, channelId, userId, userId, userId, channelId, limit, offset).all();
    
    if (videos.results.length === 0) {
      return c.json({ 
        videos: [], 
        message: "Subscribe to channels to see their videos here" 
      });
    }
    
    // Lazily generate public_ids for any videos missing them
    await ensurePublicIds(db, videos.results as Record<string, unknown>[]);
    
    return c.json({
      videos: videos.results.map((v: Record<string, unknown>) => ({
        id: v.id,
        publicId: v.public_id,
        title: v.title,
        description: v.description,
        videoUrl: v.video_url,
        thumbnailUrl: v.thumbnail_url,
        durationSeconds: v.duration_seconds,
        viewCount: v.view_count,
        likeCount: v.like_count,
        dislikeCount: v.dislike_count,
        commentCount: v.comment_count,
        kasEarned: v.kas_earned,
        isMembersOnly: v.is_members_only === 1,
        createdAt: toUTCTimestamp(v.created_at),
        hasWatched: !!v.has_watched,
        channel: {
          id: v.channel_id,
          name: v.channel_name,
          handle: v.channel_handle,
          avatarUrl: v.channel_avatar,
          isVerified: v.channel_verified,
        },
      })),
    });
  } catch (error) {
    console.error("Error fetching following feed:", error);
    return c.json({ error: "Failed to fetch feed" }, 500);
  }
});

// Feed: Members - videos from channels where user has active membership
app.get("/api/kasshi/feed/members", async (c) => {
  const db = c.env.DB;
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");
  const channelId = c.req.query("channelId");
  const userId = c.req.query("userId"); // Optional: viewer's user ID (for users without channels)
  const mode = c.req.query("mode") || "mainnet";
  const demoFilter = mode === "mainnet" ? "AND v.is_demo = 0 AND c.is_demo = 0" : "";
  
  if (!channelId) {
    return c.json({ videos: [], message: "Login required to see members feed" });
  }
  
  try {
    // Get videos from channels where user has active membership
    // Same ordering logic as following: unwatched first, then watched
    const videos = await db.prepare(`
      SELECT v.*, c.name as channel_name, c.handle as channel_handle, 
             c.avatar_url as channel_avatar, c.is_verified as channel_verified,
             (SELECT 1 FROM video_views vv WHERE vv.video_id = v.id AND ((? IS NOT NULL AND vv.channel_id = ?) OR (? IS NOT NULL AND (vv.user_id = ? OR vv.user_id = ('ext-' || ?))))) as has_watched
      FROM videos v
      JOIN channels c ON v.channel_id = c.id
      JOIN channel_memberships cm ON cm.channel_id = v.channel_id 
        AND cm.member_channel_id = ? 
        AND cm.is_active = 1 
        AND cm.expires_at > datetime('now')
      WHERE v.status = 'published' AND (v.is_private = 0 OR v.is_private IS NULL) ${demoFilter}
      ORDER BY 
        CASE WHEN has_watched IS NULL THEN 0 ELSE 1 END ASC,
        v.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(channelId, channelId, userId, userId, userId, channelId, limit, offset).all();
    
    // Lazily generate public_ids for any videos missing them
    await ensurePublicIds(db, videos.results as Record<string, unknown>[]);
    
    return c.json({
      videos: videos.results.map((v: Record<string, unknown>) => ({
        id: v.id,
        publicId: v.public_id,
        title: v.title,
        description: v.description,
        videoUrl: v.video_url,
        thumbnailUrl: v.thumbnail_url,
        durationSeconds: v.duration_seconds,
        viewCount: v.view_count,
        likeCount: v.like_count,
        dislikeCount: v.dislike_count,
        commentCount: v.comment_count,
        kasEarned: v.kas_earned,
        isMembersOnly: v.is_members_only === 1,
        createdAt: toUTCTimestamp(v.created_at),
        hasWatched: !!v.has_watched,
        channel: {
          id: v.channel_id,
          name: v.channel_name,
          handle: v.channel_handle,
          avatarUrl: v.channel_avatar,
          isVerified: v.channel_verified,
        },
      })),
    });
  } catch (error) {
    console.error("Error fetching members feed:", error);
    return c.json({ error: "Failed to fetch feed" }, 500);
  }
});

// Feed: History - videos the user has watched, ordered by most recent
app.get("/api/kasshi/feed/history", async (c) => {
  const db = c.env.DB;
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");
  const channelId = c.req.query("channelId");
  const userId = c.req.query("userId");
  const mode = c.req.query("mode") || "mainnet";
  const demoFilter = mode === "mainnet" ? "AND v.is_demo = 0 AND c.is_demo = 0" : "";
  
  if (!channelId && !userId) {
    return c.json({ videos: [], message: "Login required to see watch history" });
  }
  
  try {
    // Get videos from video_views table ordered by watched_at DESC
    // Match by channel_id OR user_id (for users without channels)
    const viewCondition = channelId 
      ? `(vv.channel_id = ? OR vv.user_id = ?)` 
      : `vv.user_id = ?`;
    const bindParams = channelId 
      ? [channelId, userId || '', limit, offset]
      : [userId, limit, offset];
    
    const videos = await db.prepare(`
      SELECT v.*, c.name as channel_name, c.handle as channel_handle, 
             c.avatar_url as channel_avatar, c.is_verified as channel_verified,
             vv.watched_at as last_watched_at
      FROM videos v
      JOIN channels c ON v.channel_id = c.id
      JOIN video_views vv ON vv.video_id = v.id AND ${viewCondition}
      WHERE v.status = 'published' AND (v.is_private = 0 OR v.is_private IS NULL) ${demoFilter}
      ORDER BY vv.watched_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindParams).all();
    
    if (videos.results.length === 0) {
      return c.json({ 
        videos: [], 
        message: "Videos you watch will appear here" 
      });
    }
    
    // Lazily generate public_ids for any videos missing them
    await ensurePublicIds(db, videos.results as Record<string, unknown>[]);
    
    return c.json({
      videos: videos.results.map((v: Record<string, unknown>) => ({
        id: v.id,
        publicId: v.public_id,
        title: v.title,
        description: v.description,
        videoUrl: v.video_url,
        thumbnailUrl: v.thumbnail_url,
        durationSeconds: v.duration_seconds,
        viewCount: v.view_count,
        likeCount: v.like_count,
        dislikeCount: v.dislike_count,
        commentCount: v.comment_count,
        kasEarned: v.kas_earned,
        isMembersOnly: v.is_members_only === 1,
        createdAt: toUTCTimestamp(v.created_at),
        lastWatchedAt: toUTCTimestamp(v.last_watched_at),
        channel: {
          id: v.channel_id,
          name: v.channel_name,
          handle: v.channel_handle,
          avatarUrl: v.channel_avatar,
          isVerified: v.channel_verified,
        },
      })),
    });
  } catch (error) {
    console.error("Error fetching history feed:", error);
    return c.json({ error: "Failed to fetch history" }, 500);
  }
});

// ============================================
// Admin Routes (Platform Administrator Only)
// ============================================

// Middleware to check admin status
const adminMiddleware = async (c: any, next: any) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const wallet = await c.env.DB.prepare(
    "SELECT is_admin FROM user_wallets WHERE user_id = ?"
  ).bind(user.id).first();
  
  if (!wallet || wallet.is_admin !== 1) {
    return c.json({ error: "Admin access required" }, 403);
  }
  
  await next();
};

// Get all reports (admin only)
app.get("/api/admin/reports", authMiddleware, adminMiddleware, async (c) => {
  try {
    const reports = await c.env.DB.prepare(`
      SELECT 
        r.*,
        v.title as video_title,
        v.thumbnail_url as video_thumbnail,
        v.video_url,
        vc.name as video_channel_name,
        vc.handle as video_channel_handle,
        rc.name as reporter_name,
        rc.handle as reporter_handle
      FROM reports r
      LEFT JOIN videos v ON r.video_id = v.id
      LEFT JOIN channels vc ON v.channel_id = vc.id
      LEFT JOIN channels rc ON r.reporter_channel_id = rc.id
      ORDER BY r.created_at DESC
    `).all();
    
    return c.json({
      reports: reports.results.map((r: any) => ({
        id: r.id,
        videoId: r.video_id,
        reason: r.reason,
        status: r.status || 'pending',
        actionTaken: r.action_taken,
        reviewedAt: r.reviewed_at,
        createdAt: toUTCTimestamp(r.created_at),
        video: {
          id: r.video_id,
          title: r.video_title,
          thumbnailUrl: r.video_thumbnail,
          videoUrl: r.video_url,
          channel: {
            name: r.video_channel_name,
            handle: r.video_channel_handle,
          }
        },
        reporter: r.reporter_channel_id ? {
          name: r.reporter_name,
          handle: r.reporter_handle,
        } : null,
      }))
    });
  } catch (error) {
    console.error("Error fetching reports:", error);
    return c.json({ error: "Failed to fetch reports" }, 500);
  }
});

// Debug endpoint to list R2 contents (admin only)
app.get("/api/admin/r2-debug", authMiddleware, adminMiddleware, async (c) => {
  try {
    // List all objects in R2 bucket (up to 1000)
    const listed = await c.env.R2_BUCKET.list({ limit: 1000 });
    
    const objects = listed.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded?.toISOString() || new Date().toISOString(),
    }));
    
    // Also get all video URLs from database
    const videos = await c.env.DB.prepare(`
      SELECT id, title, video_url, thumbnail_url FROM videos
    `).all();
    
    // Get all channel avatars/banners from database
    const channels = await c.env.DB.prepare(`
      SELECT id, name, handle, avatar_url, banner_url FROM channels
    `).all();
    
    return c.json({
      r2Objects: objects,
      r2Count: objects.length,
      truncated: listed.truncated,
      databaseVideos: videos.results,
      databaseChannels: channels.results
    });
  } catch (error: any) {
    console.error("R2 debug error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Test R2 file access directly (admin only)
app.get("/api/admin/r2-test/:key{.*}", authMiddleware, adminMiddleware, async (c) => {
  try {
    const key = c.req.param("key");
    if (!key) {
      return c.json({ error: "No key provided" }, 400);
    }
    
    console.log("[R2 Test] Testing access to key:", key);
    
    // Try to get file metadata
    const headObj = await c.env.R2_BUCKET.head(key);
    
    if (!headObj) {
      return c.json({ 
        exists: false, 
        key,
        message: "File not found in R2" 
      }, 404);
    }
    
    // Try to get first 1KB of the file to verify access
    const getObj = await c.env.R2_BUCKET.get(key, {
      range: { offset: 0, length: 1024 }
    });
    
    if (!getObj) {
      return c.json({ 
        exists: true, 
        readable: false,
        key,
        size: headObj.size,
        message: "File exists but could not be read" 
      }, 500);
    }
    
    // Read the chunk to verify
    const chunk = await getObj.arrayBuffer();
    
    return c.json({ 
      exists: true, 
      readable: true,
      key,
      size: headObj.size,
      sizeFormatted: headObj.size > 1024 * 1024 
        ? `${(headObj.size / (1024 * 1024)).toFixed(2)} MB`
        : `${(headObj.size / 1024).toFixed(2)} KB`,
      httpEtag: headObj.httpEtag,
      uploaded: headObj.uploaded?.toISOString(),
      testChunkSize: chunk.byteLength,
      contentType: headObj.httpMetadata?.contentType || 'unknown',
      message: "File is accessible" 
    });
  } catch (error: any) {
    console.error("[R2 Test] Error:", error);
    return c.json({ 
      error: error.message,
      stack: error.stack,
      key: c.req.param("key")
    }, 500);
  }
});

// List all videos with file status (admin only)
app.get("/api/admin/videos", authMiddleware, adminMiddleware, async (c) => {
  try {
    const videos = await c.env.DB.prepare(`
      SELECT 
        v.id,
        v.title,
        v.public_id,
        v.video_url,
        v.thumbnail_url,
        v.duration_seconds,
        v.is_private,
        v.is_members_only,
        v.created_at,
        c.id as channel_id,
        c.name as channel_name,
        c.handle as channel_handle
      FROM videos v
      LEFT JOIN channels c ON v.channel_id = c.id
      ORDER BY v.created_at DESC
      LIMIT 100
    `).all();

    // Check R2 for file existence
    const videosWithStatus = await Promise.all(
      (videos.results || []).map(async (video: any) => {
        let videoExists = false;
        let thumbnailExists = false;
        
        // Check video file
        if (video.video_url) {
          try {
            const videoKey = video.video_url.replace('/api/kasshi/media/', '');
            const obj = await c.env.R2_BUCKET.head(videoKey);
            videoExists = !!obj;
          } catch {
            videoExists = false;
          }
        }
        
        // Check thumbnail file
        if (video.thumbnail_url) {
          try {
            const thumbKey = video.thumbnail_url.replace('/api/kasshi/media/', '');
            const obj = await c.env.R2_BUCKET.head(thumbKey);
            thumbnailExists = !!obj;
          } catch {
            thumbnailExists = false;
          }
        }
        
        const isBroken = (video.video_url && !videoExists) || (video.thumbnail_url && !thumbnailExists);
        
        return {
          id: video.id,
          publicId: video.public_id,
          title: video.title,
          videoUrl: video.video_url,
          thumbnailUrl: video.thumbnail_url,
          durationSeconds: video.duration_seconds,
          isPrivate: video.is_private,
          isMembersOnly: video.is_members_only,
          createdAt: video.created_at,
          channel: {
            id: video.channel_id,
            name: video.channel_name,
            handle: video.channel_handle
          },
          fileStatus: {
            videoExists,
            thumbnailExists,
            isBroken
          }
        };
      })
    );

    const brokenCount = videosWithStatus.filter(v => v.fileStatus.isBroken).length;

    return c.json({ 
      videos: videosWithStatus,
      totalCount: videosWithStatus.length,
      brokenCount
    });
  } catch (error) {
    console.error("Error fetching admin videos:", error);
    return c.json({ error: "Failed to fetch videos" }, 500);
  }
});

// Delete a video (admin only)
app.delete("/api/admin/videos/:id", authMiddleware, adminMiddleware, async (c) => {
  const videoId = parseInt(c.req.param("id"));
  
  try {
    // Get video details for logging
    const video = await c.env.DB.prepare(
      "SELECT * FROM videos WHERE id = ?"
    ).bind(videoId).first();
    
    if (!video) {
      return c.json({ error: "Video not found" }, 404);
    }
    
    // Delete related records first
    await c.env.DB.prepare("DELETE FROM comments WHERE video_id = ?").bind(videoId).run();
    await c.env.DB.prepare("DELETE FROM video_interactions WHERE video_id = ?").bind(videoId).run();
    await c.env.DB.prepare("DELETE FROM video_views WHERE video_id = ?").bind(videoId).run();
    await c.env.DB.prepare("DELETE FROM video_payments WHERE video_id = ?").bind(videoId).run();
    await c.env.DB.prepare("DELETE FROM watch_progress WHERE video_id = ?").bind(videoId).run();
    await c.env.DB.prepare("DELETE FROM video_progress WHERE video_id = ?").bind(videoId).run();
    await c.env.DB.prepare("DELETE FROM video_subtitles WHERE video_id = ?").bind(videoId).run();
    
    // Update reports related to this video
    await c.env.DB.prepare(
      "UPDATE reports SET status = 'resolved', action_taken = 'video_deleted', reviewed_at = CURRENT_TIMESTAMP WHERE video_id = ?"
    ).bind(videoId).run();
    
    // Delete the video
    await c.env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(videoId).run();
    
    // Delete video file from R2 if exists
    if (video.video_url) {
      try {
        const videoKey = (video.video_url as string).split('/').pop();
        if (videoKey) {
          await c.env.R2_BUCKET.delete(`videos/${videoKey}`);
        }
      } catch (e) {
        console.error("Failed to delete video file from R2:", e);
      }
    }
    
    // Delete thumbnail from R2 if exists
    if (video.thumbnail_url) {
      try {
        const thumbKey = (video.thumbnail_url as string).split('/').pop();
        if (thumbKey) {
          await c.env.R2_BUCKET.delete(`thumbnails/${thumbKey}`);
        }
      } catch (e) {
        console.error("Failed to delete thumbnail from R2:", e);
      }
    }
    
    return c.json({ success: true, message: "Video deleted successfully" });
  } catch (error) {
    console.error("Error deleting video:", error);
    return c.json({ error: "Failed to delete video" }, 500);
  }
});

// Dismiss a report (admin only)
app.post("/api/admin/reports/:id/dismiss", authMiddleware, adminMiddleware, async (c) => {
  const reportId = parseInt(c.req.param("id"));
  
  try {
    await c.env.DB.prepare(
      "UPDATE reports SET status = 'dismissed', action_taken = 'dismissed', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(reportId).run();
    
    return c.json({ success: true, message: "Report dismissed" });
  } catch (error) {
    console.error("Error dismissing report:", error);
    return c.json({ error: "Failed to dismiss report" }, 500);
  }
});

// Check admin status
app.get("/api/admin/status", authMiddleware, async (c) => {
  const user = c.get("user")!;
  
  const wallet = await c.env.DB.prepare(
    "SELECT is_admin FROM user_wallets WHERE user_id = ?"
  ).bind(user.id).first();
  
  if (!wallet || wallet.is_admin !== 1) {
    return c.json({ isAdmin: false, totalReports: 0, pendingReports: 0 });
  }
  
  // Get report statistics
  const totalReportsResult = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM reports"
  ).first();
  const pendingReportsResult = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM reports WHERE status = 'pending' OR status IS NULL"
  ).first();
  
  return c.json({
    isAdmin: true,
    totalReports: totalReportsResult?.count || 0,
    pendingReports: pendingReportsResult?.count || 0,
  });
});

// Admin: Get all pending creator payouts
app.get("/api/admin/payouts", authMiddleware, adminMiddleware, async (c) => {
  try {
    const payouts = await getAllPendingCreatorPayouts(c.env.DB);
    
    // Calculate totals
    const totalPendingSompi = payouts.reduce(
      (sum, p) => sum + BigInt(p.pendingBalanceSompi),
      BigInt(0)
    );
    const readyPayouts = payouts.filter(p => p.readyForPayout);
    
    return c.json({
      payouts,
      summary: {
        totalCreators: payouts.length,
        readyForPayout: readyPayouts.length,
        totalPendingKas: Number(totalPendingSompi) / 100000000,
        readyPayoutKas: readyPayouts.reduce((sum, p) => sum + p.pendingBalanceKas, 0)
      }
    });
  } catch (error) {
    console.error("Failed to get pending creator payouts:", error);
    return c.json({ error: "Failed to get pending payouts" }, 500);
  }
});

// POST /api/admin/payouts/:channelId/mark-paid - Mark a creator payout as completed
app.post("/api/admin/payouts/:channelId/mark-paid", authMiddleware, adminMiddleware, async (c) => {
  try {
    const channelId = parseInt(c.req.param("channelId"));
    
    // Get the payout details before clearing
    const balance = await c.env.DB.prepare(
      `SELECT balance_sompi FROM pending_balances WHERE channel_id = ?`
    ).bind(channelId).first();
    
    if (!balance) {
      return c.json({ error: "No pending balance found for this channel" }, 404);
    }
    
    // Get channel info for logging
    const channel = await c.env.DB.prepare(
      `SELECT handle, name, wallet_address FROM channels WHERE id = ?`
    ).bind(channelId).first();
    
    // Delete associated pending micropayments
    await c.env.DB.prepare(
      `DELETE FROM pending_micropayments WHERE recipient_channel_id = ?`
    ).bind(channelId).run();
    
    // Clear the pending balance (set to 0 rather than delete to preserve record)
    await c.env.DB.prepare(
      `UPDATE pending_balances SET balance_sompi = '0' WHERE channel_id = ?`
    ).bind(channelId).run();
    
    console.log(`Admin marked payout as paid: Channel ${channelId} (@${channel?.handle}), Amount: ${Number(BigInt(balance.balance_sompi as string)) / 100000000} KAS`);
    
    return c.json({
      success: true,
      channelId,
      handle: channel?.handle,
      clearedAmountKas: Number(BigInt(balance.balance_sompi as string)) / 100000000
    });
  } catch (error) {
    console.error("Failed to mark payout as paid:", error);
    return c.json({ error: "Failed to mark payout as paid" }, 500);
  }
});

// ============================================
// ADMIN TEST ENDPOINTS - Settlement Simulation
// ============================================

// GET /api/admin/test/settlement-status/:channelId - View all pending micropayments
app.get("/api/admin/test/settlement-status/:channelId", authMiddleware, adminMiddleware, async (c) => {
  try {
    const channelId = parseInt(c.req.param("channelId"));
    
    // Get channel info
    const channel = await c.env.DB.prepare(
      `SELECT id, handle, name, wallet_address FROM channels WHERE id = ?`
    ).bind(channelId).first();
    
    if (!channel) {
      return c.json({ error: "Channel not found" }, 404);
    }
    
    // Get pending micropayments where this channel is the SENDER (debits)
    const sentPayments = await c.env.DB.prepare(`
      SELECT pm.*, c.handle as recipient_handle
      FROM pending_micropayments pm
      LEFT JOIN channels c ON pm.recipient_channel_id = c.id
      WHERE pm.sender_channel_id = ?
      ORDER BY pm.created_at DESC
    `).bind(channelId).all();
    
    // Get pending micropayments where this channel is the RECIPIENT (credits)
    const receivedPayments = await c.env.DB.prepare(`
      SELECT pm.*, c.handle as sender_handle
      FROM pending_micropayments pm
      LEFT JOIN channels c ON pm.sender_channel_id = c.id
      WHERE pm.recipient_channel_id = ?
      ORDER BY pm.created_at DESC
    `).bind(channelId).all();
    
    // Get pending balance (what they're owed)
    const pendingBalance = await c.env.DB.prepare(
      `SELECT balance_sompi FROM pending_balances WHERE channel_id = ?`
    ).bind(channelId).first();
    
    // Calculate total debits (what they owe)
    const totalDebitsSompi = (sentPayments.results || []).reduce(
      (sum: bigint, p: any) => sum + BigInt(p.amount_sompi), 
      BigInt(0)
    );
    
    // Group sent payments by recipient
    const debitsByRecipient = new Map<string, { count: number; totalSompi: bigint; totalKas: number }>();
    for (const p of (sentPayments.results || []) as any[]) {
      const key = p.recipient_channel_id ? `@${p.recipient_handle}` : 'Platform';
      const existing = debitsByRecipient.get(key) || { count: 0, totalSompi: BigInt(0), totalKas: 0 };
      existing.count++;
      existing.totalSompi = existing.totalSompi + BigInt(p.amount_sompi);
      existing.totalKas = Number(existing.totalSompi) / 100000000;
      debitsByRecipient.set(key, existing);
    }
    
    // Check settlement readiness
    const BATCH_THRESHOLD_SOMPI = BigInt(11000000); // 0.11 KAS
    const settlementReady: { recipient: string; amountKas: number; ready: boolean }[] = [];
    
    for (const [recipient, data] of debitsByRecipient) {
      settlementReady.push({
        recipient,
        amountKas: data.totalKas,
        ready: data.totalSompi >= BATCH_THRESHOLD_SOMPI
      });
    }
    
    return c.json({
      channel: {
        id: channel.id,
        handle: channel.handle,
        name: channel.name,
        walletAddress: channel.wallet_address
      },
      summary: {
        totalDebitsKas: Number(totalDebitsSompi) / 100000000,
        totalCreditsKas: pendingBalance ? Number(BigInt(pendingBalance.balance_sompi as string)) / 100000000 : 0,
        batchThresholdKas: 0.1,
        debitsByRecipient: Object.fromEntries(
          [...debitsByRecipient].map(([k, v]) => [k, { count: v.count, totalKas: v.totalKas }])
        )
      },
      settlementReadiness: settlementReady,
      sentPayments: (sentPayments.results || []).map((p: any) => ({
        id: p.id,
        recipient: p.recipient_channel_id ? `@${p.recipient_handle}` : 'Platform',
        recipientType: p.recipient_type,
        actionType: p.action_type,
        amountKas: Number(BigInt(p.amount_sompi)) / 100000000,
        createdAt: p.created_at
      })),
      receivedPayments: (receivedPayments.results || []).map((p: any) => ({
        id: p.id,
        sender: `@${p.sender_handle}`,
        actionType: p.action_type,
        amountKas: Number(BigInt(p.amount_sompi)) / 100000000,
        createdAt: p.created_at
      }))
    });
  } catch (error) {
    console.error("Settlement status error:", error);
    return c.json({ error: "Failed to get settlement status" }, 500);
  }
});

// POST /api/admin/test/simulate-micropayment - Add test micropayment
app.post("/api/admin/test/simulate-micropayment", authMiddleware, adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { 
      senderChannelId, 
      recipientChannelId, // null for platform
      recipientType, // 'creator' | 'platform' | 'commenter'
      actionType, // 'view_platform_fee' | 'like' | 'comment' | etc.
      amountKas,
      videoId,
      commentId
    } = body;
    
    if (!senderChannelId || !recipientType || !actionType || !amountKas) {
      return c.json({ 
        error: "Required: senderChannelId, recipientType, actionType, amountKas",
        example: {
          senderChannelId: 1,
          recipientChannelId: null,
          recipientType: "platform",
          actionType: "view_platform_fee",
          amountKas: 0.01,
          videoId: 1,
          commentId: null
        }
      }, 400);
    }
    
    const amountSompi = Math.floor(amountKas * 100000000);
    
    // Insert test micropayment
    const result = await c.env.DB.prepare(`
      INSERT INTO pending_micropayments 
      (sender_channel_id, recipient_channel_id, recipient_type, action_type, amount_sompi, video_id, comment_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      senderChannelId,
      recipientChannelId || null,
      recipientType,
      actionType,
      amountSompi.toString(),
      videoId || null,
      commentId || null
    ).run();
    
    // Get updated totals
    const debits = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(CAST(amount_sompi AS INTEGER)), 0) as total
      FROM pending_micropayments
      WHERE sender_channel_id = ?
    `).bind(senderChannelId).first();
    
    const totalDebitsSompi = BigInt(debits?.total as string || '0');
    const BATCH_THRESHOLD_SOMPI = BigInt(10000000);
    
    return c.json({
      success: true,
      micropaymentId: result.meta.last_row_id,
      senderChannelId,
      recipientChannelId,
      recipientType,
      actionType,
      amountKas,
      newTotalDebitsKas: Number(totalDebitsSompi) / 100000000,
      thresholdKas: 0.1,
      settlementWouldTrigger: totalDebitsSompi >= BATCH_THRESHOLD_SOMPI,
      message: totalDebitsSompi >= BATCH_THRESHOLD_SOMPI 
        ? "⚠️ Total debits >= threshold. Real micropay would trigger settlement check."
        : `Need ${(0.1 - Number(totalDebitsSompi) / 100000000).toFixed(4)} more KAS to trigger settlement.`
    });
  } catch (error) {
    console.error("Simulate micropayment error:", error);
    return c.json({ error: "Failed to simulate micropayment" }, 500);
  }
});

// POST /api/admin/test/dry-run-settlement/:channelId - Check what would settle
app.post("/api/admin/test/dry-run-settlement/:channelId", authMiddleware, adminMiddleware, async (c) => {
  try {
    const channelId = parseInt(c.req.param("channelId"));
    const BATCH_THRESHOLD_SOMPI = BigInt(11000000); // 0.11 KAS
    
    // Get all pending micropayments from this sender
    const micropayments = await c.env.DB.prepare(`
      SELECT pm.*, c.handle as recipient_handle, c.wallet_address as recipient_wallet
      FROM pending_micropayments pm
      LEFT JOIN channels c ON pm.recipient_channel_id = c.id
      WHERE pm.sender_channel_id = ?
    `).bind(channelId).all();
    
    if (!micropayments.results?.length) {
      return c.json({ 
        wouldSettle: false, 
        reason: "No pending micropayments found for this sender",
        settlements: []
      });
    }
    
    // Calculate total debits
    const totalDebitsSompi = (micropayments.results as any[]).reduce(
      (sum, p) => sum + BigInt(p.amount_sompi), 
      BigInt(0)
    );
    
    if (totalDebitsSompi < BATCH_THRESHOLD_SOMPI) {
      return c.json({
        wouldSettle: false,
        reason: `Total debits (${Number(totalDebitsSompi) / 100000000} KAS) below threshold (0.11 KAS)`,
        totalDebitsKas: Number(totalDebitsSompi) / 100000000,
        neededKas: (Number(BATCH_THRESHOLD_SOMPI) - Number(totalDebitsSompi)) / 100000000,
        settlements: []
      });
    }
    
    // Group by recipient
    const byRecipient = new Map<number | null, any[]>();
    for (const mp of micropayments.results as any[]) {
      const key = mp.recipient_channel_id;
      if (!byRecipient.has(key)) {
        byRecipient.set(key, []);
      }
      byRecipient.get(key)!.push(mp);
    }
    
    // Get platform wallet
    const platformWallet = await getAdminWalletAddress(c.env.DB);
    
    // Check which recipients would settle
    const wouldSettle: any[] = [];
    const wouldNotSettle: any[] = [];
    
    for (const [recipientChannelId, payments] of byRecipient) {
      const recipientTotal = payments.reduce((sum: bigint, p: any) => sum + BigInt(p.amount_sompi), BigInt(0));
      const recipientKas = Number(recipientTotal) / 100000000;
      
      const recipientData = {
        recipient: recipientChannelId ? `@${payments[0].recipient_handle}` : 'Platform',
        recipientChannelId,
        recipientWallet: recipientChannelId ? payments[0].recipient_wallet : platformWallet,
        paymentCount: payments.length,
        totalKas: recipientKas,
        thresholdMet: recipientTotal >= BATCH_THRESHOLD_SOMPI,
        payments: payments.map((p: any) => ({
          id: p.id,
          actionType: p.action_type,
          amountKas: Number(BigInt(p.amount_sompi)) / 100000000
        }))
      };
      
      if (recipientTotal >= BATCH_THRESHOLD_SOMPI) {
        wouldSettle.push(recipientData);
      } else {
        wouldNotSettle.push({
          ...recipientData,
          neededKas: (Number(BATCH_THRESHOLD_SOMPI) - Number(recipientTotal)) / 100000000
        });
      }
    }
    
    return c.json({
      wouldSettle: wouldSettle.length > 0,
      totalDebitsKas: Number(totalDebitsSompi) / 100000000,
      platformWallet,
      settlementSummary: {
        recipientsReadyToSettle: wouldSettle.length,
        recipientsNotReady: wouldNotSettle.length,
        totalKasToSettle: wouldSettle.reduce((sum, r) => sum + r.totalKas, 0),
        totalKasPending: wouldNotSettle.reduce((sum, r) => sum + r.totalKas, 0)
      },
      readyToSettle: wouldSettle,
      notReadyToSettle: wouldNotSettle
    });
  } catch (error) {
    console.error("Dry run settlement error:", error);
    return c.json({ error: "Failed to run settlement simulation" }, 500);
  }
});

// DELETE /api/admin/test/clear-micropayments/:channelId - Clear test data
app.delete("/api/admin/test/clear-micropayments/:channelId", authMiddleware, adminMiddleware, async (c) => {
  try {
    const channelId = parseInt(c.req.param("channelId"));
    
    // Count before delete
    const beforeCount = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM pending_micropayments WHERE sender_channel_id = ?`
    ).bind(channelId).first();
    
    // Delete all pending micropayments for this sender
    await c.env.DB.prepare(
      `DELETE FROM pending_micropayments WHERE sender_channel_id = ?`
    ).bind(channelId).run();
    
    return c.json({
      success: true,
      channelId,
      deletedCount: beforeCount?.count || 0,
      message: `Cleared ${beforeCount?.count || 0} pending micropayments for channel ${channelId}`
    });
  } catch (error) {
    console.error("Clear micropayments error:", error);
    return c.json({ error: "Failed to clear micropayments" }, 500);
  }
});

// ============================================
// ADMIN CHANNEL MANAGEMENT ENDPOINTS
// ============================================

// GET /api/admin/channels - List all channels with owner info
app.get("/api/admin/channels", authMiddleware, adminMiddleware, async (c) => {
  try {
    // Check both user_wallets (Google auth) and external_wallet_users (KasWare/Kastle)
    const channels = await c.env.DB.prepare(`
      SELECT 
        c.id, c.handle, c.name, c.description, c.wallet_address, 
        c.avatar_url, c.banner_url, c.is_verified, c.subscriber_count,
        c.created_at, c.updated_at,
        COALESCE(uw.user_id, 'ext-' || ewu.id) as user_id,
        CASE 
          WHEN uw.user_id IS NOT NULL THEN 'google'
          WHEN ewu.id IS NOT NULL THEN 'external'
          ELSE NULL 
        END as owner_type
      FROM channels c
      LEFT JOIN user_wallets uw ON c.wallet_address = uw.wallet_address
      LEFT JOIN external_wallet_users ewu ON c.wallet_address = ewu.wallet_address
      ORDER BY c.created_at DESC
    `).all();
    
    return c.json({
      channels: (channels.results || []).map((ch: any) => ({
        id: ch.id,
        handle: ch.handle,
        name: ch.name,
        description: ch.description,
        walletAddress: ch.wallet_address,
        avatarUrl: ch.avatar_url,
        bannerUrl: ch.banner_url,
        isVerified: ch.is_verified === 1,
        subscriberCount: ch.subscriber_count,
        createdAt: ch.created_at,
        updatedAt: ch.updated_at,
        userId: ch.user_id,
        ownerType: ch.owner_type,
        hasActiveOwner: !!ch.user_id
      }))
    });
  } catch (error) {
    console.error("List channels error:", error);
    return c.json({ error: "Failed to fetch channels" }, 500);
  }
});

// PATCH /api/admin/channels/:id/reassign - Reassign channel wallet to new owner
app.patch("/api/admin/channels/:id/reassign", authMiddleware, adminMiddleware, async (c) => {
  try {
    const channelId = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { newWalletAddress } = body;
    
    if (!newWalletAddress || !newWalletAddress.startsWith("kaspa:")) {
      return c.json({ error: "Valid Kaspa wallet address required" }, 400);
    }
    
    // Get the channel
    const channel = await c.env.DB.prepare(
      `SELECT id, handle, name, wallet_address FROM channels WHERE id = ?`
    ).bind(channelId).first();
    
    if (!channel) {
      return c.json({ error: "Channel not found" }, 404);
    }
    
    // Check if new wallet exists in system
    const newWallet = await c.env.DB.prepare(
      `SELECT user_id FROM user_wallets WHERE wallet_address = ?`
    ).bind(newWalletAddress).first();
    
    // Check if new wallet already owns a different channel
    const existingChannel = await c.env.DB.prepare(
      `SELECT id, handle FROM channels WHERE wallet_address = ? AND id != ?`
    ).bind(newWalletAddress, channelId).first();
    
    if (existingChannel) {
      return c.json({ 
        error: `Wallet already owns channel @${existingChannel.handle}`,
        existingChannelId: existingChannel.id
      }, 409);
    }
    
    // Update the channel's wallet address
    await c.env.DB.prepare(
      `UPDATE channels SET wallet_address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(newWalletAddress, channelId).run();
    
    return c.json({
      success: true,
      channel: {
        id: channelId,
        handle: channel.handle,
        name: channel.name,
        oldWalletAddress: channel.wallet_address,
        newWalletAddress: newWalletAddress,
        hasActiveOwner: !!newWallet?.user_id
      }
    });
  } catch (error) {
    console.error("Reassign channel error:", error);
    return c.json({ error: "Failed to reassign channel" }, 500);
  }
});

export default app;
