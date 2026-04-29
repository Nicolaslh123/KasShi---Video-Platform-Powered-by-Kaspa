import { useState, useEffect } from 'react';
import { X, PieChart, Loader2, AlertCircle, Check, Coins, TrendingUp, Users } from 'lucide-react';
import { useWallet } from '../../contexts/WalletContext';
import toast from 'react-hot-toast';

interface FractionalizedTrack {
  id: number;
  title: string;
  coverArtUrl?: string | null;
  ticker: string;
  totalShares: number;
  sharesSold: number;
  availableShares: number;
  percentageSold: number;
  pricePerShare?: number;
  artistName: string;
  artistHandle: string;
  artistAvatar?: string | null;
}

interface BuySharesModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: FractionalizedTrack;
  onPurchaseComplete?: () => void;
}

export function BuySharesModal({ isOpen, onClose, track, onPurchaseComplete }: BuySharesModalProps) {
  const { externalWallet, wallet } = useWallet();
  const isLoggedIn = !!(wallet?.address || externalWallet?.address);
  const [sharesToBuy, setSharesToBuy] = useState('10');
  const [step, setStep] = useState<'form' | 'confirm' | 'processing' | 'success'>('form');
  const [error, setError] = useState<string | null>(null);
  const [pricePerShare] = useState(track.pricePerShare || 0.1);

  const totalCost = (parseInt(sharesToBuy) || 0) * pricePerShare;
  const ownershipPercent = ((parseInt(sharesToBuy) || 0) / track.totalShares) * 100;

  useEffect(() => {
    if (isOpen) {
      setStep('form');
      setError(null);
      setSharesToBuy('10');
    }
  }, [isOpen]);

  const handleSubmit = () => {
    setError(null);
    
    const shares = parseInt(sharesToBuy);
    if (isNaN(shares) || shares < 1) {
      setError('Enter at least 1 share');
      return;
    }
    if (shares > track.availableShares) {
      setError(`Only ${track.availableShares.toLocaleString()} shares available`);
      return;
    }
    if (!isLoggedIn) {
      setError('Please connect your wallet first');
      return;
    }

    setStep('confirm');
  };

  const handlePurchase = async () => {
    setStep('processing');
    setError(null);

    try {
      const authToken = externalWallet?.authToken;
      const response = await fetch('/api/kasshi/buy-shares', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          trackId: track.id,
          sharesToBuy: parseInt(sharesToBuy),
          pricePerShareKas: pricePerShare,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to purchase shares');
      }

      setStep('success');
      toast.success(`Purchased ${sharesToBuy} shares of $${track.ticker}!`);
      onPurchaseComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
      setStep('form');
    }
  };

  const handleClose = () => {
    setStep('form');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
              <Coins className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Buy Shares</h2>
              <p className="text-sm text-white/50">${track.ticker}</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5 text-white/50" />
          </button>
        </div>

        {/* Track info */}
        <div className="p-4 bg-white/5 border-b border-white/10">
          <div className="flex items-center gap-3">
            {track.coverArtUrl ? (
              <img src={track.coverArtUrl} alt={track.title} className="w-12 h-12 rounded-lg object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center">
                <PieChart className="w-6 h-6 text-white/30" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white truncate">{track.title}</p>
              <p className="text-sm text-white/50">by {track.artistName}</p>
            </div>
          </div>
          
          {/* Stats */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="p-2 rounded-lg bg-white/5 text-center">
              <p className="text-xs text-white/50">Price</p>
              <p className="text-sm font-medium text-white">{pricePerShare} KAS</p>
            </div>
            <div className="p-2 rounded-lg bg-white/5 text-center">
              <p className="text-xs text-white/50">Available</p>
              <p className="text-sm font-medium text-teal-400">{track.availableShares.toLocaleString()}</p>
            </div>
            <div className="p-2 rounded-lg bg-white/5 text-center">
              <p className="text-xs text-white/50">Total Supply</p>
              <p className="text-sm font-medium text-white">{track.totalShares.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Legal Disclaimer */}
          <p className="text-amber-600 text-xs mb-4">
            ⚠️ This is a high-risk speculative purchase of future platform earnings only.<br />
            The artist may stop promoting the track. No guarantees of returns. Not financial advice.<br />
            By proceeding you agree to our <a href="/legal/fractional-agreement" className="underline hover:text-amber-500">Artist/Investor Agreement</a>.
          </p>

          {step === 'form' && (
            <div className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white/70 mb-1.5">Shares to Buy</label>
                <input
                  type="number"
                  value={sharesToBuy}
                  onChange={(e) => setSharesToBuy(e.target.value)}
                  min="1"
                  max={track.availableShares}
                  className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-teal-500/50 focus:outline-none"
                />
                <div className="mt-2 flex gap-2">
                  {[10, 50, 100].map(amount => (
                    <button
                      key={amount}
                      onClick={() => setSharesToBuy(String(Math.min(amount, track.availableShares)))}
                      className="px-3 py-1 rounded-md bg-white/5 text-white/70 text-sm hover:bg-white/10 transition-colors"
                    >
                      {amount}
                    </button>
                  ))}
                  <button
                    onClick={() => setSharesToBuy(String(track.availableShares))}
                    className="px-3 py-1 rounded-md bg-teal-500/20 text-teal-400 text-sm hover:bg-teal-500/30 transition-colors"
                  >
                    Max
                  </button>
                </div>
              </div>

              <div className="space-y-2 p-4 rounded-lg bg-white/5">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60 flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" /> Cost
                  </span>
                  <span className="font-medium text-white">{totalCost.toFixed(2)} KAS</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60 flex items-center gap-1">
                    <Users className="w-4 h-4" /> Ownership
                  </span>
                  <span className="font-medium text-teal-400">{ownershipPercent.toFixed(3)}%</span>
                </div>
              </div>

              {!isLoggedIn && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Connect wallet to purchase shares
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!isLoggedIn}
                className="w-full py-3 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-medium hover:from-teal-600 hover:to-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Buy Shares
              </button>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <Coins className="w-12 h-12 text-teal-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-white mb-2">Confirm Purchase</h3>
                <p className="text-sm text-white/60">You're about to buy shares in this track</p>
              </div>

              <div className="space-y-2 p-4 rounded-lg bg-white/5">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Track:</span>
                  <span className="text-white">{track.title}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Ticker:</span>
                  <span className="font-mono text-teal-400">${track.ticker}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Shares:</span>
                  <span className="text-white">{parseInt(sharesToBuy).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-white/10 pt-2 mt-2">
                  <span className="text-white/60">Total:</span>
                  <span className="font-medium text-white">{totalCost.toFixed(2)} KAS</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('form')}
                  className="flex-1 py-3 rounded-lg bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handlePurchase}
                  className="flex-1 py-3 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-medium hover:from-teal-600 hover:to-emerald-600 transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-teal-400 mx-auto mb-4 animate-spin" />
              <h3 className="text-lg font-semibold text-white mb-2">Processing...</h3>
              <p className="text-sm text-white/60">Purchasing your shares</p>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Purchase Complete!</h3>
              <p className="text-sm text-white/60 mb-1">You now own {parseInt(sharesToBuy).toLocaleString()} shares</p>
              <p className="text-sm text-teal-400 font-mono mb-6">${track.ticker}</p>
              <button
                onClick={handleClose}
                className="px-6 py-3 rounded-lg bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
