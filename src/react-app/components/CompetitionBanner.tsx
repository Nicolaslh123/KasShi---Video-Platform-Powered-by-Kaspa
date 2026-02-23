import { useState, useEffect } from "react";
import { Trophy, Clock, Users, ThumbsUp, ChevronDown, ChevronUp } from "lucide-react";

// Competition end: March 1, 2026 at 11:00 AM UTC
const COMPETITION_END = new Date("2026-03-01T11:00:00Z");
const PRIZE_KAS = 2000;
const MIN_UNIQUE_CHANNELS = 10;

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function calculateTimeLeft(): TimeLeft {
  const now = new Date();
  const diff = COMPETITION_END.getTime() - now.getTime();
  
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  }
  
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    total: diff,
  };
}

export default function CompetitionBanner() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(calculateTimeLeft());
  const [uniqueChannels, setUniqueChannels] = useState<number>(0);
  const [topVideo, setTopVideo] = useState<{ title: string; likes: number; channel: string } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  const isCompetitionActive = timeLeft.total > 0;
  const isEligible = uniqueChannels >= MIN_UNIQUE_CHANNELS;

  if (!isCompetitionActive) return null;

  const countdownStr = `${timeLeft.days}d ${timeLeft.hours}h ${timeLeft.minutes}m ${timeLeft.seconds}s`;

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
                <span className="text-sm font-semibold text-white">Video Competition</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">LIVE</span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/25">
                <span className="text-base font-bold text-amber-300">{PRIZE_KAS.toLocaleString()}</span>
                <span className="text-sm text-amber-400">KAS</span>
              </div>
            </div>

            {/* Right: Countdown + expand */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="sm:hidden flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15">
                <span className="text-sm font-bold text-amber-300">{PRIZE_KAS.toLocaleString()}</span>
                <span className="text-xs text-amber-400">KAS</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs sm:text-sm font-mono">{countdownStr}</span>
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
                    <span className="text-xs text-slate-300">Unique Channels</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-lg font-bold ${isEligible ? 'text-green-400' : 'text-white'}`}>
                      {loading ? "..." : uniqueChannels}
                    </span>
                    <span className="text-xs text-slate-400">/ {MIN_UNIQUE_CHANNELS} required</span>
                  </div>
                </div>

                {/* Current leader */}
                <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <ThumbsUp className="w-3.5 h-3.5 text-teal-400" />
                    <span className="text-xs text-slate-300">Current Leader</span>
                  </div>
                  {loading ? (
                    <span className="text-xs text-slate-400">Loading...</span>
                  ) : topVideo ? (
                    <div>
                      <p className="text-sm text-white font-medium truncate">{topVideo.title}</p>
                      <p className="text-xs text-slate-400">{topVideo.likes.toLocaleString()} likes</p>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">No videos yet</span>
                  )}
                </div>

                {/* End date */}
                <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs text-slate-300">Ends</span>
                  </div>
                  <p className="text-sm text-white font-medium">Mar 1, 2026 • 11:00 AM UTC</p>
                </div>
              </div>

              {/* Compact rules */}
              <div className="text-xs text-slate-400 space-y-1">
                <p><span className="text-amber-400">•</span> Most liked video wins <span className="text-amber-300 font-medium">{PRIZE_KAS.toLocaleString()} KAS</span></p>
                <p><span className="text-amber-400">•</span> Min {MIN_UNIQUE_CHANNELS} videos from unique channels required for payout</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
