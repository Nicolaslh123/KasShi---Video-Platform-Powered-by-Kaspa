import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Upload, Menu, X, Wallet, Settings, Bell, Eye, EyeOff } from "lucide-react";
import { useWallet } from "../contexts/WalletContext";
import { WalletModal } from "./WalletModal";
import { KasShiLogo, KaspaIcon } from "./KasShiLogo";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  videoId?: number;
  channelId?: number;
  videoTitle?: string;
  videoThumbnailUrl?: string;
  channelName?: string;
  channelHandle?: string;
}

export default function Navbar() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isBalanceHidden, setIsBalanceHidden] = useState(() => {
    return localStorage.getItem("kasshi_hide_balance") === "true";
  });
  const notificationRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { isConnected, wallet, balance, pendingBalance, externalWallet } = useWallet();

  const toggleBalanceVisibility = () => {
    const newValue = !isBalanceHidden;
    setIsBalanceHidden(newValue);
    localStorage.setItem("kasshi_hide_balance", String(newValue));
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!isConnected) return;
    try {
      const headers: HeadersInit = {};
      if (externalWallet?.authToken) {
        headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      const res = await fetch("/api/kasshi/notifications", { headers });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    if (isConnected) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 60000); // Poll every minute
      return () => clearInterval(interval);
    }
  }, [isConnected, externalWallet]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Mark notifications as read when opening dropdown
  const handleOpenNotifications = async () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications && unreadCount > 0) {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        if (externalWallet?.authToken) {
          headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
        }
        await fetch("/api/kasshi/notifications/read", { method: "POST", headers });
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      } catch (err) {
        console.error("Failed to mark notifications as read:", err);
      }
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const formatAddress = (addr: string) => {
    if (!addr) return "";
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-[2000px] mx-auto px-4 h-16 flex items-center gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <KasShiLogo size={36} className="rounded-full" />
          <span className="text-xl font-bold hidden sm:block">
            <span className="text-teal-300">Kas</span><span className="text-teal-500">Shi</span>
          </span>
        </Link>

        {/* Search bar - Desktop */}
        <form 
          onSubmit={handleSearch}
          className="hidden md:flex flex-1 max-w-2xl mx-auto"
        >
          <div className="flex w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search videos..."
              className="flex-1 bg-slate-800/50 border border-slate-700 rounded-l-full px-5 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:border-teal-500/50 focus:bg-slate-800 transition-all"
            />
            <button
              type="submit"
              className="bg-slate-700 hover:bg-slate-600 border border-l-0 border-slate-700 rounded-r-full px-6 transition-colors"
            >
              <Search className="w-5 h-5 text-slate-300" />
            </button>
          </div>
        </form>

        {/* Right side actions */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Mobile search toggle */}
          <button className="md:hidden p-2 hover:bg-slate-800 rounded-full transition-colors">
            <Search className="w-5 h-5 text-slate-300" />
          </button>

          {/* Upload button */}
          <button
            onClick={() => navigate("/upload")}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"
          >
            <Upload className="w-4 h-4 text-slate-300" />
            <span className="text-sm font-medium text-slate-300">Upload</span>
          </button>

          {/* Notifications */}
          {isConnected && (
            <div ref={notificationRef} className="relative">
              <button
                onClick={handleOpenNotifications}
                className="relative p-2 hover:bg-slate-800 rounded-full transition-colors"
              >
                <Bell className="w-5 h-5 text-slate-300" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-teal-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-12 w-80 max-h-96 overflow-y-auto bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50">
                  <div className="p-3 border-b border-slate-700">
                    <h3 className="font-semibold text-white">Notifications</h3>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-sm">No notifications yet</div>
                  ) : (
                    <div className="divide-y divide-slate-700">
                      {notifications.slice(0, 10).map(n => (
                        <button
                          key={n.id}
                          onClick={() => {
                            if (n.videoId) navigate(`/watch/${n.videoId}`);
                            else if (n.channelHandle) navigate(`/channel/${n.channelHandle}`);
                            setShowNotifications(false);
                          }}
                          className={`w-full p-3 text-left hover:bg-slate-700/50 transition-colors ${!n.isRead ? "bg-teal-500/10" : ""}`}
                        >
                          <p className="text-sm text-white font-medium truncate">{n.title}</p>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{n.message}</p>
                          <p className="text-xs text-slate-500 mt-1">{formatTimeAgo(n.createdAt)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Settings */}
          <button
            onClick={() => navigate("/settings")}
            className="hidden sm:flex p-2 hover:bg-slate-800 rounded-full transition-colors"
          >
            <Settings className="w-5 h-5 text-slate-300" />
          </button>

          {/* Connect Wallet button */}
          {isConnected && wallet ? (
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsWalletModalOpen(true)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-teal-500/30 rounded-l-full transition-all"
              >
                <div className="flex items-center gap-1.5">
                  <KaspaIcon size={16} />
                  <span className="text-sm font-medium text-teal-400">
                    {isBalanceHidden ? "••••" : (parseFloat(balance) - (pendingBalance?.pendingDebitsKas || 0)).toFixed(2)}
                  </span>
                </div>
                <div className="hidden sm:block w-px h-4 bg-slate-600" />
                <span className="hidden sm:inline text-sm text-slate-300 font-mono">
                  {formatAddress(wallet.address)}
                </span>
              </button>
              <button
                onClick={toggleBalanceVisibility}
                className="p-2 bg-slate-800 hover:bg-slate-700 border border-l-0 border-teal-500/30 rounded-r-full transition-all"
                title={isBalanceHidden ? "Show balance" : "Hide balance"}
              >
                {isBalanceHidden ? (
                  <EyeOff className="w-4 h-4 text-slate-400" />
                ) : (
                  <Eye className="w-4 h-4 text-slate-400" />
                )}
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsWalletModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white rounded-full font-medium transition-all shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40"
            >
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Connect Wallet</span>
            </button>
          )}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 hover:bg-slate-800 rounded-full transition-colors"
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5 text-slate-300" />
            ) : (
              <Menu className="w-5 h-5 text-slate-300" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-t border-slate-800 px-4 py-4 space-y-4">
          {/* Mobile search */}
          <form onSubmit={handleSearch}>
            <div className="flex">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search videos..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-l-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-teal-500/50"
              />
              <button
                type="submit"
                className="bg-slate-700 border border-l-0 border-slate-700 rounded-r-lg px-4"
              >
                <Search className="w-5 h-5 text-slate-300" />
              </button>
            </div>
          </form>

          {/* Mobile upload */}
          <button
            onClick={() => {
              navigate("/upload");
              setIsMobileMenuOpen(false);
            }}
            className="flex items-center gap-3 w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Upload className="w-5 h-5 text-slate-300" />
            <span className="text-slate-300">Upload Video</span>
          </button>

          {/* Mobile settings */}
          <button
            onClick={() => {
              navigate("/settings");
              setIsMobileMenuOpen(false);
            }}
            className="flex items-center gap-3 w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Settings className="w-5 h-5 text-slate-300" />
            <span className="text-slate-300">Settings</span>
          </button>
        </div>
      )}

      {/* Wallet Modal */}
      <WalletModal 
        isOpen={isWalletModalOpen} 
        onClose={() => setIsWalletModalOpen(false)} 
      />
    </nav>
  );
}
