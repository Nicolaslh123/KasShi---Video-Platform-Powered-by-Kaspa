import { useState, useEffect } from 'react';
import { ArrowLeft, Copy, CheckCircle, Link as LinkIcon, QrCode as QrCodeIcon, Clock, DollarSign } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface PaymentRequestProps {
  onBack: () => void;
}

interface Request {
  id: string;
  amount: string;
  currency: string;
  note: string;
  from: string;
  status: 'pending' | 'paid' | 'cancelled';
  createdAt: string;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'KAS'];

export default function PaymentRequest({ onBack }: PaymentRequestProps) {
  const [mode, setMode] = useState<'create' | 'view'>('create');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [note, setNote] = useState('');
  const [requests, setRequests] = useState<Request[]>([]);
  const [createdRequest, setCreatedRequest] = useState<Request | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  const userDomain = 'yourname.kas';
  
  useEffect(() => {
    loadRequests();
  }, []);
  
  const loadRequests = async () => {
    // TODO: Fetch from API
    const mockRequests: Request[] = [
      {
        id: 'req_abc123',
        amount: '50.00',
        currency: 'USD',
        note: 'Dinner split',
        from: 'sarah.kas',
        status: 'pending',
        createdAt: new Date(Date.now() - 120000).toISOString(),
      },
      {
        id: 'req_def456',
        amount: '100.00',
        currency: 'EUR',
        note: 'Concert tickets',
        from: 'john.kas',
        status: 'paid',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ];
    setRequests(mockRequests);
  };
  
  const createRequest = async () => {
    if (!amount) return;
    
    setIsCreating(true);
    
    // TODO: Call API to create request
    const newRequest: Request = {
      id: `req_${Date.now()}`,
      amount,
      currency,
      note,
      from: userDomain,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    
    setCreatedRequest(newRequest);
    setIsCreating(false);
  };
  
  const getRequestUrl = (requestId: string) => {
    return `${window.location.origin}/pay/${requestId}`;
  };
  
  const copyRequestLink = async (requestId: string) => {
    await navigator.clipboard.writeText(getRequestUrl(requestId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="text-white/60 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#70C7BA] to-[#49EACB] flex items-center justify-center shadow-lg shadow-teal-500/50">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white">Payment Requests</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Mode Toggle */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setMode('create')}
            className={`flex-1 py-4 rounded-lg font-semibold transition-all ${
              mode === 'create'
                ? 'bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white shadow-lg shadow-teal-500/30'
                : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
            }`}
          >
            Create Request
          </button>
          <button
            onClick={() => setMode('view')}
            className={`flex-1 py-4 rounded-lg font-semibold transition-all ${
              mode === 'view'
                ? 'bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white shadow-lg shadow-teal-500/30'
                : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
            }`}
          >
            My Requests ({requests.length})
          </button>
        </div>

        {/* Create Mode */}
        {mode === 'create' && !createdRequest && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-6">Create Payment Request</h2>
            
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
                    placeholder="0.00"
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
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Note (Optional)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What's this for?"
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#70C7BA] focus:border-transparent transition-all"
                />
              </div>

              {/* Create Button */}
              <button
                onClick={createRequest}
                disabled={!amount || isCreating}
                className="w-full py-4 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white font-semibold rounded-lg shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200"
              >
                {isCreating ? 'Creating...' : 'Create Request'}
              </button>
            </div>
          </div>
        )}

        {/* Created Request Display */}
        {mode === 'create' && createdRequest && (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-center gap-2 mb-6">
                <CheckCircle className="w-6 h-6 text-green-400" />
                <h2 className="text-2xl font-bold text-white">Request Created!</h2>
              </div>
              
              <div className="bg-white/5 border border-white/10 rounded-lg p-6 mb-6">
                <div className="text-center mb-4">
                  <p className="text-white/60 text-sm mb-2">Requesting</p>
                  <p className="text-4xl font-bold text-white">{createdRequest.amount} {createdRequest.currency}</p>
                  {createdRequest.note && (
                    <p className="text-white/60 text-sm mt-3">{createdRequest.note}</p>
                  )}
                </div>
                
                <div className="flex items-center justify-center gap-2 pt-4 border-t border-white/10">
                  <p className="text-white/40 text-sm">From:</p>
                  <p className="text-[#70C7BA] font-medium">{createdRequest.from}</p>
                </div>
              </div>

              {/* QR Code */}
              <div className="bg-white p-6 rounded-lg flex justify-center mb-6">
                <QRCodeSVG
                  value={getRequestUrl(createdRequest.id)}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>

              {/* Share Options */}
              <div className="space-y-3">
                <button
                  onClick={() => copyRequestLink(createdRequest.id)}
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
                
                <button
                  onClick={() => {
                    setCreatedRequest(null);
                    setAmount('');
                    setNote('');
                  }}
                  className="w-full px-6 py-3 bg-white/5 border border-white/10 text-white/60 font-medium rounded-lg hover:bg-white/10 hover:text-white transition-all"
                >
                  Create Another Request
                </button>
              </div>
            </div>

            <div className="bg-gradient-to-r from-[#70C7BA]/10 to-[#49EACB]/10 border border-[#70C7BA]/30 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-3">How to Share</h3>
              <ul className="space-y-2 text-white/60 text-sm">
                <li className="flex items-start gap-2">
                  <LinkIcon className="w-4 h-4 text-[#70C7BA] flex-shrink-0 mt-0.5" />
                  <span>Copy the payment link and share it via text, email, or messenger</span>
                </li>
                <li className="flex items-start gap-2">
                  <QrCodeIcon className="w-4 h-4 text-[#70C7BA] flex-shrink-0 mt-0.5" />
                  <span>Show the QR code to someone in person for instant payment</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* View Mode */}
        {mode === 'view' && (
          <div className="space-y-4">
            {requests.length === 0 ? (
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <DollarSign className="w-8 h-8 text-white/40" />
                </div>
                <p className="text-white/60 text-lg mb-2">No payment requests yet</p>
                <p className="text-white/40 text-sm">Create a request to get started</p>
              </div>
            ) : (
              requests.map((request) => (
                <div 
                  key={request.id}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="text-2xl font-bold text-white">{request.amount} {request.currency}</p>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          request.status === 'paid' 
                            ? 'bg-green-500/10 border border-green-400/30 text-green-400'
                            : request.status === 'cancelled'
                            ? 'bg-red-500/10 border border-red-400/30 text-red-400'
                            : 'bg-orange-500/10 border border-orange-400/30 text-orange-400'
                        }`}>
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </span>
                      </div>
                      {request.note && (
                        <p className="text-white/60 text-sm mb-3">{request.note}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-white/40">
                        <div className="flex items-center gap-1">
                          <span>From:</span>
                          <span className="text-[#70C7BA]">{request.from}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(request.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {request.status === 'pending' && (
                    <div className="flex gap-3 pt-4 border-t border-white/10">
                      <button
                        onClick={() => copyRequestLink(request.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white/10 border border-white/20 text-white text-sm font-medium rounded-lg hover:bg-white/20 transition-all"
                      >
                        {copied ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Share Link
                          </>
                        )}
                      </button>
                      <button className="px-4 py-2 bg-red-500/20 border border-red-400/30 text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/30 transition-all">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
