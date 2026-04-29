import { useState, useEffect } from "react";
import { ArrowLeft, Download, Loader2, Shield, Database, Users, Video, Music, CreditCard, MessageSquare, ListMusic, UserPlus, Eye, Star, Crown, ShoppingBag, Radio } from "lucide-react";
import LocalizedLink from "../components/LocalizedLink";
import { useElectronTitleBar } from "../components/ElectronTitleBar";
import { useLocalizedNavigate } from "../components/LanguageRouter";
import { useWallet } from "../contexts/WalletContext";
import toast from "react-hot-toast";

interface ExportButton {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const EXPORT_TABLES: ExportButton[] = [
  {
    id: "users",
    label: "Users & Wallets",
    description: "All user accounts, wallets, and balances",
    icon: <Users className="w-6 h-6" />,
    color: "teal"
  },
  {
    id: "channels",
    label: "Channels",
    description: "All video channels and their settings",
    icon: <Radio className="w-6 h-6" />,
    color: "blue"
  },
  {
    id: "videos",
    label: "Videos",
    description: "All uploaded videos and metadata",
    icon: <Video className="w-6 h-6" />,
    color: "purple"
  },
  {
    id: "music_profiles",
    label: "Music Profiles",
    description: "All music artist profiles",
    icon: <Music className="w-6 h-6" />,
    color: "pink"
  },
  {
    id: "tracks",
    label: "Music Tracks",
    description: "All uploaded music tracks",
    icon: <Music className="w-6 h-6" />,
    color: "orange"
  },
  {
    id: "albums",
    label: "Albums",
    description: "All music albums",
    icon: <ListMusic className="w-6 h-6" />,
    color: "yellow"
  },
  {
    id: "playlists",
    label: "Playlists",
    description: "All user playlists",
    icon: <ListMusic className="w-6 h-6" />,
    color: "green"
  },
  {
    id: "payments",
    label: "Payments & Transactions",
    description: "All micropayments, pending balances, settlements",
    icon: <CreditCard className="w-6 h-6" />,
    color: "emerald"
  },
  {
    id: "comments",
    label: "Comments",
    description: "All video comments",
    icon: <MessageSquare className="w-6 h-6" />,
    color: "cyan"
  },
  {
    id: "video_views",
    label: "Video Views",
    description: "All video view records",
    icon: <Eye className="w-6 h-6" />,
    color: "indigo"
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    description: "Channel subscriptions and followers",
    icon: <UserPlus className="w-6 h-6" />,
    color: "violet"
  },
  {
    id: "memberships",
    label: "Memberships",
    description: "Channel membership tiers and members",
    icon: <Crown className="w-6 h-6" />,
    color: "amber"
  },
  {
    id: "referrals",
    label: "Referrals",
    description: "Referral program data",
    icon: <UserPlus className="w-6 h-6" />,
    color: "rose"
  },
  {
    id: "reviews",
    label: "Track Reviews",
    description: "Music track reviews and ratings",
    icon: <Star className="w-6 h-6" />,
    color: "yellow"
  },
  {
    id: "marketplace",
    label: "Marketplace",
    description: "Theme marketplace data",
    icon: <ShoppingBag className="w-6 h-6" />,
    color: "fuchsia"
  },
  {
    id: "all",
    label: "All Tables Summary",
    description: "Download row counts for all tables",
    icon: <Database className="w-6 h-6" />,
    color: "slate"
  }
];

export default function ExportData() {
  const navigate = useLocalizedNavigate();
  const { titleBarPadding } = useElectronTitleBar();
  const { externalWallet } = useWallet();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const headers: Record<string, string> = {};
        if (externalWallet?.authToken) {
          headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
        }
        const res = await fetch("/api/admin/status", { 
          credentials: "include",
          headers
        });
        if (res.ok) {
          const data = await res.json();
          setIsAdmin(data.isAdmin);
        }
      } catch (err) {
        console.error("Admin check failed:", err);
      } finally {
        setLoading(false);
      }
    };
    checkAdmin();
  }, [externalWallet?.authToken]);

  const handleExport = async (tableId: string) => {
    setExporting(tableId);
    try {
      const headers: Record<string, string> = {};
      if (externalWallet?.authToken) {
        headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      
      const res = await fetch(`/api/admin/export/${tableId}`, {
        credentials: "include",
        headers
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(data.error || "Export failed");
      }
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = res.headers.get("Content-Disposition");
      let filename = `kasshi_${tableId}_${new Date().toISOString().split('T')[0]}.csv`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
        if (match) filename = match[1];
      }
      
      // Download the file
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen w-full bg-[#0a0f14] flex items-center justify-center ${titleBarPadding}`}>
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className={`min-h-screen w-full bg-[#0a0f14] flex flex-col items-center justify-center gap-4 ${titleBarPadding}`}>
        <Shield className="w-16 h-16 text-red-500/50" />
        <h1 className="text-xl font-semibold text-white">Access Denied</h1>
        <p className="text-white/60">Admin access required to export data.</p>
        <LocalizedLink to="/video" className="text-teal-400 hover:underline">Return to Home</LocalizedLink>
      </div>
    );
  }

  return (
    <div className={`min-h-screen w-full bg-[#0a0f14] flex flex-col ${titleBarPadding}`}>
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0a0f14]/95 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <LocalizedLink 
              to="/admin" 
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </LocalizedLink>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-teal-400" />
                Export Production Data
              </h1>
              <p className="text-white/60 text-sm">Download database tables as CSV files</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Warning Banner */}
        <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 mb-8">
          <p className="text-yellow-400 text-sm flex items-start gap-2">
            <Shield className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Production Data Export:</strong> This exports real data from your production database. 
              Handle exported files securely as they may contain sensitive user information.
            </span>
          </p>
        </div>

        {/* Export Buttons Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {EXPORT_TABLES.map((table) => {
            const colorClasses: Record<string, string> = {
              teal: "from-teal-500/20 to-teal-600/10 border-teal-500/30 hover:border-teal-400/50",
              blue: "from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-400/50",
              purple: "from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-400/50",
              pink: "from-pink-500/20 to-pink-600/10 border-pink-500/30 hover:border-pink-400/50",
              orange: "from-orange-500/20 to-orange-600/10 border-orange-500/30 hover:border-orange-400/50",
              yellow: "from-yellow-500/20 to-yellow-600/10 border-yellow-500/30 hover:border-yellow-400/50",
              green: "from-green-500/20 to-green-600/10 border-green-500/30 hover:border-green-400/50",
              emerald: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 hover:border-emerald-400/50",
              cyan: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 hover:border-cyan-400/50",
              indigo: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 hover:border-indigo-400/50",
              violet: "from-violet-500/20 to-violet-600/10 border-violet-500/30 hover:border-violet-400/50",
              amber: "from-amber-500/20 to-amber-600/10 border-amber-500/30 hover:border-amber-400/50",
              rose: "from-rose-500/20 to-rose-600/10 border-rose-500/30 hover:border-rose-400/50",
              fuchsia: "from-fuchsia-500/20 to-fuchsia-600/10 border-fuchsia-500/30 hover:border-fuchsia-400/50",
              slate: "from-slate-500/20 to-slate-600/10 border-slate-500/30 hover:border-slate-400/50"
            };

            const iconColors: Record<string, string> = {
              teal: "text-teal-400",
              blue: "text-blue-400",
              purple: "text-purple-400",
              pink: "text-pink-400",
              orange: "text-orange-400",
              yellow: "text-yellow-400",
              green: "text-green-400",
              emerald: "text-emerald-400",
              cyan: "text-cyan-400",
              indigo: "text-indigo-400",
              violet: "text-violet-400",
              amber: "text-amber-400",
              rose: "text-rose-400",
              fuchsia: "text-fuchsia-400",
              slate: "text-slate-400"
            };

            return (
              <button
                key={table.id}
                onClick={() => handleExport(table.id)}
                disabled={exporting !== null}
                className={`p-6 rounded-xl bg-gradient-to-br ${colorClasses[table.color]} border transition-all duration-200 text-left group disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl bg-white/5 ${iconColors[table.color]}`}>
                    {exporting === table.id ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      table.icon
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-lg mb-1 flex items-center gap-2">
                      {table.label}
                      <Download className="w-4 h-4 text-white/40 group-hover:text-white/70 transition-colors" />
                    </h3>
                    <p className="text-white/50 text-sm">{table.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Info Section */}
        <div className="mt-8 p-6 rounded-xl bg-white/5 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4">Export Information</h3>
          <ul className="space-y-2 text-white/60 text-sm">
            <li>• CSV files are UTF-8 encoded and compatible with Excel, Google Sheets, etc.</li>
            <li>• Large exports may take a few seconds to generate.</li>
            <li>• Timestamps are in ISO 8601 format (UTC).</li>
            <li>• Sensitive data like private keys are excluded from exports.</li>
            <li>• "All Tables Summary" shows row counts for each table in the database.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
