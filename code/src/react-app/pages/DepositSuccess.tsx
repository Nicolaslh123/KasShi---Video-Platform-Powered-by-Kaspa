import { useEffect, useState } from 'react';
import { CheckCircle, ArrowRight, Loader2 } from 'lucide-react';
import { KaspaIcon } from '../components/KasShiLogo';

interface DepositSuccessProps {
  onBack: () => void;
}

export default function DepositSuccess({ onBack }: DepositSuccessProps) {
  const [depositInfo, setDepositInfo] = useState<{
    amount: string;
    currency: string;
    kasAmount: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Get session_id from URL params
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    
    if (sessionId) {
      // Fetch deposit details
      fetch(`/api/deposits/verify?session_id=${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setDepositInfo({
              amount: data.amount,
              currency: data.currency,
              kasAmount: data.kasAmount,
            });
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[#70C7BA] animate-spin mx-auto mb-4" />
          <p className="text-white/60">Confirming your deposit...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
          {/* Success Animation */}
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
            <div className="relative w-full h-full bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-white" />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold text-white mb-2">Deposit Successful!</h1>
          <p className="text-white/60 mb-8">
            Your funds have been added to your wallet
          </p>
          
          {depositInfo && (
            <div className="bg-gradient-to-r from-[#70C7BA]/10 to-[#49EACB]/10 border border-[#70C7BA]/30 rounded-xl p-6 mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <KaspaIcon size={40} className="rounded-lg" />
                <div className="text-left">
                  <p className="text-2xl font-bold text-white">+{depositInfo.kasAmount} KAS</p>
                  <p className="text-sm text-white/50">
                    {depositInfo.currency.toUpperCase()} {depositInfo.amount} deposited
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <button
            onClick={onBack}
            className="w-full py-4 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white font-semibold rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-2"
          >
            Back to Home
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
