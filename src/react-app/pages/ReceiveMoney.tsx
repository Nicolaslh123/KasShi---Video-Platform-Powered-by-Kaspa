import { useState } from 'react';
import { ArrowLeft, Copy, CheckCircle, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { KaspaIcon } from '../components/KasShiLogo';

interface ReceiveMoneyProps {
  onBack: () => void;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'KAS'];

export default function ReceiveMoney({ onBack }: ReceiveMoneyProps) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  
  const userDomain = 'yourname.kas';
  
  const paymentUrl = amount 
    ? `${window.location.origin}/pay/${userDomain}?amount=${amount}&currency=${currency}${note ? `&note=${encodeURIComponent(note)}` : ''}`
    : userDomain;
  
  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const sharePayment = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Send me money on Kaspay',
          text: amount 
            ? `Send me ${amount} ${currency}${note ? ` for ${note}` : ''} on Kaspay`
            : `Send me money on Kaspay`,
          url: paymentUrl,
        });
      } catch (err) {
        // User cancelled or share failed
        copyToClipboard(paymentUrl);
      }
    } else {
      copyToClipboard(paymentUrl);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <KaspaIcon size={40} className="rounded-xl shadow-lg shadow-teal-500/50" />
              <h1 className="text-2xl font-bold text-white">Receive Money</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Payment Details Form */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-6">Request Amount (Optional)</h2>
            
            <div className="space-y-6">
              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Request Amount
                </label>
                <div className="flex gap-3">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Leave empty for any amount"
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#70C7BA] focus:border-transparent transition-all"
                  />
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#70C7BA] focus:border-transparent transition-all cursor-pointer"
                  >
                    {CURRENCIES.map(curr => (
                      <option key={curr} value={curr} className="bg-slate-900">{curr}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-white/40 mt-2">
                  Leave blank to let the sender choose the amount
                </p>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Add a Note (Optional)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What's this payment for?"
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#70C7BA] focus:border-transparent transition-all"
                />
              </div>

              {/* Payment Address */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Your Payment Address
                </label>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-4">
                  <p className="flex-1 text-white font-mono text-lg">{userDomain}</p>
                  <button
                    onClick={() => copyToClipboard(userDomain)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    {copied ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <Copy className="w-5 h-5 text-white/60" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-white/40 mt-2">
                  Share this address to receive payments in any currency
                </p>
              </div>
            </div>
          </div>

          {/* QR Code & Share */}
          <div className="space-y-6">
            {/* QR Code Card */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
              <h3 className="text-lg font-semibold text-white mb-6 text-center">
                {amount ? `Request ${amount} ${currency}` : 'Scan to Pay'}
              </h3>
              
              {/* QR Code */}
              <div className="bg-white p-6 rounded-2xl flex justify-center mb-6">
                <QRCodeSVG
                  value={paymentUrl}
                  size={240}
                  level="H"
                  includeMargin={true}
                />
              </div>
              
              {note && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6 text-center">
                  <p className="text-white/60 text-sm mb-1">Note</p>
                  <p className="text-white font-medium">{note}</p>
                </div>
              )}
              
              {/* Share Buttons */}
              <div className="space-y-3">
                <button
                  onClick={sharePayment}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white font-semibold rounded-lg shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 hover:scale-[1.02] transition-all"
                >
                  <Share2 className="w-5 h-5" />
                  Share Payment Request
                </button>
                
                <button
                  onClick={() => copyToClipboard(paymentUrl)}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white/10 border border-white/20 text-white font-medium rounded-lg hover:bg-white/20 transition-all"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-400" />
                      Link Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-5 h-5" />
                      Copy Payment Link
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* How to Use */}
            <div className="bg-gradient-to-r from-[#70C7BA]/10 to-[#49EACB]/10 border border-[#70C7BA]/30 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-3">How to Receive Money</h3>
              <ul className="space-y-2 text-white/60 text-sm">
                <li className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#70C7BA]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[#70C7BA] text-xs font-bold">1</span>
                  </div>
                  <span>Share your QR code or payment link with the sender</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#70C7BA]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[#70C7BA] text-xs font-bold">2</span>
                  </div>
                  <span>They scan the code or open the link to send you money</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#70C7BA]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[#70C7BA] text-xs font-bold">3</span>
                  </div>
                  <span>Receive funds instantly in any currency you prefer</span>
                </li>
              </ul>
            </div>

            {/* Security Info */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <h3 className="text-white font-semibold">Safe & Secure</h3>
              </div>
              <ul className="space-y-2 text-white/60 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Your funds are secured on the Kaspa blockchain</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span>No personal banking information needed</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span>Instant settlement, no chargebacks</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
