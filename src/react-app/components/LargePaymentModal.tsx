import { useState } from 'react';
import { Shield, X, AlertTriangle, Check, Loader2 } from 'lucide-react';

interface LargePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  amount: string;
  currency: string;
  recipient: string;
  threshold: string;
}

export default function LargePaymentModal({
  isOpen,
  onClose,
  onConfirm,
  amount,
  currency,
  recipient,
  threshold,
}: LargePaymentModalProps) {
  const [confirmCode, setConfirmCode] = useState('');
  const [step, setStep] = useState<'warning' | 'verify'>('warning');
  const [isConfirming, setIsConfirming] = useState(false);
  
  // Generate a simple confirmation code (in production, this would be sent via email/SMS)
  const [expectedCode] = useState(() => Math.random().toString(36).substring(2, 8).toUpperCase());

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (step === 'warning') {
      setStep('verify');
      return;
    }
    
    if (confirmCode.toUpperCase() !== expectedCode) {
      return;
    }
    
    setIsConfirming(true);
    // Small delay for UX
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsConfirming(false);
    onConfirm();
    
    // Reset state
    setStep('warning');
    setConfirmCode('');
  };

  const handleClose = () => {
    setStep('warning');
    setConfirmCode('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10 bg-gradient-to-r from-amber-500/10 to-orange-500/10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Large Payment</h2>
                <p className="text-sm text-white/60">Additional verification required</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'warning' ? (
            <>
              <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-6">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-200 text-sm font-medium">
                    This payment exceeds your ${threshold} threshold
                  </p>
                  <p className="text-amber-200/70 text-xs mt-1">
                    For your security, we require verification for large payments.
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between">
                  <span className="text-white/60">Amount</span>
                  <span className="text-white font-semibold">{amount} {currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Recipient</span>
                  <span className="text-white font-semibold truncate ml-4 max-w-[200px]">{recipient}</span>
                </div>
              </div>

              <button
                onClick={handleConfirm}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-amber-500/30 transition-all"
              >
                Continue to Verification
              </button>
            </>
          ) : (
            <>
              <p className="text-white/80 text-sm mb-4">
                Enter the confirmation code shown below to proceed:
              </p>

              <div className="p-4 bg-white/5 border border-white/10 rounded-xl mb-4 text-center">
                <p className="text-xs text-white/40 mb-1">Confirmation Code</p>
                <p className="text-2xl font-mono font-bold text-[#70C7BA] tracking-widest">{expectedCode}</p>
              </div>

              <input
                type="text"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value.toUpperCase())}
                placeholder="Enter code"
                maxLength={6}
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white text-center font-mono text-xl tracking-widest placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#70C7BA] focus:border-transparent uppercase mb-4"
              />

              {confirmCode.length === 6 && confirmCode.toUpperCase() !== expectedCode && (
                <p className="text-red-400 text-sm text-center mb-4">Code doesn't match. Try again.</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-medium rounded-lg hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={confirmCode.length !== 6 || confirmCode.toUpperCase() !== expectedCode || isConfirming}
                  className="flex-1 py-3 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-teal-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {isConfirming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Confirming...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Confirm Payment
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
