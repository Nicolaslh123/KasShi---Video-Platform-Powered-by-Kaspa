/**
 * Rate limiter for Cloudflare Workers with lockout support
 * Limits requests per IP address within a time window
 * 
 * SECURITY NOTES:
 * - In-memory store resets on worker restart (acceptable for basic protection)
 * - For production at scale, consider Durable Objects or KV
 * - Lockout tracking prevents brute force by extending blocks
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
  lockoutCount: number; // Track repeated violations for progressive lockout
}

// In-memory store (resets on worker restart, which is fine for basic protection)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Track locked out IPs with extended timeouts
const lockoutStore = new Map<string, number>(); // IP -> lockout expiry timestamp

// Cleanup old entries periodically
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60000; // 1 minute

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Optional key prefix for different rate limit buckets */
  keyPrefix?: string;
}

/**
 * Check if a request should be rate limited
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 * 
 * SECURITY: Implements progressive lockout - repeated violations extend block time
 */
export function checkRateLimit(
  ip: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number; retryAfter?: number; isLockedOut?: boolean } {
  cleanup();
  
  const now = Date.now();
  const key = `${config.keyPrefix || 'default'}:${ip}`;
  
  // Check for active lockout first
  const lockoutExpiry = lockoutStore.get(key);
  if (lockoutExpiry && lockoutExpiry > now) {
    const retryAfter = Math.ceil((lockoutExpiry - now) / 1000);
    return { allowed: false, remaining: 0, resetAt: lockoutExpiry, retryAfter, isLockedOut: true };
  } else if (lockoutExpiry) {
    lockoutStore.delete(key); // Lockout expired
  }
  
  const entry = rateLimitStore.get(key);
  
  // No existing entry or window expired
  if (!entry || entry.resetAt < now) {
    const resetAt = now + config.windowSeconds * 1000;
    rateLimitStore.set(key, { count: 1, resetAt, lockoutCount: entry?.lockoutCount || 0 });
    return { allowed: true, remaining: config.limit - 1, resetAt };
  }
  
  // Within window, check limit
  if (entry.count >= config.limit) {
    // Increment lockout count and apply progressive lockout
    entry.lockoutCount = (entry.lockoutCount || 0) + 1;
    
    // Progressive lockout: 1st = 5min, 2nd = 15min, 3rd+ = 1 hour
    const lockoutMinutes = entry.lockoutCount === 1 ? 5 : entry.lockoutCount === 2 ? 15 : 60;
    const lockoutExpiry = now + lockoutMinutes * 60 * 1000;
    lockoutStore.set(key, lockoutExpiry);
    
    const retryAfter = Math.ceil((lockoutExpiry - now) / 1000);
    return { allowed: false, remaining: 0, resetAt: lockoutExpiry, retryAfter, isLockedOut: true };
  }
  
  // Increment counter
  entry.count++;
  return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Get client IP from Cloudflare headers
 */
export function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    c.req.header("X-Real-IP") ||
    "unknown"
  );
}

// Pre-configured rate limit profiles
export const RATE_LIMITS = {
  // Strict: 5 requests per minute (for sensitive operations like transactions)
  STRICT: { limit: 5, windowSeconds: 60 },
  
  // Standard: 30 requests per minute (for authenticated operations)
  STANDARD: { limit: 30, windowSeconds: 60 },
  
  // Relaxed: 60 requests per minute (for read operations)
  RELAXED: { limit: 60, windowSeconds: 60 },
  
  // Auth: 10 attempts per 5 minutes (for login/PIN verification)
  AUTH: { limit: 10, windowSeconds: 300 },
  
  // Wallet creation: 3 per hour
  WALLET_CREATE: { limit: 3, windowSeconds: 3600 },
} as const;
