import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic2, Play, ArrowLeft, Loader2 } from 'lucide-react';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import LocalizedLink from '../components/LocalizedLink';
import AnimatedBackground from '../components/AnimatedBackground';
import { useElectronTitleBar } from '../components/ElectronTitleBar';

interface Podcast {
  id: number;
  title: string;
  description: string | null;
  coverArtUrl: string | null;
  category: string | null;
  followerCount: number;
  episodeCount: number;
  host: {
    name: string;
    handle: string;
    avatarUrl: string | null;
  };
}

function formatSubscribers(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export default function PodcastCategory() {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const { theme } = useMusicTheme();
  const { isPlayerVisible } = useAudioPlayer();
  const { titleBarPadding } = useElectronTitleBar();
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);

  const categoryTitle = category ? category.charAt(0).toUpperCase() + category.slice(1) : 'All';

  useEffect(() => {
    const fetchPodcasts = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/music/podcasts?category=${encodeURIComponent(category || '')}`);
        if (response.ok) {
          const data = await response.json();
          setPodcasts(data.podcasts || []);
        }
      } catch (err) {
        console.error('Failed to fetch podcasts:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPodcasts();
  }, [category]);

  return (
    <div className={`min-h-screen relative ${titleBarPadding}`}>
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />
      <div className={`absolute inset-0 ${theme.overlay} opacity-30`} />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-black/30 border-b border-white/10">
          <div className="max-w-[1600px] mx-auto px-6 py-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate(-1)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${theme.accent}30` }}
                >
                  <Mic2 className="w-6 h-6" style={{ color: theme.accent }} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">{categoryTitle} Podcasts</h1>
                  <p className="text-sm text-white/60">{podcasts.length} podcasts</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-[1600px] mx-auto px-6 py-8 w-full">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.accent }} />
              <span className="ml-3 text-white/70">Loading podcasts...</span>
            </div>
          ) : podcasts.length === 0 ? (
            <div className="text-center py-20">
              <Mic2 className="w-16 h-16 mx-auto mb-4 text-white/30" />
              <h2 className="text-xl font-semibold text-white mb-2">No {categoryTitle} Podcasts Yet</h2>
              <p className="text-white/60 mb-6">Be the first to upload a podcast in this category!</p>
              <LocalizedLink 
                to="/music/upload"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-black font-medium"
                style={{ backgroundColor: theme.accent }}
              >
                Upload Podcast
              </LocalizedLink>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {podcasts.map((podcast) => (
                <LocalizedLink 
                  key={podcast.id}
                  to={`/music/podcast/${podcast.id}`}
                  className="group bg-white/5 hover:bg-white/10 rounded-xl p-4 transition-all block"
                >
                  <div className="relative aspect-square rounded-lg overflow-hidden mb-3">
                    {podcast.coverArtUrl ? (
                      <img 
                        src={podcast.coverArtUrl} 
                        alt={podcast.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/10 flex items-center justify-center">
                        <Mic2 className="w-12 h-12 text-white/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div 
                        className="w-12 h-12 rounded-full flex items-center justify-center transform scale-90 group-hover:scale-100 transition-transform"
                        style={{ backgroundColor: theme.accent }}
                      >
                        <Play className="w-5 h-5 text-black ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <h3 className="font-semibold text-white truncate">{podcast.title}</h3>
                  <p className="text-sm text-white/60 truncate">{podcast.host.name}</p>
                  <p className="text-xs text-white/40 mt-1">
                    {formatSubscribers(podcast.followerCount)} followers • {podcast.episodeCount} episodes
                  </p>
                </LocalizedLink>
              ))}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className={`${isPlayerVisible ? 'pb-24' : 'pb-8'} pt-8 px-6 mt-auto`}>
          <div className="max-w-[1600px] mx-auto border-t border-white/10 pt-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-white/40 text-xs">
              <p>© {new Date().getFullYear()} KasShi Music. All rights reserved.</p>
              <button onClick={() => navigate(-1)} className="hover:text-white/70 transition-colors">
                Back
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
