import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search as SearchIcon, Users, Film, Loader2 } from "lucide-react";
import Navbar from "../components/Navbar";
import VideoCard from "../components/VideoCard";
import { useWallet } from "../contexts/WalletContext";

interface Channel {
  id: number;
  name: string;
  handle: string;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  subscriberCount: number;
  isVerified: boolean;
}

interface Video {
  id: number;
  publicId: string;
  title: string;
  description: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  kasEarned: string;
  status: string;
  createdAt: string;
  isMembersOnly: boolean;
  channel: {
    id: number;
    name: string;
    handle: string;
    avatarUrl: string | null;
    isVerified: boolean;
  };
}

const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop";

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [activeTab, setActiveTab] = useState<"all" | "videos" | "channels">("all");
  const [videos, setVideos] = useState<Video[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<number, { progressSeconds: number; durationSeconds: number }>>({});
  const { channel: userChannel } = useWallet();

  // Fetch search results
  useEffect(() => {
    if (!query) {
      setVideos([]);
      setChannels([]);
      return;
    }

    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/kasshi/search?q=${encodeURIComponent(query)}&type=${activeTab}`);
        if (res.ok) {
          const data = await res.json();
          setVideos(data.videos || []);
          setChannels(data.channels || []);
        }
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [query, activeTab]);

  // Fetch watch progress for videos
  useEffect(() => {
    if (!userChannel?.id || videos.length === 0) return;

    const fetchProgress = async () => {
      try {
        const videoIds = videos.map(v => v.id).join(",");
        const res = await fetch(`/api/kasshi/progress/batch?channelId=${userChannel.id}&videoIds=${videoIds}`);
        if (res.ok) {
          const data = await res.json();
          setProgressMap(data.progressMap || {});
        }
      } catch (err) {
        console.error("Failed to fetch progress:", err);
      }
    };

    fetchProgress();
  }, [userChannel?.id, videos]);

  const formatSubscribers = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const totalResults = videos.length + channels.length;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex flex-col">
      <Navbar />
      
      <main className="pt-20 pb-12 px-4 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          {query ? (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">
                Search results for "<span className="text-teal-400">{query}</span>"
              </h1>
              <p className="text-slate-400 text-sm">
                {isLoading ? "Searching..." : `${totalResults} result${totalResults !== 1 ? "s" : ""} found`}
              </p>
            </>
          ) : (
            <h1 className="text-2xl font-bold text-white">Search</h1>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "all"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            <SearchIcon className="w-4 h-4" />
            All
          </button>
          <button
            onClick={() => setActiveTab("videos")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "videos"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            <Film className="w-4 h-4" />
            Videos
          </button>
          <button
            onClick={() => setActiveTab("channels")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "channels"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            <Users className="w-4 h-4" />
            Channels
          </button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && query && totalResults === 0 && (
          <div className="text-center py-20">
            <SearchIcon className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No results found</h2>
            <p className="text-slate-400">Try different keywords or check your spelling</p>
          </div>
        )}

        {/* No query state */}
        {!query && (
          <div className="text-center py-20">
            <SearchIcon className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Search KasShi</h2>
            <p className="text-slate-400">Find videos and channels</p>
          </div>
        )}

        {/* Results */}
        {!isLoading && query && totalResults > 0 && (
          <div className="space-y-8">
            {/* Channels */}
            {(activeTab === "all" || activeTab === "channels") && channels.length > 0 && (
              <section>
                {activeTab === "all" && (
                  <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-teal-400" />
                    Channels
                  </h2>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {channels.map((ch) => (
                    <Link
                      key={ch.id}
                      to={`/channel/${ch.handle}`}
                      className="flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-xl transition-colors"
                    >
                      <img
                        src={ch.avatarUrl || DEFAULT_AVATAR}
                        alt={ch.name}
                        className="w-16 h-16 rounded-full object-cover bg-slate-700"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white truncate">{ch.name}</h3>
                        <p className="text-sm text-slate-400">@{ch.handle}</p>
                        <p className="text-sm text-slate-500">
                          {formatSubscribers(ch.subscriberCount)} subscribers
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Videos */}
            {(activeTab === "all" || activeTab === "videos") && videos.length > 0 && (
              <section>
                {activeTab === "all" && (
                  <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Film className="w-5 h-5 text-teal-400" />
                    Videos
                  </h2>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {videos.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      progress={progressMap[video.id]}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
