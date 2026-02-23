import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import VideoCard from "../components/VideoCard";
import Footer from "../components/Footer";
import CompetitionBanner from "../components/CompetitionBanner";
import { useFeed, FeedType } from "../hooks/useKasShi";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "@getmocha/users-service/react";
import { Loader2, Sparkles, Users, Crown, Eye, EyeOff, Tv, Plus, History } from "lucide-react";
import { Link } from "react-router-dom";

interface ProgressInfo {
  progressSeconds: number;
  durationSeconds: number;
}

const feedTabs: { id: FeedType; label: string; icon: React.ReactNode; requiresAuth: boolean }[] = [
  { id: "for-you", label: "For You", icon: <Sparkles className="w-4 h-4" />, requiresAuth: false },
  { id: "following", label: "Following", icon: <Users className="w-4 h-4" />, requiresAuth: true },
  { id: "members", label: "Members", icon: <Crown className="w-4 h-4" />, requiresAuth: true },
  { id: "history", label: "History", icon: <History className="w-4 h-4" />, requiresAuth: true },
];

export default function Home() {
  const [selectedFeed, setSelectedFeed] = useState<FeedType>("for-you");
  const { channel, mode, externalWallet } = useWallet();
  const { user } = useAuth();
  const { videos, loading, message } = useFeed(selectedFeed, channel?.id, 20, 0, mode, user?.id);
  const [progressMap, setProgressMap] = useState<Record<number, ProgressInfo>>({});

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
    <div className="min-h-screen w-full bg-slate-950 flex flex-col">
      <Navbar />
      
      {/* Main content */}
      <main className="flex-1 pt-20 pb-8 px-4 sm:px-6 lg:px-8 w-full">
        {/* Competition banner */}
        <CompetitionBanner />
        
        {/* Feed tabs and My Channel button - responsive layout */}
        <div className="mb-6 sm:mb-8 max-w-[1800px] mx-auto">
          {/* My Channel button - shown above tabs on mobile, hidden on desktop */}
          <div className="flex justify-center mb-3 sm:hidden">
            {(user || externalWallet) && (
              channel ? (
                <Link
                  to={`/channel/${channel.handle}`}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-500 hover:to-cyan-500 transition-all shadow-lg shadow-teal-500/25"
                >
                  <Tv className="w-4 h-4" />
                  My Channel
                </Link>
              ) : (
                <Link
                  to="/upload"
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-500 hover:to-cyan-500 transition-all shadow-lg shadow-teal-500/25"
                >
                  <Plus className="w-4 h-4" />
                  Create Channel
                </Link>
              )
            )}
          </div>
          
          {/* Desktop: 3-column grid with centered tabs. Mobile: just scrollable tabs */}
          <div className="sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
            {/* Empty left column for balance - desktop only */}
            <div className="hidden sm:block" />
            
            {/* Feed tabs - scrollable on mobile, centered on desktop */}
            <div className="flex justify-start sm:justify-center gap-2 overflow-x-auto pb-2 scrollbar-hide px-4 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
              {feedTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedFeed(tab.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                    selectedFeed === tab.id
                      ? tab.id === "members" 
                        ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25"
                        : tab.id === "following"
                        ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25"
                        : "bg-white text-slate-900"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
            
            {/* My Channel button - desktop only (right column) */}
            <div className="hidden sm:flex justify-end">
              {(user || externalWallet) && (
                channel ? (
                  <Link
                    to={`/channel/${channel.handle}`}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium whitespace-nowrap bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-500 hover:to-cyan-500 transition-all shadow-lg shadow-teal-500/25"
                  >
                    <Tv className="w-4 h-4" />
                    My Channel
                  </Link>
                ) : (
                  <Link
                    to="/upload"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium whitespace-nowrap bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-500 hover:to-cyan-500 transition-all shadow-lg shadow-teal-500/25"
                  >
                    <Plus className="w-4 h-4" />
                    Create Channel
                  </Link>
                )
              )}
            </div>
          </div>
        </div>

        {/* Video grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
          </div>
        ) : message && videos.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-700 flex items-center justify-center border border-slate-600">
              {currentTab?.icon && <div className="text-slate-400 scale-[2]">{currentTab.icon}</div>}
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              {selectedFeed === "following" && !channel ? "Sign in to see Following" : 
               selectedFeed === "following" && channel ? "No subscriptions yet" :
               selectedFeed === "members" ? "Sign in to see Members" : "No videos yet"}
            </h2>
            <p className="text-slate-400">{message}</p>
          </div>
        ) : videos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-8 max-w-[1800px] mx-auto">
            {videos.map((video) => (
              <div key={video.id} className="relative">
                <VideoCard video={video} progress={progressMap[video.id]} />
                {/* Watched indicator - show on all feeds if watched */}
                {video.hasWatched && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/70 backdrop-blur-sm text-xs text-slate-300">
                    <Eye className="w-3 h-3" />
                    Watched
                  </div>
                )}
                {/* New indicator - only for Following and Members feeds */}
                {(selectedFeed === "following" || selectedFeed === "members") && !video.hasWatched && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-teal-500/90 backdrop-blur-sm text-xs text-white font-medium">
                    <EyeOff className="w-3 h-3" />
                    New
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center border border-teal-500/30">
              {selectedFeed === "members" ? (
                <Crown className="w-10 h-10 text-purple-400" />
              ) : selectedFeed === "following" ? (
                <Users className="w-10 h-10 text-teal-400" />
              ) : (
                <span className="text-4xl">🎬</span>
              )}
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              {selectedFeed === "following" ? "No videos from channels you follow" :
               selectedFeed === "members" ? "No videos from your memberships" :
               "No videos yet"}
            </h2>
            <p className="text-slate-400 mb-6">
              {selectedFeed === "following" ? "Subscribe to channels to see their videos here!" :
               selectedFeed === "members" ? "Join channel memberships to unlock exclusive content!" :
               "Be the first to upload and start earning KAS!"}
            </p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
