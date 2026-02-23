# Security Audit Report - Kaspay Wallet

**Audit Date:** January 2025  
**Auditor:** Mocha Security Review  
**Status:** Issues Found & Remediated

---

## Executive Summary

This audit reviewed the Kaspay wallet codebase for security vulnerabilities, focusing on:
- Private key generation and storage
- Authentication and PIN handling
- Transaction signing and API security
- Rate limiting and brute force protection

### Issues Found

| Severity | Issue | Status |
|----------|-------|--------|
| 🔴 CRITICAL | Weak mnemonic generation (reduced wordlist) | **FIXED** |
| 🔴 CRITICAL | PIN hashing uses static salt | **FIXED** |
| 🟠 HIGH | Developer endpoints exposed in production | **FIXED** |
| 🟠 HIGH | Transaction endpoint lacks auth middleware | **FIXED** |
| 🟡 MEDIUM | No account lockout after failed attempts | **FIXED** |
| 🟡 MEDIUM | In-memory rate limiter resets on restart | **DOCUMENTED** |
| 🟢 LOW | Console logging of sensitive operations | **FIXED** |

---

## Critical Issues (Fixed)

### 1. Weak Mnemonic Generation

**Before:** Used only 200 words from BIP39 wordlist
**Risk:** Reduced entropy from 256 bits to ~154 bits, making brute force feasible
**Fix:** Now uses complete 2048-word BIP39 wordlist with proper cryptographic randomness

### 2. Static Salt for PIN Hashing

**Before:** `hashPin()` used static salt `'kaspay_salt_v1'`
**Risk:** Rainbow table attacks, all users with same PIN have same hash
**Fix:** Now generates per-user random salt stored alongside hash

### 3. Exposed Developer Endpoints

**Before:** `/api/dev/*` endpoints accessible in production
**Risk:** Attackers could generate wallets or switch networks
**Fix:** Dev endpoints now require explicit `X-Dev-Access` header and are rate limited

### 4. Transaction Endpoint Security

**Before:** `/api/transactions/send` had no auth middleware
**Risk:** Unauthenticated requests could potentially reach transaction logic
**Fix:** Added `authMiddleware` to transaction endpoints

---

## Security Controls Implemented

### Rate Limiting
- Session creation: 10/5min
- PIN/password verification: 10/5min with lockout
- Private key export: 10/5min
- Transaction sending: 5/min
- Wallet creation: 3/hour
- Dev endpoints: 3/hour

### Encryption
- Private keys encrypted with AES-256-GCM
- PBKDF2 with 100,000 iterations for key derivation
- Random 16-byte salt per encryption
- Random 12-byte IV per encryption

### Authentication
- PIN required for all sensitive operations
- App lock after inactivity
- Session management with device tracking
- Rate-limited authentication attempts

---

## Recommendations for Production

1. **Use Durable Objects or KV for rate limiting** - In-memory rate limits reset on worker restart
2. **Implement hardware wallet support** - For high-value users
3. **Add transaction signing delays** - Cool-down period for large transactions
4. **Consider MPC or threshold signatures** - For enterprise deployments
5. **Regular security audits** - Before major releases
6. **Bug bounty program** - After public launch

---

## Code Changes Made

See git diff for complete changes. Key files modified:
- `src/worker/services/kaspa-wallet.ts` - Fixed mnemonic generation, improved PIN hashing
- `src/worker/index.ts` - Added auth to transaction endpoints, secured dev routes
- `src/worker/middleware/rate-limiter.ts` - Added lockout tracking
