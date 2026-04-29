import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListMusic, Play, Loader2, ArrowLeft, Trophy } from 'lucide-react';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import LocalizedLink from '../components/LocalizedLink';
import AnimatedBackground from '../components/AnimatedBackground';
import { apiTrackToAudioTrack } from '../hooks/useMusic';
import { useElectronTitleBar } from '../components/ElectronTitleBar';

interface Playlist {
  id: number;
  title: string;
  description: string | null;
  coverArtUrl: string | null;
  trackCount: number;
  totalPlays: number;
  creatorName: string;
}

export default function AllPlaylists() {
  const { theme } = useMusicTheme();
  const { playPlaylist } = useAudioPlayer();
  const goBack = useNavigate();
  const { titleBarPadding } = useElectronTitleBar();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlaylists = async () => {
      try {
        const response = await fetch('/api/music/playlists/featured');
        if (!response.ok) throw new Error('Failed to fetch playlists');
        const data = await response.json();
        setPlaylists(data.playlists || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load playlists');
      } finally {
        setLoading(false);
      }
    };
    fetchPlaylists();
  }, []);

  const handlePlayPlaylist = async (playlistId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await fetch(`/api/music/playlists/${playlistId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.tracks?.length > 0) {
          const audioTracks = data.tracks.map((t: any) => apiTrackToAudioTrack(t));
          playPlaylist(audioTracks, 0);
        }
      }
    } catch (err) {
      console.error('Failed to play playlist:', err);
    }
  };

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
              <ListMusic className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: theme.accent }} />
              <span className="hidden sm:inline">Featured Playlists</span>
              <span className="sm:hidden">Playlists</span>
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
              <span className="ml-3 text-white/70">Loading playlists...</span>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-white/60">{error}</p>
            </div>
          ) : playlists.length === 0 ? (
            <div className="bg-white/5 rounded-xl p-8 text-center">
              <ListMusic className="w-12 h-12 mx-auto mb-4 text-white/30" />
              <p className="text-white/60">No playlists yet. Create one!</p>
              <LocalizedLink 
                to="/music/library"
                className="inline-block mt-4 px-6 py-2 rounded-full text-black font-medium"
                style={{ backgroundColor: theme.accent }}
              >
                Your Library
              </LocalizedLink>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4">
              {playlists.map((playlist) => (
                <LocalizedLink
                  key={playlist.id}
                  to={`/music/playlist/${playlist.id}`}
                  className="group flex items-center gap-2.5 sm:gap-4 bg-white/5 hover:bg-white/10 rounded-lg sm:rounded-xl p-2.5 sm:p-4 transition-all"
                >
                  <div className="relative w-16 h-16 sm:w-24 sm:h-24 rounded-md sm:rounded-lg overflow-hidden flex-shrink-0">
                    {playlist.coverArtUrl ? (
                      <img 
                        src={playlist.coverArtUrl} 
                        alt={playlist.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/10 flex items-center justify-center">
                        <ListMusic className="w-6 h-6 sm:w-10 sm:h-10 text-white/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        onClick={(e) => handlePlayPlaylist(playlist.id, e)}
                        className="w-8 h-8 sm:w-12 sm:h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: theme.accent }}
                      >
                        <Play className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-black ml-0.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate text-sm sm:text-base">{playlist.title}</h3>
                    <p className="text-xs sm:text-sm text-white/60 truncate">{playlist.description || 'Playlist'}</p>
                    <p className="text-[10px] sm:text-xs text-white/40 mt-0.5 sm:mt-1">{playlist.trackCount} songs • by {playlist.creatorName}</p>
                    {playlist.totalPlays > 0 && (
                      <p className="text-[10px] sm:text-xs mt-0.5 sm:mt-1" style={{ color: theme.accent }}>{playlist.totalPlays.toLocaleString()} plays</p>
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
