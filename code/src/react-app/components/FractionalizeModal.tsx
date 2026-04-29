import { useState } from 'react';
import { X, PieChart, Loader2, AlertCircle, Check, Coins } from 'lucide-react';
import { useWallet } from '../contexts/WalletContext';
import toast from 'react-hot-toast';

interface Track {
  id: number;
  title: string;
  artistName?: string | null;
  coverArtUrl?: string | null;
}

interface FractionalizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track;
}

export function FractionalizeModal({ isOpen, onClose, track }: FractionalizeModalProps) {
  const { externalWallet } = useWallet();
  const [ticker, setTicker] = useState('');
  const [totalShares, setTotalShares] = useState('1000');
  const [pricePerShare, setPricePerShare] = useState('0.1');
  const [sharesToSell, setSharesToSell] = useState('500');
  const [step, setStep] = useState<'form' | 'confirm' | 'deploying' | 'success'>('form');
  const [error, setError] = useState<string | null>(null);

  const isKasWare = !!externalWallet?.address;

  const handleSubmit = async () => {
    setError(null);
    
    // Validation
    if (!ticker || ticker.length < 3 || ticker.length > 6) {
      setError('Ticker must be 3-6 characters');
      return;
    }
    if (!/^[A-Z0-9]+$/.test(ticker)) {
      setError('Ticker must be uppercase letters and numbers only');
      return;
    }
    const shares = parseInt(totalShares);
    if (isNaN(shares) || shares < 100 || shares > 1000000) {
      setError('Total shares must be between 100 and 1,000,000');
      return;
    }
    const price = parseFloat(pricePerShare);
    if (isNaN(price) || price < 0.01) {
      setError('Price per share must be at least 0.01 KAS');
      return;
    }
    const selling = parseInt(sharesToSell);
    if (isNaN(selling) || selling < 1 || selling > shares) {
      setError('Shares to sell must be between 1 and total shares');
      return;
    }

    if (!isKasWare) {
      setError('KasWare wallet required for KRC-20 deployment');
      return;
    }

    setStep('confirm');
  };

  const handleDeploy = async () => {
    setStep('deploying');
    setError(null);

    try {
      // Call backend to initiate fractionalization
      const authToken = externalWallet?.authToken;
      const response = await fetch('/api/kasshi/fractionalize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          trackId: track.id,
          ticker: ticker.toUpperCase(),
          totalShares: parseInt(totalShares),
          pricePerShare: parseFloat(pricePerShare),
          sharesToSell: parseInt(sharesToSell),
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fractionalize track');
      }

      // Sign and broadcast KRC-20 deploy transaction with KasWare
      if (data.deployTxRaw && window.kasware) {
        // Use KasWare signMessage to sign the inscription data
        const signedTx = await window.kasware.signMessage(data.inscriptionHex || data.deployTxRaw);
        
        // Confirm deployment with backend (backend will broadcast)
        const confirmResponse = await fetch('/api/kasshi/fractionalize/confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            trackId: track.id,
            signedTransaction: signedTx,
          }),
        });

        const confirmData = await confirmResponse.json();
        if (!confirmResponse.ok) {
          throw new Error(confirmData.error || 'Failed to confirm deployment');
        }
      }

      setStep('success');
      toast.success('Track fractionalized successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fractionalize');
      setStep('form');
    }
  };

  const handleClose = () => {
    setStep('form');
    setError(null);
    setTicker('');
    setTotalShares('1000');
    setPricePerShare('0.1');
    setSharesToSell('500');
    onClose();
  };

  if (!isOpen) return null;

  const totalValue = (parseInt(sharesToSell) || 0) * (parseFloat(pricePerShare) || 0);
  const ownerRetained = (parseInt(totalShares) || 0) - (parseInt(sharesToSell) || 0);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <PieChart className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Fractionalize Track</h2>
              <p className="text-sm text-white/50">Create KRC-20 shares</p>
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
                <Coins className="w-6 h-6 text-white/30" />
              </div>
            )}
            <div>
              <p className="font-medium text-white">{track.title}</p>
              {track.artistName && <p className="text-sm text-white/50">by {track.artistName}</p>}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {step === 'form' && (
            <div className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white/70 mb-1.5">Token Ticker</label>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder="e.g. TRACK1"
                  className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-purple-500/50 focus:outline-none"
                />
                <p className="mt-1 text-xs text-white/40">3-6 uppercase letters/numbers</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1.5">Total Shares</label>
                  <input
                    type="number"
                    value={totalShares}
                    onChange={(e) => setTotalShares(e.target.value)}
                    min="100"
                    max="1000000"
                    className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-purple-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1.5">Price per Share</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={pricePerShare}
                      onChange={(e) => setPricePerShare(e.target.value)}
                      step="0.01"
                      min="0.01"
                      className="w-full px-3 py-2.5 pr-12 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-purple-500/50 focus:outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">KAS</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-1.5">Shares to Sell</label>
                <input
                  type="number"
                  value={sharesToSell}
                  onChange={(e) => setSharesToSell(e.target.value)}
                  min="1"
                  max={totalShares}
                  className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-purple-500/50 focus:outline-none"
                />
                <p className="mt-1 text-xs text-white/40">You keep {ownerRetained.toLocaleString()} shares ({((ownerRetained / (parseInt(totalShares) || 1)) * 100).toFixed(1)}%)</p>
              </div>

              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex justify-between text-sm">
                  <span className="text-white/70">Total if sold out:</span>
                  <span className="font-medium text-purple-400">{totalValue.toLocaleString()} KAS</span>
                </div>
              </div>

              {!isKasWare && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  KasWare wallet required for KRC-20 deployment
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!isKasWare}
                className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:from-purple-600 hover:to-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <PieChart className="w-12 h-12 text-purple-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-white mb-2">Confirm Fractionalization</h3>
                <p className="text-sm text-white/60">This will deploy a KRC-20 token on Kaspa</p>
              </div>

              <div className="space-y-2 p-4 rounded-lg bg-white/5">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Ticker:</span>
                  <span className="font-mono text-white">${ticker}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Total Supply:</span>
                  <span className="text-white">{parseInt(totalShares).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">For Sale:</span>
                  <span className="text-white">{parseInt(sharesToSell).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Price:</span>
                  <span className="text-white">{pricePerShare} KAS/share</span>
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
                  onClick={handleDeploy}
                  className="flex-1 py-3 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:from-purple-600 hover:to-pink-600 transition-colors"
                >
                  Deploy Token
                </button>
              </div>
            </div>
          )}

          {step === 'deploying' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-purple-400 mx-auto mb-4 animate-spin" />
              <h3 className="text-lg font-semibold text-white mb-2">Deploying Token...</h3>
              <p className="text-sm text-white/60">Please confirm in your KasWare wallet</p>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Track Fractionalized!</h3>
              <p className="text-sm text-white/60 mb-6">Your ${ticker} token is now live</p>
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
