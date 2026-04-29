# KasShi

A decentralized video platform powered by Kaspa cryptocurrency. Creators earn KAS for views, likes, and engagement while viewers pay micro-amounts to watch content.

![KasShi Logo](https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/image.png_1510.png)

## Features

### For Viewers
- **Pay-per-view**: Watch videos for 0.11-0.25 KAS based on video length
- **Paid interactions**: Like (0.02 KAS), comment (0.02 KAS), tip creators
- **Multiple wallet support**: Connect with KasWare, Kastle, or use built-in custodial wallet
- **Subscription feed**: Follow channels and get personalized recommendations
- **Watch history**: Track viewed content across sessions

### For Creators
- **Earn from views**: 95% of view fees go directly to creators
- **Monetize engagement**: Earn from likes and comments on your content
- **Membership tiers**: Create paid membership levels with custom pricing for exclusive content
- **Channel customization**: Custom avatars, banners, and descriptions
- **Video management**: Upload, edit, and organize your content

### Platform Features
- **Merkle tree batching**: Small payments (<0.11 KAS) are batched to minimize on-chain transactions
- **KIP-9 compliant**: Respects Kaspa's storage mass limits for transactions
- **Optional security**: Add password protection and 2FA to your account
- **Admin dashboard**: Content moderation and payout management

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 (videos, thumbnails, avatars)
- **Blockchain**: Kaspa mainnet via api.kaspa.org REST API
- **Wallet SDKs**: KasWare, Kastle integration

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  React SPA with React Router, Context API for state         │
│  - WalletContext: Manages wallet connections & payments     │
│  - usePayment hook: Unified payment interface               │
│  - useKasShi hooks: Video, channel, feed data fetching      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                         │
│  Hono API server with middleware for auth, admin, etc.      │
│  - /api/kasshi/*: Video, channel, feed endpoints            │
│  - /api/kaspa/*: Wallet balance, UTXO, transactions         │
│  - /api/security/*: Password, 2FA management                │
└─────────────────────────────────────────────────────────────┘
                    │              │
                    ▼              ▼
┌──────────────────────┐  ┌──────────────────────┐
│   Cloudflare D1      │  │   Cloudflare R2      │
│   - users/wallets    │  │   - videos           │
│   - channels         │  │   - thumbnails       │
│   - videos           │  │   - avatars/banners  │
│   - comments/likes   │  │                      │
│   - subscriptions    │  │                      │
│   - pending payments │  │                      │
└──────────────────────┘  └──────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Kaspa Mainnet                             │
│  - api.kaspa.org for balance/UTXO queries                   │
│  - Custom transaction builder (Schnorr signatures)          │
│  - KIP-9 storage mass compliance (min 0.11 KAS outputs)     │
└─────────────────────────────────────────────────────────────┘
```

## Payment System

KasShi uses a hybrid payment system to handle Kaspa's KIP-9 storage mass requirements, which prevent outputs smaller than ~0.1 KAS from being sent on-chain.

### Direct On-Chain Payments (≥0.11 KAS)
Transactions at or above 0.11 KAS are sent directly on-chain:
- View fees (0.11-0.25 KAS based on duration)
- Subscribe to channel (0.5 KAS)
- Membership purchases (creator-defined pricing, minimum 0.1 KAS)
- Tips (minimum 0.1 KAS)
- Upload fees (5-15 KAS)
- Withdrawals (minimum 0.1 KAS)

### Batched Payments (<0.11 KAS)
Payments below 0.11 KAS cannot be sent on-chain due to KIP-9. Instead, they are:
1. Recorded in the `pending_micropayments` table with action type and recipient
2. Accumulated in `pending_balances` until they reach the 0.11 KAS threshold
3. Settled via a single on-chain transaction when threshold is met
4. Verified using Merkle tree proofs for transparency

**Batched actions include:**
- Likes (0.02 KAS to creator)
- Comments (0.02 KAS to creator)
- Comment likes (0.01 KAS to commenter)
- Dislikes (0.02 KAS to platform)
- Share (0.02 KAS to platform)
- Profile/video edits (0.0001 KAS to platform)
- Unsubscribe (0.0001 KAS to platform)

Users can manually trigger settlement in Settings when their pending balance reaches 0.11 KAS.

## Fee Structure

### View Fees (Duration-Based)
| Video Length | Cost | Distribution |
|--------------|------|--------------|
| Under 10 min | 0.11 KAS | 95% creator, 5% platform |
| 10-19 min | 0.15 KAS | 95% creator, 5% platform |
| 20-29 min | 0.20 KAS | 95% creator, 5% platform |
| 30+ min | 0.25 KAS | 95% creator, 5% platform |

### Engagement Fees
| Action | Cost | Recipient |
|--------|------|-----------|
| Like video | 0.02 KAS | Creator (batched) |
| Comment | 0.02 KAS | Creator (batched) |
| Comment like | 0.01 KAS | Commenter (batched) |
| Comment reply | 0.02 KAS | Parent commenter (batched) |
| Dislike video | 0.02 KAS | Platform (batched) |
| Comment dislike | 0.02 KAS | Platform (batched) |
| Share | 0.02 KAS | Platform (batched) |
| Report | 0.0001 KAS | Platform (batched) |
| Unlike/Undislike | 0.0001 KAS | Platform (batched) |
| Delete comment | 0.0001 KAS | Platform (batched) |

### Channel Fees
| Action | Cost | Recipient |
|--------|------|-----------|
| Subscribe | 0.5 KAS | 100% Creator (on-chain) |
| Unsubscribe | 0.0001 KAS | Platform (batched) |
| Edit channel profile | 0.0001 KAS | Platform (batched) |
| Create membership tier | 0.0001 KAS | Platform (batched) |
| Join membership | Tier price (min 0.1 KAS) | 100% Creator (on-chain) |
| Tip | Min 0.1 KAS | 100% Creator (on-chain) |

*Note: External wallet users (KasWare/Kastle) pay 0.1 KAS minimum for edit/create actions since batching isn't available for external wallets.*

### Upload Fees
| File Size | Cost | Recipient |
|-----------|------|-----------|
| Under 1 GB | 5 KAS | Platform |
| 1 GB - 5 GB | 10 KAS | Platform |
| Over 5 GB | 15 KAS | Platform |

### Video Edit Fee
| Action | Cost | Recipient |
|--------|------|-----------|
| Edit video metadata | 0.0001 KAS | Platform (batched) |

## Self-Hosting Guide

This app runs on Cloudflare's infrastructure. Here's how to deploy your own instance without Mocha.

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or higher
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (Cloudflare's deployment tool)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Google Cloud Console](https://console.cloud.google.com/) project for OAuth

### Step 1: Install Wrangler

```bash
npm install -g wrangler

# Authenticate with Cloudflare
wrangler login
```

### Step 2: Create Cloudflare Resources

```bash
# Create D1 database
wrangler d1 create kasshi-db

# Create R2 bucket for video/image storage
wrangler r2 bucket create kasshi-storage
```

Note the database ID from the D1 creation output - you'll need it for the config file.

### Step 3: Create wrangler.toml

Create a `wrangler.toml` file in the project root:

```toml
name = "kasshi"
main = "src/worker/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "kasshi-db"
database_id = "YOUR_DATABASE_ID_HERE"  # From step 2

# R2 Storage binding
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "kasshi-storage"

# Environment variables (secrets added separately)
[vars]
NODE_ENV = "production"
```

### Step 4: Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client IDs**
5. Choose **Web application**
6. Add authorized redirect URI: `https://YOUR_WORKER_URL/api/auth/google/callback`
7. Copy the Client ID and Client Secret

### Step 5: Configure Secrets

```bash
# Google OAuth credentials
wrangler secret put GOOGLE_CLIENT_ID
# Paste your client ID when prompted

wrangler secret put GOOGLE_CLIENT_SECRET
# Paste your client secret when prompted

# Admin user ID (you'll get this after first login)
# Leave empty initially, update after creating your account
wrangler secret put ADMIN_USER_ID
```

### Step 6: Run Database Migrations

```bash
# Apply all migrations to production database
wrangler d1 execute kasshi-db --remote --file=migrations/0001_initial.sql
wrangler d1 execute kasshi-db --remote --file=migrations/0002_add_columns.sql
# ... repeat for each migration file in order
```

Or run them all with a script:
```bash
for f in migrations/*.sql; do
  echo "Running $f..."
  wrangler d1 execute kasshi-db --remote --file="$f"
done
```

### Step 7: Build and Deploy

```bash
# Install dependencies
npm install

# Build the frontend
npm run build

# Deploy to Cloudflare Workers
wrangler deploy
```

Your app will be live at `https://kasshi.YOUR_SUBDOMAIN.workers.dev`

### Step 8: Set Admin User

1. Visit your deployed app and sign in with Google
2. Go to Settings and copy your User ID
3. Update the admin secret:
   ```bash
   wrangler secret put ADMIN_USER_ID
   # Paste your user ID
   ```
4. Redeploy: `wrangler deploy`

### Custom Domain (Optional)

1. In Cloudflare Dashboard, go to **Workers & Pages** → your worker
2. Click **Settings** → **Triggers** → **Custom Domains**
3. Add your domain (must be on Cloudflare DNS)

### Local Development

```bash
# Install dependencies
npm install

# Start dev server with local D1/R2
wrangler dev

# Or use Vite for frontend-only development
npm run dev
```

### Troubleshooting

**"D1_ERROR: no such table"**
- Run all migrations in order

**"R2 bucket not found"**
- Verify bucket name matches in wrangler.toml

**OAuth redirect mismatch**
- Update Google Console with your actual worker URL

**Videos not playing**
- Check R2 bucket has proper CORS settings (Cloudflare Dashboard → R2 → Bucket Settings)

---

## Quick Start (with Mocha)

If you prefer a simpler setup, use [Mocha](https://getmocha.com) for instant deployment with managed infrastructure.

### Prerequisites
- Node.js 18+
- Google OAuth credentials

### Environment Variables

Create these secrets in Settings → Secrets:

```
GOOGLE_CLIENT_ID       # Google OAuth client ID
GOOGLE_CLIENT_SECRET   # Google OAuth client secret
ADMIN_USER_ID          # User ID of the platform admin
```

### Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

### Database Migrations

Migrations run automatically on deployment.

Key tables:
- `user_wallets` - Google auth users with custodial wallets
- `external_wallet_users` - KasWare/Kastle connected users
- `channels` - Creator channels
- `videos` - Video metadata
- `comments`, `video_likes`, `video_dislikes` - Engagement
- `subscriptions`, `channel_memberships` - Relationships
- `pending_micropayments`, `pending_balances` - Batched payments

## Project Structure

```
src/
├── react-app/
│   ├── components/     # Reusable UI components
│   │   ├── ui/         # shadcn-style primitives
│   │   └── ...         # Feature components
│   ├── contexts/       # React contexts (Wallet, Auth)
│   ├── hooks/          # Custom hooks (useKasShi, usePayment)
│   ├── pages/          # Route components
│   └── lib/            # Utilities
├── worker/
│   ├── index.ts        # Main API worker
│   └── services/       # Kaspa wallet, transaction builder
└── migrations/         # D1 database migrations
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Links

- **Live App**: https://hbmeqpb6eoeiu.mocha.app
- **Kaspa**: https://kaspa.org
- **KasWare Wallet**: https://kasware.xyz
- **Kastle Wallet**: https://kastle.io

## Acknowledgments

- Built on [Kaspa](https://kaspa.org) - the fastest proof-of-work cryptocurrency
- Powered by [Mocha](https://getmocha.com) - AI-powered app development
- UI components based on [shadcn/ui](https://ui.shadcn.com)
