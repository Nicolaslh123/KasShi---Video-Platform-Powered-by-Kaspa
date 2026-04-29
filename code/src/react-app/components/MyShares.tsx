import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { PieChart, TrendingUp, Music2, Loader2, ExternalLink } from 'lucide-react';
import LocalizedLink from '../components/LocalizedLink';
import toast from 'react-hot-toast';

interface ShareHolding {
  id: number;
  trackId: number;
  ticker: string;
  sharesOwned: number;
  purchasePriceKas: string;
  purchasedAt: string;
  trackTitle: string;
  coverArtUrl: string | null;
  artistName: string;
  artistHandle: string;
  totalShares: number;
  ownershipPercent: string;
}

interface FractionalizedTrack {
  id: number;
  title: string;
  coverArtUrl: string | null;
  ticker: string;
  totalShares: number;
  sharesSold: number;
  percentageSold: number;
  availableShares: number;
  deployTxId: string;
  artistName: string;
  artistHandle: string;
  artistAvatar: string | null;
}

export function useMyShares() {
  const { externalWallet } = useWallet();
  const [shares, setShares] = useState<ShareHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authToken = externalWallet?.authToken;

  const fetchShares = useCallback(async () => {
    if (!authToken) {
      setShares([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/kasshi/my-shares', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch shares');
      }
      
      const data = await response.json();
      setShares(data.shares || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  return { shares, loading, error, refetch: fetchShares };
}

export function useFractionalizedTracks() {
  const [tracks, setTracks] = useState<FractionalizedTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTracks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/kasshi/fractionalized');
      
      if (!response.ok) {
        throw new Error('Failed to fetch tracks');
      }
      
      const data = await response.json();
      setTracks(data.tracks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  return { tracks, loading, error, refetch: fetchTracks };
}

export function useBuyShares() {
  const { externalWallet } = useWallet();
  const [loading, setLoading] = useState(false);

  const authToken = externalWallet?.authToken;

  const buyShares = useCallback(async (
    trackId: number,
    sharesToBuy: number,
    pricePerShareKas: number
  ) => {
    if (!authToken) {
      toast.error('Please connect your wallet');
      return null;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/kasshi/buy-shares', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          trackId,
          sharesToBuy,
          pricePerShareKas,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to buy shares');
      }

      toast.success(`Purchased ${sharesToBuy} shares!`);
      return data;
    } catch (err) {
      console.error('Buy shares error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to buy shares');
      return null;
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  return { buyShares, loading };
}

interface MySharesProps {
  accent?: string;
}

export default function MyShares({ accent = '#7dd3fc' }: MySharesProps) {
  const { shares, loading, error } = useMyShares();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-white/60">{error}</p>
      </div>
    );
  }

  if (shares.length === 0) {
    return (
      <div className="text-center py-12">
        <PieChart className="w-12 h-12 mx-auto mb-4 text-white/30" />
        <h3 className="text-lg font-semibold mb-2">No Shares Yet</h3>
        <p className="text-white/60 text-sm mb-4">
          Invest in your favorite artists by buying shares in their tracks
        </p>
        <LocalizedLink
          to="/music/invest"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
          style={{ backgroundColor: accent, color: '#000' }}
        >
          <TrendingUp className="w-4 h-4" />
          Browse Investments
        </LocalizedLink>
      </div>
    );
  }

  // Calculate totals
  const totalInvested = shares.reduce((sum, s) => 
    sum + (parseFloat(s.purchasePriceKas) * s.sharesOwned), 0
  );

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div 
        className="rounded-xl p-[1px]"
        style={{ background: `linear-gradient(135deg, ${accent}40 0%, ${accent}10 100%)` }}
      >
        <div className="bg-black/60 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Total Invested</p>
              <p className="text-2xl font-bold" style={{ color: accent }}>
                {totalInvested.toFixed(2)} KAS
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-white/60">Holdings</p>
              <p className="text-2xl font-bold">{shares.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Share holdings list */}
      <div className="space-y-2">
        {shares.map((share) => (
          <div
            key={share.id}
            className="rounded-xl p-[1px]"
            style={{ background: `linear-gradient(135deg, ${accent}30 0%, transparent 100%)` }}
          >
            <div className="bg-black/70 rounded-xl p-4 flex items-center gap-4">
              {/* Track cover */}
              <div className="w-14 h-14 rounded-lg bg-white/10 flex-shrink-0 overflow-hidden">
                {share.coverArtUrl ? (
                  <img 
                    src={share.coverArtUrl} 
                    alt={share.trackTitle} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music2 className="w-6 h-6 text-white/30" />
                  </div>
                )}
              </div>

              {/* Track info */}
              <div className="flex-1 min-w-0">
                <LocalizedLink 
                  to={`/music/track/${share.trackId}`}
                  className="font-medium hover:underline truncate block"
                >
                  {share.trackTitle}
                </LocalizedLink>
                <p className="text-sm text-white/60 truncate">
                  by {share.artistName}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span 
                    className="text-xs font-mono px-2 py-0.5 rounded"
                    style={{ backgroundColor: `${accent}20`, color: accent }}
                  >
                    {share.ticker}
                  </span>
                  <span className="text-xs text-white/50">
                    {share.ownershipPercent}% ownership
                  </span>
                </div>
              </div>

              {/* Shares info */}
              <div className="text-right flex-shrink-0">
                <p className="font-bold">{share.sharesOwned.toLocaleString()}</p>
                <p className="text-xs text-white/60">shares</p>
                <a
                  href={`https://kasplex.org/token/${share.ticker}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs mt-1 hover:underline"
                  style={{ color: accent }}
                >
                  View <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
