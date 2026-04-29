import { useState, useEffect } from "react";
import { Trophy, Users, ThumbsUp, ChevronDown, ChevronUp, Eye, Play } from "lucide-react";
import { useLanguage } from "@/react-app/contexts/LanguageContext";
import LocalizedLink from "./LocalizedLink";
import { formatViews, formatDuration } from "../hooks/useKasShi";

const PRIZE_KAS = 2000;
const MIN_UNIQUE_CHANNELS = 10;

interface TopVideo {
  id: number;
  publicId: string;
  title: string;
  thumbnailUrl: string | null;
  likeCount: number;
  viewCount: number;
  durationSeconds: number;
  channel: {
    id: number;
    name: string;
    handle: string;
    avatarUrl: string | null;
    isVerified: boolean;
  };
}

const MEDAL_COLORS = [
  "from-amber-400 to-yellow-500", // Gold
  "from-slate-300 to-slate-400", // Silver
  "from-amber-600 to-orange-700", // Bronze
];

const MEDAL_TEXT = ["text-amber-400", "text-slate-300", "text-amber-600"];

export default function CompetitionBanner() {
  const { t } = useLanguage();
  const [uniqueChannels, setUniqueChannels] = useState<number>(0);
  const [topVideo, setTopVideo] = useState<{ title: string; likes: number; channel: string } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [topVideos, setTopVideos] = useState<TopVideo[]>([]);
  const [loadingTopVideos, setLoadingTopVideos] = useState(false);

  useEffect(() => {
    fetch("/api/kasshi/competition/status")
      .then(res => res.json())
      .then(data => {
        setUniqueChannels(data.uniqueChannels || 0);
        setTopVideo(data.topVideo || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Fetch top 3 videos when expanded
  useEffect(() => {
    if (isExpanded && topVideos.length === 0 && !loadingTopVideos) {
      setLoadingTopVideos(true);
      fetch("/api/kasshi/competition/top-liked")
        .then(res => res.json())
        .then(data => {
          setTopVideos(data.videos || []);
          setLoadingTopVideos(false);
        })
        .catch(() => setLoadingTopVideos(false));
    }
  }, [isExpanded, topVideos.length, loadingTopVideos]);

  const isEligible = uniqueChannels >= MIN_UNIQUE_CHANNELS;

  return (
    <div className="max-w-[1800px] mx-auto mb-4">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-500/25">
        <div className="relative px-3 py-2 sm:px-4 sm:py-2.5">
          {/* Compact single row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Left: Trophy, title, prize */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shadow-amber-500/20">
                <Trophy className="w-4 h-4 text-white" />
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-sm font-semibold text-white">{t.home.videoCompetition || 'Video Competition'}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">{t.home.live || 'LIVE'}</span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/25">
                <span className="text-base font-bold text-amber-300">{PRIZE_KAS.toLocaleString()}</span>
                <span className="text-sm text-amber-400">KAS</span>
              </div>
            </div>

            {/* Right: Ongoing badge + expand */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="sm:hidden flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15">
                <span className="text-sm font-bold text-amber-300">{PRIZE_KAS.toLocaleString()}</span>
                <span className="text-xs text-amber-400">KAS</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-500/15 border border-green-500/25">
                <span className="text-xs sm:text-sm font-medium text-green-400">{t.home?.ongoing || 'Ongoing'}</span>
              </div>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 transition-colors"
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Expanded details */}
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-amber-500/20 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* Unique channels */}
                <div className={`p-2.5 rounded-lg ${isEligible ? 'bg-green-500/10 border-green-500/30' : 'bg-slate-800/50 border-slate-700'} border`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Users className={`w-3.5 h-3.5 ${isEligible ? 'text-green-400' : 'text-slate-400'}`} />
                    <span className="text-xs text-slate-300">{t.home.uniqueChannels || 'Unique Channels'}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-lg font-bold ${isEligible ? 'text-green-400' : 'text-white'}`}>
                      {loading ? "..." : uniqueChannels}
                    </span>
                    <span className="text-xs text-slate-400">/ {MIN_UNIQUE_CHANNELS} {t.home.required || 'required'}</span>
                  </div>
                </div>

                {/* Current leader */}
                <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <ThumbsUp className="w-3.5 h-3.5 text-teal-400" />
                    <span className="text-xs text-slate-300">{t.home.currentLeader || 'Current Leader'}</span>
                  </div>
                  {loading ? (
                    <span className="text-xs text-slate-400">Loading...</span>
                  ) : topVideo ? (
                    <div>
                      <p className="text-sm text-white font-medium truncate">{topVideo.title}</p>
                      <p className="text-xs text-slate-400">{topVideo.likes.toLocaleString()} likes</p>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">{t.home.noVideosYet || 'No videos yet'}</span>
                  )}
                </div>

                {/* Competition status */}
                <div className="p-2.5 rounded-lg bg-green-500/10 border border-green-500/30">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Trophy className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs text-slate-300">{t.home?.status || 'Status'}</span>
                  </div>
                  <p className="text-sm text-green-400 font-medium">{t.home?.perpetualCompetition || 'Perpetual Competition'}</p>
                </div>
              </div>

              {/* Top 3 Most Liked Videos */}
              {loadingTopVideos ? (
                <div className="text-center py-4">
                  <span className="text-sm text-slate-400">Loading top videos...</span>
                </div>
              ) : topVideos.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-medium text-white">{t.home?.topLiked || "Top 3 Most Liked"}</span>
                  </div>
                  {topVideos.map((video, index) => (
                    <LocalizedLink
                      key={video.id}
                      to={`/video/watch/${video.publicId || video.id}`}
                      className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-amber-500/50 transition-all group"
                    >
                      {/* Rank badge */}
                      <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${MEDAL_COLORS[index]} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-xs font-bold text-white">{index + 1}</span>
                      </div>
                      
                      {/* Thumbnail */}
                      <div className="relative w-16 h-10 rounded overflow-hidden flex-shrink-0 bg-slate-900">
                        {video.thumbnailUrl ? (
                          <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Play className="w-4 h-4 text-slate-600" />
                          </div>
                        )}
                        <div className="absolute bottom-0.5 right-0.5 px-1 py-0.5 rounded bg-black/80 text-[10px] text-white">
                          {formatDuration(video.durationSeconds)}
                        </div>
                      </div>
                      
                      {/* Title and channel */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate group-hover:text-amber-300 transition-colors">{video.title}</p>
                        <p className="text-xs text-slate-400 truncate">{video.channel.name}</p>
                      </div>
                      
                      {/* Stats */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="flex items-center gap-1">
                          <ThumbsUp className={`w-3.5 h-3.5 ${MEDAL_TEXT[index]}`} />
                          <span className={`text-xs font-medium ${MEDAL_TEXT[index]}`}>{formatViews(video.likeCount)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-500">
                          <Eye className="w-3.5 h-3.5" />
                          <span className="text-xs">{formatViews(video.viewCount)}</span>
                        </div>
                      </div>
                    </LocalizedLink>
                  ))}
                </div>
              )}

              {/* Compact rules */}
              <div className="text-xs text-slate-400 space-y-1">
                <p><span className="text-amber-400">•</span> {t.home.mostLikedWins || 'Most liked video wins'} <span className="text-amber-300 font-medium">{PRIZE_KAS.toLocaleString()} KAS</span></p>
                <p><span className="text-amber-400">•</span> Min {MIN_UNIQUE_CHANNELS} {t.home.minChannelsRequired || 'videos from unique channels required for payout'}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
