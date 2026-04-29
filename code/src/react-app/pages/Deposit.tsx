import { useState } from 'react';
import { ArrowLeft, Wallet, Copy, CheckCircle, Shield, Zap } from 'lucide-react';
import QRCode from 'react-qr-code';

interface DepositProps {
  onBack: () => void;
}

export default function Deposit({ onBack }: DepositProps) {
  const [copied, setCopied] = useState<string | null>(null);
  
  // User's wallet address for receiving
  const userWalletAddress = 'kaspa:qzexampleuseraddress123';
  const userDomain = 'yourname.kas';
  
  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Receive KAS</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Crypto Deposit */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-600/20 border border-green-500/30 flex items-center justify-center">
              <Wallet className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Receive KAS</h2>
            <p className="text-white/60 text-sm">
              Share your address or QR code to receive Kaspa from any wallet
            </p>
          </div>

          {/* QR Code */}
          <div className="bg-white rounded-2xl p-6 mb-6 mx-auto max-w-[260px]">
            <QRCode
              value={userWalletAddress}
              size={200}
              level="H"
              className="w-full h-auto"
            />
          </div>

          {/* Wallet Address */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                Your Kaspa Wallet Address
              </label>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-4">
                <p className="flex-1 text-white font-mono text-sm break-all">{userWalletAddress}</p>
                <button
                  onClick={() => copyToClipboard(userWalletAddress, 'wallet')}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex-shrink-0"
                >
                  {copied === 'wallet' ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <Copy className="w-5 h-5 text-white/60" />
                  )}
                </button>
              </div>
            </div>

            {/* KNS Domain */}
            {userDomain !== 'yourname.kas' && (
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">
                  Or share your KNS domain
                </label>
                <div className="flex items-center gap-2 bg-gradient-to-r from-[#70C7BA]/10 to-[#49EACB]/10 border border-[#70C7BA]/30 rounded-lg p-4">
                  <p className="flex-1 text-white font-semibold">{userDomain}</p>
                  <button
                    onClick={() => copyToClipboard(userDomain, 'domain')}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex-shrink-0"
                  >
                    {copied === 'domain' ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <Copy className="w-5 h-5 text-white/60" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Benefits */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <h3 className="text-sm font-semibold text-white mb-4">Why use crypto?</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-white">Zero Fees</span>
                </div>
                <p className="text-xs text-white/50">No processing fees</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-white">Private</span>
                </div>
                <p className="text-xs text-white/50">Self-custody wallet</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-white">Fast</span>
                </div>
                <p className="text-xs text-white/50">Confirms in seconds</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-white">No Limits</span>
                </div>
                <p className="text-xs text-white/50">Receive any amount</p>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-400/30 rounded-lg">
            <p className="text-xs text-blue-400/80">
              <span className="font-semibold text-blue-400">Send only Kaspa (KAS)</span> to this address. 
              Sending other cryptocurrencies may result in permanent loss.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
