import { useState, useEffect, useCallback } from 'react';
import { Store, Palette, Clock, Gavel, Tag, TrendingUp, Filter, Search, Plus, Crown, ChevronDown, X, Loader2, CheckCircle, Package, Check, Bell, BarChart3, Eye, DollarSign, ShoppingBag, Star } from 'lucide-react';
import { useLocalizedNavigate } from '../components/LanguageRouter';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useWallet } from '../contexts/WalletContext';
import { useAuth } from '@getmocha/users-service/react';
import LocalizedLink from '../components/LocalizedLink';
import AnimatedBackground from '../components/AnimatedBackground';
import { WalletModal } from '../components/WalletModal';
import { KaspaIcon } from '../components/KasShiLogo';
import { useElectronTitleBar } from '../components/ElectronTitleBar';
import { usePayment } from '../hooks/usePayment';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface MarketplaceListing {
  id: number;
  listingId?: number; // For resale listings
  title: string;
  description: string;
  previewImageUrl: string;
  creatorName: string;
  creatorProfileId: number;
  creatorWalletAddress: string;
  sellerWalletAddress?: string; // For resale
  sellerName?: string;
  priceKas: string;
  isAuction: boolean;
  currentBid?: string;
  minBid?: string;
  auctionEndsAt?: string;
  quantityTotal: number | null; // null = unlimited
  quantitySold: number;
  hasParticles: boolean;
  isResale: boolean;
  originalCreatorName?: string;
  category?: string;
  tags?: string[];
  createdAt: string;
  isOwned?: boolean;
}

interface OwnedTheme {
  purchaseId: number;
  id: number;
  title: string;
  description: string;
  previewImageUrl: string;
  hasParticles: boolean;
  creatorName: string;
  purchasePriceKas: string;
  purchasedAt: string;
  isListed: boolean;
  listingId?: number;
  listingPrice?: string;
  isApplied?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function formatTimeRemaining(endDate: string): string {
  const now = new Date();
  const end = new Date(endDate);
  const diff = end.getTime() - now.getTime();
  
  if (diff <= 0) return "Ended";
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

function formatQuantity(total: number | null, sold: number): string {
  if (total === null) return `${sold} sold`;
  const remaining = total - sold;
  return `${remaining}/${total} left`;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function ListingCard({ listing, onClick, isOwned }: { listing: MarketplaceListing; onClick: () => void; isOwned: boolean }) {
  const isLimited = listing.quantityTotal !== null && listing.quantityTotal <= 10;
  const isAlmostGone = listing.quantityTotal !== null && (listing.quantityTotal - listing.quantitySold) <= 3;
  const isFree = parseFloat(listing.priceKas) === 0 && !listing.isAuction;
  
  return (
    <button
      onClick={onClick}
      className="group bg-black/40 border border-white/10 rounded-xl overflow-hidden hover:border-purple-500/50 transition-all duration-300 text-left w-full"
    >
      {/* Preview Image */}
      <div className="relative aspect-video overflow-hidden">
        <img
          src={listing.previewImageUrl}
          alt={listing.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        
        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {isOwned && (
            <span className="px-2 py-0.5 bg-green-500/90 text-white text-xs font-medium rounded-full flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Owned
            </span>
          )}
          {listing.isAuction && (
            <span className="px-2 py-0.5 bg-orange-500/90 text-white text-xs font-medium rounded-full flex items-center gap-1">
              <Gavel className="w-3 h-3" />
              Auction
            </span>
          )}
          {listing.isResale && (
            <span className="px-2 py-0.5 bg-purple-500/90 text-white text-xs font-medium rounded-full flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Resale
            </span>
          )}
          {isLimited && !listing.isAuction && (
            <span className="px-2 py-0.5 bg-yellow-500/90 text-black text-xs font-medium rounded-full flex items-center gap-1">
              <Crown className="w-3 h-3" />
              Limited
            </span>
          )}
          {listing.hasParticles && (
            <span className="px-2 py-0.5 bg-cyan-500/90 text-white text-xs font-medium rounded-full">
              ✨ Particles
            </span>
          )}
          {listing.category && (
            <span className="px-2 py-0.5 bg-indigo-500/90 text-white text-xs font-medium rounded-full capitalize">
              {listing.category}
            </span>
          )}
        </div>

        {/* Price Badge */}
        <div className="absolute bottom-2 right-2">
          {listing.isAuction ? (
            <div className="bg-black/80 backdrop-blur-sm rounded-lg px-3 py-1.5 text-right">
              <div className="text-xs text-gray-400">Current Bid</div>
              <div className="flex items-center gap-1 text-white font-bold">
                <KaspaIcon className="w-4 h-4" />
                {listing.currentBid || listing.minBid}
              </div>
            </div>
          ) : isFree ? (
            <span className="px-3 py-1.5 bg-blue-600/90 text-white text-sm font-bold rounded-lg">
              FREE
            </span>
          ) : (
            <div className="bg-black/80 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-1.5">
              <KaspaIcon className="w-4 h-4 text-[#70C7BA]" />
              <span className="text-white font-bold">{listing.priceKas}</span>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="text-white font-semibold truncate mb-1 group-hover:text-purple-300 transition-colors">
          {listing.title}
        </h3>
        <p className="text-gray-400 text-sm line-clamp-2 mb-3 h-10">
          {listing.description}
        </p>
        
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            by <span className="text-purple-400">{listing.isResale ? listing.creatorName : listing.creatorName}</span>
            {listing.isResale && listing.originalCreatorName && (
              <span className="text-gray-600"> (orig: {listing.originalCreatorName})</span>
            )}
          </span>
          
          {listing.isAuction && listing.auctionEndsAt ? (
            <span className="text-orange-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeRemaining(listing.auctionEndsAt)}
            </span>
          ) : (
            <span className={isAlmostGone ? "text-red-400" : "text-gray-500"}>
              {formatQuantity(listing.quantityTotal, listing.quantitySold)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

type FilterType = 'all' | 'fixed' | 'auction' | 'free' | 'resale';
type SortType = 'newest' | 'price-low' | 'price-high' | 'popular' | 'ending-soon';
type CategoryFilter = '' | 'dark' | 'bright' | 'neon' | 'nature' | 'minimal' | 'retro' | 'abstract' | 'seasonal';

export const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'dark', label: 'Dark & Moody' },
  { value: 'bright', label: 'Bright & Vibrant' },
  { value: 'neon', label: 'Neon & Cyberpunk' },
  { value: 'nature', label: 'Nature & Organic' },
  { value: 'minimal', label: 'Minimal & Clean' },
  { value: 'retro', label: 'Retro & Vintage' },
  { value: 'abstract', label: 'Abstract & Artistic' },
  { value: 'seasonal', label: 'Seasonal & Holiday' },
];

export default function Marketplace() {
  const { theme } = useMusicTheme();
  const { isConnected, externalWallet } = useWallet();
  const { user: mochaUser } = useAuth();
  const navigate = useLocalizedNavigate();
  const { titleBarPadding } = useElectronTitleBar();
  
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('');
  const [sortType, setSortType] = useState<SortType>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownedThemeIds, setOwnedThemeIds] = useState<Set<number>>(new Set());
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [ownedThemes, setOwnedThemes] = useState<OwnedTheme[]>([]);
  const [showMyThemes, setShowMyThemes] = useState(false);
  const [listingTheme, setListingTheme] = useState<OwnedTheme | null>(null);
  const [listingPrice, setListingPrice] = useState('');
  const [listingIsAuction, setListingIsAuction] = useState(false);
  const [listingMinBid, setListingMinBid] = useState('');
  const [listingDuration, setListingDuration] = useState('24');
  const [creatingListing, setCreatingListing] = useState(false);
  
  // Bid modal state
  const [bidModalListing, setBidModalListing] = useState<MarketplaceListing | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [placingBid, setPlacingBid] = useState(false);
  const [bidHistory, setBidHistory] = useState<Array<{id: number; bidAmountKas: string; bidderName: string; createdAt: string}>>([]);
  const [cancellingListing, setCancellingListing] = useState<number | null>(null);
  const [_appliedPurchaseId, setAppliedPurchaseId] = useState<number | null>(null);
  const [applyingTheme, setApplyingTheme] = useState<number | null>(null);

  // Notification state
  const [notifications, setNotifications] = useState<Array<{id: number; type: string; title: string; message: string; isRead: boolean; createdAt: string}>>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pendingRefunds, setPendingRefunds] = useState<Array<{bidId: number; amountKas: string; themeName: string; auctionEnded: boolean}>>([]);

  // Seller analytics state
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analytics, setAnalytics] = useState<{
    themesCreated: number;
    totalViews: number;
    totalSales: number;
    totalEarnings: string;
    originalSales: number;
    originalEarnings: string;
    resaleSales: number;
    resaleEarnings: string;
    viewsByDay: Array<{date: string; views: number}>;
    topThemes: Array<{id: number; name: string; previewImageUrl: string; priceKas: string; quantitySold: number; viewCount: number}>;
  } | null>(null);

  // Featured themes state
  const [featuredThemes, setFeaturedThemes] = useState<MarketplaceListing[]>([]);

  const isLoggedIn = isConnected || !!mochaUser || !!externalWallet;
  const { pay } = usePayment();

  // Fetch listings from API (primary + resale)
  const fetchListings = useCallback(async () => {
    try {
      setLoading(true);
      const authToken = externalWallet?.authToken;
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      // Fetch primary themes, resale listings, and featured in parallel
      const [primaryRes, resaleRes, featuredRes] = await Promise.all([
        fetch('/api/marketplace/themes', { headers, credentials: 'include' }),
        fetch('/api/marketplace/listings', { headers, credentials: 'include' }),
        fetch('/api/marketplace/featured', { headers, credentials: 'include' })
      ]);
      
      const primaryData = primaryRes.ok ? await primaryRes.json() : { themes: [] };
      const resaleData = resaleRes.ok ? await resaleRes.json() : { listings: [] };
      const featuredData = featuredRes.ok ? await featuredRes.json() : { themes: [] };
      
      const primaryListings: MarketplaceListing[] = (primaryData.themes || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        previewImageUrl: t.previewImageUrl,
        creatorName: t.creatorName || 'Anonymous',
        creatorProfileId: t.creatorProfileId,
        creatorWalletAddress: t.creatorWalletAddress,
        priceKas: t.priceKas || '0',
        isAuction: false,
        quantityTotal: t.quantityTotal,
        quantitySold: t.quantitySold || 0,
        hasParticles: t.hasParticles,
        isResale: false,
        createdAt: t.createdAt
      }));
      
      const resaleListings: MarketplaceListing[] = (resaleData.listings || []).map((l: any) => ({
        id: l.id,
        listingId: l.listingId,
        title: l.title,
        description: l.description,
        previewImageUrl: l.previewImageUrl,
        creatorName: l.creatorName || 'Anonymous',
        creatorProfileId: l.creatorProfileId,
        creatorWalletAddress: l.originalCreatorWallet,
        sellerWalletAddress: l.sellerWalletAddress,
        sellerName: l.sellerName || 'Anonymous',
        priceKas: l.priceKas || '0',
        isAuction: l.isAuction,
        auctionMinBidKas: l.auctionMinBidKas,
        auctionEndsAt: l.auctionEndsAt,
        currentBid: l.currentBidKas,
        quantityTotal: 1,
        quantitySold: 0,
        hasParticles: l.hasParticles,
        isResale: true,
        originalCreatorName: l.creatorName,
        createdAt: l.createdAt
      }));
      
      setListings([...primaryListings, ...resaleListings]);
      
      // Set featured themes
      const featured: MarketplaceListing[] = (featuredData.themes || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        previewImageUrl: t.previewImageUrl,
        creatorName: t.creatorName || 'Anonymous',
        creatorProfileId: t.creatorProfileId,
        creatorWalletAddress: t.creatorWalletAddress,
        priceKas: t.priceKas || '0',
        isAuction: false,
        quantityTotal: t.quantityTotal,
        quantitySold: t.quantitySold || 0,
        hasParticles: t.hasParticles,
        isResale: false,
        category: t.category,
        tags: t.tags,
        createdAt: t.createdAt
      }));
      setFeaturedThemes(featured);
    } catch (error) {
      console.error('Failed to fetch marketplace listings:', error);
    } finally {
      setLoading(false);
    }
  }, [externalWallet?.authToken]);

  // Fetch owned themes and my active listings
  const fetchOwnedThemes = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const authToken = externalWallet?.authToken;
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      // Fetch owned themes, my listings, and applied theme in parallel
      const [themesRes, listingsRes, appliedRes] = await Promise.all([
        fetch('/api/marketplace/my-themes', { headers, credentials: 'include' }),
        fetch('/api/marketplace/my-listings', { headers, credentials: 'include' }),
        fetch('/api/marketplace/applied-theme', { headers, credentials: 'include' })
      ]);
      
      const themesData = themesRes.ok ? await themesRes.json() : { themes: [] };
      const listingsData = listingsRes.ok ? await listingsRes.json() : { listings: [] };
      const appliedData = appliedRes.ok ? await appliedRes.json() : { appliedTheme: null };
      
      // Track applied purchase ID
      const currentAppliedPurchaseId = appliedData.appliedTheme?.purchaseId || null;
      setAppliedPurchaseId(currentAppliedPurchaseId);
      
      // Build set of listed purchase IDs
      const listedPurchaseIds = new Map<number, { listingId: number, price: string }>();
      (listingsData.listings || []).forEach((l: any) => {
        // We need to match by theme ID since my-listings doesn't return purchaseId
        listedPurchaseIds.set(l.themeId, { listingId: l.listingId, price: l.priceKas });
      });
      
      const ids = new Set<number>((themesData.themes || []).map((t: any) => t.id));
      setOwnedThemeIds(ids);
      
      // Map owned themes with listing and applied status
      const owned: OwnedTheme[] = (themesData.themes || []).map((t: any) => {
        const listingInfo = listedPurchaseIds.get(t.id);
        return {
          purchaseId: t.purchaseId,
          id: t.id,
          title: t.title,
          description: t.description,
          previewImageUrl: t.previewImageUrl,
          hasParticles: t.hasParticles,
          creatorName: t.creatorName || 'Anonymous',
          purchasePriceKas: t.purchasePriceKas,
          purchasedAt: t.purchasedAt,
          isListed: !!listingInfo,
          listingId: listingInfo?.listingId,
          listingPrice: listingInfo?.price,
          isApplied: t.purchaseId === currentAppliedPurchaseId
        };
      });
      setOwnedThemes(owned);
    } catch (error) {
      console.error('Failed to fetch owned themes:', error);
    }
  }, [isLoggedIn, externalWallet?.authToken]);

  // Fetch seller analytics
  const fetchAnalytics = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      setAnalyticsLoading(true);
      const authToken = externalWallet?.authToken;
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const res = await fetch('/api/marketplace/seller/analytics', { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [isLoggedIn, externalWallet?.authToken]);

  // Track theme view when opening detail modal
  const trackThemeView = useCallback(async (themeId: number) => {
    try {
      const authToken = externalWallet?.authToken;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      await fetch(`/api/marketplace/themes/${themeId}/view`, { 
        method: 'POST', 
        headers, 
        credentials: 'include' 
      });
    } catch (error) {
      // Silently fail - view tracking is not critical
    }
  }, [externalWallet?.authToken]);

  // Open listing detail and track view
  const openListingDetail = useCallback((listing: MarketplaceListing) => {
    setSelectedListing(listing);
    trackThemeView(listing.id);
  }, [trackThemeView]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    fetchOwnedThemes();
  }, [fetchOwnedThemes]);

  // Fetch analytics when panel opens
  useEffect(() => {
    if (showAnalytics && !analytics) {
      fetchAnalytics();
    }
  }, [showAnalytics, analytics, fetchAnalytics]);

  // Process expired auctions on load
  useEffect(() => {
    fetch('/api/marketplace/auctions/process-expired')
      .catch(err => console.error('Failed to process expired auctions:', err));
  }, []);

  // Fetch notifications
  useEffect(() => {
    if (!isLoggedIn) return;
    const authToken = externalWallet?.authToken;
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    
    Promise.all([
      fetch('/api/marketplace/notifications', { headers, credentials: 'include' }),
      fetch('/api/marketplace/pending-refunds', { headers, credentials: 'include' })
    ]).then(async ([notifRes, refundRes]) => {
      if (notifRes.ok) {
        const data = await notifRes.json();
        setNotifications(data.notifications || []);
      }
      if (refundRes.ok) {
        const data = await refundRes.json();
        setPendingRefunds(data.refunds || []);
      }
    }).catch(err => console.error('Failed to fetch notifications:', err));
  }, [isLoggedIn, externalWallet?.authToken]);

  // Handle purchase (primary or resale)
  const handlePurchase = async (listing: MarketplaceListing) => {
    if (!isLoggedIn) {
      setIsWalletModalOpen(true);
      return;
    }
    
    if (ownedThemeIds.has(listing.id) && !listing.isResale) {
      alert('You already own this theme!');
      return;
    }
    
    setPurchasing(listing.isResale ? (listing.listingId || listing.id) : listing.id);
    try {
      const price = parseFloat(listing.priceKas);
      let transactionId: string | null = null;
      
      // For paid themes, process payment first
      if (price > 0) {
        // For resale, pay the seller; for primary, pay the creator
        const recipient = listing.isResale ? listing.sellerWalletAddress! : listing.creatorWalletAddress;
        const result = await pay(recipient, price, { paymentType: 'music_purchase' });
        if (!result?.transactionId) {
          throw new Error('Payment failed');
        }
        transactionId = result.transactionId;
      }
      
      // Record the purchase
      const authToken = externalWallet?.authToken;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      // Different endpoint for resale vs primary
      const endpoint = listing.isResale 
        ? `/api/marketplace/listings/${listing.listingId}/purchase`
        : `/api/marketplace/themes/${listing.id}/purchase`;
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ transactionId })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Purchase failed');
      }
      
      // Update owned themes and listings
      setOwnedThemeIds(prev => new Set([...prev, listing.id]));
      if (listing.isResale) {
        // Remove resale listing from view
        setListings(prev => prev.filter(l => !(l.isResale && l.listingId === listing.listingId)));
      } else {
        setListings(prev => prev.map(l => 
          l.id === listing.id ? { ...l, quantitySold: l.quantitySold + 1 } : l
        ));
      }
      setSelectedListing(null);
      fetchOwnedThemes(); // Refresh owned themes
      alert('Theme purchased successfully!');
    } catch (error: any) {
      console.error('Purchase failed:', error);
      alert(error.message || 'Failed to purchase theme');
    } finally {
      setPurchasing(null);
    }
  };

  // Create a resale listing (fixed price or auction)
  const handleCreateListing = async () => {
    if (!listingTheme) return;
    
    if (listingIsAuction) {
      const minBid = parseFloat(listingMinBid);
      if (isNaN(minBid) || minBid < 0.11) {
        alert('Minimum bid must be at least 0.11 KAS');
        return;
      }
      const duration = parseInt(listingDuration);
      if (isNaN(duration) || duration < 1 || duration > 168) {
        alert('Duration must be between 1 and 168 hours');
        return;
      }
    } else {
      if (!listingPrice) return;
      const price = parseFloat(listingPrice);
      if (isNaN(price) || (price !== 0 && price < 0.11)) {
        alert('Price must be 0 (free) or at least 0.11 KAS');
        return;
      }
    }

    try {
      setCreatingListing(true);
      const authToken = externalWallet?.authToken;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const res = await fetch('/api/marketplace/listings', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          purchaseId: listingTheme.purchaseId,
          priceKas: listingIsAuction ? undefined : listingPrice,
          isAuction: listingIsAuction,
          auctionMinBidKas: listingIsAuction ? listingMinBid : undefined,
          auctionDurationHours: listingIsAuction ? listingDuration : undefined
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create listing');
      }

      setListingTheme(null);
      setListingPrice('');
      setListingIsAuction(false);
      setListingMinBid('');
      setListingDuration('24');
      fetchListings();
      fetchOwnedThemes();
    } catch (error: any) {
      console.error('Failed to create listing:', error);
      alert(error.message || 'Failed to create listing');
    } finally {
      setCreatingListing(false);
    }
  };

  // Fetch bid history for an auction
  const fetchBidHistory = async (listingId: number) => {
    try {
      const res = await fetch(`/api/marketplace/listings/${listingId}/bids`);
      if (res.ok) {
        const data = await res.json();
        setBidHistory(data.bids || []);
      }
    } catch (error) {
      console.error('Failed to fetch bid history:', error);
    }
  };

  // Mark notification as read
  const handleMarkNotificationRead = async (notificationId: number) => {
    try {
      const authToken = externalWallet?.authToken;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      await fetch(`/api/marketplace/notifications/${notificationId}/read`, {
        method: 'POST',
        headers,
        credentials: 'include'
      });
      setNotifications(prev => prev.map(n => 
        n.id === notificationId ? { ...n, isRead: true } : n
      ));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  // Claim a refund for an outbid auction
  const [claimingRefund, setClaimingRefund] = useState<number | null>(null);
  const handleClaimRefund = async (bidId: number, amountKas: string) => {
    try {
      setClaimingRefund(bidId);
      const authToken = externalWallet?.authToken;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch(`/api/marketplace/refunds/${bidId}/claim`, {
        method: 'POST',
        headers,
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to claim refund');
      }
      // Remove from pending refunds
      setPendingRefunds(prev => prev.filter(r => r.bidId !== bidId));
      alert(`Refund of ${amountKas} KAS claimed successfully!`);
    } catch (error: any) {
      console.error('Failed to claim refund:', error);
      alert(error.message || 'Failed to claim refund');
    } finally {
      setClaimingRefund(null);
    }
  };

  // Open bid modal
  const openBidModal = (listing: MarketplaceListing) => {
    setBidModalListing(listing);
    const currentBid = parseFloat(listing.currentBid || '0');
    const minBid = parseFloat(listing.minBid || '0');
    const suggestedBid = currentBid > 0 ? (currentBid + 0.1).toFixed(2) : minBid.toFixed(2);
    setBidAmount(suggestedBid);
    fetchBidHistory(listing.listingId || listing.id);
  };

  // Place a bid on an auction
  const handlePlaceBid = async () => {
    if (!bidModalListing || !bidAmount) return;
    
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount < 0.11) {
      alert('Bid must be at least 0.11 KAS');
      return;
    }

    const currentBid = parseFloat(bidModalListing.currentBid || '0');
    const minBid = parseFloat(bidModalListing.minBid || '0');
    const minimumRequired = currentBid > 0 ? currentBid + 0.1 : minBid;
    
    if (amount < minimumRequired) {
      alert(`Bid must be at least ${minimumRequired.toFixed(2)} KAS`);
      return;
    }

    try {
      setPlacingBid(true);
      
      // Get seller wallet for payment
      const sellerWallet = bidModalListing.sellerWalletAddress || bidModalListing.creatorWalletAddress;
      if (!sellerWallet) {
        throw new Error('Seller wallet not found');
      }

      // Make the payment
      const txResult = await pay(sellerWallet, amount, { paymentType: 'auction_bid' });

      if (!txResult.transactionId) {
        throw new Error('Payment failed');
      }

      // Record the bid
      const authToken = externalWallet?.authToken;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const listingId = bidModalListing.listingId || bidModalListing.id;
      const res = await fetch(`/api/marketplace/listings/${listingId}/bid`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          bidAmountKas: bidAmount,
          transactionId: txResult.transactionId
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to record bid');
      }

      setBidModalListing(null);
      setBidAmount('');
      setBidHistory([]);
      fetchListings();
      setSelectedListing(null);
    } catch (error: any) {
      console.error('Failed to place bid:', error);
      alert(error.message || 'Failed to place bid');
    } finally {
      setPlacingBid(false);
    }
  };

  // Cancel a resale listing
  const handleCancelListing = async (theme: OwnedTheme) => {
    if (!theme.listingId) return;
    
    try {
      setCancellingListing(theme.listingId);
      const authToken = externalWallet?.authToken;
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const res = await fetch(`/api/marketplace/listings/${theme.listingId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to cancel listing');
      }

      fetchListings();
      fetchOwnedThemes();
    } catch (error: any) {
      console.error('Failed to cancel listing:', error);
      alert(error.message || 'Failed to cancel listing');
    } finally {
      setCancellingListing(null);
    }
  };

  // Apply a theme to music profile
  const handleApplyTheme = async (theme: OwnedTheme) => {
    try {
      setApplyingTheme(theme.purchaseId);
      const authToken = externalWallet?.authToken;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const res = await fetch(`/api/marketplace/themes/${theme.purchaseId}/apply`, {
        method: 'POST',
        headers,
        credentials: 'include'
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to apply theme');
      }

      setAppliedPurchaseId(theme.purchaseId);
      setOwnedThemes(prev => prev.map(t => ({
        ...t,
        isApplied: t.purchaseId === theme.purchaseId
      })));
    } catch (error: any) {
      console.error('Failed to apply theme:', error);
      alert(error.message || 'Failed to apply theme');
    } finally {
      setApplyingTheme(null);
    }
  };

  // Remove applied theme
  const handleUnapplyTheme = async () => {
    try {
      setApplyingTheme(-1); // Use -1 to indicate unapply in progress
      const authToken = externalWallet?.authToken;
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const res = await fetch('/api/marketplace/themes/unapply', {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to remove theme');
      }

      setAppliedPurchaseId(null);
      setOwnedThemes(prev => prev.map(t => ({
        ...t,
        isApplied: false
      })));
    } catch (error: any) {
      console.error('Failed to remove theme:', error);
      alert(error.message || 'Failed to remove theme');
    } finally {
      setApplyingTheme(null);
    }
  };

  // Filter and sort listings
  const filteredListings = listings
    .filter(l => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesTags = l.tags?.some((tag: string) => tag.toLowerCase().includes(q));
        if (!l.title.toLowerCase().includes(q) && !l.description?.toLowerCase().includes(q) && !l.creatorName.toLowerCase().includes(q) && !matchesTags) {
          return false;
        }
      }
      // Category filter
      if (categoryFilter && l.category !== categoryFilter) {
        return false;
      }
      switch (filterType) {
        case 'fixed': return !l.isAuction && parseFloat(l.priceKas) > 0;
        case 'auction': return l.isAuction;
        case 'free': return !l.isAuction && parseFloat(l.priceKas) === 0;
        case 'resale': return l.isResale;
        default: return true;
      }
    })
    .sort((a, b) => {
      switch (sortType) {
        case 'price-low':
          return parseFloat(a.priceKas || a.currentBid || '0') - parseFloat(b.priceKas || b.currentBid || '0');
        case 'price-high':
          return parseFloat(b.priceKas || b.currentBid || '0') - parseFloat(a.priceKas || a.currentBid || '0');
        case 'popular':
          return b.quantitySold - a.quantitySold;
        case 'ending-soon':
          if (a.isAuction && b.isAuction && a.auctionEndsAt && b.auctionEndsAt) {
            return new Date(a.auctionEndsAt).getTime() - new Date(b.auctionEndsAt).getTime();
          }
          return a.isAuction ? -1 : 1;
        default: // newest
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  return (
    <div className={`min-h-screen ${titleBarPadding}`}>
      <AnimatedBackground
        themeId={theme.id}
        accent={theme.accent}
      />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-[2000px] mx-auto px-4">
          <div className="flex items-center h-16 gap-4">
            {/* Logo & Nav */}
            <LocalizedLink to="/music" className="flex items-center gap-2 text-white font-bold text-lg shrink-0">
              <Palette className="w-6 h-6 text-purple-400" />
              <span className="hidden sm:inline">Theme Market</span>
            </LocalizedLink>

            {/* Search */}
            <div className="flex-1 max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search themes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-full text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {isLoggedIn && (
                <>
                  <button
                    onClick={() => setShowMyThemes(!showMyThemes)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-colors ${
                      showMyThemes 
                        ? 'bg-green-600 text-white' 
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    <span className="hidden sm:inline">My Themes</span>
                    {ownedThemes.length > 0 && (
                      <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-xs">{ownedThemes.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className={`relative flex items-center gap-2 px-3 py-2 rounded-full font-medium transition-colors ${
                      showNotifications 
                        ? 'bg-orange-600 text-white' 
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    <Bell className="w-4 h-4" />
                    {(notifications.filter(n => !n.isRead).length + pendingRefunds.length) > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                        {notifications.filter(n => !n.isRead).length + pendingRefunds.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setShowAnalytics(!showAnalytics)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-full font-medium transition-colors ${
                      showAnalytics 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span className="hidden sm:inline">Analytics</span>
                  </button>
                  <button
                    onClick={() => navigate('/music/marketplace/upload')}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-full font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Sell Theme</span>
                  </button>
                </>
              )}
              
              {!isLoggedIn && (
                <button
                  onClick={() => setIsWalletModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full font-medium transition-colors"
                >
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 pt-24 pb-32 px-4">
        <div className="max-w-[1600px] mx-auto">
          {/* Page Title & Stats */}
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              Theme Marketplace
            </h1>
            <p className="text-gray-400 max-w-2xl">
              Discover unique themes created by artists. Buy, sell, and trade exclusive visual customizations for your music profile.
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="text-2xl font-bold text-white">{listings.length}</div>
              <div className="text-sm text-gray-400">Total Listings</div>
            </div>
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="text-2xl font-bold text-orange-400">{listings.filter(l => l.isAuction).length}</div>
              <div className="text-sm text-gray-400">Active Auctions</div>
            </div>
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="text-2xl font-bold text-purple-400">{listings.filter(l => l.isResale).length}</div>
              <div className="text-sm text-gray-400">Resale Listings</div>
            </div>
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="text-2xl font-bold text-green-400">{listings.filter(l => parseFloat(l.priceKas) === 0 && !l.isAuction).length}</div>
              <div className="text-sm text-gray-400">Free Themes</div>
            </div>
          </div>

          {/* Featured Themes */}
          {featuredThemes.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                <h2 className="text-xl font-bold text-white">Featured Themes</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {featuredThemes.map((listing) => (
                  <div
                    key={`featured-${listing.id}`}
                    onClick={() => openListingDetail(listing)}
                    className="group cursor-pointer"
                  >
                    <div className="relative aspect-square rounded-xl overflow-hidden border-2 border-yellow-400/50 hover:border-yellow-400 transition-colors">
                      <img
                        src={listing.previewImageUrl || '/placeholder-theme.png'}
                        alt={listing.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-0.5 bg-yellow-400/90 text-black text-xs font-bold rounded-full flex items-center gap-1">
                          <Star className="w-3 h-3 fill-current" />
                          Featured
                        </span>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <h3 className="font-semibold text-white text-sm truncate">{listing.title}</h3>
                        <p className="text-yellow-400 text-xs font-medium">
                          {parseFloat(listing.priceKas) === 0 ? 'Free' : `${listing.priceKas} KAS`}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Filter Buttons */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {[
                { value: 'all', label: 'All' },
                { value: 'fixed', label: 'Fixed Price' },
                { value: 'auction', label: 'Auctions' },
                { value: 'free', label: 'Free' },
                { value: 'resale', label: 'Resale' },
              ].map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setFilterType(filter.value as FilterType)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    filterType === filter.value
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Category Dropdown */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-full text-sm transition-colors border-none outline-none cursor-pointer"
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat.value} value={cat.value} className="bg-gray-900 text-gray-300">
                  {cat.label}
                </option>
              ))}
            </select>

            {/* Sort Dropdown */}
            <div className="relative ml-auto">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-full text-sm transition-colors"
              >
                <Filter className="w-4 h-4" />
                Sort
                <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
              
              {showFilters && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900 border border-white/10 rounded-xl overflow-hidden shadow-xl z-50">
                  {[
                    { value: 'newest', label: 'Newest First' },
                    { value: 'price-low', label: 'Price: Low to High' },
                    { value: 'price-high', label: 'Price: High to Low' },
                    { value: 'popular', label: 'Most Popular' },
                    { value: 'ending-soon', label: 'Ending Soon' },
                  ].map((sort) => (
                    <button
                      key={sort.value}
                      onClick={() => {
                        setSortType(sort.value as SortType);
                        setShowFilters(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                        sortType === sort.value
                          ? 'bg-purple-600/30 text-purple-300'
                          : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      {sort.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* My Themes Panel */}
          {showMyThemes && (
            <div className="mb-8 bg-black/40 border border-green-500/30 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-green-400" />
                  My Themes ({ownedThemes.length})
                </h2>
                <button
                  onClick={() => setShowMyThemes(false)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {ownedThemes.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>You don't own any themes yet.</p>
                  <p className="text-sm mt-1">Browse the marketplace to find themes you like!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {ownedThemes.map((theme) => (
                    <div
                      key={theme.purchaseId}
                      className="bg-black/40 border border-white/10 rounded-xl overflow-hidden"
                    >
                      <div className="aspect-video relative">
                        <img
                          src={theme.previewImageUrl}
                          alt={theme.title}
                          className="w-full h-full object-cover"
                        />
                        {theme.hasParticles && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 bg-cyan-500/80 text-white text-xs rounded-full">
                            ✨ Particles
                          </span>
                        )}
                        {theme.isApplied && (
                          <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-green-500/80 text-white text-xs rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3" /> Applied
                          </span>
                        )}
                        {theme.isListed && (
                          <span className="absolute top-2 right-2 px-2 py-0.5 bg-orange-500/80 text-white text-xs rounded-full">
                            Listed
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <h3 className="font-semibold text-white truncate">{theme.title}</h3>
                        <p className="text-xs text-gray-400 mb-3">by {theme.creatorName}</p>
                        
                        {theme.isListed ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-400">Listed at:</span>
                              <span className="text-white font-medium flex items-center gap-1">
                                <KaspaIcon className="w-4 h-4" />
                                {theme.listingPrice}
                              </span>
                            </div>
                            <button
                              onClick={() => handleCancelListing(theme)}
                              disabled={cancellingListing === theme.listingId}
                              className="w-full px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                            >
                              {cancellingListing === theme.listingId ? (
                                <span className="flex items-center justify-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Cancelling...
                                </span>
                              ) : (
                                'Cancel Listing'
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {/* Apply/Unapply button */}
                            {theme.isApplied ? (
                              <button
                                onClick={handleUnapplyTheme}
                                disabled={applyingTheme !== null}
                                className="w-full px-3 py-2 bg-green-600/20 hover:bg-red-600/20 border border-green-500/50 hover:border-red-500/50 text-green-400 hover:text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                              >
                                {applyingTheme === -1 ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Removing...
                                  </span>
                                ) : (
                                  <span className="flex items-center justify-center gap-2">
                                    <Check className="w-4 h-4" />
                                    Applied - Click to Remove
                                  </span>
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleApplyTheme(theme)}
                                disabled={applyingTheme !== null}
                                className="w-full px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/50 text-cyan-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                              >
                                {applyingTheme === theme.purchaseId ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Applying...
                                  </span>
                                ) : (
                                  <span className="flex items-center justify-center gap-2">
                                    <Palette className="w-4 h-4" />
                                    Apply Theme
                                  </span>
                                )}
                              </button>
                            )}
                            {/* List for sale button */}
                            <button
                              onClick={() => {
                                setListingTheme(theme);
                                setListingPrice('');
                              }}
                              className="w-full px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/50 text-purple-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                            >
                              <TrendingUp className="w-4 h-4" />
                              List for Sale
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notifications Panel */}
          {showNotifications && (
            <div className="mb-8 bg-black/40 border border-orange-500/30 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-orange-400" />
                  Notifications
                </h2>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Pending Refunds */}
              {pendingRefunds.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-orange-400 mb-3 uppercase tracking-wide">Pending Refunds</h3>
                  <div className="space-y-2">
                    {pendingRefunds.map((refund) => (
                      <div key={refund.bidId} className="flex items-center justify-between bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                        <div>
                          <p className="text-white font-medium">{refund.themeName}</p>
                          <p className="text-sm text-gray-400">
                            {refund.auctionEnded ? 'Auction ended - you were outbid' : 'You were outbid'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-orange-400 font-semibold flex items-center gap-1">
                            <KaspaIcon className="w-4 h-4" />
                            {refund.amountKas}
                          </span>
                          <button
                            onClick={() => handleClaimRefund(refund.bidId, refund.amountKas)}
                            disabled={claimingRefund === refund.bidId}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            {claimingRefund === refund.bidId ? (
                              <span className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Claiming...
                              </span>
                            ) : (
                              'Claim Refund'
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Notifications List */}
              {notifications.length === 0 && pendingRefunds.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Bell className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No notifications yet.</p>
                </div>
              ) : notifications.length > 0 && (
                <div className="space-y-2">
                  {notifications.map((notif) => (
                    <div 
                      key={notif.id} 
                      className={`flex items-start justify-between rounded-lg p-4 transition-colors ${
                        notif.isRead 
                          ? 'bg-white/5 border border-white/5' 
                          : 'bg-purple-500/10 border border-purple-500/30'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-sm font-semibold ${notif.isRead ? 'text-gray-300' : 'text-purple-400'}`}>
                            {notif.title}
                          </span>
                          {!notif.isRead && (
                            <span className="w-2 h-2 rounded-full bg-purple-500" />
                          )}
                        </div>
                        <p className="text-sm text-gray-400">{notif.message}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(notif.createdAt).toLocaleDateString()} at {new Date(notif.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      {!notif.isRead && (
                        <button
                          onClick={() => handleMarkNotificationRead(notif.id)}
                          className="text-xs text-purple-400 hover:text-purple-300 transition-colors ml-4"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Analytics Panel */}
          {showAnalytics && (
            <div className="mb-8 bg-black/40 border border-blue-500/30 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                  Seller Analytics
                </h2>
                <button
                  onClick={() => setShowAnalytics(false)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {analyticsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              ) : !analytics ? (
                <div className="text-center py-8 text-gray-400">
                  <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No analytics data available yet.</p>
                </div>
              ) : (
                <>
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                        <Palette className="w-4 h-4" />
                        Themes Created
                      </div>
                      <p className="text-2xl font-bold text-white">{analytics.themesCreated}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                        <Eye className="w-4 h-4" />
                        Total Views
                      </div>
                      <p className="text-2xl font-bold text-white">{analytics.totalViews}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                        <ShoppingBag className="w-4 h-4" />
                        Total Sales
                      </div>
                      <p className="text-2xl font-bold text-white">{analytics.totalSales}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                        <DollarSign className="w-4 h-4" />
                        Total Earnings
                      </div>
                      <p className="text-2xl font-bold text-green-400">{analytics.totalEarnings} KAS</p>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <h3 className="text-sm font-semibold text-blue-400 mb-3 uppercase tracking-wide">Original Sales</h3>
                      <div className="flex items-center justify-between text-white">
                        <span>{analytics.originalSales} sales</span>
                        <span className="text-green-400">{analytics.originalEarnings} KAS</span>
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <h3 className="text-sm font-semibold text-purple-400 mb-3 uppercase tracking-wide">Resale Royalties</h3>
                      <div className="flex items-center justify-between text-white">
                        <span>{analytics.resaleSales} resales</span>
                        <span className="text-green-400">{analytics.resaleEarnings} KAS</span>
                      </div>
                    </div>
                  </div>

                  {/* Views by Day Chart */}
                  {analytics.viewsByDay.length > 0 && (
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10 mb-6">
                      <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Views - Last 7 Days</h3>
                      <div className="flex items-end gap-2 h-32">
                        {analytics.viewsByDay.map((day: { date: string; views: number }, i: number) => {
                          const maxViews = Math.max(...analytics.viewsByDay.map((d: { views: number }) => d.views), 1);
                          const height = (day.views / maxViews) * 100;
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                              <div 
                                className="w-full bg-blue-500/60 rounded-t transition-all"
                                style={{ height: `${Math.max(height, 4)}%` }}
                              />
                              <span className="text-xs text-gray-500">{day.date.slice(5)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Top Themes */}
                  {analytics.topThemes.length > 0 && (
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Top Themes</h3>
                      <div className="space-y-3">
                        {analytics.topThemes.map((theme: { id: number; name: string; viewCount: number; quantitySold: number }, i: number) => (
                          <div key={theme.id} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-bold text-gray-500">#{i + 1}</span>
                              <span className="text-white">{theme.name}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-gray-400">{theme.viewCount} views</span>
                              <span className="text-green-400">{theme.quantitySold} sales</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Listings Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="text-center py-20 bg-black/20 rounded-2xl border border-white/5">
              <Store className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No themes found</h3>
              <p className="text-gray-400 mb-6">Try adjusting your filters or search query</p>
              {isLoggedIn && (
                <button
                  onClick={() => navigate('/music/marketplace/upload')}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full font-medium transition-colors"
                >
                  Be the first to sell a theme
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  isOwned={ownedThemeIds.has(listing.id)}
                  onClick={() => openListingDetail(listing)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Listing Detail Modal */}
      {selectedListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedListing(null)}>
          <div className="bg-gray-900 border border-white/10 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Preview */}
            <div className="relative aspect-video">
              <img
                src={selectedListing.previewImageUrl}
                alt={selectedListing.title}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setSelectedListing(null)}
                className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Details */}
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">{selectedListing.title}</h2>
                  <p className="text-gray-400">
                    by <span className="text-purple-400">{selectedListing.creatorName}</span>
                    {selectedListing.isResale && selectedListing.originalCreatorName && (
                      <span className="text-gray-500"> • Original: {selectedListing.originalCreatorName}</span>
                    )}
                  </p>
                </div>
                
                {/* Badges */}
                <div className="flex gap-2">
                  {selectedListing.hasParticles && (
                    <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs rounded-full">✨ Particles</span>
                  )}
                  {selectedListing.isResale && (
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full">Resale</span>
                  )}
                  {selectedListing.category && (
                    <span className="px-2 py-1 bg-indigo-500/20 text-indigo-400 text-xs rounded-full capitalize">{selectedListing.category}</span>
                  )}
                </div>
              </div>

              <p className="text-gray-300 mb-4">{selectedListing.description}</p>

              {/* Tags */}
              {selectedListing.tags && selectedListing.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {selectedListing.tags.map((tag, idx) => (
                    <span key={idx} className="px-2 py-1 bg-white/5 text-gray-400 text-xs rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Price / Auction Info */}
              <div className="bg-black/40 border border-white/10 rounded-xl p-4 mb-6">
                {selectedListing.isAuction ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Current Bid</span>
                      <span className="text-2xl font-bold text-white flex items-center gap-2">
                        <KaspaIcon className="w-6 h-6" />
                        {selectedListing.currentBid || selectedListing.minBid}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Min Starting Bid</span>
                      <span className="text-gray-400">{selectedListing.minBid} KAS</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Ends In</span>
                      <span className="text-orange-400 font-medium">
                        {selectedListing.auctionEndsAt ? formatTimeRemaining(selectedListing.auctionEndsAt) : 'N/A'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Price</span>
                    {parseFloat(selectedListing.priceKas) === 0 ? (
                      <span className="text-2xl font-bold text-blue-400">FREE</span>
                    ) : (
                      <span className="text-2xl font-bold text-white flex items-center gap-2">
                        <KaspaIcon className="w-6 h-6" />
                        {selectedListing.priceKas}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Quantity Info */}
              <div className="flex justify-between items-center text-sm mb-6">
                <span className="text-gray-500">Availability</span>
                <span className="text-white">
                  {selectedListing.quantityTotal === null 
                    ? `Unlimited (${selectedListing.quantitySold} sold)` 
                    : `${selectedListing.quantityTotal - selectedListing.quantitySold} of ${selectedListing.quantityTotal} remaining`
                  }
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                {ownedThemeIds.has(selectedListing.id) ? (
                  <div className="flex-1 px-6 py-3 bg-green-600/20 border border-green-500/50 text-green-400 rounded-xl font-semibold flex items-center justify-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    You Own This Theme
                  </div>
                ) : selectedListing.isAuction ? (
                  <button
                    onClick={() => {
                      if (!isLoggedIn) {
                        setIsWalletModalOpen(true);
                        return;
                      }
                      openBidModal(selectedListing);
                    }}
                    className="flex-1 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <Gavel className="w-5 h-5" />
                    Place Bid
                  </button>
                ) : (
                  <button
                    onClick={() => handlePurchase(selectedListing)}
                    disabled={purchasing === selectedListing.id}
                    className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    {purchasing === selectedListing.id ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Tag className="w-5 h-5" />
                        {parseFloat(selectedListing.priceKas) === 0 ? 'Get Free' : 'Buy Now'}
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => setSelectedListing(null)}
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Listing Modal */}
      {listingTheme && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setListingTheme(null)}>
          <div className="bg-gray-900 border border-white/10 rounded-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">List Theme for Sale</h2>
                <button
                  onClick={() => setListingTheme(null)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Theme Preview */}
              <div className="flex items-center gap-4 mb-6 p-3 bg-black/40 rounded-xl">
                <img
                  src={listingTheme.previewImageUrl}
                  alt={listingTheme.title}
                  className="w-20 h-12 object-cover rounded-lg"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white truncate">{listingTheme.title}</h3>
                  <p className="text-xs text-gray-400">by {listingTheme.creatorName}</p>
                </div>
              </div>
              
              {/* Listing Type Toggle */}
              <div className="mb-4">
                <div className="flex rounded-xl overflow-hidden border border-white/10">
                  <button
                    onClick={() => setListingIsAuction(false)}
                    className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${!listingIsAuction ? 'bg-purple-600 text-white' : 'bg-black/40 text-gray-400 hover:text-white'}`}
                  >
                    Fixed Price
                  </button>
                  <button
                    onClick={() => setListingIsAuction(true)}
                    className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${listingIsAuction ? 'bg-orange-600 text-white' : 'bg-black/40 text-gray-400 hover:text-white'}`}
                  >
                    Auction
                  </button>
                </div>
              </div>
              
              {/* Price/Bid Input */}
              {!listingIsAuction ? (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Sale Price (KAS)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <KaspaIcon className="w-5 h-5 text-gray-400" />
                    </div>
                    <input
                      type="number"
                      value={listingPrice}
                      onChange={(e) => setListingPrice(e.target.value)}
                      placeholder="0.11"
                      step="0.01"
                      min="0"
                      className="w-full pl-10 pr-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Minimum 0.11 KAS, or 0 for free
                  </p>
                </div>
              ) : (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Starting Bid (KAS)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <KaspaIcon className="w-5 h-5 text-gray-400" />
                      </div>
                      <input
                        type="number"
                        value={listingMinBid}
                        onChange={(e) => setListingMinBid(e.target.value)}
                        placeholder="0.11"
                        step="0.01"
                        min="0.11"
                        className="w-full pl-10 pr-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Minimum 0.11 KAS</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Duration (Hours)
                    </label>
                    <select
                      value={listingDuration}
                      onChange={(e) => setListingDuration(e.target.value)}
                      className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-orange-500/50"
                    >
                      <option value="6">6 hours</option>
                      <option value="12">12 hours</option>
                      <option value="24">24 hours</option>
                      <option value="48">2 days</option>
                      <option value="72">3 days</option>
                      <option value="168">7 days</option>
                    </select>
                  </div>
                </div>
              )}
              
              {/* Original Purchase Price */}
              <div className="text-sm text-gray-400 mb-6">
                You originally paid: <span className="text-white">{listingTheme.purchasePriceKas} KAS</span>
              </div>
              
              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleCreateListing}
                  disabled={creatingListing || (!listingIsAuction && !listingPrice) || (listingIsAuction && !listingMinBid)}
                  className={`flex-1 px-4 py-3 ${listingIsAuction ? 'bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50' : 'bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50'} text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2`}
                >
                  {creatingListing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating...
                    </>
                  ) : listingIsAuction ? (
                    <>
                      <Gavel className="w-5 h-5" />
                      Start Auction
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-5 h-5" />
                      List for Sale
                    </>
                  )}
                </button>
                <button
                  onClick={() => setListingTheme(null)}
                  className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bid Modal */}
      {bidModalListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setBidModalListing(null)}>
          <div className="bg-gray-900 border border-white/10 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Place a Bid</h2>
                <button
                  onClick={() => setBidModalListing(null)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Theme Preview */}
              <div className="flex items-center gap-4 mb-6 p-3 bg-black/40 rounded-xl">
                <img
                  src={bidModalListing.previewImageUrl}
                  alt={bidModalListing.title}
                  className="w-20 h-12 object-cover rounded-lg"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white truncate">{bidModalListing.title}</h3>
                  <p className="text-xs text-gray-400">by {bidModalListing.creatorName}</p>
                </div>
              </div>

              {/* Auction Info */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="p-3 bg-black/40 rounded-xl">
                  <p className="text-xs text-gray-400 mb-1">Current Bid</p>
                  <p className="font-semibold text-white flex items-center gap-1">
                    <KaspaIcon className="w-4 h-4 text-teal-400" />
                    {bidModalListing.currentBid || bidModalListing.minBid || '0'} KAS
                  </p>
                </div>
                <div className="p-3 bg-black/40 rounded-xl">
                  <p className="text-xs text-gray-400 mb-1">Ends In</p>
                  <p className="font-semibold text-orange-400 flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {bidModalListing.auctionEndsAt ? formatTimeRemaining(bidModalListing.auctionEndsAt) : 'N/A'}
                  </p>
                </div>
              </div>
              
              {/* Bid Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Your Bid (KAS)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KaspaIcon className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="number"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder={parseFloat(bidModalListing.currentBid || bidModalListing.minBid || '0').toFixed(2)}
                    step="0.01"
                    min="0.11"
                    className="w-full pl-10 pr-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Must be at least {((parseFloat(bidModalListing.currentBid || '0') || parseFloat(bidModalListing.minBid || '0')) + 0.1).toFixed(2)} KAS
                </p>
              </div>

              {/* Bid History */}
              {bidHistory.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Recent Bids</h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {bidHistory.slice(0, 5).map((bid, i) => (
                      <div key={bid.id} className="flex items-center justify-between text-sm p-2 bg-black/20 rounded-lg">
                        <span className={`${i === 0 ? 'text-orange-400 font-medium' : 'text-gray-400'}`}>
                          {bid.bidderName}
                        </span>
                        <span className="text-white flex items-center gap-1">
                          <KaspaIcon className="w-3 h-3 text-teal-400" />
                          {bid.bidAmountKas} KAS
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handlePlaceBid}
                  disabled={placingBid || !bidAmount}
                  className="flex-1 px-4 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {placingBid ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Placing Bid...
                    </>
                  ) : (
                    <>
                      <Gavel className="w-5 h-5" />
                      Place Bid
                    </>
                  )}
                </button>
                <button
                  onClick={() => setBidModalListing(null)}
                  className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Modal */}
      <WalletModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} />
    </div>
  );
}
