import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic2, Play, Loader2, ArrowLeft, Trophy, Video } from 'lucide-react';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import LocalizedLink from '../components/LocalizedLink';
import AnimatedBackground from '../components/AnimatedBackground';
import { useElectronTitleBar } from '../components/ElectronTitleBar';

interface Podcast {
  id: number;
  title: string;
  description: string | null;
  coverArtUrl: string | null;
  category: string;
  followerCount: number;
  episodeCount: number;
  isVideoPodcast: boolean;
  host: { id: number; name: string };
}

function formatSubscribers(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export default function AllPodcasts() {
  const { theme } = useMusicTheme();
  const goBack = useNavigate();
  const { titleBarPadding } = useElectronTitleBar();
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPodcasts = async () => {
      try {
        const response = await fetch('/api/music/podcasts');
        if (!response.ok) throw new Error('Failed to fetch podcasts');
        const data = await response.json();
        setPodcasts(data.podcasts || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load podcasts');
      } finally {
        setLoading(false);
      }
    };
    fetchPodcasts();
  }, []);

  return (
    <div className={`min-h-screen relative w-full overflow-x-hidden ${titleBarPadding}`} style={{ backgroundColor: theme.background }}>
      <AnimatedBackground themeId={theme.id || 'default'} accent={theme.accent} />
      
      <div className="relative z-10 w-full overflow-x-hidden">
        {/* Header */}
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/30 border-b border-white/10">
          <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
            <button 
              onClick={() => goBack(-1)}
              className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </button>
            <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-1.5 sm:gap-2">
              <Mic2 className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: theme.accent }} />
              All Podcasts
            </h1>
            <LocalizedLink 
              to="/music/leaderboard"
              className="ml-auto flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full hover:bg-white/10 transition-colors text-white text-sm sm:text-base"
            >
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.accent }} />
              <span className="hidden sm:inline">Leaderboard</span>
            </LocalizedLink>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.accent }} />
              <span className="ml-3 text-white/70">Loading podcasts...</span>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-white/60">{error}</p>
            </div>
          ) : podcasts.length === 0 ? (
            <div className="bg-white/5 rounded-xl p-8 text-center">
              <Mic2 className="w-12 h-12 mx-auto mb-4 text-white/30" />
              <p className="text-white/60">No podcasts yet. Start your own!</p>
              <LocalizedLink 
                to="/music/upload"
                className="inline-block mt-4 px-6 py-2 rounded-full text-black font-medium"
                style={{ backgroundColor: theme.accent }}
              >
                Create Podcast
              </LocalizedLink>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4">
              {podcasts.map((podcast) => (
                <LocalizedLink 
                  key={podcast.id}
                  to={`/music/podcast/${podcast.id}`}
                  className="group bg-white/5 hover:bg-white/10 rounded-lg sm:rounded-xl p-2.5 sm:p-4 transition-all cursor-pointer block"
                >
                  <div className="relative aspect-square rounded-md sm:rounded-lg overflow-hidden mb-2 sm:mb-3">
                    <img 
                      src={podcast.coverArtUrl || 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=400&q=80'} 
                      alt={podcast.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div 
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transform scale-90 group-hover:scale-100 transition-transform"
                        style={{ backgroundColor: theme.accent }}
                      >
                        <Play className="w-4 h-4 sm:w-5 sm:h-5 text-black ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <h3 className="font-semibold text-white truncate text-sm sm:text-base">{podcast.title}</h3>
                  <p className="text-xs sm:text-sm text-white/60 truncate">{podcast.host.name}</p>
                  <div className="flex items-center flex-wrap gap-1 sm:gap-2 mt-0.5 sm:mt-1">
                    <p className="text-[10px] sm:text-xs text-white/40">{podcast.episodeCount || 0} eps</p>
                    <span className="text-[10px] sm:text-xs text-white/30">•</span>
                    <p className="text-[10px] sm:text-xs text-white/40">{formatSubscribers(podcast.followerCount)}</p>
                    {podcast.isVideoPodcast && (
                      <span className="flex items-center gap-0.5 text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                        <Video className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        <span className="hidden sm:inline">Video</span>
                      </span>
                    )}
                  </div>
                </LocalizedLink>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
