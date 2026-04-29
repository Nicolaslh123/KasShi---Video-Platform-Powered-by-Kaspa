# Todo

Membership notifications and panel tabs complete:
- ✓ Database migration: added related_handle column to notifications table
- ✓ Backend /join endpoint sends new_member notification with tier name and KAS earned
- ✓ Backend /join stores member channel handle in related_handle column
- ✓ GET /api/notifications returns relatedHandle in response
- ✓ GET /api/kasshi/notifications returns relatedHandle in response
- ✓ Dashboard.tsx Members tab shows all channel members with stats
- ✓ NotificationPanel.tsx has Activity and Members tabs
- ✓ Navbar.tsx notification dropdown has Activity and Members tabs with icons
- ✓ Clicking member notification navigates to member's channel via relatedHandle

USD-based membership tier pricing feature COMPLETE:
- ✓ #40: Create Tier modal has USD/KAS toggle, shows KAS equivalent for USD prices
- ✓ #41: Backend getKaspaPrice() fetches/caches CoinGecko exchange rate hourly
- ✓ #42: Tier cards show USD price below KAS when creator set USD pricing
- ✓ #43: SecurityVerificationModal shows USD alongside KAS for membership purchases

Membership video fix complete:
- ✓ Watch.tsx - members-only check runs before free video unlock
- ✓ Watch.tsx - CRITICAL FIX: Added useEffect to unlock video when hasMemberAccess becomes true
- ✓ Upload.tsx - price section hidden when members-only is enabled
- ✓ EditVideo.tsx - price section hidden when members-only is enabled, price resets on toggle
- ✓ Backend POST /api/kasshi/videos - enforces price_kas=0 when is_members_only=1
- ✓ Backend PATCH /api/kasshi/videos/:id - enforces price_kas=0 when isMembersOnly=true

Clip comment likes/replies feature complete:
- ✓ GET /api/kasshi/clips/:id/comments loads nested replies with parent_id structure
- ✓ POST /api/kasshi/clips/comments/:id/like endpoint for liking/unliking comments
- ✓ GET /api/kasshi/clips/comments/liked endpoint returns user's liked comment IDs
- ✓ POST /api/kasshi/clips/:id/comment accepts parentId for replies
- ✓ ClipsFeed.tsx fetches liked comment IDs when opening comments
- ✓ Reply indicator above comment input with cancel button
- ✓ Like buttons with orange highlight on comments and replies
- ✓ Reply button on each comment

Investment tracking system is complete:
- ✓ play_count_at_purchase stored when buying shares
- ✓ GET /api/kasshi/my-shares returns plays since investment and payout history
- ✓ Investor notifications when earning payouts from purchases
- ✓ MyInvestments.tsx shows plays since investment and expandable payout history

Shareholder investment system is complete:
- ✓ MyInvestments.tsx page showing share holdings with earnings
- ✓ GET /api/kasshi/my-shares returns earnings from shareholder_payouts
- ✓ Shareholder distribution in POST /api/music/purchase (splits revenue to track shareholders)
- ✓ "Buy Shares" via FractionBadge on fractionalized tracks in MusicArtist.tsx
- ✓ "View Earnings" link in MusicLibrary shares tab → /music/investments

KRC-20 fractionalization feature complete:
- ✓ Database tables (tracks fractionalization columns, track_shares, shareholder_payouts)
- ✓ FractionalizeModal with KasWare signing
- ✓ BuySharesModal for purchasing shares
- ✓ FractionBadge on track cards
- ✓ "My Shares" tab in MusicLibrary
- ✓ All backend endpoints (/fractionalize, /confirm, /buy-shares, /my-shares, /fractionalized, /payout-shares)
- ✓ New fractionalize folder with percentage-based modal and button components
- ✓ Audio hash protection (audio_hash column, delete block for fractionalized, upload guard)
- ✓ Legal disclaimers in FractionalizeModal and BuySharesModal
- ✓ Artist/Investor Agreement legal page at /legal/fractional-agreement
- ✓ Sitemap.xml updated with /video/ prefix for all video routes
