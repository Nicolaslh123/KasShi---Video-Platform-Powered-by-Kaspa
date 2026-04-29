import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import VideoCard from "../components/VideoCard";
import Footer from "../components/Footer";


import { useFeed, FeedType, formatViews, DEFAULT_AVATAR } from "../hooks/useKasShi";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "@getmocha/users-service/react";
import { useLanguage } from "../contexts/LanguageContext";
import { Loader2, Sparkles, Users, Crown, Eye, EyeOff, Tv, History, Flame } from "lucide-react";
// Gift icon removed - re-add when referral buttons are re-enabled
import LocalizedLink from "../components/LocalizedLink";
import { useElectronTitleBar } from "../components/ElectronTitleBar";

// Channel leaderboard type
interface LeaderboardChannel {
  rank: number;
  id: number;
  name: string;
  handle: string;
  avatarUrl: string | null;
  isVerified: boolean;
  subscriberCount: number;
  totalViews: number;
}

interface ProgressInfo {
  progressSeconds: number;
  durationSeconds: number;
}

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const validFeeds: FeedType[] = ["for-you", "free", "following", "members", "history"];
  
  // Get feed directly from searchParams (React Router source of truth)
  const feedParam = searchParams.get("feed");
  const selectedFeed: FeedType = (feedParam && validFeeds.includes(feedParam as FeedType)) 
    ? feedParam as FeedType 
    : "for-you";
  
  const { channel, mode, externalWallet } = useWallet();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { titleBarPadding } = useElectronTitleBar();
  const { videos, loading, message } = useFeed(selectedFeed, channel?.id, 21, 0, mode, externalWallet?.userId || user?.id);
  const [progressMap, setProgressMap] = useState<Record<number, ProgressInfo>>({});
  const [leaderboardChannels, setLeaderboardChannels] = useState<LeaderboardChannel[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  // Update URL when feed changes via tab click
  const handleFeedChange = (feed: FeedType) => {
    if (feed === "for-you") {
      // Remove param for default feed (cleaner URL)
      searchParams.delete("feed");
      setSearchParams(searchParams, { replace: true });
    } else {
      setSearchParams({ feed }, { replace: true });
    }
  };

  // Fetch channel leaderboard
  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch("/api/kasshi/channels/leaderboard?limit=10");
        if (res.ok) {
          const data = await res.json();
          setLeaderboardChannels(data.channels || []);
        }
      } catch (err) {
        console.error("Failed to fetch leaderboard:", err);
      } finally {
        setLeaderboardLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  // Feed tabs with translated labels
  const feedTabs: { id: FeedType; label: string; icon: React.ReactNode; requiresAuth: boolean }[] = [
    { id: "for-you", label: t.home.forYou, icon: <Sparkles className="w-4 h-4" />, requiresAuth: false },
    { id: "free", label: t.home.freeToWatch, icon: <Eye className="w-4 h-4" />, requiresAuth: false },
    { id: "following", label: t.home.following, icon: <Users className="w-4 h-4" />, requiresAuth: true },
    { id: "members", label: t.home.membersOnly, icon: <Crown className="w-4 h-4" />, requiresAuth: true },
    { id: "history", label: t.home.history, icon: <History className="w-4 h-4" />, requiresAuth: true },
  ];

  const currentTab = feedTabs.find(t => t.id === selectedFeed);

  // Fetch watch progress for all videos
  useEffect(() => {
    if (!channel?.id || videos.length === 0) {
      setProgressMap({});
      return;
    }

    const videoIds = videos.map(v => v.id).join(",");
    fetch(`/api/kasshi/progress/batch?channelId=${channel.id}&videoIds=${videoIds}`, {
      credentials: "include"
    })
      .then(res => res.json())
      .then(data => {
        if (data.progressMap) {
          setProgressMap(data.progressMap);
        }
      })
      .catch(() => setProgressMap({}));
  }, [channel?.id, videos]);

  return (
    <div className={`min-h-screen bg-slate-950 flex flex-col ${titleBarPadding}`}>
      <Navbar />
      
      {/* Free uploads banner */}
      <div className="pt-16">
        <div className="bg-gradient-to-r from-emerald-900 to-green-900 text-white text-center py-3 px-4">
          <p className="text-sm sm:text-base font-semibold">
            Free Uploads on Video and Music for a Limited Time!
          </p>
        </div>
      </div>
      
      {/* Main content */}
      <main className="flex-1 pt-4 pb-8 px-4 sm:px-6 lg:px-8 w-full">
        <div className="max-w-[1800px] mx-auto">
          {/* Feed tabs and My Channel button - above sidebar+grid */}
          <div className="mb-6 sm:mb-8">
            {/* My Channel and Clips buttons - shown above tabs on mobile only */}
            <div className="flex justify-center gap-3 mb-3 sm:hidden">
              {/* TEMP DISABLED - Clips button mobile */}
              {false && (
              <LocalizedLink
                to="/clips"
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-600 to-red-500 text-white text-sm font-medium whitespace-nowrap hover:from-orange-500 hover:to-red-400 transition-all"
              >
                <Flame className="w-4 h-4" />
                Clips
              </LocalizedLink>
              )}
              {(user || externalWallet) && (
                <LocalizedLink
                  to="/video/channel"
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-teal-600 to-teal-500 text-white text-sm font-medium whitespace-nowrap hover:from-teal-500 hover:to-teal-400 transition-all"
                >
                  <Tv className="w-4 h-4" />
                  {t.nav.myChannel}
                </LocalizedLink>
              )}
            </div>
            
          </div>

          {/* Content area with sidebar and videos */}
          <div className="flex gap-6">
            {/* Left sidebar - Featured Channels (hidden on mobile/tablet) */}
            <aside className="hidden xl:block w-[280px] flex-shrink-0">
              <div className="sticky top-24">
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-400" />
                    {t.common?.featuredChannels || 'Featured Channels'}
                  </h3>
                  
                  {leaderboardLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
                    </div>
                  ) : leaderboardChannels.length > 0 ? (
                    <div className="space-y-2">
                      {leaderboardChannels.map((ch) => (
                        <LocalizedLink
                          key={ch.id}
                          to={`/video/channel/${ch.handle}`}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 transition-colors group"
                        >
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                            ch.rank === 1 ? 'bg-yellow-500 text-yellow-900' :
                            ch.rank === 2 ? 'bg-slate-400 text-slate-900' :
                            ch.rank === 3 ? 'bg-amber-600 text-amber-100' :
                            'bg-slate-700 text-slate-400'
                          }`}>
                            {ch.rank}
                          </span>
                          <img
                            src={ch.avatarUrl || DEFAULT_AVATAR}
                            alt={ch.name}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate group-hover:text-teal-400 transition-colors">
                              {ch.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatViews(ch.totalViews)} views
                            </p>
                          </div>
                        </LocalizedLink>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm text-center py-4">{t.common?.noChannels || 'No channels yet'}</p>
                  )}
                </div>
              </div>
            </aside>

            {/* Main content - Video grid */}
            <div className="flex-1 min-w-0">
              {/* Tabs and buttons - inside video grid container for proper alignment */}
              <div className="flex items-start gap-4 mb-6 max-w-[1400px]">
                {/* Feed tabs */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {feedTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => handleFeedChange(tab.id)}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                        selectedFeed === tab.id
                          ? tab.id === "members" 
                            ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30"
                            : "bg-slate-100 text-slate-900"
                          : "bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-white border border-slate-700"
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>
                
                {/* Clips + My Channel buttons - desktop only, pushed to right edge */}
                <div className="hidden sm:flex items-center gap-3 flex-shrink-0 ml-auto">
                  {/* TEMP DISABLED - Clips button desktop */}
                  {false && (
                  <LocalizedLink
                    to="/clips"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-600 to-red-500 text-white text-sm font-medium whitespace-nowrap hover:from-orange-500 hover:to-red-400 transition-all shadow-lg shadow-orange-500/20"
                  >
                    <Flame className="w-4 h-4" />
                    Clips
                  </LocalizedLink>
                  )}
                  {(user || externalWallet) && (
                    <LocalizedLink
                      to="/video/channel"
                      className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-teal-600 to-teal-500 text-white text-sm font-medium whitespace-nowrap hover:from-teal-500 hover:to-teal-400 transition-all"
                    >
                      <Tv className="w-4 h-4" />
                      {t.nav.myChannel}
                    </LocalizedLink>
                  )}
                </div>
              </div>
        {/* Video grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
          </div>
        ) : message && videos.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800/50 flex items-center justify-center">
              {currentTab?.icon && <div className="text-teal-400 scale-[1.5]">{currentTab.icon}</div>}
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              {selectedFeed === "following" && !channel ? t.home.noFollowing : 
               selectedFeed === "following" && channel ? t.home.noFollowing :
               selectedFeed === "members" ? t.home.noMembers : t.home.noVideos}
            </h2>
            <p className="text-slate-400">{message}</p>
          </div>
        ) : videos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10 max-w-[1400px]">
            {videos.map((video) => (
              <div key={video.id} className="relative">
                <VideoCard video={video} progress={progressMap[video.id]} />
                {/* Watched indicator - show on all feeds if watched */}
                {video.hasWatched && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/70 backdrop-blur-sm text-xs text-slate-300">
                    <Eye className="w-3 h-3" />
                    {t.video.watched}
                  </div>
                )}
                {/* New indicator - only for Following and Members feeds */}
                {(selectedFeed === "following" || selectedFeed === "members") && !video.hasWatched && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-teal-500/90 backdrop-blur-sm text-xs text-white font-medium">
                    <EyeOff className="w-3 h-3" />
                    {t.video.new}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, rgba(139, 69, 19, 0.3) 0%, rgba(75, 0, 130, 0.4) 100%)',
              border: '2px solid rgba(255, 215, 0, 0.25)',
              boxShadow: '0 8px 32px rgba(255, 215, 0, 0.15)'
            }}>
              {selectedFeed === "members" ? (
                <Crown className="w-10 h-10 text-amber-400" />
              ) : selectedFeed === "following" ? (
                <Users className="w-10 h-10 text-amber-400" />
              ) : (
                <span className="text-4xl">🎬</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 mb-2" style={{ fontFamily: 'Georgia, serif' }}>
              {selectedFeed === "following" ? t.home.noFollowing :
               selectedFeed === "members" ? t.home.noMembers :
               t.home.noVideos}
            </h2>
            <p className="text-purple-300/70 mb-6">
              {selectedFeed === "following" ? t.home.noFollowing :
               selectedFeed === "members" ? t.home.noMembers :
               selectedFeed === "history" ? t.home.noHistory :
               t.home.noVideos}
            </p>
          </div>
        )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
