// src/react-app/components/fractionalize/FractionalizeModal.tsx
import { useState } from "react";
import { X, PieChart, Loader2, AlertCircle, Check, Coins, Lock } from "lucide-react";
import { useWallet } from "@/react-app/contexts/WalletContext";
import toast from "react-hot-toast";

interface FractionalizeModalProps {
  trackId: number;
  trackTitle?: string;
  trackArtist?: string;
  trackCover?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function FractionalizeModal({ 
  trackId, 
  trackTitle,
  trackArtist,
  trackCover,
  isOpen, 
  onClose 
}: FractionalizeModalProps) {
  const { externalWallet } = useWallet();
  const [percentage, setPercentage] = useState<number>(20);
  const [totalShares, setTotalShares] = useState<number>(1000);
  const [step, setStep] = useState<'form' | 'confirm' | 'deploying' | 'success'>('form');
  const [deployedTicker, setDeployedTicker] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isKasWare = !!externalWallet?.address;

  const handleFractionalize = async () => {
    if (!externalWallet?.address) {
      toast.error("Wallet not connected");
      return;
    }

    if (!isKasWare) {
      toast.error("KasWare wallet required for KRC-20 deployment");
      return;
    }

    setStep('confirm');
  };

  const handleDeploy = async () => {
    setStep('deploying');
    setIsLoading(true);
    setError(null);

    try {
      const authToken = externalWallet?.authToken;
      const res = await fetch("/api/kasshi/fractionalize", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          trackId,
          percentageToSell: percentage / 100, // 0.20 for 20%
          totalShares,
        }),
      });

      const data = await res.json();

      if (!data.success) throw new Error(data.error || "Failed to create shares");

      // Sign & broadcast the deploy transaction with KasWare
      if (data.deployTxRaw && window.kasware) {
        const signedTx = await window.kasware.signMessage(data.inscriptionHex || data.deployTxRaw);
        
        // Confirm deployment with backend
        const confirmRes = await fetch('/api/kasshi/fractionalize/confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            trackId,
            signedTransaction: signedTx,
          }),
        });

        const confirmData = await confirmRes.json();
        if (!confirmRes.ok) {
          throw new Error(confirmData.error || 'Failed to confirm deployment');
        }
      }

      setDeployedTicker(data.ticker || 'TOKEN');
      setStep('success');
      
      toast.success(`Track fractionalized! KRC-20 ticker: ${data.ticker} — ${percentage}% of future earnings now ownable by fans.`);
    } catch (err: any) {
      setError(err.message || "Failed to fractionalize track");
      toast.error(err.message || "Failed to fractionalize track");
      setStep('form');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (step === 'success') {
      // Refresh to show updated track state
      window.location.reload();
    }
    setStep('form');
    setError(null);
    setPercentage(20);
    setTotalShares(1000);
    onClose();
  };

  if (!isOpen) return null;

  const sharesForSale = Math.floor(totalShares * (percentage / 100));
  const ownerRetained = totalShares - sharesForSale;

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
              <h2 className="font-semibold text-white">Fractionalize this track</h2>
              <p className="text-sm text-white/50">Sell % of future earnings</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5 text-white/50" />
          </button>
        </div>

        {/* Track info */}
        {(trackTitle || trackCover) && (
          <div className="p-4 bg-white/5 border-b border-white/10">
            <div className="flex items-center gap-3">
              {trackCover ? (
                <img src={trackCover} alt={trackTitle} className="w-12 h-12 rounded-lg object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center">
                  <Coins className="w-6 h-6 text-white/30" />
                </div>
              )}
              <div>
                <p className="font-medium text-white">{trackTitle || 'Track'}</p>
                {trackArtist && <p className="text-sm text-white/50">by {trackArtist}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-4">
          {/* Legal Disclaimer */}
          <p className="text-amber-600 text-xs mb-4">
            ⚠️ This is a high-risk speculative purchase of future platform earnings only.<br />
            The artist may stop promoting the track. No guarantees of returns. Not financial advice.<br />
            By proceeding you agree to our <a href="/legal/fractional-agreement" className="underline hover:text-amber-500">Artist/Investor Agreement</a>.
          </p>

          {step === 'form' && (
            <div className="space-y-6">
              {/* Warning */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <Lock className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-200/80">
                  <p className="font-medium text-yellow-400 mb-1">Important</p>
                  <p>Sell up to 40% of future KAS earnings from plays/tips on this specific track only. The track becomes permanently locked (no delete, no exact re-uploads).</p>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Percentage slider */}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-3">
                  Percentage to sell (1–40%)
                </label>
                <input
                  type="range"
                  value={percentage}
                  onChange={(e) => setPercentage(Number(e.target.value))}
                  min={1}
                  max={40}
                  step={1}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex justify-between mt-2">
                  <span className="text-xs text-white/40">1%</span>
                  <span className="text-lg font-bold text-purple-400">{percentage}%</span>
                  <span className="text-xs text-white/40">40%</span>
                </div>
              </div>

              {/* Total shares */}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1.5">
                  Total number of shares
                </label>
                <input
                  type="number"
                  value={totalShares}
                  onChange={(e) => setTotalShares(Math.max(100, Math.min(10000, Number(e.target.value))))}
                  min={100}
                  max={10000}
                  className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-purple-500/50 focus:outline-none"
                />
                <p className="text-xs text-white/40 mt-1">
                  (Higher = smaller price per share)
                </p>
              </div>

              {/* Summary */}
              <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/70">Shares for sale:</span>
                  <span className="font-medium text-purple-400">{sharesForSale.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/70">You keep:</span>
                  <span className="font-medium text-white">{ownerRetained.toLocaleString()} ({100 - percentage}%)</span>
                </div>
              </div>

              {!isKasWare && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  KasWare wallet required for KRC-20 deployment
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 py-3 rounded-lg bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFractionalize}
                  disabled={!isKasWare || isLoading}
                  className="flex-1 py-3 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:from-purple-600 hover:to-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
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
                  <span className="text-white/60">Earnings to sell:</span>
                  <span className="font-bold text-purple-400">{percentage}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Total Shares:</span>
                  <span className="text-white">{totalShares.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">For Sale:</span>
                  <span className="text-white">{sharesForSale.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">You Keep:</span>
                  <span className="text-white">{ownerRetained.toLocaleString()}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-300 text-center">
                  ⚠️ This action cannot be undone. The track will be permanently locked.
                </p>
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
                  Deploy Shares & Lock Track
                </button>
              </div>
            </div>
          )}

          {step === 'deploying' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-purple-400 mx-auto mb-4 animate-spin" />
              <h3 className="text-lg font-semibold text-white mb-2">Deploying KRC-20...</h3>
              <p className="text-sm text-white/60">Please confirm in your KasWare wallet</p>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Track Fractionalized!</h3>
              <p className="text-sm text-white/60 mb-2">
                KRC-20 ticker: <span className="font-mono text-purple-400">${deployedTicker}</span>
              </p>
              <p className="text-sm text-white/60 mb-6">
                {percentage}% of future earnings now ownable by fans.
              </p>
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
