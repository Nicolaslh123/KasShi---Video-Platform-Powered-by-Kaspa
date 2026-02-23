# Todo

## Large Video Streaming Optimization v2 - COMPLETED
- ✅ Implemented Cloudflare Edge Caching using Cache API
- ✅ Video chunks are cached at Cloudflare's edge - subsequent requests bypass Worker entirely
- ✅ Reduced chunk size to 5MB for faster streaming and better caching granularity
- ✅ Cache key includes range header so each chunk is cached separately
- ✅ X-Cache header shows HIT/MISS for debugging
- ✅ Cache TTL set to 1 year (videos are immutable)
- ✅ After first viewing, videos stream directly from Cloudflare CDN (no Worker involved)

## Public ID Implementation - COMPLETED
- ✅ #1: Added public_id column to videos table
- ✅ #2: Updated all backend endpoints to use resolveVideoId() supporting both formats
- ✅ #3: Updated frontend to use publicId in video URLs (VideoCard, Watch, Upload, Channel, EditVideo)
- ✅ #4: Generated public_ids for all existing videos in database

## Public ID Progress (This Session)
- ✅ Added resolveVideoId() helper function supporting both public_id and numeric id
- ✅ Updated GET/PATCH/DELETE /api/kasshi/videos/:id
- ✅ Updated /api/kasshi/videos/:id/view
- ✅ Updated /api/kasshi/videos/:id/interact (POST and DELETE)
- ✅ Updated /api/kasshi/videos/:id/interaction (GET)
- ✅ Updated /api/kasshi/videos/:id/progress (POST and GET)
- ✅ Updated /api/kasshi/videos/:id/subtitles (GET and POST generate)
- ✅ Updated /api/kasshi/videos/:id/comments (GET and POST)
- ✅ Updated /api/kasshi/videos/:id/comment-interactions (GET)
- ✅ Updated /api/kasshi/videos/:id/report (POST)
- ✅ Updated /api/kasshi/videos/:id/access (GET)
- ✅ Generated public_ids for all 8 existing videos in database

## Completed
- ✅ Kastle wallet SDK integration (@forbole/kastle-sdk) - useKastle.ts rewritten with official SDK
- ✅ Kastle signMessage fix - now directly imports signMessage from SDK (was dynamically importing with error handling that masked failures)
- ✅ Kastle wallet authentication - same flow as KasWare (connect → sign challenge → create internal custody wallet)
- ✅ Kastle deposit/withdraw - WalletContext tracks provider ("kasware" | "kastle"), WalletModal uses correct sendKaspa() function based on provider, UI labels are provider-aware

## Remaining Issues
(All resolved this session)

## Fixed This Session
- ✅ #1: Fixed pending-balance endpoint to use `kasware-${unifiedUser.externalId}` (matching how micropay stores debits)
- ✅ #2: Fixed Channel.tsx profile edit to call `refetchChannel()` + `refreshPendingBalance()` instead of `window.location.reload()` (page reload was wiping out pending balance state)
- ✅ #3: Fixed seed phrase import not recognizing channels created via Kastle/KasWare - import-seed endpoint now checks both external and internal wallet addresses when looking for existing channels
- ✅ #4: Fixed frontend to store and use externalAddress from seed import - WalletModal now saves the original Kastle/KasWare address derived from seed, and WalletContext uses it for channel lookups

## Admin Video Management - COMPLETED
- ✅ Added GET /api/admin/videos endpoint with R2 file status verification
- ✅ Uses R2_BUCKET.head() to check if video file and thumbnail exist
- ✅ Returns isBroken flag for each video, brokenCount summary
- ✅ Added Videos tab to Admin.tsx with stats, filter, and video list
- ✅ Videos tab shows broken videos with red badge and file status
- ✅ Delete button for broken videos to clean up corrupted uploads
- ✅ Filter toggle: "Broken Only" vs "All Videos"

## Completed This Session
- ✅ Added Authorization headers to video like/unlike/dislike/undislike fetch calls in Watch.tsx
- ✅ Added Authorization headers to comment like/unlike/dislike/undislike fetch calls in Watch.tsx
- ✅ Added externalWallet.userId to all interaction body payloads for KasWare users
- ✅ Fixed Channel.tsx subscribe button 401 errors for KasWare/Kastle users - added Authorization headers to:
  - handleSubscribe (subscribe/unsubscribe)
  - handleToggleNotifications
  - handleAddLink
  - handleDeleteLink
  - handleEditChannel (PATCH channel)
  - executeJoinMembership (join membership tier)
  - handleCreateTier (create membership tier)

## Bug Fixes
- ✅ Fixed D1_TYPE_ERROR in /api/kasshi/feed/for-you - undefined query params (channelId, userId) now converted to null
- ✅ Fixed KasWare wallet session not persisting on page refresh (useEffect was clearing wallet state for non-Google users)
- ✅ Fixed 401 errors for KasWare users: Navbar notifications and Channel my-videos now pass Bearer auth token

## KasWare as Authentication (Internal Wallet) - COMPLETED
- ✅ #6: Removed SettlementBanner, simplified usePayment.ts
- ✅ #7: Removed /api/kasshi/external-batch-pay, external-pending-debits, external-settle endpoints
- ✅ Backend /api/wallet-auth/verify creates internal custody wallet for KasWare users
- ✅ Added /api/kasshi/internal-micropay endpoint for KasWare frictionless payments
- ✅ WalletContext uses internal wallet for KasWare users (micropay routes to internal-micropay)
- ✅ usePayment hook checks for internalAddress and uses micropay instead of KasWare direct

## Flow:
1. User clicks "Connect KasWare" → signs message to prove ownership
2. Backend verifies signature → creates internal custody wallet (same as Google users)
3. User deposits KAS from KasWare to their internal wallet
4. All micropayments use the internal wallet (frictionless, same as Google users)
5. User can withdraw earnings/balance back to KasWare anytime
