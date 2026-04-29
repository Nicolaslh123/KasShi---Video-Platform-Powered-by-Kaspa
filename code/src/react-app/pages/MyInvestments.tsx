import { useEffect, useState } from "react";
import { useWallet } from "@/react-app/contexts/WalletContext";
import LocalizedLink from "@/react-app/components/LocalizedLink";
import Navbar from "@/react-app/components/Navbar";
import ElectronTitleBar from "@/react-app/components/ElectronTitleBar";
import { PieChart, TrendingUp, Music, Loader2, ArrowLeft, Lock, Play, ChevronDown, ChevronUp, History, DollarSign } from "lucide-react";

interface PayoutRecord {
  amountKas: string;
  type: string;
  transactionId: string;
  createdAt: string;
}

interface ShareHolding {
  id: number;
  trackId: number;
  ticker: string;
  sharesOwned: number;
  purchasePriceKas: string;
  purchasedAt: string;
  trackTitle: string;
  coverArtUrl: string;
  artistName: string;
  artistHandle: string;
  totalShares: number;
  ownershipPercent: string;
  totalEarnedKas: string;
  fractionalPercentageSold: number;
  playCountAtPurchase: number;
  currentPlayCount: number;
  playsSinceInvestment: number;
  payoutHistory: PayoutRecord[];
}

export default function MyInvestments() {
  const { wallet, externalWallet } = useWallet();
  const isLoggedIn = !!(wallet?.address || externalWallet?.address);
  const authToken = externalWallet?.authToken || "";
  
  const [investments, setInvestments] = useState<ShareHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ totalInvested: 0, totalEarned: 0, totalShares: 0, uniqueTracks: 0 });

  useEffect(() => {
    if (!isLoggedIn) { setLoading(false); return; }

    const fetchInvestments = async () => {
      try {
        const headers: Record<string, string> = {};
        if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

        const res = await fetch("/api/kasshi/my-shares", { headers, credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch");

        const data = await res.json();
        const shares = data.shares || [];
        setInvestments(shares);

        setSummary({
          totalInvested: shares.reduce((sum: number, s: ShareHolding) => sum + parseFloat(s.purchasePriceKas || "0"), 0),
          totalEarned: shares.reduce((sum: number, s: ShareHolding) => sum + parseFloat(s.totalEarnedKas || "0"), 0),
          totalShares: shares.reduce((sum: number, s: ShareHolding) => sum + s.sharesOwned, 0),
          uniqueTracks: shares.length
        });
      } catch (error) {
        console.error("Failed to fetch investments:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchInvestments();
  }, [isLoggedIn, authToken]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-950">
        <ElectronTitleBar />
        <Navbar />
        <div className="container mx-auto px-4 pt-24 flex flex-col items-center justify-center py-20">
          <Lock className="w-16 h-16 text-slate-500 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Login Required</h2>
          <p className="text-slate-400">Connect your wallet to view your investments</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <ElectronTitleBar />
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-32">
        <div className="mb-8">
          <LocalizedLink to="/music" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Music
          </LocalizedLink>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-500/20"><PieChart className="w-8 h-8 text-purple-400" /></div>
            <div>
              <h1 className="text-3xl font-bold text-white">My Investments</h1>
              <p className="text-slate-400">Track shares you own and earnings from music plays</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Tracks Owned", value: summary.uniqueTracks },
            { label: "Total Shares", value: summary.totalShares.toLocaleString() },
            { label: "Total Invested", value: `${summary.totalInvested.toFixed(2)} KAS`, color: "text-purple-400" },
            { label: "Total Earned", value: `${summary.totalEarned.toFixed(4)} KAS`, color: "text-green-400", icon: TrendingUp }
          ].map((item, i) => (
            <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
              <div className={`text-2xl font-bold flex items-center gap-2 ${item.color || "text-white"}`}>
                {item.icon && <item.icon className="w-5 h-5" />}{item.value}
              </div>
              <div className="text-sm text-slate-400">{item.label}</div>
            </div>
          ))}
        </div>

        {loading && (
          <div className="flex flex-col items-center py-20">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin mb-4" />
            <p className="text-slate-400">Loading your investments...</p>
          </div>
        )}

        {!loading && investments.length === 0 && (
          <div className="flex flex-col items-center py-20 text-center">
            <div className="p-4 rounded-full bg-slate-800/50 mb-4"><Music className="w-12 h-12 text-slate-500" /></div>
            <h3 className="text-xl font-semibold text-white mb-2">No investments yet</h3>
            <p className="text-slate-400 mb-6 max-w-md">When you buy shares in fractionalized tracks, they'll appear here.</p>
            <LocalizedLink to="/music" className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium">
              Discover Music
            </LocalizedLink>
          </div>
        )}

        {!loading && investments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {investments.map((inv) => (
              <InvestmentCard key={inv.id} investment={inv} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InvestmentCard({ investment: inv }: { investment: ShareHolding }) {
  const [showHistory, setShowHistory] = useState(false);
  
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden hover:border-purple-500/50 transition-colors">
      <div className="relative">
        {inv.coverArtUrl ? (
          <img src={inv.coverArtUrl} alt={inv.trackTitle} className="w-full h-40 object-cover" />
        ) : (
          <div className="w-full h-40 bg-slate-800 flex items-center justify-center"><Music className="w-12 h-12 text-slate-600" /></div>
        )}
        <span className="absolute top-3 right-3 bg-purple-600 text-white text-xs px-2 py-1 rounded">${inv.ticker}</span>
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold text-white truncate">{inv.trackTitle}</h3>
        <p className="text-slate-400 text-sm mb-3">by {inv.artistName || inv.artistHandle}</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-400">Ownership</span><span className="text-white">{inv.sharesOwned.toLocaleString()} ({inv.ownershipPercent}%)</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Invested</span><span className="text-white">{parseFloat(inv.purchasePriceKas || "0").toFixed(4)} KAS</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Earned</span><span className="text-green-400">{parseFloat(inv.totalEarnedKas || "0").toFixed(4)} KAS</span></div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400 flex items-center gap-1"><Play className="w-3 h-3" /> Plays since</span>
            <span className="text-cyan-400">{inv.playsSinceInvestment.toLocaleString()}</span>
          </div>
        </div>
        
        {/* Payout History Toggle */}
        {inv.payoutHistory && inv.payoutHistory.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-700">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center justify-between w-full text-sm text-slate-300 hover:text-white transition-colors"
            >
              <span className="flex items-center gap-2">
                <History className="w-4 h-4" />
                Payout History ({inv.payoutHistory.length})
              </span>
              {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {showHistory && (
              <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                {inv.payoutHistory.map((payout, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs bg-slate-800/50 rounded px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-3 h-3 text-green-400" />
                      <span className="text-green-400">+{parseFloat(payout.amountKas).toFixed(6)} KAS</span>
                    </div>
                    <span className="text-slate-500">
                      {new Date(payout.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* No payouts yet */}
        {(!inv.payoutHistory || inv.payoutHistory.length === 0) && (
          <div className="mt-4 pt-3 border-t border-slate-700">
            <p className="text-xs text-slate-500 text-center">No earnings yet — payouts happen when the track is purchased</p>
          </div>
        )}
      </div>
    </div>
  );
}
