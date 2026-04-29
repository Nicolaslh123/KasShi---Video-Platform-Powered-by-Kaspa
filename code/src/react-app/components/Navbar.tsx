import { useState, useEffect, useRef } from "react";
import LocalizedLink from "./LocalizedLink";
import { useLocalizedNavigate } from "./LanguageRouter";
import { Search, Upload, Menu, X, Wallet, Settings, Bell, Eye, EyeOff, Globe, ChevronDown, LayoutDashboard, Music2, Activity, Crown, Heart, MessageCircle, Users } from "lucide-react";
import { useWallet } from "../contexts/WalletContext";
import { useLanguage, languages } from "../contexts/LanguageContext";
import { WalletModal } from "./WalletModal";
import { KasShiLogo, KaspaIcon } from "./KasShiLogo";
import LanguageSelector from "./LanguageSelector";

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
  relatedHandle?: string;
}

type NotificationTab = 'activity' | 'members';

export default function Navbar() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationTab, setNotificationTab] = useState<NotificationTab>('activity');
  const [viewedTabs, setViewedTabs] = useState<Set<NotificationTab>>(new Set());
  const [isBalanceHidden, setIsBalanceHidden] = useState(() => {
    return localStorage.getItem("kasshi_hide_balance") === "true";
  });
  const [isMobileLangOpen, setIsMobileLangOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const navigate = useLocalizedNavigate();
  const { isConnected, wallet, balance, pendingBalance, externalWallet } = useWallet();
  const { t, language, setLanguage } = useLanguage();

  const toggleBalanceVisibility = () => {
    const newValue = !isBalanceHidden;
    setIsBalanceHidden(newValue);
    localStorage.setItem("kasshi_hide_balance", String(newValue));
  };

  const unreadCount = notifications.filter(n => {
    const tab: NotificationTab = n.type === 'new_member' ? 'members' : 'activity';
    return !n.isRead && !viewedTabs.has(tab);
  }).length;

  // Count unread per tab (for badge display)
  const unreadActivityCount = notifications.filter(n => n.type !== 'new_member' && !n.isRead).length;
  const unreadMembersCount = notifications.filter(n => n.type === 'new_member' && !n.isRead).length;

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!isConnected) return;
    try {
      const headers: HeadersInit = {};
      if (externalWallet?.authToken) {
        headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      const res = await fetch("/api/kasshi/notifications", { headers, credentials: "include" });
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
    if (!showNotifications) {
      // Reset viewed tabs when opening fresh
      setViewedTabs(new Set());
      // Mark current tab as viewed and mark those notifications as read
      markTabAsViewed('activity');
    }
  };

  // Mark a tab as viewed and mark its notifications as read
  const markTabAsViewed = async (tab: NotificationTab) => {
    setViewedTabs(prev => new Set(prev).add(tab));
    
    const tabNotifications = notifications.filter(n => 
      tab === 'members' ? n.type === 'new_member' : n.type !== 'new_member'
    );
    const unreadInTab = tabNotifications.filter(n => !n.isRead);
    
    if (unreadInTab.length > 0) {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        if (externalWallet?.authToken) {
          headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
        }
        // Mark only notifications for this tab as read
        const notificationIds = unreadInTab.map(n => n.id);
        await fetch("/api/kasshi/notifications/read", { 
          method: "POST", 
          headers, 
          credentials: "include", 
          body: JSON.stringify({ notificationIds }) 
        });
        // Update local state for these notifications
        setNotifications(prev => prev.map(n => 
          notificationIds.includes(n.id) ? { ...n, isRead: true } : n
        ));
      } catch (err) {
        console.error("Failed to mark notifications as read:", err);
      }
    }
  };

  // Handle tab switch
  const handleTabSwitch = (tab: NotificationTab) => {
    setNotificationTab(tab);
    markTabAsViewed(tab);
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
      navigate(`/video/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 lg:px-8 fixed-top-safe">
      <div className="max-w-[1800px] mx-auto h-14 sm:h-16 flex items-center gap-2 sm:gap-4 xl:gap-6">
        {/* Left section - matches sidebar width (280px) on xl screens */}
        <div className="flex items-center gap-4 flex-shrink-0 xl:w-[280px]">
          {/* Logo */}
          <LocalizedLink to="/video" className="flex items-center gap-2 flex-shrink-0">
            <KasShiLogo size={36} className="rounded-full" />
            <span className="text-xl font-bold hidden sm:block">
              <span className="text-teal-300">Kas</span><span className="text-teal-500">Shi</span>
            </span>
          </LocalizedLink>

          {/* Music tab - next to logo */}
          <button
            onClick={() => navigate("/music")}
            className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600/80 to-pink-600/80 hover:from-purple-500 hover:to-pink-500 rounded-full transition-all"
          >
            <Music2 className="w-4 h-4 text-white" />
            <span className="text-sm font-medium text-white">Music</span>
          </button>
        </div>

        {/* Search bar - Desktop - aligns with video grid after sidebar */}
        <form 
          onSubmit={handleSearch}
          className="hidden md:flex flex-1 max-w-xl"
        >
          <div className="flex w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.nav.search}
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

          {/* Mobile music button */}
          <button
            onClick={() => navigate("/music")}
            className="sm:hidden p-2 bg-gradient-to-r from-purple-600/80 to-pink-600/80 hover:from-purple-500 hover:to-pink-500 rounded-full transition-all"
          >
            <Music2 className="w-5 h-5 text-white" />
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
                <div className="absolute right-0 sm:right-0 top-12 w-[calc(100vw-1rem)] sm:w-80 max-w-sm max-h-96 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 -translate-x-1/2 sm:translate-x-0 left-1/2 sm:left-auto">
                  <div className="p-3 border-b border-slate-700">
                    <h3 className="font-semibold text-white">{t.notifications?.title || 'Notifications'}</h3>
                    {/* Tabs */}
                    <div className="flex gap-1 mt-2">
                      <button
                        onClick={() => handleTabSwitch('activity')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          notificationTab === 'activity'
                            ? 'bg-teal-500/20 text-teal-400'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        <Activity className="w-3.5 h-3.5" />
                        Activity
                        {unreadActivityCount > 0 && !viewedTabs.has('activity') && (
                          <span className="w-4 h-4 bg-teal-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                            {unreadActivityCount}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => handleTabSwitch('members')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          notificationTab === 'members'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        <Crown className="w-3.5 h-3.5" />
                        Members
                        {unreadMembersCount > 0 && !viewedTabs.has('members') && (
                          <span className="w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                            {unreadMembersCount}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-[280px]">
                    {(() => {
                      const filteredNotifications = notificationTab === 'activity'
                        ? notifications.filter(n => n.type !== 'new_member')
                        : notifications.filter(n => n.type === 'new_member');
                      
                      if (filteredNotifications.length === 0) {
                        return (
                          <div className="p-6 text-center text-slate-400 text-sm">
                            {notificationTab === 'activity' 
                              ? (t.notifications?.noNotifications || 'No activity yet')
                              : 'No new members yet'}
                          </div>
                        );
                      }
                      
                      return (
                        <div className="divide-y divide-slate-700">
                          {filteredNotifications.slice(0, 10).map(n => (
                            <button
                              key={n.id}
                              onClick={() => {
                                if (n.type === 'new_member' && n.relatedHandle) {
                                  navigate(`/video/channel/${n.relatedHandle}`);
                                } else if (n.videoId) {
                                  navigate(`/video/watch/${n.videoId}`);
                                } else if (n.channelHandle) {
                                  navigate(`/video/channel/${n.channelHandle}`);
                                }
                                setShowNotifications(false);
                              }}
                              className={`w-full p-3 text-left hover:bg-slate-700/50 transition-colors ${!n.isRead ? (n.type === 'new_member' ? "bg-amber-500/10" : "bg-teal-500/10") : ""}`}
                            >
                              <div className="flex items-start gap-2">
                                <div className={`mt-0.5 p-1 rounded ${
                                  n.type === 'new_member' ? 'bg-amber-500/20 text-amber-400' :
                                  n.type === 'like' ? 'bg-rose-500/20 text-rose-400' :
                                  n.type === 'comment' ? 'bg-blue-500/20 text-blue-400' :
                                  n.type === 'subscriber' ? 'bg-purple-500/20 text-purple-400' :
                                  'bg-slate-600 text-slate-400'
                                }`}>
                                  {n.type === 'new_member' ? <Crown className="w-3 h-3" /> :
                                   n.type === 'like' ? <Heart className="w-3 h-3" /> :
                                   n.type === 'comment' ? <MessageCircle className="w-3 h-3" /> :
                                   n.type === 'subscriber' ? <Users className="w-3 h-3" /> :
                                   <Bell className="w-3 h-3" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white font-medium truncate">{n.title}</p>
                                  <p className="text-xs text-slate-400 truncate mt-0.5">{n.message}</p>
                                  <p className="text-xs text-slate-500 mt-1">{formatTimeAgo(n.createdAt)}</p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Language Selector */}
          <div className="hidden sm:block">
            <LanguageSelector />
          </div>

          {/* Dashboard - only show if user has a channel */}
          {isConnected && (
            <button
              onClick={() => navigate("/dashboard")}
              className="hidden sm:flex p-2 hover:bg-slate-800 rounded-full transition-colors"
              title={t.nav?.dashboard || "Dashboard"}
            >
              <LayoutDashboard className="w-5 h-5 text-slate-300" />
            </button>
          )}

          {/* Activity */}
          {isConnected && (
            <button
              onClick={() => navigate("/activity")}
              className="hidden sm:flex p-2 hover:bg-slate-800 rounded-full transition-colors"
              title={t.activity?.title || "Activity"}
            >
              <Activity className="w-5 h-5 text-slate-300" />
            </button>
          )}

          {/* Settings */}
          <button
            onClick={() => navigate("/settings")}
            className="hidden sm:flex p-2 hover:bg-slate-800 rounded-full transition-colors"
          >
            <Settings className="w-5 h-5 text-slate-300" />
          </button>

          {/* Upload button */}
          <button
            onClick={() => navigate("/video/upload")}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"
          >
            <Upload className="w-4 h-4 text-slate-300" />
            <span className="text-sm font-medium text-slate-300">{t.nav.upload}</span>
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
              <span className="hidden sm:inline text-sm">{t.auth.connectWallet}</span>
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
        <div className="md:hidden bg-slate-900 border-t border-slate-800 px-4 py-4 space-y-3 max-h-[calc(100vh-3.5rem)] overflow-y-auto scroll-momentum">
          {/* Mobile search */}
          <form onSubmit={handleSearch}>
            <div className="flex">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.nav.search}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-l-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-teal-500/50"
              />
              <button
                type="submit"
                className="bg-slate-700 border border-l-0 border-slate-700 rounded-r-lg px-5 min-w-[48px] flex items-center justify-center"
              >
                <Search className="w-5 h-5 text-slate-300" />
              </button>
            </div>
          </form>

          {/* Mobile music */}
          <button
            onClick={() => {
              navigate("/music");
              setIsMobileMenuOpen(false);
            }}
            className="flex items-center gap-3 w-full px-4 py-4 min-h-[48px] bg-gradient-to-r from-purple-600/80 to-pink-600/80 active:from-purple-500 active:to-pink-500 rounded-xl transition-colors touch-target"
          >
            <Music2 className="w-5 h-5 text-white" />
            <span className="text-white font-medium">Music & Podcasts</span>
          </button>

          {/* Mobile upload */}
          <button
            onClick={() => {
              navigate("/video/upload");
              setIsMobileMenuOpen(false);
            }}
            className="flex items-center gap-3 w-full px-4 py-4 min-h-[48px] bg-slate-800 active:bg-slate-700 rounded-xl transition-colors"
          >
            <Upload className="w-5 h-5 text-slate-300" />
            <span className="text-slate-300">{t.nav.upload}</span>
          </button>

          {/* Mobile dashboard */}
          {isConnected && (
            <button
              onClick={() => {
                navigate("/dashboard");
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-4 min-h-[48px] bg-slate-800 active:bg-slate-700 rounded-xl transition-colors"
            >
              <LayoutDashboard className="w-5 h-5 text-slate-300" />
              <span className="text-slate-300">{t.nav?.dashboard || "Dashboard"}</span>
            </button>
          )}

          {/* Mobile activity */}
          {isConnected && (
            <button
              onClick={() => {
                navigate("/activity");
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-4 min-h-[48px] bg-slate-800 active:bg-slate-700 rounded-xl transition-colors"
            >
              <Activity className="w-5 h-5 text-slate-300" />
              <span className="text-slate-300">{t.activity?.title || "Activity"}</span>
            </button>
          )}

          {/* Mobile settings */}
          <button
            onClick={() => {
              navigate("/settings");
              setIsMobileMenuOpen(false);
            }}
            className="flex items-center gap-3 w-full px-4 py-4 min-h-[48px] bg-slate-800 active:bg-slate-700 rounded-xl transition-colors"
          >
            <Settings className="w-5 h-5 text-slate-300" />
            <span className="text-slate-300">{t.nav.settings}</span>
          </button>

          {/* Mobile language selector */}
          <div className="relative">
            <button
              onClick={() => setIsMobileLangOpen(!isMobileLangOpen)}
              className="flex items-center justify-between w-full px-4 py-4 min-h-[48px] bg-slate-800 active:bg-slate-700 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-slate-300" />
                <span className="text-slate-300">{languages.find(l => l.code === language)?.name || "Language"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">{languages.find(l => l.code === language)?.flag}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isMobileLangOpen ? "rotate-180" : ""}`} />
              </div>
            </button>
            {isMobileLangOpen && (
              <div className="mt-2 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden max-h-60 overflow-y-auto scroll-momentum">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      setIsMobileLangOpen(false);
                    }}
                    className={`w-full px-4 py-4 min-h-[48px] flex items-center gap-3 transition-colors ${
                      language === lang.code
                        ? "bg-teal-500/20 text-teal-400"
                        : "active:bg-slate-700 text-slate-300"
                    }`}
                  >
                    <span className="text-lg">{lang.flag}</span>
                    <span className="text-sm">{lang.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
