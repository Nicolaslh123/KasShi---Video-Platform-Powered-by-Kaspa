import { useState, useEffect } from 'react';
import { ArrowLeft, Search, Filter, Download, ArrowUpRight, ArrowDownLeft, Calendar, ExternalLink, ChevronDown } from 'lucide-react';
import { useKaspaApi } from '../hooks/useKaspaApi';
import TransactionExport from '../components/TransactionExport';

interface Transaction {
  id: string;
  type: 'sent' | 'received';
  to: string;
  from: string;
  amount: string;
  currency: string;
  kasAmount: string;
  timestamp: string;
  status: string;
  txHash?: string;
}

interface TransactionHistoryProps {
  onBack: () => void;
}

export default function TransactionHistory({ onBack }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'sent' | 'received'>('all');
  const [filterCurrency, setFilterCurrency] = useState<'all' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'KAS'>('all');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  
  const api = useKaspaApi();
  const userWalletAddress = 'kaspa:qzexampleuseraddress123';
  const userDomain = 'yourname.kas';
  
  useEffect(() => {
    loadTransactions();
  }, []);
  
  useEffect(() => {
    applyFilters();
  }, [transactions, searchQuery, filterType, filterCurrency]);
  
  const loadTransactions = async () => {
    const history = await api.getTransactionHistory(userWalletAddress);
    if (history) {
      const txs = history.map((tx: any) => ({
        id: tx.id,
        type: tx.type || 'sent',
        to: tx.to,
        from: tx.from || userDomain,
        amount: tx.amount,
        currency: tx.currency,
        kasAmount: tx.kasAmount || '0',
        timestamp: tx.timestamp,
        status: tx.status,
        txHash: tx.txHash,
      }));
      setTransactions(txs);
    }
  };
  
  const applyFilters = () => {
    let filtered = [...transactions];
    
    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(tx => tx.type === filterType);
    }
    
    // Filter by currency
    if (filterCurrency !== 'all') {
      filtered = filtered.filter(tx => tx.currency === filterCurrency);
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(tx => 
        tx.to.toLowerCase().includes(query) ||
        tx.from.toLowerCase().includes(query) ||
        tx.amount.includes(query) ||
        tx.currency.toLowerCase().includes(query)
      );
    }
    
    setFilteredTransactions(filtered);
  };
  
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };
  
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };
  
  const groupByDate = (txs: Transaction[]) => {
    const groups: { [key: string]: Transaction[] } = {};
    
    txs.forEach(tx => {
      const date = formatDate(tx.timestamp);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(tx);
    });
    
    return groups;
  };
  
  const groupedTransactions = groupByDate(filteredTransactions);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950">
      {/* Export Modal */}
      {showExportModal && (
        <TransactionExport
          transactions={transactions}
          onClose={() => setShowExportModal(false)}
        />
      )}

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
              <h1 className="text-2xl font-bold text-white">Transaction History</h1>
            </div>
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-all"
            >
              <Download className="w-4 h-4" />
              Export for Taxes
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transactions..."
                className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#70C7BA] focus:border-transparent transition-all"
              />
            </div>
            
            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white hover:bg-white/10 transition-all"
            >
              <Filter className="w-5 h-5" />
              Filters
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>
          
          {/* Filter Options */}
          {showFilters && (
            <div className="grid sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/10">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Transaction Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#70C7BA] transition-all cursor-pointer"
                >
                  <option value="all" className="bg-slate-900">All Transactions</option>
                  <option value="sent" className="bg-slate-900">Sent</option>
                  <option value="received" className="bg-slate-900">Received</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Currency</label>
                <select
                  value={filterCurrency}
                  onChange={(e) => setFilterCurrency(e.target.value as any)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#70C7BA] transition-all cursor-pointer"
                >
                  <option value="all" className="bg-slate-900">All Currencies</option>
                  <option value="USD" className="bg-slate-900">USD</option>
                  <option value="EUR" className="bg-slate-900">EUR</option>
                  <option value="GBP" className="bg-slate-900">GBP</option>
                  <option value="JPY" className="bg-slate-900">JPY</option>
                  <option value="KAS" className="bg-slate-900">KAS</option>
                </select>
              </div>
            </div>
          )}
          
          {/* Results count */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-sm text-white/60">
              Showing {filteredTransactions.length} of {transactions.length} transactions
            </p>
          </div>
        </div>

        {/* Transaction List */}
        <div className="space-y-6">
          {Object.entries(groupedTransactions).map(([date, txs]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-white/40" />
                <h3 className="text-sm font-semibold text-white/80">{date}</h3>
              </div>
              
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                {txs.map((tx, index) => (
                  <div key={tx.id}>
                    <button
                      onClick={() => setSelectedTransaction(tx)}
                      className="w-full p-6 hover:bg-white/5 transition-colors text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          {/* Icon */}
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                            tx.type === 'sent' 
                              ? 'bg-gradient-to-br from-orange-400 to-red-600' 
                              : 'bg-gradient-to-br from-green-400 to-emerald-600'
                          }`}>
                            {tx.type === 'sent' ? (
                              <ArrowUpRight className="w-6 h-6 text-white" />
                            ) : (
                              <ArrowDownLeft className="w-6 h-6 text-white" />
                            )}
                          </div>
                          
                          {/* Details */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-white font-semibold">
                                {tx.type === 'sent' ? 'Sent to' : 'Received from'}
                              </p>
                              <p className="text-[#70C7BA] font-medium">
                                {tx.type === 'sent' ? tx.to : tx.from}
                              </p>
                            </div>
                            <p className="text-sm text-white/40">{formatTime(tx.timestamp)}</p>
                          </div>
                          
                          {/* Amount */}
                          <div className="text-right">
                            <p className={`text-xl font-bold ${
                              tx.type === 'sent' ? 'text-red-400' : 'text-green-400'
                            }`}>
                              {tx.type === 'sent' ? '-' : '+'}{tx.amount} {tx.currency}
                            </p>
                            <p className="text-sm text-white/40 mt-1">
                              {tx.kasAmount} KAS
                            </p>
                          </div>
                        </div>
                      </div>
                    </button>
                    {index < txs.length - 1 && <div className="border-t border-white/10" />}
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          {filteredTransactions.length === 0 && (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-white/40" />
              </div>
              <p className="text-white/60 text-lg mb-2">No transactions found</p>
              <p className="text-white/40 text-sm">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </main>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedTransaction(null)}
        >
          <div 
            className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-2xl p-8 max-w-2xl w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Transaction Details</h2>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="text-white/60 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
            
            {/* Transaction Type Badge */}
            <div className="mb-6">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
                selectedTransaction.type === 'sent' 
                  ? 'bg-red-500/10 border border-red-400/30' 
                  : 'bg-green-500/10 border border-green-400/30'
              }`}>
                {selectedTransaction.type === 'sent' ? (
                  <ArrowUpRight className="w-4 h-4 text-red-400" />
                ) : (
                  <ArrowDownLeft className="w-4 h-4 text-green-400" />
                )}
                <span className={`font-medium ${
                  selectedTransaction.type === 'sent' ? 'text-red-400' : 'text-green-400'
                }`}>
                  {selectedTransaction.type === 'sent' ? 'Sent' : 'Received'}
                </span>
              </div>
            </div>
            
            <div className="space-y-4 mb-6">
              <div className="flex items-center justify-between py-3 border-b border-white/10">
                <span className="text-white/60">Amount</span>
                <span className={`text-2xl font-bold ${
                  selectedTransaction.type === 'sent' ? 'text-red-400' : 'text-green-400'
                }`}>
                  {selectedTransaction.amount} {selectedTransaction.currency}
                </span>
              </div>
              
              <div className="flex items-center justify-between py-3 border-b border-white/10">
                <span className="text-white/60">KAS Amount</span>
                <span className="text-white font-semibold">{selectedTransaction.kasAmount} KAS</span>
              </div>
              
              <div className="flex items-center justify-between py-3 border-b border-white/10">
                <span className="text-white/60">{selectedTransaction.type === 'sent' ? 'To' : 'From'}</span>
                <span className="text-[#70C7BA] font-medium">
                  {selectedTransaction.type === 'sent' ? selectedTransaction.to : selectedTransaction.from}
                </span>
              </div>
              
              <div className="flex items-center justify-between py-3 border-b border-white/10">
                <span className="text-white/60">Date & Time</span>
                <span className="text-white">
                  {formatDate(selectedTransaction.timestamp)} at {formatTime(selectedTransaction.timestamp)}
                </span>
              </div>
              
              <div className="flex items-center justify-between py-3 border-b border-white/10">
                <span className="text-white/60">Status</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-400/30">
                  <div className="w-2 h-2 rounded-full bg-green-400"></div>
                  <span className="text-green-400 text-sm font-medium">Completed</span>
                </span>
              </div>
              
              {selectedTransaction.txHash && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-white/60">Transaction Hash</span>
                  <button className="flex items-center gap-2 text-[#70C7BA] hover:text-[#49EACB] transition-colors">
                    <span className="font-mono text-sm">{selectedTransaction.txHash.slice(0, 16)}...</span>
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            
            <div className="bg-gradient-to-r from-[#70C7BA]/10 to-[#49EACB]/10 border border-[#70C7BA]/30 rounded-lg p-4">
              <p className="text-xs text-white/60 mb-2">Transaction Flow</p>
              <p className="text-sm text-white/80">
                {selectedTransaction.currency === 'KAS' 
                  ? 'Direct KAS transfer via Kaspa L1 blockchain'
                  : `${selectedTransaction.currency} → KAS → ${selectedTransaction.currency} conversion`
                }
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
