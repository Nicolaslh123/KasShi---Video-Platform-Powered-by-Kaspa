import { useState, useEffect } from 'react';
import { Copy, CheckCircle, ArrowDown, ArrowUp, RefreshCw, Eye, EyeOff, Loader2, Plus, Clock, CreditCard } from 'lucide-react';
import { useKaspaApi } from '../hooks/useKaspaApi';
import { useExchangeRates, CurrencyCode } from '../hooks/useExchangeRates';
import ReceiveMoney from './ReceiveMoney';
import LiveBalance from '../components/LiveBalance';
import { KaspaIcon } from '../components/KasShiLogo';

interface WalletProps {
  onBack: () => void;
}

interface DepositRecord {
  id: number;
  deposit_id: string;
  amount_fiat: number;
  currency: string;
  amount_kas: number;
  status: string;
  created_at: string;
}

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  CAD: '🇨🇦', AUD: '🇦🇺', CHF: '🇨🇭', CNY: '🇨🇳',
  INR: '🇮🇳', KRW: '🇰🇷', SGD: '🇸🇬', HKD: '🇭🇰',
  BRL: '🇧🇷', MXN: '🇲🇽', SEK: '🇸🇪', NOK: '🇳🇴',
  DKK: '🇩🇰', NZD: '🇳🇿', ZAR: '🇿🇦', AED: '🇦🇪',
};

const PRIMARY_CURRENCIES: CurrencyCode[] = ['USD', 'EUR', 'GBP', 'JPY'];
const SECONDARY_CURRENCIES: CurrencyCode[] = ['CAD', 'AUD', 'CHF', 'CNY', 'INR', 'KRW'];

export default function WalletPage({ onBack }: WalletProps) {
  const [walletBalance, setWalletBalance] = useState({ fiat: '0.00', kas: '0.00' });
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  const [preferredCurrency, setPreferredCurrency] = useState<CurrencyCode>('USD');
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [loadingDeposits, setLoadingDeposits] = useState(true);
  
  const api = useKaspaApi();
  const { rates, loading: ratesLoading, kasToFiat, formatFiat, lastUpdated, refresh: refreshRates } = useExchangeRates();
  
  const userWalletAddress = 'kaspa:qzexampleuseraddress123';
  const userDomain = 'yourname.kas';
  
  const kasBalanceNum = parseFloat(walletBalance.kas.replace(/,/g, '')) || 0;
  
  // Load preferred currency from settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const settings = await response.json();
          if (settings?.preferred_currency) {
            setPreferredCurrency(settings.preferred_currency as CurrencyCode);
          }
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    loadSettings();
  }, []);
  
  useEffect(() => {
    loadWalletData();
    loadDepositHistory();
  }, []);
  
  const loadWalletData = async () => {
    const balance = await api.getWalletBalance(userWalletAddress);
    if (balance) {
      setWalletBalance({ fiat: balance.balanceUSD, kas: balance.balanceKAS });
    }
  };

  const loadDepositHistory = async () => {
    setLoadingDeposits(true);
    try {
      const response = await fetch('/api/deposits/history');
      if (response.ok) {
        const data = await response.json();
        setDeposits(data.deposits || []);
      }
    } catch (err) {
      console.error('Failed to load deposits:', err);
    } finally {
      setLoadingDeposits(false);
    }
  };
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadWalletData(), refreshRates(), loadDepositHistory()]);
    setTimeout(() => setIsRefreshing(false), 500);
  };
  
  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400 bg-green-400/10';
      case 'pending': return 'text-yellow-400 bg-yellow-400/10';
      case 'failed': return 'text-red-400 bg-red-400/10';
      default: return 'text-white/60 bg-white/10';
    }
  };
  
  // Get displayed currencies
  const displayedCurrencies = showAllCurrencies 
    ? [...PRIMARY_CURRENCIES, ...SECONDARY_CURRENCIES]
    : PRIMARY_CURRENCIES;

  if (showReceive) {
    return <ReceiveMoney onBack={() => setShowReceive(false)} />;
  }

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
                ← Back
              </button>
              <div className="flex items-center gap-3">
                <KaspaIcon size={40} className="rounded-xl shadow-lg shadow-teal-500/50" />
                <h1 className="text-2xl font-bold text-white">Wallet</h1>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Balance Card */}
          <div className="lg:col-span-2 space-y-6">
            {/* Total Balance */}
            <div className="bg-gradient-to-br from-[#70C7BA]/10 via-[#49EACB]/10 to-[#70C7BA]/10 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-white/60 text-sm">Total Balance</p>
                    {ratesLoading && <Loader2 className="w-3 h-3 text-white/40 animate-spin" />}
                  </div>
                  <LiveBalance 
                    balanceKAS={walletBalance.kas} 
                    preferredCurrency={preferredCurrency as 'USD' | 'EUR' | 'GBP' | 'JPY'}
                    showKAS={true}
                    size="lg"
                  />
                </div>
                <button
                  onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all text-sm"
                >
                  {showTechnicalDetails ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showTechnicalDetails ? 'Hide' : 'Show'} Technical
                </button>
              </div>
              
              <div className="flex items-center gap-3 pt-6 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-sm text-white/60">Live rates</span>
                </div>
                {lastUpdated && (
                  <span className="text-white/40 text-sm">
                    Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>

            {/* Multi-Currency Balances */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Balance by Currency</h2>
                <button
                  onClick={() => setShowAllCurrencies(!showAllCurrencies)}
                  className="text-sm text-[#70C7BA] hover:text-[#49EACB] transition-colors"
                >
                  {showAllCurrencies ? 'Show Less' : 'Show More'}
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {displayedCurrencies.map((currency) => {
                  const fiatValue = kasToFiat(kasBalanceNum, currency);
                  const isPreferred = currency === preferredCurrency;
                  
                  return (
                    <div 
                      key={currency}
                      className={`bg-white/5 border rounded-lg p-4 hover:bg-white/10 transition-colors cursor-pointer ${
                        isPreferred ? 'border-[#70C7BA]/50 ring-1 ring-[#70C7BA]/30' : 'border-white/10'
                      }`}
                      onClick={() => setPreferredCurrency(currency)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-xl">
                            {CURRENCY_FLAGS[currency]}
                          </div>
                          <div>
                            <p className="text-white/60 text-xs">{currency}</p>
                            <p className="text-white font-semibold text-lg">
                              {formatFiat(fiatValue, currency)}
                            </p>
                          </div>
                        </div>
                        {isPreferred && (
                          <CheckCircle className="w-5 h-5 text-[#70C7BA]" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-white/40 mt-4 text-center">
                Click to set as your preferred display currency • Values update in real-time
              </p>
            </div>

            {/* Deposit History */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-green-400" />
                  <h2 className="text-lg font-semibold text-white">Deposit History</h2>
                </div>
                {loadingDeposits && <Loader2 className="w-4 h-4 text-white/40 animate-spin" />}
              </div>
              
              {deposits.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-white/40" />
                  </div>
                  <p className="text-white/60 text-sm">No deposits yet</p>
                  <p className="text-white/40 text-xs mt-1">Add money to see your deposit history here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {deposits.slice(0, 5).map((deposit) => (
                    <div 
                      key={deposit.id}
                      className="bg-white/5 border border-white/10 rounded-lg p-4 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-green-400/10 flex items-center justify-center">
                            <Plus className="w-5 h-5 text-green-400" />
                          </div>
                          <div>
                            <p className="text-white font-medium">
                              +{formatFiat(deposit.amount_fiat, deposit.currency)}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Clock className="w-3 h-3 text-white/40" />
                              <span className="text-xs text-white/40">{formatTimestamp(deposit.created_at)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(deposit.status)}`}>
                            {deposit.status.charAt(0).toUpperCase() + deposit.status.slice(1)}
                          </span>
                          {showTechnicalDetails && (
                            <p className="text-xs text-white/40 mt-1">+{deposit.amount_kas.toFixed(4)} KAS</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {deposits.length > 5 && (
                    <p className="text-xs text-white/40 text-center pt-2">
                      Showing 5 of {deposits.length} deposits
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Wallet Address */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-lg font-semibold text-white mb-4">Wallet Details</h2>
              
              <div className="space-y-4">
                {/* Payment Address */}
                <div>
                  <p className="text-sm text-white/60 mb-2">Payment Address</p>
                  <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-3">
                    <p className="flex-1 text-white font-mono text-sm">{userDomain}</p>
                    <button
                      onClick={() => copyToClipboard(userDomain)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      {copied ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-white/60" />
                      )}
                    </button>
                  </div>
                </div>
                
                {/* Wallet Address (Technical) */}
                {showTechnicalDetails && (
                  <div>
                    <p className="text-sm text-white/60 mb-2">Kaspa Wallet Address</p>
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-3">
                      <p className="flex-1 text-white font-mono text-xs break-all">{userWalletAddress}</p>
                      <button
                        onClick={() => copyToClipboard(userWalletAddress)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        {copied ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4 text-white/60" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Quick Actions */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button 
                  onClick={() => setShowReceive(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-green-500/30 transition-all"
                >
                  <ArrowDown className="w-4 h-4" />
                  Receive Money
                </button>
                <button 
                  onClick={onBack}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white font-medium rounded-lg hover:shadow-lg hover:shadow-teal-500/30 transition-all"
                >
                  <ArrowUp className="w-4 h-4" />
                  Send Money
                </button>
              </div>
            </div>

            {/* Live Exchange Rates */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white/80">Live Exchange Rates</h3>
                {ratesLoading && <Loader2 className="w-3 h-3 text-white/40 animate-spin" />}
              </div>
              <div className="space-y-3">
                {PRIMARY_CURRENCIES.map((currency) => (
                  <div key={currency} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{CURRENCY_FLAGS[currency]}</span>
                      <span className="text-sm text-white/60">1 KAS</span>
                    </div>
                    <span className="text-sm font-semibold text-white">
                      {formatFiat(rates[currency] || 0, currency)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <p className="text-xs text-white/40">
                    Auto-updates every 30 seconds
                  </p>
                </div>
              </div>
            </div>

            {/* KAS Balance Card */}
            <div className="bg-gradient-to-r from-[#70C7BA]/10 to-[#49EACB]/10 border border-[#70C7BA]/30 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <KaspaIcon size={32} className="rounded-lg" />
                <div>
                  <p className="text-xs text-white/60">Kaspa Holdings</p>
                  <p className="text-xl font-bold text-white">{walletBalance.kas} KAS</p>
                </div>
              </div>
              <p className="text-xs text-white/50">
                All your funds are stored securely on the Kaspa blockchain. 
                Fiat values are calculated using live exchange rates.
              </p>
            </div>

            {/* Security Info */}
            {showTechnicalDetails && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white mb-3">Security</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <p className="text-xs text-white/60">Self-custody wallet</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <p className="text-xs text-white/60">Secured on Kaspa blockchain</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <p className="text-xs text-white/60">Non-custodial storage</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <p className="text-xs text-white/60">Real-time rate verification</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
