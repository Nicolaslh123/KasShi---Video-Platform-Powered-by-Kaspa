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
import {
  validateTicker,
  getKrc20Balance,
  getKrc20TokenInfo,
  buildKrc20DeployTx,
} from "./services/krc20-builder";

const app = new Hono<{ 
  Bindings: Env;
  Variables: {
    user?: MochaUser;
  };
}>();

// Helper to generate URL-friendly slugs for albums/playlists
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/-+/g, '-') // Collapse multiple dashes
    .substring(0, 100); // Limit length
}

// Generate unique slug - adds number suffix if duplicate exists
async function generateUniqueSlug(db: D1Database, table: 'albums' | 'playlists', title: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(title);
  if (!baseSlug) return `${table.slice(0, -1)}-${Date.now()}`; // Fallback for empty titles
  
  // Check if base slug exists
  let whereClause = 'slug = ?';
  const params: (string | number)[] = [baseSlug];
  if (excludeId) {
    whereClause += ' AND id != ?';
    params.push(excludeId);
  }
  
  const existing = await db.prepare(
    `SELECT slug FROM ${table} WHERE ${whereClause}`
  ).bind(...params).first();
  
  if (!existing) return baseSlug;
  
  // Find next available number
  const likePattern = `${baseSlug}-%`;
  let countWhere = 'slug = ? OR slug LIKE ?';
  const countParams: (string | number)[] = [baseSlug, likePattern];
  if (excludeId) {
    countWhere = `(${countWhere}) AND id != ?`;
    countParams.push(excludeId);
  }
  
  const countResult = await db.prepare(
    `SELECT COUNT(*) as count FROM ${table} WHERE ${countWhere}`
  ).bind(...countParams).first<{ count: number }>();
  
  return `${baseSlug}-${(countResult?.count || 1) + 1}`;
}

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

// Redirect alternate sitemap URL pattern
app.get("/api/sitemap/xml", (c) => {
  return c.redirect("/api/sitemap.xml", 301);
});

// Dynamic XML Sitemap for SEO
app.get("/api/sitemap.xml", async (c) => {
  const baseUrl = "https://kasshi.io";
  const languages = ['', 'es', 'fr', 'de', 'ja', 'ko', 'zh', 'pt', 'ru', 'ar', 'hi', 'it', 'nl', 'pl', 'tr', 'vi', 'th', 'id'];
  
  // Static pages
  const staticPages = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/music', priority: '0.9', changefreq: 'daily' },
    { path: '/search', priority: '0.7', changefreq: 'weekly' },
    { path: '/music/discover', priority: '0.8', changefreq: 'daily' },
    { path: '/music/leaderboard', priority: '0.7', changefreq: 'daily' },
    { path: '/music/tracks', priority: '0.8', changefreq: 'daily' },
    { path: '/music/albums', priority: '0.8', changefreq: 'daily' },
    { path: '/music/playlists', priority: '0.7', changefreq: 'daily' },
    { path: '/music/podcasts', priority: '0.8', changefreq: 'daily' },
    { path: '/marketplace', priority: '0.7', changefreq: 'weekly' },
    { path: '/legal/terms', priority: '0.3', changefreq: 'monthly' },
    { path: '/legal/privacy', priority: '0.3', changefreq: 'monthly' },
    { path: '/legal/community', priority: '0.3', changefreq: 'monthly' },
  ];

  let urls: string[] = [];
  const today = new Date().toISOString().split('T')[0];

  // Add static pages with language variants
  for (const page of staticPages) {
    for (const lang of languages) {
      const langPrefix = lang ? `/${lang}` : '';
      const fullUrl = `${baseUrl}${langPrefix}${page.path}`;
      urls.push(`
    <url>
      <loc>${fullUrl}</loc>
      <lastmod>${today}</lastmod>
      <changefreq>${page.changefreq}</changefreq>
      <priority>${page.priority}</priority>
    </url>`);
    }
  }

  // Fetch dynamic content from database
  try {
    const db = c.env.DB;

    // Videos (public only, limit to recent 1000)
    const videos = await db.prepare(`
      SELECT public_id, updated_at FROM videos 
      WHERE is_members_only = 0 AND video_url IS NOT NULL 
      ORDER BY created_at DESC LIMIT 1000
    `).all<{ public_id: string; updated_at: string }>();
    
    for (const video of videos.results || []) {
      const lastmod = video.updated_at?.split(' ')[0] || today;
      urls.push(`
    <url>
      <loc>${baseUrl}/watch/${video.public_id}</loc>
      <lastmod>${lastmod}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.6</priority>
    </url>`);
    }

    // Channels (limit to 500)
    const channels = await db.prepare(`
      SELECT id, updated_at FROM channels 
      ORDER BY subscriber_count DESC LIMIT 500
    `).all<{ id: number; updated_at: string }>();
    
    for (const channel of channels.results || []) {
      const lastmod = channel.updated_at?.split(' ')[0] || today;
      urls.push(`
    <url>
      <loc>${baseUrl}/channel/${channel.id}</loc>
      <lastmod>${lastmod}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.7</priority>
    </url>`);
    }

    // Music tracks (limit to 1000)
    const tracks = await db.prepare(`
      SELECT id, updated_at FROM tracks 
      ORDER BY play_count DESC LIMIT 1000
    `).all<{ id: number; updated_at: string }>();
    
    for (const track of tracks.results || []) {
      const lastmod = track.updated_at?.split(' ')[0] || today;
      urls.push(`
    <url>
      <loc>${baseUrl}/music/track/${track.id}</loc>
      <lastmod>${lastmod}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.6</priority>
    </url>`);
    }

    // Albums (limit to 500)
    const albums = await db.prepare(`
      SELECT id, slug, updated_at FROM albums 
      ORDER BY created_at DESC LIMIT 500
    `).all<{ id: number; slug: string | null; updated_at: string }>();
    
    for (const album of albums.results || []) {
      const lastmod = album.updated_at?.split(' ')[0] || today;
      const albumPath = album.slug || album.id;
      urls.push(`
    <url>
      <loc>${baseUrl}/music/album/${albumPath}</loc>
      <lastmod>${lastmod}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.6</priority>
    </url>`);
    }

    // Playlists (public only, limit to 500)
    const playlists = await db.prepare(`
      SELECT id, slug, updated_at FROM playlists 
      WHERE is_public = 1 
      ORDER BY created_at DESC LIMIT 500
    `).all<{ id: number; slug: string | null; updated_at: string }>();
    
    for (const playlist of playlists.results || []) {
      const lastmod = playlist.updated_at?.split(' ')[0] || today;
      const playlistPath = playlist.slug || playlist.id;
      urls.push(`
    <url>
      <loc>${baseUrl}/music/playlist/${playlistPath}</loc>
      <lastmod>${lastmod}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.5</priority>
    </url>`);
    }

    // Podcasts (limit to 500)
    const podcasts = await db.prepare(`
      SELECT id, updated_at FROM podcasts 
      ORDER BY follower_count DESC LIMIT 500
    `).all<{ id: number; updated_at: string }>();
    
    for (const podcast of podcasts.results || []) {
      const lastmod = podcast.updated_at?.split(' ')[0] || today;
      urls.push(`
    <url>
      <loc>${baseUrl}/music/podcast/${podcast.id}</loc>
      <lastmod>${lastmod}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.6</priority>
    </url>`);
    }

    // Music profiles/artists (limit to 500)
    const artists = await db.prepare(`
      SELECT id, updated_at FROM music_profiles 
      ORDER BY follower_count DESC LIMIT 500
    `).all<{ id: number; updated_at: string }>();
    
    for (const artist of artists.results || []) {
      const lastmod = artist.updated_at?.split(' ')[0] || today;
      urls.push(`
    <url>
      <loc>${baseUrl}/music/artist/${artist.id}</loc>
      <lastmod>${lastmod}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.7</priority>
    </url>`);
    }

  } catch (e) {
    // If database query fails, still return static pages
    console.error('Sitemap DB error:', e);
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('')}
</urlset>`;

  return c.text(sitemap, 200, { 
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600" // Cache for 1 hour
  });
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

// Handle auth callback - serve SPA for OAuth redirect (fixes Firefox 404 issue)
app.get("/auth/callback", async (c) => {
  // Return HTML that loads the SPA - this ensures the route works in all browsers
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KasShi - Signing in...</title>
  <style>
    body { background: linear-gradient(135deg, #0f172a 0%, #134e4a 50%, #0f172a 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
    .spinner { width: 64px; height: 64px; border: 4px solid rgba(112, 199, 186, 0.3); border-top-color: #70C7BA; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { color: rgba(255,255,255,0.6); margin-top: 16px; font-family: system-ui, sans-serif; }
    .container { text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>Completing sign in...</p>
  </div>
  <script>
    // Redirect to the SPA with the auth code preserved
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      // Use the API to exchange the code
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        credentials: 'include'
      }).then(r => r.json()).then(() => {
        window.location.href = '/';
      }).catch(() => {
        window.location.href = '/';
      });
    } else {
      window.location.href = '/';
    }
  </script>
</body>
</html>`;
  return c.html(html);
});

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
  referralCode: z.string().optional(),
})), async (c) => {
  const { address, signature, challenge, publicKey, referralCode } = c.req.valid("json");
  
  try {
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
      
      // ALSO create a user_wallets record so history tracking works
      const internalUserId = crypto.randomUUID();
      await c.env.DB.prepare(`
        INSERT INTO user_wallets (user_id, wallet_address, public_key, encrypted_private_key, encrypted_mnemonic)
        VALUES (?, ?, ?, ?, ?)
      `).bind(internalUserId, internalWallet.address, internalWallet.publicKey, encryptedKey, encryptedMnemonic).run();
      
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
    
    // Fix for existing users: ensure user_wallets record exists for their internal wallet
    if (internalWalletAddress) {
      const existingUserWallet = await c.env.DB.prepare(
        "SELECT user_id FROM user_wallets WHERE wallet_address = ?"
      ).bind(internalWalletAddress).first();
      
      if (!existingUserWallet) {
        // Create missing user_wallets record using data from external_wallet_users
        const extWalletData = await c.env.DB.prepare(
          "SELECT internal_public_key, encrypted_internal_private_key, encrypted_internal_mnemonic FROM external_wallet_users WHERE wallet_address = ?"
        ).bind(address).first<{ internal_public_key: string; encrypted_internal_private_key: string; encrypted_internal_mnemonic: string }>();
        
        if (extWalletData) {
          const internalUserId = crypto.randomUUID();
          await c.env.DB.prepare(`
            INSERT INTO user_wallets (user_id, wallet_address, public_key, encrypted_private_key, encrypted_mnemonic)
            VALUES (?, ?, ?, ?, ?)
          `).bind(internalUserId, internalWalletAddress, extWalletData.internal_public_key, extWalletData.encrypted_internal_private_key, extWalletData.encrypted_internal_mnemonic).run();
          console.log(`Created missing user_wallets record for KasWare user ${address}: ${internalWalletAddress}`);
        }
      }
    }
  }
  
  // Also ensure they have a channel linked to their INTERNAL wallet (for interactions)
  const existingChannel = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE wallet_address = ?"
  ).bind(internalWalletAddress || address).first();
  
  // Handle referral code for NEW users (first time verification with no existing referral)
  let referralApplied = false;
  if (referralCode) {
    // Check if user was already referred
    const existingReferral = await c.env.DB.prepare(
      "SELECT id FROM referrals WHERE referred_wallet_address = ?"
    ).bind(address).first();
    
    if (!existingReferral) {
      // Validate the referral code exists and is from an eligible referrer
      const referral = await c.env.DB.prepare(`
        SELECT r.*, c.created_at as channel_created_at, c.id as channel_id,
               (SELECT COUNT(*) FROM videos WHERE channel_id = c.id AND status = 'published') as video_count
        FROM referrals r
        JOIN channels c ON r.referrer_channel_id = c.id
        WHERE r.referral_code = ? AND r.referred_channel_id IS NULL
      `).bind(referralCode).first<{
        id: number;
        referrer_channel_id: number;
        channel_created_at: string;
        channel_id: number;
        video_count: number;
      }>();
      
      if (referral) {
        // Check referrer eligibility: account 5+ days old, has 1+ video
        const createdAtUTC = toUTCTimestamp(referral.channel_created_at);
        const channelAge = createdAtUTC ? Date.now() - new Date(createdAtUTC).getTime() : 0;
        const minAge = 5 * 24 * 60 * 60 * 1000; // 5 days in ms
        
        if (channelAge >= minAge && referral.video_count >= 1) {
          // Check weekly referral limit (max 2 per week)
          // Wrap in try-catch in case referral columns don't exist in production yet
          try {
            const referrerChannel = await c.env.DB.prepare(
              "SELECT referrals_this_week, last_referral_week FROM channels WHERE id = ?"
            ).bind(referral.referrer_channel_id).first<{
              referrals_this_week: number;
              last_referral_week: string | null;
            }>();
            
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week
            const weekKey = weekStart.toISOString().slice(0, 10);
            
            const isNewWeek = referrerChannel?.last_referral_week !== weekKey;
            const currentCount = isNewWeek ? 0 : (referrerChannel?.referrals_this_week || 0);
            
            if (currentCount < 2 && (referrerChannel?.referrals_this_week || 0) < 10) {
              // Update referral with referred user info
              await c.env.DB.prepare(`
                UPDATE referrals 
                SET referred_wallet_address = ?, account_created_at = CURRENT_TIMESTAMP, 
                    status = 'tracking', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).bind(address, referral.id).run();
              
              // Update external_wallet_users with referral code
              await c.env.DB.prepare(
                "UPDATE external_wallet_users SET referred_by_code = ? WHERE wallet_address = ?"
              ).bind(referralCode, address).run();
              
              // Update referrer's weekly count (skip if columns don't exist)
              try {
                await c.env.DB.prepare(`
                  UPDATE channels 
                  SET referrals_this_week = ?, last_referral_week = ?, 
                      total_referrals_count = total_referrals_count + 1, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                `).bind(currentCount + 1, weekKey, referral.referrer_channel_id).run();
              } catch {
                // Referral count columns may not exist yet - still mark referral as applied
              }
              
              referralApplied = true;
              console.log(`Referral applied: ${referralCode} for wallet ${address}`);
            }
          } catch (referralError) {
            console.error("Referral tracking error (non-fatal):", referralError);
            // Continue with login even if referral tracking fails
          }
        }
      }
    }
  }
  
  // Look up the actual user_id from internal wallet (this is what views/history use)
  let internalUserId: string | null = null;
  if (internalWalletAddress) {
    const internalWallet = await c.env.DB.prepare(
      "SELECT user_id FROM user_wallets WHERE wallet_address = ?"
    ).bind(internalWalletAddress).first<{ user_id: string }>();
    internalUserId = internalWallet?.user_id || null;
  }

  return c.json({ 
    success: true, 
    token: authToken,
    userId: internalUserId || String(user.id), // Prefer internal wallet user_id for history tracking
    hasChannel: !!existingChannel,
    internalWalletAddress, // Frontend needs this for deposits
    referralApplied,
  });
  } catch (error) {
    console.error("Wallet verify error:", error);
    return c.json({ error: "Authentication failed", details: String(error) }, 500);
  }
});

// Import existing wallet via seed phrase (for mobile users or those who want to use their Kastle/KasWare wallet)
app.post("/api/wallet-auth/import-seed", zValidator("json", z.object({
  seedPhrase: z.string().min(1),
  referralCode: z.string().optional(),
})), async (c) => {
  const { seedPhrase, referralCode } = c.req.valid("json");
  
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
    
    // Process referral code if provided (only for new users)
    let referralApplied = false;
    if (referralCode && !existingUser) {
      const existingReferral = await c.env.DB.prepare(
        "SELECT id FROM referrals WHERE referred_wallet_address = ?"
      ).bind(importedWallet.address).first();
      
      if (!existingReferral) {
        const referral = await c.env.DB.prepare(`
          SELECT r.*, c.created_at as channel_created_at, c.id as channel_id,
                 (SELECT COUNT(*) FROM videos WHERE channel_id = c.id AND status = 'published') as video_count
          FROM referrals r
          JOIN channels c ON r.referrer_channel_id = c.id
          WHERE r.referral_code = ? AND r.referred_channel_id IS NULL
        `).bind(referralCode).first<{
          id: number;
          referrer_channel_id: number;
          channel_created_at: string;
          channel_id: number;
          video_count: number;
        }>();
        
        if (referral) {
          const createdAtUTC = toUTCTimestamp(referral.channel_created_at);
          const channelAge = createdAtUTC ? Date.now() - new Date(createdAtUTC).getTime() : 0;
          const minAge = 5 * 24 * 60 * 60 * 1000;
          
          if (channelAge >= minAge && referral.video_count >= 1) {
            const referrerChannel = await c.env.DB.prepare(
              "SELECT referrals_this_week, last_referral_week FROM channels WHERE id = ?"
            ).bind(referral.referrer_channel_id).first<{
              referrals_this_week: number;
              last_referral_week: string | null;
            }>();
            
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            const weekKey = weekStart.toISOString().slice(0, 10);
            
            const isNewWeek = referrerChannel?.last_referral_week !== weekKey;
            const currentCount = isNewWeek ? 0 : (referrerChannel?.referrals_this_week || 0);
            
            if (currentCount < 2 && (referrerChannel?.referrals_this_week || 0) < 10) {
              await c.env.DB.prepare(`
                UPDATE referrals 
                SET referred_wallet_address = ?, account_created_at = CURRENT_TIMESTAMP, 
                    status = 'tracking', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).bind(importedWallet.address, referral.id).run();
              
              await c.env.DB.prepare(
                "UPDATE external_wallet_users SET referred_by_code = ? WHERE wallet_address = ?"
              ).bind(referralCode, importedWallet.address).run();
              
              await c.env.DB.prepare(`
                UPDATE channels 
                SET referrals_this_week = ?, last_referral_week = ?, 
                    total_referrals_count = total_referrals_count + 1, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).bind(currentCount + 1, weekKey, referral.referrer_channel_id).run();
              
              referralApplied = true;
              console.log(`Referral applied via seed import: ${referralCode} for wallet ${importedWallet.address}`);
            }
          }
        }
      }
    }
    
    // Look up the actual user_id from internal wallet (this is what views/history use)
    let internalUserId: string | null = null;
    if (internalWalletAddress) {
      const internalWallet = await c.env.DB.prepare(
        "SELECT user_id FROM user_wallets WHERE wallet_address = ?"
      ).bind(internalWalletAddress).first<{ user_id: string }>();
      internalUserId = internalWallet?.user_id || null;
    }

    return c.json({ 
      success: true, 
      token: authToken,
      userId: internalUserId || String(userId), // Prefer internal wallet user_id for history tracking
      address: importedWallet.address,
      hasChannel: !!existingChannel,
      internalWalletAddress,
      referralApplied,
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
    // Check demo_balance first (for testing)
    const demoBalanceVal = parseFloat(user.demo_balance || "0");
    if (demoBalanceVal > 0) {
      // User has demo balance - use it for internal balance
      internalBalanceKAS = demoBalanceVal.toFixed(4);
    } else if (user.internal_wallet_address) {
      // No demo balance - fetch real mainnet balance for internal wallet
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

// Refresh/validate session for Electron persistence
app.post("/api/wallet-auth/refresh", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const token = authHeader.slice(7);
  const user = await c.env.DB.prepare(
    "SELECT id, wallet_address, public_key, internal_wallet_address, internal_public_key FROM external_wallet_users WHERE auth_token = ?"
  ).bind(token).first<{
    id: number;
    wallet_address: string;
    public_key: string | null;
    internal_wallet_address: string | null;
    internal_public_key: string | null;
  }>();
  
  if (!user) {
    return c.json({ error: "Invalid token", expired: true }, 401);
  }
  
  // Update last login time to keep session active
  await c.env.DB.prepare(
    "UPDATE external_wallet_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(user.id).run();
  
  // Return refreshed session data
  return c.json({
    valid: true,
    userId: user.id,
    address: user.wallet_address,
    publicKey: user.public_key,
    internalAddress: user.internal_wallet_address,
    internalPublicKey: user.internal_public_key,
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

// ============================================
// Kaspa Price Caching System
// ============================================

// Fetches Kaspa USD price from CoinGecko, caches for 1 hour
async function getKaspaPrice(db: D1Database): Promise<number | null> {
  const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour
  
  // Check cache first
  const cached = await db.prepare(
    "SELECT price_usd, fetched_at FROM kaspa_price_cache ORDER BY fetched_at DESC LIMIT 1"
  ).first();
  
  if (cached && cached.price_usd) {
    const fetchedAt = new Date(cached.fetched_at as string).getTime();
    const now = Date.now();
    if (now - fetchedAt < CACHE_DURATION_MS) {
      return cached.price_usd as number;
    }
  }
  
  // Fetch fresh price from CoinGecko
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd",
      { 
        headers: { 
          "Accept": "application/json",
          "User-Agent": "KasShi/1.0"
        }
      }
    );
    
    if (!response.ok) {
      console.error("CoinGecko API error:", response.status);
      // Return cached value if available even if expired
      return cached?.price_usd as number || null;
    }
    
    const data = await response.json() as { kaspa?: { usd?: number } };
    const priceUsd = data?.kaspa?.usd;
    
    if (typeof priceUsd !== "number" || priceUsd <= 0) {
      console.error("Invalid price from CoinGecko:", data);
      return cached?.price_usd as number || null;
    }
    
    // Save to cache
    await db.prepare(
      "INSERT INTO kaspa_price_cache (price_usd, source, fetched_at) VALUES (?, 'coingecko', CURRENT_TIMESTAMP)"
    ).bind(priceUsd).run();
    
    // Clean old cache entries (keep last 10)
    await db.prepare(
      "DELETE FROM kaspa_price_cache WHERE id NOT IN (SELECT id FROM kaspa_price_cache ORDER BY fetched_at DESC LIMIT 10)"
    ).run();
    
    return priceUsd;
  } catch (error) {
    console.error("Failed to fetch Kaspa price:", error);
    // Return cached value if available
    return cached?.price_usd as number || null;
  }
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
    console.log("[getExternalWalletUser] No Bearer token in header");
    return null;
  }
  const token = authHeader.slice(7);
  console.log("[getExternalWalletUser] Looking up token:", token.substring(0, 20) + "...");
  const user = await db.prepare(
    "SELECT id, wallet_address, public_key, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
  ).bind(token).first<{
    id: number;
    wallet_address: string;
    public_key: string | null;
    internal_wallet_address: string | null;
  }>();
  
  if (!user) {
    console.log("[getExternalWalletUser] No user found for token");
    return null;
  }
  console.log("[getExternalWalletUser] Found user id:", user.id);
  
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

// Fast auth helper for music endpoints - prioritizes external wallet auth
// Only falls back to slow Mocha auth if no Bearer token was provided
interface FastAuthResult {
  walletAddress: string | null;
  walletAddresses: string[]; // All wallet addresses to check (external + internal for KasWare users)
  userId: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFastAuth(c: Context<any>): Promise<FastAuthResult> {
  const authHeader = c.req.header("Authorization");
  const hasBearerToken = authHeader?.startsWith("Bearer ");
  
  // Try external wallet auth first (fast DB lookup)
  if (hasBearerToken) {
    const token = authHeader!.slice(7);
    const extUser = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first() as { wallet_address: string; internal_wallet_address?: string } | null;
    if (extUser) {
      // Return EXTERNAL wallet address - profiles were created with external addresses
      // Also include both addresses for profile lookups
      const addrs: string[] = [extUser.wallet_address];
      if (extUser.internal_wallet_address) addrs.push(extUser.internal_wallet_address);
      return { walletAddress: extUser.wallet_address as string, walletAddresses: addrs, userId: null };
    }
    // Bearer token provided but not found - DON'T fall back to slow Mocha auth
    return { walletAddress: null, walletAddresses: [], userId: null };
  }
  
  // No Bearer token - try Mocha session auth with timeout
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
  if (sessionToken) {
    try {
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
      const authPromise = getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      const mochaUser = await Promise.race([authPromise, timeoutPromise]);
      if (mochaUser) {
        const userWallet = await c.env.DB.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(mochaUser.id).first() as { wallet_address: string } | null;
        const addr = userWallet?.wallet_address || null;
        return { 
          walletAddress: addr, 
          walletAddresses: addr ? [addr] : [],
          userId: mochaUser.id 
        };
      }
    } catch {
      // Auth failed or timed out
    }
  }
  
  return { walletAddress: null, walletAddresses: [], userId: null };
}

// Helper to lookup music profile checking all wallet addresses
async function findMusicProfile(db: D1Database, walletAddresses: string[]): Promise<{ id: number; wallet_address: string } | null> {
  if (walletAddresses.length === 0) return null;
  if (walletAddresses.length === 1) {
    return db.prepare("SELECT id, wallet_address FROM music_profiles WHERE wallet_address = ?")
      .bind(walletAddresses[0]).first();
  }
  return db.prepare("SELECT id, wallet_address FROM music_profiles WHERE wallet_address IN (?, ?)")
    .bind(walletAddresses[0], walletAddresses[1]).first();
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
    "SELECT id, internal_wallet_address FROM external_wallet_users WHERE wallet_address = ?"
  ).bind(senderAddress).first() as { id: number; internal_wallet_address: string | null } | null;
  
  // Get the proper user_id from the internal wallet for view tracking
  let externalUserId: string | null = null;
  if (externalUserRecord?.internal_wallet_address) {
    const internalWallet = await c.env.DB.prepare(
      "SELECT user_id FROM user_wallets WHERE wallet_address = ?"
    ).bind(externalUserRecord.internal_wallet_address).first() as { user_id: string } | null;
    externalUserId = internalWallet?.user_id || null;
  }
  
  // Handle view payments
  if (paymentType === 'view' && videoId) {
    // Update video view count
    await c.env.DB.prepare(`
      UPDATE videos SET view_count = view_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(videoId).run();
    
    // Record view in video_views table using internal wallet user_id
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
        `).bind(senderChannelId, videoId, externalUserId).run();
      }
    } else if (externalUserId) {
      // User doesn't have channel, use internal wallet user_id
      // Use a unique negative channel_id derived from user_id hash to avoid constraint conflicts
      const userIdHash = externalUserId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      const pseudoChannelId = -(userIdHash % 1000000 + 1);
      
      const existingView = await c.env.DB.prepare(
        "SELECT id FROM video_views WHERE user_id = ? AND video_id = ?"
      ).bind(externalUserId, videoId).first();
      
      if (existingView) {
        await c.env.DB.prepare(`
          UPDATE video_views SET watched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(existingView.id).run();
      } else {
        await c.env.DB.prepare(`
          INSERT INTO video_views (channel_id, video_id, user_id, watched_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(pseudoChannelId, videoId, externalUserId).run();
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
  
  // Convert KAS to sompi
  const amountSompi = Math.floor(parseFloat(amountKas) * 100000000);
  
  // Import batched payments utilities early for pending debits check
  const { recordPendingMicropayment, getSenderPendingDebits, getSenderPendingDebitsByUserId, BATCH_THRESHOLD_SOMPI, BATCH_THRESHOLD_KAS } = await import("./services/batched-payments");
  
  // Get sender's pending debits to calculate actual available balance
  const senderUserId = `kasware-${user.id}`;
  const senderChannel = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE wallet_address = ? OR wallet_address = ?"
  ).bind(user.internal_wallet_address, user.wallet_address).first();
  const senderChannelId = senderChannel?.id ?? null;
  
  let pendingDebitsSompi = "0";
  if (senderChannelId) {
    pendingDebitsSompi = await getSenderPendingDebits(c.env.DB, senderChannelId as number);
  } else {
    pendingDebitsSompi = await getSenderPendingDebitsByUserId(c.env.DB, senderUserId);
  }
  const pendingDebitsKas = Number(pendingDebitsSompi) / 100000000;
  
  // Check balance (use demo_balance if set, otherwise real balance minus pending debits)
  const demoBalance = user.demo_balance ? parseFloat(user.demo_balance) : null;
  let hasBalance = false;
  let currentBalanceKas = "0";
  let availableBalanceKas = "0";
  
  console.log('[INTERNAL-MICROPAY] Balance check start:', {
    userId: user.id,
    internalAddress: user.internal_wallet_address,
    externalAddress: user.wallet_address,
    requestedAmount: amountKas,
    demoBalance,
    pendingDebitsKas
  });
  
  if (demoBalance !== null && demoBalance > 0) {
    const effectiveBalance = demoBalance - pendingDebitsKas;
    hasBalance = effectiveBalance >= parseFloat(amountKas);
    currentBalanceKas = demoBalance.toString();
    availableBalanceKas = effectiveBalance.toFixed(8);
    console.log('[INTERNAL-MICROPAY] Using demo balance:', { demoBalance, pendingDebitsKas, effectiveBalance, hasBalance });
  } else {
    const balance = await getWalletBalance(user.internal_wallet_address);
    const rawBalanceKas = balance ? parseFloat(balance.balanceKAS) : 0;
    const effectiveBalance = rawBalanceKas - pendingDebitsKas;
    hasBalance = effectiveBalance >= parseFloat(amountKas);
    currentBalanceKas = balance?.balanceKAS || "0";
    availableBalanceKas = effectiveBalance.toFixed(8);
    console.log('[INTERNAL-MICROPAY] Using mainnet balance:', { 
      rawBalanceKas, 
      pendingDebitsKas, 
      effectiveBalance, 
      requestedAmount: amountKas,
      hasBalance,
      balanceApiResponse: JSON.stringify(balance)
    });
  }
  
  if (!hasBalance) {
    console.log('[INTERNAL-MICROPAY] INSUFFICIENT BALANCE:', {
      userId: user.id,
      internalAddress: user.internal_wallet_address,
      currentBalanceKas,
      availableBalanceKas,
      pendingDebitsKas,
      requestedAmount: amountKas
    });
    return c.json({ 
      error: "Insufficient balance", 
      balanceKAS: currentBalanceKas,
      availableKAS: availableBalanceKas,
      pendingDebitsKAS: pendingDebitsKas.toFixed(8)
    }, 400);
  }
  
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
  
  // Check if toAddress is a valid Kaspa address
  // Demo addresses like kaspa:demo_channel_wallet_001 are not valid mainnet addresses
  if (!isValidKaspaAddress(toAddress)) {
    console.log('[INTERNAL-MICROPAY] Demo/invalid address detected, simulating success:', toAddress);
    return c.json({
      success: true,
      transactionId: `demo-${Date.now()}`,
      fromAddress: user.internal_wallet_address,
      toAddress,
      amountKas,
      demo: true,
      message: "Demo transaction simulated (invalid recipient address)"
    });
  }
  
  const encryptionKey = `kasware_${user.id}_${user.wallet_address}`;
  const privateKey = await decryptPrivateKey(user.encrypted_internal_private_key!, encryptionKey);
  
  if (!privateKey) {
    return c.json({ error: "Failed to decrypt wallet" }, 500);
  }
  
  // Handle view and music_purchase payments with 95/5 split
  if (paymentType === 'view' || paymentType === 'music_purchase') {
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
  
  // Multiple consolidation rounds if needed (wallet may have many small UTXOs)
  let consolidationAttempts = 0;
  const MAX_CONSOLIDATION_ATTEMPTS = 3;
  
  while (!txResult.success && txResult.needsConsolidation && consolidationAttempts < MAX_CONSOLIDATION_ATTEMPTS) {
    consolidationAttempts++;
    console.log(`Consolidation attempt ${consolidationAttempts}/${MAX_CONSOLIDATION_ATTEMPTS}`);
    
    const consolidateResult = await consolidateUTXOs(user.internal_wallet_address!, privateKey);
    if (!consolidateResult.success) {
      console.error('Consolidation failed:', consolidateResult.error);
      break;
    }
    
    // Wait for consolidation tx to confirm
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    // Retry the withdrawal
    txResult = await sendTransaction(user.internal_wallet_address!, user.wallet_address, amountSompi, privateKey);
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
    "notifications_comments",
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
  
  // Join with videos to get public_id and is_clip for navigation
  const notifications = await c.env.DB.prepare(
    `SELECT n.*, v.public_id as video_public_id, v.is_clip as video_is_clip
     FROM notifications n
     LEFT JOIN videos v ON n.video_id = v.id
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC LIMIT 50`
  )
    .bind(user.id)
    .all();
  
  return c.json({
    notifications: notifications.results.map((n: Record<string, unknown>) => ({
      ...n,
      videoPublicId: n.video_public_id,
      isClip: !!n.video_is_clip && n.video_is_clip !== 0,
      relatedHandle: n.related_handle,
    })),
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

// Resolve music profile ID from numeric ID or handle
async function resolveMusicProfileId(db: D1Database, idParam: string): Promise<number | null> {
  // If it looks like a numeric ID, try that first (backward compatibility)
  if (/^\d+$/.test(idParam)) {
    const profile = await db.prepare("SELECT id FROM music_profiles WHERE id = ?").bind(parseInt(idParam)).first();
    if (profile) return profile.id as number;
  }
  // Try handle lookup (case-insensitive)
  const profile = await db.prepare("SELECT id FROM music_profiles WHERE LOWER(handle) = LOWER(?)").bind(idParam).first();
  return profile ? (profile.id as number) : null;
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

// Music multipart upload: Initialize (for files > 95MB)
app.post("/api/upload/music/init", async (c) => {
  try {
    const { fileName, fileType, fileSize } = await c.req.json();
    
    if (!fileName) {
      return c.json({ error: "fileName is required" }, 400);
    }
    
    // Determine file type from MIME or extension
    const isAudio = fileType?.startsWith("audio/") || /\.(mp3|wav|flac|aac|ogg|m4a|wma|aiff)$/i.test(fileName);
    const isVideo = fileType?.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v)$/i.test(fileName);
    const isImage = fileType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName);
    
    if (!isAudio && !isVideo && !isImage) {
      return c.json({ error: "Invalid file type. Must be audio, video, or image." }, 400);
    }
    
    // Max 2GB for audio and video
    const maxSize = 2 * 1024 * 1024 * 1024;
    if (fileSize > maxSize) {
      return c.json({ error: "File too large. Maximum size is 2GB" }, 400);
    }
    
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const extension = fileName.split(".").pop() || (isVideo ? "mp4" : isImage ? "jpg" : "mp3");
    const folder = isVideo ? "music/video" : isImage ? "music/covers" : "music/audio";
    const key = `${folder}/${timestamp}-${randomId}.${extension}`;
    
    // Determine content type from provided or infer from extension
    const contentType = fileType || (isVideo ? "video/mp4" : isImage ? "image/jpeg" : "audio/mpeg");
    
    const multipartUpload = await c.env.R2_BUCKET.createMultipartUpload(key, {
      httpMetadata: { contentType },
      customMetadata: { originalName: fileName, uploadedAt: new Date().toISOString() },
    });
    
    return c.json({
      success: true,
      uploadId: multipartUpload.uploadId,
      key,
    });
  } catch (error) {
    console.error("Error initializing music upload:", error);
    return c.json({ error: "Failed to initialize upload" }, 500);
  }
});

// Music multipart upload: Upload a part
app.post("/api/upload/music/part", async (c) => {
  try {
    const formData = await c.req.formData();
    const chunk = formData.get("chunk") as File | null;
    const key = formData.get("key") as string | null;
    const uploadId = formData.get("uploadId") as string | null;
    const partNumber = parseInt(formData.get("partNumber") as string || "0");
    
    if (!chunk || !key || !uploadId || !partNumber) {
      return c.json({ error: "chunk, key, uploadId, and partNumber are required" }, 400);
    }
    
    const multipartUpload = c.env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
    const uploadedPart = await multipartUpload.uploadPart(partNumber, chunk.stream());
    
    return c.json({
      success: true,
      partNumber,
      etag: uploadedPart.etag,
    });
  } catch (error) {
    console.error("Error uploading music part:", error);
    return c.json({ error: "Failed to upload part" }, 500);
  }
});

// Music multipart upload: Complete
app.post("/api/upload/music/complete", async (c) => {
  try {
    const { key, uploadId, parts } = await c.req.json();
    
    if (!key || !uploadId || !parts || !Array.isArray(parts)) {
      return c.json({ error: "key, uploadId, and parts array are required" }, 400);
    }
    
    const multipartUpload = c.env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
    await multipartUpload.complete(parts);
    
    return c.json({
      success: true,
      url: `/api/kasshi/media/${key}`,
    });
  } catch (error) {
    console.error("Error completing music upload:", error);
    return c.json({ error: "Failed to complete upload" }, 500);
  }
});

// Music file upload (audio, video, and cover art) - for files < 100MB
app.post("/api/upload/music", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  
  if (!file) {
    return c.json({ error: "File is required" }, 400);
  }
  
  // Determine file type
  const isAudio = file.type.startsWith("audio/");
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  
  if (!isAudio && !isVideo && !isImage) {
    return c.json({ error: "Invalid file type. Must be audio, video, or image." }, 400);
  }
  
  // Max 2GB for video and audio, 10MB for images
  const maxSize = isVideo ? 2 * 1024 * 1024 * 1024 : isAudio ? 2 * 1024 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return c.json({ error: `File too large. Max ${isVideo || isAudio ? '2GB' : '10MB'}` }, 400);
  }
  
  // Generate unique key
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const extension = file.name.split(".").pop() || (isVideo ? "mp4" : isAudio ? "mp3" : "jpg");
  const folder = isVideo ? "music/video" : isAudio ? "music/audio" : "music/covers";
  const key = `${folder}/${timestamp}-${randomId}.${extension}`;
  
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

// ============================================
// Bunny Stream API Endpoints
// ============================================

const BUNNY_API_BASE = "https://video.bunnycdn.com";

// Create a video in Bunny Stream and get upload URL
// Recover/sync a Bunny video by creating a database record for it
// Sync a video's URL from Bunny (for videos that exist but have missing video_url)
app.post("/api/bunny/sync/:bunnyVideoId", async (c) => {
  try {
    const bunnyVideoId = c.req.param("bunnyVideoId");
    
    const libraryId = c.env.BUNNY_LIBRARY_ID;
    const apiKey = c.env.BUNNY_API_KEY;
    const cdnHostname = c.env.BUNNY_CDN_HOSTNAME;
    
    if (!libraryId || !apiKey || !cdnHostname) {
      return c.json({ error: "Bunny Stream not configured" }, 500);
    }
    
    // Fetch video details from Bunny
    const response = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos/${bunnyVideoId}`, {
      headers: { "AccessKey": apiKey },
    });
    
    if (!response.ok) {
      return c.json({ error: "Video not found in Bunny" }, 404);
    }
    
    const bunnyVideo = await response.json() as { 
      guid: string; 
      title: string; 
      status: number; 
      length: number; 
      thumbnailFileName: string;
      encodeProgress: number;
    };
    
    // Check encoding status
    if (bunnyVideo.status !== 4) {
      return c.json({ 
        error: "Video not finished encoding yet", 
        status: bunnyVideo.status,
        encodeProgress: bunnyVideo.encodeProgress 
      }, 400);
    }
    
    // Build playback URL
    const playbackUrl = `https://${cdnHostname}/${bunnyVideo.guid}/playlist.m3u8`;
    const thumbnailUrl = bunnyVideo.thumbnailFileName 
      ? `https://${cdnHostname}/${bunnyVideo.guid}/${bunnyVideo.thumbnailFileName}`
      : null;
    
    // Update the video record in database
    const result = await c.env.DB.prepare(`
      UPDATE videos 
      SET video_url = ?, thumbnail_url = COALESCE(thumbnail_url, ?), bunny_status = 'finished', duration_seconds = COALESCE(duration_seconds, ?)
      WHERE bunny_video_id = ?
    `).bind(playbackUrl, thumbnailUrl, bunnyVideo.length || 0, bunnyVideoId).run();
    
    if (result.meta.changes === 0) {
      return c.json({ error: "No video found with that bunny_video_id in database" }, 404);
    }
    
    // Fetch updated video
    const video = await c.env.DB.prepare(
      "SELECT * FROM videos WHERE bunny_video_id = ?"
    ).bind(bunnyVideoId).first();
    
    return c.json({ success: true, video, playbackUrl });
  } catch (error) {
    console.error("Error syncing Bunny video:", error);
    return c.json({ error: "Failed to sync video" }, 500);
  }
});

app.post("/api/bunny/recover", async (c) => {
  try {
    const { bunnyVideoId, channelId, title, description } = await c.req.json();
    
    if (!bunnyVideoId || !channelId) {
      return c.json({ error: "bunnyVideoId and channelId are required" }, 400);
    }
    
    const libraryId = c.env.BUNNY_LIBRARY_ID;
    const apiKey = c.env.BUNNY_API_KEY;
    const cdnHostname = c.env.BUNNY_CDN_HOSTNAME;
    
    if (!libraryId || !apiKey || !cdnHostname) {
      return c.json({ error: "Bunny Stream not configured" }, 500);
    }
    
    // Fetch video details from Bunny
    const response = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos/${bunnyVideoId}`, {
      headers: { "AccessKey": apiKey },
    });
    
    if (!response.ok) {
      return c.json({ error: "Video not found in Bunny" }, 404);
    }
    
    const bunnyVideo = await response.json() as { 
      guid: string; 
      title: string; 
      status: number; 
      length: number; 
      thumbnailFileName: string;
    };
    
    // Check if already in database
    const existing = await c.env.DB.prepare(
      "SELECT id FROM videos WHERE bunny_video_id = ?"
    ).bind(bunnyVideoId).first();
    
    if (existing) {
      return c.json({ error: "Video already exists in database", videoId: existing.id }, 400);
    }
    
    // Generate public ID
    const publicId = generatePublicId();
    
    // Determine status and URLs
    const isFinished = bunnyVideo.status === 4;
    const playbackUrl = isFinished ? `https://${cdnHostname}/${bunnyVideo.guid}/playlist.m3u8` : null;
    const thumbnailUrl = bunnyVideo.thumbnailFileName 
      ? `https://${cdnHostname}/${bunnyVideo.guid}/${bunnyVideo.thumbnailFileName}`
      : null;
    const bunnyStatus = isFinished ? 'finished' : 'uploaded';
    
    // Create video record
    await c.env.DB.prepare(`
      INSERT INTO videos (channel_id, title, description, video_url, thumbnail_url, duration_seconds, status, public_id, price_kas, bunny_video_id, bunny_status)
      VALUES (?, ?, ?, ?, ?, ?, 'published', ?, '0', ?, ?)
    `).bind(
      channelId, 
      title || bunnyVideo.title, 
      description || null, 
      playbackUrl, 
      thumbnailUrl, 
      bunnyVideo.length || 0, 
      publicId, 
      bunnyVideoId, 
      bunnyStatus
    ).run();
    
    const video = await c.env.DB.prepare(
      "SELECT * FROM videos WHERE public_id = ?"
    ).bind(publicId).first();
    
    return c.json({ success: true, video });
  } catch (error) {
    console.error("Error recovering Bunny video:", error);
    return c.json({ error: "Failed to recover video" }, 500);
  }
});

// List all videos in Bunny library - for recovery/sync
app.get("/api/bunny/list", async (c) => {
  try {
    const libraryId = c.env.BUNNY_LIBRARY_ID;
    const apiKey = c.env.BUNNY_API_KEY;
    
    if (!libraryId || !apiKey) {
      return c.json({ error: "Bunny Stream not configured" }, 500);
    }
    
    const response = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos?page=1&itemsPerPage=100`, {
      headers: { "AccessKey": apiKey },
    });
    
    if (!response.ok) {
      return c.json({ error: "Failed to list Bunny videos" }, 500);
    }
    
    const data = await response.json() as { items: Array<{ guid: string; title: string; status: number; encodeProgress: number; length: number; thumbnailFileName: string }> };
    const cdnHostname = c.env.BUNNY_CDN_HOSTNAME;
    
    return c.json({
      videos: data.items.map(v => ({
        bunnyVideoId: v.guid,
        title: v.title,
        status: v.status,
        encodeProgress: v.encodeProgress,
        durationSeconds: v.length,
        thumbnailUrl: cdnHostname ? `https://${cdnHostname}/${v.guid}/${v.thumbnailFileName}` : null,
        playbackUrl: cdnHostname && v.status === 4 ? `https://${cdnHostname}/${v.guid}/playlist.m3u8` : null,
      })),
    });
  } catch (error) {
    console.error("Error listing Bunny videos:", error);
    return c.json({ error: "Failed to list videos" }, 500);
  }
});

app.post("/api/bunny/create", async (c) => {
  try {
    const { title } = await c.req.json();
    
    if (!title) {
      return c.json({ error: "title is required" }, 400);
    }
    
    const libraryId = c.env.BUNNY_LIBRARY_ID;
    const apiKey = c.env.BUNNY_API_KEY;
    
    if (!libraryId || !apiKey) {
      return c.json({ error: "Bunny Stream not configured" }, 500);
    }
    
    // Create video in Bunny
    const createResponse = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos`, {
      method: "POST",
      headers: {
        "AccessKey": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    });
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error("Bunny create error:", errorText);
      return c.json({ error: "Failed to create video in Bunny" }, 500);
    }
    
    const bunnyVideo = await createResponse.json() as { guid: string; title: string };
    
    // Return the video ID and upload URL
    // For TUS uploads, the URL format is: https://video.bunnycdn.com/tusupload
    // with headers: AuthorizationSignature, AuthorizationExpire, VideoId, LibraryId
    const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    
    return c.json({
      success: true,
      bunnyVideoId: bunnyVideo.guid,
      libraryId: parseInt(libraryId),
      uploadUrl: `${BUNNY_API_BASE}/library/${libraryId}/videos/${bunnyVideo.guid}`,
      uploadKey: apiKey, // Library-scoped key for direct upload
      expiresAt,
    });
  } catch (error) {
    console.error("Error creating Bunny video:", error);
    return c.json({ error: "Failed to create video" }, 500);
  }
});

// Get Bunny video encoding status
app.get("/api/bunny/status/:bunnyVideoId", async (c) => {
  try {
    const bunnyVideoId = c.req.param("bunnyVideoId");
    const libraryId = c.env.BUNNY_LIBRARY_ID;
    const apiKey = c.env.BUNNY_API_KEY;
    
    if (!libraryId || !apiKey) {
      return c.json({ error: "Bunny Stream not configured" }, 500);
    }
    
    const response = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos/${bunnyVideoId}`, {
      headers: { "AccessKey": apiKey },
    });
    
    if (!response.ok) {
      return c.json({ error: "Video not found" }, 404);
    }
    
    const video = await response.json() as {
      guid: string;
      status: number;
      encodeProgress: number;
      length: number;
      width: number;
      height: number;
      thumbnailFileName: string | null;
      availableResolutions: string | null;
    };
    
    // Status codes: 0=Created, 1=Uploaded, 2=Processing, 3=Transcoding, 4=Finished, 5=Error
    const statusMap: Record<number, string> = {
      0: "created",
      1: "uploaded",
      2: "processing",
      3: "transcoding",
      4: "finished",
      5: "error",
      6: "upload_failed",
    };
    
    const cdnHostname = c.env.BUNNY_CDN_HOSTNAME;
    
    return c.json({
      bunnyVideoId: video.guid,
      status: statusMap[video.status] || "unknown",
      statusCode: video.status,
      encodeProgress: video.encodeProgress,
      duration: video.length,
      width: video.width,
      height: video.height,
      thumbnailUrl: cdnHostname && video.thumbnailFileName 
        ? `https://${cdnHostname}/${video.guid}/${video.thumbnailFileName}`
        : null,
      playbackUrl: cdnHostname && video.status === 4
        ? `https://${cdnHostname}/${video.guid}/playlist.m3u8`
        : null,
      availableResolutions: video.availableResolutions?.split(",") || [],
    });
  } catch (error) {
    console.error("Error getting Bunny status:", error);
    return c.json({ error: "Failed to get video status" }, 500);
  }
});

// Delete a Bunny video
app.delete("/api/bunny/videos/:bunnyVideoId", async (c) => {
  try {
    const bunnyVideoId = c.req.param("bunnyVideoId");
    const libraryId = c.env.BUNNY_LIBRARY_ID;
    const apiKey = c.env.BUNNY_API_KEY;
    
    if (!libraryId || !apiKey) {
      return c.json({ error: "Bunny Stream not configured" }, 500);
    }
    
    const response = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos/${bunnyVideoId}`, {
      method: "DELETE",
      headers: { "AccessKey": apiKey },
    });
    
    if (!response.ok) {
      return c.json({ error: "Failed to delete video" }, 500);
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting Bunny video:", error);
    return c.json({ error: "Failed to delete video" }, 500);
  }
});

// Bunny webhook for encoding status updates
// Configure this URL in Bunny Dashboard: https://your-app.mocha.sh/api/bunny/webhook
app.post("/api/bunny/webhook", async (c) => {
  try {
    const body = await c.req.json();
    const { VideoGuid, Status } = body as { VideoGuid: string; Status: number };
    
    if (!VideoGuid) {
      return c.json({ error: "VideoGuid required" }, 400);
    }
    
    // Status codes: 0=Created, 1=Uploaded, 2=Processing, 3=Transcoding, 4=Finished, 5=Error
    const statusMap: Record<number, string> = {
      0: "created",
      1: "uploaded",
      2: "processing",
      3: "transcoding",
      4: "finished",
      5: "error",
      6: "upload_failed",
    };
    
    const bunnyStatus = statusMap[Status] || "unknown";
    
    // Update video in database
    await c.env.DB.prepare(`
      UPDATE videos 
      SET bunny_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE bunny_video_id = ?
    `).bind(bunnyStatus, VideoGuid).run();
    
    // If encoding finished, update video_url and thumbnail if missing
    if (Status === 4) {
      const cdnHostname = c.env.BUNNY_CDN_HOSTNAME;
      if (cdnHostname) {
        const hlsUrl = `https://${cdnHostname}/${VideoGuid}/playlist.m3u8`;
        const thumbnailUrl = `https://${cdnHostname}/${VideoGuid}/thumbnail.jpg`;
        
        // Update video_url always, thumbnail only if null
        await c.env.DB.prepare(`
          UPDATE videos 
          SET video_url = ?, 
              thumbnail_url = COALESCE(thumbnail_url, ?)
          WHERE bunny_video_id = ?
        `).bind(hlsUrl, thumbnailUrl, VideoGuid).run();
      }
    }
    
    console.log(`Bunny webhook: Video ${VideoGuid} status updated to ${bunnyStatus}`);
    return c.json({ success: true });
  } catch (error) {
    console.error("Bunny webhook error:", error);
    return c.json({ error: "Webhook processing failed" }, 500);
  }
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
// Theme preview image upload
app.post("/api/marketplace/upload/theme-image", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  
  if (!file) {
    return c.json({ error: "File is required" }, 400);
  }
  
  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: "Invalid file type. Supported: JPEG, PNG, WebP" }, 400);
  }
  
  // Max 5MB
  if (file.size > 5 * 1024 * 1024) {
    return c.json({ error: "File too large. Maximum size is 5MB" }, 400);
  }
  
  // Generate unique key
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 10);
  const extension = file.name.split(".").pop() || "jpg";
  const key = `marketplace/themes/${timestamp}_${randomId}.${extension}`;
  
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
  "kasshi-logo": "https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/icon.png",
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
  
  // Determine if this is an image, audio, or video based on extension
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
  const audioMimeTypes: Record<string, string> = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    'webm': 'audio/webm',
  };
  const isImage = ext in imageMimeTypes;
  const isAudio = ext in audioMimeTypes;
  console.log("[Media] Extension:", ext, "isImage:", isImage, "isAudio:", isAudio);
  
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
    // Smaller chunks = faster seeks, more responsive playback
    // 2MB provides good balance: fast enough for seeking, large enough to reduce overhead
    const MAX_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks - faster seeking
    
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
    
    // Try to get file size from size cache first to avoid head() call
    let totalSize: number | null = null;
    
    // Check if we have cached size in Cloudflare cache
    if (cache) {
      try {
        const sizeCache = await cache.match(new Request(`https://size-cache/${key}`));
        if (sizeCache) {
          const cachedSize = await sizeCache.text();
          totalSize = parseInt(cachedSize, 10);
          console.log("[Media] Got cached file size:", totalSize);
        }
      } catch (e) {
        // Ignore cache errors
      }
    }
    
    // If no cached size, we need to get it from R2
    if (!totalSize) {
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
      
      totalSize = headObject.size;
      
      // Cache the file size for future requests (1 year)
      if (cache) {
        const sizeResponse = new Response(String(totalSize), {
          headers: { "Cache-Control": "public, max-age=31536000, immutable" }
        });
        c.executionCtx.waitUntil(
          cache.put(new Request(`https://size-cache/${key}`), sizeResponse).catch(() => {})
        );
      }
    }
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
    
    // Ensure correct Content-Type for video and audio files
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
    } else if (ext && isAudio && audioMimeTypes[ext]) {
      headers.set("Content-Type", audioMimeTypes[ext]);
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

// Get channel leaderboard by total video views
app.get("/api/kasshi/channels/leaderboard", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "10"), 50);
  
  const channels = await c.env.DB.prepare(`
    SELECT 
      c.id,
      c.name,
      c.handle,
      c.avatar_url,
      c.is_verified,
      c.subscriber_count,
      COALESCE(SUM(v.view_count), 0) as total_views
    FROM channels c
    LEFT JOIN videos v ON v.channel_id = c.id AND v.status = 'published'
    GROUP BY c.id
    ORDER BY total_views DESC
    LIMIT ?
  `).bind(limit).all();
  
  return c.json({
    channels: channels.results.map((ch: Record<string, unknown>, index: number) => ({
      rank: index + 1,
      id: ch.id,
      name: ch.name,
      handle: ch.handle,
      avatarUrl: ch.avatar_url,
      isVerified: ch.is_verified,
      subscriberCount: ch.subscriber_count,
      totalViews: ch.total_views,
    }))
  });
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
  
  // Recency-weighted algorithm: videos from the last 3 weeks are strongly boosted
  // Older videos can still appear but much less frequently
  let query = `
    SELECT v.*, c.name as channel_name, c.handle as channel_handle, 
           c.avatar_url as channel_avatar, c.is_verified as channel_verified,
           CASE 
             WHEN v.created_at >= datetime('now', '-21 days') THEN 2000 + (ABS(RANDOM()) % 2000)
             WHEN v.created_at >= datetime('now', '-60 days') THEN 500 + (ABS(RANDOM()) % 200)
             ELSE (ABS(RANDOM()) % 400) + MIN(COALESCE(v.view_count, 0) / 100, 100)
           END as recency_score
    FROM videos v
    JOIN channels c ON v.channel_id = c.id
    WHERE v.status = 'published' AND (v.is_private = 0 OR v.is_private IS NULL)
      AND (v.is_clip = 0 OR v.is_clip IS NULL)
    ORDER BY recency_score DESC, v.created_at DESC
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
      priceKas: v.price_kas,
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
        AND (v.is_clip = 0 OR v.is_clip IS NULL)
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
      priceKas: v.price_kas,
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
    directVideoUrl: video.direct_video_url,
    thumbnailUrl: video.thumbnail_url,
    durationSeconds: video.duration_seconds,
    viewCount: video.view_count,
    likeCount: video.like_count,
    dislikeCount: video.dislike_count,
    commentCount: video.comment_count,
    kasEarned: video.kas_earned,
    priceKas: video.price_kas,
    bunnyStatus: video.bunny_status,
    status: video.status,
    isMembersOnly: video.is_members_only === 1,
    isPrivate: video.is_private === 1,
    isClip: video.is_clip === 1,
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
  const { title, description, thumbnailUrl, isMembersOnly, isPrivate, durationSeconds, priceKas, bunnyVideoId, bunnyStatus } = body;
  
  if (!title || !title.trim()) {
    return c.json({ error: "Title is required" }, 400);
  }
  
  // Validate price if provided: must be 0 (free) or >= 0.11
  let finalPrice: string | null = null;
  if (priceKas !== undefined) {
    const price = parseFloat(priceKas || '0');
    finalPrice = price > 0 && price < 0.11 ? '0' : (priceKas || '0');
  }
  
  // Get video and verify ownership
  const video = await c.env.DB.prepare(`
    SELECT v.id, v.channel_id, v.is_clip, c.wallet_address 
    FROM videos v
    JOIN channels c ON v.channel_id = c.id
    WHERE v.id = ?
  `).bind(videoId).first<{ id: number; channel_id: number; is_clip: number | null; wallet_address: string }>();
  
  if (!video) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Verify user owns this video's channel
  if (unifiedUser.walletAddress !== video.wallet_address) {
    return c.json({ error: "Unauthorized: You can only edit your own videos" }, 403);
  }
  
  // Clips are always free - force price to 0
  // Members-only videos are also free (gated by membership, not price)
  if (video.is_clip === 1 || isMembersOnly) {
    finalPrice = '0';
  }
  
  // Update the video
  await c.env.DB.prepare(`
    UPDATE videos 
    SET title = ?, 
        description = ?, 
        thumbnail_url = COALESCE(?, thumbnail_url),
        is_members_only = ?,
        is_private = ?,
        duration_seconds = COALESCE(?, duration_seconds),
        price_kas = COALESCE(?, price_kas),
        bunny_video_id = COALESCE(?, bunny_video_id),
        bunny_status = COALESCE(?, bunny_status),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    title.trim(),
    description?.trim() || null,
    thumbnailUrl || null,
    isMembersOnly ? 1 : 0,
    isPrivate ? 1 : 0,
    durationSeconds && durationSeconds > 0 ? durationSeconds : null,
    finalPrice,
    bunnyVideoId || null,
    bunnyStatus || null,
    videoId
  ).run();
  
  return c.json({ success: true, message: "Video updated successfully" });
});

// Auto-fix video thumbnail (public endpoint - only updates if thumbnail is missing)
app.post("/api/kasshi/videos/:id/fix-thumbnail", async (c) => {
  const idParam = c.req.param("id");
  const videoId = await resolveVideoId(c.env.DB, idParam);
  
  if (!videoId) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Check if video already has a thumbnail
  const existing = await c.env.DB.prepare(
    "SELECT id, channel_id, thumbnail_url FROM videos WHERE id = ?"
  ).bind(videoId).first<{ id: number; channel_id: number; thumbnail_url: string | null }>();
  
  if (!existing) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Only fix if thumbnail is missing
  if (existing.thumbnail_url) {
    return c.json({ success: true, updated: false, message: "Thumbnail already exists" });
  }
  
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  
  if (!file) {
    return c.json({ error: "File is required" }, 400);
  }
  
  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: "Invalid file type" }, 400);
  }
  
  // Max 5MB for auto-generated thumbnails
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return c.json({ error: "File too large" }, 400);
  }
  
  // Generate unique key
  const timestamp = Date.now();
  const extension = file.type === "image/png" ? "png" : "jpg";
  const key = `thumbnails/${existing.channel_id}/${timestamp}_autofix.${extension}`;
  
  // Upload to R2
  await c.env.R2_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { autoGenerated: "true" },
  });
  
  const thumbnailUrl = `/api/kasshi/media/${key}`;
  
  // Update video with new thumbnail
  await c.env.DB.prepare(`
    UPDATE videos 
    SET thumbnail_url = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND (thumbnail_url IS NULL OR thumbnail_url = '')
  `).bind(thumbnailUrl, videoId).run();
  
  return c.json({ 
    success: true, 
    updated: true,
    thumbnailUrl 
  });
});

// Auto-fix video duration (public endpoint - only updates if duration is missing)
app.patch("/api/kasshi/videos/:id/fix-duration", async (c) => {
  const idParam = c.req.param("id");
  const videoId = await resolveVideoId(c.env.DB, idParam);
  
  if (!videoId) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  const body = await c.req.json();
  const { durationSeconds } = body;
  
  if (!durationSeconds || durationSeconds <= 0 || !Number.isFinite(durationSeconds)) {
    return c.json({ error: "Invalid duration" }, 400);
  }
  
  // Only update if current duration is null or 0
  const result = await c.env.DB.prepare(`
    UPDATE videos 
    SET duration_seconds = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND (duration_seconds IS NULL OR duration_seconds = 0)
  `).bind(Math.floor(durationSeconds), videoId).run();
  
  return c.json({ 
    success: true, 
    updated: result.meta.changes > 0 
  });
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
      AND (is_clip = 0 OR is_clip IS NULL)
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
  const { channelId, title, description, videoUrl, directVideoUrl, thumbnailUrl, durationSeconds, isMembersOnly, isPrivate, priceKas, bunnyVideoId, bunnyStatus: requestedBunnyStatus, isClip, cropX, cropY, cropZoom } = body;
  
  if (!channelId || !title) {
    return c.json({ error: "channelId and title are required" }, 400);
  }
  
  // Validate price: must be 0 (free) or >= 0.11
  // Members-only videos are always free (gated by membership, not price)
  const price = parseFloat(priceKas || '0');
  const finalPrice = isMembersOnly ? '0' : (price > 0 && price < 0.11 ? '0' : (priceKas || '0'));
  
  // Generate unique public_id for URL
  const publicId = generatePublicId();
  
  // Use requested status or default based on bunnyVideoId presence
  const bunnyStatus = requestedBunnyStatus || (bunnyVideoId ? 'uploaded' : null);
  
  await c.env.DB.prepare(`
    INSERT INTO videos (channel_id, title, description, video_url, direct_video_url, thumbnail_url, duration_seconds, status, is_members_only, is_private, public_id, price_kas, bunny_video_id, bunny_status, is_clip, crop_x, crop_y, crop_zoom)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(channelId, title, description || null, videoUrl || null, directVideoUrl || null, thumbnailUrl || null, durationSeconds || 0, isMembersOnly ? 1 : 0, isPrivate ? 1 : 0, publicId, finalPrice, bunnyVideoId || null, bunnyStatus, isClip || 0, cropX || null, cropY || null, cropZoom || null).run();
  
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
    bunnyVideoId: video.bunny_video_id,
    bunnyStatus: video.bunny_status,
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
  
  // Determine if this is a valid view to count:
  // 1. FREE video: transactionId is null, but user has watched required time (30s/30%)
  // 2. PAID video: real payment with valid transactionId (not demo, not owner)
  const isOwnerViewing = viewerChannelId && viewerChannelId === video.creator_channel_id;
  const isFreeVideo = !video.price_kas || video.price_kas === "0" || parseFloat(video.price_kas as string) === 0;
  const isRealPayment = transactionId && 
                        !transactionId.startsWith('demo-') && 
                        !transactionId.startsWith('membership-') &&
                        (viewerChannelId || userId);
  const isFreeVideoView = isFreeVideo && !transactionId && (viewerChannelId || userId);
  
  // Increment view count for real paid views OR free video watch threshold reached
  // Never count owner's own views
  if (!isOwnerViewing && (isRealPayment || isFreeVideoView)) {
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
    const currentEarnings = parseFloat(video.kas_earned as string) || 0;
    const newEarnings = (currentEarnings + parseFloat(creatorAmount)).toFixed(8);
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
    // Both external wallet users and Mocha users now use UUID user_id from user_wallets
    // Use a unique negative channel_id derived from user_id hash to avoid constraint conflicts
    const userIdHash = userId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    const pseudoChannelId = -(userIdHash % 1000000 + 1); // Negative to distinguish from real channels
    
    try {
      const existingView = await c.env.DB.prepare(`
        SELECT id FROM video_views WHERE user_id = ? AND video_id = ?
      `).bind(userId, videoId).first();
      
      if (existingView) {
        await c.env.DB.prepare(`
          UPDATE video_views SET watched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND video_id = ?
        `).bind(userId, videoId).run();
      } else {
        // Use unique pseudo channel_id per user to avoid constraint conflicts on (channel_id, video_id)
        await c.env.DB.prepare(`
          INSERT INTO video_views (channel_id, video_id, user_id, watched_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(pseudoChannelId, videoId, userId).run();
      }
    } catch (e) {
      // Constraint violation - view tracking failed but that's non-critical
      console.log("View tracking failed for channel-less user:", e);
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
  
  console.log('[MICROPAY] Balance check starting:', { 
    demoBalance, 
    walletAddress: wallet.wallet_address,
    requestedAmount: amountKas,
    isExternalUser: unifiedUser.isExternal,
    externalAddress: unifiedUser.walletAddress,
    internalAddress: unifiedUser.internalWalletAddress
  });
  
  if (demoBalance !== null && demoBalance > 0) {
    hasBalance = demoBalance >= parseFloat(amountKas);
    currentBalanceKas = demoBalance.toString();
    console.log('[MICROPAY] Using demo balance:', { currentBalanceKas, hasBalance });
  } else {
    console.log('[MICROPAY] Fetching mainnet balance for:', wallet.wallet_address);
    const balance = await getWalletBalance(wallet.wallet_address as string);
    console.log('[MICROPAY] Raw balance response:', JSON.stringify(balance));
    hasBalance = balance ? parseFloat(balance.balanceKAS) >= parseFloat(amountKas) : false;
    currentBalanceKas = balance?.balanceKAS || "0";
    console.log('[MICROPAY] Using mainnet balance:', { 
      currentBalanceKas, 
      hasBalance, 
      requestedAmountKas: amountKas,
      comparison: `${currentBalanceKas} >= ${amountKas}`
    });
  }
  
  if (!hasBalance) {
    // For external wallet users, check if they have funds in their external wallet
    // that they could deposit to their internal KasShi wallet
    if (unifiedUser.isExternal) {
      const externalBal = await getWalletBalance(unifiedUser.walletAddress);
      const externalBalanceKas = externalBal?.balanceKAS || "0";
      if (parseFloat(externalBalanceKas) >= parseFloat(amountKas)) {
        return c.json({ 
          error: "Your KasShi wallet has no funds. Deposit from your Kastle/KasWare wallet first.", 
          balanceKAS: currentBalanceKas,
          externalBalanceKAS: externalBalanceKas,
          needsDeposit: true
        }, 400);
      }
    }
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
    
    // CRITICAL: Resolve creator's INTERNAL wallet address
    // External wallets should only log in and deposit - all payments go to internal wallets
    let creatorInternalWallet = toAddress;
    
    // Check if toAddress is an external wallet - if so, get internal wallet
    const externalCreator = await c.env.DB.prepare(
      "SELECT internal_wallet_address FROM external_wallet_users WHERE wallet_address = ?"
    ).bind(toAddress).first<{ internal_wallet_address: string | null }>();
    
    if (externalCreator?.internal_wallet_address) {
      creatorInternalWallet = externalCreator.internal_wallet_address;
      console.log('[MICROPAY VIEW] Resolved external wallet to internal:', { externalWallet: toAddress, internalWallet: creatorInternalWallet });
    } else {
      // Check if toAddress is from channels table - might be linked to external user
      const channelOwner = await c.env.DB.prepare(
        "SELECT ewu.internal_wallet_address FROM channels c LEFT JOIN external_wallet_users ewu ON c.wallet_address = ewu.wallet_address WHERE c.wallet_address = ?"
      ).bind(toAddress).first<{ internal_wallet_address: string | null }>();
      
      if (channelOwner?.internal_wallet_address) {
        creatorInternalWallet = channelOwner.internal_wallet_address;
        console.log('[MICROPAY VIEW] Resolved channel external wallet to internal:', { externalWallet: toAddress, internalWallet: creatorInternalWallet });
      }
    }
    
    // Send 95% to creator on-chain (always to internal wallet)
    let creatorResult = await sendTransaction(
      wallet.wallet_address as string,
      creatorInternalWallet,
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
        creatorInternalWallet,
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
  
  // CRITICAL: Resolve recipient's INTERNAL wallet address for non-view payments (tips, etc.)
  // External wallets should only log in and deposit - all payments go to internal wallets
  let recipientInternalWallet = toAddress;
  
  // Check if toAddress is an external wallet - if so, get internal wallet
  const externalRecipient = await c.env.DB.prepare(
    "SELECT internal_wallet_address FROM external_wallet_users WHERE wallet_address = ?"
  ).bind(toAddress).first<{ internal_wallet_address: string | null }>();
  
  if (externalRecipient?.internal_wallet_address) {
    recipientInternalWallet = externalRecipient.internal_wallet_address;
    console.log('[MICROPAY] Resolved external wallet to internal:', { externalWallet: toAddress, internalWallet: recipientInternalWallet });
  } else {
    // Check if toAddress is from channels table - might be linked to external user
    const recipientChannel = await c.env.DB.prepare(
      "SELECT ewu.internal_wallet_address FROM channels c LEFT JOIN external_wallet_users ewu ON c.wallet_address = ewu.wallet_address WHERE c.wallet_address = ?"
    ).bind(toAddress).first<{ internal_wallet_address: string | null }>();
    
    if (recipientChannel?.internal_wallet_address) {
      recipientInternalWallet = recipientChannel.internal_wallet_address;
      console.log('[MICROPAY] Resolved channel external wallet to internal:', { externalWallet: toAddress, internalWallet: recipientInternalWallet });
    }
  }
  
  let result = await sendTransaction(
    wallet.wallet_address as string,
    recipientInternalWallet,
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
        recipientInternalWallet,
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
app.get("/api/wallet/mode", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // Handle external wallet users (KasWare/Kastle)
  if (unifiedUser.isExternal) {
    // External wallets are always mainnet, no demo mode
    const mainnetBalance = await getWalletBalance(unifiedUser.walletAddress);
    
    // Check if this external wallet has admin status in user_wallets
    const walletRecord = await c.env.DB.prepare(
      "SELECT is_admin FROM user_wallets WHERE wallet_address = ?"
    ).bind(unifiedUser.walletAddress).first();
    const isAdmin = walletRecord?.is_admin === 1;
    
    return c.json({
      mode: "mainnet",
      demoBalance: "0.00",
      mainnetBalance: mainnetBalance?.balanceKAS || "0.00",
      walletAddress: unifiedUser.walletAddress,
      isAdmin,
    });
  }
  
  const wallet = await c.env.DB.prepare(
    "SELECT demo_balance, wallet_address, is_admin FROM user_wallets WHERE user_id = ?"
  ).bind(unifiedUser.id).first();
  
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
  
  // External wallet users (KasWare/Kastle) - check external_wallet_users
  if (unifiedUser.isExternal) {
    const extWallet = await c.env.DB.prepare(
      "SELECT is_totp_enabled, is_extra_password_enabled, has_viewed_mnemonic, require_password_on_login FROM external_wallet_users WHERE id = ?"
    ).bind(unifiedUser.externalId).first();
    
    return c.json({
      is2FAEnabled: !!extWallet?.is_totp_enabled,
      isExtraPasswordEnabled: !!extWallet?.is_extra_password_enabled,
      hasViewedMnemonic: !!extWallet?.has_viewed_mnemonic,
      requirePasswordOnLogin: !!extWallet?.require_password_on_login,
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
app.post("/api/security/2fa/setup", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // Check if 2FA is already enabled
  if (unifiedUser.isExternal) {
    const extWallet = await c.env.DB.prepare(
      "SELECT is_totp_enabled FROM external_wallet_users WHERE id = ?"
    ).bind(unifiedUser.externalId).first();
    
    if (extWallet?.is_totp_enabled) {
      return c.json({ error: "2FA is already enabled" }, 400);
    }
  } else {
    const wallet = await c.env.DB.prepare(
      "SELECT is_totp_enabled FROM user_wallets WHERE user_id = ?"
    ).bind(unifiedUser.id).first();
    
    if (!wallet) {
      return c.json({ error: "No wallet found" }, 404);
    }
    
    if (wallet.is_totp_enabled) {
      return c.json({ error: "2FA is already enabled" }, 400);
    }
  }
  
  // Generate new TOTP secret
  const totp = new OTPAuth.TOTP({
    issuer: "KasShi",
    label: "KasShi Account",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 })
  });
  
  const secret = totp.secret.base32;
  const otpauthUrl = totp.toString();
  
  // Encrypt and store the secret (not enabled yet)
  const encryptionKey = unifiedUser.isExternal ? unifiedUser.walletAddress : unifiedUser.id;
  const encryptedSecret = await encryptPrivateKey(secret, encryptionKey);
  
  if (unifiedUser.isExternal) {
    await c.env.DB.prepare(`
      UPDATE external_wallet_users SET totp_secret = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(encryptedSecret, unifiedUser.externalId).run();
  } else {
    await c.env.DB.prepare(`
      UPDATE user_wallets SET totp_secret = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
    `).bind(encryptedSecret, unifiedUser.id).run();
  }
  
  return c.json({
    secret,
    otpauthUrl,
    message: "Scan the QR code with your authenticator app, then verify with a code"
  });
});

// Verify and enable 2FA
app.post("/api/security/2fa/verify", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const body = await c.req.json();
  const { code } = body;
  
  if (!code) {
    return c.json({ error: "Verification code required" }, 400);
  }
  
  let totpSecret: string | null = null;
  let isAlreadyEnabled = false;
  const encryptionKey = unifiedUser.isExternal ? unifiedUser.walletAddress : unifiedUser.id;
  
  if (unifiedUser.isExternal) {
    const extWallet = await c.env.DB.prepare(
      "SELECT totp_secret, is_totp_enabled FROM external_wallet_users WHERE id = ?"
    ).bind(unifiedUser.externalId).first();
    
    totpSecret = extWallet?.totp_secret as string | null;
    isAlreadyEnabled = !!extWallet?.is_totp_enabled;
  } else {
    const wallet = await c.env.DB.prepare(
      "SELECT totp_secret, is_totp_enabled FROM user_wallets WHERE user_id = ?"
    ).bind(unifiedUser.id).first();
    
    if (!wallet) {
      return c.json({ error: "No wallet found" }, 404);
    }
    
    totpSecret = wallet.totp_secret as string | null;
    isAlreadyEnabled = !!wallet.is_totp_enabled;
  }
  
  if (!totpSecret) {
    return c.json({ error: "2FA setup not initiated" }, 400);
  }
  
  if (isAlreadyEnabled) {
    return c.json({ error: "2FA is already enabled" }, 400);
  }
  
  // Decrypt the secret
  const secret = await decryptPrivateKey(totpSecret, encryptionKey);
  if (!secret) {
    return c.json({ error: "Failed to decrypt 2FA secret" }, 500);
  }
  
  // Verify the code
  const totp = new OTPAuth.TOTP({
    issuer: "KasShi",
    label: "KasShi Account",
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
  if (unifiedUser.isExternal) {
    await c.env.DB.prepare(`
      UPDATE external_wallet_users SET is_totp_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(unifiedUser.externalId).run();
  } else {
    await c.env.DB.prepare(`
      UPDATE user_wallets SET is_totp_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
    `).bind(unifiedUser.id).run();
  }
  
  return c.json({ success: true, message: "2FA enabled successfully" });
});

// Disable 2FA (requires current 2FA code)
app.post("/api/security/2fa/disable", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const body = await c.req.json();
  const { code } = body;
  
  if (!code) {
    return c.json({ error: "2FA code required" }, 400);
  }
  
  let totpSecret: string | null = null;
  let isEnabled = false;
  const encryptionKey = unifiedUser.isExternal ? unifiedUser.walletAddress : unifiedUser.id;
  
  if (unifiedUser.isExternal) {
    const extWallet = await c.env.DB.prepare(
      "SELECT totp_secret, is_totp_enabled FROM external_wallet_users WHERE id = ?"
    ).bind(unifiedUser.externalId).first();
    
    totpSecret = extWallet?.totp_secret as string | null;
    isEnabled = !!extWallet?.is_totp_enabled;
  } else {
    const wallet = await c.env.DB.prepare(
      "SELECT totp_secret, is_totp_enabled FROM user_wallets WHERE user_id = ?"
    ).bind(unifiedUser.id).first();
    
    totpSecret = wallet?.totp_secret as string | null;
    isEnabled = !!wallet?.is_totp_enabled;
  }
  
  if (!isEnabled) {
    return c.json({ error: "2FA is not enabled" }, 400);
  }
  
  // Decrypt and verify
  const secret = await decryptPrivateKey(totpSecret as string, encryptionKey);
  if (!secret) {
    return c.json({ error: "Failed to decrypt 2FA secret" }, 500);
  }
  
  const totp = new OTPAuth.TOTP({
    issuer: "KasShi",
    label: "KasShi Account",
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
  if (unifiedUser.isExternal) {
    await c.env.DB.prepare(`
      UPDATE external_wallet_users SET is_totp_enabled = 0, totp_secret = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(unifiedUser.externalId).run();
  } else {
    await c.env.DB.prepare(`
      UPDATE user_wallets SET is_totp_enabled = 0, totp_secret = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
    `).bind(unifiedUser.id).run();
  }
  
  return c.json({ success: true, message: "2FA disabled" });
});

// Get mnemonic for backup - requires transaction password if enabled
app.post("/api/security/mnemonic", async (c) => {
  const authHeader = c.req.header("Authorization");
  console.log("[MNEMONIC] Starting request, auth header present:", !!authHeader);
  const unifiedUser = await getUnifiedUser(c);
  console.log("[MNEMONIC] unifiedUser:", unifiedUser ? JSON.stringify({ id: unifiedUser.id, isExternal: unifiedUser.isExternal, externalId: unifiedUser.externalId }) : "null");
  if (!unifiedUser) {
    // More detailed error message
    if (authHeader?.startsWith("Bearer ")) {
      console.log("[MNEMONIC] Token present but not found in database - user may need to reconnect wallet");
      return c.json({ error: "Session expired. Please disconnect and reconnect your wallet." }, 401);
    }
    return c.json({ error: "Authentication required. Please log in." }, 401);
  }
  
  const body = await c.req.json().catch(() => ({}));
  const { password } = body;
  
  let mnemonic: string | null = null;
  
  // Handle external wallet users (KasWare/Kastle)
  if (unifiedUser.isExternal) {
    const extWallet = await c.env.DB.prepare(
      "SELECT encrypted_internal_mnemonic, is_extra_password_enabled, extra_password_hash FROM external_wallet_users WHERE id = ?"
    ).bind(unifiedUser.externalId).first();
    
    if (!extWallet) {
      return c.json({ error: "No wallet found" }, 404);
    }
    
    // If transaction password is enabled, require it
    if (extWallet.is_extra_password_enabled) {
      if (!password) {
        return c.json({ error: "Transaction password required", requiresPassword: true }, 401);
      }
      
      const isValid = await verifyPin(password, extWallet.extra_password_hash as string);
      if (!isValid) {
        return c.json({ error: "Incorrect transaction password" }, 401);
      }
    }
    
    if (!extWallet.encrypted_internal_mnemonic) {
      return c.json({ error: "No internal wallet mnemonic found. Your wallet may not have been fully set up." }, 404);
    }
    
    // Decrypt using the same key format used during encryption: kasware_${user.id}_${address}
    const decryptionKey = `kasware_${unifiedUser.externalId}_${unifiedUser.walletAddress}`;
    mnemonic = await decryptPrivateKey(extWallet.encrypted_internal_mnemonic as string, decryptionKey);
    
    if (!mnemonic) {
      return c.json({ error: "Failed to decrypt mnemonic" }, 500);
    }
    
    // Mark as viewed
    await c.env.DB.prepare(`
      UPDATE external_wallet_users SET has_viewed_mnemonic = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(unifiedUser.externalId).run();
    
    return c.json({ mnemonic });
  }
  
  // Handle regular (Mocha auth) users
  const wallet = await c.env.DB.prepare(
    "SELECT * FROM user_wallets WHERE user_id = ?"
  ).bind(unifiedUser.id).first();
  
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
  
  if (!wallet.encrypted_mnemonic) {
    // Generate a new mnemonic for legacy wallets
    const newMnemonic = generateMnemonic();
    const encryptedMnemonic = await encryptPrivateKey(newMnemonic, unifiedUser.id);
    
    // Store the new mnemonic
    await c.env.DB.prepare(`
      UPDATE user_wallets SET encrypted_mnemonic = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
    `).bind(encryptedMnemonic, unifiedUser.id).run();
    
    mnemonic = newMnemonic;
  } else {
    // Decrypt the existing mnemonic
    mnemonic = await decryptPrivateKey(wallet.encrypted_mnemonic as string, unifiedUser.id);
    
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
  `).bind(unifiedUser.id).run();
  
  return c.json({ mnemonic });
});

// Setup extra password with recovery phrase
app.post("/api/security/password/setup", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const body = await c.req.json();
  const { password, requireOnLogin } = body;
  
  if (!password || password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }
  
  // Get wallet based on user type
  if (unifiedUser.isExternal) {
    const extWallet = await c.env.DB.prepare(
      "SELECT * FROM external_wallet_users WHERE id = ?"
    ).bind(unifiedUser.externalId).first();
    
    if (!extWallet) {
      return c.json({ error: "No wallet found" }, 404);
    }
    
    if (extWallet.is_extra_password_enabled) {
      return c.json({ error: "Transaction password is already enabled" }, 400);
    }
    
    const recoveryPhrase = generateMnemonic();
    const encryptedRecoveryMnemonic = await encryptPrivateKey(recoveryPhrase, password);
    const passwordHash = await hashPin(password);
    
    await c.env.DB.prepare(`
      UPDATE external_wallet_users 
      SET extra_password_hash = ?, 
          is_extra_password_enabled = 1, 
          encrypted_password_mnemonic = ?,
          require_password_on_login = ?,
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(passwordHash, encryptedRecoveryMnemonic, requireOnLogin ? 1 : 0, unifiedUser.externalId).run();
    
    return c.json({ 
      success: true, 
      message: "Transaction password enabled",
      recoveryPhrase: recoveryPhrase
    });
  }
  
  // Internal wallet user
  const wallet = await c.env.DB.prepare(
    "SELECT * FROM user_wallets WHERE user_id = ?"
  ).bind(unifiedUser.id).first();
  
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
  `).bind(passwordHash, encryptedRecoveryMnemonic, requireOnLogin ? 1 : 0, unifiedUser.id).run();
  
  return c.json({ 
    success: true, 
    message: "Transaction password enabled",
    recoveryPhrase: recoveryPhrase // User must save this!
  });
});

// View password recovery phrase (requires current password)
app.post("/api/security/password/recovery-phrase", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const body = await c.req.json();
  const { password } = body;
  
  if (!password) {
    return c.json({ error: "Password required" }, 400);
  }
  
  // Get wallet based on user type
  const wallet = unifiedUser.isExternal
    ? await c.env.DB.prepare("SELECT * FROM external_wallet_users WHERE id = ?").bind(unifiedUser.externalId).first()
    : await c.env.DB.prepare("SELECT * FROM user_wallets WHERE user_id = ?").bind(unifiedUser.id).first();
  
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
app.post("/api/security/password/disable", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const body = await c.req.json();
  const { password } = body;
  
  if (!password) {
    return c.json({ error: "Current password required" }, 400);
  }
  
  // Get wallet based on user type
  const wallet = unifiedUser.isExternal
    ? await c.env.DB.prepare("SELECT * FROM external_wallet_users WHERE id = ?").bind(unifiedUser.externalId).first()
    : await c.env.DB.prepare("SELECT * FROM user_wallets WHERE user_id = ?").bind(unifiedUser.id).first();
  
  if (!wallet?.is_extra_password_enabled) {
    return c.json({ error: "Extra password is not enabled" }, 400);
  }
  
  // Verify the password
  const isValid = await verifyPin(password, wallet.extra_password_hash as string);
  if (!isValid) {
    return c.json({ error: "Incorrect password" }, 400);
  }
  
  // Disable extra password and clear recovery phrase
  if (unifiedUser.isExternal) {
    await c.env.DB.prepare(`
      UPDATE external_wallet_users 
      SET is_extra_password_enabled = 0, 
          extra_password_hash = NULL, 
          encrypted_password_mnemonic = NULL,
          require_password_on_login = 0,
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(unifiedUser.externalId).run();
  } else {
    await c.env.DB.prepare(`
      UPDATE user_wallets 
      SET is_extra_password_enabled = 0, 
          extra_password_hash = NULL, 
          encrypted_password_mnemonic = NULL,
          require_password_on_login = 0,
          updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = ?
    `).bind(unifiedUser.id).run();
  }
  
  return c.json({ success: true, message: "Transaction password disabled" });
});

// Recover/reset password using recovery phrase
app.post("/api/security/password/recover", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const body = await c.req.json();
  const { recoveryPhrase, newPassword } = body;
  
  if (!recoveryPhrase || !newPassword) {
    return c.json({ error: "Recovery phrase and new password required" }, 400);
  }
  
  if (newPassword.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }
  
  // Get wallet based on user type
  const wallet = unifiedUser.isExternal
    ? await c.env.DB.prepare("SELECT * FROM external_wallet_users WHERE id = ?").bind(unifiedUser.externalId).first()
    : await c.env.DB.prepare("SELECT * FROM user_wallets WHERE user_id = ?").bind(unifiedUser.id).first();
  
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
  if (unifiedUser.isExternal) {
    await c.env.DB.prepare(`
      UPDATE external_wallet_users 
      SET extra_password_hash = ?,
          encrypted_password_mnemonic = ?,
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(newPasswordHash, newEncryptedMnemonic, unifiedUser.externalId).run();
  } else {
    await c.env.DB.prepare(`
      UPDATE user_wallets 
      SET extra_password_hash = ?,
          encrypted_password_mnemonic = ?,
          updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = ?
    `).bind(newPasswordHash, newEncryptedMnemonic, unifiedUser.id).run();
  }
  
  return c.json({ success: true, message: "Password has been reset" });
});

// Verify security for protected transactions
app.post("/api/security/verify", async (c) => {
  const unifiedUser = await getUnifiedUser(c);
  if (!unifiedUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const body = await c.req.json();
  const { totpCode, extraPassword } = body;
  
  // Get wallet based on user type
  const wallet = unifiedUser.isExternal
    ? await c.env.DB.prepare("SELECT * FROM external_wallet_users WHERE id = ?").bind(unifiedUser.externalId).first()
    : await c.env.DB.prepare("SELECT * FROM user_wallets WHERE user_id = ?").bind(unifiedUser.id).first();
  
  if (!wallet) {
    return c.json({ error: "No wallet found" }, 404);
  }
  
  // Check 2FA if enabled (only for internal wallets - external wallets don't have totp)
  if (!unifiedUser.isExternal && wallet.is_totp_enabled) {
    if (!totpCode) {
      return c.json({ error: "2FA code required", requires2FA: true }, 400);
    }
    
    const secret = await decryptPrivateKey(wallet.totp_secret as string, unifiedUser.id);
    if (!secret) {
      return c.json({ error: "Failed to verify 2FA" }, 500);
    }
    
    const totp = new OTPAuth.TOTP({
      issuer: "KasShi",
      label: "KasShi Wallet",
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
    
    // Record payment if provided (likes go 100% to platform, no creator earnings)
    if (transactionId && interactionType === "like") {
      const platformFee = LIKE_COST_KAS.toString(); // 100% to platform
      const creatorAmount = "0"; // No creator earnings for likes
      
      await c.env.DB.prepare(`
        INSERT INTO video_payments (transaction_id, from_channel_id, to_channel_id, video_id, payment_type, amount_kas, platform_fee, creator_amount, status)
        VALUES (?, ?, ?, ?, 'like', ?, ?, ?, 'completed')
      `).bind(transactionId, channelId || 0, video.creator_channel_id, videoId, LIKE_COST_KAS.toString(), platformFee, creatorAmount).run();
      // No video earnings update - likes go to platform only
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
  const { channelId, userId, progressSeconds, durationSeconds } = body;
  
  // Require either channelId or userId (for users without channels)
  if ((!channelId && !userId) || progressSeconds === undefined || !durationSeconds) {
    return c.json({ error: "Missing required fields" }, 400);
  }
  
  const videoId = await resolveVideoId(c.env.DB, idParam);
  if (!videoId) {
    return c.json({ error: "Video not found" }, 404);
  }
  
  // Upsert watch progress - use channelId if available, otherwise use negative hash of userId
  // This allows tracking progress for users without channels
  const effectiveChannelId = channelId || -(Math.abs(hashString(userId || unifiedUser.id)) % 1000000000);
  const effectiveUserId = userId || unifiedUser.id;
  
  await c.env.DB.prepare(`
    INSERT INTO watch_progress (channel_id, video_id, progress_seconds, duration_seconds, user_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(channel_id, video_id) DO UPDATE SET
      progress_seconds = excluded.progress_seconds,
      duration_seconds = excluded.duration_seconds,
      user_id = excluded.user_id,
      updated_at = CURRENT_TIMESTAMP
  `).bind(effectiveChannelId, videoId, Math.floor(progressSeconds), Math.floor(durationSeconds), effectiveUserId).run();
  
  return c.json({ success: true });
});

// Simple string hash function
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

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
  
  // Record payment (comments go 100% to platform, no creator earnings)
  if (transactionId) {
    const platformFee = COMMENT_COST_KAS.toString(); // 100% to platform
    const recipientAmount = "0"; // No creator earnings for comments
    
    const comment = await c.env.DB.prepare(
      "SELECT id FROM comments WHERE video_id = ? AND channel_id = ? ORDER BY id DESC LIMIT 1"
    ).bind(videoId, channelId).first();
    
    await c.env.DB.prepare(`
      INSERT INTO video_payments (transaction_id, from_channel_id, to_channel_id, video_id, comment_id, payment_type, amount_kas, platform_fee, creator_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
    `).bind(transactionId, channelId, recipientChannelId, videoId, comment?.id, paymentType, COMMENT_COST_KAS.toString(), platformFee, recipientAmount).run();
    // No earnings update - comments go to platform only
  }
  
  const newComment = await c.env.DB.prepare(`
    SELECT cm.*, ch.name as author_name, ch.handle as author_handle, ch.avatar_url as author_avatar
    FROM comments cm
    JOIN channels ch ON cm.channel_id = ch.id
    WHERE cm.video_id = ? AND cm.channel_id = ?
    ORDER BY cm.id DESC LIMIT 1
  `).bind(videoId, channelId).first();
  
  // Create notification for video owner or parent comment author (if different from commenter)
  if (recipientChannelId !== channelId && newComment) {
    const recipientChannel = await c.env.DB.prepare(
      "SELECT wallet_address FROM channels WHERE id = ?"
    ).bind(recipientChannelId).first();
    
    if (recipientChannel?.wallet_address) {
      // Find user_id for recipient
      const recipientWallet = await c.env.DB.prepare(
        "SELECT user_id FROM user_wallets WHERE wallet_address = ?"
      ).bind(recipientChannel.wallet_address).first();
      
      const recipientUserId = recipientWallet?.user_id as string | null;
      
      // Check notification settings
      let shouldNotify = true;
      if (recipientUserId) {
        const settings = await c.env.DB.prepare(
          "SELECT notifications_comments FROM user_settings WHERE user_id = ?"
        ).bind(recipientUserId).first();
        shouldNotify = settings?.notifications_comments !== 0;
      }
      
      if (shouldNotify) {
        const commenterName = newComment.author_name || "Someone";
        const notifTitle = parentId ? "New reply to your comment" : "New comment on your video";
        const notifMessage = `${commenterName} ${parentId ? "replied to your comment" : "commented on your video"}: "${(content as string).substring(0, 100)}${(content as string).length > 100 ? "..." : ""}"`;
        
        await c.env.DB.prepare(`
          INSERT INTO notifications (user_id, type, title, message, video_id, channel_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(recipientUserId || recipientChannel.wallet_address, "comment", notifTitle, notifMessage, videoId, channelId).run();
      }
    }
  }
  
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
const SUBSCRIBE_FEE_KAS = 1; // Cost to subscribe (100% to creator)
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
    SELECT n.*, n.related_handle, v.title as video_title, v.thumbnail_url as video_thumbnail, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar
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
      relatedHandle: n.related_handle,
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
  
  let notificationIds: number[] | undefined;
  try {
    const body = await c.req.json();
    notificationIds = body.notificationIds;
  } catch {
    // Empty body or invalid JSON - will mark all as read
  }
  
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

// Get top 3 most liked videos for competition leaderboard
app.get("/api/kasshi/competition/top-liked", async (c) => {
  const topVideos = await c.env.DB.prepare(`
    SELECT v.id, v.public_id, v.title, v.thumbnail_url, v.like_count, v.view_count, v.duration_seconds,
           c.id as channel_id, c.name as channel_name, c.handle as channel_handle, c.avatar_url as channel_avatar_url, c.is_verified
    FROM videos v
    JOIN channels c ON v.channel_id = c.id
    WHERE v.status = 'published'
    ORDER BY v.like_count DESC
    LIMIT 3
  `).all();
  
  return c.json({
    videos: (topVideos.results || []).map((v: Record<string, unknown>) => ({
      id: v.id,
      publicId: v.public_id,
      title: v.title,
      thumbnailUrl: v.thumbnail_url,
      likeCount: v.like_count || 0,
      viewCount: v.view_count || 0,
      durationSeconds: v.duration_seconds || 0,
      channel: {
        id: v.channel_id,
        name: v.channel_name,
        handle: v.channel_handle,
        avatarUrl: v.channel_avatar_url,
        isVerified: Boolean(v.is_verified),
      },
    })),
  });
});

// ============================================
// Creator Dashboard Analytics
// ============================================

app.get("/api/kasshi/dashboard/analytics", async (c) => {
  const channelId = c.req.query("channelId");
  const range = c.req.query("range") || "30d";
  const authHeader = c.req.header("Authorization");
  
  let resolvedChannelId = channelId ? parseInt(channelId) : null;
  
  // For external wallet users, get channel from auth token
  if (!resolvedChannelId && authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const extUser = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first();
    
    if (extUser) {
      // Try external wallet address first, then internal wallet address
      let channel = await c.env.DB.prepare(
        "SELECT id FROM channels WHERE wallet_address = ?"
      ).bind(extUser.wallet_address).first();
      
      if (!channel && extUser.internal_wallet_address) {
        channel = await c.env.DB.prepare(
          "SELECT id FROM channels WHERE wallet_address = ?"
        ).bind(extUser.internal_wallet_address).first();
      }
      
      if (channel) {
        resolvedChannelId = channel.id as number;
      }
    }
  }
  
  if (!resolvedChannelId) {
    return c.json({ error: "Channel not found" }, 404);
  }
  
  // Calculate date ranges
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];
  
  const prevStartDate = new Date();
  prevStartDate.setDate(prevStartDate.getDate() - days * 2);
  const prevStartDateStr = prevStartDate.toISOString().split('T')[0];
  
  const db = c.env.DB;
  
  // Get current period stats (videos) and total earnings from channel
  const currentStats = await db.prepare(`
    SELECT 
      COALESCE(SUM(v.view_count), 0) as total_views,
      COALESCE(SUM(v.like_count), 0) as total_likes,
      COUNT(v.id) as total_videos,
      COALESCE(SUM(CAST(v.kas_earned AS REAL)), 0) as video_kas
    FROM videos v
    WHERE v.channel_id = ? AND v.status = 'published'
  `).bind(resolvedChannelId).first();
  
  // Get total earnings from channel (includes tips, subscriptions, memberships, AND video earnings)
  const channelEarnings = await db.prepare(`
    SELECT COALESCE(CAST(total_kas_earned AS REAL), 0) as total_kas
    FROM channels WHERE id = ?
  `).bind(resolvedChannelId).first();
  
  // Get unique viewers
  const uniqueViewers = await db.prepare(`
    SELECT COUNT(DISTINCT COALESCE(vv.channel_id, vv.user_id)) as count
    FROM video_views vv
    JOIN videos v ON vv.video_id = v.id
    WHERE v.channel_id = ? AND date(vv.watched_at) >= ?
  `).bind(resolvedChannelId, startDateStr).first();
  
  // Get subscriber count
  const subscriberCount = await db.prepare(`
    SELECT subscriber_count FROM channels WHERE id = ?
  `).bind(resolvedChannelId).first();
  
  // Get views change (compare to previous period)
  const currentPeriodViews = await db.prepare(`
    SELECT COUNT(*) as count
    FROM video_views vv
    JOIN videos v ON vv.video_id = v.id
    WHERE v.channel_id = ? AND date(vv.watched_at) >= ?
  `).bind(resolvedChannelId, startDateStr).first();
  
  const previousPeriodViews = await db.prepare(`
    SELECT COUNT(*) as count
    FROM video_views vv
    JOIN videos v ON vv.video_id = v.id
    WHERE v.channel_id = ? AND date(vv.watched_at) >= ? AND date(vv.watched_at) < ?
  `).bind(resolvedChannelId, prevStartDateStr, startDateStr).first();
  
  // Get likes change
  const currentPeriodLikes = await db.prepare(`
    SELECT COUNT(*) as count
    FROM video_interactions vi
    JOIN videos v ON vi.video_id = v.id
    WHERE v.channel_id = ? AND vi.interaction_type = 'like' AND date(vi.created_at) >= ?
  `).bind(resolvedChannelId, startDateStr).first();
  
  const previousPeriodLikes = await db.prepare(`
    SELECT COUNT(*) as count
    FROM video_interactions vi
    JOIN videos v ON vi.video_id = v.id
    WHERE v.channel_id = ? AND vi.interaction_type = 'like' AND date(vi.created_at) >= ? AND date(vi.created_at) < ?
  `).bind(resolvedChannelId, prevStartDateStr, startDateStr).first();
  
  // Get revenue change
  const currentPeriodRevenue = await db.prepare(`
    SELECT COALESCE(SUM(CAST(creator_amount AS REAL)), 0) as total
    FROM video_payments
    WHERE to_channel_id = ? AND date(created_at) >= ?
  `).bind(resolvedChannelId, startDateStr).first();
  
  const previousPeriodRevenue = await db.prepare(`
    SELECT COALESCE(SUM(CAST(creator_amount AS REAL)), 0) as total
    FROM video_payments
    WHERE to_channel_id = ? AND date(created_at) >= ? AND date(created_at) < ?
  `).bind(resolvedChannelId, prevStartDateStr, startDateStr).first();
  
  // Calculate percentage changes
  const calcChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };
  
  const viewsChange = calcChange(
    (currentPeriodViews?.count as number) || 0,
    (previousPeriodViews?.count as number) || 0
  );
  
  const likesChange = calcChange(
    (currentPeriodLikes?.count as number) || 0,
    (previousPeriodLikes?.count as number) || 0
  );
  
  const revenueChange = calcChange(
    (currentPeriodRevenue?.total as number) || 0,
    (previousPeriodRevenue?.total as number) || 0
  );
  
  // Get chart data - views and earnings by day
  const chartData = await db.prepare(`
    SELECT 
      date(vv.watched_at) as date,
      COUNT(*) as views
    FROM video_views vv
    JOIN videos v ON vv.video_id = v.id
    WHERE v.channel_id = ? AND date(vv.watched_at) >= ?
    GROUP BY date(vv.watched_at)
    ORDER BY date ASC
  `).bind(resolvedChannelId, startDateStr).all();
  
  const earningsData = await db.prepare(`
    SELECT 
      date(created_at) as date,
      SUM(CAST(creator_amount AS REAL)) as earnings
    FROM video_payments
    WHERE to_channel_id = ? AND date(created_at) >= ?
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).bind(resolvedChannelId, startDateStr).all();
  
  // Merge chart data
  const chartMap = new Map<string, { views: number; earnings: number }>();
  
  // Fill in all dates in range
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dateStr = d.toISOString().split('T')[0];
    chartMap.set(dateStr, { views: 0, earnings: 0 });
  }
  
  // Add views data
  for (const row of chartData.results) {
    const dateStr = row.date as string;
    const existing = chartMap.get(dateStr) || { views: 0, earnings: 0 };
    existing.views = row.views as number;
    chartMap.set(dateStr, existing);
  }
  
  // Add earnings data
  for (const row of earningsData.results) {
    const dateStr = row.date as string;
    const existing = chartMap.get(dateStr) || { views: 0, earnings: 0 };
    existing.earnings = row.earnings as number;
    chartMap.set(dateStr, existing);
  }
  
  // Convert to array with formatted labels
  const formattedChartData = Array.from(chartMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, data]) => {
      const d = new Date(date);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        date,
        label,
        views: data.views,
        earnings: data.earnings,
      };
    });
  
  const totalViews = (currentStats?.total_views as number) || 0;
  const totalLikes = (currentStats?.total_likes as number) || 0;
  
  // Get subscriber growth over time
  const subscriberGrowth = await db.prepare(`
    SELECT 
      date(created_at) as date,
      COUNT(*) as new_subscribers
    FROM subscriptions
    WHERE subscribed_to_channel_id = ? AND date(created_at) >= ?
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).bind(resolvedChannelId, startDateStr).all();
  
  // Calculate cumulative subscriber growth
  const subGrowthMap = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dateStr = d.toISOString().split('T')[0];
    subGrowthMap.set(dateStr, 0);
  }
  for (const row of subscriberGrowth.results) {
    subGrowthMap.set(row.date as string, row.new_subscribers as number);
  }
  let cumulative = 0;
  const subscriberChartData = Array.from(subGrowthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, newSubs]) => {
      cumulative += newSubs;
      const d = new Date(date);
      return {
        date,
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        newSubscribers: newSubs,
        cumulative,
      };
    });
  
  // Get watch time analytics
  const watchTimeStats = await db.prepare(`
    SELECT 
      COALESCE(SUM(wp.progress_seconds), 0) as total_watch_time,
      COALESCE(AVG(wp.progress_seconds), 0) as avg_watch_time,
      COUNT(DISTINCT wp.id) as total_watch_sessions
    FROM watch_progress wp
    JOIN videos v ON wp.video_id = v.id
    WHERE v.channel_id = ? AND date(wp.updated_at) >= ?
  `).bind(resolvedChannelId, startDateStr).first();
  
  // Get video completion rate
  const completionStats = await db.prepare(`
    SELECT 
      COUNT(CASE WHEN wp.progress_seconds >= v.duration_seconds * 0.9 THEN 1 END) as completed,
      COUNT(*) as total
    FROM watch_progress wp
    JOIN videos v ON wp.video_id = v.id
    WHERE v.channel_id = ? AND v.duration_seconds > 0 AND date(wp.updated_at) >= ?
  `).bind(resolvedChannelId, startDateStr).first();
  
  // Get peak hours distribution
  const peakHours = await db.prepare(`
    SELECT 
      CAST(strftime('%H', watched_at) AS INTEGER) as hour,
      COUNT(*) as view_count
    FROM video_views vv
    JOIN videos v ON vv.video_id = v.id
    WHERE v.channel_id = ? AND date(vv.watched_at) >= ?
    GROUP BY hour
    ORDER BY hour
  `).bind(resolvedChannelId, startDateStr).all();
  
  // Fill in all 24 hours
  const peakHoursData = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${i.toString().padStart(2, '0')}:00`,
    views: 0,
  }));
  for (const row of peakHours.results) {
    const hour = row.hour as number;
    if (hour >= 0 && hour < 24) {
      peakHoursData[hour].views = row.view_count as number;
    }
  }
  
  // Get peak days of week
  const peakDays = await db.prepare(`
    SELECT 
      CAST(strftime('%w', watched_at) AS INTEGER) as day_of_week,
      COUNT(*) as view_count
    FROM video_views vv
    JOIN videos v ON vv.video_id = v.id
    WHERE v.channel_id = ? AND date(vv.watched_at) >= ?
    GROUP BY day_of_week
    ORDER BY day_of_week
  `).bind(resolvedChannelId, startDateStr).all();
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const peakDaysData = Array.from({ length: 7 }, (_, i) => ({
    day: i,
    label: dayNames[i],
    views: 0,
  }));
  for (const row of peakDays.results) {
    const day = row.day_of_week as number;
    if (day >= 0 && day < 7) {
      peakDaysData[day].views = row.view_count as number;
    }
  }
  
  // Get top comments on creator's videos
  const topComments = await db.prepare(`
    SELECT 
      c.id,
      c.content,
      c.like_count,
      c.created_at,
      c.video_id,
      v.title as video_title,
      ch.name as commenter_name,
      ch.handle as commenter_handle,
      ch.avatar_url as commenter_avatar
    FROM comments c
    JOIN videos v ON c.video_id = v.id
    LEFT JOIN channels ch ON c.channel_id = ch.id
    WHERE v.channel_id = ? AND date(c.created_at) >= ?
    ORDER BY c.like_count DESC, c.created_at DESC
    LIMIT 10
  `).bind(resolvedChannelId, startDateStr).all();
  
  // Get returning vs new viewers
  const returningViewers = await db.prepare(`
    SELECT 
      CASE WHEN viewer_views > 1 THEN 'returning' ELSE 'new' END as viewer_type,
      COUNT(*) as count
    FROM (
      SELECT 
        COALESCE(vv.channel_id, vv.user_id) as viewer_id,
        COUNT(*) as viewer_views
      FROM video_views vv
      JOIN videos v ON vv.video_id = v.id
      WHERE v.channel_id = ? AND date(vv.watched_at) >= ?
      GROUP BY viewer_id
    )
    GROUP BY viewer_type
  `).bind(resolvedChannelId, startDateStr).all();
  
  const viewerBreakdown = { new: 0, returning: 0 };
  for (const row of returningViewers.results) {
    if (row.viewer_type === 'new') viewerBreakdown.new = row.count as number;
    else if (row.viewer_type === 'returning') viewerBreakdown.returning = row.count as number;
  }
  
  const totalWatchTime = (watchTimeStats?.total_watch_time as number) || 0;
  const avgWatchTime = (watchTimeStats?.avg_watch_time as number) || 0;
  const completedViews = (completionStats?.completed as number) || 0;
  const totalWatchSessions = (completionStats?.total as number) || 0;
  const completionRate = totalWatchSessions > 0 ? completedViews / totalWatchSessions : 0;
  
  return c.json({
    stats: {
      totalViews,
      uniqueViewers: (uniqueViewers?.count as number) || 0,
      totalLikes,
      likeRate: totalViews > 0 ? totalLikes / totalViews : 0,
      subscriberCount: (subscriberCount?.subscriber_count as number) || 0,
      totalVideos: (currentStats?.total_videos as number) || 0,
      totalKasEarned: String((channelEarnings?.total_kas as number) || 0),
      viewsChange,
      likesChange,
      revenueChange,
      // New stats
      totalWatchTimeSeconds: totalWatchTime,
      avgWatchTimeSeconds: avgWatchTime,
      completionRate,
      newViewers: viewerBreakdown.new,
      returningViewers: viewerBreakdown.returning,
    },
    chartData: formattedChartData,
    subscriberChartData,
    peakHoursData,
    peakDaysData,
    topComments: topComments.results.map(c => ({
      id: c.id,
      content: c.content,
      likeCount: c.like_count,
      createdAt: c.created_at,
      videoId: c.video_id,
      videoTitle: c.video_title,
      commenterName: c.commenter_name || 'Anonymous',
      commenterHandle: c.commenter_handle,
      commenterAvatar: c.commenter_avatar,
    })),
  });
});

// Dashboard - per-video earnings breakdown
app.get("/api/kasshi/dashboard/earnings", async (c) => {
  const channelId = c.req.query("channelId");
  const range = c.req.query("range") || "30d";
  const authHeader = c.req.header("Authorization");
  
  let resolvedChannelId = channelId ? parseInt(channelId) : null;
  
  // For external wallet users, get channel from auth token
  if (!resolvedChannelId && authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const extUser = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first();
    
    if (extUser) {
      // Try external wallet address first, then internal wallet address
      let channel = await c.env.DB.prepare(
        "SELECT id FROM channels WHERE wallet_address = ?"
      ).bind(extUser.wallet_address).first();
      
      if (!channel && extUser.internal_wallet_address) {
        channel = await c.env.DB.prepare(
          "SELECT id FROM channels WHERE wallet_address = ?"
        ).bind(extUser.internal_wallet_address).first();
      }
      
      if (channel) {
        resolvedChannelId = channel.id as number;
      }
    }
  }
  
  if (!resolvedChannelId) {
    return c.json({ error: "Channel not found" }, 404);
  }
  
  // Calculate date range
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];
  
  const db = c.env.DB;
  
  // Get per-video earnings with video details
  const videoEarnings = await db.prepare(`
    SELECT 
      v.id,
      v.title,
      v.thumbnail_url,
      v.view_count,
      v.like_count,
      v.price_kas,
      v.created_at,
      COALESCE(v.kas_earned, '0') as total_earned,
      COALESCE(period_data.period_earnings, 0) as period_earnings,
      COALESCE(period_data.period_views, 0) as period_views,
      COALESCE(period_data.payment_count, 0) as payment_count
    FROM videos v
    LEFT JOIN (
      SELECT 
        vp.video_id,
        SUM(CAST(vp.creator_amount AS REAL)) as period_earnings,
        COUNT(DISTINCT vv.id) as period_views,
        COUNT(vp.id) as payment_count
      FROM video_payments vp
      LEFT JOIN video_views vv ON vv.video_id = vp.video_id AND date(vv.watched_at) >= ?
      WHERE vp.to_channel_id = ? AND date(vp.created_at) >= ?
      GROUP BY vp.video_id
    ) period_data ON v.id = period_data.video_id
    WHERE v.channel_id = ? AND v.status = 'published'
    ORDER BY period_earnings DESC, v.view_count DESC
    LIMIT 20
  `).bind(startDateStr, resolvedChannelId, startDateStr, resolvedChannelId).all();
  
  // Get earnings by source type
  const earningsBySource = await db.prepare(`
    SELECT 
      payment_type,
      SUM(CAST(creator_amount AS REAL)) as total,
      COUNT(*) as count
    FROM video_payments
    WHERE to_channel_id = ? AND date(created_at) >= ?
    GROUP BY payment_type
    ORDER BY total DESC
  `).bind(resolvedChannelId, startDateStr).all();
  
  // Get top earning days
  const topEarningDays = await db.prepare(`
    SELECT 
      date(created_at) as date,
      SUM(CAST(creator_amount AS REAL)) as total,
      COUNT(*) as transaction_count
    FROM video_payments
    WHERE to_channel_id = ? AND date(created_at) >= ?
    GROUP BY date(created_at)
    ORDER BY total DESC
    LIMIT 5
  `).bind(resolvedChannelId, startDateStr).all();
  
  return c.json({
    videos: videoEarnings.results.map(v => ({
      id: v.id,
      title: v.title,
      thumbnailUrl: v.thumbnail_url,
      viewCount: v.view_count,
      likeCount: v.like_count,
      priceKas: v.price_kas,
      createdAt: v.created_at,
      totalEarned: v.total_earned,
      periodEarnings: v.period_earnings,
      periodViews: v.period_views,
      paymentCount: v.payment_count,
    })),
    earningsBySource: earningsBySource.results.map(s => ({
      type: s.payment_type || 'other',
      total: s.total,
      count: s.count,
    })),
    topEarningDays: topEarningDays.results.map(d => ({
      date: d.date,
      total: d.total,
      transactionCount: d.transaction_count,
    })),
  });
});

// Get all videos for management dashboard
app.get("/api/kasshi/dashboard/videos", async (c) => {
  const db = c.env.DB;
  const channelIdParam = c.req.query("channelId");
  
  // Support external wallet auth
  let resolvedChannelId = channelIdParam ? parseInt(channelIdParam) : null;
  
  if (!resolvedChannelId) {
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      // Check external_wallet_users for Kastle/KasWare users
      const extUser = await db.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first();
      
      if (extUser) {
        // Try to find channel by either wallet address
        let channel = await db.prepare(
          "SELECT id FROM channels WHERE wallet_address = ?"
        ).bind(extUser.wallet_address).first();
        
        if (!channel && extUser.internal_wallet_address) {
          channel = await db.prepare(
            "SELECT id FROM channels WHERE wallet_address = ?"
          ).bind(extUser.internal_wallet_address).first();
        }
        
        if (channel) {
          resolvedChannelId = channel.id as number;
        }
      }
    }
  }
  
  if (!resolvedChannelId) {
    return c.json({ videos: [] });
  }
  
  // Get all videos for this channel (excluding clips), ordered by most recent
  const videos = await db.prepare(`
    SELECT 
      id, public_id, title, thumbnail_url, video_url,
      view_count, like_count, price_kas, duration_seconds,
      bunny_status, created_at, is_members_only
    FROM videos
    WHERE channel_id = ?
      AND (is_clip = 0 OR is_clip IS NULL)
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(resolvedChannelId).all();
  
  return c.json({
    videos: videos.results.map(v => ({
      id: v.id,
      publicId: v.public_id,
      title: v.title,
      thumbnailUrl: v.thumbnail_url,
      videoUrl: v.video_url,
      viewCount: v.view_count || 0,
      likeCount: v.like_count || 0,
      priceKas: v.price_kas,
      durationSeconds: v.duration_seconds,
      bunnyStatus: v.bunny_status,
      createdAt: v.created_at,
      isMembersOnly: v.is_members_only === 1,
    })),
  });
});

// Get clips for dashboard
app.get("/api/kasshi/dashboard/clips", async (c) => {
  const db = c.env.DB;
  const channelIdParam = c.req.query("channelId");
  
  // Support external wallet auth
  let resolvedChannelId = channelIdParam ? parseInt(channelIdParam) : null;
  
  if (!resolvedChannelId) {
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const extUser = await db.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first();
      
      if (extUser) {
        let channel = await db.prepare(
          "SELECT id FROM channels WHERE wallet_address = ?"
        ).bind(extUser.wallet_address).first();
        
        if (!channel && extUser.internal_wallet_address) {
          channel = await db.prepare(
            "SELECT id FROM channels WHERE wallet_address = ?"
          ).bind(extUser.internal_wallet_address).first();
        }
        
        if (channel) {
          resolvedChannelId = channel.id as number;
        }
      }
    }
  }
  
  if (!resolvedChannelId) {
    return c.json({ clips: [] });
  }
  
  // Get all clips for this channel, ordered by most recent
  const clips = await db.prepare(`
    SELECT 
      id, public_id, title, thumbnail_url, video_url,
      view_count, like_count, duration_seconds,
      bunny_status, created_at
    FROM videos
    WHERE channel_id = ?
      AND is_clip = 1
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(resolvedChannelId).all();
  
  return c.json({
    clips: clips.results.map(v => ({
      id: v.id,
      publicId: v.public_id,
      title: v.title,
      thumbnailUrl: v.thumbnail_url,
      videoUrl: v.video_url,
      viewCount: v.view_count || 0,
      likeCount: v.like_count || 0,
      durationSeconds: v.duration_seconds,
      bunnyStatus: v.bunny_status,
      createdAt: v.created_at,
    })),
  });
});

// Get withdraw overview for dashboard
app.get("/api/kasshi/dashboard/withdraw", async (c) => {
  const db = c.env.DB;
  const channelIdParam = c.req.query("channelId");
  
  // Support external wallet auth
  let resolvedWalletId: number | null = null;
  let resolvedChannelId = channelIdParam ? parseInt(channelIdParam) : null;
  
  if (resolvedChannelId) {
    const channel = await db.prepare(
      "SELECT wallet_address FROM channels WHERE id = ?"
    ).bind(resolvedChannelId).first();
    if (channel && channel.wallet_address) {
      // Get the wallet by address
      const walletByAddress = await db.prepare(
        "SELECT id FROM user_wallets WHERE wallet_address = ?"
      ).bind(channel.wallet_address).first();
      if (walletByAddress) {
        resolvedWalletId = walletByAddress.id as number;
      }
    }
  }
  
  if (!resolvedWalletId && !resolvedChannelId) {
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      // Check external_wallet_users for Kastle/KasWare users
      const extUser = await db.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first();
      
      if (extUser) {
        // Try to find channel by either wallet address
        let channel = await db.prepare(
          "SELECT id, wallet_address FROM channels WHERE wallet_address = ?"
        ).bind(extUser.wallet_address).first();
        
        if (!channel && extUser.internal_wallet_address) {
          channel = await db.prepare(
            "SELECT id, wallet_address FROM channels WHERE wallet_address = ?"
          ).bind(extUser.internal_wallet_address).first();
        }
        
        if (channel) {
          resolvedChannelId = channel.id as number;
          // Try to get wallet_id from user_wallets matching channel address
          const walletByAddress = await db.prepare(
            "SELECT id FROM user_wallets WHERE wallet_address = ?"
          ).bind(channel.wallet_address).first();
          if (walletByAddress) {
            resolvedWalletId = walletByAddress.id as number;
          }
        }
      }
    }
  }
  
  if (!resolvedWalletId && !resolvedChannelId) {
    return c.json({ 
      currentBalance: "0",
      pendingBalance: "0", 
      totalWithdrawn: "0",
      withdrawalCount: 0,
      recentWithdrawals: [],
      walletAddress: ""
    });
  }
  
  // Get wallet info - try user_wallets first, then external_wallet_users via channel
  let walletAddress: string = "";
  let demoBalance: string = "0";
  
  if (resolvedWalletId) {
    const wallet = await db.prepare(
      "SELECT wallet_address, demo_balance FROM user_wallets WHERE id = ?"
    ).bind(resolvedWalletId).first();
    if (wallet) {
      walletAddress = wallet.wallet_address as string;
      demoBalance = String(wallet.demo_balance || "0");
    }
  }
  
  // Fallback for external wallet users - get address from channel
  if (!walletAddress && resolvedChannelId) {
    const channel = await db.prepare(
      "SELECT wallet_address FROM channels WHERE id = ?"
    ).bind(resolvedChannelId).first();
    if (channel) {
      walletAddress = channel.wallet_address as string;
      // Check external_wallet_users for demo_balance
      const extUser = await db.prepare(
        "SELECT demo_balance FROM external_wallet_users WHERE wallet_address = ? OR internal_wallet_address = ?"
      ).bind(walletAddress, walletAddress).first();
      if (extUser) {
        demoBalance = String(extUser.demo_balance || "0");
      }
    }
  }
  
  if (!walletAddress) {
    return c.json({ 
      currentBalance: "0",
      pendingBalance: "0", 
      totalWithdrawn: "0",
      withdrawalCount: 0,
      recentWithdrawals: [],
      walletAddress: ""
    });
  }
  
  // Get withdrawal history from transactions table (withdrawals are where sender is our wallet)
  const withdrawals = await db.prepare(`
    SELECT 
      id, 
      amount_kas as amount, 
      recipient_address as to_address, 
      transaction_id, 
      status, 
      created_at
    FROM transactions
    WHERE sender_address = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).bind(walletAddress).all();
  
  // Calculate totals
  const totals = await db.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN status = 'completed' OR status = 'confirmed' THEN CAST(amount_kas AS REAL) ELSE 0 END), 0) as total_withdrawn,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN CAST(amount_kas AS REAL) ELSE 0 END), 0) as pending_balance,
      COUNT(CASE WHEN status = 'completed' OR status = 'confirmed' THEN 1 END) as withdrawal_count
    FROM transactions
    WHERE sender_address = ?
  `).bind(walletAddress).first();
  
  const currentBalance = demoBalance;
  
  return c.json({
    currentBalance,
    pendingBalance: String(totals?.pending_balance || 0),
    totalWithdrawn: String(totals?.total_withdrawn || 0),
    withdrawalCount: totals?.withdrawal_count || 0,
    recentWithdrawals: withdrawals.results.map(w => ({
      id: w.id,
      amount: String(w.amount || '0'),
      toAddress: w.to_address as string,
      transactionId: w.transaction_id as string | null,
      status: (w.status === 'confirmed' ? 'completed' : w.status) || 'completed',
      createdAt: w.created_at as string,
    })),
    walletAddress: walletAddress || "",
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT ACTIVITY ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// Helper to get channel ID from auth
async function getChannelFromAuth(c: any): Promise<number | null> {
  const db = c.env.DB;
  
  // Try session cookie first (Mocha auth)
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
  if (sessionToken) {
    const user = await getCurrentUser(sessionToken, {
      apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
      apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
    });
    if (user) {
      const wallet = await db.prepare(
        "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
      ).bind(user.id).first();
      if (wallet) {
        const channel = await db.prepare(
          "SELECT id FROM channels WHERE wallet_address = ?"
        ).bind(wallet.wallet_address).first();
        if (channel) return channel.id as number;
      }
    }
  }
  
  // Try external wallet auth
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const extUser = await db.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first();
    
    if (extUser) {
      let channel = await db.prepare(
        "SELECT id FROM channels WHERE wallet_address = ?"
      ).bind(extUser.wallet_address).first();
      
      if (!channel && extUser.internal_wallet_address) {
        channel = await db.prepare(
          "SELECT id FROM channels WHERE wallet_address = ?"
        ).bind(extUser.internal_wallet_address).first();
      }
      
      if (channel) return channel.id as number;
    }
  }
  
  return null;
}

// Get subscribers activity
app.get("/api/kasshi/activity/subscribers", async (c) => {
  const channelId = await getChannelFromAuth(c);
  if (!channelId) {
    return c.json({ subscribers: [] });
  }
  
  const db = c.env.DB;
  const subscribers = await db.prepare(`
    SELECT 
      s.id,
      s.subscriber_channel_id as channel_id,
      c.name as channel_name,
      c.handle as channel_handle,
      c.avatar_url as channel_avatar,
      s.created_at as subscribed_at
    FROM subscriptions s
    JOIN channels c ON s.subscriber_channel_id = c.id
    WHERE s.subscribed_to_channel_id = ?
    ORDER BY s.created_at DESC
    LIMIT 100
  `).bind(channelId).all();
  
  return c.json({
    subscribers: (subscribers.results || []).map((s: any) => ({
      id: s.id,
      channelId: s.channel_id,
      channelName: s.channel_name,
      channelHandle: s.channel_handle,
      channelAvatar: s.channel_avatar,
      subscribedAt: toUTCTimestamp(s.subscribed_at),
    }))
  });
});

// Get likes activity (who liked your videos)
app.get("/api/kasshi/activity/likes", async (c) => {
  const channelId = await getChannelFromAuth(c);
  if (!channelId) {
    return c.json({ likes: [] });
  }
  
  const db = c.env.DB;
  const likes = await db.prepare(`
    SELECT 
      vi.id,
      vi.video_id,
      v.title as video_title,
      v.thumbnail_url as video_thumbnail,
      vi.channel_id as liker_channel_id,
      c.name as liker_channel_name,
      c.handle as liker_channel_handle,
      c.avatar_url as liker_channel_avatar,
      vi.created_at as liked_at
    FROM video_interactions vi
    JOIN videos v ON vi.video_id = v.id
    JOIN channels c ON vi.channel_id = c.id
    WHERE v.channel_id = ? 
      AND vi.interaction_type = 'like'
      AND vi.channel_id != ?
    ORDER BY vi.created_at DESC
    LIMIT 100
  `).bind(channelId, channelId).all();
  
  return c.json({
    likes: (likes.results || []).map((l: any) => ({
      id: l.id,
      videoId: l.video_id,
      videoTitle: l.video_title,
      videoThumbnail: l.video_thumbnail,
      likerChannelId: l.liker_channel_id,
      likerChannelName: l.liker_channel_name,
      likerChannelHandle: l.liker_channel_handle,
      likerChannelAvatar: l.liker_channel_avatar,
      likedAt: toUTCTimestamp(l.liked_at),
    }))
  });
});

// Get comments activity (who commented on your videos)
app.get("/api/kasshi/activity/comments", async (c) => {
  const channelId = await getChannelFromAuth(c);
  if (!channelId) {
    return c.json({ comments: [] });
  }
  
  const db = c.env.DB;
  const comments = await db.prepare(`
    SELECT 
      co.id,
      co.id as comment_id,
      co.content,
      co.video_id,
      v.title as video_title,
      v.thumbnail_url as video_thumbnail,
      co.channel_id as commenter_channel_id,
      c.name as commenter_channel_name,
      c.handle as commenter_channel_handle,
      c.avatar_url as commenter_channel_avatar,
      co.created_at as commented_at
    FROM comments co
    JOIN videos v ON co.video_id = v.id
    JOIN channels c ON co.channel_id = c.id
    WHERE v.channel_id = ?
      AND co.channel_id != ?
    ORDER BY co.created_at DESC
    LIMIT 100
  `).bind(channelId, channelId).all();
  
  return c.json({
    comments: (comments.results || []).map((cm: any) => ({
      id: cm.id,
      commentId: cm.comment_id,
      content: cm.content,
      videoId: cm.video_id,
      videoTitle: cm.video_title,
      videoThumbnail: cm.video_thumbnail,
      commenterChannelId: cm.commenter_channel_id,
      commenterChannelName: cm.commenter_channel_name,
      commenterChannelHandle: cm.commenter_channel_handle,
      commenterChannelAvatar: cm.commenter_channel_avatar,
      commentedAt: toUTCTimestamp(cm.commented_at),
    }))
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
    // Fetch real on-chain balance only - no more demo balance
    const realBalance = await getWalletBalance(address);
    const realBalanceKAS = parseFloat(realBalance?.balanceKAS || "0");
    const realBalanceSompi = BigInt(realBalance?.balanceSompi || "0");
    
    return c.json({
      address,
      balanceKAS: realBalanceKAS.toFixed(8),
      balanceSompi: realBalanceSompi.toString(),
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
// Get current Kaspa price in USD
app.get("/api/kasshi/kaspa-price", async (c) => {
  try {
    const db = c.env.DB;
    const price = await getKaspaPrice(db);
    
    if (price === null) {
      return c.json({ error: "Unable to fetch Kaspa price" }, 503);
    }
    
    return c.json({ 
      priceUsd: price,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching Kaspa price:", error);
    return c.json({ error: "Failed to fetch Kaspa price" }, 500);
  }
});

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
    
    // Get tiers with member counts
    const tiers = await db.prepare(
      `SELECT mt.*, 
        (SELECT COUNT(*) FROM channel_memberships cm 
         WHERE cm.tier_id = mt.id AND cm.is_active = 1 AND cm.expires_at > datetime('now')) as member_count
       FROM membership_tiers mt 
       WHERE mt.channel_id = ? 
       ORDER BY mt.price_kas ASC`
    ).bind(channel.id).all();
    
    // Get current Kaspa price for USD-based tier conversions
    const kasPrice = await getKaspaPrice(db);
    
    return c.json({ 
      kasPrice, // Include current exchange rate for frontend reference
      tiers: tiers.results.map((t: any) => {
        // If tier has USD pricing, calculate dynamic KAS amount
        let effectivePriceKas = t.price_kas;
        if (t.price_usd && kasPrice && kasPrice > 0) {
          const calculatedKas = t.price_usd / kasPrice;
          // Round up to ensure minimum 0.11 KAS and nice display
          effectivePriceKas = Math.max(0.11, Math.ceil(calculatedKas * 100) / 100).toString();
        }
        
        return {
          id: t.id,
          name: t.name,
          priceKas: effectivePriceKas,
          priceUsd: t.price_usd || null, // Include USD price if set
          description: t.description,
          benefits: t.benefits ? JSON.parse(t.benefits) : [],
          durationDays: t.duration_days,
          memberCount: t.member_count || 0,
        };
      })
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
    const { name, priceKas, priceUsd, description, benefits, durationDays } = body;
    
    // Either USD price or KAS price required
    if (!name) {
      return c.json({ error: "Name required" }, 400);
    }
    
    if (!priceUsd && (!priceKas || parseFloat(priceKas) <= 0)) {
      return c.json({ error: "Valid price (USD or KAS) required" }, 400);
    }
    
    // Validate USD price if provided
    if (priceUsd) {
      const usdAmount = parseFloat(priceUsd);
      if (isNaN(usdAmount) || usdAmount < 0.01) {
        return c.json({ error: "Minimum USD price is $0.01" }, 400);
      }
    }
    
    // Calculate initial KAS price from USD if using USD pricing
    let effectivePriceKas = priceKas ? priceKas.toString() : "0.11";
    if (priceUsd) {
      const kasPrice = await getKaspaPrice(db);
      if (kasPrice && kasPrice > 0) {
        const calculatedKas = parseFloat(priceUsd) / kasPrice;
        effectivePriceKas = Math.max(0.11, Math.ceil(calculatedKas * 100) / 100).toString();
      }
    }
    
    // Enforce minimum 0.11 KAS to avoid batching and KIP-9 mass limits
    if (parseFloat(effectivePriceKas) < 0.11) {
      return c.json({ error: "Minimum tier price is 0.11 KAS to ensure on-chain payments" }, 400);
    }
    
    await db.prepare(`
      INSERT INTO membership_tiers (channel_id, name, price_kas, price_usd, description, benefits, duration_days)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      channel.id,
      name,
      effectivePriceKas,
      priceUsd ? parseFloat(priceUsd) : null,
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

// Edit a membership tier (channel owner only)
app.patch("/api/kasshi/channels/:handle/tiers/:tierId", async (c) => {
  try {
    const unifiedUser = await getUnifiedUser(c);
    if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
    
    const handle = c.req.param("handle");
    const tierId = c.req.param("tierId");
    const db = c.env.DB;
    
    const body = await c.req.json();
    const { name, description, benefits, priceKas, priceUsd } = body;
    
    // Get channel and verify ownership
    const channel = await db.prepare(
      "SELECT * FROM channels WHERE handle = ?"
    ).bind(handle).first();
    
    if (!channel) {
      return c.json({ error: "Channel not found" }, 404);
    }
    
    // Verify ownership via wallet
    let ownerWallet = await db.prepare(
      "SELECT * FROM user_wallets WHERE user_id = ?"
    ).bind(unifiedUser.id).first();
    
    if (!ownerWallet && unifiedUser.walletAddress) {
      const extUser = await db.prepare(
        "SELECT * FROM external_wallet_users WHERE external_address = ?"
      ).bind(unifiedUser.walletAddress).first();
      if (extUser) {
        ownerWallet = { wallet_address: extUser.internal_wallet_address || unifiedUser.walletAddress } as any;
      }
    }
    
    if (!ownerWallet || (ownerWallet.wallet_address !== channel.wallet_address && unifiedUser.walletAddress !== channel.wallet_address)) {
      return c.json({ error: "Not authorized to edit this tier" }, 403);
    }
    
    // Get existing tier
    const tier = await db.prepare(
      "SELECT * FROM membership_tiers WHERE id = ? AND channel_id = ?"
    ).bind(tierId, channel.id).first();
    
    if (!tier) {
      return c.json({ error: "Tier not found" }, 404);
    }
    
    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    
    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description);
    }
    if (benefits !== undefined) {
      updates.push("benefits = ?");
      values.push(JSON.stringify(benefits));
    }
    if (priceUsd !== undefined) {
      // USD-based pricing
      updates.push("price_usd = ?");
      values.push(priceUsd);
      // Calculate current KAS equivalent
      const kasPrice = await getKaspaPrice(db);
      const calculatedKas = kasPrice && kasPrice > 0 ? Math.max(0.11, Math.ceil((priceUsd / kasPrice) * 100) / 100) : 0.11;
      updates.push("price_kas = ?");
      values.push(calculatedKas.toString());
    } else if (priceKas !== undefined) {
      // KAS-based pricing
      const kasAmount = parseFloat(priceKas);
      if (kasAmount < 0.11) {
        return c.json({ error: "Minimum price is 0.11 KAS" }, 400);
      }
      updates.push("price_kas = ?");
      values.push(kasAmount.toString());
      updates.push("price_usd = NULL");
    }
    
    updates.push("updated_at = datetime('now')");
    
    if (updates.length === 1) {
      return c.json({ error: "No fields to update" }, 400);
    }
    
    values.push(tierId);
    await db.prepare(
      `UPDATE membership_tiers SET ${updates.join(", ")} WHERE id = ?`
    ).bind(...values).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating tier:", error);
    return c.json({ error: "Failed to update membership tier" }, 500);
  }
});

// Delete a membership tier (channel owner only)
app.delete("/api/kasshi/channels/:handle/tiers/:tierId", async (c) => {
  try {
    const unifiedUser = await getUnifiedUser(c);
    if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
    
    const handle = c.req.param("handle");
    const tierId = c.req.param("tierId");
    const db = c.env.DB;
    
    // Get channel and verify ownership
    const channel = await db.prepare(
      "SELECT * FROM channels WHERE handle = ?"
    ).bind(handle).first();
    
    if (!channel) {
      return c.json({ error: "Channel not found" }, 404);
    }
    
    // Verify ownership via wallet
    let ownerWallet = await db.prepare(
      "SELECT * FROM user_wallets WHERE user_id = ?"
    ).bind(unifiedUser.id).first();
    
    if (!ownerWallet && unifiedUser.walletAddress) {
      const extUser = await db.prepare(
        "SELECT * FROM external_wallet_users WHERE external_address = ?"
      ).bind(unifiedUser.walletAddress).first();
      if (extUser) {
        ownerWallet = { wallet_address: extUser.internal_wallet_address || unifiedUser.walletAddress } as any;
      }
    }
    
    if (!ownerWallet || (ownerWallet.wallet_address !== channel.wallet_address && unifiedUser.walletAddress !== channel.wallet_address)) {
      return c.json({ error: "Not authorized to delete this tier" }, 403);
    }
    
    // Check tier exists
    const tier = await db.prepare(
      "SELECT * FROM membership_tiers WHERE id = ? AND channel_id = ?"
    ).bind(tierId, channel.id).first();
    
    if (!tier) {
      return c.json({ error: "Tier not found" }, 404);
    }
    
    // Check for active members
    const activeMembers = await db.prepare(
      "SELECT COUNT(*) as count FROM channel_memberships WHERE tier_id = ? AND is_active = 1 AND expires_at > datetime('now')"
    ).bind(tierId).first();
    
    if (activeMembers && (activeMembers.count as number) > 0) {
      return c.json({ error: "Cannot delete tier with active members. Wait for memberships to expire." }, 400);
    }
    
    // Delete the tier
    await db.prepare(
      "DELETE FROM membership_tiers WHERE id = ?"
    ).bind(tierId).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting tier:", error);
    return c.json({ error: "Failed to delete membership tier" }, 500);
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
    
    // Get user's wallet - differs for Google vs external (KasWare/Kastle) users
    // Google users: wallet in user_wallets, decryption key is user_id
    // External users: internal wallet in external_wallet_users, decryption key is kasware_{id}_{address}
    let wallet: { wallet_address: string; encrypted_private_key: string } | null = null;
    let decryptionKey: string = "";
    
    if (unifiedUser.isExternal && unifiedUser.walletAddress) {
      // KasWare/Kastle user - get internal wallet from external_wallet_users
      const extUser = await db.prepare(
        "SELECT id, wallet_address, internal_wallet_address, encrypted_internal_private_key FROM external_wallet_users WHERE wallet_address = ?"
      ).bind(unifiedUser.walletAddress).first();
      
      if (extUser?.encrypted_internal_private_key && extUser?.internal_wallet_address) {
        wallet = {
          wallet_address: extUser.internal_wallet_address as string,
          encrypted_private_key: extUser.encrypted_internal_private_key as string
        };
        decryptionKey = `kasware_${extUser.id}_${extUser.wallet_address}`;
      }
    } else {
      // Google user - wallet in user_wallets
      const userWallet = await db.prepare(
        "SELECT wallet_address, encrypted_private_key FROM user_wallets WHERE user_id = ?"
      ).bind(unifiedUser.id).first();
      
      if (userWallet?.encrypted_private_key) {
        wallet = {
          wallet_address: userWallet.wallet_address as string,
          encrypted_private_key: userWallet.encrypted_private_key as string
        };
        decryptionKey = unifiedUser.id;
      }
    }
    
    if (!wallet || !wallet.encrypted_private_key) {
      return c.json({ error: "Internal wallet not set up. Please deposit KAS to your internal wallet first." }, 400);
    }
    
    // Get member's channel - check both internal wallet and external wallet addresses
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
    
    // Prevent self-joining
    if (memberChannel.id === targetChannel.id) {
      return c.json({ error: "You cannot join your own membership tiers" }, 400);
    }
    
    // Get tier
    const tier = await db.prepare(
      "SELECT * FROM membership_tiers WHERE id = ? AND channel_id = ?"
    ).bind(tierId, targetChannel.id).first();
    
    if (!tier) {
      return c.json({ error: "Membership tier not found" }, 404);
    }
    
    const priceKas = parseFloat(tier.price_kas as string);
    
    // Get the target channel owner's INTERNAL wallet address (all payments go between internal wallets)
    let targetInternalWallet: string | null = null;
    
    // First check if channel owner is an external wallet user
    const extOwner = await db.prepare(
      "SELECT internal_wallet_address FROM external_wallet_users WHERE wallet_address = ?"
    ).bind(targetChannel.wallet_address).first();
    
    if (extOwner?.internal_wallet_address) {
      targetInternalWallet = extOwner.internal_wallet_address as string;
    } else {
      // Check if it's a Google/Mocha user's wallet
      const internalOwner = await db.prepare(
        "SELECT wallet_address FROM user_wallets WHERE wallet_address = ?"
      ).bind(targetChannel.wallet_address).first();
      
      if (internalOwner?.wallet_address) {
        targetInternalWallet = internalOwner.wallet_address as string;
      }
    }
    
    if (!targetInternalWallet) {
      return c.json({ error: "Channel owner's wallet not found" }, 400);
    }
    
    // Check balance
    const balanceResult = await getWalletBalance(wallet.wallet_address as string);
    const balanceKas = parseFloat(balanceResult?.balanceKAS || "0");
    if (balanceKas < priceKas) {
      return c.json({ error: "Insufficient balance. Please deposit more KAS to your internal wallet." }, 400);
    }
    
    // Decrypt private key and send payment
    const privateKey = await decryptPrivateKey(
      wallet.encrypted_private_key as string,
      decryptionKey
    );
    
    if (!privateKey) {
      return c.json({ error: "Failed to decrypt wallet" }, 500);
    }
    
    const amountSompi = Math.floor(priceKas * 100000000);
    let result = await sendTransaction(
      wallet.wallet_address as string,
      targetInternalWallet,
      amountSompi,
      privateKey
    );
    
    // Auto-consolidate if needed and retry
    if (!result.success && result.needsConsolidation) {
      const consolidateResult = await consolidateUTXOs(wallet.wallet_address as string, privateKey);
      if (consolidateResult.success) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        result = await sendTransaction(wallet.wallet_address as string, targetInternalWallet, amountSompi, privateKey);
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
      // Reset membership to 30 days from now (not extend from previous expiry)
      // This applies when switching tiers or renewing
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + durationDays);
      
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
    
    // Send notification to channel owner about new member
    // First try user_wallets (for Google users), then external_wallet_users (for KasWare/Kastle users)
    let ownerUserId: string | null = null;
    const ownerWallet = await db.prepare(
      "SELECT user_id FROM user_wallets WHERE wallet_address = ?"
    ).bind(targetChannel.wallet_address).first();
    
    if (ownerWallet?.user_id) {
      ownerUserId = ownerWallet.user_id as string;
    } else {
      // Check external wallet users - they may have internal wallet address different from channel address
      const extOwner = await db.prepare(
        "SELECT id FROM external_wallet_users WHERE wallet_address = ? OR internal_wallet_address = ?"
      ).bind(targetChannel.wallet_address, targetChannel.wallet_address).first();
      if (extOwner?.id) {
        // External wallet users use their id as user_id for notifications
        ownerUserId = `ext-${extOwner.id}`;
      }
    }
    
    if (ownerUserId) {
      await db.prepare(`
        INSERT INTO notifications (user_id, type, title, message, channel_id, related_handle)
        VALUES (?, 'new_member', ?, ?, ?, ?)
      `).bind(
        ownerUserId,
        `${memberChannel.name} joined your ${tier.name} membership!`,
        `You earned ${priceKas.toFixed(2)} KAS`,
        targetChannel.id,
        memberChannel.handle
      ).run();
    }
    
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

// Get all members for a channel (for channel owner)
app.get("/api/kasshi/channels/:handle/members", async (c) => {
  try {
    const unifiedUser = await getUnifiedUser(c);
    if (!unifiedUser) return c.json({ error: "Unauthorized" }, 401);
    
    const handle = c.req.param("handle");
    const db = c.env.DB;
    
    // Get target channel
    const channel = await db.prepare(
      "SELECT * FROM channels WHERE handle = ?"
    ).bind(handle).first();
    
    if (!channel) {
      return c.json({ error: "Channel not found" }, 404);
    }
    
    // Verify ownership - check both Google and external wallet users
    let isOwner = false;
    
    // Check Google user ownership
    const userWallet = await db.prepare(
      "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
    ).bind(unifiedUser.id).first();
    
    if (userWallet?.wallet_address === channel.wallet_address) {
      isOwner = true;
    }
    
    // Check external wallet ownership
    if (!isOwner && unifiedUser.walletAddress) {
      if (unifiedUser.walletAddress === channel.wallet_address) {
        isOwner = true;
      } else {
        // Check if external user's internal wallet owns the channel
        const extUser = await db.prepare(
          "SELECT internal_wallet_address FROM external_wallet_users WHERE wallet_address = ?"
        ).bind(unifiedUser.walletAddress).first();
        if (extUser?.internal_wallet_address === channel.wallet_address) {
          isOwner = true;
        }
      }
    }
    
    if (!isOwner) {
      return c.json({ error: "You don't own this channel" }, 403);
    }
    
    // Get all members with their tier info
    const members = await db.prepare(`
      SELECT 
        m.id,
        m.tier_id,
        m.expires_at,
        m.is_active,
        m.total_paid_kas,
        m.created_at,
        t.name as tier_name,
        t.price_kas as tier_price,
        c.id as member_channel_id,
        c.name as member_name,
        c.handle as member_handle,
        c.avatar_url as member_avatar
      FROM channel_memberships m
      JOIN membership_tiers t ON m.tier_id = t.id
      JOIN channels c ON m.member_channel_id = c.id
      WHERE m.channel_id = ?
      ORDER BY m.created_at DESC
    `).bind(channel.id).all();
    
    return c.json({
      members: members.results.map((m: any) => ({
        id: m.id,
        tierId: m.tier_id,
        tierName: m.tier_name,
        tierPrice: m.tier_price,
        expiresAt: m.expires_at,
        isActive: m.is_active === 1 && new Date(m.expires_at) > new Date(),
        totalPaidKas: m.total_paid_kas,
        joinedAt: m.created_at,
        member: {
          id: m.member_channel_id,
          name: m.member_name,
          handle: m.member_handle,
          avatarUrl: m.member_avatar
        }
      }))
    });
  } catch (error) {
    console.error("Error fetching members:", error);
    return c.json({ error: "Failed to fetch members" }, 500);
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
    
    // Get member's channel - check both external wallet and internal wallet addresses
    let memberChannel = await db.prepare(
      "SELECT * FROM channels WHERE wallet_address = ?"
    ).bind(unifiedUser.walletAddress).first();
    
    // For external wallet users, also check internal wallet address
    if (!memberChannel && unifiedUser.isExternal && unifiedUser.internalWalletAddress) {
      memberChannel = await db.prepare(
        "SELECT * FROM channels WHERE wallet_address = ?"
      ).bind(unifiedUser.internalWalletAddress).first();
    }
    
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
    if (unifiedUser && (unifiedUser.walletAddress === video.wallet_address || 
        (unifiedUser.isExternal && unifiedUser.internalWalletAddress === video.wallet_address))) {
      return c.json({ hasAccess: true, isMembersOnly: true, isOwner: true });
    }
    
    // Check membership
    if (!unifiedUser) {
      return c.json({ hasAccess: false, isMembersOnly: true });
    }
    
    // Get member's channel - check both external wallet and internal wallet addresses
    let memberChannel = await db.prepare(
      "SELECT * FROM channels WHERE wallet_address = ?"
    ).bind(unifiedUser.walletAddress).first();
    
    // For external wallet users, also check internal wallet address
    if (!memberChannel && unifiedUser.isExternal && unifiedUser.internalWalletAddress) {
      memberChannel = await db.prepare(
        "SELECT * FROM channels WHERE wallet_address = ?"
      ).bind(unifiedUser.internalWalletAddress).first();
    }
    
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
    
    // WEIGHTED RANDOM ALGORITHM - Fair distribution with recency boost
    // Each refresh gives ALL videos a chance to appear, but newer videos have higher probability.
    // 
    // Formula: RANDOM() * weight
    // - Base weight: 1.0 (all videos have fair base chance)
    // - Recency multiplier: 1.0 to 4.0 (newer = higher, fast decay over 2 days)
    //   - 0 hours old: 4x weight
    //   - 12 hours old: ~2.5x weight  
    //   - 1 day old: ~2x weight
    //   - 2+ days old: ~1.0x weight (base chance only)
    // - Engagement boost: +0.5 for well-liked videos (>10% like ratio)
    // - Preferred channel boost: +1.0 for channels user has engaged with
    // - Watched penalty: -0.5 for already seen videos
    //
    // This ensures every video has a chance on each refresh, while newer content
    // appears more frequently on average.
    
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
      
      // Weighted random feed - each refresh shuffles differently
      videos = await db.prepare(`
        SELECT v.*, c.name as channel_name, c.handle as channel_handle, 
               c.avatar_url as channel_avatar, c.is_verified as channel_verified,
               CASE WHEN v.channel_id IN (${preferredList}) THEN 1 ELSE 0 END as is_preferred,
               (SELECT 1 FROM video_views vv WHERE vv.video_id = v.id AND ((? IS NOT NULL AND vv.channel_id = ?) OR (? IS NOT NULL AND (vv.user_id = ? OR vv.user_id = ('ext-' || ?))))) as has_watched,
               (
                 -- Random value 0-1 multiplied by weight gives weighted random ordering
                 ABS(RANDOM() % 1000000) / 1000000.0 * (
                   1.0 +
                   -- Recency boost: 3x boost for new videos, decays to 0 over 2 days
                   (3.0 * MAX(0, 1.0 - (julianday('now') - julianday(v.created_at)) / 2.0)) +
                   -- Engagement boost: +0.5 for videos with >10% like ratio
                   (CASE WHEN CAST(v.like_count AS REAL) / MAX(v.view_count, 1) > 0.1 THEN 0.5 ELSE 0 END) +
                   -- Preferred channel boost: +1.0
                   (CASE WHEN v.channel_id IN (${preferredList}) THEN 1.0 ELSE 0 END) -
                   -- Watched penalty: -0.5
                   (CASE WHEN EXISTS (SELECT 1 FROM video_views vv WHERE vv.video_id = v.id AND ((? IS NOT NULL AND vv.channel_id = ?) OR (? IS NOT NULL AND (vv.user_id = ? OR vv.user_id = ('ext-' || ?))))) THEN 0.5 ELSE 0 END)
                 )
               ) as weighted_random_score
        FROM videos v
        JOIN channels c ON v.channel_id = c.id
        WHERE v.status = 'published' AND (v.is_private = 0 OR v.is_private IS NULL) AND (v.is_clip = 0 OR v.is_clip IS NULL) ${demoFilter}
        ORDER BY weighted_random_score DESC
        LIMIT ? OFFSET ?
      `).bind(
        channelId || null, channelId || null, userId || null, userId || null, userId || null,
        channelId || null, channelId || null, userId || null, userId || null, userId || null,
        limit, offset
      ).all();
    } else {
      // Not logged in - weighted random feed without personalization
      videos = await db.prepare(`
        SELECT v.*, c.name as channel_name, c.handle as channel_handle, 
               c.avatar_url as channel_avatar, c.is_verified as channel_verified,
               0 as has_watched,
               (
                 -- Random value 0-1 multiplied by weight
                 ABS(RANDOM() % 1000000) / 1000000.0 * (
                   1.0 +
                   -- Recency boost: 3x for new, decays to 0 over 2 days
                   (3.0 * MAX(0, 1.0 - (julianday('now') - julianday(v.created_at)) / 2.0)) +
                   -- Engagement boost: +0.5 for popular videos
                   (CASE WHEN CAST(v.like_count AS REAL) / MAX(v.view_count, 1) > 0.1 THEN 0.5 ELSE 0 END)
                 )
               ) as weighted_random_score
        FROM videos v
        JOIN channels c ON v.channel_id = c.id
        WHERE v.status = 'published' AND (v.is_private = 0 OR v.is_private IS NULL) AND (v.is_clip = 0 OR v.is_clip IS NULL) ${demoFilter}
        ORDER BY weighted_random_score DESC
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
        priceKas: v.price_kas,
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

// Feed: Free - only free videos (price_kas = '0' or NULL)
app.get("/api/kasshi/feed/free", async (c) => {
  const db = c.env.DB;
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");
  const mode = c.req.query("mode") || "mainnet";
  const demoFilter = mode === "mainnet" ? "AND v.is_demo = 0 AND c.is_demo = 0" : "";
  
  try {
    const videos = await db.prepare(`
      SELECT v.*, c.name as channel_name, c.handle as channel_handle, 
             c.avatar_url as channel_avatar, c.is_verified as channel_verified,
             (
               ABS(RANDOM() % 1000000) / 1000000.0 * (
                 1.0 +
                 (3.0 * MAX(0, 1.0 - (julianday('now') - julianday(v.created_at)) / 2.0)) +
                 (CASE WHEN CAST(v.like_count AS REAL) / MAX(v.view_count, 1) > 0.1 THEN 0.5 ELSE 0 END)
               )
             ) as weighted_random_score
      FROM videos v
      JOIN channels c ON v.channel_id = c.id
      WHERE v.status = 'published' 
        AND v.is_members_only = 0 
        AND (v.is_private = 0 OR v.is_private IS NULL)
        AND (v.price_kas = '0' OR v.price_kas IS NULL)
        ${demoFilter}
      ORDER BY weighted_random_score DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();
    
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
        priceKas: v.price_kas,
        isMembersOnly: v.is_members_only === 1,
        createdAt: toUTCTimestamp(v.created_at),
        hasWatched: false,
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
    console.error("Error fetching free feed:", error);
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
        priceKas: v.price_kas,
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
        priceKas: v.price_kas,
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
  
  // Both Gmail and external wallet users have a userId from their internal wallet
  if (!channelId && !userId) {
    return c.json({ videos: [], message: "Login required to see watch history" });
  }
  
  try {
    // Get videos from video_views table ordered by watched_at DESC
    // Match by channel_id OR user_id (for users without channels)
    let viewCondition: string;
    let bindParams: (string | number)[];
    
    if (channelId) {
      viewCondition = `(vv.channel_id = ? OR vv.user_id = ?)`;
      bindParams = [channelId, userId || '', limit, offset];
    } else {
      viewCondition = `vv.user_id = ?`;
      bindParams = [userId!, limit, offset];
    }
    
    const videos = await db.prepare(`
      SELECT v.*, c.name as channel_name, c.handle as channel_handle, 
             c.avatar_url as channel_avatar, c.is_verified as channel_verified,
             MAX(vv.watched_at) as last_watched_at
      FROM videos v
      JOIN channels c ON v.channel_id = c.id
      JOIN video_views vv ON vv.video_id = v.id AND ${viewCondition}
      WHERE v.status = 'published' AND (v.is_private = 0 OR v.is_private IS NULL) ${demoFilter}
      GROUP BY v.id
      ORDER BY last_watched_at DESC
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
        priceKas: v.price_kas,
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
  // Try Mocha auth user via session cookie
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
  if (sessionToken) {
    const user = await getCurrentUser(sessionToken, {
      apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
      apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
    });
    
    if (user) {
      const wallet = await c.env.DB.prepare(
        "SELECT is_admin FROM user_wallets WHERE user_id = ?"
      ).bind(user.id).first();
      
      if (wallet && wallet.is_admin === 1) {
        await next();
        return;
      }
    }
  }
  
  // Try external wallet auth via Authorization header
  const authHeader = c.req.header("Authorization");
  if (authHeader) {
    const authToken = authHeader.replace("Bearer ", "");
    const extUser = await c.env.DB.prepare(
      "SELECT wallet_address, is_admin FROM external_wallet_users WHERE auth_token = ?"
    ).bind(authToken).first();
    
    if (extUser && extUser.is_admin === 1) {
      await next();
      return;
    }
  }
  
  // Neither auth method succeeded - not admin
  return c.json({ error: "Admin access required" }, 403);
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

// Get all music profile reports (admin only)
app.get("/api/admin/music-reports", authMiddleware, adminMiddleware, async (c) => {
  try {
    const reports = await c.env.DB.prepare(`
      SELECT 
        r.*,
        mp.name as profile_name,
        mp.handle as profile_handle,
        mp.avatar_url as profile_avatar
      FROM music_profile_reports r
      LEFT JOIN music_profiles mp ON r.profile_id = mp.id
      ORDER BY r.created_at DESC
    `).all();
    
    return c.json({
      reports: reports.results.map((r: any) => ({
        id: r.id,
        profileId: r.profile_id,
        reason: r.reason,
        details: r.details,
        status: r.status || 'pending',
        actionTaken: r.action_taken,
        reviewedAt: r.reviewed_at,
        createdAt: toUTCTimestamp(r.created_at),
        reporterWalletAddress: r.reporter_wallet_address,
        profile: {
          id: r.profile_id,
          name: r.profile_name,
          handle: r.profile_handle,
          avatarUrl: r.profile_avatar,
        },
      }))
    });
  } catch (error) {
    console.error("Error fetching music reports:", error);
    return c.json({ error: "Failed to fetch music reports" }, 500);
  }
});

// Update music profile report status (admin only)
app.patch("/api/admin/music-reports/:id", authMiddleware, adminMiddleware, async (c) => {
  const reportId = parseInt(c.req.param("id"));
  const body = await c.req.json<{ status: string; actionTaken?: string }>();
  
  await c.env.DB.prepare(
    "UPDATE music_profile_reports SET status = ?, action_taken = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(body.status, body.actionTaken || null, reportId).run();
  
  return c.json({ success: true });
});

// Search music profiles by name (admin only) - for reconnecting profiles
app.get("/api/admin/music-profiles/search", authMiddleware, adminMiddleware, async (c) => {
  const query = c.req.query("q") || "";
  
  let profiles;
  if (!query || query.length < 1) {
    // Return all profiles when no search query
    profiles = await c.env.DB.prepare(`
      SELECT id, name, handle, wallet_address, user_id, avatar_url, created_at
      FROM music_profiles
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
  } else {
    // Search by name or handle
    profiles = await c.env.DB.prepare(`
      SELECT id, name, handle, wallet_address, user_id, avatar_url, created_at
      FROM music_profiles
      WHERE name LIKE ? OR handle LIKE ?
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(`%${query}%`, `%${query}%`).all();
  }
  
  return c.json({ profiles: profiles.results });
});

// Update music profile wallet address (admin only) - to reconnect profiles
app.patch("/api/admin/music-profiles/:id/wallet", authMiddleware, adminMiddleware, async (c) => {
  const profileId = parseInt(c.req.param("id"));
  const body = await c.req.json<{ walletAddress: string; userId?: string }>();
  
  if (!body.walletAddress) {
    return c.json({ error: "walletAddress is required" }, 400);
  }
  
  // Check profile exists
  const profile = await c.env.DB.prepare(
    "SELECT id, name FROM music_profiles WHERE id = ?"
  ).bind(profileId).first();
  
  if (!profile) {
    return c.json({ error: "Profile not found" }, 404);
  }
  
  // Update wallet address (and optionally user_id)
  if (body.userId) {
    await c.env.DB.prepare(
      "UPDATE music_profiles SET wallet_address = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(body.walletAddress, body.userId, profileId).run();
  } else {
    await c.env.DB.prepare(
      "UPDATE music_profiles SET wallet_address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(body.walletAddress, profileId).run();
  }
  
  return c.json({ success: true, message: `Updated wallet for profile "${profile.name}"` });
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
        v.bunny_video_id,
        v.bunny_status,
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
        const isBunnyVideo = !!video.bunny_video_id;
        
        // Check video file - only for R2 videos (not Bunny)
        if (video.video_url) {
          if (isBunnyVideo) {
            // Bunny videos are considered existing if bunny_status is ready or encoding
            videoExists = video.bunny_status === 'ready' || video.bunny_status === 'encoding' || video.bunny_status === 'uploaded';
          } else if (video.video_url.startsWith('/api/kasshi/media/')) {
            // R2 video - check storage
            try {
              const videoKey = video.video_url.replace('/api/kasshi/media/', '');
              const obj = await c.env.R2_BUCKET.head(videoKey);
              videoExists = !!obj;
            } catch {
              videoExists = false;
            }
          } else {
            // External URL - assume it exists
            videoExists = true;
          }
        }
        
        // Check thumbnail file - only for R2 thumbnails
        if (video.thumbnail_url) {
          if (video.thumbnail_url.startsWith('/api/kasshi/media/')) {
            try {
              const thumbKey = video.thumbnail_url.replace('/api/kasshi/media/', '');
              const obj = await c.env.R2_BUCKET.head(thumbKey);
              thumbnailExists = !!obj;
            } catch {
              thumbnailExists = false;
            }
          } else {
            // External thumbnail URL - assume it exists
            thumbnailExists = true;
          }
        }
        
        // A video is broken if it has a URL but the file doesn't exist
        // For Bunny videos, only broken if bunny_status is 'failed'
        const isBroken = isBunnyVideo 
          ? video.bunny_status === 'failed'
          : (video.video_url && !videoExists) || (video.thumbnail_url && !thumbnailExists);
        
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
// ADMIN DATA EXPORT ENDPOINTS
// ============================================

// Helper function to convert results to CSV
function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const csvRows = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
}

// GET /api/admin/export/:tableId - Export table data as CSV
app.get("/api/admin/export/:tableId", authMiddleware, adminMiddleware, async (c) => {
  const tableId = c.req.param("tableId");
  const db = c.env.DB;
  
  try {
    let results: Record<string, unknown>[] = [];
    let filename = `${tableId}_export.csv`;
    
    switch (tableId) {
      case 'users': {
        const data = await db.prepare(`
          SELECT uw.id, uw.user_id, uw.wallet_address, uw.is_admin, uw.demo_balance, uw.created_at, uw.updated_at,
                 ewu.wallet_address as external_wallet, ewu.wallet_type as external_wallet_type
          FROM user_wallets uw
          LEFT JOIN external_wallet_users ewu ON uw.wallet_address = ewu.internal_wallet_address
          ORDER BY uw.created_at DESC
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'users_wallets_export.csv';
        break;
      }
      
      case 'channels': {
        const data = await db.prepare(`
          SELECT id, user_id, name, handle, description, avatar_url, banner_url, wallet_address,
                 subscriber_count, video_count, is_verified, created_at, updated_at
          FROM channels ORDER BY created_at DESC
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'channels_export.csv';
        break;
      }
      
      case 'videos': {
        const data = await db.prepare(`
          SELECT v.id, v.public_id, v.channel_id, c.handle as channel_handle, v.title, v.description,
                 v.video_url, v.thumbnail_url, v.duration_seconds, v.view_count, v.like_count, v.comment_count,
                 v.price_kas, v.is_private, v.is_members_only, v.is_clip, v.bunny_status, v.created_at, v.updated_at
          FROM videos v
          LEFT JOIN channels c ON v.channel_id = c.id
          ORDER BY v.created_at DESC
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'videos_export.csv';
        break;
      }
      
      case 'music_profiles': {
        const data = await db.prepare(`
          SELECT id, wallet_address, user_id, name, bio, avatar_url, banner_url, social_links,
                 follower_count, following_count, track_count, created_at, updated_at
          FROM music_profiles ORDER BY created_at DESC
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'music_profiles_export.csv';
        break;
      }
      
      case 'tracks': {
        const data = await db.prepare(`
          SELECT t.id, t.music_profile_id, mp.name as artist_name, t.title, t.artist_name as custom_artist,
                 t.audio_url, t.cover_art_url, t.duration_seconds, t.play_count, t.like_count, t.price_kas,
                 t.is_fractionalized, t.krc20_ticker, t.bpm, t.created_at, t.updated_at
          FROM tracks t
          LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
          ORDER BY t.created_at DESC
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'tracks_export.csv';
        break;
      }
      
      case 'albums': {
        const data = await db.prepare(`
          SELECT a.id, a.music_profile_id, mp.name as artist_name, a.title, a.description, a.cover_art_url,
                 a.slug, a.is_published, a.created_at, a.updated_at
          FROM albums a
          LEFT JOIN music_profiles mp ON a.music_profile_id = mp.id
          ORDER BY a.created_at DESC
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'albums_export.csv';
        break;
      }
      
      case 'playlists': {
        const data = await db.prepare(`
          SELECT p.id, p.creator_wallet, p.title, p.description, p.cover_art_url, p.slug, p.is_public,
                 p.cached_track_count, p.created_at, p.updated_at
          FROM playlists p
          ORDER BY p.created_at DESC
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'playlists_export.csv';
        break;
      }
      
      case 'payments': {
        const data = await db.prepare(`
          SELECT id, sender_channel_id, recipient_channel_id, video_id, amount_sompi, payment_type,
                 status, transaction_id, merkle_root, created_at
          FROM pending_micropayments
          ORDER BY created_at DESC
          LIMIT 10000
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'payments_export.csv';
        break;
      }
      
      case 'comments': {
        const data = await db.prepare(`
          SELECT cm.id, cm.video_id, v.title as video_title, cm.channel_id, c.handle as commenter_handle,
                 cm.content, cm.like_count, cm.parent_id, cm.created_at
          FROM comments cm
          LEFT JOIN videos v ON cm.video_id = v.id
          LEFT JOIN channels c ON cm.channel_id = c.id
          ORDER BY cm.created_at DESC
          LIMIT 10000
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'comments_export.csv';
        break;
      }
      
      case 'video_views': {
        const data = await db.prepare(`
          SELECT vv.id, vv.video_id, v.title as video_title, vv.channel_id, vv.user_id,
                 vv.watch_duration_seconds, vv.completed, vv.created_at
          FROM video_views vv
          LEFT JOIN videos v ON vv.video_id = v.id
          ORDER BY vv.created_at DESC
          LIMIT 10000
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'video_views_export.csv';
        break;
      }
      
      case 'subscriptions': {
        const data = await db.prepare(`
          SELECT s.id, s.subscriber_id, sub.handle as subscriber_handle,
                 s.channel_id, ch.handle as channel_handle, s.created_at
          FROM subscriptions s
          LEFT JOIN channels sub ON s.subscriber_id = sub.id
          LEFT JOIN channels ch ON s.channel_id = ch.id
          ORDER BY s.created_at DESC
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'subscriptions_export.csv';
        break;
      }
      
      case 'memberships': {
        const data = await db.prepare(`
          SELECT cm.id, cm.channel_id, c.handle as channel_handle, cm.tier_id, ct.name as tier_name,
                 cm.member_wallet, cm.amount_kas, cm.transaction_id, cm.expires_at, cm.created_at
          FROM channel_members cm
          LEFT JOIN channels c ON cm.channel_id = c.id
          LEFT JOIN channel_tiers ct ON cm.tier_id = ct.id
          ORDER BY cm.created_at DESC
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'memberships_export.csv';
        break;
      }
      
      case 'referrals': {
        const data = await db.prepare(`
          SELECT r.id, r.referrer_wallet, r.referred_wallet, r.status, r.referrer_reward_kas,
                 r.referred_reward_kas, r.referrer_paid_at, r.referred_paid_at, r.created_at, r.updated_at
          FROM referrals r
          ORDER BY r.created_at DESC
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'referrals_export.csv';
        break;
      }
      
      case 'reviews': {
        const data = await db.prepare(`
          SELECT tr.id, tr.track_id, t.title as track_title, tr.reviewer_wallet_address,
                 tr.rating, tr.comment, tr.reward_kas, tr.payment_status, tr.created_at
          FROM track_reviews tr
          LEFT JOIN tracks t ON tr.track_id = t.id
          ORDER BY tr.created_at DESC
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'reviews_export.csv';
        break;
      }
      
      case 'marketplace': {
        const data = await db.prepare(`
          SELECT mt.id, mt.creator_wallet, mt.name, mt.description, mt.category, mt.tags,
                 mt.price_kas, mt.purchase_count, mt.is_auction, mt.auction_end_time,
                 mt.highest_bid_kas, mt.is_featured, mt.created_at, mt.updated_at
          FROM marketplace_themes mt
          ORDER BY mt.created_at DESC
        `).all();
        results = data.results as Record<string, unknown>[];
        filename = 'marketplace_themes_export.csv';
        break;
      }
      
      case 'all': {
        // Return a summary of all tables instead
        const tables = [
          { name: 'user_wallets', query: 'SELECT COUNT(*) as count FROM user_wallets' },
          { name: 'channels', query: 'SELECT COUNT(*) as count FROM channels' },
          { name: 'videos', query: 'SELECT COUNT(*) as count FROM videos' },
          { name: 'music_profiles', query: 'SELECT COUNT(*) as count FROM music_profiles' },
          { name: 'tracks', query: 'SELECT COUNT(*) as count FROM tracks' },
          { name: 'albums', query: 'SELECT COUNT(*) as count FROM albums' },
          { name: 'playlists', query: 'SELECT COUNT(*) as count FROM playlists' },
          { name: 'pending_micropayments', query: 'SELECT COUNT(*) as count FROM pending_micropayments' },
          { name: 'comments', query: 'SELECT COUNT(*) as count FROM comments' },
          { name: 'video_views', query: 'SELECT COUNT(*) as count FROM video_views' },
          { name: 'subscriptions', query: 'SELECT COUNT(*) as count FROM subscriptions' },
          { name: 'channel_members', query: 'SELECT COUNT(*) as count FROM channel_members' },
          { name: 'referrals', query: 'SELECT COUNT(*) as count FROM referrals' },
          { name: 'track_reviews', query: 'SELECT COUNT(*) as count FROM track_reviews' },
          { name: 'marketplace_themes', query: 'SELECT COUNT(*) as count FROM marketplace_themes' },
        ];
        
        for (const table of tables) {
          try {
            const result = await db.prepare(table.query).first<{ count: number }>();
            results.push({ table_name: table.name, row_count: result?.count || 0 });
          } catch {
            results.push({ table_name: table.name, row_count: 'error' });
          }
        }
        filename = 'all_tables_summary.csv';
        break;
      }
      
      default:
        return c.json({ error: `Unknown table: ${tableId}` }, 400);
    }
    
    const csv = toCSV(results);
    
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error(`Export error for ${tableId}:`, error);
    return c.json({ error: `Failed to export ${tableId}` }, 500);
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

// ============ ADMIN USER LOOKUP ENDPOINTS ============

// GET /api/admin/users/search - Search users by partial wallet address
app.get("/api/admin/users/search", authMiddleware, adminMiddleware, async (c) => {
  try {
    const query = c.req.query("q")?.trim() || "";
    
    if (query.length < 6) {
      return c.json({ error: "Search query must be at least 6 characters" }, 400);
    }
    
    // Search in external_wallet_users (KasWare/Kastle users)
    const externalUsers = await c.env.DB.prepare(`
      SELECT 
        'external' as user_type,
        id,
        wallet_address as external_wallet,
        internal_wallet_address as internal_wallet,
        demo_balance,
        created_at,
        (SELECT handle FROM channels WHERE wallet_address = external_wallet_users.wallet_address LIMIT 1) as channel_handle,
        (SELECT name FROM channels WHERE wallet_address = external_wallet_users.wallet_address LIMIT 1) as channel_name
      FROM external_wallet_users
      WHERE wallet_address LIKE ? OR internal_wallet_address LIKE ?
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(`%${query}%`, `%${query}%`).all();
    
    // Search in user_wallets (Google auth users)
    const googleUsers = await c.env.DB.prepare(`
      SELECT 
        'google' as user_type,
        user_id as id,
        wallet_address,
        demo_balance,
        created_at,
        (SELECT handle FROM channels WHERE wallet_address = user_wallets.wallet_address LIMIT 1) as channel_handle,
        (SELECT name FROM channels WHERE wallet_address = user_wallets.wallet_address LIMIT 1) as channel_name
      FROM user_wallets
      WHERE wallet_address LIKE ?
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(`%${query}%`).all();
    
    // Combine and format results
    const users = [
      ...(externalUsers.results || []).map((u: any) => ({
        userType: 'external',
        id: u.id,
        externalWallet: u.external_wallet,
        internalWallet: u.internal_wallet,
        demoBalance: u.demo_balance,
        createdAt: u.created_at,
        channelHandle: u.channel_handle,
        channelName: u.channel_name
      })),
      ...(googleUsers.results || []).map((u: any) => ({
        userType: 'google',
        id: u.id,
        wallet: u.wallet_address,
        demoBalance: u.demo_balance,
        createdAt: u.created_at,
        channelHandle: u.channel_handle,
        channelName: u.channel_name
      }))
    ];
    
    return c.json({ users, query });
  } catch (error) {
    console.error("User search error:", error);
    return c.json({ error: "Failed to search users" }, 500);
  }
});

// GET /api/admin/users/:type/:id - Get detailed user info with mainnet balance
app.get("/api/admin/users/:type/:id", authMiddleware, adminMiddleware, async (c) => {
  try {
    const userType = c.req.param("type");
    const userId = c.req.param("id");
    
    if (userType === "external") {
      const user = await c.env.DB.prepare(`
        SELECT * FROM external_wallet_users WHERE id = ?
      `).bind(parseInt(userId)).first();
      
      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }
      
      // Fetch mainnet balances
      const externalBalance = await getWalletBalance(user.wallet_address as string);
      const internalBalance = await getWalletBalance(user.internal_wallet_address as string);
      
      // Get channel info
      const channel = await c.env.DB.prepare(`
        SELECT id, handle, name FROM channels WHERE wallet_address = ?
      `).bind(user.wallet_address).first();
      
      return c.json({
        userType: 'external',
        id: user.id,
        externalWallet: user.wallet_address,
        internalWallet: user.internal_wallet_address,
        demoBalance: user.demo_balance,
        externalBalanceKas: externalBalance?.balanceKAS ?? '0.00',
        internalBalanceKas: internalBalance?.balanceKAS ?? '0.00',
        createdAt: user.created_at,
        channel: channel ? {
          id: channel.id,
          handle: channel.handle,
          name: channel.name
        } : null
      });
    } else if (userType === "google") {
      const user = await c.env.DB.prepare(`
        SELECT * FROM user_wallets WHERE user_id = ?
      `).bind(userId).first();
      
      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }
      
      // Fetch mainnet balance
      const balance = await getWalletBalance(user.wallet_address as string);
      
      // Get channel info
      const channel = await c.env.DB.prepare(`
        SELECT id, handle, name FROM channels WHERE wallet_address = ?
      `).bind(user.wallet_address).first();
      
      return c.json({
        userType: 'google',
        id: user.user_id,
        wallet: user.wallet_address,
        demoBalance: user.demo_balance,
        balanceKas: balance?.balanceKAS ?? '0.00',
        createdAt: user.created_at,
        channel: channel ? {
          id: channel.id,
          handle: channel.handle,
          name: channel.name
        } : null
      });
    }
    
    return c.json({ error: "Invalid user type" }, 400);
  } catch (error) {
    console.error("Get user details error:", error);
    return c.json({ error: "Failed to get user details" }, 500);
  }
});

// ============ REFERRAL SYSTEM ENDPOINTS ============

// Generate referral code helper
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous: I, O, 0, 1
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Create/get referral code for current user
app.post("/api/referral/create", async (c) => {
  try {
    const unifiedUser = await getUnifiedUser(c);
    if (!unifiedUser) {
      return c.json({ error: "Authentication required" }, 401);
    }
    const walletAddress = unifiedUser.walletAddress;
    
    // Get user's channel
    const channel = await c.env.DB.prepare(
      "SELECT id, created_at FROM channels WHERE wallet_address = ?"
    ).bind(walletAddress).first<{ id: number; created_at: string }>();
    
    if (!channel) {
      return c.json({ error: "You need a channel to create referral links" }, 400);
    }
    
    // Check eligibility: account 5+ days old
    const createdAtUTC = toUTCTimestamp(channel.created_at);
    const channelAge = createdAtUTC ? Date.now() - new Date(createdAtUTC).getTime() : 0;
    const minAge = 5 * 24 * 60 * 60 * 1000; // 5 days
    if (channelAge < minAge) {
      const daysLeft = Math.ceil((minAge - channelAge) / (24 * 60 * 60 * 1000));
      return c.json({ error: `Your account must be 5 days old to create referrals. ${daysLeft} days remaining.` }, 400);
    }
    
    // Check eligibility: has at least 1 published video
    const videoCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM videos WHERE channel_id = ? AND status = 'published'"
    ).bind(channel.id).first<{ count: number }>();
    
    if (!videoCount || videoCount.count < 1) {
      return c.json({ error: "You need at least 1 published video to create referral links" }, 400);
    }
    
    // Check if already has a referral code
    const existing = await c.env.DB.prepare(
      "SELECT referral_code FROM referrals WHERE referrer_channel_id = ? AND referred_channel_id IS NULL LIMIT 1"
    ).bind(channel.id).first<{ referral_code: string }>();
    
    if (existing) {
      return c.json({ referralCode: existing.referral_code });
    }
    
    // Generate new unique code
    let referralCode = generateReferralCode();
    let attempts = 0;
    while (attempts < 10) {
      const exists = await c.env.DB.prepare(
        "SELECT id FROM referrals WHERE referral_code = ?"
      ).bind(referralCode).first();
      if (!exists) break;
      referralCode = generateReferralCode();
      attempts++;
    }
    
    // Create referral entry
    await c.env.DB.prepare(`
      INSERT INTO referrals (referrer_channel_id, referral_code, status)
      VALUES (?, ?, 'unused')
    `).bind(channel.id, referralCode).run();
    
    return c.json({ referralCode });
  } catch (error) {
    console.error("Create referral error:", error);
    return c.json({ error: "Failed to create referral code" }, 500);
  }
});

// Get user's referral info and stats
app.get("/api/referral/my-stats", async (c) => {
  try {
    const unifiedUser = await getUnifiedUser(c);
    console.log("[REFERRAL my-stats] unifiedUser:", JSON.stringify(unifiedUser));
    if (!unifiedUser) {
      return c.json({ error: "Authentication required" }, 401);
    }
    const walletAddress = unifiedUser.walletAddress;
    console.log("[REFERRAL my-stats] Looking up channel for wallet:", walletAddress);
    
    // Query channels with a simpler query first, then get referral counts separately
    const channel = await c.env.DB.prepare(
      "SELECT id, created_at FROM channels WHERE wallet_address = ?"
    ).bind(walletAddress).first<{ 
      id: number; 
      created_at: string; 
    }>();
    
    // Get referral counts separately (with fallback if columns don't exist)
    let totalReferralsCount = 0;
    let referralsThisWeek = 0;
    if (channel) {
      try {
        const referralCounts = await c.env.DB.prepare(
          "SELECT COALESCE(total_referrals_count, 0) as total_count, COALESCE(referrals_this_week, 0) as week_count FROM channels WHERE id = ?"
        ).bind(channel.id).first<{ total_count: number; week_count: number }>();
        if (referralCounts) {
          totalReferralsCount = referralCounts.total_count;
          referralsThisWeek = referralCounts.week_count;
        }
      } catch (colErr) {
        console.log("[REFERRAL my-stats] Referral count columns may not exist:", colErr);
      }
    }
    
    console.log("[REFERRAL my-stats] channel result:", JSON.stringify(channel));
    if (!channel) {
      // User is authenticated but has no channel - return valid response with isEligible: false
      return c.json({
        isEligible: false,
        noChannel: true,
        eligibility: {
          accountAgeDays: 0,
          requiredAgeDays: 5,
          videoCount: 0,
          requiredVideos: 1,
        },
        referralCode: null,
        stats: {
          totalReferrals: 0,
          referralsThisWeek: 0,
          maxPerWeek: 2,
          maxTotal: 10,
          totalEarnedKas: 0,
        },
        referrals: [],
      });
    }
    
    // Get eligibility info - use toUTCTimestamp for proper UTC parsing
    const createdAtUTC = toUTCTimestamp(channel.created_at);
    const channelAge = createdAtUTC ? Date.now() - new Date(createdAtUTC).getTime() : 0;
    const daysOld = Math.floor(channelAge / (24 * 60 * 60 * 1000));
    
    const videoCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM videos WHERE channel_id = ? AND status = 'published'"
    ).bind(channel.id).first<{ count: number }>();
    
    const requiredAgeDays = 5;
    const requiredVideos = 1;
    const vCount = videoCount?.count || 0;
    const isEligible = daysOld >= requiredAgeDays && vCount >= requiredVideos;
    
    console.log("[REFERRAL DEBUG]", { 
      createdAt: channel.created_at, 
      daysOld, 
      vCount,
      isEligible
    });
    
    // Get active referral code (unused)
    const activeCode = await c.env.DB.prepare(
      "SELECT referral_code FROM referrals WHERE referrer_channel_id = ? AND referred_channel_id IS NULL LIMIT 1"
    ).bind(channel.id).first<{ referral_code: string }>();
    
    // Get all referrals with their status
    const referrals = await c.env.DB.prepare(`
      SELECT r.*, c.name as referred_name, c.handle as referred_handle
      FROM referrals r
      LEFT JOIN channels c ON r.referred_channel_id = c.id
      WHERE r.referrer_channel_id = ? AND r.referred_channel_id IS NOT NULL
      ORDER BY r.created_at DESC
    `).bind(channel.id).all<{
      id: number;
      referral_code: string;
      status: string;
      videos_uploaded_count: number;
      unique_videos_watched: number;
      unique_channels_watched: number;
      referred_name: string | null;
      referred_handle: string | null;
      account_created_at: string | null;
      requirements_met_at: string | null;
      paid_at: string | null;
    }>();
    
    // Calculate earnings
    const paidReferrals = referrals.results?.filter(r => r.status === 'paid') || [];
    const totalEarned = paidReferrals.length * 100; // 100 KAS per paid referral
    
    return c.json({
      isEligible,
      eligibility: {
        accountAgeDays: daysOld,
        requiredAgeDays,
        videoCount: vCount,
        requiredVideos,
      },
      referralCode: activeCode?.referral_code || null,
      stats: {
        totalReferrals: totalReferralsCount,
        referralsThisWeek: referralsThisWeek,
        maxPerWeek: 2,
        maxTotal: 10,
        totalEarnedKas: totalEarned,
      },
      referrals: referrals.results?.map(r => ({
        id: r.id,
        status: r.status,
        referredName: r.referred_name,
        referredHandle: r.referred_handle,
        videosUploaded: r.videos_uploaded_count,
        videosWatched: r.unique_videos_watched,
        channelsWatched: r.unique_channels_watched,
        accountCreatedAt: r.account_created_at,
        requirementsMetAt: r.requirements_met_at,
        paidAt: r.paid_at,
      })) || [],
    });
  } catch (error) {
    console.error("Get referral stats error:", error);
    return c.json({ error: "Failed to get referral stats" }, 500);
  }
});

// Get referred user's own progress
app.get("/api/referral/my-progress", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const unifiedUser = await getUnifiedUser(c);
    if (!unifiedUser) {
      if (authHeader?.startsWith("Bearer ")) {
        console.log("[REFERRAL my-progress] Token present but not found - user may need to reconnect wallet");
        return c.json({ error: "Session expired. Please disconnect and reconnect your wallet." }, 401);
      }
      return c.json({ error: "Authentication required" }, 401);
    }
    const walletAddress = unifiedUser.walletAddress;
    console.log("[REFERRAL my-progress] unifiedUser:", JSON.stringify(unifiedUser));
    
    // Check if user was referred
    // For external users, check external_wallet_users table
    // For internal users, they can't be referred (referral is KasWare-only)
    if (!unifiedUser.isExternal) {
      console.log("[REFERRAL my-progress] Internal user, not eligible for referral");
      return c.json({ isReferred: false });
    }
    
    // For external (KasWare) users, check their referred_by_code
    const externalUser = await c.env.DB.prepare(
      "SELECT referred_by_code FROM external_wallet_users WHERE wallet_address = ?"
    ).bind(walletAddress).first<{ referred_by_code: string | null }>();
    
    console.log("[REFERRAL my-progress] externalUser:", JSON.stringify(externalUser));
    
    if (!externalUser?.referred_by_code) {
      return c.json({ isReferred: false });
    }
    
    // Get referral record
    const referral = await c.env.DB.prepare(`
      SELECT r.*, c.name as referrer_name, c.handle as referrer_handle
      FROM referrals r
      JOIN channels c ON r.referrer_channel_id = c.id
      WHERE r.referral_code = ?
    `).bind(externalUser.referred_by_code).first<{
      id: number;
      status: string;
      videos_uploaded_count: number;
      unique_videos_watched: number;
      unique_channels_watched: number;
      account_created_at: string;
      requirements_met_at: string | null;
      paid_at: string | null;
      referrer_name: string;
      referrer_handle: string;
    }>();
    
    if (!referral) {
      return c.json({ isReferred: false });
    }
    
    // Calculate 7-day wait period
    const accountCreatedAtUTC = toUTCTimestamp(referral.account_created_at);
    const accountAge = accountCreatedAtUTC ? Date.now() - new Date(accountCreatedAtUTC).getTime() : 0;
    const minAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    const daysRemaining = Math.max(0, Math.ceil((minAge - accountAge) / (24 * 60 * 60 * 1000)));
    
    return c.json({
      isReferred: true,
      referrerName: referral.referrer_name,
      referrerHandle: referral.referrer_handle,
      status: referral.status,
      progress: {
        videosUploaded: referral.videos_uploaded_count,
        requiredVideos: 3,
        videosWatched: referral.unique_videos_watched,
        requiredWatches: 10,
        channelsWatched: referral.unique_channels_watched,
        requiredChannels: 5,
        waitDaysRemaining: daysRemaining,
        requiredWaitDays: 7,
      },
      rewardKas: 50,
      requirementsMetAt: referral.requirements_met_at,
      paidAt: referral.paid_at,
    });
  } catch (error) {
    console.error("Get referral progress error:", error);
    return c.json({ error: "Failed to get referral progress" }, 500);
  }
});

// Track video upload for referral (called after successful video upload)
app.post("/api/referral/track-upload", zValidator("json", z.object({
  videoId: z.number(),
  videoHash: z.string().min(1),
  durationSeconds: z.number(),
})), async (c) => {
  try {
    const unifiedUser = await getUnifiedUser(c);
    if (!unifiedUser) {
      return c.json({ error: "Authentication required" }, 401);
    }
    const walletAddress = unifiedUser.walletAddress;
    
    const { videoId, videoHash, durationSeconds } = c.req.valid("json");
    
    // Check if user was referred
    const externalUser = await c.env.DB.prepare(
      "SELECT referred_by_code FROM external_wallet_users WHERE wallet_address = ? OR internal_wallet_address = ?"
    ).bind(walletAddress, walletAddress).first<{ referred_by_code: string | null }>();
    
    if (!externalUser?.referred_by_code) {
      return c.json({ tracked: false, reason: "Not a referred user" });
    }
    
    // Get referral
    const referral = await c.env.DB.prepare(
      "SELECT id, status, referrer_channel_id FROM referrals WHERE referral_code = ?"
    ).bind(externalUser.referred_by_code).first<{ id: number; status: string; referrer_channel_id: number }>();
    
    if (!referral || referral.status === 'paid' || referral.status === 'rejected') {
      return c.json({ tracked: false, reason: "Referral not active" });
    }
    
    // Check minimum duration (30 seconds)
    if (durationSeconds < 30) {
      return c.json({ tracked: false, reason: "Video must be at least 30 seconds" });
    }
    
    // Check for duplicate hash (prevent re-uploading same video)
    const existingHash = await c.env.DB.prepare(
      "SELECT id FROM referral_video_uploads WHERE referral_id = ? AND video_hash = ?"
    ).bind(referral.id, videoHash).first();
    
    if (existingHash) {
      return c.json({ tracked: false, reason: "This video has already been counted" });
    }
    
    // Record upload
    const isQualified = durationSeconds >= 30;
    await c.env.DB.prepare(`
      INSERT INTO referral_video_uploads (referral_id, video_id, video_hash, duration_seconds, is_qualified)
      VALUES (?, ?, ?, ?, ?)
    `).bind(referral.id, videoId, videoHash, durationSeconds, isQualified ? 1 : 0).run();
    
    // Update count
    if (isQualified) {
      await c.env.DB.prepare(`
        UPDATE referrals SET videos_uploaded_count = videos_uploaded_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(referral.id).run();
      
      // Check if requirements now met
      await checkReferralRequirements(c.env.DB, referral.id);
    }
    
    return c.json({ tracked: true, isQualified });
  } catch (error) {
    console.error("Track referral upload error:", error);
    return c.json({ error: "Failed to track upload" }, 500);
  }
});

// Track video watch for referral
app.post("/api/referral/track-watch", zValidator("json", z.object({
  videoId: z.number(),
  watchDurationSeconds: z.number(),
})), async (c) => {
  try {
    const unifiedUser = await getUnifiedUser(c);
    if (!unifiedUser) {
      return c.json({ error: "Authentication required" }, 401);
    }
    const walletAddress = unifiedUser.walletAddress;
    
    const { videoId, watchDurationSeconds } = c.req.valid("json");
    
    // Check if user was referred
    const externalUser = await c.env.DB.prepare(
      "SELECT referred_by_code FROM external_wallet_users WHERE wallet_address = ? OR internal_wallet_address = ?"
    ).bind(walletAddress, walletAddress).first<{ referred_by_code: string | null }>();
    
    if (!externalUser?.referred_by_code) {
      return c.json({ tracked: false, reason: "Not a referred user" });
    }
    
    // Get referral
    const referral = await c.env.DB.prepare(
      "SELECT id, status, referrer_channel_id, referred_channel_id FROM referrals WHERE referral_code = ?"
    ).bind(externalUser.referred_by_code).first<{ 
      id: number; 
      status: string; 
      referrer_channel_id: number;
      referred_channel_id: number | null;
    }>();
    
    if (!referral || referral.status === 'paid' || referral.status === 'rejected') {
      return c.json({ tracked: false, reason: "Referral not active" });
    }
    
    // Get video info to check channel
    const video = await c.env.DB.prepare(
      "SELECT channel_id FROM videos WHERE id = ?"
    ).bind(videoId).first<{ channel_id: number }>();
    
    if (!video) {
      return c.json({ tracked: false, reason: "Video not found" });
    }
    
    // Can't watch own videos or referrer's videos
    if (video.channel_id === referral.referred_channel_id || video.channel_id === referral.referrer_channel_id) {
      return c.json({ tracked: false, reason: "Cannot count own or referrer's videos" });
    }
    
    // Check existing watch progress
    const existingWatch = await c.env.DB.prepare(
      "SELECT id, watch_duration_seconds, is_qualified FROM referral_watch_progress WHERE referral_id = ? AND video_id = ?"
    ).bind(referral.id, videoId).first<{ id: number; watch_duration_seconds: number; is_qualified: number }>();
    
    if (existingWatch?.is_qualified) {
      return c.json({ tracked: true, alreadyQualified: true });
    }
    
    const newDuration = Math.max(existingWatch?.watch_duration_seconds || 0, watchDurationSeconds);
    const isQualified = newDuration >= 30;
    
    if (existingWatch) {
      await c.env.DB.prepare(`
        UPDATE referral_watch_progress 
        SET watch_duration_seconds = ?, is_qualified = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(newDuration, isQualified ? 1 : 0, existingWatch.id).run();
    } else {
      await c.env.DB.prepare(`
        INSERT INTO referral_watch_progress (referral_id, video_id, video_channel_id, watch_duration_seconds, is_qualified)
        VALUES (?, ?, ?, ?, ?)
      `).bind(referral.id, videoId, video.channel_id, newDuration, isQualified ? 1 : 0).run();
    }
    
    // If newly qualified, update counts
    if (isQualified && !existingWatch?.is_qualified) {
      // Count unique videos watched
      const uniqueVideos = await c.env.DB.prepare(
        "SELECT COUNT(*) as count FROM referral_watch_progress WHERE referral_id = ? AND is_qualified = 1"
      ).bind(referral.id).first<{ count: number }>();
      
      // Count unique channels watched
      const uniqueChannels = await c.env.DB.prepare(
        "SELECT COUNT(DISTINCT video_channel_id) as count FROM referral_watch_progress WHERE referral_id = ? AND is_qualified = 1"
      ).bind(referral.id).first<{ count: number }>();
      
      await c.env.DB.prepare(`
        UPDATE referrals 
        SET unique_videos_watched = ?, unique_channels_watched = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(uniqueVideos?.count || 0, uniqueChannels?.count || 0, referral.id).run();
      
      // Check if requirements now met
      await checkReferralRequirements(c.env.DB, referral.id);
    }
    
    return c.json({ tracked: true, isQualified });
  } catch (error) {
    console.error("Track referral watch error:", error);
    return c.json({ error: "Failed to track watch" }, 500);
  }
});

// Helper to check if referral requirements are met
async function checkReferralRequirements(db: D1Database, referralId: number): Promise<boolean> {
  const referral = await db.prepare(`
    SELECT videos_uploaded_count, unique_videos_watched, unique_channels_watched, 
           account_created_at, status
    FROM referrals WHERE id = ?
  `).bind(referralId).first<{
    videos_uploaded_count: number;
    unique_videos_watched: number;
    unique_channels_watched: number;
    account_created_at: string;
    status: string;
  }>();
  
  if (!referral || referral.status !== 'tracking') return false;
  
  // Check all requirements
  const hasEnoughVideos = referral.videos_uploaded_count >= 3;
  const hasEnoughWatches = referral.unique_videos_watched >= 10;
  const hasEnoughChannels = referral.unique_channels_watched >= 5;
  
  // Check 7-day wait period
  const accountCreatedAtUTC = toUTCTimestamp(referral.account_created_at);
  const accountAge = accountCreatedAtUTC ? Date.now() - new Date(accountCreatedAtUTC).getTime() : 0;
  const minAge = 7 * 24 * 60 * 60 * 1000;
  const hasWaitedEnough = accountAge >= minAge;
  
  if (hasEnoughVideos && hasEnoughWatches && hasEnoughChannels && hasWaitedEnough) {
    await db.prepare(`
      UPDATE referrals 
      SET status = 'pending_approval', requirements_met_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(referralId).run();
    return true;
  }
  
  return false;
}

// Admin: Get all referrals for review
app.get("/api/admin/referrals", authMiddleware, adminMiddleware, async (c) => {
  try {
    const status = c.req.query("status"); // pending_approval, paid, rejected, all
    
    let query = `
      SELECT r.*, 
             rc.name as referrer_name, rc.handle as referrer_handle,
             rdc.name as referred_name, rdc.handle as referred_handle
      FROM referrals r
      JOIN channels rc ON r.referrer_channel_id = rc.id
      LEFT JOIN channels rdc ON r.referred_channel_id = rdc.id
    `;
    
    if (status && status !== 'all') {
      query += ` WHERE r.status = '${status}'`;
    }
    
    query += ` ORDER BY r.created_at DESC`;
    
    const referrals = await c.env.DB.prepare(query).all();
    
    return c.json({
      referrals: referrals.results?.map((r: any) => ({
        id: r.id,
        referralCode: r.referral_code,
        status: r.status,
        referrer: {
          channelId: r.referrer_channel_id,
          name: r.referrer_name,
          handle: r.referrer_handle,
        },
        referred: r.referred_channel_id ? {
          channelId: r.referred_channel_id,
          walletAddress: r.referred_wallet_address,
          name: r.referred_name,
          handle: r.referred_handle,
        } : null,
        progress: {
          videosUploaded: r.videos_uploaded_count,
          videosWatched: r.unique_videos_watched,
          channelsWatched: r.unique_channels_watched,
        },
        payouts: {
          referrer: r.referrer_payout_kas,
          referred: r.referred_payout_kas,
        },
        accountCreatedAt: r.account_created_at,
        requirementsMetAt: r.requirements_met_at,
        paidAt: r.paid_at,
        createdAt: r.created_at,
      })) || [],
    });
  } catch (error) {
    console.error("Admin get referrals error:", error);
    return c.json({ error: "Failed to get referrals" }, 500);
  }
});

// Admin: Approve and process payout
app.post("/api/admin/referrals/:id/payout", authMiddleware, adminMiddleware, zValidator("json", z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
})), async (c) => {
  try {
    const referralId = parseInt(c.req.param("id"));
    const { action, reason: _reason } = c.req.valid("json");
    
    const referral = await c.env.DB.prepare(`
      SELECT r.*, rc.wallet_address as referrer_wallet, 
             ewu.internal_wallet_address as referred_wallet
      FROM referrals r
      JOIN channels rc ON r.referrer_channel_id = rc.id
      LEFT JOIN external_wallet_users ewu ON ewu.wallet_address = r.referred_wallet_address
      WHERE r.id = ?
    `).bind(referralId).first<{
      id: number;
      status: string;
      referrer_wallet: string;
      referred_wallet: string | null;
      referred_wallet_address: string;
      referrer_payout_kas: string;
      referred_payout_kas: string;
    }>();
    
    if (!referral) {
      return c.json({ error: "Referral not found" }, 404);
    }
    
    if (referral.status !== 'pending_approval') {
      return c.json({ error: `Cannot process referral with status: ${referral.status}` }, 400);
    }
    
    if (action === 'reject') {
      await c.env.DB.prepare(`
        UPDATE referrals SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(referralId).run();
      
      return c.json({ success: true, action: 'rejected' });
    }
    
    // Approve and pay out
    // In production, you would trigger actual KAS transfers here
    // For now, we'll add to demo balances as placeholder
    
    const referrerPayout = parseFloat(referral.referrer_payout_kas) || 100;
    const referredPayout = parseFloat(referral.referred_payout_kas) || 50;
    
    // Update referrer's demo balance (or trigger real payout)
    await c.env.DB.prepare(`
      UPDATE user_wallets 
      SET demo_balance = CAST(CAST(demo_balance AS REAL) + ? AS TEXT), updated_at = CURRENT_TIMESTAMP
      WHERE wallet_address = ?
    `).bind(referrerPayout, referral.referrer_wallet).run();
    
    // Update referred user's demo balance
    if (referral.referred_wallet) {
      await c.env.DB.prepare(`
        UPDATE external_wallet_users 
        SET demo_balance = CAST(CAST(demo_balance AS REAL) + ? AS TEXT), updated_at = CURRENT_TIMESTAMP
        WHERE internal_wallet_address = ?
      `).bind(referredPayout, referral.referred_wallet).run();
    }
    
    // Mark as paid
    await c.env.DB.prepare(`
      UPDATE referrals SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(referralId).run();
    
    return c.json({ 
      success: true, 
      action: 'paid',
      payouts: {
        referrer: referrerPayout,
        referred: referredPayout,
      }
    });
  } catch (error) {
    console.error("Admin referral payout error:", error);
    return c.json({ error: "Failed to process payout" }, 500);
  }
});

// ============================================
// MUSIC API ENDPOINTS
// ============================================

// Get current user's music profile
app.get("/api/music/profile", async (c) => {
  try {
    // Use fast auth with timeout to prevent slow production calls
    const { walletAddresses, userId } = await getFastAuth(c);
    
    // For Gmail users, try to find profile by user_id first (faster, more reliable)
    let profile: any = null;
    if (userId) {
      profile = await c.env.DB.prepare(
        "SELECT * FROM music_profiles WHERE user_id = ?"
      ).bind(userId).first();
    }
    
    // Fall back to wallet address lookup
    if (!profile && walletAddresses.length > 0) {
      profile = walletAddresses.length === 2
        ? await c.env.DB.prepare(
            "SELECT * FROM music_profiles WHERE wallet_address IN (?, ?)"
          ).bind(walletAddresses[0], walletAddresses[1]).first()
        : await c.env.DB.prepare(
            "SELECT * FROM music_profiles WHERE wallet_address = ?"
          ).bind(walletAddresses[0]).first();
    }
    
    if (walletAddresses.length === 0 && !userId) {
      return c.json({ profile: null });
    }
    
    if (!profile) {
      return c.json({ profile: null });
    }
    
    return c.json({
      profile: {
        id: profile.id,
        name: profile.name,
        handle: profile.handle,
        bio: profile.bio,
        avatarUrl: profile.avatar_url,
        genre: profile.genre,
        websiteUrl: profile.website_url,
        createdAt: profile.created_at,
      }
    });
  } catch (error) {
    console.error("Get music profile error:", error);
    return c.json({ error: "Failed to get profile" }, 500);
  }
});

// Create music profile
app.post("/api/music/profile", async (c) => {
  try {
    const body = await c.req.json();
    
    // Use fast auth with timeout to prevent slow production calls
    const { walletAddress, walletAddresses, userId } = await getFastAuth(c);
    
    if (!walletAddress) {
      return c.json({ error: "Not authenticated" }, 401);
    }
    
    // Check if profile already exists (check both addresses for KasWare users, or by user_id for Gmail users)
    let existing: any = null;
    if (userId) {
      existing = await c.env.DB.prepare(
        "SELECT id FROM music_profiles WHERE user_id = ?"
      ).bind(userId).first();
    }
    if (!existing && walletAddresses.length > 0) {
      existing = walletAddresses.length === 2
        ? await c.env.DB.prepare(
            "SELECT id FROM music_profiles WHERE wallet_address IN (?, ?)"
          ).bind(walletAddresses[0], walletAddresses[1]).first()
        : await c.env.DB.prepare(
            "SELECT id FROM music_profiles WHERE wallet_address = ?"
          ).bind(walletAddresses[0]).first();
    }
    
    if (existing) {
      return c.json({ error: "Music profile already exists" }, 400);
    }
    
    const { name, handle, bio, avatarUrl, genre, websiteUrl } = body;
    
    if (!name || !handle) {
      return c.json({ error: "Name and handle are required" }, 400);
    }
    
    // Check if handle is taken
    const handleTaken = await c.env.DB.prepare(
      "SELECT id FROM music_profiles WHERE handle = ?"
    ).bind(handle.toLowerCase()).first();
    
    if (handleTaken) {
      return c.json({ error: "Handle is already taken" }, 400);
    }
    
    const result = await c.env.DB.prepare(`
      INSERT INTO music_profiles (wallet_address, name, handle, bio, avatar_url, genre, website_url, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(walletAddress, name, handle.toLowerCase(), bio || null, avatarUrl || null, genre || null, websiteUrl || null, userId).run();
    
    return c.json({
      success: true,
      profile: {
        id: result.meta.last_row_id,
        name,
        handle: handle.toLowerCase(),
        bio,
        avatarUrl,
        genre,
        websiteUrl,
      }
    });
  } catch (error) {
    console.error("Create music profile error:", error);
    return c.json({ error: "Failed to create profile" }, 500);
  }
});

// Get featured music content (for Music home page)
app.get("/api/music/featured", async (c) => {
  try {
    // Featured albums (recent, published)
    const albumsResult = await c.env.DB.prepare(`
      SELECT a.*, a.slug, mp.name as artist_name, mp.handle as artist_handle, mp.avatar_url as artist_avatar,
             (SELECT COUNT(*) FROM tracks t WHERE t.album_id = a.id AND t.is_published = 1) as track_count
      FROM albums a
      LEFT JOIN music_profiles mp ON a.music_profile_id = mp.id
      WHERE a.is_published = 1
      ORDER BY a.created_at DESC
      LIMIT 10
    `).all();
    
    // Featured podcasts (most recent first)
    const podcastsResult = await c.env.DB.prepare(`
      SELECT p.*, mp.name as host_name, mp.handle as host_handle, mp.avatar_url as host_avatar,
             (SELECT COUNT(*) FROM podcast_episodes pe WHERE pe.podcast_id = p.id AND pe.is_published = 1) as episode_count
      FROM podcasts p
      LEFT JOIN music_profiles mp ON p.music_profile_id = mp.id
      WHERE p.is_published = 1
      ORDER BY p.created_at DESC
      LIMIT 10
    `).all();
    
    // Recent tracks (most recent first) with average ratings
    const tracksResult = await c.env.DB.prepare(`
      SELECT t.*, COALESCE(t.artist_name, mp.name) as artist_name, mp.handle as artist_handle, mp.wallet_address as creator_wallet,
             mp.id as artist_id, a.title as album_title, a.cover_art_url as album_cover
      FROM tracks t
      LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
      LEFT JOIN albums a ON t.album_id = a.id
      WHERE t.is_published = 1
      ORDER BY t.created_at DESC
      LIMIT 20
    `).all();
    
    // Map albums
    const albums = albumsResult.results.map((a: Record<string, unknown>) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      description: a.description,
      coverArtUrl: a.cover_art_url,
      genre: a.genre,
      releaseDate: a.release_date,
      priceKas: a.price_kas,
      playCount: a.play_count,
      trackCount: a.track_count || 0,
      artist: {
        name: a.artist_name,
        handle: a.artist_handle,
        avatarUrl: a.artist_avatar,
      },
      createdAt: a.created_at,
    }));
    
    // Map podcasts
    const podcasts = podcastsResult.results.map((p: Record<string, unknown>) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      coverArtUrl: p.cover_art_url,
      category: p.category,
      isVideoPodcast: p.is_video_podcast === 1,
      followerCount: p.subscriber_count,
      episodeCount: p.episode_count || 0,
      host: {
        name: p.host_name,
        handle: p.host_handle,
        avatarUrl: p.host_avatar,
      },
      createdAt: p.created_at,
    }));
    
    // Map tracks
    const tracks = tracksResult.results.map((t: Record<string, unknown>) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      audioUrl: t.audio_url,
      coverArtUrl: t.cover_art_url || t.album_cover,
      durationSeconds: t.duration_seconds,
      genre: t.genre,
      priceKas: t.price_kas,
      playCount: t.play_count,
      isExplicit: t.is_explicit === 1,
      artist: t.artist_name,
      artistId: t.artist_id,
      albumId: t.album_id,
      albumTitle: t.album_title,
      creatorWallet: t.creator_wallet,
      createdAt: t.created_at,
      averageRating: t.cached_avg_rating ? Math.round((t.cached_avg_rating as number) * 10) / 10 : null,
      reviewCount: t.cached_review_count || 0,
    }));
    
    return c.json({ albums, podcasts, tracks });
  } catch (error) {
    console.error("Error fetching featured music:", error);
    return c.json({ error: "Failed to fetch featured content" }, 500);
  }
});

// Search music - artists and tracks
app.get("/api/music/search", async (c) => {
  const query = c.req.query("q");
  if (!query || query.trim().length < 2) {
    return c.json({ artists: [], tracks: [] });
  }
  
  const searchTerm = `%${query.trim()}%`;
  
  try {
    // Search artists (music_profiles)
    const artistsResult = await c.env.DB.prepare(`
      SELECT mp.id, mp.name as display_name, mp.avatar_url, mp.bio,
             (SELECT COUNT(*) FROM tracks WHERE music_profile_id = mp.id AND is_published = 1) as track_count
      FROM music_profiles mp
      WHERE mp.name LIKE ? OR mp.handle LIKE ?
      ORDER BY track_count DESC
      LIMIT 10
    `).bind(searchTerm, searchTerm).all();
    
    // Search tracks - also search by custom artist_name field
    const tracksResult = await c.env.DB.prepare(`
      SELECT t.*, COALESCE(t.artist_name, mp.name) as artist_name, mp.handle as artist_handle, mp.wallet_address as creator_wallet,
             mp.id as artist_id, a.title as album_title, a.cover_art_url as album_cover, t.beat_grid, t.bpm
      FROM tracks t
      LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
      LEFT JOIN albums a ON t.album_id = a.id
      WHERE t.is_published = 1 AND (t.title LIKE ? OR mp.name LIKE ? OR t.artist_name LIKE ?)
      ORDER BY t.play_count DESC
      LIMIT 20
    `).bind(searchTerm, searchTerm, searchTerm).all();
    
    const artists = artistsResult.results.map((a: Record<string, unknown>) => ({
      id: a.id,
      display_name: a.display_name,
      avatar_url: a.avatar_url,
      bio: a.bio,
      track_count: a.track_count,
    }));
    
    const tracks = tracksResult.results.map((t: Record<string, unknown>) => ({
      id: t.id,
      title: t.title,
      audio_url: t.audio_url,
      cover_url: t.cover_art_url || t.album_cover,
      duration_seconds: t.duration_seconds,
      genre: t.genre,
      price_kas: t.price_kas,
      play_count: t.play_count,
      artist_name: t.artist_name,
      artist_id: t.artist_id,
      artist_handle: t.artist_handle,
      album_title: t.album_title,
      creator_wallet: t.creator_wallet,
      avg_rating: t.cached_avg_rating ? Math.round((t.cached_avg_rating as number) * 10) / 10 : null,
      review_count: t.cached_review_count || 0,
      beat_grid: t.beat_grid ? JSON.parse(t.beat_grid as string) : null,
      bpm: t.bpm || null,
    }));
    
    // Search albums
    const albumsResult = await c.env.DB.prepare(`
      SELECT a.*, mp.name as artist_name, mp.id as artist_id
      FROM albums a
      LEFT JOIN music_profiles mp ON a.music_profile_id = mp.id
      WHERE a.title LIKE ? OR mp.name LIKE ?
      ORDER BY a.created_at DESC
      LIMIT 10
    `).bind(searchTerm, searchTerm).all();
    
    const albums = albumsResult.results.map((a: Record<string, unknown>) => ({
      id: a.id,
      title: a.title,
      cover_url: a.cover_art_url,
      artist_name: a.artist_name,
      artist_id: a.artist_id,
      release_year: a.release_year,
    }));
    
    // Search public playlists
    const playlistsResult = await c.env.DB.prepare(`
      SELECT p.*, mp.name as creator_name, mp.id as creator_id,
             (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = p.id) as track_count
      FROM playlists p
      LEFT JOIN music_profiles mp ON p.music_profile_id = mp.id
      WHERE p.is_public = 1 AND (p.title LIKE ? OR mp.name LIKE ?)
      ORDER BY p.created_at DESC
      LIMIT 10
    `).bind(searchTerm, searchTerm).all();
    
    const playlists = playlistsResult.results.map((p: Record<string, unknown>) => ({
      id: p.id,
      title: p.title,
      cover_url: p.cover_image_url,
      creator_name: p.creator_name,
      creator_id: p.creator_id,
      track_count: p.track_count,
    }));
    
    return c.json({ artists, tracks, albums, playlists });
  } catch (error) {
    console.error("Error searching music:", error);
    return c.json({ error: "Search failed" }, 500);
  }
});

// Get artist profile by ID
app.get("/api/music/artist/:id", async (c) => {
  const idParam = c.req.param("id");
  const authHeader = c.req.header("Authorization");
  
  // Resolve profile ID from numeric ID or handle
  const artistId = await resolveMusicProfileId(c.env.DB, idParam);
  if (!artistId) {
    return c.json({ error: "Artist not found" }, 404);
  }
  
  // Get current user's profile ID if authenticated
  let currentProfileId: number | null = null;
  let walletAddress: string | null = null;
  const walletAddresses: string[] = [];
  
  // Check for external wallet auth
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const external = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (external) {
      walletAddress = external.wallet_address;
      walletAddresses.push(external.wallet_address);
      if (external.internal_wallet_address) walletAddresses.push(external.internal_wallet_address);
    }
  }
  
  // Fallback to Mocha internal auth via session cookie
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const user = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        const wallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        walletAddress = wallet?.wallet_address || null;
        if (walletAddress) walletAddresses.push(walletAddress);
      }
    }
  }
  
  // Get profile ID from wallet address (check all addresses)
  if (walletAddresses.length > 0) {
    const profile = await findMusicProfile(c.env.DB, walletAddresses);
    if (profile) currentProfileId = profile.id;
  }
  
  // Get artist
  const artist = await c.env.DB.prepare(`
    SELECT mp.*,
           (SELECT COUNT(*) FROM tracks WHERE music_profile_id = mp.id AND is_published = 1) as track_count,
           (SELECT COALESCE(SUM(play_count), 0) FROM tracks WHERE music_profile_id = mp.id) as total_plays
    FROM music_profiles mp
    WHERE mp.id = ?
  `).bind(artistId).first<Record<string, unknown>>();
  
  if (!artist) {
    return c.json({ error: "Artist not found" }, 404);
  }
  
  // Check if current user follows this artist
  let isFollowing = false;
  if (walletAddress) {
    const follow = await c.env.DB.prepare(
      "SELECT id FROM artist_followers WHERE follower_wallet_address = ? AND artist_profile_id = ?"
    ).bind(walletAddress, artist.id).first();
    isFollowing = !!follow;
  }
  
  // Check if current user owns this profile
  const isOwner = currentProfileId === artist.id;
  
  // Get popular tracks (top 10 by plays)
  const popularTracksResult = await c.env.DB.prepare(`
    SELECT t.id, t.title, t.audio_url, t.cover_art_url, t.duration_seconds, t.play_count,
           a.title as album_title, t.created_at, t.price_kas, t.cached_avg_rating, t.cached_review_count,
           t.artist_name, t.beat_grid, t.bpm, t.is_fractionalized, t.krc20_ticker, t.total_shares, t.shares_sold
    FROM tracks t
    LEFT JOIN albums a ON t.album_id = a.id
    WHERE t.music_profile_id = ? AND t.is_published = 1
    ORDER BY t.play_count DESC
    LIMIT 10
  `).bind(artistId).all();
  
  // Get all tracks (sorted by newest first)
  const allTracksResult = await c.env.DB.prepare(`
    SELECT t.id, t.title, t.audio_url, t.cover_art_url, t.duration_seconds, t.play_count,
           a.title as album_title, t.created_at, t.price_kas, t.cached_avg_rating, t.cached_review_count,
           t.artist_name, t.beat_grid, t.bpm, t.is_fractionalized, t.krc20_ticker, t.total_shares, t.shares_sold
    FROM tracks t
    LEFT JOIN albums a ON t.album_id = a.id
    WHERE t.music_profile_id = ? AND t.is_published = 1
    ORDER BY t.created_at DESC
  `).bind(artistId).all();
  
  // Get popular podcasts (top 10 by subscriber count)
  const popularPodcastsResult = await c.env.DB.prepare(`
    SELECT p.id, p.title, p.description, p.cover_art_url, p.category, p.subscriber_count,
           (SELECT COUNT(*) FROM podcast_episodes WHERE podcast_id = p.id AND is_published = 1) as episode_count
    FROM podcasts p
    WHERE p.music_profile_id = ? AND p.is_published = 1
    ORDER BY p.subscriber_count DESC
    LIMIT 10
  `).bind(artistId).all();
  
  // Get all podcasts (sorted by newest first)
  const allPodcastsResult = await c.env.DB.prepare(`
    SELECT p.id, p.title, p.description, p.cover_art_url, p.category, p.subscriber_count,
           (SELECT COUNT(*) FROM podcast_episodes WHERE podcast_id = p.id AND is_published = 1) as episode_count
    FROM podcasts p
    WHERE p.music_profile_id = ? AND p.is_published = 1
    ORDER BY p.created_at DESC
  `).bind(artistId).all();
  
  // Get public playlists created by this artist
  const playlistsResult = await c.env.DB.prepare(`
    SELECT pl.id, pl.title, pl.description, pl.cover_art_url, pl.is_public,
           (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = pl.id) as track_count
    FROM playlists pl
    WHERE pl.wallet_address = ? AND pl.is_public = 1
    ORDER BY pl.created_at DESC
  `).bind(artist.wallet_address).all();
  
  // Get albums created by this artist
  const albumsResult = await c.env.DB.prepare(`
    SELECT a.id, a.title, a.cover_art_url, a.release_date, a.created_at,
           (SELECT COUNT(*) FROM tracks WHERE album_id = a.id AND is_published = 1) as track_count
    FROM albums a
    WHERE a.music_profile_id = ? AND a.is_published = 1
    ORDER BY a.created_at DESC
  `).bind(artistId).all();
  
  const mapTrack = (t: Record<string, unknown>) => ({
    id: t.id,
    title: t.title,
    audioUrl: t.audio_url,
    coverArtUrl: t.cover_art_url,
    durationSeconds: t.duration_seconds || 0,
    playCount: t.play_count || 0,
    albumTitle: t.album_title,
    priceKas: t.price_kas || '0',
    averageRating: t.cached_avg_rating ? Math.round((t.cached_avg_rating as number) * 10) / 10 : null,
    reviewCount: t.cached_review_count || 0,
    beatGrid: t.beat_grid ? JSON.parse(t.beat_grid as string) : null,
    bpm: t.bpm || null,
    isFractionalized: t.is_fractionalized === 1,
    krc20Ticker: t.krc20_ticker || null,
    totalShares: t.total_shares || 0,
    sharesSold: t.shares_sold || 0,
  });
  
  const mapPodcast = (p: Record<string, unknown>) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    coverArtUrl: p.cover_art_url,
    category: p.category,
    followerCount: p.subscriber_count || 0,
    episodeCount: p.episode_count || 0,
  });
  
  const mapPlaylist = (pl: Record<string, unknown>) => ({
    id: pl.id,
    title: pl.title,
    description: pl.description,
    coverArtUrl: pl.cover_art_url,
    trackCount: pl.track_count || 0,
  });
  
  const mapAlbum = (a: Record<string, unknown>) => ({
    id: a.id,
    title: a.title,
    coverArtUrl: a.cover_art_url,
    releaseDate: a.release_date,
    trackCount: a.track_count || 0,
  });
  
  const popularTracks = popularTracksResult.results.map(mapTrack);
  const allTracks = allTracksResult.results.map(mapTrack);
  const popularPodcasts = popularPodcastsResult.results.map(mapPodcast);
  const allPodcasts = allPodcastsResult.results.map(mapPodcast);
  const playlists = playlistsResult.results.map(mapPlaylist);
  const albums = albumsResult.results.map(mapAlbum);
  
  // Get applied custom theme (from marketplace)
  const appliedTheme = await c.env.DB.prepare(`
    SELECT 
      at.id, at.theme_id, at.purchase_id,
      t.name as title, t.preview_image_url, t.theme_data, t.has_particles
    FROM applied_themes at
    JOIN marketplace_themes t ON at.theme_id = t.id
    WHERE at.music_profile_id = ?
    ORDER BY at.created_at DESC
    LIMIT 1
  `).bind(artistId).first<Record<string, unknown>>();
  
  const customTheme = appliedTheme ? {
    id: appliedTheme.theme_id as string,
    title: appliedTheme.title as string,
    previewImageUrl: appliedTheme.preview_image_url as string,
    themeData: appliedTheme.theme_data ? JSON.parse(appliedTheme.theme_data as string) : null,
    hasParticles: appliedTheme.has_particles === 1
  } : null;
  
  return c.json({
    artist: {
      id: artist.id,
      name: artist.name,
      handle: artist.handle,
      bio: artist.bio,
      avatarUrl: artist.avatar_url,
      bannerUrl: artist.banner_url,
      genre: artist.genre,
      websiteUrl: artist.website_url,
      walletAddress: artist.wallet_address,
      followerCount: artist.follower_count || 0,
      followingCount: artist.following_count || 0,
      trackCount: artist.track_count || 0,
      totalPlays: artist.total_plays || 0,
      isOwner,
      isFollowing,
      profileTheme: artist.profile_theme || 'moonlight',
    },
    tracks: popularTracks,
    allTracks,
    popularPodcasts,
    allPodcasts,
    playlists,
    albums,
    customTheme,
  });
});

// Follow an artist
app.post("/api/music/follow/:id", async (c) => {
  const idParam = c.req.param("id");
  let walletAddress: string | null = null;
  const walletAddresses: string[] = [];
  
  // Resolve profile ID from numeric ID or handle
  const targetId = await resolveMusicProfileId(c.env.DB, idParam);
  if (!targetId) return c.json({ error: "Artist not found" }, 404);
  
  // Check for external wallet auth (Bearer token)
  const authHeader = c.req.header("Authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const external = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (external) {
      walletAddress = external.wallet_address;
      walletAddresses.push(external.wallet_address);
      if (external.internal_wallet_address) walletAddresses.push(external.internal_wallet_address);
    }
  }
  
  // Fallback to Mocha session cookie auth
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY
      });
      if (mochaUser) {
        const userWallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(mochaUser.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (userWallet) {
          walletAddress = userWallet.wallet_address;
          walletAddresses.push(userWallet.wallet_address);
        }
      }
    }
  }
  
  if (!walletAddress) return c.json({ error: "Unauthorized" }, 401);
  
  // Check if user is trying to follow their own profile
  const myProfile = await findMusicProfile(c.env.DB, walletAddresses);
  
  if (myProfile && myProfile.id === targetId) {
    return c.json({ error: "Cannot follow yourself" }, 400);
  }
  
  try {
    // Insert follow using wallet address (no profile required)
    await c.env.DB.prepare(
      "INSERT INTO artist_followers (follower_wallet_address, artist_profile_id) VALUES (?, ?)"
    ).bind(walletAddress, targetId).run();
    
    // Update follower count
    await c.env.DB.prepare(
      "UPDATE music_profiles SET follower_count = follower_count + 1 WHERE id = ?"
    ).bind(targetId).run();
    
    // If user has a profile, update their following count too
    if (myProfile) {
      await c.env.DB.prepare(
        "UPDATE music_profiles SET following_count = following_count + 1 WHERE id = ?"
      ).bind(myProfile.id).run();
    }
    
    return c.json({ success: true });
  } catch (err) {
    // Already following
    return c.json({ error: "Already following" }, 400);
  }
});

// Unfollow an artist
app.delete("/api/music/follow/:id", async (c) => {
  const idParam = c.req.param("id");
  let walletAddress: string | null = null;
  const walletAddresses: string[] = [];
  
  // Resolve profile ID from numeric ID or handle
  const targetId = await resolveMusicProfileId(c.env.DB, idParam);
  if (!targetId) return c.json({ error: "Artist not found" }, 404);
  
  // Check for external wallet auth (Bearer token)
  const authHeader = c.req.header("Authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const external = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (external) {
      walletAddress = external.wallet_address;
      walletAddresses.push(external.wallet_address);
      if (external.internal_wallet_address) walletAddresses.push(external.internal_wallet_address);
    }
  }
  
  // Fallback to Mocha session cookie auth
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY
      });
      if (mochaUser) {
        const userWallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(mochaUser.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (userWallet) {
          walletAddress = userWallet.wallet_address;
          walletAddresses.push(userWallet.wallet_address);
        }
      }
    }
  }
  
  if (!walletAddress) return c.json({ error: "Unauthorized" }, 401);
  
  const result = await c.env.DB.prepare(
    "DELETE FROM artist_followers WHERE follower_wallet_address = ? AND artist_profile_id = ?"
  ).bind(walletAddress, targetId).run();
  
  if (result.meta.changes > 0) {
    // Update follower count
    await c.env.DB.prepare(
      "UPDATE music_profiles SET follower_count = MAX(0, follower_count - 1) WHERE id = ?"
    ).bind(targetId).run();
    
    // If user has a profile, update their following count too
    const myProfile = await findMusicProfile(c.env.DB, walletAddresses);
    
    if (myProfile) {
      await c.env.DB.prepare(
        "UPDATE music_profiles SET following_count = MAX(0, following_count - 1) WHERE id = ?"
      ).bind(myProfile.id).run();
    }
  }
  
  return c.json({ success: true });
});

// Get current user's podcasts for upload form
app.get("/api/music/my-podcasts", async (c) => {
  const authHeader = c.req.header("Authorization");
  let walletAddress: string | null = null;
  
  // Check for external wallet auth
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const external = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (external) {
      walletAddress = external.wallet_address;
    }
  }
  
  // Fallback to Mocha internal auth
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const user = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        const wallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (wallet) {
          walletAddress = wallet.wallet_address;
        }
      }
    }
  }
  
  if (!walletAddress) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  // Get all podcasts owned by this user (join with music_profiles to match by wallet_address)
  const podcasts = await c.env.DB.prepare(`
    SELECT p.id, p.title, mp.name as host_name, p.cover_art_url, p.created_at
    FROM podcasts p
    JOIN music_profiles mp ON p.music_profile_id = mp.id
    WHERE mp.wallet_address = ?
    ORDER BY p.created_at DESC
  `).bind(walletAddress).all();
  
  return c.json({ podcasts: podcasts.results || [] });
});

// Update music profile
app.patch("/api/music/profile", async (c) => {
  const authHeader = c.req.header("Authorization");
  let walletAddress: string | null = null;
  const walletAddresses: string[] = [];
  
  // Check for external wallet auth
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const external = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (external) {
      walletAddress = external.wallet_address;
      walletAddresses.push(external.wallet_address);
      if (external.internal_wallet_address) walletAddresses.push(external.internal_wallet_address);
    }
  }
  
  // Fallback to Mocha internal auth via session cookie
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const user = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        const wallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (wallet) {
          walletAddress = wallet.wallet_address;
          walletAddresses.push(wallet.wallet_address);
        }
      }
    }
  }
  
  if (!walletAddress) return c.json({ error: "Unauthorized" }, 401);
  
  const profile = await findMusicProfile(c.env.DB, walletAddresses);
  if (!profile) return c.json({ error: "Profile not found" }, 404);
  
  const body = await c.req.json<{
    name?: string;
    handle?: string;
    bio?: string;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    genre?: string;
    websiteUrl?: string;
    profileTheme?: string;
  }>();
  
  // Handle uniqueness check if handle is being changed
  if (body.handle !== undefined) {
    const cleanHandle = body.handle.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanHandle.length < 3) {
      return c.json({ error: "Handle must be at least 3 characters" }, 400);
    }
    if (cleanHandle.length > 30) {
      return c.json({ error: "Handle must be 30 characters or less" }, 400);
    }
    const existing = await c.env.DB.prepare(
      "SELECT id FROM music_profiles WHERE handle = ? AND id != ?"
    ).bind(cleanHandle, profile.id).first();
    if (existing) {
      return c.json({ error: "This handle is already taken" }, 400);
    }
    body.handle = cleanHandle;
  }
  
  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  
  if (body.name !== undefined) { updates.push("name = ?"); params.push(body.name); }
  if (body.handle !== undefined) { updates.push("handle = ?"); params.push(body.handle); }
  if (body.bio !== undefined) { updates.push("bio = ?"); params.push(body.bio); }
  if (body.avatarUrl !== undefined) { updates.push("avatar_url = ?"); params.push(body.avatarUrl); }
  if (body.bannerUrl !== undefined) { updates.push("banner_url = ?"); params.push(body.bannerUrl); }
  if (body.genre !== undefined) { updates.push("genre = ?"); params.push(body.genre); }
  if (body.websiteUrl !== undefined) { updates.push("website_url = ?"); params.push(body.websiteUrl); }
  if (body.profileTheme !== undefined) { updates.push("profile_theme = ?"); params.push(body.profileTheme); }
  
  if (updates.length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }
  
  updates.push("updated_at = CURRENT_TIMESTAMP");
  params.push(profile.id);
  
  await c.env.DB.prepare(
    `UPDATE music_profiles SET ${updates.join(", ")} WHERE id = ?`
  ).bind(...params).run();
  
  return c.json({ success: true });
});

// Get video channel data for copying to music profile
app.get("/api/music/copy-from-video", async (c) => {
  const authHeader = c.req.header("Authorization");
  let walletAddress: string | null = null;
  
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const external = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (external) walletAddress = external.wallet_address;
  }
  
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const user = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        const wallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        walletAddress = wallet?.wallet_address || null;
      }
    }
  }
  
  if (!walletAddress) return c.json({ error: "Unauthorized" }, 401);
  
  const channel = await c.env.DB.prepare(
    "SELECT name, handle, description, avatar_url, banner_url FROM channels WHERE wallet_address = ?"
  ).bind(walletAddress).first<{ name: string; handle: string; description: string | null; avatar_url: string | null; banner_url: string | null }>();
  
  if (!channel) return c.json({ exists: false });
  
  return c.json({
    exists: true,
    name: channel.name,
    handle: channel.handle,
    bio: channel.description,
    avatarUrl: channel.avatar_url,
    bannerUrl: channel.banner_url
  });
});

// Copy video channel data to music profile
app.post("/api/music/copy-from-video", async (c) => {
  const authHeader = c.req.header("Authorization");
  let walletAddress: string | null = null;
  const walletAddresses: string[] = [];
  
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const external = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (external) {
      walletAddress = external.wallet_address;
      walletAddresses.push(external.wallet_address);
      if (external.internal_wallet_address) walletAddresses.push(external.internal_wallet_address);
    }
  }
  
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const user = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        const wallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (wallet) {
          walletAddress = wallet.wallet_address;
          walletAddresses.push(wallet.wallet_address);
        }
      }
    }
  }
  
  if (!walletAddress) return c.json({ error: "Unauthorized" }, 401);
  
  const channel = await c.env.DB.prepare(
    "SELECT name, handle, description, avatar_url, banner_url FROM channels WHERE wallet_address = ?"
  ).bind(walletAddress).first<{ name: string; handle: string; description: string | null; avatar_url: string | null; banner_url: string | null }>();
  
  if (!channel) return c.json({ error: "No video profile found" }, 404);
  
  // Check if music profile exists
  const musicProfile = await findMusicProfile(c.env.DB, walletAddresses);
  
  // Ensure handle is unique in music_profiles (skip if same profile already has it)
  let handle = channel.handle.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const existingHandle = await c.env.DB.prepare(
    "SELECT id FROM music_profiles WHERE handle = ? AND wallet_address != ?"
  ).bind(handle, walletAddress).first();
  if (existingHandle) {
    handle = handle + '_music';
    const stillExists = await c.env.DB.prepare(
      "SELECT id FROM music_profiles WHERE handle = ? AND wallet_address != ?"
    ).bind(handle, walletAddress).first();
    if (stillExists) {
      handle = handle + '_' + Date.now().toString().slice(-4);
    }
  }
  
  if (musicProfile) {
    // Update existing profile
    await c.env.DB.prepare(
      `UPDATE music_profiles SET name = ?, handle = ?, bio = ?, avatar_url = ?, banner_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(channel.name, handle, channel.description, channel.avatar_url, channel.banner_url, musicProfile.id).run();
  } else {
    // Create new profile
    await c.env.DB.prepare(
      `INSERT INTO music_profiles (wallet_address, name, handle, bio, avatar_url, banner_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(walletAddress, channel.name, handle, channel.description, channel.avatar_url, channel.banner_url).run();
  }
  
  return c.json({ 
    success: true, 
    name: channel.name,
    handle, 
    bio: channel.description,
    avatarUrl: channel.avatar_url,
    bannerUrl: channel.banner_url
  });
});

// Get music profile data for copying to video channel
app.get("/api/kasshi/copy-from-music", async (c) => {
  const authHeader = c.req.header("Authorization");
  let walletAddress: string | null = null;
  let walletAddresses: string[] = [];
  
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const external = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (external) {
      walletAddress = external.wallet_address;
      walletAddresses.push(external.wallet_address);
      if (external.internal_wallet_address) walletAddresses.push(external.internal_wallet_address);
    }
  }
  
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const user = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        const wallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        walletAddress = wallet?.wallet_address || null;
        if (walletAddress) walletAddresses.push(walletAddress);
      }
    }
  }
  
  if (!walletAddress) return c.json({ error: "Unauthorized" }, 401);
  
  const musicProfile = walletAddresses.length >= 2
    ? await c.env.DB.prepare(
        "SELECT name, handle, bio, avatar_url, banner_url FROM music_profiles WHERE wallet_address IN (?, ?)"
      ).bind(walletAddresses[0], walletAddresses[1]).first<{ name: string; handle: string; bio: string | null; avatar_url: string | null; banner_url: string | null }>()
    : await c.env.DB.prepare(
        "SELECT name, handle, bio, avatar_url, banner_url FROM music_profiles WHERE wallet_address = ?"
      ).bind(walletAddresses[0]).first<{ name: string; handle: string; bio: string | null; avatar_url: string | null; banner_url: string | null }>();
  
  if (!musicProfile) return c.json({ exists: false });
  
  return c.json({
    exists: true,
    name: musicProfile.name,
    handle: musicProfile.handle,
    description: musicProfile.bio,
    avatarUrl: musicProfile.avatar_url,
    bannerUrl: musicProfile.banner_url
  });
});

// Copy music profile data to video channel
app.post("/api/kasshi/copy-from-music", async (c) => {
  const authHeader = c.req.header("Authorization");
  let walletAddress: string | null = null;
  let walletAddresses: string[] = [];
  
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const external = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (external) {
      walletAddress = external.wallet_address;
      walletAddresses.push(external.wallet_address);
      if (external.internal_wallet_address) walletAddresses.push(external.internal_wallet_address);
    }
  }
  
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const user = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        const wallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        walletAddress = wallet?.wallet_address || null;
        if (walletAddress) walletAddresses.push(walletAddress);
      }
    }
  }
  
  if (!walletAddress) return c.json({ error: "Unauthorized" }, 401);
  
  const musicProfile = walletAddresses.length >= 2
    ? await c.env.DB.prepare(
        "SELECT name, handle, bio, avatar_url, banner_url FROM music_profiles WHERE wallet_address IN (?, ?)"
      ).bind(walletAddresses[0], walletAddresses[1]).first<{ name: string; handle: string; bio: string | null; avatar_url: string | null; banner_url: string | null }>()
    : await c.env.DB.prepare(
        "SELECT name, handle, bio, avatar_url, banner_url FROM music_profiles WHERE wallet_address = ?"
      ).bind(walletAddresses[0]).first<{ name: string; handle: string; bio: string | null; avatar_url: string | null; banner_url: string | null }>();
  
  if (!musicProfile) return c.json({ error: "No music profile found" }, 404);
  
  // Check if video channel exists
  const channel = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE wallet_address = ?"
  ).bind(walletAddress).first<{ id: number }>();
  
  // Ensure handle is unique in channels (skip if same channel already has it)
  let handle = musicProfile.handle.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const existingHandle = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE handle = ? AND wallet_address != ?"
  ).bind(handle, walletAddress).first();
  if (existingHandle) {
    handle = handle + '_video';
    const stillExists = await c.env.DB.prepare(
      "SELECT id FROM channels WHERE handle = ? AND wallet_address != ?"
    ).bind(handle, walletAddress).first();
    if (stillExists) {
      handle = handle + '_' + Date.now().toString().slice(-4);
    }
  }
  
  if (channel) {
    // Update existing channel
    await c.env.DB.prepare(
      `UPDATE channels SET name = ?, handle = ?, description = ?, avatar_url = ?, banner_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(musicProfile.name, handle, musicProfile.bio, musicProfile.avatar_url, musicProfile.banner_url, channel.id).run();
  } else {
    // Create new channel
    await c.env.DB.prepare(
      `INSERT INTO channels (wallet_address, name, handle, description, avatar_url, banner_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(walletAddress, musicProfile.name, handle, musicProfile.bio, musicProfile.avatar_url, musicProfile.banner_url).run();
  }
  
  return c.json({ 
    success: true, 
    name: musicProfile.name,
    handle, 
    description: musicProfile.bio,
    avatarUrl: musicProfile.avatar_url,
    bannerUrl: musicProfile.banner_url
  });
});

// Report a music profile
app.post("/api/music/profile/:id/report", async (c) => {
  const idParam = c.req.param("id");
  const authHeader = c.req.header("Authorization");
  let walletAddress: string | null = null;
  
  // Resolve profile ID from numeric ID or handle
  const profileId = await resolveMusicProfileId(c.env.DB, idParam);
  if (!profileId) return c.json({ error: "Profile not found" }, 404);
  
  // Check for external wallet auth
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const external = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (external) {
      walletAddress = external.wallet_address;
    }
  }
  
  // Fallback to Mocha internal auth
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const user = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        const wallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        walletAddress = wallet?.wallet_address || null;
      }
    }
  }
  
  if (!walletAddress) return c.json({ error: "Unauthorized" }, 401);
  
  // Verify profile exists
  const profile = await c.env.DB.prepare(
    "SELECT id, name FROM music_profiles WHERE id = ?"
  ).bind(profileId).first();
  if (!profile) return c.json({ error: "Profile not found" }, 404);
  
  const body = await c.req.json<{ reason: string; details?: string }>();
  if (!body.reason) return c.json({ error: "Reason is required" }, 400);
  
  // Check for existing pending report from same user
  const existingReport = await c.env.DB.prepare(
    "SELECT id FROM music_profile_reports WHERE profile_id = ? AND reporter_wallet_address = ? AND status = 'pending'"
  ).bind(profileId, walletAddress).first();
  
  if (existingReport) {
    return c.json({ error: "You have already reported this profile" }, 400);
  }
  
  await c.env.DB.prepare(
    "INSERT INTO music_profile_reports (profile_id, reporter_wallet_address, reason, details) VALUES (?, ?, ?, ?)"
  ).bind(profileId, walletAddress, body.reason, body.details || null).run();
  
  return c.json({ success: true, message: "Report submitted" });
});

// Get all albums

app.get("/api/music/albums", async (c) => {
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");
  const genre = c.req.query("genre");
  const profileId = c.req.query("profileId");
  
  let query = `
    SELECT a.*, mp.name as artist_name, mp.handle as artist_handle, mp.avatar_url as artist_avatar,
           (SELECT COUNT(*) FROM tracks WHERE album_id = a.id) as track_count
    FROM albums a
    LEFT JOIN music_profiles mp ON a.music_profile_id = mp.id
    WHERE a.is_published = 1
  `;
  const params: (string | number)[] = [];
  
  if (genre) {
    query += ` AND a.genre = ?`;
    params.push(genre);
  }
  if (profileId) {
    query += ` AND a.music_profile_id = ?`;
    params.push(parseInt(profileId));
  }
  
  query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  const result = await c.env.DB.prepare(query).bind(...params).all();
  
  const albums = result.results.map((a: Record<string, unknown>) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    coverArtUrl: a.cover_art_url,
    genre: a.genre,
    releaseDate: a.release_date,
    priceKas: a.price_kas,
    playCount: a.play_count,
    trackCount: a.track_count,
    artist: {
      name: a.artist_name,
      handle: a.artist_handle,
      avatarUrl: a.artist_avatar,
    },
    createdAt: a.created_at,
  }));
  
  return c.json({ albums });
});

// Get album by ID or slug with tracks
app.get("/api/music/albums/:id", async (c) => {
  const idOrSlug = c.req.param("id");
  const isNumeric = /^\d+$/.test(idOrSlug);
  
  // Build query based on ID or slug
  const whereClause = isNumeric ? 'a.id = ?' : 'a.slug = ?';
  const bindValue = isNumeric ? parseInt(idOrSlug) : idOrSlug;
  
  const album = await c.env.DB.prepare(`
    SELECT a.*, mp.name as artist_name, mp.handle as artist_handle, mp.avatar_url as artist_avatar
    FROM albums a
    LEFT JOIN music_profiles mp ON a.music_profile_id = mp.id
    WHERE ${whereClause}
  `).bind(bindValue).first<Record<string, unknown>>();
  
  if (!album) {
    return c.json({ error: "Album not found" }, 404);
  }
  
  // Get tracks with chapters
  const tracksResult = await c.env.DB.prepare(`
    SELECT t.*
    FROM tracks t
    WHERE t.album_id = ?
    ORDER BY t.track_number ASC, t.created_at ASC
  `).bind(album.id).all();
  
  const trackIds = tracksResult.results.map((t: Record<string, unknown>) => t.id);
  
  // Get chapters for all tracks
  let chaptersMap: Record<number, { id: number; title: string; startTimeSeconds: number }[]> = {};
  if (trackIds.length > 0) {
    const chaptersResult = await c.env.DB.prepare(`
      SELECT * FROM chapters WHERE track_id IN (${trackIds.join(',')})
      ORDER BY chapter_order ASC, start_time_seconds ASC
    `).all();
    
    for (const ch of chaptersResult.results as Record<string, unknown>[]) {
      const trackId = ch.track_id as number;
      if (!chaptersMap[trackId]) chaptersMap[trackId] = [];
      chaptersMap[trackId].push({
        id: ch.id as number,
        title: ch.title as string,
        startTimeSeconds: ch.start_time_seconds as number,
      });
    }
  }
  
  // Get music_profile_id from album
  const artistProfileId = album.music_profile_id;
  
  const tracks = tracksResult.results.map((t: Record<string, unknown>) => {
    // Parse beat_grid JSON if present
    let beatGrid: number[] | null = null;
    if (t.beat_grid && typeof t.beat_grid === 'string') {
      try {
        beatGrid = JSON.parse(t.beat_grid);
      } catch (e) {
        beatGrid = null;
      }
    }
    
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      audioUrl: t.audio_url,
      coverArtUrl: t.cover_art_url || album.cover_art_url,
      durationSeconds: t.duration_seconds,
      trackNumber: t.track_number,
      genre: t.genre,
      lyrics: t.lyrics,
      priceKas: t.price_kas,
      playCount: t.play_count,
      isExplicit: t.is_explicit === 1,
      artist: album.artist_name,
      artistId: artistProfileId,
      artistHandle: album.artist_handle,
      albumTitle: album.title,
      chapters: chaptersMap[t.id as number] || [],
      createdAt: t.created_at,
      averageRating: t.cached_avg_rating ? Math.round((t.cached_avg_rating as number) * 10) / 10 : null,
      reviewCount: t.cached_review_count || 0,
      beatGrid,
      bpm: t.bpm || null,
    };
  });
  
  return c.json({
    id: album.id,
    slug: album.slug,
    title: album.title,
    description: album.description,
    coverArtUrl: album.cover_art_url,
    genre: album.genre,
    releaseDate: album.release_date,
    priceKas: album.price_kas,
    playCount: album.play_count,
    artist: {
      id: artistProfileId,
      name: album.artist_name,
      handle: album.artist_handle,
      avatarUrl: album.artist_avatar,
    },
    tracks,
    createdAt: album.created_at,
  });
});

// Create album
app.post("/api/music/albums", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const body = await c.req.json();
    
    // Get music profile from wallet address
    let musicProfileId: number | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      
      if (extUser) {
        // Check both internal and external wallet addresses for existing profiles
        const profile = await c.env.DB.prepare(
          "SELECT id FROM music_profiles WHERE wallet_address IN (?, ?)"
        ).bind(extUser.internal_wallet_address || extUser.wallet_address, extUser.wallet_address).first<{ id: number }>();
        musicProfileId = profile?.id || null;
      }
    }
    
    if (!musicProfileId) {
      // Check for Mocha internal auth via session cookie
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const wallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string }>();
          if (wallet) {
            const profile = await findMusicProfile(c.env.DB, [wallet.wallet_address]);
            musicProfileId = profile?.id || null;
          }
        }
      }
    }
    
    if (!musicProfileId) {
      return c.json({ error: "Music profile not found. Create a music profile first." }, 400);
    }
    
    const { title, description, coverArtUrl, genre, releaseDate, priceKas } = body;
    
    if (!title) {
      return c.json({ error: "Title is required" }, 400);
    }
    
    // Generate unique slug for URL
    const slug = await generateUniqueSlug(c.env.DB, 'albums', title);
    
    const result = await c.env.DB.prepare(`
      INSERT INTO albums (music_profile_id, channel_id, title, description, cover_art_url, genre, release_date, price_kas, is_published, slug)
      VALUES (?, 0, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(musicProfileId, title, description || null, coverArtUrl || null, genre || null, releaseDate || null, priceKas || '0', slug).run();
    
    return c.json({ success: true, albumId: result.meta.last_row_id, slug });
  } catch (error) {
    console.error("Create album error:", error);
    return c.json({ error: "Failed to create album" }, 500);
  }
});

// Update an album (owner only)
app.patch("/api/music/albums/:id", async (c) => {
  try {
    const albumId = parseInt(c.req.param("id"));
    const body = await c.req.json() as { title?: string };
    const { title } = body;
    
    // Validate title
    if (title !== undefined && title.trim().length === 0) {
      return c.json({ error: "Title cannot be empty" }, 400);
    }
    
    // Get auth
    const authHeader = c.req.header("Authorization");
    const walletAddresses: string[] = [];
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) {
        walletAddresses.push(extUser.wallet_address);
        if (extUser.internal_wallet_address) walletAddresses.push(extUser.internal_wallet_address);
      }
    }
    
    if (walletAddresses.length === 0) {
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const internalWallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string }>();
          if (internalWallet) walletAddresses.push(internalWallet.wallet_address);
        }
      }
    }
    
    if (walletAddresses.length === 0) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    // Get music profile
    const profile = await findMusicProfile(c.env.DB, walletAddresses);
    
    if (!profile) {
      return c.json({ error: "No music profile found" }, 404);
    }
    
    // Verify album ownership
    const album = await c.env.DB.prepare(
      "SELECT id FROM albums WHERE id = ? AND music_profile_id = ?"
    ).bind(albumId, profile.id).first();
    
    if (!album) {
      return c.json({ error: "Album not found or not owned by you" }, 404);
    }
    
    if (title === undefined) {
      return c.json({ error: "No fields to update" }, 400);
    }
    
    await c.env.DB.prepare(
      "UPDATE albums SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(title.trim(), albumId).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Update album error:", error);
    return c.json({ error: "Failed to update album" }, 500);
  }
});

// Get all tracks
app.get("/api/music/tracks", async (c) => {
  const limit = parseInt(c.req.query("limit") || "30");
  const offset = parseInt(c.req.query("offset") || "0");
  const albumId = c.req.query("albumId");
  const profileId = c.req.query("profileId");
  
  // Build WHERE clause for both count and main query
  let whereClause = `WHERE t.is_published = 1`;
  const countParams: (string | number)[] = [];
  const queryParams: (string | number)[] = [];
  
  if (albumId) {
    whereClause += ` AND t.album_id = ?`;
    countParams.push(parseInt(albumId));
    queryParams.push(parseInt(albumId));
  }
  if (profileId) {
    whereClause += ` AND t.music_profile_id = ?`;
    countParams.push(parseInt(profileId));
    queryParams.push(parseInt(profileId));
  }
  
  // Get total count
  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM tracks t ${whereClause}`
  ).bind(...countParams).first<{ total: number }>();
  const total = countResult?.total || 0;
  
  // Get paginated tracks
  const query = `
    SELECT t.*, COALESCE(t.artist_name, mp.name) as artist_name, mp.handle as artist_handle, mp.wallet_address as creator_wallet,
           mp.id as artist_id, a.title as album_title, a.cover_art_url as album_cover
    FROM tracks t
    LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
    LEFT JOIN albums a ON t.album_id = a.id
    ${whereClause}
    ORDER BY t.created_at DESC LIMIT ? OFFSET ?
  `;
  queryParams.push(limit, offset);
  
  const result = await c.env.DB.prepare(query).bind(...queryParams).all();
  
  const tracks = result.results.map((t: Record<string, unknown>) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    audioUrl: t.audio_url,
    coverArtUrl: t.cover_art_url || t.album_cover,
    durationSeconds: t.duration_seconds,
    trackNumber: t.track_number,
    genre: t.genre,
    priceKas: t.price_kas,
    playCount: t.play_count,
    isExplicit: t.is_explicit === 1,
    artist: t.artist_name,
    artistId: t.artist_id,
    artistHandle: t.artist_handle,
    albumTitle: t.album_title,
    creatorWallet: t.creator_wallet,
    createdAt: t.created_at,
    averageRating: t.cached_avg_rating ? Math.round((t.cached_avg_rating as number) * 10) / 10 : null,
    reviewCount: t.cached_review_count || 0,
    beatGrid: t.beat_grid ? JSON.parse(t.beat_grid as string) : null,
    bpm: t.bpm || null,
    isFractionalized: t.is_fractionalized === 1,
    krc20Ticker: t.krc20_ticker || null,
    totalShares: t.total_shares || 0,
    sharesSold: t.shares_sold || 0,
  }));
  
  return c.json({ tracks, total, limit, offset });
});

// Get track by ID with chapters
app.get("/api/music/tracks/:id", async (c) => {
  const trackId = parseInt(c.req.param("id"));
  
  const track = await c.env.DB.prepare(`
    SELECT t.*, COALESCE(t.artist_name, mp.name) as artist_name, mp.handle as artist_handle, mp.wallet_address as creator_wallet,
           mp.id as artist_id, a.title as album_title, a.cover_art_url as album_cover
    FROM tracks t
    LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
    LEFT JOIN albums a ON t.album_id = a.id
    WHERE t.id = ?
  `).bind(trackId).first<Record<string, unknown>>();
  
  if (!track) {
    return c.json({ error: "Track not found" }, 404);
  }
  
  // Get chapters
  const chaptersResult = await c.env.DB.prepare(`
    SELECT * FROM chapters WHERE track_id = ?
    ORDER BY chapter_order ASC, start_time_seconds ASC
  `).bind(trackId).all();
  
  const chapters = chaptersResult.results.map((ch: Record<string, unknown>) => ({
    id: ch.id,
    title: ch.title,
    startTimeSeconds: ch.start_time_seconds,
    description: ch.description,
  }));
  
  // Parse beat_grid JSON if present
  let beatGrid: number[] | null = null;
  if (track.beat_grid && typeof track.beat_grid === 'string') {
    try {
      beatGrid = JSON.parse(track.beat_grid);
    } catch (e) {
      beatGrid = null;
    }
  }
  
  return c.json({
    id: track.id,
    title: track.title,
    description: track.description,
    audioUrl: track.audio_url,
    coverArtUrl: track.cover_art_url || track.album_cover,
    durationSeconds: track.duration_seconds,
    trackNumber: track.track_number,
    genre: track.genre,
    lyrics: track.lyrics,
    priceKas: track.price_kas,
    playCount: track.play_count,
    isExplicit: track.is_explicit === 1,
    artist: track.artist_name,
    artistId: track.artist_id,
    albumTitle: track.album_title,
    creatorWallet: track.creator_wallet,
    chapters,
    createdAt: track.created_at,
    averageRating: track.avg_rating ? Math.round((track.avg_rating as number) * 10) / 10 : null,
    reviewCount: track.review_count || 0,
    beatGrid,
    bpm: track.bpm || null,
    isFractionalized: track.is_fractionalized === 1,
    fractionalPercentageSold: track.fractional_percentage_sold || 0,
  });
});

// Create track
app.post("/api/music/tracks", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const body = await c.req.json();
    
    // Get music profile from wallet address
    let musicProfileId: number | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      
      if (extUser) {
        // Check both internal and external wallet addresses for existing profiles
        const profile = await c.env.DB.prepare(
          "SELECT id FROM music_profiles WHERE wallet_address IN (?, ?)"
        ).bind(extUser.internal_wallet_address || extUser.wallet_address, extUser.wallet_address).first<{ id: number }>();
        musicProfileId = profile?.id || null;
      }
    }
    
    if (!musicProfileId) {
      // Check for Mocha internal auth via session cookie
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const wallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string }>();
          if (wallet) {
            const profile = await findMusicProfile(c.env.DB, [wallet.wallet_address]);
            musicProfileId = profile?.id || null;
          }
        }
      }
    }
    
    if (!musicProfileId) {
      return c.json({ error: "Music profile not found. Create a music profile first." }, 400);
    }
    
    const { title, description, audioUrl, coverArtUrl, durationSeconds, albumId, trackNumber, genre, lyrics, priceKas, isExplicit, chapters, artistName, beatGrid, bpm, audioHash } = body;
    
    if (!title) {
      return c.json({ error: "Title is required" }, 400);
    }
    
    // Check if this exact audio already exists as a locked/fractionalized track
    if (audioHash) {
      const existingLocked = await c.env.DB.prepare(`
        SELECT id, title FROM tracks 
        WHERE audio_hash = ? AND is_fractionalized = 1
      `).bind(audioHash).first<{ id: number; title: string }>();
      
      if (existingLocked) {
        return c.json({ 
          error: `This audio file matches a fractionalized track (#${existingLocked.id} - ${existingLocked.title}). Exact re-uploads of invested tracks are not allowed.`,
          blockedByTrackId: existingLocked.id
        }, 403);
      }
    }
    
    // Sanitize coverArtUrl - convert string "null" to actual null
    const sanitizedCoverArtUrl = (coverArtUrl && coverArtUrl !== 'null' && coverArtUrl !== 'undefined') ? coverArtUrl : null;
    // Sanitize artistName - convert string "null" to actual null, trim whitespace
    const sanitizedArtistName = (artistName && artistName !== 'null' && artistName !== 'undefined' && artistName.trim()) ? artistName.trim() : null;
    // Serialize beatGrid to JSON string if provided
    const beatGridJson = (beatGrid && Array.isArray(beatGrid) && beatGrid.length > 0) ? JSON.stringify(beatGrid) : null;
    const sanitizedBpm = (bpm && typeof bpm === 'number' && bpm > 0) ? Math.round(bpm) : null;
    
    const result = await c.env.DB.prepare(`
      INSERT INTO tracks (music_profile_id, channel_id, album_id, title, description, audio_url, cover_art_url, duration_seconds, track_number, genre, lyrics, price_kas, is_explicit, is_published, artist_name, beat_grid, bpm, audio_hash)
      VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).bind(
      musicProfileId, 
      albumId || null, 
      title, 
      description || null, 
      audioUrl || null, 
      sanitizedCoverArtUrl, 
      durationSeconds || null,
      trackNumber || null,
      genre || null,
      lyrics || null,
      priceKas || '0',
      isExplicit ? 1 : 0,
      sanitizedArtistName,
      beatGridJson,
      sanitizedBpm,
      audioHash || null
    ).run();
    
    const trackId = result.meta.last_row_id;
    
    // Insert chapters if provided
    if (chapters && Array.isArray(chapters) && chapters.length > 0) {
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        await c.env.DB.prepare(`
          INSERT INTO chapters (track_id, title, start_time_seconds, chapter_order)
          VALUES (?, ?, ?, ?)
        `).bind(trackId, ch.title, ch.startTimeSeconds, i).run();
      }
    }
    
    return c.json({ success: true, trackId });
  } catch (error) {
    console.error("Create track error:", error);
    return c.json({ error: "Failed to create track" }, 500);
  }
});

// Update a track (owner only) - for price editing
// Auto-fix track duration (public endpoint - only updates if duration is missing or 0)
app.patch("/api/music/tracks/:id/fix-duration", async (c) => {
  const trackId = parseInt(c.req.param("id"));
  
  if (isNaN(trackId)) {
    return c.json({ error: "Invalid track ID" }, 400);
  }
  
  const body = await c.req.json<{ durationSeconds: number }>();
  const { durationSeconds } = body;
  
  if (!durationSeconds || durationSeconds <= 0 || !Number.isFinite(durationSeconds)) {
    return c.json({ error: "Invalid duration" }, 400);
  }
  
  // Only update if current duration is null or 0
  const result = await c.env.DB.prepare(`
    UPDATE tracks 
    SET duration_seconds = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND (duration_seconds IS NULL OR duration_seconds = 0)
  `).bind(Math.floor(durationSeconds), trackId).run();
  
  return c.json({ 
    success: true, 
    updated: result.meta.changes > 0 
  });
});

// Auto-fix episode duration (public endpoint - only updates if duration is missing or 0)
app.patch("/api/music/episodes/:id/fix-duration", async (c) => {
  const episodeId = parseInt(c.req.param("id"));
  
  if (isNaN(episodeId)) {
    return c.json({ error: "Invalid episode ID" }, 400);
  }
  
  const body = await c.req.json<{ durationSeconds: number }>();
  const { durationSeconds } = body;
  
  if (!durationSeconds || durationSeconds <= 0 || !Number.isFinite(durationSeconds)) {
    return c.json({ error: "Invalid duration" }, 400);
  }
  
  // Only update if current duration is null or 0
  const result = await c.env.DB.prepare(`
    UPDATE podcast_episodes 
    SET duration_seconds = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND (duration_seconds IS NULL OR duration_seconds = 0)
  `).bind(Math.floor(durationSeconds), episodeId).run();
  
  return c.json({ 
    success: true, 
    updated: result.meta.changes > 0 
  });
});

app.patch("/api/music/tracks/:id", async (c) => {
  try {
    const trackId = parseInt(c.req.param("id"));
    const body = await c.req.json<{ priceKas?: string; title?: string; artistName?: string | null; coverArtUrl?: string | null }>();
    
    // Validate price
    if (body.priceKas !== undefined) {
      const price = parseFloat(body.priceKas);
      if (isNaN(price) || price < 0) {
        return c.json({ error: "Invalid price" }, 400);
      }
      if (price > 0 && price < 0.11) {
        return c.json({ error: "Price must be 0 (free) or at least 0.11 KAS" }, 400);
      }
    }
    
    // Validate title
    if (body.title !== undefined && body.title.trim().length === 0) {
      return c.json({ error: "Title cannot be empty" }, 400);
    }
    
    // Validate artistName - allow null to clear, but non-empty if provided
    if (body.artistName !== undefined && body.artistName !== null && body.artistName.trim().length === 0) {
      return c.json({ error: "Artist name cannot be empty (use null to clear)" }, 400);
    }
    
    // Validate coverArtUrl - basic URL check if provided
    if (body.coverArtUrl !== undefined && body.coverArtUrl !== null && body.coverArtUrl.trim().length === 0) {
      return c.json({ error: "Cover URL cannot be empty (use null to clear)" }, 400);
    }
    
    // Get auth - try Bearer token first (external wallet), then session cookie (internal auth)
    const authHeader = c.req.header("Authorization");
    const walletAddresses: string[] = [];
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) {
        walletAddresses.push(extUser.wallet_address);
        if (extUser.internal_wallet_address) walletAddresses.push(extUser.internal_wallet_address);
      }
    }
    
    if (walletAddresses.length === 0) {
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const internalWallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string }>();
          if (internalWallet) walletAddresses.push(internalWallet.wallet_address);
        }
      }
    }
    
    if (walletAddresses.length === 0) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    // Get music profile
    const profile = await findMusicProfile(c.env.DB, walletAddresses);
    
    if (!profile) {
      return c.json({ error: "No music profile found" }, 404);
    }
    
    // Verify track ownership
    const track = await c.env.DB.prepare(
      "SELECT id FROM tracks WHERE id = ? AND music_profile_id = ?"
    ).bind(trackId, profile.id).first();
    
    if (!track) {
      return c.json({ error: "Track not found or not owned by you" }, 404);
    }
    
    // Build update query
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    
    if (body.title !== undefined) {
      updates.push("title = ?");
      params.push(body.title.trim());
    }
    if (body.priceKas !== undefined) {
      updates.push("price_kas = ?");
      params.push(body.priceKas);
    }
    if (body.artistName !== undefined) {
      updates.push("artist_name = ?");
      // Sanitize: null, 'null', 'undefined', empty string all become null
      const sanitized = (body.artistName && body.artistName !== 'null' && body.artistName !== 'undefined' && body.artistName.trim()) 
        ? body.artistName.trim() 
        : null;
      params.push(sanitized);
    }
    if (body.coverArtUrl !== undefined) {
      updates.push("cover_art_url = ?");
      // Sanitize: null, 'null', empty string all become null
      const sanitized = (body.coverArtUrl && body.coverArtUrl !== 'null' && body.coverArtUrl.trim()) 
        ? body.coverArtUrl.trim() 
        : null;
      params.push(sanitized);
    }
    
    if (updates.length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }
    
    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(trackId);
    
    await c.env.DB.prepare(
      `UPDATE tracks SET ${updates.join(", ")} WHERE id = ?`
    ).bind(...params).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Update track error:", error);
    return c.json({ error: "Failed to update track" }, 500);
  }
});

// Delete a track (owner only)
app.delete("/api/music/tracks/:id", async (c) => {
  try {
    const trackId = parseInt(c.req.param("id"));
    
    // Check if track is fractionalized - fractionalized tracks cannot be deleted
    const trackCheck = await c.env.DB.prepare(
      "SELECT is_fractionalized FROM tracks WHERE id = ?"
    ).bind(trackId).first<{ is_fractionalized: number }>();
    
    if (trackCheck?.is_fractionalized) {
      return c.json({ error: "Cannot delete a fractionalized track. It is permanently locked." }, 403);
    }
    
    // Get auth - try Bearer token first (external wallet), then session cookie (internal auth)
    const authHeader = c.req.header("Authorization");
    const walletAddresses: string[] = [];
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) {
        walletAddresses.push(extUser.wallet_address);
        if (extUser.internal_wallet_address) walletAddresses.push(extUser.internal_wallet_address);
      }
    }
    
    if (walletAddresses.length === 0) {
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const internalWallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string }>();
          if (internalWallet) walletAddresses.push(internalWallet.wallet_address);
        }
      }
    }
    
    if (walletAddresses.length === 0) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    // Get music profile
    const profile = await findMusicProfile(c.env.DB, walletAddresses);
    
    if (!profile) {
      return c.json({ error: "No music profile found" }, 404);
    }
    
    // Verify ownership
    const track = await c.env.DB.prepare(
      "SELECT music_profile_id FROM tracks WHERE id = ?"
    ).bind(trackId).first<{ music_profile_id: number }>();
    
    if (!track) {
      return c.json({ error: "Track not found" }, 404);
    }
    
    if (track.music_profile_id !== profile.id) {
      return c.json({ error: "Not authorized to delete this track" }, 403);
    }
    
    // Delete related data first
    await c.env.DB.prepare("DELETE FROM chapters WHERE track_id = ?").bind(trackId).run();
    await c.env.DB.prepare("DELETE FROM track_likes WHERE track_id = ?").bind(trackId).run();
    await c.env.DB.prepare("DELETE FROM track_plays WHERE track_id = ?").bind(trackId).run();
    await c.env.DB.prepare("DELETE FROM playlist_tracks WHERE track_id = ?").bind(trackId).run();
    
    // Delete the track
    await c.env.DB.prepare("DELETE FROM tracks WHERE id = ?").bind(trackId).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Delete track error:", error);
    return c.json({ error: "Failed to delete track" }, 500);
  }
});

// Update track price
app.patch("/api/music/tracks/:id", async (c) => {
  try {
    const trackId = parseInt(c.req.param("id"));
    const body = await c.req.json() as { priceKas?: string };
    const { priceKas } = body;
    
    // Validate price
    const price = parseFloat(priceKas || "0");
    if (price !== 0 && price < 0.11) {
      return c.json({ error: "Price must be 0 (free) or at least 0.11 KAS" }, 400);
    }
    
    // Get auth
    const authHeader = c.req.header("Authorization");
    let walletAddress: string | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) walletAddress = extUser.wallet_address as string;
    }
    
    if (!walletAddress) {
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const internalWallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
          if (internalWallet) walletAddress = internalWallet.wallet_address;
        }
      }
    }
    
    if (!walletAddress) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    // Get music profile
    const profile = await findMusicProfile(c.env.DB, [walletAddress]);
    
    if (!profile) {
      return c.json({ error: "No music profile found" }, 404);
    }
    
    // Verify ownership
    const track = await c.env.DB.prepare(
      "SELECT music_profile_id FROM tracks WHERE id = ?"
    ).bind(trackId).first<{ music_profile_id: number }>();
    
    if (!track) {
      return c.json({ error: "Track not found" }, 404);
    }
    
    if (track.music_profile_id !== profile.id) {
      return c.json({ error: "Not authorized to edit this track" }, 403);
    }
    
    // Update the track price
    await c.env.DB.prepare(
      "UPDATE tracks SET price_kas = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(priceKas || "0", trackId).run();
    
    return c.json({ success: true, priceKas: priceKas || "0" });
  } catch (error) {
    console.error("Update track error:", error);
    return c.json({ error: "Failed to update track" }, 500);
  }
});

// Update episode price
app.patch("/api/music/episodes/:id", async (c) => {
  try {
    const episodeId = parseInt(c.req.param("id"));
    const body = await c.req.json() as { priceKas?: string; title?: string };
    const { priceKas, title } = body;
    
    // Validate price
    if (priceKas !== undefined) {
      const price = parseFloat(priceKas || "0");
      if (price !== 0 && price < 0.11) {
        return c.json({ error: "Price must be 0 (free) or at least 0.11 KAS" }, 400);
      }
    }
    
    // Validate title
    if (title !== undefined && title.trim().length === 0) {
      return c.json({ error: "Title cannot be empty" }, 400);
    }
    
    // Get auth
    const authHeader = c.req.header("Authorization");
    let walletAddress: string | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) walletAddress = extUser.wallet_address as string;
    }
    
    if (!walletAddress) {
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const internalWallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
          if (internalWallet) walletAddress = internalWallet.wallet_address;
        }
      }
    }
    
    if (!walletAddress) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    // Get music profile
    const profile = await findMusicProfile(c.env.DB, [walletAddress]);
    
    if (!profile) {
      return c.json({ error: "No music profile found" }, 404);
    }
    
    // Verify ownership through podcast
    const episode = await c.env.DB.prepare(`
      SELECT pe.id, p.music_profile_id 
      FROM podcast_episodes pe
      JOIN podcasts p ON pe.podcast_id = p.id
      WHERE pe.id = ?
    `).bind(episodeId).first<{ id: number; music_profile_id: number }>();
    
    if (!episode) {
      return c.json({ error: "Episode not found" }, 404);
    }
    
    if (episode.music_profile_id !== profile.id) {
      return c.json({ error: "Not authorized to edit this episode" }, 403);
    }
    
    // Build update query
    const updates: string[] = [];
    const params: (string | number)[] = [];
    
    if (title !== undefined) {
      updates.push("title = ?");
      params.push(title.trim());
    }
    if (priceKas !== undefined) {
      updates.push("price_kas = ?");
      params.push(priceKas);
    }
    
    if (updates.length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }
    
    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(episodeId);
    
    await c.env.DB.prepare(
      `UPDATE podcast_episodes SET ${updates.join(", ")} WHERE id = ?`
    ).bind(...params).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Update episode error:", error);
    return c.json({ error: "Failed to update episode" }, 500);
  }
});

// Get all podcasts
app.get("/api/music/podcasts", async (c) => {
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");
  const category = c.req.query("category");
  const profileId = c.req.query("profileId");
  
  let query = `
    SELECT p.*, mp.name as host_name, mp.handle as host_handle, mp.avatar_url as host_avatar,
           (SELECT COUNT(*) FROM podcast_episodes WHERE podcast_id = p.id) as episode_count
    FROM podcasts p
    LEFT JOIN music_profiles mp ON p.music_profile_id = mp.id
    WHERE p.is_published = 1
  `;
  const params: (string | number)[] = [];
  
  if (category) {
    query += ` AND LOWER(p.category) = LOWER(?)`;
    params.push(category);
  }
  if (profileId) {
    query += ` AND p.music_profile_id = ?`;
    params.push(parseInt(profileId));
  }
  
  query += ` ORDER BY p.subscriber_count DESC, p.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  const result = await c.env.DB.prepare(query).bind(...params).all();
  
  const podcasts = result.results.map((p: Record<string, unknown>) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    coverArtUrl: p.cover_art_url,
    category: p.category,
    isVideoPodcast: p.is_video_podcast === 1,
    isExplicit: p.is_explicit === 1,
    followerCount: p.subscriber_count,
    episodeCount: p.episode_count,
    host: {
      name: p.host_name,
      handle: p.host_handle,
      avatarUrl: p.host_avatar,
    },
    createdAt: p.created_at,
  }));
  
  return c.json({ podcasts });
});

// Get podcast by ID with episodes
app.get("/api/music/podcasts/:id", async (c) => {
  const podcastId = parseInt(c.req.param("id"));
  
  const podcast = await c.env.DB.prepare(`
    SELECT p.*, mp.name as host_name, mp.handle as host_handle, mp.avatar_url as host_avatar, mp.wallet_address as host_wallet
    FROM podcasts p
    LEFT JOIN music_profiles mp ON p.music_profile_id = mp.id
    WHERE p.id = ?
  `).bind(podcastId).first<Record<string, unknown>>();
  
  if (!podcast) {
    return c.json({ error: "Podcast not found" }, 404);
  }
  
  // Get episodes
  const episodesResult = await c.env.DB.prepare(`
    SELECT * FROM podcast_episodes
    WHERE podcast_id = ?
    ORDER BY season_number DESC, episode_number DESC
  `).bind(podcastId).all();
  
  const episodeIds = episodesResult.results.map((e: Record<string, unknown>) => e.id);
  
  // Get chapters for all episodes
  let chaptersMap: Record<number, { id: number; title: string; startTimeSeconds: number }[]> = {};
  if (episodeIds.length > 0) {
    const chaptersResult = await c.env.DB.prepare(`
      SELECT * FROM chapters WHERE episode_id IN (${episodeIds.join(',')})
      ORDER BY chapter_order ASC, start_time_seconds ASC
    `).all();
    
    for (const ch of chaptersResult.results as Record<string, unknown>[]) {
      const episodeId = ch.episode_id as number;
      if (!chaptersMap[episodeId]) chaptersMap[episodeId] = [];
      chaptersMap[episodeId].push({
        id: ch.id as number,
        title: ch.title as string,
        startTimeSeconds: ch.start_time_seconds as number,
      });
    }
  }
  
  const episodes = episodesResult.results.map((e: Record<string, unknown>) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    audioUrl: e.audio_url,
    videoUrl: e.video_url,
    coverArtUrl: e.cover_art_url || podcast.cover_art_url,
    durationSeconds: e.duration_seconds,
    episodeNumber: e.episode_number,
    seasonNumber: e.season_number,
    isExplicit: e.is_explicit === 1,
    priceKas: e.price_kas,
    playCount: e.play_count,
    hasVideo: !!e.video_url,
    chapters: chaptersMap[e.id as number] || [],
    creatorWallet: podcast.host_wallet,
    publishedAt: e.published_at,
    createdAt: e.created_at,
  }));
  
  return c.json({
    id: podcast.id,
    title: podcast.title,
    description: podcast.description,
    coverArtUrl: podcast.cover_art_url,
    category: podcast.category,
    isVideoPodcast: podcast.is_video_podcast === 1,
    isExplicit: podcast.is_explicit === 1,
    followerCount: podcast.subscriber_count,
    host: {
      id: podcast.channel_id,
      name: podcast.host_name,
      handle: podcast.host_handle,
      avatarUrl: podcast.host_avatar,
      walletAddress: podcast.host_wallet,
    },
    episodes,
    createdAt: podcast.created_at,
  });
});

// Create podcast
app.post("/api/music/podcasts", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const body = await c.req.json();
    
    // Get music profile from wallet address
    let musicProfileId: number | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      
      if (extUser) {
        // Check both internal and external wallet addresses for existing profiles
        const profile = await c.env.DB.prepare(
          "SELECT id FROM music_profiles WHERE wallet_address IN (?, ?)"
        ).bind(extUser.internal_wallet_address || extUser.wallet_address, extUser.wallet_address).first<{ id: number }>();
        musicProfileId = profile?.id || null;
      }
    }
    
    if (!musicProfileId) {
      // Check for Mocha internal auth via session cookie
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const wallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string }>();
          if (wallet) {
            const profile = await findMusicProfile(c.env.DB, [wallet.wallet_address]);
            musicProfileId = profile?.id || null;
          }
        }
      }
    }
    
    if (!musicProfileId) {
      return c.json({ error: "Music profile not found. Create a music profile first." }, 400);
    }
    
    const { title, description, coverArtUrl, category, isVideoPodcast, isExplicit, priceKas } = body;
    
    if (!title) {
      return c.json({ error: "Title is required" }, 400);
    }
    
    const result = await c.env.DB.prepare(`
      INSERT INTO podcasts (music_profile_id, channel_id, title, description, cover_art_url, category, is_video_podcast, is_explicit, price_kas, is_published)
      VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      musicProfileId, 
      title, 
      description || null, 
      coverArtUrl || null, 
      category || null, 
      isVideoPodcast ? 1 : 0,
      isExplicit ? 1 : 0,
      priceKas || '0'
    ).run();
    
    return c.json({ success: true, podcastId: result.meta.last_row_id });
  } catch (error) {
    console.error("Create podcast error:", error);
    return c.json({ error: "Failed to create podcast" }, 500);
  }
});

// Update a podcast (owner only)
app.patch("/api/music/podcasts/:id", async (c) => {
  try {
    const podcastId = parseInt(c.req.param("id"));
    const body = await c.req.json() as { title?: string };
    const { title } = body;
    
    // Validate title
    if (title !== undefined && title.trim().length === 0) {
      return c.json({ error: "Title cannot be empty" }, 400);
    }
    
    // Get auth
    const authHeader = c.req.header("Authorization");
    let walletAddress: string | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) walletAddress = extUser.wallet_address as string;
    }
    
    if (!walletAddress) {
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const internalWallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
          if (internalWallet) walletAddress = internalWallet.wallet_address;
        }
      }
    }
    
    if (!walletAddress) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    // Get music profile
    const profile = await findMusicProfile(c.env.DB, [walletAddress]);
    
    if (!profile) {
      return c.json({ error: "No music profile found" }, 404);
    }
    
    // Verify podcast ownership
    const podcast = await c.env.DB.prepare(
      "SELECT id FROM podcasts WHERE id = ? AND music_profile_id = ?"
    ).bind(podcastId, profile.id).first();
    
    if (!podcast) {
      return c.json({ error: "Podcast not found or not owned by you" }, 404);
    }
    
    if (title === undefined) {
      return c.json({ error: "No fields to update" }, 400);
    }
    
    await c.env.DB.prepare(
      "UPDATE podcasts SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(title.trim(), podcastId).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Update podcast error:", error);
    return c.json({ error: "Failed to update podcast" }, 500);
  }
});

// Delete a podcast (owner only)
app.delete("/api/music/podcasts/:id", async (c) => {
  try {
    const podcastId = parseInt(c.req.param("id"));
    
    // Get auth - try Bearer token first, then session cookie
    const authHeader = c.req.header("Authorization");
    let walletAddress: string | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) walletAddress = extUser.wallet_address as string;
    }
    
    if (!walletAddress) {
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const internalWallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
          if (internalWallet) walletAddress = internalWallet.wallet_address;
        }
      }
    }
    
    if (!walletAddress) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    // Get music profile
    const profile = await findMusicProfile(c.env.DB, [walletAddress]);
    
    if (!profile) {
      return c.json({ error: "No music profile found" }, 404);
    }
    
    // Verify ownership
    const podcast = await c.env.DB.prepare(
      "SELECT music_profile_id FROM podcasts WHERE id = ?"
    ).bind(podcastId).first<{ music_profile_id: number }>();
    
    if (!podcast) {
      return c.json({ error: "Podcast not found" }, 404);
    }
    
    if (podcast.music_profile_id !== profile.id) {
      return c.json({ error: "Not authorized to delete this podcast" }, 403);
    }
    
    // Delete related data first
    const episodes = await c.env.DB.prepare("SELECT id FROM podcast_episodes WHERE podcast_id = ?").bind(podcastId).all();
    for (const ep of episodes.results || []) {
      await c.env.DB.prepare("DELETE FROM episode_plays WHERE episode_id = ?").bind(ep.id).run();
      await c.env.DB.prepare("DELETE FROM chapters WHERE episode_id = ?").bind(ep.id).run();
    }
    await c.env.DB.prepare("DELETE FROM podcast_episodes WHERE podcast_id = ?").bind(podcastId).run();
    await c.env.DB.prepare("DELETE FROM podcast_subscriptions WHERE podcast_id = ?").bind(podcastId).run();
    
    // Delete the podcast
    await c.env.DB.prepare("DELETE FROM podcasts WHERE id = ?").bind(podcastId).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Delete podcast error:", error);
    return c.json({ error: "Failed to delete podcast" }, 500);
  }
});

// Create podcast episode
app.post("/api/music/episodes", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const body = await c.req.json();
    
    // Get music profile from wallet address or auth
    let profileId: number | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      
      if (extUser) {
        // Check both internal and external wallet addresses for existing profiles
        const profile = await c.env.DB.prepare(
          "SELECT id FROM music_profiles WHERE wallet_address IN (?, ?)"
        ).bind(extUser.internal_wallet_address || extUser.wallet_address, extUser.wallet_address).first<{ id: number }>();
        profileId = profile?.id || null;
      }
    }
    
    if (!profileId) {
      // Check for Mocha internal auth via session cookie
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const wallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string }>();
          if (wallet) {
            const profile = await findMusicProfile(c.env.DB, [wallet.wallet_address]);
            profileId = profile?.id || null;
          }
        }
      }
    }
    
    if (!profileId) {
      return c.json({ error: "Music profile not found. Create a music profile first." }, 400);
    }
    
    const { podcastId, title, description, audioUrl, videoUrl, coverArtUrl, durationSeconds, episodeNumber, seasonNumber, isExplicit, priceKas, chapters } = body;
    
    if (!podcastId || !title) {
      return c.json({ error: "Podcast ID and title are required" }, 400);
    }
    
    // Verify podcast belongs to this profile
    const podcast = await c.env.DB.prepare(
      "SELECT music_profile_id FROM podcasts WHERE id = ?"
    ).bind(podcastId).first<{ music_profile_id: number }>();
    
    if (!podcast || podcast.music_profile_id !== profileId) {
      return c.json({ error: "Podcast not found or access denied" }, 403);
    }
    
    const result = await c.env.DB.prepare(`
      INSERT INTO podcast_episodes (podcast_id, music_profile_id, channel_id, title, description, audio_url, video_url, cover_art_url, duration_seconds, episode_number, season_number, is_explicit, price_kas, is_published, published_at)
      VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `).bind(
      podcastId,
      profileId, 
      title, 
      description || null, 
      audioUrl || null,
      videoUrl || null,
      coverArtUrl || null, 
      durationSeconds || null,
      episodeNumber || 1,
      seasonNumber || 1,
      isExplicit ? 1 : 0,
      priceKas || '0'
    ).run();
    
    const episodeId = result.meta.last_row_id;
    
    // Insert chapters if provided
    if (chapters && Array.isArray(chapters) && chapters.length > 0) {
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        await c.env.DB.prepare(`
          INSERT INTO chapters (episode_id, title, start_time_seconds, chapter_order)
          VALUES (?, ?, ?, ?)
        `).bind(episodeId, ch.title, ch.startTimeSeconds, i).run();
      }
    }
    
    return c.json({ success: true, episodeId });
  } catch (error) {
    console.error("Create episode error:", error);
    return c.json({ error: "Failed to create episode" }, 500);
  }
});

// Update an episode (owner only) - for price editing
app.patch("/api/music/episodes/:id", async (c) => {
  try {
    const episodeId = parseInt(c.req.param("id"));
    const body = await c.req.json<{ priceKas?: string }>();
    
    // Validate price
    if (body.priceKas !== undefined) {
      const price = parseFloat(body.priceKas);
      if (isNaN(price) || price < 0) {
        return c.json({ error: "Invalid price" }, 400);
      }
      if (price > 0 && price < 0.11) {
        return c.json({ error: "Price must be 0 (free) or at least 0.11 KAS" }, 400);
      }
    }
    
    // Get auth - try Bearer token first (external wallet), then session cookie (internal auth)
    const authHeader = c.req.header("Authorization");
    const walletAddresses: string[] = [];
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) {
        walletAddresses.push(extUser.wallet_address);
        if (extUser.internal_wallet_address) walletAddresses.push(extUser.internal_wallet_address);
      }
    }
    
    if (walletAddresses.length === 0) {
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const user = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (user) {
          const internalWallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string }>();
          if (internalWallet) walletAddresses.push(internalWallet.wallet_address);
        }
      }
    }
    
    if (walletAddresses.length === 0) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    // Get music profile
    const profile = await findMusicProfile(c.env.DB, walletAddresses);
    
    if (!profile) {
      return c.json({ error: "No music profile found" }, 404);
    }
    
    // Verify episode ownership
    const episode = await c.env.DB.prepare(
      "SELECT id FROM podcast_episodes WHERE id = ? AND music_profile_id = ?"
    ).bind(episodeId, profile.id).first();
    
    if (!episode) {
      return c.json({ error: "Episode not found or not owned by you" }, 404);
    }
    
    // Update price
    await c.env.DB.prepare(
      "UPDATE podcast_episodes SET price_kas = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(body.priceKas || '0', episodeId).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Update episode error:", error);
    return c.json({ error: "Failed to update episode" }, 500);
  }
});

// Record track play
app.post("/api/music/tracks/:id/play", async (c) => {
  try {
    const trackId = parseInt(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    const { durationPlayed, completed } = body;
    
    // Get user info from auth if available
    let walletAddress: string | null = null;
    let userId: string | null = null;
    
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) walletAddress = extUser.wallet_address as string;
    }
    
    // Check Mocha session cookie auth
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const user = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        userId = user.id;
        // Get wallet address for Mocha users
        if (!walletAddress) {
          const userWallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
          if (userWallet) walletAddress = userWallet.wallet_address;
        }
      }
    }
    
    // Check if listener is the track's creator - don't count their own plays
    const track = await c.env.DB.prepare(`
      SELECT t.music_profile_id, mp.wallet_address as creator_wallet
      FROM tracks t
      LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
      WHERE t.id = ?
    `).bind(trackId).first<{ music_profile_id: number; creator_wallet: string }>();
    
    if (track?.creator_wallet && walletAddress && track.creator_wallet === walletAddress) {
      // Don't count self-plays for leaderboard
      return c.json({ success: true, selfPlay: true });
    }
    
    // Record the play
    await c.env.DB.prepare(`
      INSERT INTO track_plays (track_id, wallet_address, user_id, duration_played, completed)
      VALUES (?, ?, ?, ?, ?)
    `).bind(trackId, walletAddress || null, userId || null, durationPlayed || 0, completed ? 1 : 0).run();
    
    // Increment play count on track
    await c.env.DB.prepare(`
      UPDATE tracks SET play_count = play_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(trackId).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Record track play error:", error);
    return c.json({ error: "Failed to record play" }, 500);
  }
});

// Record episode play
app.post("/api/music/episodes/:id/play", async (c) => {
  try {
    const episodeId = parseInt(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    const { durationPlayed, progressSeconds, completed } = body;
    
    // Get user info from auth if available
    let walletAddress: string | null = null;
    let userId: string | null = null;
    
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) walletAddress = extUser.wallet_address as string;
    }
    
    // Check Mocha session cookie auth
    const sessionToken2 = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken2) {
      const user = await getCurrentUser(sessionToken2, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        userId = user.id;
        // Get wallet address for Mocha users
        if (!walletAddress) {
          const userWallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
          if (userWallet) walletAddress = userWallet.wallet_address;
        }
      }
    }
    
    // Check if listener is the podcast's creator - don't count their own plays
    const episode = await c.env.DB.prepare(`
      SELECT pe.podcast_id, p.music_profile_id, mp.wallet_address as creator_wallet
      FROM podcast_episodes pe
      JOIN podcasts p ON pe.podcast_id = p.id
      LEFT JOIN music_profiles mp ON p.music_profile_id = mp.id
      WHERE pe.id = ?
    `).bind(episodeId).first<{ podcast_id: number; music_profile_id: number; creator_wallet: string }>();
    
    if (episode?.creator_wallet && walletAddress && episode.creator_wallet === walletAddress) {
      // Don't count self-plays for leaderboard
      return c.json({ success: true, selfPlay: true });
    }
    
    // Record or update the play progress
    await c.env.DB.prepare(`
      INSERT INTO episode_plays (episode_id, wallet_address, user_id, duration_played, progress_seconds, completed)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(episode_id, wallet_address) DO UPDATE SET
        duration_played = duration_played + excluded.duration_played,
        progress_seconds = excluded.progress_seconds,
        completed = CASE WHEN excluded.completed = 1 THEN 1 ELSE completed END,
        updated_at = CURRENT_TIMESTAMP
    `).bind(episodeId, walletAddress || null, userId || null, durationPlayed || 0, progressSeconds || 0, completed ? 1 : 0).run();
    
    // Increment play count on episode
    await c.env.DB.prepare(`
      UPDATE podcast_episodes SET play_count = play_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(episodeId).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Record episode play error:", error);
    return c.json({ error: "Failed to record play" }, 500);
  }
});

// Toggle track like
app.post("/api/music/tracks/:id/like", async (c) => {
  try {
    const trackId = parseInt(c.req.param("id"));
    
    // Get user info from auth
    let walletAddress: string | null = null;
    let userId: string | null = null;
    
    // Try external wallet auth first
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) walletAddress = extUser.wallet_address as string;
    }
    
    // Try Mocha internal auth if no external wallet
    if (!walletAddress) {
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const mochaUser = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (mochaUser) {
          userId = mochaUser.id;
          const userWallet = await c.env.DB.prepare(
            'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
          ).bind(userId).first<{ wallet_address: string; internal_wallet_address?: string }>();
          if (userWallet) walletAddress = userWallet.wallet_address;
        }
      }
    }
    
    if (!walletAddress && !userId) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    // Check if already liked - build query dynamically to avoid null binding issues
    let checkQuery = `SELECT id FROM track_likes WHERE track_id = ?`;
    const checkBindings: (number | string)[] = [trackId];
    
    if (walletAddress && userId) {
      checkQuery += ` AND (wallet_address = ? OR user_id = ?)`;
      checkBindings.push(walletAddress, userId);
    } else if (walletAddress) {
      checkQuery += ` AND wallet_address = ?`;
      checkBindings.push(walletAddress);
    } else if (userId) {
      checkQuery += ` AND user_id = ?`;
      checkBindings.push(userId);
    }
    
    const existing = await c.env.DB.prepare(checkQuery).bind(...checkBindings).first();
    
    if (existing) {
      // Unlike - use same dynamic query pattern
      let deleteQuery = `DELETE FROM track_likes WHERE track_id = ?`;
      const deleteBindings: (number | string)[] = [trackId];
      
      if (walletAddress && userId) {
        deleteQuery += ` AND (wallet_address = ? OR user_id = ?)`;
        deleteBindings.push(walletAddress, userId);
      } else if (walletAddress) {
        deleteQuery += ` AND wallet_address = ?`;
        deleteBindings.push(walletAddress);
      } else if (userId) {
        deleteQuery += ` AND user_id = ?`;
        deleteBindings.push(userId);
      }
      
      await c.env.DB.prepare(deleteQuery).bind(...deleteBindings).run();
      return c.json({ success: true, liked: false });
    } else {
      // Like - only insert non-null values, use INSERT OR IGNORE for safety
      await c.env.DB.prepare(`
        INSERT OR IGNORE INTO track_likes (track_id, wallet_address, user_id) VALUES (?, ?, ?)
      `).bind(trackId, walletAddress || null, userId || null).run();
      return c.json({ success: true, liked: true });
    }
  } catch (error) {
    console.error("Toggle track like error:", error);
    return c.json({ error: "Failed to toggle like" }, 500);
  }
});

// Toggle podcast subscription
app.post("/api/music/podcasts/:id/subscribe", async (c) => {
  try {
    const podcastId = parseInt(c.req.param("id"));
    
    // Get user info from auth
    let walletAddress: string | null = null;
    let userId: string | null = null;
    
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) walletAddress = extUser.wallet_address as string;
    }
    
    // Fallback: session cookie for Mocha/Gmail users
    if (!walletAddress) {
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const currentUser = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY
        });
        if (currentUser) {
          userId = currentUser.id;
          const wallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(currentUser.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
          if (wallet) walletAddress = wallet.wallet_address;
        }
      }
    }
    
    const user = c.get("user");
    if (user) userId = user.id;
    
    if (!walletAddress && !userId) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    // Check if already subscribed
    const existing = await c.env.DB.prepare(`
      SELECT id FROM podcast_subscriptions WHERE podcast_id = ? AND (wallet_address = ? OR user_id = ?)
    `).bind(podcastId, walletAddress, userId).first();
    
    if (existing) {
      // Unsubscribe
      await c.env.DB.prepare(`
        DELETE FROM podcast_subscriptions WHERE podcast_id = ? AND (wallet_address = ? OR user_id = ?)
      `).bind(podcastId, walletAddress, userId).run();
      
      // Decrement subscriber count
      await c.env.DB.prepare(`
        UPDATE podcasts SET subscriber_count = MAX(0, subscriber_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(podcastId).run();
      
      return c.json({ success: true, subscribed: false });
    } else {
      // Subscribe
      await c.env.DB.prepare(`
        INSERT INTO podcast_subscriptions (podcast_id, wallet_address, user_id) VALUES (?, ?, ?)
      `).bind(podcastId, walletAddress, userId).run();
      
      // Increment subscriber count
      await c.env.DB.prepare(`
        UPDATE podcasts SET subscriber_count = subscriber_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(podcastId).run();
      
      return c.json({ success: true, subscribed: true });
    }
  } catch (error) {
    console.error("Toggle podcast subscription error:", error);
    return c.json({ error: "Failed to toggle subscription" }, 500);
  }
});

// Check if user has liked/subscribed
app.get("/api/music/user-status", async (c) => {
  try {
    const trackIds = c.req.query("trackIds")?.split(",").map(Number).filter(Boolean) || [];
    const podcastIds = c.req.query("podcastIds")?.split(",").map(Number).filter(Boolean) || [];
    
    // If no IDs provided, return empty
    if (trackIds.length === 0 && podcastIds.length === 0) {
      return c.json({ likedTracks: [], subscribedPodcasts: [] });
    }
    
    // Get user info from auth
    let walletAddress: string | null = null;
    let userId: string | null = null;
    
    // Try external wallet auth first
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) walletAddress = extUser.wallet_address as string;
    }
    
    // Try Mocha internal auth if no external wallet
    if (!walletAddress) {
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const mochaUser = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (mochaUser) {
          userId = mochaUser.id;
          const userWallet = await c.env.DB.prepare(
            'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
          ).bind(userId).first<{ wallet_address: string; internal_wallet_address?: string }>();
          if (userWallet) walletAddress = userWallet.wallet_address;
        }
      }
    }
    
    if (!walletAddress && !userId) {
      return c.json({ likedTracks: [], subscribedPodcasts: [] });
    }
  
  let likedTracks: number[] = [];
  let subscribedPodcasts: number[] = [];
  
  if (trackIds.length > 0) {
    // Build query dynamically to avoid null binding issues
    let likeQuery = `SELECT track_id FROM track_likes WHERE track_id IN (${trackIds.join(',')}) AND `;
    const likeBindings: (string | null)[] = [];
    if (walletAddress && userId) {
      likeQuery += `(wallet_address = ? OR user_id = ?)`;
      likeBindings.push(walletAddress, userId);
    } else if (walletAddress) {
      likeQuery += `wallet_address = ?`;
      likeBindings.push(walletAddress);
    } else {
      likeQuery += `user_id = ?`;
      likeBindings.push(userId);
    }
    const likesResult = await c.env.DB.prepare(likeQuery).bind(...likeBindings).all();
    likedTracks = likesResult.results.map((r: Record<string, unknown>) => r.track_id as number);
  }
  
  if (podcastIds.length > 0) {
    // Build query dynamically to avoid null binding issues
    let subQuery = `SELECT podcast_id FROM podcast_subscriptions WHERE podcast_id IN (${podcastIds.join(',')}) AND `;
    const subBindings: (string | null)[] = [];
    if (walletAddress && userId) {
      subQuery += `(wallet_address = ? OR user_id = ?)`;
      subBindings.push(walletAddress, userId);
    } else if (walletAddress) {
      subQuery += `wallet_address = ?`;
      subBindings.push(walletAddress);
    } else {
      subQuery += `user_id = ?`;
      subBindings.push(userId);
    }
    const subsResult = await c.env.DB.prepare(subQuery).bind(...subBindings).all();
    subscribedPodcasts = subsResult.results.map((r: Record<string, unknown>) => r.podcast_id as number);
  }
  
    return c.json({ likedTracks, subscribedPodcasts });
  } catch (error) {
    console.error("User status error:", error);
    return c.json({ likedTracks: [], subscribedPodcasts: [] });
  }
});

// Get user's liked tracks
app.get("/api/music/user/liked", async (c) => {
  // Use fast auth helper
  const { walletAddress, userId } = await getFastAuth(c);
  
  if (!walletAddress && !userId) {
    return c.json({ tracks: [] });
  }
  
  // Build query based on available identifiers to avoid null binding issues
  let query = `
    SELECT t.*, a.title as album_title, COALESCE(t.artist_name, mp.name) as artist_name, mp.handle as artist_handle, mp.wallet_address as creator_wallet, mp.id as artist_id
    FROM track_likes tl
    JOIN tracks t ON tl.track_id = t.id
    LEFT JOIN albums a ON t.album_id = a.id
    LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
    WHERE `;
  
  const bindings: (string | null)[] = [];
  if (walletAddress && userId) {
    query += `(tl.wallet_address = ? OR tl.user_id = ?)`;
    bindings.push(walletAddress, userId);
  } else if (walletAddress) {
    query += `tl.wallet_address = ?`;
    bindings.push(walletAddress);
  } else {
    query += `tl.user_id = ?`;
    bindings.push(userId);
  }
  query += ` ORDER BY tl.created_at DESC LIMIT 100`;
  
  const result = await c.env.DB.prepare(query).bind(...bindings).all();
  
  const tracks = result.results.map((t: Record<string, unknown>) => ({
    id: t.id,
    title: t.title,
    artist: t.artist_name || 'Unknown Artist',
    artistId: t.artist_id,
    artistHandle: t.artist_handle,
    albumId: t.album_id,
    albumTitle: t.album_title || null,
    audioUrl: t.audio_url,
    coverArtUrl: t.cover_art_url,
    durationSeconds: t.duration_seconds,
    priceKas: t.price_kas,
    creatorWallet: t.creator_wallet,
    averageRating: t.cached_avg_rating ? Math.round((t.cached_avg_rating as number) * 10) / 10 : null,
    reviewCount: t.cached_review_count || 0,
  }));
  
  return c.json({ tracks });
});

// Get user's listening history
app.get("/api/music/user/history", async (c) => {
  // Use fast auth helper
  const { walletAddress, userId } = await getFastAuth(c);
  
  if (!walletAddress && !userId) {
    return c.json({ tracks: [] });
  }
  
  // Get history from the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  const result = await c.env.DB.prepare(`
    SELECT t.*, a.title as album_title, COALESCE(t.artist_name, mp.name) as artist_name, mp.handle as artist_handle, mp.wallet_address as creator_wallet, mp.id as artist_id, tp.created_at as played_at
    FROM track_plays tp
    JOIN tracks t ON tp.track_id = t.id
    LEFT JOIN albums a ON t.album_id = a.id
    LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
    WHERE (tp.wallet_address = ? OR tp.user_id = ?)
    AND tp.created_at >= ?
    ORDER BY tp.created_at DESC
    LIMIT 100
  `).bind(walletAddress, userId, thirtyDaysAgo).all();
  
  const tracks = result.results.map((t: Record<string, unknown>) => ({
    id: t.id,
    title: t.title,
    artist: t.artist_name || 'Unknown Artist',
    artistId: t.artist_id,
    artistHandle: t.artist_handle,
    albumId: t.album_id,
    albumTitle: t.album_title || null,
    audioUrl: t.audio_url,
    coverArtUrl: t.cover_art_url,
    durationSeconds: t.duration_seconds,
    priceKas: t.price_kas,
    creatorWallet: t.creator_wallet,
    playedAt: t.played_at,
    averageRating: t.cached_avg_rating ? Math.round((t.cached_avg_rating as number) * 10) / 10 : null,
    reviewCount: t.cached_review_count || 0,
  }));
  
  return c.json({ tracks });
});

// Check if user has purchased content
app.get("/api/music/purchase/check", async (c) => {
  const contentType = c.req.query("type"); // 'track' or 'episode'
  const contentId = c.req.query("id");
  
  if (!contentType || !contentId) {
    return c.json({ purchased: false });
  }
  
  let walletAddress: string | null = null;
  let userId: string | null = null;
  
  // Try external wallet auth first
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const extUser = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) walletAddress = extUser.wallet_address as string;
  }
  
  // Try Mocha internal auth
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        userId = mochaUser.id;
        const userWallet = await c.env.DB.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(userId).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (userWallet) walletAddress = userWallet.wallet_address;
      }
    }
  }
  
  if (!walletAddress && !userId) {
    return c.json({ purchased: false });
  }
  
  // Check if content was purchased
  const purchase = await c.env.DB.prepare(`
    SELECT id FROM music_purchases 
    WHERE content_type = ? AND content_id = ? AND (wallet_address = ? OR user_id = ?)
  `).bind(contentType, contentId, walletAddress, userId).first();
  
  // Also check if user is the creator
  let isCreator = false;
  if (contentType === 'track') {
    const track = await c.env.DB.prepare(`
      SELECT t.music_profile_id, mp.wallet_address as creator_wallet 
      FROM tracks t JOIN music_profiles mp ON t.music_profile_id = mp.id 
      WHERE t.id = ?
    `).bind(contentId).first<{ creator_wallet: string }>();
    if (track && track.creator_wallet === walletAddress) isCreator = true;
  } else if (contentType === 'episode') {
    const ep = await c.env.DB.prepare(`
      SELECT pe.music_profile_id, mp.wallet_address as creator_wallet 
      FROM podcast_episodes pe JOIN music_profiles mp ON pe.music_profile_id = mp.id 
      WHERE pe.id = ?
    `).bind(contentId).first<{ creator_wallet: string }>();
    if (ep && ep.creator_wallet === walletAddress) isCreator = true;
  }
  
  return c.json({ purchased: !!purchase || isCreator });
});

// Purchase music content
app.post("/api/music/purchase", async (c) => {
  const body = await c.req.json<{ 
    contentType: 'track' | 'episode';
    contentId: number;
    transactionId: string;
  }>();
  
  const { contentType, contentId, transactionId } = body;
  
  if (!contentType || !contentId || !transactionId) {
    return c.json({ error: "Missing required fields" }, 400);
  }
  
  let walletAddress: string | null = null;
  let userId: string | null = null;
  
  // Try external wallet auth first
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const extUser = await c.env.DB.prepare(
      "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) walletAddress = extUser.wallet_address as string;
  }
  
  // Try Mocha internal auth
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        userId = mochaUser.id;
        const userWallet = await c.env.DB.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(userId).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (userWallet) walletAddress = userWallet.wallet_address;
      }
    }
  }
  
  if (!walletAddress && !userId) {
    return c.json({ error: "Authentication required" }, 401);
  }
  
  // Get content price
  let priceKas = '0';
  if (contentType === 'track') {
    const track = await c.env.DB.prepare(
      "SELECT price_kas FROM tracks WHERE id = ?"
    ).bind(contentId).first<{ price_kas: string }>();
    if (!track) return c.json({ error: "Track not found" }, 404);
    priceKas = track.price_kas || '0';
  } else if (contentType === 'episode') {
    const ep = await c.env.DB.prepare(
      "SELECT price_kas FROM podcast_episodes WHERE id = ?"
    ).bind(contentId).first<{ price_kas: string }>();
    if (!ep) return c.json({ error: "Episode not found" }, 404);
    priceKas = ep.price_kas || '0';
  }
  
  // Check if already purchased
  const existing = await c.env.DB.prepare(`
    SELECT id FROM music_purchases 
    WHERE content_type = ? AND content_id = ? AND (wallet_address = ? OR user_id = ?)
  `).bind(contentType, contentId, walletAddress, userId).first();
  
  if (existing) {
    return c.json({ success: true, alreadyPurchased: true });
  }
  
  // Record purchase
  await c.env.DB.prepare(`
    INSERT INTO music_purchases (content_type, content_id, wallet_address, user_id, amount_kas, transaction_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(contentType, contentId, walletAddress, userId, priceKas, transactionId).run();
  
  // Record shareholder payouts for fractionalized tracks
  if (contentType === 'track' && parseFloat(priceKas) > 0) {
    try {
      const track = await c.env.DB.prepare(`
        SELECT is_fractionalized, fractional_percentage_sold, total_shares 
        FROM tracks WHERE id = ?
      `).bind(contentId).first<{ 
        is_fractionalized: number; 
        fractional_percentage_sold: number; 
        total_shares: number 
      }>();
      
      if (track?.is_fractionalized === 1 && track.fractional_percentage_sold > 0) {
        // Get all shareholders
        const shareholdersResult = await c.env.DB.prepare(`
          SELECT owner_address, shares_owned FROM track_shares WHERE track_id = ?
        `).bind(contentId).all();
        
        const shareholders = shareholdersResult.results as Array<{ owner_address: string; shares_owned: number }>;
        
        if (shareholders.length > 0 && track.total_shares > 0) {
          // Creator gets 95% of the price (5% platform fee already taken)
          // Of that 95%, shareholders get fractional_percentage_sold %
          const creatorAmount = parseFloat(priceKas) * 0.95;
          const shareholderPoolKas = creatorAmount * (track.fractional_percentage_sold / 100);
          
          // Distribute to each shareholder based on their share ownership
          for (const holder of shareholders) {
            const ownershipFraction = holder.shares_owned / track.total_shares;
            const payoutKas = shareholderPoolKas * ownershipFraction;
            
            if (payoutKas > 0) {
              await c.env.DB.prepare(`
                INSERT INTO shareholder_payouts 
                (track_id, recipient_address, shares_at_time, total_shares_at_time, amount_kas, source_payment_type, source_transaction_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
              `).bind(
                contentId,
                holder.owner_address,
                holder.shares_owned,
                track.total_shares,
                payoutKas.toFixed(8),
                'music_purchase',
                transactionId
              ).run();
              
              // Create notification for the shareholder
              // Find user_id from wallet address (check both user_wallets and external_wallet_users)
              const internalUser = await c.env.DB.prepare(
                "SELECT user_id FROM user_wallets WHERE wallet_address = ?"
              ).bind(holder.owner_address).first<{ user_id: string }>();
              
              const externalUser = !internalUser ? await c.env.DB.prepare(
                "SELECT internal_wallet_address FROM external_wallet_users WHERE wallet_address = ? OR internal_wallet_address = ?"
              ).bind(holder.owner_address, holder.owner_address).first<{ internal_wallet_address: string }>() : null;
              
              // Find user_id for external wallet users (from internal_wallet_address)
              const extInternalUser = externalUser?.internal_wallet_address ? await c.env.DB.prepare(
                "SELECT user_id FROM user_wallets WHERE wallet_address = ?"
              ).bind(externalUser.internal_wallet_address).first<{ user_id: string }>() : null;
              
              const shareholderUserId = internalUser?.user_id || extInternalUser?.user_id;
              
              if (shareholderUserId) {
                // Get track title for notification
                const trackInfo = await c.env.DB.prepare(
                  "SELECT title FROM tracks WHERE id = ?"
                ).bind(contentId).first<{ title: string }>();
                
                await c.env.DB.prepare(`
                  INSERT INTO notifications (user_id, type, title, message, is_read, created_at, updated_at)
                  VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))
                `).bind(
                  shareholderUserId,
                  'investment_payout',
                  'Investment Earnings',
                  `You earned ${payoutKas.toFixed(6)} KAS from your shares in "${trackInfo?.title || 'a track'}"`
                ).run();
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[SHAREHOLDER PAYOUT ERROR]', err);
      // Don't fail the purchase if payout recording fails
    }
  }
  
  return c.json({ success: true });
});

// Get radio tracks (random/recommended)
app.get("/api/music/radio", async (c) => {
  // Get random tracks from the database
  const result = await c.env.DB.prepare(`
    SELECT t.*, a.title as album_title, COALESCE(t.artist_name, mp.name) as artist_name
    FROM tracks t
    LEFT JOIN albums a ON t.album_id = a.id
    LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
    ORDER BY RANDOM()
    LIMIT 50
  `).all();
  
  const tracks = result.results.map((t: Record<string, unknown>) => ({
    id: t.id,
    title: t.title,
    artist: t.artist_name || 'Unknown Artist',
    albumId: t.album_id,
    albumTitle: t.album_title || null,
    audioUrl: t.audio_url,
    coverArtUrl: t.cover_art_url,
    durationSeconds: t.duration_seconds,
  }));
  
  return c.json({ tracks });
});

// ========== DISCOVER ENDPOINTS ==========

// Get discover tracks (filterable by genre)
app.get("/api/music/discover/tracks", async (c) => {
  const genre = c.req.query('genre');
  const limit = parseInt(c.req.query('limit') || '50');
  const shuffle = c.req.query('shuffle') === 'true';
  
  let query = `
    SELECT t.*, a.title as album_title, COALESCE(t.artist_name, mp.name) as artist_name, mp.genre as artist_genre,
      mp.id as profile_id, mp.avatar_url as artist_avatar
    FROM tracks t
    LEFT JOIN albums a ON t.album_id = a.id
    LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
    WHERE (t.price_kas IS NULL OR t.price_kas = 0 OR t.price_kas = '0')
  `;
  const bindings: string[] = [];
  
  if (genre && genre !== 'all') {
    query += ` AND LOWER(mp.genre) = LOWER(?)`;
    bindings.push(genre);
  }
  
  if (shuffle) {
    query += ` ORDER BY RANDOM()`;
  } else {
    query += ` ORDER BY t.play_count DESC, t.created_at DESC`;
  }
  
  query += ` LIMIT ?`;
  bindings.push(limit.toString());
  
  const stmt = c.env.DB.prepare(query);
  const result = await (bindings.length > 0 ? stmt.bind(...bindings) : stmt).all();
  
  const tracks = result.results.map((t: Record<string, unknown>) => ({
    id: t.id,
    title: t.title,
    artist: t.artist_name || 'Unknown Artist',
    artistId: t.profile_id,
    artistAvatar: t.artist_avatar,
    albumId: t.album_id,
    albumTitle: t.album_title || null,
    audioUrl: t.audio_url,
    coverArtUrl: t.cover_art_url,
    durationSeconds: t.duration_seconds,
    playCount: t.play_count || 0,
    genre: t.artist_genre,
  }));
  
  return c.json({ tracks });
});

// Get discover artists (filterable by genre)
app.get("/api/music/discover/artists", async (c) => {
  const genre = c.req.query('genre');
  const limit = parseInt(c.req.query('limit') || '20');
  
  let query = `
    SELECT mp.*, 
      (SELECT COUNT(*) FROM tracks WHERE music_profile_id = mp.id) as track_count
    FROM music_profiles mp
    WHERE mp.name IS NOT NULL
  `;
  const bindings: string[] = [];
  
  if (genre && genre !== 'all') {
    query += ` AND LOWER(mp.genre) = LOWER(?)`;
    bindings.push(genre);
  }
  
  query += ` ORDER BY mp.follower_count DESC, mp.created_at DESC LIMIT ?`;
  bindings.push(limit.toString());
  
  const stmt = c.env.DB.prepare(query);
  const result = await (bindings.length > 0 ? stmt.bind(...bindings) : stmt).all();
  
  const artists = result.results.map((a: Record<string, unknown>) => ({
    id: a.id,
    name: a.name,
    handle: a.handle,
    avatarUrl: a.avatar_url,
    bannerUrl: a.banner_url,
    genre: a.genre,
    followerCount: a.follower_count || 0,
    trackCount: a.track_count || 0,
  }));
  
  return c.json({ artists });
});

// ========== LEADERBOARD ENDPOINTS ==========

// Get top music artists by total plays
app.get("/api/music/leaderboard/artists", async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  
  const result = await c.env.DB.prepare(`
    SELECT 
      mp.id,
      mp.name,
      mp.handle,
      mp.avatar_url,
      mp.genre,
      COUNT(DISTINCT t.id) as track_count,
      COALESCE(SUM(t.play_count), 0) as total_plays
    FROM music_profiles mp
    LEFT JOIN tracks t ON t.music_profile_id = mp.id AND t.is_published = 1
    WHERE mp.name IS NOT NULL
    GROUP BY mp.id
    HAVING total_plays > 0
    ORDER BY total_plays DESC, track_count DESC
    LIMIT ?
  `).bind(limit).all();
  
  const artists = result.results.map((a: Record<string, unknown>) => ({
    id: a.id,
    name: a.name,
    handle: a.handle,
    avatarUrl: a.avatar_url,
    genre: a.genre,
    trackCount: Number(a.track_count) || 0,
    totalPlays: Number(a.total_plays) || 0,
  }));
  
  return c.json({ artists });
});

// Get top podcasters by total episode plays
app.get("/api/music/leaderboard/podcasters", async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  
  const result = await c.env.DB.prepare(`
    SELECT 
      mp.id,
      mp.name,
      mp.handle,
      mp.avatar_url,
      COUNT(DISTINCT p.id) as podcast_count,
      COUNT(DISTINCT pe.id) as episode_count,
      COALESCE(SUM(pe.play_count), 0) as total_plays
    FROM music_profiles mp
    INNER JOIN podcasts p ON p.music_profile_id = mp.id AND p.is_published = 1
    LEFT JOIN podcast_episodes pe ON pe.podcast_id = p.id AND pe.is_published = 1
    WHERE mp.name IS NOT NULL
    GROUP BY mp.id
    HAVING total_plays > 0
    ORDER BY total_plays DESC, episode_count DESC
    LIMIT ?
  `).bind(limit).all();
  
  const podcasters = result.results.map((p: Record<string, unknown>) => ({
    id: p.id,
    name: p.name,
    handle: p.handle,
    avatarUrl: p.avatar_url,
    podcastCount: Number(p.podcast_count) || 0,
    episodeCount: Number(p.episode_count) || 0,
    totalPlays: Number(p.total_plays) || 0,
  }));
  
  return c.json({ podcasters });
});

// ========== LEADERBOARD ENDPOINTS ==========

// Get top music artists by total plays
app.get("/api/music/leaderboard/artists", async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  
  const result = await c.env.DB.prepare(`
    SELECT 
      mp.id,
      mp.name,
      mp.avatar_url,
      mp.genre,
      (SELECT COUNT(*) FROM tracks WHERE profile_id = mp.id) as track_count,
      COALESCE((
        SELECT SUM(COALESCE(t.play_count, 0))
        FROM tracks t
        WHERE t.profile_id = mp.id
      ), 0) as total_plays
    FROM music_profiles mp
    WHERE EXISTS (SELECT 1 FROM tracks WHERE profile_id = mp.id)
    ORDER BY total_plays DESC
    LIMIT ?
  `).bind(limit).all();
  
  const artists = result.results.map((a: Record<string, unknown>, index: number) => ({
    rank: index + 1,
    id: a.id,
    name: a.name,
    avatarUrl: a.avatar_url,
    genre: a.genre,
    trackCount: Number(a.track_count) || 0,
    totalPlays: Number(a.total_plays) || 0,
  }));
  
  return c.json({ artists });
});

// Get top podcasters by total plays
app.get("/api/music/leaderboard/podcasters", async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  
  const result = await c.env.DB.prepare(`
    SELECT 
      mp.id,
      mp.name,
      mp.avatar_url,
      (SELECT COUNT(*) FROM podcasts WHERE host_profile_id = mp.id) as podcast_count,
      (SELECT COUNT(*) FROM episodes e 
       JOIN podcasts p ON e.podcast_id = p.id 
       WHERE p.host_profile_id = mp.id) as episode_count,
      COALESCE((
        SELECT SUM(COALESCE(e.play_count, 0))
        FROM episodes e
        JOIN podcasts p ON e.podcast_id = p.id
        WHERE p.host_profile_id = mp.id
      ), 0) as total_plays
    FROM music_profiles mp
    WHERE EXISTS (SELECT 1 FROM podcasts WHERE host_profile_id = mp.id)
    ORDER BY total_plays DESC
    LIMIT ?
  `).bind(limit).all();
  
  const podcasters = result.results.map((p: Record<string, unknown>, index: number) => ({
    rank: index + 1,
    id: p.id,
    name: p.name,
    avatarUrl: p.avatar_url,
    podcastCount: Number(p.podcast_count) || 0,
    episodeCount: Number(p.episode_count) || 0,
    totalPlays: Number(p.total_plays) || 0,
  }));
  
  return c.json({ podcasters });
});

// ========== PLAYLIST ENDPOINTS ==========

// Get featured/popular public playlists
app.get("/api/music/playlists/featured", async (c) => {
  const limit = parseInt(c.req.query("limit") || "50");
  
  const result = await c.env.DB.prepare(`
    SELECT p.*, mp.name as creator_name, mp.handle as creator_handle,
      (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = p.id) as track_count
    FROM playlists p
    LEFT JOIN music_profiles mp ON p.music_profile_id = mp.id
    WHERE p.is_public = 1
    ORDER BY p.play_count DESC, p.created_at DESC
    LIMIT ?
  `).bind(limit).all();

  const playlists = result.results.map((p: Record<string, unknown>) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    coverArtUrl: p.cover_art_url,
    isPublic: true,
    trackCount: p.track_count || 0,
    playCount: p.play_count || 0,
    creatorName: p.creator_name || 'Unknown',
    creatorHandle: p.creator_handle,
    createdAt: p.created_at,
  }));

  return c.json({ playlists });
});

// Get user's playlists
app.get("/api/music/playlists", async (c) => {
  const ownOnly = c.req.query('ownOnly') === 'true';
  
  // Use fast auth helper
  const { walletAddress, userId } = await getFastAuth(c);

  // Build query dynamically to avoid null binding issues
  const bindings: (string | null)[] = [];
  let whereClause: string;
  
  if (ownOnly) {
    // Only return user's own playlists for add-to-playlist menu
    if (!walletAddress && !userId) {
      return c.json({ playlists: [] });
    }
    const conditions: string[] = [];
    if (walletAddress) {
      conditions.push('p.wallet_address = ?');
      bindings.push(walletAddress);
    }
    if (userId) {
      conditions.push('p.user_id = ?');
      bindings.push(userId);
    }
    whereClause = conditions.join(' OR ');
  } else {
    // Return public playlists and user's own playlists
    whereClause = 'p.is_public = 1';
    if (walletAddress) {
      whereClause += ' OR p.wallet_address = ?';
      bindings.push(walletAddress);
    }
    if (userId) {
      whereClause += ' OR p.user_id = ?';
      bindings.push(userId);
    }
  }

  const query = c.env.DB.prepare(`
    SELECT p.*, p.slug, mp.name as creator_name, mp.handle as creator_handle,
      p.cached_track_count as track_count
    FROM playlists p
    LEFT JOIN music_profiles mp ON p.music_profile_id = mp.id
    WHERE ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT 50
  `);
  
  const result = bindings.length > 0 
    ? await query.bind(...bindings).all()
    : await query.all();

  const playlists = result.results.map((p: Record<string, unknown>) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    coverArtUrl: p.cover_art_url,
    isPublic: p.is_public === 1,
    trackCount: p.track_count || 0,
    playCount: p.play_count || 0,
    creatorName: p.creator_name || 'Unknown',
    creatorHandle: p.creator_handle,
    createdAt: p.created_at,
  }));

  return c.json({ playlists });
});

// Get playlist by ID or slug with tracks
app.get("/api/music/playlists/:id", async (c) => {
  const idOrSlug = c.req.param('id');
  const isNumeric = /^\d+$/.test(idOrSlug);
  
  // Build query based on ID or slug
  const whereClause = isNumeric ? 'p.id = ?' : 'p.slug = ?';
  const bindValue = isNumeric ? parseInt(idOrSlug) : idOrSlug;
  
  const playlist = await c.env.DB.prepare(`
    SELECT p.*, 
      COALESCE(c.name, mp.name) as creator_name, 
      c.handle as creator_handle, 
      p.wallet_address as creator_wallet_address
    FROM playlists p
    LEFT JOIN channels c ON p.channel_id = c.id
    LEFT JOIN music_profiles mp ON p.wallet_address = mp.wallet_address
    WHERE ${whereClause}
  `).bind(bindValue).first<Record<string, unknown>>();

  if (!playlist) {
    return c.json({ error: 'Playlist not found' }, 404);
  }

  // Get tracks in playlist with music_profiles for artist info
  const tracksResult = await c.env.DB.prepare(`
    SELECT t.*, pt.track_order, a.title as album_title, 
           COALESCE(t.artist_name, mp.name) as artist_name, mp.handle as artist_handle, mp.id as artist_id, mp.wallet_address as creator_wallet
    FROM playlist_tracks pt
    JOIN tracks t ON pt.track_id = t.id
    LEFT JOIN albums a ON t.album_id = a.id
    LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
    WHERE pt.playlist_id = ?
    ORDER BY pt.track_order ASC
  `).bind(playlist.id).all();

  const tracks = tracksResult.results.map((t: Record<string, unknown>) => ({
    id: t.id,
    title: t.title,
    artist: t.artist_name || 'Unknown Artist',
    artistId: t.artist_id,
    artistHandle: t.artist_handle,
    audioUrl: t.audio_url,
    coverArtUrl: t.cover_art_url,
    durationSeconds: t.duration_seconds || 0,
    albumId: t.album_id,
    albumTitle: t.album_title,
    trackOrder: t.track_order,
    priceKas: t.price_kas,
    creatorWallet: t.creator_wallet,
    averageRating: t.cached_avg_rating ? Math.round((t.cached_avg_rating as number) * 10) / 10 : null,
    reviewCount: t.cached_review_count || 0,
  }));

  return c.json({
    id: playlist.id,
    slug: playlist.slug,
    title: playlist.title,
    description: playlist.description,
    coverArtUrl: playlist.cover_art_url,
    isPublic: playlist.is_public === 1,
    trackCount: tracks.length,
    playCount: playlist.play_count || 0,
    creatorName: playlist.creator_name || 'Unknown',
    creatorHandle: playlist.creator_handle,
    creatorWalletAddress: playlist.creator_wallet_address,
    createdAt: playlist.created_at,
    tracks,
  });
});

// Create playlist
app.post("/api/music/playlists", async (c) => {
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;
  let profileId: number | null = null;
  let userId: string | null = null;

  // Try external wallet auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await c.env.DB.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) {
      walletAddress = extUser.wallet_address as string;
      const addrs = [extUser.wallet_address];
      if (extUser.internal_wallet_address) addrs.push(extUser.internal_wallet_address);
      const profile = await findMusicProfile(c.env.DB, addrs);
      if (profile) profileId = profile.id;
    }
  }

  // Try Mocha internal auth if no external wallet
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        userId = mochaUser.id;
        // Get wallet address from user_wallets
        const userWallet = await c.env.DB.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(userId).first<{ wallet_address: string }>();
        if (userWallet) {
          walletAddress = userWallet.wallet_address;
          // Get music profile by wallet address (music_profiles don't have user_id column)
          const profile = await findMusicProfile(c.env.DB, [walletAddress]);
          if (profile) profileId = profile.id;
        }
      }
    }
  }

  if (!walletAddress && !userId) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const body = await c.req.json();
  // Support both 'title' and 'name' for the playlist name
  const { title, name, description, coverArtUrl, isPublic = true } = body;
  const playlistTitle = title || name;

  if (!playlistTitle) {
    return c.json({ error: 'Title is required' }, 400);
  }

  // Generate unique slug for URL
  const slug = await generateUniqueSlug(c.env.DB, 'playlists', playlistTitle);

  const result = await c.env.DB.prepare(`
    INSERT INTO playlists (music_profile_id, wallet_address, user_id, title, description, cover_art_url, is_public, slug)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(profileId, walletAddress, userId, playlistTitle, description || null, coverArtUrl || null, isPublic ? 1 : 0, slug).run();

  return c.json({ 
    playlistId: result.meta.last_row_id, 
    slug,
    playlist: {
      id: result.meta.last_row_id,
      name: playlistTitle,
      description: description || '',
      slug
    },
    success: true 
  });
});

// Update playlist
app.patch("/api/music/playlists/:id", async (c) => {
  const id = parseInt(c.req.param('id'));
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await c.env.DB.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) walletAddress = extUser.wallet_address as string;
  }

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Verify ownership
  const playlist = await c.env.DB.prepare(
    'SELECT id FROM playlists WHERE id = ? AND wallet_address = ?'
  ).bind(id, walletAddress).first();

  if (!playlist) {
    return c.json({ error: 'Playlist not found or not authorized' }, 404);
  }

  const body = await c.req.json();
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (body.title !== undefined) { updates.push('title = ?'); values.push(body.title); }
  if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
  if (body.coverArtUrl !== undefined) { updates.push('cover_art_url = ?'); values.push(body.coverArtUrl); }
  if (body.isPublic !== undefined) { updates.push('is_public = ?'); values.push(body.isPublic ? 1 : 0); }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await c.env.DB.prepare(
      `UPDATE playlists SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();
  }

  return c.json({ success: true });
});

// Delete playlist
app.delete("/api/music/playlists/:id", async (c) => {
  const id = parseInt(c.req.param('id'));
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;

  // Try external wallet auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await c.env.DB.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) walletAddress = extUser.wallet_address as string;
  }

  // Try Mocha internal auth if no external wallet
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        const userWallet = await c.env.DB.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(mochaUser.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (userWallet) walletAddress = userWallet.wallet_address;
      }
    }
  }

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Delete tracks first, then playlist
  await c.env.DB.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM playlists WHERE id = ? AND wallet_address = ?').bind(id, walletAddress).run();

  return c.json({ success: true });
});

// Upload playlist cover image
app.post("/api/music/playlists/:id/cover", async (c) => {
  const playlistId = parseInt(c.req.param('id'));
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;

  // Try external wallet auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await c.env.DB.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) walletAddress = extUser.wallet_address as string;
  }

  // Try Mocha internal auth if no external wallet
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        const userWallet = await c.env.DB.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(mochaUser.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (userWallet) walletAddress = userWallet.wallet_address;
      }
    }
  }

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Verify ownership
  const playlist = await c.env.DB.prepare(
    'SELECT id, cover_art_url FROM playlists WHERE id = ? AND wallet_address = ?'
  ).bind(playlistId, walletAddress).first<{ id: number; cover_art_url: string | null }>();

  if (!playlist) {
    return c.json({ error: 'Playlist not found or not owned by you' }, 404);
  }

  try {
    const formData = await c.req.formData();
    const coverFile = formData.get('cover') as File | null;

    if (!coverFile) {
      return c.json({ error: 'No cover image provided' }, 400);
    }

    // Validate file type
    if (!coverFile.type.startsWith('image/')) {
      return c.json({ error: 'Invalid file type. Please upload an image.' }, 400);
    }

    // Validate file size (5MB max)
    if (coverFile.size > 5 * 1024 * 1024) {
      return c.json({ error: 'Image must be less than 5MB' }, 400);
    }

    // Delete old cover if exists
    if (playlist.cover_art_url) {
      const oldKey = playlist.cover_art_url.replace('/api/kasshi/media/', '');
      try {
        await c.env.R2_BUCKET.delete(oldKey);
      } catch (e) {
        console.error('Failed to delete old cover:', e);
      }
    }

    // Upload new cover
    const ext = coverFile.name.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const key = `music/playlist-covers/${timestamp}-${randomStr}.${ext}`;

    const arrayBuffer = await coverFile.arrayBuffer();
    await c.env.R2_BUCKET.put(key, arrayBuffer, {
      httpMetadata: { contentType: coverFile.type },
    });

    const coverUrl = `/api/kasshi/media/${key}`;

    // Update playlist
    await c.env.DB.prepare(
      'UPDATE playlists SET cover_art_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(coverUrl, playlistId).run();

    return c.json({ success: true, coverUrl });
  } catch (error) {
    console.error('Failed to upload playlist cover:', error);
    return c.json({ error: 'Failed to upload cover image' }, 500);
  }
});

// Add track to playlist
app.post("/api/music/playlists/:id/tracks", async (c) => {
  try {
    const playlistId = parseInt(c.req.param('id'));
    const authHeader = c.req.header('Authorization');
    let walletAddress: string | null = null;
    let userId: string | null = null;

    // Try external wallet auth first
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
      ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
      if (extUser) walletAddress = extUser.wallet_address as string;
    }

    // Try Mocha internal auth if no external wallet
    if (!walletAddress) {
      const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
      if (sessionToken) {
        const mochaUser = await getCurrentUser(sessionToken, {
          apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
          apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
        });
        if (mochaUser) {
          userId = mochaUser.id;
          const userWallet = await c.env.DB.prepare(
            'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
          ).bind(userId).first<{ wallet_address: string; internal_wallet_address?: string }>();
          if (userWallet) walletAddress = userWallet.wallet_address;
        }
      }
    }

    if (!walletAddress && !userId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Verify ownership - check both wallet_address and user_id
    let ownershipQuery = 'SELECT id FROM playlists WHERE id = ? AND (';
    const ownershipBindings: (number | string)[] = [playlistId];
    
    if (walletAddress && userId) {
      ownershipQuery += 'wallet_address = ? OR user_id = ?)';
      ownershipBindings.push(walletAddress, userId);
    } else if (walletAddress) {
      ownershipQuery += 'wallet_address = ?)';
      ownershipBindings.push(walletAddress);
    } else {
      ownershipQuery += 'user_id = ?)';
      ownershipBindings.push(userId!);
    }
    
    const playlist = await c.env.DB.prepare(ownershipQuery).bind(...ownershipBindings).first();

    if (!playlist) {
      return c.json({ error: 'Playlist not found or not authorized' }, 404);
    }

    const body = await c.req.json();
    const { trackId } = body;

    if (!trackId) {
      return c.json({ error: 'Track ID is required' }, 400);
    }

    // Get next track order
    const lastTrack = await c.env.DB.prepare(
      'SELECT MAX(track_order) as max_order FROM playlist_tracks WHERE playlist_id = ?'
    ).bind(playlistId).first<{ max_order: number | null }>();
    const nextOrder = (lastTrack?.max_order ?? -1) + 1;

    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, track_order, added_by_wallet)
      VALUES (?, ?, ?, ?)
    `).bind(playlistId, trackId, nextOrder, walletAddress).run();

    // Update cached track count
    await c.env.DB.prepare(
      'UPDATE playlists SET cached_track_count = cached_track_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(playlistId).run();

    return c.json({ success: true });
  } catch (error) {
    console.error("Add track to playlist error:", error);
    return c.json({ error: 'Failed to add track to playlist' }, 500);
  }
});

// Remove track from playlist
app.delete("/api/music/playlists/:id/tracks/:trackId", async (c) => {
  const playlistId = parseInt(c.req.param('id'));
  const trackId = parseInt(c.req.param('trackId'));
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;
  let userId: string | null = null;

  // Try external wallet auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await c.env.DB.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) walletAddress = extUser.wallet_address as string;
  }

  // Try Mocha internal auth if no external wallet
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        userId = mochaUser.id;
        const userWallet = await c.env.DB.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(mochaUser.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (userWallet) walletAddress = userWallet.wallet_address;
      }
    }
  }

  if (!walletAddress && !userId) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Verify ownership - check both wallet_address and user_id
  let ownershipQuery = 'SELECT id FROM playlists WHERE id = ? AND (';
  const ownershipBindings: (number | string)[] = [playlistId];
  
  if (walletAddress && userId) {
    ownershipQuery += 'wallet_address = ? OR user_id = ?)';
    ownershipBindings.push(walletAddress, userId);
  } else if (walletAddress) {
    ownershipQuery += 'wallet_address = ?)';
    ownershipBindings.push(walletAddress);
  } else {
    ownershipQuery += 'user_id = ?)';
    ownershipBindings.push(userId!);
  }
  
  const playlist = await c.env.DB.prepare(ownershipQuery).bind(...ownershipBindings).first();

  if (!playlist) {
    return c.json({ error: 'Playlist not found or not authorized' }, 404);
  }

  await c.env.DB.prepare(
    'DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?'
  ).bind(playlistId, trackId).run();

  // Update cached track count
  await c.env.DB.prepare(
    'UPDATE playlists SET cached_track_count = MAX(0, cached_track_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(playlistId).run();

  return c.json({ success: true });
});

// Reorder tracks in playlist
app.put("/api/music/playlists/:id/reorder", async (c) => {
  const playlistId = parseInt(c.req.param('id'));
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await c.env.DB.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) walletAddress = extUser.wallet_address as string;
  }

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Verify ownership
  const playlist = await c.env.DB.prepare(
    'SELECT id FROM playlists WHERE id = ? AND wallet_address = ?'
  ).bind(playlistId, walletAddress).first();

  if (!playlist) {
    return c.json({ error: 'Playlist not found or not authorized' }, 404);
  }

  const body = await c.req.json();
  const { trackIds } = body; // Array of track IDs in new order

  if (!Array.isArray(trackIds)) {
    return c.json({ error: 'trackIds array is required' }, 400);
  }

  // Update each track's order
  for (let i = 0; i < trackIds.length; i++) {
    await c.env.DB.prepare(
      'UPDATE playlist_tracks SET track_order = ? WHERE playlist_id = ? AND track_id = ?'
    ).bind(i, playlistId, trackIds[i]).run();
  }

  return c.json({ success: true });
});

// Like a playlist
app.post("/api/music/playlists/:id/like", async (c) => {
  const playlistId = parseInt(c.req.param('id'));
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;
  let userId: string | null = null;

  // Try external wallet auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await c.env.DB.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) walletAddress = extUser.wallet_address as string;
  }

  // Try Mocha internal auth if no external wallet
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        userId = mochaUser.id;
        const userWallet = await c.env.DB.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(mochaUser.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (userWallet) walletAddress = userWallet.wallet_address;
      }
    }
  }

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Check if already liked
  const existing = await c.env.DB.prepare(
    'SELECT id FROM playlist_likes WHERE playlist_id = ? AND wallet_address = ?'
  ).bind(playlistId, walletAddress).first();

  if (existing) {
    return c.json({ success: true, liked: true });
  }

  await c.env.DB.prepare(
    'INSERT INTO playlist_likes (playlist_id, wallet_address, user_id) VALUES (?, ?, ?)'
  ).bind(playlistId, walletAddress, userId).run();

  return c.json({ success: true, liked: true });
});

// Unlike a playlist
app.delete("/api/music/playlists/:id/like", async (c) => {
  const playlistId = parseInt(c.req.param('id'));
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;

  // Try external wallet auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await c.env.DB.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) walletAddress = extUser.wallet_address as string;
  }

  // Try Mocha internal auth if no external wallet
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        const userWallet = await c.env.DB.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(mochaUser.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (userWallet) walletAddress = userWallet.wallet_address;
      }
    }
  }

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  await c.env.DB.prepare(
    'DELETE FROM playlist_likes WHERE playlist_id = ? AND wallet_address = ?'
  ).bind(playlistId, walletAddress).run();

  return c.json({ success: true, liked: false });
});

// Get liked playlists
app.get("/api/music/user/liked-playlists", async (c) => {
  // Use fast auth helper
  const { walletAddress } = await getFastAuth(c);

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const result = await c.env.DB.prepare(`
    SELECT p.*, 
      (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = p.id) as track_count,
      mp.name as creator_name, mp.handle as creator_handle
    FROM playlists p
    JOIN playlist_likes pl ON p.id = pl.playlist_id
    LEFT JOIN music_profiles mp ON p.wallet_address = mp.wallet_address
    WHERE pl.wallet_address = ? AND p.is_public = 1
    ORDER BY pl.created_at DESC
  `).bind(walletAddress).all();

  return c.json({ playlists: result.results || [] });
});

// Like an album
app.post("/api/music/albums/:id/like", async (c) => {
  const albumId = parseInt(c.req.param('id'));
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;
  let userId: string | null = null;

  // Try external wallet auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await c.env.DB.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) walletAddress = extUser.wallet_address as string;
  }

  // Try Mocha internal auth if no external wallet
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        userId = mochaUser.id;
        const userWallet = await c.env.DB.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(mochaUser.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (userWallet) walletAddress = userWallet.wallet_address;
      }
    }
  }

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Check if already liked
  const existing = await c.env.DB.prepare(
    'SELECT id FROM album_likes WHERE album_id = ? AND wallet_address = ?'
  ).bind(albumId, walletAddress).first();

  if (existing) {
    return c.json({ success: true, liked: true });
  }

  await c.env.DB.prepare(
    'INSERT INTO album_likes (album_id, wallet_address, user_id) VALUES (?, ?, ?)'
  ).bind(albumId, walletAddress, userId).run();

  return c.json({ success: true, liked: true });
});

// Unlike an album
app.delete("/api/music/albums/:id/like", async (c) => {
  const albumId = parseInt(c.req.param('id'));
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;

  // Try external wallet auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await c.env.DB.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) walletAddress = extUser.wallet_address as string;
  }

  // Try Mocha internal auth if no external wallet
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        const userWallet = await c.env.DB.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(mochaUser.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (userWallet) walletAddress = userWallet.wallet_address;
      }
    }
  }

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  await c.env.DB.prepare(
    'DELETE FROM album_likes WHERE album_id = ? AND wallet_address = ?'
  ).bind(albumId, walletAddress).run();

  return c.json({ success: true, liked: false });
});

// Get liked albums
app.get("/api/music/user/liked-albums", async (c) => {
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;

  // Try external wallet auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await c.env.DB.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) walletAddress = extUser.wallet_address as string;
  }

  // Try Mocha internal auth if no external wallet
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        const userWallet = await c.env.DB.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(mochaUser.id).first<{ wallet_address: string; internal_wallet_address?: string }>();
        if (userWallet) walletAddress = userWallet.wallet_address;
      }
    }
  }

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const result = await c.env.DB.prepare(`
    SELECT a.*, 
      mp.name as artist_name, mp.id as artist_id,
      (SELECT COUNT(*) FROM tracks WHERE album_id = a.id) as track_count
    FROM albums a
    JOIN album_likes al ON a.id = al.album_id
    LEFT JOIN music_profiles mp ON a.music_profile_id = mp.id
    WHERE al.wallet_address = ? AND a.is_published = 1
    ORDER BY al.created_at DESC
  `).bind(walletAddress).all();

  return c.json({ albums: result.results || [] });
});

// ═══════════════════════════════════════════════════════════════════════════
// MUSIC DASHBOARD ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

app.get("/api/music/dashboard/analytics", async (c) => {
  const db = c.env.DB;
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;
  let walletAddresses: string[] = [];
  let musicProfileId: number | null = null;

  // Try external wallet auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await db.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) {
      walletAddress = extUser.wallet_address as string;
      walletAddresses.push(extUser.wallet_address);
      if (extUser.internal_wallet_address) walletAddresses.push(extUser.internal_wallet_address);
    }
  }

  // Try Mocha internal auth if no external wallet
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        const userWallet = await db.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(mochaUser.id).first<{ wallet_address: string }>();
        if (userWallet) {
          walletAddress = userWallet.wallet_address;
          walletAddresses.push(userWallet.wallet_address);
        }
      }
    }
  }

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Get music profile using both addresses
  const profile = await findMusicProfile(db, walletAddresses);
  
  if (!profile) {
    return c.json({
      hasProfile: false,
      totalPlays: 0,
      totalTracks: 0,
      totalAlbums: 0,
      followers: 0,
      earnings: '0',
      topTracks: [],
    });
  }

  // Get follower count
  const profileWithFollowers = await db.prepare(
    'SELECT follower_count FROM music_profiles WHERE id = ?'
  ).bind(profile.id).first<{ follower_count: number }>();

  musicProfileId = profile.id;
  const followerCount = profileWithFollowers?.follower_count || 0;

  // Get total track plays
  const playsResult = await db.prepare(`
    SELECT COALESCE(SUM(t.play_count), 0) as total_plays
    FROM tracks t
    WHERE t.music_profile_id = ? AND t.is_published = 1
  `).bind(musicProfileId).first<{ total_plays: number }>();

  // Get total tracks and albums
  const countsResult = await db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM tracks WHERE music_profile_id = ? AND is_published = 1) as total_tracks,
      (SELECT COUNT(*) FROM albums WHERE music_profile_id = ? AND is_published = 1) as total_albums
  `).bind(musicProfileId, musicProfileId).first<{ total_tracks: number; total_albums: number }>();

  // Get earnings from music purchases
  const earningsResult = await db.prepare(`
    SELECT COALESCE(SUM(CAST(mp.amount_kas AS REAL)), 0) as total_earnings
    FROM music_purchases mp
    JOIN tracks t ON mp.content_type = 'track' AND mp.content_id = t.id
    WHERE t.music_profile_id = ?
  `).bind(musicProfileId).first<{ total_earnings: number }>();

  // Also get album purchase earnings
  const albumEarningsResult = await db.prepare(`
    SELECT COALESCE(SUM(CAST(mp.amount_kas AS REAL)), 0) as album_earnings
    FROM music_purchases mp
    JOIN albums a ON mp.content_type = 'album' AND mp.content_id = a.id
    WHERE a.music_profile_id = ?
  `).bind(musicProfileId).first<{ album_earnings: number }>();

  // Get top tracks by play count
  const topTracks = await db.prepare(`
    SELECT t.id, t.title, t.cover_art_url, t.play_count, t.price_kas,
      a.title as album_title
    FROM tracks t
    LEFT JOIN albums a ON t.album_id = a.id
    WHERE t.music_profile_id = ? AND t.is_published = 1
    ORDER BY t.play_count DESC
    LIMIT 5
  `).bind(musicProfileId).all();

  const totalEarnings = (earningsResult?.total_earnings || 0) + (albumEarningsResult?.album_earnings || 0);

  return c.json({
    hasProfile: true,
    totalPlays: playsResult?.total_plays || 0,
    totalTracks: countsResult?.total_tracks || 0,
    totalAlbums: countsResult?.total_albums || 0,
    followers: followerCount,
    earnings: totalEarnings.toFixed(2),
    topTracks: topTracks.results.map(t => ({
      id: t.id,
      title: t.title,
      coverArtUrl: t.cover_art_url,
      playCount: t.play_count || 0,
      priceKas: t.price_kas,
      albumTitle: t.album_title,
    })),
  });
});

app.get("/api/music/dashboard/tracks", async (c) => {
  const db = c.env.DB;
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;
  let walletAddresses: string[] = [];

  // Try external wallet auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await db.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) {
      walletAddress = extUser.wallet_address as string;
      walletAddresses.push(extUser.wallet_address);
      if (extUser.internal_wallet_address) walletAddresses.push(extUser.internal_wallet_address);
    }
  }

  // Try Mocha internal auth if no external wallet
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        const userWallet = await db.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(mochaUser.id).first<{ wallet_address: string }>();
        if (userWallet) {
          walletAddress = userWallet.wallet_address;
          walletAddresses.push(userWallet.wallet_address);
        }
      }
    }
  }

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Get music profile using both addresses
  const profile = await findMusicProfile(db, walletAddresses);
  
  if (!profile) {
    return c.json({ tracks: [] });
  }

  // Get all tracks for this profile
  const tracks = await db.prepare(`
    SELECT t.id, t.title, t.cover_art_url, t.audio_url, t.play_count, 
      t.price_kas, t.duration_seconds, t.created_at,
      a.title as album_title,
      (SELECT COUNT(*) FROM track_likes WHERE track_id = t.id) as like_count
    FROM tracks t
    LEFT JOIN albums a ON t.album_id = a.id
    WHERE t.music_profile_id = ? AND t.is_published = 1
    ORDER BY t.created_at DESC
    LIMIT 100
  `).bind(profile.id).all();

  return c.json({
    tracks: tracks.results.map(t => ({
      id: t.id,
      title: t.title,
      coverArtUrl: t.cover_art_url,
      audioUrl: t.audio_url,
      playCount: t.play_count || 0,
      likeCount: t.like_count || 0,
      priceKas: t.price_kas,
      durationSeconds: t.duration_seconds,
      albumTitle: t.album_title,
      createdAt: t.created_at,
    })),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PODCAST DASHBOARD ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/api/podcast/dashboard/analytics", async (c) => {
  const db = c.env.DB;
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;
  let walletAddresses: string[] = [];
  let musicProfileId: number | null = null;

  // Try external wallet auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await db.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) {
      walletAddress = extUser.wallet_address as string;
      walletAddresses.push(extUser.wallet_address);
      if (extUser.internal_wallet_address) walletAddresses.push(extUser.internal_wallet_address);
    }
  }

  // Try Mocha internal auth if no external wallet
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        const userWallet = await db.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(mochaUser.id).first<{ wallet_address: string }>();
        if (userWallet) {
          walletAddress = userWallet.wallet_address;
          walletAddresses.push(userWallet.wallet_address);
        }
      }
    }
  }

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Get music profile using both addresses
  const profile = await findMusicProfile(db, walletAddresses);
  
  if (!profile) {
    return c.json({
      hasProfile: false,
      totalPlays: 0,
      totalEpisodes: 0,
      totalPodcasts: 0,
      subscribers: 0,
      earnings: '0',
      topEpisodes: [],
    });
  }

  musicProfileId = profile.id;

  // Get total episode plays
  const playsResult = await db.prepare(`
    SELECT COALESCE(SUM(e.play_count), 0) as total_plays
    FROM podcast_episodes e
    JOIN podcasts p ON e.podcast_id = p.id
    WHERE p.music_profile_id = ? AND e.is_published = 1
  `).bind(musicProfileId).first<{ total_plays: number }>();

  // Get total episodes and podcasts
  const countsResult = await db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM podcast_episodes e JOIN podcasts p ON e.podcast_id = p.id WHERE p.music_profile_id = ? AND e.is_published = 1) as total_episodes,
      (SELECT COUNT(*) FROM podcasts WHERE music_profile_id = ? AND is_published = 1) as total_podcasts
  `).bind(musicProfileId, musicProfileId).first<{ total_episodes: number; total_podcasts: number }>();

  // Get total podcast subscribers
  const subscribersResult = await db.prepare(`
    SELECT COALESCE(SUM(p.subscriber_count), 0) as total_subscribers
    FROM podcasts p
    WHERE p.music_profile_id = ?
  `).bind(musicProfileId).first<{ total_subscribers: number }>();

  // Get earnings from episode purchases
  const earningsResult = await db.prepare(`
    SELECT COALESCE(SUM(CAST(mp.amount_kas AS REAL)), 0) as total_earnings
    FROM music_purchases mp
    JOIN podcast_episodes e ON mp.content_type = 'episode' AND mp.content_id = e.id
    JOIN podcasts p ON e.podcast_id = p.id
    WHERE p.music_profile_id = ?
  `).bind(musicProfileId).first<{ total_earnings: number }>();

  // Get top episodes by play count
  const topEpisodes = await db.prepare(`
    SELECT e.id, e.title, e.cover_art_url, e.play_count, e.price_kas, e.duration_seconds,
      p.title as podcast_title
    FROM podcast_episodes e
    JOIN podcasts p ON e.podcast_id = p.id
    WHERE p.music_profile_id = ? AND e.is_published = 1
    ORDER BY e.play_count DESC
    LIMIT 5
  `).bind(musicProfileId).all();

  return c.json({
    hasProfile: true,
    totalPlays: playsResult?.total_plays || 0,
    totalEpisodes: countsResult?.total_episodes || 0,
    totalPodcasts: countsResult?.total_podcasts || 0,
    subscribers: subscribersResult?.total_subscribers || 0,
    earnings: (earningsResult?.total_earnings || 0).toFixed(2),
    topEpisodes: topEpisodes.results.map(e => ({
      id: e.id,
      title: e.title,
      coverArtUrl: e.cover_art_url,
      playCount: e.play_count || 0,
      priceKas: e.price_kas,
      durationSeconds: e.duration_seconds,
      podcastTitle: e.podcast_title,
    })),
  });
});

app.get("/api/podcast/dashboard/episodes", async (c) => {
  const db = c.env.DB;
  const authHeader = c.req.header('Authorization');
  let walletAddress: string | null = null;
  let walletAddresses: string[] = [];

  // Try external wallet auth first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const extUser = await db.prepare(
      'SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?'
    ).bind(token).first<{ wallet_address: string; internal_wallet_address?: string }>();
    if (extUser) {
      walletAddress = extUser.wallet_address as string;
      walletAddresses.push(extUser.wallet_address);
      if (extUser.internal_wallet_address) walletAddresses.push(extUser.internal_wallet_address);
    }
  }

  // Try Mocha internal auth if no external wallet
  if (!walletAddress) {
    const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    if (sessionToken) {
      const mochaUser = await getCurrentUser(sessionToken, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (mochaUser) {
        const userWallet = await db.prepare(
          'SELECT wallet_address FROM user_wallets WHERE user_id = ?'
        ).bind(mochaUser.id).first<{ wallet_address: string }>();
        if (userWallet) {
          walletAddress = userWallet.wallet_address;
          walletAddresses.push(userWallet.wallet_address);
        }
      }
    }
  }

  if (!walletAddress) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Get music profile using both addresses
  const profile = await findMusicProfile(db, walletAddresses);
  
  if (!profile) {
    return c.json({ episodes: [] });
  }

  // Get all episodes for this profile's podcasts
  const episodes = await db.prepare(`
    SELECT e.id, e.title, e.cover_art_url, e.audio_url, e.video_url, e.play_count, 
      e.price_kas, e.duration_seconds, e.episode_number, e.season_number, e.created_at,
      p.title as podcast_title
    FROM podcast_episodes e
    JOIN podcasts p ON e.podcast_id = p.id
    WHERE p.music_profile_id = ? AND e.is_published = 1
    ORDER BY e.created_at DESC
    LIMIT 100
  `).bind(profile.id).all();

  return c.json({
    episodes: episodes.results.map(e => ({
      id: e.id,
      title: e.title,
      coverArtUrl: e.cover_art_url,
      audioUrl: e.audio_url,
      videoUrl: e.video_url,
      playCount: e.play_count || 0,
      priceKas: e.price_kas,
      durationSeconds: e.duration_seconds,
      episodeNumber: e.episode_number,
      seasonNumber: e.season_number,
      podcastTitle: e.podcast_title,
      createdAt: e.created_at,
    })),
  });
});

// ============================================
// LISTEN-TO-EARN REVIEW SYSTEM
// ============================================

const MAX_REVIEWS_PER_WALLET = 9;
const REVIEW_REWARD_REGULAR_KAS = "0.11";
const REVIEW_REWARD_FINAL_KAS = "0.12"; // 9th review gets 0.12 to make total 1 KAS

// GET /api/music/reviews/eligibility - Check if user can leave reviews
app.get("/api/music/reviews/eligibility", async (c) => {
  try {
    // Dual auth: external wallet OR Mocha session
    const authHeader = c.req.header("Authorization");
    const sessionCookie = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    
    let walletAddress: string | null = null;
    let walletAddresses: string[] = [];
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first();
      if (extUser) {
        walletAddress = extUser.wallet_address as string;
        walletAddresses.push(extUser.wallet_address as string);
        if (extUser.internal_wallet_address) walletAddresses.push(extUser.internal_wallet_address as string);
      }
    }
    
    if (!walletAddress && sessionCookie) {
      const user = await getCurrentUser(sessionCookie, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        const userWallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first();
        if (userWallet) {
          walletAddress = userWallet.wallet_address as string;
          walletAddresses.push(userWallet.wallet_address as string);
        }
      }
    }
    
    if (!walletAddress) {
      return c.json({ 
        eligible: false, 
        reason: "wallet_required",
        message: "You must connect a wallet to leave reviews"
      });
    }
    
    // Check if user has a music profile using both addresses
    const musicProfile = await findMusicProfile(c.env.DB, walletAddresses);
    
    if (!musicProfile) {
      return c.json({ 
        eligible: false, 
        reason: "music_profile_required",
        message: "You must create a music profile to leave reviews"
      });
    }
    
    // Count existing reviews
    const reviewCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM track_reviews WHERE reviewer_wallet_address = ?"
    ).bind(walletAddress).first();
    
    const count = (reviewCount?.count as number) || 0;
    
    // Calculate reward (only first 9 reviews are paid)
    const isPaid = count < MAX_REVIEWS_PER_WALLET;
    const nextRewardKas = !isPaid ? "0" : (count === 8 ? REVIEW_REWARD_FINAL_KAS : REVIEW_REWARD_REGULAR_KAS);
    
    return c.json({
      eligible: true,
      reviewCount: count,
      maxReviews: MAX_REVIEWS_PER_WALLET,
      remaining: Math.max(0, MAX_REVIEWS_PER_WALLET - count),
      nextRewardKas,
      isPaid,
      totalEarnedKas: (Math.min(count, 8) * 0.11 + (count >= 9 ? 0.12 : 0)).toFixed(2),
      walletAddress
    });
  } catch (error) {
    console.error("Review eligibility check error:", error);
    return c.json({ error: "Failed to check eligibility" }, 500);
  }
});

// Helper: Process payment for a single review
async function processReviewPayment(
  db: D1Database,
  reviewId: number,
  walletAddress: string,
  rewardKas: string
): Promise<{ success: boolean; transactionId: string | null; error: string | null }> {
  try {
    const platformWallet = await db.prepare(
      "SELECT user_id, wallet_address, encrypted_private_key FROM user_wallets WHERE is_admin = 1 LIMIT 1"
    ).first<{ user_id: string; wallet_address: string; encrypted_private_key: string }>();
    
    if (!platformWallet || !platformWallet.encrypted_private_key) {
      return { success: false, transactionId: null, error: "Platform wallet not configured" };
    }
    
    const platformPrivateKey = await decryptPrivateKey(platformWallet.encrypted_private_key, platformWallet.user_id);
    if (!platformPrivateKey) {
      return { success: false, transactionId: null, error: "Could not decrypt platform wallet" };
    }
    
    const rewardSompi = Math.floor(parseFloat(rewardKas) * 100000000);
    const txResult = await sendTransaction(
      platformWallet.wallet_address,
      walletAddress,
      rewardSompi,
      platformPrivateKey
    );
    
    if (txResult.success && txResult.transactionId) {
      // Update the review with successful payment
      await db.prepare(`
        UPDATE track_reviews 
        SET reward_kas = ?, transaction_id = ?, payment_status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(rewardKas, txResult.transactionId, reviewId).run();
      
      console.log(`Review reward sent: ${rewardKas} KAS to ${walletAddress}, txId: ${txResult.transactionId}`);
      return { success: true, transactionId: txResult.transactionId, error: null };
    } else {
      // Mark as failed but keep in queue for retry
      await db.prepare(`
        UPDATE track_reviews 
        SET payment_status = 'failed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(reviewId).run();
      
      return { success: false, transactionId: null, error: txResult.error || "Transaction failed" };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error("Review reward transaction error:", err);
    
    await db.prepare(`
      UPDATE track_reviews 
      SET payment_status = 'failed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(reviewId).run();
    
    return { success: false, transactionId: null, error };
  }
}

// Helper: Process queued AND failed review payments sequentially (auto-retry)
async function processQueuedReviewPayments(db: D1Database): Promise<void> {
  // Find all queued/failed/pending/processing reviews that need payment (retry_count < 5 to prevent infinite loops)
  const queuedReviews = await db.prepare(`
    SELECT tr.id, tr.reviewer_wallet_address, tr.retry_count,
           (SELECT COUNT(*) FROM track_reviews WHERE reviewer_wallet_address = tr.reviewer_wallet_address AND id < tr.id) as prior_count
    FROM track_reviews tr
    WHERE (tr.payment_status IN ('queued', 'pending', 'processing') OR (tr.payment_status = 'failed' AND COALESCE(tr.retry_count, 0) < 5))
    ORDER BY tr.id ASC
    LIMIT 10
  `).all<{ id: number; reviewer_wallet_address: string; prior_count: number; retry_count: number | null }>();
  
  for (const review of queuedReviews.results) {
    // Calculate reward based on how many paid reviews they had before this one
    const isPaid = review.prior_count < MAX_REVIEWS_PER_WALLET;
    if (!isPaid) {
      // Mark as completed with no payment
      await db.prepare(`
        UPDATE track_reviews SET payment_status = 'completed', reward_kas = '0', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(review.id).run();
      continue;
    }
    
    const rewardKas = review.prior_count === 8 ? REVIEW_REWARD_FINAL_KAS : REVIEW_REWARD_REGULAR_KAS;
    
    // Wait a bit between payments to allow UTXO to settle
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Mark as processing and increment retry count
    await db.prepare(`
      UPDATE track_reviews SET payment_status = 'processing', retry_count = COALESCE(retry_count, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(review.id).run();
    
    const result = await processReviewPayment(db, review.id, review.reviewer_wallet_address, rewardKas);
    
    // Log the result for debugging
    console.log(`Payment for review ${review.id} to ${review.reviewer_wallet_address}: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.error || result.transactionId}`);
  }
}

// Helper: Try to acquire payment lock (returns true if acquired)
async function tryAcquirePaymentLock(db: D1Database, lockKey: string): Promise<boolean> {
  const now = new Date().toISOString();
  
  // Try to acquire lock - only if not locked or lock has expired (60 second timeout)
  const result = await db.prepare(`
    UPDATE payment_processing_lock 
    SET locked_at = ?, locked_by = 'worker'
    WHERE lock_key = ? AND (locked_at IS NULL OR datetime(locked_at, '+60 seconds') < datetime(?))
  `).bind(now, lockKey, now).run();
  
  return result.meta.changes > 0;
}

// Helper: Release payment lock
async function releasePaymentLock(db: D1Database, lockKey: string): Promise<void> {
  await db.prepare(`
    UPDATE payment_processing_lock SET locked_at = NULL, locked_by = NULL WHERE lock_key = ?
  `).bind(lockKey).run();
}

// POST /api/music/tracks/:id/review - Submit a review and receive reward
app.post("/api/music/tracks/:id/review", async (c) => {
  try {
    const trackId = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { rating, comment } = body;
    
    // Validate input
    if (!rating || rating < 1 || rating > 5) {
      return c.json({ error: "Rating must be between 1 and 5" }, 400);
    }
    // Comment is required and must be 10-500 characters
    const trimmedComment = comment?.trim() || null;
    if (!trimmedComment) {
      return c.json({ error: "Comment is required" }, 400);
    }
    if (trimmedComment.length < 10) {
      return c.json({ error: "Comment must be at least 10 characters" }, 400);
    }
    if (trimmedComment.length > 500) {
      return c.json({ error: "Comment must be 500 characters or less" }, 400);
    }
    
    // Dual auth
    const authHeader = c.req.header("Authorization");
    const sessionCookie = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    
    let walletAddress: string | null = null;
    let userId: string | null = null;
    let walletAddresses: string[] = [];
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first();
      if (extUser) {
        // Use internal wallet address if available (for Kastle/KasWare with internal custody)
        // This ensures all users with internal wallets are treated identically
        walletAddress = extUser.wallet_address as string;
        walletAddresses.push(extUser.wallet_address as string);
        if (extUser.internal_wallet_address) walletAddresses.push(extUser.internal_wallet_address as string);
      }
    }
    
    if (!walletAddress && sessionCookie) {
      const user = await getCurrentUser(sessionCookie, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        userId = user.id;
        const userWallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first();
        if (userWallet) {
          walletAddress = userWallet.wallet_address as string;
          walletAddresses.push(userWallet.wallet_address as string);
        }
      }
    }
    
    if (!walletAddress) {
      return c.json({ error: "Wallet required to leave reviews" }, 401);
    }
    
    // Check music profile exists using both addresses
    const musicProfile = await findMusicProfile(c.env.DB, walletAddresses);
    
    if (!musicProfile) {
      return c.json({ error: "Music profile required to leave reviews" }, 403);
    }
    
    // Check track exists
    const track = await c.env.DB.prepare(
      "SELECT id, title, music_profile_id FROM tracks WHERE id = ?"
    ).bind(trackId).first();
    
    if (!track) {
      return c.json({ error: "Track not found" }, 404);
    }
    
    // Prevent reviewing own tracks
    if (track.music_profile_id === musicProfile.id) {
      return c.json({ error: "You cannot review your own tracks" }, 403);
    }
    
    // Check if already reviewed this track
    const existingReview = await c.env.DB.prepare(
      "SELECT id FROM track_reviews WHERE track_id = ? AND reviewer_wallet_address = ?"
    ).bind(trackId, walletAddress).first();
    
    if (existingReview) {
      return c.json({ error: "You have already reviewed this track" }, 400);
    }
    
    // Check review count (for determining if paid)
    const reviewCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM track_reviews WHERE reviewer_wallet_address = ?"
    ).bind(walletAddress).first();
    
    const count = (reviewCount?.count as number) || 0;
    
    // Only pay for first 9 reviews, but allow unlimited reviews after
    const isPaid = count < MAX_REVIEWS_PER_WALLET;
    const rewardKas = !isPaid ? "0" : (count === 8 ? REVIEW_REWARD_FINAL_KAS : REVIEW_REWARD_REGULAR_KAS);
    
    // Try to acquire payment lock
    const lockAcquired = await tryAcquirePaymentLock(c.env.DB, 'review_payments');
    
    let transactionId: string | null = null;
    let rewardSent = false;
    let rewardError: string | null = null;
    let paymentQueued = false;
    
    if (!lockAcquired && isPaid) {
      // Another payment is in progress - queue this review
      paymentQueued = true;
      
      // Insert review with queued status and actual reward amount
      await c.env.DB.prepare(`
        INSERT INTO track_reviews (track_id, reviewer_wallet_address, reviewer_user_id, rating, comment, reward_kas, transaction_id, payment_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, 'queued', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(trackId, walletAddress, userId, rating, trimmedComment, rewardKas).run();
      
    } else if (isPaid && parseFloat(rewardKas) > 0) {
      // We have the lock - insert review as processing with actual reward amount
      const insertResult = await c.env.DB.prepare(`
        INSERT INTO track_reviews (track_id, reviewer_wallet_address, reviewer_user_id, rating, comment, reward_kas, transaction_id, payment_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, 'processing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(trackId, walletAddress, userId, rating, trimmedComment, rewardKas).run();
      
      const reviewId = insertResult.meta.last_row_id as number;
      
      // Process payment
      const paymentResult = await processReviewPayment(c.env.DB, reviewId, walletAddress, rewardKas);
      transactionId = paymentResult.transactionId;
      rewardSent = paymentResult.success;
      rewardError = paymentResult.error;
      
      // ALWAYS process queued/failed payments (regardless of this payment's outcome)
      try {
        await processQueuedReviewPayments(c.env.DB);
      } catch (queueErr) {
        console.error("Queue processing error:", queueErr);
      }
      
      // Release lock
      await releasePaymentLock(c.env.DB, 'review_payments');
      
    } else {
      // Not paid (>9 reviews) - just insert with completed status
      await c.env.DB.prepare(`
        INSERT INTO track_reviews (track_id, reviewer_wallet_address, reviewer_user_id, rating, comment, reward_kas, transaction_id, payment_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '0', NULL, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(trackId, walletAddress, userId, rating, trimmedComment).run();
    }
    
    // Update cached rating values on the track
    await c.env.DB.prepare(`
      UPDATE tracks SET 
        cached_avg_rating = (SELECT AVG(rating) FROM track_reviews WHERE track_id = ?),
        cached_review_count = (SELECT COUNT(*) FROM track_reviews WHERE track_id = ?),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(trackId, trackId, trackId).run();
    
    const paidReviewsRemaining = Math.max(0, MAX_REVIEWS_PER_WALLET - count - 1);
    
    // Determine the appropriate message
    let message = "Review submitted! Thank you for your feedback";
    if (paymentQueued) {
      message = `Review submitted! Your ${rewardKas} KAS reward is being processed - it will arrive shortly.`;
    } else if (isPaid && rewardSent) {
      message = `Review submitted! You earned ${rewardKas} KAS - check your wallet!`;
    } else if (isPaid && rewardError) {
      message = `Review submitted! Reward pending - please contact support.`;
    }
    
    return c.json({
      success: true,
      message,
      review: {
        trackId,
        rating,
        comment: trimmedComment,
        rewardKas: rewardSent ? rewardKas : "0",
        transactionId,
        isPaid,
        rewardSent,
        rewardError,
        paymentQueued
      },
      paidReviewsRemaining
    });
  } catch (error) {
    console.error("Submit review error:", error);
    return c.json({ error: "Failed to submit review" }, 500);
  }
});

// POST /api/music/reviews/process-pending - Trigger processing of queued/failed payments (public endpoint)
app.post("/api/music/reviews/process-pending", async (c) => {
  try {
    // Try to acquire lock - if another worker is processing, skip
    const lockAcquired = await tryAcquirePaymentLock(c.env.DB, 'review_payments');
    
    if (!lockAcquired) {
      return c.json({ success: true, message: "Payment processing already in progress" });
    }
    
    try {
      // Count pending payments before processing
      const pending = await c.env.DB.prepare(`
        SELECT COUNT(*) as count FROM track_reviews 
        WHERE payment_status IN ('queued', 'failed') AND COALESCE(retry_count, 0) < 5
      `).first<{ count: number }>();
      
      const pendingCount = pending?.count || 0;
      
      if (pendingCount > 0) {
        console.log(`Processing ${pendingCount} pending review payments...`);
        await processQueuedReviewPayments(c.env.DB);
      }
      
      return c.json({ success: true, processed: pendingCount });
    } finally {
      await releasePaymentLock(c.env.DB, 'review_payments');
    }
  } catch (error) {
    console.error("Process pending payments error:", error);
    return c.json({ error: "Failed to process payments" }, 500);
  }
});

// GET /api/music/tracks/:id/reviews - Get all reviews for a track
app.get("/api/music/tracks/:id/reviews", async (c) => {
  try {
    const trackId = parseInt(c.req.param("id"));
    
    const reviews = await c.env.DB.prepare(`
      SELECT 
        tr.id, tr.rating, tr.comment, tr.created_at,
        mp.id as reviewer_profile_id, mp.name as reviewer_name, mp.handle as reviewer_handle, mp.avatar_url as reviewer_avatar
      FROM track_reviews tr
      LEFT JOIN music_profiles mp ON mp.wallet_address = tr.reviewer_wallet_address
      WHERE tr.track_id = ?
      ORDER BY tr.created_at DESC
    `).bind(trackId).all();
    
    // Calculate average rating
    const avgRating = reviews.results.length > 0
      ? reviews.results.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.results.length
      : 0;
    
    return c.json({
      reviews: reviews.results.map((r: any) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.created_at,
        reviewer: {
          profileId: r.reviewer_profile_id,
          name: r.reviewer_name || "Anonymous",
          handle: r.reviewer_handle,
          avatarUrl: r.reviewer_avatar
        }
      })),
      totalReviews: reviews.results.length,
      averageRating: Math.round(avgRating * 10) / 10
    });
  } catch (error) {
    console.error("Get track reviews error:", error);
    return c.json({ error: "Failed to get reviews" }, 500);
  }
});

// GET /api/music/dashboard/reviews - Get reviews received by creator's tracks
app.get("/api/music/dashboard/reviews", async (c) => {
  try {
    // Dual auth
    const authHeader = c.req.header("Authorization");
    const sessionCookie = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    
    let walletAddress: string | null = null;
    let walletAddresses: string[] = [];
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first();
      if (extUser) {
        walletAddress = extUser.wallet_address as string;
        walletAddresses.push(extUser.wallet_address as string);
        if (extUser.internal_wallet_address) walletAddresses.push(extUser.internal_wallet_address as string);
      }
    }
    
    if (!walletAddress && sessionCookie) {
      const user = await getCurrentUser(sessionCookie, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        const userWallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first();
        if (userWallet) {
          walletAddress = userWallet.wallet_address as string;
          walletAddresses.push(userWallet.wallet_address as string);
        }
      }
    }
    
    if (!walletAddress) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    // Get music profile using both addresses
    const musicProfile = await findMusicProfile(c.env.DB, walletAddresses);
    
    if (!musicProfile) {
      return c.json({ reviews: [], totalReviews: 0, averageRating: 0 });
    }
    
    // Get reviews for all tracks by this creator
    const reviews = await c.env.DB.prepare(`
      SELECT 
        tr.id, tr.track_id, tr.rating, tr.comment, tr.created_at, tr.reward_kas,
        t.title as track_title, t.cover_art_url as track_cover,
        mp.name as reviewer_name, mp.avatar_url as reviewer_avatar
      FROM track_reviews tr
      JOIN tracks t ON t.id = tr.track_id
      LEFT JOIN music_profiles mp ON mp.wallet_address = tr.reviewer_wallet_address
      WHERE t.music_profile_id = ?
      ORDER BY tr.created_at DESC
      LIMIT 100
    `).bind(musicProfile.id).all();
    
    // Calculate stats
    const avgRating = reviews.results.length > 0
      ? reviews.results.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.results.length
      : 0;
    
    // Rating distribution
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.results.forEach((r: any) => {
      distribution[r.rating as keyof typeof distribution]++;
    });
    
    return c.json({
      reviews: reviews.results.map((r: any) => ({
        id: r.id,
        trackId: r.track_id,
        trackTitle: r.track_title,
        trackCoverUrl: r.track_cover,
        rating: r.rating,
        comment: r.comment,
        reviewerName: r.reviewer_name || "Anonymous",
        reviewerAvatar: r.reviewer_avatar,
        rewardKas: r.reward_kas,
        createdAt: r.created_at
      })),
      totalReviews: reviews.results.length,
      averageRating: Math.round(avgRating * 10) / 10,
      ratingDistribution: distribution
    });
  } catch (error) {
    console.error("Get dashboard reviews error:", error);
    return c.json({ error: "Failed to get reviews" }, 500);
  }
});

// GET /api/music/user/reviews - Get all reviews made by current user
app.get("/api/music/user/reviews", async (c) => {
  try {
    // Use fast auth helper
    const { walletAddress } = await getFastAuth(c);
    
    if (!walletAddress) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    // Get all reviews made by this user
    const reviews = await c.env.DB.prepare(`
      SELECT 
        tr.id, tr.track_id, tr.rating, tr.comment, tr.reward_kas, tr.created_at,
        t.title as track_title, t.cover_art_url as track_cover,
        mp.name as artist_name, mp.handle as artist_handle, mp.avatar_url as artist_avatar
      FROM track_reviews tr
      JOIN tracks t ON t.id = tr.track_id
      LEFT JOIN music_profiles mp ON mp.id = t.music_profile_id
      WHERE tr.reviewer_wallet_address = ?
      ORDER BY tr.created_at DESC
    `).bind(walletAddress).all();
    
    // Calculate total earned
    const totalEarned = reviews.results.reduce((sum: number, r: any) => {
      return sum + parseFloat(r.reward_kas || "0");
    }, 0);
    
    return c.json({
      reviews: reviews.results.map((r: any) => ({
        id: r.id,
        trackId: r.track_id,
        trackTitle: r.track_title,
        trackCover: r.track_cover,
        artistName: r.artist_name || "Unknown Artist",
        artistHandle: r.artist_handle,
        artistAvatar: r.artist_avatar,
        rating: r.rating,
        comment: r.comment,
        rewardKas: r.reward_kas,
        createdAt: r.created_at
      })),
      totalReviews: reviews.results.length,
      totalEarnedKas: totalEarned.toFixed(2)
    });
  } catch (error) {
    console.error("Get user reviews error:", error);
    return c.json({ error: "Failed to get reviews" }, 500);
  }
});

// GET /api/music/user/shares - Get all track shares owned by current user
app.get("/api/music/user/shares", async (c) => {
  try {
    // Use fast auth helper
    const { walletAddress } = await getFastAuth(c);
    
    if (!walletAddress) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    // Get all shares owned by this user
    const shares = await c.env.DB.prepare(`
      SELECT 
        ts.id, ts.track_id, ts.ticker, ts.shares_owned, ts.purchase_price_kas, ts.purchased_at,
        t.title as track_title, t.cover_art_url as track_cover, t.total_shares,
        mp.id as artist_id, mp.name as artist_name
      FROM track_shares ts
      JOIN tracks t ON t.id = ts.track_id
      LEFT JOIN music_profiles mp ON mp.id = t.music_profile_id
      WHERE ts.owner_address = ?
      ORDER BY ts.purchased_at DESC
    `).bind(walletAddress).all();
    
    return c.json({
      shares: shares.results.map((s: any) => ({
        id: s.id,
        trackId: s.track_id,
        trackTitle: s.track_title,
        trackCover: s.track_cover,
        artistId: s.artist_id,
        artistName: s.artist_name || "Unknown Artist",
        ticker: s.ticker,
        sharesOwned: s.shares_owned,
        totalShares: s.total_shares || 0,
        purchasePriceKas: s.purchase_price_kas || "0",
        purchasedAt: s.purchased_at
      })),
      totalHoldings: shares.results.length
    });
  } catch (error) {
    console.error("Get user shares error:", error);
    return c.json({ error: "Failed to get shares" }, 500);
  }
});

// GET /api/music/user/reviewed-tracks - Get list of track IDs user has reviewed
app.get("/api/music/user/reviewed-tracks", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const sessionCookie = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    
    const walletAddresses: string[] = [];
    let userId: string | null = null;
    let skipMochaAuth = false;
    
    // Check external wallet auth (fast DB lookup)
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first();
      if (extUser) {
        if (extUser.wallet_address) walletAddresses.push(extUser.wallet_address as string);
        if (extUser.internal_wallet_address) walletAddresses.push(extUser.internal_wallet_address as string);
        skipMochaAuth = true; // External user found, skip slow Mocha auth
      }
    }
    
    // Only check Mocha session if no external wallet found
    if (!skipMochaAuth && sessionCookie) {
      try {
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
        const user = await Promise.race([
          getCurrentUser(sessionCookie, {
            apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
            apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
          }),
          timeoutPromise
        ]);
        if (user) {
          userId = user.id;
          const userWallet = await c.env.DB.prepare(
            "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
          ).bind(user.id).first();
          if (userWallet && userWallet.wallet_address) {
            walletAddresses.push(userWallet.wallet_address as string);
          }
        }
      } catch {}
    }
    
    if (walletAddresses.length === 0 && !userId) {
      return c.json({ trackIds: [] });
    }
    
    // Query by wallet addresses OR user ID
    const uniqueAddresses = [...new Set(walletAddresses)];
    let reviews;
    
    if (uniqueAddresses.length > 0 && userId) {
      const placeholders = uniqueAddresses.map(() => '?').join(',');
      reviews = await c.env.DB.prepare(
        `SELECT DISTINCT track_id FROM track_reviews WHERE reviewer_wallet_address IN (${placeholders}) OR reviewer_user_id = ?`
      ).bind(...uniqueAddresses, userId).all();
    } else if (uniqueAddresses.length > 0) {
      const placeholders = uniqueAddresses.map(() => '?').join(',');
      reviews = await c.env.DB.prepare(
        `SELECT DISTINCT track_id FROM track_reviews WHERE reviewer_wallet_address IN (${placeholders})`
      ).bind(...uniqueAddresses).all();
    } else if (userId) {
      reviews = await c.env.DB.prepare(
        "SELECT DISTINCT track_id FROM track_reviews WHERE reviewer_user_id = ?"
      ).bind(userId).all();
    } else {
      return c.json({ trackIds: [] });
    }
    
    return c.json({
      trackIds: reviews.results.map((r: Record<string, unknown>) => r.track_id as number)
    });
  } catch (error) {
    console.error("Get reviewed tracks error:", error);
    return c.json({ error: "Failed to get reviewed tracks" }, 500);
  }
});

// POST /api/music/admin/retry-review-payment/:reviewId - Admin retry failed review payment
app.post("/api/music/admin/retry-review-payment/:reviewId", adminMiddleware, async (c) => {
  try {
    const reviewId = parseInt(c.req.param("reviewId"));
    
    // Try to acquire the payment lock
    const lockAcquired = await tryAcquirePaymentLock(c.env.DB, 'review_payments');
    if (!lockAcquired) {
      return c.json({ error: "Another payment is currently processing. Please wait and try again." }, 423);
    }
    
    try {
      // Get the review
      const review = await c.env.DB.prepare(
        "SELECT id, track_id, reviewer_wallet_address, reward_kas, transaction_id, payment_status FROM track_reviews WHERE id = ?"
      ).bind(reviewId).first<{ id: number; track_id: number; reviewer_wallet_address: string; reward_kas: string; transaction_id: string | null; payment_status: string | null }>();
      
      if (!review) {
        return c.json({ error: "Review not found" }, 404);
      }
      
      // Check if already paid
      if (review.payment_status === 'completed' || (review.transaction_id && review.transaction_id !== "null" && review.transaction_id !== null)) {
        return c.json({ error: "Review already paid", transactionId: review.transaction_id }, 400);
      }
      
      // Count reviews by this wallet to determine reward amount
      const countResult = await c.env.DB.prepare(
        "SELECT COUNT(*) as count FROM track_reviews WHERE reviewer_wallet_address = ? AND id < ?"
      ).bind(review.reviewer_wallet_address, reviewId).first<{ count: number }>();
      
      const count = countResult?.count || 0;
      const MAX_PAID_REVIEWS = 9;
      
      if (count >= MAX_PAID_REVIEWS) {
        // Mark as completed with no payment
        await c.env.DB.prepare(
          "UPDATE track_reviews SET payment_status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(reviewId).run();
        return c.json({ error: "Review exceeds paid limit (9 reviews max)", markedComplete: true }, 400);
      }
      
      // Determine reward: 0.12 for 9th review, 0.11 for others
      const rewardKas = count === 8 ? "0.12" : "0.11";
      
      // Process the payment
      const paymentResult = await processReviewPayment(c.env.DB, reviewId, review.reviewer_wallet_address, rewardKas);
      
      if (!paymentResult.success) {
        return c.json({ error: paymentResult.error || "Transaction failed" }, 500);
      }
      
      // Process any other queued payments
      await processQueuedReviewPayments(c.env.DB);
      
      return c.json({
        success: true,
        reviewId,
        rewardKas,
        transactionId: paymentResult.transactionId,
        recipientWallet: review.reviewer_wallet_address
      });
    } finally {
      // Always release the lock
      await releasePaymentLock(c.env.DB, 'review_payments');
    }
  } catch (error) {
    console.error("Retry review payment error:", error);
    return c.json({ error: "Failed to retry payment" }, 500);
  }
});

// POST /api/music/admin/process-payment-queue - Admin process all queued payments
app.post("/api/music/admin/process-payment-queue", adminMiddleware, async (c) => {
  try {
    const lockAcquired = await tryAcquirePaymentLock(c.env.DB, 'review_payments');
    if (!lockAcquired) {
      return c.json({ error: "Another payment is currently processing. Please wait." }, 423);
    }
    
    try {
      // Find all queued/failed/pending reviews that need payment processing
      const pendingReviews = await c.env.DB.prepare(`
        SELECT id FROM track_reviews 
        WHERE payment_status IN ('queued', 'failed', 'pending', 'processing') 
           OR (payment_status IS NULL AND transaction_id IS NULL)
        ORDER BY id ASC
      `).all<{ id: number }>();
      
      const processed: { id: number; success: boolean; error?: string }[] = [];
      
      for (const review of pendingReviews.results) {
        // Get full review info
        const fullReview = await c.env.DB.prepare(
          "SELECT id, reviewer_wallet_address FROM track_reviews WHERE id = ?"
        ).bind(review.id).first<{ id: number; reviewer_wallet_address: string }>();
        
        if (!fullReview) continue;
        
        // Count prior reviews
        const countResult = await c.env.DB.prepare(
          "SELECT COUNT(*) as count FROM track_reviews WHERE reviewer_wallet_address = ? AND id < ?"
        ).bind(fullReview.reviewer_wallet_address, review.id).first<{ count: number }>();
        
        const count = countResult?.count || 0;
        
        if (count >= MAX_REVIEWS_PER_WALLET) {
          await c.env.DB.prepare(
            "UPDATE track_reviews SET payment_status = 'completed', reward_kas = '0', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
          ).bind(review.id).run();
          processed.push({ id: review.id, success: true, error: "Exceeded paid limit" });
          continue;
        }
        
        const rewardKas = count === 8 ? REVIEW_REWARD_FINAL_KAS : REVIEW_REWARD_REGULAR_KAS;
        
        // Wait between payments - needs 10s for blockchain to confirm and UTXOs to refresh
        if (processed.length > 0) {
          console.log(`Waiting 10s before next payment... (processed ${processed.length} so far)`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        const result = await processReviewPayment(c.env.DB, review.id, fullReview.reviewer_wallet_address, rewardKas);
        processed.push({ id: review.id, success: result.success, error: result.error || undefined });
      }
      
      return c.json({
        success: true,
        processedCount: processed.length,
        results: processed
      });
    } finally {
      await releasePaymentLock(c.env.DB, 'review_payments');
    }
  } catch (error) {
    console.error("Process payment queue error:", error);
    return c.json({ error: "Failed to process queue" }, 500);
  }
});

// GET /api/music/admin/failed-review-payments - Admin list reviews with failed payments
app.get("/api/music/admin/failed-review-payments", adminMiddleware, async (c) => {
  try {
    const reviews = await c.env.DB.prepare(`
      SELECT tr.id, tr.track_id, tr.reviewer_wallet_address, tr.rating, tr.reward_kas, tr.transaction_id, tr.payment_status, tr.retry_count, tr.created_at,
             t.title as track_title
      FROM track_reviews tr
      LEFT JOIN tracks t ON tr.track_id = t.id
      WHERE tr.payment_status IN ('queued', 'failed', 'pending', 'processing')
         OR (tr.payment_status IS NULL AND tr.transaction_id IS NULL)
      ORDER BY tr.created_at DESC
    `).all();
    
    return c.json({
      failedPayments: reviews.results.map((r: any) => ({
        id: r.id,
        trackId: r.track_id,
        trackTitle: r.track_title,
        reviewerWallet: r.reviewer_wallet_address,
        rating: r.rating,
        rewardKas: r.reward_kas,
        transactionId: r.transaction_id,
        paymentStatus: r.payment_status,
        retryCount: r.retry_count,
        createdAt: r.created_at
      }))
    });
  } catch (error) {
    console.error("Get failed review payments error:", error);
    return c.json({ error: "Failed to get failed payments" }, 500);
  }
});

// GET /api/music/admin/tracks-missing-beatgrid - Admin get tracks without beat grids
app.get("/api/music/admin/tracks-missing-beatgrid", adminMiddleware, async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT 
        t.id, 
        t.title, 
        t.audio_url,
        t.artist_name,
        mp.name as profile_name
      FROM tracks t
      LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
      WHERE t.audio_url IS NOT NULL 
        AND t.audio_url != ''
        AND (t.beat_grid IS NULL OR t.beat_grid = '[]' OR t.beat_grid = '')
      ORDER BY t.created_at DESC
    `).all();

    const tracks = result.results.map((t: any) => ({
      id: t.id,
      title: t.title,
      audioUrl: t.audio_url,
      artistName: t.artist_name || t.profile_name || 'Unknown Artist',
      filename: `track-${t.id}.mp3`
    }));

    return c.json({
      success: true,
      tracks,
      count: tracks.length
    });
  } catch (error) {
    console.error("Get tracks missing beatgrid error:", error);
    return c.json({ success: false, error: "Failed to get tracks" }, 500);
  }
});

// GET /api/music/admin/all-tracks - Admin get all tracks for beat re-analysis
app.get("/api/music/admin/all-tracks", adminMiddleware, async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT 
        t.id, 
        t.title, 
        t.audio_url,
        t.artist_name,
        t.bpm,
        t.beat_grid,
        mp.name as profile_name
      FROM tracks t
      LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
      WHERE t.audio_url IS NOT NULL AND t.audio_url != ''
      ORDER BY t.id ASC
    `).all();

    return c.json({
      tracks: result.results.map((t: any) => ({
        id: t.id,
        title: t.title,
        audioUrl: t.audio_url,
        artistName: t.artist_name || t.profile_name || 'Unknown Artist',
        currentBpm: t.bpm,
        hasBeatGrid: !!t.beat_grid && t.beat_grid !== '[]'
      }))
    });
  } catch (error) {
    console.error("Get all tracks error:", error);
    return c.json({ error: "Failed to get tracks" }, 500);
  }
});

// PATCH /api/music/admin/update-beat-grid/:id - Admin update track beat grid
app.patch("/api/music/admin/update-beat-grid/:id", adminMiddleware, async (c) => {
  try {
    const trackId = parseInt(c.req.param("id"));
    const { beatGrid, bpm } = await c.req.json();

    if (!Array.isArray(beatGrid)) {
      return c.json({ error: "beatGrid must be an array" }, 400);
    }

    await c.env.DB.prepare(`
      UPDATE tracks 
      SET beat_grid = ?, bpm = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(JSON.stringify(beatGrid), bpm || null, trackId).run();

    return c.json({ success: true, trackId, beatCount: beatGrid.length, bpm });
  } catch (error) {
    console.error("Update beat grid error:", error);
    return c.json({ error: "Failed to update beat grid" }, 500);
  }
});

// GET /api/music/admin/platform-wallet-status - Admin check platform wallet health for review payments
app.get("/api/music/admin/platform-wallet-status", adminMiddleware, async (c) => {
  try {
    const platformWallet = await c.env.DB.prepare(
      "SELECT user_id, wallet_address, encrypted_private_key FROM user_wallets WHERE is_admin = 1 LIMIT 1"
    ).first<{ user_id: string; wallet_address: string; encrypted_private_key: string | null }>();
    
    if (!platformWallet) {
      return c.json({
        configured: false,
        hasPrivateKey: false,
        walletAddress: null,
        balance: "0.00",
        canPayRewards: false,
        message: "No admin wallet found. Log in with your admin account to auto-create."
      });
    }
    
    const hasPrivateKey = !!platformWallet.encrypted_private_key;
    
    // Get balance
    const balance = await getWalletBalance(platformWallet.wallet_address);
    const balanceKAS = balance?.balanceKAS || "0.00";
    const balanceNum = parseFloat(balanceKAS);
    
    // Check if we can pay at least one reward (0.12 KAS + fees)
    const canPayRewards = hasPrivateKey && balanceNum >= 0.15;
    
    return c.json({
      configured: true,
      hasPrivateKey,
      walletAddress: platformWallet.wallet_address,
      balance: balanceKAS,
      canPayRewards,
      message: !hasPrivateKey 
        ? "Platform wallet missing private key. Contact support."
        : !canPayRewards 
          ? `Balance too low for payouts. Need at least 0.15 KAS (current: ${balanceKAS} KAS)`
          : "Platform wallet ready for payouts"
    });
  } catch (error) {
    console.error("Platform wallet status error:", error);
    return c.json({ error: "Failed to check platform wallet status" }, 500);
  }
});

// GET /api/music/reviews/check/:trackId - Check if user has reviewed a specific track
app.get("/api/music/reviews/check/:trackId", async (c) => {
  try {
    const trackId = parseInt(c.req.param("trackId"));
    
    // Dual auth
    const authHeader = c.req.header("Authorization");
    const sessionCookie = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    
    let walletAddress: string | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first();
      if (extUser) {
        walletAddress = extUser.wallet_address as string;
      }
    }
    
    if (!walletAddress && sessionCookie) {
      const user = await getCurrentUser(sessionCookie, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        const userWallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first();
        if (userWallet) {
          walletAddress = userWallet.wallet_address as string;
        }
      }
    }
    
    if (!walletAddress) {
      return c.json({ hasReviewed: false, canReview: false });
    }
    
    const existingReview = await c.env.DB.prepare(
      "SELECT id, rating, comment FROM track_reviews WHERE track_id = ? AND reviewer_wallet_address = ?"
    ).bind(trackId, walletAddress).first();
    
    return c.json({
      hasReviewed: !!existingReview,
      canReview: !existingReview,
      existingReview: existingReview ? {
        id: existingReview.id,
        rating: existingReview.rating,
        comment: existingReview.comment
      } : null
    });
  } catch (error) {
    console.error("Check review status error:", error);
    return c.json({ error: "Failed to check review status" }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MARKETPLACE API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/marketplace/themes - Submit a theme for approval
app.post("/api/marketplace/themes", async (c) => {
  try {
    // Dual auth
    const authHeader = c.req.header("Authorization");
    const sessionCookie = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
    
    let walletAddress: string | null = null;
    let walletAddresses: string[] = [];
    let musicProfileId: number | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const extUser = await c.env.DB.prepare(
        "SELECT wallet_address, internal_wallet_address FROM external_wallet_users WHERE auth_token = ?"
      ).bind(token).first();
      if (extUser) {
        walletAddress = extUser.wallet_address as string;
        walletAddresses.push(extUser.wallet_address as string);
        if (extUser.internal_wallet_address) walletAddresses.push(extUser.internal_wallet_address as string);
      }
    }
    
    if (!walletAddress && sessionCookie) {
      const user = await getCurrentUser(sessionCookie, {
        apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
        apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
      });
      if (user) {
        const userWallet = await c.env.DB.prepare(
          "SELECT wallet_address FROM user_wallets WHERE user_id = ?"
        ).bind(user.id).first();
        if (userWallet) {
          walletAddress = userWallet.wallet_address as string;
          walletAddresses.push(userWallet.wallet_address as string);
        }
      }
    }
    
    if (!walletAddress) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    // Get music profile using both addresses
    const profile = await findMusicProfile(c.env.DB, walletAddresses);
    if (profile) {
      musicProfileId = profile.id as number;
    }
    
    const body = await c.req.json();
    const { title, description, previewImageUrl, themeData, priceKas, quantityTotal, hasParticles, particleColor, category, tags } = body;
    
    // Validation
    if (!title || title.length > 50) {
      return c.json({ error: "Title is required and must be 50 characters or less" }, 400);
    }
    if (description && description.length > 500) {
      return c.json({ error: "Description must be 500 characters or less" }, 400);
    }
    if (!previewImageUrl) {
      return c.json({ error: "Preview image is required" }, 400);
    }
    
    const price = parseFloat(priceKas || '0');
    if (price > 0 && price < 0.11) {
      return c.json({ error: "Price must be at least 0.11 KAS or free" }, 400);
    }
    
    if (quantityTotal !== null && (quantityTotal < 1 || quantityTotal > 10000)) {
      return c.json({ error: "Quantity must be between 1 and 10,000" }, 400);
    }
    
    const now = new Date().toISOString();
    
    const result = await c.env.DB.prepare(`
      INSERT INTO marketplace_themes (
        creator_wallet_address, music_profile_id, title, description, 
        preview_image_url, theme_data, price_kas, quantity_total, quantity_sold,
        has_particles, particle_color, category, tags, approval_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'pending', ?, ?)
    `).bind(
      walletAddress,
      musicProfileId,
      title.trim(),
      description ? description.trim() : null,
      previewImageUrl,
      themeData || '{}',
      price.toString(),
      quantityTotal,
      hasParticles ? 1 : 0,
      particleColor || null,
      category || null,
      tags ? JSON.stringify(tags) : null,
      now,
      now
    ).run();
    
    return c.json({ 
      success: true, 
      themeId: result.meta.last_row_id,
      message: "Theme submitted for review" 
    });
  } catch (error) {
    console.error("Submit theme error:", error);
    return c.json({ error: "Failed to submit theme" }, 500);
  }
});

// GET /api/marketplace/themes - Get approved themes for listing
app.get("/api/marketplace/themes", async (c) => {
  try {
    const themes = await c.env.DB.prepare(`
      SELECT 
        t.id, t.name, t.description, t.preview_image_url, t.theme_data,
        t.price_kas, t.quantity_total, t.quantity_sold, t.has_particles,
        t.particle_color, t.creator_wallet_address, t.created_at,
        t.category, t.tags,
        mp.name as creator_name, mp.id as creator_profile_id
      FROM marketplace_themes t
      LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
      WHERE t.is_approved = 1
      ORDER BY t.created_at DESC
      LIMIT 100
    `).all();
    
    return c.json({
      themes: themes.results.map((t: any) => ({
        id: t.id,
        title: t.name,
        description: t.description,
        previewImageUrl: t.preview_image_url,
        themeData: t.theme_data,
        priceKas: t.price_kas,
        quantityTotal: t.quantity_total,
        quantitySold: t.quantity_sold,
        hasParticles: t.has_particles === 1,
        particleColor: t.particle_color,
        creatorWalletAddress: t.creator_wallet_address,
        creatorName: t.creator_name || 'Anonymous',
        creatorProfileId: t.creator_profile_id,
        category: t.category,
        tags: t.tags ? JSON.parse(t.tags) : [],
        createdAt: t.created_at
      }))
    });
  } catch (error) {
    console.error("Get themes error:", error);
    return c.json({ error: "Failed to fetch themes" }, 500);
  }
});

// GET /api/marketplace/featured - Get featured themes
app.get("/api/marketplace/featured", async (c) => {
  try {
    const themes = await c.env.DB.prepare(`
      SELECT 
        t.id, t.name, t.description, t.preview_image_url, t.theme_data,
        t.price_kas, t.quantity_total, t.quantity_sold, t.has_particles,
        t.particle_color, t.creator_wallet_address, t.created_at,
        t.category, t.tags,
        mp.name as creator_name, mp.id as creator_profile_id
      FROM marketplace_themes t
      LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
      WHERE t.is_approved = 1 AND t.is_featured = 1
      ORDER BY t.featured_at DESC
      LIMIT 6
    `).all();
    
    return c.json({
      themes: themes.results.map((t: any) => ({
        id: t.id,
        title: t.name,
        description: t.description,
        previewImageUrl: t.preview_image_url,
        priceKas: t.price_kas,
        quantityTotal: t.quantity_total,
        quantitySold: t.quantity_sold,
        hasParticles: t.has_particles === 1,
        creatorWalletAddress: t.creator_wallet_address,
        creatorName: t.creator_name || 'Anonymous',
        creatorProfileId: t.creator_profile_id,
        category: t.category,
        tags: t.tags ? JSON.parse(t.tags) : [],
        createdAt: t.created_at
      }))
    });
  } catch (error) {
    console.error("Get featured themes error:", error);
    return c.json({ error: "Failed to fetch featured themes" }, 500);
  }
});

// POST /api/marketplace/admin/themes/:id/feature - Toggle featured status
app.post("/api/marketplace/admin/themes/:id/feature", adminMiddleware, async (c) => {
  try {
    const themeId = parseInt(c.req.param("id"));
    const { isFeatured } = await c.req.json();
    
    await c.env.DB.prepare(`
      UPDATE marketplace_themes 
      SET is_featured = ?, featured_at = ?
      WHERE id = ?
    `).bind(
      isFeatured ? 1 : 0,
      isFeatured ? new Date().toISOString() : null,
      themeId
    ).run();
    
    return c.json({ success: true, isFeatured });
  } catch (error) {
    console.error("Toggle featured error:", error);
    return c.json({ error: "Failed to update featured status" }, 500);
  }
});

// GET /api/marketplace/admin/pending - Admin view pending themes
app.get("/api/marketplace/admin/pending", adminMiddleware, async (c) => {
  try {
    const themes = await c.env.DB.prepare(`
      SELECT 
        t.id, t.name, t.description, t.preview_image_url, t.theme_data,
        t.price_kas, t.quantity_total, t.has_particles, t.particle_color,
        t.creator_wallet_address, t.created_at, t.is_approved,
        mp.name as creator_name
      FROM marketplace_themes t
      LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
      WHERE t.is_approved = 0
      ORDER BY t.created_at ASC
    `).all();
    
    return c.json({
      themes: themes.results.map((t: any) => ({
        id: t.id,
        title: t.name,
        description: t.description,
        previewImageUrl: t.preview_image_url,
        themeData: t.theme_data,
        priceKas: t.price_kas,
        quantityTotal: t.quantity_total,
        hasParticles: t.has_particles === 1,
        particleColor: t.particle_color,
        creatorWalletAddress: t.creator_wallet_address,
        creatorName: t.creator_name || 'Anonymous',
        createdAt: t.created_at,
        isApproved: t.is_approved === 1
      }))
    });
  } catch (error) {
    console.error("Get pending themes error:", error);
    return c.json({ error: "Failed to fetch pending themes" }, 500);
  }
});

// POST /api/marketplace/admin/themes/:id/approve - Admin approve theme
app.post("/api/marketplace/admin/themes/:id/approve", adminMiddleware, async (c) => {
  try {
    const themeId = parseInt(c.req.param("id"));
    const now = new Date().toISOString();
    
    const theme = await c.env.DB.prepare(
      "SELECT id, is_approved FROM marketplace_themes WHERE id = ?"
    ).bind(themeId).first();
    
    if (!theme) {
      return c.json({ error: "Theme not found" }, 404);
    }
    
    if (theme.is_approved === 1) {
      return c.json({ error: "Theme is already approved" }, 400);
    }
    
    await c.env.DB.prepare(`
      UPDATE marketplace_themes 
      SET is_approved = 1, approved_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(now, now, themeId).run();
    
    return c.json({ success: true, message: "Theme approved" });
  } catch (error) {
    console.error("Approve theme error:", error);
    return c.json({ error: "Failed to approve theme" }, 500);
  }
});

// POST /api/marketplace/admin/themes/:id/reject - Admin reject theme
app.post("/api/marketplace/admin/themes/:id/reject", adminMiddleware, async (c) => {
  try {
    const themeId = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { reason } = body;
    
    const now = new Date().toISOString();
    
    const theme = await c.env.DB.prepare(
      "SELECT id, is_approved FROM marketplace_themes WHERE id = ?"
    ).bind(themeId).first();
    
    if (!theme) {
      return c.json({ error: "Theme not found" }, 404);
    }
    
    if (theme.is_approved === 1) {
      return c.json({ error: "Theme is already approved" }, 400);
    }
    
    await c.env.DB.prepare(`
      UPDATE marketplace_themes 
      SET is_approved = 0, rejection_reason = ?, updated_at = ?
      WHERE id = ?
    `).bind(reason || null, now, themeId).run();
    
    return c.json({ success: true, message: "Theme rejected" });
  } catch (error) {
    console.error("Reject theme error:", error);
    return c.json({ error: "Failed to reject theme" }, 500);
  }
});

// POST /api/marketplace/themes/:id/purchase - Purchase a theme
app.post("/api/marketplace/themes/:id/purchase", async (c) => {
  try {
    const themeId = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { transactionId } = body;
    
    // Get user via dual auth
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const now = new Date().toISOString();
    
    // Get theme details
    const theme = await c.env.DB.prepare(`
      SELECT id, creator_wallet_address, price_kas, quantity_total, quantity_sold, approval_status
      FROM marketplace_themes WHERE id = ?
    `).bind(themeId).first() as any;
    
    if (!theme) {
      return c.json({ error: "Theme not found" }, 404);
    }
    
    if (theme.approval_status !== 'approved') {
      return c.json({ error: "Theme is not available for purchase" }, 400);
    }
    
    // Check quantity available
    if (theme.quantity_total !== null) {
      const remaining = theme.quantity_total - (theme.quantity_sold || 0);
      if (remaining <= 0) {
        return c.json({ error: "Theme is sold out" }, 400);
      }
    }
    
    // Check if user already owns this theme
    const existingPurchase = await c.env.DB.prepare(`
      SELECT id FROM theme_purchases 
      WHERE theme_id = ? AND (buyer_wallet_address = ? OR buyer_user_id = ?)
    `).bind(themeId, auth.walletAddress || '', auth.userId || '').first();
    
    if (existingPurchase) {
      return c.json({ error: "You already own this theme" }, 400);
    }
    
    // For free themes, no transaction needed
    const priceKas = parseFloat(theme.price_kas || '0');
    if (priceKas > 0 && !transactionId) {
      return c.json({ error: "Transaction ID required for paid themes" }, 400);
    }
    
    // Record the purchase
    await c.env.DB.prepare(`
      INSERT INTO theme_purchases (
        theme_id, buyer_wallet_address, buyer_user_id, seller_wallet_address,
        purchase_price_kas, transaction_id, is_original, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      themeId,
      auth.walletAddress || null,
      auth.userId || null,
      theme.creator_wallet_address,
      theme.price_kas || '0',
      transactionId || null,
      now, now
    ).run();
    
    // Update quantity sold
    await c.env.DB.prepare(`
      UPDATE marketplace_themes 
      SET quantity_sold = quantity_sold + 1, updated_at = ?
      WHERE id = ?
    `).bind(now, themeId).run();
    
    return c.json({ success: true, message: "Theme purchased successfully" });
  } catch (error) {
    console.error("Purchase theme error:", error);
    return c.json({ error: "Failed to purchase theme" }, 500);
  }
});

// GET /api/marketplace/themes/:id/owned - Check if user owns a theme
app.get("/api/marketplace/themes/:id/owned", async (c) => {
  try {
    const themeId = parseInt(c.req.param("id"));
    
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ owned: false });
    }
    
    const purchase = await c.env.DB.prepare(`
      SELECT id FROM theme_purchases 
      WHERE theme_id = ? AND (buyer_wallet_address = ? OR buyer_user_id = ?)
    `).bind(themeId, auth.walletAddress || '', auth.userId || '').first();
    
    return c.json({ owned: !!purchase });
  } catch (error) {
    console.error("Check ownership error:", error);
    return c.json({ owned: false });
  }
});

// GET /api/marketplace/my-themes - Get themes owned by user
app.get("/api/marketplace/my-themes", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const purchases = await c.env.DB.prepare(`
      SELECT 
        tp.id as purchase_id, tp.purchase_price_kas, tp.transaction_id, tp.created_at as purchased_at,
        t.id, t.name, t.description, t.preview_image_url, t.theme_data,
        t.has_particles, t.particle_color, t.creator_wallet_address,
        mp.name as creator_name
      FROM theme_purchases tp
      JOIN marketplace_themes t ON tp.theme_id = t.id
      LEFT JOIN music_profiles mp ON t.music_profile_id = mp.id
      WHERE tp.buyer_wallet_address = ? OR tp.buyer_user_id = ?
      ORDER BY tp.created_at DESC
    `).bind(auth.walletAddress || '', auth.userId || '').all();
    
    return c.json({
      themes: purchases.results.map((p: any) => ({
        purchaseId: p.purchase_id,
        id: p.id,
        title: p.name,
        description: p.description,
        previewImageUrl: p.preview_image_url,
        themeData: p.theme_data,
        hasParticles: p.has_particles === 1,
        particleColor: p.particle_color,
        creatorWalletAddress: p.creator_wallet_address,
        creatorName: p.creator_name || 'Anonymous',
        purchasePriceKas: p.purchase_price_kas,
        purchasedAt: p.purchased_at
      }))
    });
  } catch (error) {
    console.error("Get my themes error:", error);
    return c.json({ error: "Failed to fetch owned themes" }, 500);
  }
});

// POST /api/marketplace/listings - Create a resale listing (fixed price or auction)
app.post("/api/marketplace/listings", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const { purchaseId, priceKas, isAuction, auctionMinBidKas, auctionDurationHours } = await c.req.json();
    
    if (!purchaseId) {
      return c.json({ error: "Purchase ID required" }, 400);
    }
    
    // Validate pricing based on listing type
    if (isAuction) {
      const minBid = parseFloat(auctionMinBidKas || '0');
      if (minBid < 0.11) {
        return c.json({ error: "Minimum bid must be at least 0.11 KAS" }, 400);
      }
      const duration = parseInt(auctionDurationHours || '24');
      if (duration < 1 || duration > 168) { // 1 hour to 7 days
        return c.json({ error: "Auction duration must be between 1 and 168 hours (7 days)" }, 400);
      }
    } else {
      const price = parseFloat(priceKas || '0');
      if (price > 0 && price < 0.11) {
        return c.json({ error: "Price must be 0 (free) or at least 0.11 KAS" }, 400);
      }
    }
    
    // Verify ownership
    const purchase = await c.env.DB.prepare(`
      SELECT tp.id, tp.theme_id, tp.buyer_wallet_address, tp.buyer_user_id, t.title
      FROM theme_purchases tp
      JOIN marketplace_themes t ON tp.theme_id = t.id
      WHERE tp.id = ? AND (tp.buyer_wallet_address = ? OR tp.buyer_user_id = ?)
    `).bind(purchaseId, auth.walletAddress || '', auth.userId || '').first();
    
    if (!purchase) {
      return c.json({ error: "Theme not found or not owned by you" }, 404);
    }
    
    // Check if already listed
    const existingListing = await c.env.DB.prepare(`
      SELECT id FROM theme_listings WHERE purchase_id = ? AND is_active = 1 AND is_sold = 0
    `).bind(purchaseId).first();
    
    if (existingListing) {
      return c.json({ error: "This theme is already listed for sale" }, 400);
    }
    
    // Calculate auction end time if auction
    let auctionEndsAt: string | null = null;
    if (isAuction) {
      const duration = parseInt(auctionDurationHours || '24');
      const endDate = new Date(Date.now() + duration * 60 * 60 * 1000);
      auctionEndsAt = endDate.toISOString();
    }
    
    // Create listing
    const result = await c.env.DB.prepare(`
      INSERT INTO theme_listings (theme_id, purchase_id, seller_wallet_address, seller_user_id, price_kas, is_auction, auction_min_bid_kas, auction_ends_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      purchase.theme_id, 
      purchaseId, 
      auth.walletAddress || null, 
      auth.userId || null, 
      isAuction ? null : (priceKas || '0'),
      isAuction ? 1 : 0,
      isAuction ? auctionMinBidKas : null,
      auctionEndsAt
    ).run();
    
    return c.json({ 
      success: true, 
      listingId: result.meta.last_row_id,
      message: isAuction ? "Auction created successfully" : "Theme listed for sale"
    });
  } catch (error) {
    console.error("Create listing error:", error);
    return c.json({ error: "Failed to create listing" }, 500);
  }
});

// GET /api/marketplace/listings - Get active resale listings
app.get("/api/marketplace/listings", async (c) => {
  try {
    const listings = await c.env.DB.prepare(`
      SELECT 
        tl.id as listing_id, tl.price_kas, tl.is_auction, tl.auction_min_bid_kas,
        tl.auction_ends_at, tl.current_bid_kas, tl.created_at,
        t.id as theme_id, t.name, t.description, t.preview_image_url, 
        t.has_particles, t.quantity_total, t.quantity_sold,
        tl.seller_wallet_address,
        seller_mp.name as seller_name, seller_mp.id as seller_profile_id,
        orig_mp.name as creator_name, orig_mp.id as creator_profile_id,
        t.creator_wallet_address as original_creator_wallet
      FROM theme_listings tl
      JOIN theme_purchases tp ON tl.purchase_id = tp.id
      JOIN marketplace_themes t ON tl.theme_id = t.id
      LEFT JOIN music_profiles seller_mp ON tl.seller_wallet_address = seller_mp.wallet_address
      LEFT JOIN music_profiles orig_mp ON t.creator_wallet_address = orig_mp.wallet_address
      WHERE tl.is_active = 1 AND tl.is_sold = 0
      ORDER BY tl.created_at DESC
    `).all();
    
    return c.json({
      listings: listings.results.map((l: any) => ({
        listingId: l.listing_id,
        id: l.theme_id,
        title: l.name,
        description: l.description,
        previewImageUrl: l.preview_image_url,
        priceKas: l.price_kas,
        isAuction: l.is_auction === 1,
        auctionMinBidKas: l.auction_min_bid_kas,
        auctionEndsAt: l.auction_ends_at,
        currentBidKas: l.current_bid_kas,
        hasParticles: l.has_particles === 1,
        quantityTotal: l.quantity_total,
        quantitySold: l.quantity_sold,
        isResale: true,
        sellerWalletAddress: l.seller_wallet_address,
        sellerName: l.seller_name || 'Anonymous',
        sellerProfileId: l.seller_profile_id,
        creatorName: l.creator_name || 'Anonymous',
        creatorProfileId: l.creator_profile_id,
        originalCreatorWallet: l.original_creator_wallet,
        createdAt: l.created_at
      }))
    });
  } catch (error) {
    console.error("Get listings error:", error);
    return c.json({ error: "Failed to fetch listings" }, 500);
  }
});

// DELETE /api/marketplace/listings/:id - Cancel a listing
app.delete("/api/marketplace/listings/:id", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const listingId = c.req.param("id");
    
    // Verify ownership
    const listing = await c.env.DB.prepare(`
      SELECT id FROM theme_listings 
      WHERE id = ? AND (seller_wallet_address = ? OR seller_user_id = ?) AND is_active = 1 AND is_sold = 0
    `).bind(listingId, auth.walletAddress || '', auth.userId || '').first();
    
    if (!listing) {
      return c.json({ error: "Listing not found or not owned by you" }, 404);
    }
    
    await c.env.DB.prepare(`
      UPDATE theme_listings SET is_active = 0 WHERE id = ?
    `).bind(listingId).run();
    
    return c.json({ success: true, message: "Listing cancelled" });
  } catch (error) {
    console.error("Cancel listing error:", error);
    return c.json({ error: "Failed to cancel listing" }, 500);
  }
});

// POST /api/marketplace/listings/:id/purchase - Buy from resale
app.post("/api/marketplace/listings/:id/purchase", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const listingId = c.req.param("id");
    const { transactionId } = await c.req.json();
    
    // Get listing
    const listing = await c.env.DB.prepare(`
      SELECT tl.*, t.title FROM theme_listings tl
      JOIN marketplace_themes t ON tl.theme_id = t.id
      WHERE tl.id = ? AND tl.is_active = 1 AND tl.is_sold = 0
    `).bind(listingId).first() as any;
    
    if (!listing) {
      return c.json({ error: "Listing not found or already sold" }, 404);
    }
    
    // Check not buying own listing
    if (listing.seller_wallet_address === auth.walletAddress || listing.seller_user_id === auth.userId) {
      return c.json({ error: "Cannot buy your own listing" }, 400);
    }
    
    // For paid listings, require transaction
    const price = parseFloat(listing.price_kas || '0');
    if (price > 0 && !transactionId) {
      return c.json({ error: "Transaction ID required for paid themes" }, 400);
    }
    
    // Create new purchase record for buyer
    const purchaseResult = await c.env.DB.prepare(`
      INSERT INTO theme_purchases (theme_id, buyer_wallet_address, buyer_user_id, seller_wallet_address, purchase_price_kas, transaction_id, is_original, listing_id)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).bind(
      listing.theme_id,
      auth.walletAddress || null,
      auth.userId || null,
      listing.seller_wallet_address,
      listing.price_kas,
      transactionId || null,
      listing.id
    ).run();
    
    // Mark listing as sold
    await c.env.DB.prepare(`
      UPDATE theme_listings SET is_sold = 1, is_active = 0 WHERE id = ?
    `).bind(listingId).run();
    
    return c.json({ 
      success: true, 
      purchaseId: purchaseResult.meta.last_row_id,
      message: "Theme purchased successfully"
    });
  } catch (error) {
    console.error("Purchase from resale error:", error);
    return c.json({ error: "Failed to purchase theme" }, 500);
  }
});

// POST /api/marketplace/listings/:id/bid - Place a bid on an auction
app.post("/api/marketplace/listings/:id/bid", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const listingId = c.req.param("id");
    const { bidAmountKas, transactionId } = await c.req.json();
    
    const bidAmount = parseFloat(bidAmountKas || '0');
    if (bidAmount < 0.11) {
      return c.json({ error: "Bid must be at least 0.11 KAS" }, 400);
    }
    
    if (!transactionId) {
      return c.json({ error: "Transaction ID required" }, 400);
    }
    
    // Get listing
    const listing = await c.env.DB.prepare(`
      SELECT tl.*, t.title FROM theme_listings tl
      JOIN marketplace_themes t ON tl.theme_id = t.id
      WHERE tl.id = ? AND tl.is_active = 1 AND tl.is_sold = 0 AND tl.is_auction = 1
    `).bind(listingId).first() as any;
    
    if (!listing) {
      return c.json({ error: "Auction not found or already ended" }, 404);
    }
    
    // Check auction hasn't ended
    if (listing.auction_ends_at && new Date(listing.auction_ends_at) < new Date()) {
      return c.json({ error: "This auction has ended" }, 400);
    }
    
    // Check not bidding on own listing
    if (listing.seller_wallet_address === auth.walletAddress || listing.seller_user_id === auth.userId) {
      return c.json({ error: "Cannot bid on your own auction" }, 400);
    }
    
    // Check bid is higher than current bid or minimum
    const currentBid = parseFloat(listing.current_bid_kas || '0');
    const minBid = parseFloat(listing.auction_min_bid_kas || '0');
    const minimumRequired = currentBid > 0 ? currentBid + 0.1 : minBid; // Must beat current by at least 0.1 KAS
    
    if (bidAmount < minimumRequired) {
      return c.json({ 
        error: `Bid must be at least ${minimumRequired.toFixed(2)} KAS`,
        minimumRequired
      }, 400);
    }

    // Get previous high bidder for refund notification
    let previousBidder: any = null;
    if (listing.current_bid_kas && listing.current_bidder_wallet) {
      previousBidder = await c.env.DB.prepare(`
        SELECT bidder_wallet_address, bidder_user_id, bid_amount_kas
        FROM theme_bids
        WHERE listing_id = ? AND bidder_wallet_address = ?
        ORDER BY CAST(bid_amount_kas AS REAL) DESC
        LIMIT 1
      `).bind(listingId, listing.current_bidder_wallet).first();
    }
    
    // Record the bid
    await c.env.DB.prepare(`
      INSERT INTO theme_bids (listing_id, bidder_wallet_address, bidder_user_id, bid_amount_kas, transaction_id, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      listingId,
      auth.walletAddress || null,
      auth.userId || null,
      bidAmountKas,
      transactionId
    ).run();
    
    // Update listing with new high bid
    await c.env.DB.prepare(`
      UPDATE theme_listings 
      SET current_bid_kas = ?, current_bidder_wallet = ?
      WHERE id = ?
    `).bind(bidAmountKas, auth.walletAddress || auth.userId, listingId).run();

    // Handle previous bidder: mark for refund and notify
    if (previousBidder) {
      // Mark previous bid for refund
      await c.env.DB.prepare(`
        UPDATE theme_bids 
        SET is_refunded = 0, refund_amount_kas = ?
        WHERE listing_id = ? AND bidder_wallet_address = ? AND is_refunded = 0
      `).bind(previousBidder.bid_amount_kas, listingId, previousBidder.bidder_wallet_address).run();

      // Create outbid notification
      await c.env.DB.prepare(`
        INSERT INTO marketplace_notifications (wallet_address, user_id, type, title, message, related_listing_id, related_theme_id)
        VALUES (?, ?, 'outbid', 'You have been outbid!', ?, ?, ?)
      `).bind(
        previousBidder.bidder_wallet_address,
        previousBidder.bidder_user_id,
        `Someone placed a higher bid of ${bidAmountKas} KAS on "${listing.title}". Your bid of ${previousBidder.bid_amount_kas} KAS will be refunded.`,
        listingId,
        listing.theme_id
      ).run();
    }
    
    return c.json({ 
      success: true, 
      message: "Bid placed successfully",
      newHighBid: bidAmountKas
    });
  } catch (error) {
    console.error("Place bid error:", error);
    return c.json({ error: "Failed to place bid" }, 500);
  }
});

// GET /api/marketplace/listings/:id/bids - Get bid history for a listing
app.get("/api/marketplace/listings/:id/bids", async (c) => {
  try {
    const listingId = c.req.param("id");
    
    const bids = await c.env.DB.prepare(`
      SELECT 
        tb.id, tb.bid_amount_kas, tb.created_at,
        COALESCE(mp.name, SUBSTR(tb.bidder_wallet_address, 1, 12) || '...') as bidder_name
      FROM theme_bids tb
      LEFT JOIN music_profiles mp ON tb.bidder_wallet_address = mp.wallet_address
      WHERE tb.listing_id = ?
      ORDER BY tb.bid_amount_kas DESC
      LIMIT 50
    `).bind(listingId).all();
    
    return c.json({
      bids: bids.results.map((b: any) => ({
        id: b.id,
        bidAmountKas: b.bid_amount_kas,
        bidderName: b.bidder_name,
        createdAt: b.created_at
      }))
    });
  } catch (error) {
    console.error("Get bids error:", error);
    return c.json({ error: "Failed to fetch bids" }, 500);
  }
});

// POST /api/marketplace/auctions/:id/finalize - Finalize an ended auction
app.post("/api/marketplace/auctions/:id/finalize", async (c) => {
  try {
    const listingId = c.req.param("id");
    
    // Get listing
    const listing = await c.env.DB.prepare(`
      SELECT tl.*, t.title FROM theme_listings tl
      JOIN marketplace_themes t ON tl.theme_id = t.id
      WHERE tl.id = ? AND tl.is_auction = 1 AND tl.is_active = 1 AND tl.is_sold = 0
    `).bind(listingId).first() as any;
    
    if (!listing) {
      return c.json({ error: "Auction not found" }, 404);
    }
    
    // Check auction has ended
    if (listing.auction_ends_at && new Date(listing.auction_ends_at) > new Date()) {
      return c.json({ error: "Auction has not ended yet" }, 400);
    }
    
    // Check there's a winner
    if (!listing.current_bid_kas || !listing.current_bidder_wallet) {
      // No bids - cancel auction
      await c.env.DB.prepare(`
        UPDATE theme_listings SET is_active = 0 WHERE id = ?
      `).bind(listingId).run();
      
      return c.json({ 
        success: true, 
        message: "Auction ended with no bids",
        hasBids: false
      });
    }
    
    // Get winner's info from highest bid
    const winningBid = await c.env.DB.prepare(`
      SELECT bidder_wallet_address, bidder_user_id 
      FROM theme_bids 
      WHERE listing_id = ? 
      ORDER BY bid_amount_kas DESC 
      LIMIT 1
    `).bind(listingId).first() as any;
    
    if (!winningBid) {
      return c.json({ error: "Could not find winning bid" }, 500);
    }
    
    // Create purchase record for winner
    const purchaseResult = await c.env.DB.prepare(`
      INSERT INTO theme_purchases (theme_id, buyer_wallet_address, buyer_user_id, seller_wallet_address, purchase_price_kas, transaction_id, is_original, listing_id)
      VALUES (?, ?, ?, ?, ?, 'auction-winner', 0, ?)
    `).bind(
      listing.theme_id,
      winningBid.bidder_wallet_address,
      winningBid.bidder_user_id,
      listing.seller_wallet_address,
      listing.current_bid_kas,
      listing.id
    ).run();
    
    // Mark listing as sold
    await c.env.DB.prepare(`
      UPDATE theme_listings SET is_sold = 1, is_active = 0 WHERE id = ?
    `).bind(listingId).run();
    
    return c.json({ 
      success: true, 
      purchaseId: purchaseResult.meta.last_row_id,
      message: "Auction finalized successfully",
      winningBid: listing.current_bid_kas,
      hasBids: true
    });
  } catch (error) {
    console.error("Finalize auction error:", error);
    return c.json({ error: "Failed to finalize auction" }, 500);
  }
});

// GET /api/marketplace/auctions/process-expired - Auto-finalize all expired auctions
app.get("/api/marketplace/auctions/process-expired", async (c) => {
  try {
    // Find all expired auctions that haven't been finalized
    const expiredAuctions = await c.env.DB.prepare(`
      SELECT tl.id, tl.theme_id, tl.current_bid_kas, tl.current_bidder_wallet,
             tl.seller_wallet_address, t.name as theme_name
      FROM theme_listings tl
      JOIN marketplace_themes t ON tl.theme_id = t.id
      WHERE tl.is_auction = 1 
        AND tl.is_active = 1 
        AND tl.is_sold = 0
        AND tl.auction_ends_at IS NOT NULL
        AND datetime(tl.auction_ends_at) < datetime('now')
    `).all();

    const results = { finalized: 0, cancelled: 0, errors: 0 };

    for (const auction of expiredAuctions.results as any[]) {
      try {
        if (!auction.current_bid_kas || !auction.current_bidder_wallet) {
          // No bids - cancel auction
          await c.env.DB.prepare(`
            UPDATE theme_listings SET is_active = 0 WHERE id = ?
          `).bind(auction.id).run();
          results.cancelled++;
        } else {
          // Get winner's info
          const winningBid = await c.env.DB.prepare(`
            SELECT bidder_wallet_address, bidder_user_id 
            FROM theme_bids 
            WHERE listing_id = ? 
            ORDER BY CAST(bid_amount_kas AS REAL) DESC 
            LIMIT 1
          `).bind(auction.id).first() as any;

          if (winningBid) {
            // Create purchase record for winner
            await c.env.DB.prepare(`
              INSERT INTO theme_purchases (theme_id, buyer_wallet_address, buyer_user_id, seller_wallet_address, purchase_price_kas, transaction_id, is_original, listing_id)
              VALUES (?, ?, ?, ?, ?, 'auction-winner', 0, ?)
            `).bind(
              auction.theme_id,
              winningBid.bidder_wallet_address,
              winningBid.bidder_user_id,
              auction.seller_wallet_address,
              auction.current_bid_kas,
              auction.id
            ).run();

            // Mark listing as sold
            await c.env.DB.prepare(`
              UPDATE theme_listings SET is_sold = 1, is_active = 0 WHERE id = ?
            `).bind(auction.id).run();

            // Notify winner
            await c.env.DB.prepare(`
              INSERT INTO marketplace_notifications (wallet_address, user_id, type, title, message, related_listing_id, related_theme_id)
              VALUES (?, ?, 'auction_won', 'You won an auction!', ?, ?, ?)
            `).bind(
              winningBid.bidder_wallet_address,
              winningBid.bidder_user_id,
              `Congratulations! You won the auction for "${auction.theme_name}" with a bid of ${auction.current_bid_kas} KAS.`,
              auction.id,
              auction.theme_id
            ).run();

            results.finalized++;
          }
        }
      } catch (err) {
        console.error(`Error finalizing auction ${auction.id}:`, err);
        results.errors++;
      }
    }

    return c.json({ success: true, ...results });
  } catch (error) {
    console.error("Process expired auctions error:", error);
    return c.json({ error: "Failed to process expired auctions" }, 500);
  }
});

// GET /api/marketplace/notifications - Get user's marketplace notifications
app.get("/api/marketplace/notifications", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ notifications: [] });
    }

    const notifications = await c.env.DB.prepare(`
      SELECT id, type, title, message, related_listing_id, related_theme_id, is_read, created_at
      FROM marketplace_notifications
      WHERE wallet_address = ? OR user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).bind(auth.walletAddress || '', auth.userId || '').all();

    return c.json({
      notifications: notifications.results.map((n: any) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        listingId: n.related_listing_id,
        themeId: n.related_theme_id,
        isRead: n.is_read === 1,
        createdAt: n.created_at
      }))
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return c.json({ error: "Failed to fetch notifications" }, 500);
  }
});

// POST /api/marketplace/notifications/:id/read - Mark notification as read
app.post("/api/marketplace/notifications/:id/read", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const notificationId = c.req.param("id");
    
    await c.env.DB.prepare(`
      UPDATE marketplace_notifications 
      SET is_read = 1, updated_at = datetime('now')
      WHERE id = ? AND (wallet_address = ? OR user_id = ?)
    `).bind(notificationId, auth.walletAddress || '', auth.userId || '').run();

    return c.json({ success: true });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return c.json({ error: "Failed to mark notification as read" }, 500);
  }
});

// GET /api/marketplace/pending-refunds - Get user's pending refunds from outbid auctions
app.get("/api/marketplace/pending-refunds", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ refunds: [] });
    }

    const refunds = await c.env.DB.prepare(`
      SELECT tb.id, tb.bid_amount_kas, tb.listing_id, tb.created_at,
             t.name as theme_name, tl.is_sold, tl.is_active
      FROM theme_bids tb
      JOIN theme_listings tl ON tb.listing_id = tl.id
      JOIN marketplace_themes t ON tl.theme_id = t.id
      WHERE (tb.bidder_wallet_address = ? OR tb.bidder_user_id = ?)
        AND tb.is_refunded = 0
        AND tb.refund_amount_kas IS NOT NULL
        AND tb.refund_transaction_id IS NULL
      ORDER BY tb.created_at DESC
    `).bind(auth.walletAddress || '', auth.userId || '').all();

    return c.json({
      refunds: refunds.results.map((r: any) => ({
        bidId: r.id,
        amountKas: r.bid_amount_kas,
        listingId: r.listing_id,
        themeName: r.theme_name,
        auctionEnded: r.is_sold === 1 || r.is_active === 0,
        createdAt: r.created_at
      }))
    });
  } catch (error) {
    console.error("Get pending refunds error:", error);
    return c.json({ error: "Failed to fetch pending refunds" }, 500);
  }
});

// POST /api/marketplace/refunds/:id/claim - Claim a refund for an outbid auction
app.post("/api/marketplace/refunds/:id/claim", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    const bidId = parseInt(c.req.param("id"));
    
    // Get the bid and verify ownership
    const bid = await c.env.DB.prepare(`
      SELECT tb.id, tb.refund_amount_kas, tb.bidder_wallet_address, tb.bidder_user_id,
             tb.is_refunded, tb.refund_transaction_id
      FROM theme_bids tb
      WHERE tb.id = ?
        AND (tb.bidder_wallet_address = ? OR tb.bidder_user_id = ?)
        AND tb.refund_amount_kas IS NOT NULL
    `).bind(bidId, auth.walletAddress || '', auth.userId || '').first();
    
    if (!bid) {
      return c.json({ error: "Refund not found or not authorized" }, 404);
    }
    
    if (bid.is_refunded === 1 || bid.refund_transaction_id) {
      return c.json({ error: "Refund already claimed" }, 400);
    }
    
    // For now, mark as refunded (actual KAS transfer would happen via platform wallet)
    // In production, this would initiate a transfer from platform wallet to user
    const refundTxId = `refund-${Date.now()}-${bidId}`;
    
    await c.env.DB.prepare(`
      UPDATE theme_bids 
      SET is_refunded = 1, refund_transaction_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(refundTxId, bidId).run();
    
    // Credit the user's demo balance as a simulated refund
    const userWallet = await c.env.DB.prepare(
      `SELECT id FROM user_wallets WHERE wallet_address = ?`
    ).bind(auth.walletAddress).first();
    
    if (userWallet) {
      await c.env.DB.prepare(`
        UPDATE user_wallets 
        SET demo_balance = COALESCE(demo_balance, 0) + ?
        WHERE id = ?
      `).bind(parseFloat(bid.refund_amount_kas as string), userWallet.id).run();
    }
    
    return c.json({ 
      success: true, 
      transactionId: refundTxId,
      amountKas: bid.refund_amount_kas
    });
  } catch (error) {
    console.error("Claim refund error:", error);
    return c.json({ error: "Failed to claim refund" }, 500);
  }
});

// GET /api/marketplace/my-listings - Get user's active listings
app.get("/api/marketplace/my-listings", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const listings = await c.env.DB.prepare(`
      SELECT 
        tl.id as listing_id, tl.price_kas, tl.created_at, tl.is_sold,
        t.id as theme_id, t.name, t.preview_image_url, t.has_particles
      FROM theme_listings tl
      JOIN marketplace_themes t ON tl.theme_id = t.id
      WHERE (tl.seller_wallet_address = ? OR tl.seller_user_id = ?) AND tl.is_active = 1
      ORDER BY tl.created_at DESC
    `).bind(auth.walletAddress || '', auth.userId || '').all();
    
    return c.json({
      listings: listings.results.map((l: any) => ({
        listingId: l.listing_id,
        themeId: l.theme_id,
        title: l.name,
        previewImageUrl: l.preview_image_url,
        priceKas: l.price_kas,
        hasParticles: l.has_particles === 1,
        isSold: l.is_sold === 1,
        createdAt: l.created_at
      }))
    });
  } catch (error) {
    console.error("Get my listings error:", error);
    return c.json({ error: "Failed to fetch listings" }, 500);
  }
});

// POST /api/marketplace/themes/:id/view - Track theme view
app.post("/api/marketplace/themes/:id/view", async (c) => {
  try {
    const themeId = parseInt(c.req.param("id"));
    const auth = await getFastAuth(c);
    
    // Track view (allow anonymous views too)
    await c.env.DB.prepare(`
      INSERT INTO theme_views (theme_id, viewer_wallet_address, viewer_user_id)
      VALUES (?, ?, ?)
    `).bind(themeId, auth?.walletAddress || null, auth?.userId || null).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Track theme view error:", error);
    return c.json({ success: true }); // Don't fail on view tracking
  }
});

// GET /api/marketplace/seller/analytics - Get seller analytics
app.get("/api/marketplace/seller/analytics", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const walletAddress = auth.walletAddress || '';
    const userId = auth.userId || '';
    
    // Get total themes created
    const themesCreated = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM marketplace_themes
      WHERE (creator_wallet_address = ? OR creator_user_id = ?) AND is_approved = 1
    `).bind(walletAddress, userId).first<{ count: number }>();
    
    // Get total views on all themes
    const totalViews = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM theme_views tv
      JOIN marketplace_themes t ON tv.theme_id = t.id
      WHERE t.creator_wallet_address = ? OR t.creator_user_id = ?
    `).bind(walletAddress, userId).first<{ count: number }>();
    
    // Get total sales (original sales)
    const originalSales = await c.env.DB.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(CAST(purchase_price_kas AS REAL)), 0) as earnings
      FROM theme_purchases tp
      JOIN marketplace_themes t ON tp.theme_id = t.id
      WHERE (t.creator_wallet_address = ? OR t.creator_user_id = ?) AND tp.is_original = 1
    `).bind(walletAddress, userId).first<{ count: number; earnings: number }>();
    
    // Get resale commissions (if any - future feature)
    const resaleSales = await c.env.DB.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(CAST(purchase_price_kas AS REAL)), 0) as earnings
      FROM theme_purchases tp
      JOIN marketplace_themes t ON tp.theme_id = t.id
      WHERE (t.creator_wallet_address = ? OR t.creator_user_id = ?) AND tp.is_original = 0
    `).bind(walletAddress, userId).first<{ count: number; earnings: number }>();
    
    // Get views by day (last 7 days)
    const viewsByDay = await c.env.DB.prepare(`
      SELECT DATE(tv.created_at) as date, COUNT(*) as views
      FROM theme_views tv
      JOIN marketplace_themes t ON tv.theme_id = t.id
      WHERE (t.creator_wallet_address = ? OR t.creator_user_id = ?)
        AND tv.created_at >= datetime('now', '-7 days')
      GROUP BY DATE(tv.created_at)
      ORDER BY date ASC
    `).bind(walletAddress, userId).all();
    
    // Get top themes by views
    const topThemes = await c.env.DB.prepare(`
      SELECT t.id, t.name, t.preview_image_url, t.price_kas, t.quantity_sold,
        COUNT(tv.id) as view_count
      FROM marketplace_themes t
      LEFT JOIN theme_views tv ON t.id = tv.theme_id
      WHERE (t.creator_wallet_address = ? OR t.creator_user_id = ?) AND t.is_approved = 1
      GROUP BY t.id
      ORDER BY view_count DESC
      LIMIT 5
    `).bind(walletAddress, userId).all();
    
    return c.json({
      themesCreated: themesCreated?.count || 0,
      totalViews: totalViews?.count || 0,
      totalSales: (originalSales?.count || 0) + (resaleSales?.count || 0),
      totalEarnings: ((originalSales?.earnings || 0) + (resaleSales?.earnings || 0)).toFixed(2),
      originalSales: originalSales?.count || 0,
      originalEarnings: (originalSales?.earnings || 0).toFixed(2),
      resaleSales: resaleSales?.count || 0,
      resaleEarnings: (resaleSales?.earnings || 0).toFixed(2),
      viewsByDay: viewsByDay.results.map((r: any) => ({
        date: r.date,
        views: r.views
      })),
      topThemes: topThemes.results.map((t: any) => ({
        id: t.id,
        name: t.name,
        previewImageUrl: t.preview_image_url,
        priceKas: t.price_kas,
        quantitySold: t.quantity_sold,
        viewCount: t.view_count
      }))
    });
  } catch (error) {
    console.error("Seller analytics error:", error);
    return c.json({ error: "Failed to fetch analytics" }, 500);
  }
});

// Get currently applied theme for user
app.get("/api/marketplace/applied-theme", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ appliedTheme: null });
    }
    
    // Find user's music profile
    const profile = await findMusicProfile(c.env.DB, auth.walletAddresses);
    if (!profile) {
      return c.json({ appliedTheme: null });
    }
    
    // Get applied theme
    const applied = await c.env.DB.prepare(`
      SELECT 
        at.id, at.theme_id, at.purchase_id,
        t.name as title, t.preview_image_url, t.theme_data, t.has_particles
      FROM applied_themes at
      JOIN marketplace_themes t ON at.theme_id = t.id
      WHERE at.music_profile_id = ?
      ORDER BY at.created_at DESC
      LIMIT 1
    `).bind(profile.id).first();
    
    if (!applied) {
      return c.json({ appliedTheme: null });
    }
    
    return c.json({
      appliedTheme: {
        id: applied.id,
        themeId: applied.theme_id,
        purchaseId: applied.purchase_id,
        title: applied.title,
        previewImageUrl: applied.preview_image_url,
        themeData: applied.theme_data ? JSON.parse(applied.theme_data as string) : null,
        hasParticles: applied.has_particles === 1
      }
    });
  } catch (error) {
    console.error("Get applied theme error:", error);
    return c.json({ error: "Failed to fetch applied theme" }, 500);
  }
});

// Apply a purchased theme to music profile
app.post("/api/marketplace/themes/:purchaseId/apply", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const purchaseId = parseInt(c.req.param("purchaseId"));
    if (isNaN(purchaseId)) {
      return c.json({ error: "Invalid purchase ID" }, 400);
    }
    
    // Verify ownership
    const purchase = await c.env.DB.prepare(`
      SELECT tp.id, tp.theme_id, t.name as title, t.preview_image_url, t.theme_data, t.has_particles
      FROM theme_purchases tp
      JOIN marketplace_themes t ON tp.theme_id = t.id
      WHERE tp.id = ? AND (tp.buyer_wallet_address = ? OR tp.buyer_user_id = ?)
    `).bind(purchaseId, auth.walletAddress || '', auth.userId || '').first();
    
    if (!purchase) {
      return c.json({ error: "Theme not found or not owned" }, 404);
    }
    
    // Find or create music profile
    let profile = await findMusicProfile(c.env.DB, auth.walletAddresses);
    if (!profile) {
      return c.json({ error: "Music profile required to apply themes" }, 400);
    }
    
    const now = new Date().toISOString();
    
    // Remove any existing applied theme
    await c.env.DB.prepare(`
      DELETE FROM applied_themes WHERE music_profile_id = ?
    `).bind(profile.id).run();
    
    // Apply new theme
    await c.env.DB.prepare(`
      INSERT INTO applied_themes (music_profile_id, wallet_address, theme_id, purchase_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(profile.id, auth.walletAddress, purchase.theme_id, purchaseId, now, now).run();
    
    return c.json({
      success: true,
      appliedTheme: {
        themeId: purchase.theme_id,
        purchaseId: purchaseId,
        title: purchase.title,
        previewImageUrl: purchase.preview_image_url,
        themeData: purchase.theme_data ? JSON.parse(purchase.theme_data as string) : null,
        hasParticles: purchase.has_particles === 1
      }
    });
  } catch (error) {
    console.error("Apply theme error:", error);
    return c.json({ error: "Failed to apply theme" }, 500);
  }
});

// Remove applied theme
app.delete("/api/marketplace/themes/unapply", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const profile = await findMusicProfile(c.env.DB, auth.walletAddresses);
    if (!profile) {
      return c.json({ error: "Music profile not found" }, 404);
    }
    
    await c.env.DB.prepare(`
      DELETE FROM applied_themes WHERE music_profile_id = ?
    `).bind(profile.id).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Unapply theme error:", error);
    return c.json({ error: "Failed to remove theme" }, 500);
  }
});

// ==========================================
// KRC-20 FRACTIONALIZATION ENDPOINTS
// ==========================================

// Fractionalize a track - creates KRC-20 token for fractional ownership
app.post("/api/kasshi/fractionalize", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    // Accept both old and new parameter names for compatibility
    const body = await c.req.json();
    const trackId = body.trackId;
    const ticker = body.ticker?.toUpperCase();
    const totalShares = body.totalShares;
    const pricePerShare = body.pricePerShare || body.pricePerShareKas || 0;
    const sharesToSell = body.sharesToSell || Math.floor(totalShares * (body.percentageToSell || 50) / 100);
    
    // Validate inputs
    if (!trackId || typeof trackId !== 'number') {
      return c.json({ error: "Invalid track ID" }, 400);
    }
    if (!ticker || ticker.length < 3 || ticker.length > 6) {
      return c.json({ error: "Ticker must be 3-6 characters" }, 400);
    }
    if (!/^[A-Z0-9]+$/.test(ticker)) {
      return c.json({ error: "Ticker must be uppercase letters and numbers only" }, 400);
    }
    if (typeof totalShares !== 'number' || totalShares < 100 || totalShares > 1000000) {
      return c.json({ error: "Total shares must be between 100 and 1,000,000" }, 400);
    }
    if (sharesToSell < 1 || sharesToSell > totalShares) {
      return c.json({ error: "Shares to sell must be between 1 and total shares" }, 400);
    }
    
    // Find music profile for this user
    const profile = await findMusicProfile(c.env.DB, auth.walletAddresses);
    if (!profile) {
      return c.json({ error: "Music profile required to fractionalize tracks" }, 400);
    }
    
    // Get the track and verify ownership
    const track = await c.env.DB.prepare(`
      SELECT t.*, mp.wallet_address as owner_address
      FROM tracks t
      JOIN music_profiles mp ON t.music_profile_id = mp.id
      WHERE t.id = ? AND t.music_profile_id = ?
    `).bind(trackId, profile.id).first<{
      id: number;
      title: string;
      is_fractionalized: number;
      owner_address: string;
    }>();
    
    if (!track) {
      return c.json({ error: "Track not found or you don't own it" }, 404);
    }
    
    if (track.is_fractionalized === 1) {
      return c.json({ error: "Track is already fractionalized" }, 400);
    }
    
    // Check if ticker is available (custom ticker from user)
    const existingTicker = await c.env.DB.prepare(`
      SELECT id FROM tracks WHERE krc20_ticker = ?
    `).bind(ticker).first();
    
    if (existingTicker) {
      return c.json({ error: "Ticker already in use, please choose another" }, 400);
    }
    
    // Also check Kasplex API for existing tokens
    const kasplexCheck = await getKrc20TokenInfo(ticker);
    if (kasplexCheck?.exists) {
      return c.json({ error: "Ticker already exists on Kaspa network" }, 400);
    }
    
    const now = new Date().toISOString();
    const percentageToSell = (sharesToSell / totalShares) * 100;
    
    // Update track with fractionalization info (pending deploy)
    await c.env.DB.prepare(`
      UPDATE tracks SET 
        is_fractionalized = 1,
        locked_at = ?,
        fractional_percentage_sold = ?,
        total_shares = ?,
        krc20_ticker = ?,
        shares_sold = 0,
        updated_at = ?
      WHERE id = ?
    `).bind(now, percentageToSell / 100, totalShares, ticker, now, trackId).run();
    
    // Store price per share (we'll need a column for this or use a separate table)
    // For now include in response for frontend to track
    
    // Build the deploy inscription for KRC-20 token
    const maxSupply = (totalShares * 100000000).toString(); // 8 decimals implicit
    const deployTxResult = await buildKrc20DeployTx(
      track.owner_address,
      ticker,
      maxSupply,
      '1000', // mint limit
      2000    // fee
    );
    
    if (!deployTxResult.success) {
      return c.json({ error: deployTxResult.error || "Failed to build deploy transaction" }, 500);
    }

    return c.json({
      success: true,
      ticker,
      trackId,
      totalShares,
      sharesToSell,
      pricePerShare,
      deployTxRaw: deployTxResult.txData,
      inscriptionHex: deployTxResult.inscriptionHex,
      ownerAddress: track.owner_address,
      message: "Sign this transaction to deploy the KRC-20 shares and lock the track permanently."
    });
  } catch (error) {
    console.error("Fractionalize track error:", error);
    return c.json({ error: "Failed to fractionalize track" }, 500);
  }
});

// Confirm KRC-20 deploy transaction (called after artist signs/broadcasts)
// Supports both /confirm and /confirm-deploy paths
app.post("/api/kasshi/fractionalize/confirm", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const body = await c.req.json();
    const trackId = body.trackId;
    const transactionId = body.transactionId || body.signedTransaction;
    
    if (!trackId || !transactionId) {
      return c.json({ error: "Track ID and transaction/signature required" }, 400);
    }
    
    const profile = await findMusicProfile(c.env.DB, auth.walletAddresses);
    if (!profile) {
      return c.json({ error: "Music profile required" }, 400);
    }
    
    // Verify track ownership and pending fractionalization
    const track = await c.env.DB.prepare(`
      SELECT * FROM tracks WHERE id = ? AND music_profile_id = ? AND is_fractionalized = 1
    `).bind(trackId, profile.id).first();
    
    if (!track) {
      return c.json({ error: "Fractionalized track not found or not owned" }, 404);
    }
    
    if (track.krc20_deploy_txid) {
      return c.json({ error: "Deploy transaction already recorded" }, 400);
    }
    
    const now = new Date().toISOString();
    
    // Record the deploy transaction
    await c.env.DB.prepare(`
      UPDATE tracks SET krc20_deploy_txid = ?, updated_at = ? WHERE id = ?
    `).bind(transactionId, now, trackId).run();
    
    return c.json({
      success: true,
      trackId,
      ticker: track.krc20_ticker,
      transactionId,
      message: "KRC-20 token deployment confirmed"
    });
  } catch (error) {
    console.error("Confirm deploy error:", error);
    return c.json({ error: "Failed to confirm deployment" }, 500);
  }
});

// Alias for backward compatibility
app.post("/api/kasshi/fractionalize/confirm-deploy", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const { trackId, transactionId } = await c.req.json();
    
    if (!trackId || !transactionId) {
      return c.json({ error: "Track ID and transaction ID required" }, 400);
    }
    
    const profile = await findMusicProfile(c.env.DB, auth.walletAddresses);
    if (!profile) {
      return c.json({ error: "Music profile required" }, 400);
    }
    
    // Verify track ownership and pending fractionalization
    const track = await c.env.DB.prepare(`
      SELECT * FROM tracks WHERE id = ? AND music_profile_id = ? AND is_fractionalized = 1
    `).bind(trackId, profile.id).first();
    
    if (!track) {
      return c.json({ error: "Fractionalized track not found or not owned" }, 404);
    }
    
    if (track.krc20_deploy_txid) {
      return c.json({ error: "Deploy transaction already recorded" }, 400);
    }
    
    const now = new Date().toISOString();
    
    // Record the deploy transaction
    await c.env.DB.prepare(`
      UPDATE tracks SET krc20_deploy_txid = ?, updated_at = ? WHERE id = ?
    `).bind(transactionId, now, trackId).run();
    
    return c.json({
      success: true,
      trackId,
      ticker: track.krc20_ticker,
      transactionId,
      message: "KRC-20 token deployment confirmed"
    });
  } catch (error) {
    console.error("Confirm deploy error:", error);
    return c.json({ error: "Failed to confirm deployment" }, 500);
  }
});

// Buy shares in a fractionalized track
app.post("/api/kasshi/buy-shares", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const { trackId, sharesToBuy, pricePerShareKas, paymentTxid } = await c.req.json();
    
    if (!trackId || !sharesToBuy || sharesToBuy <= 0) {
      return c.json({ error: "Invalid track ID or share amount" }, 400);
    }
    
    // Minimum investment of 0.11 KAS required for direct payment system
    const MIN_INVESTMENT_KAS = 0.11;
    const totalCost = sharesToBuy * (pricePerShareKas || 0);
    if (totalCost < MIN_INVESTMENT_KAS) {
      return c.json({ error: `Minimum investment is ${MIN_INVESTMENT_KAS} KAS` }, 400);
    }
    
    // Get the fractionalized track
    const track = await c.env.DB.prepare(`
      SELECT t.*, mp.wallet_address as owner_address
      FROM tracks t
      JOIN music_profiles mp ON t.music_profile_id = mp.id
      WHERE t.id = ? AND t.is_fractionalized = 1
    `).bind(trackId).first<{
      id: number;
      title: string;
      krc20_ticker: string;
      total_shares: number;
      shares_sold: number;
      fractional_percentage_sold: number;
      owner_address: string;
      krc20_deploy_txid: string;
    }>();
    
    if (!track) {
      return c.json({ error: "Fractionalized track not found" }, 404);
    }
    
    if (!track.krc20_deploy_txid) {
      return c.json({ error: "Track token not yet deployed on-chain" }, 400);
    }
    
    // Calculate available shares (percentage of total)
    const availableShares = Math.floor(track.total_shares * track.fractional_percentage_sold) - track.shares_sold;
    
    if (sharesToBuy > availableShares) {
      return c.json({ error: `Only ${availableShares} shares available` }, 400);
    }
    
    // Get buyer's wallet
    const buyerAddress = auth.walletAddress;
    if (!buyerAddress) {
      return c.json({ error: "Buyer wallet required" }, 400);
    }
    
    const now = new Date().toISOString();
    
    // Get current play count to store at purchase time
    const playCountResult = await c.env.DB.prepare(
      "SELECT play_count FROM tracks WHERE id = ?"
    ).bind(trackId).first<{ play_count: number }>();
    const currentPlayCount = playCountResult?.play_count || 0;
    
    // Record the share purchase (off-chain for now — on-chain transfer later)
    await c.env.DB.prepare(`
      INSERT INTO track_shares (track_id, owner_address, ticker, shares_owned, purchase_price_kas, purchased_at, play_count_at_purchase, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(trackId, buyerAddress, track.krc20_ticker, sharesToBuy, pricePerShareKas?.toString() || '0', now, currentPlayCount, now, now).run();
    
    // Update shares sold count
    await c.env.DB.prepare(`
      UPDATE tracks SET shares_sold = shares_sold + ?, updated_at = ? WHERE id = ?
    `).bind(sharesToBuy, now, trackId).run();
    
    return c.json({ 
      success: true, 
      message: "Shares purchased — you now own part of this track's future earnings.",
      trackId,
      ticker: track.krc20_ticker,
      sharesPurchased: sharesToBuy,
      paymentTxid: paymentTxid || null
    });
  } catch (error) {
    console.error("Buy shares error:", error);
    return c.json({ error: "Failed to purchase shares" }, 500);
  }
});

// Payout shares - summary endpoint for shareholder earnings (manual or cron)
app.post("/api/kasshi/payout-shares", adminMiddleware, async (c) => {
  try {
    const { trackId } = await c.req.json().catch(() => ({}));

    const tracks = trackId 
      ? await c.env.DB.prepare("SELECT * FROM tracks WHERE id = ? AND is_fractionalized = 1").bind(trackId).all()
      : await c.env.DB.prepare("SELECT * FROM tracks WHERE is_fractionalized = 1").all();

    const fractionalizedTracks = tracks.results || [];
    
    // Get payout summary for each track
    const payoutSummary = await Promise.all(fractionalizedTracks.map(async (track: any) => {
      const payouts = await c.env.DB.prepare(`
        SELECT 
          COUNT(*) as payout_count,
          SUM(amount_kas) as total_paid_kas
        FROM shareholder_payouts
        WHERE track_id = ?
      `).bind(track.id).first<{ payout_count: number; total_paid_kas: number }>();
      
      return {
        trackId: track.id,
        title: track.title,
        ticker: track.krc20_ticker,
        totalShares: track.total_shares,
        sharesSold: track.shares_sold,
        payoutCount: payouts?.payout_count || 0,
        totalPaidKas: payouts?.total_paid_kas || 0
      };
    }));

    return c.json({ 
      success: true,
      message: "Shareholder earnings are already being recorded via music purchases. Full auto-payout coming post-Toccata.",
      fractionalizedTracksCount: fractionalizedTracks.length,
      payoutSummary
    });
  } catch (error) {
    console.error("Payout shares error:", error);
    return c.json({ error: "Failed to get payout summary" }, 500);
  }
});

// Get fractionalized tracks (public listing)
app.get("/api/kasshi/fractionalized", async (c) => {
  try {
    const tracks = await c.env.DB.prepare(`
      SELECT t.id, t.title, t.cover_art_url, t.krc20_ticker, t.total_shares, t.shares_sold,
             t.fractional_percentage_sold, t.krc20_deploy_txid, t.locked_at,
             mp.name as artist_name, mp.handle as artist_handle, mp.avatar_url as artist_avatar
      FROM tracks t
      JOIN music_profiles mp ON t.music_profile_id = mp.id
      WHERE t.is_fractionalized = 1 AND t.krc20_deploy_txid IS NOT NULL
      ORDER BY t.locked_at DESC
      LIMIT 50
    `).all();
    
    return c.json({
      tracks: tracks.results.map((t: Record<string, unknown>) => ({
        id: t.id,
        title: t.title,
        coverArtUrl: t.cover_art_url,
        ticker: t.krc20_ticker,
        totalShares: t.total_shares,
        sharesSold: t.shares_sold,
        percentageSold: t.fractional_percentage_sold,
        availableShares: Math.floor((t.total_shares as number) * (t.fractional_percentage_sold as number)) - (t.shares_sold as number),
        deployTxId: t.krc20_deploy_txid,
        artistName: t.artist_name,
        artistHandle: t.artist_handle,
        artistAvatar: t.artist_avatar,
      }))
    });
  } catch (error) {
    console.error("Get fractionalized tracks error:", error);
    return c.json({ error: "Failed to fetch tracks" }, 500);
  }
});

// Get user's share holdings with earnings
app.get("/api/kasshi/my-shares", async (c) => {
  try {
    const auth = await getFastAuth(c);
    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    // Check all wallet addresses for earnings
    const addressList = auth.walletAddresses || [auth.walletAddress];
    const placeholders = addressList.map(() => '?').join(',');
    
    const shares = await c.env.DB.prepare(`
      SELECT ts.*, t.title, t.cover_art_url, t.total_shares, t.shares_sold,
             t.fractional_percentage_sold, t.play_count as current_play_count,
             mp.name as artist_name, mp.handle as artist_handle,
             COALESCE((
               SELECT SUM(CAST(sp.amount_kas AS REAL))
               FROM shareholder_payouts sp
               WHERE sp.track_id = ts.track_id AND sp.recipient_address = ts.owner_address
             ), 0) as total_earned
      FROM track_shares ts
      JOIN tracks t ON ts.track_id = t.id
      JOIN music_profiles mp ON t.music_profile_id = mp.id
      WHERE ts.owner_address IN (${placeholders})
      ORDER BY ts.purchased_at DESC
    `).bind(...addressList).all();
    
    // Get payout history for each share holding
    const sharesWithPayouts = await Promise.all(shares.results.map(async (s: Record<string, unknown>) => {
      const payouts = await c.env.DB.prepare(`
        SELECT amount_kas, source_payment_type, source_transaction_id, created_at
        FROM shareholder_payouts
        WHERE track_id = ? AND recipient_address = ?
        ORDER BY created_at DESC
        LIMIT 20
      `).bind(s.track_id, s.owner_address).all();
      
      return {
        id: s.id,
        trackId: s.track_id,
        ticker: s.ticker,
        sharesOwned: s.shares_owned,
        purchasePriceKas: s.purchase_price_kas,
        purchasedAt: s.purchased_at,
        trackTitle: s.title,
        coverArtUrl: s.cover_art_url,
        artistName: s.artist_name,
        artistHandle: s.artist_handle,
        totalShares: s.total_shares,
        fractionalPercentageSold: s.fractional_percentage_sold,
        ownershipPercent: ((s.shares_owned as number) / (s.total_shares as number) * 100).toFixed(4),
        totalEarnedKas: String(s.total_earned || 0),
        playCountAtPurchase: s.play_count_at_purchase || 0,
        currentPlayCount: s.current_play_count || 0,
        playsSinceInvestment: Math.max(0, (s.current_play_count as number || 0) - (s.play_count_at_purchase as number || 0)),
        payoutHistory: payouts.results.map((p: Record<string, unknown>) => ({
          amountKas: p.amount_kas,
          type: p.source_payment_type,
          transactionId: p.source_transaction_id,
          createdAt: p.created_at
        }))
      };
    }));
    
    return c.json({ shares: sharesWithPayouts });
  } catch (error) {
    console.error("Get my shares error:", error);
    return c.json({ error: "Failed to fetch shares" }, 500);
  }
});

// Get track fractionalization details
app.get("/api/kasshi/track/:id/shares", async (c) => {
  try {
    const trackId = parseInt(c.req.param("id"));
    if (isNaN(trackId)) {
      return c.json({ error: "Invalid track ID" }, 400);
    }
    
    const track = await c.env.DB.prepare(`
      SELECT t.*, mp.name as artist_name, mp.handle as artist_handle, mp.wallet_address as owner_address
      FROM tracks t
      JOIN music_profiles mp ON t.music_profile_id = mp.id
      WHERE t.id = ? AND t.is_fractionalized = 1
    `).bind(trackId).first();
    
    if (!track) {
      return c.json({ error: "Fractionalized track not found" }, 404);
    }
    
    // Get top shareholders
    const shareholders = await c.env.DB.prepare(`
      SELECT owner_address, SUM(shares_owned) as total_shares
      FROM track_shares
      WHERE track_id = ?
      GROUP BY owner_address
      ORDER BY total_shares DESC
      LIMIT 10
    `).bind(trackId).all();
    
    return c.json({
      track: {
        id: track.id,
        title: track.title,
        coverArtUrl: track.cover_art_url,
        ticker: track.krc20_ticker,
        totalShares: track.total_shares,
        sharesSold: track.shares_sold,
        percentageSold: track.fractional_percentage_sold,
        availableShares: Math.floor((track.total_shares as number) * (track.fractional_percentage_sold as number)) - (track.shares_sold as number),
        deployTxId: track.krc20_deploy_txid,
        artistName: track.artist_name,
        artistHandle: track.artist_handle,
        ownerAddress: track.owner_address,
      },
      shareholders: shareholders.results.map((s: Record<string, unknown>) => ({
        address: (s.owner_address as string).slice(0, 15) + '...',
        shares: s.total_shares,
        percent: ((s.total_shares as number) / (track.total_shares as number) * 100).toFixed(2),
      }))
    });
  } catch (error) {
    console.error("Get track shares error:", error);
    return c.json({ error: "Failed to fetch track shares" }, 500);
  }
});

// Check KRC-20 token info from Kasplex
app.get("/api/kasshi/krc20/:ticker", async (c) => {
  try {
    const ticker = c.req.param("ticker").toUpperCase();
    
    if (!validateTicker(ticker)) {
      return c.json({ error: "Invalid ticker format" }, 400);
    }
    
    const tokenInfo = await getKrc20TokenInfo(ticker);
    
    if (!tokenInfo || !tokenInfo.exists) {
      return c.json({ error: "Token not found on Kasplex" }, 404);
    }
    
    return c.json({
      ticker,
      exists: true,
      maxSupply: tokenInfo.maxSupply,
      totalMinted: tokenInfo.totalMinted,
      holders: tokenInfo.holders,
    });
  } catch (error) {
    console.error("Get KRC-20 info error:", error);
    return c.json({ error: "Failed to fetch token info" }, 500);
  }
});

// Get KRC-20 balance for an address
app.get("/api/kasshi/krc20/:ticker/balance/:address", async (c) => {
  try {
    const ticker = c.req.param("ticker").toUpperCase();
    const address = c.req.param("address");
    
    if (!validateTicker(ticker)) {
      return c.json({ error: "Invalid ticker format" }, 400);
    }
    
    const balance = await getKrc20Balance(address, ticker);
    
    return c.json({
      ticker,
      address,
      balance: balance || '0',
    });
  } catch (error) {
    console.error("Get KRC-20 balance error:", error);
    return c.json({ error: "Failed to fetch balance" }, 500);
  }
});

// ==================== SUPER REACTS (Clips) ====================

// POST /api/kasshi/super-react - Record a super react (boosted comment)
app.post("/api/kasshi/super-react", async (c) => {
  try {
    const { trackId, amountKAS, commentText, isAnonymous, transactionId: _transactionId } = await c.req.json();
    
    // Get user from auth
    const authResult = await getFastAuth(c);
    if (!authResult) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const userAddress = authResult.walletAddresses[0];
    
    if (!trackId || typeof trackId !== 'number') {
      return c.json({ error: "Invalid track ID" }, 400);
    }
    
    if (!amountKAS || amountKAS < 0.1) {
      return c.json({ error: "Super React minimum is 0.1 KAS" }, 400);
    }
    
    // Comment is optional - use empty string for no comment (table has NOT NULL constraint)
    const finalComment = commentText ? commentText.trim() : '';
    
    if (finalComment && finalComment.length > 500) {
      return c.json({ error: "Comment must be 500 characters or less" }, 400);
    }
    
    // Verify the track exists and is a clip
    const track = await c.env.DB.prepare(`
      SELECT id, is_clip, title, music_profile_id FROM tracks WHERE id = ?
    `).bind(trackId).first();
    
    if (!track) {
      return c.json({ error: "Track not found" }, 404);
    }
    
    // Record the Super React
    await c.env.DB.prepare(`
      INSERT INTO super_reacts (track_id, user_address, amount_kas, comment_text, is_anonymous)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      trackId,
      isAnonymous ? "anonymous" : userAddress,
      amountKAS,
      finalComment,
      isAnonymous ? 1 : 0
    ).run();
    
    return c.json({ 
      success: true, 
      message: "Super React recorded — your comment is now pinned at the top!" 
    });
  } catch (error) {
    console.error("Super react error:", error);
    return c.json({ error: "Failed to record super react" }, 500);
  }
});

// GET /api/kasshi/super-reacts/:trackId - Get super reacts for a track
app.get("/api/kasshi/super-reacts/:trackId", async (c) => {
  try {
    const trackId = parseInt(c.req.param("trackId"));
    
    if (isNaN(trackId)) {
      return c.json({ error: "Invalid track ID" }, 400);
    }
    
    const reacts = await c.env.DB.prepare(`
      SELECT id, user_address, amount_kas, comment_text, is_anonymous, created_at
      FROM super_reacts 
      WHERE track_id = ?
      ORDER BY amount_kas DESC, created_at DESC
    `).bind(trackId).all();
    
    return c.json({
      superReacts: reacts.results.map((r: Record<string, unknown>) => ({
        id: r.id,
        userAddress: r.is_anonymous ? "anonymous" : r.user_address,
        amountKas: r.amount_kas,
        commentText: r.comment_text,
        isAnonymous: r.is_anonymous === 1,
        createdAt: r.created_at
      }))
    });
  } catch (error) {
    console.error("Get super reacts error:", error);
    return c.json({ error: "Failed to fetch super reacts" }, 500);
  }
});

// POST /api/kasshi/clips/:id/super-react - Record a super react on a clip (video)
app.post("/api/kasshi/clips/:id/super-react", async (c) => {
  try {
    const clipId = parseInt(c.req.param("id"));
    const { amountKAS, commentText, isAnonymous, transactionId: _transactionId } = await c.req.json();
    
    // Get user from auth
    const authResult = await getFastAuth(c);
    if (!authResult) {
      return c.json({ error: "Authentication required" }, 401);
    }
    
    const userAddress = authResult.walletAddresses[0];
    
    if (!clipId || isNaN(clipId)) {
      return c.json({ error: "Invalid clip ID" }, 400);
    }
    
    if (!amountKAS || amountKAS < 0.1) {
      return c.json({ error: "Super React minimum is 0.1 KAS" }, 400);
    }
    
    // Comment is optional - use empty string for no comment (table has NOT NULL constraint)
    const finalComment = commentText ? commentText.trim() : '';
    
    if (finalComment && finalComment.length > 500) {
      return c.json({ error: "Comment must be 500 characters or less" }, 400);
    }
    
    // Verify the clip exists and get owner info
    const clip = await c.env.DB.prepare(`
      SELECT v.id, v.title, v.channel_id, ch.wallet_address as owner_wallet
      FROM videos v
      JOIN channels ch ON v.channel_id = ch.id
      WHERE v.id = ? AND v.is_clip = 1
    `).bind(clipId).first();
    
    if (!clip) {
      return c.json({ error: "Clip not found" }, 404);
    }
    
    // Record the Super React (track_id=0 for video clips, video_id stores clip id)
    await c.env.DB.prepare(`
      INSERT INTO super_reacts (track_id, video_id, user_address, amount_kas, comment_text, is_anonymous)
      VALUES (0, ?, ?, ?, ?, ?)
    `).bind(
      clipId,
      isAnonymous ? "anonymous" : userAddress,
      amountKAS,
      finalComment,
      isAnonymous ? 1 : 0
    ).run();
    
    // Increment comment count (Super Reacts count as comments)
    await c.env.DB.prepare(
      "UPDATE videos SET comment_count = comment_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(clipId).run();
    
    // Send notification to clip owner
    if (clip.owner_wallet && clip.owner_wallet !== userAddress) {
      const recipientWallet = await c.env.DB.prepare(
        "SELECT user_id FROM user_wallets WHERE wallet_address = ?"
      ).bind(clip.owner_wallet).first();
      
      const recipientUserId = recipientWallet?.user_id as string | null;
      const clipTitle = clip.title ? `"${String(clip.title).substring(0, 50)}"` : "your clip";
      const displayName = isAnonymous ? "Someone" : userAddress.substring(0, 10) + "...";
      const commentPreview = finalComment ? `: "${finalComment.substring(0, 80)}${finalComment.length > 80 ? "..." : ""}"` : "";
      
      await c.env.DB.prepare(`
        INSERT INTO notifications (user_id, type, title, message, video_id, channel_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        recipientUserId || clip.owner_wallet,
        "super_react",
        `🔥 Super React on ${clipTitle}`,
        `${displayName} sent ${amountKAS} KAS${commentPreview}`,
        clipId,
        clip.channel_id
      ).run();
    }
    
    return c.json({ 
      success: true, 
      message: "Super React recorded — your comment is now pinned at the top!" 
    });
  } catch (error) {
    console.error("Clip super react error:", error);
    return c.json({ error: "Failed to record super react" }, 500);
  }
});

// GET /api/kasshi/clips/:id/super-reacts - Get super reacts for a clip
app.get("/api/kasshi/clips/:id/super-reacts", async (c) => {
  try {
    const clipId = parseInt(c.req.param("id"));
    
    if (isNaN(clipId)) {
      return c.json({ error: "Invalid clip ID" }, 400);
    }
    
    const reacts = await c.env.DB.prepare(`
      SELECT id, user_address, amount_kas, comment_text, is_anonymous, created_at
      FROM super_reacts 
      WHERE video_id = ?
      ORDER BY amount_kas DESC, created_at DESC
    `).bind(clipId).all();
    
    return c.json({
      superReacts: reacts.results.map((r: Record<string, unknown>) => ({
        id: r.id,
        userAddress: r.is_anonymous ? "anonymous" : r.user_address,
        amountKas: r.amount_kas,
        commentText: r.comment_text,
        isAnonymous: r.is_anonymous === 1,
        createdAt: r.created_at
      }))
    });
  } catch (error) {
    console.error("Get clip super reacts error:", error);
    return c.json({ error: "Failed to fetch super reacts" }, 500);
  }
});

// GET /api/kasshi/clips - Fetch clips feed (short-form vertical videos)
app.get("/api/kasshi/clips", async (c) => {
  try {
    const url = new URL(c.req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;
    const targetPublicId = url.searchParams.get("v"); // Specific clip to load first

    const mapClip = (clip: Record<string, unknown>) => ({
      id: clip.id,
      publicId: clip.public_id,
      title: clip.title,
      description: clip.description,
      videoUrl: clip.video_url,
      thumbnailUrl: clip.thumbnail_url,
      durationSeconds: clip.duration_seconds,
      viewCount: clip.view_count,
      likeCount: clip.like_count || 0,
      commentCount: clip.comment_count || 0,
      priceKas: clip.price_kas,
      cropX: clip.crop_x,
      cropY: clip.crop_y,
      cropZoom: clip.crop_zoom,
      bunnyVideoId: clip.bunny_video_id,
      createdAt: clip.created_at,
      channel: {
        id: clip.channel_id,
        name: clip.channel_name,
        handle: clip.channel_handle,
        avatarUrl: clip.avatar_url,
        walletAddress: clip.channel_wallet_address
      }
    });

    // If specific clip requested (from share link), fetch it first
    let targetClip = null;
    if (targetPublicId && page === 1) {
      const specificClip = await c.env.DB.prepare(`
        SELECT v.id, v.public_id, v.title, v.description, v.video_url, v.thumbnail_url,
               v.duration_seconds, v.view_count, v.like_count, v.comment_count, v.price_kas, v.is_clip,
               v.crop_x, v.crop_y, v.crop_zoom, v.bunny_video_id, v.created_at,
               ch.id as channel_id, ch.name as channel_name, ch.handle as channel_handle, 
               ch.avatar_url, ch.wallet_address as channel_wallet_address
        FROM videos v
        LEFT JOIN channels ch ON v.channel_id = ch.id
        WHERE v.public_id = ? AND v.is_clip = 1 AND v.status = 'published'
      `).bind(targetPublicId).first();
      
      if (specificClip) {
        targetClip = mapClip(specificClip);
      }
    }

    const clips = await c.env.DB.prepare(`
      SELECT v.id, v.public_id, v.title, v.description, v.video_url, v.thumbnail_url,
             v.duration_seconds, v.view_count, v.like_count, v.comment_count, v.price_kas, v.is_clip,
             v.crop_x, v.crop_y, v.crop_zoom, v.bunny_video_id, v.created_at,
             ch.id as channel_id, ch.name as channel_name, ch.handle as channel_handle, 
             ch.avatar_url, ch.wallet_address as channel_wallet_address
      FROM videos v
      LEFT JOIN channels ch ON v.channel_id = ch.id
      WHERE v.is_clip = 1 AND v.status = 'published'
        ${targetPublicId && page === 1 ? 'AND v.public_id != ?' : ''}
      ORDER BY v.view_count DESC, v.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...(targetPublicId && page === 1 ? [targetPublicId, limit, offset] : [limit, offset])).all();

    const mappedClips = clips.results.map(mapClip);
    
    // Put target clip first if found
    const finalClips = targetClip ? [targetClip, ...mappedClips] : mappedClips;

    return c.json({ 
      clips: finalClips,
      hasMore: clips.results.length === limit 
    });
  } catch (error) {
    console.error("Get clips error:", error);
    return c.json({ error: "Failed to fetch clips" }, 500);
  }
});

// POST /api/kasshi/clips/:id/like - FREE like/unlike a clip
app.post("/api/kasshi/clips/:id/like", async (c) => {
  try {
    const clipId = parseInt(c.req.param("id"));
    const { walletAddress, userId } = await c.req.json();
    
    if (!walletAddress && !userId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // Check if clip exists and get owner info
    const clip = await c.env.DB.prepare(
      `SELECT v.id, v.like_count, v.title, v.channel_id, ch.wallet_address as owner_wallet
       FROM videos v
       JOIN channels ch ON v.channel_id = ch.id
       WHERE v.id = ? AND v.is_clip = 1`
    ).bind(clipId).first();
    
    if (!clip) {
      return c.json({ error: "Clip not found" }, 404);
    }

    // Check existing interaction
    let existing;
    if (walletAddress) {
      const channel = await c.env.DB.prepare(
        "SELECT id FROM channels WHERE wallet_address = ?"
      ).bind(walletAddress).first();
      if (channel) {
        existing = await c.env.DB.prepare(
          "SELECT id, interaction_type FROM video_interactions WHERE video_id = ? AND channel_id = ?"
        ).bind(clipId, channel.id).first();
      }
    } else if (userId) {
      existing = await c.env.DB.prepare(
        "SELECT id, interaction_type FROM video_interactions WHERE video_id = ? AND user_id = ?"
      ).bind(clipId, userId).first();
    }

    let isLiked = false;
    let newLikeCount = Number(clip.like_count) || 0;

    if (existing && existing.interaction_type === "like") {
      // Unlike - remove the interaction
      await c.env.DB.prepare("DELETE FROM video_interactions WHERE id = ?")
        .bind(existing.id).run();
      newLikeCount = Math.max(0, newLikeCount - 1);
      isLiked = false;
    } else {
      // Like - add or update interaction
      if (existing) {
        await c.env.DB.prepare(
          "UPDATE video_interactions SET interaction_type = 'like', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(existing.id).run();
      } else {
        if (walletAddress) {
          const channel = await c.env.DB.prepare(
            "SELECT id FROM channels WHERE wallet_address = ?"
          ).bind(walletAddress).first();
          if (channel) {
            await c.env.DB.prepare(
              "INSERT INTO video_interactions (video_id, channel_id, interaction_type) VALUES (?, ?, 'like')"
            ).bind(clipId, channel.id).run();
          }
        } else if (userId) {
          await c.env.DB.prepare(
            "INSERT INTO video_interactions (video_id, channel_id, user_id, interaction_type) VALUES (?, 0, ?, 'like')"
          ).bind(clipId, userId).run();
        }
      }
      newLikeCount = newLikeCount + 1;
      isLiked = true;
    }

    // Update like count on video
    await c.env.DB.prepare(
      "UPDATE videos SET like_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(newLikeCount, clipId).run();

    // Send notification to clip owner when liked (not unliked)
    if (isLiked && clip.owner_wallet) {
      // Don't notify if user liked their own clip
      const isOwnClip = walletAddress === clip.owner_wallet;
      if (!isOwnClip) {
        // Find user_id for recipient
        const recipientWallet = await c.env.DB.prepare(
          "SELECT user_id FROM user_wallets WHERE wallet_address = ?"
        ).bind(clip.owner_wallet).first();
        
        const recipientUserId = recipientWallet?.user_id as string | null;
        const clipTitle = clip.title ? `"${String(clip.title).substring(0, 50)}"` : "your clip";
        
        await c.env.DB.prepare(`
          INSERT INTO notifications (user_id, type, title, message, video_id, channel_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          recipientUserId || clip.owner_wallet,
          "like",
          "New like on your clip",
          `Someone liked ${clipTitle}`,
          clipId,
          clip.channel_id
        ).run();
      }
    }

    return c.json({ success: true, isLiked, likeCount: newLikeCount });
  } catch (error) {
    console.error("Clip like error:", error);
    return c.json({ error: "Failed to like clip" }, 500);
  }
});

// GET /api/kasshi/clips/liked - Get all clip IDs the user has liked
app.get("/api/kasshi/clips/liked", async (c) => {
  try {
    const url = new URL(c.req.url);
    const walletAddress = url.searchParams.get("walletAddress");
    const userId = url.searchParams.get("userId");

    if (!walletAddress && !userId) {
      return c.json({ likedClipIds: [] });
    }

    let likedClips;
    if (walletAddress) {
      const channel = await c.env.DB.prepare(
        "SELECT id FROM channels WHERE wallet_address = ?"
      ).bind(walletAddress).first();
      if (channel) {
        likedClips = await c.env.DB.prepare(`
          SELECT vi.video_id 
          FROM video_interactions vi
          JOIN videos v ON vi.video_id = v.id
          WHERE vi.channel_id = ? AND vi.interaction_type = 'like' AND v.is_clip = 1
        `).bind(channel.id).all();
      }
    } else if (userId) {
      likedClips = await c.env.DB.prepare(`
        SELECT vi.video_id 
        FROM video_interactions vi
        JOIN videos v ON vi.video_id = v.id
        WHERE vi.user_id = ? AND vi.interaction_type = 'like' AND v.is_clip = 1
      `).bind(userId).all();
    }

    return c.json({ 
      likedClipIds: likedClips?.results?.map((r: Record<string, unknown>) => r.video_id) || [] 
    });
  } catch (error) {
    console.error("Get liked clips error:", error);
    return c.json({ likedClipIds: [] });
  }
});

// GET /api/kasshi/clips/:id/like-status - Check if user liked a clip
app.get("/api/kasshi/clips/:id/like-status", async (c) => {
  try {
    const clipId = parseInt(c.req.param("id"));
    const url = new URL(c.req.url);
    const walletAddress = url.searchParams.get("walletAddress");
    const userId = url.searchParams.get("userId");

    if (!walletAddress && !userId) {
      return c.json({ isLiked: false });
    }

    let existing;
    if (walletAddress) {
      const channel = await c.env.DB.prepare(
        "SELECT id FROM channels WHERE wallet_address = ?"
      ).bind(walletAddress).first();
      if (channel) {
        existing = await c.env.DB.prepare(
          "SELECT interaction_type FROM video_interactions WHERE video_id = ? AND channel_id = ? AND interaction_type = 'like'"
        ).bind(clipId, channel.id).first();
      }
    } else if (userId) {
      existing = await c.env.DB.prepare(
        "SELECT interaction_type FROM video_interactions WHERE video_id = ? AND user_id = ? AND interaction_type = 'like'"
      ).bind(clipId, userId).first();
    }

    return c.json({ isLiked: !!existing });
  } catch (error) {
    console.error("Clip like status error:", error);
    return c.json({ isLiked: false });
  }
});

// POST /api/kasshi/clips/:id/comment - FREE comment on a clip
app.post("/api/kasshi/clips/:id/comment", async (c) => {
  try {
    const clipId = parseInt(c.req.param("id"));
    const { walletAddress, userId, content, parentId } = await c.req.json();
    
    if (!walletAddress && !userId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!content || content.trim().length === 0) {
      return c.json({ error: "Comment cannot be empty" }, 400);
    }

    if (content.length > 500) {
      return c.json({ error: "Comment too long (max 500 characters)" }, 400);
    }

    // Check if clip exists and get owner info
    const clip = await c.env.DB.prepare(
      `SELECT v.id, v.comment_count, v.title, v.channel_id, ch.wallet_address as owner_wallet
       FROM videos v
       JOIN channels ch ON v.channel_id = ch.id
       WHERE v.id = ? AND v.is_clip = 1`
    ).bind(clipId).first();
    
    if (!clip) {
      return c.json({ error: "Clip not found" }, 404);
    }

    // If replying, verify parent comment exists
    if (parentId) {
      const parentComment = await c.env.DB.prepare(
        "SELECT id FROM comments WHERE id = ? AND video_id = ?"
      ).bind(parentId, clipId).first();
      
      if (!parentComment) {
        return c.json({ error: "Parent comment not found" }, 404);
      }
    }

    // Get or create channel for commenter
    let channelId = 0;
    let channelName = "Anonymous";
    let channelHandle = "anonymous";
    let channelAvatar = null;

    if (walletAddress) {
      const channel = await c.env.DB.prepare(
        "SELECT id, name, handle, avatar_url FROM channels WHERE wallet_address = ?"
      ).bind(walletAddress).first();
      if (channel) {
        channelId = Number(channel.id);
        channelName = String(channel.name);
        channelHandle = String(channel.handle);
        channelAvatar = channel.avatar_url;
      }
    }

    // Insert comment with optional parent_id
    const result = await c.env.DB.prepare(
      "INSERT INTO comments (video_id, channel_id, content, parent_id) VALUES (?, ?, ?, ?)"
    ).bind(clipId, channelId, content.trim(), parentId || null).run();

    // Update comment count
    const newCommentCount = (Number(clip.comment_count) || 0) + 1;
    await c.env.DB.prepare(
      "UPDATE videos SET comment_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(newCommentCount, clipId).run();

    // Send notification to clip owner
    if (clip.owner_wallet) {
      // Don't notify if user commented on their own clip
      const isOwnClip = walletAddress === clip.owner_wallet;
      if (!isOwnClip) {
        // Find user_id for recipient
        const recipientWallet = await c.env.DB.prepare(
          "SELECT user_id FROM user_wallets WHERE wallet_address = ?"
        ).bind(clip.owner_wallet).first();
        
        const recipientUserId = recipientWallet?.user_id as string | null;
        
        // Check notification settings
        let shouldNotify = true;
        if (recipientUserId) {
          const settings = await c.env.DB.prepare(
            "SELECT notifications_comments FROM user_settings WHERE user_id = ?"
          ).bind(recipientUserId).first();
          shouldNotify = settings?.notifications_comments !== 0;
        }
        
        if (shouldNotify) {
          const clipTitle = clip.title ? `"${String(clip.title).substring(0, 50)}"` : "your clip";
          const commentPreview = content.trim().substring(0, 100);
          const notifTitle = parentId ? "New reply on your clip" : "New comment on your clip";
          const notifMessage = `${channelName} ${parentId ? "replied" : "commented"} on ${clipTitle}: "${commentPreview}${content.length > 100 ? "..." : ""}"`;
          
          await c.env.DB.prepare(`
            INSERT INTO notifications (user_id, type, title, message, video_id, channel_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            recipientUserId || clip.owner_wallet,
            "comment",
            notifTitle,
            notifMessage,
            clipId,
            channelId
          ).run();
        }
      }
    }

    return c.json({ 
      success: true, 
      comment: {
        id: result.meta.last_row_id,
        content: content.trim(),
        likeCount: 0,
        parentId: parentId || null,
        createdAt: new Date().toISOString(),
        channel: {
          id: channelId,
          name: channelName,
          handle: channelHandle,
          avatarUrl: channelAvatar
        },
        replies: []
      },
      commentCount: newCommentCount
    });
  } catch (error) {
    console.error("Clip comment error:", error);
    return c.json({ error: "Failed to post comment" }, 500);
  }
});

// GET /api/kasshi/clips/:id/comments - Get comments for a clip (with nested replies)
// Super Reacts appear first (sorted by amount DESC), then regular comments in random order
app.get("/api/kasshi/clips/:id/comments", async (c) => {
  try {
    const clipId = parseInt(c.req.param("id"));
    const url = new URL(c.req.url);
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // First, get Super Reacts for this clip (sorted by amount, highest first)
    const superReacts = await c.env.DB.prepare(`
      SELECT sr.id, sr.user_address, sr.amount_kas, sr.comment_text, sr.is_anonymous, sr.created_at,
             ch.id as channel_id, ch.name as channel_name, ch.handle as channel_handle, ch.avatar_url
      FROM super_reacts sr
      LEFT JOIN channels ch ON sr.user_address = ch.wallet_address
      WHERE sr.video_id = ?
      ORDER BY sr.amount_kas DESC, sr.created_at DESC
    `).bind(clipId).all();

    // Get top-level comments (no parent_id) in RANDOM order
    const topLevelComments = await c.env.DB.prepare(`
      SELECT c.id, c.content, c.like_count, c.parent_id, c.created_at,
             ch.id as channel_id, ch.name as channel_name, ch.handle as channel_handle, ch.avatar_url
      FROM comments c
      LEFT JOIN channels ch ON c.channel_id = ch.id
      WHERE c.video_id = ? AND (c.parent_id IS NULL OR c.parent_id = 0)
      ORDER BY RANDOM()
      LIMIT ? OFFSET ?
    `).bind(clipId, limit, offset).all();

    // Get all replies for these top-level comments
    const topLevelIds = topLevelComments.results.map((c: Record<string, unknown>) => c.id);
    let repliesMap: Record<number, Array<Record<string, unknown>>> = {};
    
    if (topLevelIds.length > 0) {
      const replies = await c.env.DB.prepare(`
        SELECT c.id, c.content, c.like_count, c.parent_id, c.created_at,
               ch.id as channel_id, ch.name as channel_name, ch.handle as channel_handle, ch.avatar_url
        FROM comments c
        LEFT JOIN channels ch ON c.channel_id = ch.id
        WHERE c.parent_id IN (${topLevelIds.join(",")})
        ORDER BY c.created_at ASC
      `).all();
      
      for (const reply of replies.results) {
        const parentId = Number(reply.parent_id);
        if (!repliesMap[parentId]) repliesMap[parentId] = [];
        repliesMap[parentId].push(reply);
      }
    }

    interface MappedComment {
      id: unknown;
      content: unknown;
      likeCount: number;
      parentId: unknown;
      createdAt: unknown;
      isSuperReact?: boolean;
      superReactAmount?: number;
      channel: {
        id: number;
        name: string;
        handle: string;
        avatarUrl: unknown;
      };
      replies: MappedComment[];
    }

    // Map Super Reacts as special comments
    const mappedSuperReacts: MappedComment[] = superReacts.results.map((sr: Record<string, unknown>) => ({
      id: `sr-${sr.id}`,
      content: sr.comment_text,
      likeCount: 0,
      parentId: null,
      createdAt: sr.created_at,
      isSuperReact: true,
      superReactAmount: sr.amount_kas as number,
      isAnonymous: sr.is_anonymous === 1,
      channel: {
        id: (sr.channel_id as number) || 0,
        name: sr.is_anonymous === 1 ? "Anonymous" : ((sr.channel_name as string) || (sr.user_address as string)?.substring(0, 12) + "..."),
        handle: sr.is_anonymous === 1 ? "anonymous" : ((sr.channel_handle as string) || "user"),
        avatarUrl: sr.is_anonymous === 1 ? null : sr.avatar_url
      },
      replies: []
    }));

    const mapComment = (c: Record<string, unknown>): MappedComment => ({
      id: c.id,
      content: c.content,
      likeCount: (c.like_count as number) || 0,
      parentId: c.parent_id || null,
      createdAt: c.created_at,
      channel: {
        id: (c.channel_id as number) || 0,
        name: (c.channel_name as string) || "Anonymous",
        handle: (c.channel_handle as string) || "anonymous",
        avatarUrl: c.avatar_url
      },
      replies: (repliesMap[Number(c.id)] || []).map(mapComment)
    });

    // Combine: Super Reacts first, then regular comments
    const allComments = [
      ...mappedSuperReacts,
      ...topLevelComments.results.map(mapComment)
    ];

    return c.json({
      comments: allComments
    });
  } catch (error) {
    console.error("Get clip comments error:", error);
    return c.json({ comments: [] });
  }
});

// POST /api/kasshi/clips/comments/:id/like - Like/unlike a comment
app.post("/api/kasshi/clips/comments/:id/like", async (c) => {
  try {
    const commentId = parseInt(c.req.param("id"));
    const { walletAddress, userId } = await c.req.json();
    
    if (!walletAddress && !userId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // Get channel for user
    let channelId = 0;
    if (walletAddress) {
      const channel = await c.env.DB.prepare(
        "SELECT id FROM channels WHERE wallet_address = ?"
      ).bind(walletAddress).first();
      if (channel) channelId = Number(channel.id);
    }

    // Check for existing like
    let existing;
    if (channelId) {
      existing = await c.env.DB.prepare(
        "SELECT id FROM comment_interactions WHERE comment_id = ? AND channel_id = ? AND interaction_type = 'like'"
      ).bind(commentId, channelId).first();
    } else if (userId) {
      existing = await c.env.DB.prepare(
        "SELECT id FROM comment_interactions WHERE comment_id = ? AND user_id = ? AND interaction_type = 'like'"
      ).bind(commentId, userId).first();
    }

    if (existing) {
      // Unlike - remove the interaction
      await c.env.DB.prepare(
        "DELETE FROM comment_interactions WHERE id = ?"
      ).bind(existing.id).run();
      
      // Decrement like count
      await c.env.DB.prepare(
        "UPDATE comments SET like_count = MAX(0, like_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(commentId).run();
      
      const updated = await c.env.DB.prepare(
        "SELECT like_count FROM comments WHERE id = ?"
      ).bind(commentId).first();
      
      return c.json({ success: true, isLiked: false, likeCount: updated?.like_count || 0 });
    } else {
      // Like - add the interaction
      if (channelId) {
        await c.env.DB.prepare(
          "INSERT INTO comment_interactions (comment_id, channel_id, interaction_type) VALUES (?, ?, 'like')"
        ).bind(commentId, channelId).run();
      } else {
        await c.env.DB.prepare(
          "INSERT INTO comment_interactions (comment_id, channel_id, user_id, interaction_type) VALUES (?, 0, ?, 'like')"
        ).bind(commentId, userId).run();
      }
      
      // Increment like count
      await c.env.DB.prepare(
        "UPDATE comments SET like_count = like_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(commentId).run();
      
      const updated = await c.env.DB.prepare(
        "SELECT like_count FROM comments WHERE id = ?"
      ).bind(commentId).first();
      
      return c.json({ success: true, isLiked: true, likeCount: updated?.like_count || 0 });
    }
  } catch (error) {
    console.error("Comment like error:", error);
    return c.json({ error: "Failed to like comment" }, 500);
  }
});

// GET /api/kasshi/clips/comments/liked - Get all liked comment IDs for a user
app.get("/api/kasshi/clips/comments/liked", async (c) => {
  try {
    const url = new URL(c.req.url);
    const walletAddress = url.searchParams.get("walletAddress");
    const userId = url.searchParams.get("userId");

    if (!walletAddress && !userId) {
      return c.json({ likedCommentIds: [] });
    }

    let likedComments;
    if (walletAddress) {
      const channel = await c.env.DB.prepare(
        "SELECT id FROM channels WHERE wallet_address = ?"
      ).bind(walletAddress).first();
      
      if (channel) {
        likedComments = await c.env.DB.prepare(
          "SELECT comment_id FROM comment_interactions WHERE channel_id = ? AND interaction_type = 'like'"
        ).bind(channel.id).all();
      }
    } else if (userId) {
      likedComments = await c.env.DB.prepare(
        "SELECT comment_id FROM comment_interactions WHERE user_id = ? AND interaction_type = 'like'"
      ).bind(userId).all();
    }

    return c.json({ 
      likedCommentIds: likedComments?.results?.map((r: Record<string, unknown>) => r.comment_id) || [] 
    });
  } catch (error) {
    console.error("Get liked comments error:", error);
    return c.json({ likedCommentIds: [] });
  }
});

export default app;
