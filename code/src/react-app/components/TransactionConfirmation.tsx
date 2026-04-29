import { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle, Clock, Info, Loader2, Shield, X } from 'lucide-react';
import { useExchangeRates } from '../hooks/useExchangeRates';

interface TransactionConfirmationProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  recipient: string;
  recipientType: 'domain' | 'address' | 'username' | null;
  resolvedAddress?: string;
  amount: string;
  currency: string;
  senderAddress: string;
  networkFee?: string;
}

export default function TransactionConfirmation({
  isOpen,
  onClose,
  onConfirm,
  recipient,
  recipientType,
  resolvedAddress,
  amount,
  currency,
  senderAddress,
  networkFee = '0.0001',
}: TransactionConfirmationProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  
  const { rates, kasToFiat, fiatToKas, formatFiat } = useExchangeRates();
  
  if (!isOpen) return null;
  
  // Calculate amounts
  const amountNum = parseFloat(amount) || 0;
  const isKAS = currency === 'KAS';
  const kasAmount = isKAS ? amountNum : fiatToKas(amountNum, currency as keyof typeof rates);
  const fiatAmount = isKAS ? kasToFiat(amountNum, 'USD') : amountNum;
  const networkFeeKas = parseFloat(networkFee);
  const totalKas = kasAmount + networkFeeKas;
  const totalFiat = kasToFiat(totalKas, 'USD');
  
  // Determine warning level based on amount
  const warningLevel = fiatAmount >= 1000 ? 'high' : fiatAmount >= 100 ? 'medium' : 'low';
  
  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  };
  
  const formatAddress = (addr: string) => {
    if (addr.length > 40) {
      return `${addr.slice(0, 20)}...${addr.slice(-12)}`;
    }
    return addr;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-[#70C7BA]/20 to-[#49EACB]/20 border-b border-white/10 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#70C7BA]/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-[#70C7BA]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Confirm Transaction</h2>
                <p className="text-xs text-white/60">Review details before sending</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isConfirming}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Warning Banner for Large Amounts */}
          {warningLevel !== 'low' && (
            <div className={`rounded-lg p-4 flex items-start gap-3 ${
              warningLevel === 'high' 
                ? 'bg-red-500/10 border border-red-400/30' 
                : 'bg-yellow-500/10 border border-yellow-400/30'
            }`}>
              <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                warningLevel === 'high' ? 'text-red-400' : 'text-yellow-400'
              }`} />
              <div>
                <p className={`font-medium text-sm ${
                  warningLevel === 'high' ? 'text-red-400' : 'text-yellow-400'
                }`}>
                  {warningLevel === 'high' ? 'Large Transaction' : 'Notable Amount'}
                </p>
                <p className={`text-xs mt-1 ${
                  warningLevel === 'high' ? 'text-red-400/70' : 'text-yellow-400/70'
                }`}>
                  You're about to send {formatFiat(fiatAmount, 'USD')}. Please verify all details carefully.
                </p>
              </div>
            </div>
          )}

          {/* Transaction Flow Visualization */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between gap-4">
              {/* From */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/40 mb-1">From</p>
                <p className="text-sm text-white font-medium truncate">Your Wallet</p>
                <p className="text-xs text-white/40 font-mono truncate">{formatAddress(senderAddress)}</p>
              </div>
              
              {/* Arrow */}
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-[#70C7BA]/20 flex items-center justify-center">
                  <ArrowRight className="w-5 h-5 text-[#70C7BA]" />
                </div>
              </div>
              
              {/* To */}
              <div className="flex-1 min-w-0 text-right">
                <p className="text-xs text-white/40 mb-1">To</p>
                <p className="text-sm text-white font-medium truncate">
                  {recipientType === 'username' && '@'}{recipient}
                </p>
                {resolvedAddress && resolvedAddress !== recipient && (
                  <p className="text-xs text-white/40 font-mono truncate">{formatAddress(resolvedAddress)}</p>
                )}
                {recipientType && (
                  <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
                    recipientType === 'username' ? 'bg-purple-400/20 text-purple-400' :
                    recipientType === 'domain' ? 'bg-blue-400/20 text-blue-400' :
                    'bg-white/10 text-white/60'
                  }`}>
                    {recipientType === 'username' ? 'Kaspay User' : 
                     recipientType === 'domain' ? 'KNS Domain' : 'Wallet Address'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Amount Details */}
          <div className="space-y-3">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-white/60">Send Amount</span>
                <div className="text-right">
                  <p className="text-xl font-bold text-white">
                    {isKAS ? `${kasAmount.toFixed(4)} KAS` : `${amount} ${currency}`}
                  </p>
                  <p className="text-sm text-white/40">
                    {isKAS ? `≈ ${formatFiat(fiatAmount, 'USD')}` : `≈ ${kasAmount.toFixed(4)} KAS`}
                  </p>
                </div>
              </div>
              
              <div className="border-t border-white/10 pt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/60">Network Fee</span>
                  <span className="text-white/80">{networkFeeKas} KAS</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/60">Fee in USD</span>
                  <span className="text-white/40">≈ {formatFiat(kasToFiat(networkFeeKas, 'USD'), 'USD')}</span>
                </div>
              </div>
              
              <div className="border-t border-white/10 pt-3 mt-3">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">Total</span>
                  <div className="text-right">
                    <p className="text-lg font-bold text-[#70C7BA]">{totalKas.toFixed(4)} KAS</p>
                    <p className="text-xs text-white/40">≈ {formatFiat(totalFiat, 'USD')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Network Info */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-white/40" />
              <span className="text-sm text-white/60">Network Details</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-white/40 text-xs">Network</p>
                <p className="text-white font-medium">Kaspa Mainnet</p>
              </div>
              <div>
                <p className="text-white/40 text-xs">Confirmation Time</p>
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-white font-medium">~1 second</span>
                </div>
              </div>
              <div>
                <p className="text-white/40 text-xs">Exchange Rate</p>
                <p className="text-white font-medium">1 KAS = {formatFiat(rates.USD || 0, 'USD')}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs">Finality</p>
                <p className="text-white font-medium">Instant</p>
              </div>
            </div>
          </div>

          {/* Confirmation Checkbox */}
          <label className="flex items-start gap-3 p-3 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-[#70C7BA] focus:ring-[#70C7BA] focus:ring-offset-0"
            />
            <span className="text-sm text-white/80">
              I have verified the recipient address and amount. I understand this transaction cannot be reversed.
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={isConfirming}
            className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-medium rounded-lg hover:bg-white/10 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirming || !confirmed}
            className="flex-1 py-3 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white font-semibold rounded-lg shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isConfirming ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Confirm & Send
              </>
            )}
          </button>
        </div>
        
        {/* Security Footer */}
        <div className="px-6 pb-4">
          <div className="flex items-center justify-center gap-2 text-xs text-white/40">
            <Shield className="w-3.5 h-3.5" />
            <span>Secured by Kaspa blockchain • Self-custody wallet</span>
          </div>
        </div>
      </div>
    </div>
  );
}
